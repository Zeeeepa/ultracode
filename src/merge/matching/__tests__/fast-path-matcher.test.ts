import { beforeEach, describe, expect, it } from "bun:test";
import type { CodeUnit } from "../../models/code-unit.js";
import { CodeUnitType } from "../../models/code-unit.js";
import type { VersionedIndex } from "../../models/versioned-index.js";
import { FastPathMatcher, FastPathMatchLevel } from "../fast-path-matcher.js";

describe("FastPathMatcher", () => {
  let matcher: FastPathMatcher;

  beforeEach(() => {
    matcher = new FastPathMatcher();
  });

  // Helper function to create a CodeUnit
  function createUnit(
    id: string,
    name: string,
    contentHash: string,
    structuralHash: string,
    signature?: string,
  ): CodeUnit {
    return {
      id,
      type: CodeUnitType.Function,
      name,
      fullyQualifiedName: `Module.${name}`,
      filePath: `/src/${name}.ts`,
      language: "typescript",
      content: `function ${name}() { return 42; }`,
      contentHash,
      structuralHash,
      signature,
      startLine: 1,
      endLine: 1,
      childIds: [],
      metadata: {},
    };
  }

  // Helper function to create a VersionedIndex
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
      // Add to main units map
      index.units.set(unit.id, unit);

      // Add to contentHashIndex
      if (!index.contentHashIndex.has(unit.contentHash)) {
        index.contentHashIndex.set(unit.contentHash, []);
      }
      index.contentHashIndex.get(unit.contentHash)?.push(unit.id);

      // Add to structuralHashIndex
      if (!index.structuralHashIndex.has(unit.structuralHash)) {
        index.structuralHashIndex.set(unit.structuralHash, []);
      }
      index.structuralHashIndex.get(unit.structuralHash)?.push(unit.id);

      // Add to signatureIndex
      if (unit.signature) {
        if (!index.signatureIndex.has(unit.signature)) {
          index.signatureIndex.set(unit.signature, []);
        }
        index.signatureIndex.get(unit.signature)?.push(unit.id);
      }
    }

    return index;
  }

  describe("Level 1: Exact Content Match", () => {
    it("should match units with identical content hash", () => {
      const baseUnit = createUnit("base-1", "foo", "content-hash-123", "struct-hash-123");
      const targetUnit = createUnit("target-1", "foo", "content-hash-123", "struct-hash-123");

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.level).toBe(FastPathMatchLevel.ExactContent);
      expect(result?.confidence).toBe(1.0);
      expect(result?.baseUnitId).toBe("base-1");
      expect(result?.baseUnit).toBe(baseUnit);
    });

    it("should prefer same file path when multiple content matches exist", () => {
      const baseUnit1 = createUnit("base-1", "foo", "content-hash-123", "struct-hash-123");
      baseUnit1.filePath = "/src/foo.ts";

      const baseUnit2 = createUnit("base-2", "foo", "content-hash-123", "struct-hash-456");
      baseUnit2.filePath = "/src/other.ts";

      const targetUnit = createUnit("target-1", "foo", "content-hash-123", "struct-hash-123");
      targetUnit.filePath = "/src/foo.ts";

      const baseIndex = createIndex([baseUnit1, baseUnit2]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-1"); // Prefer same file path
    });

    it("should return first match when no file path preference exists", () => {
      const baseUnit1 = createUnit("base-1", "foo", "content-hash-123", "struct-hash-123");
      baseUnit1.filePath = "/src/other1.ts";

      const baseUnit2 = createUnit("base-2", "foo", "content-hash-123", "struct-hash-456");
      baseUnit2.filePath = "/src/other2.ts";

      const targetUnit = createUnit("target-1", "foo", "content-hash-123", "struct-hash-123");
      targetUnit.filePath = "/src/foo.ts"; // Different from both

      const baseIndex = createIndex([baseUnit1, baseUnit2]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-1"); // First candidate
    });
  });

  describe("Level 2: Structural Match", () => {
    it("should match units with identical structural hash", () => {
      const baseUnit = createUnit("base-1", "foo", "content-hash-AAA", "struct-hash-123");
      const targetUnit = createUnit("target-1", "foo", "content-hash-BBB", "struct-hash-123");

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.level).toBe(FastPathMatchLevel.Structural);
      expect(result?.confidence).toBe(0.95);
      expect(result?.baseUnitId).toBe("base-1");
    });

    it("should filter to same type in structural match", () => {
      const baseClass = createUnit("base-1", "User", "hash-A", "struct-hash-123");
      baseClass.type = CodeUnitType.Class;

      const baseFunction = createUnit("base-2", "foo", "hash-B", "struct-hash-123");
      baseFunction.type = CodeUnitType.Function;

      const targetUnit = createUnit("target-1", "foo", "hash-C", "struct-hash-123");
      targetUnit.type = CodeUnitType.Function;

      const baseIndex = createIndex([baseClass, baseFunction]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-2"); // Should match function, not class
    });

    it("should prefer same file path and name in structural match", () => {
      const baseUnit1 = createUnit("base-1", "foo", "hash-A", "struct-hash-123");
      baseUnit1.filePath = "/src/foo.ts";

      const baseUnit2 = createUnit("base-2", "bar", "hash-B", "struct-hash-123");
      baseUnit2.filePath = "/src/bar.ts";

      const targetUnit = createUnit("target-1", "foo", "hash-C", "struct-hash-123");
      targetUnit.filePath = "/src/foo.ts";

      const baseIndex = createIndex([baseUnit1, baseUnit2]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-1"); // Prefer same file path and name
    });

    it("should return undefined when no candidates have matching type", () => {
      const baseClass = createUnit("base-1", "User", "hash-A", "struct-hash-123");
      baseClass.type = CodeUnitType.Class;

      const targetFunction = createUnit("target-1", "foo", "hash-B", "struct-hash-123");
      targetFunction.type = CodeUnitType.Function;

      const baseIndex = createIndex([baseClass]);

      const result = matcher.findMatch(targetFunction, baseIndex);

      // Should fall through to Level 3 and 4, which will also fail
      expect(result).toBeUndefined();
    });
  });

  describe("Level 3: Signature Match", () => {
    it("should match units with identical signature", () => {
      const baseUnit = createUnit("base-1", "getUserById", "hash-A", "struct-A", "Module.getUserById(number)");
      const targetUnit = createUnit("target-1", "getUserById", "hash-B", "struct-B", "Module.getUserById(number)");

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.level).toBe(FastPathMatchLevel.Signature);
      expect(result?.confidence).toBe(0.85);
      expect(result?.baseUnitId).toBe("base-1");
    });

    it("should skip signature match when target has no signature", () => {
      const baseUnit = createUnit("base-1", "foo", "hash-A", "struct-A", "Module.foo()");
      const targetUnit = createUnit("target-1", "foo", "hash-B", "struct-B");
      targetUnit.signature = undefined;

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      // Should skip Level 3 and try Level 4 (ID match)
      expect(result?.level).not.toBe(FastPathMatchLevel.Signature);
    });

    it("should filter to same type in signature match", () => {
      const baseClass = createUnit("base-1", "User", "hash-A", "struct-A", "Module.User<T>");
      baseClass.type = CodeUnitType.Class;

      const baseFunction = createUnit("base-2", "foo", "hash-B", "struct-B", "Module.User<T>");
      baseFunction.type = CodeUnitType.Function;

      const targetClass = createUnit("target-1", "User", "hash-C", "struct-C", "Module.User<T>");
      targetClass.type = CodeUnitType.Class;

      const baseIndex = createIndex([baseClass, baseFunction]);

      const result = matcher.findMatch(targetClass, baseIndex);

      expect(result).toBeDefined();
      expect(result?.baseUnitId).toBe("base-1"); // Should match class, not function
    });
  });

  describe("Level 4: ID Match", () => {
    it("should match units with same ID and FQN", () => {
      const baseUnit = createUnit("stable-id-1", "foo", "hash-A", "struct-A");
      baseUnit.fullyQualifiedName = "Module.foo";

      const targetUnit = createUnit("stable-id-1", "foo", "hash-B", "struct-B");
      targetUnit.fullyQualifiedName = "Module.foo";

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeDefined();
      expect(result?.level).toBe(FastPathMatchLevel.Id);
      expect(result?.confidence).toBe(0.7);
      expect(result?.baseUnitId).toBe("stable-id-1");
    });

    it("should not match if FQN is different (moved/renamed)", () => {
      const baseUnit = createUnit("stable-id-1", "foo", "hash-A", "struct-A");
      baseUnit.fullyQualifiedName = "Module1.foo";

      const targetUnit = createUnit("stable-id-1", "foo", "hash-B", "struct-B");
      targetUnit.fullyQualifiedName = "Module2.foo"; // Different FQN

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeUndefined(); // Should not match
    });
  });

  describe("bulkMatch", () => {
    it("should match multiple units in bulk", () => {
      const baseUnits = [
        createUnit("base-1", "foo", "hash-123", "struct-123"),
        createUnit("base-2", "bar", "hash-456", "struct-456"),
        createUnit("base-3", "baz", "hash-789", "struct-789"),
      ];

      const targetUnits = [
        createUnit("target-1", "foo", "hash-123", "struct-123"), // Exact match
        createUnit("target-2", "bar", "hash-XXX", "struct-456"), // Structural match
        createUnit("target-3", "qux", "hash-YYY", "struct-YYY"), // No match
      ];

      const baseIndex = createIndex(baseUnits);
      const targetIndex = createIndex(targetUnits);

      const results = matcher.bulkMatch(baseIndex, targetIndex);

      expect(results.size).toBe(2); // 2 out of 3 matched

      expect(results.get("target-1")?.level).toBe(FastPathMatchLevel.ExactContent);
      expect(results.get("target-2")?.level).toBe(FastPathMatchLevel.Structural);
      expect(results.has("target-3")).toBe(false); // No match
    });

    it("should return empty map when no matches found", () => {
      const baseUnits = [createUnit("base-1", "foo", "hash-123", "struct-123")];
      const targetUnits = [createUnit("target-1", "bar", "hash-XXX", "struct-YYY")];

      const baseIndex = createIndex(baseUnits);
      const targetIndex = createIndex(targetUnits);

      const results = matcher.bulkMatch(baseIndex, targetIndex);

      expect(results.size).toBe(0);
    });
  });

  describe("computeStatistics", () => {
    it("should compute correct statistics", () => {
      const baseUnits = [
        createUnit("base-1", "foo", "hash-123", "struct-123"),
        createUnit("base-2", "bar", "hash-456", "struct-456"),
        createUnit("base-3", "baz", "hash-789", "struct-789"),
        createUnit("base-4", "qux", "hash-ABC", "struct-ABC"),
      ];

      const targetUnits = [
        createUnit("target-1", "foo", "hash-123", "struct-123"), // Exact
        createUnit("target-2", "bar", "hash-XXX", "struct-456"), // Structural
        createUnit("target-3", "baz", "hash-YYY", "struct-YYY", "Module.baz()"), // Will try signature
        createUnit("target-4", "new", "hash-ZZZ", "struct-ZZZ"), // No match
      ];

      const baseIndex = createIndex(baseUnits);
      const targetIndex = createIndex(targetUnits);

      const results = matcher.bulkMatch(baseIndex, targetIndex);
      const stats = matcher.computeStatistics(results, targetUnits.length);

      expect(stats.totalUnits).toBe(4);
      expect(stats.totalMatched).toBe(2); // Only exact and structural matched
      expect(stats.coverage).toBeCloseTo(0.5); // 50% coverage
      expect(stats.exactContentMatches).toBe(1);
      expect(stats.structuralMatches).toBe(1);
    });

    it("should return 0 coverage when no matches", () => {
      const results = new Map();
      const stats = matcher.computeStatistics(results, 10);

      expect(stats.totalUnits).toBe(10);
      expect(stats.totalMatched).toBe(0);
      expect(stats.coverage).toBe(0);
      expect(stats.exactContentMatches).toBe(0);
      expect(stats.structuralMatches).toBe(0);
      expect(stats.signatureMatches).toBe(0);
      expect(stats.idMatches).toBe(0);
    });

    it("should return 100% coverage when all match", () => {
      const baseUnits = [
        createUnit("base-1", "foo", "hash-123", "struct-123"),
        createUnit("base-2", "bar", "hash-456", "struct-456"),
      ];

      const targetUnits = [
        createUnit("target-1", "foo", "hash-123", "struct-123"),
        createUnit("target-2", "bar", "hash-456", "struct-456"),
      ];

      const baseIndex = createIndex(baseUnits);
      const targetIndex = createIndex(targetUnits);

      const results = matcher.bulkMatch(baseIndex, targetIndex);
      const stats = matcher.computeStatistics(results, targetUnits.length);

      expect(stats.totalUnits).toBe(2);
      expect(stats.totalMatched).toBe(2);
      expect(stats.coverage).toBe(1.0); // 100%
    });
  });

  describe("Edge cases", () => {
    it("should handle empty base index", () => {
      const targetUnit = createUnit("target-1", "foo", "hash-123", "struct-123");
      const baseIndex = createIndex([]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result).toBeUndefined();
    });

    it("should handle empty target index in bulk match", () => {
      const baseUnits = [createUnit("base-1", "foo", "hash-123", "struct-123")];
      const baseIndex = createIndex(baseUnits);
      const targetIndex = createIndex([]);

      const results = matcher.bulkMatch(baseIndex, targetIndex);

      expect(results.size).toBe(0);
    });

    it("should prioritize earlier match levels", () => {
      // Unit that matches on ALL levels - should return Level 1 (Exact)
      const baseUnit = createUnit("stable-id-1", "foo", "hash-123", "struct-123", "Module.foo()");
      baseUnit.fullyQualifiedName = "Module.foo";

      const targetUnit = createUnit("stable-id-1", "foo", "hash-123", "struct-123", "Module.foo()");
      targetUnit.fullyQualifiedName = "Module.foo";

      const baseIndex = createIndex([baseUnit]);

      const result = matcher.findMatch(targetUnit, baseIndex);

      expect(result?.level).toBe(FastPathMatchLevel.ExactContent); // Should be Level 1, not 2, 3, or 4
      expect(result?.confidence).toBe(1.0);
    });
  });
});
