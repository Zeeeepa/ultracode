import { describe, expect, it } from "bun:test";
import { ConflictDetector } from "../analysis/conflict-detector.js";
import type { ChangeIntent } from "../models/change-intent.js";
import { ChangeIntentType } from "../models/change-intent.js";
import { type CodeUnit, CodeUnitType } from "../models/code-unit.js";
import { ConflictSeverity, ConflictType } from "../models/semantic-conflict.js";

describe("ConflictDetector", () => {
  const detector = new ConflictDetector();

  const createCodeUnit = (overrides: Partial<CodeUnit> = {}): CodeUnit => ({
    id: "test-id",
    type: CodeUnitType.Function,
    filePath: "test.ts",
    name: "testFunction",
    fullyQualifiedName: "test.testFunction",
    startLine: 1,
    endLine: 10,
    content: "function test() {}",
    contentHash: "hash-content",
    structuralHash: "hash-structural",
    signature: "function test(): void",
    childIds: [],
    language: "typescript",
    metadata: {},
    ...overrides,
  });

  const createIntent = (type: ChangeIntentType): ChangeIntent => ({
    type,
    confidence: 0.8,
    evidence: [],
    description: `${type} detected`,
  });

  describe("detectConflict", () => {
    it("should return null for identical changes", () => {
      const baseUnit = createCodeUnit({ contentHash: "base-hash" });
      const branchAUnit = createCodeUnit({ contentHash: "same-hash" });
      const branchBUnit = createCodeUnit({ contentHash: "same-hash" });

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit);

      expect(conflict).toBeNull();
    });

    it("should detect API breaking change when both branches change signature", () => {
      const baseUnit = createCodeUnit({
        signature: "function test(): void",
        contentHash: "base-hash",
      });

      const branchAUnit = createCodeUnit({
        signature: "function test(x: number): void",
        contentHash: "hash-a",
      });

      const branchBUnit = createCodeUnit({
        signature: "function test(y: string): void",
        contentHash: "hash-b",
      });

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit);

      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe(ConflictType.APIBreakingChange);
      expect(conflict?.severity).toBe(ConflictSeverity.Critical);
      expect(conflict?.autoResolvable).toBe(false);
    });

    it("should detect incompatible intents", () => {
      const baseUnit = createCodeUnit();
      const branchAUnit = createCodeUnit({ contentHash: "hash-a" });
      const branchBUnit = createCodeUnit({ contentHash: "hash-b" });

      const branchAIntent = createIntent(ChangeIntentType.APIChange);
      const branchBIntent = createIntent(ChangeIntentType.BugFix);

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit, branchAIntent, branchBIntent);

      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe(ConflictType.IncompatibleIntents);
    });

    it("should allow compatible intents (BugFix + Refactoring)", () => {
      const baseUnit = createCodeUnit();
      const branchAUnit = createCodeUnit({ contentHash: "hash-a" });
      const branchBUnit = createCodeUnit({ contentHash: "hash-b" });

      const branchAIntent = createIntent(ChangeIntentType.BugFix);
      const branchBIntent = createIntent(ChangeIntentType.Refactoring);

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit, branchAIntent, branchBIntent);

      // Should be overlapping conflict, not incompatible intents
      expect(conflict?.type).toBe(ConflictType.OverlappingChanges);
    });

    it("should classify severity based on extent of changes", () => {
      const baseUnit = createCodeUnit({
        content: "short",
        contentHash: "base-hash",
      });

      const branchAUnit = createCodeUnit({
        content: "very long content that is much different from base",
        contentHash: "hash-a",
      });

      const branchBUnit = createCodeUnit({
        content: "also very long content that is much different from base",
        contentHash: "hash-b",
      });

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit);

      expect(conflict).not.toBeNull();
      expect(conflict?.severity).toBe(ConflictSeverity.High);
    });

    it("should detect overlapping changes", () => {
      const baseUnit = createCodeUnit({ contentHash: "base" });
      const branchAUnit = createCodeUnit({ contentHash: "hash-a" });
      const branchBUnit = createCodeUnit({ contentHash: "hash-b" });

      const conflict = detector.detectConflict(baseUnit, branchAUnit, branchBUnit);

      expect(conflict).not.toBeNull();
      expect(conflict?.type).toBe(ConflictType.OverlappingChanges);
    });

    it("should handle batch detection", () => {
      const matches = [
        {
          baseUnit: createCodeUnit({ id: "1", contentHash: "base1" }),
          branchAUnit: createCodeUnit({ id: "1", contentHash: "a1" }),
          branchBUnit: createCodeUnit({ id: "1", contentHash: "b1" }),
        },
        {
          baseUnit: createCodeUnit({ id: "2", contentHash: "same" }),
          branchAUnit: createCodeUnit({ id: "2", contentHash: "same" }),
          branchBUnit: createCodeUnit({ id: "2", contentHash: "same" }),
        },
      ];

      const conflicts = detector.detectConflicts(matches);

      expect(conflicts).toHaveLength(1); // Only first has conflict
      expect(conflicts[0]?.type).toBe(ConflictType.OverlappingChanges);
    });
  });
});
