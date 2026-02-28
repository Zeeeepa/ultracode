import { LRUCache } from "lru-cache";
import { log } from "../logging/index.js";
import type { SemanticAnalysis, SemanticResult, SimilarityResult, VectorEmbedding } from "../types/semantic.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CAPACITY = 5_000;
const TTL_MS = 60 * 60 * 1_000; // 1h
const MEM_CEILING_EMBEDDINGS = 100 * 1024 * 1024; // 100 MB
const MEM_CEILING_RESULTS = 50 * 1024 * 1024; // 50 MB
const MEM_CEILING_GENERAL = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheOptions {
  maxSize?: number;
  ttl?: number | undefined;
  maxAge?: number;
  updateAgeOnGet?: boolean;
  updateAgeOnHas?: boolean;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  memoryUsage: number;
}

type CacheValue = VectorEmbedding | SimilarityResult[] | Float32Array | SemanticAnalysis | SemanticResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sizeOfValue(v: CacheValue): number {
  if (v instanceof Float32Array) return v.byteLength;
  if (Array.isArray(v)) return v.length * 100;
  if (typeof v === "object" && v !== null) return JSON.stringify(v).length * 2;
  return 64;
}

function cacheKey(ns: string, k: string): string {
  return `${ns}:${k}`;
}

// ---------------------------------------------------------------------------
// SemanticCache
// ---------------------------------------------------------------------------

export class SemanticCache {
  private embeddings: LRUCache<string, Float32Array>;
  private results: LRUCache<string, SimilarityResult[]>;
  private misc: LRUCache<string, CacheValue>;

  private counters = { hits: 0, misses: 0, evictions: 0 };

  constructor(opts: CacheOptions = {}) {
    const perBucket = Math.floor((opts.maxSize ?? CAPACITY) / 3);
    const liveTtl = opts.ttl ?? TTL_MS;
    const refreshOnGet = opts.updateAgeOnGet ?? true;
    const refreshOnHas = opts.updateAgeOnHas ?? false;
    const onEvict = () => {
      this.counters.evictions++;
    };

    this.embeddings = new LRUCache<string, Float32Array>({
      max: perBucket,
      ttl: liveTtl,
      ttlAutopurge: true,
      maxSize: MEM_CEILING_EMBEDDINGS,
      sizeCalculation: (v) => v.byteLength,
      updateAgeOnGet: refreshOnGet,
      updateAgeOnHas: refreshOnHas,
      dispose: onEvict,
    });

    this.results = new LRUCache<string, SimilarityResult[]>({
      max: perBucket,
      ttl: liveTtl,
      ttlAutopurge: true,
      maxSize: MEM_CEILING_RESULTS,
      sizeCalculation: (v) => v.length * 100,
      updateAgeOnGet: refreshOnGet,
      updateAgeOnHas: refreshOnHas,
      dispose: onEvict,
    });

    this.misc = new LRUCache<string, CacheValue>({
      max: perBucket,
      ttl: liveTtl,
      ttlAutopurge: true,
      maxSize: MEM_CEILING_GENERAL,
      sizeCalculation: sizeOfValue,
      updateAgeOnGet: refreshOnGet,
      updateAgeOnHas: refreshOnHas,
      dispose: onEvict,
    });

    log.d("CACHE", "Initialized", { maxSize: opts.maxSize ?? CAPACITY, ttl: liveTtl });
  }

  // -- embeddings -----------------------------------------------------------

  setEmbedding(key: string, embedding: Float32Array, ttl?: number): void {
    this.embeddings.set(cacheKey("emb", key), embedding, ttl != null ? { ttl } : undefined);
  }

  getEmbedding(key: string): Float32Array | undefined {
    const v = this.embeddings.get(cacheKey("emb", key));
    v ? this.counters.hits++ : this.counters.misses++;
    return v;
  }

  // -- search results -------------------------------------------------------

  setSearchResults(query: string, items: SimilarityResult[], ttl?: number): void {
    this.results.set(cacheKey("sr", query), items, ttl != null ? { ttl } : undefined);
  }

