/**
 * NativeSQLiteClient - Drop-in replacement for @libsql/client.Client
 *
 * Wraps sync native SQLite (better-sqlite3 / bun:sqlite) into async API
 * compatible with libsql Client interface. Enables phased migration
 * without modifying all 16+ consumer files at once.
 *
 * Performance benefits:
 * - Prepared statement cache (2-5x for repeated queries)
 * - Sync FFI calls instead of async IPC (50-100μs per query)
 * - db.transaction() instead of IPC batch (3-10x for batch inserts)
 */

import type { SQLiteDatabase, SQLiteStatement } from "./sqlite-adapter.js";
import { loadSQLiteModule } from "./sqlite-adapter.js";

// =============================================================================
// LIBSQL-COMPATIBLE TYPES
// =============================================================================

/** Row object with column-name keys (matches libsql Row) */
export type Row = Record<string, unknown>;

/** Result set from execute() - matches libsql ResultSet */
export interface ResultSet {
  columns: string[];
  rows: Row[];
  rowsAffected: number;
  lastInsertRowid: bigint | undefined;
}

/** Input statement for execute/batch - matches libsql InStatement */
export type InStatement = string | { sql: string; args: unknown[] };

// =============================================================================
// NATIVE SQLITE CLIENT
// =============================================================================

/** Regex to detect read-only statements (SELECT, PRAGMA, EXPLAIN, WITH...SELECT) */
const READ_STMT_RE = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH\s)/i;

export class NativeSQLiteClient {
  private db: SQLiteDatabase;
  private stmtCache: Map<string, SQLiteStatement> = new Map();
  private _closed = false;

  constructor(path: string, options?: { readonly?: boolean }) {
    const SQLiteDB = loadSQLiteModule();
    this.db = new SQLiteDB(path, options?.readonly ? { readonly: true } : undefined);
  }

  /**
   * Execute a single SQL statement.
   * Compatible with libsql client.execute().
   */
  async execute(stmtOrSql: string | { sql: string; args: unknown[] }): Promise<ResultSet> {
    const { sql, args } = typeof stmtOrSql === "string" ? { sql: stmtOrSql, args: [] as unknown[] } : stmtOrSql;

    const stmt = this.getOrPrepare(sql);
    const isRead = READ_STMT_RE.test(sql);

    if (isRead) {
      const rows = stmt.all(...args) as Row[];
      const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
      return { columns, rows, rowsAffected: 0, lastInsertRowid: undefined };
    }

    const result = stmt.run(...args);
    return {
      columns: [],
      rows: [],
      rowsAffected: result.changes,
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint" ? result.lastInsertRowid : BigInt(result.lastInsertRowid),
    };
  }

  /**
   * Execute a batch of statements in a transaction.
   * Compatible with libsql client.batch().
   *
   * @param stmts - Array of statements
   * @param _mode - Ignored (libsql compatibility: "write" | "read" | "deferred")
   */
  async batch(stmts: InStatement[], _mode?: string): Promise<ResultSet[]> {
    const results: ResultSet[] = [];

    const runBatch = this.db.transaction(() => {
      for (const stmtOrSql of stmts) {
        const { sql, args } = typeof stmtOrSql === "string" ? { sql: stmtOrSql, args: [] as unknown[] } : stmtOrSql;

        const stmt = this.getOrPrepare(sql);
        const isRead = READ_STMT_RE.test(sql);

        if (isRead) {
          const rows = stmt.all(...args) as Row[];
          const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
          results.push({ columns, rows, rowsAffected: 0, lastInsertRowid: undefined });
        } else {
          const result = stmt.run(...args);
          results.push({
            columns: [],
            rows: [],
            rowsAffected: result.changes,
            lastInsertRowid:
              typeof result.lastInsertRowid === "bigint" ? result.lastInsertRowid : BigInt(result.lastInsertRowid),
          });
        }
      }
    });

    runBatch();
    return results;
  }

  /**
   * Close the database connection and clear statement cache.
   */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.stmtCache.clear();
    try {
      this.db.close();
    } catch {
      // Ignore close errors
    }
  }

  /**
   * Check if the client is closed.
   */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Get or create a prepared statement from cache.
   * Caching prepared statements gives 2-5x speedup for repeated queries.
   */
  private getOrPrepare(sql: string): SQLiteStatement {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }
}
