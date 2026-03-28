/**
 * Control Flow Graph Builder — ported from ultracode.zig/src/graph/cfg.zig
 *
 * Builds a CFG from source code lines. Unlike the Zig version (which uses
 * tree-sitter AST nodes), this works on raw source text — classifying lines
 * by keywords to identify control flow structures.
 *
 * Used by: reaching-definitions, condition-analyzer, dead code detection.
 *
 * Supported structures: if/else, for/while/do loops, return, throw, try/catch.
 */

// =============================================================================
// Types
// =============================================================================

export type CfgNodeType =
  | "entry"
  | "exit"
  | "statement"
  | "branch_true"
  | "branch_false"
  | "loop_header"
  | "loop_back"
  | "merge"
  | "return"
  | "throw";

export type CfgEdgeType = "sequential" | "branch" | "back_edge" | "exception";

export interface CfgNode {
  id: number;
  type: CfgNodeType;
  /** Source line start (0-indexed) */
  sourceStart: number;
  /** Source line end (0-indexed, inclusive) */
  sourceEnd: number;
}

export interface CfgEdge {
  from: number;
  to: number;
  type: CfgEdgeType;
}

export interface MethodCfg {
  nodes: CfgNode[];
  edges: CfgEdge[];
  entryId: number;
  exitId: number;
}

// =============================================================================
// Line Classification
// =============================================================================

type CfgStrategy = "plain" | "if_branch" | "else_branch" | "loop" | "return_node" | "throw_node" | "try_catch" | "catch_node" | "skip";

