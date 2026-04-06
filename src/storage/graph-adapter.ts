/**
 * Graph Adapter — Unified Graph + Vector Storage (facade)
 *
 * Thin facade that composes all storage operations:
 * - SchemaManager: table creation, migrations, integrity
 * - VersioningOps: prolly tree, staging, index management
 * - EntityOperations, RelationshipOperations, VectorOperations
 * - MetadataOperations, CacheOperations, CooccurrenceOperations
 * - Row mappers (rowToEntity, rowToRelationship) via cbor-utils
 *
 * Previously: LibSQLGraphAdapter (1737 lines, monolithic).
 * Now: ~400 lines, delegates to focused modules.
 */

import { LRUCache } from "lru-cache";
import { log } from "../logging/index.js";
import { normalizeBranchName } from "../shared/storage-paths.js";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";
import type {
  BatchResult,
  Entity,
  EntityQuery,
  EntityType,
  FileInfo,
  Relationship,
  RelationshipQuery,
  RelationType,
} from "../types/storage.js";
import { sleep } from "../utils/runtime-detection.js";
import { CacheOperations } from "./libsql/cache-ops.js";
import { clearMetadataCache, decodeMetadata, encodeMetadata, getMetadataCacheStats } from "./libsql/cbor-utils.js";
import { CooccurrenceOperations } from "./libsql/cooccurrence-ops.js";
import { EntityOperations } from "./libsql/entity-ops.js";
import { GenerationManager } from "./libsql/generation-ops.js";
import { MetadataOperations } from "./libsql/metadata-ops.js";
import { RelationshipOperations } from "./libsql/relationship-ops.js";
import { getRequestContext } from "./libsql/request-context.js";
import {
  type EntityRow,
  type RelationshipRow,
  rowToEntity,
  rowToRelationship,
  stringToVector,
  vectorToString,
} from "./libsql/row-mappers.js";
import { SchemaManager } from "./libsql/schema-manager.js";
import {
  CACHE_CONFIG,
  type Client,
  DatabaseCorruptionError,
  DEFAULT_CONFIG,
  getEmbeddingColumn,
  type LibSQLGraphConfig,
  normalizeToSupportedDimension,
  type ProjectContext,
  SUPPORTED_DIMENSIONS,
  type SupportedDimension,
} from "./libsql/types.js";
import { VectorOperations, type VectorOpsContext } from "./libsql/vector-ops.js";
import { VersioningOps } from "./libsql/versioning-ops.js";
import type { MultiDbManager } from "./multi-db-manager.js";
import { NativeSQLiteClient } from "./native-sqlite-client.js";
import type { BranchDiffCache, CommitManager, ProllyNodeStore, ProllyTree } from "./prolly/index.js";

// Re-export types for backwards compatibility
export {
  DatabaseCorruptionError,
  getEmbeddingColumn,
  type LibSQLGraphConfig,
  normalizeToSupportedDimension,
  type ProjectContext,
  SUPPORTED_DIMENSIONS,
  type SupportedDimension,
};

// =============================================================================
// GRAPH ADAPTER
// =============================================================================

export class GraphAdapter {
  private client: Client | null = null;
  private dbManager: MultiDbManager | null = null;
  private config: Required<LibSQLGraphConfig>;
  private isInitialized = false;
  private dbPath: string = "";

  // Fallback project context (used when no ALS request context is available)
  // ALS context from runWithRequestContext() takes priority via getContext()
  private _fallbackContext: ProjectContext = {
    projectHash: "_unset_",
    branchName: "_unset_",
  };

  // Performance caches
  private embeddingCache: LRUCache<string, VectorEmbedding>;
  private searchCache: LRUCache<string, SimilarityResult[]>;

  // Delegated operations (composition pattern)
  private entityOps: EntityOperations;
  private relationshipOps: RelationshipOperations;
  private vectorOps: VectorOperations;
  private cacheOps: CacheOperations;
  private metadataOps: MetadataOperations;
  private cooccurrenceOps: CooccurrenceOperations;
  private generationManager: GenerationManager;
  private schemaManager: SchemaManager;
  private versioningOps: VersioningOps;

