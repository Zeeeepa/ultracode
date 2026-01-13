/**
 * GPU Client - Unified client for Faiss + CUDA operations
 *
 * Runtime-aware implementation:
 * - Under Bun: spawns Node.js subprocess (IPC via stdin/stdout JSON)
 * - Under Node.js: uses faiss-napi and CUDA addon directly (no subprocess overhead)
 *
 * Provides both vector indexing (Faiss) and similarity computation (CUDA) in one interface.
 */

import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../../logging/index.js";
import { getDataDir } from "../../shared/storage-paths.js";
import { cosineSimilarity as cpuCosineSimilarity, simdL2Normalize } from "../../utils/simd-vector-ops.js";
import {
  getRecommendedStrategy,
  type StrategyRecommendation,
  shouldUseCudaBatchCosine,
  shouldUseCudaNormalize,
} from "./adaptive-thresholds.js";
import { createPacket, NamedPipeClient, parsePacket } from "./named-pipe-transport.js";
import type {
  CudaBatchCosineResponse,
  CudaCosineResponse,
  CudaEuclideanResponse,
  CudaInfoResponse,
  CudaNormalizeResponse,
  FaissAddResponse,
  FaissBatchSearchResponse,
  FaissIndexConfig,
  FaissInitResponse,
  FaissLoadResponse,
  FaissSaveResponse,
  FaissSearchResponse,
  FaissSearchResult,
  FaissStatsResponse,
  FaissTrainResponse,
  GpuStatsResponse,
  GpuWorkerRequest,
  GpuWorkerResponse,
} from "./types.js";

// =============================================================================
// Runtime Detection
// =============================================================================

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Unified Interface
// =============================================================================

export interface IGpuClient {
  // Lifecycle
  start(): Promise<boolean>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Faiss operations
  faissInitialize(config: FaissIndexConfig, loadPath?: string): Promise<FaissInitResponse>;
  faissAdd(ids: string[], vectors: Float32Array | number[]): Promise<FaissAddResponse>;
  faissSearch(vector: Float32Array | number[], k: number): Promise<FaissSearchResult[]>;
  faissBatchSearch(vectors: Float32Array | number[], nQueries: number, k: number): Promise<FaissSearchResult[][]>;
  faissTrain(vectors: Float32Array | number[], nVectors: number): Promise<FaissTrainResponse>;
  faissSave(path?: string): Promise<FaissSaveResponse>;
  faissLoad(path: string): Promise<FaissLoadResponse>;
  faissRemove(ids: string[]): Promise<void>;
  faissGetStats(): Promise<FaissStatsResponse["stats"]>;
  faissLoadFromDump(dumpDir: string, dimensions: number): Promise<{ loaded: number; skipped: number; files: number }>;
  faissLoadWorkerDump(
    workerId: string,
    dimensions: number,
  ): Promise<{ loaded: number; skipped: number; files: number; workerId: string }>;

  // CUDA operations (raw - always use CUDA if available)
  cudaInfo(): Promise<CudaInfoResponse>;
  cudaCosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): Promise<number>;
  cudaBatchCosineSimilarity(
    query: Float32Array | number[],
    database: (Float32Array | number[])[],
  ): Promise<Float32Array>;
  cudaEuclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): Promise<number>;
  cudaNormalizeVectors(vectors: (Float32Array | number[])[]): Promise<Float32Array[]>;
  isCudaAvailable(): boolean;

  // Adaptive operations (auto-select CUDA vs CPU based on data size)
  adaptiveBatchCosineSimilarity(
    query: Float32Array,
    database: Float32Array[],
  ): Promise<{ similarities: Float32Array; usedCuda: boolean }>;
  adaptiveNormalizeVectors(vectors: Float32Array[]): Promise<{ normalized: Float32Array[]; usedCuda: boolean }>;
  getRecommendedStrategy(
    vectorCount: number,
    dimensions: number,
    isRebuild: boolean,
    queryBatchSize?: number,
  ): StrategyRecommendation;

  // Combined stats
  getStats(): Promise<GpuStatsResponse>;
}

// =============================================================================
// Configuration
// =============================================================================

