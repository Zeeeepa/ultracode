/**
 * TASK-001: SQLite Manager with Optimized Configuration
 *
 * Manages SQLite database connections with optimizations for commodity hardware.
 * Implements recommended PRAGMA settings for performance on 4-core CPU, 8GB RAM systems.
 *
 * External Dependencies:
 * - better-sqlite3 (Node.js): https://github.com/WiseLibs/better-sqlite3 - Fast synchronous SQLite3 bindings
 * - bun:sqlite (Bun): Built-in SQLite module for Bun runtime
 * - sqlite-adapter: Unified API for both runtimes
 *
 * Architecture References:
 * - Storage Types: src/types/storage.ts
 * - Agent Types: src/types/agent.ts
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DATABASE_CONSTANTS } from "../config/constants.js";
import { getCurrentIndexingDirectory } from "../shared/indexing-context.js";
import { getProjectPaths } from "../shared/storage-paths.js";
import type { StorageMetrics } from "../types/storage.js";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import type { SQLiteDatabase } from "./sqlite-adapter.js";
import { isBunRuntime, loadSQLiteModule } from "./sqlite-adapter.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================

/**
 * Get default database path based on current project context.
 * Uses centralized storage in AppData if project path is available.
 */
function getDefaultDbPath(): string {
  const indexingDir = getCurrentIndexingDirectory();
  const cwd = process.cwd();
  const projectPath = indexingDir || cwd;
  const paths = getProjectPaths(projectPath);
  console.error(
    `[SQLiteManager] getDefaultDbPath: indexingDir=${indexingDir}, cwd=${cwd}, resolved=${projectPath}, dbPath=${paths.graphDbPath}`,
  );
  return paths.graphDbPath;
}
const WAL_AUTOCHECKPOINT = DATABASE_CONSTANTS.WAL_AUTOCHECKPOINT;
const CACHE_SIZE_KB = DATABASE_CONSTANTS.CACHE_SIZE_KB;
const MMAP_SIZE = DATABASE_CONSTANTS.MMAP_SIZE;
const PAGE_SIZE = DATABASE_CONSTANTS.PAGE_SIZE;
const BUSY_TIMEOUT = DATABASE_CONSTANTS.BUSY_TIMEOUT;

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================

export interface SQLiteConfig {
  path?: string;
  readonly?: boolean;
  memory?: boolean;
  verbose?: boolean;
  timeout?: number;
}

export interface DatabaseInfo {
  version: string;
  pageSize: number;
  pageCount: number;
  sizeBytes: number;
  journalMode: string;
  cacheSize: number;
  walCheckpoint: number;
}

// =============================================================================
// 4. SQLITE MANAGER IMPLEMENTATION
// =============================================================================

function wrapWithTiming<F extends (...a: any[]) => any>(fn: F, ctx: any, record: (ms: number) => void): F {
  return ((...a: any[]) => {
    const start = Date.now();
    const res = (fn as any).apply(ctx, a);
    record(Date.now() - start);
    return res;
  }) as F;
}

export class SQLiteManager {
  private db: SQLiteDatabase | null = null;
  private config: Required<SQLiteConfig>;
  private queryCount = 0;
  private totalQueryTime = 0;

  constructor(config: SQLiteConfig = {}) {
    this.config = {
      path: config.path || getDefaultDbPath(),
      readonly: config.readonly || false,
      memory: config.memory || false,
      verbose: config.verbose || false,
      timeout: config.timeout || BUSY_TIMEOUT,
    };
  }

  /**
   * Initialize database connection with optimized settings
   */
  initialize(): void {
    if (this.db) {
      console.warn("[SQLiteManager] Database already initialized");
      return;
    }

    // Log database path for debugging
    console.error(`[SQLiteManager] Configured database path: ${this.config.path}`);

    // Ensure directory exists
    if (!this.config.memory && !this.config.readonly) {
      const dir = dirname(this.config.path);
      // Skip creating '.' or empty directories (Bun compatibility)
      if (dir && dir !== "." && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Create database connection using runtime-appropriate module
    const dbPath = this.config.memory ? ":memory:" : this.config.path;
    const runtime = isBunRuntime() ? "Bun" : "Node.js";
    console.error(`[SQLiteManager] Using ${runtime} runtime`);

    const DatabaseModule = loadSQLiteModule();

    this.db = new DatabaseModule(dbPath, {
      readonly: this.config.readonly,
      verbose: this.config.verbose ? console.log : undefined,
      timeout: this.config.timeout,
    });

    // Apply optimized PRAGMA settings
    this.applyOptimizations();
    this.ensureEmbeddingsTable();

    console.error(`[SQLiteManager] Database initialized at ${dbPath}`);
  }

  private ensureEmbeddingsTable(): void {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        content TEXT NOT NULL,
        metadata TEXT,
        vector_data BLOB,
        model_name TEXT NOT NULL DEFAULT 'default',
        created_at INTEGER NOT NULL
      );
    `);

    const columns = this.db.prepare("PRAGMA table_info(embeddings)").all() as Array<{ name: string }>;
    const ensureColumn = (name: string, definition: string, postUpdate?: string) => {
      if (!columns.some((c) => c.name === name)) {
        this.db?.exec(`ALTER TABLE embeddings ADD COLUMN ${definition}`);
        if (postUpdate) {
          this.db?.exec(postUpdate);
        }
      }
    };

    ensureColumn("entity_id", "entity_id TEXT");
    ensureColumn("metadata", "metadata TEXT", "UPDATE embeddings SET metadata = '{}' WHERE metadata IS NULL");
    ensureColumn("vector_data", "vector_data BLOB");
    ensureColumn(
      "model_name",
      "model_name TEXT DEFAULT 'default'",
      "UPDATE embeddings SET model_name = 'default' WHERE model_name IS NULL",
    );
    ensureColumn("created_at", "created_at INTEGER DEFAULT (strftime('%s','now'))");

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings(entity_id);
      CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model_name);
      CREATE INDEX IF NOT EXISTS idx_embeddings_created ON embeddings(created_at);
      CREATE INDEX IF NOT EXISTS idx_embeddings_content ON embeddings(content);
    `);
  }

