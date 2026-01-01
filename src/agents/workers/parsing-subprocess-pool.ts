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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParseResult, ParserOptions } from "../../types/parser.js";
import type { WorkerEmbeddingConfig } from "../../types/semantic.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

interface SubprocessState {
  id: number;
  process: ChildProcess | BunProcess | null;
  busy: boolean;
  tasksProcessed: number;
  totalProcessingTime: number;
  memoryUsage: number;
  pendingResolve: ((results: ParseResult[]) => void) | null;
  pendingReject: ((error: Error) => void) | null;
  // For ready signal
  readyResolve: (() => void) | null;
  readyReject: ((error: Error) => void) | null;
  // For ping/pong memory check
  pendingPingResolve: ((memoryMB: number) => void) | null;
  // Flag to distinguish intentional kill from crash
  intentionalKill: boolean;
}

interface BunProcess {
  stdin: WritableStream<Uint8Array>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  pid: number;
  kill(): void;
  exited: Promise<number>;
}

interface ParseRequest {
  type: "parse";
  id: string;
  files: string[];
  language: string;
  options?: ParserOptions | undefined;
}

interface ParseResponse {
  type: "result" | "error" | "ready" | "pong";
  id?: string | undefined;
  results?: ParseResult[];
  error?: string;
  stats?: {
    filesProcessed: number;
    totalTime: number;
    memoryUsed: number;
  };
  // Pong response fields
  memoryMB?: number;
  rssMB?: number;
}

export interface SubprocessPoolStats {
  language: string;
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgProcessingTime: number;
  filesProcessed: number;
  processRestarts: number;
}

/**
 * Binary embedding received from worker via IPC
 */