  get stagingMode(): boolean {
    return this.versioningOps.stagingMode;
  }

  constructor(config: LibSQLGraphConfig = {}, dbManager?: MultiDbManager) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dbManager = dbManager ?? null;

    // Initialize caches
    this.embeddingCache = new LRUCache<string, VectorEmbedding>(CACHE_CONFIG.embeddingCache);
    this.searchCache = new LRUCache<string, SimilarityResult[]>(CACHE_CONFIG.searchCache);

    // Initialize operation delegates
    const getGraphClient = () => this.dbManager?.getGraphClient() ?? this.client;
    const getSemanticClient = () => this.dbManager?.getSemanticClient() ?? this.client;
    const getCacheClient = () => this.dbManager?.getCacheClient() ?? this.client;
    const getContext = () => getRequestContext() ?? this._fallbackContext;
    const getStagingMode = () => this.versioningOps.stagingMode;

    // Per-DB mutexes — serialize ALL access to prevent async race conditions.
    // With journal_mode=OFF + locking_mode=EXCLUSIVE, both reads and writes must be serialized.
    // Only active in multi-DB mode (dbManager present); absent in single-DB/test mode.
    const writeGraph = dbManager ? <T>(fn: () => T | Promise<T>) => dbManager.writeGraph(fn) : undefined;
    const readGraph = dbManager ? <T>(fn: () => T | Promise<T>) => dbManager.readGraph(fn) : undefined;
    const writeSemantic = dbManager ? <T>(fn: () => T | Promise<T>) => dbManager.writeSemantic(fn) : undefined;
    const writeCache = dbManager ? <T>(fn: () => T | Promise<T>) => dbManager.writeCache(fn) : undefined;

    this.generationManager = new GenerationManager(getGraphClient, getContext);
    this.entityOps = new EntityOperations(
      getGraphClient,
      getContext,
      (row) => rowToEntity(row as EntityRow),
      this.generationManager,
      getStagingMode,
      writeGraph,
      readGraph,
    );
    this.relationshipOps = new RelationshipOperations(
      getGraphClient,
      getContext,
      (row) => rowToRelationship(row as RelationshipRow),
      getStagingMode,
      writeGraph,
      readGraph,
    );

    const vectorOpsContext: VectorOpsContext = {
      getClient: getGraphClient,
      getContext,
      config: this.config,
      getEffectiveDimensions: () => this.getEffectiveDimensions(),
      getEmbeddingColumnName: () => this.getEmbeddingColumnName(),
      vectorToString: (v) => vectorToString(v),
      stringToVector: (s) => stringToVector(s),
      encodeMetadata: (m) => encodeMetadata(m),
      decodeMetadata: (d) => decodeMetadata(d),
      embeddingCache: this.embeddingCache,
      searchCache: this.searchCache,
      ensureProjectVectorIndex: () => this.ensureProjectVectorIndex(),
    };
    this.vectorOps = new VectorOperations(vectorOpsContext);

