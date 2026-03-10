/**
 * TypeScript Function Extractor
 *
 * Extracts function declarations, arrow functions, and function expressions.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity } from "../types/parser.js";
import { extractAntipatternHints } from "./ts-antipattern-hints-extractor.js";
import { getDecorators, getLocation, getModifiers, getParameters, getReturnType } from "./ts-ast-helpers.js";
import { type CallInfo, extractCalls, extractTypeReferences, type TypeReference } from "./ts-call-extractor.js";
import { extractComplexity } from "./ts-complexity-analyzer.js";
import { extractControlFlow } from "./ts-control-flow-extractor.js";
import { extractDocumentation } from "./ts-doc-extractor.js";
import { extractJitHints } from "./ts-jit-hints-extractor.js";
import {
  extractNgRxReducerInfo,
  extractNgRxSelectorInfo,
  type NgRxReducerInfo,
  type NgRxSelectorInfo,
} from "./ts-ngrx-extractor.js";

export interface FunctionExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
}

/**
 * Add calls relationships for a function
 */
function addFunctionCallRelationships(
  functionName: string,
  calls: CallInfo[],
  filePath: string,
  relationships: EntityRelationship[],
): void {
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
}

/**
 * Add type reference relationships
 */
function addTypeReferenceRelationships(
  entityName: string,
  typeRefs: TypeReference[] | undefined,
  filePath: string,
  relationships: EntityRelationship[],
): void {
  if (!typeRefs) return;
  for (const ref of typeRefs) {
    // Skip extends/implements (handled elsewhere)
    if (ref.kind === "extends" || ref.kind === "implements") continue;
    relationships.push({
      from: entityName,
      to: ref.name,
      type: "references",
      sourceFile: filePath,
      metadata: {
        line: ref.location.start.line,
        referenceKind: ref.kind,
      },
    });
  }
}

/**
 * Extract function declaration
 */
export function extractFunctionDeclaration(node: ts.FunctionDeclaration, ctx: FunctionExtractorContext): void {
  if (!node.name) return;

  const { sourceFile, filePath, entities, relationships } = ctx;
  const functionName = node.name.text;
  const modifiers = getModifiers(node);
  const isAsync = modifiers.includes("async");
  const calls = extractCalls(node, sourceFile);
  const controlFlow = extractControlFlow(node, sourceFile);
  const documentation = extractDocumentation(node, sourceFile);
  const typeRefs = extractTypeReferences(node, sourceFile);
  const complexity = extractComplexity(node, sourceFile);
  const jitHints = extractJitHints(node, sourceFile);
  const antipatternHints = extractAntipatternHints(node, sourceFile);

  entities.push({
    name: functionName,
    type: isAsync ? "async_function" : "function",
    filePath,
    location: getLocation(sourceFile, node),
    modifiers,
    parameters: getParameters(node, sourceFile),
    returnType: getReturnType(node, sourceFile),
    decorators: getDecorators(node, sourceFile),
    ...(calls.length > 0 && { calls }),
    controlFlow,
    documentation,
    typeReferences: typeRefs,
    complexity,
    ...(jitHints && { jitHints }),
    ...(antipatternHints && { antipatternHints }),
  });

  if (calls.length > 0) {
    addFunctionCallRelationships(functionName, calls, filePath, relationships);
  }
  addTypeReferenceRelationships(functionName, typeRefs, filePath, relationships);
}

/**
 * Extract arrow functions and function expressions from variable statements
 */
export function extractArrowFunctionOrExpression(node: ts.VariableStatement, ctx: FunctionExtractorContext): boolean {
  const { sourceFile, filePath, entities, relationships } = ctx;
  let extracted = false;

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
      const jitHints = extractJitHints(decl.initializer, sourceFile);
      const antipatternHints = extractAntipatternHints(decl.initializer, sourceFile);

      entities.push({
        name,
        type: isAsync ? "async_function" : "function",
        filePath,
        location: getLocation(sourceFile, node),
        modifiers: [...modifiers, ...(isAsync ? ["async"] : [])],
        parameters: getParameters(decl.initializer, sourceFile),
        returnType: getReturnType(decl.initializer, sourceFile),
        ...(calls.length > 0 && { calls }),
        controlFlow,
        documentation,
        typeReferences: typeRefs,
        complexity,
        ...(jitHints && { jitHints }),
        ...(antipatternHints && { antipatternHints }),
      });

      if (calls.length > 0) {
        addFunctionCallRelationships(name, calls, filePath, relationships);
      }
      addTypeReferenceRelationships(name, typeRefs, filePath, relationships);
      extracted = true;
    }
  }

  return extracted;
}

/**
 * Extract NgRx patterns and regular variables from variable statements
 */
export function extractVariableWithNgRx(node: ts.VariableStatement, ctx: FunctionExtractorContext): void {
  const { sourceFile, filePath, entities, relationships } = ctx;

  for (const decl of node.declarationList.declarations) {
    // Skip if already handled as arrow function
    if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
      continue;
    }

    if (decl.name && ts.isIdentifier(decl.name)) {
      const varName = decl.name.text;
      const modifiers = getModifiers(node);
      const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
      const varLocation = getLocation(sourceFile, decl);

      // Check for NgRx reducer
      let reducerInfo: NgRxReducerInfo | undefined;
      if (decl.initializer) {
        reducerInfo = extractNgRxReducerInfo(decl.initializer, sourceFile);
      }

      // Check for NgRx selector
      let selectorInfo: NgRxSelectorInfo | undefined;
      if (decl.initializer) {
        selectorInfo = extractNgRxSelectorInfo(decl.initializer, sourceFile);
      }

      if (reducerInfo) {
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
