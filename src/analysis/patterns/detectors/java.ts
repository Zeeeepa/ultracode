/**
 * Java/Kotlin-specific Custom Detectors
 *
 * Memory leak detectors (from Habr article analysis):
 * - checkStaticCollectionLeak: static List/Map/Set with add() but no remove()/clear()
 * - checkThreadLocalLeak: ThreadLocal.set() without finally { remove() }
 * - checkUnboundedCache: HashMap cache without eviction policy
 * - checkListenerLeak: addListener/addObserver without removeListener
 * - checkUnclosedResource: new FileReader/Connection without try-with-resources
 * - checkInnerClassReferenceLeak: non-static inner class with Runnable/Thread holding outer ref
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

// ─── Memory Leak Detectors ──────────────────────────────────────────

/**
 * Static collection with add/put but no remove/clear — unbounded memory growth.
 * Ported from C# checkStaticCollectionLeak, adapted for Java API names.
 *
 * Checks methods in the same file: if ANY method calls remove()/clear() on the
 * same collection type, the class likely manages the lifecycle properly.
 */
export function checkStaticCollectionLeak(entity: Entity, allEntities?: Entity[]): CustomDetectorResult {
  if (entity.type !== "method") return { match: false, confidence: 0 };

  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;

  // Java collection add methods
  const addCalls = calls.filter((c) =>
    /^(add|addAll|put|putAll|putIfAbsent|offer|push|addFirst|addLast|addElement)$/.test(c.name ?? ""),
  );
  if (addCalls.length === 0) return { match: false, confidence: 0 };

  // Check if add targets look like static fields (UPPER_CASE or static-looking names)
  const addTargets = addCalls.map((c) => c.target ?? "").filter(Boolean);
  if (addTargets.length === 0) return { match: false, confidence: 0 };

  // Check for cleanup calls in this method
  const removeCalls = calls.filter((c) =>
    /^(remove|removeAll|removeIf|clear|poll|pollFirst|pollLast|pop|take|drainTo)$/.test(c.name ?? ""),
  );

  // Also check sibling methods in the same file — cleanup may happen elsewhere
  if (allEntities) {
    const sameFile = allEntities.filter(
      (e) => e.filePath === entity.filePath && e.type === "method" && e.id !== entity.id,
    );
    for (const other of sameFile) {
      const otherCalls = (other.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
      const otherRemoves = otherCalls.filter((c) =>
        /^(remove|removeAll|removeIf|clear|poll|pollFirst|pollLast|pop|take|drainTo)$/.test(c.name ?? ""),
      );
      removeCalls.push(...otherRemoves);
    }
  }

  if (removeCalls.length > 0) return { match: false, confidence: 0 };

  // Higher confidence when the entity's class has static modifiers visible
  const mods = entity.metadata?.modifiers ?? [];
  const isStatic = mods.includes("static");

  return {
    match: true,
    confidence: isStatic ? 0.8 : 0.65,
    matchedCriteria: [`add-calls=${addCalls.length}`, "no-remove-or-clear", ...(isStatic ? ["static-context"] : [])],
  };
}

/**
 * ThreadLocal.set() without finally { remove() } — leaks in thread pools.
 *
 * In thread pools (ExecutorService, @Async, Servlet containers), threads are reused.
 * ThreadLocal values survive across requests if not explicitly removed, causing:
 * - Memory leaks (values accumulate per reused thread)
 * - Data leaks (previous request's user context bleeds into next request)
 */
export function checkThreadLocalLeak(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method" && entity.type !== "function") return { match: false, confidence: 0 };

  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;

  // Look for ThreadLocal.set() calls
  const setCalls = calls.filter(
    (c) =>
      c.name === "set" &&
      (c.target?.includes("ThreadLocal") || c.target?.includes("threadLocal") || c.target?.includes("THREAD_LOCAL")),
  );
  if (setCalls.length === 0) return { match: false, confidence: 0 };

  // Look for ThreadLocal.remove() in the same method
  const removeCalls = calls.filter(
    (c) =>
      c.name === "remove" &&
      (c.target?.includes("ThreadLocal") || c.target?.includes("threadLocal") || c.target?.includes("THREAD_LOCAL")),
  );

  if (removeCalls.length > 0) return { match: false, confidence: 0 };

  // Check if there's a finally block (heuristic: hasExceptions in controlFlow)
  const cf = entity.metadata?.["controlFlow"] as { exceptions?: Array<unknown> } | undefined;
  const hasTryCatch = (cf?.exceptions?.length ?? 0) > 0;

  // Even with try-catch, if no remove() call exists, it's still a leak
  return {
    match: true,
    confidence: hasTryCatch ? 0.7 : 0.9,
    matchedCriteria: [
      `threadlocal-set=${setCalls.length}`,
      "no-remove",
      hasTryCatch ? "has-try-but-no-remove" : "no-finally-block",
    ],
  };
}

/**
 * HashMap/ConcurrentHashMap used as cache without eviction policy.
 *
 * Detects the classic pattern:
 *   if (!cache.containsKey(key)) { cache.put(key, compute(key)); }
 * without any size limit, TTL, or cleanup mechanism.
 *
 * Not flagged if: Guava Cache, Caffeine, @Cacheable, or bounded collection is used.
 */
export function checkUnboundedCache(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method" && entity.type !== "function") return { match: false, confidence: 0 };

  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;

  // Look for put/putIfAbsent + containsKey/get pattern (cache-like access)
  const putCalls = calls.filter((c) => /^(put|putIfAbsent|computeIfAbsent)$/.test(c.name ?? ""));
  const getCalls = calls.filter((c) => /^(get|containsKey|getOrDefault)$/.test(c.name ?? ""));

  if (putCalls.length === 0 || getCalls.length === 0) return { match: false, confidence: 0 };

  // Exclude if there's eviction/cleanup
  const hasEviction = calls.some((c) =>
    /^(remove|removeIf|clear|invalidate|invalidateAll|evict|expire|cleanUp|maximumSize|expireAfter)$/.test(
      c.name ?? "",
    ),
  );
  if (hasEviction) return { match: false, confidence: 0 };

  // Exclude if using proper cache libraries (target contains Cache/CacheBuilder/Caffeine)
  const usesProperCache = calls.some((c) =>
    /Cache|CacheBuilder|Caffeine|CacheManager|Cacheable|Ehcache|Hazelcast/.test(c.target ?? ""),
  );
  if (usesProperCache) return { match: false, confidence: 0 };

  // Check source text for @Cacheable annotation
  const content = ((entity.metadata?.["embeddingText"] ?? "") as string).slice(0, 4000);
  if (/@Cacheable|@CacheEvict|@CachePut/.test(content)) return { match: false, confidence: 0 };

  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: [`put-calls=${putCalls.length}`, `get-calls=${getCalls.length}`, "no-eviction-policy"],
  };
}

