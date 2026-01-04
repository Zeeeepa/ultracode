/**
 * Merge Tool Schemas
 * Schemas for semantic merge and conflict resolution
 */

import { z } from "zod";

export const SemanticMergeSchema = z.object({
  sourceBranch: z.string().describe("Source branch name (where changes come from), e.g. 'feature/caching'"),
  targetBranch: z
    .string()
    .optional()
    .describe("Target branch name (where to merge), e.g. 'main'. Defaults to current branch."),
  dryRun: z.boolean().optional().default(true).describe("Preview only, don't apply changes (default: true)"),
  autoResolve: z.boolean().optional().default(false).describe("Auto-resolve compatible conflicts (default: false)"),
  includeAISuggestions: z
    .boolean()
    .optional()
    .default(true)
    .describe("Generate AI suggestions for conflicts (default: true)"),
});

export const AnalyzeMergeConflictsSchema = z.object({
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

export const GetMergeSuggestionsSchema = z.object({
  conflictId: z.string().describe("ID of the conflict to get suggestions for (from analyze_merge_conflicts)"),
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

export const GetSemanticMergeInfoSchema = z.object({});
