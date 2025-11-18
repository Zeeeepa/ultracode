import { beforeEach, describe, expect, it } from "@jest/globals";
import type { CodeUnit } from "../../models/code-unit.js";
import { CodeUnitType } from "../../models/code-unit.js";
import type { VersionedIndex } from "../../models/versioned-index.js";
import { SemanticMatcher } from "../semantic-matcher.js";

describe("SemanticMatcher", () => {
  let matcher: SemanticMatcher;

  beforeEach(() => {
    matcher = new SemanticMatcher();
  });

  // Helper function to create a CodeUnit with embedding
  function createUnitWithEmbedding(
    id: string,
    name: string,
    embedding: Float32Array,
    structuralHash: string,
  ): CodeUnit {
    return {
      id,
      type: CodeUnitType.Function,
      name,
      fullyQualifiedName: `Module.${name}`,
      filePath: `/src/${name}.ts`,
      language: "typescript",
      content: `function ${name}() { return 42; }`,
      contentHash: `hash-${id}`,
      structuralHash,
      embedding,
      startLine: 1,
      endLine: 1,
      childIds: [],
      metadata: {},
    };
  }

  // Helper function to create VersionedIndex
  function createIndex(units: CodeUnit[]): VersionedIndex {
    const index: VersionedIndex = {
      branch: "test-branch",
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

  // Helper to create similar embeddings (same values)
  function createSimilarEmbedding(baseValue: number): Float32Array {
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = baseValue + Math.random() * 0.01; // Small variance
    }
    return embedding;
  }

  // Helper to create different embeddings
  function createDifferentEmbedding(baseValue: number): Float32Array {
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = baseValue + Math.random(); // Large variance
    }
    return embedding;
  }

  describe("findMatch", () => {
    it("should match units with high vector similarity", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);
      const baseEmbedding = createSimilarEmbedding(1.0);

      const targetUnit = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");
      const baseUnit = createUnitWithEmbedding("base-1", "foo", baseEmbedding, "struct-123");

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex, 0.7);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-1");
      expect(result?.vectorSimilarity).toBeGreaterThan(0.95); // Very similar
      expect(result?.structuralSimilarity).toBe(1.0); // Same structural hash
      expect(result?.combinedScore).toBeGreaterThan(0.95);
    });

    it("should prefer exact structural match when vector similarity is similar", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);
      const base1Embedding = createSimilarEmbedding(1.0);
      const base2Embedding = createSimilarEmbedding(1.01); // Slightly different

      const targetUnit = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");

      const baseUnit1 = createUnitWithEmbedding("base-1", "foo", base1Embedding, "struct-123"); // Same structural
      const baseUnit2 = createUnitWithEmbedding("base-2", "bar", base2Embedding, "struct-456"); // Different structural

      const baseIndex = createIndex([baseUnit1, baseUnit2]);

      const result = matcher.findMatch(targetUnit, baseIndex, 0.7);

      expect(result).toBeDefined();
      // Should prefer base-1 due to structural match (30% weight)
      expect(result?.baseUnitId).toBe("base-1");
      expect(result?.structuralSimilarity).toBe(1.0);
    });

    it("should return undefined when no match above threshold", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);
      const baseEmbedding = createDifferentEmbedding(5.0); // Very different

      const targetUnit = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");
      const baseUnit = createUnitWithEmbedding("base-1", "foo", baseEmbedding, "struct-456");

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex, 0.7);

      expect(result).toBeUndefined(); // No match above threshold
    });

    it("should throw error when target unit has no embedding", () => {
      const targetUnit = createUnitWithEmbedding("target-1", "foo", new Float32Array(), "struct");
      targetUnit.embedding = undefined; // Remove embedding

      const baseIndex = createIndex([]);

      expect(() => matcher.findMatch(targetUnit, baseIndex, 0.7)).toThrow(/missing embedding/);
    });

    it("should filter candidates by same type", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);
      const baseEmbedding = createSimilarEmbedding(1.0);

      const targetFunction = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");
      targetFunction.type = CodeUnitType.Function;

      const baseClass = createUnitWithEmbedding("base-1", "User", baseEmbedding, "struct-123");
      baseClass.type = CodeUnitType.Class;

      const baseIndex = createIndex([baseClass]);

      const result = matcher.findMatch(targetFunction, baseIndex, 0.7);

      expect(result).toBeUndefined(); // Should not match different type
    });

    it("should skip base units without embeddings", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);

      const targetUnit = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");

      const baseUnit = createUnitWithEmbedding("base-1", "foo", new Float32Array(), "struct-123");
      baseUnit.embedding = undefined; // Remove embedding

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex, 0.7);

      expect(result).toBeUndefined(); // No candidates with embeddings
    });
  });

  describe("bulkMatch", () => {
    it("should match multiple units in bulk", () => {
      const target1Embedding = createSimilarEmbedding(1.0);
      const target2Embedding = createSimilarEmbedding(2.0);

      const base1Embedding = createSimilarEmbedding(1.0);
      const base2Embedding = createSimilarEmbedding(2.0);

      const targetUnits = [
        createUnitWithEmbedding("target-1", "foo", target1Embedding, "struct-123"),
        createUnitWithEmbedding("target-2", "bar", target2Embedding, "struct-456"),
      ];

      const baseUnits = [
        createUnitWithEmbedding("base-1", "foo", base1Embedding, "struct-123"),
        createUnitWithEmbedding("base-2", "bar", base2Embedding, "struct-456"),
      ];

      const baseIndex = createIndex(baseUnits);

      const results = matcher.bulkMatch(targetUnits, baseIndex, 0.7);

      expect(results.size).toBe(2);
      expect(results.get("target-1")?.baseUnitId).toBe("base-1");
      expect(results.get("target-2")?.baseUnitId).toBe("base-2");
    });

    it("should skip target units without embeddings", () => {
      const target1WithEmbedding = createUnitWithEmbedding(
        "target-1",
        "foo",
        createSimilarEmbedding(1.0),
        "struct-123",
      );
      const target2WithoutEmbedding = createUnitWithEmbedding("target-2", "bar", new Float32Array(), "struct-456");
      target2WithoutEmbedding.embedding = undefined;

      const baseUnit = createUnitWithEmbedding("base-1", "foo", createSimilarEmbedding(1.0), "struct-123");

      const targetUnits = [target1WithEmbedding, target2WithoutEmbedding];
      const baseIndex = createIndex([baseUnit]);

      const results = matcher.bulkMatch(targetUnits, baseIndex, 0.7);

      expect(results.size).toBe(1); // Only matched target-1
      expect(results.has("target-1")).toBe(true);
      expect(results.has("target-2")).toBe(false);
    });

    it("should return empty map when no matches", () => {
      const targetUnits = [createUnitWithEmbedding("target-1", "foo", createDifferentEmbedding(1.0), "struct-123")];

      const baseUnits = [createUnitWithEmbedding("base-1", "foo", createDifferentEmbedding(5.0), "struct-456")];

      const baseIndex = createIndex(baseUnits);

      const results = matcher.bulkMatch(targetUnits, baseIndex, 0.7);

      expect(results.size).toBe(0);
    });
  });

  describe("computeStatistics", () => {
    it("should compute correct statistics", () => {
      const embedding1 = createSimilarEmbedding(1.0);
      const embedding2 = createSimilarEmbedding(1.0);

      const targetUnits = [
        createUnitWithEmbedding("target-1", "foo", embedding1, "struct-123"),
        createUnitWithEmbedding("target-2", "bar", embedding2, "struct-456"),
      ];

      const baseUnits = [
        createUnitWithEmbedding("base-1", "foo", embedding1, "struct-123"),
        createUnitWithEmbedding("base-2", "bar", embedding2, "struct-456"),
      ];

      const baseIndex = createIndex(baseUnits);
      const results = matcher.bulkMatch(targetUnits, baseIndex, 0.7);
      const stats = matcher.computeStatistics(results, targetUnits.length);

      expect(stats.totalUnits).toBe(2);
      expect(stats.totalMatched).toBe(2);
      expect(stats.coverage).toBe(1.0); // 100%
      expect(stats.avgVectorSimilarity).toBeGreaterThan(0.95);
      expect(stats.avgStructuralSimilarity).toBeGreaterThan(0.5); // Mix of matches
      expect(stats.avgCombinedScore).toBeGreaterThan(0.8);
    });

    it("should handle empty results", () => {
      const results = new Map();
      const stats = matcher.computeStatistics(results, 10);

      expect(stats.totalUnits).toBe(10);
      expect(stats.totalMatched).toBe(0);
      expect(stats.coverage).toBe(0);
      expect(stats.avgVectorSimilarity).toBe(0);
      expect(stats.avgStructuralSimilarity).toBe(0);
      expect(stats.avgCombinedScore).toBe(0);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty base index", () => {
      const targetUnit = createUnitWithEmbedding("target-1", "foo", createSimilarEmbedding(1.0), "struct-123");
      const baseIndex = createIndex([]);

      const result = matcher.findMatch(targetUnit, baseIndex, 0.7);

      expect(result).toBeUndefined();
    });

    it("should handle different threshold values", () => {
      const targetEmbedding = createSimilarEmbedding(1.0);
      const baseEmbedding = createSimilarEmbedding(1.05); // Medium similarity

      const targetUnit = createUnitWithEmbedding("target-1", "foo", targetEmbedding, "struct-123");
      const baseUnit = createUnitWithEmbedding("base-1", "foo", baseEmbedding, "struct-456");

      const baseIndex = createIndex([baseUnit]);

      // With low threshold - should match
      const resultLow = matcher.findMatch(targetUnit, baseIndex, 0.5);
      expect(resultLow).toBeDefined();

      // With high threshold (0.95) - match depends on actual similarity
      // (not tested here as it's non-deterministic with random embeddings)
    });
  });
});
