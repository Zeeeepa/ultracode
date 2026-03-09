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

// ── Wave 1 Custom Detectors ──────────────────────────────────────

/**
 * EF Core: 2+ Include calls without AsSplitQuery → cartesian explosion
 */
export function checkEfCartesianExplosion(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const includeCount = calls.filter((c) => c.name === "Include" || c.name === "ThenInclude").length;
  if (includeCount < 2) return { match: false, confidence: 0 };

  const hasSplitQuery = calls.some((c) => c.name === "AsSplitQuery");
  if (hasSplitQuery) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.6 + (includeCount - 2) * 0.1, 0.95),
    matchedCriteria: [`include-count=${includeCount}`, "no-AsSplitQuery"],
  };
}

/**
 * EF Core: ToList/ToArray on DbSet without Where/Take/Skip
 */
export function checkEfLoadEntireTable(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const materializers = calls.filter((c) => /^(ToList|ToArray|ToListAsync|ToArrayAsync)$/.test(c.name ?? ""));
  if (materializers.length === 0) return { match: false, confidence: 0 };

  const hasFilter = calls.some((c) => /^(Where|Take|Skip|First|Single|Find)/.test(c.name ?? ""));
  if (hasFilter) return { match: false, confidence: 0 };

  // Check if there's a DbSet/DbContext reference
  const hasDbRef = calls.some((c) => /DbContext|DbSet|_context|_db/i.test(c.target ?? ""));
  if (!hasDbRef) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: ["materializer-without-filter", "dbset-reference"],
  };
}

/**
 * EF Entity returned directly from API endpoint (has [Http*] attribute)
 */
export function checkEfEntityAsApiResponse(entity: Entity): CustomDetectorResult {
  const decorators = (entity.metadata?.decorators ?? []) as Array<{ name: string }>;
  const attrs = (entity.metadata?.["attributes"] ?? []) as string[];
  const allAttrs = [...decorators.map((d) => d.name), ...attrs];

  const hasHttpAttr = allAttrs.some((a) => /Http(Get|Post|Put|Delete|Patch)/i.test(a));
  if (!hasHttpAttr) return { match: false, confidence: 0 };

  // Check return type for common entity patterns (not DTO/ViewModel/Response)
  const returnType = entity.metadata?.returnType as string | undefined;
  if (!returnType) return { match: false, confidence: 0 };

  // Skip if return type contains DTO, ViewModel, Response, Result
  if (/DTO|ViewModel|Response|Result|Model$/i.test(returnType)) return { match: false, confidence: 0 };

  // Check if return type looks like an entity (capitalized, no DTO suffix, has Task wrapper)
  const innerType = returnType.replace(/^(Task|ValueTask|ActionResult|IActionResult)<(.+)>$/, "$2").trim();
  if (innerType === "IActionResult" || innerType === "ActionResult" || innerType === "void" || innerType === "string")
    return { match: false, confidence: 0 };

  // Check if entity name appears in calls to DbSet/DbContext
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const hasDbCalls = calls.some((c) => /DbContext|DbSet|_context|_db/i.test(c.target ?? ""));
  if (!hasDbCalls) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["http-endpoint", `returns-entity:${innerType}`, "has-db-calls"],
  };
}

/**
 * Task.Run inside ASP.NET Controller/Handler
 */
export function checkTaskRunInAspnet(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const hasTaskRun = calls.some((c) => c.name === "Run" && (c.target === "Task" || c.target === "Task`1"));
  if (!hasTaskRun) return { match: false, confidence: 0 };

  // Check if entity is in a Controller or Handler context
  const filePath = entity.filePath?.toLowerCase() ?? "";
  const entityName = entity.name?.toLowerCase() ?? "";
  const decorators = (entity.metadata?.decorators ?? []) as Array<{ name: string }>;
  const attrs = (entity.metadata?.["attributes"] ?? []) as string[];
  const allAttrs = [...decorators.map((d) => d.name), ...attrs];

  const isAspnet =
    filePath.includes("controller") ||
    filePath.includes("handler") ||
    entityName.includes("controller") ||
    allAttrs.some((a) => /ApiController|Controller|Http(Get|Post|Put|Delete)/i.test(a));

  if (!isAspnet) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: ["task-run", "aspnet-context"],
  };
}

