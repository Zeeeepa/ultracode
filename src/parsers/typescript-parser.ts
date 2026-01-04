/**
 * TypeScript Native Parser
 *
 * Uses TypeScript Compiler API for parsing JavaScript/TypeScript/JSX/TSX files.
 * Provides full AST with type information, replacing tree-sitter for JS/TS.
 *
 * Architecture:
 * - ts.createSourceFile() for fast syntax-only parsing
 * - ts.createProgram() + TypeChecker for full type analysis (optional)
 * - Extracts entities compatible with ParseResult interface
 *
 * No native modules required - pure TypeScript implementation.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity, ParseResult } from "../types/parser.js";
import { enhanceWithAngularInfo, isAngularFile } from "./angular-parser.js";
import { isNgRxFile, parseNgRxFile } from "./ngrx-parser.js";
// AST helpers extracted to reduce file size
import {
  getDecorators,
  getExtension,
  getLanguage,
  getLocation,
  getModifiers,
  getParameters,
  getReturnType,
  SCRIPT_KINDS,
  SCRIPT_TARGETS,
} from "./ts-ast-helpers.js";
// Call and type reference extraction
import { extractCalls, extractTypeReferences } from "./ts-call-extractor.js";
// Complexity analysis
import { extractComplexity } from "./ts-complexity-analyzer.js";
// =============================================================================
// CONTROL FLOW EXTRACTION (Phase 2)
// =============================================================================

type ControlFlow = NonNullable<ParsedEntity["controlFlow"]>;
type BranchInfo = ControlFlow["branches"][number];
type LoopInfo = ControlFlow["loops"][number];
type ExceptionInfo = ControlFlow["exceptions"][number];
type ReturnInfo = ControlFlow["returns"][number];
type AwaitInfo = ControlFlow["awaits"][number];

/**
 * Extract control flow structure from a function/method body
 */
