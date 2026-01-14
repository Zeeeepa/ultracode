/**
 * AutoDoc Reference Storage Implementation
 *
 * Unified Reference Registry for tracking links between docs, code, and comments.
 * Handles automatic updates when code moves or is renamed.
 *
 * Architecture References:
 * - AutoDoc Types: src/autodoc/types.ts
 * - Schema: src/autodoc/storage/schema.sql
 * - RFC Section 2: Unified Reference System
 *
 * Uses libsql for cross-runtime compatibility (Bun + Node.js)
 */

import type { Client, InStatement } from "@libsql/client";
import { createClient } from "@libsql/client";
import { nanoid } from "nanoid";
import type { ProjectContext } from "../../storage/libsql/types.js";
import { DEFAULT_PROJECT_CONTEXT } from "../../storage/libsql/types.js";
import type { CommentRef, Reference, RefSourceType, RefTargetType, RefType } from "../types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const ID_LENGTH = 12;

// =============================================================================
// 2. REF STORAGE CLASS
// =============================================================================

export class RefStorage {
  private client: Client | null = null;
  private dbPath: string;
  private initialized = false;
  private currentContext: ProjectContext = DEFAULT_PROJECT_CONTEXT;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Set project context for branch isolation
   */
  setProjectContext(context: ProjectContext): void {
    this.currentContext = context;
  }

  /**
   * Get current project context
   */
  getProjectContext(): ProjectContext {
    return this.currentContext;
  }

