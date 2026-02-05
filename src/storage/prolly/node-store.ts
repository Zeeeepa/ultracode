/**
 * Prolly Node Store - Content-Addressed Storage
 *
 * Stores Prolly Tree nodes by their content hash (xxHash64).
 * Nodes with identical content share the same hash and storage.
 *
 * Key features:
 * - Automatic deduplication via content addressing
 * - LRU cache for hot nodes
 * - Batch operations for efficiency
 * - GC for orphaned nodes
 */

import type { Client } from "@libsql/client";
import * as cbor from "cbor-x";
import { LRUCache } from "lru-cache";
import xxhash from "xxhash-wasm";
import { log } from "../../logging/index.js";
import type { InternalNodeData, LeafNodeData, ProllyNode, ProllyNodeType } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface NodeStoreConfig {
  /** Maximum nodes to keep in cache */
  cacheSize?: number;
  /** Whether to enable cache */
  enableCache?: boolean;
}

const DEFAULT_CONFIG: Required<NodeStoreConfig> = {
  cacheSize: 1000,
  enableCache: true,
};

// =============================================================================
// PROLLY NODE STORE
// =============================================================================

export class ProllyNodeStore {
  private client: Client | null = null;
  private config: Required<NodeStoreConfig>;
  private cache: LRUCache<string, ProllyNode>;
  private xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;
  private isInitialized = false;

  constructor(config: NodeStoreConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new LRUCache<string, ProllyNode>({
      max: this.config.cacheSize,
    });
  }

  /**
   * Initialize the store with a database client
   */
  async initialize(client: Client): Promise<void> {
    this.client = client;
    this.xxhashInstance = await xxhash();
    await this.createTable();
    this.isInitialized = true;
    log.i("PROLLY_STORE", "initialized");
  }

  /**
   * Update the client reference (called after flush() in LibSQLGraphAdapter)
   */
  updateClient(client: Client): void {
    this.client = client;
  }

  /**
   * Create the prolly_nodes table if it doesn't exist
   */
  private async createTable(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.batch(
      [
        `CREATE TABLE IF NOT EXISTS prolly_nodes (
          content_hash TEXT PRIMARY KEY,
          node_type TEXT NOT NULL,
          data BLOB,
          children_hashes TEXT,
          key_range_start TEXT,
          key_range_end TEXT,
          entry_count INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_prolly_type ON prolly_nodes(node_type)`,
        `CREATE INDEX IF NOT EXISTS idx_prolly_created ON prolly_nodes(created_at)`,
      ],
      "write",
    );
  }

  /**
   * Compute content hash for a node
   */
  computeHash(node: Omit<ProllyNode, "contentHash" | "createdAt">): string {
    if (!this.xxhashInstance) {
      throw new Error("xxHash not initialized");
    }

    // Create deterministic representation
    const parts: string[] = [node.type];

    if (node.data) {
      // Hash the binary data - convert to string first
      const dataStr = Buffer.from(node.data).toString("base64");
      parts.push(this.xxhashInstance.h64ToString(dataStr));
    }

    if (node.childrenHashes && node.childrenHashes.length > 0) {
      // Sort children for determinism
      parts.push(node.childrenHashes.sort().join("|"));
    }

    if (node.keyRangeStart) parts.push(node.keyRangeStart);
    if (node.keyRangeEnd) parts.push(node.keyRangeEnd);

    const content = parts.join(":");
    return this.xxhashInstance.h64ToString(content);
  }

