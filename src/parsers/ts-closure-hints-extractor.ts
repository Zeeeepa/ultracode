/**
 * TypeScript Closure Hints Extractor
 *
 * Detects closure-related memory leak patterns by analyzing inner functions,
 * captured variables, and missing cleanup patterns:
 *
 * 1. Full object capture — closure uses only obj.prop but captures entire obj
 * 2. eval() in closure — forces engine to retain ALL outer scope variables
 * 3. Event listener without cleanup — addEventListener without removeEventListener
 * 4. Map instead of WeakMap — strong refs prevent GC of object keys
 * 5. Set instead of WeakSet — strong refs prevent GC of tracked objects
 * 6. No cleanup — captured reference never nulled after use
 *
 * Based on: https://habr.com/ru/articles/1020246/
 */

import ts from "typescript";

export interface ClosureHints {
  innerFunctionCount: number;
  capturedVarCount: number;
  fullObjectCaptureCount: number;
  evalInClosureCount: number;
  addListenerCount: number;
  removeListenerCount: number;
  mapNewCount: number;
  weakMapNewCount: number;
  setNewCount: number;
  weakSetNewCount: number;
}

/**
 * Extract closure-related memory leak hints from a function/method body.
 * Returns undefined if no closure-relevant patterns found (zero-cost for clean code).
 */
export function extractClosureHints(node: ts.Node, _sourceFile: ts.SourceFile): ClosureHints | undefined {
  let innerFunctionCount = 0;
  let capturedVarCount = 0;
  let fullObjectCaptureCount = 0;
  let evalInClosureCount = 0;
  let addListenerCount = 0;
  let removeListenerCount = 0;
  let mapNewCount = 0;
  let weakMapNewCount = 0;
  let setNewCount = 0;
  let weakSetNewCount = 0;

  // ─── Pass 1: Collect outer scope bindings ────────────────────────

  const outerBindings = new Set<string>();

  // Parameters of the outer function
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    for (const param of node.parameters) {
      collectBindingNames(param.name, outerBindings);
    }
  }

  // Local variables declared at the top level of the function body (not inside inner functions)
  const body = getBody(node);
  if (body) {
    collectTopLevelBindings(body, outerBindings);
  }

  // If the function has no bindings that inner functions could capture, skip expensive analysis
  if (outerBindings.size === 0) {
    // Still check for Map/WeakMap/Set/WeakSet and listeners even without closures
    if (body) {
      collectNonClosureHints(body, {
        addListenerCount: () => addListenerCount++,
        removeListenerCount: () => removeListenerCount++,
        mapNewCount: () => mapNewCount++,
        weakMapNewCount: () => weakMapNewCount++,
        setNewCount: () => setNewCount++,
        weakSetNewCount: () => weakSetNewCount++,
      });
    }
    return buildResult();
  }

  // ─── Pass 2: Analyze inner functions for captured variables ──────

  if (body) {
    visitForInnerFunctions(body, node);
  }

  // ─── Pass 3: Count addEventListener/removeEventListener + Map/WeakMap/Set/WeakSet ──

  if (body) {
    collectNonClosureHints(body, {
      addListenerCount: () => addListenerCount++,
      removeListenerCount: () => removeListenerCount++,
      mapNewCount: () => mapNewCount++,
      weakMapNewCount: () => weakMapNewCount++,
      setNewCount: () => setNewCount++,
      weakSetNewCount: () => weakSetNewCount++,
    });
  }

  return buildResult();

  // ─── Inner helpers ───────────────────────────────────────────────

  function buildResult(): ClosureHints | undefined {
    if (
      innerFunctionCount === 0 &&
      capturedVarCount === 0 &&
      fullObjectCaptureCount === 0 &&
      evalInClosureCount === 0 &&
      addListenerCount === 0 &&
      removeListenerCount === 0 &&
      mapNewCount === 0 &&
      weakMapNewCount === 0 &&
      setNewCount === 0 &&
      weakSetNewCount === 0
    ) {
      return undefined;
    }

    return {
      innerFunctionCount,
      capturedVarCount,
      fullObjectCaptureCount,
      evalInClosureCount,
      addListenerCount,
      removeListenerCount,
      mapNewCount,
      weakMapNewCount,
      setNewCount,
      weakSetNewCount,
    };
  }

  /**
   * Recursively find inner functions, analyze their captured variables.
   * Skips the outer function itself.
   */
  function visitForInnerFunctions(n: ts.Node, outerNode: ts.Node): void {
    if (n !== outerNode && isFunction(n)) {
      innerFunctionCount++;
      analyzeInnerFunction(n);
      // Don't recurse into nested functions — they are separate closures
      return;
    }

    ts.forEachChild(n, (child) => visitForInnerFunctions(child, outerNode));
  }

  /**
   * Analyze a single inner function: find captured vars, eval, full-object captures.
   */
  function analyzeInnerFunction(innerFn: ts.Node): void {
    // Collect inner function's own bindings (to detect shadowing)
    const innerBindings = new Set<string>();
    if (
      ts.isFunctionDeclaration(innerFn) ||
      ts.isFunctionExpression(innerFn) ||
      ts.isArrowFunction(innerFn) ||
      ts.isMethodDeclaration(innerFn)
    ) {
      for (const param of innerFn.parameters) {
        collectBindingNames(param.name, innerBindings);
      }
    }
    const innerBody = getBody(innerFn);
    if (innerBody) {
      collectTopLevelBindings(innerBody, innerBindings);
    }

    // Track how each captured var is used:
    // capturedUsage[varName] = { bareCount, propertyAccessCount }
    const capturedUsage = new Map<string, { bareCount: number; propAccessCount: number }>();

    function visitInner(n: ts.Node): void {
      // Don't recurse into further nested functions
      if (n !== innerFn && isFunction(n)) return;

      // Check for eval() call
      if (ts.isCallExpression(n)) {
        const fnExpr = n.expression;
        if (ts.isIdentifier(fnExpr) && fnExpr.text === "eval") {
          evalInClosureCount++;
        }
      }

      // Check identifier references
      if (ts.isIdentifier(n)) {
        const name = n.text;
        // Is this an outer binding that's not shadowed?
        if (outerBindings.has(name) && !innerBindings.has(name) && !isPropertyName(n)) {
          let usage = capturedUsage.get(name);
          if (!usage) {
            usage = { bareCount: 0, propAccessCount: 0 };
            capturedUsage.set(name, usage);
          }

          // Check if this identifier is used as object in property access: name.prop
          if (isObjectOfPropertyAccess(n)) {
            usage.propAccessCount++;
          } else {
            usage.bareCount++;
          }
        }
      }

      ts.forEachChild(n, visitInner);
    }

    const walkTarget = innerBody ?? innerFn;
    ts.forEachChild(walkTarget, visitInner);

    // Tally captured vars
    for (const [, usage] of capturedUsage) {
      capturedVarCount++;
      // Full object capture: only used via .prop, never bare
      if (usage.propAccessCount > 0 && usage.bareCount === 0) {
        fullObjectCaptureCount++;
      }
    }
  }
}

