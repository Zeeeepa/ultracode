/**
 * Generic Language Worker Pool Manager
 *
 * Universal pool that can be instantiated for any language.
 * Manages worker threads specialized for specific programming languages.
 *
 * Usage:
 *   const pythonPool = new LanguageWorkerPool("python", { poolSize: 4 });
 *   const rustPool = new LanguageWorkerPool("rust", { poolSize: 4 });
 */

import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { ParseResult, ParserOptions } from "../../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface WorkerState {
  id: number;
  worker: Worker;
  busy: boolean;
  tasksProcessed: number;
  totalProcessingTime: number;
  lastTaskTime: number;
}

interface PendingTask {
  id: string;
  files: string[];
  options?: ParserOptions;
  resolve: (results: ParseResult[]) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export interface LanguagePoolStats {
  language: string;
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTime: number;
  filesProcessed: number;
}

export interface LanguagePoolOptions {
  poolSize?: number;
  taskTimeout?: number;
  workerScript?: string; // Optional custom worker script path
}

// =============================================================================
// LANGUAGE WORKER POOL MANAGER
// =============================================================================

export class LanguageWorkerPool {
  private language: string;
  private workers: Map<number, WorkerState> = new Map();
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskQueue: PendingTask[] = [];
  private completedTasks = 0;
  private failedTasks = 0;
  private totalProcessingTime = 0;
  private totalFilesProcessed = 0;

  private readonly workerScript: string;
  private readonly poolSize: number;
  private readonly taskTimeout: number;

  constructor(language: string, options: LanguagePoolOptions = {}) {
    this.language = language;

    // Pool size configuration based on language performance characteristics
    const defaultPoolSizes: Record<string, number> = {
      python: Math.min(cpus().length, 4), // Slow: 266ms/file → max parallelism
      rust: Math.min(cpus().length, 4), // Medium: 30-40ms/file → good parallelism
      csharp: Math.min(cpus().length, 4), // Medium: 25-30ms/file → good parallelism
      cpp: Math.min(cpus().length, 3), // Fast: 20-25ms/file → moderate parallelism
      java: Math.min(cpus().length, 3), // Medium: 25-30ms/file → moderate parallelism
      go: Math.min(cpus().length, 2), // Fast: 15-20ms/file → light parallelism
      c: Math.min(cpus().length, 2), // Fast: 10-15ms/file → light parallelism
      typescript: Math.min(cpus().length, 3), // Medium: 15-20ms/file → moderate
      javascript: Math.min(cpus().length, 3), // Medium: 15-20ms/file → moderate
      vba: Math.min(cpus().length, 2), // Fast: 10-15ms/file → light parallelism
    };

    this.poolSize = options.poolSize || defaultPoolSizes[language] || Math.min(cpus().length, 2);

    // Timeout configuration based on language complexity
    const defaultTimeouts: Record<string, number> = {
      python: 45000, // 45s for 4-layer analysis
      rust: 35000, // 35s for trait/macro analysis
      csharp: 30000, // 30s for LINQ/async
      cpp: 30000, // 30s for templates
      java: 30000, // 30s for generics
      go: 25000, // 25s for goroutines
      c: 20000, // 20s for basic parsing
      typescript: 30000, // 30s for complex types
      javascript: 25000, // 25s for ES6+
      vba: 20000, // 20s for regex-based
    };

    this.taskTimeout = options.taskTimeout || defaultTimeouts[language] || 30000;

    // Resolve worker script path
    const currentDir = dirname(fileURLToPath(import.meta.url));

    // Use custom worker script if provided, otherwise use generic worker
    this.workerScript = options.workerScript || join(currentDir, "agents", "workers", "generic-language-worker.js");
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      initPromises.push(this.createWorker(i));
    }

    await Promise.all(initPromises);
    console.log(`[LanguageWorkerPool:${this.language}] Initialized ${this.poolSize} workers`);
  }

