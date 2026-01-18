/**
 * Java ANTLR AST Helper Utilities
 *
 * Provides utility functions for traversing and extracting information
 * from Java ANTLR AST nodes. Used by all Java extractors.
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
 * Extract base type name from a type expression (removes generics and arrays)
 */
export function extractBaseTypeName(typeText: string): string {
  return typeText
    .replace(/<.*>/, "") // Remove generics
    .replace(/\[\]$/, "") // Remove array brackets
    .replace(/\.\.\./, "") // Remove varargs
    .trim();
}

/**
 * Extract generic type arguments from a type expression
 */
export function extractGenericArguments(typeText: string): string[] {
  const match = typeText.match(/<(.+)>/);
  if (!match) return [];

  // Simple split - doesn't handle nested generics perfectly but good enough for most cases
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

// =============================================================================
// JAVA-SPECIFIC HELPERS
// =============================================================================

/**
 * Java keywords that should not be treated as method calls
 */
export const JAVA_KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "return",
  "throw",
  "try",
  "catch",
  "finally",
  "new",
  "instanceof",
  "synchronized",
  "assert",
  "break",
  "continue",
  "default",
  "super",
  "this",
  "class",
  "interface",
  "enum",
  "extends",
  "implements",
  "import",
  "package",
  "public",
  "private",
  "protected",
  "static",
  "final",
  "abstract",
  "native",
  "strictfp",
  "transient",
  "volatile",
  "void",
  "boolean",
  "byte",
  "char",
  "short",
  "int",
  "long",
  "float",
  "double",
]);

/**
 * Common Java primitives
 */
export const JAVA_PRIMITIVES = new Set(["boolean", "byte", "char", "short", "int", "long", "float", "double", "void"]);

/**
 * Check if a name is a Java keyword
 */
export function isJavaKeyword(name: string): boolean {
  return JAVA_KEYWORDS.has(name);
}

/**
 * Check if a type is a Java primitive
 */
export function isJavaPrimitive(type: string): boolean {
  return JAVA_PRIMITIVES.has(type);
}

// =============================================================================
// CALL TARGET DETECTION
// =============================================================================

/**
 * Determine the call target from an expression
 */
export function determineCallTarget(expressionText: string): { target?: string; name: string } {
  // Handle chained calls like a.b.c()
  const parts = expressionText.split(".");
  if (parts.length === 1) {
    return { name: parts[0] || "" };
  }

  const name = parts.pop() || "";
  const target = parts.join(".");

  // Normalize 'this' at the start
  if (parts[0] === "this" && parts.length === 1) {
    return { target: "this", name };
  }

  return { target, name };
}

/**
 * Check if expression represents a static call
 */
export function isStaticCall(target: string): boolean {
  // Static calls typically start with uppercase (ClassName.method())
  return /^[A-Z]/.test(target);
}

/**
 * Check if expression represents a super call
 */
export function isSuperCall(target: string): boolean {
  return target === "super";
}

/**
 * Check if expression represents a this call
 */
export function isThisCall(target: string): boolean {
  return target === "this";
}
