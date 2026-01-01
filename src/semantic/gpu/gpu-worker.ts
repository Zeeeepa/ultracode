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

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

import { createPacket, NamedPipeServer, parsePacket } from "./named-pipe-transport.js";

import type {
  ContentCacheEntry,
  CudaBatchCosineResponse,
  CudaCosineResponse,
  CudaDeviceInfo,
  CudaEuclideanResponse,
  CudaInfoResponse,
  CudaNormalizeResponse,
  EmbeddingsAddBatchRequest,
  EmbeddingsAddBatchResponse,
  EmbeddingsFlushResponse,
  EmbeddingsRemoveResponse,
  EmbeddingsSearchRequest,
  EmbeddingsSearchResponse,
  EmbeddingsStatsResponse,
  FaissAddResponse,
  FaissBatchSearchResponse,
  FaissIndexConfig,
  FaissInitResponse,
  FaissLoadResponse,
  FaissRemoveResponse,
  FaissSaveResponse,
  FaissSearchResponse,
  FaissStatsResponse,
  FaissTrainResponse,
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

interface CUDAAddon {
  cosineSimilarity(vecA: number[], vecB: number[]): number;
  batchCosineSimilarity(vecsA: number[][], vecsB: number[][]): number[];
  euclideanDistance(vecA: number[], vecB: number[]): number;
  normalizeVectors(vectors: number[][]): number[][];
  getDeviceInfo(): CudaDeviceInfo;
}

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
      if (!existsSync(normalizedPath)) continue;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cudaAddon = require(normalizedPath);
      const info = cudaAddon!.getDeviceInfo();
      if (info.deviceCount > 0) {
        log(`CUDA loaded: ${info.deviceName} (CC ${info.computeCapability}, ${info.totalMemoryMB}MB)`);
        state.cudaAvailable = true;
        state.cudaDeviceInfo = info;
        return true;
      }
    } catch (error) {
      // Try next path
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
// Faiss Index Creation
// =============================================================================

function createFaissIndex(config: FaissIndexConfig): boolean {
  if (!faiss) {
    logError("Faiss not loaded");
    return false;
  }

  const { dimensions, indexType, metric } = config;

  // Determine metric type string for faiss-napi
  const metricType = metric === "ip" || metric === "cosine" ? "IP" : "L2";

  let factoryString: string;

  try {
    switch (indexType) {
      case "flat": {
        factoryString = "Flat";
        state.faissIsTrained = true;
        break;
      }

      case "hnsw": {
        const M = config.hnswM ?? 32;
        factoryString = `HNSW${M},Flat`;
        state.faissIsTrained = true;
        log(`Creating HNSW index: M=${M}`);
        break;
      }

      case "ivf": {
        const nlist = config.ivfNlist ?? 100;
        factoryString = `IVF${nlist},Flat`;
        state.faissIsTrained = false;
        log(`Creating IVF index: nlist=${nlist} (needs training)`);
        break;
      }

      case "ivfpq": {
        const nlist = config.ivfNlist ?? 100;
        const pqM = config.pqM ?? 8;
        const pqNbits = config.pqNbits ?? 8;

        if (dimensions % pqM !== 0) {
          logError(`Dimensions (${dimensions}) must be divisible by pqM (${pqM})`);
          return false;
        }

        factoryString = `IVF${nlist},PQ${pqM}x${pqNbits}`;
        state.faissIsTrained = false;
        log(`Creating IVFPQ index: nlist=${nlist}, pqM=${pqM}, pqNbits=${pqNbits} (needs training)`);
        break;
      }

      default:
        logError(`Unknown index type: ${indexType}`);
        return false;
    }

    faissIndex = faiss.Index.fromFactory(dimensions, factoryString, metricType);
    log(`Created Faiss index: ${factoryString}, metric=${metricType}`);

    state.faissIndexType = indexType;
    state.faissDimensions = dimensions;
    state.faissInitialized = true;

    return true;
  } catch (error) {
    logError(`Failed to create index: ${(error as Error).message}`);
    return false;
  }
}

// =============================================================================
// Faiss Request Handlers
// =============================================================================

async function handleFaissInit(request: { config: FaissIndexConfig; loadPath?: string }): Promise<void> {
  const { config, loadPath } = request;

  if (loadPath && existsSync(loadPath)) {
    try {
      faissIndex = faiss!.Index.read(loadPath);
      state.faissInitialized = true;
      state.faissIndexType = config.indexType;
      state.faissDimensions = config.dimensions;
      state.faissTotalVectors = faissIndex.ntotal;
      state.faissIsTrained = faissIndex.isTrained ?? true;

      // Load ID maps if available
      const idMapPath = `${loadPath}.idmap.json`;
      if (existsSync(idMapPath)) {
        const data = JSON.parse(readFileSync(idMapPath, "utf-8"));
        state.faissIdMap = new Map(Object.entries(data.idMap).map(([k, v]) => [k, v as number]));
        state.faissReverseIdMap = new Map(Array.from(state.faissIdMap.entries()).map(([k, v]) => [v, k]));
      }

      // Set content cache path and load
      setContentCachePath(loadPath);
      loadContentCache();

      log(`Loaded index from ${loadPath} with ${faissIndex.ntotal} vectors`);

      const response: FaissInitResponse = {
        success: true,
        type: "faiss.init",
        indexType: config.indexType,
        dimensions: config.dimensions,
        loadedVectors: faissIndex.ntotal,
      };
      sendResponse(response);
      return;
    } catch (error) {
      log(`Failed to load index from ${loadPath}: ${(error as Error).message}, creating new`);
    }
  }

  if (!createFaissIndex(config)) {
    sendError("Failed to create index");
    return;
  }

  // Set content cache path for new index
  if (loadPath) {
    setContentCachePath(loadPath);
  }

  const response: FaissInitResponse = {
    success: true,
    type: "faiss.init",
    indexType: config.indexType,
    dimensions: config.dimensions,
  };
  sendResponse(response);
}

function handleFaissAdd(request: { ids: string[]; vectors: number[] }): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  if (!state.faissIsTrained && (state.faissIndexType === "ivf" || state.faissIndexType === "ivfpq")) {
    sendError("Index needs training before adding vectors. Call train() first.");
    return;
  }

  const { ids, vectors } = request;
  const startTime = performance.now();

  if (ids.length * state.faissDimensions !== vectors.length) {
    sendError(
      `Vector count mismatch: ${ids.length} IDs, but vectors suggest ${vectors.length / state.faissDimensions}`,
    );
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array (IsArray check fails for TypedArray)
    const vectorArray = Array.isArray(vectors) ? vectors : Array.from(vectors);
    faissIndex.add(vectorArray);

    const startId = state.faissTotalVectors;
    for (let i = 0; i < ids.length; i++) {
      const internalId = startId + i;
      state.faissIdMap.set(ids[i]!, internalId);
      state.faissReverseIdMap.set(internalId, ids[i]!);
    }

    state.faissTotalVectors += ids.length;

    const addTimeMs = performance.now() - startTime;
    log(`Added ${ids.length} vectors in ${addTimeMs.toFixed(1)}ms (total: ${state.faissTotalVectors})`);

    const response: FaissAddResponse = {
      success: true,
      type: "faiss.add",
      addedCount: ids.length,
      totalVectors: state.faissTotalVectors,
      addTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Failed to add vectors: ${(error as Error).message}`);
  }
}

/**
 * Load vectors directly from dump files (bypasses main process entirely)
 * Workers write to .vector-dump/*.bin → Faiss loads here directly
 */
async function handleFaissLoadFromDump(request: { dumpDir: string; dimensions: number }): Promise<void> {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { dimensions } = request; // dumpDir not used - we use getVectorDumpDir()
  const startTime = performance.now();

  try {
    // Import vector-dump functions dynamically
    const { hasPendingDumps, readAllVectorDumps, cleanupVectorDump } = await import("../vector-dump.js");

    if (!hasPendingDumps()) {
      sendResponse({
        success: true,
        type: "faiss.loadFromDump",
        loaded: 0,
        skipped: 0,
        files: 0,
        message: "No pending dump files",
      });
      return;
    }

    const { entries, stats } = readAllVectorDumps(dimensions);

    if (entries.length === 0) {
      sendResponse({
        success: true,
        type: "faiss.loadFromDump",
        loaded: 0,
        skipped: 0,
        files: stats.totalFiles,
        message: "No vectors in dump files",
      });
      return;
    }

    log(
      `Loading ${entries.length} vectors from ${stats.totalFiles} dump files (${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB)`,
    );

    // Filter out existing IDs
    const newEntries = entries.filter((e) => !state.faissIdMap.has(e.id));
    const skipped = entries.length - newEntries.length;

    if (newEntries.length === 0) {
      log(`All ${entries.length} vectors already exist, skipping`);
      cleanupVectorDump();
      sendResponse({
        success: true,
        type: "faiss.loadFromDump",
        loaded: 0,
        skipped,
        files: stats.totalFiles,
      });
      return;
    }

    // Prepare vectors for batch add (L2 normalize for cosine similarity)
    const vectorArray: number[] = new Array(newEntries.length * dimensions);
    const ids: string[] = new Array(newEntries.length);

    for (let i = 0; i < newEntries.length; i++) {
      const entry = newEntries[i]!;
      ids[i] = entry.id;

      // L2 normalize
      const vec = entry.vector;
      let norm = 0;
      for (let j = 0; j < dimensions; j++) {
        norm += vec[j]! * vec[j]!;
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let j = 0; j < dimensions; j++) {
          vectorArray[i * dimensions + j] = vec[j]! / norm;
        }
      } else {
        for (let j = 0; j < dimensions; j++) {
          vectorArray[i * dimensions + j] = vec[j]!;
        }
      }
    }

    // Add to Faiss
    faissIndex.add(vectorArray);

    // Update ID maps
    const startId = state.faissTotalVectors;
    for (let i = 0; i < ids.length; i++) {
      const internalId = startId + i;
      state.faissIdMap.set(ids[i]!, internalId);
      state.faissReverseIdMap.set(internalId, ids[i]!);
    }
    state.faissTotalVectors += ids.length;

    // Cleanup dump files
    cleanupVectorDump();

    const loadTimeMs = performance.now() - startTime;
    log(
      `Loaded ${newEntries.length} vectors from dump in ${loadTimeMs.toFixed(1)}ms (skipped: ${skipped}, total: ${state.faissTotalVectors})`,
    );

    sendResponse({
      success: true,
      type: "faiss.loadFromDump",
      loaded: newEntries.length,
      skipped,
      files: stats.totalFiles,
      totalVectors: state.faissTotalVectors,
      loadTimeMs,
    });
  } catch (error) {
    sendError(`Failed to load from dump: ${(error as Error).message}`);
  }
}

/**
 * Load vectors from a specific worker's dump files (incremental loading)
 * Called as each worker completes, enabling parallel indexing
 */
async function handleFaissLoadWorkerDump(request: { workerId: string; dimensions: number }): Promise<void> {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { workerId, dimensions } = request;
  const startTime = performance.now();

  try {
    // Import vector-dump functions dynamically
    const { readWorkerVectorDumps, cleanupWorkerDumps } = await import("../vector-dump.js");

    const { entries, stats } = readWorkerVectorDumps(workerId, dimensions);

    if (entries.length === 0) {
      sendResponse({
        success: true,
        type: "faiss.loadWorkerDump",
        workerId,
        loaded: 0,
        skipped: 0,
        files: 0,
        message: "No vectors for this worker",
      });
      return;
    }

    log(`[worker-${workerId}] Loading ${entries.length} vectors from ${stats.totalFiles} files`);

    // Filter out existing IDs
    const newEntries = entries.filter((e) => !state.faissIdMap.has(e.id));
    const skipped = entries.length - newEntries.length;

    if (newEntries.length === 0) {
      log(`[worker-${workerId}] All ${entries.length} vectors already exist, skipping`);
      cleanupWorkerDumps(workerId);
      sendResponse({
        success: true,
        type: "faiss.loadWorkerDump",
        workerId,
        loaded: 0,
        skipped,
        files: stats.totalFiles,
      });
      return;
    }

    // Prepare vectors for batch add (L2 normalize for cosine similarity)
    const vectorArray: number[] = new Array(newEntries.length * dimensions);
    const ids: string[] = new Array(newEntries.length);

    for (let i = 0; i < newEntries.length; i++) {
      const entry = newEntries[i]!;
      ids[i] = entry.id;

      // L2 normalize
      const vec = entry.vector;
      let norm = 0;
      for (let j = 0; j < dimensions; j++) {
        norm += vec[j]! * vec[j]!;
      }
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let j = 0; j < dimensions; j++) {
          vectorArray[i * dimensions + j] = vec[j]! / norm;
        }
      } else {
        for (let j = 0; j < dimensions; j++) {
          vectorArray[i * dimensions + j] = vec[j]!;
        }
      }
    }

    // Add to Faiss
    faissIndex.add(vectorArray);

    // Update ID maps
    const startId = state.faissTotalVectors;
    for (let i = 0; i < ids.length; i++) {
      const internalId = startId + i;
      state.faissIdMap.set(ids[i]!, internalId);
      state.faissReverseIdMap.set(internalId, ids[i]!);
    }
    state.faissTotalVectors += ids.length;

    // Cleanup this worker's dump files
    cleanupWorkerDumps(workerId);

    const loadTimeMs = performance.now() - startTime;
    log(
      `[worker-${workerId}] Loaded ${newEntries.length} vectors in ${loadTimeMs.toFixed(1)}ms (total: ${state.faissTotalVectors})`,
    );

    sendResponse({
      success: true,
      type: "faiss.loadWorkerDump",
      workerId,
      loaded: newEntries.length,
      skipped,
      files: stats.totalFiles,
      totalVectors: state.faissTotalVectors,
      loadTimeMs,
    });
  } catch (error) {
    sendError(`Failed to load worker dump: ${(error as Error).message}`);
  }
}

function handleFaissSearch(request: { vector: number[]; k: number }): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { vector, k } = request;
  const startTime = performance.now();

  if (vector.length !== state.faissDimensions) {
    sendError(`Vector dimension mismatch: expected ${state.faissDimensions}, got ${vector.length}`);
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array
    const queryArray = Array.isArray(vector) ? vector : Array.from(vector);

    // HNSW doesn't support deletion - orphaned vectors exist in index
    // Request more results to compensate for orphans that will be filtered
    const orphanRatio = state.faissTotalVectors > 0 ? 1 - state.faissReverseIdMap.size / state.faissTotalVectors : 0;
    const multiplier = Math.max(2, Math.ceil(1 / (1 - orphanRatio + 0.01)));
    const searchK = Math.min(k * multiplier, state.faissTotalVectors);

    log(
      `[search] k=${k}, totalVectors=${state.faissTotalVectors}, mapSize=${state.faissReverseIdMap.size}, orphanRatio=${(orphanRatio * 100).toFixed(0)}%, searchK=${searchK}`,
    );

    if (searchK === 0) {
      const response: FaissSearchResponse = {
        success: true,
        type: "faiss.search",
        results: [],
        searchTimeMs: performance.now() - startTime,
      };
      sendResponse(response);
      return;
    }

    const result = faissIndex.search(queryArray, searchK);
    const { distances, labels } = result;

    const results: Array<{ id: string; distance: number; score: number }> = [];
    for (let i = 0; i < searchK && results.length < k; i++) {
      // faiss-napi returns BigInt labels - convert to Number for Map lookup
      const internalId = Number(labels[i]!);
      if (internalId === -1) continue;

      const externalId = state.faissReverseIdMap.get(internalId);
      if (!externalId) continue; // Skip orphaned vectors (deleted from map but still in HNSW)

      const distance = distances[i]!;
      const score = 1 / (1 + distance);

      results.push({ id: externalId, distance, score });
    }

    log(
      `[search] found ${results.length}/${k} results (from ${searchK} candidates, ${((1 - orphanRatio) * 100).toFixed(0)}% valid)`,
    );

    const searchTimeMs = performance.now() - startTime;

    const response: FaissSearchResponse = {
      success: true,
      type: "faiss.search",
      results,
      searchTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Search failed: ${(error as Error).message}`);
  }
}

function handleFaissBatchSearch(request: { vectors: number[]; nQueries: number; k: number }): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { vectors, nQueries, k } = request;
  const startTime = performance.now();

  if (vectors.length !== nQueries * state.faissDimensions) {
    sendError(`Vector count mismatch: ${nQueries} queries * ${state.faissDimensions} dimensions != ${vectors.length}`);
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array
    const queryArray = Array.isArray(vectors) ? vectors : Array.from(vectors);
    const actualK = Math.min(k, state.faissTotalVectors);

    if (actualK === 0) {
      const response: FaissBatchSearchResponse = {
        success: true,
        type: "faiss.batchSearch",
        results: Array(nQueries).fill([]),
        searchTimeMs: performance.now() - startTime,
      };
      sendResponse(response);
      return;
    }

    const result = faissIndex.search(queryArray, actualK);
    const { distances, labels } = result;

    const results: Array<Array<{ id: string; distance: number; score: number }>> = [];

    for (let q = 0; q < nQueries; q++) {
      const queryResults: Array<{ id: string; distance: number; score: number }> = [];
      for (let i = 0; i < actualK; i++) {
        const idx = q * actualK + i;
        const internalId = labels[idx]!;
        if (internalId === -1) continue;

        const externalId = state.faissReverseIdMap.get(internalId);
        if (!externalId) continue;

        const distance = distances[idx]!;
        const score = 1 / (1 + distance);

        queryResults.push({ id: externalId, distance, score });
      }
      results.push(queryResults);
    }

    const searchTimeMs = performance.now() - startTime;

    const response: FaissBatchSearchResponse = {
      success: true,
      type: "faiss.batchSearch",
      results,
      searchTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Batch search failed: ${(error as Error).message}`);
  }
}

function handleFaissRemove(request: { ids: string[] }): void {
  const { ids } = request;

  let removedCount = 0;
  for (const id of ids) {
    const internalId = state.faissIdMap.get(id);
    if (internalId !== undefined) {
      state.faissIdMap.delete(id);
      state.faissReverseIdMap.delete(internalId);
      removedCount++;
    }
  }

  log(`Removed ${removedCount} ID mappings (vectors orphaned)`);

  const response: FaissRemoveResponse = {
    success: true,
    type: "faiss.remove",
    removedCount,
    totalVectors: state.faissTotalVectors,
  };
  sendResponse(response);
}

function handleFaissSave(request: { path: string }): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { path } = request;

  try {
    faissIndex.write(path);

    const idMapPath = `${path}.idmap.json`;
    const idMapData = {
      idMap: Object.fromEntries(state.faissIdMap),
      totalVectors: state.faissTotalVectors,
    };
    writeFileSync(idMapPath, JSON.stringify(idMapData));

    // Save content cache
    setContentCachePath(path);
    saveContentCache();

    const stats = statSync(path);

    log(`Saved index to ${path} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

    const response: FaissSaveResponse = {
      success: true,
      type: "faiss.save",
      path,
      sizeBytes: stats.size,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Failed to save index: ${(error as Error).message}`);
  }
}

function handleFaissLoad(request: { path: string }): void {
  if (!faiss) {
    sendError("Faiss not loaded");
    return;
  }

  const { path } = request;

  if (!existsSync(path)) {
    sendError(`Index file not found: ${path}`);
    return;
  }

  try {
    faissIndex = faiss.Index.read(path);

    const idMapPath = `${path}.idmap.json`;
    if (existsSync(idMapPath)) {
      const idMapData = JSON.parse(readFileSync(idMapPath, "utf-8"));
      state.faissIdMap = new Map(Object.entries(idMapData.idMap).map(([k, v]) => [k, v as number]));
      state.faissReverseIdMap = new Map(Array.from(state.faissIdMap.entries()).map(([k, v]) => [v, k]));
      state.faissTotalVectors = idMapData.totalVectors;
    } else {
      state.faissTotalVectors = faissIndex.ntotal;
    }

    state.faissInitialized = true;
    state.faissIsTrained = faissIndex.isTrained ?? true;

    // Load content cache
    setContentCachePath(path);
    loadContentCache();

    log(`Loaded index from ${path} with ${faissIndex.ntotal} vectors`);

    const response: FaissLoadResponse = {
      success: true,
      type: "faiss.load",
      path,
      loadedVectors: faissIndex.ntotal,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Failed to load index: ${(error as Error).message}`);
  }
}

function handleFaissTrain(request: { vectors: number[]; nVectors: number }): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  if (state.faissIsTrained) {
    sendError("Index is already trained");
    return;
  }

  const { vectors, nVectors } = request;
  const startTime = performance.now();

  if (vectors.length !== nVectors * state.faissDimensions) {
    sendError(`Training vector count mismatch: ${nVectors} * ${state.faissDimensions} != ${vectors.length}`);
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array
    const trainingArray = Array.isArray(vectors) ? vectors : Array.from(vectors);
    faissIndex.train(trainingArray);
    state.faissIsTrained = true;

    const trainTimeMs = performance.now() - startTime;
    log(`Trained index on ${nVectors} vectors in ${trainTimeMs.toFixed(1)}ms`);

    const response: FaissTrainResponse = {
      success: true,
      type: "faiss.train",
      trainedOn: nVectors,
      trainTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Training failed: ${(error as Error).message}`);
  }
}

function handleFaissStats(): void {
  let memoryUsageMB = 0;
  if (state.faissTotalVectors > 0) {
    const vectorMemory = state.faissTotalVectors * state.faissDimensions * 4;
    const graphMemory = state.faissIndexType === "hnsw" ? state.faissTotalVectors * 32 * 2 : 0;
    const idMapMemory = state.faissTotalVectors * 100;
    memoryUsageMB = (vectorMemory + graphMemory + idMapMemory) / 1024 / 1024;
  }

  const response: FaissStatsResponse = {
    success: true,
    type: "faiss.stats",
    stats: {
      indexType: state.faissIndexType ?? "flat",
      dimensions: state.faissDimensions,
      totalVectors: state.faissTotalVectors,
      memoryUsageMB,
      isTrained: state.faissIsTrained,
    },
  };
  sendResponse(response);
}

// =============================================================================
// CUDA Request Handlers
// =============================================================================

function handleCudaInfo(): void {
  const response: CudaInfoResponse = {
    success: true,
    type: "cuda.info",
    available: state.cudaAvailable,
    deviceInfo: state.cudaDeviceInfo ?? { deviceCount: 0 },
  };
  sendResponse(response);
}

function handleCudaCosine(request: { a: number[]; b: number[] }): void {
  if (!cudaAddon || !state.cudaAvailable) {
    sendError("CUDA not available");
    return;
  }

  const { a, b } = request;
  const startTime = performance.now();

  try {
    const similarity = cudaAddon.cosineSimilarity(a, b);

    const response: CudaCosineResponse = {
      success: true,
      type: "cuda.cosine",
      similarity,
      timeMs: performance.now() - startTime,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`CUDA cosine failed: ${(error as Error).message}`);
  }
}

function handleCudaBatchCosine(request: { query: number[]; database: number[][] }): void {
  if (!cudaAddon || !state.cudaAvailable) {
    sendError("CUDA not available");
    return;
  }

  const { query, database } = request;
  const startTime = performance.now();

  try {
    // Create query array repeated for each database vector
    const vecsA: number[][] = [];
    const vecsB: number[][] = [];

    for (const dbVec of database) {
      vecsA.push(query);
      vecsB.push(dbVec);
    }

    const similarities = cudaAddon.batchCosineSimilarity(vecsA, vecsB);

    const response: CudaBatchCosineResponse = {
      success: true,
      type: "cuda.batchCosine",
      similarities,
      timeMs: performance.now() - startTime,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`CUDA batch cosine failed: ${(error as Error).message}`);
  }
}

function handleCudaEuclidean(request: { a: number[]; b: number[] }): void {
  if (!cudaAddon || !state.cudaAvailable) {
    sendError("CUDA not available");
    return;
  }

  const { a, b } = request;
  const startTime = performance.now();

  try {
    const distance = cudaAddon.euclideanDistance(a, b);

    const response: CudaEuclideanResponse = {
      success: true,
      type: "cuda.euclidean",
      distance,
      timeMs: performance.now() - startTime,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`CUDA euclidean failed: ${(error as Error).message}`);
  }
}

function handleCudaNormalize(request: { vectors: number[][] }): void {
  if (!cudaAddon || !state.cudaAvailable) {
    sendError("CUDA not available");
    return;
  }

  const { vectors } = request;
  const startTime = performance.now();

  try {
    const normalized = cudaAddon.normalizeVectors(vectors);

    const response: CudaNormalizeResponse = {
      success: true,
      type: "cuda.normalize",
      vectors: normalized,
      timeMs: performance.now() - startTime,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`CUDA normalize failed: ${(error as Error).message}`);
  }
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
    const data: Record<string, ContentCacheEntry> = {};
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
      state.contentCache.set(id, entry as ContentCacheEntry);
    }
    log(`Loaded content cache: ${state.contentCache.size} entries`);
  } catch (error) {
    logError(`Failed to load content cache: ${(error as Error).message}`);
  }
}

// =============================================================================
// Embeddings Pipeline Handlers
// =============================================================================

function handleEmbeddingsAddBatch(request: EmbeddingsAddBatchRequest): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  if (!state.faissIsTrained && (state.faissIndexType === "ivf" || state.faissIndexType === "ivfpq")) {
    sendError("Index needs training before adding vectors. Call train() first.");
    return;
  }

  const { items } = request;
  const startTime = performance.now();

  if (items.length === 0) {
    const response: EmbeddingsAddBatchResponse = {
      success: true,
      type: "embeddings.addBatch",
      addedCount: 0,
      totalVectors: state.faissTotalVectors,
      addTimeMs: 0,
    };
    sendResponse(response);
    return;
  }

  // Validate dimensions
  const dim = state.faissDimensions;
  for (const item of items) {
    if (item.vector.length !== dim) {
      sendError(`Vector dimension mismatch for ${item.id}: expected ${dim}, got ${item.vector.length}`);
      return;
    }
  }

  try {
    // Prepare vectors for Faiss (number[] required, not Float32Array)
    const vectorArray: number[] = new Array(items.length * dim);
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      for (let j = 0; j < dim; j++) {
        vectorArray[i * dim + j] = item.vector[j]!;
      }
    }

    // Add to Faiss index
    faissIndex.add(vectorArray);

    // Update ID mappings and content cache
    const startId = state.faissTotalVectors;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const internalId = startId + i;
      state.faissIdMap.set(item.id, internalId);
      state.faissReverseIdMap.set(internalId, item.id);

      // Store content/metadata in cache
      if (item.content || item.metadata) {
        state.contentCache.set(item.id, {
          content: item.content,
          metadata: item.metadata,
        });
        state.contentCacheDirty = true;
      }
    }

    state.faissTotalVectors += items.length;

    const addTimeMs = performance.now() - startTime;
    log(`[embeddings] Added ${items.length} vectors in ${addTimeMs.toFixed(1)}ms (total: ${state.faissTotalVectors})`);

    const response: EmbeddingsAddBatchResponse = {
      success: true,
      type: "embeddings.addBatch",
      addedCount: items.length,
      totalVectors: state.faissTotalVectors,
      addTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Failed to add embeddings: ${(error as Error).message}`);
  }
}

