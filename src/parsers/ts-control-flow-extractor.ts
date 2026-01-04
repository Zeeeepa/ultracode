/**
 * TypeScript Control Flow Extractor
 *
 * Extracts control flow structures (branches, loops, exceptions, returns, awaits)
 * from TypeScript AST nodes. Used by typescript-parser.ts.
 */

import ts from "typescript";
import type { ParsedEntity } from "../types/parser.js";
import { getLocation } from "./ts-ast-helpers.js";

export type ControlFlow = NonNullable<ParsedEntity["controlFlow"]>;
type BranchInfo = ControlFlow["branches"][number];
type LoopInfo = ControlFlow["loops"][number];
type ExceptionInfo = ControlFlow["exceptions"][number];
type ReturnInfo = ControlFlow["returns"][number];
type AwaitInfo = ControlFlow["awaits"][number];

/**
 * Extract control flow structure from a function/method body
 */
export function extractControlFlow(node: ts.Node, sourceFile: ts.SourceFile): ControlFlow | undefined {
  const branches: BranchInfo[] = [];
  const loops: LoopInfo[] = [];
  const exceptions: ExceptionInfo[] = [];
  const returns: ReturnInfo[] = [];
  const awaits: AwaitInfo[] = [];

  function visit(n: ts.Node): void {
    // Branches
    if (ts.isIfStatement(n)) {
      branches.push({
        type: "if",
        condition: n.expression.getText(sourceFile),
        location: getLocation(sourceFile, n),
      });
      // Check for else-if chain
      if (n.elseStatement) {
        if (ts.isIfStatement(n.elseStatement)) {
          branches.push({
            type: "else-if",
            condition: n.elseStatement.expression.getText(sourceFile),
            location: getLocation(sourceFile, n.elseStatement),
          });
        } else {
          branches.push({
            type: "else",
            location: getLocation(sourceFile, n.elseStatement),
          });
        }
      }
    }

    // Switch statements
    if (ts.isSwitchStatement(n)) {
      branches.push({
        type: "switch",
        condition: n.expression.getText(sourceFile),
        location: getLocation(sourceFile, n),
      });
      for (const clause of n.caseBlock.clauses) {
        if (ts.isCaseClause(clause)) {
          branches.push({
            type: "case",
            condition: clause.expression.getText(sourceFile),
            location: getLocation(sourceFile, clause),
          });
        } else {
          branches.push({
            type: "default",
            location: getLocation(sourceFile, clause),
          });
        }
      }
    }

    // Ternary operator
    if (ts.isConditionalExpression(n)) {
      branches.push({
        type: "ternary",
        condition: n.condition.getText(sourceFile),
        location: getLocation(sourceFile, n),
      });
    }

    // Loops
    if (ts.isForStatement(n)) {
      loops.push({
        type: "for",
        location: getLocation(sourceFile, n),
      });
    }
    if (ts.isForOfStatement(n)) {
      loops.push({
        type: "for-of",
        location: getLocation(sourceFile, n),
      });
    }
    if (ts.isForInStatement(n)) {
      loops.push({
        type: "for-in",
        location: getLocation(sourceFile, n),
      });
    }
    if (ts.isWhileStatement(n)) {
      loops.push({
        type: "while",
        location: getLocation(sourceFile, n),
      });
    }
    if (ts.isDoStatement(n)) {
      loops.push({
        type: "do-while",
        location: getLocation(sourceFile, n),
      });
    }

    // Exception handling
    if (ts.isTryStatement(n)) {
      exceptions.push({
        type: "try",
        location: getLocation(sourceFile, n),
      });
      if (n.catchClause) {
        const catchType = n.catchClause.variableDeclaration?.type
          ? n.catchClause.variableDeclaration.type.getText(sourceFile)
          : undefined;
        exceptions.push({
          type: "catch",
          ...(catchType && { catchType }),
          location: getLocation(sourceFile, n.catchClause),
        });
      }
      if (n.finallyBlock) {
        exceptions.push({
          type: "finally",
          location: getLocation(sourceFile, n.finallyBlock),
        });
      }
    }
    if (ts.isThrowStatement(n)) {
      exceptions.push({
        type: "throw",
        location: getLocation(sourceFile, n),
      });
    }

    // Return statements
    if (ts.isReturnStatement(n)) {
      returns.push({
        location: getLocation(sourceFile, n),
        hasValue: n.expression !== undefined,
      });
    }

    // Await expressions
    if (ts.isAwaitExpression(n)) {
      awaits.push({
        location: getLocation(sourceFile, n),
        expression: n.expression.getText(sourceFile),
      });
    }

    // Recurse into children
    ts.forEachChild(n, visit);
  }

  // Extract from function body
  let body: ts.Node | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    body = node.body;
  } else if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
    body = node.body;
  } else if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
    body = node.body;
  }

  if (body) {
    visit(body);
  }

  // Only return if there's meaningful control flow
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
