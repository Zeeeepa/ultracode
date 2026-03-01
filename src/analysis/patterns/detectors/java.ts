/**
 * Java/Kotlin-specific Custom Detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

/**
 * Raw types: generic used without type parameter
 */
export function checkRawTypes(entity: Entity): CustomDetectorResult {
  const params = (entity.metadata?.parameters ?? []) as Array<{ type?: string }>;
  const returnType = entity.metadata?.returnType as string | undefined;

  const rawPatterns =
    /^(List|Map|Set|Collection|Iterator|Iterable|Optional|Comparable|Supplier|Consumer|Function|Predicate)$/;

  const rawParams = params.filter((p) => p.type && rawPatterns.test(p.type));
  const rawReturn = returnType && rawPatterns.test(returnType);

  if (rawParams.length === 0 && !rawReturn) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: [
      ...rawParams.map((p) => `raw-type-param:${p.type}`),
      ...(rawReturn ? [`raw-return:${returnType}`] : []),
    ],
  };
}

/**
 * Empty catch block in Java
 */
export function checkJavaEmptyCatch(entity: Entity): CustomDetectorResult {
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown> } | undefined;
  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["has-catch-block"],
  };
}

/**
 * Mutable static field in Java
 */
export function checkJavaMutableStatic(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const isFieldLike = entity.type === "variable" || entity.type === "constant";
  const isStatic = mods.includes("static");
  const isFinal = mods.includes("final") || mods.includes("const");

  if (!isFieldLike || !isStatic || isFinal) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: ["static-mutable-field"],
  };
}

/**
 * String concatenation in loop (optimization)
 */
export function checkStringConcatInLoop(entity: Entity): CustomDetectorResult {
  const cf = entity.metadata?.["controlFlow"] as { loops?: Array<unknown> } | undefined;
  if (!cf?.loops?.length) return { match: false, confidence: 0 };

  // Heuristic: method with loops that returns String
  const returnType = entity.metadata?.returnType as string | undefined;
  const isStringReturn = returnType === "String" || returnType === "string";

  return {
    match: true,
    confidence: isStringReturn ? 0.7 : 0.5,
    matchedCriteria: ["has-loops", ...(isStringReturn ? ["string-return"] : [])],
  };
}

/**
 * Reflection in hot path
 */
export function checkReflectionInHotpath(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return { match: false, confidence: 0 };

  const reflectionCalls = calls.filter(
    (c) =>
      /^(invoke|getMethod|getDeclaredMethod|getField|newInstance|forName)$/i.test(c.name ?? "") ||
      /^(Method|Field|Constructor|Class)$/i.test(c.target ?? ""),
  );

  if (reflectionCalls.length === 0) return { match: false, confidence: 0 };

  const cf = entity.metadata?.["controlFlow"] as { loops?: Array<unknown> } | undefined;
  const inLoop = (cf?.loops?.length ?? 0) > 0;

  return {
    match: true,
    confidence: inLoop ? 0.85 : 0.6,
    matchedCriteria: [`reflection-calls=${reflectionCalls.length}`, inLoop ? "in-loop" : "standalone"],
  };
}
