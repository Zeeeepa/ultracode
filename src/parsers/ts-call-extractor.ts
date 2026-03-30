/**
 * TypeScript Call & Type Reference Extractor
 *
 * Extracts function calls and type references from TypeScript AST nodes.
 * Used by typescript-parser.ts for dependency tracking.
 */

import ts from "typescript";
import type { ParsedEntity } from "../types/parser.js";
import { getLocation } from "./ts-ast-helpers.js";

// =============================================================================
// CALL EXTRACTION
// =============================================================================

export type CallInfo = NonNullable<ParsedEntity["calls"]>[number];

/**
 * Extract all function/method calls within a node
 */
export function extractCalls(node: ts.Node, sourceFile: ts.SourceFile): CallInfo[] {
  const calls: CallInfo[] = [];

  function visit(n: ts.Node, isAwaited = false): void {
    // Handle await expressions - mark the inner call as awaited
    if (ts.isAwaitExpression(n)) {
      visit(n.expression, true);
      return;
    }

    // Call expressions: foo(), obj.method(), this.bar()
    if (ts.isCallExpression(n)) {
      const callInfo = extractCallInfo(n, sourceFile, isAwaited, false);
      if (callInfo) {
        calls.push(callInfo);
      }
      // Visit arguments (may contain nested calls)
      n.arguments.forEach((arg) => visit(arg, false));
      return;
    }

    // New expressions: new Foo(), new Bar<T>()
    if (ts.isNewExpression(n)) {
      const callInfo = extractCallInfo(n, sourceFile, false, true);
      if (callInfo) {
        calls.push(callInfo);
      }
      // Visit arguments
      n.arguments?.forEach((arg) => visit(arg, false));
      return;
    }

    // Recurse into children
    ts.forEachChild(n, (child) => visit(child, false));
  }

  // Don't extract calls from the function signature, only from body
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    if (node.body) {
      visit(node.body, false);
    }
  } else if (ts.isMethodDeclaration(node)) {
    if (node.body) {
      visit(node.body, false);
    }
  } else if (ts.isConstructorDeclaration(node)) {
    if (node.body) {
      visit(node.body, false);
    }
  } else if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
    if (node.body) {
      visit(node.body, false);
    }
  } else {
    visit(node, false);
  }

  return calls;
}

/**
 * Extract information from a single call expression
 */
function extractCallInfo(
  node: ts.CallExpression | ts.NewExpression,
  sourceFile: ts.SourceFile,
  isAwaited: boolean,
  isNew: boolean,
): CallInfo | null {
  let name: string;
  let target: string | undefined;
  let isOptional = false;

  const expr = ts.isCallExpression(node) ? node.expression : node.expression;
  if (!expr) return null;

  // Simple call: foo()
  if (ts.isIdentifier(expr)) {
    name = expr.text;
  }
  // Method call: obj.method() or this.method()
  else if (ts.isPropertyAccessExpression(expr)) {
    name = expr.name.text;
    // Get the target (object being called on)
    if (ts.isIdentifier(expr.expression)) {
      target = expr.expression.text;
    } else if (expr.expression.kind === ts.SyntaxKind.ThisKeyword) {
      target = "this";
    } else if (ts.isPropertyAccessExpression(expr.expression)) {
      // Chained: a.b.c() -> target is "a.b", name is "c"
      target = expr.expression.getText(sourceFile);
    } else if (ts.isCallExpression(expr.expression)) {
      // Method on result: foo().bar() -> target is "foo()"
      target = expr.expression.getText(sourceFile);
    } else {
      target = expr.expression.getText(sourceFile);
    }
  }
  // Optional chaining: obj?.method()
  else if (ts.isCallExpression(node) && node.questionDotToken) {
    isOptional = true;
    // The expression should be property access
    if (ts.isPropertyAccessExpression(expr)) {
      name = expr.name.text;
      target = ts.isIdentifier(expr.expression) ? expr.expression.text : expr.expression.getText(sourceFile);
    } else {
      name = expr.getText(sourceFile);
    }
  }
  // Element access: obj["method"]() or arr[0]()
  else if (ts.isElementAccessExpression(expr)) {
    const arg = expr.argumentExpression;
    if (ts.isStringLiteral(arg)) {
      name = arg.text;
    } else {
      name = `[${arg.getText(sourceFile)}]`;
    }
    target = ts.isIdentifier(expr.expression) ? expr.expression.text : expr.expression.getText(sourceFile);
  }
  // Complex expression
  else {
    name = expr.getText(sourceFile);
  }

  // Extract type arguments
  let typeArguments: string[] | undefined;
  if (node.typeArguments && node.typeArguments.length > 0) {
    typeArguments = node.typeArguments.map((t) => t.getText(sourceFile));
  }

  return {
    name,
    ...(target && { target }),
    location: getLocation(sourceFile, node),
    ...(isAwaited && { isAwait: isAwaited }),
    ...(isOptional && { isOptional: isOptional }),
    ...(isNew && { isNew: isNew }),
    argumentCount: node.arguments?.length ?? 0,
    ...(typeArguments && { typeArguments }),
  };
}

