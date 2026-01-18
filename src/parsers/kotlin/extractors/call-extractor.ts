/**
 * Kotlin AST-Aware Call Extractor
 *
 * Extracts function calls, method calls, and constructor calls from Kotlin AST.
 * Replaces the regex-based extraction with accurate AST traversal.
 *
 * Key features:
 * - Extracts method invocations with target objects
 * - Handles safe calls (?.)
 * - Detects extension function calls
 * - Handles scope functions (let, run, apply, also, with)
 * - Handles coroutine builders (launch, async, withContext)
 * - Extracts type arguments for generic calls
 * - Counts arguments accurately
 */

import type { ParserRuleContext } from "antlr4ng";
import type {
  CallSuffixContext,
  FunctionBodyContext,
  NavigationSuffixContext,
  PostfixUnaryExpressionContext,
  PostfixUnarySuffixContext,
  TypeArgumentsContext,
  ValueArgumentsContext,
} from "../../../generated/kotlin/KotlinParser.js";
import type { CallInfo } from "../types.js";
import { getLocation, isCoroutineBuilder, isKotlinKeyword, isScopeFunction } from "../utils/ast-helpers.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract all function and method calls from a function body
 */
export function extractCalls(bodyCtx: FunctionBodyContext | ParserRuleContext | null): CallInfo[] {
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
  // Check if this node is a PostfixUnaryExpression with calls
  if (isPostfixUnaryExpression(node)) {
    const extractedCalls = extractCallsFromPostfix(node as PostfixUnaryExpressionContext);
    for (const callInfo of extractedCalls) {
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
 * Check if node is a PostfixUnaryExpressionContext
 */
function isPostfixUnaryExpression(node: ParserRuleContext): node is PostfixUnaryExpressionContext {
  return node.constructor.name === "PostfixUnaryExpressionContext";
}

// =============================================================================
// CALL EXTRACTION FROM POSTFIX EXPRESSION
// =============================================================================

/**
 * Extract calls from a PostfixUnaryExpression
 *
 * Structure:
 *   postfixUnaryExpression
 *     : primaryExpression postfixUnarySuffix*
 *     ;
 *
 *   postfixUnarySuffix
 *     : callSuffix         // function()
 *     | navigationSuffix   // .member or ?.member
 *     | indexingSuffix     // [index]
 *     | postfixUnaryOperator // ++ --
 *     | typeArguments      // <T>
 *     ;
 *
 * Examples:
 *   foo()           -> call "foo"
 *   obj.bar()       -> call "bar" with target "obj"
 *   obj?.baz()      -> safe call "baz" with target "obj"
 *   Foo()           -> constructor call "Foo"
 *   list.map { }    -> call "map" with lambda
 */
function extractCallsFromPostfix(ctx: PostfixUnaryExpressionContext): CallInfo[] {
  const calls: CallInfo[] = [];

  // Get the primary expression (base)
  const primaryExpr = ctx.primaryExpression?.();
  if (!primaryExpr) return calls;

  let currentTarget: string | undefined;
  let baseName = primaryExpr.getText?.() || "";

  // Get all postfix suffixes
  const suffixes = ctx.postfixUnarySuffix?.() || [];
  if (!Array.isArray(suffixes)) {
    // Single suffix case
    const suffix = suffixes as PostfixUnarySuffixContext;
    const callInfo = processSuffix(suffix, baseName, currentTarget, ctx);
    if (callInfo) calls.push(callInfo);
    return calls;
  }

  // Process chain of suffixes
  for (let i = 0; i < suffixes.length; i++) {
    const suffix = suffixes[i];
    if (!suffix) continue;

    // Check for navigation suffix (.member or ?.member)
    const navSuffix = suffix.navigationSuffix?.();
    if (navSuffix) {
      // Update target for next call
      currentTarget = currentTarget ? `${currentTarget}.${baseName}` : baseName;
      baseName = extractNavigationName(navSuffix);

      // Check for safe call (result stored for potential future use)
      checkSafeCall(navSuffix);

      // If next suffix is a call, we'll use this info
      // Otherwise, this is just property access
      const nextSuffix = suffixes[i + 1];
      if (nextSuffix?.callSuffix?.()) {
        // Next item is a call - continue
      }
      continue;
    }

    // Check for call suffix
    const callSuffix = suffix.callSuffix?.();
    if (callSuffix) {
      const prevSuffix = i > 0 ? suffixes[i - 1] : undefined;
      const callInfo = extractCallFromSuffix(callSuffix, baseName, currentTarget, prevSuffix);
      if (callInfo) {
        calls.push(callInfo);
      }

      // After a call, the result becomes the new target for chaining
      currentTarget = currentTarget ? `${currentTarget}.${baseName}` : baseName;
      baseName = ""; // Reset for potential next chain
    }
  }

  // Handle simple call: foo() with no navigation
  if (calls.length === 0 && suffixes.length > 0) {
    const firstSuffix = suffixes[0];
    if (firstSuffix) {
      const callSuffix = firstSuffix.callSuffix?.();
      if (callSuffix) {
        const callInfo = extractCallFromSuffix(callSuffix, baseName, undefined, undefined);
        if (callInfo) {
          calls.push(callInfo);
        }
      }
    }
  }

  return calls;
}

/**
 * Process a single suffix
 */
function processSuffix(
  suffix: PostfixUnarySuffixContext,
  baseName: string,
  currentTarget: string | undefined,
  _ctx: PostfixUnaryExpressionContext,
): CallInfo | null {
  const callSuffix = suffix.callSuffix?.();
  if (callSuffix) {
    return extractCallFromSuffix(callSuffix, baseName, currentTarget, undefined);
  }
  return null;
}

/**
 * Extract call information from a CallSuffix
 */
function extractCallFromSuffix(
  callSuffix: CallSuffixContext,
  name: string,
  target: string | undefined,
  prevSuffix: PostfixUnarySuffixContext | undefined,
): CallInfo | null {
  // Skip keywords
  if (isKotlinKeyword(name)) {
    return null;
  }

  const location = getLocation(callSuffix);

  // Check for safe call from previous navigation suffix
  let isSafeCall = false;
  if (prevSuffix) {
    const navSuffix = prevSuffix.navigationSuffix?.();
    if (navSuffix) {
      isSafeCall = checkSafeCall(navSuffix);
    }
  }

  // Get argument count
  const valueArgs = callSuffix.valueArguments?.();
  const argumentCount = countArguments(valueArgs);

  // Check for trailing lambda
  const annotatedLambda = callSuffix.annotatedLambda?.();
  const hasTrailingLambda = annotatedLambda !== null;

  // Get type arguments
  const typeArgsCtx = callSuffix.typeArguments?.();
  const typeArguments = extractTypeArguments(typeArgsCtx);

  // Detect constructor call (name starts with uppercase)
  const isNew = /^[A-Z]/.test(name) && !target;

  // Detect extension function call pattern
  // In Kotlin, extension calls look like obj.extensionFunc() but have implicit receiver
  const isExtensionCall = !!target && !isNew;

  return {
    name,
    ...(target && { target }),
    location,
    ...(isSafeCall && { isSafeCall }),
    ...(isNew && { isNew }),
    argumentCount: argumentCount + (hasTrailingLambda ? 1 : 0),
    ...(typeArguments && typeArguments.length > 0 && { typeArguments }),
    ...(isExtensionCall && { isExtensionCall }),
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract the member name from a NavigationSuffix
 */
function extractNavigationName(navSuffix: NavigationSuffixContext): string {
  const simpleId = navSuffix.simpleIdentifier?.();
  if (simpleId) {
    return simpleId.getText?.() || "";
  }

  // Parenthesized expression case
  const parenExpr = navSuffix.parenthesizedExpression?.();
  if (parenExpr) {
    return parenExpr.getText?.() || "";
  }

  // CLASS keyword case
  const classToken = navSuffix.CLASS?.();
  if (classToken) {
    return "class";
  }

  return "";
}

/**
 * Check if navigation suffix uses safe call (?.)
 */
function checkSafeCall(navSuffix: NavigationSuffixContext): boolean {
  const memberAccessOp = navSuffix.memberAccessOperator?.();
  if (!memberAccessOp) return false;

  // Check for safeNav context
  const safeNav = memberAccessOp.safeNav?.();
  return safeNav !== null;
}

/**
 * Count arguments in a value arguments context
 */
function countArguments(valueArgs: ValueArgumentsContext | null | undefined): number {
  if (!valueArgs) return 0;

  const args = valueArgs.valueArgument?.();
  if (!args) return 0;

  if (Array.isArray(args)) {
    return args.length;
  }

  return 1;
}

/**
 * Extract type arguments from TypeArgumentsContext
 */
function extractTypeArguments(typeArgsCtx: TypeArgumentsContext | null | undefined): string[] | undefined {
  if (!typeArgsCtx) return undefined;

  const typeProjection = typeArgsCtx.typeProjection?.();
  if (!typeProjection) return undefined;

  const projections = Array.isArray(typeProjection) ? typeProjection : [typeProjection];
  const result = projections.map((p) => p.getText?.() || "").filter(Boolean);

  return result.length > 0 ? result : undefined;
}

// =============================================================================
// SPECIAL CALL DETECTION
// =============================================================================

/**
 * Check if call is a coroutine builder (launch, async, withContext, etc.)
 */
export function isCoroutineCall(callInfo: CallInfo): boolean {
  return isCoroutineBuilder(callInfo.name);
}

/**
 * Check if call is a scope function (let, run, apply, also, with)
 */
export function isScopeFunctionCall(callInfo: CallInfo): boolean {
  return isScopeFunction(callInfo.name);
}

/**
 * Check if call might be a suspend function call (requires further analysis)
 */
export function isPotentialSuspendCall(callInfo: CallInfo): boolean {
  // Common suspend function patterns
  const suspendPatterns = [
    /^await/,
    /^fetch/,
    /^load/,
    /^save/,
    /^get.*Async$/,
    /^post.*Async$/,
    /Coroutine$/,
    /Suspend$/,
  ];

  return suspendPatterns.some((pattern) => pattern.test(callInfo.name));
}