interface GpuClientConfig {
  /** Node.js executable path (default: "node") - only for subprocess mode */
  nodePath?: string;
  /** Worker script path (auto-detected if not specified) - only for subprocess mode */
  workerPath?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number | undefined;
  /** Auto-restart on crash (default: true) - only for subprocess mode */
  autoRestart?: boolean;
  /** Maximum restart attempts (default: 3) - only for subprocess mode */
  maxRestarts?: number;
  /** Force subprocess mode even under Node.js (default: false) */
  forceSubprocess?: boolean;
}

const DEFAULT_CONFIG: Required<GpuClientConfig> = {
  nodePath: "node",
  workerPath: "",
  timeout: 30000,
  autoRestart: true,
  maxRestarts: 3,
  forceSubprocess: false,
};

// =============================================================================
// Subprocess Client (always used - worker process handles faiss-napi)
// =============================================================================

interface PendingRequest {
  resolve: (response: GpuWorkerResponse) => void;
  reject: (error: Error) => void;
  abortController: AbortController;
}

class GpuSubprocessClient implements IGpuClient {
  private config: Required<GpuClientConfig>;
  private worker: ChildProcess | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private requestId = 0;
  private restartCount = 0;
  private isShuttingDown = false;
  private faissInitConfig: FaissIndexConfig | null = null;
  private responseBuffer = "";
  private _cudaAvailable = false;

  // Named Pipe client for binary IPC
  private namedPipeClient: NamedPipeClient | null = null;
  private namedPipePath: string | null = null;
  private useNamedPipe = false;

  // Mutex for start() to prevent race condition with concurrent calls
  private startPromise: Promise<boolean> | null = null;

  // Request queue for Named Pipe (only supports one pending request at a time)
  private namedPipeRequestQueue: Promise<GpuWorkerResponse> = Promise.resolve({} as GpuWorkerResponse);

  constructor(config: GpuClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.workerPath) {
      this.config.workerPath = this.findWorkerPath();
    }

