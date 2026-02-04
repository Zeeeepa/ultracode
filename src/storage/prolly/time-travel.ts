/**
 * Time Travel API - Query Historical Graph States
 *
 * Provides access to previous versions of the graph through commits.
 * Uses Prolly Tree's content-addressed storage for efficient retrieval.
 *
 * Features:
 * - Get graph state at any commit
 * - Query entity history
 * - Diff between commits
 * - Find when entities were changed
 */

import type { CommitManager } from "./commit-manager.js";
import type { ProllyNodeStore } from "./node-store.js";
import { deserializeEntity, ProllyTree } from "./prolly-tree.js";
import type { CommitDiff, EntityChange, GraphCommit, GraphSnapshot } from "./types.js";

// =============================================================================
// TIME TRAVEL MANAGER
// =============================================================================

export class TimeTravelManager {
  private nodeStore: ProllyNodeStore;
  private commitManager: CommitManager;

  constructor(nodeStore: ProllyNodeStore, commitManager: CommitManager) {
    this.nodeStore = nodeStore;
    this.commitManager = commitManager;
  }

  // ===========================================================================
  // SNAPSHOT QUERIES
  // ===========================================================================

  /**
   * Get graph snapshot at a specific commit
   */
  async getGraphAt(commitHash: string): Promise<GraphSnapshot | null> {
    const commit = await this.commitManager.getCommit(commitHash);
    if (!commit) return null;

    return {
      commit,
      entityCount: commit.entityCount,
      relationshipCount: commit.relationshipCount,
      fileCount: 0, // Would need file Merkle tree to get this
    };
  }

  /**
   * Get entity at a specific commit
   */
  async getEntityAt<T = Record<string, unknown>>(entityId: string, commitHash: string): Promise<T | null> {
    const commit = await this.commitManager.getCommit(commitHash);
    if (!commit) return null;

    // Create a Prolly tree with the commit's root
    const tree = new ProllyTree(this.nodeStore);
    await tree.initialize();
    tree.setRootHash(commit.rootNodeHash);

    // Get the entity
    const data = await tree.get(entityId);
    if (!data) return null;

    return deserializeEntity<T>(data);
  }

  /**
   * Get all entities at a specific commit
   */
  async getAllEntitiesAt<T = Record<string, unknown>>(commitHash: string): Promise<T[]> {
    const commit = await this.commitManager.getCommit(commitHash);
    if (!commit) return [];

    const tree = new ProllyTree(this.nodeStore);
    await tree.initialize();
    tree.setRootHash(commit.rootNodeHash);

    const entries = await tree.getAllEntries();
    return entries.map((e) => deserializeEntity<T>(e.value));
  }

  /**
   * Search entities at a specific commit by prefix
   */
  async searchEntitiesAt<T = Record<string, unknown>>(
    commitHash: string,
    keyPrefix: string,
    limit: number = 100,
  ): Promise<T[]> {
    const commit = await this.commitManager.getCommit(commitHash);
    if (!commit) return [];

    const tree = new ProllyTree(this.nodeStore);
    await tree.initialize();
    tree.setRootHash(commit.rootNodeHash);

    // Use range query with prefix
    const endKey = keyPrefix + "\uffff"; // High unicode char for range end
    const entries = await tree.range(keyPrefix, endKey);

    const results: T[] = [];
    for (const [, value] of entries) {
      if (results.length >= limit) break;
      results.push(deserializeEntity<T>(value));
    }

    return results;
  }

  // ===========================================================================
  // HISTORY QUERIES
  // ===========================================================================

  /**
   * Get history of changes for a specific entity
   */
  async getEntityHistory(entityId: string, limit: number = 100): Promise<EntityChange[]> {
    const history = await this.commitManager.getHistory(limit);
    const changes: EntityChange[] = [];

    let previousValue: Uint8Array | undefined;
    let previousHash: string | undefined;

    // Process commits from newest to oldest
    for (const commit of history) {
      const tree = new ProllyTree(this.nodeStore);
      await tree.initialize();
      tree.setRootHash(commit.rootNodeHash);

      const currentValue = await tree.get(entityId);

      if (!currentValue && previousValue) {
        // Entity was deleted in this commit
        changes.push({
          commitHash: commit.commitHash,
          timestamp: commit.createdAt,
          changeType: "delete",
          oldValue: previousValue,
        });
      } else if (currentValue && !previousValue) {
        // Entity was added in this commit
        changes.push({
          commitHash: commit.commitHash,
          timestamp: commit.createdAt,
          changeType: "add",
          newValue: currentValue,
        });
      } else if (currentValue && previousValue) {
        // Check if modified
        const currentHash = this.nodeStore.hashValue(currentValue);
        if (currentHash !== previousHash) {
          changes.push({
            commitHash: commit.commitHash,
            timestamp: commit.createdAt,
            changeType: "modify",
            oldValue: previousValue,
            newValue: currentValue,
          });
        }
      }

      previousValue = currentValue || undefined;
      previousHash = previousValue ? this.nodeStore.hashValue(previousValue) : undefined;
    }

    // Reverse to get chronological order
    return changes.reverse();
  }

  /**
   * Find the commit where an entity was last modified
   */
  async findLastModified(entityId: string): Promise<GraphCommit | null> {
    const history = await this.getEntityHistory(entityId, 1);
    if (history.length === 0) return null;

    const firstEntry = history[0];
    if (!firstEntry) return null;
    return this.commitManager.getCommit(firstEntry.commitHash);
  }

  /**
   * Find the commit where an entity was first added
   */
  async findFirstAdded(entityId: string): Promise<GraphCommit | null> {
    const history = await this.getEntityHistory(entityId);
    const addEvent = history.find((h) => h.changeType === "add");
    if (!addEvent) return null;

    return this.commitManager.getCommit(addEvent.commitHash);
  }

