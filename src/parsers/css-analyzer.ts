/**
 * CSS/SCSS Analyzer
 *
 * Simplified CSS analyzer for:
 * - Selectors (class, id, element, attribute)
 * - Rules and declarations
 * - Media queries
 * - Variables (CSS custom properties, SCSS variables)
 */

import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { getNodeLocation } from "./base-parser-utils.js";

export class CSSAnalyzer {
  async analyze(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): Promise<void> {
    // Create module for CSS file
    const moduleId = `${filePath}:stylesheet`;
    entities.push({
      id: moduleId,
      name: filePath.split("/").pop() || "styles",
      type: "module",
      filePath,
      location: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 0, index: 0 },
      },
      modifiers: [],
      metadata: { language: "css" },
    });

    await this.traverseNode(node, filePath, entities, relationships, moduleId);
  }

  private async traverseNode(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId: string,
  ): Promise<void> {
    const nodeType = node.type;

    switch (nodeType) {
      case "rule_set":
        await this.handleRuleSet(node, filePath, entities, relationships, parentId);
        break;

      case "media_statement":
        await this.handleMediaQuery(node, filePath, entities, relationships, parentId);
        break;

      default:
        for (const child of node.children || []) {
          await this.traverseNode(child, filePath, entities, relationships, parentId);
        }
        break;
    }
  }

  private async handleRuleSet(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId: string,
  ): Promise<void> {
    // Extract selectors
    const selectors = node.children?.find((c) => c.type === "selectors");
    if (!selectors) return;

    const selectorText = selectors.text || "unknown";
    const ruleId = `${filePath}:rule:${selectorText.replace(/\s+/g, "_")}`;

    const location = getNodeLocation(node);

    entities.push({
      id: ruleId,
      name: selectorText,
      type: "variable",
      filePath,
      location,
      modifiers: ["css-rule"],
      metadata: { selector: selectorText },
    });

    relationships.push({
      from: ruleId,
      to: parentId,
      type: "member_of",
    });
  }

  private async handleMediaQuery(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    parentId: string,
  ): Promise<void> {
    const query = node.text?.split("{")[0]?.trim() || "media-query";
    const mediaId = `${filePath}:media:${query.replace(/\s+/g, "_")}`;

    const location = getNodeLocation(node);

    entities.push({
      id: mediaId,
      name: query,
      type: "variable",
      filePath,
      location,
      modifiers: ["media-query"],
      metadata: { query },
    });

    relationships.push({
      from: mediaId,
      to: parentId,
      type: "member_of",
    });

    // Parse rules inside media query
    for (const child of node.children || []) {
      await this.traverseNode(child, filePath, entities, relationships, mediaId);
    }
  }
}
