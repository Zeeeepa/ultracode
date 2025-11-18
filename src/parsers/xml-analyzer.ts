/**
 * XML Analyzer (Regex-based)
 *
 * Simplified XML analyzer for configuration files, Android manifests, etc.
 * Extracts:
 * - Root element
 * - Elements with IDs/names
 * - Namespaces
 * - Important attributes (android:name, id, class, etc.)
 */

import type { EntityRelationship, ParsedEntity } from "../types/parser.js";

export class XMLAnalyzer {
  async analyze(
    content: string,
    filePath: string,
  ): Promise<{ entities: ParsedEntity[]; relationships: EntityRelationship[] }> {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    // Create module entity for XML file
    const fileName = filePath.split(/[\\/]/).pop() || "xml-file";
    const moduleId = `${filePath}:xml-document`;

    entities.push({
      id: moduleId,
      name: fileName,
      type: "module",
      filePath,
      location: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 0, index: 0 },
      },
      modifiers: ["xml-document"],
      metadata: { language: "xml" },
    });

    // Extract root element
    const rootMatch = content.match(/<(\w+[\w:-]*)\s/);
    if (rootMatch?.[1]) {
      const rootName = rootMatch[1];
      const rootId = `${filePath}:element:${rootName}`;

      entities.push({
        id: rootId,
        name: rootName,
        type: "class",
        filePath,
        location: this.getLocationFromContent(content, rootMatch.index || 0),
        modifiers: ["root-element"],
        metadata: { tagName: rootName },
      });

      relationships.push({
        from: rootId,
        to: moduleId,
        type: "member_of",
      });
    }

    // Extract elements with important attributes (id, name, android:name, class)
    const elementRegex = /<(\w+[\w:-]*)\s+([^>]*?)(\/?>)/g;
    let match: RegExpExecArray | null;

    while ((match = elementRegex.exec(content)) !== null) {
      const tagName = match[1];
      const attributes = match[2] || "";

      // Extract ID attribute
      const idMatch = attributes.match(/\s(?:android:)?id\s*=\s*["']([^"']+)["']/);
      const nameMatch = attributes.match(/\s(?:android:)?name\s*=\s*["']([^"']+)["']/);
      const classMatch = attributes.match(/\sclass\s*=\s*["']([^"']+)["']/);

      const identifier = idMatch?.[1] || nameMatch?.[1] || classMatch?.[1];

      if (identifier) {
        const cleanId = identifier.replace(/^@\+?id\//, ""); // Remove @id/ or @+id/ prefix
        const elementId = `${filePath}:element:${tagName}:${cleanId}`;

        entities.push({
          id: elementId,
          name: `${tagName}#${cleanId}`,
          type: "variable",
          filePath,
          location: this.getLocationFromContent(content, match.index),
          modifiers: ["xml-element"],
          metadata: {
            tagName,
            identifier: cleanId,
            hasId: !!idMatch,
            hasName: !!nameMatch,
            hasClass: !!classMatch,
          },
        });

        relationships.push({
          from: elementId,
          to: moduleId,
          type: "member_of",
        });
      }
    }

    // Extract namespace declarations
    const namespaceRegex = /xmlns:(\w+)\s*=\s*["']([^"']+)["']/g;
    while ((match = namespaceRegex.exec(content)) !== null) {
      const nsPrefix = match[1];
      const nsUri = match[2];
      const nsId = `${filePath}:namespace:${nsPrefix}`;

      entities.push({
        id: nsId,
        name: `xmlns:${nsPrefix}`,
        type: "import",
        filePath,
        location: this.getLocationFromContent(content, match.index),
        modifiers: ["namespace"],
        metadata: { prefix: nsPrefix, uri: nsUri },
      });

      relationships.push({
        from: nsId,
        to: moduleId,
        type: "member_of",
      });
    }

    return { entities, relationships };
  }

  private getLocationFromContent(
    content: string,
    index: number,
  ): { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } } {
    const lines = content.substring(0, index).split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1]?.length || 0;

    return {
      start: { line, column, index },
      end: { line, column, index },
    };
  }
}
