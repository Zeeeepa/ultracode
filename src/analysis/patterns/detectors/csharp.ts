/**
 * C# Custom Detectors — Migrated from chaos/csharp-patterns.ts + new detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

/**
 * Mutable static field: shared across threads without protection
 */
export function checkMutableStatic(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];

  const isFieldLike = entity.type === "variable" || entity.type === "constant";
  const isStatic = mods.includes("static");
  const isReadonly = mods.includes("readonly") || mods.includes("const");

  if (!isFieldLike || !isStatic || isReadonly) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.9,
    matchedCriteria: ["static", "mutable", "field"],
  };
}

/**
 * Async void method: exceptions crash the process
 */
export function checkCSharpAsyncVoid(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const returnType = entity.metadata?.returnType as string | undefined;

  if (!mods.includes("async")) return { match: false, confidence: 0 };
  if (returnType !== "void") return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.95,
    matchedCriteria: ["async-void"],
  };
}

/**
 * God service: constructor with >= 10 parameters
 */
export function checkGodService(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method" && entity.name !== ".ctor" && entity.name !== "constructor") {
    // Check if it's a constructor by name pattern
    const isConstructor =
      entity.metadata?.modifiers?.includes("constructor") ||
      entity.name?.endsWith(".ctor") ||
      ((entity.type as string) === "method" && entity.name === entity.metadata?.["className"]);

    if (!isConstructor) return { match: false, confidence: 0 };
  }

  const params = (entity.metadata?.parameters ?? []) as Array<unknown>;
  if (params.length < 10) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.6 + (params.length - 10) * 0.05, 1.0),
    matchedCriteria: [`constructor-params=${params.length}`],
  };
}

/**
 * Missing CancellationToken: async Task method without cancellation support
 */
export function checkMissingCancellation(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const returnType = entity.metadata?.returnType as string | undefined;
  const params = (entity.metadata?.parameters ?? []) as Array<{ name: string; type?: string }>;

  if (!mods.includes("async")) return { match: false, confidence: 0 };

  const isTask = returnType?.includes("Task") || returnType?.includes("ValueTask");
  if (!isTask) return { match: false, confidence: 0 };

  const hasCancellation = params.some((p) => p.type?.includes("CancellationToken"));
  if (hasCancellation) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: ["async-task-no-cancellation"],
  };
}

/**
 * Singleton mutable state: static field in class with singleton indicators
 */
export function checkSingletonMutableState(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const isFieldLike = entity.type === "variable" || entity.type === "constant";
  const isStatic = mods.includes("static");
  const isReadonly = mods.includes("readonly") || mods.includes("const");

  if (!isFieldLike || !isStatic || isReadonly) return { match: false, confidence: 0 };

  // Check for singleton indicators in decorators or class name
  const decorators = (entity.metadata?.decorators ?? []) as Array<{ name: string }>;
  const hasSingletonDecorator = decorators.some((d) => /singleton|scoped|transient/i.test(d.name));

  const filePath = entity.filePath?.toLowerCase() ?? "";
  const nameHint = filePath.includes("singleton") || filePath.includes("service") || filePath.includes("manager");

  if (!hasSingletonDecorator && !nameHint) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: ["static-mutable", "singleton-context"],
  };
}

/**
 * LINQ in hot path — allocations from LINQ chain
 */
export function checkLinqInHotpath(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string }> | undefined;
  if (!calls) return { match: false, confidence: 0 };

  const cf = entity.metadata?.["controlFlow"] as { loops?: Array<unknown> } | undefined;
  const linqCalls = calls.filter((c) =>
    /^(Where|Select|SelectMany|OrderBy|GroupBy|Aggregate|Any|All|First|ToList|ToArray|ToDictionary)$/i.test(
      c.name ?? "",
    ),
  );

  if (linqCalls.length === 0) return { match: false, confidence: 0 };

  // Higher confidence if inside loops
  const hasLoops = (cf?.loops?.length ?? 0) > 0;
  const confidence = hasLoops ? 0.8 : 0.5;

  return {
    match: true,
    confidence,
    matchedCriteria: [`linq-calls=${linqCalls.length}`, hasLoops ? "in-loop" : "no-loop"],
  };
}
