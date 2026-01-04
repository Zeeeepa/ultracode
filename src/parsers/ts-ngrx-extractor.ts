/**
 * TypeScript NgRx Extractor
 *
 * Extracts NgRx patterns (effects, reducers, selectors, store usage)
 * from TypeScript AST nodes. Used by typescript-parser.ts.
 */

import ts from "typescript";

// =============================================================================
// TYPES
// =============================================================================

export interface NgRxEffectInfo {
  /** Actions listened via ofType() */
  listensTo: Array<{
    actionName: string;
    location: { line: number; column: number };
  }>;
  /** Services/methods called inside the effect */
  servicesCalled: Array<{
    serviceName: string;
    methodName: string;
    location: { line: number; column: number };
  }>;
  /** Actions dispatched inside the effect */
  dispatches: Array<{
    actionName: string;
    location: { line: number; column: number };
  }>;
  /** Whether the effect is dispatch: false */
  dispatchFalse: boolean;
}

export interface NgRxReducerInfo {
  /** Actions handled via on() */
  handlesActions: Array<{
    actionName: string;
    location: { line: number; column: number };
  }>;
}

export interface NgRxSelectorInfo {
  /** Selectors this selector depends on */
  dependsOn: Array<{
    selectorName: string;
    location: { line: number; column: number };
  }>;
  /** Feature selector name if this is createFeatureSelector */
  featureName?: string;
}

export interface NgRxStoreUsageInfo {
  /** Actions dispatched via store.dispatch() */
  dispatches: Array<{
    actionName: string;
    location: { line: number; column: number };
  }>;
  /** Selectors used via store.select() */
  selects: Array<{
    selectorName: string;
    location: { line: number; column: number };
  }>;
}

// =============================================================================
// EFFECT EXTRACTION
// =============================================================================

/**
 * Extract NgRx effect information from a createEffect() call expression
 * Detects: ofType(action), service calls, store.dispatch(action)
 */
export function extractNgRxEffectInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxEffectInfo | undefined {
  // Check if this is a createEffect() call
  if (!ts.isCallExpression(node)) return undefined;

  const callee = node.expression;
  if (!ts.isIdentifier(callee) || callee.text !== "createEffect") return undefined;

  const result: NgRxEffectInfo = {
    listensTo: [],
    servicesCalled: [],
    dispatches: [],
    dispatchFalse: false,
  };

  // Check for { dispatch: false } in second argument
  if (node.arguments.length >= 2) {
    const configArg = node.arguments[1];
    if (configArg && ts.isObjectLiteralExpression(configArg)) {
      for (const prop of configArg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "dispatch" &&
          prop.initializer.kind === ts.SyntaxKind.FalseKeyword
        ) {
          result.dispatchFalse = true;
        }
      }
    }
  }

  // Helper to check if node is 'this' keyword
  const isThisKeyword = (n: ts.Node): boolean => n.kind === ts.SyntaxKind.ThisKeyword;

  // Recursively search for patterns inside the effect
  function visitNode(n: ts.Node): void {
    // Look for ofType(action1, action2, ...)
    if (ts.isCallExpression(n)) {
      const calleeExpr = n.expression;

      // ofType(action) pattern
      if (ts.isIdentifier(calleeExpr) && calleeExpr.text === "ofType") {
        for (const arg of n.arguments) {
          const actionName = arg.getText(sourceFile);
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
          result.listensTo.push({
            actionName,
            location: { line: line + 1, column: character },
          });
        }
      }

      // map(() => actionName(...)) pattern - dispatched actions from effects
      if (ts.isIdentifier(calleeExpr) && calleeExpr.text === "map") {
        // Look for arrow function that returns action call
        for (const arg of n.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            // Find action calls in the function body
            const findActionCalls = (bodyNode: ts.Node): void => {
              if (ts.isCallExpression(bodyNode)) {
                const actionCallee = bodyNode.expression;
                // Check if it's a direct action call like actionName(...)
                if (ts.isIdentifier(actionCallee)) {
                  const name = actionCallee.text;
                  // Actions typically end with "Action" or contain "action"
                  if (name.endsWith("Action") || name.includes("action") || name.includes("Actions")) {
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(bodyNode.getStart(sourceFile));
                    result.dispatches.push({
                      actionName: name,
                      location: { line: line + 1, column: character },
                    });
                  }
                }
              }
              ts.forEachChild(bodyNode, findActionCalls);
            };
            findActionCalls(arg.body);
          }
        }
      }

      // this.service.method() pattern - service calls
      if (ts.isPropertyAccessExpression(calleeExpr)) {
        const objectExpr = calleeExpr.expression;
        const methodName = calleeExpr.name.text;

        // Check for this.serviceName.method()
        if (ts.isPropertyAccessExpression(objectExpr) && isThisKeyword(objectExpr.expression)) {
          const serviceName = objectExpr.name.text;
          // Filter out common non-service calls
          if (!["actions$", "store", "pipe", "subscribe"].includes(serviceName)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile));
            result.servicesCalled.push({
              serviceName,
              methodName,
              location: { line: line + 1, column: character },
            });
          }
        }

        // Check for this.store.dispatch(action) or store.dispatch(action)
        if (methodName === "dispatch") {
          if (
            (ts.isPropertyAccessExpression(objectExpr) &&
              isThisKeyword(objectExpr.expression) &&
              objectExpr.name.text === "store") ||
            (ts.isIdentifier(objectExpr) && objectExpr.text === "store")
          ) {
            for (const arg of n.arguments) {
              // Get action name from dispatch(actionName(...))
              if (ts.isCallExpression(arg)) {
                const actionName = arg.expression.getText(sourceFile);
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
                result.dispatches.push({
                  actionName,
                  location: { line: line + 1, column: character },
                });
              }
            }
          }
        }
      }
    }

    ts.forEachChild(n, visitNode);
  }

  visitNode(node);

  // Only return if we found something meaningful
  if (result.listensTo.length > 0 || result.servicesCalled.length > 0 || result.dispatches.length > 0) {
    return result;
  }

  return undefined;
}