function extractControlFlow(node: ts.Node, sourceFile: ts.SourceFile): ControlFlow | undefined {
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

// =============================================================================
// JSDOC EXTRACTION (Phase 3)
// =============================================================================

type Documentation = NonNullable<ParsedEntity["documentation"]>;

/**
 * Extract JSDoc documentation from a node
 */
function extractDocumentation(node: ts.Node, sourceFile: ts.SourceFile): Documentation | undefined {
  // Get JSDoc comments attached to the node
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return undefined;

  let description: string | undefined;
  const params: NonNullable<Documentation["params"]> = [];
  let returns: Documentation["returns"];
  const throws: NonNullable<Documentation["throws"]> = [];
  const examples: string[] = [];
  let deprecated: string | boolean | undefined;
  const see: string[] = [];
  let since: string | undefined;
  let author: string | undefined;

  for (const jsDoc of jsDocs) {
    if (ts.isJSDoc(jsDoc)) {
      // Main description
      if (jsDoc.comment) {
        const commentText =
          typeof jsDoc.comment === "string" ? jsDoc.comment : jsDoc.comment.map((c) => c.text).join("");
        if (commentText && !description) {
          description = commentText.trim();
        }
      }

      // Process tags
      if (jsDoc.tags) {
        for (const tag of jsDoc.tags) {
          const tagName = tag.tagName.text.toLowerCase();
          const tagComment = tag.comment
            ? typeof tag.comment === "string"
              ? tag.comment
              : tag.comment.map((c) => c.text).join("")
            : undefined;

          switch (tagName) {
            case "param":
            case "arg":
            case "argument":
              if (ts.isJSDocParameterTag(tag)) {
                const paramName = tag.name.getText(sourceFile);
                const paramType = tag.typeExpression?.type.getText(sourceFile);
                const paramDesc = tagComment?.trim();
                const isOptional = tag.isBracketed || paramName.startsWith("[");
                params.push({
                  name: paramName.replace(/^\[|\]$/g, "").split("=")[0] ?? paramName,
                  type: paramType,
                  description: paramDesc,
                  ...(isOptional && { optional: isOptional }),
                });
              }
              break;

            case "returns":
            case "return":
              if (ts.isJSDocReturnTag(tag)) {
                returns = {
                  type: tag.typeExpression?.type.getText(sourceFile),
                  description: tagComment?.trim(),
                };
              }
              break;

            case "throws":
            case "exception":
              throws.push({
                type: ts.isJSDocThrowsTag(tag) ? tag.typeExpression?.type.getText(sourceFile) : undefined,
                description: tagComment?.trim(),
              });
              break;

            case "example":
              if (tagComment) {
                examples.push(tagComment.trim());
              }
              break;

            case "deprecated":
              deprecated = tagComment?.trim() || true;
              break;

            case "see":
              if (tagComment) {
                see.push(tagComment.trim());
              }
              break;

            case "since":
            case "version":
              since = tagComment?.trim();
              break;

            case "author":
              author = tagComment?.trim();
              break;

            case "description":
            case "desc":
              if (tagComment && !description) {
                description = tagComment.trim();
              }
              break;
          }
        }
      }
    }
  }

  // Only return if there's meaningful documentation
  if (
    !description &&
    params.length === 0 &&
    !returns &&
    throws.length === 0 &&
    examples.length === 0 &&
    deprecated === undefined &&
    see.length === 0 &&
    !since &&
    !author
  ) {
    return undefined;
  }

  return {
    description,
    ...(params.length > 0 && { params: params }),
    returns,
    ...(throws.length > 0 && { throws: throws }),
    ...(examples.length > 0 && { examples: examples }),
    deprecated,
    ...(see.length > 0 && { see: see }),
    since,
    author,
  };
}

// =============================================================================
// NGRX EFFECT EXTRACTION
// =============================================================================

interface NgRxEffectInfo {
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

/**
 * Extract NgRx effect information from a createEffect() call expression
 * Detects: ofType(action), service calls, store.dispatch(action)
 */
function extractNgRxEffectInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxEffectInfo | undefined {
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
// NGRX REDUCER EXTRACTION
// =============================================================================

interface NgRxReducerInfo {
  /** Actions handled via on() */
  handlesActions: Array<{
    actionName: string;
    location: { line: number; column: number };
  }>;
}

/**
 * Extract NgRx reducer information from a createReducer() call expression
 * Detects: on(actionName, (state, payload) => ...)
 */
function extractNgRxReducerInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxReducerInfo | undefined {
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
// NGRX SELECTOR EXTRACTION
// =============================================================================

interface NgRxSelectorInfo {
  /** Selectors this selector depends on */
  dependsOn: Array<{
    selectorName: string;
    location: { line: number; column: number };
  }>;
  /** Feature selector name if this is createFeatureSelector */
  featureName?: string;
}

/**
 * Extract NgRx selector information from createSelector() or createFeatureSelector() call
 */
function extractNgRxSelectorInfo(node: ts.Node, sourceFile: ts.SourceFile): NgRxSelectorInfo | undefined {
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
// NGRX DISPATCH/SELECT EXTRACTION (for components)
// =============================================================================

interface NgRxStoreUsageInfo {
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

/**
 * Extract store.dispatch() and store.select() calls from a method/function body
 */
function extractNgRxStoreUsage(node: ts.Node, sourceFile: ts.SourceFile): NgRxStoreUsageInfo {
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

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

interface ExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  /** Current parent entity name for contains relationships */
  parentEntity?: string;
}

function extractEntities(ctx: ExtractorContext, node: ts.Node): void {
  const { sourceFile, filePath, entities, relationships } = ctx;

  // Helper to create calls relationships for standalone functions
  const addFunctionCallRelationships = (functionName: string, calls: CallInfo[]): void => {
    for (const call of calls) {
      const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
      relationships.push({
        from: functionName,
        to: calledTarget,
        type: "calls",
        sourceFile: filePath,
        metadata: {
          line: call.location.start.line,
          isAwait: call.isAwait,
          isNew: call.isNew,
          argumentCount: call.argumentCount,
        },
      });
    }
  };

  // Helper to create references relationships from type references
  const addTypeReferenceRelationships = (entityName: string, typeRefs: TypeReference[] | undefined): void => {
    if (!typeRefs) return;
    for (const ref of typeRefs) {
      // Skip if this is an extends/implements (already handled by inherits/implements)
      if (ref.kind === "extends" || ref.kind === "implements") continue;
      relationships.push({
        from: entityName,
        to: ref.name,
        type: "references",
        sourceFile: filePath,
        metadata: {
          line: ref.location.start.line,
          referenceKind: ref.kind, // parameter, return, generic, property, variable
        },
      });
    }
  };

  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    const functionName = node.name.text;
    const modifiers = getModifiers(node);
    const isAsync = modifiers.includes("async");
    const calls = extractCalls(node, sourceFile);
    const controlFlow = extractControlFlow(node, sourceFile);
    const documentation = extractDocumentation(node, sourceFile);
    const typeRefs = extractTypeReferences(node, sourceFile);
    const complexity = extractComplexity(node, sourceFile);

    entities.push({
      name: functionName,
      type: isAsync ? "async_function" : "function",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers,
      parameters: getParameters(node, sourceFile),
      returnType: getReturnType(node, sourceFile),
      decorators: getDecorators(node, sourceFile),
      ...(calls.length > 0 && { calls: calls }),
      controlFlow,
      documentation,
      typeReferences: typeRefs,
      complexity,
    });

    // Add calls relationships for this function
    if (calls.length > 0) {
      addFunctionCallRelationships(functionName, calls);
    }

    // Add type references relationships
    addTypeReferenceRelationships(functionName, typeRefs);
  }

  // Arrow functions and function expressions assigned to variables
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        const name = decl.name.getText(sourceFile);
        const modifiers = getModifiers(node);
        const isAsync =
          modifiers.includes("async") ||
          (ts.canHaveModifiers(decl.initializer) &&
            ts.getModifiers(decl.initializer)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
        const calls = extractCalls(decl.initializer, sourceFile);
        const controlFlow = extractControlFlow(decl.initializer, sourceFile);
        const documentation = extractDocumentation(node, sourceFile);
        const typeRefs = extractTypeReferences(decl.initializer, sourceFile);
        const complexity = extractComplexity(decl.initializer, sourceFile);

        entities.push({
          name,
          type: isAsync ? "async_function" : "function",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: [...modifiers, ...(isAsync ? ["async"] : [])],
          parameters: getParameters(decl.initializer, sourceFile),
          returnType: getReturnType(decl.initializer, sourceFile),
          ...(calls.length > 0 && { calls: calls }),
          controlFlow,
          documentation,
          typeReferences: typeRefs,
          complexity,
        });

        // Add calls relationships for arrow/function expressions
        if (calls.length > 0) {
          addFunctionCallRelationships(name, calls);
        }

        // Add type references relationships
        addTypeReferenceRelationships(name, typeRefs);
      } else if (decl.name && ts.isIdentifier(decl.name)) {
        // Check for NgRx patterns in initializer
        const varName = decl.name.text;
        const modifiers = getModifiers(node);
        const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
        const varLocation = getLocation(sourceFile, decl);

        // Check for NgRx reducer: createReducer(...)
        let reducerInfo: NgRxReducerInfo | undefined;
        if (decl.initializer) {
          reducerInfo = extractNgRxReducerInfo(decl.initializer, sourceFile);
        }

        // Check for NgRx selector: createSelector(...) or createFeatureSelector(...)
        let selectorInfo: NgRxSelectorInfo | undefined;
        if (decl.initializer) {
          selectorInfo = extractNgRxSelectorInfo(decl.initializer, sourceFile);
        }

        if (reducerInfo) {
          // NgRx Reducer
          const reducerEntity: ParsedEntity = {
            name: varName,
            type: "ngrx_reducer",
            filePath,
            location: varLocation,
            modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
            metadata: {
              ngrxReducer: {
                handlesActions: reducerInfo.handlesActions.map((a) => a.actionName),
              },
            },
          };
          entities.push(reducerEntity);

          // Create "reduces" relationships for each action
          for (const action of reducerInfo.handlesActions) {
            relationships.push({
              from: varName,
              to: action.actionName,
              type: "reduces",
              sourceFile: filePath,
              metadata: {
                line: action.location.line,
                relationKind: "ngrx_reducer_handler",
              },
            });
          }
        } else if (selectorInfo) {
          // NgRx Selector
          const selectorEntity: ParsedEntity = {
            name: varName,
            type: "ngrx_selector",
            filePath,
            location: varLocation,
            modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
            metadata: {
              ngrxSelector: {
                dependsOn: selectorInfo.dependsOn.map((s) => s.selectorName),
                featureName: selectorInfo.featureName,
              },
            },
          };
          entities.push(selectorEntity);

          // Create "selects" relationships for each dependency
          for (const dep of selectorInfo.dependsOn) {
            relationships.push({
              from: varName,
              to: dep.selectorName,
              type: "selects",
              sourceFile: filePath,
              metadata: {
                line: dep.location.line,
                relationKind: "ngrx_selector_dependency",
              },
            });
          }
        } else {
          // Regular variable/constant
          entities.push({
            name: varName,
            type: isConst ? "constant" : "variable",
            filePath,
            location: varLocation,
            modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
          });
        }
      }
    }
  }

  // Class declarations
  if (ts.isClassDeclaration(node) && node.name) {
    const className = node.name.text;
    const modifiers = getModifiers(node);

    // Extract base classes
    const baseClasses: string[] = [];
    const interfaces: string[] = [];
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const type of clause.types) {
          const typeName = type.expression.getText(sourceFile);
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            baseClasses.push(typeName);
          } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            interfaces.push(typeName);
          }
        }
      }
    }

    const classDocumentation = extractDocumentation(node, sourceFile);
    const classTypeRefs = extractTypeReferences(node, sourceFile);
    const classLocation = getLocation(sourceFile, node);
    const classEntity: ParsedEntity = {
      name: className,
      type: "class",
      filePath,
      location: classLocation,
      modifiers,
      decorators: getDecorators(node, sourceFile),
      inheritance:
        baseClasses.length > 0 || interfaces.length > 0
          ? {
              baseClasses,
              ...(interfaces.length > 0 && { interfaces: interfaces }),
              isAbstract: modifiers.includes("abstract"),
            }
          : undefined,
      documentation: classDocumentation,
      typeReferences: classTypeRefs,
      children: [],
    };

    // Create inheritance relationships
    for (const baseClass of baseClasses) {
      relationships.push({
        from: className,
        to: baseClass,
        type: "inherits",
        sourceFile: filePath,
        metadata: {
          line: classLocation.start.line,
          isDirectRelation: true,
        },
      });
    }

    // Create implements relationships
    for (const iface of interfaces) {
      relationships.push({
        from: className,
        to: iface,
        type: "implements",
        sourceFile: filePath,
        metadata: {
          line: classLocation.start.line,
          isDirectRelation: true,
        },
      });
    }

    // Create decorates relationships for class decorators
    const classDecorators = getDecorators(node, sourceFile);
    if (classDecorators) {
      for (const dec of classDecorators) {
        relationships.push({
          from: dec.name,
          to: className,
          type: "decorates",
          sourceFile: filePath,
          metadata: {
            line: classLocation.start.line,
            decoratorArguments: dec.arguments,
          },
        });
      }
    }

    // Add type references relationships for class (excluding extends/implements)
    addTypeReferenceRelationships(className, classTypeRefs);

    // Helper to add contains + calls relationships for a member
    const addMemberRelationships = (
      memberName: string,
      memberLocation: ParsedEntity["location"],
      calls: CallInfo[] | undefined,
    ): void => {
      // Contains relationship: class -> member
      relationships.push({
        from: className,
        to: memberName,
        type: "contains",
        sourceFile: filePath,
        metadata: {
          line: memberLocation.start.line,
          isDirectRelation: true,
        },
      });

      // Calls relationships from this member
      if (calls) {
        for (const call of calls) {
          const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
          relationships.push({
            from: `${className}.${memberName}`,
            to: calledTarget,
            type: "calls",
            sourceFile: filePath,
            metadata: {
              line: call.location.start.line,
              isAwait: call.isAwait,
              isNew: call.isNew,
              argumentCount: call.argumentCount,
            },
          });
        }
      }
    };

    // Extract class members
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member) && member.name) {
        const methodName = member.name.getText(sourceFile);
        const methodModifiers = getModifiers(member);
        const isAsync = methodModifiers.includes("async");
        const methodCalls = extractCalls(member, sourceFile);
        const methodControlFlow = extractControlFlow(member, sourceFile);
        const methodDoc = extractDocumentation(member, sourceFile);
        const methodTypeRefs = extractTypeReferences(member, sourceFile);
        const methodComplexity = extractComplexity(member, sourceFile);
        const methodLocation = getLocation(sourceFile, member);

        const methodDecorators = getDecorators(member, sourceFile);

        // Extract NgRx store.dispatch() and store.select() calls
        const ngrxStoreUsage = extractNgRxStoreUsage(member, sourceFile);

        classEntity.children!.push({
          name: methodName,
          type: isAsync ? "async_function" : "method",
          filePath,
          location: methodLocation,
          modifiers: methodModifiers,
          parameters: getParameters(member, sourceFile),
          returnType: getReturnType(member, sourceFile),
          decorators: methodDecorators,
          ...(methodCalls.length > 0 && { calls: methodCalls }),
          controlFlow: methodControlFlow,
          documentation: methodDoc,
          typeReferences: methodTypeRefs,
          complexity: methodComplexity,
          metadata:
            ngrxStoreUsage.dispatches.length > 0 || ngrxStoreUsage.selects.length > 0
              ? {
                  ngrxStoreUsage: {
                    dispatches: ngrxStoreUsage.dispatches.map((d) => d.actionName),
                    selects: ngrxStoreUsage.selects.map((s) => s.selectorName),
                  },
                }
              : undefined,
        });

        addMemberRelationships(methodName, methodLocation, methodCalls);

        // Add NgRx dispatches relationships
        for (const dispatch of ngrxStoreUsage.dispatches) {
          relationships.push({
            from: `${className}.${methodName}`,
            to: dispatch.actionName,
            type: "dispatches",
            sourceFile: filePath,
            metadata: {
              line: dispatch.location.line,
              relationKind: "ngrx_dispatch",
            },
          });
        }

        // Add NgRx selects relationships
        for (const sel of ngrxStoreUsage.selects) {
          relationships.push({
            from: `${className}.${methodName}`,
            to: sel.selectorName,
            type: "selects",
            sourceFile: filePath,
            metadata: {
              line: sel.location.line,
              relationKind: "ngrx_select",
            },
          });
        }

        // Create overrides relationship if method has 'override' modifier
        if (methodModifiers.includes("override") && baseClasses.length > 0) {
          // We don't know exact base class at syntax level, use first base class
          relationships.push({
            from: `${className}.${methodName}`,
            to: `${baseClasses[0]}.${methodName}`,
            type: "overrides",
            sourceFile: filePath,
            metadata: {
              line: methodLocation.start.line,
            },
          });
        }

        // Create decorates relationships for method decorators
        if (methodDecorators) {
          for (const dec of methodDecorators) {
            relationships.push({
              from: dec.name,
              to: `${className}.${methodName}`,
              type: "decorates",
              sourceFile: filePath,
              metadata: {
                line: methodLocation.start.line,
                decoratorArguments: dec.arguments,
              },
            });
          }
        }

        // Add type references relationships for method
        addTypeReferenceRelationships(`${className}.${methodName}`, methodTypeRefs);
      } else if (ts.isPropertyDeclaration(member) && member.name) {
        const propName = member.name.getText(sourceFile);
        const propDoc = extractDocumentation(member, sourceFile);
        const propTypeRefs = extractTypeReferences(member, sourceFile);
        const propLocation = getLocation(sourceFile, member);

        // Check if this is an NgRx effect (property initialized with createEffect())
        let ngrxEffectInfo: NgRxEffectInfo | undefined;
        let entityType: ParsedEntity["type"] = "property";

        if (member.initializer) {
          ngrxEffectInfo = extractNgRxEffectInfo(member.initializer, sourceFile);
          // DEBUG: Log NgRx effect detection
          if (ngrxEffectInfo) {
            console.error(
              `[NgRx] Found effect: ${className}.${propName}, listensTo: ${ngrxEffectInfo.listensTo.map((a) => a.actionName).join(", ")}`,
            );
            entityType = "ngrx_effect";
          }
        }

        const propEntity: ParsedEntity = {
          name: propName,
          type: entityType,
          filePath,
          location: propLocation,
          modifiers: getModifiers(member),
          documentation: propDoc,
          typeReferences: propTypeRefs,
        };

        // Add NgRx-specific metadata
        if (ngrxEffectInfo) {
          propEntity.metadata = {
            ...propEntity.metadata,
            ngrxEffect: {
              listensTo: ngrxEffectInfo.listensTo.map((a) => a.actionName),
              dispatches: ngrxEffectInfo.dispatches.map((a) => a.actionName),
              dispatchFalse: ngrxEffectInfo.dispatchFalse,
              servicesCalled: ngrxEffectInfo.servicesCalled.map((s) => `${s.serviceName}.${s.methodName}`),
            },
          };

          // Create "listens_to" relationships for actions
          for (const action of ngrxEffectInfo.listensTo) {
            relationships.push({
              from: `${className}.${propName}`,
              to: action.actionName,
              type: "listens_to",
              sourceFile: filePath,
              metadata: {
                line: action.location.line,
                relationKind: "ngrx_action_listener",
              },
            });
          }

          // Create "dispatches" relationships for dispatched actions
          for (const action of ngrxEffectInfo.dispatches) {
            relationships.push({
              from: `${className}.${propName}`,
              to: action.actionName,
              type: "dispatches",
              sourceFile: filePath,
              metadata: {
                line: action.location.line,
                relationKind: "ngrx_action_dispatch",
              },
            });
          }

          // Create "calls" relationships for service methods
          for (const service of ngrxEffectInfo.servicesCalled) {
            relationships.push({
              from: `${className}.${propName}`,
              to: `${service.serviceName}.${service.methodName}`,
              type: "calls",
              sourceFile: filePath,
              metadata: {
                line: service.location.line,
                isNgrxEffect: true,
                relationKind: "ngrx_service_call",
              },
            });
          }
        }

        classEntity.children!.push(propEntity);

        // Contains relationship for properties
        relationships.push({
          from: className,
          to: propName,
          type: "contains",
          sourceFile: filePath,
          metadata: {
            line: propLocation.start.line,
            isDirectRelation: true,
            memberType: ngrxEffectInfo ? "ngrx_effect" : "property",
          },
        });

        // Add type references relationships for property
        addTypeReferenceRelationships(`${className}.${propName}`, propTypeRefs);
      } else if (ts.isConstructorDeclaration(member)) {
        const constructorCalls = extractCalls(member, sourceFile);
        const constructorControlFlow = extractControlFlow(member, sourceFile);
        const constructorDoc = extractDocumentation(member, sourceFile);
        const constructorTypeRefs = extractTypeReferences(member, sourceFile);
        const constructorComplexity = extractComplexity(member, sourceFile);
        const constructorLocation = getLocation(sourceFile, member);

        classEntity.children!.push({
          name: "constructor",
          type: "method",
          filePath,
          location: constructorLocation,
          modifiers: getModifiers(member),
          parameters: getParameters(member, sourceFile),
          ...(constructorCalls.length > 0 && { calls: constructorCalls }),
          controlFlow: constructorControlFlow,
          documentation: constructorDoc,
          typeReferences: constructorTypeRefs,
          complexity: constructorComplexity,
        });

        addMemberRelationships("constructor", constructorLocation, constructorCalls);

        // Add type references relationships for constructor
        addTypeReferenceRelationships(`${className}.constructor`, constructorTypeRefs);
      } else if (ts.isGetAccessor(member) && member.name) {
        const getterName = member.name.getText(sourceFile);
        const getterCalls = extractCalls(member, sourceFile);
        const getterControlFlow = extractControlFlow(member, sourceFile);
        const getterDoc = extractDocumentation(member, sourceFile);
        const getterTypeRefs = extractTypeReferences(member, sourceFile);
        const getterComplexity = extractComplexity(member, sourceFile);
        const getterLocation = getLocation(sourceFile, member);

        classEntity.children!.push({
          name: getterName,
          type: "property",
          filePath,
          location: getterLocation,
          modifiers: [...getModifiers(member), "getter"],
          returnType: getReturnType(member, sourceFile),
          ...(getterCalls.length > 0 && { calls: getterCalls }),
          controlFlow: getterControlFlow,
          documentation: getterDoc,
          typeReferences: getterTypeRefs,
          complexity: getterComplexity,
        });

        addMemberRelationships(getterName, getterLocation, getterCalls);

        // Add type references relationships for getter
        addTypeReferenceRelationships(`${className}.${getterName}`, getterTypeRefs);
      } else if (ts.isSetAccessor(member) && member.name) {
        const setterName = member.name.getText(sourceFile);
        const setterCalls = extractCalls(member, sourceFile);
        const setterControlFlow = extractControlFlow(member, sourceFile);
        const setterDoc = extractDocumentation(member, sourceFile);
        const setterTypeRefs = extractTypeReferences(member, sourceFile);
        const setterComplexity = extractComplexity(member, sourceFile);
        const setterLocation = getLocation(sourceFile, member);

        classEntity.children!.push({
          name: setterName,
          type: "property",
          filePath,
          location: setterLocation,
          modifiers: [...getModifiers(member), "setter"],
          parameters: getParameters(member, sourceFile),
          ...(setterCalls.length > 0 && { calls: setterCalls }),
          controlFlow: setterControlFlow,
          documentation: setterDoc,
          typeReferences: setterTypeRefs,
          complexity: setterComplexity,
        });

        addMemberRelationships(setterName, setterLocation, setterCalls);

        // Add type references relationships for setter
        addTypeReferenceRelationships(`${className}.${setterName}`, setterTypeRefs);
      }
    }

    entities.push(classEntity);
    return; // Don't recurse into class - we've handled members
  }

  // Interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    const interfaceName = node.name.text;
    const modifiers = getModifiers(node);
    const interfaceDoc = extractDocumentation(node, sourceFile);
    const interfaceTypeRefs = extractTypeReferences(node, sourceFile);
    const interfaceEntity: ParsedEntity = {
      name: interfaceName,
      type: "interface",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers,
      documentation: interfaceDoc,
      typeReferences: interfaceTypeRefs,
      children: [],
    };

    // Add type references relationships for interface
    addTypeReferenceRelationships(interfaceName, interfaceTypeRefs);

    // Extract interface members
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propDoc = extractDocumentation(member, sourceFile);
        const propTypeRefs = extractTypeReferences(member, sourceFile);
        interfaceEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "property",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: member.questionToken ? ["optional"] : [],
          documentation: propDoc,
          typeReferences: propTypeRefs,
        });
      } else if (ts.isMethodSignature(member) && member.name) {
        const methodDoc = extractDocumentation(member, sourceFile);
        const methodTypeRefs = extractTypeReferences(member, sourceFile);
        interfaceEntity.children!.push({
          name: member.name.getText(sourceFile),
          type: "method",
          filePath,
          location: getLocation(sourceFile, member),
          modifiers: member.questionToken ? ["optional"] : [],
          parameters: getParameters(member as any, sourceFile),
          returnType: member.type ? member.type.getText(sourceFile) : undefined,
          documentation: methodDoc,
          typeReferences: methodTypeRefs,
        });
      }
    }

    entities.push(interfaceEntity);
    return;
  }

  // Type alias declarations
  if (ts.isTypeAliasDeclaration(node)) {
    const typeName = node.name.text;
    const typeDoc = extractDocumentation(node, sourceFile);
    const typeRefs = extractTypeReferences(node, sourceFile);
    entities.push({
      name: typeName,
      type: "type",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers: getModifiers(node),
      documentation: typeDoc,
      typeReferences: typeRefs,
    });

    // Add type references relationships for type alias
    addTypeReferenceRelationships(typeName, typeRefs);
  }

  // Enum declarations
  if (ts.isEnumDeclaration(node)) {
    const enumDoc = extractDocumentation(node, sourceFile);
    const enumEntity: ParsedEntity = {
      name: node.name.text,
      type: "enum",
      filePath,
      location: getLocation(sourceFile, node),
      modifiers: getModifiers(node),
      documentation: enumDoc,
      children: [],
    };

    for (const member of node.members) {
      enumEntity.children!.push({
        name: member.name.getText(sourceFile),
        type: "enum_variant",
        filePath,
        location: getLocation(sourceFile, member),
      });
    }

    entities.push(enumEntity);
    return;
  }

  // Import declarations
  if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
    const source = moduleSpecifier.slice(1, -1); // Remove quotes

    const specifiers: Array<{
      local: string;
      imported?: string | undefined;
      alias?: string | undefined;
    }> = [];
    let isDefault = false;
    let isNamespace = false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        isDefault = true;
        specifiers.push({ local: node.importClause.name.text });
      }

      // Named imports
      if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          specifiers.push({
            local: element.name.text,
            imported: element.propertyName?.text,
            alias: element.propertyName ? element.name.text : undefined,
          });
        }
      }

      // Namespace import
      if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
        isNamespace = true;
        specifiers.push({
          local: node.importClause.namedBindings.name.text,
        });
      }
    }

    const importEntityName = source;
    entities.push({
      name: importEntityName,
      type: "import",
      filePath,
      location: getLocation(sourceFile, node),
      importData: {
        source,
        specifiers,
        isDefault,
        isNamespace,
      },
    });

    // Create import relationships for each specifier
    const location = getLocation(sourceFile, node);
    for (const spec of specifiers) {
      const importedSymbol = spec.imported || spec.local;
      relationships.push({
        from: importEntityName,
        to: importedSymbol,
        type: "imports",
        sourceFile: filePath,
        targetFile: source,
        metadata: {
          line: location.start.line,
          isDefault,
          isNamespace,
          alias: spec.alias,
        },
      });
    }

    // If no specifiers (side-effect import like "import 'polyfill'"), create single relationship
    if (specifiers.length === 0) {
      relationships.push({
        from: filePath,
        to: source,
        type: "imports",
        sourceFile: filePath,
        targetFile: source,
        metadata: {
          line: location.start.line,
          isSideEffect: true,
        },
      });
    }
  }

  // Export declarations
  if (ts.isExportDeclaration(node)) {
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        entities.push({
          name: element.name.text,
          type: "export",
          filePath,
          location: getLocation(sourceFile, element),
        });
      }
    }
  }

  // =============================================================================
  // JAVASCRIPT-SPECIFIC PATTERNS
  // =============================================================================

  // Prototype method assignments: MyClass.prototype.method = function() {}
  if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
    const expr = node.expression;
    if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = expr.left;
      const right = expr.right;

      // Check for prototype pattern: X.prototype.Y = function
      if (ts.isPropertyAccessExpression(left)) {
        const leftText = left.getText(sourceFile);
        const prototypeMatch = leftText.match(/^(\w+)\.prototype\.(\w+)$/);

        if (prototypeMatch && (ts.isFunctionExpression(right) || ts.isArrowFunction(right))) {
          const [, className, methodName] = prototypeMatch;
          const modifiers: string[] = [];
          const isAsync =
            ts.canHaveModifiers(right) && ts.getModifiers(right)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

          if (isAsync) modifiers.push("async");
          modifiers.push("prototype");

          const calls = extractCalls(right, sourceFile);
          const controlFlow = extractControlFlow(right, sourceFile);
          const documentation = extractDocumentation(node, sourceFile);
          const complexity = extractComplexity(right, sourceFile);

          entities.push({
            name: `${className}.prototype.${methodName}`,
            type: isAsync ? "async_function" : "method",
            filePath,
            location: getLocation(sourceFile, node),
            modifiers,
            parameters: getParameters(right, sourceFile),
            returnType: getReturnType(right, sourceFile),
            ...(calls.length > 0 && { calls: calls }),
            controlFlow,
            documentation,
            complexity,
            metadata: {
              jsPattern: "prototype_method",
              parentClass: className,
            },
          });

          // Add calls relationships
          if (calls.length > 0) {
            for (const call of calls) {
              const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
              relationships.push({
                from: `${className}.prototype.${methodName}`,
                to: calledTarget,
                type: "calls",
                sourceFile: filePath,
                metadata: {
                  line: call.location.start.line,
                  isAwait: call.isAwait,
                  isNew: call.isNew,
                  argumentCount: call.argumentCount,
                },
              });
            }
          }

          // Add contains relationship to class if exists
          relationships.push({
            from: className!,
            to: `${className}.prototype.${methodName}`,
            type: "contains",
            sourceFile: filePath,
            metadata: {
              line: getLocation(sourceFile, node).start.line,
              memberType: "prototype_method",
            },
          });
        }
      }

      // CommonJS: module.exports = ... or exports.X = ...
      if (ts.isPropertyAccessExpression(left)) {
        const leftText = left.getText(sourceFile);

        // module.exports = X
        if (leftText === "module.exports") {
          const exportLocation = getLocation(sourceFile, node);

          if (ts.isObjectLiteralExpression(right)) {
            // module.exports = { method1, method2 }
            for (const prop of right.properties) {
              if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
                const propName = ts.isPropertyAssignment(prop) ? prop.name.getText(sourceFile) : prop.name.text;

                entities.push({
                  name: propName,
                  type: "export",
                  filePath,
                  location: getLocation(sourceFile, prop),
                  metadata: {
                    jsPattern: "commonjs_export",
                    exportStyle: "module.exports",
                  },
                });
              }
            }
          } else if (ts.isIdentifier(right) || ts.isFunctionExpression(right) || ts.isClassExpression(right)) {
            // module.exports = SomeClass or module.exports = function() {}
            const exportName = ts.isIdentifier(right) ? right.text : "default";
            entities.push({
              name: exportName,
              type: "export",
              filePath,
              location: exportLocation,
              metadata: {
                jsPattern: "commonjs_export",
                exportStyle: "module.exports",
                isDefault: true,
              },
            });
          }
        }

        // exports.X = ...
        const exportsMatch = leftText.match(/^exports\.(\w+)$/);
        if (exportsMatch) {
          const [, exportName] = exportsMatch;
          const exportLocation = getLocation(sourceFile, node);

          if (ts.isFunctionExpression(right) || ts.isArrowFunction(right)) {
            const isAsync =
              ts.canHaveModifiers(right) && ts.getModifiers(right)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

            const calls = extractCalls(right, sourceFile);
            const controlFlow = extractControlFlow(right, sourceFile);
            const documentation = extractDocumentation(node, sourceFile);
            const complexity = extractComplexity(right, sourceFile);

            entities.push({
              name: exportName!,
              type: isAsync ? "async_function" : "function",
              filePath,
              location: exportLocation,
              modifiers: ["export", ...(isAsync ? ["async"] : [])],
              parameters: getParameters(right, sourceFile),
              returnType: getReturnType(right, sourceFile),
              ...(calls.length > 0 && { calls: calls }),
              controlFlow,
              documentation,
              complexity,
              metadata: {
                jsPattern: "commonjs_export",
                exportStyle: "exports.X",
              },
            });

            // Add calls relationships
            if (calls.length > 0) {
              for (const call of calls) {
                const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
                relationships.push({
                  from: exportName!,
                  to: calledTarget,
                  type: "calls",
                  sourceFile: filePath,
                  metadata: {
                    line: call.location.start.line,
                    isAwait: call.isAwait,
                    isNew: call.isNew,
                    argumentCount: call.argumentCount,
                  },
                });
              }
            }
          } else {
            entities.push({
              name: exportName!,
              type: "export",
              filePath,
              location: exportLocation,
              metadata: {
                jsPattern: "commonjs_export",
                exportStyle: "exports.X",
              },
            });
          }
        }
      }
    }
  }

  // Object literals with methods: const obj = { method() {}, prop: function() {} }
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer) && ts.isIdentifier(decl.name)) {
        const objectName = decl.name.text;
        const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
        const objectLocation = getLocation(sourceFile, decl);
        const objectDoc = extractDocumentation(node, sourceFile);

        // Count methods vs properties to determine if this is a "module" or just an object
        let methodCount = 0;
        let propCount = 0;
        const children: ParsedEntity[] = [];

        for (const prop of decl.initializer.properties) {
          // Method shorthand: { method() {} }
          if (ts.isMethodDeclaration(prop) && prop.name) {
            methodCount++;
            const methodName = prop.name.getText(sourceFile);
            const methodModifiers = getModifiers(prop);
            const isAsync = methodModifiers.includes("async");
            const methodCalls = extractCalls(prop, sourceFile);
            const methodControlFlow = extractControlFlow(prop, sourceFile);
            const methodDoc = extractDocumentation(prop, sourceFile);
            const methodComplexity = extractComplexity(prop, sourceFile);
            const methodLocation = getLocation(sourceFile, prop);

            children.push({
              name: methodName,
              type: isAsync ? "async_function" : "method",
              filePath,
              location: methodLocation,
              modifiers: methodModifiers,
              parameters: getParameters(prop, sourceFile),
              returnType: getReturnType(prop, sourceFile),
              ...(methodCalls.length > 0 && { calls: methodCalls }),
              controlFlow: methodControlFlow,
              documentation: methodDoc,
              complexity: methodComplexity,
            });

            // Add calls relationships
            if (methodCalls.length > 0) {
              for (const call of methodCalls) {
                const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
                relationships.push({
                  from: `${objectName}.${methodName}`,
                  to: calledTarget,
                  type: "calls",
                  sourceFile: filePath,
                  metadata: {
                    line: call.location.start.line,
                    isAwait: call.isAwait,
                    isNew: call.isNew,
                    argumentCount: call.argumentCount,
                  },
                });
              }
            }

            // Add contains relationship
            relationships.push({
              from: objectName,
              to: `${objectName}.${methodName}`,
              type: "contains",
              sourceFile: filePath,
              metadata: {
                line: methodLocation.start.line,
                memberType: "method",
              },
            });
          }

          // Property with function value: { prop: function() {} } or { prop: () => {} }
          if (ts.isPropertyAssignment(prop) && prop.name) {
            const propName = prop.name.getText(sourceFile);
            const propValue = prop.initializer;

            if (ts.isFunctionExpression(propValue) || ts.isArrowFunction(propValue)) {
              methodCount++;
              const isAsync =
                ts.canHaveModifiers(propValue) &&
                ts.getModifiers(propValue)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

              const methodCalls = extractCalls(propValue, sourceFile);
              const methodControlFlow = extractControlFlow(propValue, sourceFile);
              const methodDoc = extractDocumentation(prop, sourceFile);
              const methodComplexity = extractComplexity(propValue, sourceFile);
              const methodLocation = getLocation(sourceFile, prop);

              children.push({
                name: propName,
                type: isAsync ? "async_function" : "method",
                filePath,
                location: methodLocation,
                modifiers: isAsync ? ["async"] : [],
                parameters: getParameters(propValue, sourceFile),
                returnType: getReturnType(propValue, sourceFile),
                ...(methodCalls.length > 0 && { calls: methodCalls }),
                controlFlow: methodControlFlow,
                documentation: methodDoc,
                complexity: methodComplexity,
              });

              // Add calls relationships
              if (methodCalls.length > 0) {
                for (const call of methodCalls) {
                  const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
                  relationships.push({
                    from: `${objectName}.${propName}`,
                    to: calledTarget,
                    type: "calls",
                    sourceFile: filePath,
                    metadata: {
                      line: call.location.start.line,
                      isAwait: call.isAwait,
                      isNew: call.isNew,
                      argumentCount: call.argumentCount,
                    },
                  });
                }
              }

              // Add contains relationship
              relationships.push({
                from: objectName,
                to: `${objectName}.${propName}`,
                type: "contains",
                sourceFile: filePath,
                metadata: {
                  line: methodLocation.start.line,
                  memberType: "method",
                },
              });
            } else {
              propCount++;
              // Regular property
              children.push({
                name: propName,
                type: "property",
                filePath,
                location: getLocation(sourceFile, prop),
              });
            }
          }

          // Shorthand property: { existingVar }
          if (ts.isShorthandPropertyAssignment(prop)) {
            propCount++;
            children.push({
              name: prop.name.text,
              type: "property",
              filePath,
              location: getLocation(sourceFile, prop),
            });
          }
        }

        // Only create entity if object has methods (module-like) or significant structure
        if (methodCount > 0 || children.length >= 3) {
          entities.push({
            name: objectName,
            type: methodCount > 0 ? "module" : isConst ? "constant" : "variable",
            filePath,
            location: objectLocation,
            modifiers: isConst ? ["const"] : [],
            documentation: objectDoc,
            ...(children.length > 0 && { children: children }),
            metadata: {
              jsPattern: "object_literal",
              methodCount,
              propertyCount: propCount,
            },
          });
        }
      }
    }
  }

  // IIFE: (function() {})() or (() => {})()
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
    const callExpr = node.expression;
    let funcExpr: ts.FunctionExpression | ts.ArrowFunction | undefined;

    // (function() {})()
    if (ts.isParenthesizedExpression(callExpr.expression)) {
      const inner = callExpr.expression.expression;
      if (ts.isFunctionExpression(inner) || ts.isArrowFunction(inner)) {
        funcExpr = inner;
      }
    }
    // (function() {}).call() / .apply() / .bind()
    else if (ts.isPropertyAccessExpression(callExpr.expression)) {
      const propAccess = callExpr.expression;
      if (ts.isParenthesizedExpression(propAccess.expression)) {
        const inner = propAccess.expression.expression;
        if (ts.isFunctionExpression(inner) || ts.isArrowFunction(inner)) {
          const methodName = propAccess.name.text;
          if (methodName === "call" || methodName === "apply" || methodName === "bind") {
            funcExpr = inner;
          }
        }
      }
    }

    if (funcExpr) {
      const iifeName =
        ts.isFunctionExpression(funcExpr) && funcExpr.name
          ? funcExpr.name.text
          : `IIFE_${getLocation(sourceFile, node).start.line}`;

      const isAsync =
        ts.canHaveModifiers(funcExpr) && ts.getModifiers(funcExpr)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

      const calls = extractCalls(funcExpr, sourceFile);
      const controlFlow = extractControlFlow(funcExpr, sourceFile);
      const documentation = extractDocumentation(node, sourceFile);
      const complexity = extractComplexity(funcExpr, sourceFile);

      entities.push({
        name: iifeName,
        type: isAsync ? "async_function" : "function",
        filePath,
        location: getLocation(sourceFile, node),
        modifiers: ["iife", ...(isAsync ? ["async"] : [])],
        parameters: getParameters(funcExpr, sourceFile),
        ...(calls.length > 0 && { calls: calls }),
        controlFlow,
        documentation,
        complexity,
        metadata: {
          jsPattern: "iife",
          isAnonymous: !ts.isFunctionExpression(funcExpr) || !funcExpr.name,
        },
      });

      // Add calls relationships
      if (calls.length > 0) {
        for (const call of calls) {
          const calledTarget = call.target ? `${call.target}.${call.name}` : call.name;
          relationships.push({
            from: iifeName,
            to: calledTarget,
            type: "calls",
            sourceFile: filePath,
            metadata: {
              line: call.location.start.line,
              isAwait: call.isAwait,
              isNew: call.isNew,
              argumentCount: call.argumentCount,
            },
          });
        }
      }
    }
  }

  // CommonJS require(): const x = require('module')
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (
        decl.initializer &&
        ts.isCallExpression(decl.initializer) &&
        ts.isIdentifier(decl.initializer.expression) &&
        decl.initializer.expression.text === "require" &&
        decl.initializer.arguments.length > 0
      ) {
        const arg = decl.initializer.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const source = arg.text;
          const location = getLocation(sourceFile, node);

          // Handle different require patterns
          if (ts.isIdentifier(decl.name)) {
            // const foo = require('foo')
            entities.push({
              name: source,
              type: "import",
              filePath,
              location,
              importData: {
                source,
                specifiers: [{ local: decl.name.text }],
                isDefault: true,
                isNamespace: false,
              },
              metadata: {
                jsPattern: "commonjs_require",
              },
            });

            relationships.push({
              from: source,
              to: decl.name.text,
              type: "imports",
              sourceFile: filePath,
              targetFile: source,
              metadata: {
                line: location.start.line,
                isDefault: true,
                requireStyle: "commonjs",
              },
            });
          } else if (ts.isObjectBindingPattern(decl.name)) {
            // const { a, b } = require('foo')
            const specifiers: Array<{ local: string; imported?: string | undefined; alias?: string }> = [];

            for (const element of decl.name.elements) {
              if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                const local = element.name.text;
                const imported =
                  element.propertyName && ts.isIdentifier(element.propertyName) ? element.propertyName.text : undefined;

                specifiers.push({
                  local,
                  imported,
                  alias: imported ? local : undefined,
                });

                relationships.push({
                  from: source,
                  to: imported || local,
                  type: "imports",
                  sourceFile: filePath,
                  targetFile: source,
                  metadata: {
                    line: location.start.line,
                    alias: imported ? local : undefined,
                    requireStyle: "commonjs_destructured",
                  },
                });
              }
            }

            entities.push({
              name: source,
              type: "import",
              filePath,
              location,
              importData: {
                source,
                specifiers,
                isDefault: false,
                isNamespace: false,
              },
              metadata: {
                jsPattern: "commonjs_require_destructured",
              },
            });
          }
        }
      }
    }
  }

  // Constructor functions (pre-ES6 classes): function MyClass() { this.x = ... }
  if (ts.isFunctionDeclaration(node) && node.name && node.body) {
    const funcName = node.name.text;
    // Check if function name starts with uppercase (convention for constructors)
    if (funcName[0] === funcName[0]?.toUpperCase() && funcName[0] !== funcName[0]?.toLowerCase()) {
      // Check if body contains 'this.' assignments
      let hasThisAssignments = false;
      const thisProperties: string[] = [];

      const checkThisUsage = (n: ts.Node): void => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          if (ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
            hasThisAssignments = true;
            thisProperties.push(n.left.name.text);
          }
        }
        ts.forEachChild(n, checkThisUsage);
      };
      checkThisUsage(node.body);

      if (hasThisAssignments) {
        // This is likely a constructor function - mark it specially
        const existingEntity = entities.find((e) => e.name === funcName && e.type === "function");
        if (existingEntity) {
          existingEntity.type = "class";
          existingEntity.modifiers = [...(existingEntity.modifiers || []), "constructor_function"];
          existingEntity.metadata = {
            ...existingEntity.metadata,
            jsPattern: "constructor_function",
            thisProperties,
          };
        }
      }
    }
  }

  // Recurse into children (except for nodes we've already handled)
  ts.forEachChild(node, (child) => extractEntities(ctx, child));
}

