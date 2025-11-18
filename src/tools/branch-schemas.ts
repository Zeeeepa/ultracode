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
    description:
      "List all indexed branches for the current repository. Shows branch names, last accessed time, database size, and metadata (entity count, last commit, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        repositoryPath: {
          type: "string",
          description: "Path to Git repository (defaults to current directory)",
        },
      },
    },
  },
  {
    name: "switch_branch",
    description:
      "Switch active branch for indexing. Changes the database context to the specified branch. Note: You may need to reindex if switching to a branch that hasn't been indexed yet.",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Name of the branch to switch to",
        },
        repositoryPath: {
          type: "string",
          description: "Path to Git repository (defaults to current directory)",
        },
      },
      required: ["branch"],
    },
  },
  {
    name: "get_branch_status",
    description:
      "Get detailed status of the current branch including last commit hash, entity count, relationship count, and database information.",
    inputSchema: {
      type: "object",
      properties: {
        repositoryPath: {
          type: "string",
          description: "Path to Git repository (defaults to current directory)",
        },
      },
    },
  },
  {
    name: "cleanup_branches",
    description:
      "Cleanup old branch databases using LRU eviction strategy. Removes least recently used branches while keeping the specified number of most recent branches.",
    inputSchema: {
      type: "object",
      properties: {
        keep: {
          type: "number",
          description: "Number of most recently used branches to keep (defaults to config value)",
        },
      },
    },
  },
  {
    name: "get_changed_files",
    description:
      "Get list of files changed between two branches. Useful for determining scope of changes before switching branches or for incremental reindexing.",
    inputSchema: {
      type: "object",
      properties: {
        fromBranch: {
          type: "string",
          description: "Source branch name",
        },
        toBranch: {
          type: "string",
          description: "Target branch name",
        },
      },
      required: ["fromBranch", "toBranch"],
    },
  },
];
