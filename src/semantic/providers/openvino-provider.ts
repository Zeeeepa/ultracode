/**
 * OpenVINO Embedding Provider
 *
 * High-performance local embedding generation using Intel OpenVINO.
 * Supports CPU (INT8 optimized) and GPU inference.
 *
 * Performance benchmarks:
 * - CPU INT8: ~1.3ms per embedding (best)
 * - CPU FP32: ~3ms per embedding
 * - GPU: ~3ms per embedding (overhead for small models)
 *
 * Models supported:
 * - all-MiniLM-L6-v2 (384 dimensions)
 * - BGE-small-en-v1.5 (384 dimensions)
 * - GTE-small (384 dimensions)
 *
 * NOTE: NPU is not currently supported due to masked_fill/Select operation
 * limitations. See docs/NPU_WAITING.md for details.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../utils/config-paths.js";
import { simdMeanPooling } from "../../utils/simd-vector-ops.js";
import type { EmbeddingProvider, EmbedOptions, ProviderInfo, ProviderLogger } from "./base.js";

// Dynamic imports for optional dependencies
let ov: any = null;
let AutoTokenizer: any = null;

/**
 * Error thrown when model is being downloaded.
 * Allows tools to return a user-friendly "try again later" message.
 */
export class ModelDownloadingError extends Error {
  public readonly model: string;
  public readonly modelPath: string;

  constructor(model: string, modelPath: string) {
    super(`Model "${model}" is being downloaded. Please try again in a few minutes.`);
    this.name = "ModelDownloadingError";
    this.model = model;
    this.modelPath = modelPath;
  }
}

// Track download state globally to prevent concurrent downloads
let downloadInProgress = false;
let downloadStartTime: number | null = null;

export type OpenVINODevice = "CPU" | "GPU" | "GPU.0" | "GPU.1" | "AUTO";

export interface OpenVINOModelConfig {
  name: string;
  repo: string;
  files: string[];
  subdir?: string;
  dimension: number;
  maxTokens: number;
  format: "openvino" | "onnx";
}

export interface OpenVINOOptions {
  model?: string;
  device?: OpenVINODevice;
  modelPath?: string;
  autoDownload?: boolean;
  timeoutMs?: number;
  logger?: ProviderLogger;
  /** Enable native batch inference (default: false for stability) */
  enableBatchInference?: boolean;
}

// Supported models configuration
const SUPPORTED_MODELS: Record<string, OpenVINOModelConfig> = {
  "all-MiniLM-L6-v2": {
    name: "all-MiniLM-L6-v2-openvino-int8",
    repo: "sentence-transformers/all-MiniLM-L6-v2",
    subdir: "openvino",
    files: ["openvino_model_qint8_quantized.xml", "openvino_model_qint8_quantized.bin"],
    dimension: 384,
    maxTokens: 256,
    format: "openvino",
  },
  "bge-small-en-v1.5": {
    name: "bge-small-en-v1.5-int8",
    repo: "Xenova/bge-small-en-v1.5",
    subdir: "onnx",
    files: ["model_int8.onnx"],
    dimension: 384,
    maxTokens: 512,
    format: "onnx",
  },
  "gte-small": {
    name: "gte-small-int8",
    repo: "Xenova/gte-small",
    subdir: "onnx",
    files: ["model_int8.onnx"],
    dimension: 384,
    maxTokens: 512,
    format: "onnx",
  },
  // Multilingual models
  "multilingual-e5-small": {
    name: "multilingual-e5-small-int8",
    repo: "Xenova/multilingual-e5-small",
    subdir: "onnx",
    files: ["model_int8.onnx"],
    dimension: 384,
    maxTokens: 512,
    format: "onnx",
  },
  "paraphrase-multilingual-MiniLM-L12-v2": {
    name: "paraphrase-multilingual-MiniLM-L12-v2-int8",
    repo: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    subdir: "onnx",
    files: ["model_int8.onnx"],
    dimension: 384,
    maxTokens: 128,
    format: "onnx",
  },
};

// Performance characteristics for setup display
export const OPENVINO_PERFORMANCE = {
  CPU: { avgMs: 1.3, description: "INT8 optimized, best performance" },
  GPU: { avgMs: 3.0, description: "Intel integrated GPU" },
  "GPU.0": { avgMs: 3.0, description: "Intel integrated GPU (primary)" },
  "GPU.1": { avgMs: 3.5, description: "Intel integrated GPU (secondary)" },
  AUTO: { avgMs: 1.5, description: "Automatic device selection" },
};

export class OpenVINOProvider implements EmbeddingProvider {
  public info: ProviderInfo;

