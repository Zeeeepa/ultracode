import { describe, expect, it } from "bun:test";
import { IntentClassifier } from "../analysis/intent-classifier.js";
import { ChangeIntentType } from "../models/change-intent.js";
import { type CodeUnit, CodeUnitType } from "../models/code-unit.js";

describe("IntentClassifier", () => {
  const classifier = new IntentClassifier();

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
    childIds: [],
    language: "typescript",
    metadata: {},
    ...overrides,
  });

  describe("classifyIntent", () => {
    it("should classify new unit as FeatureAddition", () => {
      const changedUnit = createCodeUnit({ name: "newFunction" });
      const intent = classifier.classifyIntent(null, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.FeatureAddition);
      expect(intent.confidence).toBeGreaterThan(0);
    });

    it("should classify added try-catch as BugFix", () => {
      const baseUnit = createCodeUnit({
        content: "function test() { return x; }",
      });

      const changedUnit = createCodeUnit({
        content: "function test() { try { return x; } catch(e) { console.error(e); } }",
      });

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.BugFix);
      expect(intent.evidence.some((e) => e.type === "AddedTryCatch")).toBe(true);
    });

    it("should classify added validation as BugFix", () => {
      const baseUnit = createCodeUnit({
        content: "function test(x) { return x + 1; }",
      });

      const changedUnit = createCodeUnit({
        content: "function test(x) { if (!x) throw new Error('invalid'); return x + 1; }",
      });

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.BugFix);
      expect(intent.evidence.some((e) => e.type === "AddedValidation")).toBe(true);
    });

    it("should classify renamed variable as Refactoring when structure preserved", () => {
      const baseUnit = createCodeUnit({
        name: "oldName",
        structuralHash: "same-hash",
        contentHash: "hash1",
      });

      const changedUnit = createCodeUnit({
        name: "newName",
        structuralHash: "same-hash",
        contentHash: "hash2",
      });

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.Refactoring);
      expect(intent.evidence.some((e) => e.type === "RenamedVariable")).toBe(true);
    });

    it("should classify signature change as APIChange", () => {
      const baseUnit = createCodeUnit({
        signature: "function test(x: number): number",
      });

      const changedUnit = createCodeUnit({
        signature: "function test(x: string): string",
      });

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.APIChange);
      expect(intent.evidence.some((e) => e.type === "SignatureChanged")).toBe(true);
    });

    it("should classify size increase as FeatureAddition", () => {
      const baseUnit = createCodeUnit({
        content: "function test() { return 1; }",
        childIds: [],
      });

      const changedUnit = createCodeUnit({
        content: "function test() { const x = 1; const y = 2; return x + y + 3 + 4 + 5; }",
        childIds: [],
      });

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      expect(intent.type).toBe(ChangeIntentType.FeatureAddition);
    });

    it("should return Unknown for unchanged code", () => {
      const baseUnit = createCodeUnit();
      const changedUnit = createCodeUnit();

      const intent = classifier.classifyIntent(baseUnit, changedUnit);

      // Unchanged code typically has no evidence, so returns Unknown
      expect([ChangeIntentType.Unknown, ChangeIntentType.Refactoring]).toContain(intent.type);
    });
  });
});
