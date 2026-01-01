import { logger as appLogger } from "../../utils/logger.js";
import { makeProviderLogger } from "../../utils/provider-logger.js";
import { OVMS_NATIVE_GRPC_PORT, OVMS_NATIVE_REST_PORT } from "../ovms-native-manager.js";
import type { EmbeddingProvider, ProviderKind } from "./base.js";
import { CloudRUProvider } from "./cloudru-provider.js";
import { HuggingFaceProvider } from "./huggingface-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { OVMSProvider } from "./ovms-provider.js";
import { TEIProvider } from "./tei-provider.js";
import { VLLMProvider } from "./vllm-provider.js";

/**
 * Auto-detect available embedding providers
 * Priority: OVMS Native (8083) > OVMS Docker (8082) > TEI (Docker) > Ollama (local)
 */
async function detectAvailableProvider(): Promise<{ provider: ProviderKind; model: string }> {
  // Try OVMS Native first (port 8083)
  try {
    const ovmsNativeResponse = await fetch(`http://127.0.0.1:${OVMS_NATIVE_REST_PORT}/v2/health/ready`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });

    if (ovmsNativeResponse.ok) {
      appLogger.info("EmbeddingFactory", "Auto-detected: OVMS Native (port 8083)");
      return { provider: "ovms-native", model: "multilingual-e5-base" };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "OVMS Native not available, checking Docker");
  }

  // Try vLLM Docker (port 8000)
  try {
    const vllmResponse = await fetch("http://127.0.0.1:8000/health", {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });

    if (vllmResponse.ok) {
      appLogger.info("EmbeddingFactory", "Auto-detected: vLLM Docker (port 8000)");
      return { provider: "vllm", model: "intfloat/multilingual-e5-large-instruct" };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "vLLM not available, checking TEI");
  }

  // Try TEI (Text Embeddings Inference) Docker container
  try {
    const teiResponse = await fetch("http://127.0.0.1:8081/health", {
      method: "GET",
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (teiResponse.ok) {
      appLogger.info("EmbeddingFactory", "Auto-detected: TEI (Text Embeddings Inference) Docker");
      return { provider: "tei", model: "BAAI/bge-m3" };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "TEI not available, checking Ollama");
  }

  // Try Ollama with all-minilm (best quality)
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (response.ok) {
      const data = (await response.json()) as { models?: Array<{ name?: string | undefined; model?: string }> };
      const models = data.models || [];

      // Check for all-minilm (best quality)
      const hasMinilm = models.some((m: any) => m.name?.includes("all-minilm") || m.model?.includes("all-minilm"));

      if (hasMinilm) {
        appLogger.info("EmbeddingFactory", "Auto-detected: Ollama with all-minilm (best quality)");
        return { provider: "ollama", model: "all-minilm" };
      }

      // Check for granite-embedding
      const hasGranite = models.some(
        (m: any) => m.name?.includes("granite-embedding") || m.model?.includes("granite-embedding"),
      );

      if (hasGranite) {
        appLogger.info("EmbeddingFactory", "Auto-detected: Ollama with granite-embedding");
        return { provider: "ollama", model: "granite-embedding:30m" };
      }

      // Fallback to any embedding model
      const embeddingModel = models.find((m: any) => m.name?.includes("embed") || m.model?.includes("embed"));
      if (embeddingModel) {
        const model = embeddingModel.name ?? embeddingModel.model ?? "all-minilm";
        appLogger.info("EmbeddingFactory", `Auto-detected: Ollama with ${model}`);
        return { provider: "ollama", model };
      }
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "Ollama not available");
  }

  // No provider available - throw error
  throw new Error(
    "No embedding provider available. Please install one of:\n" +
      "  - OVMS: bun run mcp setup-embedding (select OVMS)\n" +
      "  - TEI: docker run -d -p 8081:80 ghcr.io/huggingface/text-embeddings-inference:1.8.3 --model-id BAAI/bge-m3\n" +
      "  - Ollama: ollama pull all-minilm",
  );
}

export interface ProviderFactoryOptions {
  provider: ProviderKind;
  modelName: string;
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
    dimensions?: number;
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
    maxBatchSize?: number | undefined; // Max texts per request (TEI max_client_batch_size)
  };
  ovms?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    checkServer?: boolean;
    miniBatchSize?: number; // Internal batch size for OVMS server (default: 4)
    useEmbeddingsApi?: boolean; // Use /v3/embeddings OpenAI-compatible API (default: true)
    encodingFormat?: "float" | "base64"; // Response format for embeddings API (default: base64)
    protocol?: "rest" | "grpc"; // Protocol: rest (HTTP/JSON) or grpc (binary protobuf)
    grpcPort?: number; // gRPC port (default: 9000)
    endpoints?: string[]; // Multi-device endpoints for round-robin: ["embeddings-cpu", "embeddings-gpu"]
  };
  vllm?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    checkServer?: boolean;
    maxBatchSize?: number | undefined;
  };
}

