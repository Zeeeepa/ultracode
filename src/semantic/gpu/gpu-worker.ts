#!/usr/bin/env node
/**
 * GPU Worker - Unified Node.js subprocess for Faiss + CUDA operations
 *
 * Runs as a standalone Node.js process, communicates with Bun parent via stdin/stdout JSON.
 * Combines:
 * - faiss-napi: Native Faiss bindings with OpenMP parallelization
 * - CUDA addon: Native NVIDIA GPU operations (similarity, normalization)
 *
 * Usage: node gpu-worker.js
 *
 * IPC Protocol:
 * - Parent sends JSON requests via stdin (one per line)
 * - Worker responds via stdout (one JSON per line)
 * - Errors are logged to stderr (not parsed by parent)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import {
  type CUDAAddon,
  type CudaHandlerContext,
  handleCudaBatchCosine,
  handleCudaCosine,
  handleCudaEuclidean,
  handleCudaInfo,
  handleCudaNormalize,
} from "./cuda-handlers.js";
import {
  type EmbeddingsHandlerContext,
  handleEmbeddingsAddBatch,
  handleEmbeddingsFlush,
  handleEmbeddingsRemove,
  handleEmbeddingsSearch,
  handleEmbeddingsStats,
} from "./embeddings-handlers.js";
// Import handlers from extracted modules
import {
  type FaissHandlerContext,
  handleFaissAdd,
  handleFaissBatchSearch,
  handleFaissInit,
  handleFaissLoad,
  handleFaissLoadFromDump,
  handleFaissLoadWorkerDump,
  handleFaissRemove,
  handleFaissSave,
  handleFaissSearch,
  handleFaissStats,
  handleFaissTrain,
} from "./faiss-handlers.js";
import { createPacket, NamedPipeServer, parsePacket } from "./named-pipe-transport.js";

import type {
  GpuErrorResponse,
  GpuStatsResponse,
  GpuWorkerRequest,
  GpuWorkerResponse,
  GpuWorkerState,
} from "./types.js";

// =============================================================================
// Dynamic Imports (handle missing dependencies)
// =============================================================================

// faiss-napi type alias (optional dependency)
type FaissModule = typeof import("faiss-napi");

let faiss: FaissModule | null = null;
let cudaAddon: CUDAAddon | null = null;

async function loadFaiss(): Promise<boolean> {
  try {
    const mod = await import("faiss-napi");
    // Handle ESM/CJS wrapper: faiss-napi exports default which contains Index
    faiss = (mod.default ?? mod) as unknown as FaissModule;
    log("Faiss loaded successfully (faiss-napi)");
    return true;
  } catch (error) {
    logError(`Failed to load faiss-napi: ${(error as Error).message}`);
    return false;
  }
}

async function loadCuda(): Promise<boolean> {
  // Check environment override
  if (process.env["CUDA_FORCE_DISABLE"] === "1") {
    log("CUDA disabled via CUDA_FORCE_DISABLE=1");
    return false;
  }

  // Note: Blackwell (CC 12.0) support added to CMakeLists.txt
  // Try loading addon directly - it's compiled for CC 120

  // Create require function for ESM compatibility (native modules need require())
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);

  // Try to load CUDA addon from multiple locations
  const plat = process.platform === "win32" ? "win32" : "linux";
  const possiblePaths = [
    // When running from dist/
    join(
      dirname(import.meta.url.replace("file://", "").replace(/^\/([A-Za-z]:)/, "$1")),
      "../../../external-libs/cuda-" + plat + "-x64/ultrascript_cuda.node",
    ),
    // Direct paths
    join(process.cwd(), "external-libs/cuda-" + plat + "-x64/ultrascript_cuda.node"),
    join(process.cwd(), "dist/native/cuda/ultrascript_cuda.node"),
    join(process.cwd(), "build/Release/ultrascript_cuda.node"),
  ];

  for (const addonPath of possiblePaths) {
    try {
      const normalizedPath = addonPath.replace(/^\/([A-Za-z]:)/, "$1");
      const exists = existsSync(normalizedPath);
      log(`CUDA path check: ${normalizedPath} exists=${exists}`);
      if (!exists) continue;

      cudaAddon = require(normalizedPath);
      const info = cudaAddon!.getDeviceInfo();
      if (info.deviceCount > 0) {
        log(`CUDA loaded: ${info.deviceName} (CC ${info.computeCapability}, ${info.totalMemoryMB}MB)`);
        state.cudaAvailable = true;
        state.cudaDeviceInfo = info;
        return true;
      } else {
        log(`CUDA loaded but no devices found`);
      }
    } catch (error) {
      log(`CUDA load error at ${addonPath}: ${(error as Error).message}`);
    }
  }

  log("CUDA addon not found or no GPU available");
  return false;
}

// =============================================================================
// Logging (stderr only, stdout reserved for IPC)
// =============================================================================

function log(message: string): void {
  console.error(`[gpu-worker] ${message}`);
}

function logError(message: string): void {
  console.error(`[gpu-worker] ERROR: ${message}`);
}

// =============================================================================
// Worker State
// =============================================================================

const state: GpuWorkerState = {
  // Faiss state
  faissInitialized: false,
  faissIndexType: null,
  faissDimensions: 0,
  faissTotalVectors: 0,
  faissIsTrained: false,
  faissIdMap: new Map(),
  faissReverseIdMap: new Map(),
  // Content cache (id → content/metadata)
  contentCache: new Map(),
  contentCacheDirty: false,
  // CUDA state
  cudaAvailable: false,
  cudaDeviceInfo: null,
  // Worker state
  startTime: Date.now(),
};

// Faiss index instance
let faissIndex: any = null;

// =============================================================================
// Response Helpers
// =============================================================================

function sendResponse(response: GpuWorkerResponse): void {
  // Check if we're capturing response for Named Pipe
  if ((global as any)._captureResponse) {
    (global as any)._captureResponse(response);
    return;
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function sendError(error: string, requestId?: string): void {
  const response: GpuErrorResponse = {
    success: false,
    error,
    requestId,
  };
  sendResponse(response);
}

// =============================================================================
// Content Cache Persistence
// =============================================================================

/** Path for content cache file (relative to index) */
let contentCachePath: string | null = null;

