/**
 * Relationship Operations for LibSQL Graph Adapter
 *
 * Handles all Relationship CRUD operations: insert, get, find, delete.
 * Uses delegates for accessing shared client and context.
 *
 * v6: Layered branch support - reads from delta (current branch) + base branch,
 * with tombstone filtering for deleted relationships on feature branches.
 */

import type { BatchResult, Relationship, RelationType } from "../../types/storage.js";
import type { ClientGetter, ContextGetter } from "./types.js";

// =============================================================================
// ROW MAPPER TYPE
// =============================================================================

/**
 * Delegate type for converting database row to Relationship
 */
export type RowToRelationshipMapper = (row: unknown) => Relationship;

/**
 * Delegate type for adding tombstone when relationship is deleted on feature branch
 */
export type TombstoneAdder = (entityId: string, entityType: "entity" | "relationship") => Promise<void>;

/**
 * Delegate type for getting all tombstoned IDs for current branch
 */
export type TombstoneGetter = (entityType: "entity" | "relationship") => Promise<Set<string>>;

// =============================================================================
// RELATIONSHIP OPERATIONS CLASS
// =============================================================================

export class RelationshipOperations {
  private tombstoneAdder?: TombstoneAdder;
  private tombstoneGetter?: TombstoneGetter;

  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
    private rowToRelationship: RowToRelationshipMapper,
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
   * Insert a single relationship
   */
  async insertRelationship(relationship: Relationship): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO relationships
        (id, project_hash, branch_name, from_id, to_id, type, metadata, weight, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        relationship.id,
        projectHash,
        branchName,
        relationship.fromId,
        relationship.toId,
        relationship.type,
        relationship.metadata ? JSON.stringify(relationship.metadata) : null,
        relationship.weight ?? 1.0,
        relationship.createdAt ?? now,
      ],
    });
  }

  /**
   * Insert multiple relationships with batch optimization
   */
  async insertRelationships(relationships: Relationship[]): Promise<BatchResult> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");
    if (relationships.length === 0) return { processed: 0, failed: 0, errors: [], timeMs: 0 };

    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    const { projectHash, branchName } = this.getContext();
    const now = Date.now();

    // Deduplicate
    const seen = new Set<string>();
    const unique: Relationship[] = [];
    for (const r of relationships) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        unique.push(r);
      }
    }

    // OPTIMIZATION: Multi-row INSERT - single SQL statement with multiple VALUES
    // Much faster than N separate INSERT statements (reduces parsing overhead)
    // SQLite limit: ~32767 params, 9 fields per rel → batch 1000 = 9000 params (safe)
    const batchSize = 1000;

    let processed = 0;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);

      // Build multi-row VALUES clause
      const valuePlaceholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

      // Flatten all args into single array
      const args: (string | number | null)[] = [];
      for (const r of batch) {
        args.push(
          r.id,
          projectHash,
          branchName,
          r.fromId,
          r.toId,
          r.type,
          r.metadata ? JSON.stringify(r.metadata) : null,
          r.weight ?? 1.0,
          r.createdAt ?? now,
        );
      }

      const sql = `
        INSERT OR REPLACE INTO relationships
        (id, project_hash, branch_name, from_id, to_id, type, metadata, weight, created_at)
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
   * Get all relationships for an entity (as source or target) (layered: delta + base - tombstones)
   */
  async getRelationshipsForEntity(entityId: string, type?: RelationType): Promise<Relationship[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // Simple case: no base branch
    if (!baseBranch) {
      let sql = `
        SELECT * FROM relationships
        WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
      `;
      const args: (string | number)[] = [projectHash, branchName, entityId, entityId];

      if (type) {
        sql += " AND type = ?";
        args.push(type);
      }

      const result = await client.execute({ sql, args });
      return result.rows.map((row) => this.rowToRelationship(row));
    }

    // Layered case
    const tombstones = this.tombstoneGetter ? await this.tombstoneGetter("relationship") : new Set<string>();

    // Get from delta
    let deltaSql = `
      SELECT * FROM relationships
      WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
    `;
    const deltaArgs: (string | number)[] = [projectHash, branchName, entityId, entityId];
    if (type) {
      deltaSql += " AND type = ?";
      deltaArgs.push(type);
    }

    const deltaResult = await client.execute({ sql: deltaSql, args: deltaArgs });
    const deltaRels = deltaResult.rows.map((row) => this.rowToRelationship(row));
    const deltaIds = new Set(deltaRels.map((r) => r.id));

    // Get from base
    let baseSql = `
      SELECT * FROM relationships
      WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
    `;
    const baseArgs: (string | number)[] = [projectHash, baseBranch, entityId, entityId];
    if (type) {
      baseSql += " AND type = ?";
      baseArgs.push(type);
    }

    const baseResult = await client.execute({ sql: baseSql, args: baseArgs });
    const baseRels = baseResult.rows
      .map((row) => this.rowToRelationship(row))
      .filter((r) => !deltaIds.has(r.id) && !tombstones.has(r.id));

    return [...deltaRels, ...baseRels];
  }

  /**
   * Build filter clause for relationship type
   */
  private buildTypeFilter(types: RelationType | RelationType[] | undefined, args: (string | number)[]): string {
    if (!types) return "";
    const typeArray = Array.isArray(types) ? types : [types];
    args.push(...typeArray);
    return ` AND type IN (${typeArray.map(() => "?").join(",")})`;
  }

  /**
   * Build type filter for CTE (static SQL, no parameter mutation)
   */
  private buildTypeFilterForCTE(types: RelationType | RelationType[] | undefined): string {
    if (!types) return "";
    const typeArray = Array.isArray(types) ? types : [types];
    const quoted = typeArray.map((t) => `'${t}'`).join(",");
    return `AND type IN (${quoted})`;
  }

  /**
   * Find relationships with complex filters (layered: delta + base - tombstones)
   * Uses CTE for efficient layered queries with proper LIMIT/OFFSET at SQL level
   */
  async findRelationships(query: {
    filters?: { relationshipType?: RelationType | RelationType[] };
    limit?: number;
    offset?: number;
  }): Promise<Relationship[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();
    const limit = Math.min(query.limit || 100, 1000);
    const offset = query.offset || 0;

    // Simple case: no base branch
    if (!baseBranch) {
      const args: (string | number)[] = [projectHash, branchName];
      let sql = "SELECT * FROM relationships WHERE project_hash = ? AND branch_name = ?";
      sql += this.buildTypeFilter(query.filters?.relationshipType, args);
      sql += " LIMIT ? OFFSET ?";
      args.push(limit, offset);

      const result = await client.execute({ sql, args });
      return result.rows.map((row) => this.rowToRelationship(row));
    }

    // Layered case: use CTE for efficient query with SQL-level LIMIT/OFFSET
    const typeFilter = this.buildTypeFilterForCTE(query.filters?.relationshipType);

    const sql = `
      WITH
        delta AS (
          SELECT * FROM relationships
          WHERE project_hash = ?1 AND branch_name = ?2 ${typeFilter}
        ),
        tombstone_ids AS (
          SELECT entity_id FROM tombstones
          WHERE project_hash = ?1 AND branch_name = ?2 AND entity_type = 'relationship'
        ),
        base_filtered AS (
          SELECT * FROM relationships
          WHERE project_hash = ?1 AND branch_name = ?3 ${typeFilter}
            AND id NOT IN (SELECT id FROM delta)
            AND id NOT IN (SELECT entity_id FROM tombstone_ids)
        ),
        layered AS (
          SELECT * FROM delta
          UNION ALL
          SELECT * FROM base_filtered
        )
      SELECT * FROM layered
      LIMIT ?4 OFFSET ?5
    `;

    const result = await client.execute({
      sql,
      args: [projectHash, branchName, baseBranch, limit, offset],
    });

    return result.rows.map((row) => this.rowToRelationship(row));
  }

  /**
   * Delete relationship by ID.
   * On feature branches with baseBranch set, adds tombstone instead of deleting.
   */
  async deleteRelationship(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName, baseBranch } = this.getContext();

    // On feature branch: add tombstone to hide relationship from base
    if (baseBranch && this.tombstoneAdder) {
      await this.tombstoneAdder(id, "relationship");
    }

    // Always delete from current branch (delta or base)
    await client.execute({
      sql: "DELETE FROM relationships WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }
}
