/**
 * Faiss Provider - In-memory Vector Index
 *
 * Simple architecture:
 * - Faiss HNSW index in main process (via faiss-napi)
 * - Periodic save to disk for persistence
 * - No cold storage / hybrid search - everything in Faiss
 *
 * Flow:
 * 1. Add embeddings directly to Faiss
 * 2. Save index to disk periodically and on close
 * 3. On restart: load index from disk
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { log } from "../../logging/index.js";
import { getFaissIndexPathByHash, normalizeBranchName } from "../../shared/storage-paths.js";
import type { SimilarityResult, VectorEmbedding } from "../../types/semantic.js";
import { simdL2Normalize } from "../../utils/simd-vector-ops.js";
import { getGpuClient, type IGpuClient } from "../gpu/gpu-client.js";
import type { FaissIndexConfig, FaissSearchResult } from "./types.js";

// =============================================================================
// Configuration
// =============================================================================

export interface FaissProviderConfig {
  /** Vector dimensions (must match embedding model) */
  dimensions: number;
  /** Faiss index type */
  indexType: "flat" | "hnsw" | "ivf" | "ivfpq";
  /** HNSW M parameter */
  hnswM?: number;
  /** HNSW efConstruction */
  hnswEfConstruction?: number;
  /** HNSW efSearch */
  hnswEfSearch?: number;
  /** Auto-save after N embeddings added */
  autoSaveThreshold?: number;
  /** Path to persist Faiss index */
  persistPath?: string;
}

const DEFAULT_CONFIG: Required<FaissProviderConfig> = {
  dimensions: 768,
  indexType: "hnsw",
  hnswM: 32,
  hnswEfConstruction: 200,
  hnswEfSearch: 64,
  autoSaveThreshold: 5000, // Save after 5000 new embeddings
  persistPath: "",
};

// =============================================================================
// Provider
// =============================================================================

class FaissProvider {
  private config: Required<FaissProviderConfig>;
  private client: IGpuClient | null = null;
  private isInitialized = false;

  // Track unsaved changes for auto-save
  private unsavedCount = 0;
  private lastSaveTime = 0;

  // Background save state (avoid blocking pipeline)
  private pendingSave: Promise<void> | null = null;
  private saveScheduled = false;

  // Project context (FAISS index is per-project, per-branch)
  private projectHash = "default";
  private branchName = "main";

  // ID set for existence checks (content stored in LibSQL, not here)
  private idSet = new Set<string>();

  // Mutex for initialize() to prevent race condition with concurrent calls
  private initializePromise: Promise<boolean> | null = null;

