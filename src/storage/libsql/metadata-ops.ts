/**
 * Metadata Operations for LibSQL Graph Adapter
 *
 * Handles all metadata operations: file info, project metadata,
 * incremental tracking, branch listing, stats, and clear operations.
 */

import { log } from "../../logging/index.js";
import type { FileInfo } from "../../types/storage.js";
import type { ClientGetter, ContextGetter } from "./types.js";

// =============================================================================
// METADATA OPERATIONS CLASS
// =============================================================================

export class MetadataOperations {
  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
  ) {}

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  /**
   * Update or insert file info
   */
  async updateFileInfo(info: FileInfo): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    await client.execute({
      sql: `
        INSERT OR REPLACE INTO files
        (path, project_hash, branch_name, hash, last_indexed, entity_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [info.path, projectHash, branchName, info.hash, info.lastIndexed, info.entityCount],
    });
  }

  /**
   * Get file info by path
   */
  async getFileInfo(path: string): Promise<FileInfo | null> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const result = await client.execute({
      sql: "SELECT * FROM files WHERE path = ? AND project_hash = ? AND branch_name = ?",
      args: [path, projectHash, branchName],
    });

    if (result.rows.length === 0 || !result.rows[0]) return null;
    const row = result.rows[0];
    return {
      path: row["path"] as string,
      hash: row["hash"] as string,
      lastIndexed: row["last_indexed"] as number,
      entityCount: row["entity_count"] as number,
    };
  }

  /**
   * Get files that were indexed before the specified timestamp
   */
  async getOutdatedFiles(since: number): Promise<FileInfo[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const result = await client.execute({
      sql: `
        SELECT * FROM files
        WHERE project_hash = ? AND branch_name = ? AND last_indexed < ?
      `,
      args: [projectHash, branchName, since],
    });

    return result.rows.map((row) => ({
      path: row["path"] as string,
      hash: row["hash"] as string,
      lastIndexed: row["last_indexed"] as number,
      entityCount: row["entity_count"] as number,
    }));
  }

  /**
   * Get all indexed files with their lastIndexed timestamps
   * Used for incremental indexing to compare with file mtime
   */
  async getAllIndexedFiles(): Promise<Map<string, number>> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const result = await client.execute({
      sql: `
        SELECT path, last_indexed FROM files
        WHERE project_hash = ? AND branch_name = ?
      `,
      args: [projectHash, branchName],
    });

    const fileMap = new Map<string, number>();
    for (const row of result.rows) {
      const path = row["path"] as string;
      const lastIndexed = row["last_indexed"] as number;
      // Store with forward slashes for consistency
      fileMap.set(path.replace(/\\/g, "/"), lastIndexed);
    }
    return fileMap;
  }

  /**
   * Delete file info by path
   */
  async deleteFileInfo(path: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const forwardPath = path.replace(/\\/g, "/");
    const backPath = path.replace(/\//g, "\\");

    await client.execute({
      sql: `
        DELETE FROM files
        WHERE project_hash = ? AND branch_name = ?
        AND (path = ? OR path = ?)
      `,
      args: [projectHash, branchName, forwardPath, backPath],
    });
  }

  // ===========================================================================
  // PROJECT METADATA
  // ===========================================================================

  /**
   * Update project metadata after indexing
   */
  async updateProjectMetadata(projectPath: string, isFullIndex = false): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    // Count entities and files
    const entityCount = await client.execute({
      sql: "SELECT COUNT(*) as count FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });
    const fileCount = await client.execute({
      sql: "SELECT COUNT(*) as count FROM files WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });

    // Get existing tracking data to preserve it (or reset if full index)
    const existing = await client.execute({
      sql: `SELECT last_full_index_at, incremental_changes_count, created_at
            FROM project_metadata WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });

    const existingRow = existing.rows[0];
    const createdAt = (existingRow?.["created_at"] as number) || now;

    // On full index: reset counter and update last_full_index_at
    // On incremental: preserve existing values
    const lastFullIndexAt = isFullIndex ? now : (existingRow?.["last_full_index_at"] as number) || 0;
    const incrementalChangesCount = isFullIndex ? 0 : (existingRow?.["incremental_changes_count"] as number) || 0;

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO project_metadata
        (project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count,
         created_at, updated_at, last_full_index_at, incremental_changes_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        projectHash,
        branchName,
        projectPath,
        now,
        (entityCount.rows[0]?.["count"] as number) || 0,
        (fileCount.rows[0]?.["count"] as number) || 0,
        createdAt,
        now,
        lastFullIndexAt,
        incrementalChangesCount,
      ],
    });
  }

  /**
   * Get incremental tracking info for the current project/branch
   */
  async getIncrementalTrackingInfo(): Promise<{
    lastFullIndexAt: number;
    incrementalChangesCount: number;
    totalFiles: number;
  }> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    const result = await client.execute({
      sql: `SELECT last_full_index_at, incremental_changes_count, file_count
            FROM project_metadata WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });

    if (result.rows.length === 0) {
      return { lastFullIndexAt: 0, incrementalChangesCount: 0, totalFiles: 0 };
    }

    const row = result.rows[0]!;
    return {
      lastFullIndexAt: (row["last_full_index_at"] as number) || 0,
      incrementalChangesCount: (row["incremental_changes_count"] as number) || 0,
      totalFiles: (row["file_count"] as number) || 0,
    };
  }

  /**
   * Record incremental file changes (called after each incremental update)
   */
  async recordIncrementalChanges(changedFileCount: number): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    await client.execute({
      sql: `UPDATE project_metadata
            SET incremental_changes_count = incremental_changes_count + ?,
                updated_at = ?
            WHERE project_hash = ? AND branch_name = ?`,
      args: [changedFileCount, Date.now(), projectHash, branchName],
    });
  }

  /**
   * Reset incremental tracking (called after full index)
   */
  async resetIncrementalTracking(): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    await client.execute({
      sql: `UPDATE project_metadata
            SET last_full_index_at = ?,
                incremental_changes_count = 0,
                updated_at = ?
            WHERE project_hash = ? AND branch_name = ?`,
      args: [now, now, projectHash, branchName],
    });
  }

  /**
   * List all projects in the database
   */
  async listProjects(): Promise<
    Array<{
      projectHash: string;
      branchName: string;
      projectPath: string;
      lastIndexedAt: number;
      entityCount: number;
      fileCount: number;
    }>
  > {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const result = await client.execute(`
      SELECT project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count
      FROM project_metadata
      ORDER BY updated_at DESC
    `);

    return result.rows.map((r) => ({
      projectHash: r["project_hash"] as string,
      branchName: r["branch_name"] as string,
      projectPath: r["project_path"] as string,
      lastIndexedAt: r["last_indexed_at"] as number,
      entityCount: r["entity_count"] as number,
      fileCount: r["file_count"] as number,
    }));
  }

  /**
   * List all branches for current project
   */
  async listBranches(): Promise<string[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash } = this.getContext();
    const result = await client.execute({
      sql: `
        SELECT DISTINCT branch_name FROM project_metadata
        WHERE project_hash = ?
        ORDER BY branch_name
      `,
      args: [projectHash],
    });

    return result.rows.map((r) => r["branch_name"] as string);
  }

  // ===========================================================================
  // STATS
  // ===========================================================================

  /**
   * Get stats for current project/branch
   * Uses layered approach: if baseBranch is set and different from current, includes both
   */
  async getStats(): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // Layered read: include base branch if set and different from current
    const useLayered = baseBranch && baseBranch !== branchName;
    const branchFilter = useLayered ? "branch_name IN (?, ?)" : "branch_name = ?";
    const branchArgs = useLayered ? [baseBranch, branchName] : [branchName];

    const [entities, relationships, files] = await Promise.all([
      client.execute({
        sql: `SELECT COUNT(*) as cnt FROM entities WHERE project_hash = ? AND ${branchFilter}`,
        args: [projectHash, ...branchArgs],
      }),
      client.execute({
        sql: `SELECT COUNT(*) as cnt FROM relationships WHERE project_hash = ? AND ${branchFilter}`,
        args: [projectHash, ...branchArgs],
      }),
      client.execute({
        sql: `SELECT COUNT(*) as cnt FROM files WHERE project_hash = ? AND ${branchFilter}`,
        args: [projectHash, ...branchArgs],
      }),
    ]);

    return {
      totalEntities: (entities.rows[0]?.["cnt"] as number) || 0,
      totalRelationships: (relationships.rows[0]?.["cnt"] as number) || 0,
      totalFiles: (files.rows[0]?.["cnt"] as number) || 0,
      totalEmbeddings: 0, // v5: embeddings stored in FAISS, not LibSQL
    };
  }

  /**
   * Get stats across all projects
   */
  async getTotalStats(): Promise<{
    totalEntities: number;
    totalRelationships: number;
    totalFiles: number;
    totalEmbeddings: number;
  }> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const [entities, relationships, files] = await Promise.all([
      client.execute("SELECT COUNT(*) as cnt FROM entities"),
      client.execute("SELECT COUNT(*) as cnt FROM relationships"),
      client.execute("SELECT COUNT(*) as cnt FROM files"),
    ]);

    return {
      totalEntities: (entities.rows[0]?.["cnt"] as number) || 0,
      totalRelationships: (relationships.rows[0]?.["cnt"] as number) || 0,
      totalFiles: (files.rows[0]?.["cnt"] as number) || 0,
      totalEmbeddings: 0, // v5: embeddings stored in FAISS, not LibSQL
    };
  }

  // ===========================================================================
  // CLEAR OPERATIONS
  // ===========================================================================

  /**
   * Clear all data for current project/branch
   */
  async clear(): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    await client.batch(
      [
        // NOTE: embeddings table removed in v5 - FAISS handles vector storage
        {
          sql: "DELETE FROM relationships WHERE project_hash = ? AND branch_name = ?",
          args: [projectHash, branchName],
        },
        { sql: "DELETE FROM entities WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        { sql: "DELETE FROM files WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        { sql: "DELETE FROM query_cache WHERE project_hash = ? AND branch_name = ?", args: [projectHash, branchName] },
        {
          sql: "DELETE FROM project_metadata WHERE project_hash = ? AND branch_name = ?",
          args: [projectHash, branchName],
        },
      ],
      "write",
    );

    log.i("METADATAOPS", "data_cleared", { ctx: `${projectHash}/${branchName}` });
  }

  /**
   * Clear ALL data in the database
   */
  async clearAll(): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    await client.batch(
      [
        // NOTE: embeddings table removed in v5 - FAISS handles vector storage
        { sql: "DELETE FROM relationships", args: [] },
        { sql: "DELETE FROM entities", args: [] },
        { sql: "DELETE FROM files", args: [] },
        { sql: "DELETE FROM query_cache", args: [] },
        { sql: "DELETE FROM project_metadata", args: [] },
      ],
      "write",
    );

    log.i("METADATAOPS", "all_data_cleared");
  }
}
