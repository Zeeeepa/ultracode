/**
 * Prolly Tree - Probabilistic B-Tree with Merkle Hashing
 *
 * Core data structure for versioned graph storage.
 * Uses probabilistic chunking for deterministic structure,
 * enabling efficient O(log n) diff between versions.
 *
 * Key algorithms:
 * - Probabilistic chunking: deterministic split boundaries based on key hash
 * - Bottom-up building: construct leaf nodes, then internal nodes
 * - Structural sharing: identical subtrees share storage
 * - Efficient diff: compare root hashes, recurse only on differences
 */

import * as cbor from "cbor-x";
import { log } from "../../logging/index.js";
import { hashBigInt64, hashText64, initHasher } from "../../utils/fast-hash.js";
import type { ProllyNodeStore } from "./node-store.js";
import {
  DEFAULT_PROLLY_CONFIG,
  type EntryChange,
  type LeafNodeData,
  type ProllyEntry,
  type ProllyNode,
  type ProllyTreeConfig,
  type TreeDiff,
} from "./types.js";

// =============================================================================
// PROLLY TREE
// =============================================================================

export class ProllyTree {
  private nodeStore: ProllyNodeStore;
  private config: Required<ProllyTreeConfig>;
  private rootHash: string | null = null;

  constructor(nodeStore: ProllyNodeStore, config: ProllyTreeConfig = {}) {
    this.nodeStore = nodeStore;
    this.config = { ...DEFAULT_PROLLY_CONFIG, ...config };
  }

  /**
   * Initialize the tree (must be called before use)
   */
  async initialize(): Promise<void> {
    await initHasher();
  }

  /**
   * Get current root hash
   */
  getRootHash(): string | null {
    return this.rootHash;
  }

  /**
   * Set root hash (for loading existing tree)
   */
  setRootHash(hash: string | null): void {
    this.rootHash = hash;
  }

  // ===========================================================================
  // BUILDING
  // ===========================================================================

