/**
 * Embeddings Pipeline Handlers
 *
 * High-level embeddings operations that combine Faiss with content caching:
 * - Add batch (vectors + content/metadata)
 * - Search (with content retrieval)
 * - Flush (persist to disk)
 * - Stats and remove
 *
 * Extracted from gpu-worker.ts for better modularity.
 */

import { writeFileSync } from "node:fs";

import type {
  ContentCacheEntry,
  EmbeddingsAddBatchRequest,
  EmbeddingsAddBatchResponse,
  EmbeddingsFlushResponse,
  EmbeddingsRemoveResponse,
  EmbeddingsSearchRequest,
  EmbeddingsSearchResponse,
  EmbeddingsStatsResponse,
  GpuWorkerState,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

export interface EmbeddingsHandlerContext {
  faissIndex: any;
  state: GpuWorkerState;
  contentCachePath: string | null;
  log: (message: string) => void;
  logError: (message: string) => void;
  sendResponse: (response: any) => void;
  sendError: (error: string, requestId?: string) => void;
  saveContentCache: () => void;
}

// =============================================================================
// Embeddings Pipeline Handlers
// =============================================================================

export function handleEmbeddingsAddBatch(request: EmbeddingsAddBatchRequest, ctx: EmbeddingsHandlerContext): void {
  const { faissIndex, state, log, sendResponse, sendError } = ctx;

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

export function handleEmbeddingsSearch(request: EmbeddingsSearchRequest, ctx: EmbeddingsHandlerContext): void {
  const { faissIndex, state, sendResponse, sendError } = ctx;

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

export function handleEmbeddingsFlush(ctx: EmbeddingsHandlerContext): void {
  const { faissIndex, state, contentCachePath, log, logError, sendResponse, saveContentCache } = ctx;
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

export function handleEmbeddingsStats(ctx: EmbeddingsHandlerContext): void {
  const { state, sendResponse } = ctx;

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

export function handleEmbeddingsRemove(request: { ids: string[] }, ctx: EmbeddingsHandlerContext): void {
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
// Content Cache Helpers
// =============================================================================

export function saveContentCacheToFile(
  contentCachePath: string | null,
  contentCache: Map<string, ContentCacheEntry>,
  log: (msg: string) => void,
  logError: (msg: string) => void,
): boolean {
  if (!contentCachePath || contentCache.size === 0) return false;

  try {
    const data: Record<string, ContentCacheEntry> = {};
    for (const [id, entry] of contentCache) {
      data[id] = entry;
    }
    writeFileSync(contentCachePath, JSON.stringify(data));
    log(`Saved content cache: ${contentCache.size} entries`);
    return true;
  } catch (error) {
    logError(`Failed to save content cache: ${(error as Error).message}`);
    return false;
  }
}
