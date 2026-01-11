/**
 * FAISS Provider Interface
 *
 * Common interface for FaissProvider and LayeredFaissProvider.
 * Allows VectorStore to use either provider interchangeably.
 */

import type { SimilarityResult, VectorEmbedding } from "../../types/semantic.js";

/**
 * Common interface for FAISS providers
 */
export interface IFaissProvider {
  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the provider
   * @returns true if successful
   */
  initialize(): Promise<boolean>;

  /**
   * Close and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Save current state to disk
   */
  save(): Promise<void>;

  // ===========================================================================
  // Project Context
  // ===========================================================================

  /**
   * Set project context for per-project/branch index
   */
  setProjectContext(projectHash: string, branchName: string): Promise<void>;

  // ===========================================================================
  // Vector Operations
  // ===========================================================================

  /**
   * Add a single embedding
   */
  add(embedding: VectorEmbedding): Promise<void>;

  /**
   * Add multiple embeddings in batch
   */
  addBatch(embeddings: VectorEmbedding[]): Promise<void>;

  /**
   * Search for similar vectors
   * @param queryVector - Query vector
   * @param limit - Max results to return
   * @returns Array of similarity results
   */
  search(queryVector: Float32Array, limit: number): Promise<SimilarityResult[]>;

  /**
   * Remove embeddings by IDs
   */
  remove(ids: string[]): Promise<void>;

  // ===========================================================================
  // Utility
  // ===========================================================================

  /**
   * Check if an ID exists in the index
   */
  hasId(id: string): boolean;

  /**
   * Get set of existing IDs from a list
   */
  getExistingIds(ids: string[]): Promise<Set<string>>;

  /**
   * Get total count of vectors
   */
  count(): Promise<number>;

  /**
   * Flush pending changes (optional, may be no-op)
   */
  flush(): Promise<number>;

  /**
   * Get provider statistics
   */
  getStats(): Promise<{
    totalVectors: number;
    dimensions: number;
    indexType: string;
    [key: string]: unknown;
  }>;
}

/**
 * Provider type enum
 */
export type FaissProviderType = "standard" | "layered";

/**
 * Provider configuration
 */
export interface FaissProviderOptions {
  /** Vector dimensions (default: 384) */
  dimensions?: number;
  /** Index type (default: "hnsw") */
  indexType?: "flat" | "hnsw" | "ivf";
  /** HNSW M parameter */
  hnswM?: number;
  /** HNSW efConstruction */
  hnswEfConstruction?: number;
  /** HNSW efSearch */
  hnswEfSearch?: number;
  /** Auto-save threshold */
  autoSaveThreshold?: number;
  /** Provider type (default: "standard") */
  providerType?: FaissProviderType;
}
