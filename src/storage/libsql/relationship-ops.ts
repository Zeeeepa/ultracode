/**
 * Relationship Operations for LibSQL Graph Adapter
 *
 * Handles all Relationship CRUD operations: insert, get, find, delete.
 * Uses delegates for accessing shared client and context.
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

// =============================================================================
// RELATIONSHIP OPERATIONS CLASS
// =============================================================================

export class RelationshipOperations {
  constructor(
    private getClient: ClientGetter,
    private getContext: ContextGetter,
    private rowToRelationship: RowToRelationshipMapper,
  ) {}

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
   * Get all relationships for an entity (as source or target)
   */
  async getRelationshipsForEntity(entityId: string, type?: RelationType): Promise<Relationship[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
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

  /**
   * Find relationships with complex filters
   */
  async findRelationships(query: {
    filters?: { relationshipType?: RelationType | RelationType[] };
    limit?: number;
    offset?: number;
  }): Promise<Relationship[]> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    let sql = "SELECT * FROM relationships WHERE project_hash = ? AND branch_name = ?";
    const args: (string | number)[] = [projectHash, branchName];

    if (query.filters?.relationshipType) {
      const types = Array.isArray(query.filters.relationshipType)
        ? query.filters.relationshipType
        : [query.filters.relationshipType];
      sql += ` AND type IN (${types.map(() => "?").join(",")})`;
      args.push(...types);
    }

    const limit = Math.min(query.limit || 100, 1000);
    sql += " LIMIT ? OFFSET ?";
    args.push(limit, query.offset || 0);

    const result = await client.execute({ sql, args });
    return result.rows.map((row) => this.rowToRelationship(row));
  }

  /**
   * Delete relationship by ID
   */
  async deleteRelationship(id: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Client not initialized");

    const { projectHash, branchName } = this.getContext();
    await client.execute({
      sql: "DELETE FROM relationships WHERE id = ? AND project_hash = ? AND branch_name = ?",
      args: [id, projectHash, branchName],
    });
  }
}
