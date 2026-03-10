/**
 * GraphQL Schema Parser
 *
 * Text-based parser for .graphql/.gql files (no external dependencies).
 * Extracts types, interfaces, inputs, enums, unions, scalars, directives,
 * queries, mutations, subscriptions, and their relationships.
 *
 * Strategy: comment stripping, brace-matching for blocks, regex for definitions.
 */

import type { EntityRelationship, ParsedEntity } from "../../types/parser.js";
import type { ParserStats } from "../base-parser.js";
import type { GraphQLArg, GraphQLFieldDef } from "./types.js";

// =============================================================================
// TYPES
// =============================================================================

interface GraphQLParseResult {
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

interface GraphQLBlock {
  keyword: string;
  name: string;
  implementsClause?: string | undefined;
  body: string;
  startLine: number;
  endLine: number;
  isExtension: boolean;
}

// =============================================================================
// OPERATION TYPE MAPPING
// =============================================================================

const OPERATION_TYPES: Record<string, string> = {
  Query: "query",
  Mutation: "mutation",
  Subscription: "subscription",
};

// =============================================================================
// MAIN PARSER
// =============================================================================

export class GraphQLSchemaParser {
  private filesParsed = 0;
  private totalParseTimeMs = 0;
  private errorCount = 0;

  async initialize(): Promise<void> {
    // No initialization needed — pure text parser
  }

  supportsFile(filePath: string): boolean {
    return filePath.endsWith(".graphql") || filePath.endsWith(".gql");
  }

  async parse(filePath: string, content: string, hash: string) {
    const startTime = Date.now();
    this.filesParsed++;
    const result = this.parseGraphQL(filePath, content);
    this.errorCount += result.errors.length;
    const parseTimeMs = Date.now() - startTime;
    this.totalParseTimeMs += parseTimeMs;

    return {
      filePath,
      language: "graphql" as const,
      contentHash: hash,
      timestamp: Date.now(),
      parseTimeMs,
      entities: result.entities,
      relationships: result.relationships,
      errors: result.errors,
    };
  }

  getStats(): ParserStats {
    return {
      filesParsed: this.filesParsed,
      cacheHits: 0,
      cacheMisses: this.filesParsed,
      avgParseTimeMs: this.filesParsed > 0 ? this.totalParseTimeMs / this.filesParsed : 0,
      totalParseTimeMs: this.totalParseTimeMs,
      throughput: this.filesParsed > 0 ? (this.filesParsed / this.totalParseTimeMs) * 1000 : 0,
      cacheMemoryMB: 0,
      errorCount: this.errorCount,
    };
  }

  // ===========================================================================
  // CORE PARSING
  // ===========================================================================

  private parseGraphQL(filePath: string, content: string): GraphQLParseResult {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

    try {
      const originalLines = content.split("\n");

      // Extract descriptions before stripping comments
      const descriptions = this.extractDescriptions(content);

      // Strip comments
      const stripped = this.stripComments(content);

      // Parse scalars (no body block)
      this.parseScalars(stripped, filePath, originalLines, entities, descriptions);

      // Parse directives
      this.parseDirectives(stripped, filePath, originalLines, entities, descriptions);

      // Parse unions (may not have braces)
      this.parseUnions(stripped, filePath, originalLines, entities, relationships, descriptions);

      // Parse schema definition
      this.parseSchemaDefinition(stripped, filePath, originalLines, entities);

      // Extract blocks (type, interface, input, enum, extend type)
      const blocks = this.extractBlocks(stripped, originalLines);

      for (const block of blocks) {
        switch (block.keyword) {
          case "type":
            this.parseType(block, filePath, entities, relationships, descriptions);
            break;
          case "interface":
            this.parseInterface(block, filePath, entities, relationships, descriptions);
            break;
          case "input":
            this.parseInput(block, filePath, entities, relationships, descriptions);
            break;
          case "enum":
            this.parseEnum(block, filePath, entities, descriptions);
            break;
        }
      }
    } catch (e) {
      errors.push({ message: `GraphQL parse error: ${(e as Error).message}` });
    }

    return { entities, relationships, errors };
  }

  // ===========================================================================
  // BLOCK EXTRACTION
  // ===========================================================================

