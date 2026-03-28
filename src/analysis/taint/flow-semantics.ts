/**
 * Taint Flow Semantics — ported from ultracode.zig/src/analysis/taint_semantics.zig
 *
 * Defines how taint propagates through known function calls.
 * Each FlowSemantic entry maps a function name to:
 *   - How data flows between arguments and return value
 *   - Whether the function is a source (introduces tainted data)
 *   - Whether it's a sink (dangerous if tainted data reaches it)
 *   - Whether it's a sanitizer (removes taint)
 *
 * Catalog covers: C stdlib, JS string/collection ops, I/O, JSON, sanitizers.
 * Used by taint-flow-analyzer for inter-procedural taint tracking.
 */

// =============================================================================
// Types
// =============================================================================

export interface FlowMapping {
  /** Source: -1 = return value, 0..N = argument index */
  src: number;
  /** Destination: -1 = return value, 0..N = argument index */
  dst: number;
}

export interface FlowSemantic {
  methodName: string;
  mappings: FlowMapping[];
  isSanitizer?: boolean;
  isSource?: boolean;
  isSink?: boolean;
}

// =============================================================================
// Reusable mapping patterns
// =============================================================================

const PASSTHROUGH: FlowMapping[] = [{ src: 0, dst: -1 }];
const CONCAT: FlowMapping[] = [{ src: 0, dst: -1 }, { src: 1, dst: -1 }];
const SOURCE_RET: FlowMapping[] = [{ src: -1, dst: -1 }];
const SINK_0: FlowMapping[] = [{ src: 0, dst: -1 }];
const SINK_01: FlowMapping[] = [{ src: 0, dst: -1 }, { src: 1, dst: -1 }];
const SANITIZER: FlowMapping[] = [{ src: 0, dst: -1 }];
const STRCPY: FlowMapping[] = [{ src: 1, dst: 0 }, { src: 1, dst: -1 }];
const STRCAT: FlowMapping[] = [{ src: 1, dst: 0 }];
const SPRINTF: FlowMapping[] = [{ src: 2, dst: 0 }, { src: 3, dst: 0 }];
const MEMCPY: FlowMapping[] = [{ src: 1, dst: 0 }];
const STRDUP: FlowMapping[] = [{ src: 0, dst: -1 }];

// =============================================================================
// Catalog — 80+ entries matching Zig's taint_semantics.zig
// =============================================================================