function handleEmbeddingsSearch(request: EmbeddingsSearchRequest): void {
  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { vector, k, includeContent = true } = request;
  const startTime = performance.now();

  if (vector.length !== state.faissDimensions) {
    sendError(`Vector dimension mismatch: expected ${state.faissDimensions}, got ${vector.length}`);
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array
    const queryArray = Array.isArray(vector) ? vector : Array.from(vector);
    const actualK = Math.min(k, state.faissTotalVectors);

    if (actualK === 0) {
      const response: EmbeddingsSearchResponse = {
        success: true,
        type: "embeddings.search",
        results: [],
        searchTimeMs: performance.now() - startTime,
      };
      sendResponse(response);
      return;
    }

    const result = faissIndex.search(queryArray, actualK);
    const { distances, labels } = result;

    const results: Array<{
      id: string;
      score: number;
      content?: string | undefined;
      metadata?: Record<string, unknown>;
    }> = [];
    for (let i = 0; i < actualK; i++) {
      const internalId = labels[i]!;
      if (internalId === -1) continue;

      const externalId = state.faissReverseIdMap.get(internalId);
      if (!externalId) continue;

      const distance = distances[i]!;
      const score = 1 / (1 + distance);

      const entry: { id: string; score: number; content?: string | undefined; metadata?: Record<string, unknown> } = {
        id: externalId,
        score,
      };

      // Include content/metadata if requested
      if (includeContent) {
        const cached = state.contentCache.get(externalId);
        if (cached) {
          entry.content = cached.content;
          entry.metadata = cached.metadata;
        }
      }

      results.push(entry);
    }

    const searchTimeMs = performance.now() - startTime;

    const response: EmbeddingsSearchResponse = {
      success: true,
      type: "embeddings.search",
      results,
      searchTimeMs,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Embeddings search failed: ${(error as Error).message}`);
  }
}

function handleEmbeddingsFlush(): void {
  const startTime = performance.now();
  let flushedCount = 0;

  // Save Faiss index
  if (faissIndex && state.faissInitialized && contentCachePath) {
    const indexPath = contentCachePath.replace(".content.json", "");
    try {
      faissIndex.write(indexPath);
      const idMapPath = `${indexPath}.idmap.json`;
      const idMapData = {
        idMap: Object.fromEntries(state.faissIdMap),
        totalVectors: state.faissTotalVectors,
      };
      writeFileSync(idMapPath, JSON.stringify(idMapData));
      flushedCount++;
    } catch (error) {
      logError(`Failed to flush index: ${(error as Error).message}`);
    }
  }

  // Save content cache
  if (state.contentCacheDirty) {
    saveContentCache();
    flushedCount++;
  }

  const flushTimeMs = performance.now() - startTime;
  log(`[embeddings] Flush complete in ${flushTimeMs.toFixed(1)}ms`);

  const response: EmbeddingsFlushResponse = {
    success: true,
    type: "embeddings.flush",
    flushedCount,
    flushTimeMs,
  };
  sendResponse(response);
}

function handleEmbeddingsStats(): void {
  // Calculate content cache memory (rough estimate)
  let cacheMemoryBytes = 0;
  for (const [id, entry] of state.contentCache) {
    cacheMemoryBytes += id.length * 2; // string overhead
    if (entry.content) cacheMemoryBytes += entry.content.length * 2;
    if (entry.metadata) cacheMemoryBytes += JSON.stringify(entry.metadata).length * 2;
  }

  const response: EmbeddingsStatsResponse = {
    success: true,
    type: "embeddings.stats",
    stats: {
      totalVectors: state.faissTotalVectors,
      totalWithContent: state.contentCache.size,
      dimensions: state.faissDimensions,
      indexType: state.faissIndexType,
      cacheMemoryMB: cacheMemoryBytes / 1024 / 1024,
    },
  };
  sendResponse(response);
}

function handleEmbeddingsRemove(request: { ids: string[] }): void {
  const { ids } = request;

  let removedCount = 0;
  for (const id of ids) {
    const internalId = state.faissIdMap.get(id);
    if (internalId !== undefined) {
      state.faissIdMap.delete(id);
      state.faissReverseIdMap.delete(internalId);
      removedCount++;
    }
    // Also remove from content cache
    if (state.contentCache.has(id)) {
      state.contentCache.delete(id);
      state.contentCacheDirty = true;
    }
  }

  log(`[embeddings] Removed ${removedCount} ID mappings`);

  const response: EmbeddingsRemoveResponse = {
    success: true,
    type: "embeddings.remove",
    removedCount,
    totalVectors: state.faissTotalVectors,
  };
  sendResponse(response);
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

    switch (request.type) {
      // Faiss operations
      case "faiss.init":
        await handleFaissInit(request);
        break;
      case "faiss.add":
        handleFaissAdd(request);
        break;
      case "faiss.loadFromDump":
        await handleFaissLoadFromDump(request);
        break;
      case "faiss.loadWorkerDump":
        await handleFaissLoadWorkerDump(request);
        break;
      case "faiss.search":
        handleFaissSearch(request);
        break;
      case "faiss.batchSearch":
        handleFaissBatchSearch(request);
        break;
      case "faiss.remove":
        handleFaissRemove(request);
        break;
      case "faiss.save":
        handleFaissSave(request);
        break;
      case "faiss.load":
        handleFaissLoad(request);
        break;
      case "faiss.train":
        handleFaissTrain(request);
        break;
      case "faiss.stats":
        handleFaissStats();
        break;

      // CUDA operations
      case "cuda.info":
        handleCudaInfo();
        break;
      case "cuda.cosine":
        handleCudaCosine(request);
        break;
      case "cuda.batchCosine":
        handleCudaBatchCosine(request);
        break;
      case "cuda.euclidean":
        handleCudaEuclidean(request);
        break;
      case "cuda.normalize":
        handleCudaNormalize(request);
        break;

      // Embeddings pipeline
      case "embeddings.addBatch":
        handleEmbeddingsAddBatch(request);
        break;
      case "embeddings.search":
        handleEmbeddingsSearch(request);
        break;
      case "embeddings.flush":
        handleEmbeddingsFlush();
        break;
      case "embeddings.stats":
        handleEmbeddingsStats();
        break;
      case "embeddings.remove":
        handleEmbeddingsRemove(request);
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
