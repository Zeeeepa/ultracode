/**
 * Prisma Parser
 *
 * Text-based parser for .prisma schema files.
 * Extracts: datasource, generator, model, enum blocks.
 * Creates table entities with fields, indexes, and relationships.
 */

import type { ExtendedRelationshipKind, ParsedEntity, ParseResult, ParserStats } from "../../types/parser.js";
import type { DbColumn, DbEngine, DbIndex } from "./types.js";

// =============================================================================
// Prisma Parser
// =============================================================================

export class PrismaParser {
  private stats: ParserStats = {
    filesParsed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTimeMs: 0,
    totalParseTimeMs: 0,
    throughput: 0,
    cacheMemoryMB: 0,
    errorCount: 0,
  };

  async initialize(): Promise<void> {}

  supportsFile(filePath: string): boolean {
    return /\.prisma$/i.test(filePath);
  }

  getStats(): ParserStats {
    return { ...this.stats };
  }

  async parse(filePath: string, content: string, hash: string): Promise<ParseResult> {
    const startTime = Date.now();
    const entities: ParsedEntity[] = [];
    const relationships: ParseResult["relationships"] = [];
    const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

    try {
      const cleaned = stripComments(content);
      const blocks = extractBlocks(cleaned);

      // First pass: extract datasource to get dbEngine
      let dbEngine: DbEngine = "unknown";
      for (const block of blocks) {
        if (block.type === "datasource") {
          const providerMatch = block.body.match(/provider\s*=\s*"([^"]+)"/);
          if (providerMatch) {
            dbEngine = mapPrismaProvider(providerMatch[1]!);
          }
          entities.push({
            name: block.name,
            type: "module",
            location: findLocation(content, block.startLine),
            metadata: {
              dbType: "datasource",
              isDbSchema: true,
              isApiContract: false,
              provider: providerMatch?.[1],
              dbEngine,
            },
            filePath,
            language: "prisma",
          });
        }
      }

      // Second pass: parse models, enums, generators
      for (const block of blocks) {
        if (block.type === "generator") {
          const providerMatch = block.body.match(/provider\s*=\s*"([^"]+)"/);
          entities.push({
            name: block.name,
            type: "module",
            location: findLocation(content, block.startLine),
            metadata: {
              dbType: "generator",
              isDbSchema: true,
              isApiContract: false,
              provider: providerMatch?.[1],
            },
            filePath,
            language: "prisma",
          });
        } else if (block.type === "model") {
          const { entity, rels } = parseModel(block, filePath, dbEngine, content);
          entities.push(entity);
          if (rels) relationships.push(...rels);
        } else if (block.type === "enum") {
          entities.push(parseEnum(block, filePath, content));
        }
      }

      this.stats.filesParsed++;
    } catch (e) {
      this.stats.errorCount++;
      errors.push({ message: `Prisma parse error: ${(e as Error).message}` });
    }

    return {
      filePath,
      language: "prisma",
      contentHash: hash,
      timestamp: Date.now(),
      parseTimeMs: Date.now() - startTime,
      entities,
      relationships,
      errors,
    };
  }
}

// =============================================================================
// Comment Stripping
// =============================================================================

function stripComments(content: string): string {
  return content
    .replace(/\/\/[^\n]*/g, "") // Line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // Block comments (rare in Prisma)
}

// =============================================================================
// Block Extraction
// =============================================================================

interface PrismaBlock {
  type: "datasource" | "generator" | "model" | "enum";
  name: string;
  body: string;
  startLine: number;
}

function extractBlocks(content: string): PrismaBlock[] {
  const blocks: PrismaBlock[] = [];
  const blockRegex = /\b(datasource|generator|model|enum)\s+(\w+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const type = match[1]! as PrismaBlock["type"];
    const name = match[2]!;
    const braceStart = match.index + match[0].length - 1;

    // Find matching closing brace
    let depth = 1;
    let i = braceStart + 1;
    while (i < content.length && depth > 0) {
      if (content[i] === "{") depth++;
      if (content[i] === "}") depth--;
      i++;
    }

    const body = content.slice(braceStart + 1, i - 1);
    const startLine = content.slice(0, match.index).split("\n").length;

    blocks.push({ type, name, body, startLine });
  }

  return blocks;
}

// =============================================================================
// Model Parsing
// =============================================================================

