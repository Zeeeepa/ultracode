/**
 * Zig-specific Custom Detectors
 */

import type { Entity } from "../../../types/storage.js";
import type { CustomDetectorResult } from "../types.js";

const NO_MATCH: CustomDetectorResult = { match: false, confidence: 0 };

/**
 * Missing defer free: allocator calls present but few branches (proxy for missing defer)
 */
export function checkMissingDeferFree(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return NO_MATCH;

  const allocCalls = calls.filter(
    (c) => /\b(alloc|create|dupe)\b/.test(c.name ?? "") || /\b(alloc|create|dupe)\b/.test(c.target ?? ""),
  );
  if (allocCalls.length === 0) return NO_MATCH;

  const cf = entity.metadata?.["controlFlow"] as { branches?: unknown[]; exceptions?: unknown[] } | undefined;
  const branchCount = cf?.branches?.length ?? 0;

  // Heuristic: defer shows up as branches in control flow.
  // Few branches relative to alloc calls = likely missing defer.
  if (branchCount >= allocCalls.length * 2) return NO_MATCH;

  return {
    match: true,
    confidence: Math.min(0.5 + allocCalls.length * 0.1, 0.8),
    matchedCriteria: [`allocCalls=${allocCalls.length}`, `branches=${branchCount}`],
  };
}

/**
 * Missing errdefer: error-returning function with multiple allocs but few exception handlers
 */
export function checkMissingErrdefer(entity: Entity): CustomDetectorResult {
  const returnType = entity.metadata?.returnType as string | undefined;
  if (!returnType?.includes("!")) return NO_MATCH;

  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return NO_MATCH;

  const allocCalls = calls.filter(
    (c) => /\b(alloc|create)\b/.test(c.name ?? "") || /\b(alloc|create)\b/.test(c.target ?? ""),
  );
  if (allocCalls.length < 2) return NO_MATCH;

  const cf = entity.metadata?.["controlFlow"] as
    | {
        exceptions?: Array<{ type: string; catchType?: string }>;
      }
    | undefined;
  const errdeferCount = cf?.exceptions?.filter((e) => e.catchType === "errdefer").length ?? 0;

  // Has enough errdefer for alloc calls = properly handled
  if (errdeferCount >= allocCalls.length) return NO_MATCH;

  return {
    match: true,
    confidence: Math.min(0.55 + (allocCalls.length - errdeferCount) * 0.1, 0.85),
    matchedCriteria: [`allocCalls=${allocCalls.length}`, `errdefers=${errdeferCount}`, "error-return"],
  };
}

/**
 * Empty catch: exceptions present but very few branches relative to exception count
 */
export function checkEmptyCatch(entity: Entity): CustomDetectorResult {
  const cf = entity.metadata?.["controlFlow"] as
    | {
        exceptions?: Array<{ type: string; catchType?: string }>;
      }
    | undefined;
  const bareCatchCount = cf?.exceptions?.filter((e) => e.catchType === "bare").length ?? 0;
  if (bareCatchCount === 0) return NO_MATCH;

  return {
    match: true,
    confidence: Math.min(0.6 + bareCatchCount * 0.15, 0.85),
    matchedCriteria: [`bareCatch=${bareCatchCount}`],
  };
}

/**
 * Swallowed error: calls that use unreachable with error-returning functions
 */
export function checkSwallowedError(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls) return NO_MATCH;

  const hasUnreachable = calls.some(
    (c) => /\bunreachable\b/.test(c.name ?? "") || /\bunreachable\b/.test(c.target ?? ""),
  );

  const cf = entity.metadata?.["controlFlow"] as { exceptions?: unknown[] } | undefined;
  const hasExceptions = (cf?.exceptions?.length ?? 0) > 0;

  if (!hasUnreachable || !hasExceptions) return NO_MATCH;

  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["unreachable-with-errors"],
  };
}

/**
 * Wrong naming convention:
 * - functions/methods → camelCase
 * - types (class/interface/type_alias) → PascalCase (TitleCase)
 */
export function checkWrongNaming(entity: Entity): CustomDetectorResult {
  const name = entity.name;
  if (!name || name.length < 2) return NO_MATCH;

  const entityType = entity.type;

  if (entityType === "function" || entityType === "method") {
    // Zig functions should be camelCase: starts with lowercase, no underscores (except _-prefixed private)
    if (/^_/.test(name)) return NO_MATCH; // private convention OK
    if (/^[a-z]/.test(name) && !/^[a-z]+(_[a-z]+)+$/.test(name)) return NO_MATCH; // camelCase OK
    // snake_case or PascalCase in function = violation
    if (/^[A-Z]/.test(name) || /^[a-z]+(_[a-z]+)+$/.test(name)) {
      return {
        match: true,
        confidence: 0.7,
        matchedCriteria: [`name=${name}`, `type=${entityType}`, "expected-camelCase"],
      };
    }
  }

  if (entityType === "class" || entityType === "interface" || entityType === "type") {
    // Types should be PascalCase: starts with uppercase
    if (/^[A-Z]/.test(name)) return NO_MATCH; // OK
    return {
      match: true,
      confidence: 0.7,
      matchedCriteria: [`name=${name}`, `type=${entityType}`, "expected-PascalCase"],
    };
  }

  return NO_MATCH;
}

/**
 * Unsafe optional unwrap: code using .? or orelse unreachable without proper null checks
 * Heuristic: entity source references optional unwrap patterns and has few branches (no null guard)
 */
