export type ProviderKind =
  | "ollama"
  | "openai"
  | "cloudru"
  | "huggingface"
  | "tei"
  | "ovms" // Legacy alias for ovms-native
  | "ovms-native" // OVMS native binary (no Docker)
  | "vllm" // vLLM Docker container (NVIDIA GPU)
  | "auto";

export interface ProviderInfo {
  name: ProviderKind | string;
  model: string;
  dimension?: number;
  supportsBatch: boolean;
  maxBatchSize?: number | undefined;
  /** Maximum context tokens (512, 8192, etc.) */
  maxTokens?: number | undefined;
}

export interface EmbedOptions {
  signal?: AbortSignal | undefined;
  requestId?: string | undefined;
}

// ═══════════════════════════════════════════════════════════════
// Rerank Types - for two-stage retrieval
// ═══════════════════════════════════════════════════════════════

export interface RerankDocument {
  /** Document text to rerank */
  text: string;
  /** Optional document ID for tracking */
  id?: string | undefined;
}

export interface RerankResult {
  /** Original document index */
  index: number;
  /** Document ID if provided */
  id?: string | undefined;
  /** Relevance score (0-1, higher = more relevant) */
  score: number;
  /** Original text */
  text: string;
}

export interface RerankOptions extends EmbedOptions {
  /** Return top K results (default: all) */
  topK?: number;
  /** Return documents with score above threshold */
  threshold?: number | undefined;
}

// ═══════════════════════════════════════════════════════════════
// Score Types - for pairwise similarity
// ═══════════════════════════════════════════════════════════════

export interface ScoreResult {
  /** Similarity score between query and document */
  score: number;
}

export interface ScoreOptions extends EmbedOptions {}

// ═══════════════════════════════════════════════════════════════
// Provider Capabilities
// ═══════════════════════════════════════════════════════════════

export interface ProviderCapabilities {
  embeddings: boolean;
  rerank: boolean;
  score: boolean;
  classify: boolean;
}

export interface ProviderLogger {
  debug(msg: string, data?: any, requestId?: string): void;
  info(msg: string, data?: any, requestId?: string): void;
  warn(msg: string, data?: any, requestId?: string): void;
  error(msg: string, data?: any, requestId?: string | undefined, err?: Error): void;
}

export interface EmbeddingProvider {
  info: ProviderInfo;
  initialize(): Promise<void>;
  getDimension(): number | undefined;
  embed(text: string, opts?: EmbedOptions): Promise<Float32Array>;
  embedBatch?(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]>;
  close?(): Promise<void>;

  // ═══════════════════════════════════════════════════════════════
  // Extended Capabilities (optional)
  // ═══════════════════════════════════════════════════════════════

  /** Get provider capabilities */
  getCapabilities?(): ProviderCapabilities;

  /**
   * Rerank documents by relevance to query (two-stage retrieval)
   * Use after initial embedding search to improve precision
   */
  rerank?(query: string, documents: RerankDocument[], opts?: RerankOptions): Promise<RerankResult[]>;

  /**
   * Calculate similarity score between query and single document
   * More accurate than cosine similarity of embeddings
   */
  score?(query: string, document: string, opts?: ScoreOptions): Promise<ScoreResult>;

  /**
   * Batch score: calculate similarity for query vs multiple documents
   */
  scoreBatch?(query: string, documents: string[], opts?: ScoreOptions): Promise<ScoreResult[]>;
}
