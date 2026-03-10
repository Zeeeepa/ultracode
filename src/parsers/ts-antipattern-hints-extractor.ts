/**
 * TypeScript Antipattern Hints Extractor
 *
 * Collects antipattern-relevant data from AST nodes — patterns that indicate
 * type safety issues, security risks, and code quality problems:
 * type assertions, non-null assertions, throw non-Error, innerHTML, || defaults,
 * parameter mutations, regex literals.
 *
 * Analogous to ts-jit-hints-extractor.ts but focused on code quality antipatterns.
 */

import ts from "typescript";

export interface AntipatternHints {
  typeAssertionCount: number;
  doubleAssertionCount: number;
  nonNullAssertionCount: number;
  throwNonErrorCount: number;
  innerHtmlAssignCount: number;
  orWithDefaultCount: number;
  paramMutationCount: number;
  regexLiterals: string[];
}

/**
 * Extract antipattern hints from a function/method body.
 * Returns undefined if no antipattern-relevant patterns found (zero-cost for clean code).
 */
export function extractAntipatternHints(node: ts.Node, _sourceFile: ts.SourceFile): AntipatternHints | undefined {
  let typeAssertionCount = 0;
  let doubleAssertionCount = 0;
  let nonNullAssertionCount = 0;
  let throwNonErrorCount = 0;
  let innerHtmlAssignCount = 0;
  let orWithDefaultCount = 0;
  let paramMutationCount = 0;
  const regexLiterals: string[] = [];

  // Collect parameter names to detect parameter mutation
  const paramNames = new Set<string>();
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    for (const param of node.parameters) {
      if (ts.isIdentifier(param.name)) {
        paramNames.add(param.name.text);
      }
    }
  }

  function visit(n: ts.Node): void {
    // Skip nested function scopes
    if (
      n !== node &&
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n))
    ) {
      return;
    }

    // `as Type` assertion
    if (ts.isAsExpression(n)) {
      typeAssertionCount++;
      // Double assertion: `expr as unknown as Type`
      if (ts.isAsExpression(n.expression)) {
        doubleAssertionCount++;
      }
    }

    // Non-null assertion: `expr!`
    if (ts.isNonNullExpression(n)) {
      nonNullAssertionCount++;
    }

    // throw non-Error: `throw "string"` or `throw obj` (not `throw new Error(...)`)
    if (ts.isThrowStatement(n) && n.expression) {
      if (!isNewErrorExpression(n.expression)) {
        throwNonErrorCount++;
      }
    }

    // innerHTML/outerHTML assignment
    if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
      const leftText = n.left.getText();
      if (/\.(innerHTML|outerHTML)$/.test(leftText) || /dangerouslySetInnerHTML/.test(leftText)) {
        innerHtmlAssignCount++;
      }
    }

    // || with literal default (0, "", false) — should use ??
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      if (isLiteralDefault(n.right)) {
        orWithDefaultCount++;
      }
    }

    // Parameter mutation via assignment: `param.x = ...` or `param = ...`
    if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
      const leftName = getBaseIdentifier(n.left);
      if (leftName && paramNames.has(leftName)) {
        paramMutationCount++;
      }
    }

    // Parameter mutation via method call: `param.push(...)`, `param.splice(...)`, etc.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const methodName = n.expression.name.text;
      const objName = getBaseIdentifier(n.expression.expression);
      if (objName && paramNames.has(objName) && MUTATING_METHODS.has(methodName)) {
        paramMutationCount++;
      }
    }

    // Regex literals
    if (ts.isRegularExpressionLiteral(n)) {
      regexLiterals.push(n.text);
    }

    ts.forEachChild(n, visit);
  }

  // Walk only the body, not the signature
  const body = getBody(node);
  if (body) {
    ts.forEachChild(body, visit);
  } else {
    ts.forEachChild(node, visit);
  }

  // Return undefined if nothing found (common case — avoids metadata bloat)
  if (
    typeAssertionCount === 0 &&
    doubleAssertionCount === 0 &&
    nonNullAssertionCount === 0 &&
    throwNonErrorCount === 0 &&
    innerHtmlAssignCount === 0 &&
    orWithDefaultCount === 0 &&
    paramMutationCount === 0 &&
    regexLiterals.length === 0
  ) {
    return undefined;
  }

  return {
    typeAssertionCount,
    doubleAssertionCount,
    nonNullAssertionCount,
    throwNonErrorCount,
    innerHtmlAssignCount,
    orWithDefaultCount,
    paramMutationCount,
    regexLiterals,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

function isNewErrorExpression(expr: ts.Expression): boolean {
  if (ts.isNewExpression(expr)) {
    const ctorText = expr.expression.getText();
    return ctorText === "Error" || ctorText.endsWith("Error");
  }
  return false;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken
  );
}

function isLiteralDefault(node: ts.Node): boolean {
  if (ts.isNumericLiteral(node) && node.text === "0") return true;
  if (ts.isStringLiteral(node) && node.text === "") return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return true;
  return false;
}

function getBaseIdentifier(expr: ts.Node): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return getBaseIdentifier(expr.expression);
  if (ts.isElementAccessExpression(expr)) return getBaseIdentifier(expr.expression);
  return null;
}

function getBody(node: ts.Node): ts.Node | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return node.body;
  }
  if (ts.isArrowFunction(node)) {
    return node.body;
  }
  return undefined;
}
