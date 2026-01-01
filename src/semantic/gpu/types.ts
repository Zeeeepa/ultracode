/**
 * GPU Worker IPC Protocol Types
 *
 * Unified protocol for both Faiss (vector indexing) and CUDA (similarity ops).
 * Communication happens via stdin/stdout JSON messages.
 */

// =============================================================================
// Faiss Index Configuration (from faiss/types.ts)
// =============================================================================

export type FaissIndexType = "flat" | "hnsw" | "ivf" | "ivfpq";

export interface FaissIndexConfig {
  dimensions: number;
  indexType: FaissIndexType;
  metric: "l2" | "ip" | "cosine";
  hnswM?: number;
  hnswEfConstruction?: number;
  hnswEfSearch?: number;
  ivfNlist?: number;
  ivfNprobe?: number;
  pqM?: number;
  pqNbits?: number;
  numThreads?: number;
}

// =============================================================================
// CUDA Device Info
// =============================================================================

export interface CudaDeviceInfo {
  deviceCount: number;
  deviceName?: string;
  computeCapability?: string;
  totalMemoryMB?: number;
  multiProcessorCount?: number;
}

// =============================================================================
// Faiss Requests
// =============================================================================

export interface FaissInitRequest {
  type: "faiss.init";
  config: FaissIndexConfig;
  loadPath?: string | undefined;
}

export interface FaissAddRequest {
  type: "faiss.add";
  ids: string[];
  vectors: number[];
}

export interface FaissSearchRequest {
  type: "faiss.search";
  vector: number[];
  k: number;
  filterIds?: string[];
}

export interface FaissBatchSearchRequest {
  type: "faiss.batchSearch";
  vectors: number[];
  nQueries: number;
  k: number;
}

export interface FaissRemoveRequest {
  type: "faiss.remove";
  ids: string[];
}

export interface FaissSaveRequest {
  type: "faiss.save";
  path: string;
}

export interface FaissLoadRequest {
  type: "faiss.load";
  path: string;
}

export interface FaissTrainRequest {
  type: "faiss.train";
  vectors: number[];
  nVectors: number;
}

export interface FaissStatsRequest {
  type: "faiss.stats";
}

export interface FaissLoadFromDumpRequest {
  type: "faiss.loadFromDump";
  dumpDir: string;
  dimensions: number;
}

export interface FaissLoadWorkerDumpRequest {
  type: "faiss.loadWorkerDump";
  workerId: string;
  dimensions: number;
}

// =============================================================================
// CUDA Requests
// =============================================================================

export interface CudaInfoRequest {
  type: "cuda.info";
}

export interface CudaCosineRequest {
  type: "cuda.cosine";
  a: number[];
  b: number[];
}

export interface CudaBatchCosineRequest {
  type: "cuda.batchCosine";
  query: number[];
  database: number[][];
}

export interface CudaEuclideanRequest {
  type: "cuda.euclidean";
  a: number[];
  b: number[];
}

export interface CudaNormalizeRequest {
  type: "cuda.normalize";
  vectors: number[][];
}

// =============================================================================
// Embeddings Pipeline Requests (unified vector + content storage)
// =============================================================================

