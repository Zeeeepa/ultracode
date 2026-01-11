/**
 * TASK-002: Semantic Agent Type Definitions
 *
 * Type definitions for semantic search and vector operations
 * Supports 384-dimensional vectors with all-MiniLM-L6-v2 model
 *
 * Architecture References:
 * - Project Overview: doc/PROJECT_OVERVIEW.md
 * - Coding Standards: doc/CODING_STANDARD.md
 * - Architectural Decisions: doc/ARCHITECTURAL_DECISIONS.md
 *
 * @task_id TASK-002
 * @history
 *  - 2025-09-14: Created by Dev-Agent - TASK-002: Initial semantic types
 * implementation
 */

import { CACHE_CONSTANTS, VECTOR_CONSTANTS } from "../config/constants.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
export const VECTOR_DIMENSIONS = VECTOR_CONSTANTS.DEFAULT_VECTOR_DIMENSIONS; // all-MiniLM-L6-v2 dimensions
export const DEFAULT_SIMILARITY_THRESHOLD = VECTOR_CONSTANTS.DEFAULT_SIMILARITY_THRESHOLD;
export const MAX_BATCH_SIZE = VECTOR_CONSTANTS.MAX_BATCH_SIZE; // Optimal for 4-core CPU
export const MAX_CACHE_ENTRIES = CACHE_CONSTANTS.MAX_CACHE_ENTRIES;

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================

/**
 * Vector embedding representation
 */
export interface VectorEmbedding {
  id: string;
  content: string;
  vector: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

/**
 * Similarity search result
 */
export interface SimilarityResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

/**
 * Hybrid search result combining structural and semantic
 */
export interface HybridResult {
  id: string;
  score: number;
  source: "structural" | "semantic" | "hybrid";
  content?: string | undefined;
  metadata?: Record<string, unknown>;
}

/**
 * Semantic analysis result
 */
export interface SemanticAnalysis {
  entities: string[];
  concepts: string[];
  complexity: number;
  semanticType: "function" | "class" | "module" | "utility" | "test";
  summary: string;
}

/**
 * Similar code detection result
 */
export interface SimilarCode {
  id: string;
  path: string;
  content: string;
  similarity: number;
  type: "exact" | "near" | "semantic";
  /** Starting line number of the code fragment */
  startLine?: number;
  /** Ending line number of the code fragment */
  endLine?: number;
  /** Entity name if available */
  name?: string;
}

/**
 * Code clone group
 */
export interface CloneGroup {
  id: string;
  members: SimilarCode[];
  avgSimilarity: number;
  cloneType: "type1" | "type2" | "type3" | "type4"; // Exact, renamed, gapped, semantic
}

/**
 * Cross-language search result
 */
export interface CrossLangResult {
  id: string;
  language: string;
  path: string;
  content: string;
  similarity: number;
  /** Starting line number of the code fragment */
  startLine?: number;
  /** Ending line number of the code fragment */
  endLine?: number;
  /** Entity name if available */
  name?: string;
}

/**
 * Refactoring suggestion
 */
export interface RefactoringSuggestion {
  type: "extract" | "rename" | "move" | "combine" | "simplify";
  description: string;
  impact: "low" | "medium" | "high";
  confidence: number;
  code?: string;
}

/**
 * RRF fusion options
 */
export interface FusionOptions {
  k: number; // RRF constant (default 60)
  structuralWeight: number;
  semanticWeight: number;
  limit: number;
}

/**
 * Semantic operation results
 */
export interface SemanticResult {
  query: string;
  results: SimilarityResult[];
  processingTime: number;
}

// CacheEntry removed - use CacheEntry from storage.ts instead

/**
 * Vector backend type
 * libsql DiskANN is the only supported backend
 */
export type VectorBackend = "libsql";

/**
 * Vector store configuration
 */
export interface VectorStoreConfig {
  dbPath: string;
  dimensions: number;
  cacheSize?: number | undefined;
  walMode?: boolean;
  workingDirectory?: string | undefined;

  // Use layered FAISS index (base + delta + tombstones)
  useLayeredIndex?: boolean;

