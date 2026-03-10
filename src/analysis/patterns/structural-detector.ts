/**
 * Structural Detector — Fast metadata-based pattern detection
 *
 * Optimizations:
 * - Pre-compiled regex patterns (avoid new RegExp() in hot loop)
 * - Entity type pre-index (skip entities that can't match a pattern)
 * - Pre-extracted entity metadata (parse once per entity, not per pattern)
 * - Inline evaluation (no closure allocation per check)
 */

import { log } from "../../logging/index.js";
import type { Entity, GraphStorage, Relationship } from "../../types/storage.js";
import type {
  CustomDetectorFn,
  PatternDefinition,
  RelationshipCriteria,
  StructuralCandidate,
  StructuralCriteria,
} from "./types.js";

// ─── Custom Detector Registry ──────────────────────────────────────

const detectorRegistry: Map<string, CustomDetectorFn> = new Map();

export function registerDetector(name: string, fn: CustomDetectorFn): void {
  detectorRegistry.set(name, fn);
}

export function registerDetectors(detectors: Record<string, CustomDetectorFn>): void {
  for (const [name, fn] of Object.entries(detectors)) {
    detectorRegistry.set(name, fn);
  }
}

// ─── Compiled Pattern Cache ─────────────────────────────────────────

interface CompiledCriteria {
  entityTypeSet: Set<string> | null;
  returnTypeMatchRe: RegExp | null;
  returnTypeNotMatchRe: RegExp | null;
  paramTypeRequiredRe: RegExp | null;
  paramTypeAbsentRe: RegExp | null;
  callsIncludeRe: RegExp[] | null;
  callsExcludeRe: RegExp[] | null;
  decoratorMatchRe: RegExp[] | null;
  nameMatchRe: RegExp | null;
  nameNotMatchRe: RegExp | null;
  filePathMatchRe: RegExp | null;
  filePathNotMatchRe: RegExp | null;
  totalCriteriaCount: number;
}

const compiledCache = new WeakMap<PatternDefinition, CompiledCriteria>();

function getCompiled(pattern: PatternDefinition): CompiledCriteria {
  let compiled = compiledCache.get(pattern);
  if (compiled) return compiled;

  const c = pattern.structural;
  compiled = {
    entityTypeSet: c?.entityTypes ? new Set(c.entityTypes) : null,
    returnTypeMatchRe: c?.returnTypeMatch ? new RegExp(c.returnTypeMatch, "i") : null,
    returnTypeNotMatchRe: c?.returnTypeNotMatch ? new RegExp(c.returnTypeNotMatch, "i") : null,
    paramTypeRequiredRe: c?.paramTypeRequired ? new RegExp(c.paramTypeRequired, "i") : null,
    paramTypeAbsentRe: c?.paramTypeAbsent ? new RegExp(c.paramTypeAbsent, "i") : null,
    callsIncludeRe: c?.callsInclude ? c.callsInclude.map((p) => new RegExp(p, "i")) : null,
    callsExcludeRe: c?.callsExclude ? c.callsExclude.map((p) => new RegExp(p, "i")) : null,
    decoratorMatchRe: c?.decoratorMatch ? c.decoratorMatch.map((p) => new RegExp(p, "i")) : null,
    nameMatchRe: c?.nameMatch ? new RegExp(c.nameMatch, "i") : null,
    nameNotMatchRe: c?.nameNotMatch ? new RegExp(c.nameNotMatch, "i") : null,
    filePathMatchRe: c?.filePathMatch ? new RegExp(c.filePathMatch, "i") : null,
    filePathNotMatchRe: c?.filePathNotMatch ? new RegExp(c.filePathNotMatch, "i") : null,
    totalCriteriaCount: countTotalCriteria(c ?? {}),
  };
  compiledCache.set(pattern, compiled);
  return compiled;
}

// ─── Pre-extracted Entity Metadata ──────────────────────────────────

interface EntityMeta {
  modifiers: string[];
  returnType: string | undefined;
  params: Array<{ name: string; type?: string }>;
  metrics: { cyclomaticComplexity: number; cognitiveComplexity: number; linesOfCode: number; nestingDepth: number };
  cf: { branches: number; loops: number; exceptions: number; awaits: number };
  callNames: string[];
  decoratorNames: string[];
  hasInheritance: boolean;
  jitHints: {
    deleteCount: number;
    argumentsRefCount: number;
    hasWithStatement: boolean;
    spreadInCallCount: number;
    dynamicPropAccessCount: number;
  } | null;
  antipatternHints: {
    typeAssertionCount: number;
    doubleAssertionCount: number;
    nonNullAssertionCount: number;
    throwNonErrorCount: number;
    innerHtmlAssignCount: number;
    orWithDefaultCount: number;
    paramMutationCount: number;
    regexLiterals: string[];
  } | null;
  zigOps: {
    forceUnwrapCount: number;
    unsafeCastCount: number;
    unreachableCount: number;
  } | null;
  csharpHints: {
    syncOverAsyncCount: number;
    nullForgivingCount: number;
    lockOnThisCount: number;
    stringConcatInLoopCount: number;
    newHttpClientCount: number;
    newDisposableNoUsingCount: number;
    hasParallelForEachAsync: boolean;
    throwExCount: number;
    emptyCatchCount: number;
  } | null;
  pythonHints: {
    bareExceptCount: number;
    exceptPassCount: number;
    genericRaiseCount: number;
    wideTryBlockCount: number;
    typeIgnoreCount: number;
    anyTypeCount: number;
    evalExecCount: number;
    stringConcatInLoopCount: number;
    openWithoutWithCount: number;
    asyncNoAwaitCount: number;
  } | null;
}