/**
 * Service Locator: GetService/GetRequiredService outside DI registration files
 */
export function checkDiServiceLocator(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const slCalls = calls.filter((c) => c.name === "GetService" || c.name === "GetRequiredService");
  if (slCalls.length === 0) return { match: false, confidence: 0 };

  // Allow in Program.cs, Startup.cs, and DI extension methods
  const filePath = entity.filePath?.toLowerCase() ?? "";
  if (filePath.endsWith("program.cs") || filePath.endsWith("startup.cs") || filePath.includes("extension"))
    return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: [`service-locator-calls=${slCalls.length}`],
  };
}

/**
 * Constructor with too many dependencies (>5, excluding ILogger/IOptions)
 */
export function checkDiTooManyDeps(entity: Entity): CustomDetectorResult {
  const mods = entity.metadata?.modifiers ?? [];
  const isConstructor =
    mods.includes("constructor") || entity.name?.endsWith(".ctor") || (entity.type as string) === "constructor";
  if (!isConstructor && entity.type !== "method") return { match: false, confidence: 0 };

  const params = (entity.metadata?.parameters ?? []) as Array<{ name: string; type?: string }>;
  // Filter out infrastructure params
  const meaningful = params.filter((p) => !/(ILogger|IOptions|IConfiguration|CancellationToken)/i.test(p.type ?? ""));

  if (meaningful.length <= 5) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.5 + (meaningful.length - 5) * 0.08, 0.95),
    matchedCriteria: [`meaningful-deps=${meaningful.length}`],
  };
}

/**
 * Static collection with Add but no Remove/Clear — memory leak
 */
export function checkStaticCollectionLeak(entity: Entity, allEntities?: Entity[]): CustomDetectorResult {
  // This detector needs to find static fields of type List/Dictionary with Add calls
  if (entity.type !== "method") return { match: false, confidence: 0 };

  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const addCalls = calls.filter(
    (c) => c.name === "Add" || c.name === "TryAdd" || c.name === "Enqueue" || c.name === "Push",
  );
  if (addCalls.length === 0) return { match: false, confidence: 0 };

  // Check if target of Add is a static field (heuristic: starts with _ or is PascalCase without this.)
  const addTargets = addCalls.map((c) => c.target ?? "").filter(Boolean);
  if (addTargets.length === 0) return { match: false, confidence: 0 };

  // Check if there's Remove/Clear/Dequeue/Pop in the same class
  const removeCalls = calls.filter((c) => /^(Remove|RemoveAt|Clear|Dequeue|Pop|TryRemove)$/.test(c.name ?? ""));

  // Also check other methods in the same file
  if (allEntities) {
    const sameFile = allEntities.filter(
      (e) => e.filePath === entity.filePath && e.type === "method" && e.id !== entity.id,
    );
    for (const other of sameFile) {
      const otherCalls = (other.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
      const otherRemoves = otherCalls.filter((c) =>
        /^(Remove|RemoveAt|Clear|Dequeue|Pop|TryRemove)$/.test(c.name ?? ""),
      );
      removeCalls.push(...otherRemoves);
    }
  }

  if (removeCalls.length > 0) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: [`add-calls=${addCalls.length}`, "no-remove-or-clear"],
  };
}

/**
 * PII in logs: structured log calls with {@Object} destructuring
 */
export function checkPiiInLogs(entity: Entity): CustomDetectorResult {
  // Cap text length to prevent regex engine stack overflow on large methods
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Match Log* calls with {@SomeObject} destructuring pattern
  const logDestructurePattern = /\bLog\w*\b[^;]{0,200}\{@\w+\}/;
  if (!logDestructurePattern.test(content)) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: ["log-destructuring-pii"],
  };
}

/**
 * Async fire-and-forget: calling async method without await
 */
