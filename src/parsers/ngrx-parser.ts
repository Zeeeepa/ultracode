/**
 * NgRx/Redux State Management Parser
 *
 * Parses NgRx-specific constructs to enable event-driven flow tracing:
 * - createAction() → Action entity
 * - createEffect() → Effect entity with action listeners
 * - createReducer() → Reducer entity with action handlers
 * - createSelector() → Selector entity
 * - store.dispatch() → dispatches_action relationship
 * - store.select() → selects_state relationship
 *
 * This parser enables trace_flow to follow NgRx event chains:
 * Component.dispatch(action) → Effect.ofType(action) → Effect.dispatch(newAction)
 * → Reducer.on(newAction) → State.slice → Selector → Component.select(selector)
 */

import ts from "typescript";
import type { ParsedEntity } from "../types/parser.js";
import { buildNgRxEntities, buildNgRxRelationships } from "./ngrx/builders.js";
import type { NgRxAnalysis, NgRxReducerHandler, NgRxRelationship } from "./ngrx/types.js";

// Re-export builders
export { buildNgRxEntities, buildNgRxRelationships } from "./ngrx/builders.js";
// Re-export types for backwards compatibility
export type {
  NgRxAction,
  NgRxAnalysis,
  NgRxDispatch,
  NgRxEffect,
  NgRxReducer,
  NgRxReducerHandler,
  NgRxRelationship,
  NgRxSelect,
  NgRxSelector,
} from "./ngrx/types.js";

// =============================================================================
// NgRx PARSER CLASS
// =============================================================================

export class NgRxParser {
  private sourceFile: ts.SourceFile;
  private filePath: string;
  private analysis: NgRxAnalysis;
  private currentClass: string | null = null;

  constructor(sourceFile: ts.SourceFile, filePath: string) {
    this.sourceFile = sourceFile;
    this.filePath = filePath;
    this.analysis = {
      actions: [],
      effects: [],
      reducers: [],
      selectors: [],
      dispatches: [],
      selects: [],
    };
  }

  /**
   * Parse the source file for NgRx constructs
   */
  parse(): NgRxAnalysis {
    this.visit(this.sourceFile);
    return this.analysis;
  }

  /**
   * Visit AST node recursively
   */
  private visit(node: ts.Node): void {
    // Track current class context
    if (ts.isClassDeclaration(node) && node.name) {
      this.currentClass = node.name.text;
    }

    // createAction()
    if (this.isCreateAction(node)) {
      this.parseCreateAction(node as ts.CallExpression);
    }

    // createEffect()
    if (this.isCreateEffect(node)) {
      this.parseCreateEffect(node as ts.CallExpression);
    }

    // createReducer()
    if (this.isCreateReducer(node)) {
      this.parseCreateReducer(node as ts.CallExpression);
    }

    // createSelector() or createFeatureSelector()
    if (this.isCreateSelector(node)) {
      this.parseCreateSelector(node as ts.CallExpression);
    }

    // store.dispatch()
    if (this.isStoreDispatch(node)) {
      this.parseStoreDispatch(node as ts.CallExpression);
    }

    // store.select()
    if (this.isStoreSelect(node)) {
      this.parseStoreSelect(node as ts.CallExpression);
    }

    // @Effect() decorator (legacy)
    if (this.isEffectDecorator(node)) {
      this.parseLegacyEffect(node);
    }

    ts.forEachChild(node, (child) => this.visit(child));

    // Reset class context
    if (ts.isClassDeclaration(node)) {
      this.currentClass = null;
    }
  }

  // ===========================================================================
  // DETECTION METHODS
  // ===========================================================================

  private isCreateAction(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createAction";
  }

  private isCreateEffect(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createEffect";
  }

  private isCreateReducer(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createReducer";
  }

  private isCreateSelector(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false;
    if (!ts.isIdentifier(node.expression)) return false;
    const name = node.expression.text;
    return name === "createSelector" || name === "createFeatureSelector";
  }

