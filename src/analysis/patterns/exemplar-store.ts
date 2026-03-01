/**
 * Exemplar Store — Loads curated code examples, lazy embeds them, caches embeddings
 *
 * ~200-500 exemplars × 384 dims × 4 bytes = ~300KB RAM
 * Cache file: .cache/pattern-exemplar-embeddings.json
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { log } from "../../logging/index.js";
import type { EmbeddingGenerator } from "../../semantic/embedding-generator.js";
import { cosineSimilarity } from "../../utils/simd-vector-ops.js";
import type { PatternExemplar } from "./types.js";

// ─── YAML Schema ───────────────────────────────────────────────────

interface ExemplarFile {
  exemplars: Array<{
    id: string;
    patternId: string;
    language: string;
    code: string;
    description: string;
  }>;
}

interface CachedEmbeddings {
  hash: string; // Hash of all exemplar codes
  embeddings: Record<string, string>; // id → base64 Float32Array
}

// ─── Store ─────────────────────────────────────────────────────────

export class ExemplarStore {
  private exemplars: Map<string, PatternExemplar> = new Map();
  private exemplarsByPattern: Map<string, PatternExemplar[]> = new Map();
  private embeddings: Map<string, Float32Array> = new Map();
  private loaded = false;
  private embedded = false;
  private cacheDir: string;

  constructor(
    private exemplarsDir?: string,
    cacheDir?: string,
  ) {
    this.cacheDir = cacheDir ?? join(process.cwd(), ".cache");
  }

  /**
   * Load exemplar YAML files
   */
  async load(exemplarsDir?: string): Promise<void> {
    if (this.loaded) return;

    const dir = exemplarsDir ?? this.exemplarsDir ?? join(import.meta.dirname, "exemplars");
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
      log.w("EXEMPLAR_STORE", "dir_not_found", { dir });
      this.loaded = true;
      return;
    }

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf-8");
        const raw = YAML.parse(content) as ExemplarFile;

        if (!raw?.exemplars) continue;

        for (const ex of raw.exemplars) {
          const exemplar: PatternExemplar = {
            id: ex.id,
            patternId: ex.patternId,
            language: ex.language,
            code: ex.code.slice(0, 400), // Enforce limit
            description: ex.description,
          };

          this.exemplars.set(ex.id, exemplar);

          const patternList = this.exemplarsByPattern.get(ex.patternId) ?? [];
          patternList.push(exemplar);
          this.exemplarsByPattern.set(ex.patternId, patternList);
        }

        log.i("EXEMPLAR_STORE", "loaded_file", { file, count: raw.exemplars.length });
      } catch (err) {
        log.e("EXEMPLAR_STORE", "load_error", { file, error: String(err) });
      }
    }

    this.loaded = true;
    log.i("EXEMPLAR_STORE", "store_ready", { total: this.exemplars.size });
  }

  /**
   * Lazy-embed all exemplars (called on first detect_patterns)
   */
  async ensureEmbeddings(embeddingGen: EmbeddingGenerator): Promise<void> {
    if (this.embedded || this.exemplars.size === 0) return;

    // Check cache
    const currentHash = this.computeHash();
    const cacheFile = join(this.cacheDir, "pattern-exemplar-embeddings.json");

    if (this.tryLoadCache(cacheFile, currentHash)) {
      this.embedded = true;
      log.i("EXEMPLAR_STORE", "cache_hit", { exemplars: this.embeddings.size });
      return;
    }

    // Generate embeddings
    log.i("EXEMPLAR_STORE", "generating_embeddings", { count: this.exemplars.size });
    const startMs = Date.now();

    for (const [id, exemplar] of this.exemplars) {
      try {
        const embedding = await embeddingGen.generateCodeEmbedding(exemplar.code, exemplar.language);
        this.embeddings.set(id, embedding);
      } catch (err) {
        log.w("EXEMPLAR_STORE", "embed_error", { id, error: String(err) });
      }
    }

    log.i("EXEMPLAR_STORE", "embeddings_generated", {
      count: this.embeddings.size,
      durationMs: Date.now() - startMs,
    });

    // Save cache
    this.saveCache(cacheFile, currentHash);
    this.embedded = true;
  }

  /**
   * Find similar exemplars for a given entity embedding and pattern
   */
  findSimilarExemplars(
    entityEmbedding: Float32Array,
    patternId: string,
    limit = 1,
  ): Array<{ id: string; similarity: number; description: string }> {
    const exemplars = this.exemplarsByPattern.get(patternId) ?? [];
    if (exemplars.length === 0) return [];

    const results: Array<{ id: string; similarity: number; description: string }> = [];

    for (const ex of exemplars) {
      const exEmbedding = this.embeddings.get(ex.id);
      if (!exEmbedding) continue;

      const similarity = cosineSimilarity(entityEmbedding, exEmbedding);
      results.push({ id: ex.id, similarity, description: ex.description });
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Get exemplar by ID
   */
  get(id: string): PatternExemplar | undefined {
    return this.exemplars.get(id);
  }

  /**
   * Get exemplars for a pattern
   */
  getForPattern(patternId: string): PatternExemplar[] {
    return this.exemplarsByPattern.get(patternId) ?? [];
  }

  get size(): number {
    return this.exemplars.size;
  }

  // ─── Cache Management ────────────────────────────────────────────

  private computeHash(): string {
    const codes = [...this.exemplars.values()]
      .map((e) => e.code)
      .sort()
      .join("|");
    return createHash("sha256").update(codes).digest("hex").slice(0, 16);
  }

  private tryLoadCache(cacheFile: string, expectedHash: string): boolean {
    try {
      if (!existsSync(cacheFile)) return false;
      const data = JSON.parse(readFileSync(cacheFile, "utf-8")) as CachedEmbeddings;
      if (data.hash !== expectedHash) return false;

      for (const [id, base64] of Object.entries(data.embeddings)) {
        if (!this.exemplars.has(id)) continue;
        const buffer = Buffer.from(base64, "base64");
        this.embeddings.set(id, new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
      }

      return this.embeddings.size > 0;
    } catch {
      return false;
    }
  }

  private saveCache(cacheFile: string, hash: string): void {
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }

      const data: CachedEmbeddings = {
        hash,
        embeddings: {},
      };

      for (const [id, embedding] of this.embeddings) {
        const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
        data.embeddings[id] = buf.toString("base64");
      }

      writeFileSync(cacheFile, JSON.stringify(data), "utf-8");
      log.i("EXEMPLAR_STORE", "cache_saved", { file: cacheFile, count: this.embeddings.size });
    } catch (err) {
      log.w("EXEMPLAR_STORE", "cache_save_error", { error: String(err) });
    }
  }
}
