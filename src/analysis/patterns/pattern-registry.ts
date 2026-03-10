/**
 * Pattern Registry — Loads and indexes YAML pattern definitions
 *
 * Responsibilities:
 * - Load all rules/*.yaml files
 * - Validate via Zod
 * - Index by language for fast lookup
 * - Auto-include "common" patterns for any language
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { log } from "../../logging/index.js";
import type { PatternCategory, PatternDefinition } from "./types.js";

// ─── Zod Schema for YAML validation ───────────────────────────────

const RelationshipCriteriaSchema = z.object({
  type: z.string(),
  direction: z.enum(["incoming", "outgoing"]),
  minCount: z.number().optional(),
  maxCount: z.number().optional(),
  crossFileRatio: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
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
  // C#-specific antipattern hints (from Roslyn parser)
  minSyncOverAsync: z.number().optional(),
  minNullForgiving: z.number().optional(),
  hasLockOnThis: z.boolean().optional(),
  hasNewHttpClient: z.boolean().optional(),
  hasNewDisposableNoUsing: z.boolean().optional(),
  hasParallelForEachAsync: z.boolean().optional(),
  minThrowEx: z.number().optional(),
  minEmptyCatch: z.number().optional(),
  hasStringConcatInLoop: z.boolean().optional(),
  // Python-specific antipattern hints (from python-ast-cli.py)
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
  // Python controlFlow extended fields
  minReturnCount: z.number().optional(),
  minNestingDepth: z.number().optional(),
  minCyclomaticPy: z.number().optional(),
  minIsinstanceCount: z.number().optional(),
  hasPyReRaiseDifferent: z.boolean().optional(),
  // Python class metadata
  hasPySlots: z.boolean().optional(),
  missingPySlots: z.boolean().optional(),
  missingPyRepr: z.boolean().optional(),
  missingPyStr: z.boolean().optional(),
  minPyInitCalls: z.number().optional(),
  minPyMethodCount: z.number().optional(),
  hasPyPropertyNoSetter: z.boolean().optional(),
  relationships: z.array(RelationshipCriteriaSchema).optional(),
});

const PatternDefinitionSchema = z.object({
  id: z.string(),
  language: z.string().optional(), // Inferred from filename if absent
  category: z.enum(["anti-pattern", "best-pattern", "code-smell", "optimization"]),
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  name: z.string(),
  description: z.string(),
  suggestion: z.string(),
  bigO: z
    .object({
      before: z.string(),
      after: z.string(),
    })
    .optional(),
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

// ─── Registry ──────────────────────────────────────────────────────

export class PatternRegistry {
  private patterns: Map<string, PatternDefinition[]> = new Map();
  private allPatterns: Map<string, PatternDefinition> = new Map();
  private loaded = false;

  constructor(private rulesDir?: string) {}

  /**
   * Load all YAML rule files. Call once before using.
   */
  async load(rulesDir?: string): Promise<void> {
    if (this.loaded) return;

    const dir = rulesDir ?? this.rulesDir ?? join(import.meta.dirname, "rules");
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
      log.w("PATTERN_REGISTRY", "rules_dir_not_found", { dir });
      this.loaded = true;
      return;
    }

    for (const file of files) {
      const language = file.replace(/\.ya?ml$/, ""); // "typescript" from "typescript.yaml"
      try {
        const content = readFileSync(join(dir, file), "utf-8");
        const raw = YAML.parse(content);
        const parsed = PatternFileSchema.parse(raw);

        const definitions = parsed.patterns.map(
          (p) =>
            ({
              ...p,
              language: p.language ?? language,
            }) as PatternDefinition,
        );

        const existing = this.patterns.get(language) ?? [];
        this.patterns.set(language, [...existing, ...definitions]);

        for (const def of definitions) {
          if (this.allPatterns.has(def.id)) {
            log.w("PATTERN_REGISTRY", "duplicate_pattern_id", { id: def.id });
          }
          this.allPatterns.set(def.id, def);
        }

        log.i("PATTERN_REGISTRY", "loaded_rules", { file, count: definitions.length });
      } catch (err) {
        log.e("PATTERN_REGISTRY", "load_error", { file, error: String(err) });
      }
    }

    this.loaded = true;
    log.i("PATTERN_REGISTRY", "registry_ready", {
      languages: this.patterns.size,
      totalPatterns: this.allPatterns.size,
    });
  }

  /**
   * Get patterns filtered by criteria. Always includes "common" patterns.
   */
  getPatterns(options: {
    language?: string;
    category?: PatternCategory | "all";
    tags?: string[];
    enabledOnly?: boolean;
  }): PatternDefinition[] {
    const { language, category = "all", tags, enabledOnly = true } = options;

    // Collect language-specific + common patterns
    let result: PatternDefinition[] = [];
    if (language) {
      result = [...(this.patterns.get(language) ?? []), ...(this.patterns.get("common") ?? [])];
    } else {
      result = [...this.allPatterns.values()];
    }

    // Filter
    if (enabledOnly) {
      result = result.filter((p) => p.enabled);
    }
    if (category !== "all") {
      result = result.filter((p) => p.category === category);
    }
    if (tags && tags.length > 0) {
      result = result.filter((p) => tags.some((t) => p.tags.includes(t)));
    }

    return result;
  }

  /**
   * Get a single pattern by ID
   */
  getPattern(id: string): PatternDefinition | undefined {
    return this.allPatterns.get(id);
  }

  /**
   * Get all unique language keys
   */
  getLanguages(): string[] {
    return [...this.patterns.keys()];
  }

  /**
   * Total loaded pattern count
   */
  get size(): number {
    return this.allPatterns.size;
  }
}
