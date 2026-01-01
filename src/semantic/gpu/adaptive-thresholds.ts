/**
 * Adaptive GPU/CUDA Thresholds Configuration
 *
 * Determines when to use CUDA vs CPU based on data size and vector dimensions.
 * CUDA has ~1ms IPC overhead, so it's only beneficial for large operations.
 *
 * Empirical thresholds based on benchmarks:
 * - 768-dim vectors: CUDA break-even at ~1000 vectors (batch similarity)
 * - 8192-dim vectors: CUDA break-even at ~50 vectors
 * - Index building: Always use Faiss for >500 vectors (faster than DiskANN rebuild)
 */

import { logger } from "../../utils/logger.js";

// =============================================================================
// Configuration Types
// =============================================================================

export interface AdaptiveThresholds {
  /** Minimum vectors for CUDA batch cosine similarity (per dimension tier) */
  cudaBatchCosine: {
    dim384: number; // all-MiniLM-L6-v2
    dim768: number; // multilingual-e5-base
    dim1024: number; // snowflake-arctic-embed2
    dim8192: number; // BGE-M3 full
  };

  /** Minimum vectors for CUDA normalization */
  cudaNormalize: {
    dim384: number;
    dim768: number;
    dim1024: number;
    dim8192: number;
  };

  /** Minimum vectors for using Faiss instead of LibSQL DiskANN */
  faissIndexBuild: {
    /** Use Faiss for bulk insert if count exceeds this */
    bulkInsertThreshold: number;
    /** Use Faiss for index rebuild if current count exceeds this */
    rebuildThreshold: number;
    /** Use Faiss for incremental updates if delta exceeds this % of total */
    incrementalDeltaPercent: number;
  };

  /** Minimum vectors for using Faiss search instead of DiskANN */
  faissSearch: {
    /** Use Faiss HNSW search if index size exceeds this */
    minIndexSize: number;
    /** Batch search threshold - use Faiss if query count exceeds this */
    batchQueryThreshold: number;
  };
}

// =============================================================================
// Default Thresholds (based on benchmarks)
// =============================================================================

export const DEFAULT_THRESHOLDS: AdaptiveThresholds = {
  cudaBatchCosine: {
    dim384: 2000, // Very small vectors - high IPC overhead ratio
    dim768: 1000, // Medium vectors - ~1ms IPC vs ~1ms compute
    dim1024: 500, // Larger vectors - compute dominates
    dim8192: 50, // Large vectors - CUDA always wins for batches
  },

  cudaNormalize: {
    dim384: 5000, // Normalization is simpler - needs more vectors
    dim768: 2000,
    dim1024: 1000,
    dim8192: 100,
  },

  faissIndexBuild: {
    bulkInsertThreshold: 500, // Use Faiss for 500+ vectors bulk insert
    rebuildThreshold: 1000, // Use Faiss if rebuilding index with 1000+ vectors
    incrementalDeltaPercent: 30, // Use Faiss rebuild if delta > 30% of total
  },

  faissSearch: {
    minIndexSize: 100, // Use Faiss HNSW if index has 100+ vectors
    batchQueryThreshold: 10, // Use Faiss batch search for 10+ queries
  },
};

// =============================================================================
// Runtime Threshold Manager
// =============================================================================

let currentThresholds = { ...DEFAULT_THRESHOLDS };

/**
 * Configure adaptive thresholds
 */
export function configureThresholds(overrides: Partial<AdaptiveThresholds>): void {
  currentThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...overrides,
    cudaBatchCosine: {
      ...DEFAULT_THRESHOLDS.cudaBatchCosine,
      ...overrides.cudaBatchCosine,
    },
    cudaNormalize: {
      ...DEFAULT_THRESHOLDS.cudaNormalize,
      ...overrides.cudaNormalize,
    },
    faissIndexBuild: {
      ...DEFAULT_THRESHOLDS.faissIndexBuild,
      ...overrides.faissIndexBuild,
    },
    faissSearch: {
      ...DEFAULT_THRESHOLDS.faissSearch,
      ...overrides.faissSearch,
    },
  };
  logger.debug("AdaptiveThresholds", "Configured", currentThresholds);
}

/**
 * Get current thresholds
 */
export function getThresholds(): AdaptiveThresholds {
  return currentThresholds;
}

// =============================================================================
// Decision Functions
// =============================================================================

/**
 * Get threshold for given dimension
 */
