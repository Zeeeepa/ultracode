/**
 * Vector Store Manager - Unified LibSQL Backend
 *
 * Manages vector storage and similarity search using the unified LibSQL storage.
 * Now uses the same database as GraphStorage for consistency.
 *
 * v4: Uses LibSQLGraphAdapter from graph-storage-factory for unified storage
 *
 * External Dependencies:
 * - @libsql/client: https://github.com/tursodatabase/libsql-client-ts - LibSQL with DiskANN
 *
 * @history
 *  - 2025-09-14: Created - Initial vector store implementation
 *  - 2025-12-11: Refactored - LibSQL DiskANN as only backend (no fallback)
 *  - 2025-12-11: v4 - Unified storage with GraphStorage
 */

// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { LRUCache } from "lru-cache";
import type { VectorBackend as GPUVectorBackend } from "../gpu/backends/base.js";
import { DEFAULT_BRANCH, getProjectHash, normalizeBranchName } from "../shared/storage-paths.js";
import { getGraphStorage, getLibSQLAdapter } from "../storage/graph-storage-factory.js";
import type { LibSQLGraphAdapter, ProjectContext } from "../storage/libsql-graph-adapter.js";
import type { SimilarityResult, VectorEmbedding, VectorStoreConfig } from "../types/semantic.js";

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
  // v4: Uses unified LibSQLGraphAdapter from graph-storage-factory
  private adapter: LibSQLGraphAdapter | null = null;

  // Initialization state management
  private isInitialized = false;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private debugMode = process.env.VECTOR_STORE_DEBUG === "true";

  // Project context for multi-project support
  private currentContext: ProjectContext = {
    projectHash: "legacy",
    branchName: DEFAULT_BRANCH,
  };

  // GPU backend support (CUDA/WebGPU acceleration)
  private gpuBackend: GPUVectorBackend | null = null;
  private useGPU = false;

  // LRU cache for parsed metadata
  private metadataCache = new LRUCache<string, Record<string, unknown>>({
    max: 10000,
    ttl: 1000 * 60 * 5, // 5 minutes TTL
  });

  constructor(config: Partial<VectorStoreConfig> = {}) {
    // v4: dbPath is now managed by graph-storage-factory
    console.error(`[VectorStore] Using unified storage from graph-storage-factory`);

    this.config = {
      dbPath: config.dbPath || "",
      dimensions: config.dimensions || DEFAULT_CONFIG.dimensions!,
      workingDirectory: config.workingDirectory,
      libsql: config.libsql,
    };
  }

  /**
   * Set the current project context for all subsequent operations
   */
  setProjectContext(context: ProjectContext): void {
    this.currentContext = context;
    // v4: Also set context on the adapter if available
    if (this.adapter) {
      this.adapter.setProjectContext(context);
    }
    console.error(`[VectorStore] Context set: project=${context.projectHash}, branch=${context.branchName}`);
  }

  /**
   * Set project context from path and branch
   */
  setProject(projectPath: string, branchName?: string): void {
    this.setProjectContext({
      projectHash: getProjectHash(projectPath),
      branchName: normalizeBranchName(branchName || DEFAULT_BRANCH),
    });
  }

  /**
   * Get current project context
   */
  getProjectContext(): ProjectContext {
    return { ...this.currentContext };
  }

  /**
   * Get the database path used by this VectorStore
   */
  getDbPath(): string {
    return this.adapter?.getDbPath() || this.config.dbPath;
  }

  /**
   * Initialize the vector store database
   * v4: Now uses unified storage from graph-storage-factory
   */
  async initialize(): Promise<void> {
    // Return early if already initialized
    if (this.isInitialized) {
      if (this.debugMode) {
        console.error(`[VectorStore] Already initialized, returning early`);
      }
      return;
    }

    // Return existing promise if already initializing
    if (this.isInitializing && this.initializationPromise) {
      if (this.debugMode) {
        console.error(`[VectorStore] Initialization in progress, waiting...`);
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
        console.error(`[VectorStore] Initialization completed successfully`);
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
   * v4: Uses LibSQLGraphAdapter from graph-storage-factory
   */
  private async initializeInternal(): Promise<void> {
    try {
      // v4: Get the unified adapter from graph-storage-factory
      // This ensures GraphStorage is initialized first and we share the same DB
      await getGraphStorage();
      this.adapter = getLibSQLAdapter();

      if (!this.adapter || !this.adapter.isReady()) {
        throw new Error("LibSQL adapter not available from graph-storage-factory");
      }

      // Set context on adapter
      this.adapter.setProjectContext(this.currentContext);

      console.error(`[VectorStore] Using unified storage from graph-storage-factory`);

      // GPU backend initialization (optional, for accelerated similarity search)
      await this.initializeGPUBackend();

      console.error(`[VectorStore] Initialized with ${this.config.dimensions} dimensions (unified storage)`);
    } catch (error) {
      console.error("[VectorStore] Initialization failed:", error);
      throw new Error(`Failed to initialize vector store`, { cause: error });
    }
  }

  /**
   * Initialize GPU backend for accelerated similarity search
   * Tries CUDA, then WebGPU, then falls back to CPU
   */
  private async initializeGPUBackend(): Promise<void> {
    if (process.env.VECTOR_STORE_DISABLE_GPU === "true") {
      console.error("[VectorStore] GPU acceleration disabled via env");
      return;
    }

    try {
      const { BackendSelector } = await import("../gpu/backend-selector.js");
      const selector = BackendSelector.getInstance();
      this.gpuBackend = await selector.initialize();
      this.useGPU = true;

      const info = selector.getInfo();
      console.error(`[VectorStore] GPU backend initialized: ${info.selected}`);
      console.error(`[VectorStore] Available backends: ${info.available.join(", ")}`);
    } catch (error) {
      // GPU not available, use CPU fallback
      if (this.debugMode) {
        console.error("[VectorStore] GPU backend not available:", (error as Error).message);
      }
      console.error("[VectorStore] Using CPU (SIMD) for similarity search");
      this.useGPU = false;
    }
  }

  /**
   * Insert a single embedding
   */
  async insert(embedding: VectorEmbedding): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    await this.adapter.insertEmbedding(embedding);
  }

  /**
   * Batch insert multiple embeddings
   */
  async insertBatch(embeddings: VectorEmbedding[]): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const unique = dedupeById(embeddings);
    const { projectHash } = this.currentContext;

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    await this.adapter.insertEmbeddingBatch(unique);
    console.error(
      `[VectorStore] Inserted batch of ${unique.length} embeddings (unified storage, project=${projectHash})`,
    );
  }

  /**
   * Search for similar vectors using cosine similarity
   */
  async search(queryVector: Float32Array, limit = 10): Promise<SimilarityResult[]> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    return await this.adapter.searchVectors(queryVector, limit);
  }

  /**
   * Advanced similarity search with filters and threshold
   */
  async searchWithFilters(
    queryVector: Float32Array,
    options: {
      limit?: number;
      threshold?: number;
      metadataFilter?: Record<string, unknown>;
      dateRange?: { start?: number; end?: number };
    } = {},
  ): Promise<SimilarityResult[]> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { limit = 10, threshold = 0.0, metadataFilter, dateRange } = options;

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);

    // Get more results for filtering
    const expandedLimit = metadataFilter || dateRange ? limit * 10 : limit;
    const results = await this.adapter.searchVectors(queryVector, expandedLimit);

    // Apply post-filtering
    let filtered = results;

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
        const createdAt = r.metadata?.createdAt as number | undefined;
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
   */
  async get(id: string): Promise<VectorEmbedding | null> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    return await this.adapter.getEmbedding(id);
  }

  /**
   * Update an existing embedding
   */
  async update(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);

    // Invalidate cache for this id
    this.metadataCache.delete(id);

    // Get existing embedding to preserve content
    const existing = await this.adapter.getEmbedding(id);
    if (!existing) {
      throw new Error(`Embedding with id=${id} not found`);
    }

    // Delete and re-insert with new vector
    await this.adapter.deleteEmbedding(id);
    await this.adapter.insertEmbedding({
      id,
      content: existing.content,
      vector,
      metadata: metadata ?? existing.metadata,
      createdAt: Date.now(),
    });
  }

  /**
   * Delete an embedding
   */
  async delete(id: string): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    await this.adapter.deleteEmbedding(id);
  }

  /**
   * Get total number of embeddings
   */
  async count(): Promise<number> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    return await this.adapter.getEmbeddingCount();
  }

  /**
   * Clear all embeddings for current project context
   * v4: Uses unified clear which clears all data for project, not just embeddings
   */
  async clear(): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { projectHash, branchName } = this.currentContext;
    // Note: This clears entities, relationships AND embeddings in v4
    this.adapter.setProjectContext(this.currentContext);
    await this.adapter.clear();
    console.error(`[VectorStore] Cleared data for project=${projectHash}, branch=${branchName}`);
  }

  /**
   * Clear ALL embeddings from ALL projects
   * WARNING: This is a destructive operation for testing/admin only
   */
  async clearAll(): Promise<void> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    await this.adapter.clearAll();
    console.error("[VectorStore] Cleared ALL data from ALL projects");
  }

  /**
   * Close the database connection
   * v4: Does NOT close adapter - it's managed by graph-storage-factory
   */
  async close(): Promise<void> {
    // v4: Don't close the adapter - it's shared with GraphStorage
    // The graph-storage-factory manages the adapter lifecycle
    this.adapter = null;
    this.isInitialized = false;
    console.error("[VectorStore] Disconnected from unified storage (adapter remains open)");
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalEmbeddings: number;
    dbSizeMB: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    const count = await this.adapter.getEmbeddingCount();

    return {
      totalEmbeddings: count,
      dbSizeMB: 0, // Not easily available from libsql
      oldestEntry: null,
      newestEntry: null,
    };
  }

  /**
   * Batch search for multiple query vectors
   */
  async batchSearch(queryVectors: Float32Array[], limit = 10): Promise<SimilarityResult[][]> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const results: SimilarityResult[][] = [];

    for (const queryVector of queryVectors) {
      const searchResults = await this.search(queryVector, limit);
      results.push(searchResults);
    }

    return results;
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
   */
  getVectorStats(): {
    hasExtension: boolean;
    extensionVersion?: string;
    optimizedOperations: boolean;
    backend: "libsql";
    backendInfo?: any;
    gpuAcceleration?: {
      enabled: boolean;
      backend?: string;
      capabilities?: any;
    };
  } {
    const gpuInfo = {
      enabled: this.useGPU,
      backend: this.gpuBackend?.name,
      capabilities: this.gpuBackend?.getCapabilities(),
    };

    return {
      hasExtension: true,
      optimizedOperations: true,
      backend: "libsql",
      backendInfo: {
        type: "DiskANN (unified)",
        persistent: true,
        note: "Unified LibSQL storage - graph and vectors in single database",
      },
      gpuAcceleration: gpuInfo,
    };
  }

  /**
   * Get backend information
   */
  getBackendInfo(): {
    currentBackend: "libsql";
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
      currentBackend: "libsql",
      vectorCount: 0, // Would need async call to get actual count
      recommended: true,
      performance: {
        insertSpeed: "fast",
        searchSpeed: "fast",
        accuracy: "approximate",
        memoryUsage: "low",
        persistent: true,
      },
    };
  }

  // =============================================================================
  // CROSS-BRANCH OPERATIONS
  // =============================================================================

  /**
   * Search for similar vectors in a specific branch
   * Allows cross-branch queries without changing context
   */
  async searchInBranch(queryVector: Float32Array, targetBranch: string, limit = 10): Promise<SimilarityResult[]> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { projectHash } = this.currentContext;
    const normalizedBranch = normalizeBranchName(targetBranch);

    // Temporarily switch context for search
    const currentContext = this.adapter.getProjectContext();
    this.adapter.setProjectContext({ projectHash, branchName: normalizedBranch });

    try {
      return await this.adapter.searchVectors(queryVector, limit);
    } finally {
      this.adapter.setProjectContext(currentContext);
    }
  }

  /**
   * Compare embeddings between two branches
   * Useful for merge operations and branch comparison
   */
  async compareEmbeddingsBetweenBranches(
    queryVector: Float32Array,
    branch1: string,
    branch2: string,
    limit = 10,
  ): Promise<{
    branch1Results: SimilarityResult[];
    branch2Results: SimilarityResult[];
    onlyInBranch1: SimilarityResult[];
    onlyInBranch2: SimilarityResult[];
    inBoth: Array<{ id: string; branch1Similarity: number; branch2Similarity: number }>;
  }> {
    const results1 = await this.searchInBranch(queryVector, branch1, limit * 2);
    const results2 = await this.searchInBranch(queryVector, branch2, limit * 2);

    const ids1 = new Set(results1.map((r) => r.id));
    const ids2 = new Set(results2.map((r) => r.id));

    const onlyInBranch1 = results1.filter((r) => !ids2.has(r.id)).slice(0, limit);
    const onlyInBranch2 = results2.filter((r) => !ids1.has(r.id)).slice(0, limit);

    const inBoth: Array<{ id: string; branch1Similarity: number; branch2Similarity: number }> = [];
    for (const r1 of results1) {
      if (ids2.has(r1.id)) {
        const r2 = results2.find((r) => r.id === r1.id);
        if (r2) {
          inBoth.push({
            id: r1.id,
            branch1Similarity: r1.similarity,
            branch2Similarity: r2.similarity,
          });
        }
      }
    }

    return {
      branch1Results: results1.slice(0, limit),
      branch2Results: results2.slice(0, limit),
      onlyInBranch1,
      onlyInBranch2,
      inBoth: inBoth.slice(0, limit),
    };
  }

  /**
   * List all branches that have embeddings for current project
   */
  async listBranches(): Promise<string[]> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    // Ensure context is set on adapter
    this.adapter.setProjectContext(this.currentContext);
    return await this.adapter.listBranches();
  }

  /**
   * Get embedding count per branch for current project
   * v4: Simplified - uses unified adapter
   */
  async getCountPerBranch(): Promise<Array<{ branchName: string; count: number }>> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { projectHash } = this.currentContext;
    const currentContext = this.adapter.getProjectContext();

    try {
      const branches = await this.adapter.listBranches();
      const result: Array<{ branchName: string; count: number }> = [];

      for (const branch of branches) {
        this.adapter.setProjectContext({ projectHash, branchName: branch });
        const count = await this.adapter.getEmbeddingCount();
        result.push({ branchName: branch, count });
      }

      return result.sort((a, b) => b.count - a.count);
    } finally {
      this.adapter.setProjectContext(currentContext);
    }
  }

  /**
   * Delete all embeddings for a specific branch
   * v4: Warning - this clears ALL data for the branch, not just embeddings
   */
  async deleteBranch(branchName: string): Promise<number> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { projectHash } = this.currentContext;
    const normalizedBranch = normalizeBranchName(branchName);
    const currentContext = this.adapter.getProjectContext();

    try {
      this.adapter.setProjectContext({ projectHash, branchName: normalizedBranch });
      const count = await this.adapter.getEmbeddingCount();
      await this.adapter.clear();

      console.error(`[VectorStore] Deleted data for branch=${normalizedBranch} (was ${count} embeddings)`);
      return count;
    } finally {
      this.adapter.setProjectContext(currentContext);
    }
  }

  /**
   * Copy embeddings from one branch to another
   * Note: Not fully implemented for unified storage mode
   */
  async copyBranch(sourceBranch: string, _targetBranch: string): Promise<number> {
    if (!this.adapter) throw new Error("Vector store not initialized");

    const { projectHash } = this.currentContext;
    const sourceNorm = normalizeBranchName(sourceBranch);
    const currentContext = this.adapter.getProjectContext();

    try {
      this.adapter.setProjectContext({ projectHash, branchName: sourceNorm });
      const sourceCount = await this.adapter.getEmbeddingCount();

      if (sourceCount === 0) {
        console.error(`[VectorStore] No embeddings to copy from branch=${sourceNorm}`);
        return 0;
      }

      // For now, we can't efficiently copy all embeddings
      console.error(`[VectorStore] copyBranch not fully implemented for unified storage mode`);
      console.error(`[VectorStore] Source branch ${sourceNorm} has ${sourceCount} embeddings`);
      return 0;
    } finally {
      this.adapter.setProjectContext(currentContext);
    }
  }
}
