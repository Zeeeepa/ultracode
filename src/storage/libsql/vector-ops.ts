/**
 * Vector Operations for LibSQL Graph Adapter
 *
 * Handles all vector/embedding operations: insert, search, delete, index management.
 * Uses delegates for accessing shared client, context, and helper methods.
 */

import type { InStatement, ResultSet } from "@libsql/client";
import type { LRUCache } from "lru-cache";
import { log } from "../../logging/index.js";
import type { SimilarityResult, VectorEmbedding } from "../../types/semantic.js";
import type {
  ClientGetter,
  ContextGetter,
  LibSQLGraphConfig,
  MetadataDecoder,
  MetadataEncoder,
  SupportedDimension,
} from "./types.js";
import { DatabaseCorruptionError, isCorruptionError } from "./types.js";

// =============================================================================
// VECTOR OPERATIONS CONTEXT
// =============================================================================

/**
 * Context object providing access to shared state and helpers
 */
export interface VectorOpsContext {
  getClient: ClientGetter;
  getContext: ContextGetter;
  config: Required<LibSQLGraphConfig>;
  getEffectiveDimensions: () => SupportedDimension;
  getEmbeddingColumnName: () => string;
  vectorToString: (vector: Float32Array) => string;
  stringToVector: (str: string) => Float32Array;
  encodeMetadata: MetadataEncoder;
  decodeMetadata: MetadataDecoder;
  embeddingCache: LRUCache<string, VectorEmbedding>;
  searchCache: LRUCache<string, SimilarityResult[]>;
  ensureProjectVectorIndex: () => Promise<void>;
}

// =============================================================================
// VECTOR OPERATIONS CLASS
// =============================================================================

export class VectorOperations {
  constructor(private ctx: VectorOpsContext) {}

