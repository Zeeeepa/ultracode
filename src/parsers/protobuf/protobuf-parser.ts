/**
 * Protobuf Parser
 *
 * Text-based parser for .proto files (no external dependencies).
 * Extracts services, rpcs, messages, enums, and their relationships.
 *
 * Strategy: brace-matching for block extraction, regex for field parsing.
 */

import type { EntityRelationship, ParsedEntity } from "../../types/parser.js";
import type { ParserStats } from "../base-parser.js";
import type { ProtoEnumValue, ProtoField } from "./types.js";

interface ProtoParseOutput {
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

// =============================================================================
// TYPES
// =============================================================================

interface ProtoBlock {
  keyword: string;
  name: string;
  body: string;
  startLine: number;
  endLine: number;
  depth: number;
}

// =============================================================================
// MAIN PARSER
// =============================================================================

export class ProtobufParser {
  private filesParsed = 0;
  private totalParseTimeMs = 0;
  private errorCount = 0;

  async initialize(): Promise<void> {
    // No initialization needed — pure text parser
  }

  supportsFile(filePath: string): boolean {
    return filePath.endsWith(".proto");
  }

  async parse(filePath: string, content: string, hash: string) {
    const startTime = Date.now();
    this.filesParsed++;
    const result = this.parseProto(filePath, content);
    this.errorCount += result.errors.length;
    const parseTimeMs = Date.now() - startTime;
    this.totalParseTimeMs += parseTimeMs;

    return {
      filePath,
      language: "protobuf" as const,
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

  private parseProto(filePath: string, content: string): ProtoParseOutput {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

    try {
      const lines = content.split("\n");

      // Extract syntax
      const syntaxMatch = content.match(/syntax\s*=\s*"(proto[23])"\s*;/);
      const syntax = syntaxMatch?.[1] ?? "proto3";

      // Extract package
      const packageMatch = content.match(/package\s+([\w.]+)\s*;/);
      const packageName = packageMatch?.[1];

      if (packageName) {
        const packageLine = this.findLineNumber(lines, packageMatch![0]);
        entities.push({
          name: packageName,
          type: "module",
          filePath,
          location: this.makeLocation(packageLine),
          metadata: {
            protoType: "package",
            syntax,
            isApiContract: false,
          },
        });
      }

      // Extract options
      const goPackageMatch = content.match(/option\s+go_package\s*=\s*"([^"]+)"\s*;/);
      const javaPackageMatch = content.match(/option\s+java_package\s*=\s*"([^"]+)"\s*;/);

      // Extract imports
      const importRegex = /import\s+(?:public\s+|weak\s+)?"([^"]+)"\s*;/g;
      let importMatch: RegExpExecArray | null;
      const imports: string[] = [];
      while ((importMatch = importRegex.exec(content)) !== null) {
        imports.push(importMatch[1]!);
      }

      // Strip comments before block parsing
      const stripped = this.stripComments(content);

      // Extract top-level blocks
      const blocks = this.extractBlocks(stripped);

      for (const block of blocks) {
        switch (block.keyword) {
          case "service":
            this.parseService(block, filePath, entities, relationships, syntax);
            break;
          case "message":
            this.parseMessage(block, filePath, entities, relationships, syntax, undefined);
            break;
          case "enum":
            this.parseEnum(block, filePath, entities, relationships, syntax, undefined);
            break;
        }
      }

      // Add package metadata to all entities
      if (packageName) {
        for (const entity of entities) {
          if (entity.metadata && entity.type !== "module") {
            entity.metadata["package"] = packageName;
          }
        }
      }

      // Add options metadata
      if (goPackageMatch || javaPackageMatch) {
        for (const entity of entities) {
          if (entity.metadata) {
            if (goPackageMatch) entity.metadata["goPackage"] = goPackageMatch[1];
            if (javaPackageMatch) entity.metadata["javaPackage"] = javaPackageMatch[1];
          }
        }
      }
    } catch (e) {
      errors.push({ message: `Protobuf parse error: ${(e as Error).message}` });
    }

