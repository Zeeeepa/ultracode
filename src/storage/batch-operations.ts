/**
 * TASK-001: Batch Operations for High-Performance Data Processing
 *
 * Optimized batch processing for entities and relationships.
 * Designed for efficient bulk operations on commodity hardware.
 *
 * Architecture References:
 * - Storage Types: src/types/storage.ts
 * - Graph Storage: src/storage/graph-storage.ts
 * - SQLite Manager: src/storage/sqlite-manager.ts
 */

import xxhash from "xxhash-wasm";
import type { BatchResult, Entity, ParsedEntity, Relationship } from "../types/storage.js";
import { RelationType } from "../types/storage.js";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import type { SQLiteDatabase, SQLiteStatement } from "./sqlite-adapter.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const DEFAULT_BATCH_SIZE = 1000;
const MAX_BATCH_SIZE = 5000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 100; // ms
const ID_LENGTH = 12;

// =============================================================================
// 3. BATCH OPERATIONS CLASS
// =============================================================================

export class BatchOperations {
  private batchSize: number;
  private db: SQLiteDatabase;
  private preparedStatements: Map<string, SQLiteStatement> = new Map();
  private jsonCache: Map<unknown, string> = new Map();
  private xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;

  constructor(db: SQLiteDatabase, batchSize = DEFAULT_BATCH_SIZE) {
    this.db = db;
    this.batchSize = Math.min(batchSize, MAX_BATCH_SIZE);
  }

  /**
   * Initialize xxHash for fast hashing
   */
  async initialize(): Promise<void> {
    this.xxhashInstance = await xxhash();
  }