export function checkAsyncFireAndForget(entity: Entity): CustomDetectorResult {
  // Cap text length to prevent regex engine stack overflow on large methods
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Simplified: find lines with SomethingAsync( that are NOT preceded by await/var/assignment
  // Use line-by-line approach instead of complex lookaheads to avoid regex engine issues
  const lines = content.split("\n");
  let found = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (
      /\w+Async\s*\(/.test(trimmed) &&
      !trimmed.startsWith("await ") &&
      !trimmed.startsWith("var ") &&
      !/^\w+\s*=/.test(trimmed) &&
      !/^return\s/.test(trimmed)
    ) {
      found = true;
      break;
    }
  }
  if (!found) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["async-fire-and-forget"],
  };
}

/**
 * Minimal API: fat inline lambda handler
 */
export function checkMinimalApiFatLambda(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const hasMapEndpoint = calls.some((c) => /^(MapGet|MapPost|MapPut|MapDelete|MapPatch)$/.test(c.name ?? ""));
  if (!hasMapEndpoint) return { match: false, confidence: 0 };

  const loc =
    (entity.metadata?.["complexity"] as { linesOfCode?: number } | undefined)?.linesOfCode ??
    (entity.location?.end?.line ?? 0) - (entity.location?.start?.line ?? 0) + 1;
  const complexity = (entity.metadata?.["complexity"] as number | undefined) ?? 1;

  if (loc < 20 && (typeof complexity !== "number" || complexity < 4)) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.5 + (loc - 15) * 0.02, 0.9),
    matchedCriteria: [`loc=${loc}`, `complexity=${complexity}`, "inline-endpoint-handler"],
  };
}

/**
 * Minimal API: endpoint without validation for complex input
 */
export function checkMinimalApiNoValidation(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const hasMapEndpoint = calls.some((c) => /^(MapPost|MapPut|MapPatch)$/.test(c.name ?? ""));
  if (!hasMapEndpoint) return { match: false, confidence: 0 };

  // Check if handler has complex type params (not just primitives)
  const params = (entity.metadata?.parameters ?? []) as Array<{ name: string; type?: string }>;
  const complexParams = params.filter(
    (p) =>
      p.type &&
      !/^(string|int|long|bool|Guid|DateTime|decimal|float|double|CancellationToken|HttpContext)$/i.test(p.type),
  );
  if (complexParams.length === 0) return { match: false, confidence: 0 };

  // Check for validation calls
  const hasValidation = calls.some((c) =>
    /^(Validate|ValidateAsync|IsValid|TryValidateModel|FluentValidation)$/i.test(c.name ?? ""),
  );
  if (hasValidation) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: [`complex-params=${complexParams.length}`, "no-validation"],
  };
}

/**
 * gRPC: client call without deadline configuration
 */
export function checkGrpcMissingDeadline(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  // Look for gRPC client calls (typically end with Async or are unary)
  const grpcCalls = calls.filter((c) => {
    const target = c.target ?? "";
    return /Client$/.test(target) && /Async$/.test(c.name ?? "");
  });
  if (grpcCalls.length === 0) return { match: false, confidence: 0 };

  // Check for deadline/timeout configuration
  const content = (entity.embeddingText ?? "") as string;
  const hasDeadline = /deadline|Deadline|CallOptions|timeout/i.test(content);
  if (hasDeadline) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: [`grpc-calls=${grpcCalls.length}`, "no-deadline"],
  };
}

/**
 * gRPC: creating new GrpcChannel per call (should be singleton)
 */
export function checkGrpcChannelPerCall(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const hasChannelCreate = calls.some(
    (c) =>
      (c.name === "ForAddress" && (c.target ?? "").includes("GrpcChannel")) ||
      (c.name === "Create" && (c.target ?? "").includes("GrpcChannel")),
  );
  if (!hasChannelCreate) return { match: false, confidence: 0 };

  // Allow in DI registration (Program.cs, Startup.cs, ServiceCollection extension methods)
  const filePath = entity.filePath?.toLowerCase() ?? "";
  if (filePath.endsWith("program.cs") || filePath.endsWith("startup.cs") || filePath.includes("extension"))
    return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: ["grpc-channel-per-call"],
  };
}