    this.registerCleanupHandlers();
  }

  private registerCleanupHandlers(): void {
    const cleanup = () => {
      if (this.worker && !this.isShuttingDown) {
        // Set flag BEFORE kill to prevent handleWorkerCrash from rejecting as "Worker crashed"
        this.isShuttingDown = true;
        log.d("GPU", "Parent exiting, killing worker...");

        // Disconnect Named Pipe client
        if (this.namedPipeClient) {
          this.namedPipeClient.disconnect();
          this.namedPipeClient = null;
        }

        this.worker.kill();
        this.worker = null;
        // Reject pending requests gracefully
        for (const [, pending] of this.pendingRequests) {
          pending.abortController.abort();
          pending.reject(new Error("Client shutting down"));
        }
        this.pendingRequests.clear();
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

  private findWorkerPath(): string {
    const candidates: string[] = [];

    const thisDir = dirname(import.meta.url.replace("file://", "").replace(/^\/([A-Za-z]:)/, "$1"));
    candidates.push(join(thisDir, "gpu-worker.js"));
    candidates.push(join(process.cwd(), "dist/semantic/gpu/gpu-worker.js"));

    try {
      const pkgPath = require.resolve("ultrascript-tools-mcp");
      candidates.push(join(dirname(pkgPath), "semantic/gpu/gpu-worker.js"));
    } catch {}

    for (const path of candidates) {
      const normalizedPath = path.replace(/^\/([A-Za-z]:)/, "$1");
      if (existsSync(normalizedPath)) {
        return normalizedPath;
      }
    }

    return join(process.cwd(), "dist/semantic/gpu/gpu-worker.js");
  }

  async start(): Promise<boolean> {
    // Prevent race condition: if start is already in progress, wait for it
    // Check startPromise BEFORE checking worker to ensure cudaInfo() completes
    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.worker) return true;

    // Debug: skip subprocess spawning to identify console window source
    if (process.env["ULTRASCRIPT_NO_SUBPROCESS"] === "1") {
      log.d("GPU", "SKIPPED (ULTRASCRIPT_NO_SUBPROCESS=1)");
      return false;
    }

    // Create promise for concurrent callers to wait on
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  private async startInternal(): Promise<boolean> {
    try {
      log.i("GPU", "Starting worker", {
        nodePath: this.config.nodePath,
        workerPath: this.config.workerPath,
      });

      const isWindows = process.platform === "win32";
      const isBun = typeof Bun !== "undefined";

      // Use Node's child_process - works correctly under both Node and Bun
      if (!isBun || isWindows) {
        const { spawn } = await import("node:child_process");
        this.worker = spawn(this.config.nodePath, [this.config.workerPath], {
          stdio: ["pipe", "pipe", "pipe"], // Capture stderr for logging
          windowsHide: true,
        });
        // Don't let subprocess keep parent alive
        this.worker.unref();

        // Log stderr from worker
        if (this.worker.stderr) {
          this.worker.stderr.on("data", (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg) {
              log.d("GPU", msg);
            }
          });
        }
      } else {
        // On non-Windows with Bun, use Bun.spawn for better performance
        const proc = Bun.spawn([this.config.nodePath, this.config.workerPath], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe", // Capture stderr for logging
        });

        // Log stderr from worker (Bun)
        // DISABLED: stderr reader async loop may cause crashes in Bun with native modules
        // if (proc.stderr) {
        //   (async () => {
        //     const reader = proc.stderr.getReader();
        //     const decoder = new TextDecoder();
        //     try {
        //       while (true) {
        //         const { done, value } = await reader.read();
        //         if (done) break;
        //         const msg = decoder.decode(value).trim();
        //         if (msg) {
        //           log.d("GPU", msg);
        //         }
        //       }
        //     } catch {
        //       // Stream closed
        //     }
        //   })();
        // }

        // Wrap Bun process to match ChildProcess interface
        this.worker = {
          stdin: proc.stdin,
          stdout: proc.stdout,
          stderr: proc.stderr,
          pid: proc.pid,
          kill: () => proc.kill(),
          on: (event: string, handler: any) => {
            if (event === "exit" || event === "close") {
              proc.exited.then((code) => handler(code));
            }
          },
        } as any;
      }

      this.setupStdoutReader();
      await this.waitForReady();

      // Check CUDA availability
      try {
        const info = await this.cudaInfo();
        this._cudaAvailable = info.available;
      } catch {}

      log.i("GPU", "Worker started", { cuda: this._cudaAvailable });
      return true;
    } catch (error) {
      log.e("GPU", "Failed to start worker", { error: (error as Error).message });
      return false;
    }
  }

  private setupStdoutReader(): void {
    if (!this.worker?.stdout) return;

    this.worker.stdout.on("data", (data: Buffer) => {
      this.responseBuffer += data.toString();
      this.processResponseBuffer();
    });

    this.worker.stdout.on("error", (error: Error) => {
      if (!this.isShuttingDown) {
        log.e("GPU", "stdout read error", { error: error.message });
        this.handleWorkerCrash();
      }
    });

    this.worker.on("exit", (code: number | null) => {
      if (!this.isShuttingDown) {
        log.w("GPU", "Worker exited", { code });
        this.handleWorkerCrash();
      }
    });
  }

  private processResponseBuffer(): void {
    const lines = this.responseBuffer.split("\n");
    this.responseBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        // Handle pipe.ready message (special init message, not a request response)
        if (parsed.type === "pipe.ready" && parsed.path) {
          this.namedPipePath = parsed.path;
          log.d("GPU", "Received pipe.ready", { path: parsed.path });
          continue;
        }
        const response = parsed as GpuWorkerResponse;
        this.handleResponse(response);
      } catch {}
    }
  }

  private handleResponse(response: GpuWorkerResponse): void {
    const entry = this.pendingRequests.entries().next().value;
    if (entry) {
      const [requestId, pending] = entry;
      pending.abortController.abort();
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
    }
  }

  private async waitForReady(): Promise<void> {
    // Wait for worker to send pipe.ready message with Named Pipe path
    // (namedPipePath is set by processResponseBuffer when it receives pipe.ready)
    const timeout = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.namedPipePath) break;
      await sleep(50);
    }

    // Try to connect to Named Pipe if available
    if (this.namedPipePath) {
      try {
        // Extract pipeId from path
        const pipeId =
          this.namedPipePath.split(/[/\\]/).pop()?.replace("ultrascript-gpu-", "").replace(".sock", "") || "";

        this.namedPipeClient = new NamedPipeClient({
          pipeId,
          timeout: this.config.timeout,
          onConnect: () => {
            log.i("GPU", "Connected to Named Pipe", { path: this.namedPipePath });
          },
          onDisconnect: () => {
            log.d("GPU", "Named Pipe disconnected");
            this.useNamedPipe = false;
          },
          onError: (err) => {
            log.w("GPU", "Named Pipe error", { error: err.message });
            this.useNamedPipe = false;
          },
        });

        await this.namedPipeClient.connect();
        this.useNamedPipe = true;
        log.i("GPU", "Using Named Pipe for binary IPC");
      } catch (error) {
        log.w("GPU", "Failed to connect to Named Pipe, using stdin/stdout", {
          error: (error as Error).message,
        });
        this.namedPipeClient = null;
        this.useNamedPipe = false;
      }
    } else {
      log.d("GPU", "Named Pipe not available, using stdin/stdout");
      await sleep(100);
    }
  }

  private async handleWorkerCrash(): Promise<void> {
    if (this.isShuttingDown) return;

    for (const [, pending] of this.pendingRequests) {
      pending.abortController.abort();
      pending.reject(new Error("Worker crashed"));
    }
    this.pendingRequests.clear();
    this.worker = null;

    if (this.config.autoRestart && this.restartCount < this.config.maxRestarts) {
      this.restartCount++;
      const started = await this.start();
      if (started && this.faissInitConfig) {
        await this.faissInitialize(this.faissInitConfig);
      }
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;

    // Disconnect Named Pipe client first
    if (this.namedPipeClient) {
      this.namedPipeClient.disconnect();
      this.namedPipeClient = null;
      this.useNamedPipe = false;
    }

    if (this.worker) {
      // Send graceful shutdown request via stdin (Named Pipe already closed)
      try {
        this.worker.stdin?.write(`${JSON.stringify({ type: "shutdown" })}\n`);
        await sleep(500);
      } catch {}

      // Kill immediately - don't rely on setTimeout which may not fire if parent exits
      if (this.worker) {
        try {
          this.worker.kill("SIGTERM");
        } catch {}
        this.worker = null;
      }
    }

    for (const [, pending] of this.pendingRequests) {
      pending.abortController.abort();
      pending.reject(new Error("Client shutting down"));
    }
    this.pendingRequests.clear();
  }

  isRunning(): boolean {
    return this.worker !== null && !this.isShuttingDown;
  }

  private async sendRequest(request: GpuWorkerRequest): Promise<GpuWorkerResponse> {
    if (!this.worker?.stdin) {
      throw new Error("Worker not running");
    }

    // Use Named Pipe for binary IPC if available
    if (this.useNamedPipe && this.namedPipeClient?.isConnected) {
      log.d("GPU", "Using Named Pipe", { type: request.type });
      return this.sendNamedPipeRequest(request);
    }

    // Fallback to stdin/stdout JSON
    log.d("GPU", "Using stdin/stdout JSON", { type: request.type, hasVector: !!(request as any).vector });
    const requestId = ++this.requestId;
    const abortController = new AbortController();

    // Response promise - resolved when worker responds
    const responsePromise = new Promise<GpuWorkerResponse>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, abortController });
      this.worker!.stdin!.write(`${JSON.stringify(request)}\n`);
    });

    // Timeout promise - uses Bun-compatible async sleep instead of setTimeout
    const timeoutPromise = (async (): Promise<GpuWorkerResponse> => {
      await sleep(this.config.timeout);
      if (abortController.signal.aborted) {
        // Response already received, return never-resolving promise
        return new Promise(() => {});
      }
      this.pendingRequests.delete(requestId);
      throw new Error(`Request timeout: ${request.type}`);
    })();

    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Send request via Named Pipe (binary protocol)
   * Uses queue to ensure only one request is pending at a time
   */
  private async sendNamedPipeRequest(request: GpuWorkerRequest): Promise<GpuWorkerResponse> {
    // Queue requests to prevent "Another request is pending" errors
    const previousRequest = this.namedPipeRequestQueue;
    const currentRequest = previousRequest
      .catch(() => {}) // Ignore previous errors
      .then(() => this.sendNamedPipeRequestInternal(request));
    this.namedPipeRequestQueue = currentRequest;
    return currentRequest;
  }

  /**
   * Internal Named Pipe request handler (called sequentially via queue)
   */
  private async sendNamedPipeRequestInternal(request: GpuWorkerRequest): Promise<GpuWorkerResponse> {
    if (!this.namedPipeClient?.isConnected) {
      throw new Error("Named Pipe not connected");
    }

    // Extract vectors from request if present (for binary transfer)
    let vectors: Float32Array | undefined;
    const headerData: Record<string, unknown> = { ...request };

    if (request.type === "faiss.add" && (request as any).vectors) {
      const v = (request as any).vectors;
      vectors = v instanceof Float32Array ? v : new Float32Array(v);
      delete (headerData as any).vectors;
    } else if (request.type === "faiss.search" && (request as any).vector) {
      const v = (request as any).vector;
      vectors = v instanceof Float32Array ? v : new Float32Array(v);
      delete (headerData as any).vector;
    } else if (request.type === "faiss.batchSearch" && (request as any).vectors) {
      const v = (request as any).vectors;
      vectors = v instanceof Float32Array ? v : new Float32Array(v);
      delete (headerData as any).vectors;
    } else if (request.type === "faiss.train" && (request as any).vectors) {
      const v = (request as any).vectors;
      vectors = v instanceof Float32Array ? v : new Float32Array(v);
      delete (headerData as any).vectors;
    } else if (request.type === "cuda.cosine") {
      const a = (request as any).a;
      const b = (request as any).b;
      const aArr = a instanceof Float32Array ? a : new Float32Array(a);
      const bArr = b instanceof Float32Array ? b : new Float32Array(b);
      vectors = new Float32Array(aArr.length + bArr.length);
      vectors.set(aArr, 0);
      vectors.set(bArr, aArr.length);
      (headerData as any).dimensions = aArr.length;
      delete (headerData as any).a;
      delete (headerData as any).b;
    } else if (request.type === "cuda.batchCosine") {
      const query = (request as any).query;
      const database = (request as any).database;
      const queryArr = query instanceof Float32Array ? query : new Float32Array(query);
      const dbArrs = database.map((d: any) => (d instanceof Float32Array ? d : new Float32Array(d)));
      const totalLen = queryArr.length + dbArrs.reduce((sum: number, arr: Float32Array) => sum + arr.length, 0);
      vectors = new Float32Array(totalLen);
      vectors.set(queryArr, 0);
      let offset = queryArr.length;
      for (const arr of dbArrs) {
        vectors.set(arr, offset);
        offset += arr.length;
      }
      (headerData as any).dimensions = queryArr.length;
      (headerData as any).queryCount = 1;
      delete (headerData as any).query;
      delete (headerData as any).database;
    }

    // Create binary packet
    const packet = createPacket(headerData, vectors);

    // Send and receive response
    const responseBuffer = await this.namedPipeClient.send(packet);
    const { header } = parsePacket(responseBuffer);

    return header as unknown as GpuWorkerResponse;
  }

  // =========================================================================
  // Faiss Operations
  // =========================================================================

  async faissInitialize(config: FaissIndexConfig, loadPath?: string): Promise<FaissInitResponse> {
    this.faissInitConfig = config;

    if (!this.worker) {
      await this.start();
    }

    const response = await this.sendRequest({ type: "faiss.init", config, loadPath });
    if (!response.success) throw new Error((response as any).error);
    return response as FaissInitResponse;
  }

  async faissAdd(ids: string[], vectors: Float32Array | number[]): Promise<FaissAddResponse> {
    const vectorArray = vectors instanceof Float32Array ? Array.from(vectors) : vectors;
    const response = await this.sendRequest({ type: "faiss.add", ids, vectors: vectorArray });
    if (!response.success) throw new Error((response as any).error);
    return response as FaissAddResponse;
  }

  async faissSearch(vector: Float32Array | number[], k: number): Promise<FaissSearchResult[]> {
    const vectorArray = vector instanceof Float32Array ? Array.from(vector) : vector;
    log.d("GPU", "faissSearch", { vectorLen: vectorArray?.length, k, isArray: Array.isArray(vectorArray) });
    const response = await this.sendRequest({ type: "faiss.search", vector: vectorArray, k });
    if (!response.success) throw new Error((response as any).error);
    return (response as FaissSearchResponse).results;
  }

  async faissBatchSearch(
    vectors: Float32Array | number[],
    nQueries: number,
    k: number,
  ): Promise<FaissSearchResult[][]> {
    const vectorArray = vectors instanceof Float32Array ? Array.from(vectors) : vectors;
    const response = await this.sendRequest({ type: "faiss.batchSearch", vectors: vectorArray, nQueries, k });
    if (!response.success) throw new Error((response as any).error);
    return (response as FaissBatchSearchResponse).results;
  }

  async faissTrain(vectors: Float32Array | number[], nVectors: number): Promise<FaissTrainResponse> {
    const vectorArray = vectors instanceof Float32Array ? Array.from(vectors) : vectors;
    const response = await this.sendRequest({ type: "faiss.train", vectors: vectorArray, nVectors });
    if (!response.success) throw new Error((response as any).error);
    return response as FaissTrainResponse;
  }

  async faissSave(path?: string): Promise<FaissSaveResponse> {
    const savePath = path || join(getDataDir(), "faiss-index.bin");
    const response = await this.sendRequest({ type: "faiss.save", path: savePath });
    if (!response.success) throw new Error((response as any).error);
    return response as FaissSaveResponse;
  }

  async faissLoad(path: string): Promise<FaissLoadResponse> {
    const response = await this.sendRequest({ type: "faiss.load", path });
    if (!response.success) throw new Error((response as any).error);
    return response as FaissLoadResponse;
  }

  async faissRemove(ids: string[]): Promise<void> {
    const response = await this.sendRequest({ type: "faiss.remove", ids });
    if (!response.success) throw new Error((response as any).error);
  }

  async faissGetStats(): Promise<FaissStatsResponse["stats"]> {
    const response = await this.sendRequest({ type: "faiss.stats" });
    if (!response.success) throw new Error((response as any).error);
    return (response as FaissStatsResponse).stats;
  }

  async faissLoadFromDump(
    dumpDir: string,
    dimensions: number,
  ): Promise<{ loaded: number; skipped: number; files: number }> {
    const response = await this.sendRequest({ type: "faiss.loadFromDump", dumpDir, dimensions });
    if (!response.success) throw new Error((response as any).error);
    return {
      loaded: (response as any).loaded || 0,
      skipped: (response as any).skipped || 0,
      files: (response as any).files || 0,
    };
  }

  async faissLoadWorkerDump(
    workerId: string,
    dimensions: number,
  ): Promise<{ loaded: number; skipped: number; files: number; workerId: string }> {
    const response = await this.sendRequest({ type: "faiss.loadWorkerDump", workerId, dimensions });
    if (!response.success) throw new Error((response as any).error);
    return {
      loaded: (response as any).loaded || 0,
      skipped: (response as any).skipped || 0,
      files: (response as any).files || 0,
      workerId: (response as any).workerId || workerId,
    };
  }

  // =========================================================================
  // CUDA Operations
  // =========================================================================

  async cudaInfo(): Promise<CudaInfoResponse> {
    const response = await this.sendRequest({ type: "cuda.info" });
    if (!response.success) throw new Error((response as any).error);
    return response as CudaInfoResponse;
  }

  isCudaAvailable(): boolean {
    return this._cudaAvailable;
  }

  async cudaCosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): Promise<number> {
    const vecA = a instanceof Float32Array ? Array.from(a) : a;
    const vecB = b instanceof Float32Array ? Array.from(b) : b;

    const response = await this.sendRequest({ type: "cuda.cosine", a: vecA, b: vecB });
    if (!response.success) throw new Error((response as any).error);
    return (response as CudaCosineResponse).similarity;
  }

  async cudaBatchCosineSimilarity(
    query: Float32Array | number[],
    database: (Float32Array | number[])[],
  ): Promise<Float32Array> {
    const queryArr = query instanceof Float32Array ? Array.from(query) : query;
    const dbArr = database.map((v) => (v instanceof Float32Array ? Array.from(v) : v));

    const response = await this.sendRequest({ type: "cuda.batchCosine", query: queryArr, database: dbArr });
    if (!response.success) throw new Error((response as any).error);
    return new Float32Array((response as CudaBatchCosineResponse).similarities);
  }

  async cudaEuclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): Promise<number> {
    const vecA = a instanceof Float32Array ? Array.from(a) : a;
    const vecB = b instanceof Float32Array ? Array.from(b) : b;

    const response = await this.sendRequest({ type: "cuda.euclidean", a: vecA, b: vecB });
    if (!response.success) throw new Error((response as any).error);
    return (response as CudaEuclideanResponse).distance;
  }

  async cudaNormalizeVectors(vectors: (Float32Array | number[])[]): Promise<Float32Array[]> {
    const input = vectors.map((v) => (v instanceof Float32Array ? Array.from(v) : v));

    const response = await this.sendRequest({ type: "cuda.normalize", vectors: input });
    if (!response.success) throw new Error((response as any).error);
    return (response as CudaNormalizeResponse).vectors.map((v) => new Float32Array(v));
  }

  // =========================================================================
  // Adaptive Operations (auto-select CUDA vs CPU)
  // =========================================================================

  async adaptiveBatchCosineSimilarity(
    query: Float32Array,
    database: Float32Array[],
  ): Promise<{ similarities: Float32Array; usedCuda: boolean }> {
    const vectorCount = database.length;
    const dimensions = query.length;

    // Check if CUDA is beneficial for this workload
    if (this._cudaAvailable && shouldUseCudaBatchCosine(vectorCount, dimensions)) {
      try {
        const similarities = await this.cudaBatchCosineSimilarity(query, database);
        return { similarities, usedCuda: true };
      } catch (error) {
        log.w("GPU", "CUDA batch cosine failed, falling back to CPU", {
          error: (error as Error).message,
        });
      }
    }

    // CPU fallback using SIMD-optimized loop unrolling
    const similarities = new Float32Array(vectorCount);
    for (let i = 0; i < vectorCount; i++) {
      similarities[i] = cpuCosineSimilarity(query, database[i]!);
    }

    return { similarities, usedCuda: false };
  }

  async adaptiveNormalizeVectors(vectors: Float32Array[]): Promise<{ normalized: Float32Array[]; usedCuda: boolean }> {
    const vectorCount = vectors.length;
    const dimensions = vectors[0]?.length ?? 0;

    // Check if CUDA is beneficial for this workload
    if (this._cudaAvailable && shouldUseCudaNormalize(vectorCount, dimensions)) {
      try {
        const normalized = await this.cudaNormalizeVectors(vectors);
        return { normalized, usedCuda: true };
      } catch (error) {
        log.w("GPU", "CUDA normalize failed, falling back to CPU", {
          error: (error as Error).message,
        });
      }
    }

    // CPU fallback using SIMD-optimized normalization
    const normalized = vectors.map((v) => {
      const copy = new Float32Array(v);
      return simdL2Normalize(copy);
    });

    return { normalized, usedCuda: false };
  }

  getRecommendedStrategy(
    vectorCount: number,
    dimensions: number,
    isRebuild: boolean,
    queryBatchSize = 1,
  ): StrategyRecommendation {
    return getRecommendedStrategy(vectorCount, dimensions, isRebuild, queryBatchSize);
  }

  // =========================================================================
  // Combined Stats
  // =========================================================================

  async getStats(): Promise<GpuStatsResponse> {
    const response = await this.sendRequest({ type: "stats" });
    if (!response.success) throw new Error((response as any).error);
    return response as GpuStatsResponse;
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let gpuClient: IGpuClient | null = null;

/**
 * Get GPU client (always subprocess mode)
 * All faiss-napi operations run in dedicated Node.js worker process
 */
export function getGpuClient(config?: GpuClientConfig): IGpuClient {
  if (!gpuClient) {
    log.i("GPU", "Using subprocess mode");
    gpuClient = new GpuSubprocessClient(config);
  }
  return gpuClient;
}

export async function shutdownGpuClient(): Promise<void> {
  if (gpuClient) {
    await gpuClient.stop();
    gpuClient = null;
  }
}

// Export class for direct use (GpuDirectClient removed - always use subprocess)
export { GpuSubprocessClient };