  private isStoreDispatch(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false;
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    return node.expression.name.text === "dispatch";
  }

  private isStoreSelect(node: ts.Node): boolean {
    if (!ts.isCallExpression(node)) return false;
    if (!ts.isPropertyAccessExpression(node.expression)) return false;
    const name = node.expression.name.text;
    return name === "select" || name === "selectSignal";
  }

  private isEffectDecorator(node: ts.Node): boolean {
    if (!ts.isDecorator(node)) return false;
    const expr = node.expression;
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) {
      return expr.expression.text === "Effect";
    }
    if (ts.isIdentifier(expr)) {
      return expr.text === "Effect";
    }
    return false;
  }

  // ===========================================================================
  // PARSING METHODS
  // ===========================================================================

  /**
   * Parse createAction('type', props<...>())
   */
  private parseCreateAction(node: ts.CallExpression): void {
    const parent = node.parent;
    let actionName = "unknownAction";

    // Get action name from variable declaration
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      actionName = parent.name.text;
    }

    // Get action type string
    const typeArg = node.arguments[0];
    let actionType = "";
    if (typeArg && ts.isStringLiteral(typeArg)) {
      actionType = typeArg.text;
    }

    // Check for props
    let hasProps = false;
    let propsType: string | undefined;
    if (node.arguments.length > 1) {
      const propsArg = node.arguments[1];
      if (propsArg && ts.isCallExpression(propsArg)) {
        const propsExpr = propsArg.expression;
        if (ts.isIdentifier(propsExpr) && propsExpr.text === "props") {
          hasProps = true;
          // Extract type from props<T>()
          if (propsArg.typeArguments && propsArg.typeArguments.length > 0) {
            propsType = propsArg.typeArguments[0]!.getText(this.sourceFile);
          }
        }
      }
    }

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.actions.push({
      name: actionName,
      type: actionType,
      hasProps,
      propsType,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Parse createEffect(() => this.actions$.pipe(ofType(...), ...))
   */
  private parseCreateEffect(node: ts.CallExpression): void {
    const parent = node.parent;
    let effectName = "unknownEffect";

    // Get effect name from property/variable declaration
    if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
      effectName = parent.name.text;
    } else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      effectName = parent.name.text;
    }

    const listensTo: string[] = [];
    const dispatches: string[] = [];

    // Parse the effect function body
    const effectFn = node.arguments[0];
    if (effectFn) {
      this.extractEffectActions(effectFn, listensTo, dispatches);
    }

    // Check for { dispatch: false }
    let isRoot = true;
    if (node.arguments.length > 1) {
      const configArg = node.arguments[1];
      if (configArg && ts.isObjectLiteralExpression(configArg)) {
        for (const prop of configArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            if (prop.name.text === "dispatch" && prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
              isRoot = false;
            }
          }
        }
      }
    }

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.effects.push({
      name: effectName,
      listensTo,
      dispatches,
      isRoot,
      functional: true,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Extract ofType and dispatch actions from effect body
   */
  private extractEffectActions(node: ts.Node, listensTo: string[], dispatches: string[]): void {
    // Find ofType(...) calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      // ofType(action1, action2, ...)
      if (ts.isIdentifier(expr) && expr.text === "ofType") {
        for (const arg of node.arguments) {
          const actionName = this.extractActionName(arg);
          if (actionName) {
            listensTo.push(actionName);
          }
        }
      }

      // map/switchMap/etc returning action
      const mapOperators = ["map", "switchMap", "mergeMap", "concatMap", "exhaustMap"];
      if (ts.isIdentifier(expr) && mapOperators.includes(expr.text)) {
        // Look for returned actions
        this.findDispatchedActions(node, dispatches);
      }
    }

    ts.forEachChild(node, (child) => this.extractEffectActions(child, listensTo, dispatches));
  }

  /**
   * Find actions that are dispatched (returned from map operators)
   */
  private findDispatchedActions(node: ts.Node, dispatches: string[]): void {
    // Look for action() calls or action constructors
    if (ts.isCallExpression(node)) {
      const actionName = this.extractActionName(node.expression);
      if (actionName && !actionName.includes(".")) {
        // Likely an action creator call
        if (!dispatches.includes(actionName)) {
          dispatches.push(actionName);
        }
      }
    }

    ts.forEachChild(node, (child) => this.findDispatchedActions(child, dispatches));
  }

  /**
   * Parse createReducer(initialState, on(action, ...), ...)
   */
  private parseCreateReducer(node: ts.CallExpression): void {
    const parent = node.parent;
    let reducerName = "unknownReducer";
    let stateName = "state";

    // Get reducer name from variable declaration
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      reducerName = parent.name.text;
      // Infer state name from reducer name
      if (reducerName.endsWith("Reducer")) {
        stateName = reducerName.slice(0, -7); // Remove 'Reducer'
      }
    }

    const handlers: NgRxReducerHandler[] = [];

    // Parse on() handlers
    for (let i = 1; i < node.arguments.length; i++) {
      const arg = node.arguments[i];
      if (arg && ts.isCallExpression(arg)) {
        const handler = this.parseOnHandler(arg);
        if (handler) {
          handlers.push(handler);
        }
      }
    }

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.reducers.push({
      name: reducerName,
      stateName,
      handlers,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Parse on(action, (state, props) => ...)
   */
  private parseOnHandler(node: ts.CallExpression): NgRxReducerHandler | null {
    const expr = node.expression;
    if (!ts.isIdentifier(expr) || expr.text !== "on") {
      return null;
    }

    const actionArg = node.arguments[0];
    if (!actionArg) return null;

    const actionType = this.extractActionName(actionArg);
    if (!actionType) return null;

    // Analyze state changes in handler
    const stateChanges: string[] = [];
    const handlerFn = node.arguments[1];
    if (handlerFn) {
      this.extractStateChanges(handlerFn, stateChanges);
    }

    return { actionType, stateChanges };
  }

  /**
   * Extract state property changes from reducer handler
   */
  private extractStateChanges(node: ts.Node, changes: string[]): void {
    // Look for spread operators and property assignments
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const propName = node.name.text;
      if (!changes.includes(propName)) {
        changes.push(propName);
      }
    }

    // Look for { ...state, prop: value }
    if (ts.isShorthandPropertyAssignment(node)) {
      const propName = node.name.text;
      if (!changes.includes(propName)) {
        changes.push(propName);
      }
    }

    ts.forEachChild(node, (child) => this.extractStateChanges(child, changes));
  }

  /**
   * Parse createSelector(...) or createFeatureSelector(...)
   */
  private parseCreateSelector(node: ts.CallExpression): void {
    const parent = node.parent;
    let selectorName = "unknownSelector";

    // Get selector name from variable declaration
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      selectorName = parent.name.text;
    }

    const dependencies: string[] = [];
    let statePath: string | undefined;

    const isFeatureSelector = ts.isIdentifier(node.expression) && node.expression.text === "createFeatureSelector";

    if (isFeatureSelector) {
      // createFeatureSelector<State>('featureName')
      const featureArg = node.arguments[0];
      if (featureArg && ts.isStringLiteral(featureArg)) {
        statePath = `state.${featureArg.text}`;
      }
    } else {
      // createSelector(selector1, selector2, ..., projector)
      // All args except last are dependencies
      for (let i = 0; i < node.arguments.length - 1; i++) {
        const arg = node.arguments[i];
        if (arg) {
          const depName = this.extractSelectorName(arg);
          if (depName) {
            dependencies.push(depName);
          }
        }
      }
    }

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.selectors.push({
      name: selectorName,
      dependencies,
      statePath,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Parse this.store.dispatch(action())
   */
  private parseStoreDispatch(node: ts.CallExpression): void {
    const actionArg = node.arguments[0];
    if (!actionArg) return;

    let actionName = "unknownAction";
    let actionType: string | undefined;

    if (ts.isCallExpression(actionArg)) {
      // dispatch(loadTasks())
      actionName = this.extractActionName(actionArg.expression) || "unknownAction";
    } else if (ts.isIdentifier(actionArg)) {
      // dispatch(action) - variable
      actionName = actionArg.text;
    }

    // Find enclosing method/function
    const callerEntity = this.findEnclosingEntity(node);

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.dispatches.push({
      actionName,
      actionType,
      callerEntity,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Parse this.store.select(selector)
   */
  private parseStoreSelect(node: ts.CallExpression): void {
    const selectorArg = node.arguments[0];
    if (!selectorArg) return;

    let selectorName = "unknownSelector";

    if (ts.isIdentifier(selectorArg)) {
      selectorName = selectorArg.text;
    } else if (ts.isCallExpression(selectorArg)) {
      // select(selectFeature('name'))
      selectorName = this.extractSelectorName(selectorArg.expression) || "unknownSelector";
    }

    // Find enclosing method/function
    const callerEntity = this.findEnclosingEntity(node);

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.selects.push({
      selectorName,
      callerEntity,
      filePath: this.filePath,
      line,
    });
  }

  /**
   * Parse legacy @Effect() decorator
   */
  private parseLegacyEffect(node: ts.Node): void {
    // Find the property this decorator is attached to
    const parent = node.parent;
    if (!ts.isPropertyDeclaration(parent) || !ts.isIdentifier(parent.name)) {
      return;
    }

    const effectName = parent.name.text;
    const listensTo: string[] = [];
    const dispatches: string[] = [];

    // Parse the initializer (the effect Observable)
    if (parent.initializer) {
      this.extractEffectActions(parent.initializer, listensTo, dispatches);
    }

    const line = this.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    this.analysis.effects.push({
      name: effectName,
      listensTo,
      dispatches,
      isRoot: true,
      functional: false,
      filePath: this.filePath,
      line,
    });
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract action name from expression
   */
  private extractActionName(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) {
      return node.text;
    }
    if (ts.isPropertyAccessExpression(node)) {
      return node.name.text;
    }
    if (ts.isCallExpression(node)) {
      return this.extractActionName(node.expression);
    }
    return null;
  }

  /**
   * Extract selector name from expression
   */
  private extractSelectorName(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) {
      return node.text;
    }
    if (ts.isPropertyAccessExpression(node)) {
      return node.name.text;
    }
    return null;
  }

  /**
   * Find enclosing class.method or function name
   */
  private findEnclosingEntity(node: ts.Node): string {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
        const methodName = current.name.text;
        if (this.currentClass) {
          return `${this.currentClass}.${methodName}`;
        }
        return methodName;
      }

      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }

      if (ts.isPropertyDeclaration(current) && ts.isIdentifier(current.name)) {
        // Effect property
        const propName = current.name.text;
        if (this.currentClass) {
          return `${this.currentClass}.${propName}`;
        }
        return propName;
      }

      if (ts.isConstructorDeclaration(current)) {
        if (this.currentClass) {
          return `${this.currentClass}.constructor`;
        }
        return "constructor";
      }

      current = current.parent;
    }

    return this.currentClass || "unknown";
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Check if file likely contains NgRx code
 */
export function isNgRxFile(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = statement.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const moduleName = moduleSpecifier.text;
        if (moduleName.startsWith("@ngrx/")) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Parse file and return analysis + relationships
 */
export function parseNgRxFile(
  sourceFile: ts.SourceFile,
  filePath: string,
): {
  analysis: NgRxAnalysis;
  entities: ParsedEntity[];
  relationships: NgRxRelationship[];
} {
  const parser = new NgRxParser(sourceFile, filePath);
  const analysis = parser.parse();
  const entities = buildNgRxEntities(analysis);
  const relationships = buildNgRxRelationships(analysis);

  return { analysis, entities, relationships };
}
