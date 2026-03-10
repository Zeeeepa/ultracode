/**
 * Migration Detector
 *
 * Detects migration files across frameworks, extracts ordering/version,
 * and marks entities with `isMigration: true` metadata.
 *
 * Supported frameworks:
 *   Flyway, Liquibase, Alembic, Django, EF Core, TypeORM, Sequelize,
 *   Knex, Prisma, Goose, dbmate, raw SQL migrations.
 */

import type { Entity } from "../../types/storage.js";
import type { MigrationInfo, MigrationOperation } from "./types.js";

// =============================================================================
// Public API
// =============================================================================

/**
 * Classify a file path as a migration (or not).
 * Returns MigrationInfo if this is a migration file, null otherwise.
 */
export function detectMigration(filePath: string, content?: string | undefined): MigrationInfo | null {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();

  // Try each framework pattern in order of specificity
  for (const detector of FRAMEWORK_DETECTORS) {
    const result = detector(normalized, filePath, content);
    if (result) return result;
  }

  return null;
}

/**
 * Check if a file path looks like a migration file (fast, no content needed).
 */
export function isMigrationFile(filePath: string): boolean {
  return detectMigration(filePath) !== null;
}

/**
 * Scan all entities and return migration info for each migration entity.
 * Also annotates entity metadata with `isMigration: true`.
 */
export function classifyMigrations(entities: Entity[]): MigrationInfo[] {
  const migrations: MigrationInfo[] = [];

  for (const entity of entities) {
    // Only check file-level entities (not individual functions inside migrations)
    if (entity.type !== "type" && entity.type !== "class" && entity.type !== "function") continue;

    const body = (entity.metadata?.["body"] as string) || "";
    const info = detectMigration(entity.filePath, body);
    if (info) {
      // Extract operations from entity metadata if available
      if (entity.metadata?.["dbType"] === "table") {
        info.affectedTables.push((entity.metadata["tableName"] as string) || entity.name);
      }
      migrations.push(info);
    }
  }

  // Sort by order
  migrations.sort((a, b) => a.order - b.order);
  return migrations;
}

/**
 * Extract migration operations from SQL content.
 * Used by the migration schema builder to understand what each migration does.
 */