// ── Wave 2 Custom Detectors (controlFlow-dependent) ─────────────

// Helper types for controlFlow metadata
interface CfException {
  line: number;
  catchType?: string;
  hasRethrow?: boolean;
  isEmpty?: boolean;
  hasThrowEx?: boolean;
}
interface CfLoop {
  kind: string;
  line: number;
  innerCalls?: string[];
}
interface CfAwait {
  expression: string;
  line: number;
}
interface ControlFlowData {
  branches?: Array<{ line: number }>;
  loops?: CfLoop[];
  exceptions?: CfException[];
  returns?: Array<{ line: number }>;
  awaits?: CfAwait[];
}

function getCf(entity: Entity): ControlFlowData | null {
  return (entity.metadata?.["controlFlow"] as ControlFlowData | undefined) ?? null;
}

/**
 * Async lock-with-await: method uses lock (or Monitor) AND has awaits
 * lock(obj) { await ... } deadlocks — should use SemaphoreSlim instead
 */
export function checkAsyncLockWithAwait(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.awaits?.length) return { match: false, confidence: 0 };

  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Check for lock keyword or Monitor.Enter usage
  const hasLock = /\block\s*\(/.test(content) || /Monitor\.(Enter|TryEnter)/.test(content);
  if (!hasLock) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: ["lock-with-await", `awaits=${cf.awaits.length}`],
  };
}

/**
 * EF query inside loop body — N+1 at DB level
 */
export function checkEfFindInLoop(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.loops?.length) return { match: false, confidence: 0 };

  const dbCallPatterns =
    /^(Find|FindAsync|FirstOrDefault|FirstOrDefaultAsync|SingleOrDefault|SingleOrDefaultAsync|Where|ToList|ToListAsync|ToArray|ToArrayAsync|SaveChanges|SaveChangesAsync|ExecuteSqlRaw|FromSqlRaw)$/;
  let matchedLoops = 0;
  const matchedCalls: string[] = [];

  for (const loop of cf.loops) {
    if (!loop.innerCalls) continue;
    const dbCalls = loop.innerCalls.filter((c) => dbCallPatterns.test(c));
    if (dbCalls.length > 0) {
      matchedLoops++;
      matchedCalls.push(...dbCalls);
    }
  }

  if (matchedLoops === 0) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.7 + matchedLoops * 0.1, 0.95),
    matchedCriteria: [`db-in-loop=${matchedLoops}`, `calls=${[...new Set(matchedCalls)].join(",")}`],
  };
}

/**
 * EF client-side evaluation: AsEnumerable/ToList followed by LINQ on same chain
 */
export function checkEfClientSideEval(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  // Check for materializers followed by LINQ operators
  const hasMaterializer = calls.some((c) => /^(AsEnumerable|ToList|ToArray)$/.test(c.name ?? ""));
  if (!hasMaterializer) return { match: false, confidence: 0 };

  // Check for DB context usage (confirms EF)
  const hasDbRef = calls.some((c) => /DbContext|DbSet|_context|_db/i.test(c.target ?? ""));
  if (!hasDbRef) return { match: false, confidence: 0 };

  // Check line by line: materializer followed by LINQ on next chained line
  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/\.(AsEnumerable|ToList)\(\)/.test(line)) {
      // Check current line and next 3 lines for LINQ calls
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        if (j > i || line.indexOf("ToList()") < (lines[j]?.indexOf(".Where") ?? -1)) {
          if (/\.(Where|Select|OrderBy|GroupBy|Any|All|Count|Sum|Average|Min|Max)\(/.test(lines[j]!)) {
            return { match: true, confidence: 0.8, matchedCriteria: ["ef-client-side-eval"] };
          }
        }
      }
    }
  }

  return { match: false, confidence: 0 };
}

/**
 * Multiple SaveChanges without transaction — partial commit risk
 */
