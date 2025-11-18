/**
 * Vectorlite Adapter - HNSW-based vector search for large codebases
 *
 * Provides adaptive vector search using vectorlite extension with HNSW index.
 * Optimized for codebases with >10k vectors where HNSW provides 3-100x faster search.
 *
 * Key features:
 * - HNSW (Hierarchical Navigable Small World) algorithm for fast approximate search
 * - SIMD-accelerated distance calculations via Google Highway library
 * - Metadata filtering with index push-down
 * - Support for L2, Cosine, and IP distance metrics
 *
 * Trade-offs:
 * - Insert: 4-5x slower than sqlite-vec (due to HNSW index maintenance)
 * - Search: 3-100x faster than sqlite-vec (for datasets >3k vectors)
 *
 * @see https://github.com/1yefuwang1/vectorlite
 */

import type { SQLiteDatabase } from "../storage/sqlite-adapter.js";
import type { SimilarityResult, VectorEmbedding } from "../types/semantic.js";

export interface VectorliteConfig {
  dimensions: number;
  maxElements?: number; // Default: 100000
  M?: number; // Connections per layer (default: 16)
  efConstruction?: number; // Construction quality (default: 200)
  efSearch?: number; // Search quality (default: 50)
  distanceMetric?: "l2" | "cosine" | "ip"; // Default: l2
}

interface VectorliteRow {
  rowid: number;
  distance: number;
}

/**
 * Vectorlite adapter for HNSW-based vector search
 */
export class VectorliteAdapter {
  private db: SQLiteDatabase;
  private config: Required<VectorliteConfig>;
  private tableName = "vectorlite_embeddings";
  private nextRowId = 1;
  private rowIdMap = new Map<string, number>(); // entityId -> rowid mapping
  private isLoaded = false;

  constructor(db: SQLiteDatabase, config: VectorliteConfig) {
    this.db = db;
    this.config = {
      dimensions: config.dimensions,
      maxElements: config.maxElements ?? 100000,
      M: config.M ?? 16,
      efConstruction: config.efConstruction ?? 200,
      efSearch: config.efSearch ?? 50,
      distanceMetric: config.distanceMetric ?? "l2",
    };
  }

  /**
   * Load vectorlite extension
   */
  async loadExtension(): Promise<boolean> {
    try {
      // Dynamically import vectorlite
      // @ts-expect-error - vectorlite has no type definitions
      const vectorlite = await import("vectorlite");
      const extensionPath = vectorlite.default.vectorlitePath();

      this.db.loadExtension(extensionPath);

      // Verify extension loaded
      const info = this.db.prepare("SELECT vectorlite_info()").get();
      console.log("[VectorliteAdapter] Loaded extension:", info);

      this.isLoaded = true;
      return true;
    } catch (error) {
      console.warn("[VectorliteAdapter] Failed to load vectorlite extension:", error);
      return false;
    }
  }

