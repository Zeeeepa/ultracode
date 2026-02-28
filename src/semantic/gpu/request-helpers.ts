/**
 * GPU Request Helpers
 *
 * Utilities for working with GPU Worker requests.
 * Vector extraction and data conversion for IPC transfer.
 *
 * Used in gpu-client.ts to prepare data before sending to worker.
 */

import {
  isCudaBatchCosineRequest,
  isCudaCosineRequest,
  isFaissAddRequest,
  isFaissBatchSearchRequest,
  isFaissSearchRequest,
  isFaissTrainRequest,
} from "./type-guards.js";
import type { GpuWorkerRequest } from "./types.js";

/**
 * Result of extracting vectors from request
 */
export interface ExtractedVectors {
  /**
   * Extracted vectors in Float32Array format
   * May be undefined for requests without vectors (e.g. stats, shutdown)
   */
  vectors?: Float32Array;

  /**
   * Request header data without vectors
   * Contains type, ids, k and other parameters
   */
  headerData: Record<string, unknown>;
}

/**
 * Typed vector extraction from GPU request
 *
 * Safely extracts vector data from various GPU request types,
 * converting them to Float32Array for transfer via stdin/stdout.
 * Remaining request data is stored in headerData.
 *
 * **Supported types:**
 * - `faiss.add` - extracts vectors
 * - `faiss.search` - extracts vector
 * - `faiss.batchSearch` - extracts vectors
 * - `faiss.train` - extracts vectors
 * - `cuda.cosine` - merges a and b into a single array
 * - `cuda.batchCosine` - merges query and database into a single array
 *
 * @param request - GPU Worker request to process
 * @returns Object with vectors (Float32Array) and headerData
 *
 * @example
 * ```typescript
 * const request: FaissSearchRequest = {
 *   type: "faiss.search",
 *   vector: [0.1, 0.2, 0.3],
 *   k: 10
 * };
 *
 * const { vectors, headerData } = extractVectorsFromRequest(request);
 * // vectors: Float32Array([0.1, 0.2, 0.3])
 * // headerData: { type: "faiss.search", k: 10 }
 * ```
 *
 * @example
 * ```typescript
 * // CUDA operation - merges 2 vectors
 * const request: CudaCosineRequest = {
 *   type: "cuda.cosine",
 *   a: [1, 2, 3],
 *   b: [4, 5, 6]
 * };
 *
 * const { vectors, headerData } = extractVectorsFromRequest(request);
 * // vectors: Float32Array([1, 2, 3, 4, 5, 6])
 * // headerData: { type: "cuda.cosine", dimensions: 3 }
 * ```
 */
export function extractVectorsFromRequest(request: GpuWorkerRequest): ExtractedVectors {
  // Faiss.add: extract vectors array
  if (isFaissAddRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.search: extract single vector
  if (isFaissSearchRequest(request)) {
    const { vector: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.batchSearch: extract vectors array
  if (isFaissBatchSearchRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // Faiss.train: extract vectors array
  if (isFaissTrainRequest(request)) {
    const { vectors: v, ...rest } = request;
    const vectors = v instanceof Float32Array ? v : new Float32Array(v);
    return { vectors, headerData: rest };
  }

  // CUDA cosine: merge a and b into a single array
  if (isCudaCosineRequest(request)) {
    const { a, b, ...rest } = request;
    const aArr = a instanceof Float32Array ? a : new Float32Array(a);
    const bArr = b instanceof Float32Array ? b : new Float32Array(b);

    // Create merged array: [a..., b...]
    const totalLen = aArr.length + bArr.length;
    const vectors = new Float32Array(totalLen);
    vectors.set(aArr, 0);
    vectors.set(bArr, aArr.length);

    // Add dimensions for the worker
    const headerData = {
      ...rest,
      dimensions: aArr.length,
    };

    return { vectors, headerData };
  }

  // CUDA batchCosine: merge query and database arrays
  if (isCudaBatchCosineRequest(request)) {
    const { query, database, ...rest } = request;
    const queryArr = query instanceof Float32Array ? query : new Float32Array(query);

    // Convert database arrays to Float32Array
    const dbArrs = database.map((d) => (d instanceof Float32Array ? d : new Float32Array(d)));

    // Calculate total length: query + sum(database lengths)
    const totalLen = queryArr.length + dbArrs.reduce((sum, arr) => sum + arr.length, 0);

    // Create merged array: [query..., db1..., db2..., ...]
    const vectors = new Float32Array(totalLen);
    vectors.set(queryArr, 0);

    let offset = queryArr.length;
    for (const arr of dbArrs) {
      vectors.set(arr, offset);
      offset += arr.length;
    }

    // Add metadata for the worker
    const headerData = {
      ...rest,
      dimensions: queryArr.length,
      queryCount: 1,
      databaseCount: dbArrs.length,
    };

    return { vectors, headerData };
  }

  // For remaining types (stats, shutdown, etc.) - only headerData
  const headerData: Record<string, unknown> = { ...request };
  return { headerData };
}