  /**
   * Apply optimized PRAGMA settings for commodity hardware
   */
  private applyOptimizations(): void {
    if (!this.db) throw new Error("Database not initialized");

    // WAL mode for concurrent reads during writes
    this.db.pragma("journal_mode = WAL");

    // 64MB cache for better performance
    this.db.pragma(`cache_size = -${CACHE_SIZE_KB}`);

    // NORMAL synchronous for balance between safety and speed
    this.db.pragma("synchronous = NORMAL");

    // Store temp tables in memory
    this.db.pragma("temp_store = MEMORY");

    // Memory-mapped I/O for faster access
    this.db.pragma(`mmap_size = ${MMAP_SIZE}`);

    // 4KB page size (optimal for most systems)
    this.db.pragma(`page_size = ${PAGE_SIZE}`);

    // Auto-checkpoint WAL after 1000 pages
    this.db.pragma(`wal_autocheckpoint = ${WAL_AUTOCHECKPOINT}`);

    // Enable foreign key constraints
    this.db.pragma("foreign_keys = ON");

    // NEW in better-sqlite3 v12: Optimize JSON operations
    try {
      this.db.pragma("json_extract_on_expression = ON");
    } catch (_error) {
      // Pragma may not be available in older versions
      console.debug("[SQLiteManager] json_extract_on_expression not available");
    }

    // Analyze query optimizer statistics on first run
    if (!this.config.memory && !this.config.readonly) {
      try {
        this.db.exec("ANALYZE");
        // NEW in better-sqlite3 v12: Auto-optimize indexes
        this.db.pragma("optimize");
      } catch (_error) {
        // ANALYZE may fail on empty database, ignore
        console.debug("[SQLiteManager] ANALYZE/OPTIMIZE skipped (likely empty database)");
      }
    }
  }

  /**
   * Get database connection
   */
  getConnection(): SQLiteDatabase {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Prepare a statement with timing
   */
  prepare(sql: string): any {
    const db = this.getConnection();
    const statement = db.prepare(sql);

    statement.run = wrapWithTiming(statement.run, statement, (ms) => this.recordQueryTime(ms)) as typeof statement.run;
    statement.get = wrapWithTiming(statement.get, statement, (ms) => this.recordQueryTime(ms)) as typeof statement.get;
    statement.all = wrapWithTiming(statement.all, statement, (ms) => this.recordQueryTime(ms)) as typeof statement.all;
    return statement;
  }
  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getConnection();
    const start = Date.now();

    const transaction = db.transaction(fn);
    const result = transaction();

    this.recordQueryTime(Date.now() - start);
    return result;
  }

  /**
   * Run VACUUM to optimize database
   */
  vacuum(): void {
    const db = this.getConnection();
    console.error("[SQLiteManager] Running VACUUM...");
    const start = Date.now();

    db.exec("VACUUM");

    const duration = Date.now() - start;
    console.error(`[SQLiteManager] VACUUM completed in ${duration}ms`);
  }

  /**
   * Run ANALYZE to update query optimizer statistics
   */
  analyze(): void {
    const db = this.getConnection();
    console.error("[SQLiteManager] Running ANALYZE...");
    const start = Date.now();

    db.exec("ANALYZE");

    const duration = Date.now() - start;
    console.error(`[SQLiteManager] ANALYZE completed in ${duration}ms`);
  }

  /**
   * Checkpoint WAL file
   */
  checkpoint(): void {
    const db = this.getConnection();
    const result = db.pragma("wal_checkpoint(TRUNCATE)");
    console.error("[SQLiteManager] WAL checkpoint completed", result);
  }