    return { entities, relationships, errors };
  }

  // ===========================================================================
  // BLOCK EXTRACTION (brace-matching)
  // ===========================================================================

  private extractBlocks(content: string): ProtoBlock[] {
    const blocks: ProtoBlock[] = [];
    const lines = content.split("\n");
    const blockRegex = /\b(service|message|enum)\s+(\w+)\s*\{/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const match = blockRegex.exec(line);

      if (match) {
        const keyword = match[1]!;
        const name = match[2]!;
        const startLine = i;

        // Count braces to find the end
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
            // Extract body after opening brace
            const braceIdx = currentLine.indexOf("{");
            body += currentLine.substring(braceIdx + 1) + "\n";
          } else {
            body += currentLine + "\n";
          }

          if (started && depth === 0) {
            // Remove trailing closing brace
            body = body.trimEnd();
            if (body.endsWith("}")) body = body.slice(0, -1);

            blocks.push({ keyword, name, body, startLine, endLine: j, depth: 0 });
            i = j + 1;
            break;
          }
          j++;
        }

        if (depth !== 0) {
          // Unmatched braces — push what we have
          blocks.push({ keyword, name, body, startLine, endLine: j - 1, depth });
          i = j;
        }
      } else {
        i++;
      }
    }

    return blocks;
  }

  // ===========================================================================
  // SERVICE PARSING
  // ===========================================================================

  private parseService(
    block: ProtoBlock,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    syntax: string,
  ): void {
    const serviceName = block.name;

    entities.push({
      name: serviceName,
      type: "class",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata: {
        protoType: "service",
        isApiContract: true,
        syntax,
      },
    });

    // Parse rpc methods
    const rpcRegex = /rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w[\w.]*)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w[\w.]*)\s*\)/g;
    let rpcMatch: RegExpExecArray | null;
    const bodyLines = block.body.split("\n");

    while ((rpcMatch = rpcRegex.exec(block.body)) !== null) {
      const rpcName = rpcMatch[1]!;
      const isClientStreaming = !!rpcMatch[2];
      const requestType = rpcMatch[3]!;
      const isServerStreaming = !!rpcMatch[4];
      const responseType = rpcMatch[5]!;

      // Find line number within block
      const rpcLine = this.findLineInBody(bodyLines, `rpc ${rpcName}`);
      const absoluteLine = block.startLine + rpcLine + 1;

      // Check for google.api.http option — look at text after this rpc match
      const afterRpc = block.body.substring(rpcMatch.index);
      const httpOption = this.extractHttpOptionFromRpc(afterRpc);

      const signature = `rpc ${rpcName}(${isClientStreaming ? "stream " : ""}${requestType}) returns (${isServerStreaming ? "stream " : ""}${responseType})`;

      const rpcMetadata: Record<string, unknown> = {
        protoType: "rpc",
        isApiContract: true,
        requestType,
        responseType,
        isClientStreaming,
        isServerStreaming,
        syntax,
      };

      if (httpOption) {
        rpcMetadata["httpMethod"] = httpOption.method;
        rpcMetadata["httpPath"] = httpOption.path;
      }

      entities.push({
        name: rpcName,
        type: "method",
        filePath,
        location: this.makeLocation(absoluteLine),
        signature,
        metadata: rpcMetadata,
      });

      // Relationships: rpc → request/response messages
      const rpcEntityId = `${filePath}:method:${rpcName}`;

      if (requestType !== "google.protobuf.Empty") {
        relationships.push({
          from: rpcEntityId,
          to: `${filePath}:type:${requestType}`,
          type: "references",
          metadata: { context: "rpc request type" },
        });
      }

      if (responseType !== "google.protobuf.Empty") {
        relationships.push({
          from: rpcEntityId,
          to: `${filePath}:type:${responseType}`,
          type: "references",
          metadata: { context: "rpc response type" },
        });
      }

      // Service → rpc containment
      relationships.push({
        from: `${filePath}:class:${serviceName}`,
        to: rpcEntityId,
        type: "contains",
        metadata: { context: "service rpc" },
      });
    }
  }

  // ===========================================================================
  // MESSAGE PARSING
  // ===========================================================================

  private parseMessage(
    block: ProtoBlock,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
    syntax: string,
    parentName: string | undefined,
  ): void {
    const messageName = parentName ? `${parentName}.${block.name}` : block.name;

    // Parse fields
    const fields = this.parseFields(block.body, syntax);

    // Parse oneof groups
    const oneofGroups = this.parseOneofGroups(block.body, syntax);
    fields.push(...oneofGroups);

    entities.push({
      name: messageName,
      type: "type",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata: {
        protoType: "message",
        isApiContract: true,
        fields: fields.map((f) => ({
          name: f.name,
          type: f.type,
          number: f.number,
          repeated: f.repeated,
          optional: f.optional,
          ...(f.mapKey ? { mapKey: f.mapKey, mapValue: f.mapValue } : {}),
          ...(f.oneofGroup ? { oneofGroup: f.oneofGroup } : {}),
        })),
        syntax,
      },
    });

    // Create relationships for field types
    const referencedTypes = new Set<string>();
    for (const field of fields) {
      const typeName = field.mapValue ?? field.type;
      if (this.isUserDefinedType(typeName)) {
        referencedTypes.add(typeName);
      }
      if (field.mapKey && this.isUserDefinedType(field.mapKey)) {
        referencedTypes.add(field.mapKey);
      }
    }

    for (const refType of referencedTypes) {
      relationships.push({
        from: `${filePath}:type:${messageName}`,
        to: `${filePath}:type:${refType}`,
        type: "references",
        metadata: { context: "message field type" },
      });
    }

    // Parse nested messages and enums
    const nestedBlocks = this.extractBlocks(block.body);
    for (const nested of nestedBlocks) {
      if (nested.keyword === "message") {
        this.parseMessage(nested, filePath, entities, relationships, syntax, messageName);
        // Containment relationship
        relationships.push({
          from: `${filePath}:type:${messageName}`,
          to: `${filePath}:type:${messageName}.${nested.name}`,
          type: "contains",
          metadata: { context: "nested message" },
        });
      } else if (nested.keyword === "enum") {
        this.parseEnum(nested, filePath, entities, relationships, syntax, messageName);
        relationships.push({
          from: `${filePath}:type:${messageName}`,
          to: `${filePath}:type:${messageName}.${nested.name}`,
          type: "contains",
          metadata: { context: "nested enum" },
        });
      }
    }

    // Containment from parent
    if (parentName) {
      // Already added by the parent's loop
    }
  }

  // ===========================================================================
  // ENUM PARSING
  // ===========================================================================

  private parseEnum(
    block: ProtoBlock,
    filePath: string,
    entities: ParsedEntity[],
    _relationships: EntityRelationship[],
    syntax: string,
    parentName: string | undefined,
  ): void {
    const enumName = parentName ? `${parentName}.${block.name}` : block.name;

    // Parse values
    const values: ProtoEnumValue[] = [];
    const valueRegex = /(\w+)\s*=\s*(-?\d+)\s*;/g;
    let valueMatch: RegExpExecArray | null;

    while ((valueMatch = valueRegex.exec(block.body)) !== null) {
      values.push({
        name: valueMatch[1]!,
        number: parseInt(valueMatch[2]!, 10),
      });
    }

    entities.push({
      name: enumName,
      type: "type",
      filePath,
      location: this.makeLocation(block.startLine),
      metadata: {
        protoType: "enum",
        isApiContract: true,
        values: values.map((v) => ({ name: v.name, number: v.number })),
        syntax,
      },
    });
  }

  // ===========================================================================
  // FIELD PARSING
  // ===========================================================================

  private parseFields(body: string, syntax: string): ProtoField[] {
    const fields: ProtoField[] = [];

    // Remove nested blocks to avoid matching their contents
    const cleanBody = this.removeNestedBlocks(body);

    // Map field: map<KeyType, ValueType> name = number;
    const mapRegex = /map\s*<\s*(\w[\w.]*)\s*,\s*(\w[\w.]*)\s*>\s+(\w+)\s*=\s*(\d+)\s*;/g;
    let mapMatch: RegExpExecArray | null;
    while ((mapMatch = mapRegex.exec(cleanBody)) !== null) {
      fields.push({
        name: mapMatch[3]!,
        type: "map",
        number: parseInt(mapMatch[4]!, 10),
        repeated: false,
        optional: false,
        mapKey: mapMatch[1]!,
        mapValue: mapMatch[2]!,
      });
    }

    // Regular field: [repeated|optional] Type name = number;
    const fieldRegex =
      /(?:^|\n)\s*(repeated\s+|optional\s+|required\s+)?(\w[\w.]*)\s+(\w+)\s*=\s*(\d+)\s*(?:\[.*?\])?\s*;/g;
    let fieldMatch: RegExpExecArray | null;

    while ((fieldMatch = fieldRegex.exec(cleanBody)) !== null) {
      const modifier = (fieldMatch[1] || "").trim();
      const typeName = fieldMatch[2]!;
      const fieldName = fieldMatch[3]!;
      const fieldNumber = parseInt(fieldMatch[4]!, 10);

      // Skip if already matched as map
      if (fields.some((f) => f.name === fieldName)) continue;
      // Skip reserved/extensions
      if (typeName === "reserved" || typeName === "extensions") continue;

      fields.push({
        name: fieldName,
        type: typeName,
        number: fieldNumber,
        repeated: modifier === "repeated",
        optional: modifier === "optional" || (syntax === "proto3" && modifier === ""),
      });
    }

    return fields;
  }

  private parseOneofGroups(body: string, _syntax: string): ProtoField[] {
    const fields: ProtoField[] = [];
    const oneofRegex = /oneof\s+(\w+)\s*\{([^}]*)\}/g;
    let oneofMatch: RegExpExecArray | null;

    while ((oneofMatch = oneofRegex.exec(body)) !== null) {
      const groupName = oneofMatch[1]!;
      const groupBody = oneofMatch[2]!;

      const fieldRegex = /(\w[\w.]*)\s+(\w+)\s*=\s*(\d+)\s*;/g;
      let fieldMatch: RegExpExecArray | null;

      while ((fieldMatch = fieldRegex.exec(groupBody)) !== null) {
        fields.push({
          name: fieldMatch[2]!,
          type: fieldMatch[1]!,
          number: parseInt(fieldMatch[3]!, 10),
          repeated: false,
          optional: true,
          oneofGroup: groupName,
        });
      }
    }

    return fields;
  }

  // ===========================================================================
  // HTTP OPTION PARSING (google.api.http)
  // ===========================================================================

  private extractHttpOptionFromRpc(rpcAndAfter: string): { method: string; path: string } | null {
    // Check if rpc has a body block: rpc Name(...) returns (...) { ... }
    // Find the first '{' after 'returns (...)'
    const returnsMatch = /returns\s*\([^)]*\)\s*\{/s.exec(rpcAndAfter);
    if (!returnsMatch) return null;

    // Extract the body between { and matching }
    const startIdx = returnsMatch.index + returnsMatch[0].length;
    let depth = 1;
    let endIdx = startIdx;
    while (endIdx < rpcAndAfter.length && depth > 0) {
      if (rpcAndAfter[endIdx] === "{") depth++;
      else if (rpcAndAfter[endIdx] === "}") depth--;
      endIdx++;
    }

    const optionBody = rpcAndAfter.substring(startIdx, endIdx - 1);

    // Match: get: "/v1/users/{id}" or post: "/v1/users"
    const httpMethods = ["get", "post", "put", "patch", "delete"];
    for (const method of httpMethods) {
      const httpRegex = new RegExp(`${method}\\s*:\\s*"([^"]+)"`);
      const httpMatch = httpRegex.exec(optionBody);
      if (httpMatch) {
        return { method: method.toUpperCase(), path: httpMatch[1]! };
      }
    }

    return null;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private stripComments(content: string): string {
    // Remove single-line comments
    let result = content.replace(/\/\/.*$/gm, "");
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, "");
    return result;
  }

  private removeNestedBlocks(body: string): string {
    // Remove message, enum, oneof, and other nested blocks
    let result = "";
    let depth = 0;
    let inBlock = false;

    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      if (ch === "{") {
        depth++;
        inBlock = true;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) inBlock = false;
        continue;
      }

      if (!inBlock) {
        result += ch;
      }
    }

    return result;
  }

  private isUserDefinedType(typeName: string): boolean {
    const builtins = new Set([
      "double",
      "float",
      "int32",
      "int64",
      "uint32",
      "uint64",
      "sint32",
      "sint64",
      "fixed32",
      "fixed64",
      "sfixed32",
      "sfixed64",
      "bool",
      "string",
      "bytes",
      "map",
    ]);
    // Also skip well-known google types for reference purposes (they'll be added as refs)
    if (builtins.has(typeName)) return false;
    // Allow dotted types like google.protobuf.Timestamp
    return true;
  }

  private findLineNumber(lines: string[], search: string): number {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes(search)) return i;
    }
    return 0;
  }

  private findLineInBody(bodyLines: string[], search: string): number {
    for (let i = 0; i < bodyLines.length; i++) {
      if (bodyLines[i]!.includes(search)) return i;
    }
    return 0;
  }

  private makeLocation(line: number) {
    return {
      start: { line, column: 0, index: 0 },
      end: { line, column: 0, index: 0 },
    };
  }
}