  /**
   * Initialize vectorlite virtual table with HNSW index
   */
  initialize(): void {
    if (!this.isLoaded) {
      throw new Error("Vectorlite extension not loaded. Call loadExtension() first.");
    }

    // Create vectorlite virtual table with HNSW index
    // Format: vectorlite(vec float32[dimensions], hnsw(max_elements=N, M=16, ef_construction=200))
    const hnswParams = `max_elements=${this.config.maxElements}, M=${this.config.M}, ef_construction=${this.config.efConstruction}`;

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName} USING vectorlite(
        vec float32[${this.config.dimensions}],
        hnsw(${hnswParams})
      )
    `);

    // Create mapping table for entity metadata
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName}_metadata (
        rowid INTEGER PRIMARY KEY,
        entity_id TEXT UNIQUE NOT NULL,
        content TEXT,
        metadata TEXT,
        created_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_entity_id
      ON ${this.tableName}_metadata(entity_id);
    `);

    console.log(`[VectorliteAdapter] Initialized with ${this.config.dimensions}D HNSW index`);
  }

  /**
   * Insert vector with entity metadata
   */
  insert(embedding: VectorEmbedding): void {
    const rowid = this.nextRowId++;
    this.rowIdMap.set(embedding.id, rowid);

    // Convert Float32Array to Buffer
    const vectorBuffer = Buffer.from(embedding.vector.buffer, embedding.vector.byteOffset, embedding.vector.byteLength);

    // Insert into vectorlite table (rowid must be explicit)
    this.db.prepare(`INSERT INTO ${this.tableName}(rowid, vec) VALUES (?, ?)`).run(rowid, vectorBuffer);

    // Insert metadata
    this.db
      .prepare(`
      INSERT INTO ${this.tableName}_metadata(rowid, entity_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
      .run(
        rowid,
        embedding.id,
        embedding.content,
        embedding.metadata ? JSON.stringify(embedding.metadata) : null,
        Date.now(),
      );
  }

  /**
   * Batch insert for better performance
   */
  insertBatch(embeddings: VectorEmbedding[]): void {
    const insertVec = this.db.prepare(`INSERT INTO ${this.tableName}(rowid, vec) VALUES (?, ?)`);
    const insertMeta = this.db.prepare(`
      INSERT INTO ${this.tableName}_metadata(rowid, entity_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: VectorEmbedding[]) => {
      const now = Date.now();
      for (const item of items) {
        const rowid = this.nextRowId++;
        this.rowIdMap.set(item.id, rowid);

        const vectorBuffer = Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength);

        insertVec.run(rowid, vectorBuffer);
        insertMeta.run(rowid, item.id, item.content, item.metadata ? JSON.stringify(item.metadata) : null, now);
      }
    });

    transaction(embeddings);
  }

  /**
   * Search for similar vectors using HNSW index
   */
  search(queryVector: Float32Array, limit: number, filter?: { entityIds?: string[] }): SimilarityResult[] {
    const vectorBuffer = Buffer.from(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength);

    // Set search quality (ef_search parameter)
    // Higher = better accuracy but slower
    this.db.prepare(`PRAGMA vectorlite_ef_search = ${this.config.efSearch}`).run();

    let sql: string;
    let params: any[];

    if (filter?.entityIds && filter.entityIds.length > 0) {
      // Search with rowid filter
      const rowids = filter.entityIds
        .map((id) => this.rowIdMap.get(id))
        .filter((rid): rid is number => rid !== undefined);

      if (rowids.length === 0) {
        return []; // No valid rowids
      }

      const placeholders = rowids.map(() => "?").join(",");
      sql = `
        SELECT v.rowid, v.distance
        FROM ${this.tableName} v
        WHERE knn_search(v.vec, knn_param(?, ?))
          AND v.rowid IN (${placeholders})
      `;
      params = [vectorBuffer, limit, ...rowids];
    } else {
      // Search without filter
      sql = `
        SELECT v.rowid, v.distance
        FROM ${this.tableName} v
        WHERE knn_search(v.vec, knn_param(?, ?))
      `;
      params = [vectorBuffer, limit];
    }

    const rows = this.db.prepare(sql).all(...params) as VectorliteRow[];

    // Join with metadata
    const results: SimilarityResult[] = [];
    for (const row of rows) {
      const meta = this.db
        .prepare(`
        SELECT entity_id, content, metadata
        FROM ${this.tableName}_metadata
        WHERE rowid = ?
      `)
        .get(row.rowid) as { entity_id: string; content: string; metadata: string | null } | undefined;

      if (meta) {
        results.push({
          id: meta.entity_id,
          content: meta.content,
          similarity: 1 - row.distance, // Convert distance to similarity
          metadata: meta.metadata ? JSON.parse(meta.metadata) : undefined,
        });
      }
    }

    return results;
  }

  /**
   * Delete vector by entity ID
   */
  delete(entityId: string): void {
    const rowid = this.rowIdMap.get(entityId);
    if (rowid === undefined) {
      return; // Not found
    }

    this.db.prepare(`DELETE FROM ${this.tableName} WHERE rowid = ?`).run(rowid);
    this.db.prepare(`DELETE FROM ${this.tableName}_metadata WHERE rowid = ?`).run(rowid);
    this.rowIdMap.delete(entityId);
  }

  /**
   * Get total vector count
   */
  getCount(): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}_metadata`).get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * Clear all vectors
   */
  clear(): void {
    this.db.exec(`DELETE FROM ${this.tableName}`);
    this.db.exec(`DELETE FROM ${this.tableName}_metadata`);
    this.rowIdMap.clear();
    this.nextRowId = 1;
  }

  /**
   * Get adapter statistics
   */
  getStats(): {
    backend: string;
    vectorCount: number;
    dimensions: number;
    hnswParams: {
      M: number;
      efConstruction: number;
      efSearch: number;
      maxElements: number;
    };
  } {
    return {
      backend: "vectorlite",
      vectorCount: this.getCount(),
      dimensions: this.config.dimensions,
      hnswParams: {
        M: this.config.M,
        efConstruction: this.config.efConstruction,
        efSearch: this.config.efSearch,
        maxElements: this.config.maxElements,
      },
    };
  }
}