  constructor(config: Partial<FaissProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set project context for per-project FAISS index
   * If context changes while initialized, saves current index and loads new one
   */
  async setProjectContext(projectHash: string, branchName: string = "main"): Promise<void> {
    const normalizedBranch = normalizeBranchName(branchName);
    const newPersistPath = getFaissIndexPathByHash(projectHash, normalizedBranch);

    // Check if context actually changed
    if (this.projectHash === projectHash && this.branchName === normalizedBranch) {
      return; // No change
    }

    // If already initialized with different context, save and switch
    if (this.isInitialized && this.client) {
      log.i("FAISS", "Switching project context", {
        from: { projectHash: this.projectHash, branchName: this.branchName },
        to: { projectHash, branchName: normalizedBranch },
      });

      // Save current index
      if (this.unsavedCount > 0) {
        await this.save();
      }
      this.saveIdSet();

      // Update context
      this.projectHash = projectHash;
      this.branchName = normalizedBranch;
      this.config.persistPath = newPersistPath;

      // Clear ID set
      this.idSet.clear();
      this.unsavedCount = 0;

      // Load new index if exists
      const loadPath = existsSync(newPersistPath) ? newPersistPath : undefined;
      const indexConfig: FaissIndexConfig = {
        dimensions: this.config.dimensions,
        indexType: this.config.indexType,
        metric: "l2",
        hnswM: this.config.hnswM,
        hnswEfConstruction: this.config.hnswEfConstruction,
        hnswEfSearch: this.config.hnswEfSearch,
      };

      await this.client.faissInitialize(indexConfig, loadPath);

      // Load ID set for new context
      if (loadPath) {
        this.loadIdSet();
      }

      const stats = await this.client.faissGetStats();
      log.i("FAISS", "Switched to new context", {
        projectHash,
        branchName: normalizedBranch,
        vectors: stats.totalVectors,
        idSetSize: this.idSet.size,
      });
    } else {
      // Not initialized yet, just set context
      this.projectHash = projectHash;
      this.branchName = normalizedBranch;
      this.config.persistPath = newPersistPath;

      log.d("FAISS", "Project context set", {
        projectHash: this.projectHash,
        branchName: this.branchName,
        persistPath: this.config.persistPath,
      });
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // Prevent race condition: if initialize is already in progress, wait for it
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.initializeInternal();
    return this.initializePromise;
  }

  private async initializeInternal(): Promise<boolean> {
    try {
      log.i("FAISS", "Initializing...");

      // Create and start GPU client (unified Faiss + CUDA)
      this.client = getGpuClient();
      const started = await this.client.start();
      if (!started) {
        log.e("FAISS", "Failed to start Faiss client");
        return false;
      }

      // Build Faiss index config
      const indexConfig: FaissIndexConfig = {
        dimensions: this.config.dimensions,
        indexType: this.config.indexType,
        metric: "l2",
        hnswM: this.config.hnswM,
        hnswEfConstruction: this.config.hnswEfConstruction,
        hnswEfSearch: this.config.hnswEfSearch,
      };

      // Try to load existing index
      const loadPath = existsSync(this.config.persistPath) ? this.config.persistPath : undefined;

      await this.client.faissInitialize(indexConfig, loadPath);

      // Load ID set if index was loaded
      if (loadPath) {
        this.loadIdSet();
      }

      this.isInitialized = true;
      this.lastSaveTime = Date.now();

      const stats = await this.client.faissGetStats();
      log.i("FAISS", "Initialized", {
        indexType: this.config.indexType,
        vectors: stats.totalVectors,
        loaded: !!loadPath,
        idSetSize: this.idSet.size,
      });

      return true;
    } catch (error) {
      log.e("FAISS", "Initialization failed", { error: (error as Error).message });
      return false;
    }
  }

  async close(): Promise<void> {
    // Save before closing
    if (this.unsavedCount > 0) {
      await this.save();
    }

    if (this.client && this.isInitialized) {
      await this.client.stop();
    }

    this.idSet.clear();
    this.isInitialized = false;
  }

  // ===========================================================================
  // Insert Operations
  // ===========================================================================

  /**
   * Add single embedding to Faiss
   */
  async add(embedding: VectorEmbedding): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    // Add to Faiss
    await this.client.faissAdd([embedding.id], Array.from(embedding.vector));

    // Track ID for existence checks (content stored in LibSQL)
    this.idSet.add(embedding.id);

    this.unsavedCount++;

    // Auto-save check
    if (this.unsavedCount >= this.config.autoSaveThreshold) {
      await this.save();
    }
  }

  /**
   * Batch add embeddings to Faiss
   */
  async addBatch(embeddings: VectorEmbedding[]): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    if (embeddings.length === 0) return;

    const pStart = performance.now();
    const pLog = (phase: string) => {
      const elapsed = (performance.now() - pStart).toFixed(1);
      log.i("FAISS", phase, { elapsedMs: elapsed });
    };

    const dim = this.config.dimensions;
    const count = embeddings.length;

    // Pre-allocate flat vector array (optimization: avoid push/spread overhead)
    const ids: string[] = new Array(count);
    const vectors = new Float32Array(count * dim);

    for (let i = 0; i < count; i++) {
      const emb = embeddings[i]!;
      ids[i] = emb.id;

      // L2 normalize for cosine similarity (SIMD-accelerated)
      // For inner product metric, normalized vectors give cosine similarity
      const normalized = simdL2Normalize(emb.vector);

      // Direct copy into pre-allocated array (no intermediate arrays)
      vectors.set(normalized, i * dim);

      // Track ID for existence checks (content stored in LibSQL)
      this.idSet.add(emb.id);
    }
    pLog("F1_PREPARE_VECTORS");

    // Add to Faiss (pass Float32Array directly - gpu-client will handle)
    await this.client.faissAdd(ids, vectors);
    pLog("F2_FAISS_ADD");

    this.unsavedCount += count;

    log.d("FAISS", "Added embeddings", {
      count,
      unsaved: this.unsavedCount,
    });

    // Background auto-save (non-blocking for better throughput)
    if (this.unsavedCount >= this.config.autoSaveThreshold && !this.saveScheduled) {
      this.saveScheduled = true;
      // Fire-and-forget save in background
      this.pendingSave = this.save()
        .catch((err) => log.w("FAISS", "Background save failed", { error: (err as Error).message }))
        .finally(() => {
          this.saveScheduled = false;
          this.pendingSave = null;
        });
    }
  }

  /**
   * Wait for any pending background save to complete
   */
  async waitForPendingSave(): Promise<void> {
    if (this.pendingSave) {
      await this.pendingSave;
    }
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Search for similar vectors in Faiss
   * Returns only id + score. Content must be fetched from LibSQL separately.
   */
  async search(queryVector: Float32Array, limit = 10): Promise<SimilarityResult[]> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    // Normalize query for cosine similarity (must match indexed vectors)
    const normalizedQuery = simdL2Normalize(queryVector);
    const faissResults = await this.client.faissSearch(normalizedQuery, limit);

    // Convert to SimilarityResult format (content fetched from LibSQL by caller)
    return faissResults.map((r: FaissSearchResult) => ({
      id: r.id,
      similarity: r.score,
      content: "", // Content stored in LibSQL, not in Faiss
    }));
  }

