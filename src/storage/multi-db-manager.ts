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
import { sleep } from "../utils/runtime-detection.js";
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
  "PRAGMA threads = 4", // Zig compat: enable multi-threaded sorting
  "PRAGMA cell_size_check = OFF", // Zig compat: skip cell size validation for speed
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

  // ─── Serialized DB accessors (analog of Zig db_mutex) ──────────────
  // With journal_mode=OFF + locking_mode=EXCLUSIVE, ALL access (reads + writes)
  // must be serialized to prevent bun:sqlite SQLITE_MISUSE / JSC GC crashes.
  // Same mutex for reads and writes — full serialization per DB.

  /** Execute fn exclusively on graph.db — all other graph access waits. */
  writeGraph<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.graph.run(fn);
  }

  /** Execute read fn exclusively on graph.db — serialized with writes. */
  readGraph<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.graph.run(fn);
  }

  /** Execute fn exclusively on semantic.db */
  writeSemantic<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.semantic.run(fn);
  }

  /** Execute read fn exclusively on semantic.db — serialized with writes. */
  readSemantic<T>(fn: () => T | Promise<T>): Promise<T> {
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

  /** Execute read fn exclusively on cache.db — serialized with writes. */
  readCache<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.mutexes.cache.run(fn);
  }

  /**
   * Flush a specific database. Does NOT close+reopen — that causes EXCLUSIVE
   * lock lag on Windows (~20-30s) leading to "database is locked" on reconnect.
   *
   * - graph/semantic/cache (journal_mode=OFF, locking_mode=EXCLUSIVE):
   *   Data is written directly to file, no journal to flush. PRAGMA optimize
   *   is sufficient to update statistics for query planner.
   *
   * - versioning (journal_mode=WAL):
   *   PRAGMA wal_checkpoint(TRUNCATE) flushes WAL to main DB file.
   */
  async flushClient(which: keyof MultiDbPaths): Promise<NativeSQLiteClient | null> {
    const client = this.clients[which];
    if (!client) return null;

    try {
      if (which === "versioning") {
        // WAL mode: checkpoint flushes WAL → main DB file
        await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      }
      // For all DBs: optimize query planner statistics
      await client.execute("PRAGMA optimize");
      return client;
    } catch (err) {
      log.e("MULTIDB", "flush_pragma_fail", { db: which, err: (err as Error).message });
      return client; // client is still usable — PRAGMA failure is non-fatal
    }
  }

  /**
   * Flush all databases (non-destructive — no close/reopen).
   */
  async flushAll(): Promise<void> {
    const keys: (keyof MultiDbPaths)[] = ["graph", "semantic", "versioning", "cache"];
    await Promise.all(keys.map((k) => this.flushClient(k)));
  }

  /**
   * Force-drain all write mutex queues and clear all tables.
   * Bypasses the normal writeMutex path — safe only when background watchers are suspended.
   */
  async drainAndClear(): Promise<void> {
    // 1. Drain all mutexes — unblock any queued writers
    this.mutexes.graph.drain();
    this.mutexes.semantic.drain();
    this.mutexes.versioning.drain();
    this.mutexes.cache.drain();

    // 2. Brief yield to let unblocked writers error out
    await sleep(50);

    // 3. Clear tables directly on the existing connection (bypasses writeMutex)
    const graph = this.clients.graph;
    if (graph) {
      try {
        await graph.execute("DELETE FROM relationships");
        await graph.execute("DELETE FROM entities");
        await graph.execute("DELETE FROM files");
        await graph.execute("DELETE FROM project_metadata");
        await graph.execute("DELETE FROM name_tokens");
      } catch (e) {
        log.w("MULTIDB", "drain_clear_graph_fail", { err: (e as Error).message });
      }
    }
    const semantic = this.clients.semantic;
    if (semantic) {
      try {
        await semantic.execute("DELETE FROM cooccurrence");
        await semantic.execute("DELETE FROM term_frequency");
      } catch (e) {
        log.w("MULTIDB", "drain_clear_semantic_fail", { err: (e as Error).message });
      }
    }
    const cache = this.clients.cache;
    if (cache) {
      try {
        await cache.execute("DELETE FROM query_cache");
      } catch {
        // Table may not exist
      }
    }
    log.i("MULTIDB", "drain_and_clear_done");
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
