/**
 * MLX Native Embedding Provider
 *
 * Direct Metal GPU inference via libmlx_embed.dylib (Bun FFI).
 * No Python, no HTTP — same engine as ultracode.zig.
 *
 * Tokenization via @lenml/tokenizers (same as OVMS provider).
 */

import * as mlxNative from "../mlx-native.js";
import type { EmbeddingProvider, EmbedOptions, ProviderCapabilities, ProviderInfo, ProviderLogger } from "./base.js";

export interface MlxProviderOptions {
  model: string;
  modelDir: string;
  maxBatchSize?: number | undefined;
  maxSeqLen?: number | undefined;
  logger?: ProviderLogger | undefined;
}

// Tokenizer interface (subset of @lenml/tokenizers PreTrainedTokenizer)
interface LenmlTokenizer {
  (texts: string | string[], opts: {
    padding: boolean;
    truncation: boolean;
    max_length: number;
    return_tensor: false;
  }): {
    input_ids: number[][];
    attention_mask: number[][];
    token_type_ids?: number[][] | undefined;
  };
}

// Cache for tokenizer JSON to avoid re-fetching
const tokenizerJsonCache = new Map<string, { json: object; config: object }>();

export class MlxProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private modelDir: string;
  private maxBatchSize: number;
  private maxSeqLen: number;
  private log?: ProviderLogger | undefined;
  private tokenizer: LenmlTokenizer | null = null;
  private initialized = false;

  constructor(opts: MlxProviderOptions) {
    this.log = opts.logger;
    this.modelDir = opts.modelDir;
    this.maxBatchSize = opts.maxBatchSize ?? 64;
    this.maxSeqLen = opts.maxSeqLen ?? 512;

    this.info = {
      name: "mlx",
      model: opts.model,
      supportsBatch: true,
      maxBatchSize: this.maxBatchSize,
      maxTokens: this.maxSeqLen,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load MLX native runtime
    const loaded = mlxNative.loadModel({
      modelDir: this.modelDir,
      maxBatch: this.maxBatchSize,
      maxSeq: this.maxSeqLen,
    });

    if (!loaded) {
      throw new Error(`MLX: failed to load model from ${this.modelDir}`);
    }

    const dim = mlxNative.getDimension();
    this.info.dimension = dim;
    this.log?.info("MLX native loaded", { model: this.info.model, dim, dir: this.modelDir });

    // Load tokenizer
    await this.loadTokenizer();
    this.initialized = true;
  }

  getDimension(): number | undefined {
    return this.info.dimension || mlxNative.getDimension() || undefined;
  }

  async embed(text: string, _opts?: EmbedOptions): Promise<Float32Array> {
    if (!this.initialized) await this.initialize();
    const results = await this.embedBatch([text]);
    return results[0]!;
  }

  async embedBatch(texts: string[], _opts?: EmbedOptions): Promise<Float32Array[]> {
    if (!this.initialized) await this.initialize();
    if (!this.tokenizer) throw new Error("MLX: tokenizer not loaded");

    const results: Float32Array[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const batchResults = this.inferBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private inferBatch(texts: string[]): Float32Array[] {
    if (!this.tokenizer) throw new Error("MLX: tokenizer not loaded");

    // Tokenize
    const encoded = this.tokenizer(texts, {
      padding: true,
      truncation: true,
      max_length: this.maxSeqLen,
      return_tensor: false,
    });

    const batchSize = texts.length;
    const firstRow = encoded.input_ids[0];
    if (!firstRow) throw new Error("MLX: tokenization returned empty result");
    const seqLen = firstRow.length;

    // Flatten to Int32Array
    const inputIds = new Int32Array(batchSize * seqLen);
    const attentionMask = new Int32Array(batchSize * seqLen);

    for (let b = 0; b < batchSize; b++) {
      const ids = encoded.input_ids[b]!;
      const mask = encoded.attention_mask[b]!;
      for (let s = 0; s < seqLen; s++) {
        inputIds[b * seqLen + s] = ids[s]!;
        attentionMask[b * seqLen + s] = mask[s]!;
      }
    }

    // Run MLX inference
    const output = mlxNative.embed(inputIds, attentionMask, batchSize, seqLen);
    if (!output) throw new Error("MLX: inference failed");

    // Split output into per-text embeddings
    const dim = mlxNative.getDimension() || this.info.dimension || 384;
    const results: Float32Array[] = [];
    for (let b = 0; b < batchSize; b++) {
      results.push(new Float32Array(output.buffer, b * dim * 4, dim));
    }

    return results;
  }

  async close(): Promise<void> {
    mlxNative.unload();
    this.initialized = false;
  }

  getCapabilities(): ProviderCapabilities {
    return { embeddings: true, rerank: false, score: false, classify: false };
  }

  // ═══════════════════════════════════════════════════════════════
  // Tokenizer loading (same approach as OVMS provider)
  // ═══════════════════════════════════════════════════════════════

  private async loadTokenizer(): Promise<void> {
    const modelId = this.info.model;

    // Map short model IDs to HuggingFace repos
    const hfModelMap: Record<string, string> = {
      "multilingual-e5-small": "intfloat/multilingual-e5-small",
      "multilingual-e5-base": "intfloat/multilingual-e5-base",
      "snowflake-arctic-embed-xs": "Snowflake/snowflake-arctic-embed-xs",
      "all-MiniLM-L6-v2": "sentence-transformers/all-MiniLM-L6-v2",
      "nomic-embed-text-v1.5": "nomic-ai/nomic-embed-text-v1.5",
      "gte-modernbert-base": "Alibaba-NLP/gte-modernbert-base",
      "modernbert-embed-base": "nomic-ai/modernbert-embed-base",
      "mxbai-embed-xsmall-v1": "mixedbread-ai/mxbai-embed-xsmall-v1",
      "bge-m3": "BAAI/bge-m3",
    };

    const hfRepo = hfModelMap[modelId] || modelId;
    this.log?.info("Loading tokenizer", { model: hfRepo });

    let tokenizerJson: object;
    let tokenizerConfig: object;

    const cached = tokenizerJsonCache.get(hfRepo);
    if (cached) {
      tokenizerJson = cached.json;
      tokenizerConfig = cached.config;
    } else {
      // Download tokenizer.json and tokenizer_config.json from HuggingFace
      const baseUrl = `https://huggingface.co/${hfRepo}/resolve/main`;

      const [jsonResp, configResp] = await Promise.all([
        fetch(`${baseUrl}/tokenizer.json`),
        fetch(`${baseUrl}/tokenizer_config.json`),
      ]);

      if (!jsonResp.ok) throw new Error(`Failed to download tokenizer.json for ${hfRepo}: ${jsonResp.status}`);
      if (!configResp.ok) throw new Error(`Failed to download tokenizer_config.json for ${hfRepo}: ${configResp.status}`);

      tokenizerJson = await jsonResp.json() as object;
      tokenizerConfig = await configResp.json() as object;
      tokenizerJsonCache.set(hfRepo, { json: tokenizerJson, config: tokenizerConfig });
    }

    // Load tokenizer via @lenml/tokenizers
    const lenml = await import("@lenml/tokenizers");
    const TokenizerLoaderClass = lenml.TokenizerLoader;
    if (!TokenizerLoaderClass) throw new Error("TokenizerLoader not found in @lenml/tokenizers");

    const tokenizer = TokenizerLoaderClass.fromPreTrained({
      tokenizerJSON: tokenizerJson,
      tokenizerConfig: tokenizerConfig,
    });

    this.tokenizer = tokenizer as unknown as LenmlTokenizer;
    this.log?.info("Tokenizer loaded", { model: hfRepo });
  }
}
