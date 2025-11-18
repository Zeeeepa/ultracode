import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";

export interface HuggingFaceOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  concurrency?: number;
  warmupText?: string;
  logger?: ProviderLogger;
}

export class HuggingFaceProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private concurrency: number;
  private warmupText: string;
  private log?: ProviderLogger;
  private client: any; // InferenceClient from @huggingface/inference

  constructor(opts: HuggingFaceOptions) {
    this.log = opts.logger;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api-inference.huggingface.co";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.concurrency = Math.max(1, opts.concurrency ?? 4);
    this.warmupText = opts.warmupText ?? "warmup text";

    this.info = {
      name: "huggingface",
      model: opts.model,
      supportsBatch: false,
    };
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.info.model,
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      concurrency: this.concurrency,
    });

    try {
      // Динамическая загрузка @huggingface/inference
      const { HfInference } = await import("@huggingface/inference");
      this.client = new HfInference(this.apiKey);
    } catch (error: any) {
      const errorMessage =
        `Failed to load @huggingface/inference: ${error.message}\n` +
        `To use Hugging Face embeddings, install: npm install @huggingface/inference`;
      this.log?.error("initialize failed", { error: errorMessage }, undefined, error);
      throw new Error(errorMessage);
    }

    // Warmup call для определения размерности
    try {
      const vec = await this.embed(this.warmupText);
      this.info.dimension = vec.length;
      this.log?.info("initialized", { dimension: this.info.dimension });
    } catch (e: any) {
      this.log?.error("warmup failed", { error: e.message }, undefined, e);
      throw new Error(`HuggingFace warmup failed: ${e.message}`);
    }
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);

    if (!this.client) {
      throw new Error("HuggingFaceProvider not initialized");
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        // Используем featureExtraction для получения эмбеддингов
        const result = await this.client.featureExtraction({
          model: this.info.model,
          inputs: text,
        });

        // Результат может быть массивом или вложенным массивом
        let embedding: number[];
        if (Array.isArray(result)) {
          // Если вернулся массив массивов (batch), берем первый
          embedding = Array.isArray(result[0]) ? result[0] : result;
        } else {
          throw new Error("Unexpected featureExtraction response format");
        }

        const arr = new Float32Array(embedding);
        this.info.dimension = this.info.dimension ?? arr.length;
        return arr;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      this.log?.error("embed failed", { error: error.message }, opts?.requestId, error);

      // Проверяем специфичные ошибки HF API
      if (error.message?.includes("rate limit")) {
        throw new Error(`HuggingFace rate limit exceeded. Consider using a paid API key or retry later.`);
      }
      if (error.message?.includes("model") && error.message?.includes("not found")) {
        throw new Error(`HuggingFace model "${this.info.model}" not found. Check model name.`);
      }
      if (error.message?.includes("authorization")) {
        throw new Error(`HuggingFace API key is invalid or missing.`);
      }

      throw new Error(`HuggingFace embed error: ${error.message}`);
    }
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    this.log?.debug("embedBatch()", { count: texts.length }, opts?.requestId);

    // Используем p-limit для контроля конкурентности
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(this.concurrency);
    return Promise.all(texts.map((t) => limit(() => this.embed(t, opts))));
  }
}