function setContentCachePath(indexPath: string): void {
  contentCachePath = `${indexPath}.content.json`;
}

function saveContentCache(): void {
  if (!contentCachePath || state.contentCache.size === 0) return;

  try {
    const data: Record<string, any> = {};
    for (const [id, entry] of state.contentCache) {
      data[id] = entry;
    }
    writeFileSync(contentCachePath, JSON.stringify(data));
    state.contentCacheDirty = false;
    log(`Saved content cache: ${state.contentCache.size} entries`);
  } catch (error) {
    logError(`Failed to save content cache: ${(error as Error).message}`);
  }
}

function loadContentCache(): void {
  if (!contentCachePath || !existsSync(contentCachePath)) return;

  try {
    const data = JSON.parse(readFileSync(contentCachePath, "utf-8"));
    state.contentCache.clear();
    for (const [id, entry] of Object.entries(data)) {
      state.contentCache.set(id, entry as any);
    }
    log(`Loaded content cache: ${state.contentCache.size} entries`);
  } catch (error) {
    logError(`Failed to load content cache: ${(error as Error).message}`);
  }
}

// =============================================================================
// Handler Contexts
// =============================================================================

function getFaissContext(): FaissHandlerContext {
  return {
    faiss,
    faissIndex,
    state,
    log,
    logError,
    sendResponse,
    sendError,
    setFaissIndex: (index: any) => {
      faissIndex = index;
    },
    setContentCachePath,
    loadContentCache,
    saveContentCache,
  };
}

function getCudaContext(): CudaHandlerContext {
  return {
    cudaAddon,
    state,
    sendResponse,
    sendError,
  };
}

function getEmbeddingsContext(): EmbeddingsHandlerContext {
  return {
    faissIndex,
    state,
    contentCachePath,
    log,
    logError,
    sendResponse,
    sendError,
    saveContentCache,
  };
}

// =============================================================================
// Worker Lifecycle Handlers
// =============================================================================

function handleStats(): void {
  let faissMemoryMB = 0;
  if (state.faissTotalVectors > 0) {
    const vectorMemory = state.faissTotalVectors * state.faissDimensions * 4;
    const graphMemory = state.faissIndexType === "hnsw" ? state.faissTotalVectors * 32 * 2 : 0;
    faissMemoryMB = (vectorMemory + graphMemory) / 1024 / 1024;
  }

  const response: GpuStatsResponse = {
    success: true,
    type: "stats",
    faiss: {
      initialized: state.faissInitialized,
      indexType: state.faissIndexType,
      dimensions: state.faissDimensions,
      totalVectors: state.faissTotalVectors,
      memoryUsageMB: faissMemoryMB,
    },
    cuda: {
      available: state.cudaAvailable,
      deviceInfo: state.cudaDeviceInfo,
    },
    uptime: Date.now() - state.startTime,
  };
  sendResponse(response);
}

function handleShutdown(): void {
  log("Shutting down...");
  sendResponse({ success: true });
  process.exit(0);
}

// =============================================================================
// Main Request Router
// =============================================================================