// =============================================================================
// FIELD ACCESS REFERENCE EXTRACTION
// =============================================================================

export interface FieldReference {
  name: string;
  target?: string;
  location: ParsedEntity["location"];
}

/**
 * Extract non-call property access expressions as field references.
 * obj.field → reference, but obj.method() is excluded (that's a call).
 */
export function extractFieldReferences(node: ts.Node, sourceFile: ts.SourceFile): FieldReference[] {
  const refs: FieldReference[] = [];
  const seen = new Set<string>();

  function visit(n: ts.Node): void {
    // PropertyAccessExpression that is NOT the callee of a CallExpression/NewExpression
    if (ts.isPropertyAccessExpression(n)) {
      const parent = n.parent;
      const isCallCallee =
        (ts.isCallExpression(parent) && parent.expression === n) ||
        (ts.isNewExpression(parent) && parent.expression === n);

      if (!isCallCallee) {
        const fieldName = n.name.text;
        const loc = getLocation(sourceFile, n);
        const key = `${fieldName}:${loc.start.line}`;
        if (!seen.has(key)) {
          seen.add(key);
          let target: string | undefined;
          if (ts.isIdentifier(n.expression)) {
            target = n.expression.text;
          } else if (n.expression.kind === ts.SyntaxKind.ThisKeyword) {
            target = "this";
          }
          refs.push({ name: fieldName, ...(target && { target }), location: loc });
        }
      }
    }

    ts.forEachChild(n, visit);
  }

  // Only extract from function/method bodies, not signatures
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  ) {
    if ((node as ts.FunctionLikeDeclaration).body) {
      visit((node as ts.FunctionLikeDeclaration).body!);
    }
  } else {
    visit(node);
  }

  return refs;
}

// =============================================================================
// TYPE REFERENCE EXTRACTION
// =============================================================================

export type TypeReference = NonNullable<ParsedEntity["typeReferences"]>[number];

/**
 * Extract type references from a node (function, method, class, etc.)
 */
