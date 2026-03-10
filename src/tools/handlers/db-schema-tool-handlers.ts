/**
 * Database Schema Tool Handler
 *
 * get_database_schema: Shows database schema reconstructed from SQL files,
 * Prisma schemas, ORM models, and Redis patterns.
 */

import type { Entity } from "../../types/storage.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import { GetDatabaseSchemaSchema } from "../schemas/semantic-schemas.js";

interface DbSchemaArgs {
  projectPath?: string | undefined;
  tableName?: string | undefined;
  dbEngine?: string | undefined;
  includeRelationships?: boolean | undefined;
}

export class GetDatabaseSchemaToolHandler extends BaseToolHandler<DbSchemaArgs> {
  protected parseArgs(args: unknown): DbSchemaArgs {
    return GetDatabaseSchemaSchema.parse(args);
  }

  protected async execute(args: DbSchemaArgs): Promise<ToolResult> {
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    const allEntities = await storage.getAllEntities();

    // Filter DB entities
    let dbEntities = allEntities.filter((e) => e.metadata?.["isDbSchema"]);

    if (args.tableName) {
      const filter = args.tableName.toLowerCase();
      dbEntities = dbEntities.filter((e) => {
        const name = ((e.metadata?.["tableName"] as string) || e.name).toLowerCase();
        return name.includes(filter);
      });
    }

    if (args.dbEngine) {
      const engine = args.dbEngine.toLowerCase();
      dbEntities = dbEntities.filter((e) => {
        const entityEngine = (e.metadata?.["dbEngine"] as string) || "";
        return entityEngine.toLowerCase() === engine;
      });
    }

    if (dbEntities.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message:
                "No database schema entities found. Index a project with .sql, .prisma files, or ORM models first.",
              tables: [],
            }),
          },
        ],
      };
    }

    // Group by type
    const tables = dbEntities.filter((e) => e.metadata?.["dbType"] === "table");
    const views = dbEntities.filter((e) => e.metadata?.["dbType"] === "view");
    const procedures = dbEntities.filter(
      (e) => e.metadata?.["dbType"] === "procedure" || e.metadata?.["dbType"] === "function",
    );
    const triggers = dbEntities.filter((e) => e.metadata?.["dbType"] === "trigger");
    const indexes = dbEntities.filter((e) => e.metadata?.["dbType"] === "index");
    const enums = dbEntities.filter((e) => e.metadata?.["dbType"] === "enum");
    const redisKeys = dbEntities.filter((e) => e.metadata?.["dbType"] === "redis_key");
    const linqQueries = dbEntities.filter(
      (e) => e.metadata?.["dbType"] === "linq_query" || e.metadata?.["dbType"] === "linq_expression",
    );

    // Fetch relationships if requested
    let relSummary: Array<{ from: string; to: string; type: string }> = [];
    if (args.includeRelationships) {
      const allRels = await storage.getAllRelationships();
      const dbEntityIds = new Set(dbEntities.map((e) => e.id));
      const entityMap = new Map(allEntities.map((e) => [e.id, e.name]));
      relSummary = allRels
        .filter((r) => dbEntityIds.has(r.fromId) || dbEntityIds.has(r.toId))
        .slice(0, 100)
        .map((r) => ({
          from: entityMap.get(r.fromId) || r.fromId,
          to: entityMap.get(r.toId) || r.toId,
          type: r.type,
        }));
    }

    // Identify migration entities
    const migrationEntities = allEntities.filter((e) => e.metadata?.["isMigration"]);
    const migrations = migrationEntities.map((e) => ({
      file: e.filePath,
      framework: e.metadata?.["migrationFramework"],
      label: e.metadata?.["migrationLabel"],
      order: e.metadata?.["migrationOrder"],
    }));

    // Run schema drift detection if we have both ORM models and migrations
    let driftInfo: Record<string, unknown> | undefined;
    if (migrationEntities.length > 0) {
      try {
        const { classifyMigrations } = await import("../../parsers/db/migration-detector.js");
        const { buildMigrationSchema } = await import("../../parsers/db/migration-schema-builder.js");
        const { detectSchemaDrift } = await import("../../parsers/db/schema-drift-detector.js");
        const { detectOrmSchemas } = await import("../../parsers/db/orm-detector.js");

        const ormLinks = detectOrmSchemas(allEntities);
        const migInfos = classifyMigrations(allEntities);
        const migSchema = buildMigrationSchema(migInfos, dbEntities);
        const drift = detectSchemaDrift(ormLinks, migSchema, allEntities);

        if (drift.driftScore > 0 || drift.missingMigrations.length > 0 || drift.orphanedTables.length > 0) {
          driftInfo = {
            driftScore: drift.driftScore,
            summary: drift.summary,
            missingMigrations: drift.missingMigrations,
            orphanedTables: drift.orphanedTables,
            columnDrifts: drift.columnDrifts.slice(0, 20),
          };
        }
      } catch {
        // Drift detection is best-effort
      }
    }

    // Build response
    const result = {
      success: true,
      summary: {
        tables: tables.length,
        views: views.length,
        procedures: procedures.length,
        triggers: triggers.length,
        indexes: indexes.length,
        enums: enums.length,
        redisKeys: redisKeys.length,
        linqQueries: linqQueries.length,
        migrations: migrations.length,
      },
      tables: tables.map((e) => formatTable(e)),
      views: views.map((e) => formatView(e)),
      procedures: procedures.map((e) => formatProcedure(e)),
      triggers: triggers.map((e) => formatTrigger(e)),
      indexes: indexes.map((e) => formatIndex(e)),
      enums: enums.map((e) => formatEnum(e)),
      ...(redisKeys.length > 0 ? { redisKeys: redisKeys.map((e) => formatRedisKey(e)) } : {}),
      ...(linqQueries.length > 0 ? { linqQueries: linqQueries.map((e) => formatLinqQuery(e)) } : {}),
      ...(migrations.length > 0 ? { migrations } : {}),
      ...(driftInfo ? { schemaDrift: driftInfo } : {}),
      ...(relSummary.length > 0 ? { relationships: relSummary } : {}),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}

