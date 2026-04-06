/**
 * Native Vector Provider — drop-in replacement for FaissProvider.
 *
 * Uses NativeVectorIndex (brute-force) + IvfIndex (TQ-accelerated ANN).
 * Pure JS — no native dependencies (faiss-node, etc.).
 * Binary-compatible vectors.idx format with Zig.
 *
 * Architecture:
 *   - Small datasets (<10K): brute-force cosine (NativeVectorIndex)
 *   - Large datasets (≥10K): IVF+TurboQuant with automatic train trigger
 *   - Tier system: hot (TQ 4-bit), warm (TQ 3-bit), cold (TQ 2-bit)
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 7
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { log } from "../logging/index.js";
import { DbWriteMutex } from "../storage/db-write-mutex.js";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";
import { HashFilter } from "./hash-filter.js";
import { type IvfConfig, IvfIndex } from "./ivf-index.js";
import { NativeVectorIndex } from "./native-vector-index.js";

// =============================================================================
// Configuration
// =============================================================================

export interface NativeVectorProviderConfig {
  dimensions: number;
  /** Directory to store vectors.idx and ivf.idx */
  persistDir?: string;
  /** IVF nprobe (default: 16) */
  nprobe?: number;
  /** Training threshold for IVF (default: 9984) */
  trainingThreshold?: number;
  /** Auto-save after N additions (default: 1000) */
  autoSaveThreshold?: number;
  /** TurboQuant seed for deterministic encoding */
  seed?: bigint;
  /** TurboQuant bit width: 2, 3, or 4 (default: 4) */
  tqBits?: number;
  /** QJL-corrected search: +1-5% recall, ~15% CPU overhead (default: true) */
  useQjl?: boolean;
}

const VECTORS_FILENAME = "vectors.idx";
const IVF_FILENAME = "ivf.idx";

// =============================================================================
// Provider
// =============================================================================

export class NativeVectorProvider {
  private config: Required<NativeVectorProviderConfig>;
  private bruteForce: NativeVectorIndex;
  private ivf: IvfIndex | null = null;
  private hashFilter: HashFilter;

  // ID mapping: string entityId ↔ internal index
  private idToIdx = new Map<string, number>();
  private idxToId = new Map<number, string>();
  private nextIdx = 0;

  // Content cache (content stored alongside vectors, unlike FAISS)
  private contentCache = new Map<string, string>();

  // Auto-save tracking
  private unsavedCount = 0;
  private isInitialized = false;

  // Mutex: prevents concurrent save() calls from corrupting index files.
  // save() does async I/O (bruteForce.save, ivf.save, writeFile) — without
  // serialization, maybeAutoSave() fire-and-forget can race with explicit save().
  private readonly saveMutex = new DbWriteMutex("vec-save");

  constructor(config: NativeVectorProviderConfig) {
    this.config = {
      dimensions: config.dimensions,
      persistDir: config.persistDir ?? "",
      nprobe: config.nprobe ?? 16,
      trainingThreshold: config.trainingThreshold ?? 9984,
      autoSaveThreshold: config.autoSaveThreshold ?? 1000,
      seed: config.seed ?? 42n,
      tqBits: config.tqBits ?? 4,
      useQjl: config.useQjl ?? true,
    };

    this.hashFilter = new HashFilter(config.dimensions);
    this.bruteForce = new NativeVectorIndex(config.dimensions);
    this.bruteForce.setHashFilter(this.hashFilter);
  }

  /** Initialize: load persisted index if available. */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (this.config.persistDir) {
      const vectorsPath = join(this.config.persistDir, VECTORS_FILENAME);
      const ivfPath = join(this.config.persistDir, IVF_FILENAME);

      try {
        if (existsSync(vectorsPath)) {
          this.bruteForce = await NativeVectorIndex.load(vectorsPath);
          this.bruteForce.setHashFilter(this.hashFilter);

          // Rebuild ID maps from loaded index
          for (let i = 0; i < this.bruteForce.count(); i++) {
            const eid = this.bruteForce.getEntityId(i);
            if (eid) {
              this.idToIdx.set(eid, i);
              this.idxToId.set(i, eid);
            }
          }
          this.nextIdx = this.bruteForce.count();

          log.i("NATIVE_VEC", `Loaded ${this.bruteForce.count()} vectors from ${vectorsPath}`);
        }

        if (existsSync(ivfPath)) {
          this.ivf = await IvfIndex.load(ivfPath, this.getIvfConfig());
          log.i("NATIVE_VEC", `Loaded IVF index (${this.ivf.totalEncoded} encoded) from ${ivfPath}`);
        }
      } catch (err) {
        log.w("NATIVE_VEC", "Failed to load persisted index, starting fresh", {
          error: (err as Error).message,
        });
      }
    }

