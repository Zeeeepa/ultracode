/**
 * Branch Tool Handlers
 *
 * Handlers for branch management operations:
 * - list_branches
 * - switch_branch
 * - get_branch_status
 * - cleanup_branches
 * - get_changed_files
 */

import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// LIST BRANCHES
// =============================================================================

const ListBranchesSchema = z.object({
  includeStats: z.boolean().optional().default(false),
});

export class ListBranchesToolHandler extends BaseToolHandler<z.infer<typeof ListBranchesSchema>> {
  protected parseArgs(args: unknown) {
    return ListBranchesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ListBranchesSchema>): Promise<ToolResult> {
    const branchManager = this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branches = await branchManager.listBranches();
    const currentBranch = await branchManager.getCurrentBranch();

    const result: any = {
      currentBranch,
      branches: branches.map((b: any) => ({
        name: b.name,
        isCurrent: b.name === currentBranch,
        lastIndexed: b.lastIndexed,
      })),
    };

    if (args.includeStats) {
      result.stats = {
        totalBranches: branches.length,
        indexedBranches: branches.filter((b: any) => b.lastIndexed).length,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}

// =============================================================================
// SWITCH BRANCH
// =============================================================================

const SwitchBranchSchema = z.object({
  branchName: z.string(),
  createIfNotExists: z.boolean().optional().default(false),
});

export class SwitchBranchToolHandler extends BaseToolHandler<z.infer<typeof SwitchBranchSchema>> {
  protected parseArgs(args: unknown) {
    return SwitchBranchSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof SwitchBranchSchema>): Promise<ToolResult> {
    const branchManager = this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    try {
      await branchManager.switchBranch(args.branchName, args.createIfNotExists);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              currentBranch: args.branchName,
              message: `Switched to branch '${args.branchName}'`,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}

// =============================================================================
// GET BRANCH STATUS
// =============================================================================

const GetBranchStatusSchema = z.object({
  branchName: z.string().optional(),
});

export class GetBranchStatusToolHandler extends BaseToolHandler<z.infer<typeof GetBranchStatusSchema>> {
  protected parseArgs(args: unknown) {
    return GetBranchStatusSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetBranchStatusSchema>): Promise<ToolResult> {
    const branchManager = this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branchName = args.branchName || (await branchManager.getCurrentBranch());
    const status = await branchManager.getBranchStatus(branchName);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              branch: branchName,
              ...status,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// CLEANUP BRANCHES
// =============================================================================

const CleanupBranchesSchema = z.object({
  keepCount: z.number().optional().default(10),
  olderThanDays: z.number().optional(),
  dryRun: z.boolean().optional().default(true),
});

export class CleanupBranchesToolHandler extends BaseToolHandler<z.infer<typeof CleanupBranchesSchema>> {
  protected parseArgs(args: unknown) {
    return CleanupBranchesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CleanupBranchesSchema>): Promise<ToolResult> {
    const branchManager = this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branches = await branchManager.listBranches();
    const currentBranch = await branchManager.getCurrentBranch();

    // Filter branches to cleanup
    let toCleanup = branches.filter((b: any) => b.name !== currentBranch && b.name !== "main" && b.name !== "master");

    // Filter by age if specified
    if (args.olderThanDays) {
      const cutoffTime = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
      toCleanup = toCleanup.filter((b: any) => b.lastIndexed && b.lastIndexed < cutoffTime);
    }

    // Sort by last indexed (oldest first) and keep only excess
    toCleanup.sort((a: any, b: any) => (a.lastIndexed || 0) - (b.lastIndexed || 0));
    const excess = Math.max(0, branches.length - args.keepCount);
    toCleanup = toCleanup.slice(0, excess);

    if (!args.dryRun) {
      for (const branch of toCleanup) {
        await branchManager.deleteBranch(branch.name);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              dryRun: args.dryRun,
              branchesFound: branches.length,
              branchesToCleanup: toCleanup.length,
              cleanedBranches: toCleanup.map((b: any) => b.name),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// =============================================================================
// GET CHANGED FILES
// =============================================================================

const GetChangedFilesSchema = z.object({
  baseBranch: z.string().optional().default("main"),
  targetBranch: z.string().optional(),
  includeUntracked: z.boolean().optional().default(false),
});

export class GetChangedFilesToolHandler extends BaseToolHandler<z.infer<typeof GetChangedFilesSchema>> {
  protected parseArgs(args: unknown) {
    return GetChangedFilesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetChangedFilesSchema>): Promise<ToolResult> {
    const branchManager = this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const targetBranch = args.targetBranch || (await branchManager.getCurrentBranch());

    try {
      const changedFiles = await branchManager.getChangedFiles(args.baseBranch, targetBranch);

      // Categorize changes
      const added = changedFiles.filter((f: any) => f.status === "added");
      const modified = changedFiles.filter((f: any) => f.status === "modified");
      const deleted = changedFiles.filter((f: any) => f.status === "deleted");
      const renamed = changedFiles.filter((f: any) => f.status === "renamed");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                baseBranch: args.baseBranch,
                targetBranch,
                totalChanges: changedFiles.length,
                summary: {
                  added: added.length,
                  modified: modified.length,
                  deleted: deleted.length,
                  renamed: renamed.length,
                },
                files: changedFiles,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: (error as Error).message }) }],
      };
    }
  }
}
