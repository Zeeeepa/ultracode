/**
 * SQLite Adapter - Sync SQLite for Bun runtime only
 *
 * Architecture:
 * - Bun: uses bun:sqlite for fast sync cache operations
 * - Node.js: sync SQLite NOT available, use libsql (async) instead
 *
 * This adapter is used for LayeredCacheManager and VectorCacheManager
 * which need fast sync reads for delta lookups.
 */

import { log } from "../logging/index.js";

// Type definitions for both APIs

/**
 * Generic SQLite statement with type-safe query results
 * @template T - Default row type for this statement
 */
export interface SQLiteStatement<T = unknown> {
  run(...params: unknown[]): SQLiteRunResult;
  get<R = T>(...params: unknown[]): R | undefined;
  all<R = T>(...params: unknown[]): R[];
  iterate<R = T>(...params: unknown[]): IterableIterator<R>;
  readonly source: string;
}

export interface SQLiteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Type-safe SQLite database interface
 * Supports both bun:sqlite and better-sqlite3 APIs
 */
export interface SQLiteDatabase {
  prepare<T = unknown>(sql: string): SQLiteStatement<T>;
  exec(sql: string): void;
  pragma<R = unknown>(pragma: string, options?: { simple?: boolean }): R;
  close(): void;
  readonly inTransaction: boolean;
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;

  // Additional properties from better-sqlite3
  readonly memory: boolean;
  readonly readonly: boolean;
  readonly name: string;
  readonly open: boolean;
  function(name: string, fn: (...args: unknown[]) => unknown): this;
  function(name: string, options: Record<string, unknown>, fn: (...args: unknown[]) => unknown): this;
  aggregate(name: string, options: Record<string, unknown>): this;
  table(name: string, options?: Record<string, unknown>): unknown;
  backup(destination: string, options?: Record<string, unknown>): Promise<unknown>;
  serialize(options?: Record<string, unknown>): Buffer;
  loadExtension(path: string, entryPoint?: string): this;
  defaultSafeIntegers(toggleState?: boolean): this;
  unsafeMode(unsafe?: boolean): this;
}

export interface SQLiteDatabaseOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
}

export type SQLiteDatabaseConstructor = new (path: string, options?: SQLiteDatabaseOptions) => SQLiteDatabase;

/**
 * Bun's native SQLite interface (from bun:sqlite)
 */
interface BunSQLiteDatabase {
  prepare(sql: string): BunSQLiteStatement;
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
  loadExtension(path: string): void;
}

interface BunSQLiteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  values(...params: unknown[]): IterableIterator<unknown>;
}

/**
 * Detect runtime environment
 */
export function isBunRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    process.versions !== null &&
    "bun" in process.versions
  );
}

/**
 * Load SQLite module - only available under Bun runtime
 * @throws Error if running under Node.js (use libsql instead)
 */
export function loadSQLiteModule(): SQLiteDatabaseConstructor {
  if (isBunRuntime()) {
    log.i("SQLITEADAPT", "bun_detected", { msg: "using bun:sqlite" });
    return loadBunSQLite();
  }

  throw new Error(
    "[SQLiteAdapter] Sync SQLite not available under Node.js. " +
      "Use libsql (async) for storage operations. " +
      "Sync cache (LayeredCacheManager) is only available under Bun runtime.",
  );
}

/**
 * Check if sync SQLite is available (only under Bun)
 */
export function isSyncSQLiteAvailable(): boolean {
  return isBunRuntime();
}

/**
 * Load bun:sqlite module (for Bun runtime)
 */