export function checkEfSaveChangesNoTransaction(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const saveCount = calls.filter((c) => /^(SaveChanges|SaveChangesAsync)$/.test(c.name ?? "")).length;
  if (saveCount < 2) return { match: false, confidence: 0 };

  // Check for transaction usage
  const hasTransaction = calls.some((c) =>
    /^(BeginTransaction|BeginTransactionAsync|TransactionScope|CreateScope)$/.test(c.name ?? ""),
  );
  if (hasTransaction) return { match: false, confidence: 0 };

  // Also check embeddingText for TransactionScope
  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  if (/TransactionScope|BeginTransaction/.test(content)) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.7 + (saveCount - 2) * 0.1, 0.9),
    matchedCriteria: [`saveChanges-count=${saveCount}`, "no-transaction"],
  };
}

/**
 * catch(Exception) — catching base Exception hides specific errors
 */
export function checkCatchGeneric(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  const genericCatches = cf.exceptions.filter(
    (e) => e.catchType === "Exception" || e.catchType === "System.Exception" || e.catchType == null,
  );
  if (genericCatches.length === 0) return { match: false, confidence: 0 };

  // Skip if it's the only catch and re-throws (acceptable pattern)
  const allRethrow = genericCatches.every((e) => e.hasRethrow);
  if (allRethrow) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: [`generic-catches=${genericCatches.length}`],
  };
}

/**
 * Exception used for flow control: try/catch inside loop
 */
export function checkExceptionFlowControl(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.loops?.length || !cf?.exceptions?.length) return { match: false, confidence: 0 };

  // Heuristic: if exceptions exist and there are loops, check embeddingText for pattern
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Look for try { inside a for/foreach/while
  const lines = content.split("\n");
  let inLoop = 0;
  let tryInLoop = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (/^(for|foreach|while|do)\b/.test(trimmed)) inLoop++;
    if (inLoop > 0 && /^try\b/.test(trimmed)) {
      tryInLoop = true;
      break;
    }
    if (trimmed === "}" && inLoop > 0) inLoop = Math.max(0, inLoop - 1);
  }

  if (!tryInLoop) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["try-catch-in-loop"],
  };
}

/**
 * Event handler leak: += without corresponding -=
 * Pre-filters via calls metadata to avoid scanning all methods' embeddingText
 */
export function checkEventHandlerLeak(entity: Entity): CustomDetectorResult {
  // Pre-filter: check if entity has event-related patterns in calls or modifiers
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  // Look for event-related calls (Subscribe, AddHandler, add_EventName, etc.)
  const hasEventCalls = calls.some((c) => {
    const n = c.name ?? "";
    return n.startsWith("add_") || /^(Subscribe|AddHandler|Attach|Register)/.test(n);
  });

  // Quick keyword pre-filter BEFORE reading full embeddingText
  if (!hasEventCalls) {
    const raw = (entity.embeddingText ?? "") as string;
    // Fast O(N) keyword checks — no regex on full text
    if (
      !raw.includes("+=") ||
      (!raw.includes("EventHandler") && !raw.includes("delegate") && !raw.includes("+= new"))
    ) {
      return { match: false, confidence: 0 };
    }
  }

  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);

  // Count event-like += (with EventHandler, delegate, method reference patterns)
  const lines = content.split("\n");
  let eventAdds = 0;
  let eventRemoves = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    // Match: obj.Event += handler or obj.Event += new EventHandler(handler)
    if (/\.\w+\s*\+=/.test(trimmed) && !/\+=\s*\d/.test(trimmed) && !/\+=\s*["']/.test(trimmed)) {
      eventAdds++;
    }
    if (/\.\w+\s*-=/.test(trimmed) && !/-=\s*\d/.test(trimmed)) {
      eventRemoves++;
    }
  }

  if (eventAdds === 0) return { match: false, confidence: 0 };
  if (eventRemoves >= eventAdds) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: [`event-add=${eventAdds}`, `event-remove=${eventRemoves}`],
  };
}

/**
 * Dictionary check-then-act: ContainsKey → Add (TOCTOU race condition)
 */
