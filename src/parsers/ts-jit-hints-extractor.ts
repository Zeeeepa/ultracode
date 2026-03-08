/**
 * TypeScript JIT Hints Extractor
 *
 * Collects JIT-relevant data from AST nodes — patterns that cause V8/JSC deoptimization:
 * delete expressions, arguments object usage, with statements, spread in calls, dynamic property access.
 */

import ts from "typescript";

export interface JitHints {
  deleteCount: number;
  argumentsRefCount: number;
  hasWithStatement: boolean;
  spreadInCallCount: number;
  dynamicPropAccessCount: number;
}

/**
 * Extract JIT deoptimization hints from a function/method body.
 * Returns undefined if no JIT-relevant patterns found (zero-cost for clean code).
 */
export function extractJitHints(node: ts.Node, _sourceFile: ts.SourceFile): JitHints | undefined {
  let deleteCount = 0;
  let argumentsRefCount = 0;
  let hasWithStatement = false;
  let spreadInCallCount = 0;
  let dynamicPropAccessCount = 0;

  // Collect parameter names to distinguish `arguments` identifier from user-defined params
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
    // Skip nested function scopes — their `arguments` is their own
    if (n !== node && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n))) {
      return;
    }

    // delete expression
    if (ts.isDeleteExpression(n)) {
      deleteCount++;
    }

    // `arguments` built-in object reference (not a parameter named "arguments")
    if (
      ts.isIdentifier(n) &&
      n.text === "arguments" &&
      !paramNames.has("arguments") &&
      // Arrow functions don't have their own `arguments`
      !ts.isArrowFunction(node) &&
      // Exclude cases where `arguments` is used as a property/key name, not the built-in
      !isPropertyName(n)
    ) {
      argumentsRefCount++;
    }

    // with statement
    if (ts.isWithStatement(n)) {
      hasWithStatement = true;
    }

    // Spread element in call arguments
    if (ts.isSpreadElement(n)) {
      spreadInCallCount++;
    }

    // Dynamic property access: obj[expr] where expr is NOT a string/number literal
    if (ts.isElementAccessExpression(n)) {
      const arg = n.argumentExpression;
      if (arg && !ts.isStringLiteral(arg) && !ts.isNumericLiteral(arg)) {
        dynamicPropAccessCount++;
      }
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
    deleteCount === 0 &&
    argumentsRefCount === 0 &&
    !hasWithStatement &&
    spreadInCallCount === 0 &&
    dynamicPropAccessCount === 0
  ) {
    return undefined;
  }

  return { deleteCount, argumentsRefCount, hasWithStatement, spreadInCallCount, dynamicPropAccessCount };
}

/**
 * Check if an identifier is used as a property/key name rather than a standalone expression.
 * Covers: foo.arguments, { arguments: v }, { arguments }, arguments?: T, etc.
 */
function isPropertyName(n: ts.Identifier): boolean {
  const parent = n.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === n) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === n) return true;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === n) return true;
  if (ts.isBindingElement(parent) && parent.propertyName === n) return true;
  if (ts.isPropertySignature(parent) && parent.name === n) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === n) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === n) return true;
  if (ts.isMethodSignature(parent) && parent.name === n) return true;
  return false;
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
