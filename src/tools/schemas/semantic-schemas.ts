/**
 * Semantic Tool Schemas
 * Schemas for semantic search, similarity, and code analysis tools
 *
 * Zig compatibility: accepts both camelCase and snake_case param names.
 * Aliases: topN/top_n → limit, entity_name → entityId, max_depth → depth
 */

import { z } from "zod";

/** Helper: resolve Zig aliases for limit/topN/top_n */
function resolveLimit(args: Record<string, unknown>): Record<string, unknown> {
  if (!args["limit"] && (args["topN"] || args["top_n"])) {
    args["limit"] = args["topN"] ?? args["top_n"];
  }
  // entity_name → entityId alias
  if (!args["entityId"] && args["entity_name"]) {
    args["entityId"] = args["entity_name"];
  }
  // max_depth → depth alias
  if (!args["depth"] && args["max_depth"]) {
    args["depth"] = args["max_depth"];
  }
  return args;
}

export const SemanticSearchSchema = z.preprocess(
  (args) => resolveLimit(args as Record<string, unknown>),
  z.object({
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().default(10).describe("Maximum results to return (alias: topN, top_n)"),
    branch: z.string().optional().describe("Branch name (null = main branch)"),
    projectPath: z.string().optional().describe("Project directory path for cross-project search"),
  }),
);

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

export const AnalyzeCodeImpactSchema = z.preprocess(
  (args) => resolveLimit(args as Record<string, unknown>),
  z.object({
    entityId: z.string().describe("Entity ID or name to analyze impact for (alias: entity_name)"),
    filePath: z.string().optional().describe("Optional file path hint to disambiguate entity"),
    depth: z.number().optional().default(2).describe("Depth of impact analysis (alias: max_depth)"),
    branch: z.string().optional().describe("Branch name (null = main branch)"),
    highlightRecentChanges: z
      .boolean()
      .optional()
      .default(false)
      .describe("Annotate impacted entities with recently-changed status"),
    recentCommitsCount: z
      .number()
      .optional()
      .default(10)
      .describe("Number of recent commits to consider for highlighting"),
  }),
);

export const DetectCodeClonesSchema = z.object({
  minSimilarity: z.number().optional().default(0.8).describe("Minimum similarity for clones"),
  scope: z.string().optional().default("all").describe("Scope: all, file, or module"),
});

export const FindRelatedConceptsSchema = z.preprocess(
  (args) => resolveLimit(args as Record<string, unknown>),
  z.object({
    entityId: z.string().describe("Entity to find related concepts for (alias: entity_name)"),
    limit: z.number().optional().default(10).describe("Maximum results to return (alias: topN)"),
  }),
);

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