  // LibSQL DiskANN configuration
  libsql?: {
    metric?: "cosine" | "l2"; // Default: cosine
    compression?: "float8" | "float16" | "float32"; // Default: float32
    searchL?: number | undefined; // Neighbors visited during search (default: 200)
    insertL?: number | undefined; // Neighbors visited during insert (default: 70)
  };
}

/**
 * Embedding generator configuration
 */
export type EmbeddingProviderKind =
  | "ollama"
  | "openai"
  | "cloudru"
  | "huggingface"
  | "tei"
  | "ovms"
  | "vllm"
  | "llamacpp"
  | "auto";

/**
 * Serializable embedding configuration for subprocess workers.
 * Subset of EmbeddingConfig that can be passed via IPC.
 * Workers use this to initialize their own EmbeddingGenerator.
 */
export interface WorkerEmbeddingConfig {
  /** Whether embedding generation is enabled in workers */
  enabled: boolean;
  /** Provider kind: ollama, tei, ovms, openai, etc. */
  provider: EmbeddingProviderKind;
  /** Model name for the embedding provider */
  modelName: string;
  /** Maximum tokens for text truncation (legacy, use contextTokens) */
  maxTokens: number;
  /** Model's context window size in tokens (e.g., 512 for e5-small) */
  contextTokens: number;
  /** Batch size for embedding generation (tokens for llama-server) */
  batchSize: number;
  /** Queue batch size for centralized mode (texts per HTTP request, default 128) */
  queueBatchSize?: number;
  /** Vector dimensions (e.g., 384 for e5-small) */
  dimensions?: number;
  /** Worker index for endpoint assignment (0-based) */
  workerIndex?: number;
  /**
   * Centralized embedding mode: workers send texts to Main, Main generates embeddings.
   * Used by OVMS provider for better throughput via gRPC.
   * When true, workers don't initialize WorkerEmbeddingClient.
   */
  centralizedEmbeddings?: boolean;
  /** Provider-specific options (serializable) */
  providerOptions?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    // OVMS/TEI specific
    maxBatchSize?: number | undefined;
    useEmbeddingsApi?: boolean;
    encodingFormat?: "float" | "base64";
    protocol?: "rest" | "grpc";
    grpcPort?: number;
    /** Available endpoints for load balancing (e.g., ["embeddings-gpu", "embeddings-cpu"]) */
    endpoints?: string[];
    // llama.cpp specific
    contextSize?: number | undefined;
    nGpuLayers?: number | undefined;
  };
}

/**
 * Embedding generation statistics from subprocess pool.
 * Aggregated across all workers for summary logging.
 */
export interface EmbeddingPoolStats {
  /** Total embeddings generated */
  total: number;
  /** Duration from first embedding to last (ms) */
  durationMs: number;
  /** Throughput (embeddings per second) */
  speedPerSec: number;
  /** Number of workers that generated embeddings */
  workers: number;
  /** Total batch requests to embedding provider */
  batches: number;
  /** Embedding provider used */
  provider?: string;
}

export interface EmbeddingConfig {
  modelName: string;
  quantized: boolean;
  localPath?: string;
  batchSize: number;
  /** Queue batch size for centralized mode (texts per HTTP request, default 128) */
  queueBatchSize?: number;

  provider?: EmbeddingProviderKind; // default: 'memory'
  ollama?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    headers?: Record<string, string>;
    autoPull?: boolean;
    warmupText?: string;
    checkServer?: boolean;
    pullTimeoutMs?: number;
  };
  openai?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
  };
  cloudru?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
  };
  huggingface?: {
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    warmupText?: string;
  };
  tei?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    checkServer?: boolean;
  };
  ovms?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    checkServer?: boolean;
    miniBatchSize?: number; // Internal batch size for OVMS server (default: 8)
    // OVMS v3 embeddings API options
    useEmbeddingsApi?: boolean; // Use /v3/embeddings OpenAI-compatible API (default: true)
    encodingFormat?: "float" | "base64"; // Response format for embeddings API (default: base64)
    // Protocol options
    protocol?: "rest" | "grpc"; // "rest" (HTTP/JSON) or "grpc" (binary protobuf, ~30% faster)
    grpcPort?: number; // gRPC port (OVMS default: 9000)
    // Multi-device round-robin load balancing
    endpoints?: string[]; // ["embeddings-cpu", "embeddings-gpu"]
  };
  vllm?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
  };
  llamacpp?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
    contextSize?: number | undefined;
    nGpuLayers?: number | undefined;
    checkServer?: boolean;
    /** Auto-start llama-server if not running (default: true) */
    autoStart?: boolean;
  };
}

/**
 * Semantic operations interface
 */
export interface SemanticOperations {
  // Basic semantic search
  semanticSearch(query: string, limit?: number): Promise<SemanticResult>;

  // Code similarity
  findSimilarCode(code: string, threshold?: number): Promise<SimilarCode[]>;
  detectClones(minSimilarity?: number): Promise<CloneGroup[]>;

  // Semantic analysis
  analyzeCodeSemantics(code: string): Promise<SemanticAnalysis>;
  generateCodeEmbedding(code: string): Promise<Float32Array>;

  // Cross-language search
  crossLanguageSearch(query: string, languages: string[]): Promise<CrossLangResult[]>;

  // Refactoring suggestions
  suggestRefactoring(code: string): Promise<RefactoringSuggestion[]>;
}

/**
 * Semantic task types
 */
export enum SemanticTaskType {
  EMBED = "embed",
  SEARCH = "search",
  ANALYZE = "analyze",
  CLONE_DETECT = "clone_detect",
  REFACTOR = "refactor",
}

/**
 * Semantic agent metrics
 */
export interface SemanticMetrics {
  embeddingsGenerated: number;
  searchesPerformed: number;
  avgEmbeddingTime: number;
  avgSearchTime: number;
  cacheHitRate: number;
  vectorsStored: number;
}

/**
 * Embedding pool statistics for performance monitoring
 * Aggregated across all workers in a subprocess pool
 */
export interface EmbeddingPoolStats {
  /** Total number of embeddings generated */
  total: number;
  /** Duration from first batch to last batch completion (ms) */
  durationMs: number;
  /** Throughput: embeddings per second */
  speedPerSec: number;
  /** Number of workers that processed embeddings */
  workers: number;
  /** Total number of batch requests to embedding provider */
  batches: number;
}
