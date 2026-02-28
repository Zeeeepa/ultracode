/**
 * GPU Type Guards
 *
 * Type-safe guards for GPU Worker responses and requests.
 * Used for safe type checking instead of unsafe `(response as any).error`.
 *
 * @see src/semantic/gpu/types.ts - Type definitions
 */

import type {
  CudaBatchCosineRequest,
  CudaCosineRequest,
  CudaEuclideanRequest,
  // CUDA requests
  CudaInfoRequest,
  CudaNormalizeRequest,
  // Embeddings requests
  EmbeddingsAddBatchRequest,
  EmbeddingsFlushRequest,
  EmbeddingsRemoveRequest,
  EmbeddingsSearchRequest,
  EmbeddingsStatsRequest,
  FaissAddRequest,
  FaissBatchSearchRequest,
  // Faiss requests
  FaissInitRequest,
  FaissLoadRequest,
  FaissRemoveRequest,
  FaissSaveRequest,
  FaissSearchRequest,
  FaissStatsRequest,
  FaissTrainRequest,
  GpuErrorResponse,
  GpuSuccessResponse,
  GpuWorkerRequest,
  GpuWorkerResponse,
} from "./types.js";

// =============================================================================
// Response Type Guards
// =============================================================================

/**
 * Type guard for checking error response
 *
 * @param response - GPU worker response to check
 * @returns true if response contains an error
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: "faiss.search", ... });
 * if (isGpuErrorResponse(response)) {
 *   console.error("GPU error:", response.error); // Typed!
 *   return;
 * }
 * // TypeScript automatically knows that response.success === true
 * ```
 */
export function isGpuErrorResponse(response: GpuWorkerResponse): response is GpuErrorResponse {
  return response.success === false && "error" in response;
}

/**
 * Type guard for checking success response
 *
 * @param response - GPU worker response to check
 * @returns true if response is successful
 *
 * @example
 * ```typescript
 * if (isGpuSuccessResponse(response)) {
 *   // response.success is guaranteed to be true
 *   console.log("Success!");
 * }
 * ```
 */
export function isGpuSuccessResponse(response: GpuWorkerResponse): response is GpuSuccessResponse {
  return response.success === true;
}

/**
 * Safe error extraction from response
 *
 * Extracts error message from GPU response with type checking.
 * Used instead of unsafe `(response as any).error`.
 *
 * @param response - GPU worker response
 * @returns Error message or fallback text
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: "faiss.add", ... });
 * if (!response.success) {
 *   throw new Error(extractGpuError(response)); // Typed!
 * }
 * ```
 */
export function extractGpuError(response: GpuWorkerResponse): string {
  if (isGpuErrorResponse(response)) {
    return response.error;
  }
  return "Unknown GPU error";
}

// =============================================================================
// Faiss Request Type Guards
// =============================================================================

/**
 * Type guard for FaissInitRequest
 */
export function isFaissInitRequest(req: GpuWorkerRequest): req is FaissInitRequest {
  return req.type === "faiss.init";
}

/**
 * Type guard for FaissAddRequest
 *
 * @example
 * ```typescript
 * if (isFaissAddRequest(request)) {
 *   console.log("Adding", request.ids.length, "vectors"); // Typed!
 * }
 * ```
 */
export function isFaissAddRequest(req: GpuWorkerRequest): req is FaissAddRequest {
  return req.type === "faiss.add";
}

/**
 * Type guard for FaissSearchRequest
 *
 * @example
 * ```typescript
 * if (isFaissSearchRequest(request)) {
 *   console.log("Searching with k =", request.k); // Typed!
 * }
 * ```
 */
export function isFaissSearchRequest(req: GpuWorkerRequest): req is FaissSearchRequest {
  return req.type === "faiss.search";
}

/**
 * Type guard for FaissBatchSearchRequest
 */
export function isFaissBatchSearchRequest(req: GpuWorkerRequest): req is FaissBatchSearchRequest {
  return req.type === "faiss.batchSearch";
}

/**
 * Type guard for FaissRemoveRequest
 */
export function isFaissRemoveRequest(req: GpuWorkerRequest): req is FaissRemoveRequest {
  return req.type === "faiss.remove";
}

/**
 * Type guard for FaissSaveRequest
 */
export function isFaissSaveRequest(req: GpuWorkerRequest): req is FaissSaveRequest {
  return req.type === "faiss.save";
}

/**
 * Type guard for FaissLoadRequest
 */
export function isFaissLoadRequest(req: GpuWorkerRequest): req is FaissLoadRequest {
  return req.type === "faiss.load";
}

/**
 * Type guard for FaissTrainRequest
 */
export function isFaissTrainRequest(req: GpuWorkerRequest): req is FaissTrainRequest {
  return req.type === "faiss.train";
}

/**
 * Type guard for FaissStatsRequest
 */
export function isFaissStatsRequest(req: GpuWorkerRequest): req is FaissStatsRequest {
  return req.type === "faiss.stats";
}

// =============================================================================
// CUDA Request Type Guards
// =============================================================================

/**
 * Type guard for CudaInfoRequest
 */
export function isCudaInfoRequest(req: GpuWorkerRequest): req is CudaInfoRequest {
  return req.type === "cuda.info";
}

/**
 * Type guard for CudaCosineRequest
 *
 * @example
 * ```typescript
 * if (isCudaCosineRequest(request)) {
 *   console.log("Computing cosine between vectors"); // Typed!
 * }
 * ```
 */
export function isCudaCosineRequest(req: GpuWorkerRequest): req is CudaCosineRequest {
  return req.type === "cuda.cosine";
}

/**
 * Type guard for CudaBatchCosineRequest
 */
export function isCudaBatchCosineRequest(req: GpuWorkerRequest): req is CudaBatchCosineRequest {
  return req.type === "cuda.batchCosine";
}

/**
 * Type guard for CudaEuclideanRequest
 */
export function isCudaEuclideanRequest(req: GpuWorkerRequest): req is CudaEuclideanRequest {
  return req.type === "cuda.euclidean";
}

/**
 * Type guard for CudaNormalizeRequest
 */
export function isCudaNormalizeRequest(req: GpuWorkerRequest): req is CudaNormalizeRequest {
  return req.type === "cuda.normalize";
}

// =============================================================================
// Embeddings Request Type Guards
// =============================================================================

/**
 * Type guard for EmbeddingsAddBatchRequest
 */
export function isEmbeddingsAddBatchRequest(req: GpuWorkerRequest): req is EmbeddingsAddBatchRequest {
  return req.type === "embeddings.addBatch";
}

/**
 * Type guard for EmbeddingsSearchRequest
 */
export function isEmbeddingsSearchRequest(req: GpuWorkerRequest): req is EmbeddingsSearchRequest {
  return req.type === "embeddings.search";
}

/**
 * Type guard for EmbeddingsFlushRequest
 */
export function isEmbeddingsFlushRequest(req: GpuWorkerRequest): req is EmbeddingsFlushRequest {
  return req.type === "embeddings.flush";
}

/**
 * Type guard for EmbeddingsStatsRequest
 */
export function isEmbeddingsStatsRequest(req: GpuWorkerRequest): req is EmbeddingsStatsRequest {
  return req.type === "embeddings.stats";
}

/**
 * Type guard for EmbeddingsRemoveRequest
 */
export function isEmbeddingsRemoveRequest(req: GpuWorkerRequest): req is EmbeddingsRemoveRequest {
  return req.type === "embeddings.remove";
}
