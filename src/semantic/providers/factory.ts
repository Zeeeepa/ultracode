import { logger as appLogger } from "../../utils/logger.js";
import { makeProviderLogger } from "../../utils/provider-logger.js";
import type { EmbeddingProvider, ProviderKind } from "./base.js";
import { CloudRUProvider } from "./cloudru-provider.js";
import { HuggingFaceProvider } from "./huggingface-provider.js";
import { MemoryProvider } from "./memory-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { TEIProvider } from "./tei-provider.js";

/**
 * Auto-detect available embedding providers
 * Priority: TEI (Docker) > Ollama (local) > Memory (fallback)
 */
async function detectAvailableProvider(): Promise<{ provider: ProviderKind; model: string }> {
  // Try TEI (Text Embeddings Inference) Docker container first
  try {
    const teiResponse = await fetch("http://127.0.0.1:8080/health", {
      method: "GET",
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (teiResponse.ok) {
      appLogger.info("EmbeddingFactory", "Auto-detected: TEI (Text Embeddings Inference) Docker");
      return { provider: "tei", model: "ibm-granite/granite-embedding-english-r2" };
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "TEI not available, checking Ollama");
  }

  // Try Ollama with granite-embedding
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (response.ok) {
      const data = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models = data.models || [];

      // Check for granite-embedding
      const hasGranite = models.some(
        (m: any) => m.name?.includes("granite-embedding") || m.model?.includes("granite-embedding"),
      );

      if (hasGranite) {
        appLogger.info("EmbeddingFactory", "Auto-detected: Ollama with granite-embedding");
        return { provider: "ollama", model: "ibm/granite-embedding:278m" };
      }

      // Fallback to any available model
      if (models.length > 0) {
        const firstModel = models[0]?.name || models[0]?.model || "llama2";
        appLogger.info("EmbeddingFactory", `Auto-detected: Ollama with ${firstModel}`);
        return { provider: "ollama", model: firstModel };
      }
    }
  } catch (_error) {
    appLogger.debug("EmbeddingFactory", "Ollama not available, falling back to memory");
  }

  // Fallback to memory provider
  appLogger.info("EmbeddingFactory", "Using memory provider (no ML embeddings)");
  return { provider: "memory", model: "deterministic-hash" };
}

export interface ProviderFactoryOptions {
  provider: ProviderKind;
  modelName: string;
  ollama?: {
    baseUrl?: string;
    timeoutMs?: number;
    concurrency?: number;
    headers?: Record<string, string>;
    autoPull?: boolean;
    warmupText?: string;
    checkServer?: boolean;
    pullTimeoutMs?: number;
  };
  memory?: { dimension?: number };
  openai?: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    concurrency?: number;
    dimensions?: number;
    maxBatchSize?: number;
  };
  cloudru?: {
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    concurrency?: number;
    maxBatchSize?: number;
  };
  huggingface?: {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
    concurrency?: number;
    warmupText?: string;
  };
  tei?: {
    baseUrl?: string;
    timeoutMs?: number;
    concurrency?: number;
    checkServer?: boolean;
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
      return new TEIProvider({
        model: actualModel,
        baseUrl: opts.tei?.baseUrl,
        timeoutMs: opts.tei?.timeoutMs,
        concurrency: opts.tei?.concurrency,
        checkServer: opts.tei?.checkServer,
        logger: makeProviderLogger(appLogger, "PROVIDER_TEI"),
      });
    default:
      return new MemoryProvider({ dimension: opts.memory?.dimension });
  }
}
