/**
 * LINQ Parser
 *
 * Text-based parser for .linq files (LINQPad).
 * Extracts XML header (Kind, Connection, NuGetReferences) and
 * C# LINQ queries (query syntax, method syntax, raw SQL, Dapper).
 */

import type { ExtendedRelationshipKind, ParsedEntity, ParseResult, ParserStats } from "../../types/parser.js";

// =============================================================================
// LINQ Parser
// =============================================================================

export class LinqParser {
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
    return /\.linq$/i.test(filePath);
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
      const { header, body, headerEndLine } = parseLinqFile(content);

      // Module entity for the whole file
      const moduleEntity: ParsedEntity = {
        name: filePath.split(/[/\\]/).pop()?.replace(".linq", "") || "linq_query",
        type: "module",
        location: { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: content.length } },
        metadata: {
          dbType: "linq_query",
          isDbSchema: true,
          isApiContract: false,
          queryKind: header.kind,
          connection: header.connectionId,
          nugetReferences: header.nugetReferences,
        },
        filePath,
        language: "linq",
      };
      entities.push(moduleEntity);

      // Parse LINQ expressions from body
      if (body) {
        const expressions = extractLinqExpressions(body, filePath, headerEndLine);
        for (const expr of expressions) {
          entities.push(expr.entity);
          if (expr.relationships) {
            relationships.push(...expr.relationships);
          }
        }
      }

      this.stats.filesParsed++;
    } catch (e) {
      this.stats.errorCount++;
      errors.push({ message: `LINQ parse error: ${(e as Error).message}` });
    }

    return {
      filePath,
      language: "linq",
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
// Header Parsing
// =============================================================================

interface LinqHeader {
  kind?: string | undefined;
  connectionId?: string | undefined;
  nugetReferences: string[];
}

function parseLinqFile(content: string): { header: LinqHeader; body: string; headerEndLine: number } {
  const header: LinqHeader = { nugetReferences: [] };
  let body = content;
  let headerEndLine = 0;

  // Find <Query>...</Query> block
  const queryMatch = content.match(/<Query[\s\S]*?<\/Query>/);
  if (queryMatch) {
    const xml = queryMatch[0];
    const xmlEndIndex = content.indexOf(xml) + xml.length;

    // Extract Kind attribute
    const kindMatch = xml.match(/Kind\s*=\s*"([^"]+)"/);
    if (kindMatch) header.kind = kindMatch[1];

    // Extract Connection ID
    const connMatch = xml.match(/<ID>([^<]+)<\/ID>/);
    if (connMatch) header.connectionId = connMatch[1];

    // Extract NuGet references
    const nugetMatches = xml.matchAll(/<NuGetReference>([^<]+)<\/NuGetReference>/g);
    for (const m of nugetMatches) {
      header.nugetReferences.push(m[1]!);
    }

    body = content.slice(xmlEndIndex).trim();
    headerEndLine = content.slice(0, xmlEndIndex).split("\n").length;
  }

  return { header, body, headerEndLine };
}

// =============================================================================
// Expression Extraction
// =============================================================================

interface ExprResult {
  entity: ParsedEntity;
  relationships?: ParseResult["relationships"] | undefined;
}