  private extractBlocks(content: string, originalLines: string[]): GraphQLBlock[] {
    const blocks: GraphQLBlock[] = [];
    const lines = content.split("\n");

    // Match: [extend] type|interface|input|enum Name [implements X & Y] {
    const blockRegex = /^(\s*)(extend\s+)?(type|interface|input|enum)\s+(\w+)(?:\s+implements\s+([\w\s&]+))?\s*\{/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const match = blockRegex.exec(line);

      if (match) {
        const isExtension = !!match[2];
        const keyword = match[3]!;
        const name = match[4]!;
        const implementsClause = match[5]?.trim();
        const startLine = this.findOriginalLine(originalLines, name, i);

        // Brace matching
        let depth = 0;
        let body = "";
        let j = i;
        let started = false;

        while (j < lines.length) {
          const currentLine = lines[j]!;
          for (const ch of currentLine) {
            if (ch === "{") {
              depth++;
              started = true;
            } else if (ch === "}") {
              depth--;
            }
          }

          if (j === i) {
            const braceIdx = currentLine.indexOf("{");
            body += currentLine.substring(braceIdx + 1) + "\n";
          } else {
            body += currentLine + "\n";
          }

          if (started && depth === 0) {
            body = body.trimEnd();
            if (body.endsWith("}")) body = body.slice(0, -1);

            blocks.push({
              keyword,
              name,
              implementsClause,
              body,
              startLine,
              endLine: j,
              isExtension,
            });
            i = j + 1;
            break;
          }
          j++;
        }

        if (depth !== 0) {
          blocks.push({
            keyword,
            name,
            implementsClause,
            body,
            startLine,
            endLine: j - 1,
            isExtension,
          });
          i = j;
        }
      } else {
        i++;
      }
    }

    return blocks;
  }

  // ===========================================================================
  // TYPE PARSING
  // ===========================================================================

