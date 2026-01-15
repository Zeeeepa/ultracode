import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";
import { HttpEngine } from "./http-engine.js";

/**
 * OpenAI embeddings API response types
 */
interface OpenAIEmbeddingData {
  embedding: number[];
  index: number;
  object: string;
}

interface OpenAIEmbeddingResponse {
  data: OpenAIEmbeddingData[];
  model: string;
  object: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIRequestBody {
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface OpenAIOptions {
  baseUrl?: string | undefined;
  apiKey: string;
  model: string;
  timeoutMs?: number | undefined;
  concurrency?: number | undefined;
  dimensions?: number;
  maxBatchSize?: number | undefined;
  logger?: ProviderLogger;
}

export class OpenAIProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private engine: HttpEngine;
  private opts: OpenAIOptions;
  private log?: ProviderLogger | undefined;

  constructor(opts: OpenAIOptions) {
    this.opts = { baseUrl: "https://api.openai.com", ...opts };
    this.log = opts.logger;

    // OpenAI text-embedding-3-* models support 8191 tokens
    const maxTokens = opts.model.includes("text-embedding-3") ? 8191 : 8191;

    this.info = {
      name: "openai",
      model: opts.model,
      supportsBatch: true,
      maxBatchSize: opts.maxBatchSize,
      maxTokens,
    };

    this.engine = new HttpEngine({
      baseUrl: this.opts.baseUrl!,
      timeoutMs: this.opts.timeoutMs ?? 10000,
      concurrency: this.opts.concurrency ?? 4,
      defaultHeaders: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
    });
  }

  async initialize(): Promise<void> {}

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  private buildBody = (input: string | string[]): OpenAIRequestBody => {
    const body: OpenAIRequestBody = { model: this.info.model, input };
    if (this.opts.dimensions) body.dimensions = this.opts.dimensions;
    return body;
  };

  private parseSingle = (json: unknown): Float32Array => {
    const response = json as OpenAIEmbeddingResponse;
    if (!response || !Array.isArray(response.data) || !Array.isArray(response.data[0]?.embedding)) {
      throw new Error("OpenAI invalid embedding response");
    }
    const arr = new Float32Array(response.data[0].embedding);
    this.info.dimension = this.info.dimension ?? arr.length;
    return arr;
  };

  private parseBatch = (json: unknown): Float32Array[] => {
    const response = json as OpenAIEmbeddingResponse;
    if (!response || !Array.isArray(response.data)) throw new Error("OpenAI invalid batch response");
    const out = response.data.map((d) => new Float32Array(d.embedding));
    if (!this.info.dimension && out[0]) this.info.dimension = out[0].length;
    return out;
  };

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);
    return this.engine.callSingle(
      { path: "/v1/embeddings", buildBody: this.buildBody as (input: unknown) => unknown },
      text,
      (j) => this.parseSingle(j),
      { signal: opts?.signal },
    );
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    this.log?.debug("embedBatch()", { count: texts.length }, opts?.requestId);

    const size = this.info.maxBatchSize ?? texts.length;
    if (size < texts.length) {
      const chunks: string[][] = [];
      for (let i = 0; i < texts.length; i += size) {
        chunks.push(texts.slice(i, i + size));
      }
      const parts = await Promise.all(
        chunks.map((c) =>
          this.engine.callSingle(
            { path: "/v1/embeddings", buildBody: this.buildBody as (input: unknown) => unknown },
            c,
            (j) => this.parseBatch(j),
            {
              signal: opts?.signal,
            },
          ),
        ),
      );
      return parts.flat() as Float32Array[];
    }

    try {
      return await this.engine.callSingle(
        { path: "/v1/embeddings", buildBody: this.buildBody as (input: unknown) => unknown },
        texts,
        (j) => this.parseBatch(j),
        { signal: opts?.signal },
      );
    } catch {
      return this.engine.callBatch(
        { path: "/v1/embeddings", buildBody: this.buildBody as (input: unknown) => unknown },
        texts,
        (j) => this.parseSingle(j),
        { signal: opts?.signal },
      );
    }
  }

  async close(): Promise<void> {}
}