export async function createProvider(opts: ProviderFactoryOptions): Promise<EmbeddingProvider> {
  let actualProvider = opts.provider;
  let actualModel = opts.modelName;

  // Auto-detect if provider is "auto"
  if (opts.provider === "auto") {
    const detected = await detectAvailableProvider();
    actualProvider = detected.provider;
    actualModel = detected.model;
    appLogger.info("EmbeddingFactory", `Auto mode selected: ${actualProvider} with ${actualModel}`);
  }

  switch (actualProvider) {
    case "ollama":
      return new OllamaProvider({
        model: actualModel,
        baseUrl: opts.ollama?.baseUrl,
        timeoutMs: opts.ollama?.timeoutMs,
        concurrency: opts.ollama?.concurrency,
        headers: opts.ollama?.headers,
        autoPull: opts.ollama?.autoPull,
        warmupText: opts.ollama?.warmupText,
        checkServer: opts.ollama?.checkServer,
        pullTimeoutMs: opts.ollama?.pullTimeoutMs,
        logger: makeProviderLogger(appLogger, "PROVIDER_OLLAMA"),
      });

    case "openai":
      if (!opts.openai?.apiKey) throw new Error("OpenAI apiKey is required");
      return new OpenAIProvider({
        model: actualModel,
        apiKey: opts.openai.apiKey,
        baseUrl: opts.openai.baseUrl,
        timeoutMs: opts.openai.timeoutMs,
        concurrency: opts.openai.concurrency,
        dimensions: opts.openai.dimensions,
        maxBatchSize: opts.openai.maxBatchSize,
        logger: makeProviderLogger(appLogger, "PROVIDER_OPENAI"),
      });

    case "cloudru":
      return new CloudRUProvider({
        model: actualModel,
        apiKey: opts.cloudru?.apiKey,
        baseUrl: opts.cloudru?.baseUrl,
        timeoutMs: opts.cloudru?.timeoutMs,
        concurrency: opts.cloudru?.concurrency,
        maxBatchSize: opts.cloudru?.maxBatchSize,
        logger: makeProviderLogger(appLogger, "PROVIDER_CLOUDRU"),
      });

    case "huggingface":
      if (!opts.huggingface?.apiKey) throw new Error("HuggingFace apiKey is required");
      return new HuggingFaceProvider({
        model: actualModel,
        apiKey: opts.huggingface.apiKey,
        baseUrl: opts.huggingface.baseUrl,
        timeoutMs: opts.huggingface.timeoutMs,
        concurrency: opts.huggingface.concurrency,
        warmupText: opts.huggingface.warmupText,
        logger: makeProviderLogger(appLogger, "PROVIDER_HUGGINGFACE"),
      });

    case "tei":
      appLogger.info("FACTORY", `Creating TEI provider`, { tei: opts.tei });
      appLogger.info("FACTORY", `TEI baseUrl=${opts.tei?.baseUrl || "UNDEFINED - will use default 8081"}`);
      return new TEIProvider({
        model: actualModel,
        baseUrl: opts.tei?.baseUrl,
        timeoutMs: opts.tei?.timeoutMs,
        concurrency: opts.tei?.concurrency,
        checkServer: opts.tei?.checkServer,
        maxBatchSize: opts.tei?.maxBatchSize,
        logger: makeProviderLogger(appLogger, "PROVIDER_TEI"),
      });

    case "ovms":
    case "ovms-native": {
      // OVMS Native: 8083 (REST), 9001 (gRPC) - managed by ovms-native-manager
      const isNative = actualProvider === "ovms-native";
      const defaultRestPort = OVMS_NATIVE_REST_PORT;
      const defaultGrpcPort = OVMS_NATIVE_GRPC_PORT;
      const defaultBaseUrl = opts.ovms?.baseUrl || `http://127.0.0.1:${defaultRestPort}`;

      appLogger.info("FACTORY", `Creating OVMS provider (${actualProvider})`, {
        ovms: opts.ovms,
        isNative,
        baseUrl: defaultBaseUrl,
        grpcPort: opts.ovms?.grpcPort ?? defaultGrpcPort,
      });

      return new OVMSProvider({
        model: actualModel,
        baseUrl: defaultBaseUrl,
        timeoutMs: opts.ovms?.timeoutMs,
        concurrency: opts.ovms?.concurrency,
        checkServer: opts.ovms?.checkServer,
        miniBatchSize: opts.ovms?.miniBatchSize,
        // OVMS Native now uses export_model.py which creates MediaPipe graph for /v3/embeddings
        // So we enable useEmbeddingsApi for both Docker and Native modes
        useEmbeddingsApi: opts.ovms?.useEmbeddingsApi ?? true,
        encodingFormat: opts.ovms?.encodingFormat,
        protocol: opts.ovms?.protocol as "rest" | "grpc" | undefined,
        grpcPort: opts.ovms?.grpcPort ?? defaultGrpcPort,
        isNative, // Tells provider not to try Docker auto-start
        // Multi-device round-robin: ["embeddings-cpu", "embeddings-gpu"]
        endpoints: opts.ovms?.endpoints,
        logger: makeProviderLogger(appLogger, `PROVIDER_${actualProvider.toUpperCase().replace("-", "_")}`),
      });
    }

    case "vllm": {
      const vllmBaseUrl = opts.vllm?.baseUrl || "http://127.0.0.1:8000";
      return new VLLMProvider({
        model: actualModel,
        baseUrl: vllmBaseUrl,
        timeoutMs: opts.vllm?.timeoutMs,
        concurrency: opts.vllm?.concurrency,
        maxBatchSize: opts.vllm?.maxBatchSize,
        checkServer: opts.vllm?.checkServer,
        logger: makeProviderLogger(appLogger, "PROVIDER_VLLM"),
      });
    }

    default:
      throw new Error(
        `Unknown embedding provider: ${actualProvider}. ` +
          `Supported providers: ovms, ovms-native, vllm, tei, ollama, openai, cloudru, huggingface`,
      );
  }
}
