/**
 * Python Analyzer Utility Functions and Constants
 *
 * Shared helpers, constants, and utility types for the Python analyzer.
 */

import type { ASTNode, MagicType, PythonParserMetrics } from "../../../types/parser.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Magic method mappings for Layer 2 - derived from MagicType type
 */
export const MAGIC_METHOD_TYPES: Record<string, MagicType> = {
  __init__: "init",
  __new__: "new",
  __del__: "del",
  __str__: "str",
  __repr__: "repr",
  __format__: "format",
  __bytes__: "bytes",
  __hash__: "hash",
  __bool__: "bool",
  __call__: "call",
  __len__: "len",
  __getitem__: "getitem",
  __setitem__: "setitem",
  __delitem__: "delitem",
  __contains__: "contains",
  __iter__: "iter",
  __next__: "next",
  __reversed__: "reversed",
  __enter__: "enter",
  __exit__: "exit",
  __aenter__: "aenter",
  __aexit__: "aexit",
  __eq__: "eq",
  __ne__: "ne",
  __lt__: "lt",
  __le__: "le",
  __gt__: "gt",
  __ge__: "ge",
  __add__: "add",
  __sub__: "sub",
  __mul__: "mul",
  __truediv__: "truediv",
  __floordiv__: "floordiv",
  __mod__: "mod",
  __pow__: "pow",
  __and__: "and",
  __or__: "or",
  __xor__: "xor",
  __lshift__: "lshift",
  __rshift__: "rshift",
  __invert__: "invert",
};

/**
 * Built-in decorators for Layer 1
 */
export const BUILTIN_DECORATORS = [
  "property",
  "staticmethod",
  "classmethod",
  "abstractmethod",
  "dataclass",
  "lru_cache",
  "singledispatch",
  "contextmanager",
  "asynccontextmanager",
  "wraps",
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert tree-sitter position to our format
 */
export function convertPosition(node: ASTNode) {
  return {
    start: {
      line: node.startPosition.row + 1,
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
 * Extract text content from a node
 */
export function getNodeText(node: ASTNode, source: string): string {
  return source.substring(node.startIndex, node.endIndex);
}

/**
 * Check if a string is a magic method name
 */
export function isMagicMethod(name: string): boolean {
  return name.startsWith("__") && name.endsWith("__") && name in MAGIC_METHOD_TYPES;
}

/**
 * Check if a decorator is built-in
 */
export function isBuiltinDecorator(name: string): boolean {
  return BUILTIN_DECORATORS.includes(name);
}

/**
 * Performance monitoring wrapper
 */
export function withPerformanceMonitoring<T>(operation: string, fn: () => T, metrics: PythonParserMetrics): T {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

  try {
    const result = fn();
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    const executionTime = endTime - startTime;
    const memoryDelta = endMemory - startMemory;

    metrics.overall.totalTimeMs += executionTime;
    if (memoryDelta > 0) {
      metrics.overall.memoryUsedMB = Math.max(metrics.overall.memoryUsedMB, endMemory);
    }

    return result;
  } catch (error) {
    console.error(`Performance monitoring error in ${operation}:`, error);
    throw error;
  }
}

/**
 * Check if function contains yield expressions (generator)
 */
export function hasYieldExpression(node: ASTNode): boolean {
  if (node.type === "yield" || node.type === "yield_from") {
    return true;
  }

  for (const child of node.namedChildren) {
    if (hasYieldExpression(child)) {
      return true;
    }
  }

  return false;
}