const metaCache = new WeakMap<Entity, EntityMeta>();

function getMeta(entity: Entity): EntityMeta {
  let meta = metaCache.get(entity);
  if (meta) return meta;

  const md = entity.metadata;
  const metricsRaw = md?.["metrics"] as Record<string, number> | undefined;
  const cfRaw = md?.["controlFlow"] as Record<string, Array<unknown>> | undefined;
  const callsRaw = (md?.["calls"] ?? []) as Array<{ target?: string; name?: string }>;
  const decsRaw = (md?.decorators ?? []) as Array<{ name: string }>;
  const inheritanceRaw = md?.["inheritance"] as { baseClasses?: string[]; interfaces?: string[] } | undefined;

  meta = {
    modifiers: (md?.modifiers ?? []) as string[],
    returnType: md?.returnType as string | undefined,
    params: (md?.parameters ?? []) as Array<{ name: string; type?: string }>,
    metrics: {
      cyclomaticComplexity: metricsRaw?.["cyclomaticComplexity"] ?? 0,
      cognitiveComplexity: metricsRaw?.["cognitiveComplexity"] ?? 0,
      linesOfCode: metricsRaw?.["linesOfCode"] ?? 0,
      nestingDepth: metricsRaw?.["nestingDepth"] ?? 0,
    },
    cf: {
      branches: cfRaw?.["branches"]?.length ?? 0,
      loops: cfRaw?.["loops"]?.length ?? 0,
      exceptions: cfRaw?.["exceptions"]?.length ?? 0,
      awaits: cfRaw?.["awaits"]?.length ?? 0,
    },
    callNames: callsRaw.map((c) => `${c.target ?? ""}.${c.name ?? ""}`),
    decoratorNames: decsRaw.map((d) => d.name),
    hasInheritance: (inheritanceRaw?.baseClasses?.length ?? 0) > 0 || (inheritanceRaw?.interfaces?.length ?? 0) > 0,
    jitHints: (md?.["jitHints"] as EntityMeta["jitHints"]) ?? null,
    antipatternHints: (md?.["antipatternHints"] as EntityMeta["antipatternHints"]) ?? null,
    zigOps: (md?.["zigOps"] as EntityMeta["zigOps"]) ?? null,
    csharpHints:
      (md?.["_csharpHints"] as EntityMeta["csharpHints"]) ?? (md?.["csharpHints"] as EntityMeta["csharpHints"]) ?? null,
    pythonHints: (md?.["pythonHints"] as EntityMeta["pythonHints"]) ?? null,
  };
  metaCache.set(entity, meta);
  return meta;
}

// ─── Structural Detector ───────────────────────────────────────────

type EvalResult = { confidence: number; matchedCriteria: string[] };
const EVAL_ZERO: EvalResult = { confidence: 0, matchedCriteria: [] };

export class StructuralDetector {
  // Cache: entityId:patternId -> evaluation result (3B)
  private evalCache = new Map<string, EvalResult>();
  // Current scan batch — available to cross-entity custom detectors
  private currentEntities: Entity[] = [];

  /** Clear evaluation cache (call when entities or patterns change) */
  clearEvalCache(): void {
    this.evalCache.clear();
  }

