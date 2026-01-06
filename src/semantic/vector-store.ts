/**
 * Vector Store Manager - Faiss Backend
 *
 * v5: Faiss-only backend. All vector operations go through FaissProvider.
 * LibSQL is used only for graph data (entities, relationships), not embeddings.
 *
 * Benefits:
 * - Faiss runs in main process (faiss-napi works under both Node.js and Bun)
 * - HNSW index with automatic persistence
 * - Content cache persisted alongside Faiss index
 * - No DiskANN overhead or libSQL vector operations
 *
 * @history
 *  - 2025-09-14: Created - Initial vector store implementation
 *  - 2025-12-11: v4 - Unified storage with GraphStorage
 *  - 2026-01-01: v5 - Faiss-only backend, removed libSQL embeddings
 */

import { log } from "../logging/index.js";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { DEFAULT_BRANCH, getProjectHash, normalizeBranchName } from "../shared/storage-paths.js";
import type { ProjectContext } from "../storage/libsql-graph-adapter.js";
import type { SimilarityResult, VectorEmbedding, VectorStoreConfig } from "../types/semantic.js";
import { type FaissProvider, initializeFaissProvider } from "./faiss/faiss-provider.js";
import { getRecommendedStrategy, type StrategyRecommendation } from "./gpu/adaptive-thresholds.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const DEFAULT_CONFIG: Partial<VectorStoreConfig> = {
  dimensions: 384,
};

// =============================================================================
// 3. UTILITY FUNCTIONS
// =============================================================================
function dedupeById(items: VectorEmbedding[]): VectorEmbedding[] {
  const map = new Map<string, VectorEmbedding>();
  for (const e of items) map.set(e.id, e);
  return Array.from(map.values());
}

// =============================================================================
// 4. CORE BUSINESS LOGIC
// =============================================================================
export class VectorStore {
  private readonly config: VectorStoreConfig;

  // v5: Faiss is the only backend for vector operations
  private faissProvider: FaissProvider | null = null;

  // Initialization state management
  private isInitialized = false;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private debugMode = process.env["VECTOR_STORE_DEBUG"] === "true";

  // Project context for multi-project support
  // MUST be set via setProjectContext() before any operations
  private currentContext: ProjectContext | null = null;

  constructor(config: Partial<VectorStoreConfig> = {}) {
    log.d("VECTOR", "v5: Faiss-only backend");

    this.config = {
      dbPath: config.dbPath || "",
      dimensions: config.dimensions || DEFAULT_CONFIG.dimensions!,
      workingDirectory: config.workingDirectory,
      libsql: config.libsql,
    };
  }

  /**
   * Set the current project context for all subsequent operations
   * v5: Async because FaissProvider may need to save/load indexes on context switch
   */
  async setProjectContext(context: ProjectContext): Promise<void> {
    this.currentContext = context;
    // v5: Set context on FaissProvider (may switch indexes)
    if (this.faissProvider) {
      await this.faissProvider.setProjectContext(context.projectHash, context.branchName);
    }
    log.d("VECTOR", "Context set", { project: context.projectHash, branch: context.branchName });
  }

  /**
   * Set project context from path and branch
   * v5: Async because FaissProvider may need to save/load indexes on context switch
   */
  async setProject(projectPath: string, branchName?: string): Promise<void> {
    await this.setProjectContext({
      projectHash: getProjectHash(projectPath),
      branchName: normalizeBranchName(branchName || DEFAULT_BRANCH),
    });
  }

  /**
   * Get current project context
   * Throws if context not set
   */
  getProjectContext(): ProjectContext {
    const ctx = this.ensureContextSet();
    return { ...ctx };
  }

  /**
   * Check if project context is set
   */
  hasProjectContext(): boolean {
    return this.currentContext !== null;
  }

  /**
   * Get the database path used by this VectorStore
   * v5: Returns Faiss index path
   */
  getDbPath(): string {
    return this.config.dbPath;
  }

