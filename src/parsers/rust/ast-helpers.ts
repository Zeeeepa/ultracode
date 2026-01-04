/**
 * Rust AST Helper Functions
 *
 * Utility functions for Rust AST node processing.
 * Extracted from rust-analyzer.ts for better modularity.
 */

import type { ASTNode } from "../../types/parser.js";
import { hasChild } from "../base-parser-utils.js";

// =============================================================================
// CORE AST TRAVERSAL
// =============================================================================

/**
 * Find all nodes of a specific type
 */
export function findNodes(node: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = [];
  const visit = (n: ASTNode) => {
    if (n.type === type) {
      results.push(n);
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) visit(child);
    }
  };
  visit(node);
  return results;
}

/**
 * Get text content of a node
 */
export function getNodeText(node: ASTNode): string {
  return node.text || "";
}

// =============================================================================
// VISIBILITY AND MODIFIERS
// =============================================================================

/**
 * Extract visibility modifier
 */
export function extractVisibility(node: ASTNode): string {
  const visNode = node.childForFieldName("visibility_modifier");
  return visNode ? getNodeText(visNode) : "private";
}

/**
 * Check if node has specific modifier
 */
export function hasModifier(node: ASTNode, modifier: string): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === modifier) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// GENERIC AND LIFETIME EXTRACTION
// =============================================================================

/**
 * Extract generic parameters
 */
export function extractGenerics(node: ASTNode): string[] {
  const generics: string[] = [];
  const genericNode = node.childForFieldName("type_parameters");

  if (genericNode) {
    const params = findNodes(genericNode, "type_parameter");
    for (const param of params) {
      const nameNode = param.childForFieldName("name");
      if (nameNode) {
        generics.push(getNodeText(nameNode));
      }
    }
  }

  return generics;
}

/**
 * Extract lifetime parameters
 */
export function extractLifetimes(node: ASTNode): string[] {
  const lifetimes: string[] = [];
  const genericNode = node.childForFieldName("type_parameters");

  if (genericNode) {
    const params = findNodes(genericNode, "lifetime");
    for (const param of params) {
      lifetimes.push(getNodeText(param));
    }
  }

  return lifetimes;
}

// =============================================================================
// ATTRIBUTE EXTRACTION
// =============================================================================

/**
 * Extract derive attributes
 */
export function extractDerives(node: ASTNode): string[] {
  const derives: string[] = [];
  const attributes = findNodes(node, "attribute_item");

  for (const attr of attributes) {
    if (getAttributeName(attr) === "derive") {
      const args = attr.childForFieldName("arguments");
      if (args) {
        const tokens = findNodes(args, "identifier");
        for (const token of tokens) {
          derives.push(getNodeText(token));
        }
      }
    }
  }

  return derives;
}

/**
 * Extract attributes
 */
export function extractAttributes(node: ASTNode): string[] {
  const attributes: string[] = [];
  const attrNodes = findNodes(node, "attribute_item");

  for (const attr of attrNodes) {
    attributes.push(getAttributeName(attr));
  }

  return attributes;
}

/**
 * Get attribute name
 */
export function getAttributeName(node: ASTNode): string {
  const pathNode = node.childForFieldName("path");
  return pathNode ? getNodeText(pathNode) : "";
}

// =============================================================================
// STRUCT AND ENUM HELPERS
// =============================================================================

/**
 * Check if struct is a tuple struct
 */
export function isTupleStruct(node: ASTNode): boolean {
  const body = node.childForFieldName("body");
  return body ? body.type === "ordered_field_declaration_list" : false;
}

/**
 * Check if node has a body
 */
export function hasBody(node: ASTNode): boolean {
  return node.childForFieldName("body") !== null;
}

/**
 * Count nested items in a module
 */
export function countNestedItems(node: ASTNode): number {
  const itemTypes = [
    "function_item",
    "struct_item",
    "enum_item",
    "trait_item",
    "impl_item",
    "type_item",
    "const_item",
    "static_item",
    "mod_item",
  ];

  let count = 0;
  for (const type of itemTypes) {
    count += findNodes(node, type).length;
  }

  return count;
}

// =============================================================================
// TRAIT AND BOUNDS EXTRACTION
// =============================================================================

/**
 * Extract trait bounds
 */
export function extractTraitBounds(node: ASTNode): string[] {
  const bounds: string[] = [];
  const boundsNode = node.childForFieldName("bounds");

  if (boundsNode) {
    const boundNodes = findNodes(boundsNode, "trait_bound");
    for (const bound of boundNodes) {
      bounds.push(getNodeText(bound));
    }
  }

  return bounds;
}

/**
 * Extract supertraits
 */
export function extractSupertraits(node: ASTNode): string[] {
  const supertraits: string[] = [];
  const boundsNode = node.childForFieldName("supertraits");

  if (boundsNode) {
    const traitNodes = findNodes(boundsNode, "type");
    for (const trait of traitNodes) {
      supertraits.push(getNodeText(trait));
    }
  }

  return supertraits;
}

/**
 * Extract type bounds for associated type
 */
export function extractTypeBounds(node: ASTNode): string[] {
  const bounds: string[] = [];
  const boundsNode = node.childForFieldName("bounds");

  if (boundsNode) {
    bounds.push(getNodeText(boundsNode));
  }

  return bounds;
}

// =============================================================================
// FUNCTION PARAMETER EXTRACTION
// =============================================================================

