/**
 * Bun SQLite Adapter - Direct bun:sqlite wrapper
 *
 * Simple adapter for components that need synchronous SQLite access.
 * Uses bun:sqlite directly (Bun runtime only).
 *
 * NOTE: For new code, prefer using LibSQLGraphAdapter (async API).
 * This adapter exists for backward compatibility with legacy sync code.
 */

// Type definitions matching bun:sqlite API
export interface BunSQLiteDatabase {
  prepare(sql: string): BunSQLiteStatement;
  exec(sql: string): void;
  close(): void;
  readonly inTransaction: boolean;
  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
}

export interface BunSQLiteStatement {
  run(...params: any[]): BunSQLiteRunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
  finalize(): void;
}

export interface BunSQLiteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Check if running in Bun runtime
 */
export function isBunRuntime(): boolean {
  return typeof (process.versions as any).bun !== "undefined";
}

/**
 * Load bun:sqlite Database class
 * @throws Error if not running in Bun
 */
export function loadBunSQLite(): new (path: string, options?: any) => BunSQLiteDatabase {
  if (!isBunRuntime()) {
    throw new Error("[BunSQLiteAdapter] This module requires Bun runtime. " + "Please run with: bun run <script>");
  }

  const { Database } = require("bun:sqlite");
  return Database as new (
    path: string,
    options?: any | undefined,
  ) => BunSQLiteDatabase;
}

/**
 * Create a new Bun SQLite database connection
 */
export function createBunDatabase(path: string, options?: { readonly?: boolean }): BunSQLiteDatabase {
  const Database = loadBunSQLite();
  return new Database(path, options);
}
