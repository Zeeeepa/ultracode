/**
 * Python Pattern Rules — YAML Validation & Integration Tests
 *
 * Ensures all YAML rules parse correctly via Zod and that
 * custom detectors referenced in YAML are actually registered.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import * as pythonDetectors from "../../src/analysis/patterns/detectors/python.js";

// ─── Zod Schema (must match pattern-registry.ts) ──────────────────

const RelationshipCriteriaSchema = z.object({
  type: z.string(),
  direction: z.enum(["incoming", "outgoing"]),
  minCount: z.number().optional(),
  maxCount: z.number().optional(),
  crossFileRatio: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
});

const StructuralCriteriaSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  requiredModifiers: z.array(z.string()).optional(),
  forbiddenModifiers: z.array(z.string()).optional(),
  returnTypeMatch: z.string().optional(),
  returnTypeNotMatch: z.string().optional(),
  minParams: z.number().optional(),
  maxParams: z.number().optional(),
  paramTypeRequired: z.string().optional(),
  paramTypeAbsent: z.string().optional(),
  minCyclomatic: z.number().optional(),
  maxCyclomatic: z.number().optional(),
  minCognitive: z.number().optional(),
  minNesting: z.number().optional(),
  minLOC: z.number().optional(),
  maxLOC: z.number().optional(),
  hasLoops: z.boolean().optional(),
  hasExceptions: z.boolean().optional(),
  hasAwaits: z.boolean().optional(),
  minBranches: z.number().optional(),
  minCallCount: z.number().optional(),
  callsInclude: z.array(z.string()).optional(),
  callsExclude: z.array(z.string()).optional(),
  decoratorMatch: z.array(z.string()).optional(),
  hasNoInheritance: z.boolean().optional(),
  filePathMatch: z.string().optional(),
  filePathNotMatch: z.string().optional(),
  nameMatch: z.string().optional(),
  nameNotMatch: z.string().optional(),
  hasDeleteExpression: z.boolean().optional(),
  hasArgumentsReference: z.boolean().optional(),
  hasWithStatement: z.boolean().optional(),
  minSpreadInCalls: z.number().optional(),
  minDynamicPropertyAccess: z.number().optional(),
  minTypeAssertions: z.number().optional(),
  minNonNullAssertions: z.number().optional(),
  hasInnerHtmlAssign: z.boolean().optional(),
  hasParamMutation: z.boolean().optional(),
  hasOrWithDefault: z.boolean().optional(),
  hasThrowNonError: z.boolean().optional(),
  hasRegexLiterals: z.boolean().optional(),
  minForceUnwraps: z.number().optional(),
  minUnsafeCasts: z.number().optional(),
  minUnreachable: z.number().optional(),
  minSyncOverAsync: z.number().optional(),
  minNullForgiving: z.number().optional(),
  hasLockOnThis: z.boolean().optional(),
  hasNewHttpClient: z.boolean().optional(),
  hasNewDisposableNoUsing: z.boolean().optional(),
  hasParallelForEachAsync: z.boolean().optional(),
  minThrowEx: z.number().optional(),
  minEmptyCatch: z.number().optional(),
  hasStringConcatInLoop: z.boolean().optional(),
  // Python-specific
  minBareExcept: z.number().optional(),
  minExceptPass: z.number().optional(),
  minGenericRaise: z.number().optional(),
  minWideTryBlock: z.number().optional(),
  minTypeIgnore: z.number().optional(),
  minAnyType: z.number().optional(),
  minEvalExec: z.number().optional(),
  hasPyStringConcatInLoop: z.boolean().optional(),
  hasPyOpenWithoutWith: z.boolean().optional(),
  hasPyAsyncNoAwait: z.boolean().optional(),
  relationships: z.array(RelationshipCriteriaSchema).optional(),
});

const PatternDefinitionSchema = z.object({
  id: z.string(),
  language: z.string().optional(),
  category: z.enum(["anti-pattern", "best-pattern", "code-smell", "optimization"]),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  name: z.string(),
  description: z.string(),
  suggestion: z.string(),
  bigO: z.object({ before: z.string(), after: z.string() }).optional(),
  benchmark: z.string().optional(),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  structural: StructuralCriteriaSchema.optional(),
  customDetector: z.string().optional(),
  exemplarIds: z.array(z.string()).optional(),
  minSemanticSimilarity: z.number().default(0),
  minStructuralConfidence: z.number().default(0.6),
});

const PatternFileSchema = z.object({
  patterns: z.array(PatternDefinitionSchema),
});

// ─── Tests ────────────────────────────────────────────────────────

const rulesDir = join(import.meta.dirname, "../../src/analysis/patterns/rules");

describe("Python YAML rules validation", () => {
  test("python.yaml parses successfully via Zod", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const raw = YAML.parse(content);
    const result = PatternFileSchema.safeParse(raw);
    if (!result.success) {
      console.error("Zod errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  test("python.yaml has at least 50 rules", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const raw = YAML.parse(content);
    const parsed = PatternFileSchema.parse(raw);
    expect(parsed.patterns.length).toBeGreaterThanOrEqual(50);
  });

  test("all rule IDs start with 'py:'", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));
    for (const pattern of parsed.patterns) {
      expect(pattern.id).toMatch(/^py:/);
    }
  });

  test("no duplicate rule IDs", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));
    const ids = parsed.patterns.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test("all customDetector names exist as exported functions", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));
    const detectorNames = Object.keys(pythonDetectors);

    for (const pattern of parsed.patterns) {
      if (pattern.customDetector) {
        expect(detectorNames).toContain(pattern.customDetector);
      }
    }
  });

  test("rules with callsInclude have valid regex patterns", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));

    for (const pattern of parsed.patterns) {
      if (pattern.structural?.callsInclude) {
        for (const re of pattern.structural.callsInclude) {
          expect(() => new RegExp(re)).not.toThrow();
        }
      }
      if (pattern.structural?.callsExclude) {
        for (const re of pattern.structural.callsExclude) {
          expect(() => new RegExp(re)).not.toThrow();
        }
      }
    }
  });

  test("pythonHints-based rules have correct structural fields", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));

    const hintsRules = parsed.patterns.filter(
      (p) =>
        p.structural &&
        (p.structural.minBareExcept != null ||
          p.structural.minExceptPass != null ||
          p.structural.minGenericRaise != null ||
          p.structural.minWideTryBlock != null ||
          p.structural.minTypeIgnore != null ||
          p.structural.minAnyType != null ||
          p.structural.minEvalExec != null ||
          p.structural.hasPyStringConcatInLoop != null ||
          p.structural.hasPyOpenWithoutWith != null ||
          p.structural.hasPyAsyncNoAwait != null),
    );

    // Should have at least 8 pythonHints-based rules
    expect(hintsRules.length).toBeGreaterThanOrEqual(8);
  });

  test("all severity values are valid", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));
    const validSeverities = ["critical", "high", "medium", "low", "info"];
    for (const pattern of parsed.patterns) {
      expect(validSeverities).toContain(pattern.severity);
    }
  });

  test("all categories are valid", () => {
    const content = readFileSync(join(rulesDir, "python.yaml"), "utf-8");
    const parsed = PatternFileSchema.parse(YAML.parse(content));
    const validCategories = ["anti-pattern", "best-pattern", "code-smell", "optimization"];
    for (const pattern of parsed.patterns) {
      expect(validCategories).toContain(pattern.category);
    }
  });
});

describe("All YAML rule files parse correctly", () => {
  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const file of files) {
    test(`${file} parses via Zod without errors`, () => {
      const content = readFileSync(join(rulesDir, file), "utf-8");
      const raw = YAML.parse(content);
      const result = PatternFileSchema.safeParse(raw);
      if (!result.success) {
        console.error(`Zod errors in ${file}:`, JSON.stringify(result.error.issues, null, 2));
      }
      expect(result.success).toBe(true);
    });
  }
});
