import { toError } from "../../utils/error-handling.js";
import { stringify } from "../../utils/fast-json.js";
import type { EmbeddingProvider, EmbedOptions, ProviderCapabilities, ProviderInfo, ProviderLogger } from "./base.js";
import { ensureContainerRunning, waitForReady } from "./ovms-container.js";
import { OVMSGrpcClient } from "./ovms-grpc-client.js";
import { GPU_WARMUP_TEXTS, getTokenizerModel, normalizeVector, sleep } from "./ovms-utils.js";

/**
 * Basic typing for @xenova/transformers tokenizer
 */
interface TokenizerOutput {
  input_ids:
    | {
        data: BigInt64Array | number[];
        dims?: number[];
        shape?: number[];
      }
    | number[][];
  attention_mask?:
    | {
        data: BigInt64Array | number[];
        dims?: number[];
        shape?: number[];
      }
    | number[][];
  token_type_ids?:
    | {
        data: BigInt64Array | number[];
        dims?: number[];
        shape?: number[];
      }
    | number[][];
}

interface TokenizerOptions {
  padding?: boolean;
  truncation?: boolean;
  max_length?: number;
  return_tensor?: boolean;
}

interface Tokenizer {
  (text: string | string[], options?: TokenizerOptions): Promise<TokenizerOutput>;
  from_pretrained?: (model: string, options?: { progress_callback?: unknown }) => Promise<Tokenizer>;
}

interface TokenizerConstructor {
  from_pretrained: (model: string, options?: { progress_callback?: unknown }) => Promise<Tokenizer>;
}

// Will be loaded dynamically
let TokenizerClass: TokenizerConstructor | null = null;

/**
 * OVMS API response types
 */
interface OVMSModelInfo {
  inputs?: Array<{ name: string; shape: number[]; datatype: string }>;
  outputs?: Array<{ name: string; shape: number[]; datatype: string }>;
}

interface OVMSInferRequest {
  inputs: Array<{
    name: string;
    shape: number[];
    datatype: string;
    data: number[];
  }>;
}

interface OVMSInferResponse {
  outputs: Array<{
    name: string;
    shape: number[];
    datatype: string;
    data: number[];
  }>;
}

interface OVMSEmbeddingData {
  embedding: number[];
  index: number;
  object: string;
}

interface OVMSEmbeddingResponse {
  data: OVMSEmbeddingData[];
  model: string;
  object: string;
}

export interface OVMSOptions {
  model: string;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  concurrency?: number | undefined;
  checkServer?: boolean;
  miniBatchSize?: number; // Internal batch size for OVMS server (default: 8)
  useEmbeddingsApi?: boolean; // Use /v3/embeddings OpenAI-compatible API (default: true)
  encodingFormat?: "float" | "base64"; // Response format for embeddings API (default: base64)
  /** Protocol: "rest" (HTTP/JSON) or "grpc" (binary protobuf). Default: "rest" */
  protocol?: "rest" | "grpc";
  /** gRPC port (default: 9000). Only used when protocol="grpc" */
  grpcPort?: number;
  /** Native mode: OVMS is managed by ovms-native-manager, not Docker. Skips Docker auto-start. */
  isNative?: boolean;
  /** Multi-device endpoints for round-robin load balancing. */
  endpoints?: string[];
  logger?: ProviderLogger;
}

/**
 * OpenVINO Model Server (OVMS) Provider
 *
 * Connects to OVMS Docker container for embedding generation.
 * Uses @xenova/transformers for tokenization and OVMS V2 infer API.
 *
 * OVMS provides stable, isolated inference without Bun runtime conflicts.
 *
 * Advantages:
 * - No timer/gc crashes in Bun
 * - Intel GPU/NPU support
 * - Large batch sizes (32-64+)
 * - Memory managed by OVMS
 *
 * Setup:
 * docker run -d --name ovms-embedding -p 8082:8080 \
 *   -v /models:/models \
 *   openvino/model_server:latest \
 *   --model_path /models/embeddings \
 *   --model_name embeddings \
 *   --port 9000 --rest_port 8080
 */
