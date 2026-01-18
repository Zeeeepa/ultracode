/**
 * Java AST-Aware Call Extractor
 *
 * Extracts method calls, constructor calls, and static calls from Java AST.
 * Replaces the regex-based extraction with accurate AST traversal.
 *
 * Key features:
 * - Extracts method invocations with target objects
 * - Handles constructor calls (new expressions)
 * - Detects static calls, super calls, this calls
 * - Extracts type arguments for generic calls
 * - Counts arguments accurately
 */

import type { ParserRuleContext } from "antlr4ng";
import type {
  ArgumentListContext,
  ClassInstanceCreationExpressionContext,
  MethodBodyContext,
  MethodInvocationContext,
  PrimaryContext,
  TypeArgumentsContext,
  UnqualifiedClassInstanceCreationExpressionContext,
} from "../../../generated/java/Java20Parser.js";
import type { CallInfo, LocationInfo } from "../types.js";
import { getLocation, JAVA_KEYWORDS } from "../utils/ast-helpers.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract all method and constructor calls from a method body
 */
export function extractCalls(bodyCtx: MethodBodyContext | ParserRuleContext | null): CallInfo[] {
  if (!bodyCtx) return [];

  const calls: CallInfo[] = [];
  const seenCalls = new Set<string>(); // Deduplicate by location

  visitNode(bodyCtx, calls, seenCalls);

  return calls;
}

/**
 * Extract calls and return simple string array for backward compatibility
 */
export function extractCallsSimple(bodyCtx: unknown): string[] {
  if (!bodyCtx) return [];

  const calls = extractCalls(bodyCtx as ParserRuleContext);
  const names = calls.map((c) => (c.target ? `${c.target}.${c.name}` : c.name));
  return Array.from(new Set(names));
}

/**
 * Alias for extractCalls with explicit name indicating detailed info
 */
export const extractCallsDetailed = extractCalls;

// =============================================================================
// AST TRAVERSAL
// =============================================================================

/**
 * Recursively visit all nodes to find calls
 */
function visitNode(node: ParserRuleContext, calls: CallInfo[], seenCalls: Set<string>): void {
  // Check if this node is a method invocation
  if (isMethodInvocation(node)) {
    const callInfo = extractMethodInvocationInfo(node as MethodInvocationContext);
    if (callInfo) {
      const key = `${callInfo.location.start.line}:${callInfo.location.start.column}:${callInfo.name}`;
      if (!seenCalls.has(key)) {
        seenCalls.add(key);
        calls.push(callInfo);
      }
    }
  }

  // Check if this node is a class instance creation (new expression)
  if (isClassInstanceCreation(node)) {
    const callInfo = extractClassInstanceCreationInfo(node as ClassInstanceCreationExpressionContext);
    if (callInfo) {
      const key = `${callInfo.location.start.line}:${callInfo.location.start.column}:${callInfo.name}`;
      if (!seenCalls.has(key)) {
        seenCalls.add(key);
        calls.push(callInfo);
      }
    }
  }

  // Recurse into children
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i);
    if (child && "ruleIndex" in child) {
      visitNode(child as ParserRuleContext, calls, seenCalls);
    }
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if node is a MethodInvocationContext
 */
function isMethodInvocation(node: ParserRuleContext): node is MethodInvocationContext {
  return node.constructor.name === "MethodInvocationContext";
}

/**
 * Check if node is a ClassInstanceCreationExpressionContext
 */
function isClassInstanceCreation(node: ParserRuleContext): node is ClassInstanceCreationExpressionContext {
  return node.constructor.name === "ClassInstanceCreationExpressionContext";
}

// =============================================================================
// METHOD INVOCATION EXTRACTION
// =============================================================================

/**
 * Extract detailed call information from a MethodInvocationContext
 *
 * Grammar patterns:
 * - methodName(args)                          -> simple call
 * - typeName.identifier(args)                 -> static/qualified call
 * - expressionName.identifier(args)           -> object.method call
 * - primary.identifier(args)                  -> chained call
 * - super.identifier(args)                    -> super call
 * - typeName.super.identifier(args)           -> qualified super call
 */
