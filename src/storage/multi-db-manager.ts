/**
 * Multi-Database Manager
 *
 * Manages 4 independent database clients to eliminate write-blocking:
 * - graph.db: entities, relationships, files, file_generations, tombstones, name_tokens, project_metadata
 * - semantic.db: cooccurrence, term_frequency
 * - versioning.db: prolly_nodes, graph_commits, branch_heads
 * - cache.db: embedding_cache, query_cache, performance_metrics
 *
 * Each DB has its own connection, so index writes to graph.db
 * don't block semantic search reads from semantic.db/cache.db.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logging/index.js";
import { DbWriteMutex } from "./db-write-mutex.js";
import { NativeSQLiteClient } from "./native-sqlite-client.js";

export interface MultiDbPaths {
  graph: string;
  semantic: string;
  versioning: string;
  cache: string;
}

export function getMultiDbPaths(basePath: string): MultiDbPaths {
  return {
    graph: join(basePath, "graph.db"),
    semantic: join(basePath, "semantic.db"),
    versioning: join(basePath, "versioning.db"),
    cache: join(basePath, "cache.db"),
  };
}

/**
 * Performance PRAGMAs applied to each database.
 * All data is regeneratable, so we use aggressive settings.
 */
/**
 * Hot-path PRAGMAs for graph.db, semantic.db, cache.db.
 * EXCLUSIVE locking: single process owns the DB, no lock syscalls per operation.
 * page_size=8192: fewer B-tree levels, better for CBOR BLOBs.
 * Synced with ultracode.zig constants.zig for cross-version compatibility.
 */
const PRAGMA_STATEMENTS = [
  "PRAGMA page_size = 8192", // must be before journal_mode (only effective on new DBs)
  "PRAGMA busy_timeout = 5000",
  "PRAGMA journal_mode = OFF",
  "PRAGMA synchronous = OFF",
  "PRAGMA locking_mode = EXCLUSIVE", // single process, skip all lock overhead
  "PRAGMA cache_size = -262144", // 256MB cache — keep all B-tree pages in memory
  "PRAGMA temp_store = MEMORY",
  "PRAGMA mmap_size = 268435456", // 256MB mmap for fast reads
  "PRAGMA auto_vacuum = NONE", // data is regeneratable, no vacuum overhead
];

/**
 * PRAGMAs for versioning.db (WAL mode for concurrent reads).
 */
const VERSIONING_PRAGMA_STATEMENTS = [
  "PRAGMA page_size = 8192",
  "PRAGMA busy_timeout = 30000",
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA cache_size = -65536", // 64MB
  "PRAGMA mmap_size = 268435456",
  "PRAGMA temp_store = MEMORY",
  "PRAGMA auto_vacuum = NONE",
];

export class MultiDbManager {
  private clients: {
    graph: NativeSQLiteClient | null;
    semantic: NativeSQLiteClient | null;
    versioning: NativeSQLiteClient | null;
    cache: NativeSQLiteClient | null;
  } = { graph: null, semantic: null, versioning: null, cache: null };

  /**
   * Per-DB write mutexes — serialize all writes to prevent race conditions.
   * Analog of Zig's db_mutex (std.Thread.Mutex).
   * With journal_mode=OFF + locking_mode=EXCLUSIVE, concurrent async writes
   * can produce stale reads or corrupt multi-step operations.
   */
  readonly mutexes = {
    graph: new DbWriteMutex("graph"),
    semantic: new DbWriteMutex("semantic"),
    versioning: new DbWriteMutex("versioning"),
    cache: new DbWriteMutex("cache"),
  };