// =============================================================================
// MAIN PARSER CLASS
// =============================================================================

export interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

// =============================================================================
// INCREMENTAL LANGUAGE SERVICE
// =============================================================================

interface FileVersion {
  version: number;
  content: string;
  snapshot: ts.IScriptSnapshot;
}

/**
 * Incremental TypeScript Language Service Host
 * Provides file management and versioning for the Language Service
 */
class IncrementalLanguageServiceHost implements ts.LanguageServiceHost {
  private files = new Map<string, FileVersion>();
  private rootDir: string;
  private compilerOptions: ts.CompilerOptions;

  constructor(rootDir: string, compilerOptions?: ts.CompilerOptions) {
    this.rootDir = rootDir;
    this.compilerOptions = compilerOptions || {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      checkJs: true,
      strict: false,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    };
  }

  /**
   * Add or update a file in the service
   */
  updateFile(filePath: string, content: string): void {
    const existing = this.files.get(filePath);
    const version = existing ? existing.version + 1 : 1;

    this.files.set(filePath, {
      version,
      content,
      snapshot: ts.ScriptSnapshot.fromString(content),
    });
  }

  /**
   * Remove a file from the service
   */
  removeFile(filePath: string): void {
    this.files.delete(filePath);
  }

  /**
   * Check if a file exists in the service
   */
  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Get file version (for change detection)
   */
  getFileVersion(filePath: string): number {
    return this.files.get(filePath)?.version ?? 0;
  }