  async detect(
    entities: Entity[],
    patterns: PatternDefinition[],
    storage?: GraphStorage,
    allEntities?: Entity[],
  ): Promise<StructuralCandidate[]> {
    // Clear caches from previous scan to prevent unbounded memory growth
    this.evalCache.clear();

    const detectStartMs = Date.now();
    log.i("STRUCTURAL_DETECT", "start", { entities: entities.length, patterns: patterns.length });

    const candidates: StructuralCandidate[] = [];
    // Cross-entity detectors see allEntities (full set) even when processing batches
    this.currentEntities = allEntities ?? entities;

    // Pre-index entities by type for O(1) lookup
    const entitiesByType = new Map<string, Entity[]>();
    for (const entity of entities) {
      const arr = entitiesByType.get(entity.type);
      if (arr) arr.push(entity);
      else entitiesByType.set(entity.type, [entity]);
    }

    // Phase 1: Fast metadata-only pass (type-indexed)
    // Entity count capped by PatternEngine (default 5000) to avoid JSC GC segfault on Bun.
    const metadataCandidates: Array<{
      entity: Entity;
      pattern: PatternDefinition;
      confidence: number;
      matched: string[];
    }> = [];

    for (let _ri = 0; _ri < patterns.length; _ri++) {
      const pattern = patterns[_ri]!;
      let compiled: CompiledCriteria;
      try {
        compiled = getCompiled(pattern);
      } catch (err) {
        log.e("STRUCTURAL_DETECTOR", "compile_pattern_error", { pattern: pattern.id, error: String(err) });
        continue;
      }

      // Determine which entities to check based on entityTypes
      let entitiesToCheck: Entity[];
      if (compiled.entityTypeSet) {
        entitiesToCheck = [];
        for (const type of compiled.entityTypeSet) {
          const arr = entitiesByType.get(type);
          if (arr) entitiesToCheck.push(...arr);
        }
      } else {
        entitiesToCheck = entities;
      }
      const MAX_PER_RULE = 200;
      let _ruleHits = 0;
      for (const entity of entitiesToCheck) {
        try {
          const result = this.evaluateMetadataCriteria(entity, pattern, compiled);
          if (result.confidence > 0) {
            metadataCandidates.push({
              entity,
              pattern,
              confidence: result.confidence,
              matched: result.matchedCriteria,
            });
            _ruleHits++;
            if (_ruleHits >= MAX_PER_RULE) {
              break;
            }
          }
        } catch (err) {
          log.w("STRUCTURAL_DETECTOR", "evaluate_entity_error", {
            entity: entity.id,
            pattern: pattern.id,
            error: String(err),
          });
        }
      }
    }

    // Phase 2: Split by graph needs
    const needsGraph = metadataCandidates.filter(
      (c) => c.pattern.structural?.relationships && c.pattern.structural.relationships.length > 0,
    );
    const noGraph = metadataCandidates.filter(
      (c) => !c.pattern.structural?.relationships || c.pattern.structural.relationships.length === 0,
    );

    for (const c of noGraph) {
      if (c.confidence >= c.pattern.minStructuralConfidence) {
        candidates.push({
          entity: c.entity,
          pattern: c.pattern,
          confidence: c.confidence,
          matchedCriteria: c.matched,
        });
      }
    }

    // Graph batch — single SQL query for all relationship needs
    if (needsGraph.length > 0 && storage) {
      const entityIds = [...new Set(needsGraph.map((c) => c.entity.id))];

      // Batch fetch all relationships in one query via findRelationships({ fromId: [...] })
      // Also need toId for incoming relationships — collect both directions
      let allRels: Relationship[] = [];
      try {
        const [outgoing, incoming] = await Promise.all([
          storage.findRelationships({ filters: { fromId: entityIds }, limit: 10000 }),
          storage.findRelationships({ filters: { toId: entityIds }, limit: 10000 }),
        ]);
        allRels = [...outgoing, ...incoming];
      } catch (err) {
        log.w("STRUCTURAL_DETECTOR", "graph_batch_error", { error: String(err) });
        // Fallback: no relationships available
      }

      // Index by entity ID (both directions)
      const relsByEntity = new Map<string, Relationship[]>();
      for (const rel of allRels) {
        const fromArr = relsByEntity.get(rel.fromId);
        if (fromArr) fromArr.push(rel);
        else relsByEntity.set(rel.fromId, [rel]);

        if (rel.fromId !== rel.toId) {
          const toArr = relsByEntity.get(rel.toId);
          if (toArr) toArr.push(rel);
          else relsByEntity.set(rel.toId, [rel]);
        }
      }

      for (const c of needsGraph) {
        const rels = relsByEntity.get(c.entity.id) ?? [];
        const graphResult = this.evaluateRelationshipCriteria(c.entity, rels, c.pattern.structural!.relationships!);

        if (graphResult.passed) {
          const totalMatched = c.matched.length + graphResult.matchedCriteria.length;
          const compiled = getCompiled(c.pattern);
          const adjustedConfidence = totalMatched / Math.max(compiled.totalCriteriaCount, 1);

          if (adjustedConfidence >= c.pattern.minStructuralConfidence) {
            candidates.push({
              entity: c.entity,
              pattern: c.pattern,
              confidence: Math.min(adjustedConfidence, 1),
              matchedCriteria: [...c.matched, ...graphResult.matchedCriteria],
            });
          }
        }
      }
    } else if (needsGraph.length > 0) {
      for (const c of needsGraph) {
        if (c.confidence >= c.pattern.minStructuralConfidence) {
          candidates.push({
            entity: c.entity,
            pattern: c.pattern,
            confidence: c.confidence,
            matchedCriteria: c.matched,
          });
        }
      }
    }

    log.i("STRUCTURAL_DETECTOR", "detection_complete", {
      entities: entities.length,
      patterns: patterns.length,
      candidates: candidates.length,
      elapsed: Date.now() - detectStartMs,
    });

    // Release references to allow GC of entity objects between chunked detect() calls.
    // Without this, detector instance retains the entire chunk array, preventing GC
    // and causing JSC SEGFAULT on large codebases (>10K entities).
    this.currentEntities = [];
    this.evalCache.clear();

    return candidates;
  }

