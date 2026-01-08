/**
 * Embedding Accumulator - Batches embeddings for efficient FAISS insertion
 *
 * Collects binary embeddings from worker pools and flushes them to FAISS
 * in large batches for optimal performance.
 *
 * Centralized Mode (OVMS):
 * - Workers send texts via IPC to Main process
 * - Main accumulates texts in a queue
 * - Single sequential loop processes batches to OVMS
 * - One connection, maximum throughput
 *
 * Benefits:
 * - Reduced IPC overhead (fewer calls to FAISS worker)
 * - Better OpenMP parallelization in FAISS (larger batches)
 * - Memory-efficient accumulation
 * - No HTTP connection contention (single sequential processing)
 */

import { log } from "../logging/index.js";
import type { EmbeddingPoolStats, VectorEmbedding } from "../types/semantic.js";
import type { EmbeddingGenerator } from "./embedding-generator.js";
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

/**
 * Text item for centralized embedding generation.
 * Workers send texts to Main, Main generates embeddings via EmbeddingGenerator.
 */
export interface EmbeddingTextItem {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface AccumulatorConfig {
  /** Flush to FAISS when this many embeddings accumulated */
  flushThreshold: number;
  /** Vector dimensions (must match embedding model) */
  dimensions: number;
  /** Batch size for OVMS requests (texts per batch) */
  queueBatchSize: number;
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
  queueBatchSize: 200, // Send 200 texts per OVMS request (good for GPU utilization)
};

export class EmbeddingAccumulator {
  private config: AccumulatorConfig;
  private faissProvider: FaissProvider | null = null;
  private embeddingGenerator: EmbeddingGenerator | null = null;

  // Accumulated embeddings (ready for FAISS)
  private pending: VectorEmbedding[] = [];

  // Text queue for centralized embedding generation
  private textQueue: EmbeddingTextItem[] = [];

  // Sequential processing state
  private isProcessingQueue = false;
  private queueProcessingPromise: Promise<void> | null = null;

  // Stats
  private stats: AccumulatorStats = {
    accumulated: 0,
    flushed: 0,
    flushCount: 0,
    totalBytes: 0,
  };