  /**
   * Initialize storage and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create libsql client
    this.client = createClient({
      url: `file:${this.dbPath}`,
    });

    await this.createTables();
    this.initialized = true;
  }

  private ensureReady(): void {
    if (!this.client) {
      throw new Error("RefStorage not initialized. Call initialize() first.");
    }
  }

  /**
   * Create reference tables if they don't exist
   */
  private async createTables(): Promise<void> {
    if (!this.client) return;

    // doc_references table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS doc_references (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_file_path TEXT NOT NULL,
        source_line_start INTEGER NOT NULL,
        source_line_end INTEGER NOT NULL,
        source_char_start INTEGER,
        source_char_end INTEGER,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        ref_type TEXT NOT NULL,
        ref_syntax TEXT NOT NULL,
        valid INTEGER DEFAULT 1,
        validation_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        target_entity_id TEXT,
        target_file_path TEXT,
        target_line_start INTEGER,
        target_line_end INTEGER,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main'
      )
    `);

    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_source_file ON doc_references(source_file_path)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_source_type ON doc_references(source_type)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_target_id ON doc_references(target_id)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_target_type ON doc_references(target_type)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_target_entity ON doc_references(target_entity_id)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_target_file ON doc_references(target_file_path)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_valid ON doc_references(valid)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_type ON doc_references(ref_type)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ref_branch ON doc_references(project_hash, branch_name)`);

    // comment_refs table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS comment_refs (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        content TEXT NOT NULL,
        parent_entity_id TEXT,
        doc_refs TEXT DEFAULT '[]',
        entity_refs TEXT DEFAULT '[]',
        flow_tags TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main'
      )
    `);

    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_comment_file ON comment_refs(file_path)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_comment_parent ON comment_refs(parent_entity_id)`);
    await this.client.execute(
      `CREATE INDEX IF NOT EXISTS idx_comment_lines ON comment_refs(file_path, line_start, line_end)`,
    );
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_comment_branch ON comment_refs(project_hash, branch_name)`);

    await this.migrateExistingRefs();
  }

  /**
   * Migrate existing references to include project_hash and branch_name
   */
  private async migrateExistingRefs(): Promise<void> {
    if (!this.client) return;

    try {
      // Check doc_references table
      const refTableInfo = await this.client.execute(`PRAGMA table_info(doc_references)`);
      const refHasProjectHash = refTableInfo.rows.some((row: any) => row.name === "project_hash");
      const refHasBranchName = refTableInfo.rows.some((row: any) => row.name === "branch_name");

      if (!refHasProjectHash || !refHasBranchName) {
        if (!refHasProjectHash) {
          await this.client.execute(`ALTER TABLE doc_references ADD COLUMN project_hash TEXT NOT NULL DEFAULT 'legacy'`);
        }
        if (!refHasBranchName) {
          await this.client.execute(`ALTER TABLE doc_references ADD COLUMN branch_name TEXT NOT NULL DEFAULT 'main'`);
        }

        await this.client.execute(`
          UPDATE doc_references
          SET project_hash = 'legacy', branch_name = 'main'
          WHERE project_hash IS NULL OR branch_name IS NULL
        `);
      }

      // Check comment_refs table
      const commentTableInfo = await this.client.execute(`PRAGMA table_info(comment_refs)`);
      const commentHasProjectHash = commentTableInfo.rows.some((row: any) => row.name === "project_hash");
      const commentHasBranchName = commentTableInfo.rows.some((row: any) => row.name === "branch_name");

      if (!commentHasProjectHash || !commentHasBranchName) {
        if (!commentHasProjectHash) {
          await this.client.execute(`ALTER TABLE comment_refs ADD COLUMN project_hash TEXT NOT NULL DEFAULT 'legacy'`);
        }
        if (!commentHasBranchName) {
          await this.client.execute(`ALTER TABLE comment_refs ADD COLUMN branch_name TEXT NOT NULL DEFAULT 'main'`);
        }

        await this.client.execute(`
          UPDATE comment_refs
          SET project_hash = 'legacy', branch_name = 'main'
          WHERE project_hash IS NULL OR branch_name IS NULL
        `);
      }
    } catch (error) {
      // Migration failed - okay during first initialization
    }
  }

  // ---------------------------------------------------------------------------
  // Reference CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new reference
   */
  async createRef(ref: Omit<Reference, "id" | "createdAt" | "updatedAt">): Promise<Reference> {
    this.ensureReady();

    const now = Date.now();
    const id = nanoid(ID_LENGTH);

    const entity: Reference = {
      ...ref,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.client!.execute({
      sql: `INSERT INTO doc_references (
              id, source_type, source_file_path, source_line_start, source_line_end,
              source_char_start, source_char_end, target_type, target_id, ref_type,
              ref_syntax, valid, validation_error, created_at, updated_at,
              target_entity_id, target_file_path, target_line_start, target_line_end,
              project_hash, branch_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entity.id,
        entity.sourceType,
        entity.sourceLocation.filePath,
        entity.sourceLocation.lineStart,
        entity.sourceLocation.lineEnd,
        entity.sourceLocation.charStart ?? null,
        entity.sourceLocation.charEnd ?? null,
        entity.targetType,
        entity.targetId,
        entity.refType,
        entity.refSyntax,
        entity.valid ? 1 : 0,
        entity.validationError ?? null,
        entity.createdAt,
        entity.updatedAt,
        entity.targetEntityId ?? null,
        entity.targetFilePath ?? null,
        entity.targetLineStart ?? null,
        entity.targetLineEnd ?? null,
        this.currentContext.projectHash,
        this.currentContext.branchName,
      ],
    });

    return entity;
  }

  /**
   * Update an existing reference
   */
  async updateRef(
    id: string,
    updates: Partial<Omit<Reference, "id" | "sourceType" | "sourceLocation" | "createdAt">>,
  ): Promise<Reference | null> {
    this.ensureReady();

    const existing = await this.getRef(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: Reference = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.client!.execute({
      sql: `UPDATE doc_references SET
              target_id = ?, ref_syntax = ?, valid = ?, validation_error = ?, updated_at = ?,
              target_entity_id = ?, target_file_path = ?, target_line_start = ?, target_line_end = ?
            WHERE id = ?`,
      args: [
        updated.targetId,
        updated.refSyntax,
        updated.valid ? 1 : 0,
        updated.validationError ?? null,
        updated.updatedAt,
        updated.targetEntityId ?? null,
        updated.targetFilePath ?? null,
        updated.targetLineStart ?? null,
        updated.targetLineEnd ?? null,
        id,
      ],
    });

    return updated;
  }

  /**
   * Delete a reference
   */
  async deleteRef(id: string): Promise<boolean> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `DELETE FROM doc_references WHERE id = ?`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  /**
   * Get a reference by ID
   */
  async getRef(id: string): Promise<Reference | null> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `SELECT * FROM doc_references WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToReference(result.rows[0] as unknown as RefRow);
  }

  /**
   * Get all references from a source file (with branch layers support)
   */
  async getRefsBySource(filePath: string): Promise<Reference[]> {
    this.ensureReady();

    // If no baseBranch, simple query
    if (!this.currentContext.baseBranch) {
      const result = await this.client!.execute({
        sql: `SELECT * FROM doc_references WHERE source_file_path = ? AND project_hash = ? AND branch_name = ? ORDER BY source_line_start`,
        args: [filePath, this.currentContext.projectHash, this.currentContext.branchName],
      });

      return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
    }

    // With baseBranch: use CTE to combine current + base with deduplication
    const result = await this.client!.execute({
      sql: `
        WITH combined AS (
          SELECT *, 1 as priority FROM doc_references
          WHERE source_file_path = ? AND project_hash = ? AND branch_name = ?
          UNION ALL
          SELECT *, 2 as priority FROM doc_references
          WHERE source_file_path = ? AND project_hash = ? AND branch_name = ?
        )
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY priority) as rn
          FROM combined
        ) WHERE rn = 1
        ORDER BY source_line_start
      `,
      args: [
        filePath,
        this.currentContext.projectHash,
        this.currentContext.branchName,
        filePath,
        this.currentContext.projectHash,
        this.currentContext.baseBranch,
      ],
    });

    return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
  }

  /**
   * Get all references to a target (with branch layers support)
   */
  async getRefsByTarget(targetId: string): Promise<Reference[]> {
    this.ensureReady();

    // If no baseBranch, simple query
    if (!this.currentContext.baseBranch) {
      const result = await this.client!.execute({
        sql: `SELECT * FROM doc_references WHERE target_id = ? AND project_hash = ? AND branch_name = ?`,
        args: [targetId, this.currentContext.projectHash, this.currentContext.branchName],
      });

      return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
    }

    // With baseBranch: use CTE to combine current + base with deduplication
    const result = await this.client!.execute({
      sql: `
        WITH combined AS (
          SELECT *, 1 as priority FROM doc_references
          WHERE target_id = ? AND project_hash = ? AND branch_name = ?
          UNION ALL
          SELECT *, 2 as priority FROM doc_references
          WHERE target_id = ? AND project_hash = ? AND branch_name = ?
        )
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY priority) as rn
          FROM combined
        ) WHERE rn = 1
      `,
      args: [
        targetId,
        this.currentContext.projectHash,
        this.currentContext.branchName,
        targetId,
        this.currentContext.projectHash,
        this.currentContext.baseBranch,
      ],
    });

    return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
  }

  /**
   * Get references pointing to a line range in a file
   */
  async getRefsByTargetLines(filePath: string, lineStart: number, lineEnd: number): Promise<Reference[]> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `SELECT * FROM doc_references
            WHERE target_file_path = ? AND target_line_start >= ? AND target_line_end <= ?`,
      args: [filePath, lineStart, lineEnd],
    });

    return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
  }

  /**
   * Get all broken (invalid) references (with branch layers support)
   */
  async getBrokenRefs(): Promise<Reference[]> {
    this.ensureReady();

    // If no baseBranch, simple query
    if (!this.currentContext.baseBranch) {
      const result = await this.client!.execute({
        sql: `SELECT * FROM doc_references WHERE valid = 0 AND project_hash = ? AND branch_name = ? ORDER BY source_file_path, source_line_start`,
        args: [this.currentContext.projectHash, this.currentContext.branchName],
      });

      return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
    }

    // With baseBranch: use CTE to combine current + base with deduplication
    const result = await this.client!.execute({
      sql: `
        WITH combined AS (
          SELECT *, 1 as priority FROM doc_references
          WHERE valid = 0 AND project_hash = ? AND branch_name = ?
          UNION ALL
          SELECT *, 2 as priority FROM doc_references
          WHERE valid = 0 AND project_hash = ? AND branch_name = ?
        )
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY priority) as rn
          FROM combined
        ) WHERE rn = 1
        ORDER BY source_file_path, source_line_start
      `,
      args: [
        this.currentContext.projectHash,
        this.currentContext.branchName,
        this.currentContext.projectHash,
        this.currentContext.baseBranch,
      ],
    });

    return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
  }

  /**
   * Mark a reference as invalid
   */
  async invalidateRef(id: string, error: string): Promise<boolean> {
    this.ensureReady();

    return (await this.updateRef(id, { valid: false, validationError: error })) !== null;
  }

  /**
   * Mark a reference as valid
   */
  async validateRef(id: string): Promise<boolean> {
    this.ensureReady();

    return (await this.updateRef(id, { valid: true, validationError: undefined })) !== null;
  }

  /**
   * Update target line numbers for references affected by code changes
   */
  async updateTargetLines(filePath: string, oldLineStart: number, lineDelta: number): Promise<number> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `UPDATE doc_references
            SET
              target_line_start = target_line_start + ?,
              target_line_end = target_line_end + ?,
              updated_at = ?
            WHERE target_file_path = ? AND target_line_start >= ?`,
      args: [lineDelta, lineDelta, Date.now(), filePath, oldLineStart],
    });

    return result.rowsAffected;
  }

  /**
   * Delete all references from a source file
   */
  async deleteRefsBySource(filePath: string): Promise<number> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `DELETE FROM doc_references WHERE source_file_path = ?`,
      args: [filePath],
    });

    return result.rowsAffected;
  }

  /**
   * Delete all references to a target
   */
  async deleteRefsByTarget(targetId: string): Promise<number> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `DELETE FROM doc_references WHERE target_id = ?`,
      args: [targetId],
    });

    return result.rowsAffected;
  }

  /**
   * Batch create references
   */
  async createRefs(refs: Array<Omit<Reference, "id" | "createdAt" | "updatedAt">>): Promise<Reference[]> {
    this.ensureReady();

    const results: Reference[] = [];
    const now = Date.now();

    const statements: InStatement[] = refs.map((ref) => {
      const id = nanoid(ID_LENGTH);
      const entity: Reference = {
        ...ref,
        id,
        createdAt: now,
        updatedAt: now,
      };
      results.push(entity);

      return {
        sql: `INSERT INTO doc_references (
                id, source_type, source_file_path, source_line_start, source_line_end,
                source_char_start, source_char_end, target_type, target_id, ref_type,
                ref_syntax, valid, validation_error, created_at, updated_at,
                target_entity_id, target_file_path, target_line_start, target_line_end,
                project_hash, branch_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          entity.id,
          entity.sourceType,
          entity.sourceLocation.filePath,
          entity.sourceLocation.lineStart,
          entity.sourceLocation.lineEnd,
          entity.sourceLocation.charStart ?? null,
          entity.sourceLocation.charEnd ?? null,
          entity.targetType,
          entity.targetId,
          entity.refType,
          entity.refSyntax,
          entity.valid ? 1 : 0,
          entity.validationError ?? null,
          entity.createdAt,
          entity.updatedAt,
          entity.targetEntityId ?? null,
          entity.targetFilePath ?? null,
          entity.targetLineStart ?? null,
          entity.targetLineEnd ?? null,
          this.currentContext.projectHash,
          this.currentContext.branchName,
        ],
      };
    });

    await this.client!.batch(statements);
    return results;
  }

  /**
   * Get all references with optional pagination (with branch layers support)
   */
  async getAllRefs(options: { limit?: number; offset?: number; validOnly?: boolean } = {}): Promise<Reference[]> {
    this.ensureReady();

    const { limit, offset, validOnly } = options;

    // If no baseBranch, simple query
    if (!this.currentContext.baseBranch) {
      let sql = `SELECT * FROM doc_references WHERE project_hash = ? AND branch_name = ?`;
      const args: (number | string)[] = [this.currentContext.projectHash, this.currentContext.branchName];

      if (validOnly !== undefined) {
        sql += ` AND valid = ?`;
        args.push(validOnly ? 1 : 0);
      }

      sql += " ORDER BY source_file_path, source_line_start";

      if (limit !== undefined) {
        sql += ` LIMIT ?`;
        args.push(limit);
        if (offset !== undefined) {
          sql += ` OFFSET ?`;
          args.push(offset);
        }
      }

      const result = await this.client!.execute({ sql, args });
      return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
    }

    // With baseBranch: use CTE to combine current + base with deduplication
    const validFilter = validOnly !== undefined ? `AND valid = ${validOnly ? 1 : 0}` : "";

    let sql = `
      WITH combined AS (
        SELECT *, 1 as priority FROM doc_references
        WHERE project_hash = ? AND branch_name = ? ${validFilter}
        UNION ALL
        SELECT *, 2 as priority FROM doc_references
        WHERE project_hash = ? AND branch_name = ? ${validFilter}
      )
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY priority) as rn
        FROM combined
      ) WHERE rn = 1
      ORDER BY source_file_path, source_line_start
    `;
    const args: (number | string)[] = [
      this.currentContext.projectHash,
      this.currentContext.branchName,
      this.currentContext.projectHash,
      this.currentContext.baseBranch,
    ];

    if (limit !== undefined) {
      sql += ` LIMIT ?`;
      args.push(limit);
      if (offset !== undefined) {
        sql += ` OFFSET ?`;
        args.push(offset);
      }
    }

    const result = await this.client!.execute({ sql, args });
    return result.rows.map((row) => this.rowToReference(row as unknown as RefRow));
  }

  /**
   * Count total references
   */
  async countRefs(validOnly?: boolean): Promise<number> {
    this.ensureReady();

    let sql = "SELECT COUNT(*) as count FROM doc_references";
    const args: (number | string)[] = [];

    if (validOnly !== undefined) {
      sql += ` WHERE valid = ?`;
      args.push(validOnly ? 1 : 0);
    }

    const result = await this.client!.execute({ sql, args });
    return (result.rows[0] as unknown as { count: number }).count;
  }

  // ---------------------------------------------------------------------------
  // Comment Reference CRUD
  // ---------------------------------------------------------------------------

  /**
   * Generate comment ID from file path and line
   */
  generateCommentId(filePath: string, lineStart: number): string {
    return `comment::${filePath}::${lineStart}`;
  }

  /**
   * Create a comment reference
   */
  async createComment(comment: Omit<CommentRef, "id" | "createdAt" | "updatedAt">): Promise<CommentRef> {
    this.ensureReady();

    const now = Date.now();
    const id = this.generateCommentId(comment.filePath, comment.lineStart);

    const entity: CommentRef = {
      ...comment,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.client!.execute({
      sql: `INSERT INTO comment_refs (
              id, file_path, line_start, line_end, content, parent_entity_id,
              doc_refs, entity_refs, flow_tags, created_at, updated_at,
              project_hash, branch_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entity.id,
        entity.filePath,
        entity.lineStart,
        entity.lineEnd,
        entity.content,
        entity.parentEntityId ?? null,
        JSON.stringify(entity.docRefs),
        JSON.stringify(entity.entityRefs),
        JSON.stringify(entity.flowTags),
        entity.createdAt,
        entity.updatedAt,
        this.currentContext.projectHash,
        this.currentContext.branchName,
      ],
    });

    return entity;
  }

  /**
   * Update a comment reference
   */
  async updateComment(
    id: string,
    updates: Partial<Omit<CommentRef, "id" | "filePath" | "lineStart" | "lineEnd" | "createdAt">>,
  ): Promise<CommentRef | null> {
    this.ensureReady();

    const existing = await this.getComment(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: CommentRef = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.client!.execute({
      sql: `UPDATE comment_refs SET
              content = ?, parent_entity_id = ?, doc_refs = ?, entity_refs = ?,
              flow_tags = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        updated.content,
        updated.parentEntityId ?? null,
        JSON.stringify(updated.docRefs),
        JSON.stringify(updated.entityRefs),
        JSON.stringify(updated.flowTags),
        updated.updatedAt,
        id,
      ],
    });

    return updated;
  }

  /**
   * Delete a comment reference
   */
  async deleteComment(id: string): Promise<boolean> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `DELETE FROM comment_refs WHERE id = ?`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  /**
   * Get a comment reference by ID
   */
  async getComment(id: string): Promise<CommentRef | null> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `SELECT * FROM comment_refs WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToComment(result.rows[0] as unknown as CommentRow);
  }

  /**
   * Get all comment references for a file
   */
  async getCommentsByFile(filePath: string): Promise<CommentRef[]> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `SELECT * FROM comment_refs WHERE file_path = ? ORDER BY line_start`,
      args: [filePath],
    });

    return result.rows.map((row) => this.rowToComment(row as unknown as CommentRow));
  }

  /**
   * Delete all comment references for a file
   */
  async deleteCommentsByFile(filePath: string): Promise<number> {
    this.ensureReady();

    const result = await this.client!.execute({
      sql: `DELETE FROM comment_refs WHERE file_path = ?`,
      args: [filePath],
    });

    return result.rowsAffected;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get reference statistics
   */
  async getStats(): Promise<{ totalRefs: number; validRefs: number; brokenRefs: number; totalComments: number }> {
    this.ensureReady();

    const totalRefsResult = await this.client!.execute("SELECT COUNT(*) as count FROM doc_references");
    const totalRefs = (totalRefsResult.rows[0] as unknown as { count: number }).count;

    const validRefsResult = await this.client!.execute("SELECT COUNT(*) as count FROM doc_references WHERE valid = 1");
    const validRefs = (validRefsResult.rows[0] as unknown as { count: number }).count;

    const totalCommentsResult = await this.client!.execute("SELECT COUNT(*) as count FROM comment_refs");
    const totalComments = (totalCommentsResult.rows[0] as unknown as { count: number }).count;

    return {
      totalRefs,
      validRefs,
      brokenRefs: totalRefs - validRefs,
      totalComments,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert database row to Reference
   */
  private rowToReference(row: RefRow): Reference {
    return {
      id: row.id,
      sourceType: row.source_type as RefSourceType,
      sourceLocation: {
        filePath: row.source_file_path,
        lineStart: row.source_line_start,
        lineEnd: row.source_line_end,
        ...(row.source_char_start && { charStart: row.source_char_start }),
        ...(row.source_char_end && { charEnd: row.source_char_end }),
      },
      targetType: row.target_type as RefTargetType,
      targetId: row.target_id,
      refType: row.ref_type as RefType,
      refSyntax: row.ref_syntax,
      valid: row.valid === 1,
      validationError: row.validation_error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetEntityId: row.target_entity_id ?? undefined,
      targetFilePath: row.target_file_path ?? undefined,
      targetLineStart: row.target_line_start ?? undefined,
      targetLineEnd: row.target_line_end ?? undefined,
    };
  }

  /**
   * Convert database row to CommentRef
   */
  private rowToComment(row: CommentRow): CommentRef {
    return {
      id: row.id,
      filePath: row.file_path,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      content: row.content,
      ...(row.parent_entity_id && { parentEntityId: row.parent_entity_id }),
      docRefs: JSON.parse(row.doc_refs || "[]"),
      entityRefs: JSON.parse(row.entity_refs || "[]"),
      flowTags: JSON.parse(row.flow_tags || "[]"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Clear all reference data
   */
  async clear(): Promise<void> {
    this.ensureReady();

    await this.client!.batch(["DELETE FROM doc_references", "DELETE FROM comment_refs"]);
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.initialized = false;
  }
}

// =============================================================================
// 3. TYPE DEFINITIONS FOR DB ROWS
// =============================================================================

interface RefRow {
  id: string;
  source_type: string;
  source_file_path: string;
  source_line_start: number;
  source_line_end: number;
  source_char_start: number | null;
  source_char_end: number | null;
  target_type: string;
  target_id: string;
  ref_type: string;
  ref_syntax: string;
  valid: number;
  validation_error: string | null;
  created_at: number;
  updated_at: number;
  target_entity_id: string | null;
  target_file_path: string | null;
  target_line_start: number | null;
  target_line_end: number | null;
}

interface CommentRow {
  id: string;
  file_path: string;
  line_start: number;
  line_end: number;
  content: string;
  parent_entity_id: string | null;
  doc_refs: string;
  entity_refs: string;
  flow_tags: string;
  created_at: number;
  updated_at: number;
}
