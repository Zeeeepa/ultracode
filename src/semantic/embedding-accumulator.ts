/**
 * Embedding Accumulator - Batches embeddings for efficient FAISS insertion
 *
 * Collects binary embeddings from worker pools and flushes them to FAISS
 * in large batches for optimal performance.
 *
 * Centralized Mode (OVMS/llamacpp):
 * - Workers send texts via IPC to Main process
 * - Main accumulates texts in a queue
 * - Single sequential loop processes batches via single connection
 * - Optimal GPU batching, maximum throughput
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
import type { IVectorProvider } from "./faiss/types.js";

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
  dimensions: 384, // Default for e5-small, MiniLM models (most common)
  queueBatchSize: 200, // Send 200 texts per OVMS request (good for GPU utilization)
};

export class EmbeddingAccumulator {
  private config: AccumulatorConfig;
  private vectorProvider: IVectorProvider | null = null;
  private embeddingGenerator: EmbeddingGenerator | null = null;

  // Accumulated embeddings (ready for FAISS)
  private pending: VectorEmbedding[] = [];

  // Text queue for centralized embedding generation
  private textQueue: EmbeddingTextItem[] = [];

  // Sequential processing state
  private isProcessingQueue = false;
  private queueProcessingPromise: Promise<void> | null = null;

  // Debounce for accumulating texts before processing
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DEBOUNCE_MS = 50; // Wait 100ms for more texts
  private static readonly MIN_BATCH_THRESHOLD = 50; // Start immediately if >= 100 texts

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
   * Set vector provider for flushing (works with both FaissProvider and LayeredFaissProvider)
   */
  setVectorProvider(provider: IVectorProvider): void {
    this.vectorProvider = provider;
    log.i("ACCUMULATOR", "vectorProvider_set", {
      type: provider.constructor.name,
    });
  }

  /**
   * @deprecated Use setVectorProvider instead
   */
  setFaissProvider(provider: IVectorProvider): void {
    this.setVectorProvider(provider);
  }

  /**
   * Set EmbeddingGenerator for centralized embedding mode (OVMS/llamacpp).
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
      hasFaissProvider: !!this.vectorProvider,
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
   * Add texts for centralized embedding generation (OVMS/llamacpp mode).
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

    // Start processing with debounce to accumulate more texts
    if (this.embeddingGenerator && !this.isProcessingQueue) {
      this.scheduleQueueProcessing();
    }
  }

  /**
   * Schedule queue processing with debounce.
   * Waits for more texts to accumulate before starting, unless queue is already large.
   */
  private scheduleQueueProcessing(): void {
    // If already scheduled or processing, skip
    if (this.debounceTimer || this.isProcessingQueue) return;

    // If queue is large enough, start immediately
    if (this.textQueue.length >= EmbeddingAccumulator.MIN_BATCH_THRESHOLD) {
      log.d("ACCUMULATOR", "Queue threshold reached, starting immediately", {
        queueSize: this.textQueue.length,
        threshold: EmbeddingAccumulator.MIN_BATCH_THRESHOLD,
      });
      this.startQueueProcessing();
      return;
    }

    // Otherwise, debounce to accumulate more texts
    log.d("ACCUMULATOR", "Debouncing queue processing", {
      queueSize: this.textQueue.length,
      debounceMs: EmbeddingAccumulator.DEBOUNCE_MS,
    });
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.isProcessingQueue && this.textQueue.length > 0) {
        log.d("ACCUMULATOR", "Debounce complete, starting processing", {
          queueSize: this.textQueue.length,
        });
        this.startQueueProcessing();
      }
    }, EmbeddingAccumulator.DEBOUNCE_MS);
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

  // Number of parallel batches to send to llama-server (match --parallel)
  private static readonly PARALLEL_BATCHES = 12;

  /**
   * Process a single batch and return results.
   * Used for parallel batch processing.
   */
  private async processSingleBatch(
    batch: EmbeddingTextItem[],
  ): Promise<{ embeddings: VectorEmbedding[]; count: number } | null> {
    // Filter out texts that already have embeddings in FAISS
    let filteredBatch = batch;
    if (this.vectorProvider) {
      const ids = batch.map((t) => t.id);
      const existingIds = this.vectorProvider.getExistingIds(ids);
      if (existingIds.size > 0) {
        filteredBatch = batch.filter((t) => !existingIds.has(t.id));
        if (filteredBatch.length === 0) {
          return null; // All texts already have embeddings
        }
      }
    }

    // Sort batch by text length DESCENDING (longest first) - better GPU in llama.cpp
    const sortedBatch = filteredBatch
      .map((t, idx) => ({ item: t, idx, len: t.text.length }))
      .sort((a, b) => b.len - a.len);

    // Truncate texts to ~512 tokens (e5 model limit) ≈ 2000 chars
    const MAX_TEXT_CHARS = 2000;
    const textStrings = sortedBatch.map((s) =>
      s.item.text.length > MAX_TEXT_CHARS ? s.item.text.slice(0, MAX_TEXT_CHARS) : s.item.text,
    );

    // Generate embeddings for sorted batch
    const embeddings = await this.embeddingGenerator!.generateBatch(textStrings);

    // Restore original order for correct id mapping
    const reorderedEmbeddings = new Array<Float32Array>(filteredBatch.length);
    for (let i = 0; i < sortedBatch.length; i++) {
      reorderedEmbeddings[sortedBatch[i]!.idx] = embeddings[i]!;
    }

    // Convert to VectorEmbedding format
    const results: VectorEmbedding[] = [];
    for (let i = 0; i < filteredBatch.length && i < reorderedEmbeddings.length; i++) {
      const text = filteredBatch[i]!;
      const vector = reorderedEmbeddings[i];

      if (!vector || vector.length !== this.config.dimensions) {
        continue;
      }

      results.push({
        id: text.id,
        vector,
        content: text.text.slice(0, 500),
        metadata: text.metadata,
        createdAt: Date.now(),
      });
    }

    return { embeddings: results, count: embeddings.length };
  }

  /**
   * Parallel queue processing loop.
   * Processes multiple batches concurrently to maximize llama-server throughput.
   */
  private async processQueueLoop(): Promise<void> {
    // Set start time on first batch
    if (this.embeddingStats.startTime === 0) {
      this.embeddingStats.startTime = Date.now();
    }

    log.i("ACCUMULATOR", "Queue processing started", {
      queueSize: this.textQueue.length,
      batchSize: this.config.queueBatchSize,
      parallelBatches: EmbeddingAccumulator.PARALLEL_BATCHES,
    });

    const loopStart = performance.now();
    let totalProcessed = 0;

    try {
      // Track in-flight batch promises
      const inFlight: Promise<{ embeddings: VectorEmbedding[]; count: number } | null>[] = [];

      while (this.textQueue.length > 0 || inFlight.length > 0) {
        // Launch new batches up to parallel limit
        while (inFlight.length < EmbeddingAccumulator.PARALLEL_BATCHES && this.textQueue.length > 0) {
          const batch = this.textQueue.splice(0, this.config.queueBatchSize);
          if (batch.length === 0) break;

          const batchPromise = this.processSingleBatch(batch).catch((error) => {
            log.e("ACCUMULATOR", "Batch failed", { error: (error as Error).message, count: batch.length });
            // Re-queue failed batch
            this.textQueue.unshift(...batch);
            return null;
          });

          inFlight.push(batchPromise);
        }

        if (inFlight.length === 0) break;

        // Wait for at least one batch to complete
        const completed = await Promise.race(inFlight.map((p, idx) => p.then((result) => ({ result, idx }))));

        // Remove completed promise from inFlight
        inFlight.splice(completed.idx, 1);

        // Process result
        if (completed.result) {
          const { embeddings, count } = completed.result;

          // Add to pending
          this.pending.push(...embeddings);

          // Update stats
          this.embeddingStats.batchCount++;
          this.embeddingStats.totalGenerated += count;
          totalProcessed += count;
          this.stats.accumulated += embeddings.length;
          for (const emb of embeddings) {
            this.stats.totalBytes += emb.vector.byteLength;
          }
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
    // Cancel debounce timer and start processing immediately if needed
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      // Start processing if there are queued texts
      if (this.textQueue.length > 0 && !this.isProcessingQueue) {
        this.startQueueProcessing();
      }
    }

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
      hasFaissProvider: !!this.vectorProvider,
      accumulated: this.stats.accumulated,
      flushed: this.stats.flushed,
    });

    if (this.pending.length === 0) {
      return 0;
    }

    if (!this.vectorProvider) {
      log.w("ACCUMULATOR", "No FAISS provider set, cannot flush");
      return 0;
    }

    const count = this.pending.length;
    const startTime = performance.now();

    try {
      // Batch add to FAISS
      log.i("ACCUMULATOR", "flush_to_provider", {
        type: this.vectorProvider.constructor.name,
        count,
      });
      await this.vectorProvider.addBatch(this.pending);

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
