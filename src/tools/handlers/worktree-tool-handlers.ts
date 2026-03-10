/**
 * Worktree MCP Tool Handlers
 *
 * Provides tools for multi-agent worktree orchestration:
 * - spawn_agent_worktree: Create a worktree and launch an agent
 * - list_worktree_agents: List active worktree sessions for the current repo
 * - cleanup_worktree: Remove a worktree and close its agent session
 * - get_worktree_info: Get detailed worktree/submodule/subtree info
 */

import { execSync } from "node:child_process";
import { dirname, join, normalize, resolve } from "node:path";
import type { z } from "zod";
import { getSessionsForRepo } from "../../core/client-session.js";
import { log } from "../../logging/index.js";
import {
  detectSubmodules,
  detectSubtrees,
  getRepoIdentity,
  listSiblingWorktrees,
  resolveWorktreeInfo,
} from "../../shared/git-worktree.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import {
  CleanupWorktreeSchema,
  GetWorktreeInfoSchema,
  ListWorktreeAgentsSchema,
  SpawnAgentWorktreeSchema,
} from "../schemas/worktree-schemas.js";

// =============================================================================
// spawn_agent_worktree
// =============================================================================

type SpawnArgs = z.infer<typeof SpawnAgentWorktreeSchema>;

export class SpawnAgentWorktreeHandler extends BaseToolHandler<SpawnArgs> {
  protected parseArgs(args: unknown): SpawnArgs {
    return SpawnAgentWorktreeSchema.parse(args);
  }

  protected async execute(args: SpawnArgs): Promise<ToolResult> {
    const projectPath = this.context.projectPath;

    const wtPath = args.directory
      ? normalize(resolve(args.directory))
      : normalize(join(dirname(projectPath), `wt-${args.branch.replace(/\//g, "-")}`));

    const agentId = args.agentId ?? `agent-${args.branch.replace(/\//g, "-")}`;

    try {
      // Create git worktree
      const baseBranch = args.baseBranch ?? "HEAD";
      const cmd = `git worktree add "${wtPath}" -b ${args.branch} ${baseBranch}`;

      log.i("WORKTREE_TOOL", "spawning", { branch: args.branch, path: wtPath, baseBranch });

      execSync(cmd, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        timeout: 30000,
      });

      // Verify worktree was created
      const wtInfo = resolveWorktreeInfo(wtPath);
      if (!wtInfo) {
        return this.errorResult("Worktree created but failed to resolve info");
      }

      const result = {
        success: true,
        worktreePath: wtPath,
        branch: args.branch,
        agentId,
        repoIdentity: wtInfo.repoIdentity,
        note:
          "Worktree created. To connect an agent, run: ultracode.com --pipe --directory " +
          wtPath +
          " --branch " +
          args.branch +
          " --agent-id " +
          agentId,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const msg = (error as Error).message;

      // If branch already exists, try without -b
      if (msg.includes("already exists")) {
        try {
          execSync(`git worktree add "${wtPath}" ${args.branch}`, {
            cwd: projectPath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
            timeout: 30000,
          });

          const wtInfo = resolveWorktreeInfo(wtPath);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    worktreePath: wtPath,
                    branch: args.branch,
                    agentId,
                    repoIdentity: wtInfo?.repoIdentity ?? null,
                    note:
                      "Worktree created (existing branch). To connect an agent, run: ultracode.com --pipe --directory " +
                      wtPath +
                      " --branch " +
                      args.branch +
                      " --agent-id " +
                      agentId,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (innerErr) {
          return this.errorResult(`Failed to create worktree: ${(innerErr as Error).message}`);
        }
      }

      return this.errorResult(`Failed to create worktree: ${msg}`);
    }
  }

  private errorResult(message: string): ToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: message }) }],
    };
  }
}

// =============================================================================
// list_worktree_agents
// =============================================================================

type ListArgs = z.infer<typeof ListWorktreeAgentsSchema>;

export class ListWorktreeAgentsHandler extends BaseToolHandler<ListArgs> {
  protected parseArgs(args: unknown): ListArgs {
    return ListWorktreeAgentsSchema.parse(args);
  }