  private parseType(
    block: GraphQLBlock,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    descriptions: Map<string, string>,
  ): void {
    const operation = OPERATION_TYPES[block.name];
    const isOperation = !!operation;

    // Parse fields
    const fields = this.parseFields(block.body);

    // Determine entity type
    const entityType = isOperation ? "class" : "type";
    const graphqlType = isOperation ? operation : "type";

    const interfaces = block.implementsClause
      ? block.implementsClause
          .split("&")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const metadata: Record<string, unknown> = {
      graphqlType,
      isApiContract: true,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        isNonNull: f.isNonNull,
        isList: f.isList,
        args: f.args,
        ...(f.description ? { description: f.description } : {}),
      })),
    };

    if (interfaces.length > 0) {
      metadata["interfaces"] = interfaces;
    }
    if (block.isExtension) {
      metadata["isExtension"] = true;
    }
    if (descriptions.has(block.name)) {
      metadata["description"] = descriptions.get(block.name);
    }

    entities.push({
      name: block.name,
      type: entityType,
      filePath,
      location: this.makeLocation(block.startLine),
      metadata,
    });

    // Create field entities for operation types
    if (isOperation) {
      for (const field of fields) {
        const signature = this.buildFieldSignature(field);
        entities.push({
          name: field.name,
          type: "method",
          filePath,
          location: this.makeLocation(block.startLine + 1),
          signature,
          metadata: {
            graphqlType: "field",
            returnType: field.type,
            isNonNull: field.isNonNull,
            isList: field.isList,
            args: field.args,
            parentType: block.name,
            isApiContract: true,
          },
        });

        // Field → return type
        const baseType = this.extractBaseType(field.type);
        if (baseType && !this.isBuiltinType(baseType)) {
          relationships.push({
            from: `${filePath}:method:${field.name}`,
            to: `${filePath}:type:${baseType}`,
            type: "references",
            metadata: { context: "field return type" },
          });
        }

        // Field → argument types
        for (const arg of field.args) {
          const argBaseType = this.extractBaseType(arg.type);
          if (argBaseType && !this.isBuiltinType(argBaseType)) {
            relationships.push({
              from: `${filePath}:method:${field.name}`,
              to: `${filePath}:type:${argBaseType}`,
              type: "references",
              metadata: { context: "field argument type" },
            });
          }
        }
      }
    }

    // Type → interfaces (implements)
    for (const iface of interfaces) {
      relationships.push({
        from: `${filePath}:type:${block.name}`,
        to: `${filePath}:type:${iface}`,
        type: "implements",
        metadata: { context: "type implements interface" },
      });
    }

    // Field type references (for non-operation types)
    if (!isOperation) {
      for (const field of fields) {
        const baseType = this.extractBaseType(field.type);
        if (baseType && !this.isBuiltinType(baseType) && baseType !== block.name) {
          relationships.push({
            from: `${filePath}:type:${block.name}`,
            to: `${filePath}:type:${baseType}`,
            type: "references",
            metadata: { context: "field type reference" },
          });
        }
      }
    }

    // extend type → original type
    if (block.isExtension) {
      relationships.push({
        from: `${filePath}:type:${block.name}:extension`,
        to: `${filePath}:type:${block.name}`,
        type: "references",
        metadata: { context: "type extension" },
      });
    }
  }

  // ===========================================================================
  // INTERFACE PARSING
  // ===========================================================================

  private parseInterface(
    block: GraphQLBlock,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    descriptions: Map<string, string>,
  ): void {
    const fields = this.parseFields(block.body);

    const metadata: Record<string, unknown> = {
      graphqlType: "interface",
      isApiContract: true,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        isNonNull: f.isNonNull,
        isList: f.isList,
        args: f.args,
      })),
    };

    if (descriptions.has(block.name)) {
      metadata["description"] = descriptions.get(block.name);
    }

    entities.push({
      name: block.name,
      type: "type",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata,
    });

    // Field type references
    for (const field of fields) {
      const baseType = this.extractBaseType(field.type);
      if (baseType && !this.isBuiltinType(baseType) && baseType !== block.name) {
        relationships.push({
          from: `${filePath}:type:${block.name}`,
          to: `${filePath}:type:${baseType}`,
          type: "references",
          metadata: { context: "interface field type" },
        });
      }
    }
  }

  // ===========================================================================
  // INPUT PARSING
  // ===========================================================================

  private parseInput(
    block: GraphQLBlock,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    descriptions: Map<string, string>,
  ): void {
    const fields = this.parseFields(block.body);

    const metadata: Record<string, unknown> = {
      graphqlType: "input",
      isApiContract: true,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        isNonNull: f.isNonNull,
        isList: f.isList,
        ...(f.args.length > 0 ? { defaultValue: f.args[0]?.defaultValue } : {}),
      })),
    };

    if (descriptions.has(block.name)) {
      metadata["description"] = descriptions.get(block.name);
    }

    entities.push({
      name: block.name,
      type: "type",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata,
    });

    // Field type references
    for (const field of fields) {
      const baseType = this.extractBaseType(field.type);
      if (baseType && !this.isBuiltinType(baseType) && baseType !== block.name) {
        relationships.push({
          from: `${filePath}:type:${block.name}`,
          to: `${filePath}:type:${baseType}`,
          type: "references",
          metadata: { context: "input field type" },
        });
      }
    }
  }

  // ===========================================================================
  // ENUM PARSING
  // ===========================================================================

  private parseEnum(
    block: GraphQLBlock,
    filePath: string,
    entities: ParsedEntity[],
    descriptions: Map<string, string>,
  ): void {
    // Parse values
    const values: string[] = [];
    const valueRegex = /^\s*(\w+)\s*$/gm;
    let valueMatch: RegExpExecArray | null;

    while ((valueMatch = valueRegex.exec(block.body)) !== null) {
      const name = valueMatch[1]!.trim();
      if (name && !name.startsWith("#")) {
        values.push(name);
      }
    }

    const metadata: Record<string, unknown> = {
      graphqlType: "enum",
      isApiContract: true,
      values,
    };

    if (descriptions.has(block.name)) {
      metadata["description"] = descriptions.get(block.name);
    }

    entities.push({
      name: block.name,
      type: "type",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata,
    });
  }

  // ===========================================================================
  // SCALAR, DIRECTIVE, UNION, SCHEMA PARSING
  // ===========================================================================

  private parseScalars(
    content: string,
    filePath: string,
    originalLines: string[],
    entities: ParsedEntity[],
    descriptions: Map<string, string>,
  ): void {
    const scalarRegex = /\bscalar\s+(\w+)/g;
    let match: RegExpExecArray | null;

    while ((match = scalarRegex.exec(content)) !== null) {
      const name = match[1]!;
      const line = this.findOriginalLine(originalLines, `scalar ${name}`, 0);

      const metadata: Record<string, unknown> = {
        graphqlType: "scalar",
        isApiContract: false,
      };

      if (descriptions.has(name)) {
        metadata["description"] = descriptions.get(name);
      }

      entities.push({
        name,
        type: "type",
        filePath,
        location: this.makeLocation(line),
        metadata,
      });
    }
  }

  private parseDirectives(
    content: string,
    filePath: string,
    originalLines: string[],
    entities: ParsedEntity[],
    descriptions: Map<string, string>,
  ): void {
    const directiveRegex = /\bdirective\s+@(\w+)(?:\s*\([^)]*\))?\s+on\s+([\w\s|]+)/g;
    let match: RegExpExecArray | null;

    while ((match = directiveRegex.exec(content)) !== null) {
      const name = match[1]!;
      const locations = match[2]!
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const line = this.findOriginalLine(originalLines, `directive @${name}`, 0);

      const metadata: Record<string, unknown> = {
        graphqlType: "directive",
        isApiContract: false,
        locations,
      };

      if (descriptions.has(`@${name}`)) {
        metadata["description"] = descriptions.get(`@${name}`);
      }

      entities.push({
        name: `@${name}`,
        type: "constant",
        filePath,
        location: this.makeLocation(line),
        metadata,
      });
    }
  }

  private parseUnions(
    content: string,
    filePath: string,
    originalLines: string[],
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    descriptions: Map<string, string>,
  ): void {
    const unionRegex = /\bunion\s+(\w+)\s*=\s*([^{}\n]+)/g;
    let match: RegExpExecArray | null;

    while ((match = unionRegex.exec(content)) !== null) {
      const name = match[1]!;
      const memberStr = match[2]!;
      const memberTypes = memberStr
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const line = this.findOriginalLine(originalLines, `union ${name}`, 0);

      const metadata: Record<string, unknown> = {
        graphqlType: "union",
        isApiContract: true,
        memberTypes,
      };

      if (descriptions.has(name)) {
        metadata["description"] = descriptions.get(name);
      }

      entities.push({
        name,
        type: "type",
        filePath,
        location: this.makeLocation(line),
        metadata,
      });

      // Union → member type references
      for (const member of memberTypes) {
        relationships.push({
          from: `${filePath}:type:${name}`,
          to: `${filePath}:type:${member}`,
          type: "references",
          metadata: { context: "union member type" },
        });
      }
    }
  }

  private parseSchemaDefinition(
    content: string,
    filePath: string,
    originalLines: string[],
    entities: ParsedEntity[],
  ): void {
    const schemaRegex = /\bschema\s*\{([^}]*)\}/;
    const match = schemaRegex.exec(content);
    if (!match) return;

    const body = match[1]!;
    const line = this.findOriginalLine(originalLines, "schema", 0);

    const operations: Record<string, string> = {};
    const opRegex = /(query|mutation|subscription)\s*:\s*(\w+)/g;
    let opMatch: RegExpExecArray | null;
    while ((opMatch = opRegex.exec(body)) !== null) {
      operations[opMatch[1]!] = opMatch[2]!;
    }

    entities.push({
      name: "schema",
      type: "module",
      filePath,
      location: this.makeLocation(line),
      metadata: {
        graphqlType: "schema",
        isApiContract: true,
        operations,
      },
    });
  }

  // ===========================================================================
  // FIELD PARSING
  // ===========================================================================

  private parseFields(body: string): GraphQLFieldDef[] {
    const fields: GraphQLFieldDef[] = [];
    const lines = body.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith('"""')) continue;

      // Match: fieldName(args): ReturnType @directives
      const fieldRegex = /^(\w+)(?:\s*\(([^)]*)\))?\s*:\s*(.+?)(?:\s+@\w.*)?$/;
      const match = fieldRegex.exec(trimmed);
      if (!match) continue;

      const name = match[1]!;
      const argsStr = match[2];
      const typeStr = match[3]!.trim();

      // Parse type
      const { baseType, isNonNull, isList } = this.parseTypeString(typeStr);

      // Parse arguments
      const args = argsStr ? this.parseArguments(argsStr) : [];

      fields.push({
        name,
        type: baseType,
        isNonNull,
        isList,
        args,
      });
    }

    return fields;
  }

  private parseArguments(argsStr: string): GraphQLArg[] {
    const args: GraphQLArg[] = [];
    // Split by comma, handling nested types
    const parts = this.splitArguments(argsStr);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match: argName: Type [= defaultValue]
      const argRegex = /^(\w+)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/;
      const match = argRegex.exec(trimmed);
      if (match) {
        args.push({
          name: match[1]!,
          type: match[2]!.trim(),
          ...(match[3] ? { defaultValue: match[3].trim() } : {}),
        });
      }
    }

    return args;
  }

  private splitArguments(argsStr: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;

    for (const ch of argsStr) {
      if (ch === "[" || ch === "(") depth++;
      else if (ch === "]" || ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current);

    return parts;
  }

  private parseTypeString(typeStr: string): {
    baseType: string;
    isNonNull: boolean;
    isList: boolean;
  } {
    let cleaned = typeStr.trim();
    // Remove trailing directives
    cleaned = cleaned.replace(/\s+@\w+.*$/, "").trim();

    const isNonNull = cleaned.endsWith("!");
    if (isNonNull) cleaned = cleaned.slice(0, -1);

    const isList = cleaned.startsWith("[");
    if (isList) {
      cleaned = cleaned.replace(/^\[/, "").replace(/\]!?$/, "");
      // Remove inner non-null
      cleaned = cleaned.replace(/!$/, "");
    }

    return { baseType: cleaned, isNonNull, isList };
  }

  // ===========================================================================
  // DESCRIPTION EXTRACTION
  // ===========================================================================

  private extractDescriptions(content: string): Map<string, string> {
    const descriptions = new Map<string, string>();

    // Triple-quote doc strings: """...""" followed by a definition
    const tripleQuoteRegex =
      /"""([\s\S]*?)"""\s*\n\s*(?:type|interface|input|enum|union|scalar|directive\s+@)\s*(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = tripleQuoteRegex.exec(content)) !== null) {
      descriptions.set(match[2]!, match[1]!.trim());
    }

    // Single-line # comments before definitions
    const lines = content.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!.trim();
      const nextLine = lines[i + 1]!.trim();
      if (line.startsWith("#") && !nextLine.startsWith("#")) {
        const defMatch = nextLine.match(/^(?:type|interface|input|enum|union|scalar|directive\s+@)\s*(\w+)/);
        if (defMatch) {
          descriptions.set(defMatch[1]!, line.replace(/^#\s*/, ""));
        }
      }
    }

    return descriptions;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private stripComments(content: string): string {
    // Remove triple-quote doc strings
    let result = content.replace(/"""[\s\S]*?"""/g, "");
    // Remove single-line # comments (but preserve lines for line counting)
    result = result.replace(/#.*$/gm, "");
    return result;
  }

  private extractBaseType(typeStr: string): string {
    return typeStr
      .replace(/[[\]!]/g, "")
      .replace(/@\w+.*$/, "")
      .trim();
  }

  private isBuiltinType(typeName: string): boolean {
    const builtins = new Set(["String", "Int", "Float", "Boolean", "ID"]);
    return builtins.has(typeName);
  }

  private findOriginalLine(originalLines: string[], search: string, startFrom: number): number {
    for (let i = startFrom; i < originalLines.length; i++) {
      if (originalLines[i]!.includes(search)) return i;
    }
    return startFrom;
  }

  private buildFieldSignature(field: GraphQLFieldDef): string {
    const argsStr =
      field.args.length > 0
        ? `(${field.args.map((a) => `${a.name}: ${a.type}${a.defaultValue ? ` = ${a.defaultValue}` : ""}`).join(", ")})`
        : "";
    const listPrefix = field.isList ? "[" : "";
    const listSuffix = field.isList ? "!]" : "";
    const nonNull = field.isNonNull ? "!" : "";
    return `${field.name}${argsStr}: ${listPrefix}${field.type}${listSuffix}${nonNull}`;
  }

  private makeLocation(line: number) {
    return {
      start: { line, column: 0, index: 0 },
      end: { line, column: 0, index: 0 },
    };
  }
}