export class OVMSProvider implements EmbeddingProvider {
  public info: ProviderInfo;
  private baseUrl: string;
  private modelName: string;
  private modelId: string;
  private timeoutMs: number;
  private concurrency: number;
  private checkServer: boolean;
  private miniBatchSize: number;
  private useEmbeddingsApi: boolean;
  private encodingFormat: "float" | "base64";
  private protocol: "rest" | "grpc";
  private grpcPort: number;
  private grpcClient: OVMSGrpcClient | null = null;
  private log?: ProviderLogger | undefined;
  private tokenizer: Tokenizer | null = null;
  private isNative: boolean;
  private endpoints: string[];
  private endpointIndex: number = 0;

  // Buffer pool for Float32Array to reduce GC pressure
  private bufferPool: Float32Array[] = [];
  private readonly maxPoolSize = 100;

  constructor(opts: OVMSOptions) {
    this.log = opts.logger;
    this.baseUrl = opts.baseUrl ?? "http://127.0.0.1:8082";
    this.modelId = opts.model;
    this.modelName = "embeddings"; // OVMS model name (fixed in setup)
    // OVMS on CPU is slow (~30s per batch for large models like e5-base)
    // Default timeout must be much higher than batch time
    this.timeoutMs = opts.timeoutMs ?? 120_000; // 2 minutes
    this.concurrency = Math.max(1, opts.concurrency ?? 16); // High concurrency for GPU saturation
    this.checkServer = opts.checkServer !== false;
    // Mini-batch size: larger batches = better GPU utilization, less HTTP overhead
    // Default 64 for GPU, 32 for CPU
    this.miniBatchSize = opts.miniBatchSize ?? 64;
    // Use /v3/embeddings OpenAI-compatible API (returns pooled embeddings, smaller response)
    this.useEmbeddingsApi = opts.useEmbeddingsApi !== false;
    // base64 is ~33% smaller than JSON floats
    this.encodingFormat = opts.encodingFormat ?? "base64";
    // Protocol: rest (HTTP/JSON) or grpc (binary protobuf)
    this.protocol = opts.protocol ?? "rest";
    // gRPC port (OVMS default is 9000)
    this.grpcPort = opts.grpcPort ?? 9000;
    // Native mode: managed by ovms-native-manager, skip Docker auto-start
    this.isNative = opts.isNative ?? false;
    // Multi-device endpoints for round-robin (defaults to single "embeddings" model)
    this.endpoints = opts.endpoints ?? [this.modelName];

    this.info = {
      name: "ovms",
      model: opts.model,
      supportsBatch: true,
    };
  }

