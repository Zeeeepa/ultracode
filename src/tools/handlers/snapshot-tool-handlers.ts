/**
 * Snapshot Tool Handlers
 *
 * Handlers for snapshot management operations:
 * - create_snapshot
 * - undo
 * - list_snapshots
 * - cleanup_snapshots
 */

import { z } from "zod";
import { toError } from "../../utils/error-handling.js";
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
    const snapshotManager = await this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    try {
      const description = args.description || `Snapshot created at ${new Date().toISOString()}`;
      const files = args.filePaths?.map((p) => this.context.normalizeInputPath(p)).filter(Boolean) as
        | string[]
        | undefined;

      // VersionManager.createSnapshot returns snapshotId string
      const snapshotId = await snapshotManager.createSnapshot(description, files);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                snapshotId,
                description,
                createdAt: new Date().toISOString(),
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
    const snapshotManager = await this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    try {
      let targetSnapshotId = args.snapshotId;

      // If no snapshotId provided, get the Nth most recent snapshot
      if (!targetSnapshotId) {
        const snapshots = await snapshotManager.listSnapshots(args.steps);
        if (snapshots.length === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "No snapshots available to rollback" }) }],
          };
        }
        // Get the snapshot at position (steps - 1), or the oldest if not enough
        const targetIndex = Math.min(args.steps - 1, snapshots.length - 1);
        targetSnapshotId = snapshots[targetIndex].id;
      }

      // VersionManager.rollback returns void
      await snapshotManager.rollback(targetSnapshotId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                restoredSnapshot: targetSnapshotId,
                message: `Rolled back to snapshot ${targetSnapshotId}`,
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
    const snapshotManager = await this.context.getSnapshotManager();

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
                timestamp: s.timestamp,
                createdAt: new Date(s.timestamp).toISOString(),
                backend: s.backend,
                filesCount: s.filesCount,
                sizeBytes: s.sizeBytes,
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
    const snapshotManager = await this.context.getSnapshotManager();

    if (!snapshotManager) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Snapshot manager not available" }) }],
      };
    }

    const allSnapshots = await snapshotManager.listSnapshots(1000);

    // Filter snapshots to cleanup
    let toCleanup = [...allSnapshots];

    // Keep the most recent (listSnapshots already returns sorted by timestamp desc)
    toCleanup.sort((a: any, b: any) => b.timestamp - a.timestamp);
    const toKeep = toCleanup.slice(0, args.keepCount);
    toCleanup = toCleanup.slice(args.keepCount);

    // Filter by age if specified
    if (args.olderThanDays) {
      const cutoffTime = Date.now() - args.olderThanDays * 24 * 60 * 60 * 1000;
      toCleanup = toCleanup.filter((s: any) => s.timestamp < cutoffTime);
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