export function checkDictCheckThenAct(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const hasContainsKey = calls.some((c) => c.name === "ContainsKey");
  const hasAdd = calls.some((c) => c.name === "Add" || c.name === "set_Item");
  if (!hasContainsKey || !hasAdd) return { match: false, confidence: 0 };

  // Verify pattern in code line-by-line (avoid multiline regex on Bun/JSC)
  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  const lines = content.split("\n");
  let containsKeyLine = -1;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (/ContainsKey\s*\(/.test(lines[i]!)) {
      containsKeyLine = i;
    }
    // Check for Add within 5 lines after ContainsKey
    if (containsKeyLine >= 0 && i > containsKeyLine && i <= containsKeyLine + 5) {
      if (/\.Add\s*\(/.test(lines[i]!) || /\[.*\]\s*=/.test(lines[i]!)) {
        found = true;
        break;
      }
    }
  }

  if (!found) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: ["containskey-then-add", "toctou-race"],
  };
}

/**
 * Captive dependency: Singleton consuming Scoped/Transient service
 */
export function checkCaptiveDependency(entity: Entity): CustomDetectorResult {
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Check for AddSingleton registering a type that injects scoped services
  // Heuristic: file has AddSingleton AND the registered class/method takes IServiceProvider or has GetRequiredService
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;

  // Pattern: AddSingleton<IFoo>(sp => new Foo(sp.GetRequiredService<IScoped>()))
  const hasSingleton = calls.some((c) => /^AddSingleton/.test(c.name ?? ""));
  if (!hasSingleton) return { match: false, confidence: 0 };

  const hasServiceResolution = calls.some((c) => /^(GetRequiredService|GetService)$/.test(c.name ?? ""));
  // Also check for scoped keywords in the code context
  const mentionsScoped = /AddScoped|IServiceScope|CreateScope/.test(content);

  if (!hasServiceResolution && !mentionsScoped) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: ["singleton-with-scoped-resolution"],
  };
}

/**
 * LINQ premature materialization: ToList/ToArray before further LINQ filtering
 * Line-by-line approach to avoid regex issues on large text
 */
export function checkLinqPrematureMaterialization(entity: Entity): CustomDetectorResult {
  // Pre-filter via calls
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const hasMaterializer = calls.some((c) => /^(ToList|ToArray|ToListAsync|ToArrayAsync)$/.test(c.name ?? ""));
  if (!hasMaterializer) return { match: false, confidence: 0 };

  const hasLinq = calls.some((c) =>
    /^(Where|Select|OrderBy|GroupBy|First|Last|Single|Any|All|Count|Sum|Average)$/.test(c.name ?? ""),
  );
  if (!hasLinq) return { match: false, confidence: 0 };

  // Line-by-line check for materialization before LINQ
  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/\.(ToList|ToArray|ToListAsync|ToArrayAsync)\(\)/.test(line)) {
      // Check same line for chained LINQ after materializer
      const matIdx = line.search(/\.(ToList|ToArray)\(\)/);
      if (matIdx >= 0) {
        const after = line.slice(matIdx + 10);
        if (/\.(Where|Select|OrderBy|GroupBy|First|Last|Single|Any|All|Count|Sum|Average)\(/.test(after)) {
          return { match: true, confidence: 0.8, matchedCriteria: ["premature-materialization"] };
        }
      }
      // Check next few lines for continued chain
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (/^\s*\.(Where|Select|OrderBy|GroupBy|First|Last|Single|Any|All|Count|Sum|Average)\(/.test(lines[j]!)) {
          return { match: true, confidence: 0.8, matchedCriteria: ["premature-materialization"] };
        }
      }
    }
  }

  return { match: false, confidence: 0 };
}

// ── Wave 3 Custom Detectors ─────────────────────────────────────

/**
 * EF FromSqlRaw with string concatenation — SQL injection risk
 */