  /**
   * Batch search for multiple query vectors
   * Returns only id + score. Content must be fetched from LibSQL separately.
   */
  async batchSearch(queryVectors: Float32Array[], limit = 10): Promise<SimilarityResult[][]> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    const dim = this.config.dimensions;
    const count = queryVectors.length;

    // Pre-allocate and normalize all query vectors (SIMD-accelerated)
    const flatVectors = new Float32Array(count * dim);
    for (let i = 0; i < count; i++) {
      const normalized = simdL2Normalize(queryVectors[i]!);
      flatVectors.set(normalized, i * dim);
    }

    const faissResults = await this.client.faissBatchSearch(flatVectors, count, limit);

    // Convert results (content fetched from LibSQL by caller)
    return faissResults.map((queryResults: FaissSearchResult[]) =>
      queryResults.map((r: FaissSearchResult) => ({
        id: r.id,
        similarity: r.score,
        content: "", // Content stored in LibSQL, not in Faiss
      })),
    );
  }

  // ===========================================================================
  // Persistence
  // ===========================================================================

  /**
   * Save Faiss index and content cache to disk
   */
  async save(): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    if (this.unsavedCount === 0) return;

    try {
      // Ensure directory exists
      const dir = dirname(this.config.persistPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      await this.client.faissSave(this.config.persistPath);

      // Save ID set alongside index
      this.saveIdSet();

      const savedCount = this.unsavedCount;
      this.unsavedCount = 0;
      this.lastSaveTime = Date.now();

      log.i("FAISS", "Index saved", {
        path: this.config.persistPath,
        savedCount,
        idSetSize: this.idSet.size,
      });
    } catch (error) {
      log.e("FAISS", "Failed to save index", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get ID set file path
   */
  private getIdSetPath(): string {
    return `${this.config.persistPath}.ids.json`;
  }

  /**
   * Save ID set to disk (lightweight - just IDs, no content)
   */
  private saveIdSet(): void {
    // Skip saving if no persist path configured (prevents .ids.json in root)
    if (!this.config.persistPath) {
      return;
    }

    const idSetPath = this.getIdSetPath();
    try {
      const ids = Array.from(this.idSet);
      writeFileSync(idSetPath, JSON.stringify(ids), "utf-8");
      log.d("FAISS", "ID set saved", { path: idSetPath, size: this.idSet.size });
    } catch (error) {
      log.w("FAISS", "Failed to save ID set", { error: (error as Error).message });
    }
  }

  /**
   * Load ID set from disk
   */
  private loadIdSet(): void {
    const idSetPath = this.getIdSetPath();
    if (!existsSync(idSetPath)) {
      // Try to load legacy content cache and extract IDs
      const legacyPath = `${this.config.persistPath}.content.json`;
      if (existsSync(legacyPath)) {
        try {
          const data = readFileSync(legacyPath, "utf-8");
          const cacheObj = JSON.parse(data) as Record<string, unknown>;
          this.idSet.clear();
          for (const id of Object.keys(cacheObj)) {
            this.idSet.add(id);
          }
          log.i("FAISS", "Migrated IDs from legacy content cache", { size: this.idSet.size });
          // Save as new format
          this.saveIdSet();
          return;
        } catch {
          // Ignore legacy load errors
        }
      }
      log.d("FAISS", "No ID set file found", { path: idSetPath });
      return;
    }

    try {
      const data = readFileSync(idSetPath, "utf-8");
      const ids = JSON.parse(data) as string[];

      this.idSet.clear();
      for (const id of ids) {
        this.idSet.add(id);
      }

      log.i("FAISS", "ID set loaded", { path: idSetPath, size: this.idSet.size });
    } catch (error) {
      log.w("FAISS", "Failed to load ID set", { error: (error as Error).message });
    }
  }

  /**
   * Force flush and save (compatibility method)
   */
  async flush(): Promise<number> {
    // Wait for any background save first
    await this.waitForPendingSave();

    const count = this.unsavedCount;
    if (count > 0) {
      await this.save();
    }
    return count;
  }

  /**
   * Flush and save (alias for vector-store compatibility)
   */
  async flushAndSave(): Promise<void> {
    await this.waitForPendingSave();
    await this.save();
  }

  // ===========================================================================
  // Index Maintenance
  // ===========================================================================

  /**
   * Train IVF/PQ indexes (required before adding vectors)
   */
  async train(trainingVectors: Float32Array[]): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    const flatVectors: number[] = [];
    for (const v of trainingVectors) {
      flatVectors.push(...Array.from(v));
    }

    await this.client.faissTrain(new Float32Array(flatVectors), trainingVectors.length);
    log.i("FAISS", "Trained index", { vectorCount: trainingVectors.length });
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  async getStats(): Promise<{
    totalVectors: number;
    unsavedCount: number;
    lastSaveTime: number;
    idSetSize: number;
    faissStats: any;
  }> {
    const faissStats = this.client ? await this.client.faissGetStats() : null;

    return {
      totalVectors: faissStats?.totalVectors ?? 0,
      unsavedCount: this.unsavedCount,
      lastSaveTime: this.lastSaveTime,
      idSetSize: this.idSet.size,
      faissStats,
    };
  }

  isReady(): boolean {
    return this.isInitialized && this.client?.isRunning() === true;
  }

  /**
   * Get total vector count
   */
  async getVectorCount(): Promise<number> {
    const stats = await this.getStats();
    return stats.totalVectors;
  }

  /**
   * Check which IDs already exist in the ID set
   * Used for incremental indexing to skip already-indexed entities
   */
  getExistingIds(ids: string[]): Set<string> {
    const existing = new Set<string>();
    for (const id of ids) {
      if (this.idSet.has(id)) {
        existing.add(id);
      }
    }
    return existing;
  }

  /**
   * Check if an ID exists in the ID set
   */
  hasId(id: string): boolean {
    return this.idSet.has(id);
  }

  /**
   * Remove embeddings by IDs (for re-indexing changed files)
   */
  async remove(ids: string[]): Promise<void> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    // Remove from Faiss
    await this.client.faissRemove(ids);

    // Remove from ID set
    for (const id of ids) {
      this.idSet.delete(id);
    }

    log.d("FAISS", "Removed embeddings", { count: ids.length });
  }

  /**
   * Load vectors directly from worker dump files
   * GPU worker reads dump files directly - main process not involved in data transfer
   */
  async loadFromDumpFiles(dimensions: number): Promise<{ loaded: number; skipped: number; files: number }> {
    if (!this.client || !this.isInitialized) {
      throw new Error("FaissProvider not initialized");
    }

    const { getVectorDumpDir } = await import("../vector-dump.js");
    const dumpDir = getVectorDumpDir();

    log.i("FAISS", "Requesting gpu-worker to load from dump", { dumpDir, dimensions });

    // GPU worker reads dump files directly and adds to Faiss
    // Main process doesn't read or transfer vector data
    const result = await this.client.faissLoadFromDump(dumpDir, dimensions);

    if (result.loaded > 0) {
      // Update local idSet from gpu-worker state
      // Note: GPU worker maintains its own idMap, we just track count
      this.unsavedCount += result.loaded;

      log.i("FAISS", "Vectors loaded from dump by gpu-worker", {
        loaded: result.loaded,
        skipped: result.skipped,
        files: result.files,
      });
    }

    return result;
  }

  /**
   * Load vectors from a specific worker's dump files (incremental loading)
   * Called as each worker completes, enabling parallel indexing
   */
  async loadWorkerDump(
    workerId: string,
    dimensions: number,
  ): Promise<{ loaded: number; skipped: number; files: number }> {
    log.i("FAISS", "loadWorkerDump called", {
      workerId,
      dimensions,
      hasClient: !!this.client,
      isInitialized: this.isInitialized,
    });

    if (!this.client || !this.isInitialized) {
      // Log at WARN level - this is unexpected during indexing
      log.w("FAISS", "loadWorkerDump skipped - not initialized (vectors will be loaded later)", {
        workerId,
        hasClient: !!this.client,
        isInitialized: this.isInitialized,
      });
      return { loaded: 0, skipped: 0, files: 0 };
    }

    log.i("FAISS", "Requesting gpu-worker to load worker dump", { workerId, dimensions });

    // GPU worker reads worker's dump files directly and adds to Faiss
    const result = await this.client.faissLoadWorkerDump(workerId, dimensions);

    if (result.loaded > 0) {
      this.unsavedCount += result.loaded;

      log.i("FAISS", "Worker vectors loaded from dump", {
        workerId,
        loaded: result.loaded,
        skipped: result.skipped,
        files: result.files,
      });
    }

    return result;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let faissProvider: FaissProvider | null = null;

export function getFaissProvider(config?: Partial<FaissProviderConfig>): FaissProvider {
  if (!faissProvider) {
    faissProvider = new FaissProvider(config);
  }
  return faissProvider;
}

export async function initializeFaissProvider(config?: Partial<FaissProviderConfig>): Promise<FaissProvider | null> {
  const provider = getFaissProvider(config);
  const success = await provider.initialize();
  return success ? provider : null;
}

export async function shutdownFaissProvider(): Promise<void> {
  if (faissProvider) {
    await faissProvider.close();
    faissProvider = null;
  }
}

export { FaissProvider };
