/**
 * Layered Vector Store - Three-Layer Semantic Search
 *
 * Extends vector search with branch-aware delta architecture:
 * - Layer 0 (Base): Main branch embeddings (shared, read-only)
 * - Layer 1 (Branch Deltas): Per-branch embedding changes (shared, mostly read-only)
 * - Layer 2 (Working Deltas): Per-client uncommitted embeddings [FUTURE]
 *
 * Key features:
 * - Lazy embedding generation (only for changed entities)
 * - Three-layer merge at query time
 * - SIMD-accelerated similarity search
 * - LRU cache for branch vector deltas
 *
 * Based on: ultrasharp-tools-mcp LayeredVectorStore.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import { LRUCache } from "lru-cache";
import type { ILayeredVectorIndex } from "../core/layered-index.js";
import { EmbeddingGenerator } from "../semantic/embedding-generator.js";
import type { VectorStore } from "../semantic/vector-store.js";
import type { VectorDelta as IVectorDelta, LayeredIndexConfig } from "../types/layered.js";
import type { SimilarityResult } from "../types/semantic.js";
import { cosineSimilarity } from "../utils/simd-vector-ops.js";
import { VectorCacheManager } from "./vector-cache-manager.js";
import { VectorDelta } from "./vector-delta.js";

// =============================================================================
// TYPES
// =============================================================================

export interface LayeredSimilarityResult extends SimilarityResult {
  /** Which layer this result came from */
  layer: "base" | "branch" | "working";

  /** Branch name (if applicable) */
  branch?: string;
}

// =============================================================================
// LAYERED VECTOR STORE CLASS
// =============================================================================

export class LayeredVectorStore implements ILayeredVectorIndex {
  // Layer 0: Base vector store (main branch)
  private baseStore: VectorStore;

  // Layer 1: Branch vector deltas (per-branch)
  private branchDeltaCache: LRUCache<string, VectorDelta>;

  // Layer 2: Working vector deltas (per-client) [FUTURE]
  private workingDeltas: Map<string, VectorDelta> = new Map();

  // Configuration
  private config: LayeredIndexConfig;

  // External dependencies
  private cacheManager: VectorCacheManager | null = null;
  private embeddingGenerator: EmbeddingGenerator | null = null;
  private workingDirectory: string | null = null;

  constructor(baseStore: VectorStore, config: LayeredIndexConfig, workingDirectory?: string) {
    this.workingDirectory = workingDirectory || null;
    this.baseStore = baseStore;
    this.config = config;

    // Initialize LRU cache for branch deltas
    this.branchDeltaCache = new LRUCache<string, VectorDelta>({
      max: this.config.maxBranchDeltas,
      dispose: (value, key) => {
        this.onBranchDeltaEvicted(key, value);
      },
    });

    // Initialize cache manager for persistence
    if (this.config.enablePersistence && this.workingDirectory) {
      this.cacheManager = new VectorCacheManager(this.workingDirectory);
    }

    // Initialize embedding generator
    this.embeddingGenerator = new EmbeddingGenerator();
    this.embeddingGenerator.initialize().catch((err) => {
      console.warn("[LayeredVectorStore] Failed to initialize embedding generator:", err);
    });

    console.error(`[LayeredVectorStore] Initialized with max ${this.config.maxBranchDeltas} branch deltas`);
  }

  // =========================================================================
  // MAIN SEARCH API - Three-Layer Semantic Search
  // =========================================================================

  /**
   * Search similar vectors with three-layer merging
   *
   * Composition:
   * 1. Search base store (Layer 0)
   * 2. Apply branch delta (Layer 1)
   * 3. Apply working delta (Layer 2) [FUTURE]
   * 4. Re-rank combined results
   *
   * @param branch - Branch name (null = main branch)
   * @param clientId - Client ID for Layer 2 [FUTURE, optional]
   * @param queryEmbedding - Query embedding vector
   * @param topK - Number of results to return
   * @returns Merged similarity results from all layers
   */
  async searchSimilar(
    branch: string | null,
    clientId: string | null,
    queryEmbedding: Float32Array,
    topK: number,
  ): Promise<LayeredSimilarityResult[]> {
    const startTime = Date.now();

    // Layer 0: Search base store
    const layer0Results = await this.searchBaseStore(queryEmbedding, topK * 2); // Retrieve more for re-ranking
    const layer0Time = Date.now() - startTime;

    // Layer 1: Apply branch delta (if not main)
    let layer1Results = layer0Results;
    let layer1Time = 0;

    if (branch && !this.isMainBranch(branch)) {
      const layer1Start = Date.now();
      const branchDelta = await this.getVectorDelta(branch);

      if (branchDelta) {
        layer1Results = this.applyBranchDelta(layer0Results, branchDelta, queryEmbedding);
      }

      layer1Time = Date.now() - layer1Start;
    }

    // Layer 2: Apply working delta
    let finalResults = layer1Results;
    let layer2Time = 0;

    if (this.config.enableWorkingDeltas && clientId && branch) {
      const layer2Start = Date.now();
      const workingDelta = this.getWorkingDelta(clientId, branch);

      if (workingDelta) {
        finalResults = this.applyBranchDelta(layer1Results, workingDelta, queryEmbedding);
      }

      layer2Time = Date.now() - layer2Start;
    }

    // Re-rank and limit to topK
    finalResults = this.reRankResults(finalResults, queryEmbedding, topK);

    const totalTime = Date.now() - startTime;

    console.error(
      `[LayeredVectorStore] Search in '${branch || "main"}': ` +
        `${finalResults.length} results, ` +
        `L0=${layer0Time}ms L1=${layer1Time}ms L2=${layer2Time}ms Total=${totalTime}ms`,
    );

    return finalResults;
  }

