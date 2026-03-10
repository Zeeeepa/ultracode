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

// ─── Helpers ────────────────────────────────────────────────────────

type CallInfo = { name: string; kwargs?: Record<string, string> };

/** Safe code snippet for regex (avoids JSC stack overflow) */
function safeCode(entity: Entity): string {
  return entity.embeddingText?.slice(0, 8000) ?? "";
}

/** Extract calls from entity metadata */
function getCalls(entity: Entity): CallInfo[] {
  return (entity.metadata?.["calls"] as CallInfo[] | undefined) ?? [];
}

/** Check if any call matches a pattern and optionally a kwarg condition */
function hasCallWith(
  calls: CallInfo[],
  nameRe: RegExp,
  kwarg?: { key: string; value?: string | RegExp; absent?: boolean },
): CallInfo | undefined {
  for (const c of calls) {
    if (!nameRe.test(c.name)) continue;
    if (!kwarg) return c;
    const val = c.kwargs?.[kwarg.key];
    if (kwarg.absent) {
      if (val === undefined) return c;
    } else if (kwarg.value) {
      if (val !== undefined && (typeof kwarg.value === "string" ? val === kwarg.value : kwarg.value.test(val)))
        return c;
    } else {
      return c; // just check name match
    }
  }
  return undefined;
}

const NO_MATCH: CustomDetectorResult = { match: false, confidence: 0 };

// ─── Pandas Detectors ───────────────────────────────────────────────

/**
 * Chained indexing: df["a"]["b"] = value — causes SettingWithCopyWarning
 */
export function checkPdChainedIndexing(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const re = /\w+\[.+?\]\[.+?\]\s*=/g;
  const matches = code.match(re);
  if (!matches) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.6 + matches.length * 0.1, 0.95),
    matchedCriteria: [`chained-indexing-assignments:${matches.length}`],
  };
}

/**
 * inplace=True — returns None, breaks chaining, causes silent bugs
 */
export function checkPdInplaceTrue(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const matched = calls.filter((c) => c.kwargs?.["inplace"] === "True");
  if (matched.length === 0) return NO_MATCH;
  return {
    match: true,
    confidence: 0.9,
    matchedCriteria: matched.map((c) => `inplace-true:${c.name}`),
  };
}

/**
 * Missing .copy() on DataFrame slice — SettingWithCopyWarning
 */
export function checkPdMissingCopy(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  // Pattern: df_new = df[condition] without .copy()
  const re = /(\w+)\s*=\s*(\w+)\[.+?\](?!\s*\.copy\(\))/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    // Skip if same var (self-assignment) or if it's just indexing for read
    if (m[1] !== m[2]) count++;
  }
  if (count === 0) return NO_MATCH;
  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: [`slice-without-copy:${count}`],
  };
}

/**
 * NaN comparison: == None, == np.nan, == float('nan') — always False
 */
