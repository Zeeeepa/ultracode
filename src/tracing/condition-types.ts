/**
 * Enhanced Condition Analysis Types + Extractors
 * Ported from ultracode.zig/src/analysis/condition_analyzer.zig
 *
 * Provides structured condition extraction from source text,
 * contradiction detection, dead branch identification, and type narrowing.
 *
 * Works with CFG + Reaching Definitions for intra-procedural analysis.
 */

import type { MethodCfg } from "./cfg-builder.js";

// =============================================================================
// Types
// =============================================================================

export type CondOp =
  | "eq"
  | "neq"
  | "lt"
  | "gt"
  | "lte"
  | "gte"
  | "is_null"
  | "is_not_null"
  | "is_truthy"
  | "is_falsy"
  | "is_type"
  | "instanceof";

export function negateOp(op: CondOp): CondOp {
  const negations: Record<CondOp, CondOp> = {
    eq: "neq",
    neq: "eq",
    lt: "gte",
    gt: "lte",
    lte: "gt",
    gte: "lt",
    is_null: "is_not_null",
    is_not_null: "is_null",
    is_truthy: "is_falsy",
    is_falsy: "is_truthy",
    is_type: "is_type",
    instanceof: "instanceof",
  };
  return negations[op];
}

export interface Condition {
  variable: string;
  operator: CondOp;
  value: string | null;
  negated: boolean;
  cfgNodeId: number;
  sourceLine: number;
}

export type PathFeasibility = "feasible" | "infeasible" | "unknown";

export interface Contradiction {
  a: Condition;
  b: Condition;
  reason: string;
}

export interface NarrowedType {
  variable: string;
  narrowedTo: string;
  fromCondition: number; // cfgNodeId
}

export interface ConditionResult {
  pathFeasibility: PathFeasibility;
  conditions: Condition[];
  contradictions: Contradiction[];
  deadBranches: number[]; // cfgNodeIds
  narrowedTypes: NarrowedType[];
}

// =============================================================================
// Condition Extraction from Source Text
// =============================================================================

const CONSTANT_TRUE = new Set(["true", "1", "True", "TRUE"]);
const CONSTANT_FALSE = new Set(["false", "0", "False", "FALSE", "null", "nil", "None", "undefined", '""', "''"]);

