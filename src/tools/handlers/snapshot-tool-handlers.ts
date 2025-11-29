/**
 * Snapshot Tool Handlers
 *
 * Handlers for snapshot management operations:
 * - create_snapshot
 * - rollback_snapshot (undo alias)
 * - list_snapshots
 * - cleanup_snapshots
 */

import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

// =============================================================================
// CREATE SNAPSHOT
// =============================================================================

const CreateSnapshotSchema = z.object({
  description: z.string().optional(),
  entityIds: z.array(z.string()).optional(),
  filePaths: z.array(z.string()).optional(),
});

export class CreateSnapshotToolHandler extends BaseToolHandler<z.infer<typeof CreateSnapshotSchema>> {
  protected parseArgs(args: unknown) {
    return CreateSnapshotSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CreateSnapshotSchema>): Promise<ToolResult> {
    const snapshotManager = this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    try {
      const snapshot = await snapshotManager.createSnapshot({
        description: args.description || `Snapshot created at ${new Date().toISOString()}`,
        entityIds: args.entityIds,
        filePaths: args.filePaths?.map((p) => this.context.normalizeInputPath(p)),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                snapshotId: snapshot.id,
                description: snapshot.description,
                createdAt: snapshot.createdAt,
                itemCount: snapshot.items?.length || 0,
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

// =============================================================================
// ROLLBACK SNAPSHOT (UNDO)
// =============================================================================

const RollbackSnapshotSchema = z.object({
  snapshotId: z.string().optional(),
  steps: z.number().optional().default(1),
});

export class RollbackSnapshotToolHandler extends BaseToolHandler<z.infer<typeof RollbackSnapshotSchema>> {
  protected parseArgs(args: unknown) {
    return RollbackSnapshotSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof RollbackSnapshotSchema>): Promise<ToolResult> {
    const snapshotManager = this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    try {
      let result: any;

      if (args.snapshotId) {
        // Rollback to specific snapshot
        result = await snapshotManager.rollback(args.snapshotId);
      } else {
        // Undo last N steps
        result = await snapshotManager.undo(args.steps);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                restoredSnapshot: result.snapshotId,
                itemsRestored: result.itemsRestored || 0,
                message: args.snapshotId ? `Rolled back to snapshot ${args.snapshotId}` : `Undid ${args.steps} step(s)`,
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

// =============================================================================
// LIST SNAPSHOTS
// =============================================================================

const ListSnapshotsSchema = z.object({
  limit: z.number().optional().default(20),
  includeDetails: z.boolean().optional().default(false),
});

export class ListSnapshotsToolHandler extends BaseToolHandler<z.infer<typeof ListSnapshotsSchema>> {
  protected parseArgs(args: unknown) {
    return ListSnapshotsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof ListSnapshotsSchema>): Promise<ToolResult> {
    const snapshotManager = this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    const snapshots = await snapshotManager.listSnapshots(args.limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              count: snapshots.length,
              snapshots: snapshots.map((s: any) => ({
                id: s.id,
                description: s.description,
                createdAt: s.createdAt,
                itemCount: s.items?.length || 0,
                ...(args.includeDetails ? { items: s.items } : {}),
              })),
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
// CLEANUP SNAPSHOTS
// =============================================================================

const CleanupSnapshotsSchema = z.object({
  keepCount: z.number().optional().default(10),
  olderThanDays: z.number().optional(),
  dryRun: z.boolean().optional().default(true),
});

export class CleanupSnapshotsToolHandler extends BaseToolHandler<z.infer<typeof CleanupSnapshotsSchema>> {
  protected parseArgs(args: unknown) {
    return CleanupSnapshotsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CleanupSnapshotsSchema>): Promise<ToolResult> {
    const snapshotManager = this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    const allSnapshots = await snapshotManager.listSnapshots(1000);

    // Filter snapshots to cleanup
    let toCleanup = [...allSnapshots];

    // Keep the most recent
    toCleanup.sort((a: any, b: any) => b.createdAt - a.createdAt);
    const toKeep = toCleanup.slice(0, args.keepCount);
    toCleanup = toCleanup.slice(args.keepCount);

    // Filter by age if specified
    if (args.olderThanDays) {
      const cutoffTime = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
      toCleanup = toCleanup.filter((s: any) => s.createdAt < cutoffTime);
    }

    if (!args.dryRun) {
      for (const snapshot of toCleanup) {
        await snapshotManager.deleteSnapshot(snapshot.id);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              dryRun: args.dryRun,
              totalSnapshots: allSnapshots.length,
              snapshotsKept: toKeep.length,
              snapshotsCleaned: toCleanup.length,
              cleanedIds: toCleanup.map((s: any) => s.id),
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}
