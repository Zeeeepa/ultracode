/**
 * LibSQL Batch Operations for High-Performance Data Processing
 *
 * Async batch processing using libsql adapter.
 * Replaces synchronous better-sqlite3 BatchOperations.
 */

import { log } from "../logging/index.js";
import { getCurrentGitBranchOrDefault, getProjectHash } from "../shared/storage-paths.js";
import { type BatchResult, type Entity, type Relationship, RelationType } from "../types/storage.js";
import { hashText64, initHasher } from "../utils/fast-hash.js";
import type { GraphAdapter, ProjectContext } from "./graph-adapter.js";

// =============================================================================
// CONSTANTS
// =============================================================================
const DEFAULT_BATCH_SIZE = 1000; // Increased from 500 to reduce DB round-trips
const MAX_BATCH_SIZE = 2000;
const ID_LENGTH = 12;

// Helper: yield to event loop between batches (non-blocking)
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// =============================================================================
// LIBSQL BATCH OPERATIONS CLASS
// =============================================================================

export class BatchOperationsLibSQL {
  private batchSize: number;
  private adapter: GraphAdapter;
  private currentContext: ProjectContext = {
    projectHash: "_unset_",
    branchName: "_unset_",
  };

  constructor(adapter: GraphAdapter, batchSize = DEFAULT_BATCH_SIZE) {
    this.adapter = adapter;
    this.batchSize = Math.min(batchSize, MAX_BATCH_SIZE);
  }

  setProjectContext(context: ProjectContext): void {
    log.i("BATCHOPS", "context_set", { ctx: `${context.projectHash}/${context.branchName}` });
    this.currentContext = context;
    this.adapter.setProjectContext(context);
  }

  setProject(projectPath: string, branchName?: string | null): void {
    // Resolve branch: use provided, or detect from git with fallback to "main"
    const resolvedBranch = branchName ?? getCurrentGitBranchOrDefault(projectPath);
    this.setProjectContext({
      projectHash: getProjectHash(projectPath),
      branchName: resolvedBranch,
    });
  }

  async initialize(): Promise<void> {
    await initHasher();
  }

  destroy(): void {
    // Nothing to clean up for libsql
  }

  // ---------------------------------------------------------------------------
  // Helpers: stable keys/ids
  // ---------------------------------------------------------------------------

  private entityKey(e: Entity): string {
    const isGlobal = e.type === "package" || e.type === "import";
    return isGlobal
      ? `${e.type}|${e.name}`
      : `${e.filePath}|${e.type}|${e.name}|${e.location?.start?.index ?? -1}-${e.location?.end?.index ?? -1}`;
  }

  private stableEntityId(e: Entity): string {
    const key = this.entityKey(e);
    return hashText64(key).slice(0, ID_LENGTH);
  }

  private relationshipKey(r: { fromId: string; toId: string; type: RelationType }): string {
    return `${r.fromId}|${r.toId}|${r.type}`;
  }

  private stableRelationshipId(r: { fromId: string; toId: string; type: RelationType }): string {
    const key = this.relationshipKey(r);
    return hashText64(key).slice(0, ID_LENGTH);
  }

  /**
   * Generate reverse relationships for bidirectional graph traversal.
   * For each CALLS relationship A→B, creates a CALLED_BY relationship B→A.
   * This enables trace_backwards to find callers efficiently.
   */
  private generateReverseRelationships(relationships: Relationship[]): Relationship[] {
    const reverseMap: Record<RelationType, RelationType | null> = {
      [RelationType.CALLS]: RelationType.CALLED_BY,
      [RelationType.IMPORTS]: RelationType.IMPORTED_BY,
      [RelationType.REFERENCES]: RelationType.REFERENCED_BY,
      [RelationType.EXTENDS]: RelationType.EXTENDED_BY,
      [RelationType.IMPLEMENTS]: RelationType.IMPLEMENTED_BY,
      // No reverse for these (already bidirectional or self-referential)
      [RelationType.CALLED_BY]: null,
      [RelationType.IMPORTED_BY]: null,
      [RelationType.REFERENCED_BY]: null,
      [RelationType.EXTENDED_BY]: null,
      [RelationType.IMPLEMENTED_BY]: null,
      [RelationType.EXPORTS]: null,
      [RelationType.CONTAINS]: null,
      [RelationType.DEPENDS_ON]: null,
      [RelationType.MEMBER_OF]: null,
      [RelationType.DOCUMENTS]: null,
      // NgRx relationships - no auto-reverse for now
      [RelationType.DISPATCHES_ACTION]: null,
      [RelationType.LISTENS_TO_ACTION]: null,
      [RelationType.HANDLES_ACTION]: null,
      [RelationType.SELECTS_STATE]: null,
      [RelationType.MODIFIES_STATE]: null,
      [RelationType.PRODUCES_API]: null,
      [RelationType.CONSUMES_API]: null,
      [RelationType.GENERATED_FROM]: null,
      [RelationType.READS_TABLE]: null,
      [RelationType.WRITES_TABLE]: null,
      [RelationType.MAPS_TO_TABLE]: null,
    };

    const reverse: Relationship[] = [];
    for (const r of relationships) {
      const reverseType = reverseMap[r.type];
      if (reverseType) {
        reverse.push({
          id: "", // Will be assigned stable ID later
          fromId: r.toId,
          toId: r.fromId,
          type: reverseType,
          metadata: { ...r.metadata, isReverse: true, originalType: r.type },
        });
      }
    }
    return reverse;
  }

  // ---------------------------------------------------------------------------
  // Entity Operations
  // ---------------------------------------------------------------------------

