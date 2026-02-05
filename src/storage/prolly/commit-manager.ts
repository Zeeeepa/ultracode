/**
 * Commit Manager - Graph Versioning
 *
 * Manages commits (snapshots) of the graph state.
 * Each commit references a Prolly Tree root hash and optional file tree hash.
 *
 * Features:
 * - Create commits from current graph state
 * - Branch head management
 * - Commit history traversal
 * - Time travel (checkout previous commits)
 */

import type { Client } from "@libsql/client";
import xxhash from "xxhash-wasm";
import { log } from "../../logging/index.js";
import type { BranchHead, GraphCommit } from "./types.js";

// =============================================================================
// COMMIT MANAGER
// =============================================================================

export class CommitManager {
  private client: Client | null = null;
  private projectHash: string = "";
  private branchName: string = "";
  private xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;
  private isInitialized = false;

  /**
   * Initialize the commit manager
   */
  async initialize(client: Client): Promise<void> {
    this.client = client;
    this.xxhashInstance = await xxhash();
    await this.createTables();
    this.isInitialized = true;
    log.i("COMMIT_MGR", "initialized");
  }

  /**
   * Update the client reference (called after flush() in LibSQLGraphAdapter)
   */
  updateClient(client: Client): void {
    this.client = client;
  }

  /**
   * Create the commits and branch_heads tables
   */
  private async createTables(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS graph_commits (
          commit_hash TEXT PRIMARY KEY,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          parent_hash TEXT,
          root_node_hash TEXT NOT NULL,
          file_tree_hash TEXT,
          message TEXT,
          entity_count INTEGER NOT NULL DEFAULT 0,
          relationship_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_commits_branch ON graph_commits(project_hash, branch_name, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_commits_parent ON graph_commits(parent_hash)`,
        `CREATE TABLE IF NOT EXISTS branch_heads (
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          commit_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (project_hash, branch_name)
        )`,
      ],
      "write",
    );
  }

  /**
   * Set the current project context
   */
  setContext(projectHash: string, branchName: string): void {
    this.projectHash = projectHash;
    this.branchName = branchName;
  }

  // ===========================================================================
  // COMMIT OPERATIONS
  // ===========================================================================

  /**
   * Create a new commit
   */
  async commit(
    rootNodeHash: string,
    fileTreeHash: string | null,
    stats: { entityCount: number; relationshipCount: number },
    message?: string,
  ): Promise<GraphCommit> {
    if (!this.client) throw new Error("Client not initialized");
    if (!this.xxhashInstance) throw new Error("xxHash not initialized");

    // Get parent commit (current head)
    const parentCommit = await this.getBranchHead();
    const parentHash = parentCommit?.commitHash || null;

    // Compute commit hash
    const now = Date.now();
    const commitInput = `${this.projectHash}|${this.branchName}|${parentHash || ""}|${rootNodeHash}|${now}`;
    const commitHash = this.xxhashInstance.h64ToString(commitInput);

    const commit: GraphCommit = {
      commitHash,
      projectHash: this.projectHash,
      branchName: this.branchName,
      parentHash,
      rootNodeHash,
      fileTreeHash,
      message,
      entityCount: stats.entityCount,
      relationshipCount: stats.relationshipCount,
      createdAt: now,
    };

    // Insert commit
    await this.client.execute({
      sql: `INSERT INTO graph_commits
            (commit_hash, project_hash, branch_name, parent_hash, root_node_hash, file_tree_hash, message, entity_count, relationship_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        commit.commitHash,
        commit.projectHash,
        commit.branchName,
        commit.parentHash,
        commit.rootNodeHash,
        commit.fileTreeHash,
        commit.message || null,
        commit.entityCount,
        commit.relationshipCount,
        commit.createdAt,
      ],
    });

    // Update branch head
    await this.updateBranchHead(commitHash);

    log.i("COMMIT_MGR", "commit_created", {
      hash: commitHash.slice(0, 8),
      entities: stats.entityCount,
      parent: parentHash?.slice(0, 8) || "none",
    });

    return commit;
  }