  /**
   * Build a Prolly tree from a sorted array of entries.
   * Returns the root hash.
   */
  async build(entries: Array<{ key: string; value: Uint8Array }>): Promise<string> {
    const start = Date.now();

    if (entries.length === 0) {
      // Create empty root node
      const emptyLeaf = await this.nodeStore.put({
        type: "leaf",
        level: 0,
        data: this.nodeStore.serializeLeafData({ entries: [] }),
        entryCount: 0,
      });
      this.rootHash = emptyLeaf;
      return emptyLeaf;
    }

    // Sort entries by key
    const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));

    // Build leaf nodes with probabilistic chunking
    const leafHashes = await this.buildLeafLevel(sorted);

    // Build internal nodes bottom-up
    let currentLevel = leafHashes;
    while (currentLevel.length > 1) {
      currentLevel = await this.buildInternalLevel(currentLevel);
    }

    const rootNode = currentLevel[0];
    this.rootHash = rootNode?.hash ?? null;

    log.d("PROLLY_TREE", "build_complete", {
      entries: entries.length,
      rootHash: this.rootHash?.slice(0, 8) ?? "null",
      ms: Date.now() - start,
    });

    return this.rootHash!;
  }

  /**
   * Build leaf level with probabilistic chunking
   */
  private async buildLeafLevel(
    sortedEntries: Array<{ key: string; value: Uint8Array }>,
  ): Promise<Array<{ hash: string; keyStart: string; keyEnd: string; count: number }>> {
    // hasher initialized via fast-hash module

    const leafNodes: Array<{ hash: string; keyStart: string; keyEnd: string; count: number }> = [];
    let currentChunk: ProllyEntry[] = [];
    let chunkKeyStart: string | null = null;

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      if (!entry) continue;

      const valueStr = Buffer.from(entry.value).toString("base64");
      const valueHash = hashText64(valueStr);

      const prollyEntry: ProllyEntry = {
        key: entry.key,
        value: entry.value,
        valueHash,
      };

      if (currentChunk.length === 0) {
        chunkKeyStart = entry.key;
      }

      currentChunk.push(prollyEntry);

      // Check if we should split (probabilistic boundary OR max size OR last entry)
      const keyHash = hashBigInt64(entry.key);
      const shouldSplit =
        this.shouldChunkSplit(keyHash) ||
        currentChunk.length >= this.config.maxLeafEntries ||
        i === sortedEntries.length - 1;

      if (shouldSplit && currentChunk.length >= this.config.minLeafEntries) {
        // Create leaf node
        const leafData: LeafNodeData = { entries: currentChunk };
        const hash = await this.nodeStore.put({
          type: "leaf",
          level: 0,
          data: this.nodeStore.serializeLeafData(leafData),
          keyRangeStart: chunkKeyStart!,
          keyRangeEnd: entry.key,
          entryCount: currentChunk.length,
        });

        leafNodes.push({
          hash,
          keyStart: chunkKeyStart!,
          keyEnd: entry.key,
          count: currentChunk.length,
        });

        currentChunk = [];
        chunkKeyStart = null;
      } else if (shouldSplit && i === sortedEntries.length - 1) {
        // Last entry but chunk too small - force create anyway
        const leafData: LeafNodeData = { entries: currentChunk };
        const hash = await this.nodeStore.put({
          type: "leaf",
          level: 0,
          data: this.nodeStore.serializeLeafData(leafData),
          keyRangeStart: chunkKeyStart!,
          keyRangeEnd: entry.key,
          entryCount: currentChunk.length,
        });

        leafNodes.push({
          hash,
          keyStart: chunkKeyStart!,
          keyEnd: entry.key,
          count: currentChunk.length,
        });
      }
    }

    return leafNodes;
  }

  /**
   * Build internal level from child nodes
   */
  private async buildInternalLevel(
    children: Array<{ hash: string; keyStart: string; keyEnd: string; count: number }>,
  ): Promise<Array<{ hash: string; keyStart: string; keyEnd: string; count: number }>> {
    // hasher initialized via fast-hash module

    const internalNodes: Array<{ hash: string; keyStart: string; keyEnd: string; count: number }> = [];
    let currentChildren: typeof children = [];
    let groupKeyStart: string | null = null;
    let groupEntryCount = 0;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;

      if (currentChildren.length === 0) {
        groupKeyStart = child.keyStart;
      }

      currentChildren.push(child);
      groupEntryCount += child.count;

      // Check if we should split
      const keyHash = hashBigInt64(child.hash);
      const shouldSplit = this.shouldChunkSplit(keyHash) || i === children.length - 1;

      if (shouldSplit && currentChildren.length > 0) {
        // Create internal node
        const hash = await this.nodeStore.put({
          type: "internal",
          level: 1,
          childrenHashes: currentChildren.map((c) => c.hash),
          keyRangeStart: groupKeyStart!,
          keyRangeEnd: child.keyEnd,
          entryCount: groupEntryCount,
        });

        internalNodes.push({
          hash,
          keyStart: groupKeyStart!,
          keyEnd: child.keyEnd,
          count: groupEntryCount,
        });

        currentChildren = [];
        groupKeyStart = null;
        groupEntryCount = 0;
      }
    }

    return internalNodes;
  }

  /**
   * Check if a hash triggers a chunk boundary
   */
  private shouldChunkSplit(hash: bigint): boolean {
    return (hash & BigInt(this.config.chunkPattern)) === 0n;
  }

  // ===========================================================================
  // SINGLE KEY OPERATIONS
  // ===========================================================================

  /**
   * Get value for a key
   */
  async get(key: string): Promise<Uint8Array | null> {
    if (!this.rootHash) return null;

    const node = await this.nodeStore.get(this.rootHash);
    if (!node) return null;

    return this.searchNode(node, key);
  }

  /**
   * Recursively search for a key
   */
  private async searchNode(node: ProllyNode, key: string): Promise<Uint8Array | null> {
    if (node.type === "leaf") {
      const data = this.nodeStore.deserializeLeafData(node.data!);
      const entry = data.entries.find((e) => e.key === key);
      return entry?.value || null;
    }

    // Internal node - find child that contains the key
    if (!node.childrenHashes || node.childrenHashes.length === 0) {
      return null;
    }

    // Fetch all children to check key ranges
    const children = await this.nodeStore.getBatch(node.childrenHashes);

    for (const hash of node.childrenHashes) {
      const child = children.get(hash);
      if (!child) continue;

      // Check if key is in this child's range
      if (child.keyRangeStart && child.keyRangeEnd) {
        if (key >= child.keyRangeStart && key <= child.keyRangeEnd) {
          return this.searchNode(child, key);
        }
      }
    }

    return null;
  }

  /**
   * Insert or update a key-value pair.
   * Returns new root hash.
   */
  async insert(key: string, value: Uint8Array): Promise<string> {
    // For simplicity, we rebuild the tree with the new entry
    // A more efficient implementation would do incremental updates
    const entries = await this.getAllEntries();
    const existing = entries.findIndex((e) => e.key === key);

    if (existing >= 0) {
      entries[existing] = { key, value };
    } else {
      entries.push({ key, value });
    }

    return this.build(entries);
  }

  /**
   * Delete a key.
   * Returns new root hash.
   */
  async delete(key: string): Promise<string> {
    const entries = await this.getAllEntries();
    const filtered = entries.filter((e) => e.key !== key);
    return this.build(filtered);
  }

  /**
   * Get all entries from the tree
   */
  async getAllEntries(): Promise<Array<{ key: string; value: Uint8Array }>> {
    if (!this.rootHash) return [];

    const node = await this.nodeStore.get(this.rootHash);
    if (!node) return [];

    return this.collectEntries(node);
  }

  /**
   * Recursively collect all entries
   */
  private async collectEntries(node: ProllyNode): Promise<Array<{ key: string; value: Uint8Array }>> {
    if (node.type === "leaf") {
      const data = this.nodeStore.deserializeLeafData(node.data!);
      return data.entries.map((e) => ({ key: e.key, value: e.value }));
    }

    if (!node.childrenHashes || node.childrenHashes.length === 0) {
      return [];
    }

    const children = await this.nodeStore.getBatch(node.childrenHashes);
    const entries: Array<{ key: string; value: Uint8Array }> = [];

    for (const hash of node.childrenHashes) {
      const child = children.get(hash);
      if (child) {
        const childEntries = await this.collectEntries(child);
        entries.push(...childEntries);
      }
    }

    return entries;
  }

  // ===========================================================================
  // RANGE QUERIES
  // ===========================================================================

  /**
   * Get all entries in a key range
   */
  async range(startKey: string, endKey: string): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();

    if (!this.rootHash) return result;

    const node = await this.nodeStore.get(this.rootHash);
    if (!node) return result;

    await this.collectRange(node, startKey, endKey, result);
    return result;
  }

  /**
   * Recursively collect entries in range
   */
  private async collectRange(
    node: ProllyNode,
    startKey: string,
    endKey: string,
    result: Map<string, Uint8Array>,
  ): Promise<void> {
    if (node.type === "leaf") {
      const data = this.nodeStore.deserializeLeafData(node.data!);
      for (const entry of data.entries) {
        if (entry.key >= startKey && entry.key <= endKey) {
          result.set(entry.key, entry.value);
        }
      }
      return;
    }

    if (!node.childrenHashes || node.childrenHashes.length === 0) {
      return;
    }

    const children = await this.nodeStore.getBatch(node.childrenHashes);

    for (const hash of node.childrenHashes) {
      const child = children.get(hash);
      if (!child) continue;

      // Check if child's range overlaps with query range
      if (child.keyRangeStart && child.keyRangeEnd) {
        if (child.keyRangeEnd < startKey || child.keyRangeStart > endKey) {
          continue; // No overlap
        }
      }

      await this.collectRange(child, startKey, endKey, result);
    }
  }

  // ===========================================================================
  // DIFF OPERATIONS
  // ===========================================================================

  /**
   * Compute diff between this tree and another tree.
   * This is the key algorithm for O(log n) branch sync.
   */
  async diff(otherRootHash: string): Promise<TreeDiff> {
    const start = Date.now();
    const diff: TreeDiff = {
      added: [],
      modified: [],
      deleted: [],
      stats: {
        nodesCompared: 0,
        nodesSkipped: 0,
        timeMs: 0,
      },
    };

    await this.compareNodes(this.rootHash, otherRootHash, diff);

    diff.stats.timeMs = Date.now() - start;

    log.d("PROLLY_TREE", "diff_complete", {
      added: diff.added.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length,
      nodesCompared: diff.stats.nodesCompared,
      nodesSkipped: diff.stats.nodesSkipped,
      ms: diff.stats.timeMs,
    });

    return diff;
  }

  /**
   * Compare two nodes and recurse on differences
   */
  private async compareNodes(hashA: string | null, hashB: string | null, diff: TreeDiff): Promise<void> {
    // Both null - nothing to compare
    if (!hashA && !hashB) return;

    // Hashes equal - identical subtrees, skip! (KEY OPTIMIZATION)
    if (hashA === hashB) {
      diff.stats.nodesSkipped++;
      return;
    }

    diff.stats.nodesCompared++;

    const nodeA = hashA ? await this.nodeStore.get(hashA) : null;
    const nodeB = hashB ? await this.nodeStore.get(hashB) : null;

    // Addition: exists in B but not in A
    if (!nodeA && nodeB) {
      await this.collectChanges(nodeB, "added", diff);
      return;
    }

    // Deletion: exists in A but not in B
    if (nodeA && !nodeB) {
      await this.collectChanges(nodeA, "deleted", diff);
      return;
    }

    // Both exist, hashes different - need to compare contents
    if (nodeA!.type === "leaf" && nodeB!.type === "leaf") {
      // Compare leaf entries
      this.diffLeafNodes(nodeA!, nodeB!, diff);
    } else if (nodeA!.type === "internal" && nodeB!.type === "internal") {
      // Compare internal nodes - recurse on children
      await this.diffInternalNodes(nodeA!, nodeB!, diff);
    } else {
      // Type mismatch - treat as delete A, add B
      await this.collectChanges(nodeA!, "deleted", diff);
      await this.collectChanges(nodeB!, "added", diff);
    }
  }

  /**
   * Diff two leaf nodes
   */
  private diffLeafNodes(nodeA: ProllyNode, nodeB: ProllyNode, diff: TreeDiff): void {
    const dataA = this.nodeStore.deserializeLeafData(nodeA.data!);
    const dataB = this.nodeStore.deserializeLeafData(nodeB.data!);

    const entriesA = new Map(dataA.entries.map((e) => [e.key, e]));
    const entriesB = new Map(dataB.entries.map((e) => [e.key, e]));

    // Find additions and modifications
    for (const [key, entryB] of entriesB) {
      const entryA = entriesA.get(key);

      if (!entryA) {
        // Added
        diff.added.push({
          key,
          newValue: entryB.value,
          newHash: entryB.valueHash,
        });
      } else if (entryA.valueHash !== entryB.valueHash) {
        // Modified
        diff.modified.push({
          key,
          oldValue: entryA.value,
          newValue: entryB.value,
          oldHash: entryA.valueHash,
          newHash: entryB.valueHash,
        });
      }
    }

    // Find deletions
    for (const [key, entryA] of entriesA) {
      if (!entriesB.has(key)) {
        diff.deleted.push({
          key,
          oldValue: entryA.value,
          oldHash: entryA.valueHash,
        });
      }
    }
  }

  /**
   * Diff two internal nodes by comparing children
   */
  private async diffInternalNodes(nodeA: ProllyNode, nodeB: ProllyNode, diff: TreeDiff): Promise<void> {
    const childrenA = nodeA.childrenHashes || [];
    const childrenB = nodeB.childrenHashes || [];

    // Fetch all children
    const allHashes = [...new Set([...childrenA, ...childrenB])];
    const nodes = await this.nodeStore.getBatch(allHashes);

    // Group children by key ranges for comparison
    const rangesA = this.buildKeyRangeMap(childrenA, nodes);
    const rangesB = this.buildKeyRangeMap(childrenB, nodes);

    // Find matching ranges to compare
    const processedA = new Set<string>();
    const processedB = new Set<string>();

    // Match by key range overlap
    for (const [hashA, rangeA] of rangesA) {
      for (const [hashB, rangeB] of rangesB) {
        if (processedB.has(hashB)) continue;

        // Check for overlap
        if (rangeA.end >= rangeB.start && rangeA.start <= rangeB.end) {
          await this.compareNodes(hashA, hashB, diff);
          processedA.add(hashA);
          processedB.add(hashB);
          break;
        }
      }
    }

    // Handle unmatched children from A (deletions)
    for (const [hashA] of rangesA) {
      if (!processedA.has(hashA)) {
        await this.compareNodes(hashA, null, diff);
      }
    }

    // Handle unmatched children from B (additions)
    for (const [hashB] of rangesB) {
      if (!processedB.has(hashB)) {
        await this.compareNodes(null, hashB, diff);
      }
    }
  }

  /**
   * Build map of hash -> key range for internal node children
   */
  private buildKeyRangeMap(
    hashes: string[],
    nodes: Map<string, ProllyNode>,
  ): Map<string, { start: string; end: string }> {
    const result = new Map<string, { start: string; end: string }>();

    for (const hash of hashes) {
      const node = nodes.get(hash);
      if (node && node.keyRangeStart && node.keyRangeEnd) {
        result.set(hash, { start: node.keyRangeStart, end: node.keyRangeEnd });
      }
    }

    return result;
  }

  /**
   * Collect all entries from a subtree as changes
   */
  private async collectChanges(node: ProllyNode, changeType: "added" | "deleted", diff: TreeDiff): Promise<void> {
    const entries = await this.collectEntries(node);

    for (const entry of entries) {
      const valueStr = Buffer.from(entry.value).toString("base64");
      const valueHash = hashText64(valueStr) || "";
      const change: EntryChange = { key: entry.key };

      if (changeType === "added") {
        change.newValue = entry.value;
        change.newHash = valueHash;
        diff.added.push(change);
      } else {
        change.oldValue = entry.value;
        change.oldHash = valueHash;
        diff.deleted.push(change);
      }
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get tree statistics
   */
  async getStats(): Promise<{
    rootHash: string | null;
    entryCount: number;
    depth: number;
    nodeCount: number;
  }> {
    if (!this.rootHash) {
      return { rootHash: null, entryCount: 0, depth: 0, nodeCount: 0 };
    }

    const root = await this.nodeStore.get(this.rootHash);
    if (!root) {
      return { rootHash: this.rootHash, entryCount: 0, depth: 0, nodeCount: 0 };
    }

    const depth = await this.computeDepth(root);
    const nodeCount = await this.countNodes(root);

    return {
      rootHash: this.rootHash,
      entryCount: root.entryCount || 0,
      depth,
      nodeCount,
    };
  }

  /**
   * Compute tree depth
   */
  private async computeDepth(node: ProllyNode): Promise<number> {
    if (node.type === "leaf") return 1;

    if (!node.childrenHashes || node.childrenHashes.length === 0) {
      return 1;
    }

    const firstChildHash = node.childrenHashes[0];
    if (!firstChildHash) return 1;

    const firstChild = await this.nodeStore.get(firstChildHash);
    if (!firstChild) return 1;

    return 1 + (await this.computeDepth(firstChild));
  }

  /**
   * Count all nodes in subtree
   */
  private async countNodes(node: ProllyNode): Promise<number> {
    if (node.type === "leaf") return 1;

    if (!node.childrenHashes || node.childrenHashes.length === 0) {
      return 1;
    }

    const children = await this.nodeStore.getBatch(node.childrenHashes);
    let count = 1;

    for (const child of children.values()) {
      count += await this.countNodes(child);
    }

    return count;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Serialize an entity to Uint8Array for storage
 */
export function serializeEntity(entity: object): Uint8Array {
  return cbor.encode(entity);
}

/**
 * Deserialize an entity from Uint8Array
 */
export function deserializeEntity<T = Record<string, unknown>>(data: Uint8Array): T {
  return cbor.decode(data) as T;
}
