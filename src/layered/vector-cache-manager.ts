/**
 * Vector Cache Manager - SQLite Persistence for Vector Deltas
 *
 * Manages persistent storage of branch vector deltas using SQLite.
 * Ensures vector deltas survive server restarts.
 *
 * Storage strategy:
 * - Vectors stored as BLOB (efficient binary format)
 * - Entity IDs and metadata as TEXT
 * - Compressed storage for large vector sets
 *
 * Database location: %LOCALAPPDATA%/UltraScriptTools/projects/<hash>/layered/vector-deltas.db
 *
 * Based on: ultrasharp-tools-mcp VectorCacheManager.cs + LayeredCacheManager.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "../logging/index.js";
import type { SQLiteDatabase, SQLiteStatement } from "../storage/sqlite-adapter.js";
import { isSyncSQLiteAvailable, loadSQLiteModule } from "../storage/sqlite-adapter.js";
import { VectorDelta } from "./vector-delta.js";

// =============================================================================
// VECTOR SERIALIZATION HELPERS
// =============================================================================

/**
 * Serialize Map<string, Float32Array> to BLOB
 *
 * Format:
 * - 4 bytes: count (number of entries)
 * - For each entry:
 *   - 4 bytes: ID length
 *   - N bytes: ID string (UTF-8)
 *   - 4 bytes: vector length
 *   - N*4 bytes: vector data (Float32)
 */
function serializeVectorMap(map: Map<string, Float32Array>): Buffer {
  const buffers: Buffer[] = [];
  const encoder = new TextEncoder();

  // Count
  const countBuf = Buffer.allocUnsafe(4);
  countBuf.writeUInt32LE(map.size, 0);
  buffers.push(countBuf);

  for (const [id, vector] of map) {
    // ID length + ID
    const idBytes = encoder.encode(id);
    const idLenBuf = Buffer.allocUnsafe(4);
    idLenBuf.writeUInt32LE(idBytes.length, 0);
    buffers.push(idLenBuf);
    buffers.push(Buffer.from(idBytes));

    // Vector length + Vector data
    const vecLenBuf = Buffer.allocUnsafe(4);
    vecLenBuf.writeUInt32LE(vector.length, 0);
    buffers.push(vecLenBuf);
    buffers.push(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
  }

  return Buffer.concat(buffers);
}

/**
 * Deserialize BLOB to Map<string, Float32Array>
 */
function deserializeVectorMap(buffer: Buffer): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>();
  const decoder = new TextDecoder();

  let offset = 0;

  // Read count
  const count = buffer.readUInt32LE(offset);
  offset += 4;

  for (let i = 0; i < count; i++) {
    // Read ID
    const idLen = buffer.readUInt32LE(offset);
    offset += 4;

    const idBytes = buffer.subarray(offset, offset + idLen);
    const id = decoder.decode(idBytes);
    offset += idLen;

    // Read vector
    const vecLen = buffer.readUInt32LE(offset);
    offset += 4;

    const vecBytes = buffer.subarray(offset, offset + vecLen * 4);
    const vector = new Float32Array(vecBytes.buffer, vecBytes.byteOffset, vecLen);
    offset += vecLen * 4;

    map.set(id, vector);
  }

  return map;
}

// =============================================================================
// VECTOR CACHE MANAGER CLASS
// =============================================================================

export class VectorCacheManager {
  private db: SQLiteDatabase | null = null;
  private dbPath: string = "";
  private useInMemoryOnly: boolean = false;

  // In-memory fallback for Node.js
  private memoryCache: Map<string, VectorDelta> = new Map();

  // Prepared statements (only used with SQLite)
  private insertStmt: SQLiteStatement | null = null;
  private selectStmt: SQLiteStatement | null = null;
  private deleteStmt: SQLiteStatement | null = null;
  private listStmt: SQLiteStatement | null = null;

