/**
 * Branch Diff Cache - Optimized Branch Sync
 *
 * Caches the diff between current branch and base branch using Prolly Tree.
 * Replaces expensive tombstone queries with O(1) cache lookups.
 *
 * Key optimization:
 * - Before: Each read calls getTombstonedIds() → SQL query
 * - After: Single Prolly Tree diff on branch switch → cache lookups
 *
 * Cache is invalidated when:
 * - New commit is created
 * - Branch is switched
 * - Manual invalidation
 */

import { log } from "../../logging/index.js";
import type { CommitManager } from "./commit-manager.js";
import type { ProllyNodeStore } from "./node-store.js";
import { ProllyTree } from "./prolly-tree.js";
import type { BranchDiffCache as BranchDiffCacheData } from "./types.js";

// =============================================================================
// BRANCH DIFF CACHE
// =============================================================================

export class BranchDiffCache {
  private nodeStore: ProllyNodeStore;
  private commitManager: CommitManager;
  private cache: BranchDiffCacheData | null = null;

  constructor(nodeStore: ProllyNodeStore, commitManager: CommitManager) {
    this.nodeStore = nodeStore;
    this.commitManager = commitManager;
  }

  /**
   * Initialize or refresh the cache for a branch switch.
   * Computes diff between current branch and base branch using Prolly Tree.
   */
  async initForBranch(baseBranch: string, currentBranch: string): Promise<void> {
    const start = Date.now();

    // Get commits for both branches
    const [baseCommit, currentCommit] = await Promise.all([
      this.commitManager.getBranchHead(undefined, baseBranch),
      this.commitManager.getBranchHead(undefined, currentBranch),
    ]);

    if (!baseCommit || !currentCommit) {
      log.w("BRANCH_DIFF", "no_commits", { base: baseBranch, current: currentBranch });
      this.cache = null;
      return;
    }

    // If same commit, no diff needed
    if (baseCommit.commitHash === currentCommit.commitHash) {
      this.cache = {
        baseBranch,
        currentBranch,
        addedIds: new Set(),
        modifiedIds: new Set(),
        deletedIds: new Set(),
        validUntilCommit: currentCommit.commitHash,
        createdAt: Date.now(),
      };
      log.d("BRANCH_DIFF", "same_commit", { commit: currentCommit.commitHash.slice(0, 8) });
      return;
    }

    // Compute Prolly Tree diff
    const tree = new ProllyTree(this.nodeStore);
    await tree.initialize();
    tree.setRootHash(baseCommit.rootNodeHash);

    const diff = await tree.diff(currentCommit.rootNodeHash);

    // Build cache from diff
    this.cache = {
      baseBranch,
      currentBranch,
      addedIds: new Set(diff.added.map((e) => e.key)),
      modifiedIds: new Set(diff.modified.map((e) => e.key)),
      deletedIds: new Set(diff.deleted.map((e) => e.key)),
      validUntilCommit: currentCommit.commitHash,
      createdAt: Date.now(),
    };

    log.i("BRANCH_DIFF", "cache_built", {
      base: baseBranch,
      current: currentBranch,
      added: this.cache.addedIds.size,
      modified: this.cache.modifiedIds.size,
      deleted: this.cache.deletedIds.size,
      ms: Date.now() - start,
    });
  }

  /**
   * Check if an entity was deleted on the current branch.
   * O(1) cache lookup instead of SQL query.
   */
  isDeleted(entityId: string): boolean {
    if (!this.cache) return false;
    return this.cache.deletedIds.has(entityId);
  }

  /**
   * Check if an entity was added on the current branch.
   */
  isAdded(entityId: string): boolean {
    if (!this.cache) return false;
    return this.cache.addedIds.has(entityId);
  }

  /**
   * Check if an entity was modified on the current branch.
   */
  isModified(entityId: string): boolean {
    if (!this.cache) return false;
    return this.cache.modifiedIds.has(entityId);
  }

  /**
   * Check if entity exists only on current branch (added or modified).
   */
  existsOnCurrentBranch(entityId: string): boolean {
    if (!this.cache) return false;
    return this.cache.addedIds.has(entityId) || this.cache.modifiedIds.has(entityId);
  }

  /**
   * Get all deleted entity IDs.
   * For compatibility with existing tombstone-based code.
   */
  getDeletedIds(): Set<string> {
    return this.cache?.deletedIds || new Set();
  }

  /**
   * Get all added entity IDs.
   */
  getAddedIds(): Set<string> {
    return this.cache?.addedIds || new Set();
  }

  /**
   * Get all modified entity IDs.
   */
  getModifiedIds(): Set<string> {
    return this.cache?.modifiedIds || new Set();
  }

  /**
   * Check if cache is valid (not stale).
   * Cache becomes stale when a new commit is made.
   */
  async isValid(): Promise<boolean> {
    if (!this.cache) return false;

    const currentCommit = await this.commitManager.getBranchHead(undefined, this.cache.currentBranch);
    if (!currentCommit) return false;

    return currentCommit.commitHash === this.cache.validUntilCommit;
  }

  /**
   * Invalidate the cache.
   * Should be called after creating a new commit.
   */
  invalidate(): void {
    this.cache = null;
    log.d("BRANCH_DIFF", "cache_invalidated");
  }

  /**
   * Check if cache is populated.
   */
  hasCache(): boolean {
    return this.cache !== null;
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    hasCache: boolean;
    baseBranch: string | null;
    currentBranch: string | null;
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    cacheAge: number | null;
  } {
    if (!this.cache) {
      return {
        hasCache: false,
        baseBranch: null,
        currentBranch: null,
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        cacheAge: null,
      };
    }

    return {
      hasCache: true,
      baseBranch: this.cache.baseBranch,
      currentBranch: this.cache.currentBranch,
      addedCount: this.cache.addedIds.size,
      modifiedCount: this.cache.modifiedIds.size,
      deletedCount: this.cache.deletedIds.size,
      cacheAge: Date.now() - this.cache.createdAt,
    };
  }
}

// =============================================================================
// INTEGRATION HELPER
// =============================================================================

/**
 * Create a tombstone getter that uses BranchDiffCache.
 * Drop-in replacement for the SQL-based tombstone getter.
 */
export function createCachedTombstoneGetter(
  cache: BranchDiffCache,
  fallbackGetter: (entityType: "entity" | "relationship") => Promise<Set<string>>,
): (entityType: "entity" | "relationship") => Promise<Set<string>> {
  return async (entityType: "entity" | "relationship") => {
    // Only entity diff is supported for now
    if (entityType !== "entity") {
      return fallbackGetter(entityType);
    }

    // Check if cache is available and valid
    if (cache.hasCache()) {
      const isValid = await cache.isValid();
      if (isValid) {
        return cache.getDeletedIds();
      }
    }

    // Fall back to SQL-based getter
    return fallbackGetter(entityType);
  };
}