export function checkUnsafeOptionalUnwrap(entity: Entity): CustomDetectorResult {
  const zigOps = entity.metadata?.["zigOps"] as { forceUnwrapCount?: number; safeUnwrapCount?: number } | undefined;
  const forceUnwraps = zigOps?.forceUnwrapCount ?? 0;
  const safeUnwraps = zigOps?.safeUnwrapCount ?? 0;

  const cf = entity.metadata?.["controlFlow"] as
    | {
        exceptions?: Array<{ type: string; catchType?: string }>;
      }
    | undefined;
  const orelseCount = cf?.exceptions?.filter((e) => e.catchType === "orelse").length ?? 0;

  // Check for orelse unreachable pattern (dangerous)
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  const hasUnreachable =
    calls?.some((c) => /\bunreachable\b/.test(c.name ?? "") || /\bunreachable\b/.test(c.target ?? "")) ?? false;
  const dangerousOrelse = hasUnreachable && orelseCount > 0;

  // No force unwraps and no dangerous orelse = safe
  if (forceUnwraps === 0 && !dangerousOrelse) return NO_MATCH;

  // Safe unwraps offset force unwraps (if guarded by if-unwrap, less risky)
  const unguardedUnwraps = Math.max(0, forceUnwraps - safeUnwraps);
  if (unguardedUnwraps === 0 && !dangerousOrelse) return NO_MATCH;

  const matchedCriteria: string[] = [];
  if (unguardedUnwraps > 0) matchedCriteria.push(`forceUnwrap=${forceUnwraps}`, `safeUnwrap=${safeUnwraps}`);
  if (dangerousOrelse) matchedCriteria.push(`orelseUnreachable`);

  return {
    match: true,
    confidence: Math.min(0.5 + unguardedUnwraps * 0.1 + (dangerousOrelse ? 0.2 : 0), 0.85),
    matchedCriteria,
  };
}

/**
 * Mutex not deferred: lock() call without corresponding defer unlock pattern
 * Heuristic: explicit lock/unlock calls suggest manual management instead of defer
 */
export function checkMutexNotDeferred(entity: Entity): CustomDetectorResult {
  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls || calls.length < 2) return NO_MATCH;

  const hasLock = calls.some((c) => /\block\b/.test(c.name ?? "") || /\b(mutex|lock)\b/.test(c.target ?? ""));
  if (!hasLock) return NO_MATCH;

  const hasUnlock = calls.some((c) => /\bunlock\b/.test(c.name ?? "") || /\b(mutex|unlock)\b/.test(c.target ?? ""));

  // Check if there's a defer (type "finally" but NOT errdefer)
  const cf = entity.metadata?.["controlFlow"] as
    | {
        exceptions?: Array<{ type: string; catchType?: string }>;
      }
    | undefined;
  const hasDeferUnlock = cf?.exceptions?.some((e) => e.type === "finally" && e.catchType !== "errdefer") ?? false;

  // If defer is present, the unlock is likely deferred — OK pattern
  if (hasDeferUnlock) return NO_MATCH;

  if (!hasUnlock && calls.length <= 2) return NO_MATCH; // trivial function, low risk

  return {
    match: true,
    confidence: hasUnlock ? 0.7 : 0.6,
    matchedCriteria: [hasUnlock ? "manual-lock-unlock" : "lock-no-unlock", "no-defer"],
  };
}

/**
 * Unsafe cast abuse: excessive @ptrCast/@intFromPtr/@alignCast usage
 */
export function checkUnsafeCastAbuse(entity: Entity): CustomDetectorResult {
  const zigOps = entity.metadata?.["zigOps"] as { unsafeCastCount?: number } | undefined;
  const count = zigOps?.unsafeCastCount ?? 0;
  if (count <= 2) return NO_MATCH;

  return {
    match: true,
    confidence: Math.min(0.6 + count * 0.05, 0.85),
    matchedCriteria: [`unsafeCasts=${count}`],
  };
}

/**
 * Alloc without free: allocator calls with no corresponding free/destroy and no defer cleanup
 */
export function checkAllocWithoutFree(entity: Entity): CustomDetectorResult {
  const zigOps = entity.metadata?.["zigOps"] as
    | { allocCallCount?: number; freeCallCount?: number; deferCount?: number }
    | undefined;
  if (!zigOps || (zigOps.allocCallCount ?? 0) === 0) return NO_MATCH;
  if ((zigOps.freeCallCount ?? 0) > 0) return NO_MATCH;

  // Check if defer is present (likely handles cleanup)
  if ((zigOps.deferCount ?? 0) > 0) return NO_MATCH;

  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: [`allocs=${zigOps.allocCallCount}`, "noFree", "noDefer"],
  };
}

/**
 * Unreachable abuse: excessive unreachable keywords suggesting error swallowing
 */
export function checkUnreachableAbuse(entity: Entity): CustomDetectorResult {
  const zigOps = entity.metadata?.["zigOps"] as { unreachableCount?: number } | undefined;
  const count = zigOps?.unreachableCount ?? 0;
  if (count <= 2) return NO_MATCH;

  return {
    match: true,
    confidence: Math.min(0.65 + (count - 2) * 0.05, 0.85),
    matchedCriteria: [`unreachable=${count}`],
  };
}

/**
 * Has deinit: verifies deinit actually performs cleanup (not just empty)
 */
export function checkHasDeinit(entity: Entity): CustomDetectorResult {
  if (entity.name !== "deinit") return NO_MATCH;

  const calls = entity.metadata?.["calls"] as Array<{ name?: string; target?: string }> | undefined;
  if (!calls || calls.length === 0) return NO_MATCH;

  const hasCleanup = calls.some(
    (c) =>
      /\b(free|destroy|close|deinit)\b/.test(c.name ?? "") || /\b(free|destroy|close|deinit)\b/.test(c.target ?? ""),
  );

  if (!hasCleanup) return NO_MATCH;

  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: [`cleanupCalls=${calls.length}`],
  };
}
