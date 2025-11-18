/**
 * Python Specialized Worker Pool Manager
 *
 * Dedicated pool for Python files with optimized 4-layer architecture.
 * Manages Python-specific workers for maximum parallelism on slow Python parsing.
 *
 * Performance Target: 3.4x speedup for Python files
 * Architecture: TASK-003B 4-layer enhancement
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
  layerTimings: {
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
  };
}

interface PendingTask {
  id: string;
  files: string[];
  options?: ParserOptions;
  resolve: (results: ParseResult[]) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

interface PythonPoolStats {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTime: number;
  avgLayer1Time: number;
  avgLayer2Time: number;
  avgLayer3Time: number;
  avgLayer4Time: number;
}

// =============================================================================
// PYTHON WORKER POOL MANAGER
// =============================================================================

export class PythonWorkerPool {
  private workers: Map<number, WorkerState> = new Map();
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskQueue: PendingTask[] = [];
  private completedTasks = 0;
  private failedTasks = 0;
  private totalProcessingTime = 0;

  private readonly workerScript: string;
  private readonly poolSize: number;
  private readonly taskTimeout: number;

  constructor(
    options: {
      poolSize?: number;
      taskTimeout?: number;
    } = {},
  ) {
    // For Python, use min(cpus, 4) as optimal (diminishing returns beyond 4)
    this.poolSize = options.poolSize || Math.min(cpus().length, 4);
    this.taskTimeout = options.taskTimeout || 45000; // 45 seconds for Python (longer than general parser)

    // Resolve Python worker script path
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.workerScript = join(currentDir, "agents", "workers", "python-worker.js");
  }

  /**
   * Initialize the Python worker pool
   */
  async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      initPromises.push(this.createWorker(i));
    }

    await Promise.all(initPromises);
    console.log(`[PythonWorkerPool] Initialized ${this.poolSize} Python workers (TASK-003B 4-layer)`);
  }

  /**
   * Create a new Python worker
   */
  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerScript, {
          workerData: { workerId: `python-${workerId}` },
        });

        const state: WorkerState = {
          id: workerId,
          worker,
          busy: false,
          tasksProcessed: 0,
          totalProcessingTime: 0,
          lastTaskTime: 0,
          layerTimings: {
            layer1: 0,
            layer2: 0,
            layer3: 0,
            layer4: 0,
          },
        };

        // Handle worker messages
        worker.on("message", (message) => {
          this.handleWorkerMessage(workerId, message);
        });

        // Handle worker errors
        worker.on("error", (error) => {
          console.error(`[PythonWorkerPool] Worker ${workerId} error:`, error);
          this.handleWorkerError(workerId, error);
        });

        // Handle worker exit
        worker.on("exit", (code) => {
          if (code !== 0) {
            console.error(`[PythonWorkerPool] Worker ${workerId} exited with code ${code}`);
          }
          this.workers.delete(workerId);
        });

        // Wait for ready signal
        const readyHandler = (message: any) => {
          if (message.type === "ready") {
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
            reject(new Error(`Python worker ${workerId} initialization timeout`));
          }
        }, 10000); // Longer timeout for Python worker initialization
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Submit a Python parsing task to the pool
   */
  async submitTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    // Filter for Python files only
    const pythonFiles = files.filter((f) => f.endsWith(".py") || f.endsWith(".pyi") || f.endsWith(".pyw"));

    if (pythonFiles.length === 0) {
      console.warn("[PythonWorkerPool] No Python files in task - returning empty results");
      return [];
    }

    if (pythonFiles.length !== files.length) {
      console.warn(`[PythonWorkerPool] Filtered ${files.length - pythonFiles.length} non-Python files`);
    }

    const taskId = `python-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        id: taskId,
        files: pythonFiles,
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
   * Try to assign task to an idle worker
   */
  private tryAssignTask(task: PendingTask): boolean {
    // Find least loaded worker (by tasksProcessed)
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
    const startTime = Date.now();

    state.worker.postMessage({
      type: "task",
      payload: {
        id: task.id,
        files: task.files,
        options: task.options,
      },
    });

    // Track assignment
    state.lastTaskTime = startTime;
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
    } else if (message.type === "initialized") {
      console.log(`[PythonWorkerPool] Worker ${workerId} initialized with ${message.layers}`);
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

    // Track layer timings
    if (result.stats) {
      state.layerTimings.layer1 += result.stats.layer1Time || 0;
      state.layerTimings.layer2 += result.stats.layer2Time || 0;
      state.layerTimings.layer3 += result.stats.layer3Time || 0;
      state.layerTimings.layer4 += result.stats.layer4Time || 0;
    }

    // Update pool stats
    this.completedTasks++;
    this.totalProcessingTime += result.stats.totalTime;

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
  private handleWorkerError(workerId: number, error: Error): void {
    const state = this.workers.get(workerId);
    if (!state) return;

    // Find any pending task assigned to this worker
    for (const [taskId, _task] of this.pendingTasks) {
      // If task was assigned to this worker, reject it
      this.handleTaskError(taskId, error);
    }

    state.busy = false;
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(taskId: string): void {
    this.handleTaskError(taskId, new Error(`Python parsing task timeout (${this.taskTimeout}ms)`));
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
  getStats(): PythonPoolStats {
    const activeWorkers = Array.from(this.workers.values()).filter((w) => w.busy).length;
    const idleWorkers = this.workers.size - activeWorkers;

    let totalLayer1 = 0;
    let totalLayer2 = 0;
    let totalLayer3 = 0;
    let totalLayer4 = 0;
    let workersWithTimings = 0;

    for (const state of this.workers.values()) {
      if (state.tasksProcessed > 0) {
        totalLayer1 += state.layerTimings.layer1;
        totalLayer2 += state.layerTimings.layer2;
        totalLayer3 += state.layerTimings.layer3;
        totalLayer4 += state.layerTimings.layer4;
        workersWithTimings++;
      }
    }

    return {
      totalWorkers: this.workers.size,
      activeWorkers,
      idleWorkers,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      avgProcessingTime: this.completedTasks > 0 ? this.totalProcessingTime / this.completedTasks : 0,
      avgLayer1Time: workersWithTimings > 0 ? totalLayer1 / workersWithTimings : 0,
      avgLayer2Time: workersWithTimings > 0 ? totalLayer2 / workersWithTimings : 0,
      avgLayer3Time: workersWithTimings > 0 ? totalLayer3 / workersWithTimings : 0,
      avgLayer4Time: workersWithTimings > 0 ? totalLayer4 / workersWithTimings : 0,
    };
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
    console.log("[PythonWorkerPool] Shutdown complete");
  }

  /**
   * Check if pool is ready
   */
  isReady(): boolean {
    return this.workers.size === this.poolSize;
  }
}
