/**
 * Merge Tool Handlers
 *
 * Handlers for semantic merge operations:
 * - semantic_merge
 * - analyze_merge_conflicts
 * - resolve_conflict
 * - get_merge_suggestions
 */

import { z } from "zod";
import type { MergeAgent } from "../../agents/merge-agent.js";
import { getOrCreateAgent } from "../../core/agent-registry.js";
import { getGlobalContainer } from "../../core/di-container.js";
import { AgentType } from "../../types/agent.js";
import { toError } from "../../utils/error-handling.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// SEMANTIC MERGE
// =============================================================================

const SemanticMergeSchema = z.object({
  sourceBranch: z.string().describe("Source branch name (where changes come from)"),
  targetBranch: z.string().optional().describe("Target branch name (where to merge). Defaults to current branch."),
  dryRun: z.boolean().optional().default(true).describe("Preview only, don't apply changes"),
  autoResolve: z.boolean().optional().default(false).describe("Auto-resolve compatible conflicts"),
  includeAISuggestions: z.boolean().optional().default(true).describe("Generate AI suggestions for conflicts"),
});

export class SemanticMergeToolHandler extends BaseToolHandler<z.infer<typeof SemanticMergeSchema>> {
  protected parseArgs(args: unknown) {
    return SemanticMergeSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SemanticMergeSchema>): Promise<ToolResult> {
    try {
      const container = getGlobalContainer();
      const conductor = this.context.getConductor();

      // Get or create MergeAgent
      const mergeAgent = (await getOrCreateAgent(container, conductor, AgentType.MERGE)) as MergeAgent;

      // Determine target branch
      const targetBranch = args.targetBranch || (await this.getCurrentBranch());

      // Perform semantic merge
      const result = await mergeAgent.performSemanticMerge({
        branchA: targetBranch,
        branchB: args.sourceBranch,
        dryRun: args.dryRun,
        autoResolve: args.autoResolve,
        includeAISuggestions: args.includeAISuggestions,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: result.success,
                summary: {
                  sourceBranch: args.sourceBranch,
                  targetBranch,
                  dryRun: args.dryRun,
                  totalUnitsAnalyzed: result.stats.totalUnitsAnalyzed,
                  matchedUnits: result.stats.matchedUnits,
                  conflictsDetected: result.stats.conflictsDetected,
                  autoResolved: result.stats.autoResolved,
                  manualReviewRequired: result.stats.manualReviewRequired,
                  mergeTimeMs: result.stats.mergeTimeMs,
                },
                conflicts: result.mergeResult?.conflicts.map(
                  (
                    c: import("../../merge/models/semantic-conflict.js").SemanticConflict & {
                      aiSuggestions?: string[];
                    },
                  ) => ({
                    id: c.id,
                    type: c.type,
                    severity: c.severity,
                    description: c.description,
                    branchAUnit: {
                      name: c.branchAUnit.name,
                      filePath: c.branchAUnit.filePath,
                    },
                    branchBUnit: {
                      name: c.branchBUnit.name,
                      filePath: c.branchBUnit.filePath,
                    },
                    aiSuggestions: c.aiSuggestions,
                  }),
                ),
                actions: result.mergeResult?.mergeActions
                  .slice(0, 20)
                  .map((a: import("../../merge/models/merge-result.js").MergeAction) => ({
                    type: a.type,
                    unitId: a.unitId,
                    description: a.description,
                  })),
                error: result.error,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }

  private async getCurrentBranch(): Promise<string> {
    const { execSync } = await import("node:child_process");
    try {
      return execSync("git symbolic-ref --short HEAD", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      }).trim();
    } catch {
      return "HEAD";
    }
  }
}

// =============================================================================
// ANALYZE MERGE CONFLICTS
// =============================================================================

const AnalyzeMergeConflictsSchema = z.object({
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

export class AnalyzeMergeConflictsToolHandler extends BaseToolHandler<z.infer<typeof AnalyzeMergeConflictsSchema>> {
  protected parseArgs(args: unknown) {
    return AnalyzeMergeConflictsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof AnalyzeMergeConflictsSchema>): Promise<ToolResult> {
    try {
      const container = getGlobalContainer();
      const conductor = this.context.getConductor();

      const mergeAgent = (await getOrCreateAgent(container, conductor, AgentType.MERGE)) as MergeAgent;
      const result = await mergeAgent.analyzeConflicts(args.branchA, args.branchB);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                branchA: args.branchA,
                branchB: args.branchB,
                totalConflicts: result.stats.totalConflicts,
                bySeverity: result.stats.bySeverity,
                byType: result.stats.byType,
                conflicts: result.conflicts.map((c) => ({
                  id: c.id,
                  type: c.type,
                  severity: c.severity,
                  description: c.description,
                  branchAUnit: {
                    name: c.branchAUnit.name,
                    type: c.branchAUnit.type,
                    filePath: c.branchAUnit.filePath,
                    startLine: c.branchAUnit.startLine,
                  },
                  branchBUnit: {
                    name: c.branchBUnit.name,
                    type: c.branchBUnit.type,
                    filePath: c.branchBUnit.filePath,
                    startLine: c.branchBUnit.startLine,
                  },
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}

// =============================================================================
// GET MERGE SUGGESTIONS
// =============================================================================

const GetMergeSuggestionsSchema = z.object({
  conflictId: z.string().describe("ID of the conflict to get suggestions for"),
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

export class GetMergeSuggestionsToolHandler extends BaseToolHandler<z.infer<typeof GetMergeSuggestionsSchema>> {
  protected parseArgs(args: unknown) {
    return GetMergeSuggestionsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetMergeSuggestionsSchema>): Promise<ToolResult> {
    try {
      const container = getGlobalContainer();
      const conductor = this.context.getConductor();

      const mergeAgent = (await getOrCreateAgent(container, conductor, AgentType.MERGE)) as MergeAgent;

      // First analyze to get conflicts
      const analysis = await mergeAgent.analyzeConflicts(args.branchA, args.branchB);
      const conflict = analysis.conflicts.find((c) => c.id === args.conflictId);

      if (!conflict) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Conflict ${args.conflictId} not found`,
                availableConflicts: analysis.conflicts.map((c) => c.id),
              }),
            },
          ],
        };
      }

      // Get AI suggestions
      const suggestions = await mergeAgent.getSuggestions(conflict);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                conflictId: args.conflictId,
                conflict: {
                  type: conflict.type,
                  severity: conflict.severity,
                  description: conflict.description,
                },
                suggestions,
                suggestionsCount: suggestions.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const err = toError(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      };
    }
  }
}

// =============================================================================
// GET MERGE INFO
// =============================================================================

const GetSemanticMergeInfoSchema = z.object({});

export class GetSemanticMergeInfoToolHandler extends BaseToolHandler<z.infer<typeof GetSemanticMergeInfoSchema>> {
  protected parseArgs(args: unknown) {
    return GetSemanticMergeInfoSchema.parse(args);
  }

  protected async execute(_args: z.infer<typeof GetSemanticMergeInfoSchema>): Promise<ToolResult> {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              name: "Semantic Merge",
              version: "1.0.0",
              description: "AI-powered semantic merge for Git branches",
              capabilities: [
                "Fast Path matching (90%+ coverage via hashes)",
                "Semantic matching for moved/refactored code",
                "Intent classification (BugFix, Refactoring, FeatureAddition, APIChange)",
                "Conflict detection and severity classification",
                "AI-assisted conflict resolution suggestions",
              ],
              tools: [
                {
                  name: "semantic_merge",
                  description: "Perform semantic merge of branches using AI",
                  parameters: ["sourceBranch", "targetBranch?", "dryRun?", "autoResolve?", "includeAISuggestions?"],
                },
                {
                  name: "analyze_merge_conflicts",
                  description: "Analyze merge conflicts between two branches",
                  parameters: ["branchA", "branchB"],
                },
                {
                  name: "get_merge_suggestions",
                  description: "Get AI suggestions for resolving a specific conflict",
                  parameters: ["conflictId", "branchA", "branchB"],
                },
              ],
              metrics: {
                fastPathCoverageTarget: ">90%",
                semanticMatchingAccuracyTarget: ">80%",
                autoMergeRateTarget: ">60%",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
