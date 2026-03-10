/**
 * DB Code Linker
 *
 * Links database entities (from SQL/Prisma/ORM parsers) to code entities.
 * Creates READS_TABLE, WRITES_TABLE, MAPS_TO_TABLE relationships.
 *
 * Follows the pattern of swagger-code-linker.ts / protobuf-code-linker.ts.
 */

import type { Entity } from "../../types/storage.js";
import { RelationType } from "../../types/storage.js";
import { isMigrationFile as isMigrationFileDetector } from "./migration-detector.js";
import type { DbCodeLink, DbRelationship, DbSchemaAnalysis } from "./types.js";

// =============================================================================
// Code Link Analysis
// =============================================================================

/**
 * Analyze links between DB entities and code entities.
 */
export function analyzeDbCodeLinks(allEntities: Entity[]): DbSchemaAnalysis {
  // Separate DB entities from code entities
  const dbEntities = allEntities.filter((e) => e.metadata?.["isDbSchema"]);
  const codeEntities = allEntities.filter((e) => !e.metadata?.["isDbSchema"] && !e.metadata?.["isApiContract"]);

  const tableNames = new Set<string>();
  for (const e of dbEntities) {
    if (e.metadata?.["dbType"] === "table") {
      const name = (e.metadata["tableName"] as string) || e.name;
      tableNames.add(name.toLowerCase());
    }
  }

  const tableLinks: DbCodeLink[] = [];
  const repositories: DbCodeLink[] = [];

  for (const codeEntity of codeEntities) {
    // 1. Repository/DAO pattern: class name contains table name
    const repoLinks = detectRepositoryLinks(codeEntity, tableNames);
    repositories.push(...repoLinks);

    // 2. SQL strings in code: "SELECT * FROM users"
    const sqlLinks = detectSqlStringsInCode(codeEntity, tableNames);
    tableLinks.push(...sqlLinks);

    // 3. Migration files
    if (isMigrationFile(codeEntity.filePath)) {
      const migrationLinks = detectMigrationLinks(codeEntity, tableNames);
      tableLinks.push(...migrationLinks);
    }
  }

  return {
    tableLinks,
    ormModels: [], // ORM models are handled by orm-detector
    repositories,
    redisPatterns: [], // Redis patterns are handled by redis-detector
  };
}

// =============================================================================
// Relationship Building
// =============================================================================

/**
 * Build relationships from DbSchemaAnalysis for insertion into graph.
 */
export function buildDbRelationships(analysis: DbSchemaAnalysis): DbRelationship[] {
  const relationships: DbRelationship[] = [];

  for (const link of [...analysis.tableLinks, ...analysis.repositories]) {
    relationships.push({
      fromName: link.codeEntityName,
      toName: link.dbEntityName,
      type:
        link.linkType === "maps_to_table"
          ? RelationType.PRODUCES_API
          : link.linkType === "reads_table"
            ? RelationType.CONSUMES_API
            : RelationType.PRODUCES_API,
      fromFile: link.codeFilePath,
      toFile: link.dbFilePath,
      metadata: {
        confidence: link.confidence,
        evidence: link.evidence,
        linkType: link.linkType,
        orm: link.orm,
        context: `DB: ${link.linkType} ${link.dbEntityName}`,
      },
    });
  }

  for (const link of analysis.ormModels) {
    relationships.push({
      fromName: link.codeEntityName,
      toName: link.dbEntityName,
      type: RelationType.PRODUCES_API,
      fromFile: link.codeFilePath,
      toFile: link.dbFilePath,
      metadata: {
        confidence: link.confidence,
        evidence: link.evidence,
        linkType: "maps_to_table",
        orm: link.orm,
        context: `ORM model maps to table ${link.dbEntityName}`,
      },
    });
  }

  return relationships;
}

// =============================================================================
// Detection Patterns
// =============================================================================