function getDimThreshold(
  thresholds: { dim384: number; dim768: number; dim1024: number; dim8192: number },
  dimensions: number,
): number {
  if (dimensions <= 384) return thresholds.dim384;
  if (dimensions <= 768) return thresholds.dim768;
  if (dimensions <= 1024) return thresholds.dim1024;
  return thresholds.dim8192;
}

/**
 * Should use CUDA for batch cosine similarity?
 */
export function shouldUseCudaBatchCosine(vectorCount: number, dimensions: number): boolean {
  const threshold = getDimThreshold(currentThresholds.cudaBatchCosine, dimensions);
  const shouldUse = vectorCount >= threshold;

  if (process.env["ADAPTIVE_DEBUG"] === "true") {
    logger.debug("AdaptiveThresholds", "cudaBatchCosine decision", {
      count: vectorCount,
      dim: dimensions,
      threshold,
      useCuda: shouldUse,
    });
  }

  return shouldUse;
}

/**
 * Should use CUDA for vector normalization?
 */
export function shouldUseCudaNormalize(vectorCount: number, dimensions: number): boolean {
  const threshold = getDimThreshold(currentThresholds.cudaNormalize, dimensions);
  return vectorCount >= threshold;
}

/**
 * Should use Faiss for bulk insert?
 */
export function shouldUseFaissBulkInsert(vectorCount: number): boolean {
  return vectorCount >= currentThresholds.faissIndexBuild.bulkInsertThreshold;
}

/**
 * Should use Faiss for index rebuild?
 * @param currentIndexSize - Current number of vectors in index
 * @param deltaCount - Number of vectors being added/changed
 */
export function shouldUseFaissRebuild(currentIndexSize: number, deltaCount?: number): boolean {
  // Always use Faiss for large indexes
  if (currentIndexSize >= currentThresholds.faissIndexBuild.rebuildThreshold) {
    return true;
  }

  // Use Faiss if delta is significant portion of total
  if (deltaCount !== undefined && currentIndexSize > 0) {
    const deltaPercent = (deltaCount / currentIndexSize) * 100;
    if (deltaPercent >= currentThresholds.faissIndexBuild.incrementalDeltaPercent) {
      return true;
    }
  }

  return false;
}

/**
 * Should use Faiss for vector search?
 */
export function shouldUseFaissSearch(indexSize: number, queryCount = 1): boolean {
  // Use Faiss for large indexes
  if (indexSize >= currentThresholds.faissSearch.minIndexSize) {
    return true;
  }

  // Use Faiss for batch queries
  if (queryCount >= currentThresholds.faissSearch.batchQueryThreshold) {
    return true;
  }

  return false;
}

// =============================================================================
// Strategy Recommendation
// =============================================================================

export type IndexStrategy = "libsql-diskann" | "faiss-hnsw" | "faiss-ivf" | "hybrid";
export type SearchStrategy = "libsql" | "faiss" | "cuda-bruteforce" | "hybrid";

export interface StrategyRecommendation {
  indexStrategy: IndexStrategy;
  searchStrategy: SearchStrategy;
  useCudaForReranking: boolean;
  reason: string;
}

/**
 * Get recommended strategy based on data characteristics
 */
export function getRecommendedStrategy(
  vectorCount: number,
  dimensions: number,
  isRebuild: boolean,
  queryBatchSize = 1,
): StrategyRecommendation {
  const reasons: string[] = [];

  // Index strategy
  let indexStrategy: IndexStrategy = "libsql-diskann";
  if (isRebuild && shouldUseFaissRebuild(vectorCount)) {
    indexStrategy = "faiss-hnsw";
    reasons.push(`Faiss HNSW for rebuild (${vectorCount} vectors)`);
  } else if (vectorCount > 10000) {
    indexStrategy = "faiss-ivf";
    reasons.push(`Faiss IVF for large index (${vectorCount} vectors)`);
  }

  // Search strategy
  let searchStrategy: SearchStrategy = "libsql";
  if (shouldUseFaissSearch(vectorCount, queryBatchSize)) {
    searchStrategy = queryBatchSize > 1 ? "faiss" : "hybrid";
    reasons.push(`Faiss search (index=${vectorCount}, queries=${queryBatchSize})`);
  }

  // CUDA for reranking
  const useCudaForReranking = shouldUseCudaBatchCosine(vectorCount, dimensions);
  if (useCudaForReranking) {
    reasons.push(`CUDA reranking (${vectorCount} × ${dimensions}-dim)`);
  }

  return {
    indexStrategy,
    searchStrategy,
    useCudaForReranking,
    reason: reasons.join("; ") || "Default CPU strategy",
  };
}