  /**
   * Get or create a cached prepared statement
   * This significantly improves performance by reusing statements
   */
  private getStatement(key: string, sql: string): SQLiteStatement {
    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, this.db.prepare(sql));
    }
    return this.preparedStatements.get(key)!;
  }

  /**
   * Clean up all prepared statements and caches (call when done)
   * Note: better-sqlite3 automatically finalizes statements when the database is closed,
   * so we just need to clear our caches
   */
  destroy(): void {
    this.preparedStatements.clear();
    this.jsonCache.clear();
  }

  /**
   * Cached JSON.stringify to avoid redundant serialization
   * Uses WeakMap-like behavior for automatic garbage collection
   */
  private cachedStringify(obj: unknown): string {
    // For null/undefined, return directly
    if (obj === null || obj === undefined) {
      return JSON.stringify(obj);
    }

    // For primitive types that can't be used as Map keys, stringify directly
    if (typeof obj !== "object") {
      return JSON.stringify(obj);
    }

    // Check cache
    if (this.jsonCache.has(obj)) {
      return this.jsonCache.get(obj)!;
    }

    // Stringify and cache
    const result = JSON.stringify(obj);
    this.jsonCache.set(obj, result);

    // Limit cache size to prevent memory issues (keep last 10000 items)
    if (this.jsonCache.size > 10000) {
      const firstKey = this.jsonCache.keys().next().value;
      this.jsonCache.delete(firstKey);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers: stable keys/ids
  // ---------------------------------------------------------------------------

  private entityKey(e: Entity): string {
    // For packages and imports, use global key (no filePath, no location) - matches IndexerAgent logic
    const isGlobal = e.type === "package" || e.type === "import";

    const key = isGlobal
      ? `${e.type}|${e.name}` // Only type and name for global entities
      : `${e.filePath}|${e.type}|${e.name}|${e.location?.start?.index ?? -1}-${e.location?.end?.index ?? -1}`; // Full path for file-specific entities

    return key;
  }

  private stableEntityId(e: Entity): string {
    // Use xxHash for fast hashing (matches IndexerAgent)
    if (!this.xxhashInstance) {
      throw new Error("BatchOperations not initialized - call initialize() first");
    }
    const key = this.entityKey(e);
    return this.xxhashInstance.h64ToString(key).slice(0, ID_LENGTH);
  }

  private relationshipKey(r: { fromId: string; toId: string; type: RelationType }): string {
    return `${r.fromId}|${r.toId}|${r.type}`;
  }

  private stableRelationshipId(r: { fromId: string; toId: string; type: RelationType }): string {
    // Use xxHash for fast hashing (matches IndexerAgent)
    if (!this.xxhashInstance) {
      throw new Error("BatchOperations not initialized - call initialize() first");
    }
    const key = this.relationshipKey(r);
    return this.xxhashInstance.h64ToString(key).slice(0, ID_LENGTH);
  }

  /**
   * Insert entities in batches with transaction support
   * - Local deduplication by entityKey
   * - Stable IDs based on key
   */
  async insertEntities(
    entities: Entity[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    // Log database path for debugging
    console.log("[BatchOperations] Database path:", this.db.name || "unknown");

    // Use cached prepared statement for better performance
    const insertStmt = this.getStatement(
      "insert-entity",
      `
      INSERT INTO entities
      (id, name, type, file_path, location, metadata, hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        file_path = excluded.file_path,
        location = excluded.location,
        metadata = excluded.metadata,
        hash = COALESCE(excluded.hash, entities.hash),
        updated_at = excluded.updated_at
    `,
    );

    const seen = new Set<string>();
    const uniq: Entity[] = [];
    for (const e of entities) {
      const key = this.entityKey(e);
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(e);
      }
    }

    // Process in batches
    for (let i = 0; i < uniq.length; i += this.batchSize) {
      const batch = uniq.slice(i, Math.min(i + this.batchSize, uniq.length));

      // Retry logic for batch processing
      let attempts = 0;
      let batchSuccess = false;

      while (attempts < RETRY_ATTEMPTS && !batchSuccess) {
        try {
          const transaction = this.db.transaction((batch: Entity[]) => {
            for (const entity of batch) {
              const now = Date.now();
              const id = this.stableEntityId(entity);

              const result = insertStmt.run(
                id,
                entity.name,
                entity.type,
                entity.filePath,
                this.cachedStringify(entity.location),
                this.cachedStringify(entity.metadata || {}),
                entity.hash,
                entity.createdAt || now,
                entity.updatedAt || now,
              );

              // DEBUG: Log insert result for first entity
              if (batch.indexOf(entity) === 0) {
                console.log(`[BatchOperations] DEBUG: INSERT result for ${entity.name} (${id}):`, result);
              }
            }
          });

          transaction(batch);
          totalProcessed += batch.length;
          batchSuccess = true;

          // DEBUG: Verify entities were actually inserted
          if (i === 0 && batch.length > 0) {
            const checkStmt = this.db.prepare("SELECT id, name FROM entities WHERE id = ?");
            const firstEntity = batch[0];
            if (firstEntity) {
              const exists = checkStmt.get(firstEntity.id);
              console.log(
                `[BatchOperations] DEBUG: After insertEntities, first entity ${firstEntity.id} (${firstEntity.name}) exists=${!!exists}, result:`,
                exists,
              );
            }
          }

          // Report progress
          if (onProgress) {
            onProgress(totalProcessed, uniq.length);
          }
        } catch (error) {
          attempts++;

          if (attempts >= RETRY_ATTEMPTS) {
            // Log failed batch items
            for (const entity of batch) {
              errors.push({
                item: entity,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else {
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempts));
          }
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

  /**
   * Insert relationships in batches
   * - Local deduplication by relationshipKey
   * - Stable IDs based on key
   */
  async insertRelationships(
    relationships: Relationship[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    // Use cached prepared statement for better performance
    const insertStmt = this.getStatement(
      "insert-relationship",
      `
      INSERT INTO relationships
      (id, from_id, to_id, type, metadata)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        metadata = COALESCE(excluded.metadata, relationships.metadata)
    `,
    );

    const seen = new Set<string>();
    const uniq: Relationship[] = [];
    for (const r of relationships) {
      const key = this.relationshipKey({ fromId: r.fromId, toId: r.toId, type: r.type });
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(r);
      }
    }

    console.log(
      `[BatchOperations] DEBUG: insertRelationships called with ${relationships.length} rels, deduped to ${uniq.length}`,
    );

    // Process in batches
    for (let i = 0; i < uniq.length; i += this.batchSize) {
      const batch = uniq.slice(i, Math.min(i + this.batchSize, uniq.length));

      let attempts = 0;
      let batchSuccess = false;

      while (attempts < RETRY_ATTEMPTS && !batchSuccess) {
        try {
          // DEBUG: Check if entity IDs exist in DB before inserting relationships
          if (batch.length > 0) {
            const checkStmt = this.db.prepare("SELECT id FROM entities WHERE id = ?");
            const firstRel = batch[0];
            if (firstRel) {
              const fromExists = checkStmt.get(firstRel.fromId);
              const toExists = checkStmt.get(firstRel.toId);
              console.log(
                `[BatchOperations] DEBUG: First rel entity check: from=${firstRel.fromId} exists=${!!fromExists}, to=${firstRel.toId} exists=${!!toExists}`,
              );
            }
          }

          const transaction = this.db.transaction((batch: Relationship[]) => {
            for (const rel of batch) {
              const id = this.stableRelationshipId({ fromId: rel.fromId, toId: rel.toId, type: rel.type });
              insertStmt.run(
                id,
                rel.fromId,
                rel.toId,
                rel.type,
                rel.metadata ? this.cachedStringify(rel.metadata) : null,
              );
            }
          });

          transaction(batch);
          totalProcessed += batch.length;
          batchSuccess = true;

          // Report progress
          if (onProgress) {
            onProgress(totalProcessed, uniq.length);
          }
        } catch (error) {
          attempts++;
          console.log(
            `[BatchOperations] DEBUG: insertRelationships error on attempt ${attempts}:`,
            error instanceof Error ? error.message : String(error),
          );

          if (attempts >= RETRY_ATTEMPTS) {
            console.log(`[BatchOperations] DEBUG: Max retries reached, adding ${batch.length} rels to errors`);
            for (const rel of batch) {
              errors.push({
                item: rel,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempts));
          }
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

  /**
   * Delete entities in batches
   */
  async deleteEntities(
    entityIds: string[],
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    // Use cached prepared statement for better performance
    const deleteStmt = this.getStatement("delete-entity", "DELETE FROM entities WHERE id = ?");

    // Process in batches
    for (let i = 0; i < entityIds.length; i += this.batchSize) {
      const batch = entityIds.slice(i, Math.min(i + this.batchSize, entityIds.length));

      try {
        const transaction = this.db.transaction((batch: string[]) => {
          for (const id of batch) {
            deleteStmt.run(id);
          }
        });

        transaction(batch);
        totalProcessed += batch.length;

        if (onProgress) {
          onProgress(totalProcessed, entityIds.length);
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

  /**
   * Update entities in batches
   */
  async updateEntities(
    updates: Array<{ id: string; changes: Partial<Entity> }>,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchResult> {
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let totalProcessed = 0;

    // Use cached prepared statement for better performance
    const updateStmt = this.getStatement(
      "update-entity",
      `
      UPDATE entities
      SET name = COALESCE(?, name),
          type = COALESCE(?, type),
          location = COALESCE(?, location),
          metadata = COALESCE(?, metadata),
          hash = COALESCE(?, hash),
          updated_at = ?
      WHERE id = ?
    `,
    );

    // Process in batches
    for (let i = 0; i < updates.length; i += this.batchSize) {
      const batch = updates.slice(i, Math.min(i + this.batchSize, updates.length));

      try {
        const transaction = this.db.transaction((batch: typeof updates) => {
          for (const update of batch) {
            const now = Date.now();
            updateStmt.run(
              update.changes.name || null,
              update.changes.type || null,
              update.changes.location ? this.cachedStringify(update.changes.location) : null,
              update.changes.metadata ? this.cachedStringify(update.changes.metadata) : null,
              update.changes.hash || null,
              now,
              update.id,
            );
          }
        });

        transaction(batch);
        totalProcessed += batch.length;

        if (onProgress) {
          onProgress(totalProcessed, updates.length);
        }
      } catch (error) {
        for (const update of batch) {
          errors.push({
            item: update,
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

  /**
   * Build relationships from parsed entities
   */
  async buildRelationshipsFromEntities(entities: ParsedEntity[], filePath: string): Promise<Relationship[]> {
    const relationships: Relationship[] = [];
    const entityMap = new Map<string, string>(); // name -> id mapping

    // First pass: create entity ID mapping
    for (const entity of entities) {
      const id = `${filePath}:${entity.name}:${entity.location.start.line}`;
      entityMap.set(entity.name, id);
    }

    // Second pass: create relationships
    for (const entity of entities) {
      const fromId = entityMap.get(entity.name)!;

      // Import relationships
      if (entity.type === "import" && entity.importData) {
        for (const specifier of entity.importData.specifiers) {
          const toId = `import:${entity.importData.source}:${specifier.imported || specifier.local}`;
          relationships.push({
            id: this.stableRelationshipId({ fromId, toId, type: RelationType.IMPORTS }),
            fromId,
            toId,
            type: RelationType.IMPORTS,
            metadata: {
              line: entity.location.start.line,
              column: entity.location.start.column,
              context: `Import from ${entity.importData.source}`,
            },
          });
        }
      }

      // Reference relationships
      if (entity.references) {
        for (const ref of entity.references) {
          const toId = entityMap.get(ref);
          if (toId) {
            relationships.push({
              id: this.stableRelationshipId({ fromId, toId, type: RelationType.REFERENCES }),
              fromId,
              toId,
              type: RelationType.REFERENCES,
              metadata: {
                line: entity.location.start.line,
                column: entity.location.start.column,
              },
            });
          }
        }
      }

      // Parent-child relationships
      if (entity.children) {
        for (const child of entity.children) {
          const childId = entityMap.get(child.name);
          if (childId) {
            relationships.push({
              id: this.stableRelationshipId({ fromId, toId: childId, type: RelationType.CONTAINS }),
              fromId,
              toId: childId,
              type: RelationType.CONTAINS,
              metadata: {
                line: child.location.start.line,
                column: child.location.start.column,
              },
            });
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Optimize batch size based on performance metrics
   */
  optimizeBatchSize(avgTimeMs: number, targetTimeMs = 100): void {
    if (avgTimeMs > targetTimeMs && this.batchSize > 100) {
      // Reduce batch size if too slow
      this.batchSize = Math.max(100, Math.floor(this.batchSize * 0.8));
    } else if (avgTimeMs < targetTimeMs * 0.5 && this.batchSize < MAX_BATCH_SIZE) {
      // Increase batch size if too fast
      this.batchSize = Math.min(MAX_BATCH_SIZE, Math.floor(this.batchSize * 1.2));
    }

    console.log(`[BatchOperations] Optimized batch size to ${this.batchSize}`);
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Set batch size
   */
  setBatchSize(size: number): void {
    this.batchSize = Math.min(Math.max(1, size), MAX_BATCH_SIZE);
  }
}