export function checkPdNanComparison(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const re = /==\s*(?:None|np\.nan|float\(['"]nan['"]\)|NaN)/g;
  const matches = code.match(re);
  if (!matches) return NO_MATCH;
  return {
    match: true,
    confidence: 0.95,
    matchedCriteria: [`nan-comparison:${matches.length}`],
  };
}

/**
 * read_csv without dtype — auto-inference is slow and lossy
 */
export function checkPdCsvNoDtype(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const match = hasCallWith(calls, /read_csv$/, { key: "dtype", absent: true });
  if (!match) return NO_MATCH;
  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["read_csv-no-dtype"],
  };
}

// ─── NumPy Detectors ────────────────────────────────────────────────

/**
 * NumPy array access in Python loop — use vectorized ops instead
 */
export function checkNpLoop(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  // range(len(arr)) + arr[i] pattern in a for loop
  const hasRangeLen = /for\s+\w+\s+in\s+range\s*\(\s*len\s*\(/.test(code);
  const hasArrayIndex = /\w+\[\s*\w+\s*\]/.test(code);
  if (!hasRangeLen || !hasArrayIndex) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["numpy-loop-with-index"],
  };
}

/**
 * Float equality comparison: arr == 0.1 — use np.isclose or np.allclose
 */
export function checkNpFloatCmp(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  // np array == float literal (not integer)
  const re = /==\s*\d+\.\d+/g;
  const matches = code.match(re);
  if (!matches) return NO_MATCH;
  // Only flag if numpy is likely used
  const calls = getCalls(entity);
  const usesNp = calls.some((c) => /^np\./.test(c.name)) || /import\s+numpy/.test(code);
  if (!usesNp) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: [`float-equality:${matches.length}`],
  };
}

// ─── Scikit-learn Detectors ─────────────────────────────────────────

/**
 * Data leakage: fit_transform on full dataset before train_test_split
 */
export function checkSkDataLeakage(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const fitTransformIdx = code.indexOf("fit_transform");
  const splitIdx = code.indexOf("train_test_split");
  if (fitTransformIdx === -1 || splitIdx === -1) return NO_MATCH;
  if (fitTransformIdx < splitIdx) {
    return {
      match: true,
      confidence: 0.85,
      matchedCriteria: ["fit_transform-before-split"],
    };
  }
  return NO_MATCH;
}

/**
 * Missing Pipeline: sequence of fit_transform without Pipeline
 */
export function checkSkNoPipeline(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const fitTransformCount = (code.match(/\.fit_transform\s*\(/g) || []).length;
  if (fitTransformCount < 2) return NO_MATCH;
  if (/Pipeline|make_pipeline/.test(code)) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: [`sequential-fit_transform:${fitTransformCount}`],
  };
}

/**
 * sklearn calls without random_state — non-reproducible results
 */
export function checkSkNoRandomState(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const skCalls = calls.filter((c) =>
    /(?:RandomForest|GradientBoosting|SVM|KMeans|train_test_split|KFold|StratifiedKFold|cross_val_score)/.test(c.name),
  );
  const noSeed = skCalls.filter((c) => !c.kwargs?.["random_state"]);
  if (noSeed.length === 0) return NO_MATCH;
  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: noSeed.map((c) => `no-random-state:${c.name}`),
  };
}

/**
 * CV leakage: fit_transform before cross_val_score
 */
export function checkSkCvLeakage(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const fitIdx = code.indexOf("fit_transform");
  const cvIdx = code.indexOf("cross_val_score");
  if (fitIdx === -1 || cvIdx === -1) return NO_MATCH;
  if (fitIdx < cvIdx) {
    return {
      match: true,
      confidence: 0.85,
      matchedCriteria: ["fit_transform-before-cv"],
    };
  }
  return NO_MATCH;
}

// ─── Matplotlib Detectors ───────────────────────────────────────────

/**
 * plt.subplots in loop without plt.close — memory leak
 */
export function checkPltNoClose(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const cf = entity.metadata?.["controlFlow"] as { loops?: unknown[] } | undefined;
  if (!cf?.loops?.length) return NO_MATCH;
  const hasSubplots = /(?:plt\.subplots|plt\.figure)\s*\(/.test(code);
  const hasClose = /plt\.close\s*\(/.test(code);
  if (!hasSubplots || hasClose) return NO_MATCH;
  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: ["subplots-in-loop-no-close"],
  };
}

/**
 * Mixing plt.* (stateful) and ax.* (OO) APIs — confusion and bugs
 */
export function checkPltStateConfusion(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  const usesPlt = /plt\.(?:title|xlabel|ylabel|xlim|ylim|legend)\s*\(/.test(code);
  const usesAx = /ax\.(?:set_title|set_xlabel|set_ylabel|set_xlim|set_ylim|legend)\s*\(/.test(code);
  if (!usesPlt || !usesAx) return NO_MATCH;
  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: ["mixed-plt-ax-api"],
  };
}

// ─── Security Detectors ─────────────────────────────────────────────

/**
 * subprocess with shell=True — command injection risk
 */
export function checkSubprocessShell(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const match = hasCallWith(calls, /subprocess\.(?:run|call|Popen|check_output|check_call)/, {
    key: "shell",
    value: "True",
  });
  if (!match) return NO_MATCH;
  return {
    match: true,
    confidence: 0.95,
    matchedCriteria: [`shell-true:${match.name}`],
  };
}

/**
 * SQL injection: f-string or .format() with SQL keywords
 */
export function checkSqlInjection(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  // f-string with SQL keywords
  const fstringSql = /f["'](?:[^"']*?)(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|WHERE)\b/i.test(code);
  // .format() with SQL keywords
  const formatSql =
    /["'](?:[^"']*?)(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|WHERE)\b[^"']*?["']\s*\.format\s*\(/i.test(code);
  if (!fstringSql && !formatSql) return NO_MATCH;
  return {
    match: true,
    confidence: 0.9,
    matchedCriteria: [fstringSql ? "f-string-sql" : "format-sql"],
  };
}

/**
 * open() without encoding — platform-dependent behavior
 */
export function checkOpenNoEncoding(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const match = hasCallWith(calls, /^open$/, { key: "encoding", absent: true });
  if (!match) return NO_MATCH;
  // Exclude binary modes
  const mode = match.kwargs?.["mode"];
  if (mode && /b/.test(mode)) return NO_MATCH;
  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: ["open-no-encoding"],
  };
}

// ─── API Design Detectors ───────────────────────────────────────────

/**
 * Too many positional args (>5) without keyword-only separator (*)
 */
export function checkManyPosArgs(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const params = (entity.metadata?.parameters ?? []) as Array<{
    name: string;
    optional?: boolean;
    defaultValue?: string;
  }>;
  // Exclude self/cls
  const posParams = params.filter((p) => p.name !== "self" && p.name !== "cls" && !p.name.startsWith("*"));
  if (posParams.length <= 5) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: [`positional-args:${posParams.length}`],
  };
}

/**
 * Boolean trap: boolean positional parameters — confusing at call site
 */
export function checkBoolTrap(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const params = (entity.metadata?.parameters ?? []) as Array<{
    name: string;
    type?: string;
    defaultValue?: string;
  }>;
  const boolParams = params.filter(
    (p) =>
      p.name !== "self" &&
      p.name !== "cls" &&
      (p.type === "bool" || p.defaultValue === "True" || p.defaultValue === "False"),
  );
  if (boolParams.length < 2) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: boolParams.map((p) => `bool-param:${p.name}`),
  };
}

// ─── Reproducibility Detectors ──────────────────────────────────────

/**
 * random/numpy random usage without seed setting
 */
export function checkNoSeed(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const randomCalls = calls.filter((c) =>
    /(?:random\.(?:random|randint|choice|shuffle|sample)|np\.random\.(?:rand|randn|randint|choice|shuffle|seed))/.test(
      c.name,
    ),
  );
  if (randomCalls.length === 0) return NO_MATCH;
  const hasSeed = calls.some((c) => /(?:random\.seed|np\.random\.seed|np\.random\.default_rng)/.test(c.name));
  if (hasSeed) return NO_MATCH;
  return {
    match: true,
    confidence: 0.65,
    matchedCriteria: randomCalls.map((c) => `no-seed:${c.name}`),
  };
}

// ─── Testing Detectors ──────────────────────────────────────────────

/**
 * Float equality in tests: assertEqual(a, 0.3) — use assertAlmostEqual
 */
export function checkTestFloatEq(entity: Entity): CustomDetectorResult {
  const fp = entity.filePath;
  if (!fp || !/test/i.test(fp)) return NO_MATCH;
  const code = safeCode(entity);
  const re = /(?:assertEqual|assert_equal|assert\s+\w+\s*==\s*\d+\.\d+|==\s*\d+\.\d+)/g;
  const matches = code.match(re);
  if (!matches) return NO_MATCH;
  return {
    match: true,
    confidence: 0.8,
    matchedCriteria: [`float-eq-in-test:${matches.length}`],
  };
}

// ─── Resource & Concurrency Detectors ───────────────────────────────

/**
 * __del__ finalizer — unreliable, GC-dependent
 */
export function checkDelFinalizer(entity: Entity): CustomDetectorResult {
  if (entity.name.endsWith("__del__") || entity.name === "__del__") {
    return {
      match: true,
      confidence: 0.85,
      matchedCriteria: ["del-finalizer"],
    };
  }
  return NO_MATCH;
}

/**
 * ThreadPoolExecutor for CPU-bound work — GIL prevents parallelism
 */
export function checkGilThread(entity: Entity): CustomDetectorResult {
  const code = safeCode(entity);
  if (!/ThreadPoolExecutor/.test(code)) return NO_MATCH;
  // Heuristic: CPU-bound indicators
  const cpuBound = /(?:numpy|np\.|scipy|math\.|for\s+\w+\s+in\s+range)/.test(code);
  if (!cpuBound) return NO_MATCH;
  return {
    match: true,
    confidence: 0.7,
    matchedCriteria: ["thread-pool-cpu-bound"],
  };
}

/**
 * ThreadPoolExecutor without max_workers — unlimited thread creation
 */
export function checkThreadpoolNoMax(entity: Entity): CustomDetectorResult {
  const calls = getCalls(entity);
  const match = hasCallWith(calls, /ThreadPoolExecutor/, { key: "max_workers", absent: true });
  if (!match) return NO_MATCH;
  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: ["threadpool-no-max-workers"],
  };
}

/**
 * asyncio.run() inside async function — RuntimeError
 */
export function checkAsyncioRunInLoop(entity: Entity): CustomDetectorResult {
  const mods = (entity.metadata?.modifiers ?? []) as string[];
  if (!mods.includes("async")) return NO_MATCH;
  const calls = getCalls(entity);
  const match = calls.some((c) => /asyncio\.run/.test(c.name));
  if (!match) return NO_MATCH;
  return {
    match: true,
    confidence: 0.95,
    matchedCriteria: ["asyncio-run-in-async"],
  };
}

// ─── Class-level Detectors (use classMeta) ──────────────────────────

type ClassMeta = {
  hasSlots?: boolean;
  dunderMethods?: string[];
  properties?: Record<string, { hasSetter: boolean }>;
  initCallCount?: number;
  methodCount?: number;
};

function getClassMeta(entity: Entity): ClassMeta | null {
  return (entity.metadata?.["classMeta"] as ClassMeta) ?? null;
}

/**
 * Class missing __slots__ — higher memory per instance
 */
export function checkMissingSlots(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return NO_MATCH;
  const cm = getClassMeta(entity);
  if (!cm) return NO_MATCH;
  if (cm.hasSlots) return NO_MATCH;
  // Only flag classes with several attributes / methods (not tiny helper classes)
  if ((cm.methodCount ?? 0) < 3) return NO_MATCH;
  return {
    match: true,
    confidence: 0.6,
    matchedCriteria: ["class-no-slots"],
  };
}

/**
 * Class missing __repr__ — poor debuggability
 */
export function checkMissingRepr(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return NO_MATCH;
  const cm = getClassMeta(entity);
  if (!cm) return NO_MATCH;
  const dunders = cm.dunderMethods ?? [];
  if (dunders.includes("__repr__")) return NO_MATCH;
  // Only flag non-trivial classes
  if ((cm.methodCount ?? 0) < 2) return NO_MATCH;
  return {
    match: true,
    confidence: 0.55,
    matchedCriteria: ["class-no-repr"],
  };
}

/**
 * @property without @x.setter — immutability confusion
 */
export function checkPropertyNoSetter(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return NO_MATCH;
  const cm = getClassMeta(entity);
  if (!cm?.properties) return NO_MATCH;
  const readOnly = Object.entries(cm.properties).filter(([, v]) => !v.hasSetter);
  if (readOnly.length === 0) return NO_MATCH;
  return {
    match: true,
    confidence: 0.5,
    matchedCriteria: readOnly.map(([name]) => `property-no-setter:${name}`),
  };
}

/**
 * __init__ does too much — complex constructor
 */
export function checkInitTooComplex(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return NO_MATCH;
  const cm = getClassMeta(entity);
  if (!cm || (cm.initCallCount ?? 0) < 10) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.5 + (cm.initCallCount! - 10) * 0.05, 0.9),
    matchedCriteria: [`init-calls:${cm.initCallCount}`],
  };
}

