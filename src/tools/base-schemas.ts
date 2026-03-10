/**
 * Base Schemas for Tool Parameters
 *
 * Common schema elements used across all tools.
 * Includes project path resolution for cross-project operations.
 */

import { z } from "zod";

/**
 * Project path parameter - optional, defaults to current project
 */
export const projectPathParam = z
  .string()
  .optional()
  .describe(
    "Project directory path. If not specified, uses current project. Supports absolute paths or relative to CWD.",
  );

/**
 * Base schema with project path - extend this for tools that need project context
 */
export const BaseProjectSchema = z.object({
  projectPath: projectPathParam,
});

/**
 * Merge base project schema with tool-specific schema
 */
export function withProjectPath<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    projectPath: projectPathParam,
  });
}

/**
 * Common pagination parameters
 */
export const PaginationParams = z.object({
  offset: z.number().optional().default(0).describe("Number of results to skip"),
  limit: z.number().optional().default(100).describe("Maximum number of results to return"),
});

/**
 * Branch parameter for branch-aware operations
 */
export const branchParam = z.string().optional().describe("Git branch name. If not specified, uses current branch.");

/**
 * Recent changes highlighting parameters (Prolly Tree)
 * Spread into tool schemas that support recently-changed annotation.
 */
export const recentChangesParams = {
  highlightRecentChanges: z
    .boolean()
    .optional()
    .default(false)
    .describe("Annotate problem entities with recently-changed status (Prolly Tree)"),
  recentCommitsCount: z
    .number()
    .optional()
    .default(10)
    .describe("Number of recent commits to consider for highlighting"),
};