  // LanguageServiceHost implementation

  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getScriptFileNames(): string[] {
    return Array.from(this.files.keys());
  }

  getScriptVersion(fileName: string): string {
    const file = this.files.get(fileName);
    return file ? String(file.version) : "0";
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    const file = this.files.get(fileName);
    if (file) {
      return file.snapshot;
    }

    // Try to read from disk for lib files
    if (fileName.includes("lib.") && fileName.endsWith(".d.ts")) {
      try {
        const libPath = ts.getDefaultLibFilePath(this.compilerOptions);
        const libDir = libPath.substring(0, libPath.lastIndexOf("/") + 1);
        const content = ts.sys.readFile(libDir + fileName.split("/").pop());
        if (content) {
          return ts.ScriptSnapshot.fromString(content);
        }
      } catch {
        // Ignore lib file loading errors
      }
    }

    return undefined;
  }

  getCurrentDirectory(): string {
    return this.rootDir;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(path: string): boolean {
    return this.files.has(path) || ts.sys.fileExists(path);
  }

  readFile(path: string): string | undefined {
    const file = this.files.get(path);
    if (file) {
      return file.content;
    }
    return ts.sys.readFile(path);
  }

  readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number,
  ): string[] {
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  directoryExists(path: string): boolean {
    return ts.sys.directoryExists(path);
  }

  getDirectories(path: string): string[] {
    return ts.sys.getDirectories(path);
  }
}

/**
 * Incremental TypeScript Builder
 * Uses Language Service for efficient incremental compilation with type information
 */
export class IncrementalTypeScriptBuilder {
  private host: IncrementalLanguageServiceHost;
  private service: ts.LanguageService;
  private typeCache = new Map<string, Map<string, string>>(); // filePath -> entityName -> type