/**
 * God class: too many methods (>20)
 */
export function checkGodClass(entity: Entity): CustomDetectorResult {
  if (entity.type !== "class") return NO_MATCH;
  const cm = getClassMeta(entity);
  if (!cm || (cm.methodCount ?? 0) < 20) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.5 + (cm.methodCount! - 20) * 0.03, 0.9),
    matchedCriteria: [`method-count:${cm.methodCount}`],
  };
}

// ─── Function Complexity Detectors ──────────────────────────────────

interface PyCfExt {
  returnCount: number;
  nestingDepth: number;
  cyclomaticComplexity: number;
  isinstanceCount: number;
  reRaiseDifferentType: boolean;
}

function getPyCfExt(entity: Entity): PyCfExt | null {
  const cf = entity.metadata?.["controlFlow"] as Record<string, unknown> | undefined;
  if (!cf) return null;
  return {
    returnCount: (cf["returnCount"] as number) ?? 0,
    nestingDepth: (cf["nestingDepth"] as number) ?? 0,
    cyclomaticComplexity: (cf["cyclomaticComplexity"] as number) ?? 0,
    isinstanceCount: (cf["isinstanceCount"] as number) ?? 0,
    reRaiseDifferentType: !!cf["reRaiseDifferentType"],
  };
}