function parseModel(
  block: PrismaBlock,
  filePath: string,
  dbEngine: DbEngine,
  fullContent: string,
): {
  entity: ParsedEntity;
  rels: ParseResult["relationships"];
} {
  const fields: DbColumn[] = [];
  const indexes: DbIndex[] = [];
  const uniqueConstraints: string[][] = [];
  const rels: ParseResult["relationships"] = [];

  let tableName = block.name; // Default: model name
  const lines = block.body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Block-level attributes: @@map, @@index, @@unique, @@id
    if (trimmed.startsWith("@@")) {
      const mapMatch = trimmed.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
      if (mapMatch) tableName = mapMatch[1]!;

      const indexMatch = trimmed.match(/@@index\s*\(\s*\[([^\]]+)\]/);
      if (indexMatch) {
        const cols = indexMatch[1]!.split(",").map((c) => c.trim());
        indexes.push({ name: `idx_${block.name}_${cols.join("_")}`, columns: cols });
      }

      const uniqueMatch = trimmed.match(/@@unique\s*\(\s*\[([^\]]+)\]/);
      if (uniqueMatch) {
        const cols = uniqueMatch[1]!.split(",").map((c) => c.trim());
        uniqueConstraints.push(cols);
        indexes.push({ name: `uq_${block.name}_${cols.join("_")}`, columns: cols, unique: true });
      }

      continue;
    }

    // Field: name Type [@attributes]
    const fieldMatch = trimmed.match(/^(\w+)\s+([\w[\]?]+)(?:\s+(.*))?$/);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1]!;
    let fieldType = fieldMatch[2]!;
    const attrs = fieldMatch[3] || "";

    const isList = fieldType.includes("[]");
    const isOptional = fieldType.includes("?");
    fieldType = fieldType.replace(/[[\]?]/g, "");

    // Prisma scalar types start with uppercase but are NOT relations
    const PRISMA_SCALARS = new Set([
      "Int",
      "String",
      "Boolean",
      "Float",
      "DateTime",
      "BigInt",
      "Decimal",
      "Json",
      "Bytes",
    ]);
    const isRelation = /^[A-Z]/.test(fieldType) && !PRISMA_SCALARS.has(fieldType);

    // Check for relation
    if (isRelation) {
      // This is a relation field
      rels.push({
        from: `${filePath}:type:${block.name}`,
        to: `${filePath}:type:${fieldType}`,
        type: "references" as ExtendedRelationshipKind,
        metadata: { context: `model ${block.name}.${fieldName} → ${fieldType}`, isList },
      });

      // Still add as a column with isRelation flag
      fields.push({
        name: fieldName,
        type: isList ? `${fieldType}[]` : isOptional ? `${fieldType}?` : fieldType,
        nullable: isOptional,
      });
      continue;
    }

    const col: DbColumn = {
      name: fieldName,
      type: fieldType,
      nullable: isOptional,
    };

    // Parse field attributes
    if (attrs.includes("@id")) col.primaryKey = true;
    if (attrs.includes("@unique")) col.unique = true;
    if (attrs.includes("@default(autoincrement())")) {
      col.autoIncrement = true;
      col.default = "autoincrement()";
    }
    const defaultMatch = attrs.match(/@default\(([^)]+)\)/);
    if (defaultMatch && !col.default) {
      col.default = defaultMatch[1]!;
    }
    const mapMatch = attrs.match(/@map\("([^"]+)"\)/);
    if (mapMatch) {
      col.comment = `mapped: ${mapMatch[1]}`;
    }

    fields.push(col);
  }

  const entity: ParsedEntity = {
    name: block.name,
    type: "type",
    location: findLocation(fullContent, block.startLine),
    metadata: {
      dbType: "table",
      dbEngine,
      tableName,
      isDbSchema: true,
      isApiContract: false,
      fields,
      indexes,
      uniqueConstraints,
    },
    filePath,
    language: "prisma",
  };

  return { entity, rels };
}

// =============================================================================
// Enum Parsing
// =============================================================================

function parseEnum(block: PrismaBlock, filePath: string, fullContent: string): ParsedEntity {
  const values: string[] = [];

  for (const line of block.body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@@") || trimmed.startsWith("//")) continue;
    const val = trimmed.split(/\s/)[0]!;
    if (val) values.push(val);
  }

  return {
    name: block.name,
    type: "type",
    location: findLocation(fullContent, block.startLine),
    metadata: {
      dbType: "enum",
      isDbSchema: true,
      isApiContract: false,
      values,
    },
    filePath,
    language: "prisma",
  };
}

// =============================================================================
// Helpers
// =============================================================================

function mapPrismaProvider(provider: string): DbEngine {
  switch (provider.toLowerCase()) {
    case "postgresql":
    case "postgres":
      return "postgres";
    case "mysql":
      return "mysql";
    case "sqlite":
      return "sqlite";
    case "sqlserver":
      return "mssql";
    default:
      return "unknown";
  }
}

function findLocation(_fullContent: string, startLine: number) {
  return {
    start: { line: startLine, column: 0, index: 0 },
    end: { line: startLine, column: 0, index: 0 },
  };
}