  constructor(rootDir: string = process.cwd()) {
    this.host = new IncrementalLanguageServiceHost(rootDir);
    this.service = ts.createLanguageService(this.host, ts.createDocumentRegistry());
  }

  /**
   * Update a file and get incremental parse result
   */
  updateFile(filePath: string, content: string): void {
    this.host.updateFile(filePath, content);
    // Invalidate type cache for this file
    this.typeCache.delete(filePath);
  }

  /**
   * Remove a file from the builder
   */
  removeFile(filePath: string): void {
    this.host.removeFile(filePath);
    this.typeCache.delete(filePath);
  }

  /**
   * Get the TypeScript program (for advanced analysis)
   */
  getProgram(): ts.Program | undefined {
    return this.service.getProgram();
  }

  /**
   * Get type checker for type resolution
   */
  getTypeChecker(): ts.TypeChecker | undefined {
    return this.getProgram()?.getTypeChecker();
  }

  /**
   * Get diagnostics for a file
   */
  getDiagnostics(filePath: string): ts.Diagnostic[] {
    const syntactic = this.service.getSyntacticDiagnostics(filePath);
    const semantic = this.service.getSemanticDiagnostics(filePath);
    return [...syntactic, ...semantic];
  }

  /**
   * Get document symbols (outline)
   */
  getDocumentSymbols(filePath: string): ts.NavigationTree | undefined {
    return this.service.getNavigationTree(filePath);
  }

