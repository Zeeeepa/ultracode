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

/**
 * Options for creating Bun SQLite database
 */
export interface BunSQLiteOptions {
  readonly?: boolean;
  create?: boolean;
  readwrite?: boolean;
}

export interface BunSQLiteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Generic Bun SQLite statement with type-safe query results
 * @template T - Default row type for this statement
 */
export interface BunSQLiteStatement<T = unknown> {
  run(...params: unknown[]): BunSQLiteRunResult;
  get<R = T>(...params: unknown[]): R | undefined;
  all<R = T>(...params: unknown[]): R[];
  finalize(): void;
}

/**
 * Bun SQLite database interface
 */
export interface BunSQLiteDatabase {
  prepare<T = unknown>(sql: string): BunSQLiteStatement<T>;
  exec(sql: string): void;
  close(): void;
  readonly inTransaction: boolean;
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
}

/**
 * Check if running in Bun runtime
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
 * Load bun:sqlite Database class
 * @throws Error if not running in Bun
 */
export function loadBunSQLite(): new (path: string, options?: BunSQLiteOptions) => BunSQLiteDatabase {
  if (!isBunRuntime()) {
    throw new Error("[BunSQLiteAdapter] This module requires Bun runtime. " + "Please run with: bun run <script>");
  }

  const { Database } = require("bun:sqlite");
  return Database as new (
    path: string,
    options?: BunSQLiteOptions,
  ) => BunSQLiteDatabase;
}

/**
 * Create a new Bun SQLite database connection
 */
export function createBunDatabase(path: string, options?: BunSQLiteOptions): BunSQLiteDatabase {
  const Database = loadBunSQLite();
  return new Database(path, options);
}
