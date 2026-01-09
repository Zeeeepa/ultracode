/**
 * Worker Embedding Config Builder
 *
 * Builds WorkerEmbeddingConfig from YAML config for subprocess workers.
 * Used by DevAgent to configure embedding generation in parser workers.
 */

import { log } from "../logging/index.js";
import type { EmbeddingProviderKind, WorkerEmbeddingConfig } from "../types/semantic.js";
import { loadSemanticConfig } from "../utils/config-paths.js";
import { getConfig } from "./yaml-config.js";

/**
 * Model vector dimensions.
 * Used for binary vector dump format.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  // E5 models
  "intfloat/multilingual-e5-small": 384,
  "multilingual-e5-small": 384, // Short name for OVMS
  "intfloat/multilingual-e5-base": 768,
  "multilingual-e5-base": 768, // Short name for OVMS/llama.cpp
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
  "multilingual-e5-base": 512, // llama.cpp GGUF model name
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
 */
// Cache for buildWorkerEmbeddingConfig to avoid repeated file reads
let cachedConfig: WorkerEmbeddingConfig | null = null;
let cacheInitialized = false;

export function buildWorkerEmbeddingConfig(): WorkerEmbeddingConfig | null {
  // Return cached config if available
  if (cacheInitialized) {
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
    log.d("WORKEMBCONF", "config_check", { hasSemanticConfig: !!semanticConfig });
    if (embeddingConfig) {
      log.d("WORKEMBCONF", "config_details", { platform: embeddingConfig.platform, hasVllm: !!embeddingConfig.vllm });
    }
  }

  if (!embeddingConfig) {
    if (!cacheInitialized) {
      log.d("WORKEMBCONF", "no_config_found", {});
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
    modelName = teiConfig.selected_model || teiConfig.model || modelName;
    batchSize = teiConfig.max_client_batch_size || teiConfig.batchSize || batchSize;
    // Get vector_size from selected model in models array
    const selectedModel = teiConfig.models?.find((m: any) => m.id === modelName);
    if (selectedModel?.vector_size) {
      embeddingConfig.vector_dimensions = selectedModel.vector_size;
    }
    providerOptions = {
      baseUrl: teiConfig.endpoint || teiConfig.baseUrl || "http://127.0.0.1:8081",
      timeoutMs: teiConfig.timeoutMs,
      concurrency: teiConfig.concurrency, // default 16 in provider, can override here
      maxBatchSize: teiConfig.max_client_batch_size, // TEI max_client_batch_size (not max_batch_tokens)
    };
  } else if (
    embeddingConfig.ovms ||
    embeddingConfig.platform === "ovms" ||
    embeddingConfig.platform === "ovms-native"
  ) {
    // OVMS or OVMS Native provider
    providerKind = "ovms";
    const ovmsConfig = embeddingConfig.ovms || {};
    const endpoints = ovmsConfig.endpoints || [];
    // Use HuggingFace model id for tokenizer loading (selected_model), not endpoint name
    // Endpoints are passed separately in providerOptions for round-robin load balancing
    const selectedModelId = ovmsConfig.selected_model || ovmsConfig.model || "multilingual-e5-small";
    modelName = selectedModelId;
    batchSize = ovmsConfig.batch_size || ovmsConfig.batchSize || batchSize;
    // Get vector_size from selected model in models array
    const selectedModel = ovmsConfig.models?.find((m: any) => m.id === selectedModelId);
    if (selectedModel?.vector_size) {
      embeddingConfig.vector_dimensions = selectedModel.vector_size;
    }
    providerOptions = {
      baseUrl: ovmsConfig.endpoint || "http://127.0.0.1:8083",
      timeoutMs: ovmsConfig.timeoutMs || 30000,
      concurrency: ovmsConfig.concurrency || 8,
      useEmbeddingsApi: ovmsConfig.useEmbeddingsApi ?? true,
      encodingFormat: ovmsConfig.encodingFormat ?? "base64",
      protocol: ovmsConfig.protocol,
      grpcPort: ovmsConfig.grpcPort,
      endpoints: endpoints.length > 0 ? endpoints : undefined, // For round-robin GPU/CPU load balancing
    };

    // OVMS uses centralized embedding mode: workers send texts to Main,
    // Main generates embeddings via gRPC (faster than multiple HTTP clients)
    // This is set on the result below, not in providerOptions
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
  } else if (embeddingConfig.vllm || embeddingConfig.platform === "vllm") {
    providerKind = "vllm";
    const vllmConfig = embeddingConfig.vllm || {};
    modelName = vllmConfig.selected_model || vllmConfig.model || "intfloat/multilingual-e5-large-instruct";
    batchSize = vllmConfig.max_batch_size || vllmConfig.batchSize || 100;
    // Get vector_size from selected model in models array
    const selectedModel = vllmConfig.models?.find((m: any) => m.id === modelName);
    if (selectedModel?.vector_size) {
      // Store in embeddingConfig for later use by getModelDimensions
      embeddingConfig.vector_dimensions = selectedModel.vector_size;
    }
    providerOptions = {
      baseUrl: vllmConfig.endpoint || vllmConfig.baseUrl || "http://127.0.0.1:8000",
      timeoutMs: vllmConfig.timeoutMs || 30000,
      concurrency: vllmConfig.concurrency || 8,
      maxBatchSize: vllmConfig.max_batch_size || 100,
    };
  } else if (embeddingConfig.llamacpp || embeddingConfig.platform === "llamacpp") {
    // llama.cpp provider (local GGUF models)
    // Optimized for throughput: larger batch size, higher concurrency
    providerKind = "llamacpp";
    const llamacppConfig = embeddingConfig.llamacpp || {};
    modelName = llamacppConfig.selected_model || "multilingual-e5-base";
    // Larger batch = better GPU utilization, default 256 (up from 100)
    batchSize = llamacppConfig.batch_size || 256;
    // Get vector_size from selected model in models array
    const selectedModel = llamacppConfig.models?.find((m: any) => m.id === modelName);
    if (selectedModel?.vector_size) {
      embeddingConfig.vector_dimensions = selectedModel.vector_size;
    }
    providerOptions = {
      baseUrl: llamacppConfig.endpoint || "http://127.0.0.1:8085",
      timeoutMs: llamacppConfig.timeoutMs || 60000, // 60s timeout for larger batches
      concurrency: llamacppConfig.concurrency || 8, // Match server's --parallel 8
      contextSize: llamacppConfig.context_size || 8192,
      nGpuLayers: llamacppConfig.n_gpu_layers ?? 99,
    };
  } else {
    // No embedding provider configured
    return null;
  }

  // Get context tokens from config or lookup table
  const configContextTokens = embeddingConfig.context_tokens || embeddingConfig.contextTokens;
  const contextTokens = getModelContextTokens(modelName, configContextTokens);

  // Get dimensions for embeddings
  const configDimensions = embeddingConfig.dimensions || embeddingConfig.vector_dimensions;
  const dimensions = getModelDimensions(modelName, configDimensions);

  // Queue batch size for centralized mode (texts per HTTP request)
  // Rule: batchSize <= --parallel, smaller batches = better GPU utilization
  // 64 texts * 8 parallel = 512 texts in flight
  const queueBatchSize = providerKind === "llamacpp" ? 72 : providerKind === "ovms" ? 200 : undefined;

  const result: WorkerEmbeddingConfig = {
    enabled: true,
    provider: providerKind,
    modelName,
    maxTokens: embeddingConfig.maxTokens || 512,
    contextTokens,
    batchSize,
    queueBatchSize,
    dimensions,
    providerOptions,
    // Local inference providers (OVMS, llamacpp) use centralized embedding mode:
    // Workers send texts to Main, Main generates embeddings via single connection
    // Benefits: optimal batching, no HTTP connection contention, better GPU utilization
    centralizedEmbeddings: providerKind === "ovms" || providerKind === "llamacpp",
  };

  // Log only on first call
  if (!cacheInitialized) {
    log.i("WORKEMBCONF", "config_built", {
      provider: providerKind,
      model: modelName,
      dims: dimensions,
      contextTokens,
      batchSize,
      queueBatchSize,
    });
  }

  // Cache for subsequent read-only calls
  cacheInitialized = true;
  cachedConfig = result;

  return result;
}
