import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";
import { HttpEngine } from "./http-engine.js";

/**
 * CloudRU API response types
 */
interface CloudRUEmbeddingData {
  embedding: number[];
  index?: number;
}

interface CloudRUResponse {
  data?: CloudRUEmbeddingData[];
  embedding?: number[] | number[][];
  error?: unknown;
}

export interface CloudRUOptions {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  model: string;
  timeoutMs?: number | undefined;
  concurrency?: number | undefined;
  maxBatchSize?: number | undefined;
  logger?: ProviderLogger;
}

export class CloudRUProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private engine: HttpEngine;
  private opts: CloudRUOptions;
  private log?: ProviderLogger | undefined;

  constructor(opts: CloudRUOptions) {
    this.opts = { baseUrl: "https://foundation-models.api.cloud.ru", ...opts };
    this.log = opts.logger;

    this.info = {
      name: "cloudru",
      model: opts.model,
      supportsBatch: true,
      maxBatchSize: opts.maxBatchSize,
      maxTokens: 512, // Default for CloudRU models
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.opts.apiKey) headers["Authorization"] = `Bearer ${this.opts.apiKey}`;

    this.engine = new HttpEngine({
      baseUrl: this.opts.baseUrl ?? "https://foundation-models.api.cloud.ru",
      timeoutMs: this.opts.timeoutMs ?? 10000,
      concurrency: this.opts.concurrency ?? 4,
      defaultHeaders: headers,
    });
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.info.model,
      baseUrl: this.opts.baseUrl,
      apiKey: !!this.opts.apiKey,
    });
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  private buildBody = (input: string | string[]) => ({ model: this.info.model, input });

  private parseSingle(json: unknown): Float32Array {
    const response = json as CloudRUResponse;
    if (Array.isArray(response?.data) && Array.isArray(response.data[0]?.embedding)) {
      const arr = new Float32Array(response.data[0].embedding);
      this.info.dimension = this.info.dimension ?? arr.length;
      return arr;
    }
    if (Array.isArray(response?.embedding)) {
      const arr = new Float32Array(response.embedding as number[]);
      this.info.dimension = this.info.dimension ?? arr.length;
      return arr;
    }
    if (response?.error) throw new Error(`CloudRU error: ${JSON.stringify(response.error)}`);
    throw new Error(`CloudRU invalid embedding response`);
  }

  private parseBatch(json: unknown): Float32Array[] {
    const response = json as CloudRUResponse;
    if (Array.isArray(response?.data)) {
      const out = response.data.map((d) => new Float32Array(d.embedding));
      if (!this.info.dimension && out[0]) this.info.dimension = out[0].length;
      return out;
    }
    if (Array.isArray(response?.embedding) && Array.isArray(response.embedding[0])) {
      const out = (response.embedding as number[][]).map((e) => new Float32Array(e));
      if (!this.info.dimension && out[0]) this.info.dimension = out[0].length;
      return out;
    }
    throw new Error("CloudRU invalid batch embedding response");
  }

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