export interface BinaryEmbedding {
  id: string;
  vectorBuffer: ArrayBuffer;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Callback for receiving embeddings from workers
 */
export type EmbeddingsCallback = (embeddings: BinaryEmbedding[]) => void;

/**
 * Callback for vectors.written event (incremental Faiss loading)
 */
export type VectorsWrittenCallback = (workerId: string, count: number, dumpDir: string) => void;

export interface SubprocessPoolOptions {
  poolSize?: number;
  taskTimeout?: number;
  memoryLimitMB?: number; // Kill and restart process if memory exceeds this
  killAfterBatch?: boolean; // Kill process after each batch to release memory
  maxFilesPerChunk?: number; // Max files per worker batch (default: 100, prevents memory bloat)
  /** Embedding configuration for workers. If provided, workers generate embeddings. */
  embeddingConfig?: WorkerEmbeddingConfig;
  /** Callback for binary embeddings from workers */
  onEmbeddings?: EmbeddingsCallback;
  /** Callback when worker writes vectors to dump files (for incremental Faiss loading) */
  onVectorsWritten?: VectorsWrittenCallback;
}

// =============================================================================
// PARSING SUBPROCESS POOL
// =============================================================================

export class ParsingSubprocessPool {
  private language: string;
  private workers: Map<number, SubprocessState> = new Map();
  private taskQueue: Array<{
    id: string;
    files: string[];
    options?: ParserOptions | undefined;
    resolve: (results: ParseResult[]) => void;
    reject: (error: Error) => void;
  }> = [];

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
  private readonly embeddingConfig?: WorkerEmbeddingConfig;
  private readonly onEmbeddings?: EmbeddingsCallback;
  private readonly onVectorsWritten?: VectorsWrittenCallback;

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
    this.embeddingConfig = options.embeddingConfig;
    this.onEmbeddings = options.onEmbeddings;
    this.onVectorsWritten = options.onVectorsWritten;

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
    logger.info("PARSING_SUBPROCESS", `Initialized ${this.poolSize} subprocesses`, {
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

    try {
      if (this.isBun) {
        // Bun: use Bun.spawn with native IPC (same API as Node's fork)
        // See: https://bun.com/guides/process/ipc
        const bunProc = Bun.spawn(["bun", this.workerScript], {
          stderr: "pipe",
          env: {
            ...process.env,
            PARSING_WORKER_ID: `${this.language}-${workerId}`,
            PARSING_WORKER_LANGUAGE: this.language,
          },
          ipc: (message: ParseResponse) => {
            // IPC message handler - same as Node's 'message' event
            this.handleResponse(workerId, message);
          },
          serialization: "advanced", // JSC structured clone (like V8)
        });

        // Wrap Bun process to match ChildProcess interface
        const proc = {
          stderr: bunProc.stderr,
          pid: bunProc.pid,
          kill: () => bunProc.kill(),
          send: (msg: any) => bunProc.send(msg), // Native IPC send
          on: (event: string, handler: any) => {
            if (event === "exit" || event === "close") {
              bunProc.exited.then((code) => handler(code));
            }
          },
        } as any;

        state.process = proc;

        logger.debug("PARSING_SUBPROCESS", `Spawned bun process with native IPC`, {
          workerId,
          language: this.language,
          pid: proc.pid,
        });

        // Log stderr for Bun process
        (async () => {
          const reader = bunProc.stderr.getReader();
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const msg = decoder.decode(value).trim();
              if (msg) {
                logger.debug("PARSING_WORKER_STDERR", `[${this.language}-${workerId}] ${msg}`);
              }
            }
          } catch {}
        })();

        // Handle exit - only process if this exact process crashes (not intentional kill)
        // Capture state reference in closure to detect if state was replaced by killAndRespawn
        const stateRef = state;
        bunProc.exited.then((code) => {
          const currentState = this.workers.get(workerId);
          // Only handle if: not shutting down, same state object (not replaced), not intentional kill
          if (!this.isShuttingDown && currentState === stateRef && !stateRef.intentionalKill) {
            logger.warn("PARSING_SUBPROCESS", `Worker ${workerId} exited unexpectedly`, {
              code,
              language: this.language,
            });
            this.handleWorkerExit(workerId, code);
          }
        });
      } else {
        // Node: use fork() with V8 native IPC
        const { fork } = await import("node:child_process");

        const proc = fork(this.workerScript, [], {
          stdio: ["pipe", "pipe", "pipe", "ipc"],
          serialization: "advanced", // V8 structured clone - faster than JSON
          env: {
            ...process.env,
            PARSING_WORKER_ID: `${this.language}-${workerId}`,
            PARSING_WORKER_LANGUAGE: this.language,
          },
        } as any);

        proc.unref();
        state.process = proc;

        logger.debug("PARSING_SUBPROCESS", `Forked node process with V8 IPC`, {
          workerId,
          language: this.language,
          pid: proc.pid,
        });

        // V8 native IPC message handler
        proc.on("message", (message: ParseResponse) => {
          this.handleResponse(workerId, message);
        });

        // Log stderr
        proc.stderr?.on("data", (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            logger.debug("PARSING_WORKER_STDERR", `[${this.language}-${workerId}] ${msg}`);
          }
        });

        // Handle exit - only process if this exact process crashes (not intentional kill)
        // Capture state reference in closure to detect if state was replaced by killAndRespawn
        const stateRef = state;
        proc.on("exit", (code) => {
          const currentState = this.workers.get(workerId);
          // Only handle if: not shutting down, same state object (not replaced), not intentional kill
          if (!this.isShuttingDown && currentState === stateRef && !stateRef.intentionalKill) {
            logger.warn("PARSING_SUBPROCESS", `Worker ${workerId} exited unexpectedly`, {
              code,
              language: this.language,
            });
            this.handleWorkerExit(workerId, code);
          }
        });
      }

      // Wait for ready signal
      await this.waitForReady(workerId);

