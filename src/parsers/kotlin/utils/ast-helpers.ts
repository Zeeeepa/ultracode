/**
 * Kotlin ANTLR AST Helper Utilities
 *
 * Provides utility functions for traversing and extracting information
 * from Kotlin ANTLR AST nodes. Used by all Kotlin extractors.
 */

import type { ParserRuleContext, TerminalNode } from "antlr4ng";
import type { AntlrContext, LocationInfo } from "../types.js";

// =============================================================================
// LOCATION EXTRACTION
// =============================================================================

/**
 * Extract location information from an ANTLR context
 */
export function getLocation(ctx: unknown): LocationInfo {
  const contextObj = ctx as AntlrContext;
  const start = contextObj.start || contextObj._start || { line: 1, column: 0, start: 0 };
  const stop = contextObj.stop || contextObj._stop || start;

  return {
    start: {
      line: start.line || 1,
      column: start.column || 0,
      index: start.start || 0,
    },
    end: {
      line: stop.line || start.line || 1,
      column: (stop.column || 0) + (stop.text?.length || 0),
      index: (stop.stop || start.start || 0) + 1,
    },
  };
}

/**
 * Get location from a terminal node
 */
export function getTerminalLocation(terminal: TerminalNode | null): LocationInfo | null {
  if (!terminal) return null;
  const symbol = terminal.symbol;
  if (!symbol) return null;

  return {
    start: {
      line: symbol.line || 1,
      column: symbol.column || 0,
      index: symbol.start || 0,
    },
    end: {
      line: symbol.line || 1,
      column: (symbol.column || 0) + (symbol.text?.length || 0),
      index: (symbol.stop || symbol.start || 0) + 1,
    },
  };
}

// =============================================================================
// AST TRAVERSAL
// =============================================================================

/**
 * Visit all children of a context recursively
 */
