/**
 * Database Parsers — Public API
 */

export { analyzeDbCodeLinks, buildDbRelationships } from "./db-code-linker.js";
export { LinqParser } from "./linq-parser.js";
export {
  classifyMigrations,
  detectMigration,
  extractMigrationOperations,
  isMigrationFile,
} from "./migration-detector.js";
export { buildMigrationSchema, buildSchemaFromSql } from "./migration-schema-builder.js";
export { detectOrmSchemas } from "./orm-detector.js";
export { PrismaParser } from "./prisma-parser.js";
export { detectRedisPatterns } from "./redis-detector.js";
export { detectSchemaDrift } from "./schema-drift-detector.js";
export { SqlParser } from "./sql-parser.js";
export type {
  DbCodeLink,
  DbColumn,
  DbEngine,
  DbForeignKey,
  DbIndex,
  DbRelationship,
  DbSchemaAnalysis,
  EffectiveTable,
  MigrationFramework,
  MigrationInfo,
  MigrationOperation,
  MigrationSchema,
  SchemaDrift,
} from "./types.js";