// =============================================================================
// Formatters
// =============================================================================

function formatTable(e: Entity) {
  const meta = e.metadata || {};
  return {
    name: (meta["tableName"] as string) || e.name,
    schema: meta["schema"],
    engine: meta["dbEngine"],
    file: e.filePath,
    columns: meta["fields"] || [],
    indexes: meta["indexes"] || [],
    foreignKeys: meta["foreignKeys"] || [],
    ...(meta["engine"] ? { storageEngine: meta["engine"] } : {}),
    ...(meta["orderBy"] ? { orderBy: meta["orderBy"] } : {}),
    ...(meta["partitionBy"] ? { partitionBy: meta["partitionBy"] } : {}),
  };
}

function formatView(e: Entity) {
  return {
    name: e.name,
    file: e.filePath,
    sourceTables: e.metadata?.["sourceTables"] || [],
    isMaterialized: e.metadata?.["isMaterialized"] || false,
  };
}

function formatProcedure(e: Entity) {
  return {
    name: e.name,
    type: e.metadata?.["dbType"],
    file: e.filePath,
    signature: e.metadata?.["signature"],
    parameters: e.metadata?.["parameters"] || [],
    returnType: e.metadata?.["returnType"],
    referencedTables: e.metadata?.["referencedTables"] || [],
  };
}

function formatTrigger(e: Entity) {
  return {
    name: e.name,
    file: e.filePath,
    tableName: e.metadata?.["tableName"],
    timing: e.metadata?.["timing"],
    event: e.metadata?.["event"],
    executesFunction: e.metadata?.["executesFunction"],
  };
}

function formatIndex(e: Entity) {
  return {
    name: e.name,
    file: e.filePath,
    tableName: e.metadata?.["tableName"],
    columns: e.metadata?.["columns"] || [],
    unique: e.metadata?.["unique"] || false,
    indexType: e.metadata?.["indexType"],
  };
}

function formatEnum(e: Entity) {
  return {
    name: e.name,
    file: e.filePath,
    values: e.metadata?.["values"] || [],
  };
}

function formatRedisKey(e: Entity) {
  return {
    name: e.name,
    keyPattern: e.metadata?.["keyPattern"],
    dataStructure: e.metadata?.["dataStructure"],
    operations: e.metadata?.["operations"] || [],
    ttl: e.metadata?.["ttl"],
  };
}

function formatLinqQuery(e: Entity) {
  return {
    name: e.name,
    file: e.filePath,
    queryKind: e.metadata?.["queryKind"],
    referencedTables: e.metadata?.["referencedTables"] || [],
    queryType: e.metadata?.["queryType"],
  };
}
