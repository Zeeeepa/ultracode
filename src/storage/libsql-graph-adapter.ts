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

import type { Client, InStatement, ResultSet } from "@libsql/client";
import * as cbor from "cbor-x";
import { LRUCache } from "lru-cache";
import pMap from "p-map";
import { DEFAULT_BRANCH, normalizeBranchName } from "../shared/storage-paths.js";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";
import type { BatchResult, Entity, EntityType, FileInfo, Relationship, RelationType } from "../types/storage.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface LibSQLGraphConfig {
  // Vector dimensions (default: 384 for all-MiniLM-L6-v2)
  dimensions?: number;
  // Distance metric for vector search
  metric?: "cosine" | "l2";
  // Compression level for neighbor storage
  compression?: "float8" | "float16" | "float32";
  // DiskANN search list size (higher = better recall, slower)
  searchL?: number;
  // DiskANN insert list size (higher = better quality, slower build)
  insertL?: number;
}

const DEFAULT_CONFIG: Required<LibSQLGraphConfig> = {
  dimensions: 384,
  metric: "cosine",
  compression: "float32",
  searchL: 200,
  insertL: 70,
};

// =============================================================================
// PROJECT CONTEXT
// =============================================================================

export interface ProjectContext {
  projectHash: string;
  branchName: string;
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_CONFIG = {
  // Embedding cache: store frequently accessed embeddings in memory
  embeddingCache: {
    max: 5000, // Max embeddings to cache
    ttl: 1000 * 60 * 10, // 10 minutes TTL
  },
  // Search result cache: cache recent similarity searches
  searchCache: {
    max: 500, // Max search results to cache
    ttl: 1000 * 60 * 2, // 2 minutes TTL (shorter as data changes)
  },
  // Metadata cache: parsed metadata objects
  metadataCache: {
    max: 10000,
    ttl: 1000 * 60 * 5, // 5 minutes TTL
  },
  // Batch processing concurrency - reduced to prevent native crashes
  batchConcurrency: 1, // Sequential to avoid libsql native issues with parallel writes
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

  constructor(config: LibSQLGraphConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize caches
    this.embeddingCache = new LRUCache<string, VectorEmbedding>(CACHE_CONFIG.embeddingCache);
    this.searchCache = new LRUCache<string, SimilarityResult[]>(CACHE_CONFIG.searchCache);
    this.metadataCache = new LRUCache<string, Record<string, unknown>>(CACHE_CONFIG.metadataCache);
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

    // Check cache first
    const cacheKey = typeof data === "string" ? data : Buffer.from(data).toString("base64").slice(0, 64);
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

  async initialize(dbPath: string): Promise<boolean> {
    try {
      this.dbPath = dbPath;
      const { createClient } = await import("@libsql/client");

      this.client = createClient({
        url: `file:${dbPath}`,
      });

      // Verify connection
      await this.client.execute("SELECT 1");

      // Create all tables
      await this.createTables();

      this.isInitialized = true;
      console.error(`[LibSQLGraphAdapter] Initialized unified database at ${dbPath}`);
      return true;
    } catch (error) {
      console.error("[LibSQLGraphAdapter] Failed to initialize:", error);
      return false;
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
        // Vector embeddings table with F32_BLOB - composite PK for project isolation
        `CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        content TEXT NOT NULL,
        embedding F32_BLOB(${this.config.dimensions}),
        metadata TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
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
      ],
      "write",
    );

    const batchElapsed = Date.now() - startTime;
    logger.info("LIBSQL_INIT", `Tables and basic indexes created`, { ms: batchElapsed });

    // DiskANN vector index - separate because it may fail on some builds
    // Check if index already exists to avoid expensive rebuild
    const diskannStart = Date.now();

    try {
      const indexCheck = await this.client.execute(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_embeddings_vector'
      `);

      if (indexCheck.rows.length > 0) {
        logger.info("LIBSQL_INIT", `DiskANN index already exists, skipping creation`, {
          ms: Date.now() - diskannStart,
        });
      } else {
        const indexParams = [
          `'metric=${this.config.metric}'`,
          `'compress_neighbors=${this.config.compression}'`,
          `'search_l=${this.config.searchL}'`,
          `'insert_l=${this.config.insertL}'`,
        ].join(", ");

        await this.client.execute(`
          CREATE INDEX IF NOT EXISTS idx_embeddings_vector
          ON embeddings(libsql_vector_idx(embedding, ${indexParams}))
        `);
        logger.info("LIBSQL_INIT", `DiskANN index created`, { ms: Date.now() - diskannStart });
      }
    } catch (error) {
      logger.warn("LIBSQL_INIT", `DiskANN index creation note`, { error: (error as Error).message });
    }

    const totalElapsed = Date.now() - startTime;
    logger.info("LIBSQL_INIT", `Total initialization complete`, { ms: totalElapsed });
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
    };
    // Removed verbose logging - context is set very frequently
  }