  // =========================================================================
  // Layer 1: Branch Delta Management
  // =========================================================================

  /**
   * Get vector delta for a branch
   *
   * @param branch - Branch name
   * @returns Vector delta or null
   */
  async getVectorDelta(branch: string): Promise<VectorDelta | null> {
    // Check cache
    const cached = this.branchDeltaCache.get(branch);
    if (cached) {
      return cached;
    }

    // Try load from storage
    if (this.cacheManager) {
      const loaded = await this.cacheManager.loadVectorDelta(branch);

      if (loaded) {
        this.branchDeltaCache.set(branch, loaded);
        return loaded;
      }
    }

    return null;
  }

  /**
   * Set/replace vector delta
   *
   * @param branch - Branch name
   * @param delta - Vector delta
   */
  async setVectorDelta(branch: string, delta: IVectorDelta): Promise<void> {
    // Convert to VectorDelta class if needed
    const vectorDelta = delta instanceof VectorDelta ? delta : VectorDelta.fromJSON(delta);

    // Update cache
    this.branchDeltaCache.set(branch, vectorDelta);

    // Save to storage
    if (this.cacheManager) {
      await this.cacheManager.saveVectorDelta(vectorDelta);
    }
  }

  /**
   * Generate embeddings for branch delta
   *
   * Lazy generation - only for changed entities
   *
   * @param branch - Branch name
   * @param entityIds - Entity IDs to generate embeddings for
   * @param entityContents - Map of entity ID to content (code/text)
   */
  async generateDeltaEmbeddings(
    branch: string,
    entityIds: string[],
    entityContents?: Map<string, string>,
  ): Promise<void> {
    console.error(`[LayeredVectorStore] Generating embeddings for ${entityIds.length} entities in branch ${branch}`);

    if (!this.embeddingGenerator) {
      console.warn("[LayeredVectorStore] EmbeddingGenerator not available, skipping");
      return;
    }

    // Get or create branch delta
    let delta = await this.getVectorDelta(branch);
    if (!delta) {
      delta = new VectorDelta(branch);
    }

    // Generate embeddings for each entity
    for (const entityId of entityIds) {
      const content = entityContents?.get(entityId);
      if (!content) {
        console.warn(`[LayeredVectorStore] No content for entity ${entityId}, skipping`);
        continue;
      }

      try {
        const embedding = await this.embeddingGenerator.generateCodeEmbedding(content);
        delta.addVector(entityId, embedding);
      } catch (error) {
        console.error(`[LayeredVectorStore] Failed to generate embedding for ${entityId}:`, error);
      }
    }

    // Save delta
    await this.setVectorDelta(branch, delta);

    console.error(`[LayeredVectorStore] Generated ${entityIds.length} embeddings for branch ${branch}`);
  }

  /**
   * Get working delta for a client
   */
  private getWorkingDelta(clientId: string, branch: string): VectorDelta | null {
    const key = `${clientId}:${branch}`;
    return this.workingDeltas.get(key) || null;
  }

  /**
   * Set working delta for a client
   */
  setWorkingDelta(clientId: string, branch: string, delta: VectorDelta): void {
    const key = `${clientId}:${branch}`;
    this.workingDeltas.set(key, delta);
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  /**
   * Search base store (Layer 0)
   *
   * @param queryEmbedding - Query vector
   * @param topK - Number of results
   * @returns Base similarity results
   */
  private async searchBaseStore(queryEmbedding: Float32Array, topK: number): Promise<LayeredSimilarityResult[]> {
    const baseResults = await this.baseStore.search(queryEmbedding, topK);

    // Convert to LayeredSimilarityResult
    return baseResults.map((result) => ({
      ...result,
      layer: "base" as const,
    }));
  }

  /**
   * Apply branch delta to base results
   *
   * Strategy:
   * 1. Remove deleted vectors
   * 2. Update modified vectors (recalculate similarity)
   * 3. Add new vectors from delta
   *
   * @param baseResults - Results from Layer 0
   * @param delta - Branch delta
   * @param queryEmbedding - Query vector
   * @returns Merged results
   */
  private applyBranchDelta(
    baseResults: LayeredSimilarityResult[],
    delta: VectorDelta,
    queryEmbedding: Float32Array,
  ): LayeredSimilarityResult[] {
    const results: LayeredSimilarityResult[] = [];

    // Process base results
    for (const result of baseResults) {
      // Skip deleted vectors
      if (delta.deletedEmbeddingIds.has(result.id)) {
        continue;
      }

      // Check if modified
      const modifiedVector = delta.modifiedEmbeddings.get(result.id);
      if (modifiedVector) {
        // Recalculate similarity with modified vector
        const similarity = cosineSimilarity(queryEmbedding, modifiedVector);
        results.push({
          ...result,
          similarity,
          layer: "branch" as const,
          branch: delta.branchName,
        });
      } else {
        // Keep original
        results.push(result);
      }
    }

    // Add new vectors from delta
    for (const [id, vector] of delta.addedEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, vector);

      results.push({
        id,
        content: "", // Content fetched separately from GraphStorage if needed
        similarity,
        layer: "branch" as const,
        branch: delta.branchName,
      });
    }

    return results;
  }

