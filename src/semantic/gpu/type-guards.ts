/**
 * GPU Type Guards
 *
 * Type-safe guards для GPU Worker responses и requests.
 * Используется для безопасной проверки типов вместо небезопасных `(response as any).error`.
 *
 * @see src/semantic/gpu/types.ts - Определения типов
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
 * Type guard для проверки error response
 *
 * @param response - GPU worker response для проверки
 * @returns true если response содержит ошибку
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: "faiss.search", ... });
 * if (isGpuErrorResponse(response)) {
 *   console.error("GPU error:", response.error); // Типизировано!
 *   return;
 * }
 * // TypeScript автоматически понимает что response.success === true
 * ```
 */
export function isGpuErrorResponse(response: GpuWorkerResponse): response is GpuErrorResponse {
  return response.success === false && "error" in response;
}

/**
 * Type guard для проверки success response
 *
 * @param response - GPU worker response для проверки
 * @returns true если response успешный
 *
 * @example
 * ```typescript
 * if (isGpuSuccessResponse(response)) {
 *   // response.success гарантированно true
 *   console.log("Success!");
 * }
 * ```
 */
export function isGpuSuccessResponse(response: GpuWorkerResponse): response is GpuSuccessResponse {
  return response.success === true;
}

/**
 * Безопасное извлечение ошибки из response
 *
 * Извлекает сообщение об ошибке из GPU response с проверкой типа.
 * Используется вместо небезопасного `(response as any).error`.
 *
 * @param response - GPU worker response
 * @returns Сообщение об ошибке или fallback текст
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: "faiss.add", ... });
 * if (!response.success) {
 *   throw new Error(extractGpuError(response)); // Типизировано!
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
 * Type guard для FaissInitRequest
 */
export function isFaissInitRequest(req: GpuWorkerRequest): req is FaissInitRequest {
  return req.type === "faiss.init";
}

/**
 * Type guard для FaissAddRequest
 *
 * @example
 * ```typescript
 * if (isFaissAddRequest(request)) {
 *   console.log("Adding", request.ids.length, "vectors"); // Типизировано!
 * }
 * ```
 */
export function isFaissAddRequest(req: GpuWorkerRequest): req is FaissAddRequest {
  return req.type === "faiss.add";
}

/**
 * Type guard для FaissSearchRequest
 *
 * @example
 * ```typescript
 * if (isFaissSearchRequest(request)) {
 *   console.log("Searching with k =", request.k); // Типизировано!
 * }
 * ```
 */
export function isFaissSearchRequest(req: GpuWorkerRequest): req is FaissSearchRequest {
  return req.type === "faiss.search";
}

/**
 * Type guard для FaissBatchSearchRequest
 */
export function isFaissBatchSearchRequest(req: GpuWorkerRequest): req is FaissBatchSearchRequest {
  return req.type === "faiss.batchSearch";
}

/**
 * Type guard для FaissRemoveRequest
 */
export function isFaissRemoveRequest(req: GpuWorkerRequest): req is FaissRemoveRequest {
  return req.type === "faiss.remove";
}

/**
 * Type guard для FaissSaveRequest
 */
export function isFaissSaveRequest(req: GpuWorkerRequest): req is FaissSaveRequest {
  return req.type === "faiss.save";
}

/**
 * Type guard для FaissLoadRequest
 */
export function isFaissLoadRequest(req: GpuWorkerRequest): req is FaissLoadRequest {
  return req.type === "faiss.load";
}

/**
 * Type guard для FaissTrainRequest
 */
export function isFaissTrainRequest(req: GpuWorkerRequest): req is FaissTrainRequest {
  return req.type === "faiss.train";
}

/**
 * Type guard для FaissStatsRequest
 */
export function isFaissStatsRequest(req: GpuWorkerRequest): req is FaissStatsRequest {
  return req.type === "faiss.stats";
}

// =============================================================================
// CUDA Request Type Guards
// =============================================================================

/**
 * Type guard для CudaInfoRequest
 */
export function isCudaInfoRequest(req: GpuWorkerRequest): req is CudaInfoRequest {
  return req.type === "cuda.info";
}

/**
 * Type guard для CudaCosineRequest
 *
 * @example
 * ```typescript
 * if (isCudaCosineRequest(request)) {
 *   console.log("Computing cosine between vectors"); // Типизировано!
 * }
 * ```
 */
export function isCudaCosineRequest(req: GpuWorkerRequest): req is CudaCosineRequest {
  return req.type === "cuda.cosine";
}

/**
 * Type guard для CudaBatchCosineRequest
 */
export function isCudaBatchCosineRequest(req: GpuWorkerRequest): req is CudaBatchCosineRequest {
  return req.type === "cuda.batchCosine";
}

/**
 * Type guard для CudaEuclideanRequest
 */
export function isCudaEuclideanRequest(req: GpuWorkerRequest): req is CudaEuclideanRequest {
  return req.type === "cuda.euclidean";
}

/**
 * Type guard для CudaNormalizeRequest
 */
export function isCudaNormalizeRequest(req: GpuWorkerRequest): req is CudaNormalizeRequest {
  return req.type === "cuda.normalize";
}

// =============================================================================
// Embeddings Request Type Guards
// =============================================================================

/**
 * Type guard для EmbeddingsAddBatchRequest
 */
export function isEmbeddingsAddBatchRequest(req: GpuWorkerRequest): req is EmbeddingsAddBatchRequest {
  return req.type === "embeddings.addBatch";
}

/**
 * Type guard для EmbeddingsSearchRequest
 */
export function isEmbeddingsSearchRequest(req: GpuWorkerRequest): req is EmbeddingsSearchRequest {
  return req.type === "embeddings.search";
}

/**
 * Type guard для EmbeddingsFlushRequest
 */
export function isEmbeddingsFlushRequest(req: GpuWorkerRequest): req is EmbeddingsFlushRequest {
  return req.type === "embeddings.flush";
}

/**
 * Type guard для EmbeddingsStatsRequest
 */
export function isEmbeddingsStatsRequest(req: GpuWorkerRequest): req is EmbeddingsStatsRequest {
  return req.type === "embeddings.stats";
}

/**
 * Type guard для EmbeddingsRemoveRequest
 */
export function isEmbeddingsRemoveRequest(req: GpuWorkerRequest): req is EmbeddingsRemoveRequest {
  return req.type === "embeddings.remove";
}
