/**
 * Lightweight Embedding Client for Workers
 *
 * Simple HTTP-only client for generating embeddings in subprocess workers.
 * No heavy dependencies - only uses native fetch.
 *
 * Supports: TEI, OVMS, Ollama, OpenAI, vLLM, llama.cpp (all HTTP-based)
 *
 * Performance:
 * - Uses HTTP keep-alive via undici dispatcher for connection reuse
 * - Critical for high-throughput embedding generation in long-running workers
 */

import type { WorkerEmbeddingConfig } from "../../types/semantic.js";

/**
 * Worker global scope with logger
 */
interface WorkerGlobalThis {
  __workerLog?: (level: string, message: string, context?: Record<string, unknown>) => void;
}

/**
 * OVMS/OpenAI API embedding response item
 */
interface EmbeddingResponseItem {
  embedding: number[] | string; // number[] for float, string for base64
  index?: number;
}

/**
 * OVMS/OpenAI API embedding response
 */
interface EmbeddingApiResponse {
  data: EmbeddingResponseItem[];
}

/**
 * Ollama embedding response
 */
interface OllamaEmbeddingResponse {
  embedding: number[];
}

// Configure undici global dispatcher with keep-alive for connection pooling
// This affects all native fetch() calls in this worker process
try {
  const { Agent: UndiciAgent, setGlobalDispatcher } = require("undici");
  const dispatcher = new UndiciAgent({
    keepAliveTimeout: 30_000, // 30s idle connection timeout
    keepAliveMaxTimeout: 120_000, // 2 min max
    connections: 16, // Max connections per host (match server --parallel)
    pipelining: 1, // HTTP pipelining (1 = enabled but sequential)
  });
  setGlobalDispatcher(dispatcher);
} catch {
  // undici not available - native fetch still uses some connection reuse
}

export class WorkerEmbeddingClient {
  private config: WorkerEmbeddingConfig;
  private baseUrl: string;
  private initialized = false;
  // OVMS endpoint selection for GPU/CPU load balancing
  // If workerIndex is set, worker uses dedicated endpoint (no contention)
  // Otherwise falls back to round-robin (legacy)
  private endpoints: string[] = [];
  private endpointIndex = 0;
  private dedicatedEndpoint: string | null = null;

