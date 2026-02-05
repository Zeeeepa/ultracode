/**
 * History & Time Travel Schemas
 *
 * Zod schemas for Prolly Tree-based history and time travel operations:
 * - get_entity_history: History of changes for a specific entity
 * - diff_commits: Compare two graph commits
 * - checkout_commit: View graph state at a specific commit
 * - list_commits: List graph commits (version history)
 */

import { z } from "zod";
import { PaginationParams, projectPathParam } from "../base-schemas.js";

/**
 * Get entity history schema
 */
export const GetEntityHistorySchema = z.object({
  projectPath: projectPathParam,
  entityId: z.string().describe("Entity ID to get history for"),
  limit: z.number().optional().default(50).describe("Maximum number of commits to return"),
});

/**
 * Diff commits schema
 */
export const DiffCommitsSchema = z.object({
  projectPath: projectPathParam,
  commitA: z.string().describe("First commit hash (older)"),
  commitB: z.string().optional().describe("Second commit hash (newer, default: HEAD)"),
  includeEntities: z.boolean().optional().default(false).describe("Include full entity data in diff"),
});

/**
 * Checkout commit schema
 */
export const CheckoutCommitSchema = z.object({
  projectPath: projectPathParam,
  commitHash: z.string().describe("Commit hash to view"),
  entityId: z.string().optional().describe("Specific entity to retrieve"),
  query: z.string().optional().describe("Search entities in historical state"),
  ...PaginationParams.shape,
});

/**
 * List commits schema
 */
export const ListCommitsSchema = z.object({
  projectPath: projectPathParam,
  branchName: z.string().optional().describe("Branch name (default: current)"),
  limit: z.number().optional().default(100).describe("Maximum number of commits to return"),
});
