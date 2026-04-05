/**
 * Hypothesis Catalogs — Framework pattern definitions
 *
 * Register/dispatch pairs and callback entries for Tier 1 and Tier 2
 * hypothesis inference. Ported from ultracode.zig/src/hypothesis/catalogs.zig
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RegisterDispatchPair {
  register: string;
  dispatch?: string | undefined;
  keyArgPos: number;
  handlerArgPos: number;
  confidence: number;
  relType: string;
  languages: string[]; // empty = all languages
  decoratorOnNextFn: boolean;
}

export interface CallbackEntry {
  fnName: string;
  argPos: number;
  confidence: number;
  relType: string;
  languages: string[]; // empty = all
}

// =============================================================================
// REGISTER/DISPATCH PAIRS (Tier 1)
// =============================================================================

export const REGISTER_DISPATCH_PAIRS: RegisterDispatchPair[] = [
  // JS/TS: EventEmitter
  {
    register: "on",
    dispatch: "emit",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.9,
    relType: "dispatches_action",
    languages: ["typescript", "javascript"],
    decoratorOnNextFn: false,
  },
  {
    register: "addEventListener",
    dispatch: "dispatchEvent",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.9,
    relType: "dispatches_action",
    languages: ["typescript", "javascript"],
    decoratorOnNextFn: false,
  },
  {
    register: "once",
    dispatch: "emit",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.85,
    relType: "dispatches_action",
    languages: ["typescript", "javascript"],
    decoratorOnNextFn: false,
  },
  {
    register: "addListener",
    dispatch: "emit",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.85,
    relType: "dispatches_action",
    languages: ["typescript", "javascript"],
    decoratorOnNextFn: false,
  },
  // Pub/Sub
  {
    register: "subscribe",
    dispatch: "publish",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.85,
    relType: "dispatches_action",
    languages: [],
    decoratorOnNextFn: false,
  },
  // Redux
  {
    register: "dispatch",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.8,
    relType: "dispatches_action",
    languages: ["typescript", "javascript"],
    decoratorOnNextFn: false,
  },
  // Go HTTP
  {
    register: "HandleFunc",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["go"],
    decoratorOnNextFn: false,
  },
  {
    register: "Handle",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["go"],
    decoratorOnNextFn: false,
  },
  // Python Django signals
  {
    register: "connect",
    dispatch: "send",
    keyArgPos: 0,
    handlerArgPos: 1,
    confidence: 0.8,
    relType: "dispatches_action",
    languages: ["python"],
    decoratorOnNextFn: false,
  },
  // Flask/FastAPI decorators
  {
    register: "@route",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["python"],
    decoratorOnNextFn: true,
  },
  {
    register: "@get",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["python"],
    decoratorOnNextFn: true,
  },
  {
    register: "@post",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["python"],
    decoratorOnNextFn: true,
  },
  {
    register: "@put",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["python"],
    decoratorOnNextFn: true,
  },
  {
    register: "@delete",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.9,
    relType: "handles_action",
    languages: ["python"],
    decoratorOnNextFn: true,
  },
  // Spring annotations
  {
    register: "@RequestMapping",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["java", "kotlin"],
    decoratorOnNextFn: true,
  },
  {
    register: "@GetMapping",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["java", "kotlin"],
    decoratorOnNextFn: true,
  },
  {
    register: "@PostMapping",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["java", "kotlin"],
    decoratorOnNextFn: true,
  },
  // NestJS decorators
  {
    register: "@Get",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["typescript"],
    decoratorOnNextFn: true,
  },
  {
    register: "@Post",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["typescript"],
    decoratorOnNextFn: true,
  },
  {
    register: "@Put",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["typescript"],
    decoratorOnNextFn: true,
  },
  {
    register: "@Delete",
    dispatch: undefined,
    keyArgPos: 0,
    handlerArgPos: -1,
    confidence: 0.85,
    relType: "handles_action",
    languages: ["typescript"],
    decoratorOnNextFn: true,
  },
  // Bash trap
  {
    register: "trap",
    dispatch: undefined,
    keyArgPos: 1,
    handlerArgPos: 0,
    confidence: 0.75,
    relType: "handles_action",
    languages: ["bash"],
    decoratorOnNextFn: false,
  },
];

// =============================================================================
// CALLBACK ENTRIES (Tier 2)
// =============================================================================

export const CALLBACK_ENTRIES: CallbackEntry[] = [
  // Timers
  { fnName: "setTimeout", argPos: 0, confidence: 0.8, relType: "calls", languages: ["typescript", "javascript"] },
  { fnName: "setInterval", argPos: 0, confidence: 0.8, relType: "calls", languages: ["typescript", "javascript"] },
  { fnName: "setImmediate", argPos: 0, confidence: 0.8, relType: "calls", languages: ["typescript", "javascript"] },
  {
    fnName: "requestAnimationFrame",
    argPos: 0,
    confidence: 0.75,
    relType: "calls",
    languages: ["typescript", "javascript"],
  },
  // Promise
  { fnName: "then", argPos: 0, confidence: 0.65, relType: "calls", languages: ["typescript", "javascript"] },
  { fnName: "catch", argPos: 0, confidence: 0.65, relType: "calls", languages: ["typescript", "javascript"] },
  { fnName: "finally", argPos: 0, confidence: 0.65, relType: "calls", languages: ["typescript", "javascript"] },
  // Array HOFs
  { fnName: "map", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "filter", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "forEach", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "reduce", argPos: 0, confidence: 0.65, relType: "calls", languages: [] },
  { fnName: "find", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "some", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "every", argPos: 0, confidence: 0.7, relType: "calls", languages: [] },
  { fnName: "flatMap", argPos: 0, confidence: 0.65, relType: "calls", languages: [] },
  { fnName: "sort", argPos: 0, confidence: 0.65, relType: "calls", languages: [] },
  // Middleware
  { fnName: "use", argPos: 0, confidence: 0.7, relType: "calls", languages: ["typescript", "javascript"] },
  // Python threading
  { fnName: "Thread", argPos: 0, confidence: 0.75, relType: "calls", languages: ["python"] },
  // Rust async
  { fnName: "spawn", argPos: 0, confidence: 0.7, relType: "calls", languages: ["rust"] },
  { fnName: "spawn_blocking", argPos: 0, confidence: 0.7, relType: "calls", languages: ["rust"] },
  // Kotlin coroutines
  { fnName: "launch", argPos: 0, confidence: 0.65, relType: "calls", languages: ["kotlin"] },
  { fnName: "async", argPos: 0, confidence: 0.65, relType: "calls", languages: ["kotlin"] },
  // Java concurrency
  { fnName: "submit", argPos: 0, confidence: 0.7, relType: "calls", languages: ["java"] },
  { fnName: "execute", argPos: 0, confidence: 0.7, relType: "calls", languages: ["java"] },
  { fnName: "supplyAsync", argPos: 0, confidence: 0.7, relType: "calls", languages: ["java"] },
];

// =============================================================================
// LOOKUP FUNCTIONS
// =============================================================================

function matchesLanguage(entry: { languages: string[] }, language?: string): boolean {
  if (entry.languages.length === 0) return true; // empty = all
  if (!language) return true;
  return entry.languages.includes(language);
}

/** Find register pair by register method name */
export function findRegisterPair(fnName: string, language?: string): RegisterDispatchPair | null {
  return REGISTER_DISPATCH_PAIRS.find((p) => p.register === fnName && matchesLanguage(p, language)) ?? null;
}

/** Find register pair by dispatch method name */
export function findDispatchPair(fnName: string, language?: string): RegisterDispatchPair | null {
  return REGISTER_DISPATCH_PAIRS.find((p) => p.dispatch === fnName && matchesLanguage(p, language)) ?? null;
}

/** Find callback entry by function name */
export function findCallbackEntry(fnName: string, language?: string): CallbackEntry | null {
  return CALLBACK_ENTRIES.find((e) => e.fnName === fnName && matchesLanguage(e, language)) ?? null;
}
