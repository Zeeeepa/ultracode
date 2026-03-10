/**
 * SQL Parser
 *
 * Text-based parser for .sql files using regex + statement splitting.
 * No external dependencies — follows the ProtobufParser pattern.
 *
 * Extracts: tables, views, indexes, procedures, functions, triggers.
 * Detects SQL dialect: PostgreSQL, MySQL, ClickHouse, SQLite, MSSQL.
 */

import type { ParsedEntity, ParseResult, ParserStats } from "../../types/parser.js";
import type { DbColumn, DbEngine, DbForeignKey, DbIndex } from "./types.js";

// =============================================================================
// SQL Parser
// =============================================================================

export class SqlParser {
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

  async initialize(): Promise<void> {
    // No initialization needed for text-based parser
  }

  supportsFile(filePath: string): boolean {
    return /\.sql$/i.test(filePath);
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
      const dialect = detectDialect(content);
      const cleaned = stripComments(content);
      const statements = splitStatements(cleaned);

      // Track tables for ALTER TABLE merging
      const tableMap = new Map<string, ParsedEntity>();

      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;

        try {
          const result = parseStatement(trimmed, filePath, dialect, content);
          if (result) {
            if (result.entity) {
              // Handle ALTER TABLE merging
              if (result.entity.metadata?.["dbType"] === "table") {
                tableMap.set(result.entity.name.toLowerCase(), result.entity);
              }
              entities.push(result.entity);
            }
            if (result.alterTarget) {
              // Merge ALTER TABLE into existing table entity
              const existing = tableMap.get(result.alterTarget.toLowerCase());
              if (existing && result.alterColumns) {
                const fields = (existing.metadata?.["fields"] as DbColumn[]) || [];
                fields.push(...result.alterColumns);
                existing.metadata = { ...existing.metadata, fields };
              }
              if (existing && result.alterConstraints) {
                mergeConstraints(existing, result.alterConstraints);
              }
            }
            if (result.relationships) {
              relationships.push(...result.relationships);
            }
          }
        } catch (e) {
          errors.push({ message: `Failed to parse statement: ${(e as Error).message}` });
        }
      }