    this.cacheOps = new CacheOperations(getCacheClient, writeCache);
    this.metadataOps = new MetadataOperations(getGraphClient, getContext, getCacheClient, getStagingMode, writeGraph);
    this.cooccurrenceOps = new CooccurrenceOperations(getSemanticClient, getContext, writeSemantic);
    this.schemaManager = new SchemaManager(getGraphClient, this.dbManager);
    this.versioningOps = new VersioningOps(getGraphClient, this.dbManager);
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  async initialize(dbPath: string, retryAfterCorruption = true): Promise<boolean> {
    const startTime = Date.now();
    const useMultiDb = this.dbManager?.isInitialized === true;
    log.t("STORAGE", `[GraphAdapter] ▶ initialize() START at ${dbPath} (multiDb=${useMultiDb})`);
    try {
      this.dbPath = dbPath;

      if (useMultiDb) {
        this.client = this.dbManager!.getGraphClient();
      } else {
        log.t("STORAGE", `[GraphAdapter] ▶ cleanupStaleLocks`);
        await this.schemaManager.cleanupStaleLocks(dbPath);
        log.t("STORAGE", `[GraphAdapter] ◀ cleanupStaleLocks (${Date.now() - startTime}ms)`);

        log.t("STORAGE", `[GraphAdapter] ▶ createClient`);
        const clientStart = Date.now();
        this.client = new NativeSQLiteClient(dbPath);

        await this.client.execute("SELECT 1");
        log.t("STORAGE", `[GraphAdapter] ◀ createClient + verify (${Date.now() - clientStart}ms)`);

        await this.client.execute("PRAGMA busy_timeout = 5000");
        await this.client.execute("PRAGMA cache_size = -8192");
        await this.client.execute("PRAGMA temp_store = MEMORY");
        await this.client.execute("PRAGMA mmap_size = 0");
        await this.client.execute("PRAGMA journal_mode = OFF");
        await this.client.execute("PRAGMA synchronous = OFF");
      }

      // Async integrity check
      this.schemaManager
        .quickIntegrityCheck()
        .then(() => log.i("LIBSQLADAPT", "integrity_passed"))
        .catch((err) => log.e("LIBSQLADAPT", "integrity_error", { err: (err as Error).message }));

      // Create tables
      log.t("STORAGE", `[GraphAdapter] ▶ createTables`);
      const tablesStart = Date.now();
      await this.schemaManager.createTables();
      log.t("STORAGE", `[GraphAdapter] ◀ createTables (${Date.now() - tablesStart}ms)`);

      // Migration
      await this.schemaManager.migrateFileGen();

      // Wire up tombstone delegates
      this.entityOps.setTombstoneDelegates(
        (id, type) => this.addTombstone(id, type),
        (type) => this.getTombstonedIds(type),
      );
      this.relationshipOps.setTombstoneDelegates(
        (id, type) => this.addTombstone(id, type),
        (type) => this.getTombstonedIds(type),
      );

      // Initialize Prolly Tree components
      log.t("STORAGE", `[GraphAdapter] ▶ initProllyComponents`);
      const prollyStart = Date.now();
      await this.versioningOps.initializeProllyComponents();
      log.t("STORAGE", `[GraphAdapter] ◀ initProllyComponents (${Date.now() - prollyStart}ms)`);

      this.isInitialized = true;
      log.t("STORAGE", `[GraphAdapter] ◀ initialize() END (${Date.now() - startTime}ms)`);
      log.i("LIBSQLADAPT", "init_complete", {
        path: dbPath,
        mode: useMultiDb ? "multi-db" : "single-db",
      });
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message || String(error);

      const isCorrupted =
        errorMessage.includes("SQLITE_CORRUPT") ||
        errorMessage.includes("database disk image is malformed") ||
        errorMessage.includes("file is not a database") ||
        errorMessage.includes("database or disk is full");

      if (isCorrupted && retryAfterCorruption) {
        log.e("LIBSQLADAPT", "corruption_detected", { err: errorMessage });
        log.i("LIBSQLADAPT", "recreating_db");

        if (!useMultiDb && this.client) {
          try {
            this.client.close();
          } catch {
            /* ignore */
          }
          this.client = null;
        }

        if (useMultiDb && this.dbManager) {
          await this.dbManager.close();
          const deleted = await this.dbManager.deleteAll();
          if (deleted) {
            log.i("LIBSQLADAPT", "corrupt_dbs_deleted");
            const paths = this.dbManager.getPaths();
            if (paths) {
              const { dirname } = await import("node:path");
              await this.dbManager.initialize(dirname(paths.graph));
              this.client = this.dbManager.getGraphClient();
            }
            return this.initialize(dbPath, false);
          }
        } else {
          const deleted = await this.schemaManager.deleteCorruptDatabase(dbPath);
          if (deleted) {
            log.i("LIBSQLADAPT", "corrupt_db_deleted");
            return this.initialize(dbPath, false);
          }
        }

        log.e("LIBSQLADAPT", "corrupt_db_delete_fail");
        return false;
      }

      // Retry on SQLITE_BUSY
      const isBusy = errorMessage.includes("SQLITE_BUSY") || errorMessage.includes("database is locked");

      if (isBusy && retryAfterCorruption) {
        log.w("LIBSQLADAPT", "busy_retry", { err: errorMessage });

        if (!useMultiDb && this.client) {
          try {
            this.client.close();
          } catch {
            /* ignore */
          }
          this.client = null;
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = attempt * 2000;
          log.i("LIBSQLADAPT", "busy_wait", { attempt, delay });
          await sleep(delay);

          try {
            return await this.initialize(dbPath, false);
          } catch (retryErr) {
            const retryMsg = (retryErr as Error).message || "";
            if (!retryMsg.includes("SQLITE_BUSY") && !retryMsg.includes("database is locked")) {
              throw retryErr;
            }
            log.w("LIBSQLADAPT", "busy_retry_fail", { attempt, err: retryMsg });
          }
        }
        log.e("LIBSQLADAPT", "busy_exhausted", { retries: 3 });
        return false;
      }

      log.e("LIBSQLADAPT", "init_fail", { err: String(error) });
      return false;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  getDbPath(): string {
    return this.dbPath;
  }

  // ===========================================================================
  // PROJECT CONTEXT
  // ===========================================================================

  /** @deprecated Sets fallback context. ALS via runWithRequestContext() takes priority. */
  setProjectContext(context: ProjectContext): void {
    this._fallbackContext = {
      projectHash: context.projectHash,
      branchName: normalizeBranchName(context.branchName),
      baseBranch: context.baseBranch,
      dimensions: context.dimensions,
    };
    this.generationManager.clearCache();
    log.d("LIBSQLADAPT", "setProjectContext", {
      branch: this._fallbackContext.branchName,
      base: context.baseBranch || "none",
    });
  }

  getProjectContext(): ProjectContext {
    return { ...this._fallbackContext };
  }

  getEffectiveDimensions(): SupportedDimension {
    return this._fallbackContext.dimensions ?? normalizeToSupportedDimension(this.config.dimensions);
  }

  getEmbeddingColumnName(): string {
    return getEmbeddingColumn(this.getEffectiveDimensions());
  }

  async ensureProjectVectorIndex(): Promise<void> {
    if (!this.client) return;
    const { projectHash } = this._fallbackContext;
    const dims = this.getEffectiveDimensions();
    const colName = getEmbeddingColumn(dims);
    const indexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;
    try {
      const check = await this.client.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
        args: [indexName],
      });
      if (check.rows.length > 0) return;
      const params = [
        `'metric=${this.config.metric}'`,
        `'compress_neighbors=${this.config.compression}'`,
        `'max_neighbors=${this.config.maxNeighbors}'`,
        `'search_l=${this.config.searchL}'`,
        `'insert_l=${this.config.insertL}'`,
      ].join(", ");
      const t = Date.now();
      await this.client.execute(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON embeddings(libsql_vector_idx(${colName}, ${params})) WHERE project_hash = '${projectHash}' AND dim_size = ${dims}`,
      );
      log.i("STORAGE", `Created partial index`, { indexName, dims, ms: Date.now() - t });
    } catch (e) {
      log.w("STORAGE", `Partial index failed`, { error: (e as Error).message });
    }
  }

  // ===========================================================================
  // ENTITY OPERATIONS (delegated)
  // ===========================================================================

  insertEntity = (entity: Entity): Promise<void> => this.entityOps.insertEntity(entity);
  insertEntities = (entities: Entity[]): Promise<BatchResult> => this.entityOps.insertEntities(entities);
  getEntity = (id: string): Promise<Entity | null> => this.entityOps.getEntity(id);
  getEntitiesBatch = (ids: string[]): Promise<Map<string, Entity>> => this.entityOps.getEntitiesBatch(ids);
  findEntities(query: EntityQuery): Promise<Entity[]> {
    return this.entityOps.findEntities(query);
  }
  searchEntities = (options: {
    namePattern?: string | undefined;
    types?: EntityType[] | undefined;
    filePath?: string | undefined;
    limit?: number;
  }): Promise<Entity[]> => this.entityOps.searchEntities(options);
  searchEntitiesInDirectory = (directoryPath: string): Promise<Entity[]> =>
    this.entityOps.searchEntitiesInDirectory(directoryPath);
  deleteEntity = (id: string): Promise<void> => this.entityOps.deleteEntity(id);
  getEntityIdsByFilePath = (filePath: string): Promise<string[]> => this.entityOps.getEntityIdsByFilePath(filePath);
  deleteEntitiesByFilePath = (filePath: string): Promise<string[]> => this.entityOps.deleteEntitiesByFilePath(filePath);
  getAllEntities = (): Promise<Entity[]> => this.entityOps.getAllEntities();
  countByLanguage = (): Promise<Map<string, { count: number; fileCount: number }>> => this.entityOps.countByLanguage();

  getGenerationManager(): GenerationManager {
    return this.generationManager;
  }
  async loadGenerationCache(): Promise<void> {
    await this.generationManager.loadCache();
  }

  /** Invalidate file generation — wrapped with graphMutex for independent callers */
  async invalidateFileGeneration(filePath: string): Promise<void> {
    const doInvalidate = () => this.generationManager.invalidateFileGeneration(filePath);
    return this.dbManager ? this.dbManager.writeGraph(doInvalidate) : doInvalidate();
  }

  /** Run full GC — wrapped with graphMutex for independent callers */
  async runGenerationGC(): Promise<{ entities: number; tokens: number }> {
    const doGC = () => this.generationManager.runFullGC();
    return this.dbManager ? this.dbManager.writeGraph(doGC) : doGC();
  }

  // ===========================================================================
  // RELATIONSHIP OPERATIONS (delegated)
  // ===========================================================================

  insertRelationship = (relationship: Relationship): Promise<void> =>
    this.relationshipOps.insertRelationship(relationship);
  insertRelationships = (relationships: Relationship[]): Promise<BatchResult> =>
    this.relationshipOps.insertRelationships(relationships);
  getRelationshipsForEntity = (entityId: string, type?: RelationType): Promise<Relationship[]> =>
    this.relationshipOps.getRelationshipsForEntity(entityId, type);
  findRelationships = (query: RelationshipQuery): Promise<Relationship[]> =>
    this.relationshipOps.findRelationships(query);
  deleteRelationship = (id: string): Promise<void> => this.relationshipOps.deleteRelationship(id);
  getAllRelationships = (): Promise<Relationship[]> => this.relationshipOps.getAllRelationships();

  // ===========================================================================
  // FILE/METADATA OPERATIONS (delegated)
  // ===========================================================================

  updateFileInfo = (info: FileInfo): Promise<void> => this.metadataOps.updateFileInfo(info);
  batchUpdateFileInfo = (infos: FileInfo[]): Promise<void> => this.metadataOps.batchUpdateFileInfo(infos);
  getFileInfo = (path: string): Promise<FileInfo | null> => this.metadataOps.getFileInfo(path);
  getOutdatedFiles = (since: number): Promise<FileInfo[]> => this.metadataOps.getOutdatedFiles(since);
  getAllIndexedFiles = (): Promise<Map<string, number>> => this.metadataOps.getAllIndexedFiles();
  deleteFileInfo = (path: string): Promise<void> => this.metadataOps.deleteFileInfo(path);
  getTraceUsageCount = (): Promise<number> => this.metadataOps.getTraceUsageCount();
  incrementTraceUsageCount = (): Promise<void> => this.metadataOps.incrementTraceUsageCount();

  // ===========================================================================
  // VECTOR OPERATIONS (delegated)
  // ===========================================================================

  /** @deprecated Use FaissProvider.add() instead */
  insertEmbedding = (embedding: VectorEmbedding): Promise<void> => this.vectorOps.insertEmbedding(embedding);
  /** @deprecated Use FaissProvider.addBatch() instead */
  insertEmbeddingBatch = (embeddings: VectorEmbedding[]): Promise<void> =>
    this.vectorOps.insertEmbeddingBatch(embeddings);
  /** @deprecated Faiss HNSW handles live updates */
  dropVectorIndex = (): Promise<void> => this.vectorOps.dropVectorIndex();
  /** @deprecated Faiss HNSW maintains index automatically */
  rebuildVectorIndex = (): Promise<void> => this.vectorOps.rebuildVectorIndex();
  /** @deprecated Use FaissProvider.addBatch() instead */
  bulkInsertEmbeddings = (embeddings: VectorEmbedding[]): Promise<void> =>
    this.vectorOps.bulkInsertEmbeddings(embeddings);
  /** @deprecated Use FaissProvider.search() instead */
  searchVectors = (queryVector: Float32Array, limit: number): Promise<SimilarityResult[]> =>
    this.vectorOps.searchVectors(queryVector, limit);
  /** @deprecated Use FaissProvider.getContent() instead */
  getEmbedding = (id: string): Promise<VectorEmbedding | null> => this.vectorOps.getEmbedding(id);
  /** @deprecated Use FaissProvider.remove() instead */
  deleteEmbedding = (id: string): Promise<void> => this.vectorOps.deleteEmbedding(id);
  /** @deprecated Use FaissProvider.getVectorCount() instead */
  getEmbeddingCount = (): Promise<number> => this.vectorOps.getEmbeddingCount();
  /** @deprecated Use FaissProvider.getExistingIds() instead */
  getExistingEmbeddingIds = (ids: string[]): Promise<Set<string>> => this.vectorOps.getExistingEmbeddingIds(ids);

  // ===========================================================================
  // EMBEDDING CACHE (delegated)
  // ===========================================================================

  getEmbeddingFromCache = (contentHash: string): Promise<Float32Array | null> =>
    this.cacheOps.getEmbeddingFromCache(contentHash);
  getEmbeddingsFromCache = (contentHashes: string[]): Promise<Map<string, Float32Array>> =>
    this.cacheOps.getEmbeddingsFromCache(contentHashes);
  setEmbeddingInCache = (
    contentHash: string,
    model: string,
    embedding: Float32Array,
    textPreview?: string,
  ): Promise<void> => this.cacheOps.setEmbeddingInCache(contentHash, model, embedding, textPreview);
  setEmbeddingsInCache = (
    entries: Array<{ contentHash: string; model: string; embedding: Float32Array; textPreview?: string }>,
  ): Promise<void> => this.cacheOps.setEmbeddingsInCache(entries);
  clearEmbeddingCache = (): Promise<void> => this.cacheOps.clearEmbeddingCache();

  // ===========================================================================
  // METADATA OPERATIONS (delegated)
  // ===========================================================================

  updateProjectMetadata = (projectPath: string, isFullIndex?: boolean): Promise<void> =>
    this.metadataOps.updateProjectMetadata(projectPath, isFullIndex);
  getIncrementalTrackingInfo = (): Promise<{
    lastFullIndexAt: number;
    incrementalChangesCount: number;
    totalFiles: number;
  }> => this.metadataOps.getIncrementalTrackingInfo();
  recordIncrementalChanges = (changedFileCount: number): Promise<void> =>
    this.metadataOps.recordIncrementalChanges(changedFileCount);
  resetIncrementalTracking = (): Promise<void> => this.metadataOps.resetIncrementalTracking();
  listProjects = (): Promise<
    Array<{
      projectHash: string;
      branchName: string;
      projectPath: string;
      lastIndexedAt: number;
      entityCount: number;
      fileCount: number;
    }>
  > => this.metadataOps.listProjects();
  listBranches = (): Promise<string[]> => this.metadataOps.listBranches();

  // ===========================================================================
  // METRICS & STATS (delegated)
  // ===========================================================================

  getStats = (): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> => this.metadataOps.getStats();
  getTotalStats = (): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> => this.metadataOps.getTotalStats();

  // ===========================================================================
  // CLEAR OPERATIONS (delegated)
  // ===========================================================================

  clear = (): Promise<void> => this.metadataOps.clear();
  clearAll = (): Promise<void> => this.metadataOps.clearAll();

  // ===========================================================================
  // COOCCURRENCE (delegated)
  // ===========================================================================

  getCooccurrenceOps(): CooccurrenceOperations {
    return this.cooccurrenceOps;
  }

  // ===========================================================================
  // TOMBSTONE OPERATIONS
  // ===========================================================================

  async addTombstone(entityId: string, entityType: "entity" | "relationship" = "entity"): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash, branchName } = this._fallbackContext;

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO tombstones (entity_id, project_hash, branch_name, entity_type, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [entityId, projectHash, branchName, entityType, Date.now()],
    });
  }

  async removeTombstone(entityId: string, entityType: "entity" | "relationship" = "entity"): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash, branchName } = this._fallbackContext;

    await this.client.execute({
      sql: `DELETE FROM tombstones WHERE entity_id = ? AND project_hash = ? AND branch_name = ? AND entity_type = ?`,
      args: [entityId, projectHash, branchName, entityType],
    });
  }

  async isTombstoned(entityId: string, entityType: "entity" | "relationship" = "entity"): Promise<boolean> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash, branchName } = this._fallbackContext;

    const result = await this.client.execute({
      sql: `SELECT 1 FROM tombstones WHERE entity_id = ? AND project_hash = ? AND branch_name = ? AND entity_type = ? LIMIT 1`,
      args: [entityId, projectHash, branchName, entityType],
    });

    return result.rows.length > 0;
  }

  async getTombstonedIds(entityType: "entity" | "relationship" = "entity"): Promise<Set<string>> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash, branchName } = this._fallbackContext;

    const result = await this.client.execute({
      sql: `SELECT entity_id FROM tombstones WHERE project_hash = ? AND branch_name = ? AND entity_type = ?`,
      args: [projectHash, branchName, entityType],
    });

    return new Set(result.rows.map((row) => row["entity_id"] as string));
  }

  async clearTombstones(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash, branchName } = this._fallbackContext;

    await this.client.execute({
      sql: `DELETE FROM tombstones WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });
  }