  /**
   * Get database information
   */
  getInfo(): DatabaseInfo {
    const db = this.getConnection();

    return {
      version: db.pragma("user_version", { simple: true }) as string,
      pageSize: db.pragma("page_size", { simple: true }) as number,
      pageCount: db.pragma("page_count", { simple: true }) as number,
      sizeBytes:
        (db.pragma("page_count", { simple: true }) as number) * (db.pragma("page_size", { simple: true }) as number),
      journalMode: db.pragma("journal_mode", { simple: true }) as string,
      cacheSize: Math.abs(db.pragma("cache_size", { simple: true }) as number),
      walCheckpoint: db.pragma("wal_autocheckpoint", { simple: true }) as number,
    };
  }

  /**
   * Get storage metrics
   */
  async getMetrics(): Promise<Partial<StorageMetrics>> {
    const info = this.getInfo();
    const db = this.getConnection();

    // Count entities and relationships
    const entityCount = db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number };
    const relationshipCount = db.prepare("SELECT COUNT(*) as count FROM relationships").get() as { count: number };
    const fileCount = db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number };

    // Calculate index size (approximate)
    // Note: dbstat is a virtual table that may not be available in all SQLite builds
    let indexSizeMB = 0;
    try {
      const indexInfo = db
        .prepare(`
        SELECT SUM(pgsize) as size
        FROM dbstat
        WHERE name LIKE 'idx_%'
      `)
        .get() as { size: number } | undefined;
      indexSizeMB = (indexInfo?.size || 0) / (1024 * 1024);
    } catch (_err) {
      // dbstat not available - use 0 as fallback
      indexSizeMB = 0;
    }

    return {
      totalEntities: entityCount?.count || 0,
      totalRelationships: relationshipCount?.count || 0,
      totalFiles: fileCount?.count || 0,
      databaseSizeMB: info.sizeBytes / (1024 * 1024),
      indexSizeMB,
      averageQueryTimeMs: this.queryCount > 0 ? this.totalQueryTime / this.queryCount : 0,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.error("[SQLiteManager] Database connection closed");
    }
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db?.open ?? false;
  }

  /**
   * Record query time for metrics
   */
  private recordQueryTime(timeMs: number): void {
    this.queryCount++;
    this.totalQueryTime += timeMs;
  }

  /**
   * Reset query metrics
   */
  resetMetrics(): void {
    this.queryCount = 0;
    this.totalQueryTime = 0;
  }

  /**
   * Enable or disable verbose logging
   */
  setVerbose(verbose: boolean): void {
    if (this.db) {
      this.db.function("log", (msg: string) => console.error(`[SQLite] ${msg}`));
      if (verbose) {
        this.db.pragma("vdbe_trace = ON");
      } else {
        this.db.pragma("vdbe_trace = OFF");
      }
    }
  }
}

// =============================================================================
// 5. SINGLETON INSTANCE
// =============================================================================
let instance: SQLiteManager | null = null;
const projectManagers: Map<string, SQLiteManager> = new Map();

/**
 * Get singleton SQLiteManager instance (uses default path from indexing context)
 */
export function getSQLiteManager(config?: SQLiteConfig): SQLiteManager {
  if (!instance) {
    instance = new SQLiteManager(config);
  }
  return instance;
}

/**
 * Get or create SQLiteManager for a specific project path.
 * Uses centralized storage in AppData with path-based hash.
 *
 * @param projectPath - Absolute path to the project directory
 * @returns SQLiteManager instance for that project
 */
export function getProjectSQLiteManager(projectPath: string): SQLiteManager {
  const paths = getProjectPaths(projectPath);
  const dbPath = paths.graphDbPath;

  // Check if we already have a manager for this path
  if (projectManagers.has(dbPath)) {
    const existing = projectManagers.get(dbPath)!;
    if (existing.isOpen()) {
      return existing;
    }
    // Manager exists but closed, remove and recreate
    projectManagers.delete(dbPath);
  }

  // Create new manager for this project
  console.error(`[SQLiteManager] Creating project-specific manager for: ${projectPath}`);
  console.error(`[SQLiteManager] Database path: ${dbPath}`);

  const manager = new SQLiteManager({ path: dbPath });
  manager.initialize();
  projectManagers.set(dbPath, manager);

  return manager;
}

/**
 * Close all project managers
 */
export function closeAllProjectManagers(): void {
  for (const [path, manager] of projectManagers.entries()) {
    try {
      manager.close();
      console.error(`[SQLiteManager] Closed project manager: ${path}`);
    } catch (error) {
      console.error(`[SQLiteManager] Error closing manager ${path}:`, error);
    }
  }
  projectManagers.clear();
}

/**
 * Reset singleton instance (mainly for testing)
 */
export function resetSQLiteManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
  closeAllProjectManagers();
}
