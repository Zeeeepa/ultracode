/**
 * Global Embedding Cache
 *
 * Pre-computed embeddings for language built-ins, stdlib, and framework patterns.
 * These are shared across all projects to avoid redundant embedding generation.
 *
 * Structure (centralized storage):
 * - Windows: %LOCALAPPDATA%/UltraScriptTools/global-embeddings/
 * - macOS: ~/Library/Application Support/UltraScriptTools/global-embeddings/
 * - Linux: ~/.local/share/UltraScriptTools/global-embeddings/
 *   - metadata.json (model version, last update)
 *   - javascript.bin (binary embeddings)
 *   - typescript.bin
 *   - python.bin
 *   - react.bin (framework)
 *   - angular.bin
 *   - ...
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils/config-paths.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";
import { type GlobalCacheEntry, type GlobalCacheMetadata, getAllGlobalEntries } from "./global-cache/index.js";

// Re-export types and data for backwards compatibility
export type { GlobalCacheEntry, GlobalCacheMetadata } from "./global-cache/index.js";
export {
  ANGULAR_PATTERNS,
  EXPRESS_PATTERNS,
  GO_BUILTINS,
  getAllGlobalEntries,
  JAVA_BUILTINS,
  JAVASCRIPT_BUILTINS,
  KOTLIN_BUILTINS,
  NESTJS_PATTERNS,
  PYTHON_BUILTINS,
  REACT_PATTERNS,
  RUST_BUILTINS,
  TYPESCRIPT_BUILTINS,
  VUE_PATTERNS,
} from "./global-cache/index.js";

// =============================================================================
// GLOBAL CACHE CLASS
// =============================================================================

export class GlobalEmbeddingCache {
  private static instance: GlobalEmbeddingCache | null = null;
  private cacheDir: string;
  private cache: Map<string, Float32Array> = new Map();
  private textToHash: Map<string, string> = new Map();
  private metadata: GlobalCacheMetadata | null = null;
  private initialized = false;

  private constructor() {
    this.cacheDir = join(getDataDir(), "global-embeddings");
  }

  static getInstance(): GlobalEmbeddingCache {
    if (!GlobalEmbeddingCache.instance) {
      GlobalEmbeddingCache.instance = new GlobalEmbeddingCache();
    }
    return GlobalEmbeddingCache.instance;
  }

  /**
   * Initialize the global cache
   * @param model - Model name (e.g., "all-MiniLM-L6-v2")
   * @param dimension - Embedding dimension (e.g., 384)
   */
  async initialize(model: string, dimension: number): Promise<void> {
    if (this.initialized) return;

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Try to load existing cache
    const metadataPath = join(this.cacheDir, "metadata.json");
    if (existsSync(metadataPath)) {
      try {
        const raw = readFileSync(metadataPath, "utf-8");
        this.metadata = JSON.parse(raw) as GlobalCacheMetadata;

        // Check if cache is compatible
        if (this.metadata.model === model && this.metadata.dimension === dimension) {
          await this.loadCache();
          logger.debug("GlobalCache", "Loaded pre-computed embeddings", { count: this.cache.size });
        } else {
          logger.debug("GlobalCache", "Model mismatch, will regenerate", {
            cached: this.metadata.model,
            current: model,
          });
          this.metadata = null;
        }
      } catch (e) {
        logger.warn("GlobalCache", "Failed to load metadata", { error: (e as Error).message });
      }
    }

    // Initialize metadata if not loaded
    if (!this.metadata) {
      this.metadata = {
        version: "1.0",
        model,
        dimension,
        lastUpdated: new Date().toISOString(),
        entryCounts: {},
      };
    }

    this.initialized = true;
  }

  /**
   * Load cache from disk
   */
  private async loadCache(): Promise<void> {
    const embeddingsPath = join(this.cacheDir, "embeddings.bin");
    const textsPath = join(this.cacheDir, "texts.json");

    if (!existsSync(embeddingsPath) || !existsSync(textsPath)) {
      return;
    }

    try {
      // Load text -> hash mapping
      const textsRaw = readFileSync(textsPath, "utf-8");
      const texts = JSON.parse(textsRaw) as Record<string, string>;
      for (const [hash, text] of Object.entries(texts)) {
        this.textToHash.set(text, hash);
      }

      // Load binary embeddings
      const buffer = readFileSync(embeddingsPath);
      const dimension = this.metadata!.dimension;
      const numEmbeddings = buffer.length / (dimension * 4); // 4 bytes per float

      const hashes = Object.keys(texts);
      for (let i = 0; i < numEmbeddings && i < hashes.length; i++) {
        const start = i * dimension * 4;
        const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset + start, dimension);
        this.cache.set(hashes[i]!, new Float32Array(floatArray));
      }
    } catch (e) {
      logger.warn("GlobalCache", "Failed to load cache", { error: (e as Error).message });
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    if (!this.metadata) return;

    const metadataPath = join(this.cacheDir, "metadata.json");
    const embeddingsPath = join(this.cacheDir, "embeddings.bin");
    const textsPath = join(this.cacheDir, "texts.json");

    // Save metadata
    this.metadata.lastUpdated = new Date().toISOString();
    writeFileSync(metadataPath, JSON.stringify(this.metadata, null, 2));

    // Save texts (hash -> text)
    const texts: Record<string, string> = {};
    for (const [text, hash] of this.textToHash) {
      texts[hash] = text;
    }
    writeFileSync(textsPath, JSON.stringify(texts));

    // Save binary embeddings
    const dimension = this.metadata.dimension;
    const buffer = Buffer.alloc(this.cache.size * dimension * 4);
    let offset = 0;
    for (const [hash] of this.textToHash) {
      const embedding = this.cache.get(hash);
      if (embedding) {
        for (let i = 0; i < dimension; i++) {
          buffer.writeFloatLE(embedding[i]!, offset);
          offset += 4;
        }
      }
    }
    writeFileSync(embeddingsPath, buffer);

    logger.debug("GlobalCache", "Saved embeddings to disk", { count: this.cache.size });
  }

  /**
   * Check if a text has a pre-computed embedding
   */
  has(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return this.textToHash.has(normalized);
  }

  /**
   * Get pre-computed embedding for text
   */
  get(text: string): Float32Array | null {
    const normalized = text.trim().toLowerCase();
    const hash = this.textToHash.get(normalized);
    if (!hash) return null;
    return this.cache.get(hash) ?? null;
  }

  /**
   * Add embedding to global cache
   */
  set(text: string, embedding: Float32Array): void {
    const normalized = text.trim().toLowerCase();
    const hash = hashText(normalized).slice(0, 16);
    this.textToHash.set(normalized, hash);
    this.cache.set(hash, embedding);
  }

  /**
   * Get all entries that need embeddings
   */
  getEntriesNeedingEmbeddings(): GlobalCacheEntry[] {
    const all = getAllGlobalEntries();
    return all.filter((entry) => !this.has(entry.text));
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; byCategory: Record<string, number>; byLanguage: Record<string, number> } {
    const all = getAllGlobalEntries();
    const byCategory: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};

    for (const entry of all) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
      byLanguage[entry.language] = (byLanguage[entry.language] ?? 0) + 1;
    }

    return {
      total: this.cache.size,
      byCategory,
      byLanguage,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.textToHash.clear();
  }
}