  /**
   * Store a node (content-addressed: same content = same hash = no-op)
   * Returns the content hash
   */
  async put(node: Omit<ProllyNode, "contentHash" | "createdAt">): Promise<string> {
    if (!this.client) throw new Error("Client not initialized");

    const contentHash = this.computeHash(node);

    // Check cache first
    if (this.config.enableCache && this.cache.has(contentHash)) {
      return contentHash;
    }

    // Check if already exists in DB
    const existing = await this.client.execute({
      sql: "SELECT 1 FROM prolly_nodes WHERE content_hash = ?",
      args: [contentHash],
    });

    if (existing.rows.length > 0) {
      // Already exists - just update cache and return
      const fullNode: ProllyNode = {
        ...node,
        contentHash,
        createdAt: Date.now(),
      };
      if (this.config.enableCache) {
        this.cache.set(contentHash, fullNode);
      }
      return contentHash;
    }

    // Insert new node
    const now = Date.now();
    await this.client.execute({
      sql: `INSERT INTO prolly_nodes
            (content_hash, node_type, data, children_hashes, key_range_start, key_range_end, entry_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        contentHash,
        node.type,
        node.data ? Buffer.from(node.data) : null,
        node.childrenHashes ? JSON.stringify(node.childrenHashes) : null,
        node.keyRangeStart || null,
        node.keyRangeEnd || null,
        node.entryCount || 0,
        now,
      ],
    });

    // Update cache
    const fullNode: ProllyNode = { ...node, contentHash, createdAt: now };
    if (this.config.enableCache) {
      this.cache.set(contentHash, fullNode);
    }

    return contentHash;
  }

  /**
   * Store multiple nodes in batch
   * Returns map of content hashes
   */
  async putBatch(nodes: Array<Omit<ProllyNode, "contentHash" | "createdAt">>): Promise<string[]> {
    if (!this.client) throw new Error("Client not initialized");
    if (nodes.length === 0) return [];

    const hashes: string[] = [];
    const toInsert: Array<{ hash: string; node: Omit<ProllyNode, "contentHash" | "createdAt"> }> = [];

    // Compute hashes and check cache/existence
    for (const node of nodes) {
      const hash = this.computeHash(node);
      hashes.push(hash);

      if (!this.config.enableCache || !this.cache.has(hash)) {
        toInsert.push({ hash, node });
      }
    }

    if (toInsert.length === 0) return hashes;

    // Check which hashes already exist in DB
    const existingCheck = await this.client.execute({
      sql: `SELECT content_hash FROM prolly_nodes WHERE content_hash IN (${toInsert.map(() => "?").join(",")})`,
      args: toInsert.map((i) => i.hash),
    });
    const existingHashes = new Set(existingCheck.rows.map((r) => r["content_hash"] as string));

    // Filter to only new nodes
    const newNodes = toInsert.filter((i) => !existingHashes.has(i.hash));

    if (newNodes.length === 0) {
      // All exist - just update cache
      for (const { hash, node } of toInsert) {
        if (this.config.enableCache) {
          this.cache.set(hash, { ...node, contentHash: hash, createdAt: Date.now() });
        }
      }
      return hashes;
    }

    // Batch insert new nodes
    const now = Date.now();
    const batchSize = 100;

    for (let i = 0; i < newNodes.length; i += batchSize) {
      const batch = newNodes.slice(i, i + batchSize);
      const values = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const args: (string | number | Buffer | null)[] = [];

      for (const { hash, node } of batch) {
        args.push(
          hash,
          node.type,
          node.data ? Buffer.from(node.data) : null,
          node.childrenHashes ? JSON.stringify(node.childrenHashes) : null,
          node.keyRangeStart || null,
          node.keyRangeEnd || null,
          node.entryCount || 0,
          now,
        );
      }

      await this.client.execute({
        sql: `INSERT OR IGNORE INTO prolly_nodes
              (content_hash, node_type, data, children_hashes, key_range_start, key_range_end, entry_count, created_at)
              VALUES ${values}`,
        args,
      });
    }

    // Update cache for all nodes
    for (const { hash, node } of toInsert) {
      if (this.config.enableCache) {
        this.cache.set(hash, { ...node, contentHash: hash, createdAt: now });
      }
    }

    log.d("PROLLY_STORE", "putBatch", { total: nodes.length, new: newNodes.length });
    return hashes;
  }

  /**
   * Get a node by content hash
   */
  async get(hash: string): Promise<ProllyNode | null> {
    // Check cache first
    if (this.config.enableCache) {
      const cached = this.cache.get(hash);
      if (cached) return cached;
    }

    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: "SELECT * FROM prolly_nodes WHERE content_hash = ?",
      args: [hash],
    });

    const row = result.rows[0];
    if (!row) return null;

    const node: ProllyNode = {
      contentHash: row["content_hash"] as string,
      type: row["node_type"] as ProllyNodeType,
      data: row["data"] ? new Uint8Array(row["data"] as ArrayBuffer) : undefined,
      childrenHashes: row["children_hashes"] ? JSON.parse(row["children_hashes"] as string) : undefined,
      keyRangeStart: (row["key_range_start"] as string) || undefined,
      keyRangeEnd: (row["key_range_end"] as string) || undefined,
      entryCount: (row["entry_count"] as number) || undefined,
      createdAt: row["created_at"] as number,
    };

    // Update cache
    if (this.config.enableCache) {
      this.cache.set(hash, node);
    }

    return node;
  }

  /**
   * Get multiple nodes by hash
   */
  async getBatch(hashes: string[]): Promise<Map<string, ProllyNode>> {
    const result = new Map<string, ProllyNode>();
    const toFetch: string[] = [];

    // Check cache first
    for (const hash of hashes) {
      if (this.config.enableCache) {
        const cached = this.cache.get(hash);
        if (cached) {
          result.set(hash, cached);
          continue;
        }
      }
      toFetch.push(hash);
    }

    if (toFetch.length === 0) return result;
    if (!this.client) throw new Error("Client not initialized");

    // Fetch from DB
    const dbResult = await this.client.execute({
      sql: `SELECT * FROM prolly_nodes WHERE content_hash IN (${toFetch.map(() => "?").join(",")})`,
      args: toFetch,
    });

    for (const row of dbResult.rows) {
      const node: ProllyNode = {
        contentHash: row["content_hash"] as string,
        type: row["node_type"] as ProllyNodeType,
        data: row["data"] ? new Uint8Array(row["data"] as ArrayBuffer) : undefined,
        childrenHashes: row["children_hashes"] ? JSON.parse(row["children_hashes"] as string) : undefined,
        keyRangeStart: (row["key_range_start"] as string) || undefined,
        keyRangeEnd: (row["key_range_end"] as string) || undefined,
        entryCount: (row["entry_count"] as number) || undefined,
        createdAt: row["created_at"] as number,
      };

      result.set(node.contentHash, node);
      if (this.config.enableCache) {
        this.cache.set(node.contentHash, node);
      }
    }

    return result;
  }

  /**
   * Check if a node exists
   */
  async has(hash: string): Promise<boolean> {
    if (this.config.enableCache && this.cache.has(hash)) {
      return true;
    }

    if (!this.client) throw new Error("Client not initialized");

    const result = await this.client.execute({
      sql: "SELECT 1 FROM prolly_nodes WHERE content_hash = ?",
      args: [hash],
    });

    return result.rows.length > 0;
  }

  /**
   * Delete a node (use with caution - may orphan subtrees)
   */
  async delete(hash: string): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    await this.client.execute({
      sql: "DELETE FROM prolly_nodes WHERE content_hash = ?",
      args: [hash],
    });

    if (this.config.enableCache) {
      this.cache.delete(hash);
    }
  }

  /**
   * Delete multiple nodes
   */
  async deleteBatch(hashes: string[]): Promise<number> {
    if (!this.client) throw new Error("Client not initialized");
    if (hashes.length === 0) return 0;

    const result = await this.client.execute({
      sql: `DELETE FROM prolly_nodes WHERE content_hash IN (${hashes.map(() => "?").join(",")})`,
      args: hashes,
    });

    for (const hash of hashes) {
      if (this.config.enableCache) {
        this.cache.delete(hash);
      }
    }

    return result.rowsAffected;
  }

  /**
   * Find all nodes reachable from a root hash
   */
  async getReachableNodes(rootHash: string): Promise<Set<string>> {
    const reachable = new Set<string>();
    const queue = [rootHash];

    while (queue.length > 0) {
      const hash = queue.shift()!;
      if (reachable.has(hash)) continue;

      const node = await this.get(hash);
      if (!node) continue;

      reachable.add(hash);

      if (node.childrenHashes) {
        for (const childHash of node.childrenHashes) {
          if (!reachable.has(childHash)) {
            queue.push(childHash);
          }
        }
      }
    }

    return reachable;
  }

  /**
   * Find and delete orphaned nodes (not reachable from any root)
   * Returns number of deleted nodes
   */
  async collectGarbage(rootHashes: string[]): Promise<number> {
    if (!this.client) throw new Error("Client not initialized");

    // Get all reachable nodes from all roots
    const reachable = new Set<string>();
    for (const root of rootHashes) {
      const nodes = await this.getReachableNodes(root);
      for (const hash of nodes) {
        reachable.add(hash);
      }
    }

    // Get all node hashes in the store
    const allNodes = await this.client.execute({
      sql: "SELECT content_hash FROM prolly_nodes",
      args: [],
    });

    const allHashes = allNodes.rows.map((r) => r["content_hash"] as string);

    // Find orphaned nodes
    const orphaned = allHashes.filter((h) => !reachable.has(h));

    if (orphaned.length === 0) return 0;

    // Delete orphaned nodes
    const deleted = await this.deleteBatch(orphaned);
    log.i("PROLLY_STORE", "gc_complete", { checked: allHashes.length, deleted });

    return deleted;
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    totalNodes: number;
    leafNodes: number;
    internalNodes: number;
    cacheSize: number;
    cacheHits: number;
  }> {
    if (!this.client) throw new Error("Client not initialized");

    const countResult = await this.client.execute({
      sql: `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN node_type = 'leaf' THEN 1 ELSE 0 END) as leaves,
              SUM(CASE WHEN node_type = 'internal' THEN 1 ELSE 0 END) as internals
            FROM prolly_nodes`,
      args: [],
    });

    const row = countResult.rows[0] as Record<string, unknown> | undefined;
    return {
      totalNodes: Number(row?.["total"] ?? 0),
      leafNodes: Number(row?.["leaves"] ?? 0),
      internalNodes: Number(row?.["internals"] ?? 0),
      cacheSize: this.cache.size,
      cacheHits: 0, // LRUCache doesn't track hits by default
    };
  }

  /**
   * Clear cache (doesn't affect stored nodes)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if store is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  // ===========================================================================
  // HELPER METHODS FOR SERIALIZATION
  // ===========================================================================

  /**
   * Serialize leaf node entries to CBOR
   */
  serializeLeafData(data: LeafNodeData): Uint8Array {
    return cbor.encode(data);
  }

  /**
   * Deserialize leaf node entries from CBOR
   */
  deserializeLeafData(data: Uint8Array): LeafNodeData {
    return cbor.decode(data);
  }

  /**
   * Serialize internal node data to CBOR
   */
  serializeInternalData(data: InternalNodeData): Uint8Array {
    return cbor.encode(data);
  }

  /**
   * Deserialize internal node data from CBOR
   */
  deserializeInternalData(data: Uint8Array): InternalNodeData {
    return cbor.decode(data);
  }

  /**
   * Hash a value (for change detection)
   */
  hashValue(value: Uint8Array): string {
    if (!this.xxhashInstance) {
      throw new Error("xxHash not initialized");
    }
    const str = Buffer.from(value).toString("base64");
    return this.xxhashInstance.h64ToString(str);
  }
}
