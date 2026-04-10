import { extname } from "node:path";
import { LRUCache } from "lru-cache";
import { TS_JS_EXTENSIONS } from "../agents/dev/file-extensions.js";
import { log } from "../logging/index.js";
import type {
  CacheEntry,
  FileChange,
  ParsedEntity,
  ParseResult,
  ParserOptions,
  ParserStats,
  SupportedLanguage,
} from "../types/parser.js";
import { hashText64, initHasher } from "../utils/fast-hash.js";
import { readFilesParallel, readText } from "../utils/file-ops.js";
import { sleep } from "../utils/runtime-detection.js";
import { MultiPassOrchestrator } from "./multipass/multipass-orchestrator.js";
import { UnifiedParser } from "./unified-parser.js";

const DEFAULT_CACHE_BYTES = 100 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_TIMEOUT_MS = 30_000;
const MULTIPASS_THRESHOLD = 20;
// TS_JS_EXTENSIONS imported from file-extensions.ts

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".hxx": "cpp",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".css": "css",
  ".scss": "css",
  ".sass": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
};

type ContentHasher = (input: string) => string;

interface BatchResult {
  results: ParseResult[];
  errors: Array<{ file: string; error: Error }>;
  stats: { total: number; succeeded: number; failed: number; fromCache: number; totalTimeMs: number };
}

async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const timer = (async (): Promise<never> => {
    await sleep(ms);
    if (!ac.signal.aborted) throw new Error(`Timeout after ${ms}ms`);
    return new Promise<never>(() => {});
  })();
  try {
    const value = await Promise.race([promise, timer]);
    ac.abort();
    return value;
  } catch (err) {
    ac.abort();
    throw err;
  }
}

function extractEntitiesViaRegex(source: string): Array<{ type: string; name: string }> {
  const seen = new Set<string>();
  const entities: Array<{ type: string; name: string }> = [];
  const patterns: [RegExp, string][] = [
    [/(?:^|\s)class\s+([A-Za-z_$][\w$]*)/gm, "class"],
    [/(?:^|\s)function\s+([A-Za-z_$][\w$]*)\s*\(/gm, "function"],
    [/(?:^|\s)interface\s+([A-Za-z_$][\w$]*)\b/gm, "interface"],
    [/(?:^|\s)type\s+([A-Za-z_$][\w$]*)\s*=/gm, "type"],
  ];
  for (const [regex, kind] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(source)) !== null) {
      const id = `${kind}:${m[1]!}`;
      if (!seen.has(id)) {
        seen.add(id);
        entities.push({ type: kind, name: m[1]! });
      }
    }
  }
  return entities;
}

export class IncrementalParser {
  private parser: UnifiedParser;
  private multiPass: MultiPassOrchestrator | null = null;
  private cache: LRUCache<string, CacheEntry>;
  private hashFn: ContentHasher | null = null;
  private stats: ParserStats;
  private fileHashMap = new Map<string, string>();
  private multiPassEnabled = true;

  constructor(cacheBytes: number = DEFAULT_CACHE_BYTES) {
    this.parser = new UnifiedParser();
    this.cache = new LRUCache<string, CacheEntry>({
      max: 1000,
      maxSize: cacheBytes,
      sizeCalculation: (e) => e.size,
      updateAgeOnGet: true,
      dispose: (e) => {
        log.d("INCPARSER", "cache_evict", { hash: e.hash });
      },
    });
    this.stats = {
      filesParsed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgParseTimeMs: 0,
      totalParseTimeMs: 0,
      throughput: 0,
      cacheMemoryMB: 0,
      errorCount: 0,
    };
  }

  async initialize(): Promise<void> {
    log.i("INCPARSER", "init_start");
    await this.parser.initialize();
    if (this.multiPassEnabled) {
      try {
        this.multiPass = new MultiPassOrchestrator({ oxcConcurrency: 16, tsConcurrency: 4, workerPoolSize: 8 });
        await this.multiPass.initialize();
        log.i("INCPARSER", "multipass_init");
      } catch (err) {
        log.w("INCPARSER", "multipass_fail", { err: String(err) });
        this.multiPass = null;
      }
    }
    await initHasher();
    this.hashFn = (text: string) => hashText64(text).substring(0, 16);
    log.i("INCPARSER", "init_done");
  }

  computeFileHash(content: string): string {
    if (!this.hashFn) throw new Error("IncrementalParser not initialized - call initialize() first");
    return this.hashFn(content);
  }