  // ===========================================================================
  // FLUSH / CLOSE
  // ===========================================================================

  async flush(): Promise<void> {
    const startTime = Date.now();

    if (this.dbManager?.isInitialized) {
      log.d("LIBSQLADAPT", "flush_start_multidb");
      // flushAll() no longer closes/reopens clients — just runs PRAGMA optimize
      // and wal_checkpoint. Client references remain valid, no reassignment needed.
      await this.dbManager.flushAll();

      log.i("LIBSQLADAPT", "flush_complete", { ms: Date.now() - startTime, mode: "multi-db" });
      return;
    }

    if (!this.client || !this.dbPath) {
      log.w("LIBSQLADAPT", "flush_skipped", { hasClient: !!this.client, hasDbPath: !!this.dbPath });
      return;
    }

    log.d("LIBSQLADAPT", "flush_start");

    this.client.close();
    this.client = null;

    this.client = new NativeSQLiteClient(this.dbPath);

    await this.client!.execute("PRAGMA cache_size = -8192");
    await this.client!.execute("PRAGMA temp_store = MEMORY");
    await this.client!.execute("PRAGMA mmap_size = 0");
    await this.client!.execute("PRAGMA journal_mode = OFF");
    await this.client!.execute("PRAGMA synchronous = OFF");

    this.versioningOps.updateClientsAfterFlush(this.client!);

    try {
      const { statSync } = await import("node:fs");
      const stats = statSync(this.dbPath!);
      log.i("LIBSQLADAPT", "flush_complete", { ms: Date.now() - startTime, sizeBytes: stats.size });
    } catch {
      log.i("LIBSQLADAPT", "flush_complete", { ms: Date.now() - startTime, sizeBytes: "unknown" });
    }
  }

