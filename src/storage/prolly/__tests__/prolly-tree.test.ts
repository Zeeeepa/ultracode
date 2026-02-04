import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { ProllyNodeStore } from "../node-store.js";
import { deserializeEntity, ProllyTree, serializeEntity } from "../prolly-tree.js";

// Mock Client for testing
function createMockClient() {
  const storage = new Map<string, unknown>();

  return {
    execute: mock(async ({ sql, args }: { sql: string; args: unknown[] }) => {
      // Parse simple SQL for testing
      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [], rowsAffected: 0 };
      }

      if (sql.includes("INSERT")) {
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
        return { rows: [], rowsAffected: 1 };
      }

      if (sql.includes("SELECT") && sql.includes("WHERE content_hash =")) {
        const hash = args[0] as string;
        const row = storage.get(hash);
        return { rows: row ? [row] : [], rowsAffected: 0 };
      }

      if (sql.includes("SELECT") && sql.includes("WHERE content_hash IN")) {
        const hashes = args as string[];
        const rows = hashes.map((h) => storage.get(h)).filter(Boolean);
        return { rows, rowsAffected: 0 };
      }

      if (sql.includes("SELECT 1")) {
        const hash = args[0] as string;
        return { rows: storage.has(hash) ? [{ "1": 1 }] : [], rowsAffected: 0 };
      }

      return { rows: [], rowsAffected: 0 };
    }),
    batch: mock(async () => {
      return [];
    }),
  };
}

