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
  pythonCfExt: {
    returnCount: number;
    nestingDepth: number;
    cyclomaticComplexity: number;
    isinstanceCount: number;
    reRaiseDifferentType: boolean;
  } | null;
  classMeta: {
    hasSlots: boolean;
    dunderMethods: string[];
    properties: Record<string, { hasSetter: boolean }>;
    initCallCount: number;
    methodCount: number;
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
    pythonCfExt: cfRaw
      ? {
          returnCount: ((cfRaw as Record<string, unknown>)?.["returnCount"] as number) ?? 0,
          nestingDepth: ((cfRaw as Record<string, unknown>)?.["nestingDepth"] as number) ?? 0,
          cyclomaticComplexity: ((cfRaw as Record<string, unknown>)?.["cyclomaticComplexity"] as number) ?? 0,
          isinstanceCount: ((cfRaw as Record<string, unknown>)?.["isinstanceCount"] as number) ?? 0,
          reRaiseDifferentType: !!(cfRaw as Record<string, unknown>)?.["reRaiseDifferentType"],
        }
      : null,
    classMeta: (md?.["classMeta"] as EntityMeta["classMeta"]) ?? null,
  };
  metaCache.set(entity, meta);
  return meta;
}

// ─── Structural Detector ───────────────────────────────────────────

type EvalResult = { confidence: number; matchedCriteria: string[] };
const EVAL_ZERO: EvalResult = { confidence: 0, matchedCriteria: [] };