  async close(): Promise<void> {
    if (this.dbManager?.isInitialized) {
      await this.dbManager.close();
      this.client = null;
      this.isInitialized = false;
      log.i("LIBSQLADAPT", "connection_closed", { mode: "multi-db" });
    } else if (this.client) {
      this.client.close();
      this.client = null;
      this.isInitialized = false;
      log.i("LIBSQLADAPT", "connection_closed");
    }
  }

  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  getCacheStats(): {
    embedding: { size: number; maxSize: number };
    search: { size: number; maxSize: number };
    metadata: { size: number; maxSize: number };
  } {
    return {
      embedding: { size: this.embeddingCache.size, maxSize: CACHE_CONFIG.embeddingCache.max },
      search: { size: this.searchCache.size, maxSize: CACHE_CONFIG.searchCache.max },
      metadata: getMetadataCacheStats(),
    };
  }

  clearCaches(): void {
    this.embeddingCache.clear();
    this.searchCache.clear();
    clearMetadataCache();
    log.i("CACHE", `All caches cleared`);
  }

  // ===========================================================================
  // VERSIONING (delegated to VersioningOps)
  // ===========================================================================

  setProllyContext(projectHash: string, branchName: string): void {
    this.versioningOps.setProllyContext(projectHash, branchName);
  }