export function extractMigrationOperations(content: string): MigrationOperation[] {
  const ops: MigrationOperation[] = [];
  const upper = content.toUpperCase();

  // CREATE TABLE
  const createTableRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`[\]]?(\w+)["'`\]]?\.)?["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(createTableRe)) {
    ops.push({ type: "create_table", tableName: (m[2] || m[1] || "").toLowerCase() });
  }

  // DROP TABLE
  const dropTableRe = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(dropTableRe)) {
    ops.push({ type: "drop_table", tableName: (m[1] || "").toLowerCase() });
  }

  // ALTER TABLE ADD COLUMN
  const alterAddColRe = /ALTER\s+TABLE\s+["'`[\]]?(\w+)["'`\]]?\s+ADD\s+(?:COLUMN\s+)?["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(alterAddColRe)) {
    ops.push({
      type: "add_column",
      tableName: (m[1] || "").toLowerCase(),
      details: { column: (m[2] || "").toLowerCase() },
    });
  }

  // ALTER TABLE DROP COLUMN
  const alterDropColRe = /ALTER\s+TABLE\s+["'`[\]]?(\w+)["'`\]]?\s+DROP\s+(?:COLUMN\s+)?["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(alterDropColRe)) {
    ops.push({
      type: "drop_column",
      tableName: (m[1] || "").toLowerCase(),
      details: { column: (m[2] || "").toLowerCase() },
    });
  }

  // ALTER TABLE (general — for things not caught above)
  if (ops.length === 0 && /ALTER\s+TABLE/i.test(upper)) {
    const alterRe = /ALTER\s+TABLE\s+["'`[\]]?(\w+)["'`\]]?/gi;
    for (const m of content.matchAll(alterRe)) {
      ops.push({ type: "alter_table", tableName: (m[1] || "").toLowerCase() });
    }
  }

  // RENAME TABLE
  const renameTableRe = /ALTER\s+TABLE\s+["'`[\]]?(\w+)["'`\]]?\s+RENAME\s+TO\s+["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(renameTableRe)) {
    ops.push({
      type: "rename_table",
      tableName: (m[1] || "").toLowerCase(),
      details: { newName: (m[2] || "").toLowerCase() },
    });
  }

  // CREATE INDEX
  const createIndexRe =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`[\]]?(\w+)["'`\]]?\s+ON\s+["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(createIndexRe)) {
    ops.push({
      type: "create_index",
      tableName: (m[2] || "").toLowerCase(),
      details: { indexName: (m[1] || "").toLowerCase() },
    });
  }

  // DROP INDEX
  const dropIndexRe = /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?["'`[\]]?(\w+)["'`\]]?/gi;
  for (const m of content.matchAll(dropIndexRe)) {
    ops.push({ type: "drop_index", tableName: "", details: { indexName: (m[1] || "").toLowerCase() } });
  }

  // EF Core C# patterns: migrationBuilder.CreateTable / AddColumn / DropTable
  if (/migrationBuilder\./i.test(content)) {
    const efCreateRe = /\.CreateTable\s*\(\s*name:\s*"(\w+)"/gi;
    for (const m of content.matchAll(efCreateRe)) {
      ops.push({ type: "create_table", tableName: (m[1] || "").toLowerCase() });
    }
    const efAddColRe = /\.AddColumn\s*<\w+>\s*\(\s*name:\s*"(\w+)"[^)]*table:\s*"(\w+)"/gi;
    for (const m of content.matchAll(efAddColRe)) {
      ops.push({
        type: "add_column",
        tableName: (m[2] || "").toLowerCase(),
        details: { column: (m[1] || "").toLowerCase() },
      });
    }
    const efDropTableRe = /\.DropTable\s*\(\s*name:\s*"(\w+)"/gi;
    for (const m of content.matchAll(efDropTableRe)) {
      ops.push({ type: "drop_table", tableName: (m[1] || "").toLowerCase() });
    }
    const efDropColRe = /\.DropColumn\s*\(\s*name:\s*"(\w+)"[^)]*table:\s*"(\w+)"/gi;
    for (const m of content.matchAll(efDropColRe)) {
      ops.push({
        type: "drop_column",
        tableName: (m[2] || "").toLowerCase(),
        details: { column: (m[1] || "").toLowerCase() },
      });
    }
  }

  // Django Python patterns: migrations.CreateModel, migrations.AddField
  if (/migrations\./i.test(content)) {
    const djCreateRe = /CreateModel\s*\(\s*name=["'](\w+)["']/gi;
    for (const m of content.matchAll(djCreateRe)) {
      ops.push({ type: "create_table", tableName: toSnakeCase(m[1] || "") });
    }
    const djAddFieldRe = /AddField\s*\(\s*model_name=["'](\w+)["']\s*,\s*name=["'](\w+)["']/gi;
    for (const m of content.matchAll(djAddFieldRe)) {
      ops.push({
        type: "add_column",
        tableName: toSnakeCase(m[1] || ""),
        details: { column: (m[2] || "").toLowerCase() },
      });
    }
    const djRemoveFieldRe = /RemoveField\s*\(\s*model_name=["'](\w+)["']\s*,\s*name=["'](\w+)["']/gi;
    for (const m of content.matchAll(djRemoveFieldRe)) {
      ops.push({
        type: "drop_column",
        tableName: toSnakeCase(m[1] || ""),
        details: { column: (m[2] || "").toLowerCase() },
      });
    }
    const djDeleteRe = /DeleteModel\s*\(\s*name=["'](\w+)["']/gi;
    for (const m of content.matchAll(djDeleteRe)) {
      ops.push({ type: "drop_table", tableName: toSnakeCase(m[1] || "") });
    }
    const djRenameRe = /RenameModel\s*\(\s*old_name=["'](\w+)["']\s*,\s*new_name=["'](\w+)["']/gi;
    for (const m of content.matchAll(djRenameRe)) {
      ops.push({
        type: "rename_table",
        tableName: toSnakeCase(m[1] || ""),
        details: { newName: toSnakeCase(m[2] || "") },
      });
    }
  }

  // TypeORM JS/TS patterns: queryRunner.createTable, queryRunner.addColumn
  if (/queryRunner\./i.test(content)) {
    const tormCreateRe = /\.createTable\s*\(\s*new\s+Table\s*\(\s*\{[^}]*name:\s*["'](\w+)["']/gi;
    for (const m of content.matchAll(tormCreateRe)) {
      ops.push({ type: "create_table", tableName: (m[1] || "").toLowerCase() });
    }
    const tormDropRe = /\.dropTable\s*\(\s*["'](\w+)["']/gi;
    for (const m of content.matchAll(tormDropRe)) {
      ops.push({ type: "drop_table", tableName: (m[1] || "").toLowerCase() });
    }
  }

  // Knex patterns: knex.schema.createTable('users', ...)
  if (/\.schema\./i.test(content)) {
    const knexCreateRe = /\.schema\.createTable\s*\(\s*["'](\w+)["']/gi;
    for (const m of content.matchAll(knexCreateRe)) {
      ops.push({ type: "create_table", tableName: (m[1] || "").toLowerCase() });
    }
    const knexDropRe = /\.schema\.dropTable(?:IfExists)?\s*\(\s*["'](\w+)["']/gi;
    for (const m of content.matchAll(knexDropRe)) {
      ops.push({ type: "drop_table", tableName: (m[1] || "").toLowerCase() });
    }
    const knexAlterRe = /\.schema\.(?:alterTable|table)\s*\(\s*["'](\w+)["']/gi;
    for (const m of content.matchAll(knexAlterRe)) {
      ops.push({ type: "alter_table", tableName: (m[1] || "").toLowerCase() });
    }
  }

  return ops;
}

// =============================================================================
// Framework-Specific Detectors
// =============================================================================

type FrameworkDetector = (normalized: string, original: string, content?: string | undefined) => MigrationInfo | null;

const FRAMEWORK_DETECTORS: FrameworkDetector[] = [
  detectFlyway,
  detectPrismaMigration,
  detectEfCore,
  detectAlembic,
  detectDjango,
  detectTypeOrmMigration,
  detectSequelizeMigration,
  detectKnexMigration,
  detectGoose,
  detectDbmate,
  detectGenericSqlMigration,
];

// --- Flyway: V1__description.sql, V1.1__description.sql, R__repeatable.sql ---
function detectFlyway(_normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  const match = original.match(/[/\\]([VUR])(\d+(?:\.\d+)?)__(\w+)\.sql$/i);
  if (!match) return null;

  const vType = match[1]!.toUpperCase();
  const version = Number.parseFloat(match[2]!);
  const description = match[3]!;

  return {
    filePath: original,
    framework: "flyway",
    order: vType === "R" ? Number.MAX_SAFE_INTEGER : version,
    label: `${vType}${match[2]}__${description}`,
    direction: "up", // Flyway doesn't have separate down files
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- Prisma: prisma/migrations/20230101120000_name/migration.sql ---
function detectPrismaMigration(
  normalized: string,
  original: string,
  content?: string | undefined,
): MigrationInfo | null {
  const match = normalized.match(/prisma\/migrations\/(\d{14})_(\w+)\/migration\.sql$/);
  if (!match) return null;

  return {
    filePath: original,
    framework: "prisma",
    order: Number.parseInt(match[1]!, 10),
    label: `${match[1]}_${match[2]}`,
    direction: "up",
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- EF Core: Migrations/20230101120000_Name.cs or *_Name.Designer.cs ---
function detectEfCore(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  // Skip Designer files and ModelSnapshot
  if (normalized.endsWith(".designer.cs") || normalized.includes("modelsnapshot")) return null;

  const match = normalized.match(/migrations?\/(\d{14})_(\w+)\.cs$/);
  if (!match) return null;

  // Verify it's EF by checking for Migration base class or migrationBuilder
  if (content && !(/:\s*Migration\b/.test(content) || /migrationBuilder/.test(content))) {
    return null;
  }

  return {
    filePath: original,
    framework: "efcore",
    order: Number.parseInt(match[1]!, 10),
    label: `${match[1]}_${match[2]}`,
    direction: "both", // EF Core has Up() and Down() in same file
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- Alembic: alembic/versions/abc123_description.py ---
function detectAlembic(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  const match = normalized.match(/alembic\/versions\/([a-f0-9]+)_(\w+)\.py$/);
  if (!match) return null;

  // Extract revision number from content if available
  let order = 0;
  if (content) {
    const revMatch = content.match(/revision\s*=\s*["']([^"']+)["']/);
    if (revMatch) {
      order = parseInt(revMatch[1]!, 36) || 0; // Use base36 of revision hash
    }
  }

  return {
    filePath: original,
    framework: "alembic",
    order,
    label: `${match[1]}_${match[2]}`,
    direction: "both", // Alembic has upgrade() and downgrade()
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- Django: app/migrations/0001_initial.py ---
function detectDjango(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  const match = normalized.match(/migrations\/(\d{4})_(\w+)\.py$/);
  if (!match) return null;

  // Verify it's Django by checking for migrations.Migration or dependencies
  if (content && !(content.includes("migrations.Migration") || content.includes("dependencies"))) {
    // Could be Alembic or other Python migration
    return null;
  }

  return {
    filePath: original,
    framework: "django",
    order: Number.parseInt(match[1]!, 10),
    label: `${match[1]}_${match[2]}`,
    direction: "both",
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- TypeORM: migrations/1234567890123-Name.ts or migrations/*Migration.ts ---
function detectTypeOrmMigration(
  normalized: string,
  original: string,
  content?: string | undefined,
): MigrationInfo | null {
  // Timestamp-based: 1234567890123-CreateUsers.ts
  const tsMatch = normalized.match(/migrations?\/(\d{13})-(\w+)\.[jt]sx?$/);
  if (tsMatch) {
    return {
      filePath: original,
      framework: "typeorm",
      order: Number.parseInt(tsMatch[1]!, 10),
      label: `${tsMatch[1]}-${tsMatch[2]}`,
      direction: "both",
      affectedTables: content ? extractAffectedTables(content) : [],
      operations: content ? extractMigrationOperations(content) : [],
    };
  }

  // Content-based: implements MigrationInterface or queryRunner
  if (content && normalized.includes("migration") && /MigrationInterface|queryRunner\./.test(content)) {
    const order = extractTimestampFromContent(content) || extractOrderFromPath(normalized);
    return {
      filePath: original,
      framework: "typeorm",
      order,
      label: extractNameFromPath(original),
      direction: "both",
      affectedTables: extractAffectedTables(content),
      operations: extractMigrationOperations(content),
    };
  }

  return null;
}

// --- Sequelize: migrations/20230101120000-create-users.js ---
function detectSequelizeMigration(
  normalized: string,
  original: string,
  content?: string | undefined,
): MigrationInfo | null {
  const match = normalized.match(/migrations?\/(\d{14})-([a-z0-9-]+)\.[jt]sx?$/);
  if (!match) return null;

  return {
    filePath: original,
    framework: "sequelize",
    order: Number.parseInt(match[1]!, 10),
    label: `${match[1]}-${match[2]}`,
    direction: "both", // Sequelize has up() and down()
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- Knex: migrations/20230101120000_create_users.js ---
function detectKnexMigration(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  // Knex uses exports.up / exports.down or knex.schema.*
  if (!normalized.includes("migration")) return null;

  const match = normalized.match(/migrations?\/(\d{14})_(\w+)\.[jt]sx?$/);
  if (!match) return null;

  // Verify it's Knex by checking for knex.schema or exports.up
  if (content && !/knex\.schema|exports\.up|export\s+(?:async\s+)?function\s+up/.test(content)) {
    return null;
  }

  return {
    filePath: original,
    framework: "knex",
    order: Number.parseInt(match[1]!, 10),
    label: `${match[1]}_${match[2]}`,
    direction: "both",
    affectedTables: content ? extractAffectedTables(content) : [],
    operations: content ? extractMigrationOperations(content) : [],
  };
}

// --- Goose: migrations/001_create_users.sql or 20230101_*.go ---
function detectGoose(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  if (!normalized.includes("migration") && !normalized.includes("db/")) return null;

  // SQL goose migrations have -- +goose Up / -- +goose Down markers
  if (content?.includes("+goose")) {
    const match = normalized.match(/(\d+)_(\w+)\.(sql|go)$/);
    if (match) {
      return {
        filePath: original,
        framework: "goose",
        order: Number.parseInt(match[1]!, 10),
        label: `${match[1]}_${match[2]}`,
        direction: "both",
        affectedTables: extractAffectedTables(content),
        operations: extractMigrationOperations(content),
      };
    }
  }

  return null;
}

// --- dbmate: db/migrations/20230101120000_name.sql ---
function detectDbmate(normalized: string, original: string, content?: string | undefined): MigrationInfo | null {
  if (!content) return null;

  // dbmate uses -- migrate:up / -- migrate:down markers
  if (content.includes("migrate:up") || content.includes("migrate:down")) {
    const match = normalized.match(/(\d{14})_(\w+)\.sql$/);
    if (match) {
      return {
        filePath: original,
        framework: "dbmate",
        order: Number.parseInt(match[1]!, 10),
        label: `${match[1]}_${match[2]}`,
        direction: "both",
        affectedTables: extractAffectedTables(content),
        operations: extractMigrationOperations(content),
      };
    }
  }

  return null;
}

// --- Generic SQL migration: anything in a migrations/ dir with timestamp prefix ---
function detectGenericSqlMigration(
  normalized: string,
  original: string,
  content?: string | undefined,
): MigrationInfo | null {
  // Must be in a migration-like directory
  if (
    !normalized.includes("/migrations/") &&
    !normalized.includes("/migration/") &&
    !normalized.includes("/db/migrate/") &&
    !normalized.includes("/db/sql/")
  ) {
    return null;
  }

  // Must be .sql, .ts, .js, .py, .cs, .go file
  if (!/\.(sql|[tj]sx?|py|cs|go)$/i.test(normalized)) return null;

  // Extract order from filename
  const tsMatch = normalized.match(/(\d{8,14})[_-](\w+)\.\w+$/);
  if (tsMatch) {
    return {
      filePath: original,
      framework: "raw",
      order: Number.parseInt(tsMatch[1]!, 10),
      label: `${tsMatch[1]}_${tsMatch[2]}`,
      direction: "up",
      affectedTables: content ? extractAffectedTables(content) : [],
      operations: content ? extractMigrationOperations(content) : [],
    };
  }

  // Sequential numbering: 001_name.sql, 002_name.ts, etc.
  const seqMatch = normalized.match(/(\d{1,6})[_-](\w+)\.\w+$/);
  if (seqMatch) {
    return {
      filePath: original,
      framework: "raw",
      order: Number.parseInt(seqMatch[1]!, 10),
      label: `${seqMatch[1]}_${seqMatch[2]}`,
      direction: "up",
      affectedTables: content ? extractAffectedTables(content) : [],
      operations: content ? extractMigrationOperations(content) : [],
    };
  }

  return null;
}

// =============================================================================
// Helpers
// =============================================================================

function extractAffectedTables(content: string): string[] {
  const tables = new Set<string>();

  const patterns = [
    /(?:CREATE|DROP|ALTER)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:["'`[\]]?\w+["'`\]]?\.)?["'`[\]]?(\w+)["'`\]]?/gi,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM|JOIN)\s+["'`[\]]?(\w+)["'`\]]?/gi,
    // EF Core
    /\.(?:CreateTable|DropTable)\s*\(\s*name:\s*"(\w+)"/gi,
    // Django
    /(?:CreateModel|DeleteModel)\s*\(\s*name=["'](\w+)["']/gi,
    // Knex/TypeORM
    /\.(?:createTable|dropTable|table|alterTable)\s*\(\s*["'](\w+)["']/gi,
  ];

  for (const re of patterns) {
    for (const m of content.matchAll(re)) {
      const name = (m[1] || "").toLowerCase();
      if (name && !SQL_KEYWORDS.has(name.toUpperCase())) {
        tables.add(name);
      }
    }
  }

  return [...tables];
}

const SQL_KEYWORDS = new Set([
  "SELECT",
  "WHERE",
  "ON",
  "AND",
  "OR",
  "AS",
  "SET",
  "VALUES",
  "INSERT",
  "DELETE",
  "NOT",
  "EXISTS",
  "NULL",
  "TRUE",
  "FALSE",
  "BEGIN",
  "END",
  "DECLARE",
  "IF",
  "ELSE",
  "THEN",
  "RETURN",
]);

function extractTimestampFromContent(content: string): number {
  const match = content.match(/timestamp\s*[=:]\s*(\d{13})/);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function extractOrderFromPath(normalized: string): number {
  const match = normalized.match(/(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function extractNameFromPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1] || "";
  return fileName.replace(/\.[^.]+$/, "");
}

function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