/**
 * Listener/observer registered without corresponding unregistration.
 * Ported from TS checkEventListenerLeak, adapted for Java/Swing/Spring APIs.
 *
 * Java APIs: addActionListener, addMouseListener, addPropertyChangeListener,
 *            addObserver, subscribe, register, addHandler
 *
 * Excludes: bounded-lifetime objects where listener dies with the object.
 */
const JAVA_ADD_LISTENER = /^(add\w*Listener|addObserver|subscribe|register\w*Handler|addHandler|addCallback)$/;
const JAVA_REMOVE_LISTENER =
  /^(remove\w*Listener|removeObserver|unsubscribe|unregister\w*Handler|removeHandler|removeCallback|dispose|close)$/;

export function checkListenerLeak(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method" && entity.type !== "function") return { match: false, confidence: 0 };

  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string; target?: string }>;
  if (!calls.length) return { match: false, confidence: 0 };

  const callNames = calls.map((c) => c.name ?? "");
  const hasAdd = callNames.some((n) => JAVA_ADD_LISTENER.test(n));
  const hasRemove = callNames.some((n) => JAVA_REMOVE_LISTENER.test(n));

  if (!hasAdd || hasRemove) return { match: false, confidence: 0 };

  // Count how many distinct add*Listener calls — more = higher confidence
  const addCount = callNames.filter((n) => JAVA_ADD_LISTENER.test(n)).length;

  // Check if there's a close/destroy/dispose/onDestroy method hint
  const content = ((entity.metadata?.["embeddingText"] ?? "") as string).slice(0, 4000);
  const hasLifecycleCleanup = /\b(onDestroy|dispose|close|shutdown|cleanup|tearDown|@PreDestroy)\b/.test(content);

  return {
    match: true,
    confidence: hasLifecycleCleanup ? 0.55 : addCount > 1 ? 0.85 : 0.7,
    matchedCriteria: [
      `add-listener-calls=${addCount}`,
      "no-remove-listener",
      ...(hasLifecycleCleanup ? ["has-lifecycle-but-no-unregister"] : []),
    ],
  };
}

/**
 * Resource created with new (FileReader, Connection, Socket, etc.) without
 * try-with-resources or explicit close() in finally.
 *
 * Anti-pattern complement to java:proper-resource-handling (best-pattern).
 * Ported from C# hasNewDisposableNoUsing, adapted for Java AutoCloseable types.
 */