  getProllyNodeStore(): ProllyNodeStore | null {
    return this.versioningOps.getProllyNodeStore();
  }
  getProllyTree(): ProllyTree | null {
    return this.versioningOps.getProllyTree();
  }
  getCommitManager(): CommitManager | null {
    return this.versioningOps.getCommitManager();
  }
  getBranchDiffCache(): BranchDiffCache | null {
    return this.versioningOps.getBranchDiffCache();
  }

  async createGraphCommit(message?: string): Promise<string | null> {
    return this.versioningOps.createGraphCommit(
      () => this.entityOps.getAllEntities(),
      () => this.relationshipOps.getAllRelationships(),
      message,
    );
  }

  async pruneAndGC(keepCommits = 20, force = false): Promise<{ pruned: number; gcDeleted: number } | null> {
    return this.versioningOps.pruneAndGC(keepCommits, force, this.client);
  }

  async initBranchDiff(baseBranch: string): Promise<void> {
    const { branchName } = this._fallbackContext;
    return this.versioningOps.initBranchDiff(baseBranch, branchName);
  }

  isEntityDeletedOnBranch(entityId: string): boolean {
    return this.versioningOps.isEntityDeletedOnBranch(entityId);
  }

  async dropBulkIndexes(): Promise<void> {
    return this.versioningOps.dropBulkIndexes();
  }
  async recreateBulkIndexes(): Promise<void> {
    return this.versioningOps.recreateBulkIndexes();
  }
  async enableStagingMode(): Promise<void> {
    return this.versioningOps.enableStagingMode();
  }
  async commitStaging(): Promise<void> {
    return this.versioningOps.commitStaging();
  }
  async abortStaging(): Promise<void> {
    return this.versioningOps.abortStaging();
  }
  async walCheckpoint(): Promise<void> {
    return this.versioningOps.walCheckpoint();
  }
}

/** @deprecated Use GraphAdapter instead */
export type LibSQLGraphAdapter = GraphAdapter;
