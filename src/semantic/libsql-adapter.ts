/**
 * LibSQL Adapter - DiskANN-based vector search for persistent, fast vector search
 *
 * Uses libSQL (Turso's SQLite fork) with native vector support and DiskANN index.
 * Provides persistent vector storage with ANN search capabilities.
 *
 * Key features:
 * - DiskANN algorithm optimized for disk-based storage with low memory usage
 * - Full persistence by design - no data loss on restart
 * - Native TypeScript support via @libsql/client
 * - Supports L2 and Cosine distance metrics
 * - Configurable compression (float8, float16, float32)
 *
 * Trade-offs:
 * - Insert: Fast (simple storage)
 * - Search: 10-50ms for 100K vectors (ANN algorithm)
 * - Persistence: Full (SQLite-based)
 * - Memory: Low (DiskANN optimized for disk)
 *
 * @see https://docs.turso.tech/features/ai-and-embeddings
 */

import type { Client, InStatement, ResultSet } from "@libsql/client";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";

export interface LibSQLConfig {
  dimensions: number;
  metric?: "cosine" | "l2"; // Default: cosine
  compression?: "float8" | "float16" | "float32"; // Default: float32
  searchL?: number | undefined; // Neighbors visited during search (default: 200)
  insertL?: number | undefined; // Neighbors visited during insert (default: 70)
}

/**
 * LibSQL adapter for DiskANN-based vector search
 */
export class LibSQLAdapter {
  private client: Client | null = null;
  private config: Required<LibSQLConfig>;
  private tableName = "libsql_embeddings";
  private indexName = "libsql_embeddings_idx";
  private isInitialized = false;

  constructor(config: LibSQLConfig) {
    this.config = {
      dimensions: config.dimensions,
      metric: config.metric ?? "cosine",
      compression: config.compression ?? "float32",
      searchL: config.searchL ?? 200,
      insertL: config.insertL ?? 70,
    };
  }

  /**
   * Initialize libSQL client and create tables/indexes
   */
  async initialize(dbPath: string): Promise<boolean> {
    try {
      // Dynamically import @libsql/client
      const { createClient } = await import("@libsql/client");

      // Create local database client
      this.client = createClient({
        url: `file:${dbPath}`,
      });

      // Verify connection
      await this.client.execute("SELECT 1");

      // Create table with vector column
      // F32_BLOB is the 32-bit float vector type
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT PRIMARY KEY,
          project_hash TEXT NOT NULL DEFAULT 'legacy',
          branch_name TEXT NOT NULL DEFAULT 'main',
          content TEXT NOT NULL,
          embedding F32_BLOB(${this.config.dimensions}),
          metadata BLOB,
          created_at INTEGER NOT NULL
        )
      `);

      // Create regular indexes for filtering
      await this.client.execute(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_project_branch
        ON ${this.tableName}(project_hash, branch_name)
      `);

      // Create DiskANN vector index
      // Format: libsql_vector_idx(column, 'metric=cosine', 'compress_neighbors=float32')
      const indexParams = [
        `'metric=${this.config.metric}'`,
        `'compress_neighbors=${this.config.compression}'`,
        `'search_l=${this.config.searchL}'`,
        `'insert_l=${this.config.insertL}'`,
      ].join(", ");

      try {
        await this.client.execute(`
          CREATE INDEX IF NOT EXISTS ${this.indexName}
          ON ${this.tableName}(libsql_vector_idx(embedding, ${indexParams}))
        `);
        console.error(`[LibSQLAdapter] Created DiskANN index with ${this.config.metric} metric`);
      } catch (indexError) {
        // Index might already exist with different params
        console.error(`[LibSQLAdapter] Index creation note:`, (indexError as Error).message);
      }

