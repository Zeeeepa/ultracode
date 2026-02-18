/**
 * Base Parser Utilities
 *
 * Common utility functions extracted from multiple parser implementations:
 * - hasChild: Used in csharp-analyzer, rust-analyzer
 * - getNodeLocation: Used in c-analyzer, cpp-analyzer
 * - checkCircuitBreakers: Used in go-analyzer, java-analyzer
 *
 * Eliminates ~150 lines of duplicated code across parsers
 */

import type { ASTNode, ParsedEntity } from "../types/parser.js";

/**
 * Pre-computed line offset map for O(log n) index→line/column lookups.
 *
 * Replaces O(n) char-by-char iteration per call with a single O(n) build pass
 * and O(log n) binary search per query. For a 190K-line file with 2000+ entities,
 * this reduces ~380M iterations to ~34K binary search steps.
 */
export class LineOffsetMap {
  private offsets: number[];

  constructor(content: string) {
    this.offsets = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === "\n") this.offsets.push(i + 1);
    }
  }

  getLocation(index: number): { line: number; column: number; index: number } {
    let lo = 0;
    let hi = this.offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - this.offsets[lo]!, index };
  }

  getEntityLocation(index: number): ParsedEntity["location"] {
    const start = this.getLocation(index);
    return { start, end: { line: start.line, column: start.column + 1, index: index + 1 } };
  }

  getLine(index: number): number {
    return this.getLocation(index).line;
  }
}

export interface Location {
  start: {
    line: number;
    column: number;
    index: number;
  };
  end: {
    line: number;
    column: number;
    index: number;
  };
}

export class CircuitBreakerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Check if a node has a child of the specified type
 *
 * Used in: csharp-analyzer, rust-analyzer
 * Eliminates: 2x ~10 lines = 20 lines of duplication
 */
export function hasChild(node: ASTNode, type: string): boolean {
  for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
    const child = node.child(childIndex);
    if (child && child.type === type) {
      return true;
    }
  }
  return false;
}

/**
 * Get location information from a tree-sitter node
 *
 * Used in: c-analyzer, cpp-analyzer
 * Eliminates: 2x ~20 lines = 40 lines of duplication
 */
export function getNodeLocation(node: ASTNode): Location {
  return {
    start: {
      line: node.startPosition.row + 1, // tree-sitter is 0-indexed, we want 1-indexed
      column: node.startPosition.column,
      index: node.startIndex,
    },
    end: {
      line: node.endPosition.row + 1,
      column: node.endPosition.column,
      index: node.endIndex,
    },
  };
}

/**
 * Check circuit breakers to prevent infinite loops and timeouts
 *
 * Used in: go-analyzer, java-analyzer
 * Eliminates: 2x ~15 lines = 30 lines of duplication
 *
 * @throws {CircuitBreakerError} If limits are exceeded
 */
export function checkCircuitBreakers(
  recursionDepth: number,
  parseStartTime: number,
  maxRecursionDepth: number = 100,
  parseTimeoutMs: number = 30000,
): void {
  // Recursion depth check
  if (recursionDepth > maxRecursionDepth) {
    throw new CircuitBreakerError(`Maximum recursion depth ${maxRecursionDepth} exceeded`);
  }

  // Timeout check
  const elapsedTime = Date.now() - parseStartTime;
  if (elapsedTime > parseTimeoutMs) {
    throw new CircuitBreakerError(`Parse timeout ${parseTimeoutMs}ms exceeded`);
  }
}

/**
 * Find all nodes of specific types in a tree
 *
 * Common pattern used across multiple analyzers
 */
export function findNodesByType(rootNode: ASTNode, types: string[], maxDepth: number = 50): ASTNode[] {
  const results: ASTNode[] = [];
  const typeSet = new Set(types);

  function traverse(node: ASTNode, depth: number): void {
    if (depth > maxDepth) return;

    if (typeSet.has(node.type)) {
      results.push(node);
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(rootNode, 0);
  return results;
}

/**
 * Get text content of a node, handling undefined cases
 */
export function getNodeText(node: ASTNode | undefined, sourceCode: string): string {
  if (!node) return "";
  return sourceCode.slice(node.startIndex, node.endIndex);
}

/**
 * Check if a node contains a specific text pattern
 */
export function nodeContainsText(node: ASTNode, sourceCode: string, pattern: string | RegExp): boolean {
  const text = getNodeText(node, sourceCode);
  if (typeof pattern === "string") {
    return text.includes(pattern);
  }
  return pattern.test(text);
}

/**
 * Extract identifier name from various node types
 */
export function extractIdentifierName(node: ASTNode, sourceCode: string): string | null {
  // Try common identifier child types
  const identifierTypes = ["identifier", "name", "property_identifier", "field_identifier"];

  for (const type of identifierTypes) {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === type) {
        return getNodeText(child, sourceCode);
      }
    }
  }

  return null;
}