  /**
   * Create a new worker
   */
  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerScript, {
          workerData: {
            workerId: `${this.language}-${workerId}`,
            language: this.language,
          },
        });

        const state: WorkerState = {
          id: workerId,
          worker,
          busy: false,
          tasksProcessed: 0,
          totalProcessingTime: 0,
          lastTaskTime: 0,
        };

        // Handle worker messages
        worker.on("message", (message) => {
          this.handleWorkerMessage(workerId, message);
        });

        // Handle worker errors
        worker.on("error", (error) => {
          console.error(`[LanguageWorkerPool:${this.language}] Worker ${workerId} error:`, error);
          this.handleWorkerError(workerId, error);
        });

        // Handle worker exit
        worker.on("exit", (code) => {
          if (code !== 0) {
            console.error(`[LanguageWorkerPool:${this.language}] Worker ${workerId} exited with code ${code}`);
          }
          this.workers.delete(workerId);
        });

        // Wait for ready signal
        const readyHandler = (message: any) => {
          if (message.type === "ready" || message.type === "initialized") {
            this.workers.set(workerId, state);
            worker.off("message", readyHandler);
            resolve();
          }
        };
        worker.on("message", readyHandler);

        // Timeout if worker doesn't become ready
        setTimeout(() => {
          if (!this.workers.has(workerId)) {
            worker.terminate();
            reject(new Error(`Worker ${workerId} initialization timeout`));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Submit a parsing task to the pool with automatic chunking
   *
   * Distributes files across ALL available workers for maximum parallelism.
   * Chunks are created based on pool size and distributed evenly.
   */
  async submitTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    if (files.length === 0) {
      return [];
    }

    // Get pool stats for chunking
    const stats = this.getStats();
    const workerCount = stats.totalWorkers;

    // If too few files for parallel processing (< 2 per worker), use single worker
    const minFilesPerWorker = 2;
    if (files.length < minFilesPerWorker) {
      return this.submitSingleTask(files, options);
    }

    // Calculate optimal chunk size
    const idealWorkerCount = Math.min(workerCount, Math.floor(files.length / minFilesPerWorker) || 1);
    const chunkSize = Math.ceil(files.length / idealWorkerCount);

    // Split into chunks
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    console.log(`[LanguageWorkerPool:${this.language}] Chunking ${files.length} files into ${chunks.length} tasks`);

    // Submit all chunks in parallel
    const chunkPromises = chunks.map((chunk) => this.submitSingleTask(chunk, options));

    // Wait for all workers to complete
    const results = await Promise.all(chunkPromises);

    // Flatten results
    return results.flat();
  }

  /**
   * Submit a single task without chunking (internal use)
   */
  private async submitSingleTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    const taskId = `${this.language}-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        id: taskId,
        files,
        options,
        resolve,
        reject,
      };

      // Set task timeout
      task.timeout = setTimeout(() => {
        this.handleTaskTimeout(taskId);
      }, this.taskTimeout);

      this.pendingTasks.set(taskId, task);

      // Try to assign to idle worker, otherwise queue
      const assigned = this.tryAssignTask(task);
      if (!assigned) {
        this.taskQueue.push(task);
      }
    });
  }

  /**
   * Try to assign task to an idle worker (load balancing)
   */
  private tryAssignTask(task: PendingTask): boolean {
    // Find least loaded worker
    let minLoad = Number.MAX_SAFE_INTEGER;
    let targetWorkerId: number | null = null;

    for (const [workerId, state] of this.workers) {
      if (!state.busy && state.tasksProcessed < minLoad) {
        minLoad = state.tasksProcessed;
        targetWorkerId = workerId;
      }
    }

    if (targetWorkerId !== null) {
      this.assignTaskToWorker(targetWorkerId, task);
      return true;
    }

    return false;
  }

  /**
   * Assign task to specific worker
   */
  private assignTaskToWorker(workerId: number, task: PendingTask): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    state.busy = true;
    state.lastTaskTime = Date.now();

    state.worker.postMessage({
      type: "task",
      payload: {
        id: task.id,
        files: task.files,
        language: this.language,
        options: task.options,
      },
    });
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(workerId: number, message: any): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    if (message.type === "result") {
      this.handleTaskComplete(workerId, message.payload);
    } else if (message.type === "error") {
      this.handleTaskError(message.taskId, new Error(message.error));
    }
  }

  /**
   * Handle task completion
   */
  private handleTaskComplete(workerId: number, result: any): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    const task = this.pendingTasks.get(result.taskId);
    if (!task) return;

    // Clear timeout
    if (task.timeout) {
      clearTimeout(task.timeout);
    }

    // Update worker state
    state.busy = false;
    state.tasksProcessed++;
    state.totalProcessingTime += result.stats.totalTime;

    // Update pool stats
    this.completedTasks++;
    this.totalProcessingTime += result.stats.totalTime;
    this.totalFilesProcessed += result.stats.filesProcessed;

    // Resolve task
    task.resolve(result.results);
    this.pendingTasks.delete(result.taskId);

    // Process next task from queue
    this.processNextTask(workerId);
  }

  /**
   * Handle task error
   */
  private handleTaskError(taskId: string, error: Error): void {
    const task = this.pendingTasks.get(taskId);
    if (!task) return;

    if (task.timeout) {
      clearTimeout(task.timeout);
    }

    this.failedTasks++;
    task.reject(error);
    this.pendingTasks.delete(taskId);
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerId: number, _error: Error): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    // Mark worker as idle
    state.busy = false;

    // Find any pending task assigned to this worker and requeue
    for (const task of this.taskQueue) {
      // Try to assign to another worker
      this.tryAssignTask(task);
    }
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(taskId: string): void {
    this.handleTaskError(taskId, new Error(`Task timeout (${this.taskTimeout}ms) for language: ${this.language}`));
  }

  /**
   * Process next task from queue
   */
  private processNextTask(workerId: number): void {
    if (this.taskQueue.length === 0) return;

    const task = this.taskQueue.shift();
    if (task) {
      this.assignTaskToWorker(workerId, task);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): LanguagePoolStats {
    const activeWorkers = Array.from(this.workers.values()).filter((w) => w.busy).length;
    const idleWorkers = this.workers.size - activeWorkers;

    return {
      language: this.language,
      totalWorkers: this.workers.size,
      activeWorkers,
      idleWorkers,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      avgProcessingTime: this.completedTasks > 0 ? this.totalProcessingTime / this.completedTasks : 0,
      filesProcessed: this.totalFilesProcessed,
    };
  }

  /**
   * Get language
   */
  getLanguage(): string {
    return this.language;
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    for (const [_workerId, state] of this.workers) {
      shutdownPromises.push(
        new Promise((resolve) => {
          state.worker.postMessage({ type: "shutdown" });
          state.worker.once("exit", () => resolve());
          setTimeout(() => {
            state.worker.terminate();
            resolve();
          }, 5000);
        }),
      );
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
    console.log(`[LanguageWorkerPool:${this.language}] Shutdown complete`);
  }

  /**
   * Check if pool is ready
   */
  isReady(): boolean {
    return this.workers.size === this.poolSize;
  }
}