function detectRepositoryLinks(entity: Entity, tableNames: Set<string>): DbCodeLink[] {
  const links: DbCodeLink[] = [];
  const name = entity.name.toLowerCase();

  // Repository/DAO class naming patterns
  const repoSuffixes = ["repository", "repo", "dao", "store", "service"];
  for (const suffix of repoSuffixes) {
    if (name.endsWith(suffix)) {
      const prefix = name.slice(0, -suffix.length);
      // Check if prefix matches a table name (singular or plural)
      for (const tableName of tableNames) {
        if (
          tableName === prefix ||
          tableName === prefix + "s" ||
          tableName === prefix + "es" ||
          tableName.replace(/_/g, "") === prefix
        ) {
          links.push({
            dbEntityName: tableName,
            codeEntityName: entity.name,
            codeFilePath: entity.filePath,
            linkType: "reads_table", // Repositories typically read and write
            confidence: 0.75,
            evidence: [`Class name "${entity.name}" matches table "${tableName}"`],
          });
        }
      }
    }
  }

  // JPA: extends JpaRepository<User, Long> / CrudRepository<User, Long>
  const superClass = (entity.metadata?.["superClass"] as string) || "";
  const jpaMatch = superClass.match(/(?:JpaRepository|CrudRepository|Repository)<(\w+)/);
  if (jpaMatch) {
    const modelName = jpaMatch[1]!;
    const tableName = findTableForModel(modelName, tableNames);
    if (tableName) {
      links.push({
        dbEntityName: tableName,
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType: "reads_table",
        confidence: 0.85,
        evidence: [`JPA repository for ${modelName} → table ${tableName}`],
        orm: "jpa",
      });
    }
  }

  return links;
}

function detectSqlStringsInCode(entity: Entity, tableNames: Set<string>): DbCodeLink[] {
  const links: DbCodeLink[] = [];
  const body = (entity.metadata?.["body"] as string) || "";

  // Match SQL strings: "SELECT ... FROM tableName"
  const sqlMatches = body.matchAll(/(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\s+["'`]?(\w+)["'`]?/gi);

  const seenTables = new Set<string>();
  for (const m of sqlMatches) {
    const table = m[1]!.toLowerCase();
    if (tableNames.has(table) && !seenTables.has(table)) {
      seenTables.add(table);
      const isWrite = /INSERT|UPDATE|DELETE/i.test(m[0]);
      links.push({
        dbEntityName: table,
        codeEntityName: entity.name,
        codeFilePath: entity.filePath,
        linkType: isWrite ? "writes_table" : "reads_table",
        confidence: 0.8,
        evidence: [`SQL string in code: "${m[0].slice(0, 60)}"`],
      });
    }
  }

  return links;
}

function detectMigrationLinks(entity: Entity, _tableNames: Set<string>): DbCodeLink[] {
  const links: DbCodeLink[] = [];
  const body = (entity.metadata?.["body"] as string) || "";

  const tableMatches = body.matchAll(
    /(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\s+(?:IF\s+\w+\s+)?["'`]?(\w+)["'`]?/gi,
  );
  for (const m of tableMatches) {
    const table = m[1]!.toLowerCase();
    links.push({
      dbEntityName: table,
      codeEntityName: entity.name,
      codeFilePath: entity.filePath,
      linkType: "writes_table",
      confidence: 0.9,
      evidence: [`Migration file modifies table: ${table}`],
    });
  }

  return links;
}

// =============================================================================
// Helpers
// =============================================================================

function isMigrationFile(filePath: string): boolean {
  return isMigrationFileDetector(filePath);
}

function findTableForModel(modelName: string, tableNames: Set<string>): string | undefined {
  const snake = modelName
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");

  // Try: exact, plural, snake_case, snake_case plural
  for (const candidate of [snake, snake + "s", modelName.toLowerCase(), modelName.toLowerCase() + "s"]) {
    if (tableNames.has(candidate)) return candidate;
  }

  return undefined;
}
