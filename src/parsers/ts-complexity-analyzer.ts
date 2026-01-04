/**
 * TypeScript Complexity Analyzer
 *
 * Extracts complexity metrics (cyclomatic, cognitive) from TypeScript AST nodes.
 * Used by typescript-parser.ts for method/function complexity analysis.
 */

import ts from "typescript";
import type { ParsedEntity } from "../types/parser.js";

export type Complexity = NonNullable<ParsedEntity["complexity"]>;

/**
 * Extract complexity metrics from a function/method node
 */
export function extractComplexity(node: ts.Node, sourceFile: ts.SourceFile): Complexity | undefined {
  let cyclomatic = 1; // Base complexity
  let cognitive = 0;
  let maxNestingDepth = 0;
  let returnCount = 0;
  let parameterCount = 0;

  // Get parameter count
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    parameterCount = node.parameters.length;
  }

  function visit(n: ts.Node, nestingLevel: number): void {
    maxNestingDepth = Math.max(maxNestingDepth, nestingLevel);

    // Cyclomatic: increment for each decision point
    // Cognitive: increment with nesting weight

    // If statements
    if (ts.isIfStatement(n)) {
      cyclomatic++;
      cognitive += 1 + nestingLevel; // Nesting increases cognitive load
      visit(n.thenStatement, nestingLevel + 1);
      if (n.elseStatement) {
        // else-if doesn't increase nesting
        if (ts.isIfStatement(n.elseStatement)) {
          cyclomatic++; // Additional branch
          cognitive += 1; // No nesting penalty for else-if
          visit(n.elseStatement, nestingLevel);
        } else {
          visit(n.elseStatement, nestingLevel + 1);
        }
      }
      return;
    }

    // Switch statements
    if (ts.isSwitchStatement(n)) {
      // Each case is a decision point
      const caseCount = n.caseBlock.clauses.filter((c) => ts.isCaseClause(c)).length;
      cyclomatic += caseCount;
      cognitive += 1 + nestingLevel;
      for (const clause of n.caseBlock.clauses) {
        for (const stmt of clause.statements) {
          visit(stmt, nestingLevel + 1);
        }
      }
      return;
    }

    // Loops
    if (
      ts.isForStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n)
    ) {
      cyclomatic++;
      cognitive += 1 + nestingLevel;
      ts.forEachChild(n, (child) => visit(child, nestingLevel + 1));
      return;
    }

    // Ternary operator
    if (ts.isConditionalExpression(n)) {
      cyclomatic++;
      cognitive += 1 + nestingLevel;
    }

    // Logical operators (&&, ||, ??)
    if (ts.isBinaryExpression(n)) {
      if (
        n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        cyclomatic++;
        cognitive++; // No nesting penalty for logical operators
      }
    }

    // Try-catch
    if (ts.isTryStatement(n)) {
      if (n.catchClause) {
        cyclomatic++;
        cognitive += 1 + nestingLevel;
        visit(n.catchClause.block, nestingLevel + 1);
      }
      visit(n.tryBlock, nestingLevel);
      if (n.finallyBlock) {
        visit(n.finallyBlock, nestingLevel);
      }
      return;
    }

    // Return statements
    if (ts.isReturnStatement(n)) {
      returnCount++;
    }

    // Break/continue with labels add cognitive complexity
    if ((ts.isBreakStatement(n) || ts.isContinueStatement(n)) && n.label) {
      cognitive++; // Jump to label is harder to understand
    }

    // Recurse into children
    ts.forEachChild(n, (child) => visit(child, nestingLevel));
  }

  // Get function body
  let body: ts.Node | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    body = node.body;
  } else if (ts.isArrowFunction(node)) {
    body = node.body;
    // Concise arrow function with expression body
    if (!ts.isBlock(body)) {
      // Just an expression, minimal complexity
      return {
        cyclomatic: 1,
        cognitive: 0,
        linesOfCode: 1,
        linesOfLogic: 1,
        nestingDepth: 0,
        parameterCount,
        returnCount: 1, // Implicit return
      };
    }
  } else if (
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    body = node.body;
  }

  if (!body) return undefined;

  // Visit body
  visit(body, 0);

  // Calculate lines
  const startLine = sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line;
  const endLine = sourceFile.getLineAndCharacterOfPosition(body.getEnd()).line;
  const linesOfCode = endLine - startLine + 1;

  // Estimate lines of logic (rough: total - ~20% for blanks/comments)
  const linesOfLogic = Math.max(1, Math.floor(linesOfCode * 0.8));

  return {
    cyclomatic,
    cognitive,
    linesOfCode,
    linesOfLogic,
    nestingDepth: maxNestingDepth,
    parameterCount,
    returnCount,
  };
}
