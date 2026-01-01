/**
 * Worker Embedding Config Builder
 *
 * Builds WorkerEmbeddingConfig from YAML config for subprocess workers.
 * Used by DevAgent to configure embedding generation in parser workers.
 */

import { initVectorDumpDir } from "../semantic/vector-dump.js";
import type { EmbeddingProviderKind, WorkerEmbeddingConfig } from "../types/semantic.js";
import { loadSemanticConfig } from "../utils/config-paths.js";
import { logger } from "../utils/logger.js";
import { getConfig } from "./yaml-config.js";

/**
 * Model vector dimensions.
 * Used for binary vector dump format.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  // E5 models
  "intfloat/multilingual-e5-small": 384,
  "intfloat/multilingual-e5-base": 768,
  "intfloat/multilingual-e5-large": 1024,
  "intfloat/multilingual-e5-large-instruct": 1024,
  "intfloat/e5-small-v2": 384,
  "intfloat/e5-base-v2": 768,
  "intfloat/e5-large-v2": 1024,
  // BGE models
  "BAAI/bge-small-en-v1.5": 384,
  "BAAI/bge-base-en-v1.5": 768,
  "BAAI/bge-large-en-v1.5": 1024,
  "BAAI/bge-m3": 1024,
  // MiniLM models
  "all-MiniLM-L6-v2": 384,
  "all-MiniLM-L12-v2": 384,
  // OpenAI models
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
  // Ollama models
  "all-minilm": 384,
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
};

/**
 * Get dimensions for a model.
 */
function getModelDimensions(modelName: string, configValue?: number): number {
  if (configValue && configValue > 0) {
    return configValue;
  }
  if (MODEL_DIMENSIONS[modelName]) {
    return MODEL_DIMENSIONS[modelName];
  }
  for (const [key, value] of Object.entries(MODEL_DIMENSIONS)) {
    if (modelName.includes(key) || key.includes(modelName)) {
      return value;
    }
  }
  return 384; // Default for most small models
}

/**
 * Model context window sizes (in tokens).
 * Used to properly truncate text before sending to embedding API.
 */
const MODEL_CONTEXT_TOKENS: Record<string, number> = {
  // E5 models
  "intfloat/multilingual-e5-small": 512,
  "intfloat/multilingual-e5-base": 512,
  "intfloat/multilingual-e5-large": 512,
  "intfloat/multilingual-e5-large-instruct": 512,
  "intfloat/e5-small-v2": 512,
  "intfloat/e5-base-v2": 512,
  "intfloat/e5-large-v2": 512,
  // BGE models
  "BAAI/bge-small-en-v1.5": 512,
  "BAAI/bge-base-en-v1.5": 512,
  "BAAI/bge-large-en-v1.5": 512,
  "BAAI/bge-m3": 8192,
  // MiniLM models
  "all-MiniLM-L6-v2": 256,
  "all-MiniLM-L12-v2": 256,
  // OpenAI models
  "text-embedding-3-small": 8191,
  "text-embedding-3-large": 8191,
  "text-embedding-ada-002": 8191,
  // Ollama models
  "all-minilm": 256,
  "nomic-embed-text": 8192,
  "mxbai-embed-large": 512,
};

/**
 * Get context token limit for a model.
 * Priority: config value > lookup table > default 512
 */
function getModelContextTokens(modelName: string, configValue?: number): number {
  // Use config value if provided
  if (configValue && configValue > 0) {
    return configValue;
  }
  // Direct lookup
  if (MODEL_CONTEXT_TOKENS[modelName]) {
    return MODEL_CONTEXT_TOKENS[modelName];
  }
  // Partial match (for model variants)
  for (const [key, value] of Object.entries(MODEL_CONTEXT_TOKENS)) {
    if (modelName.includes(key) || key.includes(modelName)) {
      return value;
    }
  }
  // Default conservative limit
  return 512;
}

/**
 * Build WorkerEmbeddingConfig from YAML config files.
 * Returns null if embeddings are disabled or not configured.
 *
 * @param cleanDumpDir - If true (default), cleans dump directory on start.
 *                       Set to false when just reading config (e.g., in semantic-agent).
 */
// Cache for buildWorkerEmbeddingConfig to avoid repeated file reads
let cachedConfig: WorkerEmbeddingConfig | null = null;
let cacheInitialized = false;