const JAVA_CLOSEABLE_TYPES =
  /\bnew\s+(FileReader|BufferedReader|FileWriter|BufferedWriter|FileInputStream|FileOutputStream|InputStreamReader|OutputStreamWriter|PrintWriter|Scanner|Socket|ServerSocket|DatagramSocket|HttpURLConnection|Connection|PreparedStatement|Statement|ResultSet|ObjectInputStream|ObjectOutputStream|RandomAccessFile|ZipInputStream|ZipOutputStream|GZIPInputStream|GZIPOutputStream|Cipher|JarFile)\s*\(/;

export function checkUnclosedResource(entity: Entity): CustomDetectorResult {
  if (entity.type !== "method" && entity.type !== "function") return { match: false, confidence: 0 };

  const content = ((entity.metadata?.["embeddingText"] ?? "") as string).slice(0, 8000);
  if (!content) return { match: false, confidence: 0 };

  // Find new AutoCloseable instantiations
  const matches = content.match(new RegExp(JAVA_CLOSEABLE_TYPES.source, "g"));
  if (!matches || matches.length === 0) return { match: false, confidence: 0 };

  // Check if wrapped in try-with-resources: "try (" pattern before the new
  const hasTryWithResources = /\btry\s*\(/.test(content);

  // Check for explicit .close() call
  const calls = (entity.metadata?.["calls"] ?? []) as Array<{ name?: string }>;
  const hasCloseCall = calls.some((c) => c.name === "close");

  // Check for finally block with close
  const hasFinallyClose = /finally\s*\{[^}]*\.close\s*\(\s*\)/.test(content);

  if (hasTryWithResources || hasCloseCall || hasFinallyClose) return { match: false, confidence: 0 };

  // Extract resource type names for the report
  const resourceTypes = matches.map((m) => m.replace(/\bnew\s+/, "").replace(/\s*\($/, ""));
  const uniqueTypes = [...new Set(resourceTypes)];

  return {
    match: true,
    confidence: uniqueTypes.length > 1 ? 0.9 : 0.8,
    matchedCriteria: [`unclosed-resources=${uniqueTypes.join(",")}`, "no-try-with-resources", "no-close-call"],
  };
}

/**
 * Non-static inner class implementing Runnable/Thread/Callable holds implicit
 * reference to outer class instance, preventing its garbage collection.
 *
 * Especially dangerous when the inner class runs an infinite loop (daemon thread),
 * because the outer object will NEVER be collected.
 *
 * Detection heuristic (AST-based):
 * - Class entity without `static` modifier
 * - Implements Runnable, extends Thread, or implements Callable
 * - Bonus: contains infinite loop pattern (while(true), for(;;))
 */
export function checkInnerClassReferenceLeak(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return { match: false, confidence: 0 };

  const mods = entity.metadata?.modifiers ?? [];

  // Static inner classes don't hold outer reference — safe
  if (mods.includes("static")) return { match: false, confidence: 0 };

  // Check if it's an inner class: non-top-level indicator
  // Heuristic: class name contains $ (compiled inner class) or is detected as nested
  const name = entity.name ?? "";
  const parentType = entity.metadata?.["parentType"] as string | undefined;
  const isInner =
    name.includes("$") ||
    name.includes(".") ||
    parentType === "class" ||
    (entity.metadata?.["isInnerClass"] as boolean | undefined) === true;

  // Also check embeddingText for inner class patterns
  const content = ((entity.metadata?.["embeddingText"] ?? "") as string).slice(0, 4000);
  const isAnonymousOrInner = isInner || /\bclass\s+\w+\s+(?:extends|implements)\b/.test(content);

  if (!isAnonymousOrInner) return { match: false, confidence: 0 };

  // Check if implements Runnable/Thread/Callable/TimerTask
  const extendsInfo = (entity.metadata?.["extends"] ?? entity.metadata?.["superClass"] ?? "") as string;
  const implementsInfo = (entity.metadata?.["implements"] ?? "") as string;
  const allSuper = `${extendsInfo} ${implementsInfo}`.toLowerCase();

  const isLongLived =
    /runnable|thread|callable|timertask|swingworker/.test(allSuper) ||
    /\b(implements\s+Runnable|extends\s+Thread|implements\s+Callable|extends\s+TimerTask)\b/.test(content);

  if (!isLongLived) return { match: false, confidence: 0 };

  // Check for infinite loop — makes the leak permanent
  const hasInfiniteLoop = /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.test(content);

  // Check if there's a shutdown mechanism (volatile flag, interrupt check)
  const hasShutdownMechanism = /\bvolatile\b|\bisInterrupted\s*\(\s*\)|\bThread\.interrupted\s*\(\s*\)/.test(content);

  const matched: string[] = ["non-static-inner-class", "implements-runnable-or-thread"];
  if (hasInfiniteLoop) matched.push("infinite-loop");
  if (!hasShutdownMechanism && hasInfiniteLoop) matched.push("no-shutdown-mechanism");

  return {
    match: true,
    confidence: hasInfiniteLoop && !hasShutdownMechanism ? 0.9 : hasInfiniteLoop ? 0.7 : 0.6,
    matchedCriteria: matched,
  };
}