export function checkEfRawSqlInjection(entity: Entity): CustomDetectorResult {
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const hasRawSql = calls.some((c) => /^(FromSqlRaw|ExecuteSqlRaw|ExecuteSqlRawAsync)$/.test(c.name ?? ""));
  if (!hasRawSql) return { match: false, confidence: 0 };

  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  // Check for string concat/interpolation in FromSqlRaw call
  const hasConcatInSql =
    /FromSqlRaw\(\s*\$"/.test(content) ||
    /FromSqlRaw\([^)]*\+/.test(content) ||
    /ExecuteSqlRaw\(\s*\$"/.test(content) ||
    /ExecuteSqlRaw\([^)]*\+/.test(content);

  if (!hasConcatInSql) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.9,
    matchedCriteria: ["raw-sql-string-concat", "injection-risk"],
  };
}

/**
 * Catch that only rethrows: useless try/catch adding noise
 */
export function checkCatchRethrowOnly(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  // Catch blocks that have hasRethrow=true and appear to have only that
  const uselessCatches = cf.exceptions.filter((e) => e.hasRethrow && !e.hasThrowEx && !e.isEmpty);
  if (uselessCatches.length === 0) return { match: false, confidence: 0 };

  // Verify: check embeddingText that catch block really only has throw;
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  const rethrowOnlyPattern = /catch\s*\([^)]*\)\s*\{\s*throw\s*;\s*\}/;
  if (!rethrowOnlyPattern.test(content)) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: [`rethrow-only-catches=${uselessCatches.length}`],
  };
}

/**
 * Boolean blindness: method with 3+ bool parameters
 */
export function checkBooleanBlindness(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method") return { match: false, confidence: 0 };
  const params = (entity.metadata?.parameters ?? []) as Array<{ name: string; type?: string }>;
  const boolParams = params.filter((p) => /^bool(ean)?$/i.test(p.type ?? ""));
  if (boolParams.length < 3) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.6 + (boolParams.length - 3) * 0.1, 0.9),
    matchedCriteria: [`bool-params=${boolParams.length}`, `params=${boolParams.map((p) => p.name).join(",")}`],
  };
}

/**
 * Library code without ConfigureAwait(false): risks deadlock in non-ASP.NET consumers
 */
export function checkNoConfigureAwait(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.awaits?.length) return { match: false, confidence: 0 };

  // Only flag for library-like code (not controllers, handlers, pages)
  const filePath = entity.filePath?.toLowerCase() ?? "";
  if (/controller|handler|page|razor|program\.cs|startup\.cs/.test(filePath)) {
    return { match: false, confidence: 0 };
  }

  // Check if any await uses ConfigureAwait
  const hasConfigureAwait = cf.awaits.some((a) => a.expression.includes("ConfigureAwait"));
  if (hasConfigureAwait) return { match: false, confidence: 0 };

  // Only flag if code looks like a library (has namespace, no ASP.NET attributes)
  const decorators = (entity.metadata?.decorators ?? []) as Array<{ name: string }>;
  const attrs = (entity.metadata?.["attributes"] ?? []) as string[];
  const allAttrs = [...decorators.map((d) => d.name), ...attrs];
  if (allAttrs.some((a) => /Http|ApiController|Authorize|Route/.test(a))) {
    return { match: false, confidence: 0 };
  }

  return {
    match: true,
    confidence: 0.55,
    matchedCriteria: [`awaits-without-configureawait=${cf.awaits.length}`],
  };
}

/**
 * Mixed async/sync: method uses both .Result/.Wait() AND await
 */
export function checkMixedAsyncSync(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.awaits?.length) return { match: false, confidence: 0 };

  const hints = (entity.metadata?.["_csharpHints"] ?? entity.metadata?.["csharpHints"]) as
    | { syncOverAsyncCount?: number }
    | undefined;
  if (!hints || !hints.syncOverAsyncCount || hints.syncOverAsyncCount < 1) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.85,
    matchedCriteria: [`awaits=${cf.awaits.length}`, `sync-over-async=${hints.syncOverAsyncCount}`],
  };
}

/**
 * Large try block: try wrapping too many statements (should be focused)
 */
