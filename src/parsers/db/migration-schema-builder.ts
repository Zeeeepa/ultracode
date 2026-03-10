/**
 * Migration Schema Builder
 *
 * Builds the "effective schema" by replaying migrations in order.
 * The result represents what the database should look like after
 * all migrations have been applied.
 *
 * Input: ordered MigrationInfo[] + entity metadata from SQL parser
 * Output: MigrationSchema with tables, columns, indexes, FKs
 */

import type { Entity } from "../../types/storage.js";
import { extractMigrationOperations } from "./migration-detector.js";
import type { DbColumn, DbForeignKey, DbIndex, MigrationInfo, MigrationOperation, MigrationSchema } from "./types.js";

// =============================================================================
// Public API
// =============================================================================

/**
 * Build effective schema from migrations and parsed DB entities.
 *
 * @param migrations Ordered list of migration info (from migration-detector)
 * @param dbEntities All entities with isDbSchema metadata (from SQL/Prisma parsers)
 */
export function buildMigrationSchema(migrations: MigrationInfo[], dbEntities: Entity[]): MigrationSchema {
  const schema: MigrationSchema = {
    tables: new Map(),
    migrations: [...migrations],
    warnings: [],
  };

  // Group DB entities by source file for quick lookup
  const entitiesByFile = new Map<string, Entity[]>();
  for (const e of dbEntities) {
    const list = entitiesByFile.get(e.filePath) || [];
    list.push(e);
    entitiesByFile.set(e.filePath, list);
  }

  // Phase 1: Apply migrations in order
  for (const migration of migrations) {
    const fileEntities = entitiesByFile.get(migration.filePath) || [];
    applyMigration(schema, migration, fileEntities);
  }

  // Phase 2: Add tables from non-migration SQL files (schema dumps, seed files)
  for (const entity of dbEntities) {
    if (entity.metadata?.["dbType"] !== "table") continue;

    // Skip if this entity came from a migration file
    const isMigrationEntity = migrations.some((m) => m.filePath === entity.filePath);
    if (isMigrationEntity) continue;

    const tableName = ((entity.metadata["tableName"] as string) || entity.name).toLowerCase();
    if (!schema.tables.has(tableName)) {
      addTableFromEntity(schema, entity, tableName);
    }
  }

  return schema;
}

/**
 * Build effective schema directly from SQL content strings.
 * Useful for testing or when entities aren't available.
 */
export function buildSchemaFromSql(sqlContents: Array<{ filePath: string; content: string }>): MigrationSchema {
  const schema: MigrationSchema = {
    tables: new Map(),
    migrations: [],
    warnings: [],
  };

  for (const { filePath, content } of sqlContents) {
    const ops = extractMigrationOperations(content);
    const migration: MigrationInfo = {
      filePath,
      framework: "raw",
      order: 0,
      label: filePath,
      direction: "up",
      affectedTables: [],
      operations: ops,
    };

    // Parse CREATE TABLE details from content
    applyRawSqlToSchema(schema, content, filePath);
    schema.migrations.push(migration);
  }

  return schema;
}

// =============================================================================
// Internal: Apply Migration
// =============================================================================

function applyMigration(schema: MigrationSchema, migration: MigrationInfo, fileEntities: Entity[]): void {
  // If we have parsed entities from the SQL parser, use their rich metadata
  const tableEntities = fileEntities.filter((e) => e.metadata?.["dbType"] === "table");

  if (tableEntities.length > 0) {
    // Use parsed entity metadata (more accurate than re-parsing)
    for (const entity of tableEntities) {
      const tableName = ((entity.metadata?.["tableName"] as string) || entity.name).toLowerCase();
      addTableFromEntity(schema, entity, tableName);
    }
  }

  // Apply operations that modify existing tables
  for (const op of migration.operations) {
    applyOperation(schema, op, migration.filePath);
  }
}

function applyOperation(schema: MigrationSchema, op: MigrationOperation, migrationFile: string): void {
  const tableName = op.tableName.toLowerCase();

  switch (op.type) {
    case "create_table": {
      if (!schema.tables.has(tableName)) {
        schema.tables.set(tableName, {
          name: tableName,
          columns: new Map(),
          indexes: [],
          foreignKeys: [],
          createdBy: migrationFile,
          lastModifiedBy: migrationFile,
        });
      }
      break;
    }

    case "drop_table": {
      if (schema.tables.has(tableName)) {
        schema.tables.delete(tableName);
      } else {
        schema.warnings.push(`DROP TABLE ${tableName}: table not found (${migrationFile})`);
      }
      break;
    }

    case "add_column": {
      const table = schema.tables.get(tableName);
      if (table) {
        const colName = ((op.details?.["column"] as string) || "").toLowerCase();
        if (colName && !table.columns.has(colName)) {
          table.columns.set(colName, {
            name: colName,
            type: (op.details?.["type"] as string) || "unknown",
          });
          table.lastModifiedBy = migrationFile;
        }
      } else {
        schema.warnings.push(`ADD COLUMN to ${tableName}: table not found (${migrationFile})`);
      }
      break;
    }

    case "drop_column": {
      const table = schema.tables.get(tableName);
      if (table) {
        const colName = ((op.details?.["column"] as string) || "").toLowerCase();
        table.columns.delete(colName);
        table.lastModifiedBy = migrationFile;
      }
      break;
    }

    case "rename_table": {
      const table = schema.tables.get(tableName);
      if (table) {
        const newName = ((op.details?.["newName"] as string) || "").toLowerCase();
        if (newName) {
          schema.tables.delete(tableName);
          table.name = newName;
          table.lastModifiedBy = migrationFile;
          schema.tables.set(newName, table);
        }
      }
      break;
    }

    case "alter_table": {
      const table = schema.tables.get(tableName);
      if (table) {
        table.lastModifiedBy = migrationFile;
      }
      break;
    }

    case "create_index": {
      const table = schema.tables.get(tableName);
      if (table) {
        const indexName = (op.details?.["indexName"] as string) || "";
        if (indexName && !table.indexes.some((i) => i.name === indexName)) {
          table.indexes.push({ name: indexName, columns: [] });
          table.lastModifiedBy = migrationFile;
        }
      }
      break;
    }

    case "drop_index": {
      // Index drops might not have table name — search all tables
      const indexName = (op.details?.["indexName"] as string) || "";
      for (const table of schema.tables.values()) {
        const idx = table.indexes.findIndex((i) => i.name === indexName);
        if (idx !== -1) {
          table.indexes.splice(idx, 1);
          table.lastModifiedBy = migrationFile;
          break;
        }
      }
      break;
    }

    case "rename_column":
    case "other":
      break;
  }
}

