/**
 * Entity Operations for LibSQL Graph Adapter
 *
 * Handles all Entity CRUD operations: insert, get, find, search, delete.
 * Uses delegates for accessing shared client and context.
 *
 * v6: Layered branch support - reads from delta (current branch) + base branch,
 * with tombstone filtering for deleted entities on feature branches.
 */

import { log } from "../../logging/index.js";
import type { BatchResult, Entity, EntityType } from "../../types/storage.js";
import type { ClientGetter, ContextGetter } from "./types.js";

// =============================================================================
// ROW MAPPER TYPE
// =============================================================================

/**
 * Delegate type for converting database row to Entity
 */
export type RowToEntityMapper = (row: unknown) => Entity;

/**
 * Delegate type for adding tombstone when entity is deleted on feature branch
 */
export type TombstoneAdder = (entityId: string, entityType: "entity" | "relationship") => Promise<void>;

/**
 * Delegate type for getting all tombstoned IDs for current branch
 */
export type TombstoneGetter = (entityType: "entity" | "relationship") => Promise<Set<string>>;

// =============================================================================
// ENTITY OPERATIONS CLASS
// =============================================================================

export class EntityOperations {
  private tombstoneAdder?: TombstoneAdder;
  private tombstoneGetter?: TombstoneGetter;

  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
    private rowToEntity: RowToEntityMapper,
  ) {}

  /**
   * Set tombstone delegates for layered branch support.
   * Must be called after adapter initialization.
   */
  setTombstoneDelegates(adder: TombstoneAdder, getter: TombstoneGetter): void {
    this.tombstoneAdder = adder;
    this.tombstoneGetter = getter;
  }

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
   * Get entity by ID (layered: delta → base with tombstone check)
   */
  async getEntity(id: string): Promise<Entity | null> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();
    log.w("ENTITY_OPS", "getEntity", { branch: branchName, base: baseBranch || "none" });

    // 1. Check tombstone first (if on feature branch)
    if (baseBranch && this.tombstoneGetter) {
      const tombstones = await this.tombstoneGetter("entity");
      if (tombstones.has(id)) {
        return null; // Entity was deleted on feature branch
      }
    }

    // 2. Try to find in current branch (delta)
    const result = await client.execute({
      sql: `SELECT * FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?`,
      args: [id, projectHash, branchName],
    });

    if (result.rows.length > 0) {
      return this.rowToEntity(result.rows[0]);
    }

    // 3. If on feature branch and not found in delta, check base
    if (baseBranch) {
      const baseResult = await client.execute({
        sql: `SELECT * FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?`,
        args: [id, projectHash, baseBranch],
      });

      if (baseResult.rows.length > 0) {
        return this.rowToEntity(baseResult.rows[0]);
      }
    }

    return null;
  }

  /**
   * Build filter SQL clause and args
   */
  private buildFilterClause(
    filters:
      | {
          entityType?: EntityType | EntityType[];
          filePath?: string | string[];
          name?: string | RegExp;
        }
      | undefined,
    args: (string | number)[],
  ): string {
    let sql = "";

    if (filters) {
      if (filters.entityType) {
        const types = Array.isArray(filters.entityType) ? filters.entityType : [filters.entityType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        args.push(...types);
      }

      if (filters.filePath) {
        const paths = Array.isArray(filters.filePath) ? filters.filePath : [filters.filePath];
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

      if (filters.name) {
        if (filters.name instanceof RegExp) {
          let pattern = filters.name.source;
          pattern = pattern.replace(/\.\*/g, "%").replace(/\*/g, "%").replace(/\./g, "_");
          if (!pattern.includes("%") && !pattern.includes("_")) {
            pattern = `%${pattern}%`;
          }
          sql += " AND name LIKE ?";
          args.push(pattern);
        } else {
          sql += " AND name = ?";
          args.push(filters.name);
        }
      }
    }

    return sql;
  }

  /**
   * Find entities with complex filters (layered: delta + base - tombstones)
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

    const { projectHash, branchName, baseBranch } = this.getContext();
    log.w("ENTITY_OPS", "findEntities", { branch: branchName, base: baseBranch || "none" });
    const limit = Math.min(query.limit || 100, 1000);
    const offset = query.offset || 0;

    // Simple case: no base branch
    if (!baseBranch) {
      const args: (string | number)[] = [projectHash, branchName];
      let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
      sql += this.buildFilterClause(query.filters, args);
      sql += " LIMIT ? OFFSET ?";
      args.push(limit, offset);

      const result = await client.execute({ sql, args });
      return result.rows.map((row) => this.rowToEntity(row));
    }

    // Layered case: delta + base - tombstones
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("entity") : new Set<string>();

    // Get from delta
    const deltaArgs: (string | number)[] = [projectHash, branchName];
    let deltaSql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    deltaSql += this.buildFilterClause(query.filters, deltaArgs);

    const deltaResult = await client.execute({ sql: deltaSql, args: deltaArgs });
    const deltaEntities = deltaResult.rows.map((row) => this.rowToEntity(row));
    const deltaIds = new Set(deltaEntities.map((e) => e.id));

    // Get from base
    const baseArgs: (string | number)[] = [projectHash, baseBranch];
    let baseSql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    baseSql += this.buildFilterClause(query.filters, baseArgs);

    const baseResult = await client.execute({ sql: baseSql, args: baseArgs });
    const baseEntities = baseResult.rows
      .map((row) => this.rowToEntity(row))
      .filter((e) => !deltaIds.has(e.id) && !tombstones.has(e.id));

    // Combine and apply limit/offset
    const combined = [...deltaEntities, ...baseEntities];
    return combined.slice(offset, offset + limit);
  }

  /**
   * Build search SQL clause and args
   */
  private buildSearchClause(
    options: {
      namePattern?: string;
      types?: EntityType[];
      filePath?: string;
    },
    args: (string | number)[],
  ): string {
    let sql = "";

    if (options.namePattern) {
      sql += " AND name LIKE ?";
      args.push(`%${options.namePattern}%`);
    }

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => "?").join(",")})`;
      args.push(...options.types);
    }

    if (options.filePath) {
      // Support partial path matching (e.g., "src/index.ts" matches "D:\...\src\index.ts")
      // Handle both / and \ path separators
      const normalizedPath = options.filePath.replace(/\\/g, "/");
      sql += " AND (file_path LIKE ? OR file_path LIKE ?)";
      args.push(`%${normalizedPath}`, `%${normalizedPath.replace(/\//g, "\\")}`);
    }

    return sql;
  }

  /**
   * Search entities by name pattern and type (layered: delta + base - tombstones)
   */
  async searchEntities(options: {
    namePattern?: string | undefined;
    types?: EntityType[] | undefined;
    filePath?: string | undefined;
    limit?: number;
  }): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();
    const limit = options.limit || 100;

    // Simple case: no base branch
    if (!baseBranch) {
      const args: (string | number)[] = [projectHash, branchName];
      let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
      sql += this.buildSearchClause(options, args);
      sql += " LIMIT ?";
      args.push(limit);

      const result = await client.execute({ sql, args });
      return result.rows.map((row) => this.rowToEntity(row));
    }

    // Layered case
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("entity") : new Set<string>();

    // Get from delta
    const deltaArgs: (string | number)[] = [projectHash, branchName];
    let deltaSql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    deltaSql += this.buildSearchClause(options, deltaArgs);

    const deltaResult = await client.execute({ sql: deltaSql, args: deltaArgs });
    const deltaEntities = deltaResult.rows.map((row) => this.rowToEntity(row));
    const deltaIds = new Set(deltaEntities.map((e) => e.id));

    // Get from base
    const baseArgs: (string | number)[] = [projectHash, baseBranch];
    let baseSql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    baseSql += this.buildSearchClause(options, baseArgs);

    const baseResult = await client.execute({ sql: baseSql, args: baseArgs });
    const baseEntities = baseResult.rows
      .map((row) => this.rowToEntity(row))
      .filter((e) => !deltaIds.has(e.id) && !tombstones.has(e.id));

    // Combine and limit
    return [...deltaEntities, ...baseEntities].slice(0, limit);
  }

  /**
   * Search entities by directory path (LIKE pattern) (layered: delta + base - tombstones)
   */
  async searchEntitiesInDirectory(directoryPath: string): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // Normalize path separators for cross-platform search
    const forwardPath = directoryPath.replace(/\\/g, "/");
    const backPath = directoryPath.replace(/\//g, "\\");

    // Simple case: no base branch
    if (!baseBranch) {
      const sql = `
        SELECT * FROM entities
        WHERE project_hash = ? AND branch_name = ?
        AND (file_path LIKE ? OR file_path LIKE ?)
      `;
      const args = [projectHash, branchName, `${forwardPath}%`, `${backPath}%`];

      const result = await client.execute({ sql, args });
      return result.rows.map((row) => this.rowToEntity(row));
    }

    // Layered case
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("entity") : new Set<string>();

    // Get from delta
    const deltaSql = `
      SELECT * FROM entities
      WHERE project_hash = ? AND branch_name = ?
      AND (file_path LIKE ? OR file_path LIKE ?)
    `;
    const deltaResult = await client.execute({
      sql: deltaSql,
      args: [projectHash, branchName, `${forwardPath}%`, `${backPath}%`],
    });
    const deltaEntities = deltaResult.rows.map((row) => this.rowToEntity(row));
    const deltaIds = new Set(deltaEntities.map((e) => e.id));

    // Get from base
    const baseSql = `
      SELECT * FROM entities
      WHERE project_hash = ? AND branch_name = ?
      AND (file_path LIKE ? OR file_path LIKE ?)
    `;
    const baseResult = await client.execute({
      sql: baseSql,
      args: [projectHash, baseBranch, `${forwardPath}%`, `${backPath}%`],
    });
    const baseEntities = baseResult.rows
      .map((row) => this.rowToEntity(row))
      .filter((e) => !deltaIds.has(e.id) && !tombstones.has(e.id));

    return [...deltaEntities, ...baseEntities];
  }

  /**
   * Delete entity by ID.
   * On feature branches with baseBranch set, adds tombstone instead of deleting.
   */
  async deleteEntity(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // On feature branch: add tombstone to hide entity from base
    if (baseBranch && this.tombstoneAdder) {
      await this.tombstoneAdder(id, "entity");
    }

    // Always delete from current branch (delta or base)
    await client.execute({
      sql: "DELETE FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }

  /**
   * Get entity IDs by file path (for FAISS cleanup) (layered: delta + base - tombstones)
   */
  async getEntityIdsByFilePath(filePath: string): Promise<string[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // Normalize path separators
    const forwardPath = filePath.replace(/\\/g, "/");
    const backPath = filePath.replace(/\//g, "\\");

    // Simple case: no base branch
    if (!baseBranch) {
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

    // Layered case
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("entity") : new Set<string>();

    // Get from delta
    const deltaResult = await client.execute({
      sql: `
        SELECT id FROM entities
        WHERE project_hash = ? AND branch_name = ?
        AND (file_path = ? OR file_path = ?)
      `,
      args: [projectHash, branchName, forwardPath, backPath],
    });
    const deltaIds = new Set(deltaResult.rows.map((row) => row["id"] as string));

    // Get from base
    const baseResult = await client.execute({
      sql: `
        SELECT id FROM entities
        WHERE project_hash = ? AND branch_name = ?
        AND (file_path = ? OR file_path = ?)
      `,
      args: [projectHash, baseBranch, forwardPath, backPath],
    });
    const baseIds = baseResult.rows
      .map((row) => row["id"] as string)
      .filter((id) => !deltaIds.has(id) && !tombstones.has(id));

    return [...deltaIds, ...baseIds];
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
   * Get all entities for current project/branch (layered: delta + base - tombstones)
   */
  async getAllEntities(): Promise<Entity[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // Simple case: no base branch (on base or no layering)
    if (!baseBranch) {
      const result = await client.execute({
        sql: "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?",
        args: [projectHash, branchName],
      });
      return result.rows.map((row) => this.rowToEntity(row));
    }

    // Layered case: UNION delta + base, excluding tombstones and overrides
    // 1. Get tombstones for current branch
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("entity") : new Set<string>();

    // 2. Get entities from delta (current branch)
    const deltaResult = await client.execute({
      sql: "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, branchName],
    });
    const deltaEntities = deltaResult.rows.map((row) => this.rowToEntity(row));
    const deltaIds = new Set(deltaEntities.map((e) => e.id));

    // 3. Get entities from base, excluding those overridden in delta or tombstoned
    const baseResult = await client.execute({
      sql: "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?",
      args: [projectHash, baseBranch],
    });

    const baseEntities = baseResult.rows
      .map((row) => this.rowToEntity(row))
      .filter((e) => !deltaIds.has(e.id) && !tombstones.has(e.id));

    // 4. Combine: delta first (priority), then filtered base
    return [...deltaEntities, ...baseEntities];
  }
}
