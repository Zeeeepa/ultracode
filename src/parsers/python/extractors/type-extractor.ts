/**
 * Python Type Extractor
 *
 * Extracts type hints and parameter types from Python AST nodes.
 */

import type { ASTNode, ParsedEntity } from "../../../types/parser.js";
import { getNodeText } from "../utils/helpers.js";

// =============================================================================
// TYPE EXTRACTOR CLASS
// =============================================================================

export class TypeExtractor {
  /**
   * Extract complex type hints including Union, Optional, Generic, etc.
   */
  extractComplexTypeHint(node: ASTNode, source: string): string {
    switch (node.type) {
      case "identifier":
        return node.text;

      case "generic_type":
      case "subscript":
        return getNodeText(node, source);

      case "union_type":
        return getNodeText(node, source);

      case "attribute":
        return node.text;

      default:
        return getNodeText(node, source);
    }
  }

  /**
   * Extract complex function parameters with type hints
   */
  extractComplexParameters(node: ASTNode, source: string): ParsedEntity["parameters"] {
    const params: NonNullable<ParsedEntity["parameters"]> = [];
    const parametersNode = node.namedChildren.find((child) => child.type === "parameters");

    if (!parametersNode) return params;

    for (const param of parametersNode.namedChildren) {
      let name: string | undefined;
      let type: string | undefined;
      let optional = false;
      let defaultValue: string | undefined;

      switch (param.type) {
        case "identifier":
          name = param.text;
          break;

        case "default_parameter": {
          const nameChild = param.namedChildren[0];
          const valueChild = param.namedChildren[1];
          if (nameChild) name = nameChild.text;
          if (valueChild) defaultValue = getNodeText(valueChild, source);
          optional = true;
          break;
        }

        case "typed_parameter": {
          const typedName = param.namedChildren[0];
          const typeAnnotation = param.namedChildren[1];
          if (typedName) name = typedName.text;
          if (typeAnnotation) type = this.extractComplexTypeHint(typeAnnotation, source);
          break;
        }

        case "typed_default_parameter": {
          const tdName = param.namedChildren[0];
          const tdType = param.namedChildren[1];
          const tdValue = param.namedChildren[2];
          if (tdName) name = tdName.text;
          if (tdType) type = this.extractComplexTypeHint(tdType, source);
          if (tdValue) defaultValue = getNodeText(tdValue, source);
          optional = true;
          break;
        }
      }

      if (name) {
        params.push({ name, type, optional, defaultValue });
      }
    }

    return params;
  }

  /**
   * Extract complex return type annotation
   */
  extractComplexReturnType(node: ASTNode, source: string): string | undefined {
    const typeNode = node.namedChildren.find((child) => child.type === "type");
    if (!typeNode) return undefined;

    return this.extractComplexTypeHint(typeNode, source);
  }
}
