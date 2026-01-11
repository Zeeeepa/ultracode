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
import { getProjectHash, normalizeBranchName } from "../shared/storage-paths.js";
import type { ProjectContext } from "../storage/libsql-graph-adapter.js";
import type { SimilarityResult, VectorEmbedding, VectorStoreConfig } from "../types/semantic.js";
import { type FaissProvider, initializeFaissProvider } from "./faiss/faiss-provider.js";
import { LayeredFaissProvider } from "./faiss/layered-faiss-provider.js";
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

  // v6: Optional layered provider for base + delta architecture
  private layeredProvider: LayeredFaissProvider | null = null;
  private useLayeredIndex: boolean;

  // Initialization state management
  private isInitialized = false;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private debugMode = process.env["VECTOR_STORE_DEBUG"] === "true";

  // Project context for multi-project support
  // MUST be set via setProjectContext() before any operations
  private currentContext: ProjectContext | null = null;
  private currentProjectPath: string | null = null;

  constructor(config: Partial<VectorStoreConfig> = {}) {
    this.useLayeredIndex = config.useLayeredIndex ?? false;
    log.d("VECTOR", this.useLayeredIndex ? "v6: Layered Faiss backend" : "v5: Faiss-only backend");

    this.config = {
      dbPath: config.dbPath || "",
      dimensions: config.dimensions || DEFAULT_CONFIG.dimensions!,
      workingDirectory: config.workingDirectory,
      libsql: config.libsql,
      useLayeredIndex: this.useLayeredIndex,
    };
  }

  /**
   * Set the current project context for all subsequent operations
   * v5: Async because FaissProvider may need to save/load indexes on context switch
   * v6: Also initializes/switches LayeredFaissProvider
   */
  async setProjectContext(context: ProjectContext): Promise<void> {
    this.currentContext = context;

    if (this.useLayeredIndex && this.layeredProvider) {
      // v6: Layered provider - check if initialized
      const isInitialized = (this.layeredProvider as any).isInitialized;
      const projectPath = this.currentProjectPath || this.config.workingDirectory || "";
      if (!isInitialized) {
        // First time setting context - initialize the provider
        const success = await this.layeredProvider.initialize(projectPath, context.projectHash, context.branchName);
        if (!success) {
          log.e("VECTOR", "Failed to initialize LayeredFaissProvider on context set");
        }
      } else {
        // Already initialized - switch branch
        await this.layeredProvider.switchBranch(context.branchName);
      }
    } else if (this.faissProvider) {
      // v5: Set context on FaissProvider (may switch indexes)
      await this.faissProvider.setProjectContext(context.projectHash, context.branchName);
    }

    log.d("VECTOR", "Context set", {
      project: context.projectHash,
      branch: context.branchName,
      layered: this.useLayeredIndex,
    });
  }

  /**
   * Set project context from path and branch
   * v5: Async because FaissProvider may need to save/load indexes on context switch
   */
  async setProject(projectPath: string, branchName: string): Promise<void> {
    this.currentProjectPath = projectPath;
    await this.setProjectContext({
      projectHash: getProjectHash(projectPath),
      branchName: normalizeBranchName(branchName),
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
   * v6: Optionally initializes LayeredFaissProvider for base + delta architecture
   */
  private async initializeInternal(): Promise<void> {
    try {
      if (this.useLayeredIndex) {
        // v6: Initialize layered provider (requires context to be set!)
        if (!this.currentContext) {
          // Layered provider needs project context at init time
          // Fall back to standard provider, context will be set later
          log.w("VECTOR", "Layered index requires context, deferring initialization");
          this.layeredProvider = new LayeredFaissProvider({
            dimensions: this.config.dimensions,
            indexType: "hnsw",
            hnswM: 32,
            hnswEfConstruction: 200,
            hnswEfSearch: 64,
          });
        } else {
          this.layeredProvider = new LayeredFaissProvider({
            dimensions: this.config.dimensions,
            indexType: "hnsw",
            hnswM: 32,
            hnswEfConstruction: 200,
            hnswEfSearch: 64,
          });

          const success = await this.layeredProvider.initialize(
            this.config.workingDirectory || "",
            this.currentContext.projectHash,
            this.currentContext.branchName,
          );

          if (!success) {
            throw new Error("Failed to initialize LayeredFaissProvider");
          }
        }

        log.i("VECTOR", "Initialized with Layered Faiss backend", {
          dimensions: this.config.dimensions,
          mode: "layered-base-delta",
        });
      } else {
        // v5: Initialize standard Faiss provider
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
      }
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
   * Ensure layered provider is initialized with context
   */
  private async ensureLayeredProviderInitialized(): Promise<LayeredFaissProvider> {
    if (!this.layeredProvider) {
      throw new Error("VectorStore not initialized. Call initialize() first.");
    }

    // Lazy initialization if context was set after initialization
    if (this.currentContext) {
      const success = await this.layeredProvider.initialize(
        this.config.workingDirectory || "",
        this.currentContext.projectHash,
        this.currentContext.branchName,
      );
      if (!success) {
        throw new Error("Failed to initialize LayeredFaissProvider with context");
      }
    } else {
      throw new Error("LayeredFaissProvider requires project context. Call setProjectContext() first.");
    }

    return this.layeredProvider;
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
   * v6: Uses LayeredFaissProvider when enabled
   */
  async insert(embedding: VectorEmbedding): Promise<void> {
    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      await provider.add(embedding);
    } else {
      const provider = this.ensureFaissProvider();
      await provider.add(embedding);
    }
  }

  /**
   * Batch insert multiple embeddings
   * v5: Uses FaissProvider directly
   * v6: Uses LayeredFaissProvider when enabled
   */
  async insertBatch(embeddings: VectorEmbedding[]): Promise<void> {
    const unique = dedupeById(embeddings);

    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      await provider.addBatch(unique);
    } else {
      const provider = this.ensureFaissProvider();
      await provider.addBatch(unique);
    }
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
   * v6: Uses LayeredFaissProvider when enabled
   * @returns Object with stats about the insert operation
   */
  async adaptiveBulkInsert(embeddings: VectorEmbedding[]): Promise<{
    usedFaiss: boolean;
    insertedCount: number;
    timeMs: number;
  }> {
    const unique = dedupeById(embeddings);
    const startTime = performance.now();

    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      await provider.addBatch(unique);
    } else {
      const provider = this.ensureFaissProvider();
      await provider.addBatch(unique);
    }

    const timeMs = performance.now() - startTime;
    log.i("VECTOR", "Bulk insert via Faiss HNSW", {
      count: unique.length,
      ms: timeMs.toFixed(1),
      layered: this.useLayeredIndex,
    });

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
   * v6: Uses LayeredFaissProvider when enabled, enriches results from LibSQL
   */
  async adaptiveSearch(
    queryVector: Float32Array,
    limit = 10,
  ): Promise<{ results: SimilarityResult[]; usedFaiss: boolean }> {
    let rawResults: SimilarityResult[];

    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      rawResults = await provider.searchForVectorStore(queryVector, limit);
    } else {
      const provider = this.ensureFaissProvider();
      rawResults = await provider.search(queryVector, limit);
    }

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
   * v6: Also saves layered provider state
   */
  async flushAndSave(): Promise<{ flushed: number; saved: boolean }> {
    try {
      let flushed = 0;

      if (this.useLayeredIndex && this.layeredProvider) {
        await this.layeredProvider.save();
        // Layered provider doesn't have a flush count
        flushed = 0;
      } else if (this.faissProvider) {
        flushed = await this.faissProvider.flush();
        await this.faissProvider.save();
      }

      log.i("VECTOR", "Saved Faiss index to disk", { flushed, layered: this.useLayeredIndex });

      return { flushed, saved: true };
    } catch (error) {
      log.e("VECTOR", "flushAndSave failed", { error: (error as Error).message });
      return { flushed: 0, saved: false };
    }
  }

  /**
   * Search for similar vectors
   * v6: Uses Faiss HNSW search or LayeredFaissProvider, enriches results from LibSQL
   */
  async search(queryVector: Float32Array, limit = 10): Promise<SimilarityResult[]> {
    let rawResults: SimilarityResult[];

    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      rawResults = await provider.searchForVectorStore(queryVector, limit);
    } else {
      const provider = this.ensureFaissProvider();
      rawResults = await provider.search(queryVector, limit);
    }

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
   * v6: Supports LayeredFaissProvider
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
    const { limit = 10, threshold = 0.0, metadataFilter, dateRange } = options;

    // Get more results for filtering
    const expandedLimit = metadataFilter || dateRange ? limit * 10 : limit;

    let results: SimilarityResult[];
    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      results = await provider.searchForVectorStore(queryVector, expandedLimit);
    } else {
      const provider = this.ensureFaissProvider();
      results = await provider.search(queryVector, expandedLimit);
    }

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
   * v6: Supports LayeredFaissProvider
   */
  async get(id: string): Promise<VectorEmbedding | null> {
    // Check if ID exists
    let hasId = false;
    if (this.useLayeredIndex && this.layeredProvider) {
      hasId = this.layeredProvider.has(id);
    } else if (this.faissProvider) {
      hasId = this.faissProvider.hasId(id);
    }

    if (!hasId) return null;

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
   * v6: Uses FaissProvider ID set or LayeredFaissProvider
   */
  async getExistingIds(ids: string[]): Promise<Set<string>> {
    if (this.useLayeredIndex && this.layeredProvider) {
      // Check each ID via layered provider's has() method
      const existing = new Set<string>();
      for (const id of ids) {
        if (this.layeredProvider.has(id)) {
          existing.add(id);
        }
      }
      return existing;
    }

    const provider = this.ensureFaissProvider();
    return provider.getExistingIds(ids);
  }

  /**
   * Update an existing embedding
   * v6: Remove and re-add (Faiss doesn't support in-place updates)
   * v6: Supports LayeredFaissProvider
   */
  async update(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();

      // Check if ID exists
      if (!provider.has(id)) {
        throw new Error(`Embedding with id=${id} not found`);
      }

      // Remove old embedding
      await provider.remove(id);

      // Add new embedding
      await provider.add({
        id,
        content: "", // Content stored in LibSQL
        vector,
        metadata,
        createdAt: Date.now(),
      });
    } else {
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
  }

  /**
   * Delete an embedding
   * v5: Removes from Faiss
   * v6: Supports LayeredFaissProvider (uses tombstones on feature branches)
   */
  async delete(id: string): Promise<void> {
    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      await provider.remove(id);
    } else {
      const provider = this.ensureFaissProvider();
      await provider.remove([id]);
    }
  }

  /**
   * Get total number of embeddings
   * v5: Gets count from Faiss
   * v6: Supports LayeredFaissProvider
   */
  async count(): Promise<number> {
    if (this.useLayeredIndex) {
      const provider = await this.ensureLayeredProviderInitialized();
      const stats = await provider.getStats();
      return stats.totalVectors;
    }

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
   * v6: Also saves LayeredFaissProvider state
   */
  async close(): Promise<void> {
    if (this.useLayeredIndex && this.layeredProvider) {
      await this.layeredProvider.save();
    } else if (this.faissProvider) {
      await this.faissProvider.save();
      // Note: FaissProvider is a singleton, don't close it
    }
    this.isInitialized = false;
    log.d("VECTOR", "Closed (Faiss index saved)", { layered: this.useLayeredIndex });
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
    let stats: { totalVectors: number };

    if (this.useLayeredIndex && this.layeredProvider) {
      stats = await this.layeredProvider.getStats();
    } else {
      const provider = this.ensureFaissProvider();
      stats = await provider.getStats();
    }

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
   * v6: Uses LayeredFaissProvider when enabled, enriches results from LibSQL
   */
  async batchSearch(queryVectors: Float32Array[], limit = 10): Promise<SimilarityResult[][]> {
    let rawResults: SimilarityResult[][];

    if (this.useLayeredIndex) {
      // Layered provider doesn't have batchSearch, use sequential search
      const provider = await this.ensureLayeredProviderInitialized();
      rawResults = await Promise.all(queryVectors.map((qv) => provider.searchForVectorStore(qv, limit)));
    } else {
      const provider = this.ensureFaissProvider();
      rawResults = await provider.batchSearch(queryVectors, limit);
    }

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