      this.isInitialized = true;
      console.error(
        `[LibSQLAdapter] Initialized with ${this.config.dimensions}D vectors, ${this.config.metric} metric`,
      );
      return true;
    } catch (error) {
      console.error("[LibSQLAdapter] Failed to initialize:", error);
      return false;
    }
  }

  /**
   * Check if adapter is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Insert a single embedding
   */
  async insert(embedding: VectorEmbedding, projectHash: string, branchName: string): Promise<void> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const vectorStr = this.vectorToString(embedding.vector);
    const metadataBlob = embedding.metadata ? Buffer.from(JSON.stringify(embedding.metadata)) : null;
    const timestamp = embedding.createdAt || Date.now();

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO ${this.tableName}
        (id, project_hash, branch_name, content, embedding, metadata, created_at)
        VALUES (?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [embedding.id, projectHash, branchName, embedding.content, vectorStr, metadataBlob, timestamp],
    });
  }

  /**
   * Batch insert for better performance
   */
  async insertBatch(embeddings: VectorEmbedding[], projectHash: string, branchName: string): Promise<void> {
    if (!this.client) throw new Error("LibSQL client not initialized");
    if (embeddings.length === 0) return;

    const timestamp = Date.now();
    const statements: InStatement[] = embeddings.map((e) => ({
      sql: `
        INSERT OR REPLACE INTO ${this.tableName}
        (id, project_hash, branch_name, content, embedding, metadata, created_at)
        VALUES (?, ?, ?, ?, vector32(?), ?, ?)
      `,
      args: [
        e.id,
        projectHash,
        branchName,
        e.content,
        this.vectorToString(e.vector),
        e.metadata ? Buffer.from(JSON.stringify(e.metadata)) : null,
        e.createdAt || timestamp,
      ],
    }));

    // Execute in batches of 100 for better performance
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await this.client.batch(batch, "write");
    }
  }

  /**
   * Search for similar vectors using DiskANN index
   */
  async search(
    queryVector: Float32Array,
    limit: number,
    projectHash: string,
    branchName: string,
  ): Promise<SimilarityResult[]> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const vectorStr = this.vectorToString(queryVector);

    // Use vector_top_k for indexed search
    // The function returns rowid/id of k approximate nearest neighbors
    const result = await this.client.execute({
      sql: `
        SELECT t.id, t.content, t.metadata
        FROM vector_top_k('${this.indexName}', vector32(?), ?) AS v
        JOIN ${this.tableName} t ON t.rowid = v.id
        WHERE t.project_hash = ? AND t.branch_name = ?
      `,
      args: [vectorStr, limit * 2, projectHash, branchName], // Get more to filter by project
    });

    return this.processSearchResults(result, limit);
  }

  /**
   * Search without project/branch filter (for cross-project queries)
   */
  async searchAll(queryVector: Float32Array, limit: number): Promise<SimilarityResult[]> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const vectorStr = this.vectorToString(queryVector);

    const result = await this.client.execute({
      sql: `
        SELECT t.id, t.content, t.metadata
        FROM vector_top_k('${this.indexName}', vector32(?), ?) AS v
        JOIN ${this.tableName} t ON t.rowid = v.id
      `,
      args: [vectorStr, limit],
    });

    return this.processSearchResults(result, limit);
  }

  /**
   * Process search results into SimilarityResult format
   */
  private processSearchResults(result: ResultSet, limit: number): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const row of result.rows) {
      // DiskANN returns results ordered by distance
      // We don't have exact distance values from vector_top_k, so we estimate
      // based on position (closer results have higher similarity)
      const position = results.length;
      const estimatedSimilarity = Math.max(0.1, 1 - position * 0.05);

      let metadata: Record<string, unknown> | undefined;
      if (row["metadata"]) {
        try {
          // libsql returns ArrayBuffer, convert to string
          const rawMeta = row["metadata"];
          let metaStr: string;
          if (rawMeta instanceof ArrayBuffer) {
            metaStr = new TextDecoder().decode(rawMeta);
          } else if (typeof rawMeta === "string") {
            metaStr = rawMeta;
          } else {
            metaStr = Buffer.from(rawMeta as unknown as Uint8Array).toString("utf8");
          }
          metadata = JSON.parse(metaStr);
        } catch {
          // Ignore parse errors
        }
      }

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
   * Get embedding by ID
   */
  async get(id: string, projectHash: string, branchName: string): Promise<VectorEmbedding | null> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const result = await this.client.execute({
      sql: `
        SELECT id, content, vector_extract(embedding) as vector, metadata, created_at
        FROM ${this.tableName}
        WHERE id = ? AND project_hash = ? AND branch_name = ?
      `,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    if (!row) return null;

    let metadata: Record<string, unknown> | undefined;
    if (row["metadata"]) {
      try {
        // libsql returns ArrayBuffer, convert to string
        const rawMeta = row["metadata"];
        let metaStr: string;
        if (rawMeta instanceof ArrayBuffer) {
          metaStr = new TextDecoder().decode(rawMeta);
        } else if (typeof rawMeta === "string") {
          metaStr = rawMeta;
        } else {
          metaStr = Buffer.from(rawMeta as unknown as Uint8Array).toString("utf8");
        }
        metadata = JSON.parse(metaStr);
      } catch {
        // Ignore parse errors
      }
    }

    // Parse vector from string representation
    const vectorStr = row["vector"] as string;
    const vector = this.stringToVector(vectorStr);

    return {
      id: row["id"] as string,
      content: row["content"] as string,
      vector,
      metadata,
      createdAt: row["created_at"] as number,
    };
  }

  /**
   * Delete embedding by ID
   */
  async delete(id: string, projectHash: string, branchName: string): Promise<void> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    await this.client.execute({
      sql: `DELETE FROM ${this.tableName} WHERE id = ? AND project_hash = ? AND branch_name = ?`,
      args: [id, projectHash, branchName],
    });
  }

  /**
   * Get count for specific project/branch
   */
  async getCount(projectHash: string, branchName: string): Promise<number> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });

    return (result.rows[0]?.["cnt"] as number) || 0;
  }

  /**
   * Get total count across all projects
   */
  async getTotalCount(): Promise<number> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const result = await this.client.execute(`SELECT COUNT(*) as cnt FROM ${this.tableName}`);
    return (result.rows[0]?.["cnt"] as number) || 0;
  }

  /**
   * Clear embeddings for specific project/branch
   */
  async clear(projectHash: string, branchName: string): Promise<void> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    await this.client.execute({
      sql: `DELETE FROM ${this.tableName} WHERE project_hash = ? AND branch_name = ?`,
      args: [projectHash, branchName],
    });
  }

  /**
   * Clear all embeddings
   */
  async clearAll(): Promise<void> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    await this.client.execute(`DELETE FROM ${this.tableName}`);
  }

  /**
   * Close the client connection
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
      this.isInitialized = false;
    }
  }

  /**
   * Get adapter statistics
   */
  async getStats(): Promise<{
    backend: string;
    vectorCount: number;
    dimensions: number;
    metric: string;
    compression: string;
  }> {
    const count = await this.getTotalCount();
    return {
      backend: "libsql-diskann",
      vectorCount: count,
      dimensions: this.config.dimensions,
      metric: this.config.metric,
      compression: this.config.compression,
    };
  }

  /**
   * Convert Float32Array to string representation for libSQL
   * Format: '[0.1, 0.2, 0.3, ...]'
   */
  private vectorToString(vector: Float32Array): string {
    const values = Array.from(vector).map((v) => v.toFixed(6));
    return `[${values.join(", ")}]`;
  }

  /**
   * Convert string representation back to Float32Array
   */
  private stringToVector(str: string): Float32Array {
    // Parse '[0.1, 0.2, 0.3]' format
    const clean = str.replace(/[[\]]/g, "");
    const values = clean.split(",").map((s) => parseFloat(s.trim()));
    return new Float32Array(values);
  }

  /**
   * List all branches for a project
   */
  async listBranches(projectHash: string): Promise<string[]> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const result = await this.client.execute({
      sql: `SELECT DISTINCT branch_name FROM ${this.tableName} WHERE project_hash = ? ORDER BY branch_name`,
      args: [projectHash],
    });

    return result.rows.map((row) => row["branch_name"] as string);
  }

  /**
   * Get count per project
   */
  async getCountPerProject(): Promise<Array<{ projectHash: string; count: number }>> {
    if (!this.client) throw new Error("LibSQL client not initialized");

    const result = await this.client.execute(`
      SELECT project_hash, COUNT(*) as cnt
      FROM ${this.tableName}
      GROUP BY project_hash
      ORDER BY cnt DESC
    `);

    return result.rows.map((row) => ({
      projectHash: row["project_hash"] as string,
      count: row["cnt"] as number,
    }));
  }
}