  // Embedding generation stats (for centralized mode summary)
  private embeddingStats = {
    startTime: 0,
    totalGenerated: 0,
    batchCount: 0,
    workerIds: new Set<string>(),
    provider: "",
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
   * Set EmbeddingGenerator for centralized embedding mode (OVMS).
   * When set, starts processing any queued texts.
   */
  async setEmbeddingGenerator(generator: EmbeddingGenerator): Promise<void> {
    this.embeddingGenerator = generator;
    log.d("ACCUMULATOR", "EmbeddingGenerator set for centralized mode", {
      queuedTexts: this.textQueue.length,
      batchSize: this.config.queueBatchSize,
    });

    // Start processing if we have queued texts
    if (this.textQueue.length > 0) {
      log.i("ACCUMULATOR", "Processing queued texts", { count: this.textQueue.length });
      this.startQueueProcessing();
    }
  }

  /**
   * Add binary embeddings from worker
   * Automatically flushes when threshold reached
   */
  async addBinaryEmbeddings(embeddings: BinaryEmbedding[]): Promise<void> {
    if (embeddings.length === 0) return;

    log.d("ACCUMULATOR", "addBinaryEmbeddings", {
      count: embeddings.length,
      hasFaissProvider: !!this.faissProvider,
    });

    // Convert binary to VectorEmbedding format
    for (const emb of embeddings) {
      const vector = new Float32Array(emb.vectorBuffer);

      // Validate dimensions
      if (vector.length !== this.config.dimensions) {
        log.w("ACCUMULATOR", `Invalid vector dimensions`, {
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
   * Add texts for centralized embedding generation (OVMS mode).
   * Texts are queued and processed sequentially through a single connection.
   * @param texts - Text items to generate embeddings for
   * @param workerId - Optional worker ID for stats tracking
   */
  addTextsForEmbedding(texts: EmbeddingTextItem[], workerId?: string): void {
    if (texts.length === 0) return;

    // Track worker for stats
    if (workerId) {
      this.embeddingStats.workerIds.add(workerId);
    }

    // Add to queue
    this.textQueue.push(...texts);

    log.d("ACCUMULATOR", "Texts queued", {
      added: texts.length,
      queueSize: this.textQueue.length,
      workerId,
      isProcessing: this.isProcessingQueue,
    });

    // Start processing if not already running and generator is ready
    if (this.embeddingGenerator && !this.isProcessingQueue) {
      this.startQueueProcessing();
    }
  }

  /**
   * Start the sequential queue processing loop.
   * Only one loop runs at a time.
   */
  private startQueueProcessing(): void {
    if (this.isProcessingQueue) return;
    if (!this.embeddingGenerator) return;

    this.isProcessingQueue = true;
    this.queueProcessingPromise = this.processQueueLoop();
  }

  /**
   * Sequential queue processing loop.
   * Processes batches one at a time for optimal throughput.
   */
  private async processQueueLoop(): Promise<void> {
    // Set start time on first batch
    if (this.embeddingStats.startTime === 0) {
      this.embeddingStats.startTime = Date.now();
    }

    log.i("ACCUMULATOR", "Queue processing started", {
      queueSize: this.textQueue.length,
      batchSize: this.config.queueBatchSize,
    });

    const loopStart = performance.now();
    let totalProcessed = 0;

    try {
      while (this.textQueue.length > 0) {
        // Take a batch from the queue
        const batch = this.textQueue.splice(0, this.config.queueBatchSize);
        if (batch.length === 0) break;

        const batchStart = performance.now();

        try {
          // Generate embeddings for this batch
          const textStrings = batch.map((t) => t.text);
          const embeddings = await this.embeddingGenerator!.generateBatch(textStrings);

          // Track stats
          this.embeddingStats.batchCount++;
          this.embeddingStats.totalGenerated += embeddings.length;
          totalProcessed += embeddings.length;

          // Convert to VectorEmbedding format
          for (let i = 0; i < batch.length && i < embeddings.length; i++) {
            const text = batch[i]!;
            const vector = embeddings[i];

            if (!vector || vector.length !== this.config.dimensions) {
              log.w("ACCUMULATOR", "Invalid vector dimensions", {
                expected: this.config.dimensions,
                got: vector?.length ?? 0,
                id: text.id,
              });
              continue;
            }

            this.pending.push({
              id: text.id,
              vector,
              content: text.text.slice(0, 500),
              metadata: text.metadata,
              createdAt: Date.now(),
            });

            this.stats.accumulated++;
            this.stats.totalBytes += vector.byteLength;
          }

          const batchMs = performance.now() - batchStart;
          log.d("ACCUMULATOR", "Batch processed", {
            count: embeddings.length,
            batchMs: Math.round(batchMs),
            speed: Math.round(embeddings.length / (batchMs / 1000)),
            remaining: this.textQueue.length,
          });
        } catch (error) {
          log.e("ACCUMULATOR", "Batch failed, re-queuing", {
            error: (error as Error).message,
            count: batch.length,
          });
          // Re-queue failed batch at the front
          this.textQueue.unshift(...batch);
          // Small delay before retry
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      const totalMs = performance.now() - loopStart;
      const overallSpeed = totalMs > 0 ? Math.round((totalProcessed / totalMs) * 1000) : 0;

      log.i("ACCUMULATOR", "Queue processing complete", {
        totalProcessed,
        totalMs: Math.round(totalMs),
        overallSpeed: `${overallSpeed}/s`,
        batches: this.embeddingStats.batchCount,
        pendingVectors: this.pending.length,
      });
    } finally {
      this.isProcessingQueue = false;
      this.queueProcessingPromise = null;
    }
  }

  /**
   * Flush all pending embeddings to FAISS.
   * Waits for queue processing to complete first.
   */
  async flush(): Promise<number> {
    // Wait for queue processing to complete
    if (this.queueProcessingPromise) {
      log.i("ACCUMULATOR", "Waiting for queue processing", {
        queueSize: this.textQueue.length,
      });
      await this.queueProcessingPromise;
    }

    // Process any remaining texts in queue (edge case)
    if (this.textQueue.length > 0 && this.embeddingGenerator) {
      log.i("ACCUMULATOR", "Processing remaining queue", {
        remaining: this.textQueue.length,
      });
      await this.processQueueLoop();
    }

    log.d("ACCUMULATOR", "flush() called", {
      pending: this.pending.length,
      hasFaissProvider: !!this.faissProvider,
      accumulated: this.stats.accumulated,
      flushed: this.stats.flushed,
    });

    if (this.pending.length === 0) {
      return 0;
    }

    if (!this.faissProvider) {
      log.w("ACCUMULATOR", "No FAISS provider set, cannot flush");
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

      log.i("ACCUMULATOR", `Flushed to FAISS`, {
        count,
        elapsed: `${elapsed.toFixed(1)}ms`,
        speed: `${Math.round(count / (elapsed / 1000))}/s`,
        totalFlushed: this.stats.flushed,
      });

      // Clear pending
      this.pending = [];

      return count;
    } catch (error) {
      log.e("ACCUMULATOR", "Flush failed", { error: (error as Error).message });
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
   * Get queue size (texts waiting for embedding)
   */
  getQueueSize(): number {
    return this.textQueue.length;
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
    this.embeddingStats = {
      startTime: 0,
      totalGenerated: 0,
      batchCount: 0,
      workerIds: new Set<string>(),
      provider: "",
    };
  }

  /**
   * Get embedding generation stats for summary logging.
   * Returns null if no embeddings were generated.
   */
  getEmbeddingPoolStats(): EmbeddingPoolStats | null {
    if (this.embeddingStats.totalGenerated === 0) {
      return null;
    }

    const durationMs = this.embeddingStats.startTime > 0 ? Date.now() - this.embeddingStats.startTime : 0;

    const speedPerSec = durationMs > 0 ? Math.round(this.embeddingStats.totalGenerated / (durationMs / 1000)) : 0;

    return {
      total: this.embeddingStats.totalGenerated,
      durationMs,
      speedPerSec,
      workers: this.embeddingStats.workerIds.size,
      batches: this.embeddingStats.batchCount,
      provider: this.embeddingStats.provider || undefined,
    };
  }

  /**
   * Set embedding provider name for stats
   */
  setProviderName(name: string): void {
    this.embeddingStats.provider = name;
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
