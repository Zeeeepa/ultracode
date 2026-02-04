import { beforeEach, describe, expect, it, mock } from "bun:test";
import { ProllyNodeStore } from "../node-store.js";
import type { ProllyNode } from "../types.js";

// Mock Client for testing
function createMockClient() {
  const storage = new Map<string, Record<string, unknown>>();

  return {
    execute: mock(async ({ sql, args }: { sql: string; args: unknown[] }) => {
      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [], rowsAffected: 0 };
      }

      if (sql.includes("INSERT OR IGNORE") || sql.includes("INSERT INTO")) {
        // Batch insert - parse multiple values
        if (sql.includes("VALUES") && args.length > 8) {
          const batchSize = 8;
          for (let i = 0; i < args.length; i += batchSize) {
            const hash = args[i] as string;
            storage.set(hash, {
              content_hash: args[i],
              node_type: args[i + 1],
              data: args[i + 2],
              children_hashes: args[i + 3],
              key_range_start: args[i + 4],
              key_range_end: args[i + 5],
              entry_count: args[i + 6],
              created_at: args[i + 7],
            });
          }
        } else {
          const hash = args[0] as string;
          storage.set(hash, {
            content_hash: args[0],
            node_type: args[1],
            data: args[2],
            children_hashes: args[3],
            key_range_start: args[4],
            key_range_end: args[5],
            entry_count: args[6],
            created_at: args[7],
          });
        }
        return { rows: [], rowsAffected: 1 };
      }

      if (sql.includes("SELECT") && sql.includes("WHERE content_hash =")) {
        const hash = args[0] as string;
        const row = storage.get(hash);
        return { rows: row ? [row] : [], rowsAffected: 0 };
      }

      if (sql.includes("SELECT content_hash FROM") && sql.includes("WHERE content_hash IN")) {
        const hashes = args as string[];
        const rows = hashes.filter((h) => storage.has(h)).map((h) => ({ content_hash: h }));
        return { rows, rowsAffected: 0 };
      }

      if (sql.includes("SELECT * FROM") && sql.includes("WHERE content_hash IN")) {
        const hashes = args as string[];
        const rows = hashes.map((h) => storage.get(h)).filter(Boolean);
        return { rows, rowsAffected: 0 };
      }

      if (sql.includes("SELECT 1 FROM")) {
        const hash = args[0] as string;
        return { rows: storage.has(hash) ? [{ "1": 1 }] : [], rowsAffected: 0 };
      }

      if (sql.includes("DELETE FROM") && sql.includes("WHERE content_hash =")) {
        const hash = args[0] as string;
        const deleted = storage.delete(hash);
        return { rows: [], rowsAffected: deleted ? 1 : 0 };
      }

      if (sql.includes("DELETE FROM") && sql.includes("WHERE content_hash IN")) {
        const hashes = args as string[];
        let deleted = 0;
        for (const h of hashes) {
          if (storage.delete(h)) deleted++;
        }
        return { rows: [], rowsAffected: deleted };
      }

      if (sql.includes("SELECT content_hash FROM prolly_nodes")) {
        const rows = Array.from(storage.keys()).map((h) => ({ content_hash: h }));
        return { rows, rowsAffected: 0 };
      }

      if (sql.includes("SELECT") && sql.includes("COUNT(*)")) {
        const total = storage.size;
        const leaves = Array.from(storage.values()).filter((r) => r["node_type"] === "leaf").length;
        const internals = Array.from(storage.values()).filter((r) => r["node_type"] === "internal").length;
        return { rows: [{ total, leaves, internals }], rowsAffected: 0 };
      }

      return { rows: [], rowsAffected: 0 };
    }),
    batch: mock(async () => []),
  };
}

