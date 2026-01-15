/**
 * Vector Delta - Layer 1 for Vector Embeddings
 *
 * Represents embedding changes for a specific branch relative to base.
 * Enables three-layer semantic search without reindexing all embeddings.
 *
 * Key features:
 * - Lazy generation: Only compute embeddings for changed entities
 * - Efficient storage: Delta = Added ∪ Modified ∪ Deleted
 * - Fast merge: Combine with base vectors at query time
 *
 * Based on: ultrasharp-tools-mcp VectorDelta.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import type { VectorDelta as IVectorDelta } from "../types/layered.js";

// =============================================================================
// VECTOR DELTA CLASS
// =============================================================================

export class VectorDelta implements IVectorDelta {
  branchName: string;
  baseCommitSha: string;

  // Vector changes (interface requires these exact names)
  addedEmbeddings: Map<string, Float32Array> = new Map();
  modifiedEmbeddings: Map<string, Float32Array> = new Map();
  deletedEmbeddingIds: Set<string> = new Set();

  lastModified: number;

  constructor(branchName: string, baseCommitSha: string = "") {
    this.branchName = branchName;
    this.baseCommitSha = baseCommitSha;
    this.lastModified = Date.now();
  }

  /**
   * Total number of vector changes
   */
  get totalChanges(): number {
    return this.addedEmbeddings.size + this.modifiedEmbeddings.size + this.deletedEmbeddingIds.size;
  }

  // =========================================================================
  // APPLY METHODS - Merge delta with base vectors
  // =========================================================================

  /**
   * Apply this delta to base vector results
   *
   * Filters deleted vectors, replaces modified, adds new
   *
   * @param baseVectors - Vectors from Layer 0 (base index)
   * @returns Merged vectors
   */
  applyToVectors(baseVectors: Map<string, Float32Array>): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();

    // Process base vectors
    for (const [id, vector] of baseVectors) {
      // Skip deleted vectors
      if (this.deletedEmbeddingIds.has(id)) {
        continue;
      }

      // Replace with modified version if exists
      const modified = this.modifiedEmbeddings.get(id);
      if (modified) {
        result.set(id, modified);
      } else {
        result.set(id, vector);
      }
    }

    // Add new vectors
    for (const [id, vector] of this.addedEmbeddings) {
      result.set(id, vector);
    }

    return result;
  }

  /**
   * Check if entity has vector in this delta
   *
   * @param entityId - Entity ID
   * @returns True if entity has vector in delta
   */
  hasVector(entityId: string): boolean {
    return this.addedEmbeddings.has(entityId) || this.modifiedEmbeddings.has(entityId);
  }

  /**
   * Get vector for entity (from delta only)
   *
   * @param entityId - Entity ID
   * @returns Vector or null if not in delta
   */
  getVector(entityId: string): Float32Array | null {
    return this.addedEmbeddings.get(entityId) || this.modifiedEmbeddings.get(entityId) || null;
  }

  // =========================================================================
  // MERGE METHODS - Combine deltas
  // =========================================================================

  /**
   * Merge another vector delta into this one
   *
   * Used when:
   * - Promoting working delta to branch delta (Layer 2 → Layer 1) [FUTURE]
   * - Combining multiple incremental updates
   *
   * @param other - Delta to merge
   * @param newCommitSha - Optional new commit SHA
   */
  mergeWith(other: VectorDelta, newCommitSha?: string): void {
    // Merge added vectors
    for (const [id, vector] of other.addedEmbeddings) {
      this.addedEmbeddings.set(id, vector);
    }

    // Merge modified vectors
    for (const [id, vector] of other.modifiedEmbeddings) {
      this.modifiedEmbeddings.set(id, vector);
    }

    // Merge deleted vector IDs
    for (const id of other.deletedEmbeddingIds) {
      this.deletedEmbeddingIds.add(id);

      // Remove from added/modified if present (vector is now deleted)
      this.addedEmbeddings.delete(id);
      this.modifiedEmbeddings.delete(id);
    }

    // Update metadata
    if (newCommitSha) {
      this.baseCommitSha = newCommitSha;
    }
    this.lastModified = Date.now();
  }

  // =========================================================================
  // VECTOR OPERATIONS
  // =========================================================================

  /**
   * Add new vector
   *
   * @param entityId - Entity ID
   * @param embedding - Embedding vector
   */
  addVector(entityId: string, embedding: Float32Array): void {
    this.addedEmbeddings.set(entityId, embedding);

    // Remove from deleted if present
    this.deletedEmbeddingIds.delete(entityId);

    this.lastModified = Date.now();
  }

  /**
   * Update existing vector
   *
   * @param entityId - Entity ID
   * @param embedding - New embedding vector
   */
  modifyVector(entityId: string, embedding: Float32Array): void {
    // Check if it's in added (then just update added)
    if (this.addedEmbeddings.has(entityId)) {
      this.addedEmbeddings.set(entityId, embedding);
    } else {
      this.modifiedEmbeddings.set(entityId, embedding);
    }

    // Remove from deleted if present
    this.deletedEmbeddingIds.delete(entityId);

    this.lastModified = Date.now();
  }

  /**
   * Delete vector
   *
   * @param entityId - Entity ID
   */
  deleteVector(entityId: string): void {
    this.deletedEmbeddingIds.add(entityId);

    // Remove from added/modified
    this.addedEmbeddings.delete(entityId);
    this.modifiedEmbeddings.delete(entityId);

    this.lastModified = Date.now();
  }

  /**
   * Batch add vectors
   *
   * @param vectors - Map of entity ID to embedding
   */
  addVectorsBatch(vectors: Map<string, Float32Array>): void {
    for (const [id, embedding] of vectors) {
      this.addVector(id, embedding);
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Clear all changes in this delta
   */
  clear(): void {
    this.addedEmbeddings.clear();
    this.modifiedEmbeddings.clear();
    this.deletedEmbeddingIds.clear();

    this.lastModified = Date.now();
  }

  /**
   * Clone this delta
   */
  clone(): VectorDelta {
    const cloned = new VectorDelta(this.branchName, this.baseCommitSha);

    // Clone vectors (deep copy)
    for (const [id, vector] of this.addedEmbeddings) {
      cloned.addedEmbeddings.set(id, new Float32Array(vector));
    }

    for (const [id, vector] of this.modifiedEmbeddings) {
      cloned.modifiedEmbeddings.set(id, new Float32Array(vector));
    }

    cloned.deletedEmbeddingIds = new Set(this.deletedEmbeddingIds);
    cloned.lastModified = this.lastModified;

    return cloned;
  }

  /**
   * Get memory usage estimate (bytes)
   */
  getMemoryUsage(): number {
    let bytes = 0;

    // Added vectors
    for (const vector of this.addedEmbeddings.values()) {
      bytes += vector.byteLength;
    }

    // Modified vectors
    for (const vector of this.modifiedEmbeddings.values()) {
      bytes += vector.byteLength;
    }

    // Deleted IDs (rough estimate)
    bytes += this.deletedEmbeddingIds.size * 50; // Assume ~50 bytes per ID string

    return bytes;
  }

  /**
   * Get dimension of vectors (from first available vector)
   */
  getDimension(): number {
    // Check added first
    for (const vector of this.addedEmbeddings.values()) {
      return vector.length;
    }

    // Check modified
    for (const vector of this.modifiedEmbeddings.values()) {
      return vector.length;
    }

    return 0; // No vectors
  }

  // =========================================================================
  // SERIALIZATION
  // =========================================================================

  /**
   * Serialize to JSON-compatible object
   *
   * Note: Float32Array is serialized as regular arrays
   */
  toJSON(): Record<string, any> {
    return {
      branchName: this.branchName,
      baseCommitSha: this.baseCommitSha,
      lastModified: this.lastModified,
      added: Array.from(this.addedEmbeddings.entries()).map(([id, vector]) => [id, Array.from(vector)]),
      modified: Array.from(this.modifiedEmbeddings.entries()).map(([id, vector]) => [id, Array.from(vector)]),
      deleted: Array.from(this.deletedEmbeddingIds),
    };
  }

  /**
   * Deserialize from JSON-compatible object
   */
  static fromJSON(data: unknown): VectorDelta {
    // Type guard for JSON data
    if (
      typeof data !== "object" ||
      data === null ||
      !("branchName" in data) ||
      !("baseCommitSha" in data) ||
      !("lastModified" in data)
    ) {
      throw new Error("Invalid VectorDelta JSON data");
    }

    const jsonData = data as {
      branchName: string;
      baseCommitSha: string;
      lastModified: number;
      added?: Array<[string, number[]]>;
      modified?: Array<[string, number[]]>;
      deleted?: string[];
    };

    const delta = new VectorDelta(jsonData.branchName, jsonData.baseCommitSha);
    delta.lastModified = jsonData.lastModified;

    // Deserialize added vectors
    if (jsonData.added) {
      for (const [id, vectorArray] of jsonData.added) {
        delta.addedEmbeddings.set(id, new Float32Array(vectorArray));
      }
    }

    // Deserialize modified vectors
    if (jsonData.modified) {
      for (const [id, vectorArray] of jsonData.modified) {
        delta.modifiedEmbeddings.set(id, new Float32Array(vectorArray));
      }
    }

    // Deserialize deleted
    if (jsonData.deleted) {
      delta.deletedEmbeddingIds = new Set(jsonData.deleted);
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
    const dimension = this.getDimension();
    const memoryMB = (this.getMemoryUsage() / 1024 / 1024).toFixed(2);

    return (
      `VectorDelta[${this.branchName}] @ ${this.baseCommitSha.slice(0, 8)} | ` +
      `Vectors: +${this.addedEmbeddings.size} ~${this.modifiedEmbeddings.size} -${this.deletedEmbeddingIds.size} | ` +
      `Dim: ${dimension} | Memory: ${memoryMB} MB`
    );
  }
}
