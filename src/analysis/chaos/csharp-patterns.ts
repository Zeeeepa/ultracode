/**
 * C# State & Chaos Pattern Detection
 *
 * Detects 5 high-value anti-patterns that cause real issues in C# applications:
 * - mutable-static: static fields without readonly/const
 * - async-void: async methods returning void
 * - god-service: classes with 10+ constructor parameters
 * - missing-cancellation: async methods without CancellationToken
 * - singleton-mutable-state: singleton-registered classes with mutable fields
 */

import type { Entity } from "../../types/storage.js";
import { EntityType } from "../../types/storage.js";

// ============================================================================
// Types
// ============================================================================

export interface CSharpChaosPattern {
  pattern: "mutable-static" | "async-void" | "god-service" | "missing-cancellation" | "singleton-mutable-state";
  severity: "critical" | "high" | "medium";
  entityId: string;
  entityName: string;
  filePath: string;
  line: number;
  description: string;
  suggestion: string;
}

// ============================================================================
// C# Async APIs (Task-based patterns that indicate async context)
// ============================================================================

export const CSHARP_ASYNC_APIS = [
  "Task.Run",
  "Task.Factory.StartNew",
  "Task.WhenAll",
  "Task.WhenAny",
  "Task.Delay",
  "Parallel.ForEach",
  "Parallel.For",
  "Parallel.ForEachAsync",
  "ThreadPool.QueueUserWorkItem",
  "Channel<",
  "Channel.CreateBounded",
  "Channel.CreateUnbounded",
  "Timer",
  "PeriodicTimer",
  "BackgroundService",
  "IHostedService",
];

// ============================================================================
// C# Lock/Synchronization Patterns
// ============================================================================

