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
type LenmlTokenizer = (
  texts: string | string[],
  opts: {
    padding: boolean;
    truncation: boolean;
    max_length: number;
    return_tensor: false;
  },
) => {
  input_ids: number[][];
  attention_mask: number[][];
  token_type_ids?: number[][] | undefined;
};

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
    this.maxBatchSize = opts.maxBatchSize ?? 128;
    this.maxSeqLen = opts.maxSeqLen ?? 256;

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

  // Pre-allocated buffers for inference (reused across batches, like Zig ring buffer)
  private bufInputIds: Int32Array | null = null;
  private bufAttentionMask: Int32Array | null = null;
  private bufCapacity = 0;

  private ensureBuffers(flatSize: number): { inputIds: Int32Array; attentionMask: Int32Array } {
    if (this.bufCapacity < flatSize) {
      // Grow with 2x headroom to avoid frequent reallocation
      const cap = Math.max(flatSize, this.bufCapacity * 2, 8192);
      this.bufInputIds = new Int32Array(cap);
      this.bufAttentionMask = new Int32Array(cap);
      this.bufCapacity = cap;
    }
    return { inputIds: this.bufInputIds!, attentionMask: this.bufAttentionMask! };
  }

  async embedBatch(texts: string[], _opts?: EmbedOptions): Promise<Float32Array[]> {
    if (!this.initialized) await this.initialize();
    if (!this.tokenizer) throw new Error("MLX: tokenizer not loaded");

    // Batch tokenize all texts at once (no padding — we pad per-bucket below)
    const enc = this.tokenizer(texts, {
      padding: false,
      truncation: true,
      max_length: this.maxSeqLen,
      return_tensor: false,
    });

    // Build sorted index by token length (Zig BucketQueue style)
    const n = texts.length;
    const lengths = new Uint16Array(n);
    const indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      lengths[i] = enc.input_ids[i]!.length;
      indices[i] = i;
    }
    // Sort indices by token length (ascending — short texts together)
    indices.sort((a, b) => lengths[a]! - lengths[b]!);

    // Process in batches with dynamic padding
    const dim = mlxNative.getDimension() || this.info.dimension || 384;
    const results = new Array<Float32Array>(n);

    for (let i = 0; i < n; i += this.maxBatchSize) {
      const end = Math.min(i + this.maxBatchSize, n);
      const batchSize = end - i;

      // Dynamic padding: pad to longest in THIS batch (sorted → last is longest)
      const seqLen = lengths[indices[end - 1]!]!;
      const flatSize = batchSize * seqLen;

      // Reuse pre-allocated buffers
      const bufs = this.ensureBuffers(flatSize);
      bufs.inputIds.fill(0, 0, flatSize);
      bufs.attentionMask.fill(0, 0, flatSize);

      for (let b = 0; b < batchSize; b++) {
        const origIdx = indices[i + b]!;
        const ids = enc.input_ids[origIdx]!;
        const mask = enc.attention_mask[origIdx]!;
        const offset = b * seqLen;
        const copyLen = ids.length; // always <= seqLen (sorted)
        for (let s = 0; s < copyLen; s++) {
          bufs.inputIds[offset + s] = ids[s]!;
          bufs.attentionMask[offset + s] = mask[s]!;
        }
      }

      // MLX inference — pass subarray view (no copy)
      const idsSlice = new Int32Array(bufs.inputIds.buffer, 0, flatSize);
      const maskSlice = new Int32Array(bufs.attentionMask.buffer, 0, flatSize);
      const output = mlxNative.embed(idsSlice, maskSlice, batchSize, seqLen);
      if (!output) throw new Error("MLX: inference failed");

      // Copy results directly to output array (correct order)
      for (let b = 0; b < batchSize; b++) {
        const origIdx = indices[i + b]!;
        results[origIdx] = new Float32Array(output.buffer.slice(b * dim * 4, (b + 1) * dim * 4));
      }
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
      if (!configResp.ok)
        throw new Error(`Failed to download tokenizer_config.json for ${hfRepo}: ${configResp.status}`);

      tokenizerJson = (await jsonResp.json()) as object;
      tokenizerConfig = (await configResp.json()) as object;
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
