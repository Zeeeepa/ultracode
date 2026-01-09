/**
 * Entity Operations for LibSQL Graph Adapter
 *
 * Handles all Entity CRUD operations: insert, get, find, search, delete.
 * Uses delegates for accessing shared client and context.
 */

import type { BatchResult, Entity, EntityType } from "../../types/storage.js";
import type { ClientGetter, ContextGetter } from "./types.js";

// =============================================================================
// ROW MAPPER TYPE
// =============================================================================

/**
 * Delegate type for converting database row to Entity
 */
export type RowToEntityMapper = (row: unknown) => Entity;

// =============================================================================
// ENTITY OPERATIONS CLASS
// =============================================================================

export class EntityOperations {
  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
    private rowToEntity: RowToEntityMapper,
  ) {}

  /**
   * Insert a single entity
   */
  async insertEntity(entity: Entity): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO entities
        (id, project_hash, branch_name, name, type, file_path, location, metadata, hash,
         created_at, updated_at, complexity_score, language, size_bytes, embedding_base64, embedding_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        entity.id,
        projectHash,
        branchName,
        entity.name,
        entity.type,
        entity.filePath,
        JSON.stringify(entity.location),
        JSON.stringify(entity.metadata),
        entity.hash || null,
        entity.createdAt || now,
        entity.updatedAt || now,
        entity.complexityScore || 1,
        entity.language || null,
        entity.sizeBytes || 0,
        entity.embeddingBase64 || null,
        entity.embeddingText || null,
      ],
    });
  }

  /**
   * Insert multiple entities with batch optimization
   */
  async insertEntities(entities: Entity[]): Promise<BatchResult> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");
    if (entities.length === 0) return { processed: 0, failed: 0, errors: [], timeMs: 0 };

    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique: Entity[] = [];
    for (const e of entities) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        unique.push(e);
      }
    }

    // OPTIMIZATION: Multi-row INSERT - single SQL statement with multiple VALUES
    // Much faster than N separate INSERT statements (reduces parsing overhead)
    // SQLite limit: ~32767 params, 16 fields per entity → batch 1000 = 16000 params (safe)
    const batchSize = 1000;

    let processed = 0;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);

      // Build multi-row VALUES clause
      const valuePlaceholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      // Flatten all args into single array
      const args: (string | number | null)[] = [];
      for (const entity of batch) {
        args.push(
          entity.id,
          projectHash,
          branchName,
          entity.name,
          entity.type,
          entity.filePath,
          JSON.stringify(entity.location),
          JSON.stringify(entity.metadata),
          entity.hash || null,
          entity.createdAt || now,
          entity.updatedAt || now,
          entity.complexityScore || 1,
          entity.language || null,
          entity.sizeBytes || 0,
          entity.embeddingBase64 || null,
          entity.embeddingText || null,
        );
      }

      const sql = `
        INSERT OR REPLACE INTO entities
        (id, project_hash, branch_name, name, type, file_path, location, metadata, hash,
         created_at, updated_at, complexity_score, language, size_bytes, embedding_base64, embedding_text)
        VALUES ${valuePlaceholders}
      `;

      try {
        await client.execute({ sql, args });
        processed += batch.length;
      } catch (error) {
        errors.push({
          item: { batchStart: i, batchEnd: i + batch.length },
          error: (error as Error).message,
        });
      }
    }

    return {
      processed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  /**
   * Get entity by ID
   */
  async getEntity(id: string): Promise<Entity | null> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const result = await client.execute({
      sql: `SELECT * FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?`,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length === 0) return null;
    return this.rowToEntity(result.rows[0]);
  }

  /**
   * Find entities with complex filters
   */
  async findEntities(query: {
    filters?: {
      entityType?: EntityType | EntityType[];
      filePath?: string | string[];
      name?: string | RegExp;
    };
    limit?: number;
    offset?: number;
  }): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const args: (string | number)[] = [projectHash, branchName];

    if (query.filters) {
      if (query.filters.entityType) {
        const types = Array.isArray(query.filters.entityType) ? query.filters.entityType : [query.filters.entityType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        args.push(...types);
      }

      if (query.filters.filePath) {
        const paths = Array.isArray(query.filters.filePath) ? query.filters.filePath : [query.filters.filePath];
        // Normalize paths for cross-platform
        const normalized: string[] = [];
        for (const p of paths) {
          normalized.push(p);
          if (p.includes("/")) normalized.push(p.replace(/\//g, "\\"));
          if (p.includes("\\")) normalized.push(p.replace(/\\/g, "/"));
        }
        const unique = [...new Set(normalized)];
        sql += ` AND file_path IN (${unique.map(() => "?").join(",")})`;
        args.push(...unique);
      }

      if (query.filters.name) {
        if (query.filters.name instanceof RegExp) {
          let pattern = query.filters.name.source;
          pattern = pattern.replace(/\.\*/g, "%").replace(/\*/g, "%").replace(/\./g, "_");
          if (!pattern.includes("%") && !pattern.includes("_")) {
            pattern = `%${pattern}%`;
          }
          sql += " AND name LIKE ?";
          args.push(pattern);
        } else {
          sql += " AND name = ?";
          args.push(query.filters.name);
        }
      }
    }

    const limit = Math.min(query.limit || 100, 1000);
    sql += " LIMIT ? OFFSET ?";
    args.push(limit, query.offset || 0);

    const result = await client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Search entities by name pattern and type
   */
  async searchEntities(options: {
    namePattern?: string | undefined;
    types?: EntityType[] | undefined;
    filePath?: string | undefined;
    limit?: number;
  }): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const args: (string | number)[] = [projectHash, branchName];

    if (options.namePattern) {
      sql += " AND name LIKE ?";
      args.push(`%${options.namePattern}%`);
    }

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => "?").join(",")})`;
      args.push(...options.types);
    }

    if (options.filePath) {
      sql += " AND file_path = ?";
      args.push(options.filePath);
    }

    sql += " LIMIT ?";
    args.push(options.limit || 100);

    const result = await client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Search entities by directory path (LIKE pattern)
   */
  async searchEntitiesInDirectory(directoryPath: string): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    // Normalize path separators for cross-platform search
    const forwardPath = directoryPath.replace(/\\/g, "/");
    const backPath = directoryPath.replace(/\//g, "\\");

    const sql = `
      SELECT * FROM entities
      WHERE project_hash = ? AND branch_name = ?
      AND (file_path LIKE ? OR file_path LIKE ?)
    `;
    const args = [projectHash, branchName, `${forwardPath}%`, `${backPath}%`];

    const result = await client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Delete entity by ID
   */
  async deleteEntity(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    await client.execute({
      sql: "DELETE FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }

  /**
   * Get entity IDs by file path (for FAISS cleanup)
   */
  async getEntityIdsByFilePath(filePath: string): Promise<string[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();

    // Normalize path separators
    const forwardPath = filePath.replace(/\\/g, "/");
    const backPath = filePath.replace(/\//g, "\\");

    const result = await client.execute({
      sql: `
        SELECT id FROM entities
        WHERE project_hash = ? AND branch_name = ?
        AND (file_path = ? OR file_path = ?)
      `,
      args: [projectHash, branchName, forwardPath, backPath],
    });

    return result.rows.map((row) => row["id"] as string);
  }

  /**
   * Delete all entities for a file path
   * Returns the IDs of deleted entities (for FAISS cleanup)
   */
  async deleteEntitiesByFilePath(filePath: string): Promise<string[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    // First get IDs for FAISS cleanup
    const ids = await this.getEntityIdsByFilePath(filePath);
    if (ids.length === 0) return [];

    const { projectHash, branchName } = this.getContext();

    // Normalize path separators
    const forwardPath = filePath.replace(/\\/g, "/");
    const backPath = filePath.replace(/\//g, "\\");

    await client.execute({
      sql: `
        DELETE FROM entities
        WHERE project_hash = ? AND branch_name = ?
        AND (file_path = ? OR file_path = ?)
      `,
      args: [projectHash, branchName, forwardPath, backPath],
    });

    return ids;
  }

  /**
   * Get all entities for current project/branch
   */
  async getAllEntities(): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const result = await client.execute({
      sql: "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });

    return result.rows.map((row) => this.rowToEntity(row));
  }
}