  // ─── Metadata Evaluation (hot path — optimized) ─────────────────

  private evaluateMetadataCriteria(entity: Entity, pattern: PatternDefinition, compiled: CompiledCriteria): EvalResult {
    // Cache disabled — structural eval is fast enough without it, and cache caused memory pressure on large codebases
    return this.evaluateMetadataUncached(entity, pattern, compiled);
  }

  // 3A: Mandatory checks separated for fast bail-out
  private evaluateRequired(
    entity: Entity,
    compiled: CompiledCriteria,
    criteria: StructuralCriteria,
    em: EntityMeta,
  ): string[] | null {
    const matched: string[] = [];

    if (compiled.entityTypeSet) {
      matched.push(`entityType:${entity.type}`);
    }

    if (criteria.requiredModifiers) {
      for (const req of criteria.requiredModifiers) {
        if (!em.modifiers.includes(req)) return null; // bail-out
      }
      matched.push(`modifiers:${criteria.requiredModifiers.join(",")}`);
    }

    if (criteria.forbiddenModifiers) {
      for (const f of criteria.forbiddenModifiers) {
        if (em.modifiers.includes(f)) return null; // bail-out
      }
      matched.push("no-forbidden-modifiers");
    }

    if (criteria.hasNoInheritance) {
      if (em.hasInheritance) return null; // bail-out: has base types
      matched.push("no-inheritance");
    }

    if (compiled.filePathMatchRe) {
      if (!entity.filePath || !compiled.filePathMatchRe.test(entity.filePath)) return null; // bail-out: filePath must match
      matched.push(`filePath:~/${criteria.filePathMatch}/`);
    }

    if (compiled.filePathNotMatchRe) {
      if (entity.filePath && compiled.filePathNotMatchRe.test(entity.filePath)) return null; // bail-out
    }

    // nameNotMatch is mandatory: if entity name matches exclusion, bail out (blocks custom detectors too)
    if (compiled.nameNotMatchRe) {
      if (compiled.nameNotMatchRe.test(entity.name)) return null; // bail-out
    }

    // callsInclude is mandatory: entity MUST have at least one call matching each pattern
    if (compiled.callsIncludeRe) {
      for (let i = 0; i < compiled.callsIncludeRe.length; i++) {
        if (!em.callNames.some((c) => compiled.callsIncludeRe![i]!.test(c))) return null; // bail-out
      }
      matched.push(`calls:include`);
    }

    // callsExclude is mandatory: entity must NOT have any call matching exclusion patterns
    if (compiled.callsExcludeRe) {
      for (let i = 0; i < compiled.callsExcludeRe.length; i++) {
        if (em.callNames.some((c) => compiled.callsExcludeRe![i]!.test(c))) return null; // bail-out
      }
      matched.push(`calls:exclude`);
    }

    return matched;
  }