    this.isInitialized = true;
    return true;
  }

  /** Add a single embedding. */
  async add(embedding: VectorEmbedding): Promise<void> {
    const vec = embedding.vector;
    const id = embedding.id;

    if (this.idToIdx.has(id)) {
      // Update: remove old, add new
      this.removeInternal(id);
    }

    const idx = this.nextIdx++;
    this.bruteForce.add(id, vec);
    this.idToIdx.set(id, idx);
    this.idxToId.set(idx, id);
    this.contentCache.set(id, embedding.content);

    // Add to IVF if trained
    if (this.ivf?.trained) {
      this.ivf.addEncoded(vec, idx);
    }

    this.unsavedCount++;
    this.maybeAutoSave();
  }

  /** Batch-add embeddings. */
  async addBatch(embeddings: VectorEmbedding[]): Promise<void> {
    for (const emb of embeddings) {
      await this.add(emb);
    }

    // Check if IVF needs training
    this.maybeTrainIvf();
  }

  /** Search for similar vectors. */
  async search(queryVector: Float32Array, limit = 10): Promise<SimilarityResult[]> {
    const total = this.bruteForce.count();
    if (total === 0) return [];

    // Use IVF for large datasets if trained
    if (this.ivf?.trained && total >= this.config.trainingThreshold) {
      const ivfResults = this.ivf.search(queryVector, limit);
      return ivfResults.map((r) => {
        const id = this.idxToId.get(r.masterIdx) ?? "";
        return {
          id,
          similarity: r.score,
          content: this.contentCache.get(id) ?? "",
        };
      });
    }

    // Brute-force for small datasets
    const results = this.bruteForce.search(queryVector, limit);
    return results.map((r) => ({
      id: r.entityId,
      similarity: r.score,
      content: this.contentCache.get(r.entityId) ?? "",
    }));
  }

  /** Remove embeddings by IDs. */
  async remove(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.removeInternal(id);
    }
  }

  /** Check if ID exists. */
  hasId(id: string): boolean {
    return this.idToIdx.has(id);
  }

  /** Get existing IDs from a list. */
  async getExistingIds(ids: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    for (const id of ids) {
      if (this.idToIdx.has(id)) existing.add(id);
    }
    return existing;
  }

  /** Total vector count. */
  async count(): Promise<number> {
    return this.bruteForce.count();
  }

  /** Flush pending changes — trigger save. */
  async flush(): Promise<number> {
    const saved = this.unsavedCount;
    if (saved > 0) await this.save();
    return saved;
  }

  /**
   * Save index to disk. Serialized through saveMutex to prevent concurrent
   * writes (maybeAutoSave fire-and-forget + explicit save/flush/close).
   */
  async save(): Promise<void> {
    if (!this.config.persistDir) return;

    await this.saveMutex.run(async () => {
      // Re-check inside mutex — another save may have already flushed
      if (this.unsavedCount === 0) return;

      const vectorsPath = join(this.config.persistDir, VECTORS_FILENAME);
      await this.bruteForce.save(vectorsPath);

      if (this.ivf?.trained) {
        const ivfPath = join(this.config.persistDir, IVF_FILENAME);
        await this.ivf.save(ivfPath);
      }

      // Save content cache
      const cachePath = join(this.config.persistDir, "content-cache.json");
      const cacheObj = Object.fromEntries(this.contentCache);
      await writeFile(cachePath, JSON.stringify(cacheObj));

      this.unsavedCount = 0;
      log.d("NATIVE_VEC", `Saved ${this.bruteForce.count()} vectors`);
    });
  }

  /** Close and cleanup. */
  async close(): Promise<void> {
    if (this.unsavedCount > 0) await this.save();
    this.isInitialized = false;
  }

  /** Provider statistics. */
  async getStats(): Promise<{
    totalVectors: number;
    dimensions: number;
    indexType: string;
    ivfTrained: boolean;
    ivfEncoded: number;
  }> {
    return {
      totalVectors: this.bruteForce.count(),
      dimensions: this.config.dimensions,
      indexType: this.ivf?.trained ? "ivf+tq" : "brute-force",
      ivfTrained: this.ivf?.trained ?? false,
      ivfEncoded: this.ivf?.totalEncoded ?? 0,
    };
  }

  /** Clear all vectors. */
  async clearAll(): Promise<void> {
    this.bruteForce = new NativeVectorIndex(this.config.dimensions);
    this.bruteForce.setHashFilter(this.hashFilter);
    this.ivf = null;
    this.idToIdx.clear();
    this.idxToId.clear();
    this.contentCache.clear();
    this.nextIdx = 0;
    this.unsavedCount = 0;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private removeInternal(id: string): void {
    const idx = this.idToIdx.get(id);
    if (idx === undefined) return;

    this.bruteForce.remove(id);
    if (this.ivf?.trained) this.ivf.remove(idx);

    this.idToIdx.delete(id);
    this.idxToId.delete(idx);
    this.contentCache.delete(id);
  }

  private maybeTrainIvf(): void {
    const total = this.bruteForce.count();
    if (!this.ivf) {
      if (total >= this.config.trainingThreshold) {
        this.trainIvf();
      }
    } else if (this.ivf.needsRetrain(total)) {
      this.trainIvf();
    }
  }

  private trainIvf(): void {
    const total = this.bruteForce.count();
    if (total < 16) return; // need minimum vectors for KMeans

    log.i("NATIVE_VEC", `Training IVF index on ${total} vectors...`);
    const t0 = Date.now();

    const ivf = new IvfIndex(this.getIvfConfig());
    ivf.trainAndBuild(this.bruteForce.getVectorsFlat(), total);
    this.ivf = ivf;

    log.i("NATIVE_VEC", `IVF trained in ${Date.now() - t0}ms (${ivf.totalEncoded} encoded)`);
  }

  private getIvfConfig(): IvfConfig {
    return {
      dimension: this.config.dimensions,
      nprobe: this.config.nprobe,
      trainingThreshold: this.config.trainingThreshold,
      seed: this.config.seed,
      tqBits: this.config.tqBits,
      useQjl: this.config.useQjl,
    };
  }

  private maybeAutoSave(): void {
    if (this.unsavedCount >= this.config.autoSaveThreshold) {
      // Skip if a save is already queued/running — avoid piling up save calls
      if (this.saveMutex.queueDepth > 0) return;
      this.save().catch((err) => log.w("NATIVE_VEC", "Auto-save failed", { error: (err as Error).message }));
    }
  }
}
