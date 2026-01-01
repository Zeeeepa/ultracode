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
  searchL?: number | undefined;
  // DiskANN insert list size (higher = better quality, slower build)
  insertL?: number | undefined;
  // DiskANN max neighbors (lower = smaller index, less memory)
  maxNeighbors?: number;
}

const DEFAULT_CONFIG: Required<LibSQLGraphConfig> = {
  dimensions: 384,
  metric: "cosine",
  compression: "float8", // 40-50% less memory than float32
  searchL: 150,
  insertL: 30, // Reduced for lower memory peak during batch inserts
  maxNeighbors: 12, // Reduced from 24 to lower DiskANN disk footprint (~12KB per neighbor, ~3x data overhead)
};

// =============================================================================
// MULTI-DIMENSION SUPPORT
// =============================================================================

/** Supported embedding dimensions (maps to column names) */
export const SUPPORTED_DIMENSIONS = [384, 768, 1024, 4096] as const;
export type SupportedDimension = (typeof SUPPORTED_DIMENSIONS)[number];

/**
 * Get the embedding column name for a given dimension.
 * Throws if dimension is not supported.
 */
export function getEmbeddingColumn(dimensions: number): string {
  if (!SUPPORTED_DIMENSIONS.includes(dimensions as SupportedDimension)) {
    throw new Error(`Unsupported embedding dimension: ${dimensions}. Supported: ${SUPPORTED_DIMENSIONS.join(", ")}`);
  }
  return `embedding_${dimensions}`;
}

/**
 * Normalize dimensions to nearest supported value (rounds up).
 * E.g., 512 → 768, 900 → 1024
 */
export function normalizeToSupportedDimension(dimensions: number): SupportedDimension {
  for (const supported of SUPPORTED_DIMENSIONS) {
    if (dimensions <= supported) return supported;
  }
  return 4096; // Max supported
}

// =============================================================================
// PROJECT CONTEXT
// =============================================================================

export interface ProjectContext {
  projectHash: string;
  branchName: string;
  /** Embedding dimensions for this project (default: from global config) */
  dimensions?: SupportedDimension;
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
// DATABASE CORRUPTION ERROR
// =============================================================================

/**
 * Special error class for database corruption.
 * When thrown, callers should trigger database recreation.
 */
export class DatabaseCorruptionError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(`DATABASE_CORRUPT: ${message}`);
    this.name = "DatabaseCorruptionError";
  }
}

/**
 * Check if an error indicates database corruption
 */