// =============================================================================
// REDUCER EXTRACTION
// =============================================================================

/**
 * Extract NgRx reducer information from a createReducer() call expression
 * Detects: on(actionName, (state, payload) => ...)
 */
export function extractNgRxReducerInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxReducerInfo | undefined {
  if (!ts.isCallExpression(node)) return undefined;

  const callee = node.expression;
  if (!ts.isIdentifier(callee) || callee.text !== "createReducer") return undefined;

  const result: NgRxReducerInfo = { handlesActions: [] };

  // Iterate over arguments to find on() calls
  for (const arg of node.arguments) {
    if (ts.isCallExpression(arg)) {
      const argCallee = arg.expression;
      if (ts.isIdentifier(argCallee) && argCallee.text === "on") {
        // on(action1, action2, ..., reducerFn)
        // All arguments except the last one are actions
        for (let i = 0; i < arg.arguments.length - 1; i++) {
          const actionArg = arg.arguments[i];
          if (actionArg) {
            const actionName = actionArg.getText(sourceFile);
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(actionArg.getStart(sourceFile));
            result.handlesActions.push({
              actionName,
              location: { line: line + 1, column: character },
            });
          }
        }
      }
    }
  }

  return result.handlesActions.length > 0 ? result : undefined;
}

// =============================================================================
// SELECTOR EXTRACTION
// =============================================================================

/**
 * Extract NgRx selector information from createSelector() or createFeatureSelector() call
 */
export function extractNgRxSelectorInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxSelectorInfo | undefined {
  if (!ts.isCallExpression(node)) return undefined;

  const callee = node.expression;
  if (!ts.isIdentifier(callee)) return undefined;

  const result: NgRxSelectorInfo = { dependsOn: [] };

  if (callee.text === "createFeatureSelector") {
    // createFeatureSelector<State>('featureName')
    if (node.arguments.length > 0) {
      const featureArg = node.arguments[0];
      if (featureArg) {
        if (ts.isStringLiteral(featureArg)) {
          result.featureName = featureArg.text;
        } else {
          result.featureName = featureArg.getText(sourceFile);
        }
      }
    }
    return result;
  }

  if (callee.text === "createSelector") {
    // createSelector(selector1, selector2, ..., projectorFn)
    // All arguments except the last one are selectors
    for (let i = 0; i < node.arguments.length - 1; i++) {
      const selectorArg = node.arguments[i];
      if (selectorArg) {
        const selectorName = selectorArg.getText(sourceFile);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(selectorArg.getStart(sourceFile));
        result.dependsOn.push({
          selectorName,
          location: { line: line + 1, column: character },
        });
      }
    }
    return result.dependsOn.length > 0 || result.featureName ? result : undefined;
  }

  return undefined;
}

// =============================================================================
// STORE USAGE EXTRACTION (for components)
// =============================================================================

/**
 * Extract store.dispatch() and store.select() calls from a method/function body
 */
export function extractNgRxStoreUsage(node: ts.Node, sourceFile: ts.SourceFile): NgRxStoreUsageInfo {
  const result: NgRxStoreUsageInfo = { dispatches: [], selects: [] };

  const isThisKeyword = (n: ts.Node): boolean => n.kind === ts.SyntaxKind.ThisKeyword;

  function visitNode(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const calleeExpr = n.expression;

      if (ts.isPropertyAccessExpression(calleeExpr)) {
        const methodName = calleeExpr.name.text;
        const objectExpr = calleeExpr.expression;

        // Check for this.store.dispatch/select or store.dispatch/select
        const isStoreCall =
          (ts.isPropertyAccessExpression(objectExpr) &&
            isThisKeyword(objectExpr.expression) &&
            objectExpr.name.text === "store") ||
          (ts.isIdentifier(objectExpr) && objectExpr.text === "store");

        if (isStoreCall) {
          if (methodName === "dispatch") {
            for (const arg of n.arguments) {
              // dispatch(actionName(...)) or dispatch(actionName)
              let actionName: string;
              if (ts.isCallExpression(arg)) {
                actionName = arg.expression.getText(sourceFile);
              } else {
                actionName = arg.getText(sourceFile);
              }
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
              result.dispatches.push({
                actionName,
                location: { line: line + 1, column: character },
              });
            }
          } else if (methodName === "select") {
            for (const arg of n.arguments) {
              const selectorName = arg.getText(sourceFile);
              const { line, character } = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
              result.selects.push({
                selectorName,
                location: { line: line + 1, column: character },
              });
            }
          }
        }
      }
    }

    ts.forEachChild(n, visitNode);
  }

  visitNode(node);
  return result;
}
