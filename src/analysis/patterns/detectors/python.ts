/**
 * Python-specific Custom Detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

/**
 * Bare except: catches all exceptions including SystemExit, KeyboardInterrupt
 */
export function checkBareExcept(entity: Entity): CustomDetectorResult {
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown> } | undefined;
  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  // Heuristic: entity has exception handling — semantic validator checks for bare except
  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["has-exceptions"],
  };
}

/**
 * Mutable default argument: def f(x=[]) — shared across calls
 */
export function checkMutableDefaultArg(entity: Entity): CustomDetectorResult {
  const params = (entity.metadata?.parameters ?? []) as Array<{
    name: string;
    type?: string;
    defaultValue?: string;
  }>;

  const mutableDefaults = params.filter((p) => {
    const dv = p.defaultValue;
    if (!dv) return false;
    // Detect [], {}, set() as defaults
    return /^\[/.test(dv) || /^\{/.test(dv) || /^set\(/.test(dv) || /^dict\(/.test(dv);
  });

  if (mutableDefaults.length === 0) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.9,
    matchedCriteria: mutableDefaults.map((p) => `mutable-default:${p.name}=${p.defaultValue}`),
  };
}

/**
 * Star import: from module import * — pollutes namespace
 */
export function checkStarImport(entity: Entity): CustomDetectorResult {
  if (entity.type !== "import") return { match: false, confidence: 0 };

  const importData = entity.metadata?.importData as
    | { isNamespace?: boolean; specifiers?: Array<{ local: string }> }
    | undefined;

  if (importData?.isNamespace || entity.name.includes("*")) {
    return {
      match: true,
      confidence: 0.9,
      matchedCriteria: ["star-import"],
    };
  }

  return { match: false, confidence: 0 };
}

/**
 * No type hints on public function
 */
export function checkNoTypeHints(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return { match: false, confidence: 0 };

  const params = (entity.metadata?.parameters ?? []) as Array<{ type?: string }>;
  const returnType = entity.metadata?.returnType;

  const untypedParams = params.filter((p) => !p.type);
  const noReturn = !returnType;

  if (untypedParams.length === 0 && !noReturn) return { match: false, confidence: 0 };

  const total = params.length + 1; // +1 for return
  const untyped = untypedParams.length + (noReturn ? 1 : 0);
  const ratio = untyped / Math.max(total, 1);

  if (ratio < 0.5) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: ratio * 0.8,
    matchedCriteria: [`untyped-ratio=${(ratio * 100).toFixed(0)}%`],
  };
}
