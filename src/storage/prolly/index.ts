/**
 * Prolly Tree Module - Versioned Graph Storage
 *
 * Provides content-addressed B-trees with Merkle hashing for:
 * - Fast startup (root hash verification)
 * - Efficient branch sync (O(log n) diff)
 * - Time travel (version history)
 * - Deduplication (structural sharing)
 *
 * @example
 * ```typescript
 * import { ProllyNodeStore, ProllyTree, CommitManager } from './storage/prolly';
 *
 * // Initialize
 * const nodeStore = new ProllyNodeStore();
 * await nodeStore.initialize(client);
 *
 * const commitManager = new CommitManager();
 * await commitManager.initialize(client);
 * commitManager.setContext(projectHash, branchName);
 *
 * const tree = new ProllyTree(nodeStore);
 * await tree.initialize();
 *
 * // Build tree from entities
 * const entries = entities.map(e => ({
 *   key: e.id,
 *   value: serializeEntity(e)
 * }));
 * const rootHash = await tree.build(entries);
 *
 * // Create commit
 * await commitManager.commit(rootHash, null, { entityCount: entries.length, relationshipCount: 0 });
 *
 * // Diff between branches
 * const otherBranchRoot = await commitManager.getBranchHead('other-branch');
 * const diff = await tree.diff(otherBranchRoot.rootNodeHash);
 * ```
 */

export { BranchDiffCache, createCachedTombstoneGetter } from "./branch-diff-cache.js";
export { CommitManager } from "./commit-manager.js";
// Core components
export { type NodeStoreConfig, ProllyNodeStore } from "./node-store.js";
export { deserializeEntity, ProllyTree, serializeEntity } from "./prolly-tree.js";
export { getRecentlyChangedEntities, type RecentChangeFilter, type RecentChangeResult } from "./recently-changed.js";
export { TimeTravelManager } from "./time-travel.js";
// Types
export * from "./types.js";
