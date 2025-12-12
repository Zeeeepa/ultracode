/**
 * TASK-001: Graph Storage Implementation
 *
 * Core graph storage operations for entities and relationships.
 * Provides efficient querying and traversal of the code graph.
 *
 * External Dependencies:
 * - nanoid: https://github.com/ai/nanoid - Secure unique ID generation
 *
 * Architecture References:
 * - Storage Types: src/types/storage.ts
 * - SQLite Manager: src/storage/sqlite-manager.ts
 * - Schema Migrations: src/storage/schema-migrations.ts
 */

// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { nanoid } from "nanoid";
import xxhash from "xxhash-wasm";
import { DEFAULT_BRANCH, getProjectHash, normalizeBranchName } from "../shared/storage-paths.js";
import type {
  BatchResult,
  Entity,
  EntityType,
  FileInfo,
  GraphQuery,
  GraphQueryResult,
  GraphStorage,
  Relationship,
  RelationType,
  StorageMetrics,
} from "../types/storage.js";

// Re-export GraphStorage interface for external use
export type { GraphStorage } from "../types/storage.js";

import type { SQLiteDatabase, SQLiteStatement } from "./sqlite-adapter.js";
import type { SQLiteManager } from "./sqlite-manager.js";

// =============================================================================
// PROJECT CONTEXT TYPE
// =============================================================================

/**
 * Project context for all storage operations
 * Contains project_hash and branch_name for filtering queries
 */
export interface ProjectContext {
  projectHash: string;
  branchName: string;
}

/**
 * Create project context from project path and optional branch
 */
export function createProjectContext(projectPath: string, branchName?: string): ProjectContext {
  return {
    projectHash: getProjectHash(projectPath),
    branchName: normalizeBranchName(branchName || DEFAULT_BRANCH),
  };
}

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
const ID_LENGTH = 12;
const DEFAULT_QUERY_LIMIT = 100;
const MAX_QUERY_LIMIT = 1000;
const MAX_SUBGRAPH_DEPTH = 5;

// =============================================================================
// 3. GRAPH STORAGE IMPLEMENTATION
// =============================================================================

export class GraphStorageImpl implements GraphStorage {
  private db: SQLiteDatabase;
  private sqliteManager: SQLiteManager;
  private xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;
  private _debugLoggedInsert = false; // DEBUG flag for logging

  // Current project context for all operations
  private currentContext: ProjectContext = {
    projectHash: "legacy",
    branchName: DEFAULT_BRANCH,
  };

  // Prepared statements for performance
  private statements: {
    insertEntity?: SQLiteStatement;
    updateEntity?: SQLiteStatement;
    deleteEntity?: SQLiteStatement;
    getEntity?: SQLiteStatement;
    insertRelationship?: SQLiteStatement;
    deleteRelationship?: SQLiteStatement;
    updateFile?: SQLiteStatement;
    getFile?: SQLiteStatement;
    insertPerformanceMetric?: SQLiteStatement;
    upsertProjectMeta?: SQLiteStatement;
  } = {};

  constructor(sqliteManager: SQLiteManager) {
    this.sqliteManager = sqliteManager;
    this.db = sqliteManager.getConnection();
    this.prepareStatements();
  }

  /**
   * Set the current project context for all subsequent operations
   * This replaces the old "switch project" pattern - no reconnection needed
   */
  setProjectContext(context: ProjectContext): void {
    const oldContext = this.currentContext;
    this.currentContext = context;
    console.error(
      `[GraphStorage] Context CHANGED: ${oldContext.projectHash}/${oldContext.branchName} -> ${context.projectHash}/${context.branchName}`,
    );
  }

  /**
   * Set project context from path and branch
   */
  setProject(projectPath: string, branchName?: string): void {
    this.setProjectContext(createProjectContext(projectPath, branchName));
  }

  /**
   * Get current project context
   */
  getProjectContext(): ProjectContext {
    return { ...this.currentContext };
  }

  async initialize(): Promise<void> {
    this.ensureReady(true);
    // Initialize xxHash for fast entity ID generation
    this.xxhashInstance = await xxhash();
  }

  private ensureReady(force = false): void {
    if (!this.sqliteManager) {
      throw new Error("SQLiteManager is required but not provided");
    }

    try {
      if (!force && this.sqliteManager.isOpen()) {
        this.db.pragma("user_version");
        return;
      }
    } catch {}

    if (!this.sqliteManager.isOpen()) {
      this.sqliteManager.initialize();
    }

    if (force) {
      this.db = this.sqliteManager.getConnection();
      this.prepareStatements();
    }
  }

