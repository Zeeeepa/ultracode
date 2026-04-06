/**
 * History Tool Handlers
 *
 * Handlers for Prolly Tree-based history and time travel operations:
 * - get_entity_history: History of changes for a specific entity
 * - diff_commits: Compare two graph commits
 * - checkout_commit: View graph state at a specific commit
 * - list_commits: List graph commits (version history)
 */

import type { z } from "zod";
import { log } from "../../logging/index.js";
import type { GraphStorageLibSQL } from "../../storage/graph-storage-libsql.js";
import { deserializeEntity, TimeTravelManager } from "../../storage/prolly/index.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";
import {
  CheckoutCommitSchema,
  DiffCommitsSchema,
  GetEntityHistorySchema,
  ListCommitsSchema,
} from "../schemas/history-schemas.js";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
}

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Shared setup: acquire storage → adapter → Prolly components → TimeTravelManager.
 * Eliminates 15-line setup duplication across 4 handlers.
 */
async function withTimeTravel<T>(
  handler: BaseToolHandler<unknown>,
  projectPath: string | undefined,
  operation: (
    timeTravel: TimeTravelManager,
    commitManager: ReturnType<NonNullable<ReturnType<GraphStorageLibSQL["getLibSQLAdapter"]>>["getCommitManager"]>,
  ) => Promise<T>,
  operationName: string,
): Promise<ToolResult> {
  const storage = (await (handler as any).ensureGraphStorageForProject(projectPath)) as GraphStorageLibSQL;
  const adapter = storage.getLibSQLAdapter?.();

  if (!adapter?.getProllyNodeStore || !adapter?.getCommitManager) {
    return errorResult("Prolly Tree not available - ensure project is indexed");
  }

  const nodeStore = adapter.getProllyNodeStore();
  const commitManager = adapter.getCommitManager();

  if (!nodeStore || !commitManager) {
    return errorResult("Prolly Tree components not initialized");
  }

  const timeTravel = new TimeTravelManager(nodeStore, commitManager);

  try {
    const result = await operation(timeTravel, commitManager);
    return jsonResult(result);
  } catch (error) {
    log.e("HISTORY", `${operationName}_failed`, { error: (error as Error).message });
    return errorResult(`Failed to ${operationName.replace(/_/g, " ")}: ${(error as Error).message}`);
  }
}

// =============================================================================
// GET ENTITY HISTORY HANDLER
// =============================================================================

export class GetEntityHistoryToolHandler extends BaseToolHandler<z.infer<typeof GetEntityHistorySchema>> {
  protected parseArgs(args: unknown) {
    return GetEntityHistorySchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GetEntityHistorySchema>): Promise<ToolResult> {
    return withTimeTravel(
      this,
      args.projectPath,
      async (timeTravel) => {
        const history = await timeTravel.getEntityHistory(args.entityId, args.limit);
        return {
          entityId: args.entityId,
          changes: history.map((h) => ({
            commitHash: h.commitHash,
            changeType: h.changeType,
            timestamp: new Date(h.timestamp).toISOString(),
            entitySnapshot: h.newValue ? deserializeEntity(h.newValue) : null,
          })),
          totalChanges: history.length,
        };
      },
      "get_entity_history",
    );
  }
}

// =============================================================================
// DIFF COMMITS HANDLER
// =============================================================================

export class DiffCommitsToolHandler extends BaseToolHandler<z.infer<typeof DiffCommitsSchema>> {
  protected parseArgs(args: unknown) {
    return DiffCommitsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof DiffCommitsSchema>): Promise<ToolResult> {
    return withTimeTravel(
      this,
      args.projectPath,
      async (timeTravel, commitManager) => {
        let commitB = args.commitB;
        if (!commitB) {
          const head = await commitManager!.getBranchHead();
          if (!head) throw new Error("No commits found - index the project first");
          commitB = head.commitHash;
        }

        const diff = await timeTravel.diffCommits(args.commitA, commitB);
        if (!diff) throw new Error("one or both commits not found");

        const result: Record<string, unknown> = {
          commitA: args.commitA,
          commitB,
          summary: {
            added: diff.treeDiff.added.length,
            modified: diff.treeDiff.modified.length,
            deleted: diff.treeDiff.deleted.length,
          },
        };

        if (args.includeEntities) {
          result["added"] = diff.treeDiff.added.map((e) => ({ key: e.key }));
          result["modified"] = diff.treeDiff.modified.map((e) => ({ key: e.key }));
          result["deleted"] = diff.treeDiff.deleted.map((e) => ({ key: e.key }));
        }

        return result;
      },
      "diff_commits",
    );
  }
}

// =============================================================================
// CHECKOUT COMMIT HANDLER
// =============================================================================

export class CheckoutCommitToolHandler extends BaseToolHandler<z.infer<typeof CheckoutCommitSchema>> {
  protected parseArgs(args: unknown) {
    return CheckoutCommitSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CheckoutCommitSchema>): Promise<ToolResult> {
    return withTimeTravel(
      this,
      args.projectPath,
      async (timeTravel, commitManager) => {
        const commit = await commitManager!.getCommit(args.commitHash);
        if (!commit) throw new Error(`Commit not found: ${args.commitHash}`);

        const result: Record<string, unknown> = {
          commit: {
            hash: commit.commitHash,
            message: commit.message,
            entityCount: 0,
            relationshipCount: 0,
            createdAt: new Date(commit.createdAt).toISOString(),
            parentHash: commit.parentHash,
          },
        };

        if (args.entityId) {
          result["entity"] = await timeTravel.getEntityAt(args.entityId, args.commitHash);
        }

        if (args.query) {
          const entities = await timeTravel.searchEntitiesAt(args.commitHash, args.query, args.limit);
          result["entities"] = entities.slice(args.offset, args.offset + args.limit);
          result["totalMatches"] = entities.length;
        }

        return result;
      },
      "checkout_commit",
    );
  }
}

// =============================================================================
// LIST COMMITS HANDLER
// =============================================================================

export class ListCommitsToolHandler extends BaseToolHandler<z.infer<typeof ListCommitsSchema>> {
  protected parseArgs(args: unknown) {
    return ListCommitsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ListCommitsSchema>): Promise<ToolResult> {
    return withTimeTravel(
      this,
      args.projectPath,
      async (_timeTravel, commitManager) => {
        const history = await commitManager!.getHistory(args.limit);
        return {
          commits: history.map((c) => ({
            hash: c.commitHash,
            message: c.message,
            entityCount: 0,
            relationshipCount: 0,
            createdAt: new Date(c.createdAt).toISOString(),
            parentHash: c.parentHash?.slice(0, 8) || null,
          })),
          total: history.length,
        };
      },
      "list_commits",
    );
  }
}