function loadBunSQLite(): SQLiteDatabaseConstructor {
  try {
    // Dynamic import for Bun's built-in SQLite
    const { Database } = require("bun:sqlite");

    // macOS: Check if custom SQLite path is needed for extension support
    if (process.platform === "darwin" && process.env["SQLITE_LIB_PATH"]) {
      try {
        Database.setCustomSQLite(process.env["SQLITE_LIB_PATH"]);
        log.i("SQLITEADAPT", "custom_sqlite", { path: process.env["SQLITE_LIB_PATH"] });
      } catch (error) {
        log.w("SQLITEADAPT", "custom_sqlite_fail", { err: (error as Error).message });
      }
    }

    // Wrap Bun Database to match better-sqlite3 API
    return class BunDatabaseAdapter implements SQLiteDatabase {
      private db: BunSQLiteDatabase;
      private _path: string;
      private _readonly: boolean;
      private _open: boolean;

      constructor(path: string, options?: SQLiteDatabaseOptions) {
        this._path = path;
        this._readonly = options?.readonly || false;
        this._open = true;

        // Bun SQLite options
        interface BunOptions {
          readonly: boolean;
          create: boolean;
        }
        const bunOptions: BunOptions = {
          readonly: this._readonly,
          create: !this._readonly,
        };

        this.db = new Database(path, bunOptions) as BunSQLiteDatabase;

        // Apply verbose logging if needed
        if (options?.verbose) {
          // Bun doesn't have built-in verbose, we can wrap prepare
          const originalPrepare = this.db.prepare.bind(this.db);
          this.db.prepare = (sql: string): BunSQLiteStatement => {
            options.verbose?.(sql);
            return originalPrepare(sql);
          };
        }
      }

      // Properties from better-sqlite3
      get memory(): boolean {
        return this._path === ":memory:";
      }

      get readonly(): boolean {
        return this._readonly;
      }

      get name(): string {
        return this._path;
      }

      get open(): boolean {
        return this._open;
      }

      prepare<T = unknown>(sql: string): SQLiteStatement<T> {
        const stmt = this.db.prepare(sql);

        // Wrap Bun statement to match better-sqlite3 API
        return {
          run: (...params: unknown[]): SQLiteRunResult => {
            const result = stmt.run(...params);
            // Bun returns { changes, lastInsertRowid } - compatible!
            return {
              changes: result.changes || 0,
              lastInsertRowid: result.lastInsertRowid || 0,
            };
          },
          get: <R = T>(...params: unknown[]): R | undefined => stmt.get(...params) as R | undefined,
          all: <R = T>(...params: unknown[]): R[] => stmt.all(...params) as R[],
          iterate: function* <R = T>(...params: unknown[]): IterableIterator<R> {
            // Bun's iterate returns iterator directly
            const iter = stmt.values(...params);
            for (const row of iter) {
              yield row as R;
            }
          },
          source: sql,
        };
      }

      exec(sql: string): void {
        this.db.exec(sql);
      }

      pragma<R = unknown>(pragma: string, options?: { simple?: boolean }): R {
        // Bun SQLite doesn't have pragma method, use prepare
        const sql = `PRAGMA ${pragma}`;
        if (options?.simple) {
          const stmt = this.db.prepare(sql);
          const result = stmt.get();
          return (result ? Object.values(result as Record<string, unknown>)[0] : undefined) as R;
        }
        const stmt = this.db.prepare(sql);
        return stmt.all() as R;
      }

      close(): void {
        this.db.close();
        this._open = false;
      }

      get inTransaction(): boolean {
        // Bun doesn't expose inTransaction, check via pragma
        try {
          const result = this.pragma<number>("query_only", { simple: true });
          return result === 0; // If query_only is 0, we might be in transaction
        } catch {
          return false;
        }
      }

      transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
        // Bun has transaction method
        return this.db.transaction(fn);
      }

      // Additional methods from better-sqlite3
      // Note: Some methods are stubs for Bun compatibility
      function(
        _name: string,
        _fnOrOptions: ((...args: unknown[]) => unknown) | Record<string, unknown>,
        _fn?: (...args: unknown[]) => unknown,
      ): this {
        // Support both function(name, fn) and function(name, options, fn) signatures
        // Bun may not support custom functions, but we provide the interface
        log.w("SQLITEADAPT", "custom_fn_unsupported", { runtime: "bun" });
        return this;
      }

      aggregate(_name: string, _options: Record<string, unknown>): this {
        // Bun may not support aggregate functions
        log.w("SQLITEADAPT", "aggregate_unsupported", { runtime: "bun" });
        return this;
      }

      table(_name: string, _options?: Record<string, unknown>): unknown {
        // Bun doesn't have built-in table function
        throw new Error("[BunDatabaseAdapter] table() not implemented for Bun runtime");
      }

      async backup(_destination: string, _options?: Record<string, unknown>): Promise<unknown> {
        // Bun doesn't have built-in backup, would need file copy
        throw new Error("[BunDatabaseAdapter] backup() not implemented for Bun runtime");
      }

      serialize(_options?: Record<string, unknown>): Buffer {
        // Bun doesn't have built-in serialize
        throw new Error("[BunDatabaseAdapter] serialize() not implemented for Bun runtime");
      }

      loadExtension(path: string, _entryPoint?: string): this {
        // Bun supports loadExtension() natively
        try {
          this.db.loadExtension(path);
          return this;
        } catch (error) {
          // Note: macOS users may need to install vanilla SQLite via Homebrew
          // and call Database.setCustomSQLite() before creating database instances
          throw new Error(`[BunDatabaseAdapter] Failed to load extension: ${(error as Error).message}`);
        }
      }

      defaultSafeIntegers(_toggleState?: boolean): this {
        // Bun handles integers differently, this is a no-op
        return this;
      }

      unsafeMode(_unsafe?: boolean): this {
        // Bun doesn't have unsafe mode concept
        return this;
      }
    } as SQLiteDatabaseConstructor;
  } catch (error) {
    throw new Error(`Failed to load bun:sqlite`, { cause: error });
  }
}

// better-sqlite3 removed - only bun:sqlite is supported for sync operations
// Under Node.js, use libsql (async) instead
