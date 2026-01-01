/**
 * TASK-004B: Embedding Generator - Stack Overflow Fixes Applied
 * TASK-002: Embedding Generator with Hugging Face Transformers
 * ADR-004: MCP CodeGraph Systematic Fixing Plan
 *
 * Generates 384-dimensional embeddings using all-MiniLM-L6-v2 model
 * Optimized for commodity hardware with ONNX runtime and quantization
 * FIXED: Recursive initialization patterns causing maximum call stack exceeded
 *
 * External Dependencies:
 * - @xenova/transformers: https://github.com/xenova/transformers.js - Hugging Face Transformers for JS
 * - onnxruntime-node: https://onnxruntime.ai/ - ONNX Runtime for optimized inference
 *
 * Architecture References:
 * - Project Overview: doc/PROJECT_OVERVIEW.md
 * - Coding Standards: doc/CODING_STANDARD.md
 * - Architectural Decisions: doc/ARCHITECTURAL_DECISIONS.md
 * - Performance Guide: PERFORMANCE_GUIDE.md
 *
 * @task_id TASK-004B
 * @adr_ref ADR-004
 * @coding_standard Adheres to: doc/CODING_STANDARD.md
 * @history
 *  - 2025-09-14: Created by Dev-Agent - TASK-002: Embedding generator with all-MiniLM-L6-v2
 *  - 2025-09-17: Fixed by Dev-Agent - TASK-004B: Resolved initialization stack overflow patterns
 */
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================

import { CACHE_CONSTANTS } from "../config/constants.js";
import type { EmbeddingConfig } from "../types/semantic.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";
import type { EmbeddingProvider } from "./providers/base.js";
import { createProvider } from "./providers/factory.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_CONFIG: EmbeddingConfig = {
  modelName: DEFAULT_MODEL,
  quantized: true,
  localPath: "./models",
  // NOTE: Large batch for GPU efficiency - providers split internally if needed
  batchSize: 256,
  provider: "auto",
};

const DEFAULT_TTL_MS = CACHE_CONSTANTS.CACHE_TTL_MS;
const MAX_CACHE_ENTRIES = CACHE_CONSTANTS.MAX_CACHE_ENTRIES;

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================
interface EmbeddingCache {
  text: string;
  embedding: Float32Array;
  timestamp: number;
  providerKey: string;
}

// =============================================================================
// 4. UTILITY FUNCTIONS AND HELPERS
// =============================================================================

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 512);
}

function ensureEmbedding(embedding: Float32Array | undefined, dimension: number): Float32Array {
  return embedding ?? new Float32Array(dimension);
}

// =============================================================================
// 5. CORE BUSINESS LOGIC (ORCHESTRATOR)
// =============================================================================
export class EmbeddingGenerator {
  private provider: EmbeddingProvider | null = null;

  private cache: Map<string, EmbeddingCache> = new Map();
  private config: EmbeddingConfig;
  private initPromise: Promise<void> | null = null;
  private isInitializing = false;

  private cacheHits = 0;
  private cacheMisses = 0;
  private debugMode = process.env["EMBEDDING_DEBUG"] === "true";

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private providerKey(): string {
    const info = this.provider?.info;
    const dim = this.provider?.getDimension() ?? 384;
    const name = info?.name ?? "unknown";
    const model = info?.model ?? "unknown";
    return `${name}:${model}:${dim}`;
  }

  /**
   * Get maximum tokens supported by the current provider
   * Used for adaptive entity expansion
   */
  get maxTokens(): number {
    return this.provider?.info?.maxTokens ?? 512;
  }

