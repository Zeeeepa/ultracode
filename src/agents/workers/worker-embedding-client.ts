/**
 * Lightweight Embedding Client for Workers
 *
 * Simple HTTP-only client for generating embeddings in subprocess workers.
 * No heavy dependencies - only uses native fetch.
 *
 * Supports: TEI, OVMS, Ollama, OpenAI (all HTTP-based)
 */

import type { WorkerEmbeddingConfig } from "../../types/semantic.js";

export class WorkerEmbeddingClient {
  private config: WorkerEmbeddingConfig;
  private baseUrl: string;
  private initialized = false;

  constructor(config: WorkerEmbeddingConfig) {
    this.config = config;
    this.baseUrl = config.providerOptions?.baseUrl || "";
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
      case "vllm":
        return this.generateVLLM(texts);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: texts }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TEI error: ${response.status} ${response.statusText}`);
      }

      const embeddings = (await response.json()) as number[][];
      return embeddings.map((emb) => new Float32Array(emb));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * OVMS (OpenVINO Model Server) - uses OpenAI-compatible API
   */
  private async generateOVMS(texts: string[]): Promise<Float32Array[]> {
    const useEmbeddingsApi = this.config.providerOptions?.useEmbeddingsApi ?? true;

    if (useEmbeddingsApi) {
      // OpenAI-compatible embeddings endpoint
      const url = `${this.baseUrl}/v1/embeddings`;
      const timeout = this.config.providerOptions?.timeoutMs || 30000;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.modelName,
            input: texts,
            encoding_format: this.config.providerOptions?.encodingFormat || "float",
          }),
        });

        if (!response.ok) {
          throw new Error(`OVMS error: ${response.status} ${response.statusText}`);
        }

        const result: any = await response.json();

        // Handle base64 or float encoding
        if (this.config.providerOptions?.encodingFormat === "base64") {
          return result.data.map((item: any) => {
            const binaryData = Buffer.from(item.embedding, "base64");
            return new Float32Array(binaryData.buffer, binaryData.byteOffset, binaryData.length / 4);
          });
        } else {
          return result.data.map((item: any) => new Float32Array(item.embedding));
        }
      } finally {
        clearTimeout(timeoutId);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.config.modelName,
            prompt: text,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
        }

        const result: any = await response.json();
        results.push(new Float32Array(result.embedding));
      } finally {
        clearTimeout(timeoutId);
      }
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
      }

      const result: any = await response.json();
      return result.data.map((item: any) => new Float32Array(item.embedding));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * vLLM - OpenAI-compatible embeddings API
   */
  private async generateVLLM(texts: string[]): Promise<Float32Array[]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const timeout = this.config.providerOptions?.timeoutMs || 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.modelName,
          input: texts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`vLLM error: ${response.status} ${response.statusText} - ${body.slice(0, 500)}`);
      }

      const result = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to ensure correct order
      const sorted = [...result.data].sort((a, b) => a.index - b.index);
      return sorted.map((item) => new Float32Array(item.embedding));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
