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

// Type definitions for both APIs
export interface SQLiteDatabase {
  prepare(sql: string): SQLiteStatement;
  exec(sql: string): void;
  pragma(pragma: string, options?: { simple?: boolean }): any;
  close(): void;
  readonly inTransaction: boolean;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;

  // Additional properties from better-sqlite3
  readonly memory: boolean;
  readonly readonly: boolean;
  readonly name: string;
  readonly open: boolean;
  function(name: string, fn: (...args: any[]) => any): this;
  function(name: string, options: any, fn: (...args: any[]) => any): this;
  aggregate(name: string, options: any): this;
  table(name: string, options?: any): any;
  backup(destination: string, options?: any): Promise<any>;
  serialize(options?: any): Buffer;
  loadExtension(path: string, entryPoint?: string): this;
  defaultSafeIntegers(toggleState?: boolean): this;
  unsafeMode(unsafe?: boolean): this;
}

export interface SQLiteStatement {
  run(...params: any[]): SQLiteRunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
  iterate(...params: any[]): IterableIterator<any>;
  readonly source: string;
}

export interface SQLiteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export type SQLiteDatabaseConstructor = new (path: string, options?: any) => SQLiteDatabase;

/**
 * Detect runtime environment
 */
export function isBunRuntime(): boolean {
  return typeof (process.versions as any).bun !== "undefined";
}

/**
 * Load SQLite module - only available under Bun runtime
 * @throws Error if running under Node.js (use libsql instead)
 */
export function loadSQLiteModule(): SQLiteDatabaseConstructor {
  if (isBunRuntime()) {
    console.error("[SQLiteAdapter] Detected Bun runtime, using bun:sqlite");
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
        console.error(`[SQLiteAdapter] Using custom SQLite from: ${process.env["SQLITE_LIB_PATH"]}`);
      } catch (error) {
        console.warn(`[SQLiteAdapter] Failed to set custom SQLite: ${(error as Error).message}`);
      }
    }

    // Wrap Bun Database to match better-sqlite3 API
    return class BunDatabaseAdapter {
      private db: any;
      private _path: string;
      private _readonly: boolean;
      private _open: boolean;

      constructor(path: string, options?: { readonly?: boolean; verbose?: any; timeout?: number }) {
        this._path = path;
        this._readonly = options?.readonly || false;
        this._open = true;

        // Bun SQLite options
        const bunOptions: any = {
          readonly: this._readonly,
          create: !this._readonly,
        };

        this.db = new Database(path, bunOptions);

        // Apply verbose logging if needed
        if (options?.verbose) {
          // Bun doesn't have built-in verbose, we can wrap prepare
          const originalPrepare = this.db.prepare.bind(this.db);
          this.db.prepare = (sql: string) => {
            options.verbose(sql);
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

      prepare(sql: string): SQLiteStatement {
        const stmt = this.db.prepare(sql);

        // Wrap Bun statement to match better-sqlite3 API
        return {
          run: (...params: any[]) => {
            const result = stmt.run(...params);
            // Bun returns { changes, lastInsertRowid } - compatible!
            return {
              changes: result.changes || 0,
              lastInsertRowid: result.lastInsertRowid || 0,
            };
          },
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params),
          iterate: function* (...params: any[]) {
            // Bun's iterate returns iterator directly
            const iter = stmt.values(...params);
            for (const row of iter) {
              yield row;
            }
          },
          source: sql,
        };
      }

      exec(sql: string): void {
        this.db.exec(sql);
      }

      pragma(pragma: string, options?: { simple?: boolean }): any {
        // Bun SQLite doesn't have pragma method, use prepare
        const sql = `PRAGMA ${pragma}`;
        if (options?.simple) {
          const stmt = this.db.prepare(sql);
          const result = stmt.get();
          return result ? Object.values(result)[0] : undefined;
        }
        const stmt = this.db.prepare(sql);
        return stmt.all();
      }

      close(): void {
        this.db.close();
        this._open = false;
      }

      get inTransaction(): boolean {
        // Bun doesn't expose inTransaction, check via pragma
        try {
          const result = this.pragma("query_only", { simple: true });
          return result === 0; // If query_only is 0, we might be in transaction
        } catch {
          return false;
        }
      }

      transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
        // Bun has transaction method
        return this.db.transaction(fn);
      }

      // Additional methods from better-sqlite3
      // Note: Some methods are stubs for Bun compatibility
      function(..._args: any[]): this {
        // Support both function(name, fn) and function(name, options, fn) signatures
        // Bun may not support custom functions, but we provide the interface
        console.warn("[BunDatabaseAdapter] Custom functions not fully supported in Bun");
        return this;
      }

      aggregate(_name: string, _options: any): this {
        // Bun may not support aggregate functions
        console.warn("[BunDatabaseAdapter] Aggregate functions not fully supported in Bun");
        return this;
      }

      table(_name: string, _options?: any): any {
        // Bun doesn't have built-in table function
        throw new Error("[BunDatabaseAdapter] table() not implemented for Bun runtime");
      }

      async backup(_destination: string, _options?: any): Promise<any> {
        // Bun doesn't have built-in backup, would need file copy
        throw new Error("[BunDatabaseAdapter] backup() not implemented for Bun runtime");
      }

      serialize(_options?: any): Buffer {
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
    } as any;
  } catch (error) {
    throw new Error(`Failed to load bun:sqlite`, { cause: error });
  }
}

// better-sqlite3 removed - only bun:sqlite is supported for sync operations
// Under Node.js, use libsql (async) instead