      logger.debug("PARSING_SUBPROCESS", `Subprocess ${workerId} ready`, { language: this.language });
    } catch (error) {
      logger.error("PARSING_SUBPROCESS", `Failed to spawn worker ${workerId}`, {
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
          proc.send({
            type: "init",
            embeddingConfig: this.embeddingConfig,
          });
          logger.debug("PARSING_SUBPROCESS", `Sent embedding config to worker ${workerId}, waiting for initialized`, {
            language: this.language,
            provider: this.embeddingConfig.provider,
          });
          // DON'T resolve yet - wait for "initialized" response
          return;
        } catch (error) {
          logger.warn("PARSING_SUBPROCESS", `Failed to send embedding config to worker ${workerId}`, {
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
      logger.debug("PARSING_SUBPROCESS", `Worker ${workerId} initialized with embeddings`, {
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
      if (this.onEmbeddings && embeddingsMsg.embeddings?.length > 0) {
        logger.debug("PARSING_SUBPROCESS", `Received ${embeddingsMsg.count} embeddings from worker ${workerId}`, {
          language: this.language,
          count: embeddingsMsg.count,
        });
        this.onEmbeddings(embeddingsMsg.embeddings);
      }
      return;
    }

    // Handle vectors.written (worker wrote vectors to dump files - trigger incremental Faiss load)
    if ((response as any).type === "vectors.written") {
      const msg = response as any;
      if (this.onVectorsWritten && msg.count > 0) {
        logger.info("PARSING_SUBPROCESS", `Worker wrote vectors to dump`, {
          language: this.language,
          workerId: msg.workerId,
          count: msg.count,
          dumpDir: msg.dumpDir,
        });
        this.onVectorsWritten(msg.workerId, msg.count, msg.dumpDir);
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

      // Kill process after batch if configured (for memory isolation)
      if (this.killAfterBatch) {
        // Only respawn if there are more tasks in queue
        if (this.taskQueue.length > 0) {
          this.killAndRespawn(workerId);
        } else {
          // Just kill, don't respawn - will spawn lazily when new task arrives
          this.killWorkerOnly(workerId);
        }
      } else {
        // Check memory limit
        if (state.memoryUsage > this.memoryLimitMB * 1024 * 1024) {
          logger.info("PARSING_SUBPROCESS", `Memory limit exceeded, restarting worker ${workerId}`, {
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

    logger.debug("PARSING_SUBPROCESS", `Killing worker ${workerId} (no respawn - queue empty)`, {
      language: this.language,
    });

    // Mark as intentional kill
    state.intentionalKill = true;

    // Kill current process
    if (state.process) {
      try {
        (state.process as ChildProcess).kill?.();
      } catch {}
      state.process = null;
    }

    // Clear state but keep worker slot for lazy respawn
    state.busy = false;
    state.memoryUsage = 0;
  }

  /**
   * Kill subprocess and respawn
   */
  private async killAndRespawn(workerId: number): Promise<void> {
    const state = this.workers.get(workerId);
    if (!state || this.isShuttingDown) return;

    logger.debug("PARSING_SUBPROCESS", `Killing and respawning worker ${workerId}`, { language: this.language });

    // Mark as intentional kill to prevent exit handler from interfering
    state.intentionalKill = true;

    // Kill current process
    if (state.process) {
      try {
        (state.process as ChildProcess).kill?.();
      } catch {}
      state.process = null;
    }

    this.processRestarts++;

    // Respawn - this creates a new state with intentionalKill = false
    try {
      await this.spawnWorker(workerId);
      // Process next task if any
      this.processNextTask(workerId);
    } catch (error) {
      logger.error("PARSING_SUBPROCESS", `Failed to respawn worker ${workerId}`, {
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
      logger.debug("PARSING_SUBPROCESS", `Workers already sufficient`, {
        language: this.language,
        current: currentCount,
        target: targetCount,
      });
      return;
    }

    logger.info("PARSING_SUBPROCESS", `Spawning additional workers`, {
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
    logger.info("PARSING_SUBPROCESS", `Workers ready after spawn`, {
      language: this.language,
      total: this.workers.size,
      ready: readyWorkers,
    });
  }

  /**
   * Submit a parsing task
   */
  async submitTask(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    if (files.length === 0) return [];

    // Dynamic worker scaling based on file count
    const optimalWorkers = this.getOptimalWorkerCount(files.length);
    const workersBefore = this.workers.size;
    await this.ensureWorkers(optimalWorkers);
    const workersAfter = this.workers.size;

    logger.info("PARSING_SUBPROCESS", `submitTask scaling`, {
      language: this.language,
      files: files.length,
      optimalWorkers,
      workersBefore,
      workersAfter,
    });

    // Chunk files across workers with size limit
    // 1. Calculate ideal chunk size (distribute evenly)
    // 2. Cap at maxFilesPerChunk (prevents memory bloat on large projects)
    const workerCount = this.workers.size;
    const idealChunkSize = Math.ceil(files.length / workerCount);
    const chunkSize = Math.min(idealChunkSize, this.maxFilesPerChunk);
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }

    logger.info("PARSING_SUBPROCESS", `Chunking files`, {
      language: this.language,
      files: files.length,
      chunks: chunks.length,
      chunkSize,
      maxFilesPerChunk: this.maxFilesPerChunk,
    });

    // Submit all chunks IN PARALLEL to different workers
    const promises = chunks.map((chunk, idx) => {
      logger.debug("PARSING_SUBPROCESS", `Submitting chunk ${idx}`, { language: this.language, files: chunk.length });
      return this.submitSingleTask(chunk, options);
    });
    const results = await Promise.all(promises);

    return results.flat();
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
      logger.debug("PARSING_SUBPROCESS", `submitSingleTask`, {
        language: this.language,
        workers: workerStates.join(","),
      });

      // Find idle worker (with active process)
      for (const [workerId, state] of this.workers) {
        if (!state.busy && state.process) {
          logger.debug("PARSING_SUBPROCESS", `Assigning to worker ${workerId}`, { language: this.language });
          this.assignTask(workerId, task);
          return;
        }
      }

      // Try lazy spawn: find worker slot without process and spawn it
      for (const [workerId, state] of this.workers) {
        if (!state.busy && !state.process) {
          logger.debug("PARSING_SUBPROCESS", `Lazy spawning worker ${workerId}`, { language: this.language });
          this.spawnWorker(workerId)
            .then(() => this.assignTask(workerId, task))
            .catch((err) => {
              logger.error("PARSING_SUBPROCESS", `Lazy spawn failed for worker ${workerId}`, {
                error: (err as Error).message,
              });
              task.reject(err as Error);
            });
          return;
        }
      }

      // Queue task if no worker slot available
      logger.warn("PARSING_SUBPROCESS", `No idle worker, queuing task`, {
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
    };

    // Send via V8 native IPC
    const proc = state.process as ChildProcess;
    proc.send(request);

    logger.trace("PARSING_SUBPROCESS", `[${this.language}] Worker ${workerId} processing files`, {
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
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    for (const [, state] of this.workers) {
      if (state.process) {
        try {
          (state.process as ChildProcess).kill?.();
        } catch {}
      }
    }

    this.workers.clear();
    logger.info("PARSING_SUBPROCESS", "Pool shutdown complete", { language: this.language });
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
      logger.info("PARSING_SUBPROCESS", `Memory ${totalMB}MB > ${thresholdMB}MB threshold, killing pool`, {
        language: this.language,
        totalMemoryMB: totalMB,
        workerCount: this.workers.size,
      });
      await this.shutdown();
      return true;
    } else {
      logger.debug("PARSING_SUBPROCESS", `Memory ${totalMB}MB <= ${thresholdMB}MB, keeping pool alive`, {
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
    if (!config) {
      logger.info("PARSING_SUBPROCESS", `Clearing embedding config for ${this.workers.size} workers`, {
        language: this.language,
      });
      return;
    }

    logger.info("PARSING_SUBPROCESS", `Configuring embeddings for ${this.workers.size} workers`, {
      language: this.language,
      provider: config.provider,
      enabled: config.enabled,
    });

    for (const [workerId, state] of this.workers) {
      if (state.process) {
        try {
          const proc = state.process as ChildProcess;
          proc.send({
            type: "configure-embeddings",
            config,
          });
        } catch (error) {
          logger.warn("PARSING_SUBPROCESS", `Failed to configure embeddings for worker ${workerId}`, {
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