  /**
   * Find commits where a predicate is true for an entity
   */
  async findCommitsWhere<T = Record<string, unknown>>(
    entityId: string,
    predicate: (entity: T) => boolean,
    limit: number = 100,
  ): Promise<GraphCommit[]> {
    const history = await this.commitManager.getHistory(limit);
    const matches: GraphCommit[] = [];

    for (const commit of history) {
      const entity = await this.getEntityAt<T>(entityId, commit.commitHash);
      if (entity && predicate(entity)) {
        matches.push(commit);
      }
    }

    return matches;
  }

  // ===========================================================================
  // DIFF QUERIES
  // ===========================================================================

  /**
   * Diff between two commits
   */
  async diffCommits(commitHashA: string, commitHashB: string): Promise<CommitDiff | null> {
    const [commitA, commitB] = await Promise.all([
      this.commitManager.getCommit(commitHashA),
      this.commitManager.getCommit(commitHashB),
    ]);

    if (!commitA || !commitB) return null;

    // Create trees for both commits
    const treeA = new ProllyTree(this.nodeStore);
    const treeB = new ProllyTree(this.nodeStore);
    await Promise.all([treeA.initialize(), treeB.initialize()]);

    treeA.setRootHash(commitA.rootNodeHash);
    treeB.setRootHash(commitB.rootNodeHash);

    // Compute tree diff
    const treeDiff = await treeA.diff(commitB.rootNodeHash);

    // Get commit path
    const commitPath = await this.commitManager.getCommitPath(commitHashA, commitHashB);

    return {
      fromCommit: commitA,
      toCommit: commitB,
      treeDiff,
      fileDiff: null, // Would need file Merkle tree
      commitPath,
    };
  }

  /**
   * Get changes between current state and a previous commit
   */
  async diffFromHead(commitHash: string): Promise<CommitDiff | null> {
    const head = await this.commitManager.getBranchHead();
    if (!head) return null;

    return this.diffCommits(commitHash, head.commitHash);
  }

  /**
   * Get changes in the last N commits
   */
  async getRecentChanges(commitCount: number = 10): Promise<
    Array<{
      commit: GraphCommit;
      added: number;
      modified: number;
      deleted: number;
    }>
  > {
    const history = await this.commitManager.getHistory(commitCount + 1);
    const results: Array<{
      commit: GraphCommit;
      added: number;
      modified: number;
      deleted: number;
    }> = [];

    for (let i = 0; i < history.length - 1; i++) {
      const currentCommit = history[i];
      const previousCommit = history[i + 1];
      if (!currentCommit || !previousCommit) continue;

      const diff = await this.diffCommits(previousCommit.commitHash, currentCommit.commitHash);

      if (diff) {
        results.push({
          commit: currentCommit,
          added: diff.treeDiff.added.length,
          modified: diff.treeDiff.modified.length,
          deleted: diff.treeDiff.deleted.length,
        });
      }
    }

    return results;
  }

  // ===========================================================================
  // COMPARISON QUERIES
  // ===========================================================================

  /**
   * Compare an entity between two commits
   */
  async compareEntity<T = Record<string, unknown>>(
    entityId: string,
    commitHashA: string,
    commitHashB: string,
  ): Promise<{
    entityA: T | null;
    entityB: T | null;
    changed: boolean;
  }> {
    const [entityA, entityB] = await Promise.all([
      this.getEntityAt<T>(entityId, commitHashA),
      this.getEntityAt<T>(entityId, commitHashB),
    ]);

    // Check if changed
    let changed = false;
    if (!entityA && !entityB) {
      changed = false;
    } else if (!entityA || !entityB) {
      changed = true;
    } else {
      // Both exist - compare hashes would be more efficient
      // For now, serialize and compare
      changed = JSON.stringify(entityA) !== JSON.stringify(entityB);
    }

    return { entityA, entityB, changed };
  }

  /**
   * Find entities that changed between two commits
   */
  async findChangedEntities(commitHashA: string, commitHashB: string): Promise<string[]> {
    const diff = await this.diffCommits(commitHashA, commitHashB);
    if (!diff) return [];

    const changedIds: string[] = [];
    for (const change of [...diff.treeDiff.added, ...diff.treeDiff.modified, ...diff.treeDiff.deleted]) {
      changedIds.push(change.key);
    }

    return changedIds;
  }

  // ===========================================================================
  // ROLLBACK
  // ===========================================================================

  /**
   * Get the data needed to rollback to a previous commit.
   * Does NOT perform the rollback - returns the entries that would need to be restored.
   */
  async getRollbackData(targetCommitHash: string): Promise<Array<{ key: string; value: Uint8Array }> | null> {
    const commit = await this.commitManager.getCommit(targetCommitHash);
    if (!commit) return null;

    const tree = new ProllyTree(this.nodeStore);
    await tree.initialize();
    tree.setRootHash(commit.rootNodeHash);

    return tree.getAllEntries();
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get time travel statistics
   */
  async getStats(): Promise<{
    totalCommits: number;
    oldestCommitAge: number | null;
    averageChangeSize: number;
  }> {
    const commitStats = await this.commitManager.getStats();
    const recentChanges = await this.getRecentChanges(10);

    const totalChanges = recentChanges.reduce((sum, c) => sum + c.added + c.modified + c.deleted, 0);
    const averageChangeSize = recentChanges.length > 0 ? totalChanges / recentChanges.length : 0;

    return {
      totalCommits: commitStats.totalCommits,
      oldestCommitAge: commitStats.oldestCommit ? Date.now() - commitStats.oldestCommit : null,
      averageChangeSize,
    };
  }
}
