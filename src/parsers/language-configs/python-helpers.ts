/**
 * TASK-003B: Enhanced Python Node Type Detection
 *
 * Helper functions for detecting Python-specific AST node types
 * across 4 layers of analysis.
 */

import type { SupportedLanguage } from "../../types/parser.js";
import { isClassNode, isExportNode, isFunctionNode, isImportNode, isTypeNode } from "./registry.js";

/**
 * Check if a node type represents a magic/dunder method (Layer 2)
 */
export function isMagicMethodNode(nodeType: string, nodeName: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  if (nodeType !== "function_definition" && nodeType !== "async_function_definition") return false;

  return nodeName.startsWith("__") && nodeName.endsWith("__") && nodeName.length > 4;
}

/**
 * Check if a node type represents an async pattern (Layer 2)
 */
export function isAsyncNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return nodeType === "async_function_definition" || nodeType === "async_with_statement" || nodeType === "await";
}

/**
 * Check if a node type represents a generator pattern (Layer 2)
 */
export function isGeneratorNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return nodeType === "yield" || nodeType === "yield_from" || nodeType === "generator_expression";
}

/**
 * Check if a node type represents a comprehension (Layer 2)
 */
export function isComprehensionNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return (
    nodeType === "list_comprehension" ||
    nodeType === "set_comprehension" ||
    nodeType === "dictionary_comprehension" ||
    nodeType === "generator_expression"
  );
}

/**
 * Check if a node type represents a context manager pattern (Layer 4)
 */
export function isContextManagerNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return nodeType === "with_statement" || nodeType === "async_with_statement";
}

/**
 * Check if a node type represents exception handling (Layer 4)
 */
export function isExceptionHandlingNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return (
    nodeType === "try_statement" ||
    nodeType === "except_clause" ||
    nodeType === "finally_clause" ||
    nodeType === "else_clause" ||
    nodeType === "raise_statement"
  );
}

/**
 * Check if a node type represents a decorator (Layer 1)
 */
export function isDecoratorNode(nodeType: string, language: SupportedLanguage): boolean {
  if (language !== "python") return false;
  return nodeType === "decorator" || nodeType === "decorated_definition";
}

/**
 * Check if a node type represents a dataclass or special class (Layer 2)
 */
export function isSpecialClassNode(
  nodeType: string,
  className: string,
  decorators: string[],
  language: SupportedLanguage,
): boolean {
  if (language !== "python") return false;
  if (nodeType !== "class_definition" && nodeType !== "decorated_definition") return false;

  // Check for dataclass decorator
  if (decorators.some((d) => d === "dataclass" || d.includes("dataclass"))) return true;

  // Check for special base classes
  const specialBaseClasses = ["NamedTuple", "Enum", "IntEnum", "Flag", "IntFlag", "Protocol", "Generic", "ABC"];
  return specialBaseClasses.some((base) => className.includes(base));
}

/**
 * Get enhanced node type category for Python (Layer 1-4)
 */
export function getPythonNodeCategory(
  nodeType: string,
  nodeName: string = "",
  language: SupportedLanguage = "python",
): string {
  if (language !== "python") return "unknown";

  // Layer 1: Enhanced basic parsing categories
  if (isFunctionNode(nodeType, language)) {
    if (nodeType === "async_function_definition") return "async_function";
    if (nodeType === "lambda") return "lambda";
    if (isMagicMethodNode(nodeType, nodeName, language)) return "magic_method";
    return "function";
  }

  if (isClassNode(nodeType, language)) {
    if (nodeType === "decorated_definition") return "decorated_class";
    return "class";
  }

  if (isImportNode(nodeType, language)) return "import";
  if (isExportNode(nodeType, language)) return "export";
  if (isTypeNode(nodeType, language)) return "type";

  // Layer 2: Advanced feature categories
  if (isAsyncNode(nodeType, language)) return "async_pattern";
  if (isGeneratorNode(nodeType, language)) return "generator_pattern";
  if (isComprehensionNode(nodeType, language)) return "comprehension";
  if (isDecoratorNode(nodeType, language)) return "decorator";

  // Layer 4: Pattern recognition categories
  if (isContextManagerNode(nodeType, language)) return "context_manager";
  if (isExceptionHandlingNode(nodeType, language)) return "exception_handling";

  // Layer 1: Variable assignments
  if (["assignment", "augmented_assignment", "annotated_assignment", "named_expression"].includes(nodeType)) {
    return "variable";
  }

  return "unknown";
}
