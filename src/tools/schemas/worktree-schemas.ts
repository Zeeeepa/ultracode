/**
 * Zod schemas for worktree MCP tools
 */

import { z } from "zod";

export const SpawnAgentWorktreeSchema = z.object({
  branch: z.string().describe("Branch name to create/checkout in the new worktree"),
  baseBranch: z.string().optional().describe("Base branch to create from (default: current HEAD)"),
  agentId: z.string().optional().describe("Agent identifier for coordination (default: auto-generated from branch)"),
  directory: z.string().optional().describe("Custom directory path for the worktree (default: ../wt-{branch})"),
});

export const ListWorktreeAgentsSchema = z.object({
  includeInactive: z.boolean().optional().describe("Include worktrees without active sessions (default: false)"),
});

export const CleanupWorktreeSchema = z.object({
  branch: z.string().describe("Branch name of the worktree to remove"),
  force: z.boolean().optional().describe("Force removal even if worktree has modifications (default: false)"),
});

export const GetWorktreeInfoSchema = z.object({
  directory: z.string().optional().describe("Project directory to inspect (default: current session project)"),
});