  getSearchResults(query: string): SimilarityResult[] | undefined {
    const v = this.results.get(cacheKey("sr", query));
    v ? this.counters.hits++ : this.counters.misses++;
    return v;
  }

  // -- generic key/value ----------------------------------------------------

  set(key: string, value: CacheValue, ttl?: number): void {
    this.misc.set(key, value, ttl != null ? { ttl } : undefined);
  }

  get<T = CacheValue>(key: string): T | undefined {
    const v = this.misc.get(key);
    v !== undefined ? this.counters.hits++ : this.counters.misses++;
    return v as T | undefined;
  }

  // -- lookup / removal -----------------------------------------------------

  has(key: string): boolean {
    return this.embeddings.has(cacheKey("emb", key)) || this.results.has(cacheKey("sr", key)) || this.misc.has(key);
  }

  delete(key: string): boolean {
    const a = this.embeddings.delete(cacheKey("emb", key));
    const b = this.results.delete(cacheKey("sr", key));
    const c = this.misc.delete(key);
    return a || b || c;
  }

  clear(): void {
    this.embeddings.clear();
    this.results.clear();
    this.misc.clear();
    this.counters = { hits: 0, misses: 0, evictions: 0 };
    log.d("CACHE", "All caches cleared");
  }

  // -- maintenance ----------------------------------------------------------

  prune(): number {
    const before = this.size();
    this.embeddings.purgeStale();
    this.results.purgeStale();
    this.misc.purgeStale();
    const removed = before - this.size();
    log.d("CACHE", "Pruned expired entries", { count: removed });
    return removed;
  }

  size(): number {
    return this.embeddings.size + this.results.size + this.misc.size;
  }

  // -- stats ----------------------------------------------------------------

  getStats(): CacheStats {
    const total = this.counters.hits + this.counters.misses;
    return {
      size: this.size(),
      hits: this.counters.hits,
      misses: this.counters.misses,
      evictions: this.counters.evictions,
      hitRate: total > 0 ? this.counters.hits / total : 0,
      memoryUsage:
        (this.embeddings.calculatedSize || 0) + (this.results.calculatedSize || 0) + (this.misc.calculatedSize || 0),
    };
  }

  getInfo(): {
    embedding: { size: number; memory: number };
    results: { size: number; memory: number };
    general: { size: number; memory: number };
    stats: CacheStats;
  } {
    return {
      embedding: { size: this.embeddings.size, memory: this.embeddings.calculatedSize || 0 },
      results: { size: this.results.size, memory: this.results.calculatedSize || 0 },
      general: { size: this.misc.size, memory: this.misc.calculatedSize || 0 },
      stats: this.getStats(),
    };
  }

  // -- bulk operations ------------------------------------------------------

  async warmup(embeddings: Map<string, Float32Array>): Promise<void> {
    const cap = Math.floor(CAPACITY / 3);
    let loaded = 0;
    for (const [k, v] of embeddings) {
      if (loaded >= cap) break;
      this.setEmbedding(k, v);
      loaded++;
    }
    log.d("CACHE", "Warmed up", { embeddings: loaded });
  }

  export(): {
    embeddings: Array<[string, Float32Array]>;
    results: Array<[string, SimilarityResult[]]>;
    general: Array<[string, CacheValue]>;
  } {
    return {
      embeddings: Array.from(this.embeddings.entries()),
      results: Array.from(this.results.entries()),
      general: Array.from(this.misc.entries()),
    };
  }

  import(data: {
    embeddings?: Array<[string, Float32Array]>;
    results?: Array<[string, SimilarityResult[]]>;
    general?: Array<[string, CacheValue]>;
  }): void {
    if (data.embeddings) for (const [k, v] of data.embeddings) this.embeddings.set(k, v);
    if (data.results) for (const [k, v] of data.results) this.results.set(k, v);
    if (data.general) for (const [k, v] of data.general) this.misc.set(k, v);
    log.d("CACHE", "Imported entries", { count: this.size() });
  }
}