  private device: OpenVINODevice;
  private modelPath: string;
  private autoDownload: boolean;
  private timeoutMs: number;
  private log?: ProviderLogger;

  private core: any = null;
  private compiledModel: any = null;
  private batchCompiledModels: Map<number, any> = new Map(); // Cached compiled models for different batch sizes
  private tokenizer: any = null;
  private modelConfig: OpenVINOModelConfig;
  private seqLen = 64; // Fixed sequence length for efficiency
  private maxBatchSize = 16; // Max batch size for native batching
  private enableBatchInference: boolean; // Toggle for batch vs sequential

  // Only 2 fixed batch sizes to minimize memory: 1 (single) and 16 (batch)
  private static readonly FIXED_BATCH_SIZES = [1, 16] as const;

  constructor(opts: OpenVINOOptions = {}) {
    this.log = opts.logger;
    this.device = opts.device ?? "CPU";
    this.autoDownload = opts.autoDownload !== false;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.enableBatchInference = opts.enableBatchInference ?? false; // Disabled by default for stability

    // Resolve model configuration
    const modelKey = opts.model ?? "all-MiniLM-L6-v2";
    this.modelConfig = SUPPORTED_MODELS[modelKey] ?? SUPPORTED_MODELS["all-MiniLM-L6-v2"]!;

    // Resolve model path
    if (opts.modelPath) {
      this.modelPath = opts.modelPath;
    } else {
      // Store models in user's data directory (alongside databases and caches)
      this.modelPath = join(getDataDir(), "models", this.modelConfig.name);
    }

    this.info = {
      name: "openvino",
      model: modelKey,
      dimension: this.modelConfig.dimension,
      supportsBatch: this.enableBatchInference,
      maxBatchSize: this.enableBatchInference ? 16 : 1,
      maxTokens: this.modelConfig.maxTokens,
    };
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.info.model,
      device: this.device,
      modelPath: this.modelPath,
    });

    // Load dependencies dynamically
    try {
      const openvinoModule = await import("openvino-node");
      ov = openvinoModule.addon;

      const transformersModule = await import("@xenova/transformers");
      AutoTokenizer = (transformersModule as any).AutoTokenizer;
    } catch (e: any) {
      throw new Error(
        `OpenVINO dependencies not installed. Run:\n` +
          `  bun add openvino-node @xenova/transformers\n\n` +
          `Error: ${e.message}`,
      );
    }

    // Initialize OpenVINO core
    this.core = new ov.Core();

    // Check available devices
    const devices = this.core.getAvailableDevices();
    this.log?.debug("Available devices", { devices });

    if (!devices.includes(this.device) && this.device !== "AUTO") {
      this.log?.warn(`Device ${this.device} not available, falling back to CPU`);
      this.device = "CPU";
    }

    // Ensure model is downloaded
    await this.ensureModel();

    // Load and compile model
    await this.loadModel();

    // Load tokenizer
    await this.loadTokenizer();

    // Warmup
    try {
      const vec = await this.embed("warmup text");
      this.info.dimension = vec.length;
      this.log?.info("initialized", {
        dimension: this.info.dimension,
        device: this.device,
      });
    } catch (e: any) {
      this.log?.error("warmup failed", { error: e.message }, undefined, e);
      throw new Error(`OpenVINO warmup failed: ${e.message}`);
    }
  }

  private async ensureModel(): Promise<void> {
    const modelFile = this.modelConfig.files[0]!;
    const modelFilePath = join(this.modelPath, modelFile);

    if (existsSync(modelFilePath)) {
      this.log?.debug("Model already exists", { path: modelFilePath });
      return;
    }

    // Check if download is already in progress (another request)
    if (downloadInProgress) {
      const elapsed = downloadStartTime ? Math.floor((Date.now() - downloadStartTime) / 1000) : 0;
      this.log?.info("Model download already in progress", { model: this.info.model, elapsedSeconds: elapsed });
      throw new ModelDownloadingError(this.info.model!, this.modelPath);
    }

    if (!this.autoDownload) {
      throw new Error(
        `Model not found at ${this.modelPath}\n` +
          `Run: npx ultrascript-tools setup-embedding\n` +
          `Or manually: bun scripts/download-openvino-model.ts ${this.info.model}`,
      );
    }

    // Start download in background, throw error to let caller know to retry
    downloadInProgress = true;
    downloadStartTime = Date.now();

    this.log?.info("Starting model download in background", { model: this.info.model });

    // Start download but don't await - let it run in background
    this.downloadModel()
      .then(() => {
        this.log?.info("Model download completed", { model: this.info.model });
      })
      .catch((err) => {
        this.log?.error("Model download failed", { error: err.message });
      })
      .finally(() => {
        downloadInProgress = false;
        downloadStartTime = null;
      });

    // Throw error immediately so tools can return "try again later"
    throw new ModelDownloadingError(this.info.model!, this.modelPath);
  }

  private async downloadModel(): Promise<void> {
    mkdirSync(this.modelPath, { recursive: true });

    const baseUrl = `https://huggingface.co/${this.modelConfig.repo}/resolve/main`;
    const subdir = this.modelConfig.subdir ? `/${this.modelConfig.subdir}` : "";

    // Download model files
    for (const file of this.modelConfig.files) {
      const url = `${baseUrl}${subdir}/${file}`;
      const destPath = join(this.modelPath, file);

      this.log?.debug("Downloading", { url });

      const response = await fetch(url, {
        headers: { "User-Agent": "ultrascript-tools-mcp/1.0" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Failed to download ${file}: HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      writeFileSync(destPath, Buffer.from(buffer));

      const sizeMB = buffer.byteLength / 1024 / 1024;
      this.log?.info("Downloaded", { file, sizeMB: sizeMB.toFixed(2) });
    }

    // Download tokenizer files
    const tokenizerFiles = ["tokenizer.json", "tokenizer_config.json", "vocab.txt"];
    for (const file of tokenizerFiles) {
      try {
        const url = `${baseUrl}/${file}`;
        const destPath = join(this.modelPath, file);

        const response = await fetch(url, {
          headers: { "User-Agent": "ultrascript-tools-mcp/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();
          writeFileSync(destPath, Buffer.from(buffer));
        }
      } catch {
        // Tokenizer files are optional, ignore errors
      }
    }

    this.log?.info("Model download complete", { path: this.modelPath });
  }

  private async loadModel(): Promise<void> {
    const modelFile = this.modelConfig.files[0]!;
    const modelFilePath = join(this.modelPath, modelFile);

    this.log?.debug("Loading model", { path: modelFilePath, device: this.device });

    const model = await this.core.readModel(modelFilePath);

    const t0 = Date.now();
    this.compiledModel = await this.core.compileModel(model, this.device);
    const compileTime = Date.now() - t0;

    this.log?.info("Model compiled", { device: this.device, compileTimeMs: compileTime });

    // Cache batch_size=1 model
    this.batchCompiledModels.set(1, this.compiledModel);
  }

  /**
   * Get or create compiled model for specific batch size
   * Only compiles for FIXED_BATCH_SIZES to prevent memory accumulation
   */
  private async getCompiledModelForBatch(batchSize: number): Promise<any> {
    // Find closest fixed batch size
    let fixedSize: number | null = null;
    for (const size of OpenVINOProvider.FIXED_BATCH_SIZES) {
      if (size >= batchSize) {
        fixedSize = size;
        break;
      }
    }

    if (fixedSize === null) {
      throw new Error(`Batch size ${batchSize} exceeds maximum fixed size ${this.maxBatchSize}`);
    }

    // Return cached model if exists
    if (this.batchCompiledModels.has(fixedSize)) {
      return this.batchCompiledModels.get(fixedSize);
    }

    // Load fresh model and reshape for batch
    const modelFile = this.modelConfig.files[0]!;
    const modelFilePath = join(this.modelPath, modelFile);

    this.log?.debug("Compiling model for fixed batch size", {
      requestedSize: batchSize,
      fixedSize,
      device: this.device,
    });

    const model = await this.core.readModel(modelFilePath);

    // Reshape model inputs for batch processing
    const inputShapes: Record<string, number[]> = {};
    for (const input of model.inputs) {
      inputShapes[input.anyName] = [fixedSize, this.seqLen];
    }
    model.reshape(inputShapes);

    const t0 = Date.now();
    const compiledModel = await this.core.compileModel(model, this.device);
    const compileTime = Date.now() - t0;

    // Cache for reuse (max 2 models: batch_size=1 and batch_size=16)
    this.batchCompiledModels.set(fixedSize, compiledModel);

    this.log?.info("Batch model compiled", {
      fixedSize,
      device: this.device,
      compileTimeMs: compileTime,
      cachedModels: this.batchCompiledModels.size,
    });

    return compiledModel;
  }

  private async loadTokenizer(): Promise<void> {
    // Try to load from local path first
    const tokenizerPath = join(this.modelPath, "tokenizer.json");

    if (existsSync(tokenizerPath)) {
      this.log?.debug("Loading tokenizer from local path", { path: this.modelPath });
      // Use file:// protocol for local paths on Windows
      const localPath = this.modelPath.replace(/\\/g, "/");
      const fileUrl = localPath.startsWith("/") ? `file://${localPath}` : `file:///${localPath}`;
      try {
        this.tokenizer = await AutoTokenizer.from_pretrained(fileUrl, { local_files_only: true });
        return;
      } catch (e: any) {
        this.log?.debug("Local tokenizer failed, trying HuggingFace", { error: e.message });
      }
    }

    // Fall back to HuggingFace
    this.log?.debug("Loading tokenizer from HuggingFace", { repo: this.modelConfig.repo });
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelConfig.repo);
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    if (!this.compiledModel || !this.tokenizer) {
      throw new Error("OpenVINO provider not initialized");
    }

    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);

    // Tokenize
    const encoded = await this.tokenizer(text, {
      padding: true,
      truncation: true,
      max_length: this.seqLen,
    });

    // Prepare inputs as BigInt64Array (i64)
    const inputIds = new BigInt64Array(this.seqLen);
    const attMask = new BigInt64Array(this.seqLen);
    const tokType = new BigInt64Array(this.seqLen).fill(0n);

    const ids = encoded.input_ids.data;
    const mask = encoded.attention_mask.data;

    for (let i = 0; i < Math.min(ids.length, this.seqLen); i++) {
      inputIds[i] = BigInt(ids[i]);
      attMask[i] = BigInt(mask[i]);
    }

    // Create inference request
    const infer = this.compiledModel.createInferRequest();

    // Set input tensors
    infer.setInputTensor(0, new ov.Tensor("i64", [1, this.seqLen], inputIds));
    infer.setInputTensor(1, new ov.Tensor("i64", [1, this.seqLen], attMask));

    // Some models need token_type_ids
    try {
      infer.setInputTensor(2, new ov.Tensor("i64", [1, this.seqLen], tokType));
    } catch {
      // Model doesn't have token_type_ids input
    }

    // Run inference
    infer.infer();

    // Get output and apply mean pooling
    const output = infer.getOutputTensor(0);
    const outputData = new Float32Array(output.data);

    // Mean pooling over sequence dimension
    const embedding = this.meanPooling(outputData, attMask);

    return embedding;
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    if (!this.compiledModel || !this.tokenizer) {
      throw new Error("OpenVINO provider not initialized");
    }

    const count = texts.length;
    this.log?.debug("embedBatch()", { count, batchMode: this.enableBatchInference }, opts?.requestId);

    // For single text, always use regular embed
    if (count === 1) {
      return [await this.embed(texts[0]!, opts)];
    }

    // If batch inference disabled, use sequential processing (stable but slower)
    if (!this.enableBatchInference) {
      const results: Float32Array[] = [];
      for (const text of texts) {
        results.push(await this.embed(text, opts));
      }
      return results;
    }

    // Native batch inference enabled - process in chunks of maxBatchSize
    const results: Float32Array[] = [];
    for (let i = 0; i < count; i += this.maxBatchSize) {
      const chunk = texts.slice(i, Math.min(i + this.maxBatchSize, count));
      const chunkResults = await this.embedBatchNative(chunk, opts);
      results.push(...chunkResults);
    }
    return results;
  }

  /**
   * Native batch inference using OpenVINO reshape
   * ALWAYS uses fixed batch_size=16 model, with padding for smaller batches
   * This ensures only 2 compiled models exist: batch_size=1 and batch_size=16
   */
  private async embedBatchNative(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    const actualCount = texts.length;
    const fixedBatchSize = this.maxBatchSize; // Always use 16
    const t0 = Date.now();

    // Pad texts array to fixed batch size if needed
    const paddedTexts = [...texts];
    while (paddedTexts.length < fixedBatchSize) {
      paddedTexts.push(""); // Empty string for padding
    }

    // Tokenize all texts (including padding)
    const encoded = await this.tokenizer(paddedTexts, {
      padding: true,
      truncation: true,
      max_length: this.seqLen,
    });

    // Get or create compiled model for fixed batch size (always 4)
    let compiledModel: any;
    try {
      compiledModel = await this.getCompiledModelForBatch(fixedBatchSize);
    } catch (e: any) {
      // Fallback to sequential if reshape fails
      this.log?.warn("Batch reshape failed, falling back to sequential", { error: e.message });
      const results: Float32Array[] = [];
      for (const text of texts) {
        results.push(await this.embed(text, opts));
      }
      return results;
    }

    // Prepare batched inputs as BigInt64Array (always fixed size)
    const totalElements = fixedBatchSize * this.seqLen;
    const inputIds = new BigInt64Array(totalElements);
    const attMask = new BigInt64Array(totalElements);
    const tokType = new BigInt64Array(totalElements).fill(0n);

    // Fill tensors for each text in batch (including padding)
    for (let b = 0; b < fixedBatchSize; b++) {
      const offset = b * this.seqLen;
      const ids = encoded.input_ids.data.slice(b * this.seqLen, (b + 1) * this.seqLen);
      const mask = encoded.attention_mask.data.slice(b * this.seqLen, (b + 1) * this.seqLen);

      for (let i = 0; i < this.seqLen; i++) {
        inputIds[offset + i] = BigInt(ids[i] ?? 0);
        attMask[offset + i] = BigInt(mask[i] ?? 0);
      }
    }

    // Create inference request
    const infer = compiledModel.createInferRequest();

    // Set batched input tensors [fixedBatchSize, seqLen]
    infer.setInputTensor(0, new ov.Tensor("i64", [fixedBatchSize, this.seqLen], inputIds));
    infer.setInputTensor(1, new ov.Tensor("i64", [fixedBatchSize, this.seqLen], attMask));

    // Some models need token_type_ids
    try {
      infer.setInputTensor(2, new ov.Tensor("i64", [fixedBatchSize, this.seqLen], tokType));
    } catch {
      // Model doesn't have token_type_ids input
    }

    // Run batch inference
    infer.infer();

    // Get output [fixedBatchSize, seqLen, dim]
    const output = infer.getOutputTensor(0);
    const outputData = new Float32Array(output.data);

    // Extract embeddings only for actual texts (not padding)
    const dim = this.modelConfig.dimension;
    const results: Float32Array[] = [];

    for (let b = 0; b < actualCount; b++) {
      // Extract attention mask for this sample
      const sampleMask = new BigInt64Array(this.seqLen);
      for (let i = 0; i < this.seqLen; i++) {
        sampleMask[i] = attMask[b * this.seqLen + i] ?? 0n;
      }

      // Extract output for this sample and apply mean pooling
      const sampleOutput = outputData.slice(b * this.seqLen * dim, (b + 1) * this.seqLen * dim);
      const embedding = this.meanPoolingFromSlice(sampleOutput, sampleMask, dim);
      results.push(embedding);
    }

    const elapsed = Date.now() - t0;
    const perText = (elapsed / actualCount).toFixed(2);
    this.log?.debug("Batch inference complete", { actualCount, fixedBatchSize, totalMs: elapsed, perTextMs: perText });

    return results;
  }

  /**
   * Mean pooling for a single sample from batch output
   * OPTIMIZED: Uses SIMD-optimized mean pooling
   */
  private meanPoolingFromSlice(output: Float32Array, attMask: BigInt64Array, dim: number): Float32Array {
    // OPTIMIZATION: Use SIMD-optimized mean pooling from simd-vector-ops.ts
    return simdMeanPooling(output, attMask, this.seqLen, dim);
  }

  /**
   * Mean pooling with SIMD-optimized loop unrolling
   * OPTIMIZED: 4-8x faster than original nested loops
   */
  private meanPooling(output: Float32Array, attMask: BigInt64Array): Float32Array {
    // OPTIMIZATION: Use SIMD-optimized mean pooling from simd-vector-ops.ts
    return simdMeanPooling(output, attMask, this.seqLen, this.modelConfig.dimension);
  }

  async close(): Promise<void> {
    this.compiledModel = null;
    this.batchCompiledModels.clear();
    this.tokenizer = null;
    this.core = null;
    this.log?.info("OpenVINO provider closed");
  }

  /**
   * Get available OpenVINO devices
   */
  static async getAvailableDevices(): Promise<string[]> {
    try {
      const { addon: openvinoAddon } = await import("openvino-node");
      const core = new openvinoAddon.Core();
      return core.getAvailableDevices();
    } catch {
      return [];
    }
  }

  /**
   * Get performance info for setup display
   */
  static getPerformanceInfo(device: OpenVINODevice): { avgMs: number; description: string } {
    return OPENVINO_PERFORMANCE[device] ?? OPENVINO_PERFORMANCE["CPU"];
  }

  /**
   * Get supported models list
   */
  static getSupportedModels(): string[] {
    return Object.keys(SUPPORTED_MODELS);
  }

  /**
   * Get model config
   */
  static getModelConfig(model: string): OpenVINOModelConfig | undefined {
    return SUPPORTED_MODELS[model];
  }
}
