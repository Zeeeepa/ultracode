import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { CodeUnit } from "../../models/code-unit.js";
import { CodeUnitType } from "../../models/code-unit.js";
import type { VersionedIndex } from "../../models/versioned-index.js";
import type { EmbeddingGeneratorFn } from "../lazy-embedding-cache.js";
import { LazyEmbeddingCache } from "../lazy-embedding-cache.js";

describe("LazyEmbeddingCache", () => {
  let cache: LazyEmbeddingCache;
  let mockGenerator: jest.Mock<EmbeddingGeneratorFn>;

  beforeEach(() => {
    // Create mock embedding generator
    mockGenerator = jest.fn<EmbeddingGeneratorFn>(async (code: string) => {
      // Generate deterministic embedding based on code
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        embedding[i] = code.length + i * 0.01;
      }
      return embedding;
    });

    cache = new LazyEmbeddingCache(mockGenerator, { batchSize: 2 });
  });

  // Helper function to create CodeUnit
  function createUnit(id: string, name: string, contentHash: string): CodeUnit {
    return {
      id,
      type: CodeUnitType.Function,
      name,
      fullyQualifiedName: `Module.${name}`,
      filePath: `/src/${name}.ts`,
      language: "typescript",
      content: `function ${name}() { return 42; }`,
      contentHash,
      structuralHash: `struct-${id}`,
      startLine: 1,
      endLine: 1,
      childIds: [],
      metadata: {},
    };
  }

  // Helper to create index
  function createIndex(units: CodeUnit[]): VersionedIndex {
    const index: VersionedIndex = {
      branch: "test",
      indexedAt: new Date(),
      units: new Map(),
      contentHashIndex: new Map(),
      structuralHashIndex: new Map(),
      signatureIndex: new Map(),
      filePathIndex: new Map(),
      stats: {
        totalUnits: units.length,
        byType: new Map(),
        byLanguage: new Map(),
        byFile: new Map(),
      },
    };

    for (const unit of units) {
      index.units.set(unit.id, unit);
    }

    return index;
  }

  describe("generateEmbeddings", () => {
    it("should generate embeddings for units without embeddings", async () => {
      const unit1 = createUnit("unit-1", "foo", "hash-1");
      const unit2 = createUnit("unit-2", "bar", "hash-2");

      const units = [unit1, unit2];
      const index = createIndex(units);

      await cache.generateEmbeddings(index, units);

      // Check embeddings were generated
      expect(unit1.embedding).toBeDefined();
      expect(unit2.embedding).toBeInstanceOf(Float32Array);
      expect(unit1.embedding?.length).toBe(384);
      expect(unit2.embedding?.length).toBe(384);

      // Check generator was called
      expect(mockGenerator).toHaveBeenCalledTimes(2);
      expect(mockGenerator).toHaveBeenCalledWith(unit1.content);
      expect(mockGenerator).toHaveBeenCalledWith(unit2.content);
    });

    it("should skip units that already have embeddings", async () => {
      const unit1 = createUnit("unit-1", "foo", "hash-1");
      unit1.embedding = new Float32Array(384); // Already has embedding

      const unit2 = createUnit("unit-2", "bar", "hash-2");

      const units = [unit1, unit2];
      const index = createIndex(units);

      await cache.generateEmbeddings(index, units);

      // Only unit2 should have generated embedding
      expect(mockGenerator).toHaveBeenCalledTimes(1);
      expect(mockGenerator).toHaveBeenCalledWith(unit2.content);
    });

    it("should process units in batches", async () => {
      const units = [
        createUnit("unit-1", "foo", "hash-1"),
        createUnit("unit-2", "bar", "hash-2"),
        createUnit("unit-3", "baz", "hash-3"),
      ];

      const index = createIndex(units);

      await cache.generateEmbeddings(index, units);

      // All units should have embeddings
      expect(units[0]!.embedding).toBeDefined();
      expect(units[1]!.embedding).toBeDefined();
      expect(units[2]!.embedding).toBeDefined();

      // Generator called 3 times (batch size is 2)
      expect(mockGenerator).toHaveBeenCalledTimes(3);
    });

    it("should update units in index", async () => {
      const unit = createUnit("unit-1", "foo", "hash-1");
      const index = createIndex([unit]);

      await cache.generateEmbeddings(index, [unit]);

      // Unit in index should have embedding
      const updatedUnit = index.units.get("unit-1");
      expect(updatedUnit?.embedding).toBeDefined();
      expect(updatedUnit?.embedding).toBeInstanceOf(Float32Array);
    });

    it("should do nothing when all units have embeddings", async () => {
      const unit = createUnit("unit-1", "foo", "hash-1");
      unit.embedding = new Float32Array(384);

      const index = createIndex([unit]);

      await cache.generateEmbeddings(index, [unit]);

      // Generator should not be called
      expect(mockGenerator).not.toHaveBeenCalled();
    });
  });

  describe("Cache behavior", () => {
    it("should cache embeddings by contentHash", async () => {
      // Two units with same content (same contentHash)
      const unit1 = createUnit("unit-1", "foo", "hash-123");
      const unit2 = createUnit("unit-2", "foo", "hash-123"); // Same contentHash

      const index = createIndex([unit1, unit2]);

      await cache.generateEmbeddings(index, [unit1]);
      await cache.generateEmbeddings(index, [unit2]);

      // Generator should be called only once (cached)
      expect(mockGenerator).toHaveBeenCalledTimes(1);

      // Both units should have same embedding
      expect(unit1.embedding).toEqual(unit2.embedding);
    });

    it("should generate different embeddings for different content", async () => {
      const unit1 = createUnit("unit-1", "foo", "hash-1");
      const unit2 = createUnit("unit-2", "bar", "hash-2"); // Different contentHash
      // Make content different length so mock generator produces different embeddings
      unit2.content = "function barFunction() { return 100; }"; // Longer than foo

      const index = createIndex([unit1, unit2]);

      await cache.generateEmbeddings(index, [unit1, unit2]);

      // Generator should be called twice
      expect(mockGenerator).toHaveBeenCalledTimes(2);

      // Units should have different embeddings
      expect(unit1.embedding).not.toEqual(unit2.embedding);
    });
  });

  describe("getCacheStats", () => {
    it("should return correct cache statistics", async () => {
      const units = [
        createUnit("unit-1", "foo", "hash-1"),
        createUnit("unit-2", "bar", "hash-2"),
        createUnit("unit-3", "baz", "hash-3"),
      ];

      const index = createIndex(units);

      await cache.generateEmbeddings(index, units);

      const stats = cache.getCacheStats();

      expect(stats.size).toBe(3);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      // Each embedding ~1.6KB, so 3 * 1.6KB = ~4.8KB
      expect(stats.memoryUsage).toBeGreaterThan(4000);
    });

    it("should return zero stats for empty cache", () => {
      const stats = cache.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.memoryUsage).toBe(0);
    });
  });

  describe("clearCache", () => {
    it("should clear in-memory cache", async () => {
      const unit = createUnit("unit-1", "foo", "hash-1");
      const index = createIndex([unit]);

      await cache.generateEmbeddings(index, [unit]);

      // Cache should have entry
      expect(cache.getCacheStats().size).toBe(1);

      // Clear cache
      cache.clearCache();

      // Cache should be empty
      expect(cache.getCacheStats().size).toBe(0);

      // Re-generating should call generator again
      const unit2 = createUnit("unit-2", "foo2", "hash-1"); // Same hash
      await cache.generateEmbeddings(index, [unit2]);

      expect(mockGenerator).toHaveBeenCalledTimes(2); // Called again after clear
    });
  });

  describe("Edge cases", () => {
    it("should handle empty units array", async () => {
      const index = createIndex([]);

      await cache.generateEmbeddings(index, []);

      // Should not throw
      expect(mockGenerator).not.toHaveBeenCalled();
    });

    it("should handle generator errors gracefully", async () => {
      const errorGenerator = jest.fn<EmbeddingGeneratorFn>(async () => {
        throw new Error("Generator failed");
      });

      const errorCache = new LazyEmbeddingCache(errorGenerator);
      const unit = createUnit("unit-1", "foo", "hash-1");
      const index = createIndex([unit]);

      // Should propagate error
      await expect(errorCache.generateEmbeddings(index, [unit])).rejects.toThrow("Generator failed");
    });

    it("should handle large batch sizes", async () => {
      const largeCache = new LazyEmbeddingCache(mockGenerator, { batchSize: 1000 });

      const units = Array.from({ length: 10 }, (_, i) => createUnit(`unit-${i}`, `foo${i}`, `hash-${i}`));

      const index = createIndex(units);

      await largeCache.generateEmbeddings(index, units);

      expect(mockGenerator).toHaveBeenCalledTimes(10);
    });
  });
});
