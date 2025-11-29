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

import type { TreeSitterNode } from "../types/parser.js";

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
export function hasChild(node: TreeSitterNode, type: string): boolean {
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
export function getNodeLocation(node: TreeSitterNode): Location {
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
export function findNodesByType(rootNode: TreeSitterNode, types: string[], maxDepth: number = 50): TreeSitterNode[] {
  const results: TreeSitterNode[] = [];
  const typeSet = new Set(types);

  function traverse(node: TreeSitterNode, depth: number): void {
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
export function getNodeText(node: TreeSitterNode | undefined, sourceCode: string): string {
  if (!node) return "";
  return sourceCode.slice(node.startIndex, node.endIndex);
}

/**
 * Check if a node contains a specific text pattern
 */
export function nodeContainsText(node: TreeSitterNode, sourceCode: string, pattern: string | RegExp): boolean {
  const text = getNodeText(node, sourceCode);
  if (typeof pattern === "string") {
    return text.includes(pattern);
  }
  return pattern.test(text);
}

/**
 * Extract identifier name from various node types
 */
export function extractIdentifierName(node: TreeSitterNode, sourceCode: string): string | null {
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
