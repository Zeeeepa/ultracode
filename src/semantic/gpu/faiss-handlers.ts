/**
 * Faiss Request Handlers
 *
 * Handles all Faiss index operations:
 * - Index creation and initialization
 * - Vector addition and training
 * - Search (single and batch)
 * - Save/load persistence
 * - Vector dump loading from workers
 *
 * Extracted from gpu-worker.ts for better modularity.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

import type { FaissIndex } from "faiss-napi";

import type {
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
  GpuWorkerResponse,
  GpuWorkerState,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Faiss module interface (from faiss-napi)
 */
export interface FaissNapiModule {
  Index: {
    fromFactory(dimensions: number, factoryString: string, metricType?: string): FaissIndex;
    fromBuffer(buffer: Buffer): FaissIndex;
    read(path: string): FaissIndex;
  };
}

export interface FaissHandlerContext {
  faiss: FaissNapiModule | null;
  faissIndex: FaissIndex | null;
  state: GpuWorkerState;
  log: (message: string) => void;
  logError: (message: string) => void;
  sendResponse: (response: GpuWorkerResponse) => void;
  sendError: (error: string, requestId?: string) => void;
  setFaissIndex: (index: FaissIndex | null) => void;
  setContentCachePath: (path: string) => void;
  loadContentCache: () => void;
  saveContentCache: () => void;
}

// =============================================================================
// Faiss Index Creation
// =============================================================================

export function createFaissIndex(config: FaissIndexConfig, ctx: FaissHandlerContext): boolean {
  const { faiss, state, log, logError } = ctx;

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

    const newIndex = faiss.Index.fromFactory(dimensions, factoryString, metricType);
    ctx.setFaissIndex(newIndex);
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

export async function handleFaissInit(
  request: { config: FaissIndexConfig; loadPath?: string },
  ctx: FaissHandlerContext,
): Promise<void> {
  const { faiss, state, log, sendResponse, sendError, setFaissIndex, setContentCachePath, loadContentCache } = ctx;
  const { config, loadPath } = request;

  if (loadPath && existsSync(loadPath)) {
    try {
      const loadedIndex = faiss!.Index.read(loadPath);
      setFaissIndex(loadedIndex);
      state.faissInitialized = true;
      state.faissIndexType = config.indexType;
      state.faissDimensions = config.dimensions;
      state.faissTotalVectors = loadedIndex.ntotal;
      state.faissIsTrained = (loadedIndex as { isTrained?: boolean }).isTrained ?? true;

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

      log(`Loaded index from ${loadPath} with ${loadedIndex.ntotal} vectors`);

      const response: FaissInitResponse = {
        success: true,
        type: "faiss.init",
        indexType: config.indexType,
        dimensions: config.dimensions,
        loadedVectors: loadedIndex.ntotal,
      };
      sendResponse(response);
      return;
    } catch (error) {
      log(`Failed to load index from ${loadPath}: ${(error as Error).message}, creating new`);
    }
  }

  if (!createFaissIndex(config, ctx)) {
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

export function handleFaissAdd(request: { ids: string[]; vectors: number[] }, ctx: FaissHandlerContext): void {
  const { faissIndex, state, log, sendResponse, sendError } = ctx;

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
    const vectorArray = (Array.isArray(vectors) ? vectors : Array.from(vectors)) as number[];
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

export function handleFaissSearch(request: { vector: number[]; k: number }, ctx: FaissHandlerContext): void {
  const { faissIndex, state, log, sendResponse, sendError } = ctx;

  if (!faissIndex || !state.faissInitialized) {
    sendError("Index not initialized");
    return;
  }

  const { vector, k } = request;
  const startTime = performance.now();

  // Debug: log request structure
  log(
    `[search] request keys: ${Object.keys(request).join(", ")}, vector type: ${typeof vector}, isArray: ${Array.isArray(vector)}, vectorLen: ${vector?.length ?? "N/A"}`,
  );

  if (!vector || !Array.isArray(vector)) {
    sendError(`Invalid or missing vector in search request. Keys: ${Object.keys(request).join(", ")}`);
    return;
  }

  if (vector.length !== state.faissDimensions) {
    sendError(`Vector dimension mismatch: expected ${state.faissDimensions}, got ${vector.length}`);
    return;
  }

  try {
    // faiss-napi expects number[], not Float32Array
    const queryArray = (Array.isArray(vector) ? vector : Array.from(vector)) as number[];

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

export function handleFaissBatchSearch(
  request: { vectors: number[]; nQueries: number; k: number },
  ctx: FaissHandlerContext,
): void {
  const { faissIndex, state, sendResponse, sendError } = ctx;

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
    const queryArray = (Array.isArray(vectors) ? vectors : Array.from(vectors)) as number[];
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

export function handleFaissRemove(request: { ids: string[] }, ctx: FaissHandlerContext): void {
  const { state, log, sendResponse } = ctx;
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

export function handleFaissSave(request: { path: string }, ctx: FaissHandlerContext): void {
  const { faissIndex, state, log, sendResponse, sendError, setContentCachePath, saveContentCache } = ctx;

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

export function handleFaissLoad(request: { path: string }, ctx: FaissHandlerContext): void {
  const { faiss, state, log, sendResponse, sendError, setFaissIndex, setContentCachePath, loadContentCache } = ctx;

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
    const loadedIndex = faiss.Index.read(path);
    setFaissIndex(loadedIndex);

    const idMapPath = `${path}.idmap.json`;
    if (existsSync(idMapPath)) {
      const idMapData = JSON.parse(readFileSync(idMapPath, "utf-8"));
      state.faissIdMap = new Map(Object.entries(idMapData.idMap).map(([k, v]) => [k, v as number]));
      state.faissReverseIdMap = new Map(Array.from(state.faissIdMap.entries()).map(([k, v]) => [v, k]));
      state.faissTotalVectors = idMapData.totalVectors;
    } else {
      state.faissTotalVectors = loadedIndex.ntotal;
    }

    state.faissInitialized = true;
    state.faissIsTrained = (loadedIndex as { isTrained?: boolean }).isTrained ?? true;

    // Load content cache
    setContentCachePath(path);
    loadContentCache();

    log(`Loaded index from ${path} with ${loadedIndex.ntotal} vectors`);

    const response: FaissLoadResponse = {
      success: true,
      type: "faiss.load",
      path,
      loadedVectors: loadedIndex.ntotal,
    };
    sendResponse(response);
  } catch (error) {
    sendError(`Failed to load index: ${(error as Error).message}`);
  }
}

export function handleFaissTrain(request: { vectors: number[]; nVectors: number }, ctx: FaissHandlerContext): void {
  const { faissIndex, state, log, sendResponse, sendError } = ctx;

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
    const trainingArray = (Array.isArray(vectors) ? vectors : Array.from(vectors)) as number[];
    if (!faissIndex.train) {
      sendError("Index does not support training");
      return;
    }
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

export function handleFaissStats(ctx: FaissHandlerContext): void {
  const { state, sendResponse } = ctx;

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