  // 3A: Optional checks separated from mandatory
  private evaluateOptional(
    entity: Entity,
    compiled: CompiledCriteria,
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { optionalTotal: number; optionalPassed: number } {
    let optionalTotal = 0;
    let optionalPassed = 0;

    // Return type
    if (compiled.returnTypeMatchRe) {
      optionalTotal++;
      if (typeof em.returnType === "string" && compiled.returnTypeMatchRe.test(em.returnType)) {
        optionalPassed++;
        matched.push(`returnType:~/${criteria.returnTypeMatch}/`);
      }
    }
    if (compiled.returnTypeNotMatchRe) {
      optionalTotal++;
      if (typeof em.returnType === "string" && !compiled.returnTypeNotMatchRe.test(em.returnType)) {
        optionalPassed++;
        matched.push(`returnType:!~/${criteria.returnTypeNotMatch}/`);
      }
    }

    // Parameters
    if (criteria.minParams != null) {
      optionalTotal++;
      if (em.params.length >= criteria.minParams) {
        optionalPassed++;
        matched.push(`params>=${criteria.minParams}`);
      }
    }
    if (criteria.maxParams != null) {
      optionalTotal++;
      if (em.params.length <= criteria.maxParams) {
        optionalPassed++;
        matched.push(`params<=${criteria.maxParams}`);
      }
    }
    if (compiled.paramTypeRequiredRe) {
      optionalTotal++;
      if (em.params.some((p) => p.type && compiled.paramTypeRequiredRe!.test(p.type))) {
        optionalPassed++;
        matched.push(`paramType:${criteria.paramTypeRequired}`);
      }
    }
    if (compiled.paramTypeAbsentRe) {
      optionalTotal++;
      if (!em.params.some((p) => p.type && compiled.paramTypeAbsentRe!.test(p.type))) {
        optionalPassed++;
        matched.push(`paramType:!${criteria.paramTypeAbsent}`);
      }
    }

    // Metrics
    if (criteria.minCyclomatic != null) {
      optionalTotal++;
      if (em.metrics.cyclomaticComplexity >= criteria.minCyclomatic) {
        optionalPassed++;
        matched.push(`cyclomatic>=${criteria.minCyclomatic}`);
      }
    }
    if (criteria.maxCyclomatic != null) {
      optionalTotal++;
      if (em.metrics.cyclomaticComplexity <= criteria.maxCyclomatic) {
        optionalPassed++;
        matched.push(`cyclomatic<=${criteria.maxCyclomatic}`);
      }
    }
    if (criteria.minCognitive != null) {
      optionalTotal++;
      if (em.metrics.cognitiveComplexity >= criteria.minCognitive) {
        optionalPassed++;
        matched.push(`cognitive>=${criteria.minCognitive}`);
      }
    }
    if (criteria.minNesting != null) {
      optionalTotal++;
      if (em.metrics.nestingDepth >= criteria.minNesting) {
        optionalPassed++;
        matched.push(`nesting>=${criteria.minNesting}`);
      }
    }
    if (criteria.minLOC != null) {
      optionalTotal++;
      if (em.metrics.linesOfCode >= criteria.minLOC) {
        optionalPassed++;
        matched.push(`LOC>=${criteria.minLOC}`);
      }
    }
    if (criteria.maxLOC != null) {
      optionalTotal++;
      if (em.metrics.linesOfCode <= criteria.maxLOC) {
        optionalPassed++;
        matched.push(`LOC<=${criteria.maxLOC}`);
      }
    }

    // ControlFlow
    if (criteria.hasLoops != null) {
      optionalTotal++;
      if (em.cf.loops > 0 === criteria.hasLoops) {
        optionalPassed++;
        matched.push(criteria.hasLoops ? "hasLoops" : "noLoops");
      }
    }
    if (criteria.hasExceptions != null) {
      optionalTotal++;
      if (em.cf.exceptions > 0 === criteria.hasExceptions) {
        optionalPassed++;
        matched.push(criteria.hasExceptions ? "hasExceptions" : "noExceptions");
      }
    }
    if (criteria.hasAwaits != null) {
      optionalTotal++;
      if (em.cf.awaits > 0 === criteria.hasAwaits) {
        optionalPassed++;
        matched.push(criteria.hasAwaits ? "hasAwaits" : "noAwaits");
      }
    }
    if (criteria.minBranches != null) {
      optionalTotal++;
      if (em.cf.branches >= criteria.minBranches) {
        optionalPassed++;
        matched.push(`branches>=${criteria.minBranches}`);
      }
    }

    // Calls — minCallCount remains optional; callsInclude/callsExclude are mandatory (in evaluateRequired)
    if (criteria.minCallCount != null) {
      optionalTotal++;
      if (em.callNames.length >= criteria.minCallCount) {
        optionalPassed++;
        matched.push(`calls>=${criteria.minCallCount}`);
      }
    }

    // Decorators
    if (compiled.decoratorMatchRe) {
      for (let i = 0; i < compiled.decoratorMatchRe.length; i++) {
        optionalTotal++;
        if (em.decoratorNames.some((d) => compiled.decoratorMatchRe![i]!.test(d))) {
          optionalPassed++;
          matched.push(`decorator:~/${criteria.decoratorMatch![i]}/`);
        }
      }
    }

    // JIT Hints
    if (criteria.hasDeleteExpression != null) {
      optionalTotal++;
      if (em.jitHints && em.jitHints.deleteCount > 0) {
        optionalPassed++;
        matched.push("hasDeleteExpression");
      }
    }
    if (criteria.hasArgumentsReference != null) {
      optionalTotal++;
      if (em.jitHints && em.jitHints.argumentsRefCount > 0) {
        optionalPassed++;
        matched.push("hasArgumentsReference");
      }
    }
    if (criteria.hasWithStatement != null) {
      optionalTotal++;
      if (em.jitHints && em.jitHints.hasWithStatement) {
        optionalPassed++;
        matched.push("hasWithStatement");
      }
    }
    if (criteria.minSpreadInCalls != null) {
      optionalTotal++;
      if (em.jitHints && em.jitHints.spreadInCallCount >= criteria.minSpreadInCalls) {
        optionalPassed++;
        matched.push(`spreadInCalls>=${criteria.minSpreadInCalls}`);
      }
    }
    if (criteria.minDynamicPropertyAccess != null) {
      optionalTotal++;
      if (em.jitHints && em.jitHints.dynamicPropAccessCount >= criteria.minDynamicPropertyAccess) {
        optionalPassed++;
        matched.push(`dynamicPropAccess>=${criteria.minDynamicPropertyAccess}`);
      }
    }

    // Antipattern Hints
    if (criteria.minTypeAssertions != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.typeAssertionCount >= criteria.minTypeAssertions) {
        optionalPassed++;
        matched.push(`typeAssertions>=${criteria.minTypeAssertions}`);
      }
    }
    if (criteria.minNonNullAssertions != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.nonNullAssertionCount >= criteria.minNonNullAssertions) {
        optionalPassed++;
        matched.push(`nonNullAssertions>=${criteria.minNonNullAssertions}`);
      }
    }
    if (criteria.hasInnerHtmlAssign != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.innerHtmlAssignCount > 0) {
        optionalPassed++;
        matched.push("hasInnerHtmlAssign");
      }
    }
    if (criteria.hasParamMutation != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.paramMutationCount > 0) {
        optionalPassed++;
        matched.push("hasParamMutation");
      }
    }
    if (criteria.hasOrWithDefault != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.orWithDefaultCount > 0) {
        optionalPassed++;
        matched.push("hasOrWithDefault");
      }
    }
    if (criteria.hasThrowNonError != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.throwNonErrorCount > 0) {
        optionalPassed++;
        matched.push("hasThrowNonError");
      }
    }
    if (criteria.hasRegexLiterals != null) {
      optionalTotal++;
      if (em.antipatternHints && em.antipatternHints.regexLiterals.length > 0) {
        optionalPassed++;
        matched.push("hasRegexLiterals");
      }
    }

    // Zig-specific criteria
    if (criteria.minForceUnwraps != null) {
      optionalTotal++;
      if (em.zigOps && em.zigOps.forceUnwrapCount >= criteria.minForceUnwraps) {
        optionalPassed++;
        matched.push(`forceUnwraps>=${criteria.minForceUnwraps}`);
      }
    }
    if (criteria.minUnsafeCasts != null) {
      optionalTotal++;
      if (em.zigOps && em.zigOps.unsafeCastCount >= criteria.minUnsafeCasts) {
        optionalPassed++;
        matched.push(`unsafeCasts>=${criteria.minUnsafeCasts}`);
      }
    }
    if (criteria.minUnreachable != null) {
      optionalTotal++;
      if (em.zigOps && em.zigOps.unreachableCount >= criteria.minUnreachable) {
        optionalPassed++;
        matched.push(`unreachable>=${criteria.minUnreachable}`);
      }
    }

    // C#-specific hints
    if (criteria.minSyncOverAsync != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.syncOverAsyncCount >= criteria.minSyncOverAsync) {
        optionalPassed++;
        matched.push(`syncOverAsync>=${criteria.minSyncOverAsync}`);
      }
    }
    if (criteria.minNullForgiving != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.nullForgivingCount >= criteria.minNullForgiving) {
        optionalPassed++;
        matched.push(`nullForgiving>=${criteria.minNullForgiving}`);
      }
    }
    if (criteria.hasLockOnThis != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.lockOnThisCount > 0) {
        optionalPassed++;
        matched.push("hasLockOnThis");
      }
    }
    if (criteria.hasNewHttpClient != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.newHttpClientCount > 0) {
        optionalPassed++;
        matched.push("hasNewHttpClient");
      }
    }
    if (criteria.hasNewDisposableNoUsing != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.newDisposableNoUsingCount > 0) {
        optionalPassed++;
        matched.push("hasNewDisposableNoUsing");
      }
    }
    if (criteria.hasParallelForEachAsync != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.hasParallelForEachAsync) {
        optionalPassed++;
        matched.push("hasParallelForEachAsync");
      }
    }
    if (criteria.minThrowEx != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.throwExCount >= criteria.minThrowEx) {
        optionalPassed++;
        matched.push(`throwEx>=${criteria.minThrowEx}`);
      }
    }
    if (criteria.minEmptyCatch != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.emptyCatchCount >= criteria.minEmptyCatch) {
        optionalPassed++;
        matched.push(`emptyCatch>=${criteria.minEmptyCatch}`);
      }
    }
    if (criteria.hasStringConcatInLoop != null) {
      optionalTotal++;
      if (em.csharpHints && em.csharpHints.stringConcatInLoopCount > 0) {
        optionalPassed++;
        matched.push("hasStringConcatInLoop");
      }
    }

    // Python-specific hints
    if (criteria.minBareExcept != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.bareExceptCount >= criteria.minBareExcept) {
        optionalPassed++;
        matched.push(`bareExcept>=${criteria.minBareExcept}`);
      }
    }
    if (criteria.minExceptPass != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.exceptPassCount >= criteria.minExceptPass) {
        optionalPassed++;
        matched.push(`exceptPass>=${criteria.minExceptPass}`);
      }
    }
    if (criteria.minGenericRaise != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.genericRaiseCount >= criteria.minGenericRaise) {
        optionalPassed++;
        matched.push(`genericRaise>=${criteria.minGenericRaise}`);
      }
    }
    if (criteria.minWideTryBlock != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.wideTryBlockCount >= criteria.minWideTryBlock) {
        optionalPassed++;
        matched.push(`wideTryBlock>=${criteria.minWideTryBlock}`);
      }
    }
    if (criteria.minTypeIgnore != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.typeIgnoreCount >= criteria.minTypeIgnore) {
        optionalPassed++;
        matched.push(`typeIgnore>=${criteria.minTypeIgnore}`);
      }
    }
    if (criteria.minAnyType != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.anyTypeCount >= criteria.minAnyType) {
        optionalPassed++;
        matched.push(`anyType>=${criteria.minAnyType}`);
      }
    }
    if (criteria.minEvalExec != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.evalExecCount >= criteria.minEvalExec) {
        optionalPassed++;
        matched.push(`evalExec>=${criteria.minEvalExec}`);
      }
    }
    if (criteria.hasPyStringConcatInLoop != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.stringConcatInLoopCount > 0) {
        optionalPassed++;
        matched.push("hasPyStringConcatInLoop");
      }
    }
    if (criteria.hasPyOpenWithoutWith != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.openWithoutWithCount > 0) {
        optionalPassed++;
        matched.push("hasPyOpenWithoutWith");
      }
    }
    if (criteria.hasPyAsyncNoAwait != null) {
      optionalTotal++;
      if (em.pythonHints && em.pythonHints.asyncNoAwaitCount > 0) {
        optionalPassed++;
        matched.push("hasPyAsyncNoAwait");
      }
    }

    // Name
    if (compiled.nameMatchRe) {
      optionalTotal++;
      if (compiled.nameMatchRe.test(entity.name)) {
        optionalPassed++;
        matched.push(`name:~/${criteria.nameMatch}/`);
      }
    }
    // nameNotMatch is handled in evaluateRequired as mandatory bail-out
    if (compiled.nameNotMatchRe) {
      // Already passed mandatory check — count as matched
      matched.push(`name:!~/${criteria.nameNotMatch}/`);
    }

    return { optionalTotal, optionalPassed };
  }

  private evaluateMetadataUncached(entity: Entity, pattern: PatternDefinition, compiled: CompiledCriteria): EvalResult {
    const criteria = pattern.structural;

    if (!criteria && !pattern.customDetector) {
      return EVAL_ZERO;
    }

    const matched: string[] = [];
    const em = getMeta(entity);

    if (criteria) {
      // 3A: Fast bail-out on mandatory checks
      const requiredMatched = this.evaluateRequired(entity, compiled, criteria, em);
      if (requiredMatched === null) return EVAL_ZERO;
      matched.push(...requiredMatched);

      // 3A: Optional checks
      const { optionalTotal, optionalPassed } = this.evaluateOptional(entity, compiled, criteria, em, matched);

      // Confidence calculation
      const mandatoryCount = requiredMatched.length;

      if (optionalTotal === 0) {
        if (matched.length > 0 && !pattern.customDetector) {
          return { confidence: 1.0, matchedCriteria: matched };
        }
      } else {
        const conf = optionalPassed / optionalTotal;
        if ((conf > 0 || matched.length > mandatoryCount) && !pattern.customDetector) {
          return { confidence: conf, matchedCriteria: matched };
        }
        // All optional criteria failed — no structural match (custom detector may still run below)
        if (!pattern.customDetector) {
          return EVAL_ZERO;
        }
      }
    }

    // === Custom detector ===
    if (pattern.customDetector) {
      const detector = detectorRegistry.get(pattern.customDetector);
      if (detector) {
        try {
          const result = detector(entity, this.currentEntities);
          if (result.match) {
            const customMatched = result.matchedCriteria ?? [`custom:${pattern.customDetector}`];
            const allMatched = [...matched, ...customMatched];

            const mandatoryCount = matched.filter(
              (m) => m.startsWith("entityType:") || m.startsWith("modifiers:") || m === "no-forbidden-modifiers",
            ).length;
            const hasOptionalStructural = matched.length > mandatoryCount;

            const blended = hasOptionalStructural
              ? (result.confidence + matched.length / Math.max(compiled.totalCriteriaCount, 1)) / 2
              : result.confidence;

            return { confidence: blended, matchedCriteria: allMatched };
          }
          return EVAL_ZERO;
        } catch (err) {
          log.w("STRUCTURAL_DETECTOR", "custom_detector_error", {
            detector: pattern.customDetector,
            error: String(err),
          });
          return EVAL_ZERO;
        }
      }
      return EVAL_ZERO;
    }

    if (matched.length > 0 && !criteria) {
      return { confidence: 0.5, matchedCriteria: matched };
    }

    return {
      confidence: matched.length > 0 ? matched.length / Math.max(compiled.totalCriteriaCount, 1) : 0,
      matchedCriteria: matched,
    };
  }

  // ─── Relationship Evaluation ─────────────────────────────────────

  private evaluateRelationshipCriteria(
    entity: Entity,
    relationships: Relationship[],
    criteria: RelationshipCriteria[],
  ): { passed: boolean; matchedCriteria: string[] } {
    const matched: string[] = [];

    for (const crit of criteria) {
      const filtered = relationships.filter((r) => {
        const matchesType = r.type === crit.type;
        const matchesDirection = crit.direction === "outgoing" ? r.fromId === entity.id : r.toId === entity.id;
        return matchesType && matchesDirection;
      });

      const count = filtered.length;

      if (crit.minCount != null && count < crit.minCount) {
        return { passed: false, matchedCriteria: matched };
      }
      if (crit.maxCount != null && count > crit.maxCount) {
        return { passed: false, matchedCriteria: matched };
      }

      if (crit.crossFileRatio) {
        const total = relationships.filter((r) =>
          crit.direction === "outgoing" ? r.fromId === entity.id : r.toId === entity.id,
        ).length;

        if (total > 0) {
          const ratio = filtered.length / total;
          if (crit.crossFileRatio.min != null && ratio < crit.crossFileRatio.min) {
            return { passed: false, matchedCriteria: matched };
          }
          if (crit.crossFileRatio.max != null && ratio > crit.crossFileRatio.max) {
            return { passed: false, matchedCriteria: matched };
          }
        }
      }

      matched.push(`rel:${crit.direction}:${crit.type}=${count}`);
    }

    return { passed: true, matchedCriteria: matched };
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

function countTotalCriteria(criteria: StructuralCriteria): number {
  let count = 0;
  if (criteria.entityTypes) count++;
  if (criteria.requiredModifiers) count++;
  if (criteria.forbiddenModifiers) count++;
  if (criteria.returnTypeMatch) count++;
  if (criteria.returnTypeNotMatch) count++;
  if (criteria.minParams != null) count++;
  if (criteria.maxParams != null) count++;
  if (criteria.paramTypeRequired) count++;
  if (criteria.paramTypeAbsent) count++;
  if (criteria.minCyclomatic != null) count++;
  if (criteria.maxCyclomatic != null) count++;
  if (criteria.minCognitive != null) count++;
  if (criteria.minNesting != null) count++;
  if (criteria.minLOC != null) count++;
  if (criteria.maxLOC != null) count++;
  if (criteria.hasLoops != null) count++;
  if (criteria.hasExceptions != null) count++;
  if (criteria.hasAwaits != null) count++;
  if (criteria.minBranches != null) count++;
  if (criteria.minCallCount != null) count++;
  // callsInclude/callsExclude are now mandatory (bail-out), counted as 1 each
  if (criteria.callsInclude) count++;
  if (criteria.callsExclude) count++;
  if (criteria.decoratorMatch) count += criteria.decoratorMatch.length;
  if (criteria.hasNoInheritance) count++;
  if (criteria.filePathMatch) count++;
  if (criteria.filePathNotMatch) count++;
  if (criteria.nameMatch) count++;
  if (criteria.nameNotMatch) count++;
  if (criteria.hasDeleteExpression != null) count++;
  if (criteria.hasArgumentsReference != null) count++;
  if (criteria.hasWithStatement != null) count++;
  if (criteria.minSpreadInCalls != null) count++;
  if (criteria.minDynamicPropertyAccess != null) count++;
  if (criteria.minTypeAssertions != null) count++;
  if (criteria.minNonNullAssertions != null) count++;
  if (criteria.hasInnerHtmlAssign != null) count++;
  if (criteria.hasParamMutation != null) count++;
  if (criteria.hasOrWithDefault != null) count++;
  if (criteria.hasThrowNonError != null) count++;
  if (criteria.hasRegexLiterals != null) count++;
  if (criteria.minForceUnwraps != null) count++;
  if (criteria.minUnsafeCasts != null) count++;
  if (criteria.minUnreachable != null) count++;
  // C#-specific hints
  if (criteria.minSyncOverAsync != null) count++;
  if (criteria.minNullForgiving != null) count++;
  if (criteria.hasLockOnThis != null) count++;
  if (criteria.hasNewHttpClient != null) count++;
  if (criteria.hasNewDisposableNoUsing != null) count++;
  if (criteria.hasParallelForEachAsync != null) count++;
  if (criteria.minThrowEx != null) count++;
  if (criteria.minEmptyCatch != null) count++;
  if (criteria.hasStringConcatInLoop != null) count++;
  // Python-specific hints
  if (criteria.minBareExcept != null) count++;
  if (criteria.minExceptPass != null) count++;
  if (criteria.minGenericRaise != null) count++;
  if (criteria.minWideTryBlock != null) count++;
  if (criteria.minTypeIgnore != null) count++;
  if (criteria.minAnyType != null) count++;
  if (criteria.minEvalExec != null) count++;
  if (criteria.hasPyStringConcatInLoop != null) count++;
  if (criteria.hasPyOpenWithoutWith != null) count++;
  if (criteria.hasPyAsyncNoAwait != null) count++;
  if (criteria.relationships) count += criteria.relationships.length;
  return count;
}
