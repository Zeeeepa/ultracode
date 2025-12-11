/**
 * Similarity Worker Pool - Manages parallel cosine similarity computation
 *
 * Distributes vector similarity calculations across multiple worker threads
 * for 4-8x speedup on multi-core systems.
 *
 * Usage:
 *   const pool = new SimilarityWorkerPool();
 *   await pool.initialize();
 *   const results = await pool.batchCosineSimilarity(query, database);
 *   await pool.close();
 */

import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { cosineSimilarity } from "./simd-vector-ops.js";

// Get worker script path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, "similarity-worker.js");

// Default to leaving one core for main thread
const DEFAULT_NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Minimum vectors to justify worker overhead
const MIN_VECTORS_FOR_WORKERS = 500;

interface WorkerState {
  worker: Worker;
  busy: boolean;
  taskId: number | null;
}

interface PendingTask {
  query: Float32Array;
  chunk: Float32Array[];
  startIdx: number;
  resolve: (results: Float32Array) => void;
  reject: (error: Error) => void;
}

export class SimilarityWorkerPool {
  private workers: WorkerState[] = [];
  private numWorkers: number;
  private initialized = false;
  private taskQueue: PendingTask[] = [];
  private nextTaskId = 0;
  private pendingResults: Map<
    number,
    {
      results: Float32Array;
      resolve: (results: Float32Array) => void;
      reject: (error: Error) => void;
      chunks: number;
      received: number;
      partials: Map<number, Float32Array>;
    }
  > = new Map();

  constructor(numWorkers: number = DEFAULT_NUM_WORKERS) {
    this.numWorkers = numWorkers;
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const workerPromises: Promise<void>[] = [];

    for (let i = 0; i < this.numWorkers; i++) {
      workerPromises.push(this.createWorker());
    }

    await Promise.all(workerPromises);
    this.initialized = true;

    console.error(`[SimilarityWorkerPool] Initialized with ${this.numWorkers} workers`);
  }

  private async createWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(WORKER_PATH);

        const state: WorkerState = {
          worker,
          busy: false,
          taskId: null,
        };

        worker.on("message", (message) => {
          if (message.type === "ready") {
            this.workers.push(state);
            resolve();
          } else if (message.type === "result") {
            this.handleWorkerResult(state, message.similarities, message.startIdx);
          }
        });

        worker.on("error", (error: Error) => {
          console.error("[SimilarityWorkerPool] Worker error:", error);
          state.busy = false;
          this.processQueue();
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            console.error(`[SimilarityWorkerPool] Worker exited with code ${code}`);
          }
          const idx = this.workers.indexOf(state);
          if (idx >= 0) {
            this.workers.splice(idx, 1);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWorkerResult(state: WorkerState, similarities: Float32Array, startIdx: number): void {
    state.busy = false;
    const taskId = state.taskId;
    state.taskId = null;

    if (taskId !== null) {
      const pending = this.pendingResults.get(taskId);
      if (pending) {
        pending.partials.set(startIdx, similarities);
        pending.received++;

        // Check if all chunks received
        if (pending.received === pending.chunks) {
          // Combine results in order
          let offset = 0;
          const sortedKeys = Array.from(pending.partials.keys()).sort((a, b) => a - b);
          for (const key of sortedKeys) {
            const partial = pending.partials.get(key)!;
            pending.results.set(partial, offset);
            offset += partial.length;
          }

          pending.resolve(pending.results);
          this.pendingResults.delete(taskId);
        }
      }
    }

    // Process next task in queue
    this.processQueue();
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    const task = this.taskQueue.shift()!;
    availableWorker.busy = true;

    // Find or create pending result entry
    let taskId = this.nextTaskId;
    for (const [id, pending] of this.pendingResults) {
      if (pending.resolve === task.resolve) {
        taskId = id;
        break;
      }
    }

    availableWorker.taskId = taskId;
    availableWorker.worker.postMessage({
      type: "compute",
      query: task.query,
      database: task.chunk,
      startIdx: task.startIdx,
    });
  }

  /**
   * Compute batch cosine similarity using worker pool
   * Falls back to single-threaded for small batches
   */
  async batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array> {
    // For small batches, single-threaded is faster due to worker overhead
    if (database.length < MIN_VECTORS_FOR_WORKERS || !this.initialized || this.workers.length === 0) {
      return this.singleThreadedSimilarity(query, database);
    }

    const taskId = this.nextTaskId++;
    const results = new Float32Array(database.length);
    const chunkSize = Math.ceil(database.length / this.workers.length);
    const chunks: Float32Array[][] = [];

    // Split database into chunks for each worker
    for (let i = 0; i < database.length; i += chunkSize) {
      chunks.push(database.slice(i, Math.min(i + chunkSize, database.length)));
    }

    return new Promise((resolve, reject) => {
      this.pendingResults.set(taskId, {
        results,
        resolve,
        reject,
        chunks: chunks.length,
        received: 0,
        partials: new Map(),
      });

      // Queue tasks for each chunk
      let startIdx = 0;
      for (const chunk of chunks) {
        this.taskQueue.push({
          query,
          chunk,
          startIdx,
          resolve,
          reject,
        });
        startIdx += chunk.length;
      }

      // Start processing
      for (let i = 0; i < Math.min(this.workers.length, chunks.length); i++) {
        this.processQueue();
      }
    });
  }

  /**
   * Single-threaded fallback for small batches
   */
  private singleThreadedSimilarity(query: Float32Array, database: Float32Array[]): Float32Array {
    const results = new Float32Array(database.length);
    for (let i = 0; i < database.length; i++) {
      const vec = database[i];
      if (vec) {
        results[i] = cosineSimilarity(query, vec);
      }
    }
    return results;
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    initialized: boolean;
    numWorkers: number;
    busyWorkers: number;
    queueLength: number;
    pendingTasks: number;
  } {
    return {
      initialized: this.initialized,
      numWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queueLength: this.taskQueue.length,
      pendingTasks: this.pendingResults.size,
    };
  }

  /**
   * Gracefully close all workers
   */
  async close(): Promise<void> {
    const terminatePromises = this.workers.map(
      (state) =>
        new Promise<void>((resolve) => {
          state.worker.once("exit", () => resolve());
          state.worker.terminate();
        }),
    );

    await Promise.all(terminatePromises);
    this.workers = [];
    this.initialized = false;
    this.taskQueue = [];
    this.pendingResults.clear();

    console.error("[SimilarityWorkerPool] Closed");
  }
}

// Singleton instance for reuse
let globalPool: SimilarityWorkerPool | null = null;

export async function getGlobalSimilarityPool(): Promise<SimilarityWorkerPool> {
  if (!globalPool) {
    globalPool = new SimilarityWorkerPool();
    await globalPool.initialize();
  }
  return globalPool;
}

export async function closeGlobalSimilarityPool(): Promise<void> {
  if (globalPool) {
    await globalPool.close();
    globalPool = null;
  }
}
