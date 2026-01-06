/**
 * Layered Cache Manager - SQLite Persistence for Branch Deltas
 *
 * Manages persistent storage of branch deltas using SQLite.
 * Ensures branch deltas survive server restarts.
 *
 * Architecture:
 * - Bun: uses bun:sqlite for persistent storage (fast sync reads)
 * - Node.js: in-memory only (sync SQLite not available, deltas don't persist)
 *
 * Database location (Bun only): %LOCALAPPDATA%/UltraScriptTools/projects/<hash>/layered/deltas.db
 *
 * Based on: ultrasharp-tools-mcp LayeredCacheManager.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "../logging/index.js";
import type { SQLiteDatabase, SQLiteStatement } from "../storage/sqlite-adapter.js";
import { isSyncSQLiteAvailable, loadSQLiteModule } from "../storage/sqlite-adapter.js";
import { BranchDelta } from "./branch-delta.js";

// =============================================================================
// LAYERED CACHE MANAGER CLASS
// =============================================================================

export class LayeredCacheManager {
  private db: SQLiteDatabase | null = null;
  private dbPath: string = "";
  private useInMemoryOnly: boolean = false;

  // In-memory fallback for Node.js
  private memoryCache: Map<string, BranchDelta> = new Map();

  // Prepared statements (only used with SQLite)
  private insertStmt: SQLiteStatement | null = null;
  private selectStmt: SQLiteStatement | null = null;
  private deleteStmt: SQLiteStatement | null = null;
  private listStmt: SQLiteStatement | null = null;

  constructor(workingDirectory: string) {
    // Check if sync SQLite is available (Bun only)
    if (!isSyncSQLiteAvailable()) {
      this.useInMemoryOnly = true;
      log.i("LAYEREDCACHE", `[LayeredCacheManager] Sync SQLite not available (Node.js), using in-memory only`);
      return;
    }

    // Bun path: use bun:sqlite for persistent storage
    const { getProjectPaths, ensureProjectDir } = require("../shared/storage-paths.js");
    ensureProjectDir(workingDirectory);
    const paths = getProjectPaths(workingDirectory);
    const dbDir = join(paths.dir, "layered");
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.dbPath = join(dbDir, "deltas.db");

    // Initialize database
    const SQLiteDatabase = loadSQLiteModule();
    this.db = new SQLiteDatabase(this.dbPath);

    this.initializeSchema();
    this.prepareStatements();

    log.i("LAYEREDCACHE", `[LayeredCacheManager] Initialized with database: ${this.dbPath}`);
  }

  // =========================================================================
  // SCHEMA INITIALIZATION (SQLite mode only)
  // =========================================================================

  private initializeSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS branch_deltas (
        branch_name TEXT PRIMARY KEY,
        base_commit_sha TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        total_changes INTEGER NOT NULL,

        -- Entity delta (JSON)
        entity_added TEXT NOT NULL DEFAULT '[]',
        entity_modified TEXT NOT NULL DEFAULT '[]',
        entity_deleted TEXT NOT NULL DEFAULT '[]',

        -- Relationship delta (JSON)
        relationship_added TEXT NOT NULL DEFAULT '[]',
        relationship_modified TEXT NOT NULL DEFAULT '[]',
        relationship_deleted TEXT NOT NULL DEFAULT '[]',

        -- Metadata
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_branch_modified
        ON branch_deltas(last_modified);

      CREATE INDEX IF NOT EXISTS idx_branch_commit
        ON branch_deltas(base_commit_sha);
    `);

    log.i("LAYEREDCACHE", "[LayeredCacheManager] Schema initialized");
  }

  private prepareStatements(): void {
    if (!this.db) return;

    // Insert or replace
    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO branch_deltas (
        branch_name, base_commit_sha, last_modified, total_changes,
        entity_added, entity_modified, entity_deleted,
        relationship_added, relationship_modified, relationship_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Select by branch name
    this.selectStmt = this.db.prepare(`
      SELECT * FROM branch_deltas WHERE branch_name = ?
    `);

    // Delete by branch name
    this.deleteStmt = this.db.prepare(`
      DELETE FROM branch_deltas WHERE branch_name = ?
    `);

    // List all branches
    this.listStmt = this.db.prepare(`
      SELECT branch_name FROM branch_deltas ORDER BY last_modified DESC
    `);
  }

  // =========================================================================
  // SAVE / LOAD OPERATIONS (dual-mode: SQLite or in-memory)
  // =========================================================================

  /**
   * Save branch delta
   */
  async saveBranchDelta(delta: BranchDelta): Promise<void> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      this.memoryCache.set(delta.branchName, delta);
      log.i(
        "LAYEREDCACHE",
        `[LayeredCacheManager] Saved delta in-memory for branch: ${delta.branchName} (${delta.totalChanges} changes)`,
      );
      return;
    }

    // SQLite mode (Bun)
    if (!this.insertStmt) {
      throw new Error("LayeredCacheManager not initialized");
    }

    try {
      // Serialize delta to JSON
      const serialized = this.serializeDelta(delta);

      this.insertStmt.run(
        delta.branchName,
        delta.baseCommitSha,
        delta.lastModified,
        delta.totalChanges,
        serialized.entityAdded,
        serialized.entityModified,
        serialized.entityDeleted,
        serialized.relationshipAdded,
        serialized.relationshipModified,
        serialized.relationshipDeleted,
      );

      log.i(
        "LAYEREDCACHE",
        `[LayeredCacheManager] Saved delta for branch: ${delta.branchName} (${delta.totalChanges} changes)`,
      );
    } catch (error) {
      log.e("LAYEREDCACHE", "delta_save_fail", { err: String(error), branch: delta.branchName });
      throw error;
    }
  }

  /**
   * Load branch delta
   */
  async loadBranchDelta(branchName: string): Promise<BranchDelta | null> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      return this.memoryCache.get(branchName) || null;
    }

    // SQLite mode (Bun)
    if (!this.selectStmt) {
      throw new Error("LayeredCacheManager not initialized");
    }

    try {
      const row = this.selectStmt.get(branchName) as any;

      if (!row) {
        return null;
      }

      // Deserialize from JSON
      const delta = this.deserializeDelta(row);

      log.i(
        "LAYEREDCACHE",
        `[LayeredCacheManager] Loaded delta for branch: ${branchName} (${delta.totalChanges} changes)`,
      );

      return delta;
    } catch (error) {
      log.e("LAYEREDCACHE", "delta_load_fail", { err: String(error), branch: branchName });
      return null;
    }
  }

  /**
   * Delete branch delta
   */
  async deleteBranchDelta(branchName: string): Promise<void> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      this.memoryCache.delete(branchName);
      log.i("LAYEREDCACHE", `[LayeredCacheManager] Deleted delta in-memory for branch: ${branchName}`);
      return;
    }

    // SQLite mode (Bun)
    if (!this.deleteStmt) {
      throw new Error("LayeredCacheManager not initialized");
    }

    try {
      this.deleteStmt.run(branchName);
      log.i("LAYEREDCACHE", `[LayeredCacheManager] Deleted delta for branch: ${branchName}`);
    } catch (error) {
      log.e("LAYEREDCACHE", "delta_delete_fail", { err: String(error), branch: branchName });
      throw error;
    }
  }

  /**
   * Get all cached branch names
   */
  async getCachedBranches(): Promise<string[]> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      return Array.from(this.memoryCache.keys());
    }

    // SQLite mode (Bun)
    if (!this.listStmt) {
      throw new Error("LayeredCacheManager not initialized");
    }

    try {
      const rows = this.listStmt.all() as Array<{ branch_name: string }>;
      return rows.map((row) => row.branch_name);
    } catch (error) {
      log.e("LAYEREDCACHE", "list_branches_fail", { err: String(error) });
      return [];
    }
  }

  // =========================================================================
  // SERIALIZATION / DESERIALIZATION
  // =========================================================================

  /**
   * Serialize branch delta to JSON strings
   */
  private serializeDelta(delta: BranchDelta): {
    entityAdded: string;
    entityModified: string;
    entityDeleted: string;
    relationshipAdded: string;
    relationshipModified: string;
    relationshipDeleted: string;
  } {
    return {
      entityAdded: JSON.stringify(Array.from(delta.entityDelta.added.entries())),
      entityModified: JSON.stringify(Array.from(delta.entityDelta.modified.entries())),
      entityDeleted: JSON.stringify(Array.from(delta.entityDelta.deleted)),
      relationshipAdded: JSON.stringify(Array.from(delta.relationshipDelta.added.entries())),
      relationshipModified: JSON.stringify(Array.from(delta.relationshipDelta.modified.entries())),
      relationshipDeleted: JSON.stringify(Array.from(delta.relationshipDelta.deleted)),
    };
  }

  /**
   * Deserialize branch delta from database row
   */
  private deserializeDelta(row: any): BranchDelta {
    const delta = new BranchDelta(row.branch_name, row.base_commit_sha);
    delta.lastModified = row.last_modified;

    // Parse entity delta
    try {
      const entityAdded = JSON.parse(row.entity_added || "[]");
      const entityModified = JSON.parse(row.entity_modified || "[]");
      const entityDeleted = JSON.parse(row.entity_deleted || "[]");

      delta.entityDelta.added = new Map(entityAdded);
      delta.entityDelta.modified = new Map(entityModified);
      delta.entityDelta.deleted = new Set(entityDeleted);
    } catch (error) {
      log.e("LAYEREDCACHE", "entity_parse_fail", { err: String(error), branch: row.branch_name });
    }

    // Parse relationship delta
    try {
      const relationshipAdded = JSON.parse(row.relationship_added || "[]");
      const relationshipModified = JSON.parse(row.relationship_modified || "[]");
      const relationshipDeleted = JSON.parse(row.relationship_deleted || "[]");

      delta.relationshipDelta.added = new Map(relationshipAdded);
      delta.relationshipDelta.modified = new Map(relationshipModified);
      delta.relationshipDelta.deleted = new Set(relationshipDeleted);
    } catch (error) {
      log.e("LAYEREDCACHE", "rel_parse_fail", { err: String(error), branch: row.branch_name });
    }

    return delta;
  }

  // =========================================================================
  // MAINTENANCE OPERATIONS
  // =========================================================================

  /**
   * Get database statistics
   */
  getStatistics(): {
    totalBranches: number;
    totalChanges: number;
    databaseSize: number;
  } {
    if (!this.db) {
      return {
        totalBranches: this.memoryCache.size,
        totalChanges: Array.from(this.memoryCache.values()).reduce((sum, d) => sum + d.totalChanges, 0),
        databaseSize: 0,
      };
    }

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_branches,
        SUM(total_changes) as total_changes
      FROM branch_deltas
    `);

    const row = stmt.get() as any;

    // Get database file size
    let databaseSize = 0;
    try {
      const fs = require("node:fs");
      const stats = fs.statSync(this.dbPath);
      databaseSize = stats.size;
    } catch {
      // Ignore errors
    }

    return {
      totalBranches: row?.total_branches || 0,
      totalChanges: row?.total_changes || 0,
      databaseSize,
    };
  }

  /**
   * Compact database (VACUUM)
   */
  compact(): void {
    if (!this.db) return;

    log.i("LAYEREDCACHE", "[LayeredCacheManager] Compacting database...");

    try {
      this.db.exec("VACUUM");
      log.i("LAYEREDCACHE", "[LayeredCacheManager] Database compacted successfully");
    } catch (error) {
      log.e("LAYEREDCACHE", "compact_fail", { err: String(error) });
    }
  }

  /**
   * Delete old deltas (older than N days)
   */
  async deleteOldDeltas(olderThanDays: number = 30): Promise<number> {
    if (!this.db) return 0;

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    try {
      const stmt = this.db.prepare(`
        DELETE FROM branch_deltas
        WHERE last_modified < ?
      `);

      const result = stmt.run(cutoffTime);

      const deletedCount = result.changes;
      log.i(
        "LAYEREDCACHE",
        `[LayeredCacheManager] Deleted ${deletedCount} old deltas (older than ${olderThanDays} days)`,
      );

      return deletedCount;
    } catch (error) {
      log.e("LAYEREDCACHE", "old_deltas_fail", { err: String(error) });
      return 0;
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Close database connection
   */
  close(): void {
    log.i("LAYEREDCACHE", "[LayeredCacheManager] Closing database...");

    if (this.db) {
      this.db.close();
    }
  }
}