  async initialize(): Promise<void> {
    this.log?.info("initialize", {
      model: this.info.model,
      modelName: this.modelName,
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      concurrency: this.concurrency,
      useEmbeddingsApi: this.useEmbeddingsApi,
      encodingFormat: this.encodingFormat,
      protocol: this.protocol,
      grpcPort: this.grpcPort,
      endpoints: this.endpoints,
    });

    // Load tokenizer library
    if (!TokenizerClass) {
      try {
        const transformers = await import("@xenova/transformers");
        // Access AutoTokenizer from module (works with both ESM and CJS)
        const transformersExt = transformers as {
          AutoTokenizer?: TokenizerConstructor;
          default?: { AutoTokenizer?: TokenizerConstructor };
        };
        TokenizerClass = transformersExt.AutoTokenizer || transformersExt.default?.AutoTokenizer || null;
        if (!TokenizerClass) {
          throw new Error("AutoTokenizer not found in @xenova/transformers");
        }
        this.log?.info("Loaded @xenova/transformers");
      } catch (error: unknown) {
        const err = toError(error);
        throw new Error(`Failed to load tokenizer library: ${err.message}`);
      }
    }

    // Load tokenizer for the model
    // NOTE: @xenova/transformers downloads tokenizer files on first run (~5-50MB depending on model)
    // This is cached in ~/.cache/huggingface/ and reused on subsequent runs
    try {
      const tokenizerModel = getTokenizerModel(this.modelId);
      this.log?.info("Loading tokenizer", { model: tokenizerModel });

      const startTime = Date.now();
      this.tokenizer = await TokenizerClass.from_pretrained(tokenizerModel);
      const elapsed = Date.now() - startTime;

      this.log?.info("Tokenizer loaded", { elapsedMs: elapsed });
    } catch (error: unknown) {
      const err = toError(error);
      throw new Error(`Failed to load tokenizer for ${this.modelId}: ${err.message}`);
    }

    if (this.checkServer) {
      await ensureContainerRunning({
        baseUrl: this.baseUrl,
        isNative: this.isNative,
        log: this.log,
      });
    }

    // Wait for OVMS to be ready
    await waitForReady(this.baseUrl, 120_000, this.log);

    // Get model info from OVMS
    try {
      const infoRes = await fetch(`${this.baseUrl}/v2/models/${this.modelName}`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      if (infoRes.ok) {
        const modelInfo = (await infoRes.json()) as OVMSModelInfo;
        this.log?.debug("OVMS model info", { model: this.modelName, info: modelInfo });
      }
    } catch (error: unknown) {
      const err = toError(error);
      this.log?.warn("Failed to get model info", { error: err.message });
    }

    // Initialize gRPC client if protocol is grpc
    if (this.protocol === "grpc") {
      try {
        // Extract host from baseUrl
        const url = new URL(this.baseUrl);
        const host = url.hostname;

        this.grpcClient = new OVMSGrpcClient({
          host,
          port: this.grpcPort,
          modelName: this.modelName,
          timeoutMs: this.timeoutMs,
        });

        await this.grpcClient.initialize();
        this.log?.info("gRPC client initialized", { host, port: this.grpcPort });

        // Check server ready via gRPC
        const ready = await this.grpcClient.isServerReady();
        this.log?.info("gRPC server ready", { ready });
      } catch (error: unknown) {
        const err = toError(error);
        this.log?.error("gRPC client initialization failed", { error: err.message });
        throw new Error(`gRPC client failed: ${err.message}`);
      }
    }

    // Warmup call to determine dimension (with retry for model loading)
    const maxRetries = this.isNative ? 30 : 5; // Native mode: wait up to 60s for model loading
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const vec = await this.embed("warmup text");
        this.info.dimension = vec.length;
        this.log?.info("initialized", { dimension: this.info.dimension, attempt });
        break;
      } catch (error: unknown) {
        const err = toError(error);
        const isModelLoading = err.message.includes("not loaded") || err.message.includes("Mediapipe");

        if (isModelLoading && attempt < maxRetries) {
          this.log?.info("warmup retry", {
            attempt,
            maxRetries,
            reason: "Model still loading...",
            isNative: this.isNative,
          });
          await sleep(retryDelay);
          continue;
        }

        this.log?.error("warmup failed", { error: err.message, isNative: this.isNative, attempt }, undefined, err);
        if (this.isNative) {
          throw new Error(
            `OVMS warmup failed after ${attempt} attempts: ${err.message}\n` +
              `OVMS Native should be auto-started by MCP server.\n` +
              `Check logs or run: setup-embedding`,
          );
        }
        throw new Error(
          `OVMS warmup failed: ${err.message}\n` +
            `Make sure OVMS Docker container is running:\n` +
            `docker start ovms-embedding`,
        );
      }
    }