  private paths: MultiDbPaths | null = null;
  private _isInitialized = false;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  async initialize(basePath: string): Promise<void> {
    this.paths = getMultiDbPaths(basePath);

    // Ensure directory exists
    const dir = dirname(this.paths.graph);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Remove stale lock files for all DBs
    await this.cleanupStaleLocks();

    // Create all 4 clients with appropriate PRAGMAs
    const entries = Object.entries(this.paths) as [keyof MultiDbPaths, string][];
    for (const [key, dbPath] of entries) {
      const client = new NativeSQLiteClient(dbPath);
      // Verify connection
      await client.execute("SELECT 1");
      // Apply PRAGMAs: versioning uses WAL (concurrent reads), others use EXCLUSIVE
      const pragmas = key === "versioning" ? VERSIONING_PRAGMA_STATEMENTS : PRAGMA_STATEMENTS;
      for (const pragma of pragmas) {
        await client.execute(pragma);
      }
      this.clients[key] = client;
    }

    this._isInitialized = true;
    log.i("MULTIDB", "initialized", {
      graph: this.paths.graph,
      semantic: this.paths.semantic,
      versioning: this.paths.versioning,
      cache: this.paths.cache,
    });
  }

  getGraphClient(): NativeSQLiteClient | null {
    return this.clients.graph;
  }

  getSemanticClient(): NativeSQLiteClient | null {
    return this.clients.semantic;
  }

  getVersioningClient(): NativeSQLiteClient | null {
    return this.clients.versioning;
  }

  getCacheClient(): NativeSQLiteClient | null {
    return this.clients.cache;
  }

  getPaths(): MultiDbPaths | null {
    return this.paths;
  }

  // ─── Write-serialized accessors (analog of Zig db_mutex) ───────────

  /** Execute fn exclusively on graph.db — all other graph writers wait. */
  writeGraph<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.graph.run(fn);
  }

  /** Execute fn exclusively on semantic.db */
  writeSemantic<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.semantic.run(fn);
  }

  /** Execute fn exclusively on versioning.db */
  writeVersioning<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.versioning.run(fn);
  }

  /** Execute fn exclusively on cache.db */
  writeCache<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.cache.run(fn);
  }

  /**
   * Flush a specific database by closing and reopening its client.
   * With journal_mode=OFF, this ensures OS buffers are flushed.
   */
  async flushClient(which: keyof MultiDbPaths): Promise<NativeSQLiteClient | null> {
    const client = this.clients[which];
    const path = this.paths?.[which];
    if (!client || !path) return null;

    client.close();

    const newClient = new NativeSQLiteClient(path);
    for (const pragma of PRAGMA_STATEMENTS) {
      await newClient.execute(pragma);
    }

    this.clients[which] = newClient;
    return newClient;
  }

  /**
   * Flush all databases.
   */
  async flushAll(): Promise<void> {
    const keys: (keyof MultiDbPaths)[] = ["graph", "semantic", "versioning", "cache"];
    await Promise.all(keys.map((k) => this.flushClient(k)));
  }

  async close(): Promise<void> {
    for (const [key, client] of Object.entries(this.clients)) {
      if (client) {
        try {
          (client as NativeSQLiteClient).close();
        } catch {
          // Ignore close errors
        }
        this.clients[key as keyof MultiDbPaths] = null;
      }
    }
    this._isInitialized = false;
    log.i("MULTIDB", "closed");
  }

  /**
   * Delete all database files (for corruption recovery).
   */
  async deleteAll(): Promise<boolean> {
    if (!this.paths) return false;
    const { unlink } = await import("node:fs/promises");
    let anyDeleted = false;

    for (const dbPath of Object.values(this.paths)) {
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        try {
          await unlink(dbPath + suffix);
          anyDeleted = true;
        } catch {
          // File doesn't exist - OK
        }
      }
    }
    return anyDeleted;
  }

  private async cleanupStaleLocks(): Promise<void> {
    if (!this.paths) return;
    const { unlink } = await import("node:fs/promises");

    for (const dbPath of Object.values(this.paths)) {
      for (const suffix of ["-journal", "-wal", "-shm"]) {
        try {
          await unlink(dbPath + suffix);
          log.i("MULTIDB", "stale_lock_removed", { file: dbPath + suffix });
        } catch {
          // File doesn't exist - OK
        }
      }
    }
  }
}
