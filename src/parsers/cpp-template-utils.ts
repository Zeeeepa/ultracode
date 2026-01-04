/**
 * C++ Template Utilities
 *
 * Helper functions for analyzing C++ template declarations.
 */

import type { ASTNode } from "../types/parser.js";

/**
 * SFINAE patterns that indicate complex templates to skip
 */
const SFINAE_PATTERNS = [
  "enable_if",
  "is_same",
  "is_base_of",
  "conditional",
  "decay",
  "remove_reference",
  "typename std::enable_if",
];

/**
 * Extract template parameters from parameter list node
 */
export function extractTemplateParameters(parametersNode: ASTNode | null): string {
  if (!parametersNode) return "";

  // Collect type parameter names from:
  // - type_parameter_declaration
  // - parameter_declaration
  // - type_parameter_pack

  const names = new Set<string>();
  const stack: ASTNode[] = [...parametersNode.children];

  while (stack.length) {
    const n = stack.pop()!;
    if (n.type === "type_identifier" || n.type === "identifier") {
      const t = n.text.trim();
      if (t && /^[A-Za-z_]\w*$/.test(t)) {
        names.add(t);
      }
    }

    for (const c of n.children) stack.push(c);
  }

  return Array.from(names).join(", ");
}

/**
 * Check if template is too complex to analyze
 * (variadic templates, SFINAE patterns, template-template parameters)
 */
export function isComplexTemplate(templateParams: string, nodeText: string): boolean {
  // Skip variadic templates
  if (templateParams.includes("...") || nodeText.includes("...")) {
    return true;
  }

  // Skip SFINAE patterns
  for (const pattern of SFINAE_PATTERNS) {
    if (nodeText.includes(pattern)) {
      return true;
    }
  }

  // Skip complex template metaprogramming patterns
  if (nodeText.includes("template<template")) {
    return true;
  }

  return false;
}