  /**
   * Get completions at position
   */
  getCompletions(filePath: string, position: number): ts.CompletionInfo | undefined {
    return this.service.getCompletionsAtPosition(filePath, position, undefined);
  }

  /**
   * Get quick info (hover)
   */
  getQuickInfo(filePath: string, position: number): ts.QuickInfo | undefined {
    return this.service.getQuickInfoAtPosition(filePath, position);
  }

  /**
   * Get definition locations
   */
  getDefinition(filePath: string, position: number): readonly ts.DefinitionInfo[] | undefined {
    return this.service.getDefinitionAtPosition(filePath, position);
  }

  /**
   * Get references
   */
  getReferences(filePath: string, position: number): ts.ReferencedSymbol[] | undefined {
    return this.service.findReferences(filePath, position);
  }

  /**
   * Get inferred type for a node at position
   */
  getTypeAtPosition(filePath: string, position: number): string | undefined {
    const quickInfo = this.service.getQuickInfoAtPosition(filePath, position);
    if (quickInfo?.displayParts) {
      return quickInfo.displayParts.map((p) => p.text).join("");
    }
    return undefined;
  }

  /**
   * Get all files that would be affected by changes to a file
   */
  getAffectedFiles(filePath: string): string[] {
    const program = this.getProgram();
    if (!program) return [filePath];

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) return [filePath];