export const CSHARP_LOCK_PATTERNS: RegExp[] = [
  /\block\s*\(/,
  /SemaphoreSlim/,
  /Monitor\.(Enter|Exit|TryEnter)/,
  /Interlocked\./,
  /ReaderWriterLockSlim/,
  /SpinLock/,
  /Volatile\.(Read|Write)/,
  /Mutex/,
  /ConcurrentDictionary/,
  /ConcurrentBag/,
  /ConcurrentQueue/,
  /ConcurrentStack/,
  /ImmutableArray/,
  /ImmutableList/,
  /ImmutableDictionary/,
];

// ============================================================================
// C# State Identifier Detection
// ============================================================================

/**
 * Determines if entity is a C# state identifier based on metadata.
 * C# state includes: static fields, mutable properties, config values,
 * service-injected state, connection strings, caches, etc.
 */
export function isCSharpStateIdentifier(entity: Entity): boolean {
  const name = entity.name.toLowerCase();
  const modifiers = entity.metadata?.modifiers || [];

  // Static fields/properties are always state candidates
  if (modifiers.includes("static") && !modifiers.includes("const") && !modifiers.includes("readonly")) {
    return true;
  }

  // Common C# state naming patterns
  const stateKeywords = [
    "state",
    "config",
    "configuration",
    "settings",
    "options",
    "cache",
    "connection",
    "context",
    "session",
    "token",
    "instance",
    "current",
    "singleton",
    "shared",
    "global",
  ];

  if (stateKeywords.some((kw) => name.includes(kw))) {
    return true;
  }

  // Private backing fields (_fieldName pattern)
  // C# entities from Roslyn use "field"/"property" types
  const typeStr = entity.type as string;
  if (
    /^_[a-z]/.test(entity.name) &&
    (entity.type === EntityType.VARIABLE ||
      entity.type === EntityType.CONSTANT ||
      typeStr === "field" ||
      typeStr === "property")
  ) {
    return true;
  }

  // Properties with common state prefixes
  if (/^(Is|Has|Can|Should|Current|Last|Previous)/.test(entity.name)) {
    return true;
  }

  return false;
}

// ============================================================================
// Batch Pattern Detection
// ============================================================================

/**
 * Detect all 5 C# chaos patterns from a list of entities.
 */
export function detectCSharpChaosPatterns(entities: Entity[]): CSharpChaosPattern[] {
  const patterns: CSharpChaosPattern[] = [];

  // Index classes by file for god-service detection
  const classesByFile = new Map<string, Entity[]>();

  for (const entity of entities) {
    // Skip non-C# entities
    if (entity.language !== "csharp" && entity.metadata?.language !== "csharp") {
      continue;
    }

    const modifiers = entity.metadata?.modifiers || [];
    const returnType = entity.metadata?.returnType || "";
    const params = entity.metadata?.parameters || [];
    const line = entity.location?.start?.line || 0;
    const typeStr = entity.type as string;
    // C# entities from Roslyn use "field"/"property" instead of VARIABLE/CONSTANT
    const isFieldLike =
      entity.type === EntityType.VARIABLE ||
      entity.type === EntityType.CONSTANT ||
      typeStr === "field" ||
      typeStr === "property";
    const isMethodLike =
      entity.type === EntityType.METHOD || entity.type === EntityType.FUNCTION || typeStr === "constructor";

    // 1. mutable-static: field/variable + static, no readonly/const
    if (
      isFieldLike &&
      modifiers.includes("static") &&
      !modifiers.includes("readonly") &&
      !modifiers.includes("const")
    ) {
      patterns.push({
        pattern: "mutable-static",
        severity: "critical",
        entityId: entity.id,
        entityName: entity.name,
        filePath: entity.filePath,
        line,
        description: `Mutable static field '${entity.name}' — shared across all threads without protection`,
        suggestion: "Use ConcurrentDictionary, add readonly, or move state to DI-managed service",
      });
    }

    // 2. async-void: method + async + returnType=void
    if (isMethodLike && modifiers.includes("async") && (returnType === "void" || returnType === "Void")) {
      patterns.push({
        pattern: "async-void",
        severity: "high",
        entityId: entity.id,
        entityName: entity.name,
        filePath: entity.filePath,
        line,
        description: `async void method '${entity.name}' — exceptions will crash the process`,
        suggestion: "Replace 'async void' with 'async Task'. Only use async void for event handlers",
      });
    }

    // 3. god-service: class with 10+ constructor parameters
    if (entity.type === EntityType.CLASS) {
      const fileClasses = classesByFile.get(entity.filePath) || [];
      fileClasses.push(entity);
      classesByFile.set(entity.filePath, fileClasses);
    }
    if (isMethodLike && (entity.name === ".ctor" || typeStr === "constructor") && params.length >= 10) {
      patterns.push({
        pattern: "god-service",
        severity: "medium",
        entityId: entity.id,
        entityName: entity.name,
        filePath: entity.filePath,
        line,
        description: `Constructor with ${params.length} parameters — likely a God Service violating SRP`,
        suggestion: "Split into smaller focused services. Group related dependencies into aggregate services",
      });
    }

    // 4. missing-cancellation: async method without CancellationToken parameter
    if (
      isMethodLike &&
      modifiers.includes("async") &&
      returnType !== "void" &&
      returnType !== "Void" &&
      (returnType.includes("Task") || returnType.includes("ValueTask")) &&
      !params.some((p) => p.type?.includes("CancellationToken"))
    ) {
      patterns.push({
        pattern: "missing-cancellation",
        severity: "medium",
        entityId: entity.id,
        entityName: entity.name,
        filePath: entity.filePath,
        line,
        description: `Async method '${entity.name}' without CancellationToken — cannot be cancelled gracefully`,
        suggestion: "Add CancellationToken parameter and pass it to downstream async calls",
      });
    }

    // 5. singleton-mutable-state: detect via common singleton DI patterns
    // Check for static fields in classes that have singleton indicators
    if (
      isFieldLike &&
      modifiers.includes("static") &&
      !modifiers.includes("readonly") &&
      !modifiers.includes("const")
    ) {
      const decorators = entity.metadata?.decorators || [];
      const hasSingletonIndicator =
        decorators.some(
          (d) => d.name === "Singleton" || d.name === "SingleInstance" || d.name === "ServiceLifetime.Singleton",
        ) || entity.name.toLowerCase().includes("singleton");

      if (hasSingletonIndicator) {
        patterns.push({
          pattern: "singleton-mutable-state",
          severity: "high",
          entityId: entity.id,
          entityName: entity.name,
          filePath: entity.filePath,
          line,
          description: `Singleton class has mutable field '${entity.name}' — concurrent access will cause data races`,
          suggestion:
            "Use ConcurrentDictionary/ImmutableCollections, change to Scoped lifetime, or add lock synchronization",
        });
      }
    }
  }

  return patterns;
}
