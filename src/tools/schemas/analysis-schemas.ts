/**
 * Analysis Tool Schemas
 * Schemas for code analysis, hotspots, and clone detection tools
 */

import { z } from "zod";

export const JscpdCloneDetectionSchema = z.object({
  paths: z
    .array(z.string())
    .nonempty()
    .optional()
    .describe("Directories or files to scan. Relative paths resolve against the server root."),
  pattern: z.string().optional().describe("Glob pattern to apply within each path (default **/*)."),
  ignore: z.array(z.string()).optional().describe("Glob patterns to exclude from scanning."),
  formats: z
    .array(z.string().regex(/^[^.]+$/))
    .optional()
    .describe("File extensions to include without dots (e.g. ['ts','js'])."),
  minLines: z.number().int().min(1).optional().describe("Minimum lines per clone block."),
  maxLines: z.number().int().min(1).optional().describe("Maximum lines per clone block."),
  minTokens: z.number().int().min(1).optional().describe("Minimum tokens per clone (interpreted as lines)."),
  ignoreCase: z.boolean().optional().describe("Lowercase tokens before comparison."),
});

export const SuggestRefactoringSchema = z
  .object({
    filePath: z.string().describe("File to analyze for refactoring"),
    focusArea: z.string().optional().describe("Specific entity name to focus on"),
    entityId: z.string().optional().describe("Exact entity ID to analyze"),
    startLine: z.number().int().min(1).optional().describe("1-based start line for manual selection"),
    endLine: z.number().int().min(1).optional().describe("1-based end line (exclusive)"),
  })
  .refine(
    (v) =>
      (v.startLine == null && v.endLine == null) ||
      (v.startLine != null && v.endLine != null && v.startLine < v.endLine),
    {
      message: "startLine and endLine must both be provided and startLine < endLine",
      path: ["startLine"],
    },
  );

export const AnalyzeHotspotsSchema = z.object({
  metric: z
    .enum(["complexity", "changes", "coupling", "all"])
    .optional()
    .default("complexity")
    .describe("Metric: complexity, changes, coupling, or all"),
  limit: z.number().optional().default(10).describe("Maximum hotspots to return"),
  includeHistoricalMetrics: z
    .boolean()
    .optional()
    .default(true)
    .describe("Use Prolly Tree history for changeFrequency calculation"),
  lookbackDays: z.number().optional().default(30).describe("Number of days to look back for change frequency"),
});

export const AnalyzeStateChaosSchema = z.object({
  projectPath: z.string().optional().describe("Project directory path"),
  scope: z.enum(["file", "module", "project"]).optional().default("project").describe("Analysis scope"),
  stateIdentifiers: z
    .array(z.string())
    .optional()
    .describe("Specific state identifiers to analyze (e.g., ['token', 'userId'])"),
  autoDetect: z.boolean().optional().default(true).describe("Automatically detect state patterns"),
  format: z
    .enum(["summary", "detailed", "json"])
    .optional()
    .default("summary")
    .describe("Output format: summary (AI-friendly), detailed (human), json (raw)"),
  maxDepth: z.number().optional().default(10).describe("Maximum trace depth"),
  excludePatterns: z.array(z.string()).optional().describe("File patterns to exclude"),
});