  /**
   * Get the underlying embedding provider
   * Useful for accessing extended capabilities (rerank, score, etc.)
   */
  getProvider(): EmbeddingProvider | null {
    return this.provider;
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.isInitializing = true;
    const startTime = Date.now();
    logger.trace("EMBEDDING", `[EmbeddingGenerator] ▶ initialize() START`);

    this.initPromise = (async () => {
      try {
        const providerName = this.config.provider ?? "auto";
        logger.trace("EMBEDDING", `[EmbeddingGenerator] ▶ createProvider(${providerName})`);
        logger.info("EmbeddingGenerator", `initialize() called, provider=${providerName}`, { tei: this.config.tei });
        const createStart = Date.now();
        this.provider = await createProvider({
          provider: providerName,
          modelName: this.config.modelName ?? DEFAULT_MODEL,
          ollama: this.config.ollama,
          openai: this.config.openai,
          cloudru: this.config.cloudru,
          huggingface: this.config.huggingface,
          tei: this.config.tei,
          ovms: this.config.ovms,
        });
        logger.trace("EMBEDDING", `[EmbeddingGenerator] ◀ createProvider (${Date.now() - createStart}ms)`);

        logger.trace("EMBEDDING", `[EmbeddingGenerator] ▶ provider.initialize()`);
        const providerStart = Date.now();
        await this.provider.initialize();
        logger.trace("EMBEDDING", `[EmbeddingGenerator] ◀ provider.initialize() (${Date.now() - providerStart}ms)`);
        logger.trace("EMBEDDING", `[EmbeddingGenerator] ◀ initialize() END (${Date.now() - startTime}ms)`);

        if (this.debugMode) {
          logger.debug("EmbeddingGenerator", "Provider initialized", {
            name: this.provider.info.name,
            model: this.provider.info.model,
          });
        }
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.provider && !this.isInitializing) {
      await this.initialize();
    } else if (this.isInitializing) {
      // Wait for initialization to complete
      await this.initPromise;
    }

    if (!this.provider) {
      throw new Error("No embedding provider available. Run setup-embedding to configure one.");
    }

    const normalized = normalizeText(text);
    const key = `${this.providerKey()}:${hashText(normalized)}`;

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < DEFAULT_TTL_MS) {
      this.cacheHits++;
      // LRU: move to end by delete + re-set (Map preserves insertion order)
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.embedding;
    }
    this.cacheMisses++;

    const embedding = await this.provider!.embed(normalized);

    // Cache with simple LRU eviction
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      this.evictOldestCacheEntry();
    }
    this.cache.set(key, {
      text: normalized,
      embedding,
      timestamp: Date.now(),
      providerKey: this.providerKey(),
    });

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.provider) {
      await this.initialize();
    }

    if (!this.provider) {
      throw new Error("No embedding provider available. Run setup-embedding to configure one.");
    }

    const results: Float32Array[] = [];
    const batchSize = this.config.batchSize ?? 8;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));

      const toProcess: { index: number; text: string; key: string }[] = [];
      const batchResults: (Float32Array | null)[] = Array(batch.length).fill(null);

      for (let j = 0; j < batch.length; j++) {
        const normalized = normalizeText(batch[j] ?? "");
        const key = `${this.providerKey()}:${hashText(normalized)}`;
        const cached = this.cache.get(key);

        if (cached && Date.now() - cached.timestamp < DEFAULT_TTL_MS) {
          this.cacheHits++;
          // LRU: move to end by delete + re-set
          this.cache.delete(key);
          this.cache.set(key, cached);
          batchResults[j] = cached.embedding;
        } else {
          this.cacheMisses++;
          toProcess.push({ index: j, text: normalized, key });
        }
      }

      // Process uncached texts
      if (toProcess.length > 0) {
        const dimension = this.provider.getDimension() ?? 384;
        let embeddings: Float32Array[];

        if (typeof this.provider!.embedBatch === "function") {
          embeddings = (await this.provider!.embedBatch(toProcess.map((t) => t.text))) ?? [];
        } else {
          // Sequential processing when batch not supported
          embeddings = [];
          for (const item of toProcess) {
            const emb = await this.provider!.embed(item.text);
            embeddings.push(ensureEmbedding(emb, dimension));
          }
        }

        toProcess.forEach((item, k) => {
          const embedding = ensureEmbedding(embeddings[k], dimension);
          batchResults[item.index] = embedding;
          if (this.cache.size >= MAX_CACHE_ENTRIES) this.evictOldestCacheEntry();
          this.cache.set(item.key, {
            text: item.text,
            embedding,
            timestamp: Date.now(),
            providerKey: this.providerKey(),
          });
        });
      }

      results.push(...batchResults.filter((r): r is Float32Array => r !== null));
    }

    return results;
  }

  setBatchSize(size: number): void {
    const normalized = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : (this.config.batchSize ?? 8);
    this.config.batchSize = normalized;
    if (this.debugMode) {
      logger.debug("EmbeddingGenerator", "Batch size updated", { size: normalized });
    }
  }

  /**
   * Generate embedding for code with special preprocessing
   */
  async generateCodeEmbedding(code: string, language?: string): Promise<Float32Array> {
    const processed = this.preprocessCode(code, language);
    return this.generateEmbedding(processed);
  }

  private preprocessCode(code: string, language?: string): string {
    let processed = code
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*[\r\n]/gm, "");

    if (language) processed = `${language} code: ${processed}`;
    return processed.replace(/\s+/g, " ").trim().slice(0, 512);
  }

  private evictOldestCacheEntry(): void {
    // O(1) LRU eviction: Map preserves insertion order, first key is oldest
    const firstKey = this.cache.keys().next().value;
    if (firstKey) this.cache.delete(firstKey);
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    logger.debug("EmbeddingGenerator", "Cache cleared");
  }

  getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      size: this.cache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  async cleanup(): Promise<void> {
    this.clearCache();
    await this.provider?.close?.();
    this.provider = null;
    this.initPromise = null;
    logger.debug("EmbeddingGenerator", "Cleaned up");
  }
}