describe("ProllyTree", () => {
  let nodeStore: ProllyNodeStore;
  let tree: ProllyTree;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(async () => {
    mockClient = createMockClient();
    nodeStore = new ProllyNodeStore({ enableCache: false });
    await nodeStore.initialize(mockClient as never);

    tree = new ProllyTree(nodeStore);
    await tree.initialize();
  });

  describe("build", () => {
    it("should build tree from empty entries", async () => {
      const rootHash = await tree.build([]);
      expect(rootHash).toBeDefined();
      expect(typeof rootHash).toBe("string");
      expect(rootHash.length).toBeGreaterThan(0);
    });

    it("should build tree from single entry", async () => {
      const entries = [{ key: "entity1", value: new Uint8Array([1, 2, 3]) }];

      const rootHash = await tree.build(entries);
      expect(rootHash).toBeDefined();

      const retrieved = await tree.get("entity1");
      expect(retrieved).toBeDefined();
      expect(Array.from(retrieved!)).toEqual([1, 2, 3]);
    });

    it("should build tree from multiple entries", async () => {
      const entries = [
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
        { key: "c", value: new Uint8Array([3]) },
      ];

      const rootHash = await tree.build(entries);
      expect(rootHash).toBeDefined();

      expect(await tree.get("a")).toEqual(new Uint8Array([1]));
      expect(await tree.get("b")).toEqual(new Uint8Array([2]));
      expect(await tree.get("c")).toEqual(new Uint8Array([3]));
    });

    it("should sort entries by key", async () => {
      const entries = [
        { key: "z", value: new Uint8Array([3]) },
        { key: "a", value: new Uint8Array([1]) },
        { key: "m", value: new Uint8Array([2]) },
      ];

      await tree.build(entries);
      const allEntries = await tree.getAllEntries();

      // Should be sorted
      expect(allEntries[0].key).toBe("a");
      expect(allEntries[1].key).toBe("m");
      expect(allEntries[2].key).toBe("z");
    });
  });

  describe("get", () => {
    it("should return null for missing key", async () => {
      await tree.build([{ key: "exists", value: new Uint8Array([1]) }]);

      const result = await tree.get("not-exists");
      expect(result).toBeNull();
    });

    it("should return null for empty tree", async () => {
      await tree.build([]);
      const result = await tree.get("any-key");
      expect(result).toBeNull();
    });
  });

  describe("insert", () => {
    it("should insert new key", async () => {
      await tree.build([{ key: "a", value: new Uint8Array([1]) }]);

      const newRoot = await tree.insert("b", new Uint8Array([2]));
      expect(newRoot).toBeDefined();

      expect(await tree.get("a")).toEqual(new Uint8Array([1]));
      expect(await tree.get("b")).toEqual(new Uint8Array([2]));
    });

    it("should update existing key", async () => {
      await tree.build([{ key: "a", value: new Uint8Array([1]) }]);

      await tree.insert("a", new Uint8Array([99]));

      expect(await tree.get("a")).toEqual(new Uint8Array([99]));
    });
  });

  describe("delete", () => {
    it("should delete existing key", async () => {
      await tree.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
      ]);

      await tree.delete("a");

      expect(await tree.get("a")).toBeNull();
      expect(await tree.get("b")).toEqual(new Uint8Array([2]));
    });

    it("should handle delete of non-existent key", async () => {
      await tree.build([{ key: "a", value: new Uint8Array([1]) }]);

      await tree.delete("not-exists");

      expect(await tree.get("a")).toEqual(new Uint8Array([1]));
    });
  });

  describe("range", () => {
    it("should return entries in range", async () => {
      await tree.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
        { key: "c", value: new Uint8Array([3]) },
        { key: "d", value: new Uint8Array([4]) },
      ]);

      const result = await tree.range("b", "c");

      expect(result.size).toBe(2);
      expect(result.get("b")).toEqual(new Uint8Array([2]));
      expect(result.get("c")).toEqual(new Uint8Array([3]));
    });

    it("should return empty map for no matches", async () => {
      await tree.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "z", value: new Uint8Array([2]) },
      ]);

      const result = await tree.range("m", "n");
      expect(result.size).toBe(0);
    });
  });

  describe("diff", () => {
    it("should detect added entries", async () => {
      const tree1 = new ProllyTree(nodeStore);
      await tree1.initialize();
      const root1 = await tree1.build([{ key: "a", value: new Uint8Array([1]) }]);

      const tree2 = new ProllyTree(nodeStore);
      await tree2.initialize();
      await tree2.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
      ]);

      tree1.setRootHash(root1);
      const diff = await tree1.diff(tree2.getRootHash()!);

      expect(diff.added.length).toBe(1);
      expect(diff.added[0].key).toBe("b");
      expect(diff.modified.length).toBe(0);
      expect(diff.deleted.length).toBe(0);
    });

    it("should detect deleted entries", async () => {
      const tree1 = new ProllyTree(nodeStore);
      await tree1.initialize();
      const root1 = await tree1.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
      ]);

      const tree2 = new ProllyTree(nodeStore);
      await tree2.initialize();
      await tree2.build([{ key: "a", value: new Uint8Array([1]) }]);

      tree1.setRootHash(root1);
      const diff = await tree1.diff(tree2.getRootHash()!);

      expect(diff.added.length).toBe(0);
      expect(diff.modified.length).toBe(0);
      expect(diff.deleted.length).toBe(1);
      expect(diff.deleted[0].key).toBe("b");
    });

    it("should detect modified entries", async () => {
      const tree1 = new ProllyTree(nodeStore);
      await tree1.initialize();
      const root1 = await tree1.build([{ key: "a", value: new Uint8Array([1]) }]);

      const tree2 = new ProllyTree(nodeStore);
      await tree2.initialize();
      await tree2.build([{ key: "a", value: new Uint8Array([99]) }]);

      tree1.setRootHash(root1);
      const diff = await tree1.diff(tree2.getRootHash()!);

      expect(diff.added.length).toBe(0);
      expect(diff.modified.length).toBe(1);
      expect(diff.modified[0].key).toBe("a");
      expect(diff.deleted.length).toBe(0);
    });

    it("should return empty diff for identical trees", async () => {
      const entries = [
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
      ];

      const tree1 = new ProllyTree(nodeStore);
      await tree1.initialize();
      const root1 = await tree1.build(entries);

      const tree2 = new ProllyTree(nodeStore);
      await tree2.initialize();
      const root2 = await tree2.build(entries);

      // Same content = same root hash = structural sharing
      expect(root1).toBe(root2);

      tree1.setRootHash(root1);
      const diff = await tree1.diff(root2);

      expect(diff.added.length).toBe(0);
      expect(diff.modified.length).toBe(0);
      expect(diff.deleted.length).toBe(0);
      expect(diff.stats.nodesSkipped).toBeGreaterThan(0); // Skipped due to identical hashes
    });
  });

  describe("getStats", () => {
    it("should return stats for non-empty tree", async () => {
      await tree.build([
        { key: "a", value: new Uint8Array([1]) },
        { key: "b", value: new Uint8Array([2]) },
        { key: "c", value: new Uint8Array([3]) },
      ]);

      const stats = await tree.getStats();

      expect(stats.rootHash).toBeDefined();
      expect(stats.entryCount).toBe(3);
      expect(stats.depth).toBeGreaterThanOrEqual(1);
      expect(stats.nodeCount).toBeGreaterThanOrEqual(1);
    });

    it("should return zero stats for empty tree", async () => {
      const stats = await tree.getStats();

      expect(stats.rootHash).toBeNull();
      expect(stats.entryCount).toBe(0);
      expect(stats.depth).toBe(0);
      expect(stats.nodeCount).toBe(0);
    });
  });

  describe("serialization", () => {
    it("should serialize and deserialize entities", () => {
      const entity = {
        id: "test-123",
        name: "TestEntity",
        type: "function",
        filePath: "/src/test.ts",
        metadata: { params: ["a", "b"] },
      };

      const serialized = serializeEntity(entity);
      expect(serialized).toBeInstanceOf(Uint8Array);

      const deserialized = deserializeEntity(serialized);
      expect(deserialized).toEqual(entity);
    });

    it("should handle complex nested objects", () => {
      const complex = {
        nested: {
          deep: {
            value: [1, 2, 3],
            map: { a: 1, b: 2 },
          },
        },
        array: [{ x: 1 }, { y: 2 }],
      };

      const serialized = serializeEntity(complex);
      const deserialized = deserializeEntity(serialized);

      expect(deserialized).toEqual(complex);
    });
  });
});