const IDENT_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*/;
const TYPEOF_RE = /^typeof\s+(\w+)\s*(===?|!==?)\s*["'`](\w+)["'`]/;
const INSTANCEOF_RE = /^(\w+)\s+instanceof\s+(\w+)/;
const NULL_CHECK_RE = /^(\w[\w.]*)\s*(!==?|===?)\s*(null|nil|None|undefined)$/;
const NULL_CHECK_REV_RE = /^(null|nil|None|undefined)\s*(!==?|===?)\s*(\w[\w.]*)$/;
const PYTHON_IS_NONE_RE = /^(\w+)\s+is\s+(not\s+)?None$/;
const BINARY_CMP_RE = /^(\w[\w.]*)\s*(!==|===|!=|>=|<=|==|>|<)\s*(.+)$/;

function extractSimpleIdent(text: string): string {
  const m = IDENT_RE.exec(text.trim());
  return m ? m[0] : "";
}

/**
 * Extract a condition from a source text expression (e.g., the condition inside `if (...)`).
 */
export function extractCondition(
  text: string,
  cfgNodeId: number,
  sourceLine: number,
  isTrueBranch: boolean,
): Condition | null {
  const trimmed = text
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim();
  if (!trimmed) return null;

  // Constant conditions
  if (CONSTANT_TRUE.has(trimmed)) {
    if (!isTrueBranch)
      return { variable: "_constant", operator: "is_falsy", value: trimmed, negated: false, cfgNodeId, sourceLine };
    return null;
  }
  if (CONSTANT_FALSE.has(trimmed)) {
    if (isTrueBranch)
      return { variable: "_constant", operator: "is_truthy", value: trimmed, negated: false, cfgNodeId, sourceLine };
    return null;
  }

  // Negation: !expr
  if (trimmed.startsWith("!")) {
    const inner = trimmed
      .slice(1)
      .trim()
      .replace(/^\(+|\)+$/g, "")
      .trim();
    if (inner) {
      const cond = extractCondition(inner, cfgNodeId, sourceLine, isTrueBranch);
      if (cond) {
        cond.operator = negateOp(cond.operator);
        return cond;
      }
      const ident = extractSimpleIdent(inner);
      if (ident)
        return {
          variable: ident,
          operator: isTrueBranch ? "is_falsy" : "is_truthy",
          value: null,
          negated: !isTrueBranch,
          cfgNodeId,
          sourceLine,
        };
    }
  }

  // typeof x === "string"
  const typeofMatch = TYPEOF_RE.exec(trimmed);
  if (typeofMatch) {
    return {
      variable: typeofMatch[1]!,
      operator: "is_type",
      value: typeofMatch[3]!,
      negated: !isTrueBranch,
      cfgNodeId,
      sourceLine,
    };
  }

  // x instanceof Foo
  const instMatch = INSTANCEOF_RE.exec(trimmed);
  if (instMatch) {
    return {
      variable: instMatch[1]!,
      operator: "instanceof",
      value: instMatch[2]!,
      negated: !isTrueBranch,
      cfgNodeId,
      sourceLine,
    };
  }

  // Python: x is None / x is not None
  const pyNoneMatch = PYTHON_IS_NONE_RE.exec(trimmed);
  if (pyNoneMatch) {
    const isNot = !!pyNoneMatch[2];
    return {
      variable: pyNoneMatch[1]!,
      operator: isTrueBranch ? (isNot ? "is_not_null" : "is_null") : isNot ? "is_null" : "is_not_null",
      value: null,
      negated: false,
      cfgNodeId,
      sourceLine,
    };
  }

  // Null checks: x == null, x !== null, null == x
  const nullMatch = NULL_CHECK_RE.exec(trimmed) || NULL_CHECK_REV_RE.exec(trimmed);
  if (nullMatch) {
    const variable = /^(null|nil|None|undefined)$/.test(nullMatch[1]!) ? nullMatch[3]! : nullMatch[1]!;
    const isEq = nullMatch[2] === "==" || nullMatch[2] === "===";
    const baseOp: CondOp = isEq ? "is_null" : "is_not_null";
    return {
      variable: variable,
      operator: isTrueBranch ? baseOp : negateOp(baseOp),
      value: null,
      negated: false,
      cfgNodeId,
      sourceLine,
    };
  }

  // Binary comparisons: x == y, x < y, etc.
  const binMatch = BINARY_CMP_RE.exec(trimmed);
  if (binMatch) {
    const opMap: Record<string, CondOp> = {
      "!==": "neq",
      "===": "eq",
      "!=": "neq",
      ">=": "gte",
      "<=": "lte",
      "==": "eq",
      ">": "gt",
      "<": "lt",
    };
    const baseOp = opMap[binMatch[2]!];
    if (baseOp) {
      return {
        variable: binMatch[1]!,
        operator: isTrueBranch ? baseOp : negateOp(baseOp),
        value: binMatch[3]!.trim(),
        negated: false,
        cfgNodeId,
        sourceLine,
      };
    }
  }

  // Simple identifier → truthiness check
  const ident = extractSimpleIdent(trimmed);
  if (ident)
    return {
      variable: ident,
      operator: isTrueBranch ? "is_truthy" : "is_falsy",
      value: null,
      negated: false,
      cfgNodeId,
      sourceLine,
    };

  return null;
}

// =============================================================================
// Contradiction Detection
// =============================================================================

function areContradictory(a: Condition, b: Condition): string | null {
  if (a.variable !== b.variable) return null;

  // x == null && x != null
  if (a.operator === "is_null" && b.operator === "is_not_null") return `${a.variable} is both null and not-null`;
  if (a.operator === "is_not_null" && b.operator === "is_null") return `${a.variable} is both not-null and null`;

  // x is truthy && x is falsy
  if (a.operator === "is_truthy" && b.operator === "is_falsy") return `${a.variable} is both truthy and falsy`;
  if (a.operator === "is_falsy" && b.operator === "is_truthy") return `${a.variable} is both falsy and truthy`;

  // x == A && x == B (where A != B)
  if (a.operator === "eq" && b.operator === "eq" && a.value && b.value && a.value !== b.value) {
    return `${a.variable} cannot be both ${a.value} and ${b.value}`;
  }

  // x < A && x > B where B >= A
  if (a.operator === "lt" && b.operator === "gt" && a.value && b.value) {
    const aVal = Number(a.value);
    const bVal = Number(b.value);
    if (!isNaN(aVal) && !isNaN(bVal) && bVal >= aVal) return `${a.variable} < ${aVal} && > ${bVal} is impossible`;
  }

  return null;
}

/**
 * Detect contradictions in a set of conditions (conditions that can't be simultaneously true).
 */
export function detectContradictions(conditions: Condition[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (let i = 0; i < conditions.length; i++) {
    for (let j = i + 1; j < conditions.length; j++) {
      const reason = areContradictory(conditions[i]!, conditions[j]!);
      if (reason) contradictions.push({ a: conditions[i]!, b: conditions[j]!, reason });
    }
  }
  return contradictions;
}

/**
 * Detect dead branches from constant conditions in if-statements.
 */
export function detectDeadBranches(conditions: Condition[]): number[] {
  return conditions.filter((c) => c.variable === "_constant").map((c) => c.cfgNodeId);
}

/**
 * Extract type narrowings from conditions (typeof/instanceof).
 */
export function extractNarrowedTypes(conditions: Condition[]): NarrowedType[] {
  return conditions
    .filter((c) => (c.operator === "is_type" || c.operator === "instanceof") && c.value && !c.negated)
    .map((c) => ({ variable: c.variable, narrowedTo: c.value!, fromCondition: c.cfgNodeId }));
}

/**
 * Analyze conditions across a CFG.
 * Extracts conditions from branch nodes, detects contradictions and dead branches.
 */
export function analyzeConditions(cfg: MethodCfg, sourceLines: string[]): ConditionResult {
  const conditions: Condition[] = [];

  for (const node of cfg.nodes) {
    if (node.type !== "branch_true" && node.type !== "branch_false") continue;
    const isTrueBranch = node.type === "branch_true";
    const line = sourceLines[node.sourceStart] ?? "";

    // Extract the condition expression from if/while/for
    const condMatch = /(?:if|while|for)\s*\((.+)\)/.exec(line);
    if (condMatch?.[1]) {
      const cond = extractCondition(condMatch[1], node.id, node.sourceStart, isTrueBranch);
      if (cond) conditions.push(cond);
    }
  }

  const contradictions = detectContradictions(conditions);
  const deadBranches = detectDeadBranches(conditions);
  const narrowedTypes = extractNarrowedTypes(conditions);

  const pathFeasibility: PathFeasibility =
    contradictions.length > 0 ? "infeasible" : deadBranches.length > 0 ? "infeasible" : "feasible";

  return { pathFeasibility, conditions, contradictions, deadBranches, narrowedTypes };
}