  constructor(workingDirectory: string) {
    // Check if sync SQLite is available (Bun only)
    if (!isSyncSQLiteAvailable()) {
      this.useInMemoryOnly = true;
      log.i("VECCACHE", `[VectorCacheManager] Sync SQLite not available (Node.js), using in-memory only`);
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

    this.dbPath = join(dbDir, "vector-deltas.db");

    // Initialize database
    const SQLiteDatabase = loadSQLiteModule();
    this.db = new SQLiteDatabase(this.dbPath);

    this.initializeSchema();
    this.prepareStatements();

    log.i("VECCACHE", `[VectorCacheManager] Initialized with database: ${this.dbPath}`);
  }

  // =========================================================================
  // SCHEMA INITIALIZATION (SQLite mode only)
  // =========================================================================

  private initializeSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_deltas (
        branch_name TEXT PRIMARY KEY,
        base_commit_sha TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        total_changes INTEGER NOT NULL,
        dimension INTEGER NOT NULL,

        -- Vector data (BLOB)
        vectors_added BLOB,
        vectors_modified BLOB,
        vectors_deleted TEXT NOT NULL DEFAULT '[]',

        -- Metadata
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        memory_usage INTEGER NOT NULL DEFAULT 0,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_vector_deltas_modified
        ON vector_deltas(last_modified);

      CREATE INDEX IF NOT EXISTS idx_vector_deltas_commit
        ON vector_deltas(base_commit_sha);

      CREATE INDEX IF NOT EXISTS idx_vector_deltas_dimension
        ON vector_deltas(dimension);
    `);

    log.i("VECCACHE", "[VectorCacheManager] Schema initialized");
  }

  private prepareStatements(): void {
    if (!this.db) return;

    // Insert or replace
    this.insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO vector_deltas (
        branch_name, base_commit_sha, last_modified, total_changes, dimension,
        vectors_added, vectors_modified, vectors_deleted, memory_usage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Select by branch name
    this.selectStmt = this.db.prepare(`
      SELECT * FROM vector_deltas WHERE branch_name = ?
    `);

    // Delete by branch name
    this.deleteStmt = this.db.prepare(`
      DELETE FROM vector_deltas WHERE branch_name = ?
    `);

    // List all branches
    this.listStmt = this.db.prepare(`
      SELECT branch_name FROM vector_deltas ORDER BY last_modified DESC
    `);
  }

  // =========================================================================
  // SAVE / LOAD OPERATIONS (dual-mode: SQLite or in-memory)
  // =========================================================================

  /**
   * Save vector delta
   */
  async saveVectorDelta(delta: VectorDelta): Promise<void> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      this.memoryCache.set(delta.branchName, delta);
      log.i(
        "VECCACHE",
        `[VectorCacheManager] Saved delta in-memory for branch: ${delta.branchName} ` +
          `(${delta.totalChanges} changes)`,
      );
      return;
    }

    // SQLite mode (Bun)
    if (!this.insertStmt) {
      throw new Error("VectorCacheManager not initialized");
    }

    try {
      // Serialize vectors to BLOB
      const vectorsAdded = serializeVectorMap(delta.addedEmbeddings);
      const vectorsModified = serializeVectorMap(delta.modifiedEmbeddings);
      const vectorsDeleted = JSON.stringify(Array.from(delta.deletedEmbeddingIds));

      this.insertStmt.run(
        delta.branchName,
        delta.baseCommitSha,
        delta.lastModified,
        delta.totalChanges,
        delta.getDimension(),
        vectorsAdded,
        vectorsModified,
        vectorsDeleted,
        delta.getMemoryUsage(),
      );

      log.i(
        "VECCACHE",
        `[VectorCacheManager] Saved delta for branch: ${delta.branchName} ` +
          `(${delta.totalChanges} changes, ${(delta.getMemoryUsage() / 1024 / 1024).toFixed(2)} MB)`,
      );
    } catch (error) {
      log.e("VECCACHE", "save_delta_fail", { branch: delta.branchName, err: String(error) });
      throw error;
    }
  }

  /**
   * Load vector delta
   */
  async loadVectorDelta(branchName: string): Promise<VectorDelta | null> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      return this.memoryCache.get(branchName) || null;
    }

    // SQLite mode (Bun)
    if (!this.selectStmt) {
      throw new Error("VectorCacheManager not initialized");
    }

    try {
      const row = this.selectStmt.get(branchName) as any;

      if (!row) {
        return null;
      }

      // Deserialize from BLOB
      const delta = new VectorDelta(row.branch_name, row.base_commit_sha);
      delta.lastModified = row.last_modified;

      // Deserialize vectors
      if (row.vectors_added && row.vectors_added.length > 0) {
        delta.addedEmbeddings = deserializeVectorMap(row.vectors_added);
      }

      if (row.vectors_modified && row.vectors_modified.length > 0) {
        delta.modifiedEmbeddings = deserializeVectorMap(row.vectors_modified);
      }

      if (row.vectors_deleted) {
        try {
          const deletedArray = JSON.parse(row.vectors_deleted);
          delta.deletedEmbeddingIds = new Set(deletedArray);
        } catch {
          // Ignore parse errors
        }
      }

      log.i(
        "VECCACHE",
        `[VectorCacheManager] Loaded delta for branch: ${branchName} ` +
          `(${delta.totalChanges} changes, ${(delta.getMemoryUsage() / 1024 / 1024).toFixed(2)} MB)`,
      );

      return delta;
    } catch (error) {
      log.e("VECCACHE", "load_delta_fail", { branch: branchName, err: String(error) });
      return null;
    }
  }

  /**
   * Delete vector delta
   */
  async deleteVectorDelta(branchName: string): Promise<void> {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly) {
      this.memoryCache.delete(branchName);
      log.i("VECCACHE", `[VectorCacheManager] Deleted delta in-memory for branch: ${branchName}`);
      return;
    }

    // SQLite mode (Bun)
    if (!this.deleteStmt) {
      throw new Error("VectorCacheManager not initialized");
    }

    try {
      this.deleteStmt.run(branchName);
      log.i("VECCACHE", `[VectorCacheManager] Deleted delta for branch: ${branchName}`);
    } catch (error) {
      log.e("VECCACHE", "del_delta_fail", { branch: branchName, err: String(error) });
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
      throw new Error("VectorCacheManager not initialized");
    }

    try {
      const rows = this.listStmt.all() as Array<{ branch_name: string }>;
      return rows.map((row) => row.branch_name);
    } catch (error) {
      log.e("VECCACHE", "list_branches_fail", { err: String(error) });
      return [];
    }
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
    totalMemoryUsage: number;
    databaseSize: number;
  } {
    // In-memory mode (Node.js)
    if (this.useInMemoryOnly || !this.db) {
      let totalChanges = 0;
      let totalMemory = 0;
      for (const delta of this.memoryCache.values()) {
        totalChanges += delta.totalChanges;
        totalMemory += delta.getMemoryUsage();
      }
      return {
        totalBranches: this.memoryCache.size,
        totalChanges,
        totalMemoryUsage: totalMemory,
        databaseSize: 0,
      };
    }

    // SQLite mode (Bun)
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_branches,
        SUM(total_changes) as total_changes,
        SUM(memory_usage) as total_memory_usage
      FROM vector_deltas
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
      totalMemoryUsage: row?.total_memory_usage || 0,
      databaseSize,
    };
  }

  /**
   * Compact database (VACUUM)
   */
  compact(): void {
    if (!this.db) return;

    log.i("VECCACHE", "[VectorCacheManager] Compacting database...");

    try {
      this.db.exec("VACUUM");
      log.i("VECCACHE", "[VectorCacheManager] Database compacted successfully");
    } catch (error) {
      log.e("VECCACHE", "db_compact_fail", { err: String(error) });
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
        DELETE FROM vector_deltas
        WHERE last_modified < ?
      `);

      const result = stmt.run(cutoffTime);

      const deletedCount = result.changes;
      log.i("VECCACHE", `[VectorCacheManager] Deleted ${deletedCount} old deltas (older than ${olderThanDays} days)`);

      return deletedCount;
    } catch (error) {
      log.e("VECCACHE", "del_old_fail", { err: String(error) });
      return 0;
    }
  }

  /**
   * Get delta info (without loading full vectors)
   */
  getDeltaInfo(branchName: string): {
    branch: string;
    totalChanges: number;
    dimension: number;
    memoryUsage: number;
    lastModified: number;
  } | null {
    if (!this.db) {
      const delta = this.memoryCache.get(branchName);
      if (!delta) return null;
      return {
        branch: branchName,
        totalChanges: delta.totalChanges,
        dimension: delta.getDimension(),
        memoryUsage: delta.getMemoryUsage(),
        lastModified: delta.lastModified,
      };
    }

    try {
      const stmt = this.db.prepare(`
        SELECT branch_name, total_changes, dimension, memory_usage, last_modified
        FROM vector_deltas
        WHERE branch_name = ?
      `);

      const row = stmt.get(branchName) as any;

      if (!row) {
        return null;
      }

      return {
        branch: row.branch_name,
        totalChanges: row.total_changes,
        dimension: row.dimension,
        memoryUsage: row.memory_usage,
        lastModified: row.last_modified,
      };
    } catch (error) {
      log.e("VECCACHE", "delta_info_fail", { branch: branchName, err: String(error) });
      return null;
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Close database connection
   */
  close(): void {
    log.i("VECCACHE", "[VectorCacheManager] Closing database...");

    if (this.db) {
      this.db.close();
    }
  }
}