const IF_PATTERN = /^\s*(if\s*\(|if\s+)/;
const ELSE_IF_PATTERN = /^\s*(}\s*else\s+if\s*\(|else\s+if\s*\(|elif\s+)/;
const ELSE_PATTERN = /^\s*(}\s*else\s*\{|else\s*\{|else\s*:)/;
const LOOP_PATTERN = /^\s*(for\s*\(|for\s+|while\s*\(|while\s+|do\s*\{|loop\s*\{)/;
const RETURN_PATTERN = /^\s*return[\s;(]/;
const THROW_PATTERN = /^\s*(throw\s|raise\s)/;
const TRY_PATTERN = /^\s*(try\s*\{|try\s*:)/;
const CATCH_PATTERN = /^\s*(}\s*catch\s*[\({]|catch\s*[\({]|except\s)/;
const SKIP_PATTERN = /^\s*(\/\/|\/\*|\*|#|$|\{$|\}$|;$)/;

function classifyLine(line: string): CfgStrategy {
  if (SKIP_PATTERN.test(line)) return "skip";
  if (ELSE_IF_PATTERN.test(line)) return "if_branch"; // else-if is a new branch
  if (ELSE_PATTERN.test(line)) return "else_branch";
  if (IF_PATTERN.test(line)) return "if_branch";
  if (LOOP_PATTERN.test(line)) return "loop";
  if (RETURN_PATTERN.test(line)) return "return_node";
  if (THROW_PATTERN.test(line)) return "throw_node";
  if (CATCH_PATTERN.test(line)) return "catch_node";
  if (TRY_PATTERN.test(line)) return "try_catch";
  return "plain";
}

// =============================================================================
// Builder
// =============================================================================

class Builder {
  nodes: CfgNode[] = [];
  edges: CfgEdge[] = [];
  private nextId = 2; // 0=entry, 1=exit

  addNode(type: CfgNodeType, sourceStart: number, sourceEnd: number): number {
    const id = this.nextId++;
    this.nodes.push({ id, type, sourceStart, sourceEnd });
    return id;
  }

  addEdge(from: number, to: number, type: CfgEdgeType): void {
    this.edges.push({ from, to, type });
  }
}

// =============================================================================
// Public API
// =============================================================================

const MAX_LINES = 5000; // Safety limit

/**
 * Build a CFG from source code lines.
 *
 * @param lines - Array of source code lines (the function body)
 * @returns MethodCfg with nodes and edges
 *
 * @example
 * const cfg = buildCfgFromSource([
 *   "const x = 1;",
 *   "if (x > 0) {",
 *   "  return x;",
 *   "}",
 *   "return -x;",
 * ]);
 */
export function buildCfgFromSource(lines: string[]): MethodCfg {
  const builder = new Builder();
  const entryId = 0;
  const exitId = 1;

  builder.nodes.push({ id: entryId, type: "entry", sourceStart: 0, sourceEnd: 0 });
  builder.nodes.push({ id: exitId, type: "exit", sourceStart: lines.length - 1, sourceEnd: lines.length - 1 });

  const safeLines = lines.slice(0, MAX_LINES);
  let current = entryId;

  for (let i = 0; i < safeLines.length; i++) {
    const strategy = classifyLine(safeLines[i]!);

    switch (strategy) {
      case "skip":
        break;

      case "plain": {
        const stmtId = builder.addNode("statement", i, i);
        builder.addEdge(current, stmtId, "sequential");
        current = stmtId;
        break;
      }

      case "if_branch": {
        const mergeId = builder.addNode("merge", i, i);
        const trueId = builder.addNode("branch_true", i, i);
        builder.addEdge(current, trueId, "branch");

        const falseId = builder.addNode("branch_false", i, i);
        builder.addEdge(current, falseId, "branch");

        // Connect both branches to merge (simplified — no nested body walking)
        builder.addEdge(trueId, mergeId, "sequential");
        builder.addEdge(falseId, mergeId, "sequential");
        current = mergeId;
        break;
      }

      case "else_branch": {
        // Else is part of the previous if — just create a statement node
        const stmtId = builder.addNode("statement", i, i);
        builder.addEdge(current, stmtId, "sequential");
        current = stmtId;
        break;
      }

      case "loop": {
        const headerId = builder.addNode("loop_header", i, i);
        builder.addEdge(current, headerId, "sequential");

        const mergeId = builder.addNode("merge", i, i);
        const backId = builder.addNode("loop_back", i, i);
        builder.addEdge(headerId, backId, "sequential"); // body → back
        builder.addEdge(backId, headerId, "back_edge");   // back → header
        builder.addEdge(headerId, mergeId, "branch");     // exit loop
        current = mergeId;
        break;
      }

      case "return_node": {
        const retId = builder.addNode("return", i, i);
        builder.addEdge(current, retId, "sequential");
        builder.addEdge(retId, exitId, "sequential");
        current = retId;
        break;
      }

      case "throw_node": {
        const throwId = builder.addNode("throw", i, i);
        builder.addEdge(current, throwId, "sequential");
        builder.addEdge(throwId, exitId, "exception");
        current = throwId;
        break;
      }

      case "try_catch": {
        const stmtId = builder.addNode("statement", i, i);
        builder.addEdge(current, stmtId, "sequential");
        current = stmtId;
        break;
      }

      case "catch_node": {
        const catchId = builder.addNode("statement", i, i);
        builder.addEdge(current, catchId, "exception");
        current = catchId;
        break;
      }
    }
  }

  // Connect last node to exit if not already connected
  const alreadyExits = builder.edges.some((e) => e.from === current && e.to === exitId);
  if (!alreadyExits) {
    builder.addEdge(current, exitId, "sequential");
  }

  return {
    nodes: builder.nodes,
    edges: builder.edges,
    entryId,
    exitId,
  };
}

/**
 * Get successors of a node in the CFG.
 */
export function getSuccessors(cfg: MethodCfg, nodeId: number): number[] {
  return cfg.edges.filter((e) => e.from === nodeId).map((e) => e.to);
}

/**
 * Get predecessors of a node in the CFG.
 */
export function getPredecessors(cfg: MethodCfg, nodeId: number): number[] {
  return cfg.edges.filter((e) => e.to === nodeId).map((e) => e.from);
}