      this.stats.filesParsed++;
    } catch (e) {
      this.stats.errorCount++;
      errors.push({ message: `SQL parse error: ${(e as Error).message}` });
    }

    return {
      filePath,
      language: "sql",
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
// Dialect Detection
// =============================================================================

function detectDialect(content: string): DbEngine {
  const upper = content.toUpperCase();

  // ClickHouse markers (check first — most specific)
  if (/\bMERGETREE\b/i.test(content) || /\bENGINE\s*=\s*\w*MergeTree/i.test(content)) {
    return "clickhouse";
  }

  // PostgreSQL markers
  if (
    /\bBIGSERIAL\b|\bSERIAL\b|\bRETURNING\b/i.test(content) ||
    /::[\w]+/.test(content) ||
    /\bLANGUAGE\s+plpgsql\b/i.test(content)
  ) {
    return "postgres";
  }

  // MySQL markers
  if (/\bAUTO_INCREMENT\b/i.test(content) || /\bENGINE\s*=\s*InnoDB\b/i.test(content)) {
    return "mysql";
  }

  // MSSQL markers
  if (
    upper.includes("\nGO\n") ||
    upper.includes("\nGO\r") ||
    /\bIDENTITY\s*\(/i.test(content) ||
    /\bNVARCHAR\b/i.test(content)
  ) {
    return "mssql";
  }

  // SQLite markers
  if (/\bAUTOINCREMENT\b/i.test(content) || /\bWITHOUT\s+ROWID\b/i.test(content)) {
    return "sqlite";
  }

  return "unknown";
}

// =============================================================================
// Comment Stripping
// =============================================================================

function stripComments(content: string): string {
  // Remove block comments /* ... */
  let result = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments -- ...
  result = result.replace(/--[^\n]*/g, "");
  return result;
}

// =============================================================================
// Statement Splitting
// =============================================================================

function splitStatements(content: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;

    // Handle dollar-quoted strings (PostgreSQL $$ ... $$)
    if (!inString && ch === "$") {
      const dollarMatch = content.slice(i).match(/^(\$[^$]*\$)/);
      if (dollarMatch) {
        const tag = dollarMatch[1]!;
        if (inDollarQuote && tag === dollarTag) {
          current += tag;
          i += tag.length - 1;
          inDollarQuote = false;
          dollarTag = "";
          continue;
        } else if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    if (inDollarQuote) {
      current += ch;
      continue;
    }

    // Handle string literals
    if (!inString && (ch === "'" || ch === '"')) {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (inString) {
      current += ch;
      if (ch === stringChar) {
        // Check for escaped quote ('')
        if (i + 1 < content.length && content[i + 1] === stringChar) {
          current += content[i + 1];
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }

    // Statement separator
    if (ch === ";") {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  // Don't forget last statement without semicolon
  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

// =============================================================================
// Statement Parsing
// =============================================================================

import type { EntityRelationship, ExtendedRelationshipKind } from "../../types/parser.js";

type RelArray = EntityRelationship[];

interface ParseStatementResult {
  entity?: ParsedEntity | undefined;
  alterTarget?: string | undefined;
  alterColumns?: DbColumn[] | undefined;
  alterConstraints?: Array<{ type: string; data: unknown }> | undefined;
  relationships?: RelArray | undefined;
}

function parseStatement(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  const upper = stmt.toUpperCase().replace(/\s+/g, " ").trim();

  if (upper.startsWith("CREATE TABLE") || upper.startsWith("CREATE TEMPORARY TABLE")) {
    return parseCreateTable(stmt, filePath, dialect, fullContent);
  }
  if (
    upper.startsWith("CREATE VIEW") ||
    upper.startsWith("CREATE MATERIALIZED VIEW") ||
    upper.startsWith("CREATE OR REPLACE VIEW")
  ) {
    return parseCreateView(stmt, filePath, dialect, fullContent);
  }
  if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(upper)) {
    return parseCreateIndex(stmt, filePath, dialect, fullContent);
  }
  if (/^CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION)/i.test(upper)) {
    return parseCreateProcedureOrFunction(stmt, filePath, dialect, fullContent);
  }
  if (/^CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i.test(upper)) {
    return parseCreateTrigger(stmt, filePath, dialect, fullContent);
  }
  if (upper.startsWith("ALTER TABLE")) {
    return parseAlterTable(stmt, filePath, dialect);
  }

  return null;
}

// =============================================================================
// CREATE TABLE
// =============================================================================

function parseCreateTable(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  // Extract table name: CREATE TABLE [IF NOT EXISTS] [schema.]tableName
  const nameMatch = stmt.match(
    /CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]?(\w+)["'`]?\s*\.\s*)?["'`]?(\w+)["'`]?\s*\(/i,
  );
  if (!nameMatch) return null;

  const schema = nameMatch[1] || undefined;
  const tableName = nameMatch[2]!;
  const location = findLocation(fullContent, stmt);

  // Extract body between outer parentheses
  const bodyStart = stmt.indexOf("(");
  const bodyEnd = findMatchingParen(stmt, bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) return null;

  const body = stmt.slice(bodyStart + 1, bodyEnd);
  const afterBody = stmt.slice(bodyEnd + 1);

  // Parse columns and constraints
  const { columns, foreignKeys, indexes } = parseTableBody(body, dialect);

  // ClickHouse-specific: ENGINE, ORDER BY, PARTITION BY
  let engine: string | undefined;
  let orderBy: string[] | undefined;
  let partitionBy: string | undefined;

  const engineMatch = afterBody.match(/ENGINE\s*=\s*(\w+(?:\([^)]*\))?)/i);
  if (engineMatch) engine = engineMatch[1];

  const orderByMatch = afterBody.match(/ORDER\s+BY\s*\(([^)]+)\)/i) || afterBody.match(/ORDER\s+BY\s+(\w+)/i);
  if (orderByMatch) {
    orderBy = orderByMatch[1]!.split(",").map((s) => s.trim());
  }

  const partitionByMatch = afterBody.match(/PARTITION\s+BY\s+(.+?)(?:\s+ORDER|\s+ENGINE|\s+SETTINGS|$)/i);
  if (partitionByMatch) partitionBy = partitionByMatch[1]!.trim();

  const relationships: RelArray = [];
  for (const fk of foreignKeys) {
    relationships.push({
      from: `${filePath}:type:${tableName}`,
      to: `${filePath}:type:${fk.refTable}`,
      type: "references" as ExtendedRelationshipKind,
      metadata: {
        context: `FK: ${fk.columns.join(",")} → ${fk.refTable}(${fk.refColumns.join(",")})`,
      },
    });
  }

  const entity: ParsedEntity = {
    name: tableName,
    type: "type",
    location,
    metadata: {
      dbType: "table",
      dbEngine: dialect,
      tableName,
      schema,
      isDbSchema: true,
      isApiContract: false,
      fields: columns,
      indexes,
      foreignKeys,
      ...(engine ? { engine } : {}),
      ...(orderBy ? { orderBy } : {}),
      ...(partitionBy ? { partitionBy } : {}),
    },
    filePath,
    language: "sql",
  };

  return { entity, relationships };
}

// =============================================================================
// Table Body Parsing (columns + constraints)
// =============================================================================

function parseTableBody(
  body: string,
  dialect: DbEngine,
): {
  columns: DbColumn[];
  foreignKeys: DbForeignKey[];
  indexes: DbIndex[];
} {
  const columns: DbColumn[] = [];
  const foreignKeys: DbForeignKey[] = [];
  const indexes: DbIndex[] = [];

  // Split by commas, respecting parentheses
  const parts = splitByComma(body);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const upperPart = trimmed.toUpperCase().replace(/\s+/g, " ").trim();

    // Table-level constraints
    if (upperPart.startsWith("PRIMARY KEY")) {
      const colsMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (colsMatch) {
        const pkCols = colsMatch[1]!.split(",").map((c) => c.trim().replace(/["'`]/g, ""));
        for (const pkCol of pkCols) {
          const existing = columns.find((c) => c.name.toLowerCase() === pkCol.toLowerCase());
          if (existing) existing.primaryKey = true;
        }
      }
      continue;
    }

    if (upperPart.startsWith("UNIQUE")) {
      const colsMatch = trimmed.match(/UNIQUE\s*(?:KEY\s+\w+\s*)?\(([^)]+)\)/i);
      if (colsMatch) {
        const uniqueCols = colsMatch[1]!.split(",").map((c) => c.trim().replace(/["'`]/g, ""));
        for (const uCol of uniqueCols) {
          const existing = columns.find((c) => c.name.toLowerCase() === uCol.toLowerCase());
          if (existing) existing.unique = true;
        }
        if (uniqueCols.length > 1) {
          indexes.push({ name: `uq_${uniqueCols.join("_")}`, columns: uniqueCols, unique: true });
        }
      }
      continue;
    }

    if (upperPart.startsWith("FOREIGN KEY") || upperPart.startsWith("CONSTRAINT")) {
      const fk = parseForeignKeyConstraint(trimmed);
      if (fk) foreignKeys.push(fk);
      continue;
    }

    if (upperPart.startsWith("CHECK") || upperPart.startsWith("INDEX") || upperPart.startsWith("KEY")) {
      continue; // Skip CHECK constraints and inline indexes for now
    }

    // Column definition
    const col = parseColumnDef(trimmed, dialect);
    if (col) columns.push(col);
  }

  return { columns, foreignKeys, indexes };
}

function parseColumnDef(def: string, _dialect: DbEngine): DbColumn | null {
  // Column: name type [constraints...]
  // Must start with a valid identifier
  const match = def.match(/^["'`]?(\w+)["'`]?\s+(.+)$/is);
  if (!match) return null;

  const name = match[1]!;
  const rest = match[2]!;

  // Skip if name looks like a SQL keyword that starts a constraint
  const upperName = name.toUpperCase();
  if (["CONSTRAINT", "PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "INDEX", "KEY", "EXCLUDE"].includes(upperName)) {
    return null;
  }

  // Extract type — everything up to first constraint keyword
  const typeMatch = rest.match(
    /^([\w]+(?:\s*\([^)]*\))?(?:\s+(?:UNSIGNED|VARYING|PRECISION|WITHOUT\s+TIME\s+ZONE|WITH\s+TIME\s+ZONE))*)/i,
  );
  if (!typeMatch) return null;

  let type = typeMatch[1]!.trim();
  const constraintsPart = rest.slice(typeMatch[0]!.length);
  const upperConstraints = constraintsPart.toUpperCase();

  const col: DbColumn = {
    name,
    type,
    nullable: true,
  };

  // Check for PRIMARY KEY
  if (upperConstraints.includes("PRIMARY KEY")) {
    col.primaryKey = true;
    col.nullable = false;
  }

  // NOT NULL
  if (upperConstraints.includes("NOT NULL")) {
    col.nullable = false;
  }

  // UNIQUE
  if (/\bUNIQUE\b/.test(upperConstraints)) {
    col.unique = true;
  }

  // DEFAULT
  const defaultMatch = constraintsPart.match(
    /DEFAULT\s+(.+?)(?:\s+(?:NOT|NULL|UNIQUE|PRIMARY|CHECK|REFERENCES|CONSTRAINT|,)|\s*$)/i,
  );
  if (defaultMatch) {
    col.default = defaultMatch[1]!.trim().replace(/,\s*$/, "");
  }

  // Auto-increment variants
  const upperType = type.toUpperCase();
  if (upperType === "SERIAL" || upperType === "BIGSERIAL" || upperType === "SMALLSERIAL") {
    col.autoIncrement = true;
    col.nullable = false;
    // Map serial types to their base types
    if (upperType === "SERIAL") type = "INTEGER";
    else if (upperType === "BIGSERIAL") type = "BIGINT";
    else if (upperType === "SMALLSERIAL") type = "SMALLINT";
    col.type = type;
    col.primaryKey = col.primaryKey || false; // SERIAL doesn't imply PK
  }
  if (/\bAUTO_INCREMENT\b/i.test(upperConstraints)) {
    col.autoIncrement = true;
  }
  if (/\bAUTOINCREMENT\b/i.test(upperConstraints)) {
    col.autoIncrement = true;
  }
  if (/\bIDENTITY\s*\(/i.test(constraintsPart)) {
    col.autoIncrement = true;
  }
  if (/\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY/i.test(constraintsPart)) {
    col.autoIncrement = true;
  }

  // Inline REFERENCES (FK)
  // We don't add to foreignKeys here — caller handles table-level FKs
  // But inline REFERENCES on a column also implies NOT NULL behavior

  return col;
}

function parseForeignKeyConstraint(def: string): DbForeignKey | null {
  // CONSTRAINT name FOREIGN KEY (cols) REFERENCES refTable(refCols) [ON DELETE ...] [ON UPDATE ...]
  // FOREIGN KEY (cols) REFERENCES refTable(refCols)
  const match = def.match(
    /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(\w+(?:\s+\w+)?))?(?:\s+ON\s+UPDATE\s+(\w+(?:\s+\w+)?))?/i,
  );
  if (!match) {
    // Try inline column reference
    return null;
  }

  return {
    columns: match[1]!.split(",").map((c) => c.trim().replace(/["'`]/g, "")),
    refTable: match[2]!,
    refColumns: match[3]!.split(",").map((c) => c.trim().replace(/["'`]/g, "")),
    onDelete: match[4] || undefined,
    onUpdate: match[5] || undefined,
  };
}

// =============================================================================
// CREATE VIEW
// =============================================================================

function parseCreateView(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  const isMaterialized = /MATERIALIZED/i.test(stmt);
  const nameMatch = stmt.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]?(\w+)["'`]?\s*\.\s*)?["'`]?(\w+)["'`]?\s+AS\b/i,
  );
  if (!nameMatch) return null;

  const viewName = nameMatch[2]!;
  const location = findLocation(fullContent, stmt);

  // Extract source tables from the SELECT part
  const asIndex = stmt.search(/\bAS\b/i);
  const selectPart = asIndex >= 0 ? stmt.slice(asIndex + 2) : "";
  const sourceTables = extractTablesFromSelect(selectPart);

  const relationships: RelArray = [];
  for (const table of sourceTables) {
    relationships.push({
      from: `${filePath}:type:${viewName}`,
      to: `${filePath}:type:${table}`,
      type: "references" as ExtendedRelationshipKind,
      metadata: { context: `VIEW ${viewName} reads from ${table}` },
    });
  }

  const entity: ParsedEntity = {
    name: viewName,
    type: "type",
    location,
    metadata: {
      dbType: "view",
      dbEngine: dialect,
      isDbSchema: true,
      isApiContract: false,
      sourceTables,
      isMaterialized,
    },
    filePath,
    language: "sql",
  };

  return { entity, relationships };
}

// =============================================================================
// CREATE INDEX
// =============================================================================

function parseCreateIndex(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  const isUnique = /UNIQUE/i.test(stmt);
  const match = stmt.match(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s+ON\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)/i,
  );
  if (!match) return null;

  const indexName = match[1]!;
  const tableName = match[2]!;
  const columns = match[3]!.split(",").map((c) =>
    c
      .trim()
      .replace(/["'`]/g, "")
      .replace(/\s+(ASC|DESC)$/i, ""),
  );

  // Detect index type (btree, hash, gin, gist)
  let indexType: string | undefined;
  const usingMatch = stmt.match(/USING\s+(\w+)/i);
  if (usingMatch) indexType = usingMatch[1]!.toLowerCase();

  const location = findLocation(fullContent, stmt);

  const entity: ParsedEntity = {
    name: indexName,
    type: "constant",
    location,
    metadata: {
      dbType: "index",
      dbEngine: dialect,
      isDbSchema: true,
      isApiContract: false,
      tableName,
      columns,
      unique: isUnique,
      ...(indexType ? { indexType } : {}),
    },
    filePath,
    language: "sql",
  };

  return { entity };
}

// =============================================================================
// CREATE PROCEDURE / FUNCTION
// =============================================================================

function parseCreateProcedureOrFunction(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  const isProcedure = /\bPROCEDURE\b/i.test(stmt);
  const kind = isProcedure ? "procedure" : "function";

  const nameMatch = stmt.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION)\s+(?:["'`]?(\w+)["'`]?\s*\.\s*)?["'`]?(\w+)["'`]?\s*\(/i,
  );
  if (!nameMatch) return null;

  const funcName = nameMatch[2]!;
  const location = findLocation(fullContent, stmt);

  // Extract parameters
  const paramsStart = stmt.indexOf("(", stmt.search(/\bPROCEDURE\b|\bFUNCTION\b/i));
  const paramsEnd = findMatchingParen(stmt, paramsStart);
  const paramsStr = paramsStart >= 0 && paramsEnd >= 0 ? stmt.slice(paramsStart + 1, paramsEnd) : "";

  const parameters = parseParameters(paramsStr);

  // Extract return type
  let returnType: string | undefined;
  const returnsMatch = stmt.match(/RETURNS\s+([\w]+(?:\s*\([^)]*\))?)/i);
  if (returnsMatch) returnType = returnsMatch[1]!.trim();

  // Extract referenced tables from body
  const referencedTables = extractTablesFromBody(stmt);

  // Build signature
  const paramSig = parameters.map((p) => `${p.direction ? p.direction + " " : ""}${p.name} ${p.type}`).join(", ");
  const signature = `${kind.toUpperCase()} ${funcName}(${paramSig})${returnType ? ` RETURNS ${returnType}` : ""}`;

  const relationships: RelArray = [];
  for (const table of referencedTables) {
    relationships.push({
      from: `${filePath}:function:${funcName}`,
      to: `${filePath}:type:${table}`,
      type: "references" as ExtendedRelationshipKind,
      metadata: { context: `${kind} ${funcName} references table ${table}` },
    });
  }

  const entity: ParsedEntity = {
    name: funcName,
    type: "function",
    location,
    metadata: {
      dbType: kind,
      dbEngine: dialect,
      isDbSchema: true,
      isApiContract: false,
      parameters,
      returnType,
      referencedTables,
      signature,
    },
    filePath,
    language: "sql",
  };

  return { entity, relationships };
}

// =============================================================================
// CREATE TRIGGER
// =============================================================================

function parseCreateTrigger(
  stmt: string,
  filePath: string,
  dialect: DbEngine,
  fullContent: string,
): ParseStatementResult | null {
  const nameMatch = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+["'`]?(\w+)["'`]?/i);
  if (!nameMatch) return null;

  const triggerName = nameMatch[1]!;
  const location = findLocation(fullContent, stmt);

  // Extract table
  const onMatch = stmt.match(/ON\s+["'`]?(\w+)["'`]?/i);
  const tableName = onMatch ? onMatch[1] : undefined;

  // Extract timing and event
  const timingMatch = stmt.match(/(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE)/i);
  const timing = timingMatch ? timingMatch[1] : undefined;
  const event = timingMatch ? timingMatch[2] : undefined;

  // Extract function call
  const execMatch = stmt.match(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+["'`]?(\w+)["'`]?/i);
  const executesFunction = execMatch ? execMatch[1] : undefined;

  const relationships: RelArray = [];
  if (tableName) {
    relationships.push({
      from: `${filePath}:function:${triggerName}`,
      to: `${filePath}:type:${tableName}`,
      type: "references" as ExtendedRelationshipKind,
      metadata: { context: `TRIGGER ${triggerName} on ${tableName}` },
    });
  }

  const entity: ParsedEntity = {
    name: triggerName,
    type: "function",
    location,
    metadata: {
      dbType: "trigger",
      dbEngine: dialect,
      isDbSchema: true,
      isApiContract: false,
      tableName,
      timing,
      event,
      executesFunction,
    },
    filePath,
    language: "sql",
  };

  return { entity, relationships };
}

// =============================================================================
// ALTER TABLE
// =============================================================================

function parseAlterTable(stmt: string, _filePath: string, _dialect: DbEngine): ParseStatementResult | null {
  const nameMatch = stmt.match(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i);
  if (!nameMatch) return null;

  const tableName = nameMatch[1]!;
  const alterColumns: DbColumn[] = [];
  const alterConstraints: Array<{ type: string; data: unknown }> = [];

  // ADD COLUMN
  const addColMatch = stmt.match(/ADD\s+(?:COLUMN\s+)?["'`]?(\w+)["'`]?\s+(.+?)(?:\s*$)/i);
  if (addColMatch) {
    const col = parseColumnDef(`${addColMatch[1]} ${addColMatch[2]}`, _dialect);
    if (col) alterColumns.push(col);
  }

  // ADD CONSTRAINT
  const constraintMatch = stmt.match(/ADD\s+CONSTRAINT\s+["'`]?(\w+)["'`]?\s+(.*)/i);
  if (constraintMatch) {
    const constraintBody = constraintMatch[2]!;
    if (/FOREIGN\s+KEY/i.test(constraintBody)) {
      const fk = parseForeignKeyConstraint(constraintBody);
      if (fk) alterConstraints.push({ type: "foreignKey", data: fk });
    } else if (/CHECK/i.test(constraintBody)) {
      alterConstraints.push({ type: "check", data: constraintBody });
    } else if (/UNIQUE/i.test(constraintBody)) {
      alterConstraints.push({ type: "unique", data: constraintBody });
    }
  }

  const result: ParseStatementResult = { alterTarget: tableName };
  if (alterColumns.length > 0) result.alterColumns = alterColumns;
  if (alterConstraints.length > 0) result.alterConstraints = alterConstraints;
  return result;
}

// =============================================================================
// Helpers
// =============================================================================

function mergeConstraints(entity: ParsedEntity, constraints: Array<{ type: string; data: unknown }>): void {
  for (const c of constraints) {
    if (c.type === "foreignKey" && c.data) {
      const fks = (entity.metadata?.["foreignKeys"] as DbForeignKey[]) || [];
      fks.push(c.data as DbForeignKey);
      entity.metadata = { ...entity.metadata, foreignKeys: fks };
    }
  }
}

function splitByComma(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function findMatchingParen(str: string, start: number): number {
  if (start < 0 || str[start] !== "(") return -1;
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "(") depth++;
    if (str[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findLocation(fullContent: string, substring: string) {
  const idx = fullContent.indexOf(substring.slice(0, Math.min(60, substring.length)));
  if (idx < 0) {
    return { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 0, index: 0 } };
  }
  const before = fullContent.slice(0, idx);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  const column = idx - lastNewline - 1;

  const endIdx = idx + substring.length;
  const beforeEnd = fullContent.slice(0, endIdx);
  const endLine = beforeEnd.split("\n").length;
  const lastNewlineEnd = beforeEnd.lastIndexOf("\n");
  const endColumn = endIdx - lastNewlineEnd - 1;

  return {
    start: { line, column, index: idx },
    end: { line: endLine, column: endColumn, index: endIdx },
  };
}

function extractTablesFromSelect(sql: string): string[] {
  const tables = new Set<string>();
  // Match FROM and JOIN clauses
  const fromMatches = sql.matchAll(/(?:FROM|JOIN)\s+["'`]?(\w+)["'`]?/gi);
  for (const m of fromMatches) {
    const name = m[1]!;
    // Skip SQL keywords
    if (
      ![
        "SELECT",
        "WHERE",
        "ON",
        "AND",
        "OR",
        "AS",
        "SET",
        "INTO",
        "VALUES",
        "GROUP",
        "ORDER",
        "HAVING",
        "LIMIT",
        "UNION",
        "EXCEPT",
        "INTERSECT",
      ].includes(name.toUpperCase())
    ) {
      tables.add(name);
    }
  }
  return Array.from(tables);
}

function extractTablesFromBody(stmt: string): string[] {
  const tables = new Set<string>();

  // FROM / JOIN / INTO / UPDATE / DELETE FROM
  const matches = stmt.matchAll(/(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+["'`]?(\w+)["'`]?/gi);
  for (const m of matches) {
    const name = m[1]!;
    if (
      ![
        "SELECT",
        "WHERE",
        "ON",
        "AND",
        "OR",
        "AS",
        "SET",
        "VALUES",
        "GROUP",
        "ORDER",
        "HAVING",
        "LIMIT",
        "BEGIN",
        "END",
        "DECLARE",
        "IF",
        "THEN",
        "ELSE",
        "LOOP",
        "RETURN",
        "NEW",
        "OLD",
      ].includes(name.toUpperCase())
    ) {
      tables.add(name);
    }
  }

  return Array.from(tables);
}

function parseParameters(paramsStr: string): Array<{ name: string; type: string; direction?: "IN" | "OUT" | "INOUT" }> {
  if (!paramsStr.trim()) return [];

  const params: Array<{ name: string; type: string; direction?: "IN" | "OUT" | "INOUT" }> = [];
  const parts = splitByComma(paramsStr);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Direction prefix: IN, OUT, INOUT
    let direction: "IN" | "OUT" | "INOUT" | undefined;
    let rest = trimmed;

    const dirMatch = rest.match(/^(IN\s+OUT|INOUT|OUT|IN)\s+/i);
    if (dirMatch) {
      const dir = dirMatch[1]!.toUpperCase().replace(/\s+/g, "");
      if (dir === "INOUT" || dir === "IN" || dir === "OUT") {
        direction = dir as "IN" | "OUT" | "INOUT";
      }
      rest = rest.slice(dirMatch[0]!.length);
    }

    // name type [DEFAULT ...]
    const paramMatch = rest.match(/^["'`]?(\w+)["'`]?\s+([\w]+(?:\s*\([^)]*\))?)/i);
    if (paramMatch) {
      params.push({
        name: paramMatch[1]!,
        type: paramMatch[2]!,
        ...(direction ? { direction } : {}),
      });
    }
  }

  return params;
}

// parseInlineReference is used by extractInlineForeignKeys (future use)
// extractInlineForeignKeys extends CREATE TABLE with inline FK detection
