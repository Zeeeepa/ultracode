/**
 * Embedding Accumulator - Batches embeddings for efficient FAISS insertion
 *
 * Collects binary embeddings from worker pools and flushes them to FAISS
 * in large batches for optimal performance.
 *
 * Benefits:
 * - Reduced IPC overhead (fewer calls to FAISS worker)
 * - Better OpenMP parallelization in FAISS (larger batches)
 * - Memory-efficient accumulation
 */

import type { VectorEmbedding } from "../types/semantic.js";
import { logger } from "../utils/logger.js";
import type { FaissProvider } from "./faiss/faiss-provider.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Binary embedding from worker (ArrayBuffer format)
 */
export interface BinaryEmbedding {
  id: string;
  vectorBuffer: ArrayBuffer;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AccumulatorConfig {
  /** Flush to FAISS when this many embeddings accumulated */
  flushThreshold: number;
  /** Vector dimensions (must match embedding model) */
  dimensions: number;
}

export interface AccumulatorStats {
  accumulated: number;
  flushed: number;
  flushCount: number;
  totalBytes: number;
}

// =============================================================================
// Accumulator
// =============================================================================

const DEFAULT_CONFIG: AccumulatorConfig = {
  flushThreshold: 5000, // Flush every 5000 embeddings
  dimensions: 768,
};

export class EmbeddingAccumulator {
  private config: AccumulatorConfig;
  private faissProvider: FaissProvider | null = null;

  // Accumulated embeddings
  private pending: VectorEmbedding[] = [];

  // Stats
  private stats: AccumulatorStats = {
    accumulated: 0,
    flushed: 0,
    flushCount: 0,
    totalBytes: 0,
  };

  constructor(config: Partial<AccumulatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set FAISS provider for flushing
   */
  setFaissProvider(provider: FaissProvider): void {
    this.faissProvider = provider;
  }

  /**
   * Add binary embeddings from worker
   * Automatically flushes when threshold reached
   */
  async addBinaryEmbeddings(embeddings: BinaryEmbedding[]): Promise<void> {
    if (embeddings.length === 0) return;

    // Convert binary to VectorEmbedding format
    for (const emb of embeddings) {
      const vector = new Float32Array(emb.vectorBuffer);

      // Validate dimensions
      if (vector.length !== this.config.dimensions) {
        logger.warn("ACCUMULATOR", `Invalid vector dimensions`, {
          expected: this.config.dimensions,
          got: vector.length,
          id: emb.id,
        });
        continue;
      }

      this.pending.push({
        id: emb.id,
        vector,
        content: emb.content,
        metadata: emb.metadata,
        createdAt: Date.now(),
      });

      this.stats.accumulated++;
      this.stats.totalBytes += emb.vectorBuffer.byteLength;
    }

    // Check if we should flush
    if (this.pending.length >= this.config.flushThreshold) {
      await this.flush();
    }
  }

  /**
   * Flush all pending embeddings to FAISS
   */
  async flush(): Promise<number> {
    if (this.pending.length === 0) {
      return 0;
    }

    if (!this.faissProvider) {
      logger.warn("ACCUMULATOR", "No FAISS provider set, cannot flush");
      return 0;
    }

    const count = this.pending.length;
    const startTime = performance.now();

    try {
      // Batch add to FAISS
      await this.faissProvider.addBatch(this.pending);

      const elapsed = performance.now() - startTime;
      this.stats.flushed += count;
      this.stats.flushCount++;

      logger.info("ACCUMULATOR", `Flushed to FAISS`, {
        count,
        elapsed: `${elapsed.toFixed(1)}ms`,
        speed: `${Math.round(count / (elapsed / 1000))}/s`,
        totalFlushed: this.stats.flushed,
      });

      // Clear pending
      this.pending = [];

      return count;
    } catch (error) {
      logger.error("ACCUMULATOR", "Flush failed", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get pending count
   */
  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Get accumulator stats
   */
  getStats(): AccumulatorStats {
    return {
      ...this.stats,
      accumulated: this.stats.accumulated,
    };
  }

  /**
   * Reset stats
   */
  resetStats(): void {
    this.stats = {
      accumulated: 0,
      flushed: 0,
      flushCount: 0,
      totalBytes: 0,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let globalAccumulator: EmbeddingAccumulator | null = null;

/**
 * Get global embedding accumulator
 */
export function getEmbeddingAccumulator(config?: Partial<AccumulatorConfig>): EmbeddingAccumulator {
  if (!globalAccumulator) {
    globalAccumulator = new EmbeddingAccumulator(config);
  }
  return globalAccumulator;
}

/**
 * Reset global accumulator (for testing)
 */
export function resetEmbeddingAccumulator(): void {
  globalAccumulator = null;
}
