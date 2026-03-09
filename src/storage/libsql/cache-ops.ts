/**
 * Cache Operations for LibSQL Graph Adapter
 *
 * Handles embedding cache operations (global cache by content hash).
 * This is a separate table from per-project embeddings - used for reusing
 * embeddings across projects when content is identical.
 */

import type { ClientGetter } from "./types.js";

// =============================================================================
// CACHE OPERATIONS CLASS
// =============================================================================

export class CacheOperations {
  constructor(private getClient: ClientGetter) {}

  /**
   * Get cached embedding by content hash.
   * Returns null if not found.
   */
  async getEmbeddingFromCache(contentHash: string): Promise<Float32Array | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const result = await client.execute({
        sql: `SELECT embedding FROM embedding_cache WHERE content_hash = ?`,
        args: [contentHash],
      });

      if (result.rows.length === 0) return null;

      // Update last_used_at and hit_count for LRU tracking
      await client.execute({
        sql: `UPDATE embedding_cache SET last_used_at = ?, hit_count = hit_count + 1 WHERE content_hash = ?`,
        args: [Date.now(), contentHash],
      });

      const row = result.rows[0];
      if (!row?.["embedding"]) return null;
      const embeddingBlob = row["embedding"] as ArrayBuffer;
      return new Float32Array(embeddingBlob);
    } catch {
      return null;
    }
  }

  /**
   * Get multiple cached embeddings by content hashes.
   * Returns Map of contentHash -> Float32Array for found entries.
   */
  async getEmbeddingsFromCache(contentHashes: string[]): Promise<Map<string, Float32Array>> {
    const client = this.getClient();
    if (!client || contentHashes.length === 0) return new Map();

    const result = new Map<string, Float32Array>();
    const now = Date.now();

    try {
      // Batch query for efficiency
      const placeholders = contentHashes.map(() => "?").join(",");
      const queryResult = await client.execute({
        sql: `SELECT content_hash, embedding FROM embedding_cache WHERE content_hash IN (${placeholders})`,
        args: contentHashes,
      });

      const foundHashes: string[] = [];
      for (const row of queryResult.rows) {
        const hash = row["content_hash"] as string;
        const embeddingBlob = row["embedding"] as ArrayBuffer;
        result.set(hash, new Float32Array(embeddingBlob));
        foundHashes.push(hash);
      }

      // Batch update last_used_at for LRU
      if (foundHashes.length > 0) {
        const updatePlaceholders = foundHashes.map(() => "?").join(",");
        await client.execute({
          sql: `UPDATE embedding_cache SET last_used_at = ?, hit_count = hit_count + 1 WHERE content_hash IN (${updatePlaceholders})`,
          args: [now, ...foundHashes],
        });
      }
    } catch {
      // Ignore cache errors
    }

    return result;
  }

  /**
   * Store embedding in cache by content hash.
   */
  async setEmbeddingInCache(
    contentHash: string,
    model: string,
    embedding: Float32Array,
    textPreview?: string | undefined,
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const now = Date.now();
    try {
      // Store embedding as raw BLOB (Float32Array → Buffer)
      const embeddingBlob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      await client.execute({
        sql: `INSERT OR REPLACE INTO embedding_cache
              (content_hash, model, embedding, text_preview, hit_count, created_at, last_used_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`,
        args: [contentHash, model, embeddingBlob, textPreview?.slice(0, 100) ?? null, now, now],
      });
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Store multiple embeddings in cache (batch operation).
   */
  async setEmbeddingsInCache(
    entries: Array<{ contentHash: string; model: string; embedding: Float32Array; textPreview?: string }>,
  ): Promise<void> {
    const client = this.getClient();
    if (!client || entries.length === 0) return;

    const now = Date.now();
    try {
      const statements = entries.map((entry) => ({
        sql: `INSERT OR REPLACE INTO embedding_cache
              (content_hash, model, embedding, text_preview, hit_count, created_at, last_used_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`,
        args: [
          entry.contentHash,
          entry.model,
          Buffer.from(entry.embedding.buffer, entry.embedding.byteOffset, entry.embedding.byteLength),
          entry.textPreview?.slice(0, 100) ?? null,
          now,
          now,
        ],
      }));

      await client.batch(statements, "write");
    } catch {
      // Ignore cache write errors
    }
  }

  async clearEmbeddingCache(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.execute("DELETE FROM embedding_cache");
    } catch {
      // Table may not exist yet
    }
  }
}
