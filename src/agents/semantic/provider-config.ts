/**
 * Semantic Agent Provider Configuration
 *
 * Maps semantic-config.json settings to embedding provider configuration.
 */

import type { SemanticConfig } from "../../utils/config-paths.js";

/**
 * Provider kind type
 */
export type ProviderKind = "auto" | "tei" | "ovms" | "ovms-native" | "vllm" | "llamacpp";

/**
 * Map semantic-config.json platform to provider kind
 * Returns "auto" if no config or disabled (will auto-detect available provider)
 */
export function mapSemanticConfigToProvider(semanticConfig: SemanticConfig | null): ProviderKind {
  if (!semanticConfig || !semanticConfig.enabled) {
    return "auto";
  }

  const platform = semanticConfig.embedding?.platform;
  switch (platform) {
    case "ovms":
      return "ovms";
    case "ovms-native":
      return "ovms-native";
    case "vllm":
      return "vllm";
    case "llamacpp":
      return "llamacpp";
    case "tei":
      return "tei";
    default:
      return "auto";
  }
}

/**
 * Get model name from semantic-config.json based on platform
 */
export function getModelNameFromSemanticConfig(semanticConfig: SemanticConfig | null): string {
  if (!semanticConfig || !semanticConfig.enabled) {
    return "all-MiniLM-L6-v2"; // default for auto-detection
  }

  const platform = semanticConfig.embedding?.platform;
  switch (platform) {
    case "ovms":
    case "ovms-native":
      return semanticConfig.embedding?.ovms?.selected_model || "all-MiniLM-L6-v2";
    case "vllm":
      return semanticConfig.embedding?.vllm?.selected_model || "intfloat/multilingual-e5-large-instruct";
    case "llamacpp":
      return semanticConfig.embedding?.llamacpp?.selected_model || "multilingual-e5-base";
    case "tei":
      return semanticConfig.embedding?.tei?.selected_model || "BAAI/bge-m3";
    default:
      return "all-MiniLM-L6-v2";
  }
}

/**
 * Build worker embedding config for subprocess workers
 */
export function buildWorkerProviderOptions(
  providerKind: string,
  semanticConfig: SemanticConfig | null,
  yamlConfig: any,
): Record<string, any> | undefined {
  switch (providerKind) {
    case "tei": {
      const teiConfig = semanticConfig?.embedding?.tei || yamlConfig?.mcp?.embedding?.tei;
      return {
        baseUrl: teiConfig?.endpoint || teiConfig?.baseUrl || "http://127.0.0.1:8081",
        timeoutMs: teiConfig?.timeoutMs,
        concurrency: teiConfig?.concurrency,
        maxBatchSize: teiConfig?.max_batch_tokens,
      };
    }
    case "ovms": {
      const ovmsConfig = semanticConfig?.embedding?.ovms as any;
      return {
        baseUrl: ovmsConfig?.endpoint,
        timeoutMs: ovmsConfig?.timeoutMs,
        concurrency: ovmsConfig?.concurrency,
        useEmbeddingsApi: ovmsConfig?.useEmbeddingsApi ?? true,
        encodingFormat: ovmsConfig?.encodingFormat ?? "base64",
        protocol: ovmsConfig?.protocol,
        grpcPort: ovmsConfig?.grpcPort,
      };
    }
    case "llamacpp": {
      const llamacppConfig = semanticConfig?.embedding?.llamacpp as any;
      return {
        baseUrl: llamacppConfig?.endpoint || "http://127.0.0.1:8085",
        timeoutMs: llamacppConfig?.timeoutMs ?? 30000,
        // Client concurrency should match server --parallel
        concurrency: llamacppConfig?.concurrency ?? 4,
        contextSize: llamacppConfig?.context_size || llamacppConfig?.contextSize || 2048,
        nGpuLayers: llamacppConfig?.n_gpu_layers ?? llamacppConfig?.nGpuLayers ?? 99,
        // Performance tuning
        maxBatchSize: llamacppConfig?.max_batch_size ?? 256,
      };
    }
    default:
      return undefined;
  }
}