// ─── Non-closure hints (can exist without inner functions) ─────────

interface HintCallbacks {
  addListenerCount: () => void;
  removeListenerCount: () => void;
  mapNewCount: () => void;
  weakMapNewCount: () => void;
  setNewCount: () => void;
  weakSetNewCount: () => void;
}

function collectNonClosureHints(body: ts.Node, cb: HintCallbacks): void {
  function visit(n: ts.Node): void {
    // Skip nested function scopes
    if (isFunction(n)) return;

    // addEventListener / removeEventListener / on / off / subscribe / unsubscribe
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      if (method === "addEventListener" || method === "on" || method === "addListener" || method === "subscribe") {
        cb.addListenerCount();
      } else if (
        method === "removeEventListener" ||
        method === "off" ||
        method === "removeListener" ||
        method === "unsubscribe"
      ) {
        cb.removeListenerCount();
      }
    }

    // new Map() / new WeakMap() / new Set() / new WeakSet()
    if (ts.isNewExpression(n)) {
      const ctorName = n.expression.getText();
      switch (ctorName) {
        case "Map":
          cb.mapNewCount();
          break;
        case "WeakMap":
          cb.weakMapNewCount();
          break;
        case "Set":
          cb.setNewCount();
          break;
        case "WeakSet":
          cb.weakSetNewCount();
          break;
      }
    }

    ts.forEachChild(n, visit);
  }

  ts.forEachChild(body, visit);
}

// ─── Helpers ────────────────────────────────────────────────────────

function isFunction(n: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isConstructorDeclaration(n)
  );
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

/**
 * Collect all binding names from a BindingName (handles destructuring).
 */
function collectBindingNames(name: ts.BindingName, target: Set<string>): void {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
  } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, target);
      }
    }
  }
}

/**
 * Collect top-level variable bindings in a block (not inside nested functions).
 */
function collectTopLevelBindings(block: ts.Node, target: Set<string>): void {
  ts.forEachChild(block, (n) => {
    // Variable declarations: let x, const y, var z
    if (ts.isVariableStatement(n)) {
      for (const decl of n.declarationList.declarations) {
        collectBindingNames(decl.name, target);
      }
    }
    // Don't recurse into nested functions — their bindings are their own scope
  });
}

/**
 * Check if an identifier is a property name (right side of obj.prop or key in { prop: val }).
 */
function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Property name in property access: obj.prop — `prop` is property name, not identifier
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;

  // Property name in object literal: { prop: val }
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;

  // Short-hand property: { prop } — this IS a reference to `prop`
  if (ts.isShorthandPropertyAssignment(parent)) return false;

  // Label name
  if (ts.isLabeledStatement(parent) && parent.label === node) return true;

  // Method name
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;

  return false;
}

/**
 * Check if an identifier is the object part of a property access: identifier.prop
 * (as opposed to obj.identifier)
 */
function isObjectOfPropertyAccess(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // obj.prop — node is `obj` (the expression, not the name)
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return true;

  return false;
}