  /**
   * Prepare frequently used statements
   * v3: All statements now include project_hash and branch_name
   */
  private prepareStatements(): void {
    // Enhanced entity operations with v3 project context
    this.statements.insertEntity = this.db.prepare(`
      INSERT INTO entities
      (id, name, type, file_path, location, metadata, hash, created_at, updated_at,
       complexity_score, language, size_bytes, project_hash, branch_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        file_path = excluded.file_path,
        location = excluded.location,
        metadata = excluded.metadata,
        hash = COALESCE(excluded.hash, entities.hash),
        updated_at = excluded.updated_at,
        complexity_score = excluded.complexity_score,
        language = excluded.language,
        size_bytes = excluded.size_bytes,
        project_hash = excluded.project_hash,
        branch_name = excluded.branch_name
    `);

    this.statements.updateEntity = this.db.prepare(`
      UPDATE entities
      SET name = ?, type = ?, location = ?, metadata = ?, hash = ?, updated_at = ?,
          complexity_score = ?, language = ?, size_bytes = ?
      WHERE id = ? AND project_hash = ? AND branch_name = ?
    `);

    this.statements.deleteEntity = this.db.prepare(`
      DELETE FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?
    `);

    this.statements.getEntity = this.db.prepare(`
      SELECT * FROM entities WHERE id = ? AND project_hash = ? AND branch_name = ?
    `);

    // Enhanced relationship operations with v3 project context
    this.statements.insertRelationship = this.db.prepare(`
      INSERT INTO relationships
      (id, from_id, to_id, type, metadata, weight, created_at, project_hash, branch_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        metadata = COALESCE(excluded.metadata, relationships.metadata),
        weight = excluded.weight,
        project_hash = excluded.project_hash,
        branch_name = excluded.branch_name
    `);

    this.statements.deleteRelationship = this.db.prepare(`
      DELETE FROM relationships WHERE id = ? AND project_hash = ? AND branch_name = ?
    `);

    this.statements.updateFile = this.db.prepare(`
      INSERT OR REPLACE INTO files
      (path, hash, last_indexed, entity_count, project_hash, branch_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.statements.getFile = this.db.prepare(`
      SELECT * FROM files WHERE path = ? AND project_hash = ? AND branch_name = ?
    `);

    // Performance monitoring statement
    this.statements.insertPerformanceMetric = this.db.prepare(`
      INSERT INTO performance_metrics (id, operation, duration_ms, entity_count, memory_usage, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Project metadata upsert
    this.statements.upsertProjectMeta = this.db.prepare(`
      INSERT INTO project_metadata
      (project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_hash, branch_name) DO UPDATE SET
        project_path = excluded.project_path,
        last_indexed_at = excluded.last_indexed_at,
        entity_count = excluded.entity_count,
        file_count = excluded.file_count,
        updated_at = excluded.updated_at
    `);
  }

  // =============================================================================
  // 4. ENTITY OPERATIONS
  // =============================================================================

  async insertEntity(entity: Entity): Promise<void> {
    return this.measureOperation(
      "insert_entity",
      () => {
        const now = Date.now();
        const { projectHash, branchName } = this.currentContext;

        // DEBUG: Log first entity insert per batch to verify context
        if (!this._debugLoggedInsert) {
          console.error(
            `[GraphStorage] INSERT ENTITY with context: ${projectHash}/${branchName}, entity: ${entity.name}`,
          );
          this._debugLoggedInsert = true;
        }

        const id = this.stableEntityId(entity);

        // Calculate complexity score and language if not provided
        const complexityScore = entity.complexityScore ?? this.calculateComplexity(entity);
        const language = entity.language ?? this.detectLanguage(entity.filePath);
        const sizeBytes = entity.sizeBytes ?? 0;

        this.statements.insertEntity?.run(
          id,
          entity.name,
          entity.type,
          entity.filePath,
          JSON.stringify(entity.location),
          JSON.stringify(entity.metadata),
          entity.hash,
          entity.createdAt || now,
          entity.updatedAt || now,
          complexityScore,
          language,
          sizeBytes,
          projectHash,
          branchName,
        );
      },
      1,
    );
  }

  async insertEntities(entities: Entity[]): Promise<BatchResult> {
    this.ensureReady();
    return this.measureOperation(
      "insert_entities_batch",
      () => {
        const start = Date.now();
        const errors: Array<{ item: unknown; error: string }> = [];
        let processed = 0;
        const { projectHash, branchName } = this.currentContext;

        const seen = new Set<string>();
        const uniq: Entity[] = [];
        for (const e of entities) {
          const key = this.entityKey(e);
          if (!seen.has(key)) {
            seen.add(key);
            uniq.push(e);
          }
        }

        const tx = this.db.transaction((items: Entity[]) => {
          for (const entity of items) {
            try {
              const now = Date.now();
              const id = this.stableEntityId(entity);

              // Calculate enhanced fields
              const complexityScore = entity.complexityScore ?? this.calculateComplexity(entity);
              const language = entity.language ?? this.detectLanguage(entity.filePath);
              const sizeBytes = entity.sizeBytes ?? 0;

              this.statements.insertEntity?.run(
                id,
                entity.name,
                entity.type,
                entity.filePath,
                JSON.stringify(entity.location),
                JSON.stringify(entity.metadata),
                entity.hash,
                entity.createdAt || now,
                entity.updatedAt || now,
                complexityScore,
                language,
                sizeBytes,
                projectHash,
                branchName,
              );

              processed++;
            } catch (error) {
              errors.push({
                item: entity,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        });

        try {
          tx(uniq);
        } catch (error) {
          console.error("[GraphStorage] Batch insert failed:", error);
        }

        return {
          processed,
          failed: errors.length,
          errors,
          timeMs: Date.now() - start,
        };
      },
      entities.length,
    );
  }

  async updateEntity(id: string, updates: Partial<Entity>): Promise<void> {
    this.ensureReady();
    const existing = await this.getEntity(id);
    if (!existing) {
      throw new Error(`Entity ${id} not found`);
    }

    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    const { projectHash, branchName } = this.currentContext;

    // Recalculate enhanced fields if necessary
    const complexityScore = updated.complexityScore ?? this.calculateComplexity(updated);
    const language = updated.language ?? this.detectLanguage(updated.filePath);
    const sizeBytes = updated.sizeBytes ?? 0;

    this.statements.updateEntity?.run(
      updated.name,
      updated.type,
      JSON.stringify(updated.location),
      JSON.stringify(updated.metadata),
      updated.hash,
      updated.updatedAt,
      complexityScore,
      language,
      sizeBytes,
      id,
      projectHash,
      branchName,
    );
  }

  async deleteEntity(id: string): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    this.statements.deleteEntity?.run(id, projectHash, branchName);
  }

  async getEntity(id: string): Promise<Entity | null> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const row = this.statements.getEntity?.get(id, projectHash, branchName) as any;
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Get entity from specific branch (for cross-branch comparisons)
   * This enables "find X in branch-1 and compare with branch-2" scenarios
   */
  async getEntityFromBranch(id: string, targetBranch: string): Promise<Entity | null> {
    this.ensureReady();
    const { projectHash } = this.currentContext;
    const normalizedBranch = normalizeBranchName(targetBranch);
    const row = this.statements.getEntity?.get(id, projectHash, normalizedBranch) as any;
    return row ? this.rowToEntity(row) : null;
  }

  async findEntities(query: GraphQuery): Promise<Entity[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;

    // DEBUG: Log context on every query
    console.error(
      `[GraphStorage.findEntities] Query with context: projectHash=${projectHash}, branchName=${branchName}, filters=${JSON.stringify(query.filters)}`,
    );

    // Always filter by current project context
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const params: any[] = [projectHash, branchName];

    // Apply filters
    if (query.filters) {
      if (query.filters.entityType) {
        const types = Array.isArray(query.filters.entityType) ? query.filters.entityType : [query.filters.entityType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        params.push(...types);
      }

      if (query.filters.filePath) {
        const paths = Array.isArray(query.filters.filePath) ? query.filters.filePath : [query.filters.filePath];
        // Normalize paths: try both forward and backslash variants for cross-platform compatibility
        const normalizedPaths: string[] = [];
        for (const p of paths) {
          normalizedPaths.push(p);
          // Add backslash variant if path contains forward slashes
          if (p.includes("/")) {
            normalizedPaths.push(p.replace(/\//g, "\\"));
          }
          // Add forward slash variant if path contains backslashes
          if (p.includes("\\")) {
            normalizedPaths.push(p.replace(/\\/g, "/"));
          }
        }
        const uniquePaths = [...new Set(normalizedPaths)];
        sql += ` AND file_path IN (${uniquePaths.map(() => "?").join(",")})`;
        params.push(...uniquePaths);
      }

      if (query.filters.name) {
        if (query.filters.name instanceof RegExp) {
          // Convert regex to SQL LIKE pattern
          let pattern = query.filters.name.source;
          // Replace regex wildcards with SQL wildcards
          pattern = pattern.replace(/\.\*/g, "%"); // .* -> %
          pattern = pattern.replace(/\*/g, "%"); // * -> %
          pattern = pattern.replace(/\./g, "_"); // . -> _ (single char)
          // If pattern doesn't contain wildcards, wrap with % for substring search
          if (!pattern.includes("%") && !pattern.includes("_")) {
            pattern = `%${pattern}%`;
          }
          sql += " AND name LIKE ?";
          params.push(pattern);
        } else {
          sql += " AND name = ?";
          params.push(query.filters.name);
        }
      }
    }

    // Apply limit and offset
    const limit = Math.min(query.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, query.offset || 0);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find entities in a specific branch (for cross-branch comparisons)
   * Example: findEntitiesInBranch(query, "feature/new-api") to compare with current branch
   */
  async findEntitiesInBranch(query: GraphQuery, targetBranch: string): Promise<Entity[]> {
    this.ensureReady();
    const { projectHash } = this.currentContext;
    const normalizedBranch = normalizeBranchName(targetBranch);

    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const params: any[] = [projectHash, normalizedBranch];

    // Apply same filters as findEntities
    if (query.filters) {
      if (query.filters.entityType) {
        const types = Array.isArray(query.filters.entityType) ? query.filters.entityType : [query.filters.entityType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        params.push(...types);
      }
      if (query.filters.filePath) {
        const paths = Array.isArray(query.filters.filePath) ? query.filters.filePath : [query.filters.filePath];
        sql += ` AND file_path IN (${paths.map(() => "?").join(",")})`;
        params.push(...paths);
      }
      if (query.filters.name) {
        if (query.filters.name instanceof RegExp) {
          let pattern = query.filters.name.source.replace(/\.\*/g, "%").replace(/\*/g, "%").replace(/\./g, "_");
          if (!pattern.includes("%") && !pattern.includes("_")) pattern = `%${pattern}%`;
          sql += " AND name LIKE ?";
          params.push(pattern);
        } else {
          sql += " AND name = ?";
          params.push(query.filters.name);
        }
      }
    }

    const limit = Math.min(query.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, query.offset || 0);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Compare entities between two branches
   * Returns entities that exist in both branches for comparison
   */
  async compareEntitiesBetweenBranches(
    namePattern: string,
    branch1: string,
    branch2: string,
  ): Promise<{ branch1Entities: Entity[]; branch2Entities: Entity[]; matched: Array<[Entity, Entity]> }> {
    this.ensureReady();
    const norm1 = normalizeBranchName(branch1);
    const norm2 = normalizeBranchName(branch2);

    const query: GraphQuery = {
      type: "entity",
      filters: { name: new RegExp(namePattern) },
      limit: MAX_QUERY_LIMIT,
    };

    // Get entities from both branches in parallel
    const [entities1, entities2] = await Promise.all([
      this.findEntitiesInBranch(query, norm1),
      this.findEntitiesInBranch(query, norm2),
    ]);

    // Match by stable ID (same file+name+location = same entity)
    const map1 = new Map(entities1.map((e) => [this.entityKey(e), e]));
    const matched: Array<[Entity, Entity]> = [];

    for (const e2 of entities2) {
      const key = this.entityKey(e2);
      const e1 = map1.get(key);
      if (e1) {
        matched.push([e1, e2]);
      }
    }

    return { branch1Entities: entities1, branch2Entities: entities2, matched };
  }

  /**
   * Get all entities for current project/branch (for Chaos Analysis)
   */
  async getAllEntities(): Promise<Entity[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const rows = this.db.prepare(sql).all(projectHash, branchName) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Search entities by pattern (for Chaos Analysis)
   */
  async searchEntities(options: { namePattern?: string; types?: EntityType[]; filePath?: string }): Promise<Entity[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    let sql = "SELECT * FROM entities WHERE project_hash = ? AND branch_name = ?";
    const params: any[] = [projectHash, branchName];

    if (options.namePattern) {
      sql += " AND name LIKE ?";
      params.push(`%${options.namePattern}%`);
    }

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => "?").join(",")})`;
      params.push(...options.types);
    }

    if (options.filePath) {
      sql += " AND file_path = ?";
      params.push(options.filePath);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToEntity(row));
  }

  // =============================================================================
  // 5. RELATIONSHIP OPERATIONS
  // =============================================================================

  async insertRelationship(relationship: Relationship): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const id = this.stableRelationshipId(relationship);
    const now = Date.now();

    this.statements.insertRelationship?.run(
      id,
      relationship.fromId,
      relationship.toId,
      relationship.type,
      relationship.metadata ? JSON.stringify(relationship.metadata) : null,
      relationship.weight ?? 1.0,
      relationship.createdAt ?? now,
      projectHash,
      branchName,
    );
  }

  async insertRelationships(relationships: Relationship[]): Promise<BatchResult> {
    this.ensureReady();
    const start = Date.now();
    const errors: Array<{ item: unknown; error: string }> = [];
    let processed = 0;
    const { projectHash, branchName } = this.currentContext;

    const seen = new Set<string>();
    const uniq: Relationship[] = [];
    for (const r of relationships) {
      const key = this.relationshipKey(r);
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(r);
      }
    }

    const tx = this.db.transaction((rels: Relationship[]) => {
      for (const r of rels) {
        try {
          const id = this.stableRelationshipId(r);
          const now = Date.now();
          this.statements.insertRelationship?.run(
            id,
            r.fromId,
            r.toId,
            r.type,
            r.metadata ? JSON.stringify(r.metadata) : null,
            r.weight ?? 1.0,
            r.createdAt ?? now,
            projectHash,
            branchName,
          );
          processed++;
        } catch (error) {
          errors.push({ item: r, error: error instanceof Error ? error.message : String(error) });
        }
      }
    });

    try {
      tx(uniq);
    } catch (error) {
      console.error("[GraphStorage] Batch relationship insert failed:", error);
    }

    return {
      processed,
      failed: errors.length,
      errors,
      timeMs: Date.now() - start,
    };
  }

  async deleteRelationship(id: string): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    this.statements.deleteRelationship?.run(id, projectHash, branchName);
  }

  async getRelationshipsForEntity(entityId: string, type?: RelationType): Promise<Relationship[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    let sql = `
      SELECT * FROM relationships
      WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
    `;
    const params: any[] = [projectHash, branchName, entityId, entityId];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  async findRelationships(query: GraphQuery): Promise<Relationship[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    let sql = "SELECT * FROM relationships WHERE project_hash = ? AND branch_name = ?";
    const params: any[] = [projectHash, branchName];

    // Apply filters
    if (query.filters) {
      if (query.filters.relationshipType) {
        const types = Array.isArray(query.filters.relationshipType)
          ? query.filters.relationshipType
          : [query.filters.relationshipType];
        sql += ` AND type IN (${types.map(() => "?").join(",")})`;
        params.push(...types);
      }
    }

    // Apply limit and offset
    const limit = Math.min(query.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, query.offset || 0);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  /**
   * Get relationships (alias for getRelationshipsForEntity - for Chaos Analysis)
   */
  async getRelationships(sourceId: string, type?: RelationType): Promise<Relationship[]> {
    return this.getRelationshipsForEntity(sourceId, type);
  }

  /**
   * Get relationships from a specific branch (for cross-branch comparisons)
   */
  async getRelationshipsFromBranch(
    entityId: string,
    targetBranch: string,
    type?: RelationType,
  ): Promise<Relationship[]> {
    this.ensureReady();
    const { projectHash } = this.currentContext;
    const normalizedBranch = normalizeBranchName(targetBranch);
    let sql = `
      SELECT * FROM relationships
      WHERE project_hash = ? AND branch_name = ? AND (from_id = ? OR to_id = ?)
    `;
    const params: any[] = [projectHash, normalizedBranch, entityId, entityId];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  /**
   * Find incoming relationships by entity name (for NgRx flow tracing)
   * Searches relationships where toId points to an entity with matching name
   */
  async findIncomingRelationshipsByName(entityName: string, types?: RelationType[]): Promise<Relationship[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;

    // First, find all entities that reference this name in their toId
    // This handles cases where toId is a phantom entity with name like "file:actionName"
    let sql = `
      SELECT r.* FROM relationships r
      JOIN entities e ON r.to_id = e.id
      WHERE r.project_hash = ? AND r.branch_name = ? AND e.name LIKE ?
    `;
    const params: any[] = [projectHash, branchName, `%${entityName}`];

    if (types && types.length > 0) {
      sql += ` AND r.type IN (${types.map(() => "?").join(",")})`;
      params.push(...types);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  // =============================================================================
  // 6. FILE OPERATIONS
  // =============================================================================

  async updateFileInfo(info: FileInfo): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    this.statements.updateFile?.run(info.path, info.hash, info.lastIndexed, info.entityCount, projectHash, branchName);
  }

  async getFileInfo(path: string): Promise<FileInfo | null> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const row = this.statements.getFile?.get(path, projectHash, branchName) as any;

    return row
      ? {
          path: row.path,
          hash: row.hash,
          lastIndexed: row.last_indexed,
          entityCount: row.entity_count,
        }
      : null;
  }

  async getOutdatedFiles(since: number): Promise<FileInfo[]> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const rows = this.db
      .prepare(`
      SELECT * FROM files
      WHERE project_hash = ? AND branch_name = ? AND last_indexed < ?
      ORDER BY last_indexed ASC
    `)
      .all(projectHash, branchName, since) as any[];

    return rows.map((row) => ({
      path: row.path,
      hash: row.hash,
      lastIndexed: row.last_indexed,
      entityCount: row.entity_count,
    }));
  }

  // =============================================================================
  // 7. QUERY OPERATIONS
  // =============================================================================

  async executeQuery(query: GraphQuery): Promise<GraphQueryResult> {
    return this.measureOperation(
      "execute_query",
      async () => {
        const start = Date.now();

        const entities = await this.findEntities(query);
        const relationships = await this.findRelationships(query);

        // Get total counts
        const totalEntities = this.db.prepare("SELECT COUNT(*) as count FROM entities").get() as { count: number };
        const totalRelationships = this.db.prepare("SELECT COUNT(*) as count FROM relationships").get() as {
          count: number;
        };

        return {
          entities,
          relationships,
          stats: {
            totalEntities: totalEntities.count,
            totalRelationships: totalRelationships.count,
            queryTimeMs: Date.now() - start,
          },
        };
      },
      undefined,
    );
  }

  async getSubgraph(entityId: string, depth: number): Promise<GraphQueryResult> {
    return this.measureOperation(
      "get_subgraph",
      async () => {
        const start = Date.now();
        const maxDepth = Math.min(depth, MAX_SUBGRAPH_DEPTH);

        const entities = new Map<string, Entity>();
        const relationships = new Map<string, Relationship>();
        const visited = new Set<string>();

        // BFS traversal
        const queue: Array<{ id: string; level: number }> = [{ id: entityId, level: 0 }];

        while (queue.length > 0) {
          const { id, level } = queue.shift()!;

          if (visited.has(id) || level > maxDepth) continue;
          visited.add(id);

          // Get entity
          const entity = await this.getEntity(id);
          if (entity) {
            entities.set(id, entity);

            // Get relationships
            const rels = await this.getRelationshipsForEntity(id);
            for (const rel of rels) {
              relationships.set(rel.id, rel);

              // Add connected entities to queue
              if (level < maxDepth) {
                const nextId = rel.fromId === id ? rel.toId : rel.fromId;
                if (!visited.has(nextId)) {
                  queue.push({ id: nextId, level: level + 1 });
                }
              }
            }
          }
        }

        return {
          entities: Array.from(entities.values()),
          relationships: Array.from(relationships.values()),
          stats: {
            totalEntities: entities.size,
            totalRelationships: relationships.size,
            queryTimeMs: Date.now() - start,
          },
        };
      },
      1,
    );
  }

  // =============================================================================
  // 8. MAINTENANCE OPERATIONS
  // =============================================================================

  async vacuum(): Promise<void> {
    this.ensureReady();
    this.sqliteManager.vacuum();
  }

  async analyze(): Promise<void> {
    this.ensureReady();
    this.sqliteManager.analyze();
  }

  async getMetrics(): Promise<StorageMetrics> {
    return this.measureOperation("get_metrics", async () => {
      const baseMetrics = await this.sqliteManager.getMetrics();
      const { projectHash, branchName } = this.currentContext;

      // Get cache metrics with enhanced v2 fields (project-scoped)
      const cacheStats = this.db
        .prepare(`
        SELECT
          COUNT(*) as entries,
          SUM(hit_count) as hits,
          SUM(miss_count) as misses
        FROM query_cache
        WHERE expires_at > ? AND project_hash = ? AND branch_name = ?
      `)
        .get(Date.now(), projectHash, branchName) as { entries: number; hits: number; misses: number };

      // Get embeddings count
      const embeddingsCount = this.db
        .prepare(`
        SELECT COUNT(*) as count FROM embeddings
      `)
        .get() as { count: number };

      // Get performance metrics count
      const perfMetricsCount = this.db
        .prepare(`
        SELECT COUNT(*) as count FROM performance_metrics
      `)
        .get() as { count: number };

      // Calculate average query time from performance metrics
      const avgQueryTime = this.db
        .prepare(`
        SELECT AVG(duration_ms) as avg_time
        FROM performance_metrics
        WHERE operation LIKE '%query%' AND created_at > ?
      `)
        .get(Date.now() - 24 * 60 * 60 * 1000) as { avg_time: number }; // Last 24 hours

      // Get last vacuum time (stored as user_version for simplicity)
      const lastVacuum = this.db.pragma("user_version", { simple: true }) as number;

      // Check if vector search is enabled (libsql or fallback)
      let vectorSearchEnabled = false;
      try {
        // Check for libsql embeddings table
        const result = this.db.prepare("SELECT COUNT(*) as cnt FROM libsql_embeddings").get() as { cnt: number };
        vectorSearchEnabled = result.cnt >= 0;
      } catch {
        try {
          // Check for fallback embeddings table
          const result = this.db.prepare("SELECT COUNT(*) as cnt FROM doc_embeddings").get() as { cnt: number };
          vectorSearchEnabled = result.cnt >= 0;
        } catch {
          // No vector tables available
        }
      }

      // Get current memory usage
      const memoryUsage = process.memoryUsage();

      return {
        ...baseMetrics,
        cacheHitRate:
          cacheStats.hits + cacheStats.misses > 0 ? cacheStats.hits / (cacheStats.hits + cacheStats.misses) : 0,
        lastVacuum,

        // Enhanced v2 metrics
        totalEmbeddings: embeddingsCount.count,
        vectorSearchEnabled,
        performanceMetricsCount: perfMetricsCount.count,
        memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        concurrentConnections: 1, // Single connection for now
        averageQueryTimeMs: avgQueryTime.avg_time || 0,
      } as StorageMetrics;
    });
  }

  /**
   * Get storage statistics (v4 interface compliance)
   */
  async getStatistics(): Promise<{ totalEntities: number; totalRelationships: number; totalFiles: number }> {
    const metrics = await this.getMetrics();
    return {
      totalEntities: metrics.totalEntities,
      totalRelationships: metrics.totalRelationships,
      totalFiles: metrics.totalFiles,
    };
  }

  /**
   * Update project metadata after indexing
   */
  async updateProjectMetadata(projectPath: string): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const now = Date.now();

    // Count entities and files for this project/branch
    const entityCount = this.db
      .prepare("SELECT COUNT(*) as count FROM entities WHERE project_hash = ? AND branch_name = ?")
      .get(projectHash, branchName) as { count: number };
    const fileCount = this.db
      .prepare("SELECT COUNT(*) as count FROM files WHERE project_hash = ? AND branch_name = ?")
      .get(projectHash, branchName) as { count: number };

    this.statements.upsertProjectMeta?.run(
      projectHash,
      branchName,
      projectPath,
      now,
      entityCount.count,
      fileCount.count,
      now,
      now,
    );
  }

  /**
   * List all indexed projects
   */
  async listProjects(): Promise<
    Array<{
      projectHash: string;
      branchName: string;
      projectPath: string;
      lastIndexedAt: number;
      entityCount: number;
      fileCount: number;
    }>
  > {
    this.ensureReady();
    const rows = this.db
      .prepare(`
      SELECT project_hash, branch_name, project_path, last_indexed_at, entity_count, file_count
      FROM project_metadata
      ORDER BY updated_at DESC
    `)
      .all() as any[];

    return rows.map((r) => ({
      projectHash: r.project_hash,
      branchName: r.branch_name,
      projectPath: r.project_path,
      lastIndexedAt: r.last_indexed_at,
      entityCount: r.entity_count,
      fileCount: r.file_count,
    }));
  }

  /**
   * List branches for current project
   */
  async listBranches(): Promise<string[]> {
    this.ensureReady();
    const { projectHash } = this.currentContext;
    const rows = this.db
      .prepare(`
      SELECT DISTINCT branch_name FROM project_metadata
      WHERE project_hash = ?
      ORDER BY branch_name
    `)
      .all(projectHash) as Array<{ branch_name: string }>;

    return rows.map((r) => r.branch_name);
  }

  // =============================================================================
  // 9. UTILITY METHODS
  // =============================================================================

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return nanoid(ID_LENGTH);
  }

  /**
   * Generate stable entity key
   */
  private entityKey(e: Entity): string {
    const s = e.location?.start?.index ?? -1;
    const eIdx = e.location?.end?.index ?? -1;
    return `${e.filePath}|${e.type}|${e.name}|${s}-${eIdx}`;
  }

  /**
   * Generate stable entity ID using xxHash (10-15x faster than SHA-256)
   */
  private stableEntityId(e: Entity): string {
    if (!this.xxhashInstance) {
      throw new Error("GraphStorage not initialized - call initialize() first");
    }
    const key = this.entityKey(e);
    // Use xxHash64 for fast, deterministic hashing
    const hash = this.xxhashInstance.h64ToString(key);
    // Convert to base64url-like format for compatibility
    return hash.slice(0, ID_LENGTH);
  }

  /**
   * Generate stable relationship key
   */
  private relationshipKey(r: Relationship): string {
    return `${r.fromId}|${r.toId}|${r.type}`;
  }

  /**
   * Generate stable relationship ID using xxHash (10-15x faster than SHA-256)
   */
  private stableRelationshipId(r: Relationship): string {
    if (!this.xxhashInstance) {
      throw new Error("GraphStorage not initialized - call initialize() first");
    }
    const key = this.relationshipKey(r);
    const hash = this.xxhashInstance.h64ToString(key);
    return hash.slice(0, ID_LENGTH);
  }

  /**
   * Calculate complexity score for an entity
   */
  private calculateComplexity(entity: Entity): number {
    let score = 1;

    // Base complexity by type
    switch (entity.type) {
      case "function":
        score = 2;
        break;
      case "class":
        score = 3;
        break;
      case "method":
        score = 2;
        break;
      case "interface":
        score = 2;
        break;
      default:
        score = 1;
    }

    // Add complexity based on parameters
    if (entity.metadata.parameters?.length) {
      score += Math.min(entity.metadata.parameters.length * 0.5, 3);
    }

    // Add complexity based on modifiers
    if (entity.metadata.modifiers?.length) {
      score += Math.min(entity.metadata.modifiers.length * 0.3, 2);
    }

    return Math.round(score);
  }

  /**
   * Record performance metric
   */
  private recordPerformanceMetric(
    operation: string,
    durationMs: number,
    entityCount?: number,
    memoryUsage?: number,
  ): void {
    try {
      const id = this.generateId();
      const now = Date.now();

      this.statements.insertPerformanceMetric?.run(id, operation, durationMs, entityCount ?? 0, memoryUsage ?? 0, now);
    } catch (error) {
      // Don't let performance monitoring errors break main operations
      console.warn("[GraphStorage] Performance metric recording failed:", error);
    }
  }

  /**
   * Measure operation performance
   */
  private async measureOperation<T>(operation: string, fn: () => Promise<T> | T, entityCount?: number): Promise<T> {
    this.ensureReady();
    const start = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await fn();
      const duration = Date.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - startMemory;

      this.recordPerformanceMetric(operation, duration, entityCount, memoryDelta);

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordPerformanceMetric(`${operation}_error`, duration, entityCount);
      throw error;
    }
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();

    switch (ext) {
      case "ts":
      case "tsx":
      case "mts":
      case "cts":
        return "typescript";
      case "js":
      case "jsx":
      case "mjs":
      case "cjs":
        return "javascript";
      case "py":
      case "pyi":
      case "pyw":
        return "python";
      case "java":
        return "java";
      case "c":
      case "h":
        return "c";
      case "cpp":
      case "cc":
      case "cxx":
      case "hpp":
      case "hxx":
      case "hh":
        return "cpp";
      case "rs":
        return "rust";
      case "go":
        return "go";
      case "kt":
      case "kts":
        return "kotlin";
      case "swift":
        return "swift";
      case "css":
      case "scss":
      case "sass":
      case "less":
        return "css";
      case "html":
      case "htm":
        return "html";
      case "xml":
        return "xml";
      case "php":
        return "php";
      case "rb":
        return "ruby";
      default:
        return "unknown";
    }
  }

  /**
   * Convert database row to Entity (enhanced for v2)
   */
  private rowToEntity(row: any): Entity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as EntityType,
      filePath: row.file_path,
      location: JSON.parse(row.location),
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      hash: row.hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      complexityScore: row.complexity_score,
      language: row.language,
      sizeBytes: row.size_bytes,
    };
  }

  /**
   * Convert database row to Relationship (enhanced for v2)
   */
  private rowToRelationship(row: any): Relationship {
    return {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      type: row.type as RelationType,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      weight: row.weight,
      createdAt: row.created_at,
    };
  }

  /**
   * Clear all data for current project/branch
   */
  async clear(): Promise<void> {
    this.ensureReady();
    const { projectHash, branchName } = this.currentContext;
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM embeddings WHERE project_hash = ? AND branch_name = ?").run(projectHash, branchName);
      this.db
        .prepare("DELETE FROM relationships WHERE project_hash = ? AND branch_name = ?")
        .run(projectHash, branchName);
      this.db.prepare("DELETE FROM entities WHERE project_hash = ? AND branch_name = ?").run(projectHash, branchName);
      this.db.prepare("DELETE FROM files WHERE project_hash = ? AND branch_name = ?").run(projectHash, branchName);
      this.db
        .prepare("DELETE FROM query_cache WHERE project_hash = ? AND branch_name = ?")
        .run(projectHash, branchName);
      this.db
        .prepare("DELETE FROM project_metadata WHERE project_hash = ? AND branch_name = ?")
        .run(projectHash, branchName);
    });

    transaction();
    console.error(`[GraphStorage] Cleared data for project=${projectHash}, branch=${branchName}`);
  }

  /**
   * Clear ALL data (for testing only - clears all projects!)
   */
  async clearAll(): Promise<void> {
    this.ensureReady();
    const transaction = this.db.transaction(() => {
      this.db.exec("DELETE FROM embeddings");
      this.db.exec("DELETE FROM relationships");
      this.db.exec("DELETE FROM entities");
      this.db.exec("DELETE FROM files");
      this.db.exec("DELETE FROM query_cache");
      this.db.exec("DELETE FROM project_metadata");
    });

    transaction();
    console.error(`[GraphStorage] Cleared ALL data from database`);
  }

  /**
   * Delete a specific project and all its branches
   */
  async deleteProject(projectPath: string): Promise<void> {
    this.ensureReady();
    const targetHash = getProjectHash(projectPath);
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM embeddings WHERE project_hash = ?").run(targetHash);
      this.db.prepare("DELETE FROM relationships WHERE project_hash = ?").run(targetHash);
      this.db.prepare("DELETE FROM entities WHERE project_hash = ?").run(targetHash);
      this.db.prepare("DELETE FROM files WHERE project_hash = ?").run(targetHash);
      this.db.prepare("DELETE FROM query_cache WHERE project_hash = ?").run(targetHash);
      this.db.prepare("DELETE FROM project_metadata WHERE project_hash = ?").run(targetHash);
    });

    transaction();
    console.error(`[GraphStorage] Deleted project: ${projectPath} (hash=${targetHash})`);
  }
}
