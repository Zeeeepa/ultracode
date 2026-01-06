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

import { execSync } from "node:child_process";
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
    const branchManager = await this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branches = branchManager.getActiveBranches();
    const currentBranch = branchManager.getCurrentBranch();

    const result: any = {
      currentBranch,
      branches: branches.map((b: any) => ({
        name: b.name,
        isCurrent: b.name === currentBranch,
        lastIndexed: b.metadata?.lastIndexedAt || b.lastAccessed,
      })),
    };

    if (args.includeStats) {
      result.stats = {
        totalBranches: branches.length,
        indexedBranches: branches.filter((b: any) => b.metadata?.lastIndexedAt).length,
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
    const branchManager = await this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    try {
      // Note: createIfNotExists is not supported by BranchManager - branch DB created on first index
      await branchManager.switchBranch(args.branchName);

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
    const branchManager = await this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branchName = args.branchName || branchManager.getCurrentBranch();
    const metadata = branchManager.getBranchMetadata(branchName);
    const dbPath = branchManager.getBranchDbPath(branchName);
    const hasDb = branchManager.hasBranchDatabase(branchName);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              branch: branchName,
              exists: hasDb,
              dbPath,
              metadata: metadata
                ? {
                    lastIndexedAt: metadata.lastIndexedAt,
                    entityCount: metadata.entityCount,
                    relationshipCount: metadata.relationshipCount,
                    fileCount: metadata.fileCount,
                    indexVersion: metadata.indexVersion,
                  }
                : null,
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
    const branchManager = await this.context.getBranchManager();

    if (!branchManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Branch manager not available" }) }],
      };
    }

    const branches = branchManager.getActiveBranches();
    const currentBranch = branchManager.getCurrentBranch();

    // Calculate what would be cleaned
    const toCleanup = branches
      .filter((b: any) => b.name !== currentBranch && b.name !== "main" && b.name !== "master")
      .slice(args.keepCount);

    let deletedCount = 0;
    if (!args.dryRun) {
      // Use BranchManager's cleanupOldBranches which does LRU eviction
      deletedCount = await branchManager.cleanupOldBranches(args.keepCount);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              dryRun: args.dryRun,
              branchesFound: branches.length,
              branchesToCleanup: args.dryRun ? toCleanup.length : deletedCount,
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
  baseBranch: z.string().optional(),
  targetBranch: z.string().optional(),
  includeUntracked: z.boolean().optional().default(false),
});

export class GetChangedFilesToolHandler extends BaseToolHandler<z.infer<typeof GetChangedFilesSchema>> {
  protected parseArgs(args: unknown) {
    return GetChangedFilesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetChangedFilesSchema>): Promise<ToolResult> {
    try {
      // Get current branch
      const currentBranch = execSync("git symbolic-ref --short HEAD", { encoding: "utf-8" }).trim();

      // Use current branch as target if not specified
      const targetBranch = args.targetBranch || currentBranch;

      // Detect default branch if baseBranch not specified
      let baseBranch = args.baseBranch;
      if (!baseBranch) {
        try {
          // Try to get default branch from remote
          baseBranch = execSync("git symbolic-ref refs/remotes/origin/HEAD", { encoding: "utf-8" })
            .trim()
            .replace("refs/remotes/origin/", "");
        } catch {
          // Fallback: check if main or master exists
          try {
            execSync("git rev-parse --verify main", { encoding: "utf-8" });
            baseBranch = "main";
          } catch {
            try {
              execSync("git rev-parse --verify master", { encoding: "utf-8" });
              baseBranch = "master";
            } catch {
              baseBranch = currentBranch; // Last fallback - compare with self (empty diff)
            }
          }
        }
      }

      // Get changed files using git diff
      const output = execSync(`git diff --name-status ${baseBranch}...${targetBranch}`, {
        encoding: "utf-8",
        cwd: process.cwd(),
      });

      const changedFiles = output
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const [statusCode, ...pathParts] = line.split("\t");
          const path = pathParts.join("\t");
          const statusMap: Record<string, string> = {
            A: "added",
            M: "modified",
            D: "deleted",
            R: "renamed",
          };
          const firstChar = statusCode?.[0] ?? "";
          const status = firstChar ? statusMap[firstChar] || statusCode : "unknown";
          return { path, status };
        });

      // Categorize changes
      const added = changedFiles.filter((f) => f.status === "added");
      const modified = changedFiles.filter((f) => f.status === "modified");
      const deleted = changedFiles.filter((f) => f.status === "deleted");
      const renamed = changedFiles.filter((f) => f.status === "renamed");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                baseBranch,
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