  /**
   * Initialize the vector store
   * v5: Initializes FaissProvider directly
   */
  async initialize(): Promise<void> {
    // Return early if already initialized
    if (this.isInitialized) {
      if (this.debugMode) {
        log.d("VECTOR", "Already initialized, returning early");
      }
      return;
    }

    // Return existing promise if already initializing
    if (this.isInitializing && this.initializationPromise) {
      if (this.debugMode) {
        log.d("VECTOR", "Initialization in progress, waiting...");
      }
      return this.initializationPromise;
    }

    // Set initialization state and create promise
    this.isInitializing = true;
    this.initializationPromise = this.initializeInternal();

    try {
      await this.initializationPromise;
      this.isInitialized = true;
      if (this.debugMode) {
        log.d("VECTOR", "Initialization completed successfully");
      }
    } catch (error) {
      // Reset state on failure
      this.isInitializing = false;
      this.initializationPromise = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Internal initialization method
   * v5: Initializes FaissProvider as the only backend
   */
  private async initializeInternal(): Promise<void> {
    try {
      // v5: Initialize Faiss provider directly
      const provider = await initializeFaissProvider({
        dimensions: this.config.dimensions,
        indexType: "hnsw",
        hnswM: 32,
        hnswEfConstruction: 200,
        hnswEfSearch: 64,
      });

      if (!provider) {
        throw new Error("Failed to initialize FaissProvider");
      }

      this.faissProvider = provider;

      // Set context on Faiss if already configured
      if (this.currentContext) {
        this.faissProvider.setProjectContext(this.currentContext.projectHash, this.currentContext.branchName);
      }

      log.i("VECTOR", "Initialized with Faiss backend", {
        dimensions: this.config.dimensions,
        mode: "faiss-hnsw",
      });
    } catch (error) {
      log.e("VECTOR", "Initialization failed", { error: (error as Error).message });
      throw new Error(`Failed to initialize vector store`, { cause: error });
    }
  }

  /**
   * Ensure Faiss provider is initialized (for lazy initialization)
   */
  private ensureFaissProvider(): FaissProvider {
    if (!this.faissProvider) {
      throw new Error("VectorStore not initialized. Call initialize() first.");
    }
    return this.faissProvider;
  }

  /**
   * Ensure project context is set before operations
   */
  private ensureContextSet(): ProjectContext {
    if (!this.currentContext) {
      throw new Error(
        "VectorStore project context not set. Call setProjectContext() or setProject() before operations.",
      );
    }
    return this.currentContext;
  }

  /**
   * Get recommended strategy based on current data characteristics
   */
  getStrategy(vectorCount: number, isRebuild = false, queryBatchSize = 1): StrategyRecommendation {
    return getRecommendedStrategy(vectorCount, this.config.dimensions, isRebuild, queryBatchSize);
  }

  /**
   * Insert a single embedding
   * v5: Uses FaissProvider directly
   */
  async insert(embedding: VectorEmbedding): Promise<void> {
    const provider = this.ensureFaissProvider();
    await provider.add(embedding);
  }

  /**
   * Batch insert multiple embeddings
   * v5: Uses FaissProvider directly
   */
  async insertBatch(embeddings: VectorEmbedding[]): Promise<void> {
    const provider = this.ensureFaissProvider();
    const unique = dedupeById(embeddings);
    await provider.addBatch(unique);
  }

  /**
   * Bulk insert with HNSW indexing
   * v5: Same as insertBatch (Faiss HNSW handles bulk efficiently)
   */
  async bulkInsert(embeddings: VectorEmbedding[]): Promise<void> {
    await this.insertBatch(embeddings);
  }

  /**
   * Adaptive bulk insert - v5: Always uses Faiss HNSW
   * @returns Object with stats about the insert operation
   */
  async adaptiveBulkInsert(embeddings: VectorEmbedding[]): Promise<{
    usedFaiss: boolean;
    insertedCount: number;
    timeMs: number;
  }> {
    const provider = this.ensureFaissProvider();
    const unique = dedupeById(embeddings);
    const startTime = performance.now();

    await provider.addBatch(unique);

    const timeMs = performance.now() - startTime;
    log.i("VECTOR", "Bulk insert via Faiss HNSW", { count: unique.length, ms: timeMs.toFixed(1) });

    return {
      usedFaiss: true,
      insertedCount: unique.length,
      timeMs,
    };
  }

  /**
   * Adaptive index rebuild - v5: Faiss HNSW maintains index automatically
   */
  async adaptiveRebuildIndex(_deltaCount?: number): Promise<{
    usedFaiss: boolean;
    strategy: string;
    timeMs: number;
  }> {
    const startTime = performance.now();

    // Faiss HNSW maintains index automatically - no rebuild needed
    const timeMs = performance.now() - startTime;

    return {
      usedFaiss: true,
      strategy: "faiss-hnsw-live",
      timeMs,
    };
  }

  /**
   * Adaptive search - v5: Always uses Faiss HNSW
   * v6: Enriches results from LibSQL
   */
  async adaptiveSearch(
    queryVector: Float32Array,
    limit = 10,
  ): Promise<{ results: SimilarityResult[]; usedFaiss: boolean }> {
    const provider = this.ensureFaissProvider();
    const rawResults = await provider.search(queryVector, limit);
    const results = await this.enrichResultsFromLibSQL(rawResults);
    return { results, usedFaiss: true };
  }

  /**
   * Drop vector index - v5: No-op (Faiss HNSW handles live updates)
   */
  async dropVectorIndex(): Promise<void> {
    // Faiss HNSW handles live updates, no need to drop index
    log.d("VECTOR", "dropVectorIndex: no-op with Faiss HNSW");
  }

  /**
   * Rebuild vector index - v5: No-op (Faiss HNSW maintains index automatically)
   */
  async rebuildVectorIndex(): Promise<void> {
    // Faiss HNSW maintains index automatically
    log.d("VECTOR", "rebuildVectorIndex: no-op with Faiss HNSW");
  }

  /**
   * Flush and save Faiss index to disk
   * v5: Saves both Faiss index and content cache
   */
  async flushAndSave(): Promise<{ flushed: number; saved: boolean }> {
    const provider = this.ensureFaissProvider();

    try {
      const flushed = await provider.flush();
      await provider.save();

      log.i("VECTOR", "Saved Faiss index to disk", { flushed });

      return { flushed, saved: true };
    } catch (error) {
      log.e("VECTOR", "flushAndSave failed", { error: (error as Error).message });
      return { flushed: 0, saved: false };
    }
  }

  /**
   * Search for similar vectors
   * v6: Uses Faiss HNSW search, enriches results from LibSQL
   */
  async search(queryVector: Float32Array, limit = 10): Promise<SimilarityResult[]> {
    const provider = this.ensureFaissProvider();
    const rawResults = await provider.search(queryVector, limit);

    // Enrich results with entity data from LibSQL
    return await this.enrichResultsFromLibSQL(rawResults);
  }

  /**
   * Enrich search results with entity data from LibSQL
   */
  private async enrichResultsFromLibSQL(results: SimilarityResult[]): Promise<SimilarityResult[]> {
    if (results.length === 0) return results;

    try {
      const { getGraphStorage } = await import("../storage/graph-storage-factory.js");
      const storage = await getGraphStorage();

      // Extract entity IDs from result IDs (format: "ent:{entityId}")
      const entityIds = results.map((r) => (r.id.startsWith("ent:") ? r.id.slice(4) : r.id));

      // Batch fetch entities from LibSQL (parallel getEntity calls)
      const entities = await Promise.all(entityIds.map((id) => storage.getEntity(id)));
      const entityMap = new Map<string, NonNullable<(typeof entities)[0]>>();
      for (let i = 0; i < entityIds.length; i++) {
        const entity = entities[i];
        if (entity) {
          entityMap.set(entityIds[i]!, entity);
        }
      }

      // Enrich results
      return results.map((r) => {
        const entityId = r.id.startsWith("ent:") ? r.id.slice(4) : r.id;
        const entity = entityMap.get(entityId);
        if (entity) {
          return {
            ...r,
            content: entity.name || "",
            metadata: {
              ...r.metadata,
              entityId,
              type: entity.type,
              filePath: entity.filePath,
              name: entity.name,
              // Add location info for better navigation
              startLine: entity.location?.start?.line,
              endLine: entity.location?.end?.line,
              startColumn: entity.location?.start?.column,
              endColumn: entity.location?.end?.column,
            },
          };
        }
        return r;
      });
    } catch (error) {
      log.w("VECTOR", "Failed to enrich results from LibSQL", { error: (error as Error).message });
      return results;
    }
  }

  /**
   * Advanced similarity search with filters and threshold
   * v5: Uses Faiss search with post-filtering
   */
  async searchWithFilters(
    queryVector: Float32Array,
    options: {
      limit?: number;
      threshold?: number | undefined;
      metadataFilter?: Record<string, unknown>;
      dateRange?: { start?: number; end?: number };
    } = {},
  ): Promise<SimilarityResult[]> {
    const provider = this.ensureFaissProvider();
    const { limit = 10, threshold = 0.0, metadataFilter, dateRange } = options;

    // Get more results for filtering
    const expandedLimit = metadataFilter || dateRange ? limit * 10 : limit;
    const results = await provider.search(queryVector, expandedLimit);

    // Enrich results with entity data from LibSQL BEFORE filtering
    // This allows filtering by metadata from LibSQL (type, filePath, etc.)
    const enriched = await this.enrichResultsFromLibSQL(results);

    // Apply post-filtering
    let filtered = enriched;

    // Filter by threshold
    if (threshold > 0) {
      filtered = filtered.filter((r) => r.similarity >= threshold);
    }

    // Filter by metadata
    if (metadataFilter) {
      filtered = filtered.filter((r) => {
        if (!r.metadata) return false;
        for (const [k, v] of Object.entries(metadataFilter)) {
          if (r.metadata[k] !== v) return false;
        }
        return true;
      });
    }

    // Filter by date range (if metadata contains createdAt)
    if (dateRange) {
      filtered = filtered.filter((r) => {
        const createdAt = r.metadata?.["createdAt"] as number | undefined;
        if (!createdAt) return true; // Include if no createdAt
        if (dateRange.start != null && createdAt < dateRange.start) return false;
        if (dateRange.end != null && createdAt > dateRange.end) return false;
        return true;
      });
    }

    return filtered.slice(0, limit);
  }

  /**
   * Get embedding by ID
   * v6: Gets metadata from LibSQL (content not stored in Faiss)
   */
  async get(id: string): Promise<VectorEmbedding | null> {
    const provider = this.ensureFaissProvider();
    if (!provider.hasId(id)) return null;

    // Try to get entity data from LibSQL
    try {
      const { getGraphStorage } = await import("../storage/graph-storage-factory.js");
      const storage = await getGraphStorage();
      // ID format: "ent:{entityId}" - extract entity ID
      const entityId = id.startsWith("ent:") ? id.slice(4) : id;
      const entity = await storage.getEntity(entityId);
      if (entity) {
        return {
          id,
          content: entity.name || "",
          vector: new Float32Array(0),
          metadata: { entityId, type: entity.type, filePath: entity.filePath },
          createdAt: entity.createdAt || Date.now(),
        };
      }
    } catch {
      // Ignore LibSQL errors
    }

    // Return minimal embedding if entity not found in LibSQL
    return {
      id,
      content: "",
      vector: new Float32Array(0),
      createdAt: Date.now(),
    };
  }

  /**
   * Batch check which IDs already exist
   * v6: Uses FaissProvider ID set
   */
  async getExistingIds(ids: string[]): Promise<Set<string>> {
    const provider = this.ensureFaissProvider();
    return provider.getExistingIds(ids);
  }

  /**
   * Update an existing embedding
   * v6: Remove and re-add (Faiss doesn't support in-place updates)
   */
  async update(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    const provider = this.ensureFaissProvider();

    // Check if ID exists
    if (!provider.hasId(id)) {
      throw new Error(`Embedding with id=${id} not found`);
    }

    // Remove old embedding
    await provider.remove([id]);

    // Add new embedding
    await provider.add({
      id,
      content: "", // Content stored in LibSQL
      vector,
      metadata,
      createdAt: Date.now(),
    });
  }

  /**
   * Delete an embedding
   * v5: Removes from Faiss
   */
  async delete(id: string): Promise<void> {
    const provider = this.ensureFaissProvider();
    await provider.remove([id]);
  }

  /**
   * Get total number of embeddings
   * v5: Gets count from Faiss
   */
  async count(): Promise<number> {
    const provider = this.ensureFaissProvider();
    return await provider.getVectorCount();
  }

  /**
   * Clear all embeddings for current project
   * v5: Note - this only clears Faiss, not graph data
   */
  async clear(): Promise<void> {
    // TODO: Implement clear in FaissProvider
    log.w("VECTOR", "clear() not fully implemented for Faiss-only mode");
  }

  /**
   * Clear ALL embeddings from ALL projects
   * WARNING: This is a destructive operation
   */
  async clearAll(): Promise<void> {
    log.w("VECTOR", "clearAll() not implemented for Faiss-only mode");
  }

  /**
   * Close the vector store
   * v5: Saves Faiss index before closing
   */
  async close(): Promise<void> {
    if (this.faissProvider) {
      await this.faissProvider.save();
      // Note: FaissProvider is a singleton, don't close it
    }
    this.isInitialized = false;
    log.d("VECTOR", "Closed (Faiss index saved)");
  }

  /**
   * Get the underlying FAISS provider for direct access
   * Used by EmbeddingAccumulator for batch flush operations
   */
  getFaissProvider(): FaissProvider | null {
    return this.faissProvider;
  }

  /**
   * Get database statistics
   * v5: Gets stats from Faiss
   */
  async getStats(): Promise<{
    totalEmbeddings: number;
    dbSizeMB: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    const provider = this.ensureFaissProvider();
    const stats = await provider.getStats();

    return {
      totalEmbeddings: stats.totalVectors,
      dbSizeMB: 0, // Not easily available
      oldestEntry: null,
      newestEntry: null,
    };
  }

  /**
   * Batch search for multiple query vectors
   * v5: Uses Faiss batch search
   * v6: Enriches results from LibSQL
   */
  async batchSearch(queryVectors: Float32Array[], limit = 10): Promise<SimilarityResult[][]> {
    const provider = this.ensureFaissProvider();
    const rawResults = await provider.batchSearch(queryVectors, limit);

    // Enrich all results in parallel
    const enrichedResults = await Promise.all(rawResults.map((results) => this.enrichResultsFromLibSQL(results)));

    return enrichedResults;
  }

  /**
   * Find vectors within a specific distance threshold (radius search)
   */
  async searchWithinRadius(queryVector: Float32Array, radius: number, limit = 100): Promise<SimilarityResult[]> {
    const threshold = Math.max(0, 1 - radius); // Convert radius to similarity threshold
    return this.searchWithFilters(queryVector, { limit, threshold });
  }

  /**
   * Get performance statistics for vector backend
   * v5: Returns Faiss HNSW stats
   */
  getVectorStats(): {
    hasExtension: boolean;
    extensionVersion?: string;
    optimizedOperations: boolean;
    backend: "faiss";
    backendInfo?: any;
  } {
    return {
      hasExtension: true,
      optimizedOperations: true,
      backend: "faiss",
      backendInfo: {
        type: "Faiss HNSW",
        persistent: true,
        note: "In-memory HNSW index with disk persistence",
      },
    };
  }

  /**
   * Get backend information
   * v5: Returns Faiss backend info
   */
  getBackendInfo(): {
    currentBackend: "faiss";
    vectorCount: number;
    recommended: boolean;
    performance: {
      insertSpeed: string;
      searchSpeed: string;
      accuracy: string;
      memoryUsage: string;
      persistent: boolean;
    };
  } {
    return {
      currentBackend: "faiss",
      vectorCount: 0, // Would need async call to get actual count
      recommended: true,
      performance: {
        insertSpeed: "very-fast",
        searchSpeed: "very-fast",
        accuracy: "approximate",
        memoryUsage: "medium",
        persistent: true,
      },
    };
  }

  // =============================================================================
  // CROSS-BRANCH OPERATIONS
  // v5: These require loading different Faiss indexes, not implemented yet
  // =============================================================================

  /**
   * Search for similar vectors in a specific branch
   * v5: Not implemented - would require loading different Faiss index
   */
  async searchInBranch(queryVector: Float32Array, _targetBranch: string, limit = 10): Promise<SimilarityResult[]> {
    // For now, just search in current context
    log.w("VECTOR", "searchInBranch: cross-branch search not implemented, using current context");
    return await this.search(queryVector, limit);
  }

  /**
   * Compare embeddings between two branches
   * v5: Not implemented - would require loading different Faiss indexes
   */
  async compareEmbeddingsBetweenBranches(
    _queryVector: Float32Array,
    _branch1: string,
    _branch2: string,
    _limit = 10,
  ): Promise<{
    branch1Results: SimilarityResult[];
    branch2Results: SimilarityResult[];
    onlyInBranch1: SimilarityResult[];
    onlyInBranch2: SimilarityResult[];
    inBoth: Array<{ id: string; branch1Similarity: number; branch2Similarity: number }>;
  }> {
    log.w("VECTOR", "compareEmbeddingsBetweenBranches: not implemented in Faiss-only mode");
    return {
      branch1Results: [],
      branch2Results: [],
      onlyInBranch1: [],
      onlyInBranch2: [],
      inBoth: [],
    };
  }

  /**
   * List all branches that have embeddings for current project
   * v5: Not implemented - Faiss index is per-project/branch
   */
  async listBranches(): Promise<string[]> {
    // Return current branch only
    const ctx = this.ensureContextSet();
    return [ctx.branchName];
  }

  /**
   * Get embedding count per branch for current project
   * v5: Returns only current branch count
   */
  async getCountPerBranch(): Promise<Array<{ branchName: string; count: number }>> {
    const ctx = this.ensureContextSet();
    const count = await this.count();
    return [{ branchName: ctx.branchName, count }];
  }

  /**
   * Delete all embeddings for a specific branch
   * v5: Not implemented
   */
  async deleteBranch(_branchName: string): Promise<number> {
    log.w("VECTOR", "deleteBranch: not implemented in Faiss-only mode");
    return 0;
  }

  /**
   * Copy embeddings from one branch to another
   * v5: Not implemented
   */
  async copyBranch(_sourceBranch: string, _targetBranch: string): Promise<number> {
    log.w("VECTOR", "copyBranch: not implemented in Faiss-only mode");
    return 0;
  }
}
