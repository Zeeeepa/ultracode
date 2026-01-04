/**
 * Snapshot Tool Schemas
 * Schemas for version management and snapshot tools
 */

import { z } from "zod";

export const CreateSnapshotSchema = z.object({
  description: z.string().describe("Description of the snapshot"),
  files: z.array(z.string()).optional().describe("Files to include in snapshot (all if not specified)"),
});

export const RollbackSnapshotSchema = z.object({
  snapshotId: z.string().describe("Snapshot ID to rollback to"),
});

export const ListSnapshotsSchema = z.object({
  limit: z.number().optional().default(10).describe("Maximum number of snapshots to return"),
});

export const CleanupSnapshotsSchema = z.object({
  olderThanDays: z.number().optional().default(30).describe("Delete snapshots older than N days"),
});