    // GPU warmup: run a full batch to trigger shader/kernel compilation
    // This prevents the first real batch from having a ~7-10s delay
    await this.performGpuWarmup();
  }

  /**
   * GPU warmup: run batches through all endpoints to compile GPU shaders/kernels.
   * This is done asynchronously after basic initialization to not block startup.
   * First real inference on GPU requires shader compilation which takes 5-10 seconds.
   */
  private async performGpuWarmup(): Promise<void> {
    const warmupStart = Date.now();
    this.log?.info("GPU warmup starting", {
      endpoints: this.endpoints.length,
      miniBatchSize: this.miniBatchSize,
    });

    // Create enough texts to hit all endpoints at least once with full batches
    const warmupTexts: string[] = [];
    const totalTexts = this.endpoints.length * this.miniBatchSize;
    for (let i = 0; i < totalTexts; i++) {
      warmupTexts.push(GPU_WARMUP_TEXTS[i % GPU_WARMUP_TEXTS.length]!);
    }

    try {
      // Run warmup batch - this triggers GPU kernel compilation
      await this.embedBatch(warmupTexts);

      const warmupMs = Date.now() - warmupStart;
      this.log?.info("GPU warmup complete", {
        warmupMs,
        textsProcessed: warmupTexts.length,
        endpoints: this.endpoints.length,
      });
    } catch (error: unknown) {
      const err = toError(error);
      // Don't fail initialization on warmup error, just log it
      this.log?.warn("GPU warmup failed (non-fatal)", { error: err.message });
    }
  }

  getDimension(): number | undefined {
    return this.info.dimension;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<Float32Array> {
    this.log?.debug("embed()", { len: text?.length }, opts?.requestId);

    // For single text, use embedBatch
    const results = await this.embedBatch([text], opts);
    return results[0]!;
  }

  async embedBatch(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]> {
    this.log?.debug("embedBatch()", { count: texts.length, protocol: this.protocol }, opts?.requestId);

    try {
      // Use gRPC binary protocol if configured
      if (this.protocol === "grpc" && this.grpcClient) {
        return await this.embedBatchGrpc(texts, opts);
      }
      // Use OpenAI-compatible /v3/embeddings API if available
      if (this.useEmbeddingsApi) {
        return await this.embedBatchV3(texts, opts);
      }
      // Fallback to /v2/infer API with tokenization
      return await this.embedBatchV2(texts, opts);
    } catch (error: unknown) {
      const err = toError(error);
      this.log?.error("embedBatch failed", { error: err.message }, opts?.requestId, err);

      if (err.message.includes("ECONNREFUSED")) {
        throw new Error(`OVMS server not reachable at ${this.baseUrl}. Is Docker container running?`);
      }

      throw new Error(`OVMS embedBatch error: ${err.message}`);
    }
  }

  /**
   * OpenAI-compatible /v3/embeddings API
   * Returns pooled embeddings directly, no tokenization needed
   * Supports base64 encoding for smaller response size
   * Uses parallel requests for multi-device load balancing
   */
  private async embedBatchV3(texts: string[], _opts?: EmbedOptions): Promise<Float32Array[]> {
    const batchStartTime = Date.now();
    const originalCount = texts.length;

    // Split into mini-batches
    const numBatches = Math.ceil(texts.length / this.miniBatchSize);
    const batchConfigs: Array<{ batchIndex: number; texts: string[]; endpoint: string }> = [];

    for (let b = 0; b < numBatches; b++) {
      const start = b * this.miniBatchSize;
      const end = Math.min(start + this.miniBatchSize, texts.length);
      const batchTexts = texts.slice(start, end);

      // Round-robin endpoint selection for multi-device load balancing
      const currentEndpoint = this.endpoints[this.endpointIndex % this.endpoints.length]!;
      this.endpointIndex++;

      batchConfigs.push({ batchIndex: b, texts: batchTexts, endpoint: currentEndpoint });
    }

    // Process batches with concurrency limit for GPU efficiency
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(this.concurrency);

    const batchPromises = batchConfigs.map((config) =>
      limit(async () => {
        const url = `${this.baseUrl}/v3/embeddings`;
        const requestBody = {
          model: config.endpoint,
          input: config.texts,
          encoding_format: this.encodingFormat,
        };

        const callStart = Date.now();
        // Use AbortSignal.timeout() for Bun compatibility (no setTimeout)
        this.log?.debug("OVMS v3 fetch starting", {
          url,
          endpoint: config.endpoint,
          batchSize: config.texts.length,
          batchIndex: config.batchIndex,
        });

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Connection: "keep-alive",
          },
          body: stringify.openaiEmbedding(requestBody),
          signal: AbortSignal.timeout(this.timeoutMs),
          // Enable HTTP keepalive for connection reuse (reduces latency)
          keepalive: true,
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => "");
          throw new Error(`OVMS HTTP ${res.status}: ${errorBody}`);
        }

        const json = (await res.json()) as OVMSEmbeddingResponse;
        const callMs = Date.now() - callStart;
        this.log?.debug("OVMS v3 batch done", {
          batch: config.batchIndex + 1,
          numBatches,
          callMs,
          endpoint: config.endpoint,
        });

        // Parse response: { data: [{ embedding: ..., index: 0 }, ...] }
        if (!json.data || !Array.isArray(json.data)) {
          throw new Error(`OVMS v3 invalid response: ${JSON.stringify(json).slice(0, 200)}`);
        }

        // Sort by index to ensure correct order
        const sortedData = [...json.data].sort((a, b) => a.index - b.index);
        const embeddings: Float32Array[] = [];

        for (const item of sortedData) {
          let embedding: Float32Array;

          if (this.encodingFormat === "base64" && typeof item.embedding === "string") {
            embedding = this.decodeBase64ToFloat32(item.embedding);
          } else if (Array.isArray(item.embedding)) {
            embedding = new Float32Array(item.embedding);
          } else {
            throw new Error(`Unknown embedding format: ${typeof item.embedding}`);
          }

          normalizeVector(embedding);
          embeddings.push(embedding);
        }

        return { batchIndex: config.batchIndex, embeddings };
      }),
    );

    // Wait for all batches and sort by batchIndex to maintain order
    const results = await Promise.all(batchPromises);
    results.sort((a, b) => a.batchIndex - b.batchIndex);

    const allEmbeddings: Float32Array[] = [];
    for (const result of results) {
      allEmbeddings.push(...result.embeddings);
    }

    const totalMs = Date.now() - batchStartTime;
    const throughput = originalCount / (totalMs / 1000); // texts per second
    this.log?.info("OVMS v3 embedBatch complete", {
      texts: originalCount,
      totalMs,
      perTextMs: +(totalMs / originalCount).toFixed(1),
      throughputPerSec: +throughput.toFixed(1),
      encoding: this.encodingFormat,
      batches: numBatches,
      batchSize: this.miniBatchSize,
    });

    this.info.dimension = this.info.dimension ?? allEmbeddings[0]?.length;
    return allEmbeddings;
  }

  /**
   * Acquire a Float32Array from the buffer pool or create a new one
   */
  private acquireBuffer(size: number): Float32Array {
    // Look for a buffer of the right size in the pool
    for (let i = 0; i < this.bufferPool.length; i++) {
      if (this.bufferPool[i]!.length === size) {
        return this.bufferPool.splice(i, 1)[0]!;
      }
    }
    // No matching buffer found, create a new one
    return new Float32Array(size);
  }

  /**
   * Release a Float32Array back to the buffer pool for reuse
   * Note: Only call this when you're done with the buffer and it won't be used elsewhere
   */
  releaseBuffer(buffer: Float32Array): void {
    if (this.bufferPool.length < this.maxPoolSize) {
      // Zero out the buffer before returning to pool (optional, for security)
      // buffer.fill(0);
      this.bufferPool.push(buffer);
    }
    // If pool is full, let GC handle it
  }

  /**
   * Decode base64-encoded Float32 array using buffer pool
   */
  private decodeBase64ToFloat32(base64: string): Float32Array {
    // Decode base64 to binary
    const binaryString = atob(base64);
    const floatCount = binaryString.length / 4; // 4 bytes per float32

    // Acquire buffer from pool or create new
    const result = this.acquireBuffer(floatCount);

    // Decode directly into Float32Array's underlying buffer
    const bytes = new Uint8Array(result.buffer);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return result;
  }

  /**
   * Legacy /v2/infer API with tokenization
   * Used when /v3/embeddings is not available
   */
  private async embedBatchV2(texts: string[], _opts?: EmbedOptions): Promise<Float32Array[]> {
    const batchStartTime = Date.now();
    const originalCount = texts.length;

    // Pad to multiple of miniBatchSize
    const paddedTexts = [...texts];
    while (paddedTexts.length % this.miniBatchSize !== 0) {
      paddedTexts.push(""); // Empty padding
    }

    // Tokenize ALL texts at once
    this.log?.debug("Tokenizing all texts", { count: paddedTexts.length });
    const tokenizeStart = Date.now();
    if (!this.tokenizer) {
      throw new Error("Tokenizer not initialized");
    }
    const encoded = await this.tokenizer(paddedTexts, {
      padding: true,
      truncation: true,
      max_length: 256,
      return_tensor: false,
    });

    // Extract as nested arrays
    const inputIdsRaw = encoded.input_ids;
    const attentionMaskRaw = encoded.attention_mask;
    const tokenTypeIdsRaw = encoded.token_type_ids;

    let inputIds2D: number[][];
    let attentionMask2D: number[][];
    let tokenTypeIds2D: number[][] | null = null;
    let seqLen: number;

    // Type guard for tensor data
    const isTensorData = (
      data: unknown,
    ): data is { data: BigInt64Array | number[]; dims?: number[]; shape?: number[] } =>
      typeof data === "object" && data !== null && "data" in data;

    if (isTensorData(inputIdsRaw) && (inputIdsRaw.dims || inputIdsRaw.shape)) {
      const shape = inputIdsRaw.dims || inputIdsRaw.shape;
      const totalTexts = shape![0]!;
      seqLen = shape![1]!;
      const inputIdsFlat = Array.from(inputIdsRaw.data as ArrayLike<number>).map(Number);
      const attentionMaskFlat =
        isTensorData(attentionMaskRaw) && attentionMaskRaw.data
          ? Array.from(attentionMaskRaw.data as ArrayLike<number>).map(Number)
          : [];

      inputIds2D = [];
      attentionMask2D = [];
      for (let i = 0; i < totalTexts; i++) {
        inputIds2D.push(inputIdsFlat.slice(i * seqLen, (i + 1) * seqLen));
        attentionMask2D.push(attentionMaskFlat.slice(i * seqLen, (i + 1) * seqLen));
      }

      if (tokenTypeIdsRaw && isTensorData(tokenTypeIdsRaw)) {
        const tokenTypeIdsFlat = Array.from(tokenTypeIdsRaw.data as ArrayLike<number>).map(Number);
        tokenTypeIds2D = [];
        for (let i = 0; i < totalTexts; i++) {
          tokenTypeIds2D.push(tokenTypeIdsFlat.slice(i * seqLen, (i + 1) * seqLen));
        }
      }
    } else {
      inputIds2D = inputIdsRaw as number[][];
      attentionMask2D = (attentionMaskRaw as number[][]) || [];
      seqLen = inputIds2D[0]?.length || 0;
      if (tokenTypeIdsRaw) {
        tokenTypeIds2D = tokenTypeIdsRaw as number[][];
      }
    }

    const tokenizeMs = Date.now() - tokenizeStart;
    this.log?.debug("Tokenized all", { totalTexts: inputIds2D.length, seqLen, tokenizeMs });

    // Prepare mini-batch configs upfront
    const numMiniBatches = Math.ceil(inputIds2D.length / this.miniBatchSize);
    const url = `${this.baseUrl}/v2/models/${this.modelName}/infer`;

    interface BatchConfig {
      batchIndex: number;
      start: number;
      end: number;
      miniBatchSize: number;
      inferRequest: OVMSInferRequest;
    }

    const batchConfigs: BatchConfig[] = [];
    for (let b = 0; b < numMiniBatches; b++) {
      const start = b * this.miniBatchSize;
      const end = Math.min(start + this.miniBatchSize, inputIds2D.length);
      const miniBatchSize = end - start;

      const inferRequest: OVMSInferRequest = {
        inputs: [
          {
            name: "input_ids",
            shape: [miniBatchSize, seqLen],
            datatype: "INT64",
            data: inputIds2D.slice(start, end).flat(),
          },
          {
            name: "attention_mask",
            shape: [miniBatchSize, seqLen],
            datatype: "INT64",
            data: attentionMask2D.slice(start, end).flat(),
          },
        ],
      };

      if (tokenTypeIds2D) {
        inferRequest.inputs.push({
          name: "token_type_ids",
          shape: [miniBatchSize, seqLen],
          datatype: "INT64",
          data: tokenTypeIds2D.slice(start, end).flat(),
        });
      }

      batchConfigs.push({ batchIndex: b, start, end, miniBatchSize, inferRequest });
    }

    // Process batches with sliding window concurrency
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(this.concurrency);

    const processBatch = async (config: BatchConfig): Promise<{ batchIndex: number; embeddings: Float32Array[] }> => {
      // Use AbortSignal.timeout() for Bun compatibility (no setTimeout)
      const callStart = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringify.ovmsInfer(config.inferRequest),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`OVMS HTTP ${res.status}: ${errorBody}`);
      }

      const json = (await res.json()) as OVMSInferResponse;
      const callMs = Date.now() - callStart;
      this.log?.debug("OVMS v2 batch", { batch: config.batchIndex + 1, numMiniBatches, callMs });

      if (!json.outputs || !Array.isArray(json.outputs)) {
        throw new Error("OVMS invalid response: missing outputs");
      }

      // Find embeddings output
      type OutputMeta = { name: string; shape: number[]; datatype: string; data: number[] };
      let outputMeta: OutputMeta | null = null;
      let outputShape: number[] | undefined;

      for (const output of json.outputs) {
        if (output.name === "sentence_embedding" || output.name === "embeddings") {
          outputMeta = output;
          outputShape = output.shape;
          break;
        }
        if (output.name === "last_hidden_state" || output.name === "token_embeddings") {
          outputMeta = output;
          outputShape = output.shape;
        }
      }

      if (!outputMeta || !outputShape) {
        const firstOutput = json.outputs[0];
        if (firstOutput) {
          outputMeta = firstOutput;
          outputShape = firstOutput.shape;
        }
      }

      if (!outputMeta || !outputShape || !outputMeta.data) {
        throw new Error(`OVMS no valid output. Available: ${json.outputs.map((o) => o.name).join(", ")}`);
      }

      const outputData: number[] = outputMeta.data;
      const embeddings: Float32Array[] = [];

      // Convert to embeddings for this mini-batch
      if (outputShape.length === 2) {
        // Already pooled: [batch_size, hidden_size]
        const hiddenSize = outputShape[1]!;
        for (let i = 0; i < config.miniBatchSize; i++) {
          const startIdx = i * hiddenSize;
          const embedding = new Float32Array(outputData.slice(startIdx, startIdx + hiddenSize));
          normalizeVector(embedding);
          embeddings.push(embedding);
        }
      } else if (outputShape.length === 3) {
        // Needs mean pooling: [batch_size, seq_len, hidden_size]
        const outSeqLen = outputShape[1]!;
        const hiddenSize = outputShape[2]!;

        for (let i = 0; i < config.miniBatchSize; i++) {
          const embedding = new Float32Array(hiddenSize);
          let validTokens = 0;
          const globalIdx = config.start + i; // Index into original attentionMask2D

          for (let j = 0; j < outSeqLen && j < seqLen; j++) {
            if (attentionMask2D[globalIdx]![j] === 1) {
              const offset = i * outSeqLen * hiddenSize + j * hiddenSize;
              for (let k = 0; k < hiddenSize; k++) {
                embedding[k] = (embedding[k] ?? 0) + (outputData[offset + k] ?? 0);
              }
              validTokens++;
            }
          }

          if (validTokens > 0) {
            for (let k = 0; k < hiddenSize; k++) {
              embedding[k] = (embedding[k] ?? 0) / validTokens;
            }
          }

          normalizeVector(embedding);
          embeddings.push(embedding);
        }
      } else {
        throw new Error(`OVMS unexpected output shape: ${outputShape.join("x")}`);
      }

      return { batchIndex: config.batchIndex, embeddings };
    };

    // Execute with concurrency limit (sliding window)
    const results = await Promise.all(batchConfigs.map((config) => limit(() => processBatch(config))));

    // Sort by batch index and flatten
    results.sort((a, b) => a.batchIndex - b.batchIndex);
    const allEmbeddings: Float32Array[] = [];
    for (const result of results) {
      allEmbeddings.push(...result.embeddings);
    }

    const totalMs = Date.now() - batchStartTime;
    this.log?.info("OVMS v2 embedBatch complete", {
      texts: originalCount,
      totalMs,
      perTextMs: +(totalMs / originalCount).toFixed(1),
      tokenizeMs,
    });

    this.info.dimension = this.info.dimension ?? allEmbeddings[0]?.length;
    // Return only original embeddings, strip padding
    return allEmbeddings.slice(0, originalCount);
  }

  /**
   * gRPC binary protocol for OVMS
   * Uses KServe V2 Inference Protocol with protobuf serialization
   * ~30-50% faster than REST due to binary encoding and HTTP/2
   */
  private async embedBatchGrpc(texts: string[], _opts?: EmbedOptions): Promise<Float32Array[]> {
    if (!this.grpcClient) {
      throw new Error("gRPC client not initialized");
    }

    const batchStartTime = Date.now();
    const originalCount = texts.length;

    // Tokenize all texts
    this.log?.debug("gRPC: Tokenizing texts", { count: texts.length });
    const tokenizeStart = Date.now();

    if (!this.tokenizer) {
      throw new Error("Tokenizer not initialized");
    }
    const encoded = await this.tokenizer(texts, {
      padding: true,
      truncation: true,
      max_length: 256,
      return_tensor: false,
    });

    // Extract as 2D arrays
    const inputIdsRaw = encoded.input_ids;
    const attentionMaskRaw = encoded.attention_mask;
    const tokenTypeIdsRaw = encoded.token_type_ids;

    let inputIds2D: number[][];
    let attentionMask2D: number[][];
    let tokenTypeIds2D: number[][] | null = null;

    // Type guard for tensor data
    const isTensorData = (
      data: unknown,
    ): data is { data: BigInt64Array | number[]; dims?: number[]; shape?: number[] } =>
      typeof data === "object" && data !== null && "data" in data;

    if (isTensorData(inputIdsRaw) && (inputIdsRaw.dims || inputIdsRaw.shape)) {
      const shape = inputIdsRaw.dims || inputIdsRaw.shape;
      const totalTexts = shape![0]!;
      const seqLen = shape![1]!;
      const inputIdsFlat = Array.from(inputIdsRaw.data as ArrayLike<number>).map(Number);
      const attentionMaskFlat =
        isTensorData(attentionMaskRaw) && attentionMaskRaw.data
          ? Array.from(attentionMaskRaw.data as ArrayLike<number>).map(Number)
          : [];

      inputIds2D = [];
      attentionMask2D = [];
      for (let i = 0; i < totalTexts; i++) {
        inputIds2D.push(inputIdsFlat.slice(i * seqLen, (i + 1) * seqLen));
        attentionMask2D.push(attentionMaskFlat.slice(i * seqLen, (i + 1) * seqLen));
      }

      if (tokenTypeIdsRaw && isTensorData(tokenTypeIdsRaw)) {
        const tokenTypeIdsFlat = Array.from(tokenTypeIdsRaw.data as ArrayLike<number>).map(Number);
        tokenTypeIds2D = [];
        for (let i = 0; i < totalTexts; i++) {
          tokenTypeIds2D.push(tokenTypeIdsFlat.slice(i * seqLen, (i + 1) * seqLen));
        }
      }
    } else {
      inputIds2D = inputIdsRaw as number[][];
      attentionMask2D = (attentionMaskRaw as number[][]) || [];
      if (tokenTypeIdsRaw) {
        tokenTypeIds2D = tokenTypeIdsRaw as number[][];
      }
    }

    const tokenizeMs = Date.now() - tokenizeStart;
    this.log?.debug("gRPC: Tokenization complete", {
      texts: texts.length,
      seqLen: inputIds2D[0]?.length,
      tokenizeMs,
    });

    // Prepare mini-batches for parallel gRPC calls
    const numBatches = Math.ceil(inputIds2D.length / this.miniBatchSize);

    interface GrpcBatchConfig {
      batchIndex: number;
      inputIds: number[][];
      attentionMask: number[][];
      tokenTypeIds: number[][] | undefined;
    }

    const batchConfigs: GrpcBatchConfig[] = [];
    for (let b = 0; b < numBatches; b++) {
      const start = b * this.miniBatchSize;
      const end = Math.min(start + this.miniBatchSize, inputIds2D.length);
      batchConfigs.push({
        batchIndex: b,
        inputIds: inputIds2D.slice(start, end),
        attentionMask: attentionMask2D.slice(start, end),
        tokenTypeIds: tokenTypeIds2D?.slice(start, end),
      });
    }

    // Process with sliding window concurrency (HTTP/2 multiplexing)
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(this.concurrency);

    const processBatch = async (
      config: GrpcBatchConfig,
    ): Promise<{ batchIndex: number; embeddings: Float32Array[] }> => {
      const callStart = Date.now();
      try {
        const embeddings = await this.grpcClient!.infer(config.inputIds, config.attentionMask, config.tokenTypeIds);

        const callMs = Date.now() - callStart;
        this.log?.debug("gRPC batch", {
          batch: config.batchIndex + 1,
          numBatches,
          callMs,
          texts: config.inputIds.length,
        });

        return { batchIndex: config.batchIndex, embeddings };
      } catch (error: unknown) {
        const err = toError(error);
        this.log?.error("gRPC batch failed", { batch: config.batchIndex + 1, error: err.message });
        throw err;
      }
    };

    const results = await Promise.all(batchConfigs.map((config) => limit(() => processBatch(config))));

    // Sort by batch index and flatten
    results.sort((a, b) => a.batchIndex - b.batchIndex);
    const allEmbeddings: Float32Array[] = [];
    for (const result of results) {
      allEmbeddings.push(...result.embeddings);
    }

    const totalMs = Date.now() - batchStartTime;
    this.log?.info("gRPC embedBatch complete", {
      texts: originalCount,
      totalMs,
      perTextMs: +(totalMs / originalCount).toFixed(1),
      tokenizeMs,
      batches: numBatches,
    });

    this.info.dimension = this.info.dimension ?? allEmbeddings[0]?.length;
    return allEmbeddings;
  }

  async close(): Promise<void> {
    // Close gRPC client if open
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }
    this.tokenizer = null;
    // Clear buffer pool
    this.bufferPool.length = 0;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      embeddings: true,
      rerank: false,
      score: false,
      classify: false,
    };
  }
}
