/**
 * Python Control Flow Extractor
 *
 * Extracts control flow structures from Python AST nodes.
 */

import type { ASTNode, ParsedEntity } from "../../../types/parser.js";
import { convertPosition, getNodeText } from "../utils/helpers.js";

// =============================================================================
// CONTROL FLOW EXTRACTOR CLASS
// =============================================================================

export class ControlFlowExtractor {
  /**
   * Extract control flow structures from a function/method
   */
  extractControlFlow(node: ASTNode, source: string): ParsedEntity["controlFlow"] {
    type BranchInfo = NonNullable<ParsedEntity["controlFlow"]>["branches"][number];
    type LoopInfo = NonNullable<ParsedEntity["controlFlow"]>["loops"][number];
    type ExceptionInfo = NonNullable<ParsedEntity["controlFlow"]>["exceptions"][number];
    type ReturnInfo = NonNullable<ParsedEntity["controlFlow"]>["returns"][number];
    type AwaitInfo = NonNullable<ParsedEntity["controlFlow"]>["awaits"][number];

    const branches: BranchInfo[] = [];
    const loops: LoopInfo[] = [];
    const exceptions: ExceptionInfo[] = [];
    const returns: ReturnInfo[] = [];
    const awaits: AwaitInfo[] = [];

    const visit = (n: ASTNode): void => {
      // If statements
      if (n.type === "if_statement") {
        const condition = n.namedChildren.find(
          (c) => c.type !== "block" && c.type !== "elif_clause" && c.type !== "else_clause",
        );
        branches.push({
          type: "if",
          condition: condition ? getNodeText(condition, source) : undefined,
          location: convertPosition(n),
        });

        for (const child of n.namedChildren) {
          if (child.type === "elif_clause") {
            const elifCond = child.namedChildren.find((c) => c.type !== "block");
            branches.push({
              type: "else-if",
              condition: elifCond ? getNodeText(elifCond, source) : undefined,
              location: convertPosition(child),
            });
          } else if (child.type === "else_clause") {
            branches.push({
              type: "else",
              location: convertPosition(child),
            });
          }
        }
      }

      // Match statement (Python 3.10+)
      if (n.type === "match_statement") {
        const matchSubject = n.namedChildren[0];
        branches.push({
          type: "switch",
          condition: matchSubject ? getNodeText(matchSubject, source) : undefined,
          location: convertPosition(n),
        });
        for (const child of n.namedChildren) {
          if (child.type === "case_clause") {
            const pattern = child.namedChildren.find((c) => c.type !== "block");
            branches.push({
              type: "case",
              condition: pattern ? getNodeText(pattern, source) : undefined,
              location: convertPosition(child),
            });
          }
        }
      }

      // Ternary/conditional expression
      if (n.type === "conditional_expression") {
        const ternaryCondition = n.namedChildren[1];
        branches.push({
          type: "ternary",
          condition: ternaryCondition ? getNodeText(ternaryCondition, source) : undefined,
          location: convertPosition(n),
        });
      }

      // For loops
      if (n.type === "for_statement") {
        loops.push({
          type: "for",
          location: convertPosition(n),
        });
      }

      // While loops
      if (n.type === "while_statement") {
        loops.push({
          type: "while",
          location: convertPosition(n),
        });
      }

      // Try/except/finally
      if (n.type === "try_statement") {
        exceptions.push({
          type: "try",
          location: convertPosition(n),
        });

        for (const child of n.namedChildren) {
          if (child.type === "except_clause") {
            const exceptionType = child.namedChildren.find(
              (c) => c.type === "identifier" || c.type === "attribute" || c.type === "tuple",
            );
            exceptions.push({
              type: "catch",
              catchType: exceptionType ? getNodeText(exceptionType, source) : undefined,
              location: convertPosition(child),
            });
          } else if (child.type === "finally_clause") {
            exceptions.push({
              type: "finally",
              location: convertPosition(child),
            });
          }
        }
      }

      // Raise statements
      if (n.type === "raise_statement") {
        const raisedType = n.namedChildren[0];
        exceptions.push({
          type: "throw",
          catchType: raisedType ? getNodeText(raisedType, source) : undefined,
          location: convertPosition(n),
        });
      }

      // Return statements
      if (n.type === "return_statement") {
        returns.push({
          location: convertPosition(n),
          hasValue: n.namedChildren.length > 0,
        });
      }

      // Await expressions
      if (n.type === "await") {
        const awaited = n.namedChildren[0];
        awaits.push({
          location: convertPosition(n),
          expression: awaited ? getNodeText(awaited, source) : "",
        });
      }

      for (const child of n.namedChildren) {
        visit(child);
      }
    };

    const bodyNode = node.namedChildren.find((c) => c.type === "block");
    if (bodyNode) {
      visit(bodyNode);
    }

    if (
      branches.length === 0 &&
      loops.length === 0 &&
      exceptions.length === 0 &&
      returns.length === 0 &&
      awaits.length === 0
    ) {
      return undefined;
    }

    return { branches, loops, exceptions, returns, awaits };
  }
}