export function visitChildren<T>(ctx: ParserRuleContext, visitor: (child: ParserRuleContext) => T | undefined): T[] {
  const results: T[] = [];

  for (let i = 0; i < ctx.getChildCount(); i++) {
    const child = ctx.getChild(i);
    if (child && "ruleIndex" in child) {
      const result = visitor(child as ParserRuleContext);
      if (result !== undefined) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Find all descendant nodes of a specific type
 */
export function findAllDescendants<T extends ParserRuleContext>(
  ctx: ParserRuleContext,
  predicate: (node: ParserRuleContext) => node is T,
): T[] {
  const results: T[] = [];

  function visit(node: ParserRuleContext): void {
    if (predicate(node)) {
      results.push(node);
    }
    for (let i = 0; i < node.getChildCount(); i++) {
      const child = node.getChild(i);
      if (child && "ruleIndex" in child) {
        visit(child as ParserRuleContext);
      }
    }
  }

  visit(ctx);
  return results;
}

/**
 * Find the first ancestor of a specific type
 */
export function findAncestor<T extends ParserRuleContext>(
  ctx: ParserRuleContext,
  predicate: (node: ParserRuleContext) => node is T,
): T | null {
  let current: ParserRuleContext | null = ctx.parent as ParserRuleContext | null;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent as ParserRuleContext | null;
  }
  return null;
}

// =============================================================================
// TEXT EXTRACTION
// =============================================================================

/**
 * Get the full text of a context, or empty string if null
 */
export function getText(ctx: ParserRuleContext | null | undefined): string {
  return ctx?.getText() || "";
}

/**
 * Get text without whitespace
 */
export function getTextTrimmed(ctx: ParserRuleContext | null | undefined): string {
  return getText(ctx).trim();
}

/**
 * Extract identifier text safely
 */
export function getIdentifierText(ctx: unknown): string {
  if (!ctx) return "";
  const identifierCtx = ctx as { getText?: () => string };
  return identifierCtx.getText?.() || "";
}

// =============================================================================
// TYPE EXTRACTION HELPERS
// =============================================================================

/**
 * Extract base type name from a type expression
 * Handles Kotlin nullable types (?) and generics
 */
export function extractBaseTypeName(typeText: string): string {
  return typeText
    .replace(/<.*>/, "") // Remove generics
    .replace(/\?$/, "") // Remove nullable marker
    .replace(/\.\*$/, "") // Remove star projection
    .trim();
}

/**
 * Extract generic type arguments from a type expression
 */
export function extractGenericArguments(typeText: string): string[] {
  const match = typeText.match(/<(.+)>/);
  if (!match) return [];

  const args = match[1] || "";
  const result: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of args) {
    if (char === "<") depth++;
    else if (char === ">") depth--;
    else if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Check if type is nullable
 */
export function isNullableType(typeText: string): boolean {
  return typeText.endsWith("?");
}

// =============================================================================
// KOTLIN-SPECIFIC KEYWORDS
// =============================================================================

/**
 * Kotlin keywords that should not be treated as method calls
 */
export const KOTLIN_KEYWORDS = new Set([
  // Control flow
  "if",
  "else",
  "when",
  "for",
  "while",
  "do",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "break",
  "continue",

  // Declarations
  "class",
  "interface",
  "object",
  "fun",
  "val",
  "var",
  "typealias",
  "constructor",
  "init",

  // Modifiers
  "public",
  "private",
  "protected",
  "internal",
  "open",
  "final",
  "abstract",
  "sealed",
  "data",
  "enum",
  "annotation",
  "inner",
  "companion",
  "inline",
  "noinline",
  "crossinline",
  "reified",
  "suspend",
  "tailrec",
  "operator",
  "infix",
  "external",
  "const",
  "lateinit",
  "vararg",

  // Special
  "this",
  "super",
  "null",
  "true",
  "false",
  "is",
  "as",
  "in",
  "out",
  "where",
  "by",
  "get",
  "set",
  "field",
  "it",
  "import",
  "package",
]);

/**
 * Kotlin scope functions
 */
export const KOTLIN_SCOPE_FUNCTIONS = new Set(["let", "run", "with", "apply", "also"]);

/**
 * Kotlin coroutine builders
 */
export const KOTLIN_COROUTINE_BUILDERS = new Set([
  "launch",
  "async",
  "runBlocking",
  "withContext",
  "coroutineScope",
  "supervisorScope",
]);

/**
 * Kotlin flow operators
 */
export const KOTLIN_FLOW_OPERATORS = new Set([
  "flow",
  "flowOf",
  "asFlow",
  "collect",
  "map",
  "filter",
  "take",
  "drop",
  "transform",
  "flatMapConcat",
  "flatMapMerge",
  "flatMapLatest",
  "combine",
  "zip",
  "stateIn",
  "shareIn",
]);

/**
 * Check if a name is a Kotlin keyword
 */
export function isKotlinKeyword(name: string): boolean {
  return KOTLIN_KEYWORDS.has(name);
}

/**
 * Check if a name is a scope function
 */
export function isScopeFunction(name: string): boolean {
  return KOTLIN_SCOPE_FUNCTIONS.has(name);
}

/**
 * Check if a name is a coroutine builder
 */
export function isCoroutineBuilder(name: string): boolean {
  return KOTLIN_COROUTINE_BUILDERS.has(name);
}

/**
 * Check if a name is a flow operator
 */
export function isFlowOperator(name: string): boolean {
  return KOTLIN_FLOW_OPERATORS.has(name);
}

// =============================================================================
// CALL TARGET DETECTION
// =============================================================================

/**
 * Determine the call target from an expression
 * Handles Kotlin-specific patterns like safe calls (?.) and scope functions
 */
export function determineCallTarget(expressionText: string): {
  target?: string;
  name: string;
  isSafeCall: boolean;
} {
  // Check for safe call
  const isSafeCall = expressionText.includes("?.");

  // Split by both . and ?.
  const parts = expressionText.split(/\??\./).filter((p) => p);

  if (parts.length === 1) {
    return { name: parts[0] || "", isSafeCall: false };
  }

  const name = parts.pop()!;
  const target = parts.join(".");

  // Normalize 'this' at the start
  if (parts[0] === "this" && parts.length === 1) {
    return { target: "this", name, isSafeCall };
  }

  return { target, name, isSafeCall };
}

/**
 * Check if expression represents a companion object call
 */
export function isCompanionCall(target: string): boolean {
  return target.endsWith(".Companion") || /^[A-Z]/.test(target);
}

/**
 * Check if expression represents a super call
 */
export function isSuperCall(target: string): boolean {
  return target === "super" || target.startsWith("super<");
}

/**
 * Check if expression represents a this call
 */
export function isThisCall(target: string): boolean {
  return target === "this" || target.startsWith("this@");
}

/**
 * Check if call is a lambda invocation (implicit invoke)
 */
export function isLambdaInvocation(expressionText: string): boolean {
  // Patterns like: lambda(), block(), callback()
  return /^[a-z_]\w*\s*\(/.test(expressionText) && !KOTLIN_KEYWORDS.has(expressionText.split("(")[0] || "");
}

// =============================================================================
// EXTENSION FUNCTION HELPERS
// =============================================================================

/**
 * Extract receiver type from extension function declaration
 */
export function extractReceiverType(functionText: string): string | undefined {
  // Pattern: fun ReceiverType.functionName(...)
  const match = functionText.match(/fun\s+(\w+(?:<[^>]+>)?(?:\?)?)\.(\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Check if a function declaration is an extension function
 */
export function isExtensionFunction(functionText: string): boolean {
  return /fun\s+\w+(?:<[^>]+>)?(?:\?)?\./.test(functionText);
}
