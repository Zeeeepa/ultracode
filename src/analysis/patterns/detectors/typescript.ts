/**
 * TypeScript-specific Custom Detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

/**
 * Async void function — exceptions will crash the process
 */
export function checkAsyncVoid(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const returnType = entity.metadata?.returnType as string | undefined;

  const isAsync = mods.includes("async");
  const isVoid = returnType === "void" || returnType === "undefined" || returnType == null;

  if (!isAsync || !isVoid) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.95,
    matchedCriteria: ["async", "void-return"],
  };
}

/**
 * Empty catch block — swallows errors
 */
export function checkEmptyCatch(entity: Entity): CustomDetectorResult {
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown> } | undefined;

  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  // If entity has try-catch but very few statements after catch, it's suspicious
  // This is a heuristic — semantic validator refines it
  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["has-try-catch"],
  };
}

/**
 * Nested callbacks: high nesting + no awaits (callback hell)
 */
export function checkNestedCallbacks(entity: Entity): CustomDetectorResult {
  const metrics = entity.metadata?.["metrics"] as { nestingDepth?: number } | undefined;
  const cf = entity.metadata?.["controlFlow"] as { awaits?: Array<unknown> } | undefined;

  const nesting = metrics?.nestingDepth ?? 0;
  const awaitsCount = cf?.awaits?.length ?? 0;

  if (nesting < 4 || awaitsCount > 0) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.5 + (nesting - 4) * 0.1, 0.9),
    matchedCriteria: [`nesting=${nesting}`, "no-awaits"],
  };
}

/**
 * Promise without catch — unhandled rejection
 */
export function checkPromiseNoCatch(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return { match: false, confidence: 0 };

  const hasPromise = calls.some(
    (c) => c.name === "then" || c.target?.includes("Promise") || c.name?.includes("promise"),
  );
  const hasCatch = calls.some((c) => c.name === "catch");
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown> } | undefined;
  const hasTryCatch = (cf?.exceptions?.length ?? 0) > 0;

  if (!hasPromise || hasCatch || hasTryCatch) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["promise-no-catch"],
  };
}

/**
 * Any type in parameters — losing type safety
 */
export function checkAnyTypeParam(entity: Entity): CustomDetectorResult {
  const params = (entity.metadata?.parameters ?? []) as Array<{ type?: string }>;
  const anyParams = params.filter((p) => p.type === "any");

  if (anyParams.length === 0) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: [`any-params=${anyParams.length}`],
  };
}
