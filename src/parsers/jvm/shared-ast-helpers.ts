/**
 * JVM Shared AST Helper Utilities
 *
 * Functions 100% identical between Java and Kotlin ANTLR parsers.
 * Language-specific helpers remain in java/utils/ast-helpers.ts
 * and kotlin/utils/ast-helpers.ts.
 */

import type { ParserRuleContext, TerminalNode } from "antlr4ng";
import type { AntlrContext, LocationInfo } from "./shared-types.js";

// =============================================================================
// LOCATION EXTRACTION
// =============================================================================

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

export function getText(ctx: ParserRuleContext | null | undefined): string {
  return ctx?.getText() || "";
}

export function getTextTrimmed(ctx: ParserRuleContext | null | undefined): string {
  return getText(ctx).trim();
}

export function getIdentifierText(ctx: unknown): string {
  if (!ctx) return "";
  const identifierCtx = ctx as { getText?: () => string };
  return identifierCtx.getText?.() || "";
}

// =============================================================================
// TYPE EXTRACTION HELPERS
// =============================================================================

/**
 * Extract generic type arguments from a type expression.
 * Handles nested generics via depth tracking.
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

// =============================================================================
// CALL TARGET DETECTION (shared base — language-specific wrappers extend this)
// =============================================================================

export function isSuperCall(target: string): boolean {
  return target === "super" || target.startsWith("super<");
}

export function isThisCall(target: string): boolean {
  return target === "this" || target.startsWith("this@");
}