  async parseFile(
    filePath: string,
    content?: string | undefined,
    options: ParserOptions = {} as ParserOptions,
  ): Promise<ParseResult> {
    const t0 = Date.now();
    const useCache = options.useCache !== false;
    try {
      const src = content ?? (await readText(filePath));
      const hash = this.computeFileHash(src);
      if (useCache) {
        const hit = this.fetchCached(filePath, hash);
        if (hit) {
          this.stats.cacheHits++;
          return hit;
        }
      }
      this.stats.cacheMisses++;
      let result: ParseResult;
      try {
        result = await raceWithTimeout(this.parser.parse(filePath, src, hash), options.timeoutMs || DEFAULT_TIMEOUT_MS);
      } catch (pe) {
        log.e("INCPARSER", "parse_fail", { file: filePath, err: String(pe) });
        throw pe;
      }
      if ((!result.errors || !result.errors.length) && (!result.entities || !result.entities.length)) {
        const extracted = extractEntitiesViaRegex(src);
        if (extracted.length) {
          result = {
            ...result,
            language: result.language || (EXTENSION_TO_LANGUAGE[extname(filePath).toLowerCase()] ?? "javascript"),
            entities: extracted as unknown as ParsedEntity[],
          };
        }
      }
      if (useCache) this.storeCached(filePath, hash, result);
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += result.parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;
      this.fileHashMap.set(filePath, hash);
      return result;
    } catch (err) {
      this.stats.errorCount++;
      log.e("INCPARSER", "parse_err", { file: filePath, err: String(err) });
      const fallback: ParseResult = {
        filePath,
        language: "javascript",
        entities: [],
        contentHash: "",
        timestamp: Date.now(),
        parseTimeMs: Date.now() - t0,
        relationships: undefined,
        errors: [{ message: err instanceof Error ? err.message : String(err) }],
      };
      if (useCache) this.storeCached(filePath, "error", fallback);
      return fallback;
    }
  }

  async parseBatch(files: string[], options: ParserOptions = {} as ParserOptions): Promise<BatchResult> {
    const batchSz = options.batchSize || DEFAULT_BATCH_SIZE;
    const t0 = Date.now();
    let cacheHitTotal = 0;
    log.i("INCPARSER", "batch_start", { cnt: files.length, batch: batchSz });
    const tsFiles: string[] = [];
    const otherFiles: string[] = [];
    for (const f of files) (TS_JS_EXTENSIONS.has(extname(f).toLowerCase()) ? tsFiles : otherFiles).push(f);
    log.d("INCPARSER", "file_dist", { ts: tsFiles.length, other: otherFiles.length });
    const useMP = this.multiPass !== null && tsFiles.length >= MULTIPASS_THRESHOLD;
    const tsOut = await this.batchTsGroup(tsFiles, options, useMP);
    cacheHitTotal += tsOut.stats.fromCache;
    const otherOut = otherFiles.length > 0 ? await this.batchStandard(otherFiles, options) : this.emptyBatch();
    cacheHitTotal += otherOut.stats.fromCache;
    const allRes = [...tsOut.results, ...otherOut.results];
    const allErr = [...tsOut.errors, ...otherOut.errors];
    const elapsed = Date.now() - t0;
    this.stats.throughput = elapsed > 0 ? (allRes.length / elapsed) * 1000 : 0;
    log.i("INCPARSER", "batch_done", {
      cnt: allRes.length,
      dur: elapsed,
      rate: Math.round(this.stats.throughput),
      multipass: useMP,
    });
    if (allErr.length) {
      log.w("INCPARSER", "batch_errors", { cnt: allErr.length });
      for (const e of allErr.slice(0, 5)) log.d("INCPARSER", "batch_err_item", { file: e.file, err: e.error.message });
    }
    return {
      results: allRes,
      errors: allErr,
      stats: {
        total: files.length,
        succeeded: allRes.length,
        failed: allErr.length,
        fromCache: cacheHitTotal,
        totalTimeMs: elapsed,
      },
    };
  }

  async processIncremental(
    changes: FileChange[],
    options: ParserOptions = {} as ParserOptions,
  ): Promise<ParseResult[]> {
    const out: ParseResult[] = [];
    log.d("INCPARSER", "incr_start", { cnt: changes.length });
    for (const ch of changes) {
      if (ch.changeType === "deleted") {
        this.evictFile(ch.filePath);
        this.fileHashMap.delete(ch.filePath);
        continue;
      }
      if (!ch.content) continue;
      const newHash = this.computeFileHash(ch.content);
      const oldHash = this.fileHashMap.get(ch.filePath);
      if (oldHash === newHash) {
        const cached = this.fetchCached(ch.filePath, newHash);
        if (cached) {
          out.push(cached);
          continue;
        }
      }
      const parsed = ch.edits?.length
        ? await this.parser.parseIncremental(ch.filePath, ch.content, newHash, ch.edits)
        : await this.parseFile(ch.filePath, ch.content, options);
      out.push(parsed);
      this.fileHashMap.set(ch.filePath, newHash);
    }
    return out;
  }