  constructor(config: WorkerEmbeddingConfig) {
    this.config = config;
    this.baseUrl = config.providerOptions?.baseUrl || "";
    // Load endpoints for OVMS
    const configEndpoints = config.providerOptions?.endpoints as string[] | undefined;
    this.endpoints = configEndpoints || [config.modelName];

    // Assign dedicated endpoint based on workerIndex (avoids contention)
    if (config.workerIndex !== undefined && this.endpoints.length > 0) {
      this.dedicatedEndpoint = this.endpoints[config.workerIndex % this.endpoints.length]!;
    }

    // Log endpoint assignment for debugging
    const workerLog = (globalThis as WorkerGlobalThis).__workerLog;
    if (workerLog) {
      workerLog("INFO", "WorkerEmbeddingClient endpoint assignment", {
        workerIndex: config.workerIndex,
        endpointsCount: this.endpoints.length,
        dedicatedEndpoint: this.dedicatedEndpoint,
        endpoints: this.endpoints.slice(0, 3).join(",") + (this.endpoints.length > 3 ? "..." : ""),
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Validate config
    if (!this.config.enabled) {
      throw new Error("Embeddings disabled in config");
    }

    if (!this.baseUrl && this.config.provider !== "openai") {
      throw new Error(`No baseUrl configured for provider ${this.config.provider}`);
    }

    this.initialized = true;
  }

  /**
   * Generate embeddings for a batch of texts
   */
  async generateBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    switch (this.config.provider) {
      case "tei":
        return this.generateTEI(texts);
      case "ovms":
        return this.generateOVMS(texts);
      case "ollama":
        return this.generateOllama(texts);
      case "openai":
        return this.generateOpenAI(texts);
      case "llamacpp":
        return this.generateLlamaCpp(texts);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * TEI (Text Embeddings Inference) - Hugging Face
   */
  private async generateTEI(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/embed`;
    const timeout = this.config.providerOptions?.timeoutMs || 30000;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`TEI error: ${response.status} ${response.statusText}`);
    }

    const embeddings = (await response.json()) as number[][];
    return embeddings.map((emb) => new Float32Array(emb));
  }

  /**
   * OVMS (OpenVINO Model Server) - uses /v3/embeddings API
   * Note: OVMS Native uses MediaPipe graph with /v3/embeddings endpoint (not /v1)
   *
   * Endpoint selection strategy:
   * - If workerIndex is set: uses dedicated endpoint per worker (no contention)
   * - Otherwise: falls back to round-robin (legacy behavior)
   */
  private async generateOVMS(texts: string[]): Promise<Float32Array[]> {
    const useEmbeddingsApi = this.config.providerOptions?.useEmbeddingsApi ?? true;

    if (useEmbeddingsApi) {
      // OVMS /v3/embeddings endpoint (MediaPipe graph)
      const url = `${this.baseUrl}/v3/embeddings`;
      const timeout = this.config.providerOptions?.timeoutMs || 30000;

      // Endpoint selection: dedicated (workerIndex) or round-robin (legacy)
      const currentEndpoint = this.dedicatedEndpoint ?? this.endpoints[this.endpointIndex++ % this.endpoints.length]!;

      // Debug log first request per endpoint
      const workerLog = (globalThis as WorkerGlobalThis).__workerLog;
      if (workerLog && this.endpointIndex <= 1) {
        workerLog("DEBUG", "OVMS request", {
          endpoint: currentEndpoint,
          workerIndex: this.config.workerIndex,
          dedicated: !!this.dedicatedEndpoint,
          batchSize: texts.length,
        });
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: currentEndpoint, // Use round-robin endpoint (embeddings-gpu/embeddings-cpu)
          input: texts,
          encoding_format: this.config.providerOptions?.encodingFormat || "float",
        }),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        throw new Error(`OVMS error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as EmbeddingApiResponse;

      // Handle base64 or float encoding
      if (this.config.providerOptions?.encodingFormat === "base64") {
        return result.data.map((item) => {
          if (typeof item.embedding !== "string") {
            throw new Error("Expected base64 string encoding");
          }
          const binaryData = Buffer.from(item.embedding, "base64");
          return new Float32Array(binaryData.buffer, binaryData.byteOffset, binaryData.length / 4);
        });
      } else {
        return result.data.map((item) => {
          if (typeof item.embedding === "string") {
            throw new Error("Expected float array encoding");
          }
          return new Float32Array(item.embedding);
        });
      }
    } else {
      // Raw OVMS inference endpoint
      throw new Error("OVMS raw inference not supported in worker client");
    }
  }

  /**
   * Ollama - local LLM server
   */
  private async generateOllama(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/api/embeddings`;
    const timeout = this.config.providerOptions?.timeoutMs || 60000;

    const results: Float32Array[] = [];

    // Ollama processes one text at a time
    for (const text of texts) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.modelName,
          prompt: text,
        }),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as OllamaEmbeddingResponse;
      results.push(new Float32Array(result.embedding));
    }

    return results;
  }

  /**
   * OpenAI API
   */
  private async generateOpenAI(texts: string[]): Promise<Float32Array[]> {
    const baseUrl = this.config.providerOptions?.baseUrl || "https://api.openai.com";
    const url = `${baseUrl}/v1/embeddings`;
    const apiKey = this.config.providerOptions?.apiKey;
    const timeout = this.config.providerOptions?.timeoutMs || 30000;

    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.modelName,
        input: texts,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as EmbeddingApiResponse;
    return result.data.map((item) => {
      if (typeof item.embedding === "string") {
        throw new Error("Expected float array encoding from OpenAI");
      }
      return new Float32Array(item.embedding);
    });
  }

  /**
   * llama.cpp - local GGUF model server with OpenAI-compatible API
   */
  private async generateLlamaCpp(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const timeout = this.config.providerOptions?.timeoutMs || 30000;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.modelName,
        input: texts,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`llama.cpp error: ${response.status} ${response.statusText} - ${body.slice(0, 500)}`);
    }

    const result = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to ensure correct order
    const sorted = [...result.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => new Float32Array(item.embedding));
  }
}