function isCorruptionError(error: unknown): boolean {
  const msg = (error as Error)?.message || String(error);
  return (
    msg.includes("SQLITE_CORRUPT") ||
    msg.includes("database disk image is malformed") ||
    msg.includes("file is not a database") ||
    msg.includes("database or disk is full")
  );
}

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

  /**
   * Release memory by shrinking cache and running VACUUM.
   * Call after heavy operations to free up memory.
   */
  async releaseMemory(): Promise<void> {
    if (!this.client) return;

    try {
      // Shrink cache to minimum
      await this.client.execute("PRAGMA shrink_memory");
      // Clear query cache
      this.searchCache.clear();
      this.embeddingCache.clear();

      logger.info("LIBSQL_MEMORY", "Memory released", {
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    } catch (error) {
      logger.debug("LIBSQL_MEMORY", "Failed to release memory", { error: (error as Error).message });
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

  private async getProjectIndexName(): Promise<string | null> {
    if (!this.client) return null;
    const dims = this.getEffectiveDimensions();
    const indexName = `idx_emb_${dims}_${this.currentContext.projectHash.substring(0, 8)}`;
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
         created_at, updated_at, complexity_score, language, size_bytes, embedding_base64, embedding_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        entity.embeddingBase64 || null,
        entity.embeddingText || null,
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

    // OPTIMIZATION: Multi-row INSERT - single SQL statement with multiple VALUES
    // Much faster than N separate INSERT statements (reduces parsing overhead)
    // SQLite limit: ~32767 params, 16 fields per entity → batch 500 = 8000 params (safe)
    const batchSize = 500;

    let processed = 0;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);

      // Build multi-row VALUES clause
      const valuePlaceholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      // Flatten all args into single array
      const args: (string | number | null)[] = [];
      for (const entity of batch) {
        args.push(
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
          entity.embeddingBase64 || null,
          entity.embeddingText || null,
        );
      }

      const sql = `
        INSERT OR REPLACE INTO entities
        (id, project_hash, branch_name, name, type, file_path, location, metadata, hash,
         created_at, updated_at, complexity_score, language, size_bytes, embedding_base64, embedding_text)
        VALUES ${valuePlaceholders}
      `;

      try {
        await this.client.execute({ sql, args });
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
    namePattern?: string | undefined;
    types?: EntityType[] | undefined;
    filePath?: string | undefined;
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

  /**
   * Search entities by directory path (LIKE pattern)
   */
  async searchEntitiesInDirectory(directoryPath: string): Promise<Entity[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    // Normalize path separators for cross-platform search
    const forwardPath = directoryPath.replace(/\\/g, "/");
    const backPath = directoryPath.replace(/\//g, "\\");

    const sql = `
      SELECT * FROM entities
      WHERE project_hash = ? AND branch_name = ?
      AND (file_path LIKE ? OR file_path LIKE ?)
    `;
    const args = [projectHash, branchName, `${forwardPath}%`, `${backPath}%`];

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

    // OPTIMIZATION: Multi-row INSERT - single SQL statement with multiple VALUES
    // Much faster than N separate INSERT statements (reduces parsing overhead)
    // SQLite limit: ~32767 params, 9 fields per rel → batch 1000 = 9000 params (safe)
    const batchSize = 1000;

    let processed = 0;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);

      // Build multi-row VALUES clause
      const valuePlaceholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      // Flatten all args into single array
      const args: (string | number | null)[] = [];
      for (const r of batch) {
        args.push(
          r.id,
          projectHash,
          branchName,
          r.fromId,
          r.toId,
          r.type,
          r.metadata ? JSON.stringify(r.metadata) : null,
          r.weight ?? 1.0,
          r.createdAt ?? now,
        );
      }

      const sql = `
        INSERT OR REPLACE INTO relationships
        (id, project_hash, branch_name, from_id, to_id, type, metadata, weight, created_at)
        VALUES ${valuePlaceholders}
      `;

      try {
        await this.client.execute({ sql, args });
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
      path: row["path"] as string,
      hash: row["hash"] as string,
      lastIndexed: row["last_indexed"] as number,
      entityCount: row["entity_count"] as number,
    }));
  }

  // ===========================================================================
  // VECTOR OPERATIONS (DEPRECATED - Use FaissProvider instead)
  // These methods remain for backwards compatibility but VectorStore v5
  // now uses FaissProvider directly for all vector operations.
  // ===========================================================================

  /**
   * @deprecated Use FaissProvider.add() instead. VectorStore v5 uses Faiss directly.
   */
  async insertEmbedding(embedding: VectorEmbedding): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = this.getEmbeddingColumnName();
    const vectorStr = this.vectorToString(embedding.vector);

    // Use CBOR for metadata serialization
    const metadataBlob = this.encodeMetadata(embedding.metadata);

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        embedding.id,
        projectHash,
        branchName,
        embedding.content,
        dims,
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

  /**
   * @deprecated Use FaissProvider.addBatch() instead. VectorStore v5 uses Faiss directly.
   */
  async insertEmbeddingBatch(embeddings: VectorEmbedding[]): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    if (embeddings.length === 0) return;

    const { projectHash, branchName } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = this.getEmbeddingColumnName();
    const now = Date.now();

    // Prepare statements with CBOR metadata and dimension-specific column
    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        dims,
        this.vectorToString(e.vector),
        this.encodeMetadata(e.metadata),
        e.createdAt || now,
      ],
    }));

    // Optimized batch size: 500 for parallel embedding inserts
    // Balance between round-trips and memory usage
    const batchSize = 500;
    const chunks: InStatement[][] = [];
    for (let i = 0; i < statements.length; i += batchSize) {
      chunks.push(statements.slice(i, i + batchSize));
    }

    let totalInserted = 0;

    // Process all chunks in parallel for better throughput
    // libsql handles concurrent writes safely with WAL mode
    const batchPromises = chunks.map(async (batch, index) => {
      if (!batch || batch.length === 0) return 0;
      try {
        await this.client!.batch(batch, "write");
        return batch.length;
      } catch (error) {
        logger.error("EMBEDDING_INSERT", `Batch ${index} failed`, { error: (error as Error).message });
        throw error;
      }
    });

    const results = await Promise.all(batchPromises);
    totalInserted = results.reduce((sum, count) => sum + count, 0);

    // Update embedding cache
    for (const e of embeddings) {
      const cacheKey = `${projectHash}:${branchName}:${e.id}`;
      this.embeddingCache.set(cacheKey, e);
    }

    // Invalidate search cache
    this.invalidateSearchCache(projectHash, branchName);

    // PRAGMA optimize only after very large batches (500+) to avoid overhead
    // This improves query planning without slowing down small inserts
    if (totalInserted >= 500) {
      try {
        await this.client.execute("PRAGMA optimize");
      } catch {
        // Ignore PRAGMA errors
      }
    }

    // WAL checkpoint only after very large batches (500+)
    // Frequent checkpoints were causing 8-12s delays on large batches
    if (totalInserted >= 500) {
      try {
        await this.client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        // Ignore checkpoint errors (might not be in WAL mode)
      }
    }
  }

  /**
   * @deprecated Faiss HNSW handles live updates, no need to drop/rebuild.
   * Drop project-specific vector index for faster bulk inserts
   */
  async dropVectorIndex(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const partialIndexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;
    const start = Date.now();
    logger.trace("LIBSQL_INDEX", `▶ dropVectorIndex START`, { indexName: partialIndexName, projectHash, dims });

    // Drop project partial index only (no global index anymore)
    try {
      await this.client.execute(`DROP INDEX IF EXISTS ${partialIndexName}`);
      logger.trace("LIBSQL_INDEX", `◀ dropVectorIndex END`, { indexName: partialIndexName, ms: Date.now() - start });
      logger.info("LIBSQL_INDEX", `Dropped project vector index`, {
        indexName: partialIndexName,
        projectHash,
        dims,
        ms: Date.now() - start,
      });
    } catch (error) {
      logger.warn("LIBSQL_INDEX", `Failed to drop project vector index`, {
        indexName: partialIndexName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * @deprecated Faiss HNSW maintains index automatically, no rebuild needed.
   * Rebuild vector index for current project (partial index) after bulk inserts
   */
  async rebuildVectorIndex(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    const { projectHash } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = this.getEmbeddingColumnName();
    const indexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;
    const start = Date.now();
    logger.warn("LIBSQL_INDEX", `[REBUILD] START`, { indexName, projectHash, dims });
    logger.trace("LIBSQL_INDEX", `▶ rebuildVectorIndex START`, { indexName, projectHash, dims });

    const indexParams = [
      `'metric=${this.config.metric}'`,
      `'compress_neighbors=${this.config.compression}'`,
      `'max_neighbors=${this.config.maxNeighbors}'`,
      `'search_l=${this.config.searchL}'`,
      `'insert_l=${this.config.insertL}'`,
    ].join(", ");

    try {
      await this.client.execute(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON embeddings(libsql_vector_idx(${colName}, ${indexParams}))
        WHERE project_hash = '${projectHash}' AND dim_size = ${dims}
      `);
      const elapsed = Date.now() - start;
      logger.warn("LIBSQL_INDEX", `[REBUILD] END`, { indexName, dims, ms: elapsed });
      logger.trace("LIBSQL_INDEX", `◀ rebuildVectorIndex END`, { indexName, ms: elapsed });
      logger.info("LIBSQL_INDEX", `Rebuilt project vector index`, { indexName, projectHash, dims, ms: elapsed });
    } catch (error) {
      logger.trace("LIBSQL_INDEX", `◀ rebuildVectorIndex FAILED`, { indexName, error: (error as Error).message });
      logger.warn("LIBSQL_INDEX", `Failed to rebuild project vector index`, {
        indexName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * @deprecated Use FaissProvider.addBatch() instead. VectorStore v5 uses Faiss directly.
   * Bulk insert embeddings with index drop/rebuild for maximum performance
   */
  async bulkInsertEmbeddings(embeddings: VectorEmbedding[]): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");
    if (embeddings.length === 0) return;

    const start = Date.now();
    logger.trace("LIBSQL_BULK", `▶ bulkInsertEmbeddings START`, { count: embeddings.length });
    logger.info("LIBSQL_BULK", `Starting bulk insert`, { count: embeddings.length });

    // Drop index for faster inserts
    await this.dropVectorIndex();

    const { projectHash, branchName } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = this.getEmbeddingColumnName();
    const now = Date.now();

    // Prepare all statements with dimension-specific column
    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        dims,
        this.vectorToString(e.vector),
        this.encodeMetadata(e.metadata),
        e.createdAt || now,
      ],
    }));

    // Large batch size since no index updates during insert
    const batchSize = 500;
    const totalBatches = Math.ceil(statements.length / batchSize);
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      logger.trace("LIBSQL_BULK", `  batch ${batchNum}/${totalBatches}`, { size: batch.length });
      await this.client.batch(batch, "write");
    }

    // Update cache
    for (const e of embeddings) {
      const cacheKey = `${projectHash}:${branchName}:${e.id}`;
      this.embeddingCache.set(cacheKey, e);
    }

    // Rebuild index
    await this.rebuildVectorIndex();

    this.invalidateSearchCache(projectHash, branchName);
    logger.trace("LIBSQL_BULK", `◀ bulkInsertEmbeddings END`, { count: embeddings.length, ms: Date.now() - start });
    logger.info("LIBSQL_BULK", `Bulk insert complete`, { count: embeddings.length, ms: Date.now() - start });
  }

  /**
   * Invalidate search cache for a specific project/branch
   */
  private invalidateSearchCache(_projectHash: string, _branchName: string): void {
    // LRU cache doesn't support prefix deletion, but we can clear entries on access
    // For now, just clear all search cache when data changes (simple approach)
    this.searchCache.clear();
  }

  /**
   * @deprecated Use FaissProvider.search() instead. VectorStore v5 uses Faiss directly.
   */
  async searchVectors(queryVector: Float32Array, limit: number): Promise<SimilarityResult[]> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const dims = this.getEffectiveDimensions();
    const colName = this.getEmbeddingColumnName();
    const vectorStr = this.vectorToString(queryVector);

    // Check search cache first (use first 16 floats as key for speed)
    const cacheKey = `${projectHash}:${branchName}:${dims}:${limit}:${Array.from(queryVector.slice(0, 16)).join(",")}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check embedding count for this project and dimension
    const countResult = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ? AND dim_size = ?`,
      args: [projectHash, branchName, dims],
    });
    const embeddingCount = (countResult.rows[0]?.["cnt"] as number) || 0;

    if (embeddingCount === 0) {
      return [];
    }

    let result: Awaited<ReturnType<typeof this.client.execute>> | undefined;

    if (embeddingCount <= 500) {
      // Direct cosine distance for small sets - fast and accurate
      result = await this.client.execute({
        sql: `SELECT id, content, metadata, vector_distance_cos(${colName}, vector32(?)) as distance
            FROM embeddings WHERE project_hash = ? AND branch_name = ? AND dim_size = ?
            ORDER BY distance ASC LIMIT ?`,
        args: [vectorStr, projectHash, branchName, dims, limit],
      });
    } else {
      // Use project-specific partial index for fast ANN search
      let partialIndexName = await this.getProjectIndexName();

      // Auto-create partial index if missing
      if (!partialIndexName) {
        await this.ensureProjectVectorIndex();
        partialIndexName = await this.getProjectIndexName();
      }

      if (!partialIndexName) {
        throw new Error(
          `Vector index not available for project ${projectHash}. Ensure embeddings are generated first.`,
        );
      }

      result = await this.client.execute({
        sql: `SELECT t.id, t.content, t.metadata
            FROM vector_top_k('${partialIndexName}', vector32(?), ?) AS v
            JOIN embeddings t ON t.rowid = v.id`,
        args: [vectorStr, limit],
      });
    }

    const results = this.processVectorResults(result, limit);

    // Cache results for repeated queries
    this.searchCache.set(cacheKey, results);

    return results;
  }

  /**
   * @deprecated Use FaissProvider.getContent() instead. VectorStore v5 uses Faiss directly.
   */
  async getEmbedding(id: string): Promise<VectorEmbedding | null> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const colName = this.getEmbeddingColumnName();

    // Check embedding cache first
    const cacheKey = `${projectHash}:${branchName}:${id}`;
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.client.execute({
      sql: `
        SELECT id, content, vector_extract(${colName}) as vector, metadata, created_at
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

  /**
   * @deprecated Use FaissProvider.remove() instead. VectorStore v5 uses Faiss directly.
   */
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

  /**
   * @deprecated Use FaissProvider.getVectorCount() instead. VectorStore v5 uses Faiss directly.
   */
  async getEmbeddingCount(): Promise<number> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    logger.trace("LIBSQL", "[getEmbeddingCount] Executing SQL...", { projectHash, branchName });
    const result = await this.client.execute({
      sql: "SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });
    logger.trace("LIBSQL", "[getEmbeddingCount] SQL done", { rowCount: result.rows.length });

    return (result.rows[0]?.["cnt"] as number) || 0;
  }

  /**
   * @deprecated Use FaissProvider.getExistingIds() instead. VectorStore v5 uses Faiss directly.
   * Batch check which embedding IDs already exist
   */
  async getExistingEmbeddingIds(ids: string[]): Promise<Set<string>> {
    if (!this.client) throw new Error("Client not initialized");
    if (ids.length === 0) return new Set();

    const { projectHash, branchName } = this.currentContext;
    // Debug: log context to diagnose mismatch
    if (ids.length > 0 && ids.length <= 100) {
      logger.trace("LIBSQL", `getExistingEmbeddingIds context`, { projectHash, branchName, idsCount: ids.length });
    }
    const existingIds = new Set<string>();

    // First check cache
    const uncachedIds: string[] = [];
    for (const id of ids) {
      const cacheKey = `${projectHash}:${branchName}:${id}`;
      if (this.embeddingCache.has(cacheKey)) {
        existingIds.add(id);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      return existingIds;
    }

    // Query in batches of 500 to avoid SQL limits
    const batchSize = 500;
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(",");

      try {
        const result = await this.client.execute({
          sql: `
            SELECT id FROM embeddings
            WHERE id IN (${placeholders})
            AND project_hash = ? AND branch_name = ?
          `,
          args: [...batch, projectHash, branchName],
        });

        // Debug: log SQL result for first batch
        if (i === 0 && batch.length > 0) {
          logger.trace("LIBSQL", `getExistingEmbeddingIds SQL result`, {
            queriedIds: batch.slice(0, 3),
            foundCount: result.rows.length,
            foundIds: result.rows.slice(0, 3).map((r) => r["id"]),
          });
        }

        for (const row of result.rows) {
          existingIds.add(row["id"] as string);
        }
      } catch (error) {
        // Re-throw corruption errors to prevent silent duplicate generation
        if (isCorruptionError(error)) {
          throw new DatabaseCorruptionError("Database corruption detected during embedding ID check", error as Error);
        }
        throw error;
      }
    }

    return existingIds;
  }

  // ===========================================================================
  // EMBEDDING CACHE OPERATIONS (global cache by content hash)
  // ===========================================================================

  /**
   * Get cached embedding by content hash.
   * Returns null if not found.
   */
  async getEmbeddingFromCache(contentHash: string): Promise<Float32Array | null> {
    if (!this.client) return null;

    try {
      const result = await this.client.execute({
        sql: `SELECT embedding FROM embedding_cache WHERE content_hash = ?`,
        args: [contentHash],
      });

      if (result.rows.length === 0) return null;

      // Update last_used_at and hit_count for LRU tracking
      await this.client.execute({
        sql: `UPDATE embedding_cache SET last_used_at = ?, hit_count = hit_count + 1 WHERE content_hash = ?`,
        args: [Date.now(), contentHash],
      });

      const row = result.rows[0];
      if (!row?.["embedding"]) return null;
      const embeddingBlob = row["embedding"] as ArrayBuffer;
      return new Float32Array(embeddingBlob);
    } catch {
      return null;
    }
  }

  /**
   * Get multiple cached embeddings by content hashes.
   * Returns Map of contentHash -> Float32Array for found entries.
   */
  async getEmbeddingsFromCache(contentHashes: string[]): Promise<Map<string, Float32Array>> {
    if (!this.client || contentHashes.length === 0) return new Map();

    const result = new Map<string, Float32Array>();
    const now = Date.now();

    try {
      // Batch query for efficiency
      const placeholders = contentHashes.map(() => "?").join(",");
      const queryResult = await this.client.execute({
        sql: `SELECT content_hash, embedding FROM embedding_cache WHERE content_hash IN (${placeholders})`,
        args: contentHashes,
      });

      const foundHashes: string[] = [];
      for (const row of queryResult.rows) {
        const hash = row["content_hash"] as string;
        const embeddingBlob = row["embedding"] as ArrayBuffer;
        result.set(hash, new Float32Array(embeddingBlob));
        foundHashes.push(hash);
      }

      // Batch update last_used_at for LRU
      if (foundHashes.length > 0) {
        const updatePlaceholders = foundHashes.map(() => "?").join(",");
        await this.client.execute({
          sql: `UPDATE embedding_cache SET last_used_at = ?, hit_count = hit_count + 1 WHERE content_hash IN (${updatePlaceholders})`,
          args: [now, ...foundHashes],
        });
      }
    } catch {
      // Ignore cache errors
    }

    return result;
  }

  /**
   * Store embedding in cache by content hash.
   */
  async setEmbeddingInCache(
    contentHash: string,
    model: string,
    embedding: Float32Array,
    textPreview?: string | undefined,
  ): Promise<void> {
    if (!this.client) return;

    const now = Date.now();
    try {
      const vectorStr = this.vectorToString(embedding);
      await this.client.execute({
        sql: `INSERT OR REPLACE INTO embedding_cache
              (content_hash, model, embedding, text_preview, hit_count, created_at, last_used_at)
              VALUES (?, ?, vector32(?), ?, 0, ?, ?)`,
        args: [contentHash, model, vectorStr, textPreview?.slice(0, 100) ?? null, now, now],
      });
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Store multiple embeddings in cache (batch operation).
   */
  async setEmbeddingsInCache(
    entries: Array<{ contentHash: string; model: string; embedding: Float32Array; textPreview?: string }>,
  ): Promise<void> {
    if (!this.client || entries.length === 0) return;

    const now = Date.now();
    try {
      const statements = entries.map((entry) => ({
        sql: `INSERT OR REPLACE INTO embedding_cache
              (content_hash, model, embedding, text_preview, hit_count, created_at, last_used_at)
              VALUES (?, ?, vector32(?), ?, 0, ?, ?)`,
        args: [
          entry.contentHash,
          entry.model,
          this.vectorToString(entry.embedding),
          entry.textPreview?.slice(0, 100) ?? null,
          now,
          now,
        ],
      }));

      await this.client.batch(statements as any, "write");
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Get cache statistics.
   */
  async getEmbeddingCacheStats(): Promise<{ total: number; hitRate: number; oldestMs: number }> {
    if (!this.client) return { total: 0, hitRate: 0, oldestMs: 0 };

    try {
      const result = await this.client.execute(`
        SELECT
          COUNT(*) as total,
          SUM(hit_count) as total_hits,
          MIN(last_used_at) as oldest
        FROM embedding_cache
      `);

      const row = result.rows[0];
      const total = Number(row?.["total"] ?? 0);
      const totalHits = Number(row?.["total_hits"] ?? 0);
      const oldest = Number(row?.["oldest"] ?? Date.now());

      return {
        total,
        hitRate: total > 0 ? totalHits / total : 0,
        oldestMs: Date.now() - oldest,
      };
    } catch {
      return { total: 0, hitRate: 0, oldestMs: 0 };
    }
  }

  /**
   * Evict old entries from cache using LRU strategy.
   * Keeps maxEntries most recently used entries.
   */
  async evictEmbeddingCache(maxEntries = 100000): Promise<number> {
    if (!this.client) return 0;

    try {
      const countResult = await this.client.execute(`SELECT COUNT(*) as count FROM embedding_cache`);
      const total = Number(countResult.rows[0]?.["count"] ?? 0);

      if (total <= maxEntries) return 0;

      const toDelete = total - maxEntries;

      // Delete oldest entries by last_used_at
      await this.client.execute({
        sql: `DELETE FROM embedding_cache WHERE content_hash IN (
          SELECT content_hash FROM embedding_cache ORDER BY last_used_at ASC LIMIT ?
        )`,
        args: [toDelete],
      });

      return toDelete;
    } catch {
      return 0;
    }
  }

  // ===========================================================================
  // METADATA OPERATIONS
  // ===========================================================================

  async updateProjectMetadata(projectPath: string, isFullIndex = false): Promise<void> {
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

    // Get existing tracking data to preserve it (or reset if full index)
    const existing = await this.client.execute({
      sql: `SELECT last_full_index_at, incremental_changes_count, created_at
            FROM project_metadata WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });

    const existingRow = existing.rows[0];
    const createdAt = (existingRow?.["created_at"] as number) || now;

    // On full index: reset counter and update last_full_index_at
    // On incremental: preserve existing values
    const lastFullIndexAt = isFullIndex ? now : (existingRow?.["last_full_index_at"] as number) || 0;
    const incrementalChangesCount = isFullIndex ? 0 : (existingRow?.["incremental_changes_count"] as number) || 0;

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO project_metadata
        (project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count,
         created_at, updated_at, last_full_index_at, incremental_changes_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        projectHash,
        branchName,
        projectPath,
        now,
        (entityCount.rows[0]?.["count"] as number) || 0,
        (fileCount.rows[0]?.["count"] as number) || 0,
        createdAt,
        now,
        lastFullIndexAt,
        incrementalChangesCount,
      ],
    });
  }

  /**
   * Get incremental tracking info for the current project/branch
   */
  async getIncrementalTrackingInfo(): Promise<{
    lastFullIndexAt: number;
    incrementalChangesCount: number;
    totalFiles: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    const result = await this.client.execute({
      sql: `SELECT last_full_index_at, incremental_changes_count, file_count
            FROM project_metadata WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });

    if (result.rows.length === 0) {
      return { lastFullIndexAt: 0, incrementalChangesCount: 0, totalFiles: 0 };
    }

    const row = result.rows[0]!;
    return {
      lastFullIndexAt: (row["last_full_index_at"] as number) || 0,
      incrementalChangesCount: (row["incremental_changes_count"] as number) || 0,
      totalFiles: (row["file_count"] as number) || 0,
    };
  }

  /**
   * Record incremental file changes (called after each incremental update)
   * @param changedFileCount Number of files changed in this update
   */
  async recordIncrementalChanges(changedFileCount: number): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;

    await this.client.execute({
      sql: `UPDATE project_metadata
            SET incremental_changes_count = incremental_changes_count + ?,
                updated_at = ?
            WHERE project_hash = ? AND branch_name = ?`,
      args: [changedFileCount, Date.now(), projectHash, branchName],
    });
  }

  /**
   * Reset incremental tracking (called after full index)
   */
  async resetIncrementalTracking(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    await this.client.execute({
      sql: `UPDATE project_metadata
            SET last_full_index_at = ?,
                incremental_changes_count = 0,
                updated_at = ?
            WHERE project_hash = ? AND branch_name = ?`,
      args: [now, now, projectHash, branchName],
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
      projectHash: r["project_hash"] as string,
      branchName: r["branch_name"] as string,
      projectPath: r["project_path"] as string,
      lastIndexedAt: r["last_indexed_at"] as number,
      entityCount: r["entity_count"] as number,
      fileCount: r["file_count"] as number,
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

    return result.rows.map((r) => r["branch_name"] as string);
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
      totalEntities: (entities.rows[0]?.["cnt"] as number) || 0,
      totalRelationships: (relationships.rows[0]?.["cnt"] as number) || 0,
      totalFiles: (files.rows[0]?.["cnt"] as number) || 0,
      totalEmbeddings: (embeddings.rows[0]?.["cnt"] as number) || 0,
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
      totalEntities: (entities.rows[0]?.["cnt"] as number) || 0,
      totalRelationships: (relationships.rows[0]?.["cnt"] as number) || 0,
      totalFiles: (files.rows[0]?.["cnt"] as number) || 0,
      totalEmbeddings: (embeddings.rows[0]?.["cnt"] as number) || 0,
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

  // parseMetadata removed - using decodeMetadata instead (CBOR-based)

  private processVectorResults(result: ResultSet, limit: number): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const row of result.rows) {
      const position = results.length;
      const estimatedSimilarity = Math.max(0.1, 1 - position * 0.05);

      // Use CBOR decoding with JSON fallback
      const metadata = row["metadata"] ? this.decodeMetadata(row["metadata"] as Buffer | string) : undefined;

      results.push({
        id: row["id"] as string,
        content: row["content"] as string,
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