export function checkLargeTryBlock(entity: Entity): CustomDetectorResult {
  const cf = getCf(entity);
  if (!cf?.exceptions?.length) return { match: false, confidence: 0 };

  // Heuristic: if entity LOC is high and has exceptions, check embeddingText
  const content = ((entity.embeddingText ?? "") as string).slice(0, 8000);
  const lines = content.split("\n");

  // Find try blocks and count lines until matching catch
  let maxTryLines = 0;
  let tryStart = -1;
  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimStart();
    if (/^try\b/.test(trimmed)) {
      tryStart = i;
      braceDepth = 0;
    }
    if (tryStart >= 0) {
      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth <= 0 && tryStart >= 0) {
        maxTryLines = Math.max(maxTryLines, i - tryStart);
        tryStart = -1;
      }
    }
  }

  if (maxTryLines < 20) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: Math.min(0.5 + (maxTryLines - 20) * 0.02, 0.85),
    matchedCriteria: [`try-block-lines=${maxTryLines}`],
  };
}

/**
 * Regex without timeout: new Regex() without RegexOptions containing timeout
 * Pre-filters via calls metadata to avoid scanning all methods' embeddingText
 */
export function checkRegexNoTimeout(entity: Entity): CustomDetectorResult {
  // Pre-filter: check if calls mention Regex-related patterns
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  const hasRegexCall = calls.some((c) => {
    const t = c.target ?? "";
    const n = c.name ?? "";
    return t === "Regex" || n === "IsMatch" || n === "Match" || n === "Replace" || n === "Matches";
  });

  // If no regex calls in metadata, do a quick keyword check
  if (!hasRegexCall) {
    const content = ((entity.embeddingText ?? "") as string).slice(0, 2000);
    if (!content.includes("new Regex")) return { match: false, confidence: 0 };
  }

  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  // Count new Regex() line by line to avoid global regex on large text
  const lines = content.split("\n");
  let regexCount = 0;
  let hasTimeout = false;
  for (const line of lines) {
    if (/new\s+Regex\s*\(/.test(line)) regexCount++;
    if (/MatchTimeout|TimeSpan/.test(line)) hasTimeout = true;
  }

  if (regexCount === 0) return { match: false, confidence: 0 };
  if (hasTimeout) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: [`regex-without-timeout=${regexCount}`],
  };
}

/**
 * Hardcoded connection string: connection string embedded in code
 * Uses line-by-line approach to avoid dangerous unbounded regex on large text
 */
export function checkHardcodedConnection(entity: Entity): CustomDetectorResult {
  // Allow in configuration/setup files
  const filePath = entity.filePath?.toLowerCase() ?? "";
  if (/appsettings|config|\.json|migration|seed/i.test(filePath)) return { match: false, confidence: 0 };

  const content = ((entity.embeddingText ?? "") as string).slice(0, 4000);
  // Quick keyword check before scanning lines
  const cl = content.toLowerCase();
  if (
    !(
      cl.includes("server") ||
      cl.includes("data source") ||
      cl.includes("mongodb") ||
      (cl.includes("host") && cl.includes("port"))
    )
  ) {
    return { match: false, confidence: 0 };
  }

  // Line-by-line approach with bounded patterns to avoid backtracking
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.length > 500) continue; // skip overly long lines
    // Check for connection string keywords within string literals
    if (/Server\s*=/i.test(line) && /Database\s*=/i.test(line) && /["']/i.test(line)) {
      return { match: true, confidence: 0.8, matchedCriteria: ["hardcoded-connection-string:server"] };
    }
    if (/["']Data Source\s*=[^"']{1,200}["']/i.test(line)) {
      return { match: true, confidence: 0.8, matchedCriteria: ["hardcoded-connection-string:datasource"] };
    }
    if (/["']mongodb(\+srv)?:\/\/[^"']{1,200}["']/i.test(line)) {
      return { match: true, confidence: 0.8, matchedCriteria: ["hardcoded-connection-string:mongodb"] };
    }
    if (/Host\s*=/i.test(line) && /Port\s*=/i.test(line) && /["']/i.test(line)) {
      return { match: true, confidence: 0.8, matchedCriteria: ["hardcoded-connection-string:host"] };
    }
  }

  return { match: false, confidence: 0 };
}