export function buildWorkerEmbeddingConfig(cleanDumpDir = true): WorkerEmbeddingConfig | null {
  // Return cached config if available (only for read-only calls)
  if (!cleanDumpDir && cacheInitialized) {
    return cachedConfig;
  }

  const config = getConfig();

  // Try to get semantic-config
  let semanticConfig: any = null;
  try {
    semanticConfig = loadSemanticConfig();
  } catch {
    // semantic-config not available, use yaml config only
  }

  // Determine provider from config
  const embeddingConfig = semanticConfig?.embedding || config.mcp?.embedding;

  // Debug logging (only on first call)
  if (!cacheInitialized) {
    logger.debug("WorkerEmbeddingConfig", `semanticConfig exists: ${!!semanticConfig}`);
    if (embeddingConfig) {
      logger.debug("WorkerEmbeddingConfig", `platform=${embeddingConfig.platform}, hasVllm=${!!embeddingConfig.vllm}`);
    }
  }

  if (!embeddingConfig) {
    if (!cacheInitialized) {
      logger.debug("WorkerEmbeddingConfig", "No embedding config found, returning null");
    }
    cacheInitialized = true;
    cachedConfig = null;
    return null;
  }

  // Determine provider kind
  let providerKind: EmbeddingProviderKind = "auto";
  let providerOptions: WorkerEmbeddingConfig["providerOptions"];
  let modelName = "all-MiniLM-L6-v2";
  let batchSize = 64;

  if (embeddingConfig.tei) {
    providerKind = "tei";
    const teiConfig = embeddingConfig.tei;
    modelName = teiConfig.model || modelName;
    batchSize = teiConfig.batchSize || batchSize;
    providerOptions = {
      baseUrl: teiConfig.endpoint || teiConfig.baseUrl || "http://127.0.0.1:8081",
      timeoutMs: teiConfig.timeoutMs,
      concurrency: teiConfig.concurrency,
      maxBatchSize: teiConfig.max_batch_tokens,
    };
  } else if (embeddingConfig.ovms) {
    providerKind = "ovms";
    const ovmsConfig = embeddingConfig.ovms;
    modelName = ovmsConfig.model || modelName;
    batchSize = ovmsConfig.batchSize || batchSize;
    providerOptions = {
      baseUrl: ovmsConfig.endpoint,
      timeoutMs: ovmsConfig.timeoutMs,
      concurrency: ovmsConfig.concurrency,
      useEmbeddingsApi: ovmsConfig.useEmbeddingsApi ?? true,
      encodingFormat: ovmsConfig.encodingFormat ?? "base64",
      protocol: ovmsConfig.protocol,
      grpcPort: ovmsConfig.grpcPort,
    };
  } else if (embeddingConfig.ollama) {
    providerKind = "ollama";
    const ollamaConfig = embeddingConfig.ollama;
    modelName = ollamaConfig.model || modelName;
    batchSize = ollamaConfig.batchSize || batchSize;
    providerOptions = {
      baseUrl: ollamaConfig.endpoint || ollamaConfig.baseUrl,
      timeoutMs: ollamaConfig.timeoutMs,
      concurrency: ollamaConfig.concurrency,
    };
  } else if (embeddingConfig.openai) {
    providerKind = "openai";
    const openaiConfig = embeddingConfig.openai;
    modelName = openaiConfig.model || "text-embedding-3-small";
    batchSize = openaiConfig.batchSize || batchSize;
    providerOptions = {
      baseUrl: openaiConfig.baseUrl,
      apiKey: openaiConfig.apiKey || process.env["OPENAI_API_KEY"],
      timeoutMs: openaiConfig.timeoutMs,
      concurrency: openaiConfig.concurrency,
    };
  } else if (embeddingConfig.vllm) {
    providerKind = "vllm";
    const vllmConfig = embeddingConfig.vllm;
    modelName = vllmConfig.selected_model || vllmConfig.model || "intfloat/multilingual-e5-large-instruct";
    batchSize = vllmConfig.max_batch_size || vllmConfig.batchSize || 100;
    providerOptions = {
      baseUrl: vllmConfig.endpoint || vllmConfig.baseUrl || "http://127.0.0.1:8000",
      timeoutMs: vllmConfig.timeoutMs || 30000,
      concurrency: vllmConfig.concurrency || 8,
      maxBatchSize: vllmConfig.max_batch_size || 100,
    };
  } else if (embeddingConfig.platform === "vllm") {
    // Handle platform-based config (from semantic-config.json)
    providerKind = "vllm";
    const vllmConfig = embeddingConfig.vllm || {};
    modelName = vllmConfig.selected_model || "intfloat/multilingual-e5-large-instruct";
    batchSize = vllmConfig.max_batch_size || 100;
    providerOptions = {
      baseUrl: vllmConfig.endpoint || "http://127.0.0.1:8000",
      timeoutMs: 30000,
      concurrency: 8,
      maxBatchSize: vllmConfig.max_batch_size || 100,
    };
  } else {
    // No embedding provider configured
    return null;
  }

  // Get context tokens from config or lookup table
  const configContextTokens = embeddingConfig.context_tokens || embeddingConfig.contextTokens;
  const contextTokens = getModelContextTokens(modelName, configContextTokens);

  // Get dimensions for binary vector dump
  const configDimensions = embeddingConfig.dimensions || embeddingConfig.vector_dimensions;
  const dimensions = getModelDimensions(modelName, configDimensions);

  // Initialize vector dump directory (workers write directly here)
  const vectorDumpDir = initVectorDumpDir(cleanDumpDir); // Clean only when starting workers

  const result: WorkerEmbeddingConfig = {
    enabled: true,
    provider: providerKind,
    modelName,
    maxTokens: embeddingConfig.maxTokens || 512,
    contextTokens,
    batchSize,
    dimensions,
    vectorDumpDir,
    providerOptions,
  };

  // Log only on first call
  if (!cacheInitialized) {
    logger.info(
      "WorkerEmbeddingConfig",
      `Built config: provider=${providerKind}, model=${modelName}, dims=${dimensions}, contextTokens=${contextTokens}, batchSize=${batchSize}, dumpDir=${vectorDumpDir}`,
    );
  }

  // Cache for subsequent read-only calls
  cacheInitialized = true;
  cachedConfig = result;

  return result;
}
