import { LRUCache } from "lru-cache";
import { log } from "../logging/index.js";
import type { CacheEntry, CacheManager } from "../types/storage.js";
import { hashText } from "../utils/fast-hash.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CacheConfig {
  maxSize?: number;
  maxEntries?: number;
  defaultTTL?: number;
}

const DEFAULTS = {
  maxBytes: 100 * 1024 * 1024,
  maxEntries: 2_000,
  ttlMs: 5 * 60 * 1_000,
} as const;

// ---------------------------------------------------------------------------
// Size estimation
// ---------------------------------------------------------------------------

function byteSize(v: unknown): number {
  if (v == null) return 0;
  switch (typeof v) {
    case "string":
      return v.length * 2;
    case "number":
      return 8;
    case "boolean":
      return 4;
    default:
      break;
  }
  if (v instanceof Date) return 8;
  if (Array.isArray(v)) {
    let s = 24;
    for (let i = 0; i < v.length; i++) s += byteSize(v[i]);
    return s;
  }
  if (typeof v === "object") {
    let s = 24;
    const rec = v as Record<string, unknown>;
    for (const k of Object.keys(rec)) s += k.length * 2 + byteSize(rec[k]);
    return s;
  }
  return 24;
}

// ---------------------------------------------------------------------------
// QueryCacheManager
// ---------------------------------------------------------------------------

export class QueryCacheManager implements CacheManager {
  private store: LRUCache<string, CacheEntry>;
  private counters = { hits: 0, misses: 0, evictions: 0, sets: 0 };

  constructor(cfg: CacheConfig = {}) {
    const ttl = cfg.defaultTTL ?? DEFAULTS.ttlMs;

    this.store = new LRUCache<string, CacheEntry>({
      max: cfg.maxEntries ?? DEFAULTS.maxEntries,
      maxSize: cfg.maxSize ?? DEFAULTS.maxBytes,
      sizeCalculation: (entry) => entry.size || byteSize(entry.value),
      dispose: (_v, key, reason) => {
        if (reason === "evict" || reason === "delete") {
          this.counters.evictions++;
          log.d("CACHEMGR", "evicted", { key, reason });
        }
      },
      ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      allowStale: false,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.counters.misses++;
      return null;
    }
    this.counters.hits++;
    entry.hits++;
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ?? DEFAULTS.ttlMs,
      hits: 0,
      size: byteSize(value),
    };
    this.store.set(key, entry);
    this.counters.sets++;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    log.i("CACHEMGR", "cache_cleared");
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  prune(): void {
    const removed = this.store.purgeStale();
    if (removed) log.i("CACHEMGR", "pruned_stale");
  }

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    entries: number;
    evictions: number;
    memoryUsage: number;
  } {
    const total = this.counters.hits + this.counters.misses;
    return {
      size: this.store.size,
      hits: this.counters.hits,
      misses: this.counters.misses,
      hitRate: total > 0 ? this.counters.hits / total : 0,
      entries: this.store.size,
      evictions: this.counters.evictions,
      memoryUsage: this.store.calculatedSize || 0,
    };
  }

  getEntries(): Array<{ key: string; value: CacheEntry }> {
    return Array.from(this.store.entries()).map(([key, value]) => ({ key, value }));
  }

  resetStats(): void {
    this.counters = { hits: 0, misses: 0, evictions: 0, sets: 0 };
  }

  static createKey(params: Record<string, unknown>): string {
    const keys = Object.keys(params).sort();
    const ordered: Record<string, unknown> = {};
    for (const k of keys) ordered[k] = params[k];
    return hashText(JSON.stringify(ordered)).substring(0, 16);
  }
}

// ---------------------------------------------------------------------------
// Decorator
// ---------------------------------------------------------------------------

export function Cacheable(ttl?: number) {
  return (_target: object, propertyKey: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    const mgr = new QueryCacheManager();

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const key = QueryCacheManager.createKey({ method: propertyKey, args });
      const cached = mgr.get(key);
      if (cached !== null) {
        log.d("CACHEMGR", "cache_hit", { key: propertyKey });
        return cached;
      }
      const result = await original.apply(this, args);
      mgr.set(key, result, ttl);
      return result;
    };
    return descriptor;
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: QueryCacheManager | null = null;

export function getCacheManager(config?: CacheConfig): QueryCacheManager {
  if (!instance) instance = new QueryCacheManager(config);
  return instance;
}

export function resetCacheManager(): void {
  if (instance) {
    instance.clear();
    instance = null;
  }
}