async function handleRequest(request: GpuWorkerRequest): Promise<void> {
  try {
    // Handle shutdown even if modules not available
    if (request.type === "shutdown") {
      handleShutdown();
      return;
    }

    // Check faiss availability for faiss.* operations
    if (request.type.startsWith("faiss.") && !faiss) {
      sendError("Faiss native module not available (DLL dependencies missing)");
      return;
    }

    // Check CUDA availability for cuda.* operations
    if (request.type.startsWith("cuda.") && !cudaAddon) {
      sendError("CUDA addon not available");
      return;
    }

    // Check faiss availability for embeddings.* operations (uses Faiss internally)
    if (request.type.startsWith("embeddings.") && !faiss) {
      sendError("Faiss native module not available (required for embeddings)");
      return;
    }

    const faissCtx = getFaissContext();
    const cudaCtx = getCudaContext();
    const embCtx = getEmbeddingsContext();

    switch (request.type) {
      // Faiss operations
      case "faiss.init":
        await handleFaissInit(request, faissCtx);
        break;
      case "faiss.add":
        handleFaissAdd(request, faissCtx);
        break;
      case "faiss.loadFromDump":
        await handleFaissLoadFromDump(request, faissCtx);
        break;
      case "faiss.loadWorkerDump":
        await handleFaissLoadWorkerDump(request, faissCtx);
        break;
      case "faiss.search":
        handleFaissSearch(request, faissCtx);
        break;
      case "faiss.batchSearch":
        handleFaissBatchSearch(request, faissCtx);
        break;
      case "faiss.remove":
        handleFaissRemove(request, faissCtx);
        break;
      case "faiss.save":
        handleFaissSave(request, faissCtx);
        break;
      case "faiss.load":
        handleFaissLoad(request, faissCtx);
        break;
      case "faiss.train":
        handleFaissTrain(request, faissCtx);
        break;
      case "faiss.stats":
        handleFaissStats(faissCtx);
        break;

      // CUDA operations
      case "cuda.info":
        handleCudaInfo(cudaCtx);
        break;
      case "cuda.cosine":
        handleCudaCosine(request, cudaCtx);
        break;
      case "cuda.batchCosine":
        handleCudaBatchCosine(request, cudaCtx);
        break;
      case "cuda.euclidean":
        handleCudaEuclidean(request, cudaCtx);
        break;
      case "cuda.normalize":
        handleCudaNormalize(request, cudaCtx);
        break;

      // Embeddings pipeline
      case "embeddings.addBatch":
        handleEmbeddingsAddBatch(request, embCtx);
        break;
      case "embeddings.search":
        handleEmbeddingsSearch(request, embCtx);
        break;
      case "embeddings.flush":
        handleEmbeddingsFlush(embCtx);
        break;
      case "embeddings.stats":
        handleEmbeddingsStats(embCtx);
        break;
      case "embeddings.remove":
        handleEmbeddingsRemove(request, embCtx);
        break;

      // Worker lifecycle
      case "stats":
        handleStats();
        break;
      // shutdown handled above before faiss/cuda checks

      default:
        sendError(`Unknown request type: ${(request as { type: string }).type}`);
    }
  } catch (error) {
    sendError(`Request handler error: ${(error as Error).message}`);
  }
}

// =============================================================================
// IPC Setup
// =============================================================================

// Named Pipe server instance (for Bun→Node binary IPC)
let namedPipeServer: NamedPipeServer | null = null;

/**
 * Handle Named Pipe binary request
 * Converts binary packet to JSON request, processes, and returns binary response
 */