export function extractTypeReferences(node: ts.Node, sourceFile: ts.SourceFile): TypeReference[] | undefined {
  const refs: TypeReference[] = [];
  const seenTypes = new Set<string>();

  function addRef(name: string, kind: TypeReference["kind"], loc: ts.Node): void {
    // Skip primitive types
    if (
      [
        "string",
        "number",
        "boolean",
        "void",
        "undefined",
        "null",
        "any",
        "unknown",
        "never",
        "object",
        "symbol",
        "bigint",
      ].includes(name)
    ) {
      return;
    }
    const key = `${name}:${kind}`;
    if (!seenTypes.has(key)) {
      seenTypes.add(key);
      refs.push({
        name,
        kind,
        location: getLocation(sourceFile, loc),
      });
    }
  }

  function extractFromTypeNode(typeNode: ts.TypeNode, kind: TypeReference["kind"]): void {
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeName = typeNode.typeName.getText(sourceFile);
      addRef(typeName, kind, typeNode);
      // Process type arguments
      if (typeNode.typeArguments) {
        for (const arg of typeNode.typeArguments) {
          extractFromTypeNode(arg, "generic");
        }
      }
    } else if (ts.isArrayTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.elementType, kind);
    } else if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      for (const t of typeNode.types) {
        extractFromTypeNode(t, kind);
      }
    } else if (ts.isTupleTypeNode(typeNode)) {
      for (const elem of typeNode.elements) {
        if (ts.isTypeNode(elem)) {
          extractFromTypeNode(elem, kind);
        }
      }
    } else if (ts.isParenthesizedTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.type, kind);
    } else if (ts.isConditionalTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.checkType, kind);
      extractFromTypeNode(typeNode.extendsType, kind);
      extractFromTypeNode(typeNode.trueType, kind);
      extractFromTypeNode(typeNode.falseType, kind);
    } else if (ts.isMappedTypeNode(typeNode)) {
      if (typeNode.type) {
        extractFromTypeNode(typeNode.type, kind);
      }
    } else if (ts.isIndexedAccessTypeNode(typeNode)) {
      extractFromTypeNode(typeNode.objectType, kind);
    }
  }

  // For functions/methods: extract from parameters and return type
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isMethodSignature(node)
  ) {
    // Parameters
    if ("parameters" in node) {
      for (const param of node.parameters) {
        if (param.type) {
          extractFromTypeNode(param.type, "parameter");
        }
      }
    }
    // Return type
    if ("type" in node && node.type) {
      extractFromTypeNode(node.type as ts.TypeNode, "return");
    }
    // Type parameters
    if ("typeParameters" in node && node.typeParameters) {
      for (const tp of node.typeParameters) {
        if (tp.constraint) {
          extractFromTypeNode(tp.constraint, "generic");
        }
        if (tp.default) {
          extractFromTypeNode(tp.default, "generic");
        }
      }
    }
  }

  // For classes: extract from heritage clauses
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        const kind: TypeReference["kind"] = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
        for (const type of clause.types) {
          const typeName = type.expression.getText(sourceFile);
          addRef(typeName, kind, type);
          if (type.typeArguments) {
            for (const arg of type.typeArguments) {
              extractFromTypeNode(arg, "generic");
            }
          }
        }
      }
    }
    // Type parameters
    if (node.typeParameters) {
      for (const tp of node.typeParameters) {
        if (tp.constraint) {
          extractFromTypeNode(tp.constraint, "generic");
        }
        if (tp.default) {
          extractFromTypeNode(tp.default, "generic");
        }
      }
    }
  }

  // For interfaces: extract from heritage clauses
  if (ts.isInterfaceDeclaration(node)) {
    if (node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        for (const type of clause.types) {
          const typeName = type.expression.getText(sourceFile);
          addRef(typeName, "extends", type);
          if (type.typeArguments) {
            for (const arg of type.typeArguments) {
              extractFromTypeNode(arg, "generic");
            }
          }
        }
      }
    }
    if (node.typeParameters) {
      for (const tp of node.typeParameters) {
        if (tp.constraint) {
          extractFromTypeNode(tp.constraint, "generic");
        }
      }
    }
  }

  // For type aliases: extract from the type itself
  if (ts.isTypeAliasDeclaration(node)) {
    extractFromTypeNode(node.type, "variable");
    if (node.typeParameters) {
      for (const tp of node.typeParameters) {
        if (tp.constraint) {
          extractFromTypeNode(tp.constraint, "generic");
        }
      }
    }
  }

  // For properties: extract from type annotation
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    if (node.type) {
      extractFromTypeNode(node.type, "property");
    }
  }

  // For variables
  if (ts.isVariableDeclaration(node) && node.type) {
    extractFromTypeNode(node.type, "variable");
  }

  return refs.length > 0 ? refs : undefined;
}