/** Zero result for optional criteria sub-evaluators */
type OptEval = { total: number; passed: number };
const OPT_ZERO: OptEval = { total: 0, passed: 0 };

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
    let total = 0;
    let passed = 0;

    const add = (r: { total: number; passed: number }) => {
      total += r.total;
      passed += r.passed;
    };
    add(this.evalReturnTypeAndParams(compiled, criteria, em, matched));
    add(this.evalMetricsAndControlFlow(criteria, em, matched));
    add(this.evalCallsAndDecorators(compiled, criteria, em, matched));
    add(this.evalJitAndAntipatternHints(criteria, em, matched));
    add(this.evalLanguageSpecific(criteria, em, matched));
    add(this.evalNameCriteria(entity, compiled, criteria, matched));

    return { optionalTotal: total, optionalPassed: passed };
  }

  // ─── Optional Criteria Evaluator Helpers ──────────────────────────────

  /** Check min threshold: returns {1,1} if passes, {1,0} if fails, {0,0} if inactive */
  private static chkMin(threshold: number | undefined, value: number, label: string, matched: string[]): OptEval {
    if (threshold == null) return OPT_ZERO;
    if (value >= threshold) {
      matched.push(`${label}>=${threshold}`);
      return { total: 1, passed: 1 };
    }
    return { total: 1, passed: 0 };
  }

  /** Check max threshold */
  private static chkMax(threshold: number | undefined, value: number, label: string, matched: string[]): OptEval {
    if (threshold == null) return OPT_ZERO;
    if (value <= threshold) {
      matched.push(`${label}<=${threshold}`);
      return { total: 1, passed: 1 };
    }
    return { total: 1, passed: 0 };
  }

  /** Check boolean flag (count > 0) */
  private static chkHas(flag: boolean | undefined, count: number, labelTrue: string, matched: string[]): OptEval {
    if (flag == null) return OPT_ZERO;
    if (count > 0) {
      matched.push(labelTrue);
      return { total: 1, passed: 1 };
    }
    return { total: 1, passed: 0 };
  }

  /** Check boolean equality (e.g. hasLoops: true/false) */
  private static chkBoolEq(
    flag: boolean | undefined,
    actual: boolean,
    labelTrue: string,
    labelFalse: string,
    matched: string[],
  ): OptEval {
    if (flag == null) return OPT_ZERO;
    if (actual === flag) {
      matched.push(flag ? labelTrue : labelFalse);
      return { total: 1, passed: 1 };
    }
    return { total: 1, passed: 0 };
  }

  private evalReturnTypeAndParams(
    compiled: CompiledCriteria,
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;
    const a = (r: { total: number; passed: number }) => {
      total += r.total;
      passed += r.passed;
    };

    // Return type
    if (compiled.returnTypeMatchRe) {
      total++;
      if (typeof em.returnType === "string" && compiled.returnTypeMatchRe.test(em.returnType)) {
        passed++;
        matched.push(`returnType:~/${criteria.returnTypeMatch}/`);
      }
    }
    if (compiled.returnTypeNotMatchRe) {
      total++;
      if (typeof em.returnType === "string" && !compiled.returnTypeNotMatchRe.test(em.returnType)) {
        passed++;
        matched.push(`returnType:!~/${criteria.returnTypeNotMatch}/`);
      }
    }

    // Parameters
    a(StructuralDetector.chkMin(criteria.minParams, em.params.length, "params", matched));
    a(StructuralDetector.chkMax(criteria.maxParams, em.params.length, "params", matched));
    if (compiled.paramTypeRequiredRe) {
      total++;
      if (em.params.some((p) => p.type && compiled.paramTypeRequiredRe!.test(p.type))) {
        passed++;
        matched.push(`paramType:${criteria.paramTypeRequired}`);
      }
    }
    if (compiled.paramTypeAbsentRe) {
      total++;
      if (!em.params.some((p) => p.type && compiled.paramTypeAbsentRe!.test(p.type))) {
        passed++;
        matched.push(`paramType:!${criteria.paramTypeAbsent}`);
      }
    }
    return { total, passed };
  }

  private evalMetricsAndControlFlow(
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;
    const a = (r: { total: number; passed: number }) => {
      total += r.total;
      passed += r.passed;
    };
    const { chkMin, chkMax, chkBoolEq } = StructuralDetector;

    // Metrics
    a(chkMin(criteria.minCyclomatic, em.metrics.cyclomaticComplexity, "cyclomatic", matched));
    a(chkMax(criteria.maxCyclomatic, em.metrics.cyclomaticComplexity, "cyclomatic", matched));
    a(chkMin(criteria.minCognitive, em.metrics.cognitiveComplexity, "cognitive", matched));
    a(chkMin(criteria.minNesting, em.metrics.nestingDepth, "nesting", matched));
    a(chkMin(criteria.minLOC, em.metrics.linesOfCode, "LOC", matched));
    a(chkMax(criteria.maxLOC, em.metrics.linesOfCode, "LOC", matched));

    // ControlFlow
    a(chkBoolEq(criteria.hasLoops, em.cf.loops > 0, "hasLoops", "noLoops", matched));
    a(chkBoolEq(criteria.hasExceptions, em.cf.exceptions > 0, "hasExceptions", "noExceptions", matched));
    a(chkBoolEq(criteria.hasAwaits, em.cf.awaits > 0, "hasAwaits", "noAwaits", matched));
    a(chkMin(criteria.minBranches, em.cf.branches, "branches", matched));

    return { total, passed };
  }

  private evalCallsAndDecorators(
    compiled: CompiledCriteria,
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;

    // Calls
    if (criteria.minCallCount != null) {
      total++;
      if (em.callNames.length >= criteria.minCallCount) {
        passed++;
        matched.push(`calls>=${criteria.minCallCount}`);
      }
    }

    // Decorators
    if (compiled.decoratorMatchRe) {
      for (let i = 0; i < compiled.decoratorMatchRe.length; i++) {
        total++;
        if (em.decoratorNames.some((d) => compiled.decoratorMatchRe![i]!.test(d))) {
          passed++;
          matched.push(`decorator:~/${criteria.decoratorMatch![i]}/`);
        }
      }
    }
    return { total, passed };
  }

  private evalJitAndAntipatternHints(
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;
    const a = (r: { total: number; passed: number }) => {
      total += r.total;
      passed += r.passed;
    };
    const { chkHas, chkMin } = StructuralDetector;

    // JIT Hints
    const jit = em.jitHints;
    a(chkHas(criteria.hasDeleteExpression, jit?.deleteCount ?? 0, "hasDeleteExpression", matched));
    a(chkHas(criteria.hasArgumentsReference, jit?.argumentsRefCount ?? 0, "hasArgumentsReference", matched));
    if (criteria.hasWithStatement != null) {
      total++;
      if (jit?.hasWithStatement) {
        passed++;
        matched.push("hasWithStatement");
      }
    }
    a(chkMin(criteria.minSpreadInCalls, jit?.spreadInCallCount ?? 0, "spreadInCalls", matched));
    a(chkMin(criteria.minDynamicPropertyAccess, jit?.dynamicPropAccessCount ?? 0, "dynamicPropAccess", matched));

    // Antipattern Hints
    const ap = em.antipatternHints;
    a(chkMin(criteria.minTypeAssertions, ap?.typeAssertionCount ?? 0, "typeAssertions", matched));
    a(chkMin(criteria.minNonNullAssertions, ap?.nonNullAssertionCount ?? 0, "nonNullAssertions", matched));
    a(chkHas(criteria.hasInnerHtmlAssign, ap?.innerHtmlAssignCount ?? 0, "hasInnerHtmlAssign", matched));
    a(chkHas(criteria.hasParamMutation, ap?.paramMutationCount ?? 0, "hasParamMutation", matched));
    a(chkHas(criteria.hasOrWithDefault, ap?.orWithDefaultCount ?? 0, "hasOrWithDefault", matched));
    a(chkHas(criteria.hasThrowNonError, ap?.throwNonErrorCount ?? 0, "hasThrowNonError", matched));
    if (criteria.hasRegexLiterals != null) {
      total++;
      if (ap && ap.regexLiterals.length > 0) {
        passed++;
        matched.push("hasRegexLiterals");
      }
    }
    return { total, passed };
  }

  private evalLanguageSpecific(
    criteria: StructuralCriteria,
    em: EntityMeta,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;
    const a = (r: { total: number; passed: number }) => {
      total += r.total;
      passed += r.passed;
    };
    const { chkMin, chkHas } = StructuralDetector;

    // Zig
    const zig = em.zigOps;
    a(chkMin(criteria.minForceUnwraps, zig?.forceUnwrapCount ?? 0, "forceUnwraps", matched));
    a(chkMin(criteria.minUnsafeCasts, zig?.unsafeCastCount ?? 0, "unsafeCasts", matched));
    a(chkMin(criteria.minUnreachable, zig?.unreachableCount ?? 0, "unreachable", matched));

    // C#
    const cs = em.csharpHints;
    a(chkMin(criteria.minSyncOverAsync, cs?.syncOverAsyncCount ?? 0, "syncOverAsync", matched));
    a(chkMin(criteria.minNullForgiving, cs?.nullForgivingCount ?? 0, "nullForgiving", matched));
    a(chkHas(criteria.hasLockOnThis, cs?.lockOnThisCount ?? 0, "hasLockOnThis", matched));
    a(chkHas(criteria.hasNewHttpClient, cs?.newHttpClientCount ?? 0, "hasNewHttpClient", matched));
    a(chkHas(criteria.hasNewDisposableNoUsing, cs?.newDisposableNoUsingCount ?? 0, "hasNewDisposableNoUsing", matched));
    if (criteria.hasParallelForEachAsync != null) {
      total++;
      if (cs?.hasParallelForEachAsync) {
        passed++;
        matched.push("hasParallelForEachAsync");
      }
    }
    a(chkMin(criteria.minThrowEx, cs?.throwExCount ?? 0, "throwEx", matched));
    a(chkMin(criteria.minEmptyCatch, cs?.emptyCatchCount ?? 0, "emptyCatch", matched));
    a(chkHas(criteria.hasStringConcatInLoop, cs?.stringConcatInLoopCount ?? 0, "hasStringConcatInLoop", matched));

    // Python hints
    const py = em.pythonHints;
    a(chkMin(criteria.minBareExcept, py?.bareExceptCount ?? 0, "bareExcept", matched));
    a(chkMin(criteria.minExceptPass, py?.exceptPassCount ?? 0, "exceptPass", matched));
    a(chkMin(criteria.minGenericRaise, py?.genericRaiseCount ?? 0, "genericRaise", matched));
    a(chkMin(criteria.minWideTryBlock, py?.wideTryBlockCount ?? 0, "wideTryBlock", matched));
    a(chkMin(criteria.minTypeIgnore, py?.typeIgnoreCount ?? 0, "typeIgnore", matched));
    a(chkMin(criteria.minAnyType, py?.anyTypeCount ?? 0, "anyType", matched));
    a(chkMin(criteria.minEvalExec, py?.evalExecCount ?? 0, "evalExec", matched));
    a(chkHas(criteria.hasPyStringConcatInLoop, py?.stringConcatInLoopCount ?? 0, "hasPyStringConcatInLoop", matched));
    a(chkHas(criteria.hasPyOpenWithoutWith, py?.openWithoutWithCount ?? 0, "hasPyOpenWithoutWith", matched));
    a(chkHas(criteria.hasPyAsyncNoAwait, py?.asyncNoAwaitCount ?? 0, "hasPyAsyncNoAwait", matched));

    // Python controlFlow extended
    const pcf = em.pythonCfExt;
    a(chkMin(criteria.minReturnCount, pcf?.returnCount ?? 0, "returnCount", matched));
    a(chkMin(criteria.minNestingDepth, pcf?.nestingDepth ?? 0, "nestingDepth", matched));
    a(chkMin(criteria.minCyclomaticPy, pcf?.cyclomaticComplexity ?? 0, "cyclomaticPy", matched));
    a(chkMin(criteria.minIsinstanceCount, pcf?.isinstanceCount ?? 0, "isinstance", matched));
    if (criteria.hasPyReRaiseDifferent != null) {
      total++;
      if (pcf?.reRaiseDifferentType) {
        passed++;
        matched.push("reRaiseDifferentType");
      }
    }

    // Python class metadata
    const cls = em.classMeta;
    if (criteria.hasPySlots != null) {
      total++;
      if (cls?.hasSlots) {
        passed++;
        matched.push("hasSlots");
      }
    }
    if (criteria.missingPySlots != null) {
      total++;
      if (cls && !cls.hasSlots) {
        passed++;
        matched.push("missingSlots");
      }
    }
    if (criteria.missingPyRepr != null) {
      total++;
      if (cls && !cls.dunderMethods?.includes("__repr__")) {
        passed++;
        matched.push("missingRepr");
      }
    }
    if (criteria.missingPyStr != null) {
      total++;
      if (cls && !cls.dunderMethods?.includes("__str__")) {
        passed++;
        matched.push("missingStr");
      }
    }
    a(chkMin(criteria.minPyInitCalls, cls?.initCallCount ?? 0, "initCalls", matched));
    a(chkMin(criteria.minPyMethodCount, cls?.methodCount ?? 0, "methodCount", matched));
    if (criteria.hasPyPropertyNoSetter != null) {
      total++;
      if (cls?.properties) {
        const hasReadOnly = Object.values(cls.properties).some((p) => !p.hasSetter);
        if (hasReadOnly) {
          passed++;
          matched.push("propertyNoSetter");
        }
      }
    }
    return { total, passed };
  }

  private evalNameCriteria(
    entity: Entity,
    compiled: CompiledCriteria,
    criteria: StructuralCriteria,
    matched: string[],
  ): { total: number; passed: number } {
    let total = 0,
      passed = 0;
    if (compiled.nameMatchRe) {
      total++;
      if (compiled.nameMatchRe.test(entity.name)) {
        passed++;
        matched.push(`name:~/${criteria.nameMatch}/`);
      }
    }
    // nameNotMatch is handled in evaluateRequired as mandatory bail-out
    if (compiled.nameNotMatchRe) {
      matched.push(`name:!~/${criteria.nameNotMatch}/`);
    }
    return { total, passed };
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
  // Python controlFlow extended
  if (criteria.minReturnCount != null) count++;
  if (criteria.minNestingDepth != null) count++;
  if (criteria.minCyclomaticPy != null) count++;
  if (criteria.minIsinstanceCount != null) count++;
  if (criteria.hasPyReRaiseDifferent != null) count++;
  // Python class metadata
  if (criteria.hasPySlots != null) count++;
  if (criteria.missingPySlots != null) count++;
  if (criteria.missingPyRepr != null) count++;
  if (criteria.missingPyStr != null) count++;
  if (criteria.minPyInitCalls != null) count++;
  if (criteria.minPyMethodCount != null) count++;
  if (criteria.hasPyPropertyNoSetter != null) count++;
  if (criteria.relationships) count += criteria.relationships.length;
  return count;
}