async function handleNamedPipeRequest(packet: Buffer): Promise<Buffer> {
  try {
    const { header, vectors } = parsePacket(packet);
    const request = header as unknown as GpuWorkerRequest;

    // If vectors are present, inject them into request
    if (vectors && vectors.length > 0) {
      if (request.type === "faiss.add") {
        (request as any).vectors = Array.from(vectors);
      } else if (request.type === "faiss.search") {
        (request as any).vector = Array.from(vectors);
      } else if (request.type === "faiss.batchSearch") {
        (request as any).vectors = Array.from(vectors);
      } else if (request.type === "faiss.train") {
        (request as any).vectors = Array.from(vectors);
      } else if (request.type === "cuda.cosine") {
        const dim = (header as any).dimensions || vectors.length / 2;
        (request as any).a = Array.from(vectors.subarray(0, dim));
        (request as any).b = Array.from(vectors.subarray(dim));
      } else if (request.type === "cuda.batchCosine") {
        const dim = (header as any).dimensions;
        const queryCount = (header as any).queryCount || 1;
        (request as any).query = Array.from(vectors.subarray(0, dim));
        const database: number[][] = [];
        for (let i = 1; i < queryCount + (vectors.length - dim) / dim; i++) {
          database.push(Array.from(vectors.subarray(i * dim, (i + 1) * dim)));
        }
        (request as any).database = database;
      } else if (request.type === "embeddings.addBatch") {
        // Reconstruct items from binary vectors
        const dim = (header as any).dimensions;
        const items = (header as any).items || [];
        for (let i = 0; i < items.length; i++) {
          items[i].vector = Array.from(vectors.subarray(i * dim, (i + 1) * dim));
        }
        (request as any).items = items;
      } else if (request.type === "embeddings.search") {
        (request as any).vector = Array.from(vectors);
      }
    }

    // Capture response by temporarily replacing sendResponse
    let capturedResponse: GpuWorkerResponse | null = null;

    // Override sendResponse to capture the response
    (global as any)._captureResponse = (response: GpuWorkerResponse) => {
      capturedResponse = response;
    };

    // Process the request
    await handleRequest(request);

    // Restore and get response
    delete (global as any)._captureResponse;

    if (capturedResponse) {
      // Check if response contains vectors (for future optimization)
      const response = capturedResponse as any;
      if (response.vectors && Array.isArray(response.vectors)) {
        // Return binary response with vectors
        const vectorData = new Float32Array(response.vectors.flat());
        delete response.vectors;
        return createPacket(response, vectorData);
      }
      return createPacket(capturedResponse);
    }

    return createPacket({ success: false, error: "No response generated" });
  } catch (error) {
    return createPacket({ success: false, error: (error as Error).message });
  }
}

async function main(): Promise<void> {
  log("Starting GPU worker...");

  // Load modules in parallel
  const [faissLoaded, cudaLoaded] = await Promise.all([loadFaiss(), loadCuda()]);

  if (!faissLoaded && !cudaLoaded) {
    logError("Neither Faiss nor CUDA available, worker has limited functionality");
  }

  log(`Capabilities: Faiss=${faissLoaded}, CUDA=${cudaLoaded}`);

  // Start Named Pipe server for binary IPC (parallel with stdin)
  const parentPid = process.ppid;
  const pipeId = parentPid ? `${parentPid}` : `${process.pid}`;

  try {
    namedPipeServer = new NamedPipeServer({
      pipeId,
      onRequest: handleNamedPipeRequest,
      onReady: () => {
        log(`Named Pipe server ready: ${namedPipeServer!.path}`);
        // Send pipe path to parent via stdout (special message)
        process.stdout.write(`${JSON.stringify({ type: "pipe.ready", path: namedPipeServer!.path })}\n`);
      },
      onError: (err) => {
        logError(`Named Pipe error: ${err.message}`);
      },
    });
    await namedPipeServer.start();
  } catch (error) {
    log(`Named Pipe server failed to start: ${(error as Error).message}, using stdin only`);
  }

  // Setup stdin reading (fallback and primary for JSON messages)
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line) as GpuWorkerRequest;
      await handleRequest(request);
    } catch (error) {
      sendError(`Failed to parse request: ${(error as Error).message}`);
    }
  });

  rl.on("close", () => {
    log("stdin closed, shutting down");
    namedPipeServer?.stop();
    process.exit(0);
  });

  // Additional stdin handlers for orphan detection
  process.stdin.on("end", () => {
    log("stdin end, shutting down");
    namedPipeServer?.stop();
    process.exit(0);
  });

  process.stdin.on("error", (err) => {
    log(`stdin error: ${err.message}, shutting down`);
    namedPipeServer?.stop();
    process.exit(0);
  });

  // Handle signals
  process.on("SIGTERM", () => {
    log("SIGTERM received");
    namedPipeServer?.stop();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("SIGINT received");
    namedPipeServer?.stop();
    process.exit(0);
  });

  // Handle parent disconnect (IPC channel closed)
  process.on("disconnect", () => {
    log("Disconnected from parent, shutting down");
    namedPipeServer?.stop();
    process.exit(0);
  });

  // Orphan detection: check if parent is still alive (Windows pipes don't close reliably)
  // This runs in Node.js (not Bun), so setInterval is safe
  if (parentPid && parentPid > 1) {
    const checkParent = setInterval(() => {
      try {
        process.kill(parentPid, 0); // Throws if process doesn't exist
      } catch {
        log(`Parent process ${parentPid} died, exiting`);
        clearInterval(checkParent);
        namedPipeServer?.stop();
        process.exit(0);
      }
    }, 30000); // Check every 30 seconds
    checkParent.unref(); // Don't keep process alive just for this timer
  }

  log("Ready, waiting for commands on stdin and Named Pipe");
}

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