  getStats(): ParserStats {
    return { ...this.stats, ...this.parser.getStats() };
  }

  clearCache(): void {
    this.cache.clear();
    this.fileHashMap.clear();
    this.parser.clearCache();
    this.stats.cacheMemoryMB = this.cache.calculatedSize / (1024 * 1024);
    log.d("INCPARSER", "cache_clear");
  }

  async warmRestart(cacheData: Array<{ file: string; hash: string; result: ParseResult }>): Promise<void> {
    log.d("INCPARSER", "cache_warm", { cnt: cacheData.length });
    for (const item of cacheData) {
      this.storeCached(item.file, item.hash, item.result);
      this.fileHashMap.set(item.file, item.hash);
    }
    log.d("INCPARSER", "cache_warmed");
  }

  exportCache(): Array<{ file: string; hash: string; result: ParseResult }> {
    const out: Array<{ file: string; hash: string; result: ParseResult }> = [];
    for (const [key, entry] of this.cache.entries()) {
      const sep = key.indexOf(":");
      const file = sep >= 0 ? key.substring(0, sep) : key;
      if (file) out.push({ file, hash: entry.hash, result: entry.result });
    }
    return out;
  }

  private fetchCached(filePath: string, hash: string): ParseResult | null {
    const entry = this.cache.get(`${filePath}:${hash}`);
    return entry ? { ...entry.result, timestamp: Date.now(), fromCache: true } : null;
  }

  private storeCached(filePath: string, hash: string, result: ParseResult): void {
    this.cache.set(`${filePath}:${hash}`, {
      hash,
      result,
      cachedAt: Date.now(),
      size: (result.entities?.length ?? 0) * 500 + 200,
    });
    this.stats.cacheMemoryMB = this.cache.calculatedSize / (1024 * 1024);
  }

  private evictFile(filePath: string): void {
    const pfx = `${filePath}:`;
    for (const k of this.cache.keys()) if (k.startsWith(pfx)) this.cache.delete(k);
    this.stats.cacheMemoryMB = this.cache.calculatedSize / (1024 * 1024);
  }

  private async batchTsGroup(tsFiles: string[], options: ParserOptions, useMP: boolean): Promise<BatchResult> {
    if (!tsFiles.length) return this.emptyBatch();
    if (useMP) {
      log.d("INCPARSER", "multipass_use", { cnt: tsFiles.length });
      try {
        const results = await this.multiPass!.parseBatch(tsFiles, options);
        return {
          results,
          errors: [],
          stats: { total: tsFiles.length, succeeded: results.length, failed: 0, fromCache: 0, totalTimeMs: 0 },
        };
      } catch (mpErr) {
        log.w("INCPARSER", "multipass_err", { err: String(mpErr) });
      }
    }
    return this.batchStandard(tsFiles, options);
  }

  private async batchStandard(files: string[], options: ParserOptions): Promise<BatchResult> {
    const sz = options.batchSize || DEFAULT_BATCH_SIZE;
    const results: ParseResult[] = [];
    const errors: Array<{ file: string; error: Error }> = [];
    const t0 = Date.now();
    let hits = 0;
    for (let i = 0; i < files.length; i += sz) {
      const chunk = files.slice(i, i + sz);
      let contents: (string | Uint8Array)[];
      try {
        contents = await readFilesParallel(chunk, { concurrency: 24, encoding: "text" });
      } catch (ioErr) {
        log.w("INCPARSER", "read_fail", { err: String(ioErr) });
        contents = [];
        for (const f of chunk) {
          try {
            contents.push(await readText(f));
          } catch {
            contents.push("");
          }
        }
      }
      await Promise.all(
        chunk.map((file, idx) =>
          this.parseFile(file, contents[idx] as string, options)
            .then((r) => {
              if (r.fromCache) hits++;
              results.push(r);
            })
            .catch((e) => {
              errors.push({ file, error: e });
            }),
        ),
      );
      if (files.length > 100) {
        const done = Math.min(i + sz, files.length);
        if (done % 200 === 0) {
          const el = Date.now() - t0;
          log.d("INCPARSER", "batch_progress", {
            done,
            total: files.length,
            rate: Math.round((results.length / el) * 1000),
          });
        }
      }
    }
    return {
      results,
      errors,
      stats: {
        total: files.length,
        succeeded: results.length,
        failed: errors.length,
        fromCache: hits,
        totalTimeMs: Date.now() - t0,
      },
    };
  }

  private emptyBatch(): BatchResult {
    return { results: [], errors: [], stats: { total: 0, succeeded: 0, failed: 0, fromCache: 0, totalTimeMs: 0 } };
  }
}
