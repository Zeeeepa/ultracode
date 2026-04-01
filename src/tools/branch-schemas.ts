/**
 * Branch Management Tool Schemas
 *
 * Zod schemas for MCP tool validation for branch-aware indexing.
 */

import { z } from "zod";

// =============================================================================
// BRANCH TOOL SCHEMAS
// =============================================================================

export const ListBranchesSchema = z.object({
  repositoryPath: z.string().optional().describe("Path to Git repository (defaults to current directory)"),
});

export const SwitchBranchSchema = z.object({
  branch: z.string().describe("Name of the branch to switch to"),
  repositoryPath: z.string().optional().describe("Path to Git repository (defaults to current directory)"),
});

export const GetBranchStatusSchema = z.object({
  repositoryPath: z.string().optional().describe("Path to Git repository (defaults to current directory)"),
});

export const CleanupBranchesSchema = z.object({
  keep: z.number().optional().describe("Number of most recently used branches to keep (defaults to config value)"),
});

export const GetChangedFilesSchema = z.object({
  fromBranch: z.string().describe("Source branch name"),
  toBranch: z.string().describe("Target branch name"),
});

// Tool definitions for MCP server
export const branchToolDefinitions = [
  {
    name: "list_branches",
    description: "List git branches. ~200tok",
    inputSchema: {
      type: "object",
      properties: {
        repositoryPath: {
          type: "string",
          description: "Repository path",
        },
      },
    },
  },
  {
    name: "switch_branch",
    description: "Switch git branch. ~100tok",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Branch name",
        },
        repositoryPath: {
          type: "string",
          description: "Repository path",
        },
      },
      required: ["branch"],
    },
  },
  {
    name: "get_branch_status",
    description: "Current branch: modified/added/deleted/untracked files. ~200tok",
    inputSchema: {
      type: "object",
      properties: {
        repositoryPath: {
          type: "string",
          description: "Repository path",
        },
      },
    },
  },
  {
    name: "cleanup_branches",
    description: "Delete merged branches. ~200tok",
    inputSchema: {
      type: "object",
      properties: {
        keep: {
          type: "number",
          description: "Branches to keep (default: config value)",
        },
      },
    },
  },
  {
    name: "get_changed_files",
    description: "Changed files vs reference commit. ~200tok",
    inputSchema: {
      type: "object",
      properties: {
        fromBranch: {
          type: "string",
          description: "Source branch",
        },
        toBranch: {
          type: "string",
          description: "Target branch",
        },
      },
      required: ["fromBranch", "toBranch"],
    },
  },
];