export interface EmbeddingItem {
  id: string;
  vector: number[];
  content?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingsAddBatchRequest {
  type: "embeddings.addBatch";
  items: EmbeddingItem[];
}

export interface EmbeddingsSearchRequest {
  type: "embeddings.search";
  vector: number[];
  k: number;
  includeContent?: boolean;
}

export interface EmbeddingsFlushRequest {
  type: "embeddings.flush";
}

export interface EmbeddingsStatsRequest {
  type: "embeddings.stats";
}

export interface EmbeddingsRemoveRequest {
  type: "embeddings.remove";
  ids: string[];
}

// =============================================================================
// Worker Lifecycle Requests
// =============================================================================

export interface GpuStatsRequest {
  type: "stats";
}

export interface GpuShutdownRequest {
  type: "shutdown";
}

// =============================================================================
// Combined Request Type
// =============================================================================

export type GpuWorkerRequest =
  // Faiss operations
  | FaissInitRequest
  | FaissAddRequest
  | FaissSearchRequest
  | FaissBatchSearchRequest
  | FaissRemoveRequest
  | FaissSaveRequest
  | FaissLoadRequest
  | FaissTrainRequest
  | FaissStatsRequest
  | FaissLoadFromDumpRequest
  | FaissLoadWorkerDumpRequest
  // CUDA operations
  | CudaInfoRequest
  | CudaCosineRequest
  | CudaBatchCosineRequest
  | CudaEuclideanRequest
  | CudaNormalizeRequest
  // Embeddings pipeline
  | EmbeddingsAddBatchRequest
  | EmbeddingsSearchRequest
  | EmbeddingsFlushRequest
  | EmbeddingsStatsRequest
  | EmbeddingsRemoveRequest
  // Worker lifecycle
  | GpuStatsRequest
  | GpuShutdownRequest;

// =============================================================================
// Response Types
// =============================================================================

export interface GpuSuccessResponse {
  success: true;
  requestId?: string | undefined;
}

export interface GpuErrorResponse {
  success: false;
  error: string;
  requestId?: string | undefined;
}

// Faiss Responses

export interface FaissSearchResult {
  id: string;
  distance: number;
  score: number;
}

export interface FaissInitResponse extends GpuSuccessResponse {
  type: "faiss.init";
  indexType: FaissIndexType;
  dimensions: number;
  loadedVectors?: number;
}

export interface FaissAddResponse extends GpuSuccessResponse {
  type: "faiss.add";
  addedCount: number;
  totalVectors: number;
  addTimeMs: number;
}

export interface FaissSearchResponse extends GpuSuccessResponse {
  type: "faiss.search";
  results: FaissSearchResult[];
  searchTimeMs: number;
}

export interface FaissBatchSearchResponse extends GpuSuccessResponse {
  type: "faiss.batchSearch";
  results: FaissSearchResult[][];
  searchTimeMs: number;
}

export interface FaissRemoveResponse extends GpuSuccessResponse {
  type: "faiss.remove";
  removedCount: number;
  totalVectors: number;
}

export interface FaissSaveResponse extends GpuSuccessResponse {
  type: "faiss.save";
  path: string;
  sizeBytes: number;
}

export interface FaissLoadResponse extends GpuSuccessResponse {
  type: "faiss.load";
  path: string;
  loadedVectors: number;
}

export interface FaissTrainResponse extends GpuSuccessResponse {
  type: "faiss.train";
  trainedOn: number;
  trainTimeMs: number;
}

export interface FaissStatsResponse extends GpuSuccessResponse {
  type: "faiss.stats";
  stats: {
    indexType: FaissIndexType;
    dimensions: number;
    totalVectors: number;
    memoryUsageMB: number;
    isTrained: boolean;
    hnswM?: number;
    hnswEfConstruction?: number;
    ivfNlist?: number;
    ivfNprobe?: number;
  };
}

export interface FaissLoadFromDumpResponse extends GpuSuccessResponse {
  type: "faiss.loadFromDump";
  loaded: number;
  skipped: number;
  files: number;
  totalVectors?: number;
  loadTimeMs?: number;
  message?: string | undefined;
}

export interface FaissLoadWorkerDumpResponse extends GpuSuccessResponse {
  type: "faiss.loadWorkerDump";
  workerId: string;
  loaded: number;
  skipped: number;
  files: number;
  totalVectors?: number;
  loadTimeMs?: number;
  message?: string | undefined;
}

// CUDA Responses

export interface CudaInfoResponse extends GpuSuccessResponse {
  type: "cuda.info";
  available: boolean;
  deviceInfo: CudaDeviceInfo;
}

export interface CudaCosineResponse extends GpuSuccessResponse {
  type: "cuda.cosine";
  similarity: number;
  timeMs: number;
}

export interface CudaBatchCosineResponse extends GpuSuccessResponse {
  type: "cuda.batchCosine";
  similarities: number[];
  timeMs: number;
}

export interface CudaEuclideanResponse extends GpuSuccessResponse {
  type: "cuda.euclidean";
  distance: number;
  timeMs: number;
}

export interface CudaNormalizeResponse extends GpuSuccessResponse {
  type: "cuda.normalize";
  vectors: number[][];
  timeMs: number;
}

// Embeddings Pipeline Responses

export interface EmbeddingsSearchResultItem {
  id: string;
  score: number;
  content?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingsAddBatchResponse extends GpuSuccessResponse {
  type: "embeddings.addBatch";
  addedCount: number;
  totalVectors: number;
  addTimeMs: number;
}

export interface EmbeddingsSearchResponse extends GpuSuccessResponse {
  type: "embeddings.search";
  results: EmbeddingsSearchResultItem[];
  searchTimeMs: number;
}

export interface EmbeddingsFlushResponse extends GpuSuccessResponse {
  type: "embeddings.flush";
  flushedCount: number;
  flushTimeMs: number;
}

export interface EmbeddingsStatsResponse extends GpuSuccessResponse {
  type: "embeddings.stats";
  stats: {
    totalVectors: number;
    totalWithContent: number;
    dimensions: number;
    indexType: FaissIndexType | null;
    cacheMemoryMB: number;
  };
}

export interface EmbeddingsRemoveResponse extends GpuSuccessResponse {
  type: "embeddings.remove";
  removedCount: number;
  totalVectors: number;
}

// Worker Stats Response

export interface GpuStatsResponse extends GpuSuccessResponse {
  type: "stats";
  faiss: {
    initialized: boolean;
    indexType: FaissIndexType | null;
    dimensions: number;
    totalVectors: number;
    memoryUsageMB: number;
  };
  cuda: {
    available: boolean;
    deviceInfo: CudaDeviceInfo | null;
  };
  uptime: number;
}

// =============================================================================
// Combined Response Type
// =============================================================================

export type GpuWorkerResponse =
  | GpuErrorResponse
  // Faiss responses
  | FaissInitResponse
  | FaissAddResponse
  | FaissSearchResponse
  | FaissBatchSearchResponse
  | FaissRemoveResponse
  | FaissSaveResponse
  | FaissLoadResponse
  | FaissTrainResponse
  | FaissStatsResponse
  | FaissLoadFromDumpResponse
  | FaissLoadWorkerDumpResponse
  // CUDA responses
  | CudaInfoResponse
  | CudaCosineResponse
  | CudaBatchCosineResponse
  | CudaEuclideanResponse
  | CudaNormalizeResponse
  // Embeddings pipeline responses
  | EmbeddingsAddBatchResponse
  | EmbeddingsSearchResponse
  | EmbeddingsFlushResponse
  | EmbeddingsStatsResponse
  | EmbeddingsRemoveResponse
  // Worker responses
  | GpuStatsResponse
  | GpuSuccessResponse;

// =============================================================================
// Worker State
// =============================================================================

export interface ContentCacheEntry {
  content?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface GpuWorkerState {
  // Faiss state
  faissInitialized: boolean;
  faissIndexType: FaissIndexType | null;
  faissDimensions: number;
  faissTotalVectors: number;
  faissIsTrained: boolean;
  faissIdMap: Map<string, number>;
  faissReverseIdMap: Map<number, string>;
  // Content cache (id → content/metadata)
  contentCache: Map<string, ContentCacheEntry>;
  contentCacheDirty: boolean;
  // CUDA state
  cudaAvailable: boolean;
  cudaDeviceInfo: CudaDeviceInfo | null;
  // Worker state
  startTime: number;
}
