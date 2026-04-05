/**
 * Cache Operations for LibSQL Graph Adapter
 *
 * Handles embedding cache operations (global cache by content hash).
 * This is a separate table from per-project embeddings - used for reusing
 * embeddings across projects when content is identical.
 */

import type { ClientGetter, WriteMutexFn } from "./types.js";

// =============================================================================
// CACHE OPERATIONS CLASS
// =============================================================================

export class CacheOperations {
  constructor(
    private getClient: ClientGetter,
    private writeMutex?: WriteMutexFn,
  ) {}

  /** Route write through per-DB mutex if available */
  private _w<T>(fn: () => Promise<T>): Promise<T> {
    return this.writeMutex ? this.writeMutex(fn) : fn();
  }

  /**
   * Get cached embedding by content hash.
   * Returns null if not found.
   */
  async getEmbeddingFromCache(contentHash: string): Promise<Float32Array | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const result = await client.execute({
        sql: `SELECT embedding FROM embedding_cache WHERE key = ?`,
        args: [contentHash],
      });

      if (result.rows.length === 0) return null;

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

    try {
      const placeholders = contentHashes.map(() => "?").join(",");

      for (const row of client.executeIterator({
        sql: `SELECT key, embedding FROM embedding_cache WHERE key IN (${placeholders})`,
        args: contentHashes,
      })) {
        const r = row as Record<string, unknown>;
        const hash = r["key"] as string;
        const embeddingBlob = r["embedding"] as ArrayBuffer;
        result.set(hash, new Float32Array(embeddingBlob));
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
    _textPreview?: string | undefined,
  ): Promise<void> {
    return this._w(async () => {
      const client = this.getClient();
      if (!client) return;

      const now = Date.now();
      try {
        // Zig-compatible schema: key, embedding, model, created_at, expires_at
        const embeddingBlob = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
        await client.execute({
          sql: `INSERT OR REPLACE INTO embedding_cache (key, embedding, model, created_at, expires_at)
              VALUES (?, ?, ?, ?, 0)`,
          args: [contentHash, embeddingBlob, model, now],
        });
      } catch {
        // Ignore cache write errors
      }
    }); // end _w
  }

  /**
   * Store multiple embeddings in cache (batch operation).
   */
  async setEmbeddingsInCache(
    entries: Array<{ contentHash: string; model: string; embedding: Float32Array; textPreview?: string }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    return this._w(async () => {
      const client = this.getClient();
      if (!client) return;

      const now = Date.now();
      try {
        // Zig-compatible schema: key, embedding, model, created_at, expires_at
        const statements = entries.map((entry) => ({
          sql: `INSERT OR REPLACE INTO embedding_cache (key, embedding, model, created_at, expires_at)
              VALUES (?, ?, ?, ?, 0)`,
          args: [
            entry.contentHash,
            Buffer.from(entry.embedding.buffer, entry.embedding.byteOffset, entry.embedding.byteLength),
            entry.model,
            now,
          ],
        }));

        await client.batch(statements, "write");
      } catch {
        // Ignore cache write errors
      }
    }); // end _w
  }

  async clearEmbeddingCache(): Promise<void> {
    return this._w(async () => {
      const client = this.getClient();
      if (!client) return;
      try {
        await client.execute("DELETE FROM embedding_cache");
      } catch {
        // Table may not exist yet
      }
    }); // end _w
  }
}