/**
 * Build embedding generator options from config
 */
export function buildEmbeddingGeneratorOptions(
  provider: ProviderKind,
  modelName: string,
  batchSize: number,
  semanticConfig: SemanticConfig | null,
  yamlConfig: any,
): Record<string, any> {
  const options: Record<string, any> = {
    provider,
    modelName,
    quantized: true,
    localPath: yamlConfig?.semanticAgent?.modelPath ?? "./models",
    batchSize,
  };

  // Configure TEI from semantic-config.json OR YAML config
  const yamlTei = yamlConfig?.mcp?.embedding?.tei;
  const jsonTei = semanticConfig?.embedding?.tei;
  if (provider === "tei") {
    options["tei"] = {
      baseUrl: jsonTei?.endpoint || yamlTei?.baseUrl || "http://127.0.0.1:8081",
      timeoutMs: yamlTei?.timeoutMs,
      concurrency: yamlTei?.concurrency,
      checkServer: yamlTei?.checkServer,
    };
  }

  // Configure OVMS from semantic-config.json
  if (
    (semanticConfig?.embedding?.platform === "ovms" || semanticConfig?.embedding?.platform === "ovms-native") &&
    semanticConfig?.embedding?.ovms
  ) {
    options["ovms"] = {
      baseUrl: semanticConfig.embedding.ovms.endpoint,
      miniBatchSize: (semanticConfig.embedding.ovms as any).ovms_mini_batch ?? 8,
      useEmbeddingsApi: (semanticConfig.embedding.ovms as any).useEmbeddingsApi ?? true,
      encodingFormat: (semanticConfig.embedding.ovms as any).encodingFormat ?? "base64",
      endpoints: (semanticConfig.embedding.ovms as any).endpoints,
    };
  }

  // Configure vLLM from semantic-config.json
  if (semanticConfig?.embedding?.platform === "vllm" && semanticConfig?.embedding?.vllm) {
    options["vllm"] = {
      baseUrl: semanticConfig.embedding.vllm.endpoint,
    };
  }

  // Configure llama.cpp from semantic-config.json
  if (semanticConfig?.embedding?.platform === "llamacpp") {
    const llamacppConfig = semanticConfig?.embedding?.llamacpp as any;
    options["llamacpp"] = {
      baseUrl: llamacppConfig?.endpoint || "http://127.0.0.1:8085",
      timeoutMs: llamacppConfig?.timeoutMs ?? 30000,
      // Client concurrency should match server --parallel for optimal throughput
      concurrency: llamacppConfig?.concurrency ?? 4,
      // Client batch size: max texts per HTTP request
      maxBatchSize: llamacppConfig?.max_batch_size ?? 256,
      // Context size: tokens per slot * parallel slots (e.g., 512 * 4 = 2048)
      contextSize: llamacppConfig?.context_size || llamacppConfig?.contextSize || 2048,
      nGpuLayers: llamacppConfig?.n_gpu_layers ?? llamacppConfig?.nGpuLayers ?? 99,
      // Auto-start server if not running (default: true)
      autoStart: llamacppConfig?.auto_start ?? llamacppConfig?.autoStart ?? true,
      // Server performance tuning
      parallelSlots: llamacppConfig?.parallel_slots ?? 8,
      ubatchSize: llamacppConfig?.ubatch_size ?? 1536,
      batchSize: llamacppConfig?.batch_size ?? 3072,
    };
  }

  return options;
}

/**
 * Get batch size from semantic config
 */
export function getBatchSizeFromConfig(semanticConfig: SemanticConfig | null, defaultBatchSize: number): number {
  const ovmsBatchSize = semanticConfig?.embedding?.ovms?.batch_size;
  const teiBatchSize = semanticConfig?.embedding?.tei?.max_batch_tokens;
  const providerBatchSize = teiBatchSize || ovmsBatchSize;

  if (providerBatchSize && providerBatchSize > 0) {
    return providerBatchSize;
  }
  return defaultBatchSize;
}
