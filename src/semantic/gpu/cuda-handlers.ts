/**
 * CUDA Request Handlers
 *
 * Handles all CUDA GPU operations:
 * - Device info queries
 * - Cosine similarity (single and batch)
 * - Euclidean distance
 * - Vector normalization
 *
 * Extracted from gpu-worker.ts for better modularity.
 */

import type {
  CudaBatchCosineResponse,
  CudaCosineResponse,
  CudaEuclideanResponse,
  CudaInfoResponse,
  CudaNormalizeResponse,
  GpuWorkerResponse,
  GpuWorkerState,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

export interface CUDAAddon {
  cosineSimilarity(vecA: number[], vecB: number[]): number;
  batchCosineSimilarity(vecsA: number[][], vecsB: number[][]): number[];
  euclideanDistance(vecA: number[], vecB: number[]): number;
  normalizeVectors(vectors: number[][]): number[][];
  getDeviceInfo(): {
    deviceCount: number;
    deviceName?: string;
    computeCapability?: string;
    totalMemoryMB?: number;
  };
}

export interface CudaHandlerContext {
  cudaAddon: CUDAAddon | null;
  state: GpuWorkerState;
  sendResponse: (response: GpuWorkerResponse) => void;
  sendError: (error: string, requestId?: string) => void;
}

// =============================================================================
// CUDA Request Handlers
// =============================================================================

export function handleCudaInfo(ctx: CudaHandlerContext): void {
  const { state, sendResponse } = ctx;

  const response: CudaInfoResponse = {
    success: true,
    type: "cuda.info",
    available: state.cudaAvailable,
    deviceInfo: state.cudaDeviceInfo ?? { deviceCount: 0 },
  };
  sendResponse(response);
}

export function handleCudaCosine(request: { a: number[]; b: number[] }, ctx: CudaHandlerContext): void {
  const { cudaAddon, state, sendResponse, sendError } = ctx;

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

export function handleCudaBatchCosine(
  request: { query: number[]; database: number[][] },
  ctx: CudaHandlerContext,
): void {
  const { cudaAddon, state, sendResponse, sendError } = ctx;

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

export function handleCudaEuclidean(request: { a: number[]; b: number[] }, ctx: CudaHandlerContext): void {
  const { cudaAddon, state, sendResponse, sendError } = ctx;

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

export function handleCudaNormalize(request: { vectors: number[][] }, ctx: CudaHandlerContext): void {
  const { cudaAddon, state, sendResponse, sendError } = ctx;

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