  /**
   * Re-rank results by similarity and limit to topK
   *
   * @param results - Combined results from all layers
   * @param queryEmbedding - Query vector
   * @param topK - Number of results to return
   * @returns Top K results
   */
  private reRankResults(
    results: LayeredSimilarityResult[],
    _queryEmbedding: Float32Array,
    topK: number,
  ): LayeredSimilarityResult[] {
    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    // Return top K
    return results.slice(0, topK);
  }

  /**
   * Check if branch is main/master
   */
  private isMainBranch(branch: string): boolean {
    return branch === "main" || branch === "master";
  }

  /**
   * Callback when branch delta is evicted from LRU cache
   */
  private onBranchDeltaEvicted(branch: string, delta: VectorDelta): void {
    if (!this.config.enablePersistence || !this.cacheManager) {
      return;
    }

    console.error(`[LayeredVectorStore] Branch delta evicted from cache, saving: ${branch}`);

    // Async save (don't block eviction)
    this.cacheManager
      .saveVectorDelta(delta)
      .catch((err: Error) => console.error(`[LayeredVectorStore] Failed to save evicted delta:`, err));
  }

  // =========================================================================
  // BATCH OPERATIONS
  // =========================================================================

  /**
   * Add vector to appropriate layer
   *
   * @param id - Entity ID
   * @param embedding - Embedding vector
   * @param branch - Branch name (null = main)
   * @param clientId - Client ID for Layer 2 [FUTURE]
   */
  async addVector(id: string, embedding: Float32Array, branch: string | null, _clientId: string | null): Promise<void> {
    if (!branch || this.isMainBranch(branch)) {
      // Add to base store
      await this.baseStore.insert({
        id,
        content: "", // Content is stored separately in GraphStorage
        vector: embedding,
        metadata: { entityId: id, addedAt: Date.now() },
        createdAt: Date.now(),
      });
    } else {
      // Add to branch delta (Layer 1)
      let delta = await this.getVectorDelta(branch);

      if (!delta) {
        // Create new delta
        delta = new VectorDelta(branch);
      }

      delta.addVector(id, embedding);

      // Save delta
      await this.setVectorDelta(branch, delta);
    }
  }

  /**
   * Batch add vectors
   *
   * @param vectors - Map of entity ID to embedding
   * @param branch - Branch name (null = main)
   */
  async addVectorsBatch(vectors: Map<string, Float32Array>, branch: string | null): Promise<void> {
    if (!branch || this.isMainBranch(branch)) {
      // Add to base store using insertBatch
      const now = Date.now();
      const embeddings = Array.from(vectors.entries()).map(([id, embedding]) => ({
        id,
        content: "", // Content is stored separately in GraphStorage
        vector: embedding,
        metadata: { entityId: id, addedAt: now },
        createdAt: now,
      }));
      await this.baseStore.insertBatch(embeddings);
    } else {
      // Add to branch delta
      let delta = await this.getVectorDelta(branch);

      if (!delta) {
        delta = new VectorDelta(branch);
      }

      delta.addVectorsBatch(vectors);

      await this.setVectorDelta(branch, delta);
    }
  }

  /**
   * Delete vector from appropriate layer
   *
   * @param id - Entity ID
   * @param branch - Branch name (null = main)
   */
  async deleteVector(id: string, branch: string | null): Promise<void> {
    if (!branch || this.isMainBranch(branch)) {
      // Delete from base store
      await this.baseStore.delete(id);
    } else {
      // Mark as deleted in branch delta
      let delta = await this.getVectorDelta(branch);

      if (!delta) {
        delta = new VectorDelta(branch);
      }

      delta.deleteVector(id);

      await this.setVectorDelta(branch, delta);
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Shutdown vector store gracefully
   */
  async shutdown(): Promise<void> {
    console.error("[LayeredVectorStore] Shutting down...");

    // Save all cached deltas
    for (const [_branch, delta] of this.branchDeltaCache.entries()) {
      if (this.cacheManager) {
        await this.cacheManager.saveVectorDelta(delta);
      }
    }

    // Clear caches
    this.branchDeltaCache.clear();
    this.workingDeltas.clear();

    console.error("[LayeredVectorStore] Shutdown complete");
  }
}
