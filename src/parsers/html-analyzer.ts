/**
 * HTML/Template Analyzer
 *
 * Simplified HTML analyzer for:
 * - Elements and tags
 * - Attributes and IDs
 * - Angular template syntax
 */

import { basename } from "node:path";
import type { ASTNode, EntityRelationship, ParsedEntity } from "../types/parser.js";
import { getNodeLocation } from "./base-parser-utils.js";

export class HTMLAnalyzer {
  async analyze(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): Promise<void> {
    // Create module for HTML file
    const moduleId = `${filePath}:template`;
    entities.push({
      id: moduleId,
      name: basename(filePath) || "template",
      type: "module",
      filePath,
      location: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 0, index: 0 },
      },
      modifiers: [],
      metadata: { language: "html" },
    });

    await this.traverseNode(node, filePath, entities, relationships, moduleId);
  }

  private async traverseNode(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId: string,
  ): Promise<void> {
    const nodeType = node.type;

    switch (nodeType) {
      case "element":
        await this.handleElement(node, filePath, entities, relationships, parentId);
        break;

      default:
        for (const child of node.children || []) {
          await this.traverseNode(child, filePath, entities, relationships, parentId);
        }
        break;
    }
  }

  private async handleElement(
    node: ASTNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId: string,
  ): Promise<void> {
    // Get tag name
    const startTag = node.children?.find((c) => c.type === "start_tag");
    if (!startTag) return;

    const tagName = startTag.children?.find((c) => c.type === "tag_name");
    if (!tagName) return;

    const elementName = tagName.text || "element";
    const elementId = `${filePath}:element:${elementName}:${node.startPosition?.row || 0}`;

    const location = getNodeLocation(node);

    // Check for Angular attributes
    const isAngular = startTag.children?.some(
      (c) => c.text?.startsWith("*ng") || c.text?.startsWith("(") || c.text?.startsWith("[") || c.text?.startsWith("@"),
    );

    entities.push({
      id: elementId,
      name: elementName,
      type: "variable",
      filePath,
      location,
      modifiers: isAngular ? ["angular-element"] : [],
      metadata: {
        tagName: elementName,
        isAngularElement: isAngular,
      },
    });

    relationships.push({
      from: elementId,
      to: parentId,
      type: "member_of",
    });

    // Traverse children
    for (const child of node.children || []) {
      if (child.type === "element") {
        await this.handleElement(child, filePath, entities, relationships, elementId);
      }
    }
  }
}