  /**
   * Get a commit by hash
   */
  async getCommit(commitHash: string): Promise<GraphCommit | null> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: "SELECT * FROM graph_commits WHERE commit_hash = ?",
      args: [commitHash],
    });

    const row = result.rows[0];
    if (!row) return null;

    return this.rowToCommit(row);
  }

  /**
   * Get commit history for current branch
   */
  async getHistory(limit: number = 100): Promise<GraphCommit[]> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: `SELECT * FROM graph_commits
            WHERE project_hash = ? AND branch_name = ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [this.projectHash, this.branchName, limit],
    });

    return result.rows
      .filter((row) => row !== undefined)
      .map((row) => this.rowToCommit(row as Record<string, unknown>));
  }

  /**
   * Get commits within a time range for the current branch.
   * Used for analyzing change frequency in hotspot detection.
   */
  async getCommitsSince(sinceTimestamp: number, limit: number = 1000): Promise<GraphCommit[]> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: `SELECT * FROM graph_commits
            WHERE project_hash = ? AND branch_name = ?
              AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [this.projectHash, this.branchName, sinceTimestamp, limit],
    });

    return result.rows
      .filter((row) => row !== undefined)
      .map((row) => this.rowToCommit(row as Record<string, unknown>));
  }

  /**
   * Get commit history starting from a specific commit
   */
  async getHistoryFrom(commitHash: string, limit: number = 100): Promise<GraphCommit[]> {
    if (!this.client) throw new Error("Client not initialized");

    const commits: GraphCommit[] = [];
    let currentHash: string | null = commitHash;

    while (currentHash && commits.length < limit) {
      const commit = await this.getCommit(currentHash);
      if (!commit) break;

      commits.push(commit);
      currentHash = commit.parentHash;
    }

    return commits;
  }

  /**
   * Get the path between two commits
   */
  async getCommitPath(fromHash: string, toHash: string): Promise<GraphCommit[]> {
    // Simple approach: get ancestors of both, find common ancestor
    const fromAncestors = await this.getHistoryFrom(fromHash);
    const toAncestors = await this.getHistoryFrom(toHash);

    const fromSet = new Set(fromAncestors.map((c) => c.commitHash));

    // Find first common ancestor
    let commonAncestor: string | null = null;
    for (const commit of toAncestors) {
      if (fromSet.has(commit.commitHash)) {
        commonAncestor = commit.commitHash;
        break;
      }
    }

    if (!commonAncestor) {
      // No common ancestor - return direct path
      return toAncestors;
    }

    // Build path from 'from' to common ancestor, then to 'to'
    const path: GraphCommit[] = [];

    // Add commits from 'from' to common ancestor (in reverse)
    for (const commit of fromAncestors) {
      if (commit.commitHash === commonAncestor) break;
      path.push(commit);
    }

    // Add commits from common ancestor to 'to' (already in correct order)
    for (let i = toAncestors.length - 1; i >= 0; i--) {
      const commit = toAncestors[i];
      if (!commit) continue;
      if (commit.commitHash === commonAncestor) {
        path.push(commit);
        break;
      }
    }

    for (const commit of toAncestors) {
      if (commit.commitHash === commonAncestor) continue;
      path.push(commit);
    }

    return path;
  }

  // ===========================================================================
  // BRANCH HEAD OPERATIONS
  // ===========================================================================

  /**
   * Get the current branch head commit
   */
  async getBranchHead(projectHash?: string, branchName?: string): Promise<GraphCommit | null> {
    if (!this.client) throw new Error("Client not initialized");

    const ph = projectHash || this.projectHash;
    const bn = branchName || this.branchName;

    const result = await this.client.execute({
      sql: "SELECT commit_hash FROM branch_heads WHERE project_hash = ? AND branch_name = ?",
      args: [ph, bn],
    });

    const row = result.rows[0];
    if (!row) return null;

    const commitHash = row["commit_hash"] as string;
    return this.getCommit(commitHash);
  }

  /**
   * Update branch head to point to a new commit
   */
  async updateBranchHead(commitHash: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.execute({
      sql: `INSERT OR REPLACE INTO branch_heads (project_hash, branch_name, commit_hash, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [this.projectHash, this.branchName, commitHash, Date.now()],
    });
  }

  /**
   * Get all branch heads for a project
   */
  async getAllBranchHeads(projectHash?: string): Promise<BranchHead[]> {
    if (!this.client) throw new Error("Client not initialized");

    const ph = projectHash || this.projectHash;

    const result = await this.client.execute({
      sql: "SELECT * FROM branch_heads WHERE project_hash = ?",
      args: [ph],
    });

    return result.rows.map(
      (row) =>
        ({
          projectHash: row["project_hash"] as string,
          branchName: row["branch_name"] as string,
          commitHash: row["commit_hash"] as string,
          updatedAt: row["updated_at"] as number,
        }) as BranchHead,
    );
  }

  // ===========================================================================
  // CHECKOUT (TIME TRAVEL)
  // ===========================================================================

  /**
   * Get the root hash for a specific commit (for time travel queries)
   */
  async getRootHashAt(commitHash: string): Promise<string | null> {
    const commit = await this.getCommit(commitHash);
    return commit?.rootNodeHash || null;
  }

  /**
   * Get the file tree hash for a specific commit
   */
  async getFileTreeHashAt(commitHash: string): Promise<string | null> {
    const commit = await this.getCommit(commitHash);
    return commit?.fileTreeHash || null;
  }

  /**
   * Find the commit where a condition was first true.
   * Useful for "when was this entity added/changed" queries.
   */
  async findCommitWhere(
    predicate: (commit: GraphCommit) => Promise<boolean>,
    limit: number = 100,
  ): Promise<GraphCommit | null> {
    const history = await this.getHistory(limit);

    for (const commit of history) {
      if (await predicate(commit)) {
        return commit;
      }
    }

    return null;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get commit statistics
   */
  async getStats(): Promise<{
    totalCommits: number;
    branchCount: number;
    oldestCommit: number | null;
    newestCommit: number | null;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const countResult = await this.client.execute({
      sql: `SELECT
              COUNT(*) as total,
              MIN(created_at) as oldest,
              MAX(created_at) as newest
            FROM graph_commits
            WHERE project_hash = ?`,
      args: [this.projectHash],
    });

    const branchResult = await this.client.execute({
      sql: "SELECT COUNT(DISTINCT branch_name) as branches FROM branch_heads WHERE project_hash = ?",
      args: [this.projectHash],
    });

    const row = countResult.rows[0] as Record<string, unknown> | undefined;
    const branchRow = branchResult.rows[0] as Record<string, unknown> | undefined;
    return {
      totalCommits: Number(row?.["total"] ?? 0),
      branchCount: Number(branchRow?.["branches"] ?? 0),
      oldestCommit: row?.["oldest"] ? Number(row["oldest"]) : null,
      newestCommit: row?.["newest"] ? Number(row["newest"]) : null,
    };
  }

  // ===========================================================================
  // GARBAGE COLLECTION
  // ===========================================================================

  /**
   * Get all root hashes that are still referenced by commits.
   * Used for garbage collecting orphaned Prolly tree nodes.
   */
  async getActiveRootHashes(): Promise<Set<string>> {
    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: "SELECT DISTINCT root_node_hash FROM graph_commits WHERE project_hash = ?",
      args: [this.projectHash],
    });

    return new Set(result.rows.map((r) => r["root_node_hash"] as string));
  }

  /**
   * Delete old commits, keeping only the most recent N.
   * Returns number of deleted commits.
   */
  async pruneHistory(keepCount: number): Promise<number> {
    if (!this.client) throw new Error("Client not initialized");

    // Get commits to keep (most recent)
    const toKeep = await this.client.execute({
      sql: `SELECT commit_hash FROM graph_commits
            WHERE project_hash = ? AND branch_name = ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [this.projectHash, this.branchName, keepCount],
    });

    const keepHashes = new Set(toKeep.rows.map((r) => r["commit_hash"] as string));

    // Delete all other commits for this branch
    const result = await this.client.execute({
      sql: `DELETE FROM graph_commits
            WHERE project_hash = ? AND branch_name = ?
            AND commit_hash NOT IN (${Array.from(keepHashes)
              .map(() => "?")
              .join(",")})`,
      args: [this.projectHash, this.branchName, ...Array.from(keepHashes)],
    });

    if (result.rowsAffected > 0) {
      log.i("COMMIT_MGR", "history_pruned", { deleted: result.rowsAffected, kept: keepCount });
    }

    return result.rowsAffected;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private rowToCommit(row: Record<string, unknown>): GraphCommit {
    return {
      commitHash: row["commit_hash"] as string,
      projectHash: row["project_hash"] as string,
      branchName: row["branch_name"] as string,
      parentHash: (row["parent_hash"] as string) || null,
      rootNodeHash: row["root_node_hash"] as string,
      fileTreeHash: (row["file_tree_hash"] as string) || null,
      message: (row["message"] as string) || undefined,
      entityCount: row["entity_count"] as number,
      relationshipCount: row["relationship_count"] as number,
      createdAt: row["created_at"] as number,
    };
  }

  /**
   * Check if manager is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }
}
