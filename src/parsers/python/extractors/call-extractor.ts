/**
 * Python Call Graph Extractor
 *
 * Extracts function/method calls from Python AST nodes.
 */

import type { ASTNode, ParsedEntity } from "../../../types/parser.js";
import { convertPosition, getNodeText } from "../utils/helpers.js";

// =============================================================================
// CALL EXTRACTOR CLASS
// =============================================================================

export class CallExtractor {
  /**
   * Extract all function/method calls within a node
   */
  extractCalls(node: ASTNode, source: string): ParsedEntity["calls"] {
    const calls: NonNullable<ParsedEntity["calls"]> = [];

    const visit = (n: ASTNode, isAwaited = false): void => {
      if (n.type === "await") {
        const awaited = n.namedChildren[0];
        if (awaited) {
          visit(awaited, true);
        }
        return;
      }

      if (n.type === "call") {
        const funcNode = n.namedChildren.find((c) => c.type !== "argument_list" && c.type !== "generator_expression");
        if (funcNode) {
          const callInfo = this.extractCallInfo(funcNode, n, source, isAwaited);
          if (callInfo) {
            calls.push(callInfo);
          }
        }
        const argList = n.namedChildren.find((c) => c.type === "argument_list");
        if (argList) {
          for (const arg of argList.namedChildren) {
            visit(arg, false);
          }
        }
        return;
      }

      for (const child of n.namedChildren) {
        visit(child, false);
      }
    };

    const bodyNode = node.namedChildren.find((c) => c.type === "block");
    if (bodyNode) {
      visit(bodyNode);
    }

    return calls.length > 0 ? calls : undefined;
  }

  /**
   * Extract information from a single call expression
   */
  private extractCallInfo(
    funcNode: ASTNode,
    callNode: ASTNode,
    source: string,
    isAwaited: boolean,
  ): NonNullable<ParsedEntity["calls"]>[number] | null {
    let name: string;
    let target: string | undefined;

    if (funcNode.type === "identifier") {
      name = funcNode.text;
    } else if (funcNode.type === "attribute") {
      const parts = funcNode.text.split(".");
      name = parts[parts.length - 1] ?? funcNode.text;
      target = parts.slice(0, -1).join(".");
    } else if (funcNode.type === "subscript") {
      name = getNodeText(funcNode, source);
    } else {
      name = getNodeText(funcNode, source);
    }

    const argList = callNode.namedChildren.find((c) => c.type === "argument_list");
    const argumentCount = argList
      ? argList.namedChildren.filter(
          (c) =>
            c.type !== "generator_expression" &&
            c.type !== "list_comprehension" &&
            c.type !== "dictionary_comprehension" &&
            c.type !== "set_comprehension",
        ).length
      : 0;

    return {
      name,
      target,
      location: convertPosition(callNode),
      ...(isAwaited && { isAwait: isAwaited }),
      argumentCount,
    };
  }
}