  protected async execute(args: ListArgs): Promise<ToolResult> {
    const projectPath = this.context.projectPath;
    const repoId = getRepoIdentity(projectPath);

    if (!repoId) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Not a git repository" }) }],
      };
    }

    // Get all worktrees from git
    const allWorktrees = listSiblingWorktrees(projectPath);

    // Get active sessions for this repo
    const activeSessions = getSessionsForRepo(repoId);
    const activePathSet = new Set(activeSessions.map((s) => normalize(s.projectPath)));

    const worktreeList = allWorktrees
      .filter((wt) => args.includeInactive || activePathSet.has(normalize(wt.path)))
      .map((wt) => {
        const session = activeSessions.find((s) => normalize(s.projectPath) === normalize(wt.path));
        return {
          path: wt.path,
          branch: wt.branch,
          isMain: wt.isMain,
          hasActiveSession: activePathSet.has(normalize(wt.path)),
          sessionId: session?.sessionId ?? null,
          agentId: session?.agentId ?? null,
        };
      });

    // If includeInactive is not set but there are no active sessions, show all worktrees
    const displayList =
      worktreeList.length > 0
        ? worktreeList
        : allWorktrees.map((wt) => ({
            path: wt.path,
            branch: wt.branch,
            isMain: wt.isMain,
            hasActiveSession: false,
            sessionId: null as string | null,
            agentId: null as string | null,
          }));

    const result = {
      repoIdentity: repoId,
      totalWorktrees: allWorktrees.length,
      activeSessions: activeSessions.length,
      worktrees: displayList,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}

// =============================================================================
// cleanup_worktree
// =============================================================================

type CleanupArgs = z.infer<typeof CleanupWorktreeSchema>;

export class CleanupWorktreeHandler extends BaseToolHandler<CleanupArgs> {
  protected parseArgs(args: unknown): CleanupArgs {
    return CleanupWorktreeSchema.parse(args);
  }

  protected async execute(args: CleanupArgs): Promise<ToolResult> {
    const projectPath = this.context.projectPath;

    try {
      // Find the worktree for this branch
      const worktrees = listSiblingWorktrees(projectPath);
      const target = worktrees.find((wt) => wt.branch === args.branch);

      if (!target) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `No worktree found for branch '${args.branch}'`,
                availableBranches: worktrees.map((wt) => wt.branch),
              }),
            },
          ],
        };
      }

      if (target.isMain) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Cannot remove the main working tree",
              }),
            },
          ],
        };
      }

      const forceFlag = args.force ? " --force" : "";
      execSync(`git worktree remove "${target.path}"${forceFlag}`, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        timeout: 15000,
      });

      log.i("WORKTREE_TOOL", "cleaned_up", { branch: args.branch, path: target.path });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                removedPath: target.path,
                branch: args.branch,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: (error as Error).message,
            }),
          },
        ],
      };
    }
  }
}

// =============================================================================
// get_worktree_info
// =============================================================================

type GetInfoArgs = z.infer<typeof GetWorktreeInfoSchema>;

export class GetWorktreeInfoHandler extends BaseToolHandler<GetInfoArgs> {
  protected parseArgs(args: unknown): GetInfoArgs {
    return GetWorktreeInfoSchema.parse(args);
  }

  protected async execute(args: GetInfoArgs): Promise<ToolResult> {
    const projectPath = args.directory ? normalize(resolve(args.directory)) : this.context.projectPath;

    const wtInfo = resolveWorktreeInfo(projectPath);

    if (!wtInfo) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              isGitRepo: false,
              path: projectPath,
            }),
          },
        ],
      };
    }

    // Gather all info
    const siblings = listSiblingWorktrees(projectPath);
    const submodules = detectSubmodules(wtInfo.mainRepoPath);
    const subtrees = detectSubtrees(wtInfo.mainRepoPath);

    // Check active sessions for siblings
    const activeSessions = getSessionsForRepo(wtInfo.repoIdentity);
    const activePathSet = new Set(activeSessions.map((s) => normalize(s.projectPath)));

    const result = {
      isGitRepo: true,
      worktree: {
        isWorktree: wtInfo.isWorktree,
        mainRepo: wtInfo.mainRepoPath,
        repoIdentity: wtInfo.repoIdentity,
        worktreeName: wtInfo.worktreeName,
        worktreePath: wtInfo.worktreePath,
        gitCommonDir: wtInfo.gitCommonDir,
      },
      siblingWorktrees: siblings.map((wt) => ({
        path: wt.path,
        branch: wt.branch,
        isMain: wt.isMain,
        hasActiveSession: activePathSet.has(normalize(wt.path)),
      })),
      submodules: submodules.map((sm) => ({
        path: sm.path,
        url: sm.url,
        branch: sm.branch,
        commitHash: sm.commitHash,
      })),
      subtrees: subtrees.map((st) => ({
        prefix: st.prefix,
        lastMergeCommit: st.lastMergeCommit,
      })),
      activeSessions: activeSessions.length,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}