  /**
   * Insert a single embedding
   */
  async insertEmbedding(embedding: VectorEmbedding): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const colName = this.ctx.getEmbeddingColumnName();
    const vectorStr = this.ctx.vectorToString(embedding.vector);
    const metadataBlob = this.ctx.encodeMetadata(embedding.metadata);

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        embedding.id,
        projectHash,
        branchName,
        embedding.content,
        dims,
        vectorStr,
        metadataBlob,
        embedding.createdAt || Date.now(),
      ],
    });

    // Update cache
    const cacheKey = `${projectHash}:${branchName}:${embedding.id}`;
    this.ctx.embeddingCache.set(cacheKey, embedding);

    // Invalidate search cache (data changed)
    this.invalidateSearchCache();
  }

  /**
   * @deprecated Use FaissProvider.addBatch() instead. VectorStore v5 uses Faiss directly.
   */
  async insertEmbeddingBatch(embeddings: VectorEmbedding[]): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");
    if (embeddings.length === 0) return;

    const { projectHash, branchName } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const colName = this.ctx.getEmbeddingColumnName();
    const now = Date.now();

    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        dims,
        this.ctx.vectorToString(e.vector),
        this.ctx.encodeMetadata(e.metadata),
        e.createdAt || now,
      ],
    }));

    const batchSize = 500;
    const chunks: InStatement[][] = [];
    for (let i = 0; i < statements.length; i += batchSize) {
      chunks.push(statements.slice(i, i + batchSize));
    }

    let totalInserted = 0;

    const batchPromises = chunks.map(async (batch, index) => {
      if (!batch || batch.length === 0) return 0;
      try {
        await client.batch(batch, "write");
        return batch.length;
      } catch (error) {
        log.e("VECTOROPS", `Batch ${index} failed`, { error: (error as Error).message });
        throw error;
      }
    });

    const results = await Promise.all(batchPromises);
    totalInserted = results.reduce((sum, count) => sum + count, 0);

    // Update embedding cache
    for (const e of embeddings) {
      const cacheKey = `${projectHash}:${branchName}:${e.id}`;
      this.ctx.embeddingCache.set(cacheKey, e);
    }

    this.invalidateSearchCache();

    if (totalInserted >= 500) {
      try {
        await client.execute("PRAGMA optimize");
      } catch {
        // Ignore PRAGMA errors
      }
      try {
        await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        // Ignore checkpoint errors
      }
    }
  }

  /**
   * @deprecated Faiss HNSW handles live updates, no need to drop/rebuild.
   */
  async dropVectorIndex(): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const partialIndexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;
    const start = Date.now();
    log.t("LIBSQLINDEX", `▶ dropVectorIndex START`, { indexName: partialIndexName, projectHash, dims });

    try {
      await client.execute(`DROP INDEX IF EXISTS ${partialIndexName}`);
      log.t("LIBSQLINDEX", `◀ dropVectorIndex END`, { indexName: partialIndexName, ms: Date.now() - start });
      log.i("LIBSQLINDEX", `Dropped project vector index`, {
        indexName: partialIndexName,
        projectHash,
        dims,
        ms: Date.now() - start,
      });
    } catch (error) {
      log.w("LIBSQLINDEX", `Failed to drop project vector index`, {
        indexName: partialIndexName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * @deprecated Faiss HNSW maintains index automatically, no rebuild needed.
   */
  async rebuildVectorIndex(): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const colName = this.ctx.getEmbeddingColumnName();
    const indexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;
    const start = Date.now();
    log.w("LIBSQLINDEX", `[REBUILD] START`, { indexName, projectHash, dims });

    const indexParams = [
      `'metric=${this.ctx.config.metric}'`,
      `'compress_neighbors=${this.ctx.config.compression}'`,
      `'max_neighbors=${this.ctx.config.maxNeighbors}'`,
      `'search_l=${this.ctx.config.searchL}'`,
      `'insert_l=${this.ctx.config.insertL}'`,
    ].join(", ");

    try {
      await client.execute(`
        CREATE INDEX IF NOT EXISTS ${indexName}
        ON embeddings(libsql_vector_idx(${colName}, ${indexParams}))
        WHERE project_hash = '${projectHash}' AND dim_size = ${dims}
      `);
      const elapsed = Date.now() - start;
      log.w("LIBSQLINDEX", `[REBUILD] END`, { indexName, dims, ms: elapsed });
      log.i("LIBSQLINDEX", `Rebuilt project vector index`, { indexName, projectHash, dims, ms: elapsed });
    } catch (error) {
      log.w("LIBSQLINDEX", `Failed to rebuild project vector index`, {
        indexName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * @deprecated Use FaissProvider.addBatch() instead.
   */
  async bulkInsertEmbeddings(embeddings: VectorEmbedding[]): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");
    if (embeddings.length === 0) return;

    const start = Date.now();
    log.i("LIBSQLBULK", `Starting bulk insert`, { count: embeddings.length });

    await this.dropVectorIndex();

    const { projectHash, branchName } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const colName = this.ctx.getEmbeddingColumnName();
    const now = Date.now();

    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO embeddings
        (id, project_hash, branch_name, content, dim_size, ${colName}, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        dims,
        this.ctx.vectorToString(e.vector),
        this.ctx.encodeMetadata(e.metadata),
        e.createdAt || now,
      ],
    }));

    const batchSize = 500;
    const totalBatches = Math.ceil(statements.length / batchSize);
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      log.t("LIBSQLBULK", `  batch ${batchNum}/${totalBatches}`, { size: batch.length });
      await client.batch(batch, "write");
    }

    for (const e of embeddings) {
      const cacheKey = `${projectHash}:${branchName}:${e.id}`;
      this.ctx.embeddingCache.set(cacheKey, e);
    }

    await this.rebuildVectorIndex();
    this.invalidateSearchCache();
    log.i("LIBSQLBULK", `Bulk insert complete`, { count: embeddings.length, ms: Date.now() - start });
  }

  /**
   * Invalidate search cache
   */
  private invalidateSearchCache(): void {
    this.ctx.searchCache.clear();
  }

  /**
   * @deprecated Use FaissProvider.search() instead.
   */
  async searchVectors(queryVector: Float32Array, limit: number): Promise<SimilarityResult[]> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.ctx.getContext();
    const dims = this.ctx.getEffectiveDimensions();
    const colName = this.ctx.getEmbeddingColumnName();
    const vectorStr = this.ctx.vectorToString(queryVector);

    // Check search cache first
    const cacheKey = `${projectHash}:${branchName}:${dims}:${limit}:${Array.from(queryVector.slice(0, 16)).join(",")}`;
    const cached = this.ctx.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Check embedding count
    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ? AND dim_size = ?`,
      args: [projectHash, branchName, dims],
    });
    const embeddingCount = (countResult.rows[0]?.["cnt"] as number) || 0;

    if (embeddingCount === 0) {
      return [];
    }

    let result: ResultSet | undefined;

    if (embeddingCount <= 500) {
      result = await client.execute({
        sql: `SELECT id, content, metadata, vector_distance_cos(${colName}, vector32(?)) as distance
            FROM embeddings WHERE project_hash = ? AND branch_name = ? AND dim_size = ?
            ORDER BY distance ASC LIMIT ?`,
        args: [vectorStr, projectHash, branchName, dims, limit],
      });
    } else {
      let partialIndexName = await this.getProjectIndexName();

      if (!partialIndexName) {
        await this.ctx.ensureProjectVectorIndex();
        partialIndexName = await this.getProjectIndexName();
      }

      if (!partialIndexName) {
        throw new Error(
          `Vector index not available for project ${projectHash}. Ensure embeddings are generated first.`,
        );
      }

      result = await client.execute({
        sql: `SELECT t.id, t.content, t.metadata
            FROM vector_top_k('${partialIndexName}', vector32(?), ?) AS v
            JOIN embeddings t ON t.rowid = v.id`,
        args: [vectorStr, limit],
      });
    }

    const results = this.processVectorResults(result, limit);
    this.ctx.searchCache.set(cacheKey, results);

    return results;
  }

  /**
   * Get project-specific index name if it exists
   */
  private async getProjectIndexName(): Promise<string | null> {
    const client = this.ctx.getClient();
    if (!client) return null;

    const dims = this.ctx.getEffectiveDimensions();
    const { projectHash } = this.ctx.getContext();
    const indexName = `idx_emb_${dims}_${projectHash.substring(0, 8)}`;

    const r = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
      args: [indexName],
    });
    return r.rows.length > 0 ? indexName : null;
  }

  /**
   * Process vector search results
   */
  private processVectorResults(result: ResultSet, limit: number): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const row of result.rows) {
      const position = results.length;
      const estimatedSimilarity = Math.max(0.1, 1 - position * 0.05);
      const metadata = row["metadata"] ? this.ctx.decodeMetadata(row["metadata"] as Buffer | string) : undefined;

      results.push({
        id: row["id"] as string,
        content: row["content"] as string,
        similarity: estimatedSimilarity,
        metadata,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * @deprecated Use FaissProvider.getContent() instead.
   */
  async getEmbedding(id: string): Promise<VectorEmbedding | null> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.ctx.getContext();
    const colName = this.ctx.getEmbeddingColumnName();

    const cacheKey = `${projectHash}:${branchName}:${id}`;
    const cached = this.ctx.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await client.execute({
      sql: `
        SELECT id, content, vector_extract(${colName}) as vector, metadata, created_at
        FROM embeddings
        WHERE id = ? AND project_hash = ? AND branch_name = ?
      `,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length === 0 || !result.rows[0]) return null;
    const row = result.rows[0];

    const metadataRaw = row["metadata"];
    const metadata = metadataRaw ? this.ctx.decodeMetadata(metadataRaw as Buffer | string) : undefined;

    const embedding: VectorEmbedding = {
      id: row["id"] as string,
      content: row["content"] as string,
      vector: this.ctx.stringToVector(row["vector"] as string),
      metadata,
      createdAt: row["created_at"] as number,
    };

    this.ctx.embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * @deprecated Use FaissProvider.remove() instead.
   */
  async deleteEmbedding(id: string): Promise<void> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.ctx.getContext();
    await client.execute({
      sql: "DELETE FROM embeddings WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });

    const cacheKey = `${projectHash}:${branchName}:${id}`;
    this.ctx.embeddingCache.delete(cacheKey);
    this.invalidateSearchCache();
  }

  /**
   * @deprecated Use FaissProvider.getVectorCount() instead.
   */
  async getEmbeddingCount(): Promise<number> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.ctx.getContext();
    log.t("LIBSQL", "[getEmbeddingCount] Executing SQL...", { projectHash, branchName });
    const result = await client.execute({
      sql: "SELECT COUNT(*) as cnt FROM embeddings WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });
    log.t("LIBSQL", "[getEmbeddingCount] SQL done", { rowCount: result.rows.length });

    return (result.rows[0]?.["cnt"] as number) || 0;
  }

  /**
   * @deprecated Use FaissProvider.getExistingIds() instead.
   */
  async getExistingEmbeddingIds(ids: string[]): Promise<Set<string>> {
    const client = this.ctx.getClient();
    if (!client) throw new Error("Client not initialized");
    if (ids.length === 0) return new Set();

    const { projectHash, branchName } = this.ctx.getContext();
    if (ids.length > 0 && ids.length <= 100) {
      log.t("LIBSQL", `getExistingEmbeddingIds context`, { projectHash, branchName, idsCount: ids.length });
    }
    const existingIds = new Set<string>();

    // First check cache
    const uncachedIds: string[] = [];
    for (const id of ids) {
      const cacheKey = `${projectHash}:${branchName}:${id}`;
      if (this.ctx.embeddingCache.has(cacheKey)) {
        existingIds.add(id);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      return existingIds;
    }

    const batchSize = 500;
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      const batch = uncachedIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(",");

      try {
        const result = await client.execute({
          sql: `
            SELECT id FROM embeddings
            WHERE id IN (${placeholders})
            AND project_hash = ? AND branch_name = ?
          `,
          args: [...batch, projectHash, branchName],
        });

        if (i === 0 && batch.length > 0) {
          log.t("LIBSQL", `getExistingEmbeddingIds SQL result`, {
            queriedIds: batch.slice(0, 3),
            foundCount: result.rows.length,
            foundIds: result.rows.slice(0, 3).map((r) => r["id"]),
          });
        }

        for (const row of result.rows) {
          existingIds.add(row["id"] as string);
        }
      } catch (error) {
        if (isCorruptionError(error)) {
          throw new DatabaseCorruptionError("Database corruption detected during embedding ID check", error as Error);
        }
        throw error;
      }
    }

    return existingIds;
  }
}