/**
 * Extract function parameters
 */
export function extractFunctionParameters(node: ASTNode): Array<{ name: string; type: string }> {
  const parameters: Array<{ name: string; type: string }> = [];
  const paramList = node.childForFieldName("parameters");

  if (paramList) {
    const params = findNodes(paramList, "parameter");
    for (const param of params) {
      const pattern = param.childForFieldName("pattern");
      const typeNode = param.childForFieldName("type");

      if (pattern && typeNode) {
        parameters.push({
          name: getNodeText(pattern),
          type: getNodeText(typeNode),
        });
      }
    }

    // Check for self parameter
    const selfParam = findNodes(paramList, "self_parameter");
    if (selfParam.length > 0) {
      const selfNode = selfParam[0];
      const isMut = selfNode ? hasChild(selfNode, "mutable_specifier") : false;
      const isRef = selfNode ? hasChild(selfNode, "&") : false;

      let selfType = "self";
      if (isRef && isMut) selfType = "&mut self";
      else if (isRef) selfType = "&self";
      else if (isMut) selfType = "mut self";

      parameters.unshift({
        name: "self",
        type: selfType,
      });
    }
  }

  return parameters;
}

/**
 * Extract return type
 */
export function extractReturnType(node: ASTNode): string {
  const returnNode = node.childForFieldName("return_type");
  return returnNode ? getNodeText(returnNode) : "()";
}

// =============================================================================
// TYPE EXTRACTION
// =============================================================================

/**
 * Extract field type
 */
export function extractFieldType(node: ASTNode): string {
  const typeNode = node.childForFieldName("type");
  return typeNode ? getNodeText(typeNode) : "unknown";
}

/**
 * Extract aliased type
 */
export function extractAliasedType(node: ASTNode): string {
  const typeNode = node.childForFieldName("type");
  return typeNode ? getNodeText(typeNode) : "unknown";
}

/**
 * Extract const type
 */
export function extractConstType(node: ASTNode): string {
  const typeNode = node.childForFieldName("type");
  return typeNode ? getNodeText(typeNode) : "unknown";
}

/**
 * Extract static type
 */
export function extractStaticType(node: ASTNode): string {
  const typeNode = node.childForFieldName("type");
  return typeNode ? getNodeText(typeNode) : "unknown";
}

// =============================================================================
// ENUM AND MACRO HELPERS
// =============================================================================

/**
 * Extract discriminant value from enum variant
 */
export function extractDiscriminant(node: ASTNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "=") {
      const nextChild = node.child(i + 1);
      if (nextChild) {
        return getNodeText(nextChild);
      }
    }
  }
  return undefined;
}

/**
 * Extract macro rules
 */
export function extractMacroRules(node: ASTNode): string[] {
  const rules: string[] = [];
  const body = node.childForFieldName("body");

  if (body) {
    const ruleNodes = findNodes(body, "macro_rule");
    for (const rule of ruleNodes) {
      rules.push(getNodeText(rule));
    }
  }

  return rules;
}

// =============================================================================
// USE STATEMENT EXTRACTION
// =============================================================================

/**
 * Extract use tree (handles nested imports)
 */
export function extractUseTree(node: ASTNode): string[] {
  const paths: string[] = [];

  const processUseTree = (tree: ASTNode, prefix: string = ""): void => {
    if (tree.type === "use_wildcard") {
      paths.push(`${prefix}::*`);
    } else if (tree.type === "use_list") {
      for (let i = 0; i < tree.childCount; i++) {
        const child = tree.child(i);
        if (child && child.type !== "{" && child.type !== "}" && child.type !== ",") {
          processUseTree(child, prefix);
        }
      }
    } else if (tree.type === "use_as_clause") {
      const pathNode = tree.childForFieldName("path");
      if (pathNode) {
        const fullPath = prefix ? `${prefix}::${getNodeText(pathNode)}` : getNodeText(pathNode);
        paths.push(fullPath);
      }
    } else if (tree.type === "scoped_use_list") {
      const pathNode = tree.childForFieldName("path");
      const listNode = tree.childForFieldName("list");
      const newPrefix = pathNode ? (prefix ? `${prefix}::${getNodeText(pathNode)}` : getNodeText(pathNode)) : prefix;

      if (listNode) {
        processUseTree(listNode, newPrefix);
      }
    } else {
      const text = getNodeText(tree);
      if (text && text !== "use" && text !== ";") {
        const fullPath = prefix ? `${prefix}::${text}` : text;
        paths.push(fullPath);
      }
    }
  };

  const tree = node.childForFieldName("argument");
  if (tree) {
    processUseTree(tree);
  }

  return paths;
}

// =============================================================================
// NAME RESOLUTION
// =============================================================================

/**
 * Resolve entity name robustly:
 * 1) field name via childForFieldName("name")
 * 2) first immediate identifier/type_identifier child
 * 3) fallback to node.text (if non-empty)
 */
export function resolveName(node: ASTNode): string | null {
  try {
    const nameField = node.childForFieldName?.("name");
    if (nameField) {
      const t = getNodeText(nameField);
      if (t) return t;
    }
  } catch {
    // ignore
  }

  // Try immediate identifier/type_identifier
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "identifier" || child.type === "type_identifier") {
      const t = getNodeText(child);
      if (t) return t;
    }
  }

  // Fallback to node.text
  const txt = (node.text || "").trim();
  return txt.length > 0 ? txt : null;
}
