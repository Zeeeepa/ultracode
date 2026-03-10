/**
 * Schema Drift Detector
 *
 * Compares two sources of truth about database schema:
 *   1. ORM models (from orm-detector) — what the CODE thinks the DB looks like
 *   2. Migration schema (from migration-schema-builder) — what the DB ACTUALLY looks like
 *
 * Detects:
 *   - Tables in ORM but missing from migrations (forgot to create migration)
 *   - Tables in migrations but not in ORM (orphaned tables, or tables accessed via raw SQL)
 *   - Column mismatches: missing, extra, type differences, nullability
 *   - Produces a drift score (0 = perfect, 1 = major drift) and human-readable summary
 */

import type { Entity } from "../../types/storage.js";
import type { DbCodeLink, DbColumn, MigrationSchema, SchemaDrift } from "./types.js";

// =============================================================================
// Public API
// =============================================================================

/**
 * Detect schema drift between ORM models and migration-derived schema.
 *
 * @param ormLinks ORM model → table links from orm-detector
 * @param migrationSchema Effective schema from migration-schema-builder
 * @param allEntities All indexed entities (for extracting ORM column info)
 */
export function detectSchemaDrift(
  ormLinks: DbCodeLink[],
  migrationSchema: MigrationSchema,
  allEntities: Entity[],
): SchemaDrift {
  const drift: SchemaDrift = {
    missingMigrations: [],
    orphanedTables: [],
    columnDrifts: [],
    driftScore: 0,
    summary: "",
  };

  // Build ORM table map: tableName → { source, columns }
  const ormTables = buildOrmTableMap(ormLinks, allEntities);

  // 1. Find tables in ORM but not in migrations
  for (const [tableName, ormInfo] of ormTables) {
    if (!migrationSchema.tables.has(tableName)) {
      drift.missingMigrations.push({
        tableName,
        ormSource: `${ormInfo.filePath}:${ormInfo.className}`,
        orm: ormInfo.orm,
      });
    }
  }

  // 2. Find tables in migrations but not in ORM
  for (const [tableName, migTable] of migrationSchema.tables) {
    if (!ormTables.has(tableName)) {
      drift.orphanedTables.push({
        tableName,
        migrationFile: migTable.createdBy,
      });
    }
  }

  // 3. Compare columns for tables that exist in both
  for (const [tableName, ormInfo] of ormTables) {
    const migTable = migrationSchema.tables.get(tableName);
    if (!migTable) continue; // Already reported as missingMigrations

    // Columns in ORM but not in migration
    for (const [colName, ormCol] of ormInfo.columns) {
      const migCol = migTable.columns.get(colName);

      if (!migCol) {
        drift.columnDrifts.push({
          tableName,
          columnName: colName,
          issue: "missing_in_migration",
          ormValue: ormCol.type,
          ormSource: `${ormInfo.filePath}:${ormInfo.className}`,
        });
        continue;
      }

      // Type mismatch (fuzzy: normalize types before comparing)
      if (ormCol.type && migCol.type && !typesMatch(ormCol.type, migCol.type)) {
        drift.columnDrifts.push({
          tableName,
          columnName: colName,
          issue: "type_mismatch",
          ormValue: ormCol.type,
          migrationValue: migCol.type,
          ormSource: `${ormInfo.filePath}:${ormInfo.className}`,
          migrationSource: migTable.lastModifiedBy,
        });
      }

      // Nullable mismatch
      if (ormCol.nullable !== undefined && migCol.nullable !== undefined && ormCol.nullable !== migCol.nullable) {
        drift.columnDrifts.push({
          tableName,
          columnName: colName,
          issue: "nullable_mismatch",
          ormValue: ormCol.nullable ? "nullable" : "not null",
          migrationValue: migCol.nullable ? "nullable" : "not null",
          ormSource: `${ormInfo.filePath}:${ormInfo.className}`,
          migrationSource: migTable.lastModifiedBy,
        });
      }
    }

    // Columns in migration but not in ORM
    for (const colName of migTable.columns.keys()) {
      if (!ormInfo.columns.has(colName)) {
        drift.columnDrifts.push({
          tableName,
          columnName: colName,
          issue: "missing_in_orm",
          migrationValue: migTable.columns.get(colName)?.type,
          migrationSource: migTable.lastModifiedBy,
        });
      }
    }
  }

  // 4. Calculate drift score
  drift.driftScore = calculateDriftScore(drift, ormTables.size, migrationSchema.tables.size);

  // 5. Generate summary
  drift.summary = generateSummary(drift);

  return drift;
}

// =============================================================================
// ORM Table Map Construction
// =============================================================================

interface OrmTableInfo {
  className: string;
  filePath: string;
  orm: string;
  columns: Map<string, DbColumn>;
}

function buildOrmTableMap(ormLinks: DbCodeLink[], allEntities: Entity[]): Map<string, OrmTableInfo> {
  const map = new Map<string, OrmTableInfo>();

  for (const link of ormLinks) {
    if (link.linkType !== "maps_to_table") continue;

    const tableName = link.dbEntityName.toLowerCase();
    if (map.has(tableName)) continue; // First match wins

    // Find the ORM entity to extract column info
    const entity = allEntities.find((e) => e.name === link.codeEntityName && e.filePath === link.codeFilePath);

    const columns = new Map<string, DbColumn>();

    if (entity) {
      // Extract columns from entity fields/members/properties
      const fields = extractColumnsFromEntity(entity);
      for (const col of fields) {
        columns.set(col.name.toLowerCase(), col);
      }
    }

    map.set(tableName, {
      className: link.codeEntityName,
      filePath: link.codeFilePath,
      orm: link.orm || "unknown",
      columns,
    });
  }

  return map;
}

