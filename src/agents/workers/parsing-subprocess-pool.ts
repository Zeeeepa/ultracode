/**
 * Parsing Subprocess Pool
 *
 * Subprocess-based parser pool for memory isolation.
 * Each parser runs in a separate process (spawn), accumulates memory during parsing,
 * and is killed after batch completion to release memory back to OS.
 *
 * Architecture (same as faiss-client):
 * - Under Bun: spawns bun subprocess (IPC via stdin/stdout JSON)
 * - Under Node.js: spawns node subprocess
 *
 * Benefits over Web Workers:
 * - Memory is released when process dies (OS reclaims it)
 * - Visible as separate processes in Task Manager
 * - Can set memory limits and auto-restart on OOM
 */

import type { ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../../logging/index.js";
import type { ParseResult, ParserOptions } from "../../types/parser.js";
import type { EmbeddingPoolStats, WorkerEmbeddingConfig } from "../../types/semantic.js";
import {
  type BinaryEmbedding,
  type EmbeddingsCallback,
  type EmbeddingTextItem,
  type EmbeddingTextsCallback,
  killProcess,
  type ParseRequest,
  type ParseResponse,
  type QueuedTask,
  type SpawnContext,
  type StreamingResultCallback,
  type SubprocessPoolOptions,
  type SubprocessPoolStats,
  type SubprocessState,
  spawnProcess,
} from "./subprocess-pool/index.js";

// Re-export types for backward compatibility
export type {
  BinaryEmbedding,
  EmbeddingsCallback,
  EmbeddingTextItem,
  EmbeddingTextsCallback,
  StreamingResultCallback,
  SubprocessPoolOptions,
  SubprocessPoolStats,
};

// =============================================================================
// PARSING SUBPROCESS POOL
// =============================================================================

export class ParsingSubprocessPool {
  private language: string;
  private workers: Map<number, SubprocessState> = new Map();
  private taskQueue: QueuedTask[] = [];

  private completedTasks = 0;
  private failedTasks = 0;
  private totalProcessingTime = 0;
  private totalFilesProcessed = 0;
  private processRestarts = 0;

  private readonly workerScript: string;
  private readonly poolSize: number;
  private readonly memoryLimitMB: number;
  private readonly killAfterBatch: boolean;
  private readonly maxFilesPerChunk: number;
  private embeddingConfig?: WorkerEmbeddingConfig;
  private readonly onEmbeddings?: EmbeddingsCallback;
  private readonly onEmbeddingTexts?: EmbeddingTextsCallback;
  private readonly onStreamingResult?: StreamingResultCallback;
  private readonly streamingMode: boolean;

  // Keepalive mode: keep worker 0 alive for fast incremental processing
  private keepaliveMode: boolean;
  private readonly keepaliveMemoryLimitMB: number;

  // Batch processing mode: don't kill workers while batch is in progress
  private isBatchProcessing = false;

  // Embedding statistics aggregation (across all workers)
  private embeddingStatsAgg = {
    startTime: 0,
    totalVectors: 0,
    totalBatches: 0,
    workersUsed: new Set<string>(),
  };

  private isShuttingDown = false;
  private isBun: boolean;

  constructor(language: string, options: SubprocessPoolOptions = {}) {
    this.language = language;
    this.isBun = typeof Bun !== "undefined";

    // Pool size is determined dynamically in initialize() based on file count
    // Default is 1, will be adjusted when we know how many files
    this.poolSize = options.poolSize || 1;
    this.memoryLimitMB = options.memoryLimitMB || 512; // 512MB default
    this.killAfterBatch = options.killAfterBatch ?? true; // Kill after batch by default
    this.maxFilesPerChunk = options.maxFilesPerChunk || 100; // Limit chunk size for memory safety
    this.keepaliveMode = options.keepaliveMode ?? false;
    this.keepaliveMemoryLimitMB = options.keepaliveMemoryLimitMB || 500; // 500MB for keepalive worker
    this.embeddingConfig = options.embeddingConfig;
    this.onEmbeddings = options.onEmbeddings;
    this.onEmbeddingTexts = options.onEmbeddingTexts;
    this.streamingMode = options.streamingMode ?? false;
    this.onStreamingResult = options.onStreamingResult;

    // Resolve paths
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const distRoot = currentDir.includes("agents") ? dirname(dirname(currentDir)) : currentDir;
    this.workerScript = join(distRoot, "agents", "workers", "generic-language-worker.js");
  }

  /**
   * Initialize the subprocess pool
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      initPromises.push(this.spawnWorker(i));
    }

    await Promise.all(initPromises);
    log.i("SUBPROCESS", `Initialized ${this.poolSize} subprocesses`, {
      language: this.language,
      runtime: this.isBun ? "bun" : "node",
      killAfterBatch: this.killAfterBatch,
      memoryLimitMB: this.memoryLimitMB,
    });
  }

  /**
   * Spawn a new subprocess worker
   */
  private async spawnWorker(workerId: number): Promise<void> {
    const state: SubprocessState = {
      id: workerId,
      process: null,
      busy: false,
      tasksProcessed: 0,
      totalProcessingTime: 0,
      memoryUsage: 0,
      pendingResolve: null,
      pendingReject: null,
      readyResolve: null,
      readyReject: null,
      pendingPingResolve: null,
      intentionalKill: false,
    };

    this.workers.set(workerId, state);

    const context: SpawnContext = {
      language: this.language,
      workerScript: this.workerScript,
      isBun: this.isBun,
      isShuttingDown: () => this.isShuttingDown,
      onMessage: (wid, msg) => this.handleResponse(wid, msg),
      onUnexpectedExit: (wid, code) => this.handleWorkerExit(wid, code),
    };

    try {
      await spawnProcess(workerId, state, context);
      await this.waitForReady(workerId);
      log.d("SUBPROCESS", `Subprocess ${workerId} ready`, { language: this.language });
    } catch (error) {
      log.e("SUBPROCESS", `Failed to spawn worker ${workerId}`, {
        error: (error as Error).message,
        language: this.language,
      });
      throw error;
    }
  }

  /**
   * Wait for subprocess to signal ready (event-driven via callbacks)
   */
  private async waitForReady(workerId: number): Promise<void> {
    const state = this.workers.get(workerId);
    if (!state || !state.process) return;

    return new Promise((resolve, reject) => {
      state.readyResolve = resolve;
      state.readyReject = reject;
    });
  }

  /**
   * Handle response from subprocess
   */
  private handleResponse(workerId: number, response: ParseResponse): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    // Handle ready signal
    if (response.type === "ready") {
      // Send init message with embedding config
      if (this.embeddingConfig && state.process) {
        try {
          const proc = state.process as ChildProcess;
          // Create worker-specific config with workerIndex for endpoint assignment
          const workerConfig: WorkerEmbeddingConfig = {
            ...this.embeddingConfig,
            workerIndex: workerId, // For dedicated endpoint per worker
          };
          proc.send({
            type: "init",
            embeddingConfig: workerConfig,
          });
          log.d("SUBPROCESS", `Sent embedding config to worker ${workerId}, waiting for initialized`, {
            language: this.language,
            provider: this.embeddingConfig.provider,
            workerIndex: workerId,
          });
          // DON'T resolve yet - wait for "initialized" response
          return;
        } catch (error) {
          log.w("SUBPROCESS", `Failed to send embedding config to worker ${workerId}`, {
            error: (error as Error).message,
          });
          // Fall through to resolve without embeddings
        }
      }

      // No embedding config - resolve immediately
      if (state.readyResolve) {
        state.readyResolve();
        state.readyResolve = null;
        state.readyReject = null;
      }
      return;
    }

    // Handle initialized response (embeddings configured) - NOW we're ready
    if ((response as any).type === "initialized") {
      log.d("SUBPROCESS", `Worker ${workerId} initialized with embeddings`, {
        language: this.language,
        embeddingEnabled: (response as any).embeddingEnabled,
      });
      // NOW resolve the ready promise - worker is fully initialized
      if (state.readyResolve) {
        state.readyResolve();
        state.readyResolve = null;
        state.readyReject = null;
      }
      return;
    }

    // Handle pong (memory response)
    if (response.type === "pong") {
      if (state.pendingPingResolve && response.memoryMB !== undefined) {
        // Update cached memory with real-time value
        state.memoryUsage = response.memoryMB * 1024 * 1024; // Convert MB to bytes
        state.pendingPingResolve(response.memoryMB);
        state.pendingPingResolve = null;
      }
      return;
    }

    // Handle embeddings.ready (binary embeddings from worker)
    if ((response as any).type === "embeddings.ready") {
      const embeddingsMsg = response as any;
      const count = embeddingsMsg.count || embeddingsMsg.embeddings?.length || 0;

      // Aggregate embedding statistics
      if (count > 0) {
        if (this.embeddingStatsAgg.startTime === 0) {
          this.embeddingStatsAgg.startTime = Date.now();
        }
        this.embeddingStatsAgg.totalVectors += count;
        this.embeddingStatsAgg.totalBatches += 1;
        this.embeddingStatsAgg.workersUsed.add(String(workerId));
      }

      if (this.onEmbeddings && embeddingsMsg.embeddings?.length > 0) {
        log.d("SUBPROCESS", `Received ${count} embeddings from worker ${workerId}`, {
          language: this.language,
          count,
        });
        this.onEmbeddings(embeddingsMsg.embeddings);
      }
      return;
    }

    // Handle embeddings.texts (texts for centralized embedding generation via gRPC)
    // Used by OVMS provider for better throughput
    if ((response as any).type === "embeddings.texts") {
      const textsMsg = response as any;
      const count = textsMsg.count || textsMsg.texts?.length || 0;

      // Debug: check if texts array arrived
      log.i("SUBPROCESS", "embeddings.texts received", {
        workerId,
        count,
        hasTextsArray: Array.isArray(textsMsg.texts),
        textsLength: textsMsg.texts?.length ?? 0,
        keys: Object.keys(textsMsg),
      });

      // Aggregate embedding statistics (texts will become embeddings in Main)
      if (count > 0) {
        if (this.embeddingStatsAgg.startTime === 0) {
          this.embeddingStatsAgg.startTime = Date.now();
        }
        this.embeddingStatsAgg.totalVectors += count;
        this.embeddingStatsAgg.totalBatches += 1;
        this.embeddingStatsAgg.workersUsed.add(String(workerId));
      }

      if (textsMsg.texts?.length > 0) {
        log.i("SUBPROCESS", `Received ${count} embedding texts from worker ${workerId}`, {
          language: this.language,
          count,
          hasCallback: !!this.onEmbeddingTexts,
        });
        if (this.onEmbeddingTexts) {
          this.onEmbeddingTexts(textsMsg.texts);
        } else {
          log.w("SUBPROCESS", "No onEmbeddingTexts callback, texts lost!", { count });
        }
      }
      return;
    }

    // Handle streaming_result (individual file result via IPC)
    if (response.type === "streaming_result") {
      if (this.onStreamingResult && response.result && response.taskId !== undefined) {
        this.onStreamingResult(response.result, response.taskId, response.fileIndex ?? 0, response.totalFiles ?? 0);
      }
      return;
    }

    if (response.type === "result") {
      // Update stats
      state.tasksProcessed++;
      if (response.stats) {
        state.totalProcessingTime += response.stats.totalTime;
        state.memoryUsage = response.stats.memoryUsed;
        this.totalProcessingTime += response.stats.totalTime;
        this.totalFilesProcessed += response.stats.filesProcessed;
      }
      this.completedTasks++;

      // Resolve pending promise
      if (state.pendingResolve && response.results) {
        state.pendingResolve(response.results);
        state.pendingResolve = null;
        state.pendingReject = null;
      }

      state.busy = false;

      // OPTIMIZATION: Don't kill workers during batch processing
      // This prevents 3+ second respawn delays between chunks
      if (this.isBatchProcessing) {
        // Batch in progress - keep worker alive, just process next task if any
        this.processNextTask(workerId);
        return;
      }

      // Kill process after batch if configured (for memory isolation)
      if (this.killAfterBatch) {
        // Only respawn if there are more tasks in queue
        if (this.taskQueue.length > 0) {
          this.killAndRespawn(workerId);
        } else {
          // Keepalive mode: keep worker 0 alive for fast incremental processing
          const isKeepaliveWorker = this.keepaliveMode && workerId === 0;
          const memoryMB = Math.round(state.memoryUsage / 1024 / 1024);

          if (isKeepaliveWorker) {
            // Check keepalive memory limit (default 500MB)
            if (state.memoryUsage > this.keepaliveMemoryLimitMB * 1024 * 1024) {
              log.i("SUBPROCESS", `Keepalive worker memory limit exceeded, restarting`, {
                language: this.language,
                memoryMB,
                limitMB: this.keepaliveMemoryLimitMB,
              });
              this.killAndRespawn(workerId);
            } else {
              // Keep worker 0 alive for fast incremental processing
              log.d("SUBPROCESS", `Keepalive worker ${workerId} staying alive`, {
                language: this.language,
                memoryMB,
              });
            }
          } else {
            // Just kill, don't respawn - will spawn lazily when new task arrives
            this.killWorkerOnly(workerId);
          }
        }
      } else {
        // Check memory limit
        if (state.memoryUsage > this.memoryLimitMB * 1024 * 1024) {
          log.i("SUBPROCESS", `Memory limit exceeded, restarting worker ${workerId}`, {
            memoryMB: Math.round(state.memoryUsage / 1024 / 1024),
            limitMB: this.memoryLimitMB,
          });
          this.killAndRespawn(workerId);
        } else {
          // Process next task
          this.processNextTask(workerId);
        }
      }
    } else if (response.type === "error") {
      this.failedTasks++;
      if (state.pendingReject) {
        state.pendingReject(new Error(response.error || "Unknown error"));
        state.pendingResolve = null;
        state.pendingReject = null;
      }
      state.busy = false;
      this.processNextTask(workerId);
    }
  }

  /**
   * Kill subprocess without respawning (for memory isolation when queue is empty)
   */
  private killWorkerOnly(workerId: number): void {
    const state = this.workers.get(workerId);
    if (!state || this.isShuttingDown) return;

    log.d("SUBPROCESS", `Killing worker ${workerId} (no respawn - queue empty)`, {
      language: this.language,
    });

    state.intentionalKill = true;
    killProcess(state.process);
    state.process = null;
    state.busy = false;
    state.memoryUsage = 0;
  }

  /**
   * Kill subprocess and respawn
   */
  private async killAndRespawn(workerId: number): Promise<void> {
    const state = this.workers.get(workerId);
    if (!state || this.isShuttingDown) return;

    log.d("SUBPROCESS", `Killing and respawning worker ${workerId}`, { language: this.language });

    state.intentionalKill = true;
    killProcess(state.process);
    state.process = null;
    this.processRestarts++;

    try {
      await this.spawnWorker(workerId);
      this.processNextTask(workerId);
    } catch (error) {
      log.e("SUBPROCESS", `Failed to respawn worker ${workerId}`, {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(workerId: number, code: number | null): void {
    const state = this.workers.get(workerId);
    if (!state || this.isShuttingDown) return;

    // Reject pending ready callback
    if (state.readyReject) {
      state.readyReject(new Error(`Worker ${workerId} exited with code ${code} before ready`));
      state.readyResolve = null;
      state.readyReject = null;
    }

    // Reject pending task
    if (state.pendingReject) {
      state.pendingReject(new Error(`Worker exited with code ${code}`));
      state.pendingResolve = null;
      state.pendingReject = null;
    }

    state.busy = false;
    state.process = null;

    // Respawn worker
    this.spawnWorker(workerId).then(() => {
      this.processNextTask(workerId);
    });
  }

  /**
   * Calculate optimal worker count based on file count
   * Dynamic scaling: more files → more workers (up to 6)
   */
  private getOptimalWorkerCount(fileCount: number): number {
    const maxWorkers = 6; // Cap at 6 to avoid overwhelming system

    if (fileCount < 20) return 1;
    if (fileCount < 50) return 2;
    if (fileCount < 100) return 3;
    if (fileCount < 200) return 4;
    if (fileCount < 400) return 5;
    return maxWorkers;
  }

  /**
   * Ensure we have enough workers for the task
   * Spawns additional workers if needed
   */
  private async ensureWorkers(targetCount: number): Promise<void> {
    const currentCount = this.workers.size;
    if (currentCount >= targetCount) {
      log.d("SUBPROCESS", `Workers already sufficient`, {
        language: this.language,
        current: currentCount,
        target: targetCount,
      });
      return;
    }

    log.i("SUBPROCESS", `Spawning additional workers`, {
      language: this.language,
      current: currentCount,
      target: targetCount,
      spawning: targetCount - currentCount,
    });

    const spawnPromises: Promise<void>[] = [];
    for (let i = currentCount; i < targetCount; i++) {
      spawnPromises.push(this.spawnWorker(i));
    }

    await Promise.all(spawnPromises);

    // Verify all workers are ready
    const readyWorkers = Array.from(this.workers.values()).filter((w) => w.process && !w.busy).length;
    log.i("SUBPROCESS", `Workers ready after spawn`, {
      language: this.language,
      total: this.workers.size,
      ready: readyWorkers,
    });
  }

  /**
   * Scale down workers to target count after batch completes
   * Kills excess workers (keeps worker 0 if in keepalive mode)
   */
  private async scaleDownWorkers(targetCount: number): Promise<void> {
    const currentCount = this.workers.size;
    if (currentCount <= targetCount) {
      return;
    }

    log.i("SUBPROCESS", `Scaling down workers`, {
      language: this.language,
      current: currentCount,
      target: targetCount,
      killing: currentCount - targetCount,
    });

    // Kill workers from highest ID to lowest, but keep worker 0 in keepalive mode
    const workerIds = Array.from(this.workers.keys()).sort((a, b) => b - a);
    let killed = 0;

    for (const workerId of workerIds) {
      if (this.workers.size <= targetCount) break;

      // In keepalive mode, always keep worker 0 alive
      if (this.keepaliveMode && workerId === 0) continue;

      const state = this.workers.get(workerId);
      if (state?.process && !state.busy) {
        killProcess(state.process as ChildProcess);
        this.workers.delete(workerId);
        killed++;
      }
    }

    log.i("SUBPROCESS", `Scale down complete`, {
      language: this.language,
      killed,
      remaining: this.workers.size,
    });
  }

  /**
   * Streaming load balancer: processes files in batches for low latency.
   *
   * Algorithm (Batched Streaming Greedy):
   * 1. Process files in small batches (STAT_BATCH_SIZE)
   * 2. For each batch: parallel stat → sort by size → greedy assign
   * 3. Workers start receiving files after first batch (~30ms)
   *
   * Benefits:
   * - Low latency: parsing starts after first batch, not after all files
   * - Good balance: greedy considers real-time worker loads
   * - Fast stat: parallel within each batch
   *
   * Trade-off: Slightly less optimal than full sort, but much lower latency.
   */
  private async distributeFilesBySizeAsync(files: string[], workerCount: number): Promise<string[][]> {
    if (workerCount <= 1 || files.length <= workerCount) {
      return [files];
    }

    const STAT_BATCH_SIZE = 30; // stat 30 files at a time (parallel)
    const chunks: string[][] = Array.from({ length: workerCount }, () => []);
    const chunkSizes: number[] = Array(workerCount).fill(0);

    const startTime = Date.now();
    let totalStatTime = 0;
    let batchCount = 0;

    // Helper: find worker with minimum load
    const findMinWorker = (): number => {
      let minIdx = 0;
      let minSize = chunkSizes[0] ?? 0;
      for (let i = 1; i < workerCount; i++) {
        if ((chunkSizes[i] ?? 0) < minSize) {
          minSize = chunkSizes[i] ?? 0;
          minIdx = i;
        }
      }
      return minIdx;
    };

    // Process files in streaming batches
    for (let i = 0; i < files.length; i += STAT_BATCH_SIZE) {
      const batch = files.slice(i, i + STAT_BATCH_SIZE);
      batchCount++;

      // Parallel stat for this batch
      const statStart = Date.now();
      const sizedBatch = await Promise.all(
        batch.map(async (file) => {
          try {
            const s = await stat(file);
            return { file, size: s.size };
          } catch {
            return { file, size: 0 };
          }
        }),
      );
      totalStatTime += Date.now() - statStart;

      // Sort batch by size descending (local optimization)
      sizedBatch.sort((a, b) => b.size - a.size);

      // Greedy assign: each file goes to worker with current minimum load
      for (const { file, size } of sizedBatch) {
        const minIdx = findMinWorker();
        chunks[minIdx]!.push(file);
        chunkSizes[minIdx] = (chunkSizes[minIdx] ?? 0) + size;
      }
    }

    const totalTime = Date.now() - startTime;

    // Log distribution stats
    const nonEmptyChunks = chunks.filter((c) => c.length > 0);
    const totalSize = chunkSizes.reduce((a, b) => a + b, 0);
    const avgSize = nonEmptyChunks.length > 0 ? totalSize / nonEmptyChunks.length : 0;
    const maxDeviation = avgSize > 0 ? Math.max(...chunkSizes.map((s) => Math.abs(s - avgSize))) : 0;

    log.i("SUBPROCESS", `Streaming file distribution`, {
      language: this.language,
      workers: workerCount,
      files: files.length,
      batches: batchCount,
      batchSize: STAT_BATCH_SIZE,
      chunksUsed: nonEmptyChunks.length,
      fileCounts: nonEmptyChunks.map((c) => c.length).join(","),
      chunkSizesKB: chunkSizes.map((s) => Math.round(s / 1024)).join(","),
      balanceDeviation: avgSize > 0 ? `${Math.round((maxDeviation / avgSize) * 100)}%` : "0%",
      statTimeMs: totalStatTime,
      totalTimeMs: totalTime,
    });

    return nonEmptyChunks;
  }

  /**
   * Submit a parsing task
   */
  async submitTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    if (files.length === 0) return [];

    // Mark batch processing started - prevents workers from being killed mid-batch
    this.isBatchProcessing = true;

    // Dynamic worker scaling based on file count
    // Keepalive mode with few files = incremental indexing -> 1 worker
    // Many files (full indexing) = dynamic scaling regardless of mode
    const workersBefore = this.workers.size;
    let workersAfter = workersBefore;

    const INCREMENTAL_THRESHOLD = 50; // Below this = incremental mode (1 worker)
    const isIncrementalMode = this.keepaliveMode && files.length < INCREMENTAL_THRESHOLD;

    if (isIncrementalMode) {
      // Incremental mode: use fixed poolSize (1 worker), no scaling
      await this.ensureWorkers(this.poolSize);
      workersAfter = this.workers.size;
      log.d("SUBPROCESS", `Incremental mode: fixed pool`, {
        language: this.language,
        poolSize: this.poolSize,
        files: files.length,
      });
    } else {
      // Full indexing mode: dynamic scaling based on file count
      const optimalWorkers = this.getOptimalWorkerCount(files.length);
      await this.ensureWorkers(optimalWorkers);
      workersAfter = this.workers.size;
    }

    log.i("SUBPROCESS", `submitTask scaling`, {
      language: this.language,
      files: files.length,
      mode: isIncrementalMode ? "incremental" : "full",
      targetWorkers: isIncrementalMode ? this.poolSize : this.getOptimalWorkerCount(files.length),
      workersBefore,
      workersAfter,
    });

    // Distribute files using size-based round-robin for balanced load
    // This replaces the old sequential slice approach
    // Now async with parallel stat() for better performance
    const chunks = await this.distributeFilesBySizeAsync(files, this.workers.size);

    // Apply maxFilesPerChunk limit - split large chunks if needed
    const limitedChunks: string[][] = [];
    for (const chunk of chunks) {
      if (chunk.length <= this.maxFilesPerChunk) {
        limitedChunks.push(chunk);
      } else {
        // Split oversized chunk
        for (let i = 0; i < chunk.length; i += this.maxFilesPerChunk) {
          limitedChunks.push(chunk.slice(i, i + this.maxFilesPerChunk));
        }
      }
    }

    log.i("SUBPROCESS", `Chunking files (size-balanced)`, {
      language: this.language,
      files: files.length,
      chunks: limitedChunks.length,
      maxFilesPerChunk: this.maxFilesPerChunk,
    });

    // Submit all chunks IN PARALLEL to different workers
    const promises = limitedChunks.map((chunk, idx) => {
      log.d("SUBPROCESS", `Submitting chunk ${idx}`, { language: this.language, files: chunk.length });
      return this.submitSingleTask(chunk, options);
    });

    try {
      const results = await Promise.all(promises);
      return results.flat();
    } finally {
      // Mark batch processing complete - workers can now be killed if needed
      this.isBatchProcessing = false;

      // Scale down to 1 worker after full indexing in keepalive mode
      if (this.keepaliveMode && this.workers.size > 1) {
        await this.scaleDownWorkers(1);
      }
    }
  }

  /**
   * Submit single task to a worker
   */
  private submitSingleTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    const taskId = `${this.language}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const task = { id: taskId, files, options, resolve, reject };

      // Debug: log worker states
      const workerStates = Array.from(this.workers.entries()).map(([id, s]) => `${id}:${s.busy ? "busy" : "idle"}`);
      log.d("SUBPROCESS", `submitSingleTask`, {
        language: this.language,
        workers: workerStates.join(","),
      });

      // Find idle worker (with active process)
      for (const [workerId, state] of this.workers) {
        if (!state.busy && state.process) {
          log.d("SUBPROCESS", `Assigning to worker ${workerId}`, { language: this.language });
          this.assignTask(workerId, task);
          return;
        }
      }

      // Try lazy spawn: find worker slot without process and spawn it
      for (const [workerId, state] of this.workers) {
        if (!state.busy && !state.process) {
          log.d("SUBPROCESS", `Lazy spawning worker ${workerId}`, { language: this.language });
          this.spawnWorker(workerId)
            .then(() => this.assignTask(workerId, task))
            .catch((err) => {
              log.e("SUBPROCESS", `Lazy spawn failed for worker ${workerId}`, {
                error: (err as Error).message,
              });
              task.reject(err as Error);
            });
          return;
        }
      }

      // Queue task if no worker slot available
      log.w("SUBPROCESS", `No idle worker, queuing task`, {
        language: this.language,
        queueSize: this.taskQueue.length + 1,
      });
      this.taskQueue.push(task);
    });
  }

  /**
   * Assign task to worker
   */
  private assignTask(
    workerId: number,
    task: {
      id: string;
      files: string[];
      options?: ParserOptions | undefined;
      resolve: (results: ParseResult[]) => void;
      reject: (error: Error) => void;
    },
  ): void {
    const state = this.workers.get(workerId);
    if (!state || !state.process) return;

    state.busy = true;
    state.pendingResolve = task.resolve;
    state.pendingReject = task.reject;

    const request: ParseRequest = {
      type: "parse",
      id: task.id,
      files: task.files,
      language: this.language,
      options: task.options,
      streamingMode: this.streamingMode,
    };

    // Send via V8 native IPC
    const proc = state.process as ChildProcess;
    proc.send(request);

    log.t("SUBPROCESS", `[${this.language}] Worker ${workerId} processing files`, {
      taskId: task.id,
      fileCount: task.files.length,
    });
  }

  /**
   * Process next task from queue
   */
  private processNextTask(workerId: number): void {
    if (this.taskQueue.length === 0) return;

    const state = this.workers.get(workerId);
    if (!state || state.busy || !state.process) return;

    const task = this.taskQueue.shift();
    if (task) {
      this.assignTask(workerId, task);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): SubprocessPoolStats {
    let activeWorkers = 0;
    for (const w of this.workers.values()) if (w.busy) activeWorkers++;

    return {
      language: this.language,
      totalWorkers: this.workers.size,
      activeWorkers,
      idleWorkers: this.workers.size - activeWorkers,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      avgProcessingTime: this.completedTasks > 0 ? this.totalProcessingTime / this.completedTasks : 0,
      filesProcessed: this.totalFilesProcessed,
      processRestarts: this.processRestarts,
    };
  }

  /**
   * Get embedding generation statistics
   * Aggregated from all vectors.written messages
   */
  getEmbeddingStats(): EmbeddingPoolStats {
    const dur = this.embeddingStatsAgg.startTime > 0 ? Date.now() - this.embeddingStatsAgg.startTime : 0;
    const speed = dur > 0 ? Math.round((this.embeddingStatsAgg.totalVectors / dur) * 1000) : 0;

    return {
      total: this.embeddingStatsAgg.totalVectors,
      durationMs: dur,
      speedPerSec: speed,
      workers: this.embeddingStatsAgg.workersUsed.size,
      batches: this.embeddingStatsAgg.totalBatches,
    };
  }

  /**
   * Reset embedding statistics (call before new indexing session)
   */
  resetEmbeddingStats(): void {
    this.embeddingStatsAgg = {
      startTime: 0,
      totalVectors: 0,
      totalBatches: 0,
      workersUsed: new Set<string>(),
    };
  }

  /**
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    for (const state of this.workers.values()) {
      killProcess(state.process);
    }

    this.workers.clear();
    log.i("SUBPROCESS", "Pool shutdown complete", { language: this.language });
  }

  /**
   * Check if pool is ready
   */
  isReady(): boolean {
    return this.workers.size === this.poolSize;
  }

  getLanguage(): string {
    return this.language;
  }

  /**
   * Send ping to worker and wait for pong with memory info
   * Timeout after 2 seconds if worker doesn't respond
   */
  private pingWorkerMemory(workerId: number): Promise<number> {
    const state = this.workers.get(workerId);
    if (!state || !state.process) {
      return Promise.resolve(0);
    }

    return new Promise((resolve) => {
      // Set up timeout - resolve with cached value if no response
      const timeout = setTimeout(() => {
        state.pendingPingResolve = null;
        resolve(Math.round((state.memoryUsage || 0) / 1024 / 1024));
      }, 2000);

      state.pendingPingResolve = (memoryMB: number) => {
        clearTimeout(timeout);
        resolve(memoryMB);
      };

      // Send ping via V8 IPC
      const proc = state.process as ChildProcess;
      try {
        proc.send({ type: "ping", id: `ping-${workerId}-${Date.now()}` });
      } catch {
        clearTimeout(timeout);
        state.pendingPingResolve = null;
        resolve(Math.round((state.memoryUsage || 0) / 1024 / 1024));
      }
    });
  }

  /**
   * Refresh memory usage for all workers via ping/pong
   * Returns total memory in MB
   */
  async refreshAllWorkersMemory(): Promise<number> {
    const pingPromises: Promise<number>[] = [];
    for (const workerId of this.workers.keys()) {
      pingPromises.push(this.pingWorkerMemory(workerId));
    }
    const memories = await Promise.all(pingPromises);
    return memories.reduce((sum, mb) => sum + mb, 0);
  }

  /**
   * Get total memory usage of all workers in MB (cached values)
   * For real-time memory, use refreshAllWorkersMemory() first.
   */
  getTotalMemoryMB(): number {
    let totalBytes = 0;
    for (const state of this.workers.values()) {
      totalBytes += state.memoryUsage || 0;
    }
    return Math.round(totalBytes / 1024 / 1024);
  }

  /**
   * Enable or disable keepalive mode.
   * When enabled, worker 0 stays alive after tasks complete for fast incremental processing.
   * Call this after bulk indexing to switch to incremental mode.
   */
  setKeepaliveMode(enabled: boolean): void {
    const wasEnabled = this.keepaliveMode;
    this.keepaliveMode = enabled;

    if (enabled && !wasEnabled) {
      log.i("SUBPROCESS", `Keepalive mode enabled`, {
        language: this.language,
        memoryLimitMB: this.keepaliveMemoryLimitMB,
      });
    } else if (!enabled && wasEnabled) {
      log.i("SUBPROCESS", `Keepalive mode disabled`, {
        language: this.language,
      });
    }
  }

  /**
   * Check if keepalive mode is enabled
   */
  isKeepaliveMode(): boolean {
    return this.keepaliveMode;
  }

  /**
   * Get count of active (spawned) workers
   */
  getActiveWorkerCount(): number {
    let count = 0;
    for (const state of this.workers.values()) {
      if (state.process !== null) {
        count++;
      }
    }
    return count;
  }

  /**
   * Ensure keepalive worker (worker 0) is running.
   * Call this after enabling keepalive mode to spawn the worker if needed.
   * Also kills all non-keepalive workers to free memory.
   */
  async ensureKeepaliveWorker(): Promise<void> {
    if (!this.keepaliveMode) {
      log.w("SUBPROCESS", "ensureKeepaliveWorker called but keepalive mode not enabled", {
        language: this.language,
      });
      return;
    }

    // Kill all workers except worker 0 (keepalive)
    const killedWorkers: number[] = [];
    for (const [workerId, state] of this.workers) {
      if (workerId !== 0 && state.process !== null) {
        state.intentionalKill = true;
        killProcess(state.process);
        state.process = null;
        state.busy = false;
        state.memoryUsage = 0;
        killedWorkers.push(workerId);
      }
    }

    if (killedWorkers.length > 0) {
      log.i("SUBPROCESS", "Killed non-keepalive workers", {
        language: this.language,
        killedWorkers: killedWorkers.join(","),
      });
    }

    const state = this.workers.get(0);
    if (state && state.process !== null) {
      // Worker 0 already running with active process
      log.d("SUBPROCESS", "Keepalive worker already running", {
        language: this.language,
        pid: state.process?.pid,
      });
      return;
    }

    log.i("SUBPROCESS", "Spawning KEEPALIVE worker (for incremental updates, not batch)", {
      language: this.language,
    });

    await this.spawnWorker(0);

    log.i("SUBPROCESS", "KEEPALIVE worker ready (idle, waiting for incremental tasks)", {
      language: this.language,
      pid: this.workers.get(0)?.process?.pid,
    });
  }

  /**
   * Kill all workers if total memory exceeds threshold.
   * Uses real-time ping/pong to get accurate memory from workers.
   * Returns true if workers were killed.
   *
   * Use case: After indexing, call killIfMemoryHigh(500) to release memory
   * if workers accumulated more than 500MB.
   */
  async killIfMemoryHigh(thresholdMB: number): Promise<boolean> {
    // Get real-time memory via ping/pong
    const totalMB = await this.refreshAllWorkersMemory();

    if (totalMB > thresholdMB) {
      log.i("SUBPROCESS", `Memory ${totalMB}MB > ${thresholdMB}MB threshold, killing pool`, {
        language: this.language,
        totalMemoryMB: totalMB,
        workerCount: this.workers.size,
      });
      await this.shutdown();
      return true;
    } else {
      log.d("SUBPROCESS", `Memory ${totalMB}MB <= ${thresholdMB}MB, keeping pool alive`, {
        language: this.language,
      });
      return false;
    }
  }

  /**
   * Configure embedding generation for all existing workers.
   * Call this when embedding config becomes available after pool initialization.
   * Workers will start generating embeddings after receiving the config.
   */
  async configureEmbeddings(config?: WorkerEmbeddingConfig): Promise<void> {
    // Save config for new workers that may be spawned later
    this.embeddingConfig = config;

    if (!config) {
      log.i("SUBPROCESS", `Clearing embedding config for ${this.workers.size} workers`, {
        language: this.language,
      });
      return;
    }

    log.i("SUBPROCESS", `Configuring embeddings for ${this.workers.size} workers`, {
      language: this.language,
      provider: config.provider,
      enabled: config.enabled,
    });

    for (const [workerId, state] of this.workers) {
      if (state.process) {
        try {
          const proc = state.process as ChildProcess;
          // Create worker-specific config with workerIndex for endpoint assignment
          const workerConfig: WorkerEmbeddingConfig = {
            ...config,
            workerIndex: workerId, // For dedicated endpoint per worker
          };
          proc.send({
            type: "configure-embeddings",
            config: workerConfig,
          });
        } catch (error) {
          log.w("SUBPROCESS", `Failed to configure embeddings for worker ${workerId}`, {
            error: (error as Error).message,
          });
        }
      }
    }
  }

  /**
   * Check if embedding generation is enabled for this pool
   */
  hasEmbeddingConfig(): boolean {
    return !!this.embeddingConfig?.enabled;
  }
}
