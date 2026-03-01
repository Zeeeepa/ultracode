/**
 * Go-specific Custom Detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

/**
 * Ignored error: Go function that returns error but caller ignores it
 */
export function checkIgnoredError(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return { match: false, confidence: 0 };

  // Heuristic: functions with multiple calls but no error handling
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown>; branches?: Array<unknown> } | undefined;
  // In Go, error handling appears as if-branches, not exceptions
  // Many calls + few branches = likely ignoring errors
  if (calls.length < 3) return { match: false, confidence: 0 };

  const branchCount = cf?.branches?.length ?? 0;
  const branchToCallRatio = branchCount / calls.length;
  if (branchToCallRatio >= 0.5) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: [`calls=${calls.length}`, `branches=${branchCount}`, `ratio=${branchToCallRatio.toFixed(2)}`],
  };
}

/**
 * Goroutine leak: launching goroutines without context
 */
export function checkGoroutineLeak(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return { match: false, confidence: 0 };

  const hasGoroutine = calls.some((c) => c.name === "go" || c.target === "go");
  if (!hasGoroutine) return { match: false, confidence: 0 };

  const params = (entity.metadata?.parameters ?? []) as Array<{ type?: string }>;
  const hasContext = params.some((p) => p.type?.includes("context.Context") || p.type?.includes("Context"));

  if (hasContext) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: ["goroutine-no-context"],
  };
}

/**
 * Too many return statements
 */
export function checkTooManyReturns(entity: Entity): CustomDetectorResult {
  const metrics = entity.metadata?.["metrics"] as { returnCount?: number } | undefined;
  const returnCount = metrics?.returnCount ?? 0;

  if (returnCount <= 5) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.5 + (returnCount - 5) * 0.08, 0.9),
    matchedCriteria: [`returns=${returnCount}`],
  };
}

/**
 * Naked return in Go — reduces readability
 */
export function checkNakedReturn(entity: Entity): CustomDetectorResult {
  const metrics = entity.metadata?.["metrics"] as { linesOfCode?: number; returnCount?: number } | undefined;
  const loc = metrics?.linesOfCode ?? 0;
  const returns = metrics?.returnCount ?? 0;

  // Naked returns are only bad in long functions
  if (loc <= 10 || returns === 0) return { match: false, confidence: 0 };

  // Heuristic: long function with named returns
  const returnType = entity.metadata?.returnType as string | undefined;
  const hasNamedReturn = returnType?.includes(",") ?? false; // Multiple returns hint

  if (!hasNamedReturn) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: [`LOC=${loc}`, "named-returns"],
  };
}