function extractLinqExpressions(body: string, filePath: string, lineOffset: number): ExprResult[] {
  const results: ExprResult[] = [];
  let exprIndex = 0;

  // 1. LINQ query syntax: from x in TableName where ... select ...
  const querySyntaxMatches = body.matchAll(/\bfrom\s+(\w+)\s+in\s+(\w+)\b[\s\S]*?(?:select|group)\b/gi);
  for (const m of querySyntaxMatches) {
    const tableName = m[2]!;
    const matchLine = lineOffset + body.slice(0, m.index!).split("\n").length;
    exprIndex++;

    results.push({
      entity: {
        name: `linq_query_${exprIndex}`,
        type: "function",
        location: {
          start: { line: matchLine, column: 0, index: m.index! },
          end: { line: matchLine, column: 0, index: m.index! + m[0].length },
        },
        metadata: {
          dbType: "linq_expression",
          isDbSchema: true,
          isApiContract: false,
          referencedTables: [tableName],
          queryType: "select",
          syntax: "query",
        },
        filePath,
        language: "linq",
      },
      relationships: [
        {
          from: `${filePath}:function:linq_query_${exprIndex}`,
          to: `${filePath}:type:${tableName}`,
          type: "references" as ExtendedRelationshipKind,
          metadata: { context: `LINQ query reads ${tableName}` },
        },
      ],
    });
  }

  // 2. LINQ method syntax: context.TableName.Where/Select/Count/Any/...
  const methodSyntaxMatches = body.matchAll(
    /(?:context\.|db\.)?(\w+)\s*\.\s*(Where|Select|Count|Any|All|First|Single|OrderBy|GroupBy|Sum|Average|Max|Min|ToList|ToArray)\s*\(/gi,
  );
  for (const m of methodSyntaxMatches) {
    const tableName = m[1]!;
    // Skip common non-table names
    if (
      ["var", "string", "int", "new", "this", "connection", "result", "results", "query", "data"].includes(
        tableName.toLowerCase(),
      )
    ) {
      continue;
    }
    const matchLine = lineOffset + body.slice(0, m.index!).split("\n").length;
    exprIndex++;

    results.push({
      entity: {
        name: `linq_method_${exprIndex}`,
        type: "function",
        location: {
          start: { line: matchLine, column: 0, index: m.index! },
          end: { line: matchLine, column: 0, index: m.index! + m[0].length },
        },
        metadata: {
          dbType: "linq_expression",
          isDbSchema: true,
          isApiContract: false,
          referencedTables: [tableName],
          queryType: "select",
          syntax: "method",
        },
        filePath,
        language: "linq",
      },
    });
  }

  // 3. Raw SQL strings: Query<T>("SELECT ... FROM ...")
  const rawSqlMatches = body.matchAll(
    /\.(?:Query|Execute|QueryFirst|QuerySingle|QueryMultiple)\s*(?:<\w+>)?\s*\(\s*"([^"]+)"/gi,
  );
  for (const m of rawSqlMatches) {
    const sqlText = m[1]!;
    const tables = extractTablesFromSqlString(sqlText);
    const matchLine = lineOffset + body.slice(0, m.index!).split("\n").length;
    exprIndex++;

    const queryType = detectQueryType(sqlText);

    results.push({
      entity: {
        name: `raw_sql_${exprIndex}`,
        type: "function",
        location: {
          start: { line: matchLine, column: 0, index: m.index! },
          end: { line: matchLine, column: 0, index: m.index! + m[0].length },
        },
        metadata: {
          dbType: "raw_sql",
          isDbSchema: true,
          isApiContract: false,
          referencedTables: tables,
          queryType,
          sqlText: sqlText.length > 200 ? sqlText.slice(0, 200) + "..." : sqlText,
        },
        filePath,
        language: "linq",
      },
      relationships: tables.map((t) => ({
        from: `${filePath}:function:raw_sql_${exprIndex}`,
        to: `${filePath}:type:${t}`,
        type: "references" as ExtendedRelationshipKind,
        metadata: { context: `Raw SQL ${queryType} ${t}` },
      })),
    });
  }

  // 4. SqlCommand / new SqlCommand("...")
  const sqlCommandMatches = body.matchAll(/new\s+SqlCommand\s*\(\s*"([^"]+)"/gi);
  for (const m of sqlCommandMatches) {
    const sqlText = m[1]!;
    const tables = extractTablesFromSqlString(sqlText);
    const matchLine = lineOffset + body.slice(0, m.index!).split("\n").length;
    exprIndex++;

    results.push({
      entity: {
        name: `sql_command_${exprIndex}`,
        type: "function",
        location: {
          start: { line: matchLine, column: 0, index: m.index! },
          end: { line: matchLine, column: 0, index: m.index! + m[0].length },
        },
        metadata: {
          dbType: "raw_sql",
          isDbSchema: true,
          isApiContract: false,
          referencedTables: tables,
          queryType: detectQueryType(sqlText),
          sqlText: sqlText.length > 200 ? sqlText.slice(0, 200) + "..." : sqlText,
        },
        filePath,
        language: "linq",
      },
    });
  }

  return results;
}

// =============================================================================
// Helpers
// =============================================================================

function extractTablesFromSqlString(sql: string): string[] {
  const tables = new Set<string>();
  const matches = sql.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+["'`[]?(\w+)["'`\]]?/gi);
  for (const m of matches) {
    const name = m[1]!;
    if (!["SELECT", "WHERE", "ON", "AND", "OR", "AS", "SET", "VALUES"].includes(name.toUpperCase())) {
      tables.add(name);
    }
  }
  return Array.from(tables);
}

function detectQueryType(sql: string): string {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith("SELECT")) return "select";
  if (upper.startsWith("INSERT")) return "insert";
  if (upper.startsWith("UPDATE")) return "update";
  if (upper.startsWith("DELETE")) return "delete";
  if (upper.startsWith("EXEC")) return "execute";
  return "unknown";
}
