/**
 * Condition Extractor — Extract enclosing conditions from AST call sites
 *
 * Walks parent chain from a call expression node, collecting conditions
 * from if/while/for/switch/match/guard/ternary/catch nodes.
 * Returns conditions in innermost→outermost order.
 *
 * Ported from ultracode.zig/src/parsers/extractors/common.zig:extractEnclosingConditions()
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_WALK_STEPS = 30;
const MAX_CONDITION_LEVELS = 6;
const MAX_CONDITION_LENGTH = 120;

/** AST node types that represent condition scopes */
const CONDITION_NODE_TYPES = new Set([
  // if
  "if_statement",
  "if_expression",
  // for
  "for_statement",
  "for_in_statement",
  "for_expression",
  // while
  "while_statement",
  "while_expression",
  "do_statement",
  // switch
  "switch_statement",
  "switch_expression",
  "case_statement",
  "switch_case",
  // ternary
  "ternary_expression",
  "conditional_expression",
  // pattern matching
  "match_expression",
  "match_arm",
  "when_entry",
  "when_expression",
  // error handling
  "catch_clause",
  // guards
  "guard_clause",
  "guard_statement",
]);

// =============================================================================
// TYPES
// =============================================================================

/** Minimal AST node interface (tree-sitter compatible) */
export interface ASTNode {
  type: string;
  parent: ASTNode | null;
  text?: string;
  startPosition?: { row: number; column: number };
  namedChildren?: ASTNode[];
  childForFieldName?(name: string): ASTNode | null;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Extract enclosing conditions from a call site node.
 * Walks parent chain, collects conditions from scope nodes.
 *
 * @param node - The call expression AST node
 * @returns Array of condition texts (innermost→outermost), or null if none
 */
export function extractEnclosingConditions(node: ASTNode): string[] | null {
  const conditions: string[] = [];
  let current: ASTNode | null = node.parent;
  let steps = 0;

  while (current && steps < MAX_WALK_STEPS && conditions.length < MAX_CONDITION_LEVELS) {
    if (CONDITION_NODE_TYPES.has(current.type)) {
      const condText = formatConditionText(current, node);
      if (condText) {
        conditions.push(condText);
      }
    }
    current = current.parent;
    steps++;
  }

  return conditions.length > 0 ? conditions : null;
}

// =============================================================================
// CONDITION TEXT FORMATTING
// =============================================================================

function formatConditionText(condNode: ASTNode, callNode: ASTNode): string | null {
  const nt = condNode.type;

  // if/while/guard: extract condition expression
  if (
    nt === "if_statement" ||
    nt === "if_expression" ||
    nt === "while_statement" ||
    nt === "while_expression" ||
    nt === "guard_clause" ||
    nt === "guard_statement"
  ) {
    const condExpr = condNode.childForFieldName?.("condition");
    const prefix = conditionPrefix(nt);
    const branch = detectBranch(condNode, callNode);
    const text = condExpr?.text ?? "";
    return truncate(`${branch}${prefix} (${text})`);
  }

  // do-while
  if (nt === "do_statement") {
    const condExpr = condNode.childForFieldName?.("condition");
    const text = condExpr?.text ?? "";
    return truncate(`do-while (${text})`);
  }

  // for loops
  if (nt === "for_statement" || nt === "for_in_statement" || nt === "for_expression") {
    const iterExpr = condNode.childForFieldName?.("value") ?? condNode.childForFieldName?.("right");
    const pattern = condNode.childForFieldName?.("left") ?? condNode.childForFieldName?.("pattern");
    if (pattern && iterExpr) {
      return truncate(`[loop] for (${pattern.text} in ${iterExpr.text})`);
    }
    return truncate(`[loop] for (...)`);
  }

  // switch/match
  if (nt === "switch_statement" || nt === "switch_expression" || nt === "match_expression") {
    const value = condNode.childForFieldName?.("value") ?? condNode.childForFieldName?.("condition");
    return truncate(`switch (${value?.text ?? "..."})`);
  }

  // case/match_arm/when
  if (
    nt === "case_statement" ||
    nt === "switch_case" ||
    nt === "match_arm" ||
    nt === "when_entry" ||
    nt === "when_expression"
  ) {
    const value = condNode.childForFieldName?.("value") ?? condNode.namedChildren?.[0];
    return truncate(`case ${value?.text ?? "..."}`);
  }

  // ternary
  if (nt === "ternary_expression" || nt === "conditional_expression") {
    const cond = condNode.childForFieldName?.("condition") ?? condNode.namedChildren?.[0];
    return truncate(`[ternary] ${cond?.text ?? "..."}`);
  }

  // catch
  if (nt === "catch_clause") {
    const param = condNode.childForFieldName?.("parameter");
    return truncate(`[catch] (${param?.text ?? "..."})`);
  }

  // Fallback: line number
  const line = condNode.startPosition?.row;
  return line != null ? `:L${line + 1}` : null;
}

function conditionPrefix(nodeType: string): string {
  if (nodeType.startsWith("if")) return "if";
  if (nodeType.startsWith("while")) return "while";
  if (nodeType.startsWith("guard")) return "guard";
  return "if";
}

/** Detect if call is in else/false branch → "[else] " prefix */
function detectBranch(condNode: ASTNode, callNode: ASTNode): string {
  // Check if callNode is inside the "alternative"/"else" branch
  const alternative = condNode.childForFieldName?.("alternative");
  if (!alternative) return "";

  // Simple heuristic: if call's start position > alternative start
  const callStart = callNode.startPosition?.row ?? 0;
  const altStart = alternative.startPosition?.row ?? Number.MAX_SAFE_INTEGER;
  return callStart >= altStart ? "[else] " : "";
}

function truncate(text: string): string {
  if (text.length <= MAX_CONDITION_LENGTH) return text;
  return text.slice(0, MAX_CONDITION_LENGTH - 3) + "...";
}
