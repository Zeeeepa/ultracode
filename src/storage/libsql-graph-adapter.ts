/**
 * LibSQL Graph Adapter - Unified Graph + Vector Storage
 *
 * Uses libSQL (Turso's SQLite fork) for both graph entities/relationships
 * AND vector embeddings with DiskANN index.
 *
 * Benefits of unified storage:
 * - Single database file for all data
 * - Consistent async API throughout
 * - No synchronization issues between separate databases
 * - Atomic transactions across graph and vector operations
 *
 * Performance optimizations:
 * - LRUCache for embeddings and search results
 * - CBOR binary serialization for metadata (faster than JSON)
 * - p-map for parallel batch processing
 *
 * @see https://docs.turso.tech/features/ai-and-embeddings
 */

import type { Client } from "@libsql/client";
import * as cbor from "cbor-x";
import { LRUCache } from "lru-cache";
import { DEFAULT_BRANCH, normalizeBranchName } from "../shared/storage-paths.js";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";
import type { BatchResult, Entity, EntityType, FileInfo, Relationship, RelationType } from "../types/storage.js";
import { logger } from "../utils/logger.js";
import { CacheOperations } from "./libsql/cache-ops.js";
import { EntityOperations } from "./libsql/entity-ops.js";
import { MetadataOperations } from "./libsql/metadata-ops.js";
import { RelationshipOperations } from "./libsql/relationship-ops.js";
// Import shared types and operation classes from libsql/ modules
import {
  CACHE_CONFIG,
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

// Re-export types for backwards compatibility
export {
  type LibSQLGraphConfig,
  type ProjectContext,
  type SupportedDimension,
  SUPPORTED_DIMENSIONS,
  getEmbeddingColumn,
  normalizeToSupportedDimension,
  DatabaseCorruptionError,
};

// =============================================================================
// LIBSQL GRAPH ADAPTER
// =============================================================================

export class LibSQLGraphAdapter {
  private client: Client | null = null;
  private config: Required<LibSQLGraphConfig>;
  private isInitialized = false;
  private dbPath: string = "";

  // Current project context
  private currentContext: ProjectContext = {
    projectHash: "legacy",
    branchName: DEFAULT_BRANCH,
  };

  // Performance caches
  private embeddingCache: LRUCache<string, VectorEmbedding>;
  private searchCache: LRUCache<string, SimilarityResult[]>;
  private metadataCache: LRUCache<string, Record<string, unknown>>;

  // Delegated operations (composition pattern)
  private entityOps: EntityOperations;
  private relationshipOps: RelationshipOperations;
  private vectorOps: VectorOperations;
  private cacheOps: CacheOperations;
  private metadataOps: MetadataOperations;

  constructor(config: LibSQLGraphConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize caches
    this.embeddingCache = new LRUCache<string, VectorEmbedding>(CACHE_CONFIG.embeddingCache);
    this.searchCache = new LRUCache<string, SimilarityResult[]>(CACHE_CONFIG.searchCache);
    this.metadataCache = new LRUCache<string, Record<string, unknown>>(CACHE_CONFIG.metadataCache);

    // Initialize operation delegates
    const getClient = () => this.client;
    const getContext = () => this.currentContext;

    this.entityOps = new EntityOperations(getClient, getContext, (row) => this.rowToEntity(row));
    this.relationshipOps = new RelationshipOperations(getClient, getContext, (row) => this.rowToRelationship(row));

    const vectorOpsContext: VectorOpsContext = {
      getClient,
      getContext,
      config: this.config,
      getEffectiveDimensions: () => this.getEffectiveDimensions(),
      getEmbeddingColumnName: () => this.getEmbeddingColumnName(),
      vectorToString: (v) => this.vectorToString(v),
      stringToVector: (s) => this.stringToVector(s),
      encodeMetadata: (m) => this.encodeMetadata(m),
      decodeMetadata: (d) => this.decodeMetadata(d),
      embeddingCache: this.embeddingCache,
      searchCache: this.searchCache,
      ensureProjectVectorIndex: () => this.ensureProjectVectorIndex(),
    };
    this.vectorOps = new VectorOperations(vectorOpsContext);

    this.cacheOps = new CacheOperations(getClient, (v) => this.vectorToString(v));
    this.metadataOps = new MetadataOperations(getClient, getContext);
  }

  // ===========================================================================
  // CBOR SERIALIZATION (faster than JSON for binary/metadata)
  // ===========================================================================

  private encodeMetadata(metadata: Record<string, unknown> | null | undefined): Buffer | null {
    if (!metadata) return null;
    try {
      return Buffer.from(cbor.encode(metadata));
    } catch {
      // Fallback to JSON if CBOR fails (e.g., unsupported types)
      return Buffer.from(JSON.stringify(metadata));
    }
  }

  private decodeMetadata(data: Buffer | Uint8Array | string | null): Record<string, unknown> | undefined {
    if (!data) return undefined;

    // Check cache first (optimization: only convert first 48 bytes to base64 → ~64 chars)
    let cacheKey: string;
    if (typeof data === "string") {
      cacheKey = data.length <= 64 ? data : data.slice(0, 64);
    } else {
      // Only encode first 48 bytes (produces ~64 base64 chars) instead of full buffer
      const slice = data.length <= 48 ? data : data.slice(0, 48);
      cacheKey = Buffer.from(slice).toString("base64");
    }
    const cached = this.metadataCache.get(cacheKey);
    if (cached) return cached;

    try {
      let result: Record<string, unknown>;

      if (typeof data === "string") {
        // Legacy JSON string
        result = JSON.parse(data);
      } else {
        // Try CBOR first, fallback to JSON
        try {
          result = cbor.decode(data instanceof Uint8Array ? data : Buffer.from(data));
        } catch {
          result = JSON.parse(Buffer.from(data).toString("utf8"));
        }
      }

      this.metadataCache.set(cacheKey, result);
      return result;
    } catch {
      return undefined;
    }
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  async initialize(dbPath: string, retryAfterCorruption = true): Promise<boolean> {
    const startTime = Date.now();
    logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ initialize() START at ${dbPath}`);
    try {
      this.dbPath = dbPath;

      // Remove stale lock files (single-user mode - we're the only consumer)
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ cleanupStaleLocks`);
      await this.cleanupStaleLocks(dbPath);
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ cleanupStaleLocks (${Date.now() - startTime}ms)`);

      logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ import @libsql/client`);
      const importStart = Date.now();
      const { createClient } = await import("@libsql/client");
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ import @libsql/client (${Date.now() - importStart}ms)`);

      logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ createClient`);
      const clientStart = Date.now();
      this.client = createClient({
        url: `file:${dbPath}`,
      });

      // Verify connection
      await this.client.execute("SELECT 1");
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ createClient + verify (${Date.now() - clientStart}ms)`);

      // Memory optimization PRAGMAs
      // cache_size: negative = KB, -8192 = 8MB page cache (smaller = less RSS)
      await this.client.execute("PRAGMA cache_size = -8192");
      await this.client.execute("PRAGMA temp_store = MEMORY");
      // mmap_size = 0 disables memory-mapped I/O (forces regular reads, may reduce RSS)
      await this.client.execute("PRAGMA mmap_size = 0");
      // WAL mode for concurrency, but wal_autocheckpoint limits WAL file size
      await this.client.execute("PRAGMA journal_mode = WAL");
      await this.client.execute("PRAGMA wal_autocheckpoint = 100"); // checkpoint every 100 pages

      // Proactive integrity check to detect corruption early
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ integrityCheck`);
      const integrityStart = Date.now();
      await this.quickIntegrityCheck();
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ integrityCheck (${Date.now() - integrityStart}ms)`);

      // Create all tables
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ▶ createTables`);
      const tablesStart = Date.now();
      await this.createTables();
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ createTables (${Date.now() - tablesStart}ms)`);

      this.isInitialized = true;
      logger.trace("STORAGE", `[LibSQLGraphAdapter] ◀ initialize() END (${Date.now() - startTime}ms)`);
      console.error(`[LibSQLGraphAdapter] Initialized unified database at ${dbPath}`);
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message || String(error);

      // Detect database corruption
      const isCorrupted =
        errorMessage.includes("SQLITE_CORRUPT") ||
        errorMessage.includes("database disk image is malformed") ||
        errorMessage.includes("file is not a database") ||
        errorMessage.includes("database or disk is full");

      if (isCorrupted && retryAfterCorruption) {
        console.error(`[LibSQLGraphAdapter] ⚠️ DATABASE CORRUPTION DETECTED: ${errorMessage}`);
        console.error(`[LibSQLGraphAdapter] 🔄 Attempting to recreate database...`);

        // Close any existing client
        if (this.client) {
          try {
            this.client.close();
          } catch {
            // Ignore close errors on corrupt db
          }
          this.client = null;
        }

        // Delete corrupt database and auxiliary files
        const deleted = await this.deleteCorruptDatabase(dbPath);
        if (deleted) {
          console.error(`[LibSQLGraphAdapter] ✓ Deleted corrupt database, retrying initialization...`);
          // Retry once without recursion
          return this.initialize(dbPath, false);
        } else {
          console.error(`[LibSQLGraphAdapter] ✗ Failed to delete corrupt database`);
          return false;
        }
      }

      console.error("[LibSQLGraphAdapter] Failed to initialize:", error);
      return false;
    }
  }

  /**
   * Delete corrupt database and all auxiliary files.
   * Called automatically when SQLITE_CORRUPT is detected.
   */
  private async deleteCorruptDatabase(dbPath: string): Promise<boolean> {
    const { unlink, stat } = await import("node:fs/promises");

    const filesToDelete = [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`];

    let anyDeleted = false;

    for (const file of filesToDelete) {
      try {
        const fileStats = await stat(file);
        const sizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
        await unlink(file);
        console.error(`[LibSQLGraphAdapter] Deleted: ${file} (${sizeMB} MB)`);
        anyDeleted = true;
      } catch (error) {
        // File doesn't exist or permission error - OK
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          console.error(`[LibSQLGraphAdapter] Failed to delete ${file}: ${err.message}`);
        }
      }
    }

    return anyDeleted;
  }

  /**
   * Quick integrity check to detect corruption early.
   * Probes tables AND indexes to catch DiskANN corruption.
   * Much faster than full PRAGMA integrity_check.
   */
  private async quickIntegrityCheck(): Promise<void> {
    if (!this.client) return;

    // Check if main tables exist first
    const tables = await this.client.execute(`
      SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('entities', 'relationships', 'embeddings', 'files')
    `);

    if (tables.rows.length === 0) {
      // No tables yet - fresh database, skip integrity check
      return;
    }

    // Quick probe of each table to detect page corruption
    const probes = [
      "SELECT id FROM entities LIMIT 1",
      "SELECT id FROM relationships LIMIT 1",
      "SELECT id FROM embeddings LIMIT 1",
      "SELECT path FROM files LIMIT 1",
    ];

    for (const probe of probes) {
      try {
        await this.client.execute(probe);
      } catch (error) {
        const msg = (error as Error).message || "";
        // Table doesn't exist is OK (fresh db)
        if (msg.includes("no such table")) continue;
        // Re-throw to trigger corruption handling
        throw error;
      }
    }

    // Run PRAGMA integrity_check - thorough check for corruption
    try {
      console.error(`[LibSQLGraphAdapter] Running integrity check...`);
      const integrityCheck = await this.client.execute("PRAGMA integrity_check");
      const firstRow = integrityCheck.rows[0];
      const result = firstRow ? String(Object.values(firstRow)[0]) : "ok";
      if (result !== "ok") {
        console.error(`[LibSQLGraphAdapter] Integrity check FAILED: ${result}`);
        throw new Error(`SQLITE_CORRUPT: integrity_check failed: ${result}`);
      }
      console.error(`[LibSQLGraphAdapter] Integrity check OK`);
    } catch (error) {
      const msg = (error as Error).message || "";
      // Re-throw corruption errors
      if (
        msg.includes("SQLITE_CORRUPT") ||
        msg.includes("malformed") ||
        msg.includes("corrupt") ||
        msg.includes("integrity_check failed")
      ) {
        throw error;
      }
      // Log but don't fail on other PRAGMA errors (might not be supported)
      console.error(`[LibSQLGraphAdapter] PRAGMA integrity_check error: ${msg}`);
      throw error; // Re-throw any error during integrity check
    }

    // Probe embeddings table - this catches corruption in the main table
    try {
      const countResult = await this.client.execute("SELECT COUNT(*) as cnt FROM embeddings");
      const count = (countResult.rows[0]?.["cnt"] as number) || 0;
      console.error(`[LibSQLGraphAdapter] Embeddings count: ${count}`);

      // Also check content column which often triggers corruption
      if (count > 0) {
        await this.client.execute("SELECT id, length(content) FROM embeddings LIMIT 1");
      }
    } catch (error) {
      const msg = (error as Error).message || "";
      if (msg.includes("no such table")) {
        // Table doesn't exist - OK for fresh DB
      } else {
        console.error(`[LibSQLGraphAdapter] Embeddings probe FAILED: ${msg}`);
        throw error;
      }
    }

    // Probe DiskANN shadow tables - corruption often hides here
    try {
      const shadowTables = await this.client.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE '%shadow%'
      `);
      for (const row of shadowTables.rows) {
        const tableName = row["name"] as string;
        try {
          await this.client.execute(`SELECT COUNT(*) FROM "${tableName}"`);
        } catch (shadowError) {
          const smsg = (shadowError as Error).message || "";
          console.error(`[LibSQLGraphAdapter] Shadow table ${tableName} CORRUPT: ${smsg}`);
          throw shadowError;
        }
      }
      console.error(`[LibSQLGraphAdapter] All shadow tables OK`);
    } catch (error) {
      const msg = (error as Error).message || "";
      if (!msg.includes("no such table") && !msg.includes("All shadow")) {
        throw error;
      }
    }

    console.error(`[LibSQLGraphAdapter] Integrity check passed`);
  }

  /**
   * Remove stale SQLite lock files before opening database.
   * Safe in single-user mode where we're the only consumer.
   */
  private async cleanupStaleLocks(dbPath: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    const lockFiles = [`${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`];

    for (const lockFile of lockFiles) {
      try {
        await unlink(lockFile);
        console.error(`[LibSQLGraphAdapter] Removed stale lock: ${lockFile}`);
      } catch {
        // File doesn't exist or already removed - OK
      }
    }
  }

  private async createTables(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    // Use batch to execute all DDL statements in one round-trip
    // This significantly reduces startup time (from ~7s to ~1s)
    const startTime = Date.now();

    await this.client.batch(
      [
        // Entities table - composite PK ensures isolation between projects/branches
        `CREATE TABLE IF NOT EXISTS entities (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        location TEXT NOT NULL,
        metadata TEXT,
        hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        complexity_score INTEGER DEFAULT 1,
        language TEXT,
        size_bytes INTEGER DEFAULT 0,
        embedding_base64 TEXT,
        embedding_text TEXT,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        // Relationships table - composite PK ensures isolation between projects/branches
        `CREATE TABLE IF NOT EXISTS relationships (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT,
        weight REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        // Files table
        `CREATE TABLE IF NOT EXISTS files (
        path TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        hash TEXT,
        last_indexed INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        PRIMARY KEY (path, project_hash, branch_name)
      )`,
        // Project metadata table
        `CREATE TABLE IF NOT EXISTS project_metadata (
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL DEFAULT 'main',
        project_path TEXT NOT NULL,
        last_indexed_at INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        file_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_full_index_at INTEGER DEFAULT 0,
        incremental_changes_count INTEGER DEFAULT 0,
        PRIMARY KEY (project_hash, branch_name)
      )`,
        // Query cache table - composite PK for project isolation
        `CREATE TABLE IF NOT EXISTS query_cache (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        query_hash TEXT NOT NULL,
        result TEXT NOT NULL,
        hit_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        // Performance metrics table
        `CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        memory_usage INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
        // Vector embeddings table with multi-dimension F32_BLOB columns
        // Each project uses one column based on its model's dimensions
        // Supports 384 (MiniLM, E5-small), 768 (E5-base, Granite), 1024 (BGE-M3, mxbai), 4096 (Qwen3, E5-Mistral)
        `CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        content TEXT NOT NULL,
        dim_size INTEGER NOT NULL DEFAULT 384,
        embedding_384 F32_BLOB(384),
        embedding_768 F32_BLOB(768),
        embedding_1024 F32_BLOB(1024),
        embedding_4096 F32_BLOB(4096),
        metadata TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        // GLOBAL embedding cache by content hash - shared across projects
        // Multi-dimension columns to cache embeddings from any model
        `CREATE TABLE IF NOT EXISTS embedding_cache (
        content_hash TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        dim_size INTEGER NOT NULL DEFAULT 384,
        embedding_384 F32_BLOB(384),
        embedding_768 F32_BLOB(768),
        embedding_1024 F32_BLOB(1024),
        embedding_4096 F32_BLOB(4096),
        text_preview TEXT,
        hit_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      )`,
        // === INDEXES (batched for speed) ===
        // Entity indexes
        `CREATE INDEX IF NOT EXISTS idx_entities_project_branch ON entities(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_file_path ON entities(file_path, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name, project_hash, branch_name)`,
        // Relationship indexes
        `CREATE INDEX IF NOT EXISTS idx_relationships_project_branch ON relationships(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id, project_hash, branch_name)`,
        // Files index
        `CREATE INDEX IF NOT EXISTS idx_files_project_branch ON files(project_hash, branch_name)`,
        // Embeddings index
        `CREATE INDEX IF NOT EXISTS idx_embeddings_project_branch ON embeddings(project_hash, branch_name)`,
        // Embedding cache index for LRU eviction
        `CREATE INDEX IF NOT EXISTS idx_embedding_cache_lru ON embedding_cache(last_used_at)`,
      ],
      "write",
    );

    const batchElapsed = Date.now() - startTime;
    logger.info("LIBSQL_INIT", `Tables and basic indexes created`, { ms: batchElapsed });

    // DiskANN vector index - DISABLED global index
    // Using project-specific partial indexes instead (ensureProjectVectorIndex)
    // Global index was causing 2+ GB overhead duplicating the data
    logger.info("LIBSQL_INIT", `Skipping global DiskANN index (using partial indexes per project)`);

    const totalElapsed = Date.now() - startTime;
    logger.info("LIBSQL_INIT", `Total initialization complete`, { ms: totalElapsed });

    // Log memory and libsql stats after init
    await this.logDatabaseStats("after_init");
  }

  /**
   * Log database statistics and memory usage for diagnostics.
   */
  async logDatabaseStats(label: string): Promise<void> {
    if (!this.client) return;

    try {
      // Get libsql/sqlite stats
      const pageCount = await this.client.execute("PRAGMA page_count");
      const pageSize = await this.client.execute("PRAGMA page_size");
      const cacheSize = await this.client.execute("PRAGMA cache_size");
      const freelistCount = await this.client.execute("PRAGMA freelist_count");

      const pages = Number(pageCount.rows[0]?.["page_count"] ?? 0);
      const size = Number(pageSize.rows[0]?.["page_size"] ?? 4096);
      const cache = Number(cacheSize.rows[0]?.["cache_size"] ?? 0);
      const freelist = Number(freelistCount.rows[0]?.["freelist_count"] ?? 0);

      const dbSizeMB = (pages * size) / 1024 / 1024;
      const cacheMB = cache < 0 ? -cache / 1024 : (cache * size) / 1024 / 1024;

      logger.info("LIBSQL_STATS", label, {
        dbSizeMB: dbSizeMB.toFixed(1),
        pages,
        pageSize: size,
        cacheSizeMB: cacheMB.toFixed(1),
        freelistPages: freelist,
      });

      // Log process memory
      const mem = process.memoryUsage();
      logger.info("LIBSQL_MEMORY", label, {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024),
      });
    } catch (error) {
      logger.debug("LIBSQL_STATS", "Failed to get stats", { error: (error as Error).message });
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

  setProjectContext(context: ProjectContext): void {
    this.currentContext = {
      projectHash: context.projectHash,
      branchName: normalizeBranchName(context.branchName),
      dimensions: context.dimensions,
    };
    // Removed verbose logging - context is set very frequently
  }

  getProjectContext(): ProjectContext {
    return { ...this.currentContext };
  }

  /**
   * Get effective dimensions for current project.
   * Uses project-specific dimensions if set, otherwise global config.
   */
  getEffectiveDimensions(): SupportedDimension {
    return this.currentContext.dimensions ?? normalizeToSupportedDimension(this.config.dimensions);
  }

  /**
   * Get embedding column name for current project's dimensions.
   */
  getEmbeddingColumnName(): string {
    return getEmbeddingColumn(this.getEffectiveDimensions());
  }

  async ensureProjectVectorIndex(): Promise<void> {
    if (!this.client) return;
    const { projectHash } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = getEmbeddingColumn(dims);
    // Include dimensions in index name to support different dims per project
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
      logger.info("LIBSQL_INDEX", `Created partial index`, { indexName, dims, ms: Date.now() - t });
    } catch (e) {
      logger.warn("LIBSQL_INDEX", `Partial index failed`, { error: (e as Error).message });
    }
  }

  // ===========================================================================
  // ENTITY OPERATIONS (delegated to EntityOperations)
  // ===========================================================================

  insertEntity = (entity: Entity): Promise<void> => this.entityOps.insertEntity(entity);
  insertEntities = (entities: Entity[]): Promise<BatchResult> => this.entityOps.insertEntities(entities);
  getEntity = (id: string): Promise<Entity | null> => this.entityOps.getEntity(id);

  findEntities(query: {
    filters?: {
      entityType?: EntityType | EntityType[];
      filePath?: string | string[];
      name?: string | RegExp;
    };
    limit?: number;
    offset?: number;
  }): Promise<Entity[]> {
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

  getAllEntities = (): Promise<Entity[]> => this.entityOps.getAllEntities();

  // ===========================================================================
  // RELATIONSHIP OPERATIONS (delegated to RelationshipOperations)
  // ===========================================================================

  insertRelationship = (relationship: Relationship): Promise<void> =>
    this.relationshipOps.insertRelationship(relationship);

  insertRelationships = (relationships: Relationship[]): Promise<BatchResult> =>
    this.relationshipOps.insertRelationships(relationships);

  getRelationshipsForEntity = (entityId: string, type?: RelationType): Promise<Relationship[]> =>
    this.relationshipOps.getRelationshipsForEntity(entityId, type);

  findRelationships = (query: {
    filters?: { relationshipType?: RelationType | RelationType[] };
    limit?: number;
    offset?: number;
  }): Promise<Relationship[]> => this.relationshipOps.findRelationships(query);

  deleteRelationship = (id: string): Promise<void> => this.relationshipOps.deleteRelationship(id);

  // ===========================================================================
  // FILE/METADATA OPERATIONS (delegated to MetadataOperations)
  // ===========================================================================

  updateFileInfo = (info: FileInfo): Promise<void> => this.metadataOps.updateFileInfo(info);

  getFileInfo = (path: string): Promise<FileInfo | null> => this.metadataOps.getFileInfo(path);

  getOutdatedFiles = (since: number): Promise<FileInfo[]> => this.metadataOps.getOutdatedFiles(since);

  // ===========================================================================
  // VECTOR OPERATIONS (delegated to VectorOperations)
  // ===========================================================================

  /** @deprecated Use FaissProvider.add() instead */
  insertEmbedding = (embedding: VectorEmbedding): Promise<void> => this.vectorOps.insertEmbedding(embedding);

  /** @deprecated Use FaissProvider.addBatch() instead */
  insertEmbeddingBatch = (embeddings: VectorEmbedding[]): Promise<void> =>
    this.vectorOps.insertEmbeddingBatch(embeddings);

  /** @deprecated Faiss HNSW handles live updates, no need to drop/rebuild */
  dropVectorIndex = (): Promise<void> => this.vectorOps.dropVectorIndex();

  /** @deprecated Faiss HNSW maintains index automatically, no rebuild needed */
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
  // EMBEDDING CACHE OPERATIONS (delegated to CacheOperations)
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

  // ===========================================================================
  // METADATA OPERATIONS (delegated to MetadataOperations)
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
  // METRICS & STATS (delegated to MetadataOperations)
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
  // CLEAR OPERATIONS (delegated to MetadataOperations)
  // ===========================================================================

  clear = (): Promise<void> => this.metadataOps.clear();

  clearAll = (): Promise<void> => this.metadataOps.clearAll();

  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.isInitialized = false;
      console.error("[LibSQLGraphAdapter] Connection closed");
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private rowToEntity(row: any): Entity {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as EntityType,
      filePath: row.file_path as string,
      location: JSON.parse(row.location as string),
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      hash: (row.hash as string) || "",
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      complexityScore: row.complexity_score as number | undefined,
      language: row.language as string | undefined,
      sizeBytes: row.size_bytes as number | undefined,
      embeddingBase64: row.embedding_base64 as string | undefined,
      embeddingText: row.embedding_text as string | undefined,
    };
  }

  private rowToRelationship(row: any): Relationship {
    return {
      id: row.id as string,
      fromId: row.from_id as string,
      toId: row.to_id as string,
      type: row.type as RelationType,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      weight: row.weight as number,
      createdAt: row.created_at as number,
    };
  }

  private vectorToString(vector: Float32Array): string {
    const values = Array.from(vector).map((v) => v.toFixed(6));
    return `[${values.join(", ")}]`;
  }

  private stringToVector(str: string): Float32Array {
    const clean = str.replace(/[[\]]/g, "");
    const values = clean.split(",").map((s) => parseFloat(s.trim()));
    return new Float32Array(values);
  }

  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    embedding: { size: number; maxSize: number };
    search: { size: number; maxSize: number };
    metadata: { size: number; maxSize: number };
  } {
    return {
      embedding: {
        size: this.embeddingCache.size,
        maxSize: CACHE_CONFIG.embeddingCache.max,
      },
      search: {
        size: this.searchCache.size,
        maxSize: CACHE_CONFIG.searchCache.max,
      },
      metadata: {
        size: this.metadataCache.size,
        maxSize: CACHE_CONFIG.metadataCache.max,
      },
    };
  }

  /**
   * Clear all caches (useful after bulk operations or project switch)
   */
  clearCaches(): void {
    this.embeddingCache.clear();
    this.searchCache.clear();
    this.metadataCache.clear();
    logger.info("CACHE", `All caches cleared`);
  }
}