function extractMethodInvocationInfo(ctx: MethodInvocationContext): CallInfo | null {
  const location = getLocation(ctx);

  // Get method name
  const methodNameCtx = ctx.methodName?.();
  const identifierCtx = ctx.identifier?.();

  let name: string;
  let target: string | undefined;
  let isStatic = false;
  let isSuper = false;

  if (methodNameCtx) {
    // Simple method call: methodName(args)
    name = methodNameCtx.getText();
  } else if (identifierCtx) {
    // Qualified call: something.identifier(args)
    name = identifierCtx.getText();

    // Determine the target
    const typeNameCtx = ctx.typeName?.();
    const expressionNameCtx = ctx.expressionName?.();
    const primaryCtx = ctx.primary?.();
    const superToken = ctx.SUPER?.();

    if (superToken) {
      // super.method() or TypeName.super.method()
      isSuper = true;
      if (typeNameCtx) {
        target = `${typeNameCtx.getText()}.super`;
      } else {
        target = "super";
      }
    } else if (typeNameCtx) {
      // TypeName.method() - likely static call
      target = typeNameCtx.getText();
      isStatic = isStaticTarget(target);
    } else if (expressionNameCtx) {
      // obj.method() or field.method()
      target = expressionNameCtx.getText();
    } else if (primaryCtx) {
      // (expression).method() or this.method() or chained.method()
      target = extractPrimaryTarget(primaryCtx);
    }
  } else {
    // Fallback: try to parse from full text
    const text = ctx.getText();
    const match = text.match(/^(.+)\.(\w+)\s*\(/);
    if (match) {
      target = match[1];
      name = match[2] || "";
    } else {
      const simpleMatch = text.match(/^(\w+)\s*\(/);
      name = simpleMatch?.[1] || text.split("(")[0] || "";
    }
  }

  // Skip if name is a keyword
  if (JAVA_KEYWORDS.has(name)) {
    return null;
  }

  // Get argument count
  const argumentList = ctx.argumentList?.();
  const argumentCount = countArguments(argumentList);

  // Get type arguments
  const typeArguments = extractTypeArguments(ctx.typeArguments?.());

  return {
    name,
    ...(target && { target }),
    location,
    ...(isStatic && { isStatic }),
    ...(isSuper && { isSuper }),
    argumentCount,
    ...(typeArguments && { typeArguments }),
  };
}

// =============================================================================
// CLASS INSTANCE CREATION EXTRACTION
// =============================================================================

/**
 * Extract call information from a ClassInstanceCreationExpressionContext (new)
 */
function extractClassInstanceCreationInfo(ctx: ClassInstanceCreationExpressionContext): CallInfo | null {
  const location = getLocation(ctx);

  // Try to get unqualified creation: new ClassName(args)
  const unqualified = ctx.unqualifiedClassInstanceCreationExpression?.();
  if (unqualified) {
    return extractUnqualifiedCreation(unqualified, location);
  }

  // Qualified creation: expr.new ClassName(args) - inner class creation
  const expressionNameCtx = (ctx as any).expressionName?.();
  const primaryCtx = (ctx as any).primary?.();

  let target: string | undefined;
  if (expressionNameCtx) {
    target = expressionNameCtx.getText?.();
  } else if (primaryCtx) {
    target = extractPrimaryTarget(primaryCtx);
  }

  // Get the inner unqualified creation
  const innerUnqualified = (ctx as any).unqualifiedClassInstanceCreationExpression?.();
  if (innerUnqualified) {
    const result = extractUnqualifiedCreation(innerUnqualified, location);
    if (result) {
      return {
        ...result,
        ...(target && { target }),
      };
    }
  }

  return null;
}

/**
 * Extract from UnqualifiedClassInstanceCreationExpressionContext
 */
function extractUnqualifiedCreation(
  ctx: UnqualifiedClassInstanceCreationExpressionContext | any,
  location: LocationInfo,
): CallInfo | null {
  // Get class type - usually classOrInterfaceTypeToInstantiate
  const classToInstantiate = ctx.classOrInterfaceTypeToInstantiate?.();
  if (!classToInstantiate) return null;

  // Get the class name (may include type arguments)
  const fullName = classToInstantiate.getText?.() || "";
  // Extract base name without generics
  const name = fullName.replace(/<.*>/, "");

  if (!name) return null;

  // Get argument count
  const argumentList = ctx.argumentList?.();
  const argumentCount = countArguments(argumentList);

  // Get type arguments
  const typeArgs = classToInstantiate.typeArgumentsOrDiamond?.();
  let typeArguments: string[] | undefined;
  if (typeArgs) {
    const typeArgsCtx = typeArgs.typeArguments?.();
    if (typeArgsCtx) {
      typeArguments = extractTypeArguments(typeArgsCtx);
    }
  }

  return {
    name,
    location,
    isNew: true,
    argumentCount,
    ...(typeArguments && typeArguments.length > 0 && { typeArguments }),
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract the target from a PrimaryContext
 */
function extractPrimaryTarget(primary: PrimaryContext): string {
  const text = primary.getText?.() || "";

  // Check for 'this'
  if (text === "this" || text.startsWith("this.")) {
    return "this";
  }

  // Check for 'super'
  if (text === "super" || text.startsWith("super.")) {
    return "super";
  }

  // For parenthesized expressions or method chains, return the text
  // Strip the trailing part if it ends with method call
  const withoutCall = text.replace(/\.\w+\s*\([^)]*\)\s*$/, "");
  return withoutCall || text;
}

/**
 * Count arguments in an argument list
 */
function countArguments(argumentList: ArgumentListContext | null | undefined): number {
  if (!argumentList) return 0;

  const expressions = argumentList.expression?.();
  if (Array.isArray(expressions)) {
    return expressions.length;
  }

  // If single expression (not array), return 1
  return expressions ? 1 : 0;
}

/**
 * Extract type arguments from TypeArgumentsContext
 */
function extractTypeArguments(typeArgsCtx: TypeArgumentsContext | null | undefined): string[] | undefined {
  if (!typeArgsCtx) return undefined;

  const typeArgList = typeArgsCtx.typeArgumentList?.();
  if (!typeArgList) return undefined;

  const typeArgs = typeArgList.typeArgument?.();
  if (!typeArgs) return undefined;

  const args = Array.isArray(typeArgs) ? typeArgs : [typeArgs];
  const result = args.map((arg) => arg.getText?.() || "").filter(Boolean);

  return result.length > 0 ? result : undefined;
}

/**
 * Check if target looks like a static call (starts with uppercase)
 */
function isStaticTarget(target: string): boolean {
  // Static calls typically start with uppercase (ClassName.method())
  // or are fully qualified (com.example.ClassName.method())
  const firstName = target.split(".")[0] || "";
  return /^[A-Z]/.test(firstName);
}