    const affected = new Set<string>([filePath]);

    // Find files that import this file
    for (const file of program.getSourceFiles()) {
      if (file.fileName === filePath) continue;

      // Check imports
      ts.forEachChild(file, (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const importPath = node.moduleSpecifier.text;
          // Simplified resolution - would need proper module resolution for accuracy
          if (importPath.includes(filePath.replace(/\.[^.]+$/, ""))) {
            affected.add(file.fileName);
          }
        }
      });
    }

    return Array.from(affected);
  }

  /**
   * Extract entities with full type information
   */
  extractEntitiesWithTypes(filePath: string, content: string): ParsedEntity[] {
    // Ensure file is in the service
    if (!this.host.hasFile(filePath)) {
      this.host.updateFile(filePath, content);
    }

    const program = this.getProgram();
    const sourceFile = program?.getSourceFile(filePath);
    const typeChecker = this.getTypeChecker();

    if (!sourceFile || !typeChecker) {
      // Fallback to syntax-only parsing
      return this.extractEntitiesSyntaxOnly(filePath, content).entities;
    }

    const entities: ParsedEntity[] = [];

    const visit = (node: ts.Node): void => {
      // Functions
      if (ts.isFunctionDeclaration(node) && node.name) {
        const symbol = typeChecker.getSymbolAtLocation(node.name);
        const type = symbol ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(symbol, node)) : undefined;

        const modifiers = getModifiers(node);
        entities.push({
          name: node.name.text,
          type: modifiers.includes("async") ? "async_function" : "function",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers,
          parameters: getParameters(node, sourceFile),
          returnType: type || getReturnType(node, sourceFile),
          decorators: getDecorators(node, sourceFile),
        });
      }

      // Classes
      if (ts.isClassDeclaration(node) && node.name) {
        const modifiers = getModifiers(node);

        const baseClasses: string[] = [];
        const interfaces: string[] = [];

        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const typeNode of clause.types) {
              const inheritedType = typeChecker.getTypeAtLocation(typeNode);
              const typeName = typeChecker.typeToString(inheritedType);

              if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                baseClasses.push(typeName);
              } else {
                interfaces.push(typeName);
              }
            }
          }
        }

        const classEntity: ParsedEntity = {
          name: node.name.text,
          type: "class",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers,
          decorators: getDecorators(node, sourceFile),
          inheritance:
            baseClasses.length > 0 || interfaces.length > 0
              ? {
                  baseClasses,
                  ...(interfaces.length > 0 && { interfaces: interfaces }),
                  isAbstract: modifiers.includes("abstract"),
                }
              : undefined,
          children: [],
        };

        // Extract members with types
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name) {
            const memberSymbol = typeChecker.getSymbolAtLocation(member.name);
            const methodType = memberSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(memberSymbol, member))
              : undefined;

            const methodModifiers = getModifiers(member);
            classEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: methodModifiers.includes("async") ? "async_function" : "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: methodModifiers,
              parameters: getParameters(member, sourceFile),
              returnType: methodType || getReturnType(member, sourceFile),
              decorators: getDecorators(member, sourceFile),
            });
          } else if (ts.isPropertyDeclaration(member) && member.name) {
            const propSymbol = typeChecker.getSymbolAtLocation(member.name);
            const propType = propSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(propSymbol, member))
              : undefined;

            classEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "property",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: getModifiers(member),
              returnType: propType,
            });
          } else if (ts.isConstructorDeclaration(member)) {
            classEntity.children!.push({
              name: "constructor",
              type: "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: getModifiers(member),
              parameters: getParameters(member, sourceFile),
            });
          }
        }

        entities.push(classEntity);
        return;
      }

      // Interfaces
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceEntity: ParsedEntity = {
          name: node.name.text,
          type: "interface",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: getModifiers(node),
          children: [],
        };

        for (const member of node.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propSymbol = typeChecker.getSymbolAtLocation(member.name);
            const propType = propSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(propSymbol, member))
              : member.type?.getText(sourceFile);

            interfaceEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "property",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: member.questionToken ? ["optional"] : [],
              returnType: propType,
            });
          } else if (ts.isMethodSignature(member) && member.name) {
            const methodSymbol = typeChecker.getSymbolAtLocation(member.name);
            const methodType = methodSymbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(methodSymbol, member))
              : undefined;

            interfaceEntity.children!.push({
              name: member.name.getText(sourceFile),
              type: "method",
              filePath,
              location: getLocation(sourceFile, member),
              modifiers: member.questionToken ? ["optional"] : [],
              returnType: methodType || member.type?.getText(sourceFile),
            });
          }
        }

        entities.push(interfaceEntity);
        return;
      }

      // Type aliases
      if (ts.isTypeAliasDeclaration(node)) {
        const symbol = typeChecker.getSymbolAtLocation(node.name);
        const aliasType = symbol
          ? typeChecker.typeToString(typeChecker.getDeclaredTypeOfSymbol(symbol))
          : node.type.getText(sourceFile);

        entities.push({
          name: node.name.text,
          type: "type",
          filePath,
          location: getLocation(sourceFile, node),
          modifiers: getModifiers(node),
          returnType: aliasType,
        });
      }

      // Variables
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const symbol = typeChecker.getSymbolAtLocation(decl.name);
            const varType = symbol
              ? typeChecker.typeToString(typeChecker.getTypeOfSymbolAtLocation(symbol, decl))
              : undefined;

            const modifiers = getModifiers(node);
            const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;

            // Check if it's a function expression
            if (
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
            ) {
              const isAsync =
                ts.canHaveModifiers(decl.initializer) &&
                ts.getModifiers(decl.initializer)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

              entities.push({
                name: decl.name.text,
                type: isAsync ? "async_function" : "function",
                filePath,
                location: getLocation(sourceFile, decl),
                modifiers: [...modifiers, ...(isAsync ? ["async"] : [])],
                parameters: getParameters(decl.initializer, sourceFile),
                returnType: varType || getReturnType(decl.initializer, sourceFile),
              });
            } else {
              entities.push({
                name: decl.name.text,
                type: isConst ? "constant" : "variable",
                filePath,
                location: getLocation(sourceFile, decl),
                modifiers: [...modifiers, ...(isConst ? ["const"] : [])],
                returnType: varType,
              });
            }
          }
        }
      }

      // Imports
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText(sourceFile);
        const source = moduleSpecifier.slice(1, -1);

        const specifiers: Array<{ local: string; imported?: string | undefined; alias?: string }> = [];
        let isDefault = false;
        let isNamespace = false;

        if (node.importClause) {
          if (node.importClause.name) {
            isDefault = true;
            specifiers.push({ local: node.importClause.name.text });
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const el of node.importClause.namedBindings.elements) {
                specifiers.push({
                  local: el.name.text,
                  imported: el.propertyName?.text,
                  alias: el.propertyName ? el.name.text : undefined,
                });
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              isNamespace = true;
              specifiers.push({ local: node.importClause.namedBindings.name.text });
            }
          }
        }

        entities.push({
          name: source,
          type: "import",
          filePath,
          location: getLocation(sourceFile, node),
          importData: { source, specifiers, isDefault, isNamespace },
        });
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return entities;
  }

  /**
   * Fallback syntax-only extraction (when type checker unavailable)
   */
  private extractEntitiesSyntaxOnly(
    filePath: string,
    content: string,
  ): { entities: ParsedEntity[]; relationships: EntityRelationship[] } {
    const ext = getExtension(filePath);
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      SCRIPT_TARGETS[ext] || ts.ScriptTarget.ESNext,
      true,
      SCRIPT_KINDS[ext] || ts.ScriptKind.TS,
    );

    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    const ctx: ExtractorContext = { sourceFile, filePath, entities, relationships };
    ts.forEachChild(sourceFile, (node) => extractEntities(ctx, node));
    return { entities, relationships };
  }

  /**
   * Dispose the language service
   */
  dispose(): void {
    this.service.dispose();
    this.typeCache.clear();
  }
}

