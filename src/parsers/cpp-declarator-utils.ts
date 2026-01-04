/**
 * C++ Declarator Utilities
 *
 * Helper functions for extracting names and qualifiers from C++ AST declarator nodes.
 */

import type { ASTNode } from "../types/parser.js";

/**
 * Extract function name from declarator node
 */
export function extractFunctionName(declaratorNode: ASTNode | null): string | null {
  if (!declaratorNode) return null;

  // Handle different declarator types
  if (declaratorNode.type === "function_declarator") {
    const nameNode = declaratorNode.childForFieldName("declarator");
    if (nameNode?.type === "identifier") {
      return nameNode.text;
    } else if (nameNode?.type === "qualified_identifier") {
      return nameNode.text.split("::").pop() || null;
    } else if (nameNode?.type === "operator_function_id") {
      return nameNode.text; // e.g. "operator[]", "operator()"
    } else if (nameNode?.type === "operator_cast") {
      return nameNode.text; // e.g. "operator int"
    } else if (nameNode?.type === "operator_name") {
      return nameNode.text;
    } else if (nameNode?.type === "destructor_name") {
      return nameNode.text;
    } else if (nameNode) {
      return extractFunctionName(nameNode);
    } else {
      const cand = declaratorNode.children.find(
        (c) =>
          c.type === "identifier" ||
          c.type === "qualified_identifier" ||
          c.type === "operator_function_id" ||
          c.type === "operator_cast" ||
          c.type === "operator_name" ||
          c.type === "destructor_name",
      );
      if (cand) {
        return cand.type === "qualified_identifier" ? cand.text.split("::").pop() || null : cand.text;
      }
    }
  } else if (declaratorNode.type === "identifier") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "field_identifier") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "operator_function_id") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "operator_cast") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "qualified_identifier") {
    return declaratorNode.text.split("::").pop() || null;
  } else if (declaratorNode.type === "operator_name") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "destructor_name") {
    return declaratorNode.text;
  } else if (
    declaratorNode.type === "reference_declarator" ||
    declaratorNode.type === "pointer_declarator" ||
    declaratorNode.type === "parenthesized_declarator" ||
    declaratorNode.type === "array_declarator"
  ) {
    const inner =
      declaratorNode.childForFieldName("declarator") ||
      declaratorNode.children.find(
        (c) =>
          c.type === "function_declarator" ||
          c.type === "identifier" ||
          c.type === "field_identifier" ||
          c.type === "qualified_identifier" ||
          c.type === "operator_function_id" ||
          c.type === "operator_cast" ||
          c.type === "operator_name" ||
          c.type === "destructor_name",
      ) ||
      null;

    return extractFunctionName(inner);
  }

  return null;
}

/**
 * Produce a canonical operator name:
 * - remove spaces: "operator []" => "operator[]"
 * - reconstruct bracket/call operators if parser split tokens
 * - normalize symbols: "operator  +" => "operator+"
 */
export function canonicalizeOperatorName(name: string, contextNode: ASTNode): string {
  if (!name.startsWith("operator")) return name;
  // First pass: strip all spaces
  const n = name.replace(/\s+/g, "");
  if (n === "operator" || n === "operator[" || n === "operator(") {
    const text = contextNode.text || "";
    // Try to reconstruct from full function definition text
    if (/operator\s*\[\s*\]/.test(text)) {
      return "operator[]";
    }
    if (/operator\s*\(\s*\)/.test(text)) {
      return "operator()";
    }
    const mSym = /operator\s*([^\s(]+)/.exec(text);
    if (mSym?.[1]) return `operator${mSym[1].replace(/\s+/g, "")}`;
  }
  return n;
}

/**
 * Extract field name from declarator node
 */
export function extractFieldName(declaratorNode: ASTNode | null): string | null {
  if (!declaratorNode) return null;

  if (declaratorNode.type === "identifier") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "field_identifier") {
    return declaratorNode.text;
  } else if (declaratorNode.type === "array_declarator") {
    const nameNode = declaratorNode.childForFieldName("declarator");
    return extractFieldName(nameNode);
  } else if (declaratorNode.type === "pointer_declarator" || declaratorNode.type === "reference_declarator") {
    const innerDeclarator = declaratorNode.childForFieldName("declarator");
    return extractFieldName(innerDeclarator);
  }

  return null;
}

/**
 * Method qualifiers result
 */
export interface MethodQualifiers {
  isStatic: boolean;
  isConst: boolean;
  isVirtual: boolean;
  isOverride: boolean;
  isFinal: boolean;
  isNoexcept: boolean;
}

/**
 * Extract method qualifiers from node text
 */
export function extractMethodQualifiers(node: ASTNode): MethodQualifiers {
  const text = node.text;

  return {
    isStatic: text.includes("static"),
    isConst: /\bconst\s*[{;]/.test(text) || /\)\s*const/.test(text),
    isVirtual: text.includes("virtual"),
    isOverride: text.includes("override"),
    isFinal: text.includes("final"),
    isNoexcept: text.includes("noexcept"),
  };
}

/**
 * Check if class is abstract (has pure virtual methods)
 */
export function isAbstractClass(node: ASTNode): boolean {
  return node.text.includes("= 0");
}

/**
 * Check if class is final
 */
export function isFinalClass(node: ASTNode): boolean {
  const nameNode = node.childForFieldName("name");
  if (nameNode) {
    const nextNode = nameNode.nextSibling;
    return nextNode?.text === "final";
  }
  return false;
}
