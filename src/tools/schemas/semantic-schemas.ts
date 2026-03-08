/**
 * Semantic Tool Schemas
 * Schemas for semantic search, similarity, and code analysis tools
 */

import { z } from "zod";

export const SemanticSearchSchema = z.object({
  query: z.string().describe("Natural language search query"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
  projectPath: z.string().optional().describe("Project directory path for cross-project search"),
});

export const FindSimilarCodeSchema = z.object({
  code: z.string().describe("Code snippet to find similar code for"),
  threshold: z.number().optional().default(0.5).describe("Similarity threshold (0-1)"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
});

export const AnalyzeSwaggerImpactSchema = z.object({
  swaggerFile: z.string().optional().describe("Path to swagger file (auto-detected if omitted)"),
  schemaName: z.string().optional().describe("Specific schema name to analyze"),
  endpointPath: z.string().optional().describe("Specific endpoint like 'GET /api/users'"),
  projectPath: z.string().optional().describe("Project directory path"),
});

export const AnalyzeApiImpactSchema = z.object({
  contractType: z
    .enum(["swagger", "protobuf", "graphql", "auto"])
    .optional()
    .default("auto")
    .describe("API contract type to analyze (auto-detected if omitted)"),
  specFile: z.string().optional().describe("Path to spec file (auto-detected if omitted)"),
  schemaName: z.string().optional().describe("Specific schema/message/type name to analyze"),
  endpointPath: z.string().optional().describe("Specific endpoint like 'GET /api/users' or rpc name"),
  projectPath: z.string().optional().describe("Project directory path"),
});

export const AnalyzeCodeImpactSchema = z.object({
  entityId: z.string().describe("Entity ID or name to analyze impact for"),
  filePath: z.string().optional().describe("Optional file path hint to disambiguate entity"),
  depth: z.number().optional().default(2).describe("Depth of impact analysis"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
  highlightRecentChanges: z
    .boolean()
    .optional()
    .default(false)
    .describe("Annotate impacted entities with recently-changed status (Prolly Tree)"),
  recentCommitsCount: z
    .number()
    .optional()
    .default(10)
    .describe("Number of recent commits to consider for highlighting"),
});

export const DetectCodeClonesSchema = z.object({
  minSimilarity: z.number().optional().default(0.8).describe("Minimum similarity for clones"),
  scope: z.string().optional().default("all").describe("Scope: all, file, or module"),
});

export const FindRelatedConceptsSchema = z.object({
  entityId: z.string().describe("Entity to find related concepts for"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
});

export const CrossLanguageSearchSchema = z.object({
  query: z.string().describe("Search query"),
  languages: z.array(z.string()).optional().describe("Languages to search in"),
});

export const GetDatabaseSchemaSchema = z.object({
  projectPath: z.string().optional().describe("Project directory path"),
  tableName: z.string().optional().describe("Filter by table name (partial match)"),
  dbEngine: z.string().optional().describe("Filter: postgres, mysql, clickhouse, redis, sqlite, mssql"),
  includeRelationships: z.boolean().optional().describe("Include FK and code relationships"),
});

export const PatternSearchSchema = z.object({
  pattern: z.string().describe("Regex pattern or semantic query"),
  mode: z
    .enum(["entity", "content", "semantic", "hybrid"])
    .describe("Search mode: entity (name/type), content (inside bodies), semantic (vector), hybrid (all)"),
  entityTypes: z.array(z.string()).optional().describe("Filter by entity types (function, class, interface, etc.)"),
  files: z.array(z.string()).optional().describe("Filter by file paths"),
  frameworks: z.array(z.string()).optional().describe("Filter by frameworks (React, Vue, Angular, etc.)"),
  contentContains: z.string().optional().describe("Content must contain this string"),
  contentRegex: z.string().optional().describe("Content must match this regex"),
  semanticQuery: z.string().optional().describe("Semantic similarity query for content"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
});
