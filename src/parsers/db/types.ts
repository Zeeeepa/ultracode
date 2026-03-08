/**
 * Database Schema Types
 *
 * Types for SQL/LINQ/Prisma parsing and ORM schema reconstruction.
 * Used by SQL parser, LINQ parser, Prisma parser, ORM detector, and DB code linker.
 */

import type { RelationType } from "../../types/storage.js";

export interface DbColumn {
  name: string;
  type: string;
  primaryKey?: boolean | undefined;
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  autoIncrement?: boolean | undefined;
  default?: string | undefined;
  comment?: string | undefined;
}

export interface DbIndex {
  name: string;
  columns: string[];
  unique?: boolean | undefined;
  type?: string | undefined; // btree, hash, gin, gist
}

export interface DbForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string | undefined;
  onUpdate?: string | undefined;
}

export interface DbCodeLink {
  dbEntityName: string;
  codeEntityName: string;
  codeFilePath: string;
  dbFilePath?: string | undefined;
  linkType: "maps_to_table" | "reads_table" | "writes_table";
  confidence: number;
  evidence: string[];
  orm?: string | undefined;
}

export interface DbSchemaAnalysis {
  tableLinks: DbCodeLink[];
  ormModels: DbCodeLink[];
  repositories: DbCodeLink[];
  redisPatterns: DbCodeLink[];
}

export interface DbRelationship {
  fromName: string;
  toName: string;
  type: RelationType;
  fromFile?: string | undefined;
  toFile?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type DbEngine = "postgres" | "mysql" | "clickhouse" | "sqlite" | "mssql" | "unknown";

// =============================================================================
// Migration Types
// =============================================================================

/** Recognized migration framework */
export type MigrationFramework =
  | "flyway"
  | "liquibase"
  | "alembic"
  | "django"
  | "efcore"
  | "typeorm"
  | "sequelize"
  | "knex"
  | "prisma"
  | "goose"
  | "dbmate"
  | "raw"
  | "unknown";

/** Info extracted from a single migration file */
export interface MigrationInfo {
  filePath: string;
  framework: MigrationFramework;
  /** Sort key: timestamp, version number, or lexicographic name */
  order: number;
  /** Human-readable version/label: "V3", "20230515120000", "0003_add_email" */
  label: string;
  /** Direction: "up" (default), "down" (rollback), "both" */
  direction: "up" | "down" | "both";
  /** Tables affected by this migration (from SQL analysis) */
  affectedTables: string[];
  /** Raw operations: CREATE TABLE, ALTER TABLE ADD COLUMN, DROP TABLE, etc. */
  operations: MigrationOperation[];
}

export interface MigrationOperation {
  type:
    | "create_table"
    | "alter_table"
    | "drop_table"
    | "create_index"
    | "drop_index"
    | "add_column"
    | "drop_column"
    | "rename_table"
    | "rename_column"
    | "other";
  tableName: string;
  details?: Record<string, unknown> | undefined;
}

/** Effective table state — built by applying migrations in order */
export interface EffectiveTable {
  name: string;
  columns: Map<string, DbColumn>;
  indexes: DbIndex[];
  foreignKeys: DbForeignKey[];
  /** Which migration created this table */
  createdBy: string;
  /** Last migration that modified this table */
  lastModifiedBy: string;
}

/** Full effective schema from migrations */
export interface MigrationSchema {
  tables: Map<string, EffectiveTable>;
  /** Ordered list of applied migrations */
  migrations: MigrationInfo[];
  /** Warnings during schema construction */
  warnings: string[];
}

/** Schema drift between ORM models and migrations */
export interface SchemaDrift {
  /** Tables in ORM but missing from migrations */
  missingMigrations: Array<{
    tableName: string;
    ormSource: string; // file:class
    orm: string;
  }>;
  /** Tables in migrations but not in ORM (orphaned tables) */
  orphanedTables: Array<{
    tableName: string;
    migrationFile: string;
  }>;
  /** Column mismatches between ORM and migrations */
  columnDrifts: Array<{
    tableName: string;
    columnName: string;
    issue: "missing_in_migration" | "missing_in_orm" | "type_mismatch" | "nullable_mismatch";
    ormValue?: string | undefined;
    migrationValue?: string | undefined;
    ormSource?: string | undefined;
    migrationSource?: string | undefined;
  }>;
  /** Overall drift score: 0 = perfect sync, 1 = major drift */
  driftScore: number;
  /** Human-readable summary */
  summary: string;
}