// =============================================================================
// Internal: Add Table from Entity
// =============================================================================

function addTableFromEntity(schema: MigrationSchema, entity: Entity, tableName: string): void {
  const existing = schema.tables.get(tableName);

  const fields = (entity.metadata?.["fields"] as DbColumn[]) || [];
  const indexes = (entity.metadata?.["indexes"] as DbIndex[]) || [];
  const foreignKeys = (entity.metadata?.["foreignKeys"] as DbForeignKey[]) || [];

  if (existing) {
    // Merge: add columns that don't exist yet
    for (const col of fields) {
      if (!existing.columns.has(col.name.toLowerCase())) {
        existing.columns.set(col.name.toLowerCase(), col);
      }
    }
    for (const idx of indexes) {
      if (!existing.indexes.some((i) => i.name === idx.name)) {
        existing.indexes.push(idx);
      }
    }
    for (const fk of foreignKeys) {
      existing.foreignKeys.push(fk);
    }
    existing.lastModifiedBy = entity.filePath;
  } else {
    const columns = new Map<string, DbColumn>();
    for (const col of fields) {
      columns.set(col.name.toLowerCase(), col);
    }

    schema.tables.set(tableName, {
      name: tableName,
      columns,
      indexes,
      foreignKeys,
      createdBy: entity.filePath,
      lastModifiedBy: entity.filePath,
    });
  }
}

// =============================================================================
// Internal: Raw SQL Schema Building
// =============================================================================

function applyRawSqlToSchema(schema: MigrationSchema, content: string, filePath: string): void {
  // Extract CREATE TABLE with columns
  const createTableRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`[\]]?\w+["'`\]]?\.)?["'`[\]]?(\w+)["'`\]]?\s*\(([^;]*?)\)\s*(?:ENGINE|;|\s*$)/gis;

  for (const m of content.matchAll(createTableRe)) {
    const tableName = (m[1] || "").toLowerCase();
    const body = m[2] || "";

    const columns = new Map<string, DbColumn>();
    const foreignKeys: DbForeignKey[] = [];

    // Parse columns from CREATE TABLE body
    for (const line of body.split(",")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip constraints
      if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|CONSTRAINT|FOREIGN\s+KEY|INDEX|KEY)\b/i.test(trimmed)) {
        // Parse FK constraint
        const fkMatch = trimmed.match(
          /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["'`[\]]?(\w+)["'`\]]?\s*\(([^)]+)\)/i,
        );
        if (fkMatch) {
          foreignKeys.push({
            columns: fkMatch[1]!.split(",").map((c) =>
              c
                .trim()
                .replace(/["'`[\]]/g, "")
                .toLowerCase(),
            ),
            refTable: fkMatch[2]!.toLowerCase(),
            refColumns: fkMatch[3]!.split(",").map((c) =>
              c
                .trim()
                .replace(/["'`[\]]/g, "")
                .toLowerCase(),
            ),
          });
        }
        continue;
      }

      // Parse column: name type [constraints]
      const colMatch = trimmed.match(/^["'`[\]]?(\w+)["'`\]]?\s+(\w+(?:\([^)]*\))?)/i);
      if (colMatch) {
        const col: DbColumn = {
          name: colMatch[1]!.toLowerCase(),
          type: colMatch[2]!.toUpperCase(),
        };

        if (/NOT\s+NULL/i.test(trimmed)) col.nullable = false;
        if (/\bNULL\b/i.test(trimmed) && !/NOT\s+NULL/i.test(trimmed)) col.nullable = true;
        if (/PRIMARY\s+KEY/i.test(trimmed)) col.primaryKey = true;
        if (/\bUNIQUE\b/i.test(trimmed)) col.unique = true;
        if (/AUTO_INCREMENT|AUTOINCREMENT|SERIAL|IDENTITY/i.test(trimmed)) col.autoIncrement = true;

        columns.set(col.name, col);
      }
    }

    if (!schema.tables.has(tableName)) {
      schema.tables.set(tableName, {
        name: tableName,
        columns,
        indexes: [],
        foreignKeys,
        createdBy: filePath,
        lastModifiedBy: filePath,
      });
    }
  }
}