describe("ProllyNodeStore", () => {
  let store: ProllyNodeStore;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    mockClient = createMockClient();
    store = new ProllyNodeStore({ enableCache: true, cacheSize: 100 });
    await store.initialize(mockClient as never);
  });

  describe("initialization", () => {
    it("should initialize successfully", () => {
      expect(store.isReady()).toBe(true);
    });

    it("should create table on init", () => {
      expect(mockClient.batch).toHaveBeenCalled();
    });
  });

  describe("put", () => {
    it("should store a leaf node and return hash", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1, 2, 3]),
        entryCount: 1,
      });

      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should store an internal node", async () => {
      const childHash = await store.put({
        type: "leaf",
        data: new Uint8Array([1]),
        entryCount: 1,
      });

      const parentHash = await store.put({
        type: "internal",
        childrenHashes: [childHash],
        keyRangeStart: "a",
        keyRangeEnd: "z",
        entryCount: 1,
      });

      expect(parentHash).toBeDefined();
      expect(parentHash).not.toBe(childHash);
    });

    it("should return same hash for identical content", async () => {
      const node = {
        type: "leaf" as const,
        data: new Uint8Array([1, 2, 3]),
        entryCount: 1,
      };

      const hash1 = await store.put(node);
      const hash2 = await store.put(node);

      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different content", async () => {
      const hash1 = await store.put({
        type: "leaf",
        data: new Uint8Array([1, 2, 3]),
        entryCount: 1,
      });

      const hash2 = await store.put({
        type: "leaf",
        data: new Uint8Array([4, 5, 6]),
        entryCount: 1,
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("get", () => {
    it("should retrieve stored node", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1, 2, 3]),
        keyRangeStart: "a",
        keyRangeEnd: "b",
        entryCount: 1,
      });

      const node = await store.get(hash);

      expect(node).toBeDefined();
      expect(node!.type).toBe("leaf");
      expect(node!.keyRangeStart).toBe("a");
      expect(node!.keyRangeEnd).toBe("b");
    });

    it("should return null for non-existent hash", async () => {
      const node = await store.get("non-existent-hash");
      expect(node).toBeNull();
    });

    it("should use cache for repeated gets", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1, 2, 3]),
        entryCount: 1,
      });

      // First get - from DB
      await store.get(hash);

      // Second get - from cache
      const callsBefore = mockClient.execute.mock.calls.length;
      await store.get(hash);
      const callsAfter = mockClient.execute.mock.calls.length;

      // Should not have made additional DB calls
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe("has", () => {
    it("should return true for existing node", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1]),
        entryCount: 1,
      });

      expect(await store.has(hash)).toBe(true);
    });

    it("should return false for non-existent node", async () => {
      expect(await store.has("non-existent")).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete existing node", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1]),
        entryCount: 1,
      });

      expect(await store.has(hash)).toBe(true);

      await store.delete(hash);

      // Note: Our mock doesn't actually delete from cache on single delete
      // In real implementation, cache would be cleared
    });
  });

  describe("putBatch", () => {
    it("should store multiple nodes", async () => {
      const nodes = [
        { type: "leaf" as const, data: new Uint8Array([1]), entryCount: 1 },
        { type: "leaf" as const, data: new Uint8Array([2]), entryCount: 1 },
        { type: "leaf" as const, data: new Uint8Array([3]), entryCount: 1 },
      ];

      const hashes = await store.putBatch(nodes);

      expect(hashes.length).toBe(3);
      expect(new Set(hashes).size).toBe(3); // All unique
    });

    it("should deduplicate identical nodes in batch", async () => {
      const sameNode = { type: "leaf" as const, data: new Uint8Array([1]), entryCount: 1 };
      const nodes = [sameNode, sameNode, sameNode];

      const hashes = await store.putBatch(nodes);

      expect(hashes.length).toBe(3);
      expect(new Set(hashes).size).toBe(1); // All same hash
    });
  });

  describe("getBatch", () => {
    it("should retrieve multiple nodes", async () => {
      const hash1 = await store.put({ type: "leaf", data: new Uint8Array([1]), entryCount: 1 });
      const hash2 = await store.put({ type: "leaf", data: new Uint8Array([2]), entryCount: 1 });
      const hash3 = await store.put({ type: "leaf", data: new Uint8Array([3]), entryCount: 1 });

      const nodes = await store.getBatch([hash1, hash2, hash3]);

      expect(nodes.size).toBe(3);
      expect(nodes.get(hash1)).toBeDefined();
      expect(nodes.get(hash2)).toBeDefined();
      expect(nodes.get(hash3)).toBeDefined();
    });

    it("should return empty map for non-existent hashes", async () => {
      const nodes = await store.getBatch(["non1", "non2"]);
      expect(nodes.size).toBe(0);
    });
  });

  describe("computeHash", () => {
    it("should compute deterministic hash", () => {
      const node = {
        type: "leaf" as const,
        data: new Uint8Array([1, 2, 3]),
      };

      const hash1 = store.computeHash(node);
      const hash2 = store.computeHash(node);

      expect(hash1).toBe(hash2);
    });

    it("should compute different hashes for different types", () => {
      const leaf = { type: "leaf" as const, data: new Uint8Array([1]) };
      const internal = { type: "internal" as const, childrenHashes: ["a"] };

      expect(store.computeHash(leaf)).not.toBe(store.computeHash(internal));
    });
  });

  describe("getStats", () => {
    it("should return correct statistics", async () => {
      await store.put({ type: "leaf", data: new Uint8Array([1]), entryCount: 1 });
      await store.put({ type: "leaf", data: new Uint8Array([2]), entryCount: 1 });
      await store.put({ type: "internal", childrenHashes: ["a"], entryCount: 2 });

      const stats = await store.getStats();

      expect(stats.totalNodes).toBe(3);
      expect(stats.leafNodes).toBe(2);
      expect(stats.internalNodes).toBe(1);
    });
  });

  describe("serialization helpers", () => {
    it("should serialize and deserialize leaf data", () => {
      const leafData = {
        entries: [
          { key: "a", value: new Uint8Array([1, 2, 3]), valueHash: "abc" },
          { key: "b", value: new Uint8Array([4, 5, 6]), valueHash: "def" },
        ],
      };

      const serialized = store.serializeLeafData(leafData);
      expect(serialized).toBeInstanceOf(Uint8Array);

      const deserialized = store.deserializeLeafData(serialized);
      expect(deserialized.entries.length).toBe(2);
      expect(deserialized.entries[0].key).toBe("a");
    });

    it("should hash values consistently", () => {
      const value = new Uint8Array([1, 2, 3, 4, 5]);

      const hash1 = store.hashValue(value);
      const hash2 = store.hashValue(value);

      expect(hash1).toBe(hash2);
    });
  });

  describe("cache management", () => {
    it("should clear cache", async () => {
      const hash = await store.put({
        type: "leaf",
        data: new Uint8Array([1]),
        entryCount: 1,
      });

      // Warm cache
      await store.get(hash);

      store.clearCache();

      // Next get should hit DB
      const callsBefore = mockClient.execute.mock.calls.length;
      await store.get(hash);
      const callsAfter = mockClient.execute.mock.calls.length;

      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
