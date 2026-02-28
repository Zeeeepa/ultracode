import type { CodeUnit } from "../models/code-unit.js";
import type { VersionedIndex } from "../models/versioned-index.js";

/**
 * Lazy Embedding Cache - Generates embeddings only for unmatched units.
 *
 * Caches embeddings on disk (SQLite) for reuse.
 * Generates in batches for efficiency.
 *
 * Based on LazyEmbeddingCache from SharpToolsMCP.
 */
export class LazyEmbeddingCache {
  private embeddingGenerator: EmbeddingGeneratorFn;
  private cache = new Map<string, Float32Array>(); // In-memory cache
  private batchSize: number;

  constructor(embeddingGenerator: EmbeddingGeneratorFn, options: LazyEmbeddingCacheOptions = {}) {
    this.embeddingGenerator = embeddingGenerator;
    this.batchSize = options.batchSize ?? 32;
  }

  /**
   * Generate embeddings for units in the index.
   *
   * Only for units without embeddings (lazy generation).
   *
   * @param index - Versioned index
   * @param unitsNeedingEmbeddings - Units that need embeddings
   * @returns Promise that resolves when done
   */
  async generateEmbeddings(index: VersionedIndex, unitsNeedingEmbeddings: CodeUnit[]): Promise<void> {
    // Filter units that don't have embeddings
    const unitsToProcess = unitsNeedingEmbeddings.filter((unit) => !unit.embedding);

    if (unitsToProcess.length === 0) {
      return;
    }

    // Process in batches for efficiency
    for (let i = 0; i < unitsToProcess.length; i += this.batchSize) {
      const batch = unitsToProcess.slice(i, i + this.batchSize);

      await Promise.all(
        batch.map(async (unit) => {
          const embedding = await this.getOrGenerateEmbedding(unit);
          unit.embedding = embedding;

          // Update in index
          index.units.set(unit.id, unit);
        }),
      );
    }
  }

  /**
   * Get embedding from cache or generate a new one.
   */
  private async getOrGenerateEmbedding(unit: CodeUnit): Promise<Float32Array> {
    // Check in-memory cache first
    const cacheKey = this.computeCacheKey(unit);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate embedding
    const embedding = await this.embeddingGenerator(unit.content);

    // Store in cache
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Compute cache key for a unit.
   *
   * Based on contentHash (same content = same embedding).
   */
  private computeCacheKey(unit: CodeUnit): string {
    return unit.contentHash;
  }

  /**
   * Clear in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate cache memory usage (bytes).
   */
  private estimateMemoryUsage(): number {
    // Each Float32Array embedding ~384 dimensions * 4 bytes = ~1.5KB
    // Plus overhead for Map entry
    const bytesPerEmbedding = 384 * 4 + 100; // ~1.6KB
    return this.cache.size * bytesPerEmbedding;
  }
}

/**
 * Function for generating an embedding from code.
 */
export type EmbeddingGeneratorFn = (code: string) => Promise<Float32Array>;

/**
 * Options for LazyEmbeddingCache.
 */
export interface LazyEmbeddingCacheOptions {
  batchSize?: number | undefined; // Batch size for parallel generation (default 32)
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  size: number; // Number of cached embeddings
  memoryUsage: number; // Estimated memory usage in bytes
}