export const FLOW_CATALOG: FlowSemantic[] = [
  // ── C stdlib ────────────────────────────────────────────────────────
  { methodName: "strcpy", mappings: STRCPY },
  { methodName: "strncpy", mappings: STRCAT },
  { methodName: "strcat", mappings: STRCAT },
  { methodName: "strncat", mappings: STRCAT },
  { methodName: "sprintf", mappings: SPRINTF },
  { methodName: "snprintf", mappings: SPRINTF },
  { methodName: "memcpy", mappings: MEMCPY },
  { methodName: "memmove", mappings: MEMCPY },
  { methodName: "strdup", mappings: STRDUP },
  { methodName: "strtok", mappings: PASSTHROUGH },
  { methodName: "sscanf", mappings: STRCPY },

  // ── String operations — passthrough ──────────────────────────────
  { methodName: "concat", mappings: CONCAT },
  { methodName: "replace", mappings: PASSTHROUGH },
  { methodName: "split", mappings: PASSTHROUGH },
  { methodName: "trim", mappings: PASSTHROUGH },
  { methodName: "trimStart", mappings: PASSTHROUGH },
  { methodName: "trimEnd", mappings: PASSTHROUGH },
  { methodName: "slice", mappings: PASSTHROUGH },
  { methodName: "substring", mappings: PASSTHROUGH },
  { methodName: "substr", mappings: PASSTHROUGH },
  { methodName: "toLowerCase", mappings: PASSTHROUGH },
  { methodName: "toUpperCase", mappings: PASSTHROUGH },
  { methodName: "toString", mappings: PASSTHROUGH },
  { methodName: "valueOf", mappings: PASSTHROUGH },
  { methodName: "join", mappings: PASSTHROUGH },
  { methodName: "padStart", mappings: PASSTHROUGH },
  { methodName: "padEnd", mappings: PASSTHROUGH },
  { methodName: "repeat", mappings: PASSTHROUGH },
  { methodName: "normalize", mappings: PASSTHROUGH },

  // ── Collection operations — passthrough ──────────────────────────
  { methodName: "map", mappings: PASSTHROUGH },
  { methodName: "filter", mappings: PASSTHROUGH },
  { methodName: "reduce", mappings: PASSTHROUGH },
  { methodName: "flatMap", mappings: PASSTHROUGH },
  { methodName: "flat", mappings: PASSTHROUGH },
  { methodName: "find", mappings: PASSTHROUGH },
  { methodName: "sort", mappings: PASSTHROUGH },
  { methodName: "reverse", mappings: PASSTHROUGH },
  { methodName: "Array.from", mappings: PASSTHROUGH },
  { methodName: "Object.values", mappings: PASSTHROUGH },
  { methodName: "Object.keys", mappings: PASSTHROUGH },
  { methodName: "Object.entries", mappings: PASSTHROUGH },

  // ── JSON — passthrough ───────────────────────────────────────────
  { methodName: "JSON.parse", mappings: PASSTHROUGH },
  { methodName: "JSON.stringify", mappings: PASSTHROUGH },
  { methodName: "json.loads", mappings: PASSTHROUGH },
  { methodName: "json.dumps", mappings: PASSTHROUGH },

  // ── I/O sources ──────────────────────────────────────────────────
  { methodName: "getParameter", mappings: SOURCE_RET, isSource: true },
  { methodName: "readline", mappings: SOURCE_RET, isSource: true },
  { methodName: "readFile", mappings: SOURCE_RET, isSource: true },
  { methodName: "readFileSync", mappings: SOURCE_RET, isSource: true },
  { methodName: "fetch", mappings: SOURCE_RET, isSource: true },
  { methodName: "axios.get", mappings: SOURCE_RET, isSource: true },
  { methodName: "axios.post", mappings: SOURCE_RET, isSource: true },
  { methodName: "http.get", mappings: SOURCE_RET, isSource: true },
  { methodName: "input", mappings: SOURCE_RET, isSource: true },
  { methodName: "recv", mappings: SOURCE_RET, isSource: true },
  { methodName: "read", mappings: SOURCE_RET, isSource: true },
  { methodName: "getenv", mappings: SOURCE_RET, isSource: true },

  // ── I/O sinks ────────────────────────────────────────────────────
  { methodName: "exec", mappings: SINK_0, isSink: true },
  { methodName: "execSync", mappings: SINK_0, isSink: true },
  { methodName: "query", mappings: SINK_01, isSink: true },
  { methodName: "execute", mappings: SINK_01, isSink: true },
  { methodName: "eval", mappings: SINK_0, isSink: true },
  { methodName: "innerHTML", mappings: SINK_0, isSink: true },
  { methodName: "write", mappings: SINK_0, isSink: true },
  { methodName: "send", mappings: SINK_0, isSink: true },
  { methodName: "redirect", mappings: SINK_0, isSink: true },
  { methodName: "render", mappings: SINK_0, isSink: true },
  { methodName: "spawn", mappings: SINK_0, isSink: true },
  { methodName: "os.system", mappings: SINK_0, isSink: true },
  { methodName: "subprocess.run", mappings: SINK_0, isSink: true },
  { methodName: "document.write", mappings: SINK_0, isSink: true },
  { methodName: "rawQuery", mappings: SINK_01, isSink: true },

  // ── Sanitizers ───────────────────────────────────────────────────
  { methodName: "escape", mappings: SANITIZER, isSanitizer: true },
  { methodName: "escapeHtml", mappings: SANITIZER, isSanitizer: true },
  { methodName: "sanitize", mappings: SANITIZER, isSanitizer: true },
  { methodName: "sanitizeInput", mappings: SANITIZER, isSanitizer: true },
  { methodName: "encode", mappings: SANITIZER, isSanitizer: true },
  { methodName: "encodeURI", mappings: SANITIZER, isSanitizer: true },
  { methodName: "encodeURIComponent", mappings: SANITIZER, isSanitizer: true },
  { methodName: "htmlEncode", mappings: SANITIZER, isSanitizer: true },
  { methodName: "htmlspecialchars", mappings: SANITIZER, isSanitizer: true },
  { methodName: "parameterize", mappings: SANITIZER, isSanitizer: true },
  { methodName: "DOMPurify.sanitize", mappings: SANITIZER, isSanitizer: true },
  { methodName: "prepare", mappings: SANITIZER, isSanitizer: true },
  { methodName: "createQueryBuilder", mappings: SANITIZER, isSanitizer: true },
  { methodName: "preparedStatement", mappings: SANITIZER, isSanitizer: true },
  { methodName: "xss", mappings: SANITIZER, isSanitizer: true },
  { methodName: "stripTags", mappings: SANITIZER, isSanitizer: true },
  { methodName: "validator.escape", mappings: SANITIZER, isSanitizer: true },
  { methodName: "bleach.clean", mappings: SANITIZER, isSanitizer: true },
  { methodName: "markSafe", mappings: SANITIZER, isSanitizer: true },
];

// =============================================================================
// Lookup — O(1) via Map (equivalent to Zig's StaticStringMap)
// =============================================================================

const _semanticMap = new Map<string, FlowSemantic>();
for (const entry of FLOW_CATALOG) {
  _semanticMap.set(entry.methodName, entry);
}

/**
 * Look up flow semantics for a method name. O(1) via Map.
 * Tries exact match first, then suffix match (e.g., "String.concat" → "concat").
 */
export function lookupSemantic(methodName: string): FlowSemantic | null {
  const exact = _semanticMap.get(methodName);
  if (exact) return exact;

  // Suffix match: "str.concat" → "concat"
  const dotIdx = methodName.lastIndexOf(".");
  if (dotIdx >= 0) {
    const suffix = methodName.slice(dotIdx + 1);
    return _semanticMap.get(suffix) ?? null;
  }

  return null;
}

// =============================================================================
// Taint Propagation
// =============================================================================

export const MAX_ARGS = 8;
export const RETURN_IDX = MAX_ARGS;

/**
 * Given a FlowSemantic and a set of tainted argument indices,
 * compute which outputs become tainted.
 * Returns boolean array: indices 0..7 for args, index 8 for return value.
 */
export function propagateTaint(
  semantic: FlowSemantic,
  taintedArgs: boolean[],
): boolean[] {
  const result = new Array<boolean>(MAX_ARGS + 1).fill(false);

  if (semantic.isSanitizer) {
    return result; // Sanitizer: output is NOT tainted
  }

  for (const mapping of semantic.mappings) {
    const srcTainted = mapping.src === -1
      ? false
      : (mapping.src < taintedArgs.length ? taintedArgs[mapping.src] : false);

    if (srcTainted) {
      if (mapping.dst === -1) {
        result[RETURN_IDX] = true;
      } else if (mapping.dst < MAX_ARGS) {
        result[mapping.dst] = true;
      }
    }
  }

  // Sources always taint the return value
  if (semantic.isSource) {
    result[RETURN_IDX] = true;
  }

  return result;
}