  getProjectContext(): ProjectContext {
    return { ...this.currentContext };
  }

  async ensureProjectVectorIndex(): Promise<void> {
    if (!this.client) return;
    const { projectHash } = this.currentContext;
    const indexName = `idx_emb_vec_${projectHash.substring(0, 8)}`;
    try {
      const check = await this.client.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
        args: [indexName],
      });
      if (check.rows.length > 0) return;
      const params = [
        `'metric=${this.config.metric}'`,
        `'compress_neighbors=${this.config.compression}'`,
        `'search_l=${this.config.searchL}'`,
        `'insert_l=${this.config.insertL}'`,
      ].join(", ");
      const t = Date.now();
      await this.client.execute(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON embeddings(libsql_vector_idx(embedding, ${params})) WHERE project_hash = '${projectHash}'`,
      );
      logger.info("LIBSQL_INDEX", `Created partial index`, { indexName, ms: Date.now() - t });
    } catch (e) {
      logger.warn("LIBSQL_INDEX", `Partial index failed`, { error: (e as Error).message });
    }
  }

  private async getProjectIndexName(): Promise<string | null> {
    if (!this.client) return null;
    const indexName = `idx_emb_vec_${this.currentContext.projectHash.substring(0, 8)}`;
    const r = await this.client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
      args: [indexName],
    });
    return r.rows.length > 0 ? indexName : null;
  }

  // ===========================================================================
  // ENTITY OPERATIONS
  // ===========================================================================

  async insertEntity(entity: Entity): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO entities
        (id, project_hash, branch_name, name, type, file_path, location, metadata, hash,
         created_at, updated_at, complexity_score, language, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        entity.id,
        projectHash,
        branchName,
        entity.name,
        entity.type,
        entity.filePath,
        JSON.stringify(entity.location),
        JSON.stringify(entity.metadata),
        entity.hash || null,
        entity.createdAt || now,
        entity.updatedAt || now,
        entity.complexityScore || 1,
        entity.language || null,
        entity.sizeBytes || 0,
      ],
    });
  }

  async insertEntities(entities: Entity[]): Promise<BatchResult> {
    if (!this.client) throw new Error("Client not initialized");
    if (entities.length === 0) return { processed: 0, failed: 0, errors: [], timeMs: 0 };

    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique: Entity[] = [];
    for (const e of entities) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        unique.push(e);
      }
    }

    const statements: InStatement[] = unique.map((entity) => ({
      sql: `
        INSERT OR REPLACE INTO entities
        (id, project_hash, branch_name, name, type, file_path, location, metadata, hash,
         created_at, updated_at, complexity_score, language, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        entity.id,
        projectHash,
        branchName,
        entity.name,
        entity.type,
        entity.filePath,
        JSON.stringify(entity.location),
        JSON.stringify(entity.metadata),
        entity.hash || null,
        entity.createdAt || now,
        entity.updatedAt || now,
        entity.complexityScore || 1,
        entity.language || null,
        entity.sizeBytes || 0,
      ],
    }));

    // Execute in batches
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      try {
        await this.client.batch(batch, "write");
        processed += batch.length;
      } catch (error) {
        errors.push({
          item: { batchStart: i, batchEnd: i + batch.length },
          error: (error as Error).message,
        });
      }
    }

    return {
      processed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  async getEntity(id: string): Promise<Entity | null> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const result = await this.client.execute({
      sql: `SELECT * FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?`,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length === 0) return null;
    return this.rowToEntity(result.rows[0]);
  }

  async findEntities(query: {
    filters?: {
      entityType?: EntityType | EntityType[];
      filePath?: string | string[];
      name?: string | RegExp;
    };
    limit?: number;
    offset?: number;
  }): Promise<Entity[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const args: any[] = [projectHash, branchName];

    if (query.filters) {
      if (query.filters.entityType) {
        const types = Array.isArray(query.filters.entityType) ? query.filters.entityType : [query.filters.entityType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        args.push(...types);
      }

      if (query.filters.filePath) {
        const paths = Array.isArray(query.filters.filePath) ? query.filters.filePath : [query.filters.filePath];
        // Normalize paths for cross-platform
        const normalized: string[] = [];
        for (const p of paths) {
          normalized.push(p);
          if (p.includes("/")) normalized.push(p.replace(/\//g, "\\"));
          if (p.includes("\\")) normalized.push(p.replace(/\\/g, "/"));
        }
        const unique = [...new Set(normalized)];
        sql += ` AND file_path IN (${unique.map(() => "?").join(",")})`;
        args.push(...unique);
      }

      if (query.filters.name) {
        if (query.filters.name instanceof RegExp) {
          let pattern = query.filters.name.source;
          pattern = pattern.replace(/\.\*/g, "%").replace(/\*/g, "%").replace(/\./g, "_");
          if (!pattern.includes("%") && !pattern.includes("_")) {
            pattern = `%${pattern}%`;
          }
          sql += " AND name LIKE ?";
          args.push(pattern);
        } else {
          sql += " AND name = ?";
          args.push(query.filters.name);
        }
      }
    }

    const limit = Math.min(query.limit || 100, 1000);
    sql += " LIMIT ? OFFSET ?";
    args.push(limit, query.offset || 0);

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEntity(row));
  }

  async searchEntities(options: {
    namePattern?: string;
    types?: EntityType[];
    filePath?: string;
    limit?: number;
  }): Promise<Entity[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const args: any[] = [projectHash, branchName];

    if (options.namePattern) {
      sql += " AND name LIKE ?";
      args.push(`%${options.namePattern}%`);
    }

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => "?").join(",")})`;
      args.push(...options.types);
    }

    if (options.filePath) {
      sql += " AND file_path = ?";
      args.push(options.filePath);
    }

    sql += " LIMIT ?";
    args.push(options.limit || 100);

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEntity(row));
  }

  async deleteEntity(id: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    await this.client.execute({
      sql: "DELETE FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }

  async getAllEntities(): Promise<Entity[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const result = await this.client.execute({
      sql: "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });

    return result.rows.map((row) => this.rowToEntity(row));
  }

  // ===========================================================================
  // RELATIONSHIP OPERATIONS
  // ===========================================================================

  async insertRelationship(relationship: Relationship): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO relationships
        (id, project_hash, branch_name, from_id, to_id, type, metadata, weight, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        relationship.id,
        projectHash,
        branchName,
        relationship.fromId,
        relationship.toId,
        relationship.type,
        relationship.metadata ? JSON.stringify(relationship.metadata) : null,
        relationship.weight ?? 1.0,
        relationship.createdAt ?? now,
      ],
    });
  }

  async insertRelationships(relationships: Relationship[]): Promise<BatchResult> {
    if (!this.client) throw new Error("Client not initialized");
    if (relationships.length === 0) return { processed: 0, failed: 0, errors: [], timeMs: 0 };

    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    // Deduplicate
    const seen = new Set<string>();
    const unique: Relationship[] = [];
    for (const r of relationships) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        unique.push(r);
      }
    }

    const statements: InStatement[] = unique.map((r) => ({
      sql: `
        INSERT OR REPLACE INTO relationships
        (id, project_hash, branch_name, from_id, to_id, type, metadata, weight, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        r.id,
        projectHash,
        branchName,
        r.fromId,
        r.toId,
        r.type,
        r.metadata ? JSON.stringify(r.metadata) : null,
        r.weight ?? 1.0,
        r.createdAt ?? now,
      ],
    }));

    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      try {
        await this.client.batch(batch, "write");
        processed += batch.length;
      } catch (error) {
        errors.push({
          item: { batchStart: i, batchEnd: i + batch.length },
          error: (error as Error).message,
        });
      }
    }

    return {
      processed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  async getRelationshipsForEntity(entityId: string, type?: RelationType): Promise<Relationship[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    let sql = `
      SELECT * FROM relationships
      WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
    `;
    const args: any[] = [projectHash, branchName, entityId, entityId];

    if (type) {
      sql += " AND type = ?";
      args.push(type);
    }

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row) => this.rowToRelationship(row));
  }

  async findRelationships(query: {
    filters?: { relationshipType?: RelationType | RelationType[] };
    limit?: number;
    offset?: number;
  }): Promise<Relationship[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    let sql = "SELECT * FROM relationships WHERE project_hash = ? AND branch_name = ?";
    const args: any[] = [projectHash, branchName];

    if (query.filters?.relationshipType) {
      const types = Array.isArray(query.filters.relationshipType)
        ? query.filters.relationshipType
        : [query.filters.relationshipType];
      sql += ` AND type IN (${types.map(() => "?").join(",")})`;
      args.push(...types);
    }

    const limit = Math.min(query.limit || 100, 1000);
    sql += " LIMIT ? OFFSET ?";
    args.push(limit, query.offset || 0);

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row) => this.rowToRelationship(row));
  }

  async deleteRelationship(id: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    await this.client.execute({
      sql: "DELETE FROM relationships WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  async updateFileInfo(info: FileInfo): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO files
        (path, project_hash, branch_name, hash, last_indexed, entity_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [info.path, projectHash, branchName, info.hash, info.lastIndexed, info.entityCount],
    });
  }

  async getFileInfo(path: string): Promise<FileInfo | null> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const result = await this.client.execute({
      sql: "SELECT * FROM files WHERE path = ? AND project_hash = ? AND branch_name = ?",
      args: [path, projectHash, branchName],
    });

    if (result.rows.length === 0 || !result.rows[0]) return null;
    const row = result.rows[0];
    return {
      path: row["path"] as string,
      hash: row["hash"] as string,
      lastIndexed: row["last_indexed"] as number,
      entityCount: row["entity_count"] as number,
    };
  }

  async getOutdatedFiles(since: number): Promise<FileInfo[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const result = await this.client.execute({
      sql: `
        SELECT * FROM files
        WHERE project_hash = ? AND branch_name = ? AND last_indexed < ?
        ORDER BY last_indexed ASC
      `,
      args: [projectHash, branchName, since],
    });

    return result.rows.map((row) => ({
      path: row.path as string,
      hash: row.hash as string,
      lastIndexed: row.last_indexed as number,
      entityCount: row.entity_count as number,
    }));
  }

  // ===========================================================================
  // VECTOR OPERATIONS
  // ===========================================================================

  async insertEmbedding(embedding: VectorEmbedding): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const vectorStr = this.vectorToString(embedding.vector);

    // Use CBOR for metadata serialization
    const metadataBlob = this.encodeMetadata(embedding.metadata);

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, embedding, metadata, created_at)
        VALUES (?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        embedding.id,
        projectHash,
        branchName,
        embedding.content,
        vectorStr,
        metadataBlob,
        embedding.createdAt || Date.now(),
      ],
    });

    // Update cache
    const cacheKey = `${projectHash}:${branchName}:${embedding.id}`;
    this.embeddingCache.set(cacheKey, embedding);

    // Invalidate search cache for this project (data changed)
    this.invalidateSearchCache(projectHash, branchName);
  }

  async insertEmbeddingBatch(embeddings: VectorEmbedding[]): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    if (embeddings.length === 0) return;

    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    logger.info("EMBEDDING_INSERT", `Starting batch insert`, { count: embeddings.length, projectHash, branchName });

    // Prepare statements with CBOR metadata
    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, embedding, metadata, created_at)
        VALUES (?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        this.vectorToString(e.vector),
        this.encodeMetadata(e.metadata),
        e.createdAt || now,
      ],
    }));

    // Split into chunks for parallel processing with p-map
    const batchSize = 100;
    const chunks: InStatement[][] = [];
    for (let i = 0; i < statements.length; i += batchSize) {
      chunks.push(statements.slice(i, i + batchSize));
    }

    let totalInserted = 0;

    // Process chunks in parallel with p-map (limited concurrency)
    await pMap(
      chunks,
      async (batch, index) => {
        try {
          await this.client!.batch(batch, "write");
          totalInserted += batch.length;
        } catch (error) {
          logger.error("EMBEDDING_INSERT", `Batch ${index} failed`, { error: (error as Error).message });
          throw error;
        }
      },
      { concurrency: CACHE_CONFIG.batchConcurrency },
    );

    // Update embedding cache
    for (const e of embeddings) {
      const cacheKey = `${projectHash}:${branchName}:${e.id}`;
      this.embeddingCache.set(cacheKey, e);
    }

    // Invalidate search cache
    this.invalidateSearchCache(projectHash, branchName);

    logger.info("EMBEDDING_INSERT", `Batch insert complete`, {
      totalInserted,
      projectHash,
      branchName,
      parallelChunks: chunks.length,
    });
  }

  /**
   * Invalidate search cache for a specific project/branch
   */
  private invalidateSearchCache(_projectHash: string, _branchName: string): void {
    // LRU cache doesn't support prefix deletion, but we can clear entries on access
    // For now, just clear all search cache when data changes (simple approach)
    this.searchCache.clear();
  }

  async searchVectors(queryVector: Float32Array, limit: number): Promise<SimilarityResult[]> {
    if (!this.client) throw new Error("Client not initialized");

    const startTotal = Date.now();
    const { projectHash, branchName } = this.currentContext;
    const vectorStr = this.vectorToString(queryVector);

    // Check search cache first (use first 16 floats as key for speed)
    const cacheKey = `${projectHash}:${branchName}:${limit}:${Array.from(queryVector.slice(0, 16)).join(",")}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      logger.debug("VECTOR_SEARCH", `Cache hit`, { projectHash, results: cached.length });
      return cached;
    }

    // Check embedding count for this project
    const countResult = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });
    const embeddingCount = (countResult.rows[0]?.["cnt"] as number) || 0;

    if (embeddingCount === 0) {
      logger.info("VECTOR_SEARCH", `No embeddings for project`, { projectHash, branchName });
      return [];
    }

    const startQuery = Date.now();
    let result: Awaited<ReturnType<typeof this.client.execute>> | undefined;
    let method: string;

    if (embeddingCount <= 500) {
      // Direct cosine distance for small sets - fast and accurate
      method = "direct_cos";
      result = await this.client.execute({
        sql: `SELECT id, content, metadata, vector_distance_cos(embedding, vector32(?)) as distance
            FROM embeddings WHERE project_hash = ? AND branch_name = ?
            ORDER BY distance ASC LIMIT ?`,
        args: [vectorStr, projectHash, branchName, limit],
      });
    } else {
      // Try partial index first (fastest), fallback to global index
      let partialIndexName = await this.getProjectIndexName();

      // Auto-create partial index if missing
      if (!partialIndexName) {
        logger.info("VECTOR_SEARCH", `Creating partial index for project`, { projectHash, embeddings: embeddingCount });
        await this.ensureProjectVectorIndex();
        partialIndexName = await this.getProjectIndexName();
      }

      if (partialIndexName) {
        method = "partial_diskann";
        result = await this.client.execute({
          sql: `SELECT t.id, t.content, t.metadata
              FROM vector_top_k('${partialIndexName}', vector32(?), ?) AS v
              JOIN embeddings t ON t.rowid = v.id`,
          args: [vectorStr, limit],
        });
      } else {
        // Global index with post-filter (slowest, avoid if possible)
        method = "global_diskann";
        result = await this.client.execute({
          sql: `SELECT t.id, t.content, t.metadata
              FROM vector_top_k('idx_embeddings_vector', vector32(?), ?) AS v
              JOIN embeddings t ON t.rowid = v.id
              WHERE t.project_hash = ? AND t.branch_name = ?`,
          args: [vectorStr, limit * 20, projectHash, branchName],
        });
      }
    }
    const queryTime = Date.now() - startQuery;

    const results = this.processVectorResults(result, limit);

    // Cache results for repeated queries
    this.searchCache.set(cacheKey, results);

    logger.info("VECTOR_SEARCH", `searchVectors`, {
      queryMs: queryTime,
      totalMs: Date.now() - startTotal,
      embeddings: embeddingCount,
      results: results.length,
      method,
    });

    return results;
  }

  async getEmbedding(id: string): Promise<VectorEmbedding | null> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    // Check embedding cache first
    const cacheKey = `${projectHash}:${branchName}:${id}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.client.execute({
      sql: `
        SELECT id, content, vector_extract(embedding) as vector, metadata, created_at
        FROM embeddings
        WHERE id = ? AND project_hash = ? AND branch_name = ?
      `,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length === 0 || !result.rows[0]) return null;
    const row = result.rows[0];

    // Decode metadata using CBOR (with fallback to JSON)
    const metadataRaw = row["metadata"];
    const metadata = metadataRaw ? this.decodeMetadata(metadataRaw as Buffer | string) : undefined;

    const embedding: VectorEmbedding = {
      id: row["id"] as string,
      content: row["content"] as string,
      vector: this.stringToVector(row["vector"] as string),
      metadata,
      createdAt: row["created_at"] as number,
    };

    // Cache for future access
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  async deleteEmbedding(id: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    await this.client.execute({
      sql: "DELETE FROM embeddings WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });

    // Invalidate caches
    const cacheKey = `${projectHash}:${branchName}:${id}`;
    this.embeddingCache.delete(cacheKey);
    this.invalidateSearchCache(projectHash, branchName);
  }

  async getEmbeddingCount(): Promise<number> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const result = await this.client.execute({
      sql: "SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });

    return (result.rows[0]?.cnt as number) || 0;
  }

  // ===========================================================================
  // METADATA OPERATIONS
  // ===========================================================================

  async updateProjectMetadata(projectPath: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    // Count entities and files
    const entityCount = await this.client.execute({
      sql: "SELECT COUNT(*) as count FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });
    const fileCount = await this.client.execute({
      sql: "SELECT COUNT(*) as count FROM files WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO project_metadata
        (project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        projectHash,
        branchName,
        projectPath,
        now,
        (entityCount.rows[0]?.count as number) || 0,
        (fileCount.rows[0]?.count as number) || 0,
        now,
        now,
      ],
    });
  }

  async listProjects(): Promise<
    Array<{
      projectHash: string;
      branchName: string;
      projectPath: string;
      lastIndexedAt: number;
      entityCount: number;
      fileCount: number;
    }>
  > {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute(`
      SELECT project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count
      FROM project_metadata
      ORDER BY updated_at DESC
    `);

    return result.rows.map((r) => ({
      projectHash: r.project_hash as string,
      branchName: r.branch_name as string,
      projectPath: r.project_path as string,
      lastIndexedAt: r.last_indexed_at as number,
      entityCount: r.entity_count as number,
      fileCount: r.file_count as number,
    }));
  }

  async listBranches(): Promise<string[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash } = this.currentContext;
    const result = await this.client.execute({
      sql: `
        SELECT DISTINCT branch_name FROM project_metadata
        WHERE project_hash = ?
        ORDER BY branch_name
      `,
      args: [projectHash],
    });

    return result.rows.map((r) => r.branch_name as string);
  }

  // ===========================================================================
  // METRICS & STATS
  // ===========================================================================

  async getStats(): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    const [entities, relationships, files, embeddings] = await Promise.all([
      this.client.execute({
        sql: "SELECT COUNT(*) as cnt FROM entities WHERE project_hash = ? AND branch_name = ?",
        args: [projectHash, branchName],
      }),
      this.client.execute({
        sql: "SELECT COUNT(*) as cnt FROM relationships WHERE project_hash = ? AND branch_name = ?",
        args: [projectHash, branchName],
      }),
      this.client.execute({
        sql: "SELECT COUNT(*) as cnt FROM files WHERE project_hash = ? AND branch_name = ?",
        args: [projectHash, branchName],
      }),
      this.client.execute({
        sql: "SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ?",
        args: [projectHash, branchName],
      }),
    ]);

    return {
      totalEntities: (entities.rows[0]?.cnt as number) || 0,
      totalRelationships: (relationships.rows[0]?.cnt as number) || 0,
      totalFiles: (files.rows[0]?.cnt as number) || 0,
      totalEmbeddings: (embeddings.rows[0]?.cnt as number) || 0,
    };
  }

  async getTotalStats(): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const [entities, relationships, files, embeddings] = await Promise.all([
      this.client.execute("SELECT COUNT(*) as cnt FROM entities"),
      this.client.execute("SELECT COUNT(*) as cnt FROM relationships"),
      this.client.execute("SELECT COUNT(*) as cnt FROM files"),
      this.client.execute("SELECT COUNT(*) as cnt FROM embeddings"),
    ]);

    return {
      totalEntities: (entities.rows[0]?.cnt as number) || 0,
      totalRelationships: (relationships.rows[0]?.cnt as number) || 0,
      totalFiles: (files.rows[0]?.cnt as number) || 0,
      totalEmbeddings: (embeddings.rows[0]?.cnt as number) || 0,
    };
  }

  // ===========================================================================
  // CLEAR OPERATIONS
  // ===========================================================================

  async clear(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    await this.client.batch(
      [
        { sql: "DELETE FROM embeddings WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        {
          sql: "DELETE FROM relationships WHERE project_hash = ? AND branch_name = ?",
          args: [projectHash, branchName],
        },
        { sql: "DELETE FROM entities WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        { sql: "DELETE FROM files WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        { sql: "DELETE FROM query_cache WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        {
          sql: "DELETE FROM project_metadata WHERE project_hash = ? AND branch_name = ?",
          args: [projectHash, branchName],
        },
      ],
      "write",
    );

    console.error(`[LibSQLGraphAdapter] Cleared data for ${projectHash}/${branchName}`);
  }

  async clearAll(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.batch(
      [
        { sql: "DELETE FROM embeddings", args: [] },
        { sql: "DELETE FROM relationships", args: [] },
        { sql: "DELETE FROM entities", args: [] },
        { sql: "DELETE FROM files", args: [] },
        { sql: "DELETE FROM query_cache", args: [] },
        { sql: "DELETE FROM project_metadata", args: [] },
      ],
      "write",
    );

    console.error(`[LibSQLGraphAdapter] Cleared ALL data`);
  }

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

  // parseMetadata removed - using decodeMetadata instead (CBOR-based)

  private processVectorResults(result: ResultSet, limit: number): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const row of result.rows) {
      const position = results.length;
      const estimatedSimilarity = Math.max(0.1, 1 - position * 0.05);

      // Use CBOR decoding with JSON fallback
      const metadata = row.metadata ? this.decodeMetadata(row.metadata as Buffer | string) : undefined;

      results.push({
        id: row.id as string,
        content: row.content as string,
        similarity: estimatedSimilarity,
        metadata,
      });

      if (results.length >= limit) break;
    }

    return results;
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
