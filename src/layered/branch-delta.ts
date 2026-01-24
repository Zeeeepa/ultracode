/**
 * Branch Delta - Layer 1 Implementation
 *
 * Represents symbol/entity changes for a specific branch relative to base (main).
 * Shared between all clients working in the same branch.
 *
 * Based on: ultrasharp-tools-mcp BranchDelta.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import type { EntityDelta, BranchDelta as IBranchDelta, RelationshipDelta, WorkingDelta } from "../types/layered.js";
import { createEmptyEntityDelta, createEmptyRelationshipDelta } from "../types/layered.js";
import type { Entity, Relationship } from "../types/storage.js";

// =============================================================================
// BRANCH DELTA CLASS
// =============================================================================

export class BranchDelta implements IBranchDelta {
  branchName: string;
  baseCommitSha: string;
  entityDelta: EntityDelta;
  relationshipDelta: RelationshipDelta;
  lastModified: number;

  constructor(branchName: string, baseCommitSha: string = "") {
    this.branchName = branchName;
    this.baseCommitSha = baseCommitSha;
    this.entityDelta = createEmptyEntityDelta();
    this.relationshipDelta = createEmptyRelationshipDelta();
    this.lastModified = Date.now();
  }

  /**
   * Total number of changes in this delta
   */
  get totalChanges(): number {
    return (
      this.entityDelta.added.size +
      this.entityDelta.modified.size +
      this.entityDelta.deleted.size +
      this.relationshipDelta.added.size +
      this.relationshipDelta.modified.size +
      this.relationshipDelta.deleted.size
    );
  }

  // =========================================================================
  // APPLY METHODS - Merge delta with base results
  // =========================================================================

  /**
   * Apply this delta to base entity results
   * Filters deleted entities, replaces modified, adds new
   *
   * @param baseResults - Entities from Layer 0 (base index)
   * @returns Merged entities
   */
  applyToEntities(baseResults: Entity[]): Entity[] {
    const result: Entity[] = [];

    // Process base entities
    for (const entity of baseResults) {
      // Skip deleted entities
      if (this.entityDelta.deleted.has(entity.id)) {
        continue;
      }

      // Replace with modified version if exists
      const modified = this.entityDelta.modified.get(entity.id);
      if (modified) {
        result.push(modified);
      } else {
        result.push(entity);
      }
    }

    // Add new entities
    for (const addedEntity of this.entityDelta.added.values()) {
      result.push(addedEntity);
    }

    return result;
  }

  /**
   * Apply this delta to base relationship results
   *
   * @param baseResults - Relationships from Layer 0
   * @returns Merged relationships
   */
  applyToRelationships(baseResults: Relationship[]): Relationship[] {
    const result: Relationship[] = [];

    // Process base relationships
    for (const rel of baseResults) {
      // Skip deleted relationships
      if (this.relationshipDelta.deleted.has(rel.id)) {
        continue;
      }

      // Replace with modified version if exists
      const modified = this.relationshipDelta.modified.get(rel.id);
      if (modified) {
        result.push(modified);
      } else {
        result.push(rel);
      }
    }

    // Add new relationships
    for (const addedRel of this.relationshipDelta.added.values()) {
      result.push(addedRel);
    }

    return result;
  }

  // =========================================================================
  // MERGE METHODS - Combine deltas
  // =========================================================================

  /**
   * Merge another delta into this one
   * Used when:
   * - Promoting working delta to branch delta (Layer 2 → Layer 1) [FUTURE]
   * - Combining multiple incremental updates
   *
   * @param other - Delta to merge
   * @param newCommitSha - Optional new commit SHA
   */
  mergeWith(other: BranchDelta | WorkingDelta, newCommitSha?: string): void {
    // Merge entities
    this.mergeEntityDelta(other.entityDelta);

    // Merge relationships
    this.mergeRelationshipDelta(other.relationshipDelta);

    // Update metadata
    if (newCommitSha) {
      this.baseCommitSha = newCommitSha;
    }
    this.lastModified = Date.now();
  }

  /**
   * Merge entity delta
   */
  private mergeEntityDelta(other: EntityDelta): void {
    // Merge added entities
    for (const [id, entity] of other.added) {
      this.entityDelta.added.set(id, entity);
    }

    // Merge modified entities
    for (const [id, entity] of other.modified) {
      this.entityDelta.modified.set(id, entity);
    }

    // Merge deleted entity IDs
    for (const id of other.deleted) {
      this.entityDelta.deleted.add(id);

      // Remove from added/modified if present (entity is now deleted)
      this.entityDelta.added.delete(id);
      this.entityDelta.modified.delete(id);
    }
  }

  /**
   * Merge relationship delta
   */
  private mergeRelationshipDelta(other: RelationshipDelta): void {
    // Merge added relationships
    for (const [id, rel] of other.added) {
      this.relationshipDelta.added.set(id, rel);
    }

    // Merge modified relationships
    for (const [id, rel] of other.modified) {
      this.relationshipDelta.modified.set(id, rel);
    }

    // Merge deleted relationship IDs
    for (const id of other.deleted) {
      this.relationshipDelta.deleted.add(id);

      // Remove from added/modified if present
      this.relationshipDelta.added.delete(id);
      this.relationshipDelta.modified.delete(id);
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Clear all changes in this delta
   */
  clear(): void {
    this.entityDelta.added.clear();
    this.entityDelta.modified.clear();
    this.entityDelta.deleted.clear();

    this.relationshipDelta.added.clear();
    this.relationshipDelta.modified.clear();
    this.relationshipDelta.deleted.clear();

    this.lastModified = Date.now();
  }

  /**
   * Clone this delta
   * Creates a deep copy
   */
  clone(): BranchDelta {
    const cloned = new BranchDelta(this.branchName, this.baseCommitSha);

    // Clone entity delta
    cloned.entityDelta.added = new Map(this.entityDelta.added);
    cloned.entityDelta.modified = new Map(this.entityDelta.modified);
    cloned.entityDelta.deleted = new Set(this.entityDelta.deleted);

    // Clone relationship delta
    cloned.relationshipDelta.added = new Map(this.relationshipDelta.added);
    cloned.relationshipDelta.modified = new Map(this.relationshipDelta.modified);
    cloned.relationshipDelta.deleted = new Set(this.relationshipDelta.deleted);

    cloned.lastModified = this.lastModified;

    return cloned;
  }

  /**
   * Check if this delta needs compaction
   * Large deltas should be recomputed from git diff to optimize memory
   *
   * @param threshold - Compaction threshold (default: 1000)
   */
  needsCompaction(threshold: number = 1000): boolean {
    return this.totalChanges > threshold;
  }

  /**
   * Check if delta has any changes at all
   */
  isEmpty(): boolean {
    return this.totalChanges === 0;
  }

  // =========================================================================
  // SERIALIZATION
  // =========================================================================

  /**
   * Serialize delta to JSON-compatible object
   * Used for SQLite storage
   */
  toJSON(): Record<string, any> {
    return {
      branchName: this.branchName,
      baseCommitSha: this.baseCommitSha,
      lastModified: this.lastModified,
      entityDelta: {
        added: Array.from(this.entityDelta.added.entries()),
        modified: Array.from(this.entityDelta.modified.entries()),
        deleted: Array.from(this.entityDelta.deleted),
      },
      relationshipDelta: {
        added: Array.from(this.relationshipDelta.added.entries()),
        modified: Array.from(this.relationshipDelta.modified.entries()),
        deleted: Array.from(this.relationshipDelta.deleted),
      },
    };
  }

  /**
   * Deserialize delta from JSON-compatible object
   */
  static fromJSON(data: unknown): BranchDelta {
    // Type guard for JSON data
    if (
      typeof data !== "object" ||
      data === null ||
      !("branchName" in data) ||
      !("baseCommitSha" in data) ||
      !("lastModified" in data)
    ) {
      throw new Error("Invalid BranchDelta JSON data");
    }

    const jsonData = data as {
      branchName: string;
      baseCommitSha: string;
      lastModified: number;
      entityDelta?: {
        added?: Array<[string, unknown]>;
        modified?: Array<[string, unknown]>;
        deleted?: string[];
      };
      relationshipDelta?: {
        added?: Array<[string, unknown]>;
        modified?: Array<[string, unknown]>;
        deleted?: string[];
      };
    };

    const delta = new BranchDelta(jsonData.branchName, jsonData.baseCommitSha);
    delta.lastModified = jsonData.lastModified;

    // Deserialize entity delta
    if (jsonData.entityDelta) {
      delta.entityDelta.added = new Map(jsonData.entityDelta.added || []) as Map<string, Entity>;
      delta.entityDelta.modified = new Map(jsonData.entityDelta.modified || []) as Map<string, Entity>;
      delta.entityDelta.deleted = new Set(jsonData.entityDelta.deleted || []);
    }

    // Deserialize relationship delta
    if (jsonData.relationshipDelta) {
      delta.relationshipDelta.added = new Map(jsonData.relationshipDelta.added || []) as Map<string, Relationship>;
      delta.relationshipDelta.modified = new Map(jsonData.relationshipDelta.modified || []) as Map<
        string,
        Relationship
      >;
      delta.relationshipDelta.deleted = new Set(jsonData.relationshipDelta.deleted || []);
    }

    return delta;
  }

  // =========================================================================
  // DEBUGGING
  // =========================================================================

  /**
   * Get human-readable summary
   */
  getSummary(): string {
    const entities = `Entities: +${this.entityDelta.added.size} ~${this.entityDelta.modified.size} -${this.entityDelta.deleted.size}`;
    const relationships = `Relationships: +${this.relationshipDelta.added.size} ~${this.relationshipDelta.modified.size} -${this.relationshipDelta.deleted.size}`;

    return `BranchDelta[${this.branchName}] @ ${this.baseCommitSha.slice(0, 8)} | ${entities} | ${relationships}`;
  }
}