/**
 * Too many return statements (>5) — complex control flow
 */
export function checkTooManyReturns(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const cf = getPyCfExt(entity);
  if (!cf || (cf.returnCount ?? 0) <= 5) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.5 + (cf.returnCount! - 5) * 0.1, 0.9),
    matchedCriteria: [`return-count:${cf.returnCount}`],
  };
}

/**
 * Deep nesting (>4 levels) — hard to read/maintain
 */
export function checkDeepNesting(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const cf = getPyCfExt(entity);
  if (!cf || (cf.nestingDepth ?? 0) <= 4) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.6 + (cf.nestingDepth! - 4) * 0.1, 0.95),
    matchedCriteria: [`nesting-depth:${cf.nestingDepth}`],
  };
}

/**
 * High cyclomatic complexity (>10) — too many branches
 */
export function checkHighComplexity(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const cf = getPyCfExt(entity);
  if (!cf || (cf.cyclomaticComplexity ?? 0) <= 10) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.5 + (cf.cyclomaticComplexity! - 10) * 0.04, 0.9),
    matchedCriteria: [`cyclomatic:${cf.cyclomaticComplexity}`],
  };
}

/**
 * isinstance chain (>3) — consider match/case or dispatch
 */
export function checkIsinstanceChain(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const cf = getPyCfExt(entity);
  if (!cf || (cf.isinstanceCount ?? 0) <= 3) return NO_MATCH;
  return {
    match: true,
    confidence: Math.min(0.5 + (cf.isinstanceCount! - 3) * 0.1, 0.85),
    matchedCriteria: [`isinstance-count:${cf.isinstanceCount}`],
  };
}

/**
 * Re-raise different exception type — loses original traceback
 */
export function checkReRaiseDifferent(entity: Entity): CustomDetectorResult {
  if (entity.type !== "function" && entity.type !== "method") return NO_MATCH;
  const cf = getPyCfExt(entity);
  if (!cf?.reRaiseDifferentType) return NO_MATCH;
  return {
    match: true,
    confidence: 0.75,
    matchedCriteria: ["re-raise-different-type"],
  };
}