export class TypeScriptParser {
  private stats: ParserStats = {
    filesParsed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTimeMs: 0,
    totalParseTimeMs: 0,
    throughput: 0,
    cacheMemoryMB: 0,
    errorCount: 0,
  };

  /**
   * Initialize the parser (no-op for TypeScript API, kept for interface compatibility)
   */
  async initialize(): Promise<void> {
    console.error("[TypeScriptParser] Initialized (TypeScript Compiler API)");
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = getExtension(filePath);
    return ext in SCRIPT_KINDS;
  }

  /**
   * Parse a file and extract entities
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const ext = getExtension(filePath);
      const scriptTarget = SCRIPT_TARGETS[ext] || ts.ScriptTarget.ESNext;
      const scriptKind = SCRIPT_KINDS[ext] || ts.ScriptKind.TS;

      // Parse the source file (syntax only, no type checking for speed)
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        scriptTarget,
        true, // setParentNodes
        scriptKind,
      );

      // Extract entities and relationships
      const entities: ParsedEntity[] = [];
      const relationships: EntityRelationship[] = [];
      const ctx: ExtractorContext = {
        sourceFile,
        filePath,
        entities,
        relationships,
      };

      ts.forEachChild(sourceFile, (node) => extractEntities(ctx, node));

      // Enhance with Angular metadata if this is an Angular file
      if (isAngularFile(sourceFile)) {
        enhanceWithAngularInfo(entities, sourceFile);
      }

      // Parse NgRx constructs (actions, effects, reducers, selectors)
      if (isNgRxFile(sourceFile)) {
        const ngrxResult = parseNgRxFile(sourceFile, filePath);

        // Add NgRx entities
        entities.push(...ngrxResult.entities);

        // Convert NgRx relationships to EntityRelationship format
        for (const rel of ngrxResult.relationships) {
          relationships.push({
            from: rel.fromName,
            to: rel.toName,
            type: rel.type as EntityRelationship["type"],
            metadata: rel.metadata,
          });
        }
      }

      // Collect diagnostics
      const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

      // Get syntax errors from the source file (using internal API)
      const syntaxDiagnostics = (sourceFile as any).parseDiagnostics as ts.Diagnostic[] | undefined;
      if (syntaxDiagnostics) {
        for (const diag of syntaxDiagnostics) {
          const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
          if (diag.start !== undefined) {
            const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
            errors.push({
              message,
              location: { line: pos.line + 1, column: pos.character },
            });
          } else {
            errors.push({ message });
          }
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: getLanguage(filePath),
        entities,
        ...(relationships.length > 0 && { relationships: relationships }),
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        ...(errors.length > 0 && { errors: errors }),
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: getLanguage(filePath),
        entities: [],
        relationships: undefined,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Parse with incremental support (uses same logic - TS API handles this internally)
   */
  async parseIncremental(filePath: string, content: string, contentHash: string, _edits: any[]): Promise<ParseResult> {
    // TypeScript's createSourceFile is already very fast
    // For true incremental, we'd need ts.createLanguageService
    return this.parse(filePath, content, contentHash);
  }

  /**
   * Get parser statistics
   */
  getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Clear any internal caches
   */
  clearCache(): void {
    // No internal cache in this implementation
  }
}