  async insertEntities(
    entities: Entity[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    const { projectHash, branchName } = this.currentContext;
    log.i("BATCHOPS", "insert_entities", { ctx: `${projectHash}/${branchName}`, count: entities.length });

    // Deduplicate
    const seen = new Set<string>();
    const uniq: Entity[] = [];
    for (const e of entities) {
      const key = this.entityKey(e);
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(e);
      }
    }

    // Process in batches with event loop yields (non-blocking)
    const batchCount = Math.ceil(uniq.length / this.batchSize);
    for (let i = 0; i < uniq.length; i += this.batchSize) {
      const batch = uniq.slice(i, Math.min(i + this.batchSize, uniq.length));
      const batchNum = Math.floor(i / this.batchSize);

      try {
        // Prepare entities with stable IDs (skip if already computed)
        const entitiesWithIds = batch.map((entity) => {
          const now = Date.now();
          return {
            ...entity,
            id: entity.id || this.stableEntityId(entity),
            createdAt: entity.createdAt || now,
            updatedAt: entity.updatedAt || now,
          };
        });

        // Use adapter's batch insert
        const result = await this.adapter.insertEntities(entitiesWithIds);
        totalProcessed += result.processed;

        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }

        if (onProgress) {
          onProgress(totalProcessed, uniq.length);
        }

        // OPTIMIZATION: Yield to event loop every batch to allow callbacks to process
        if (batchNum < batchCount - 1) {
          await yieldToEventLoop();
        }
      } catch (error) {
        log.e("BATCHOPS", "batch_error", { err: String(error) });
        for (const entity of batch) {
          errors.push({
            item: entity,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      processed: totalProcessed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  async updateEntities(
    updates: Entity[] | Array<{ id: string; changes: Partial<Entity> }>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    // Convert { id, changes } format to Entity format if needed
    const entities: Entity[] = updates.map((item) => {
      if ("changes" in item && item.id) {
        // Old format: { id, changes }
        return {
          id: item.id,
          ...item.changes,
          updatedAt: Date.now(),
        } as Entity;
      }
      // New format: Entity directly
      return item as Entity;
    });

    // For updates, we just re-insert (UPSERT in adapter)
    return this.insertEntities(entities, onProgress);
  }

  async deleteEntities(
    entitiesOrIds: Entity[] | string[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    // Normalize to array of IDs
    const ids: string[] = entitiesOrIds.map((item) => {
      if (typeof item === "string") return item;
      return item.id || this.stableEntityId(item);
    });

    for (let i = 0; i < ids.length; i += this.batchSize) {
      const batch = ids.slice(i, Math.min(i + this.batchSize, ids.length));

      try {
        // Use batch delete (single _w() call + chunked IN-clause) instead of per-ID
        await this.adapter.deleteEntitiesBatch(batch);
        totalProcessed += batch.length;

        if (onProgress) {
          onProgress(totalProcessed, ids.length);
        }
      } catch (error) {
        for (const id of batch) {
          errors.push({
            item: id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      processed: totalProcessed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Relationship Operations
  // ---------------------------------------------------------------------------

  async insertRelationships(
    relationships: Relationship[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    const { projectHash, branchName } = this.currentContext;

    // Generate reverse relationships for bidirectional graph traversal
    const reverseRels = this.generateReverseRelationships(relationships);
    const allRelationships = [...relationships, ...reverseRels];

    log.i("BATCHOPS", "insert_relationships", {
      ctx: `${projectHash}/${branchName}`,
      original: relationships.length,
      reverse: reverseRels.length,
      total: allRelationships.length,
    });

    // Deduplicate
    const seen = new Set<string>();
    const uniq: Relationship[] = [];
    for (const r of allRelationships) {
      const key = this.relationshipKey(r);
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(r);
      }
    }

    // Process in batches with event loop yields (non-blocking)
    const batchCount = Math.ceil(uniq.length / this.batchSize);
    for (let i = 0; i < uniq.length; i += this.batchSize) {
      const batch = uniq.slice(i, Math.min(i + this.batchSize, uniq.length));
      const batchNum = Math.floor(i / this.batchSize);

      try {
        // Prepare relationships with stable IDs
        const relsWithIds = batch.map((rel) => {
          const now = Date.now();
          return {
            ...rel,
            id: this.stableRelationshipId(rel),
            createdAt: rel.createdAt || now,
          };
        });

        // Use adapter's batch insert
        const result = await this.adapter.insertRelationships(relsWithIds);
        totalProcessed += result.processed;

        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }

        if (onProgress) {
          onProgress(totalProcessed, uniq.length);
        }

        // OPTIMIZATION: Yield to event loop every batch to allow callbacks to process
        // This prevents blocking vectors.written and other IPC callbacks
        if (batchNum < batchCount - 1) {
          await yieldToEventLoop();
        }
      } catch (error) {
        log.e("BATCHOPS", "rel_batch_error", { err: String(error) });
        for (const rel of batch) {
          errors.push({
            item: rel,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return {
      processed: totalProcessed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  optimizeBatchSize(avgProcessingTime: number): void {
    // Adaptive batch sizing based on processing time
    if (avgProcessingTime < 50) {
      this.batchSize = Math.min(this.batchSize * 1.2, MAX_BATCH_SIZE);
    } else if (avgProcessingTime > 200) {
      this.batchSize = Math.max(this.batchSize * 0.8, 100);
    }
    this.batchSize = Math.floor(this.batchSize);
  }

  getBatchSize(): number {
    return this.batchSize;
  }
}
