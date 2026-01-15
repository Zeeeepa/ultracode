import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";

/**
 * Basic typing for @xenova/transformers pipeline
 */
interface TransformersPipeline {
  (
    text: string | string[],
    options?: { pooling?: string; normalize?: boolean },
  ): Promise<{
    data?: Float32Array;
    [key: string]: unknown;
  }>;
  dispose?: () => void;
}

/**
 * @xenova/transformers module interface
 */
interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: { quantized?: boolean; progress_callback?: unknown; local_files_only?: boolean },
  ) => Promise<TransformersPipeline>;
  [key: string]: unknown;
}

export interface TransformersOptions {
  model: string; //'Xenova/all-MiniLM-L6-v2'
  quantized?: boolean;
  localPath?: string;
  logger?: ProviderLogger;
}

export class TransformersProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private pipeline: TransformersPipeline | null = null;
  private log?: ProviderLogger | undefined;

  constructor(private opts: TransformersOptions) {
    this.log = opts.logger;
    // Most transformer models have 512 token limit
    // e5-* models may have different limits
    const maxTokens = opts.model.includes("e5-large") ? 512 : 512;

    this.info = {
      name: "transformers",
      model: opts.model,
      supportsBatch: true,
      maxTokens,
    };
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.opts.model,
      quantized: this.opts.quantized,
      localPath: this.opts.localPath,
    });

    const mod = (await import("@xenova/transformers")) as TransformersModule;

    this.pipeline = await mod.pipeline("feature-extraction", this.opts.model, {
      quantized: this.opts.quantized !== false,
      progress_callback: undefined,
      local_files_only: !!this.opts.localPath,
    });

    const out = await this.pipeline("warm up", { pooling: "mean", normalize: true });
    this.info.dimension = out?.data?.length ?? this.info.dimension;

    this.log?.info("initialized", { dimension: this.info.dimension });
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);

    if (!this.pipeline) await this.initialize();
    const out = await this.pipeline?.(text, { pooling: "mean", normalize: true });
    if (!out || !out.data) throw new Error("Pipeline failed to generate embedding");
    const arr = new Float32Array(out.data);
    this.info.dimension = this.info.dimension ?? arr.length;
    return arr;
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    this.log?.debug("embedBatch()", { count: texts.length }, opts?.requestId);

    if (!this.pipeline) await this.initialize();
    const outs = await Promise.all(texts.map((t) => this.pipeline?.(t, { pooling: "mean", normalize: true })));
    return outs.map((o) => {
      if (!o || !o.data) throw new Error("Pipeline failed to generate embedding");
      return new Float32Array(o.data);
    });
  }

  async close(): Promise<void> {
    try {
      this.pipeline?.dispose?.();
    } catch {}
    this.pipeline = null;
  }
}