function extractColumnsFromEntity(entity: Entity): DbColumn[] {
  const columns: DbColumn[] = [];

  // If entity has parsed DB fields (from Prisma/SQL parser)
  const dbFields = entity.metadata?.["fields"] as DbColumn[] | undefined;
  if (dbFields) return dbFields;

  // Otherwise, try to extract from class members/properties
  const members = (entity.metadata?.["members"] as Array<{ name: string; type?: string; nullable?: boolean }>) || [];

  for (const member of members) {
    // Skip methods, constructors, non-column members
    if (!member.type) continue;

    columns.push({
      name: member.name,
      type: normalizeOrmType(member.type),
      nullable: member.nullable,
    });
  }

  return columns;
}

// =============================================================================
// Type Matching
// =============================================================================

/**
 * Fuzzy type matching: INT ≈ INTEGER ≈ Int ≈ int4
 */
function typesMatch(ormType: string, migType: string): boolean {
  const a = normalizeType(ormType);
  const b = normalizeType(migType);

  if (a === b) return true;

  // Check known equivalences
  return TYPE_EQUIVALENCES.some((group) => group.has(a) && group.has(b));
}

function normalizeType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(.*\)/, "") // Remove size: varchar(255) → varchar
    .replace(/unsigned/, "")
    .trim();
}

function normalizeOrmType(t: string): string {
  // ORM types: String → varchar, Int → integer, Boolean → boolean, etc.
  const map: Record<string, string> = {
    string: "varchar",
    number: "integer",
    int: "integer",
    float: "float",
    double: "double",
    boolean: "boolean",
    bool: "boolean",
    date: "timestamp",
    datetime: "timestamp",
    text: "text",
    json: "json",
    jsonb: "jsonb",
  };
  const lower = t.toLowerCase().replace(/[[\]?]/g, "");
  return map[lower] || lower;
}

const TYPE_EQUIVALENCES: Set<string>[] = [
  new Set([
    "int",
    "integer",
    "int4",
    "int32",
    "serial",
    "bigserial",
    "bigint",
    "int8",
    "int64",
    "smallint",
    "int2",
    "tinyint",
  ]),
  new Set(["varchar", "character varying", "text", "string", "nvarchar", "char", "nchar", "citext"]),
  new Set(["boolean", "bool", "bit", "tinyint"]),
  new Set(["float", "real", "float4", "double", "float8", "double precision", "numeric", "decimal"]),
  new Set(["timestamp", "datetime", "timestamptz", "timestamp with time zone", "timestamp without time zone", "date"]),
  new Set(["json", "jsonb"]),
  new Set(["bytea", "blob", "binary", "varbinary", "bytes"]),
  new Set(["uuid", "uniqueidentifier"]),
];

// =============================================================================
// Drift Score & Summary
// =============================================================================

function calculateDriftScore(drift: SchemaDrift, ormTableCount: number, migTableCount: number): number {
  if (ormTableCount === 0 && migTableCount === 0) return 0;

  const totalTables = Math.max(ormTableCount, migTableCount, 1);

  // Weights: missing migration is worse than orphaned table
  const missingWeight = drift.missingMigrations.length * 3;
  const orphanedWeight = drift.orphanedTables.length * 1;
  const columnWeight = drift.columnDrifts.length * 2;

  const rawScore = (missingWeight + orphanedWeight + columnWeight) / (totalTables * 5);
  return Math.min(1, Math.round(rawScore * 100) / 100);
}

function generateSummary(drift: SchemaDrift): string {
  const parts: string[] = [];

  if (drift.missingMigrations.length > 0) {
    const tables = drift.missingMigrations.map((m) => m.tableName).join(", ");
    parts.push(`${drift.missingMigrations.length} table(s) in ORM without migrations: ${tables}`);
  }

  if (drift.orphanedTables.length > 0) {
    const tables = drift.orphanedTables.map((o) => o.tableName).join(", ");
    parts.push(`${drift.orphanedTables.length} table(s) in migrations without ORM model: ${tables}`);
  }

  if (drift.columnDrifts.length > 0) {
    const byIssue = new Map<string, number>();
    for (const cd of drift.columnDrifts) {
      byIssue.set(cd.issue, (byIssue.get(cd.issue) || 0) + 1);
    }
    const issues = [...byIssue.entries()].map(([issue, count]) => `${count} ${issue}`).join(", ");
    parts.push(`Column drifts: ${issues}`);
  }

  if (parts.length === 0) {
    return "No schema drift detected. ORM models and migrations are in sync.";
  }

  const score = drift.driftScore <= 0.3 ? "minor" : drift.driftScore <= 0.6 ? "moderate" : "major";
  return `Schema drift (${score}, score=${drift.driftScore}): ${parts.join(". ")}.`;
}
