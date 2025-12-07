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
 */

import { nanoid } from "nanoid";
import type { SQLiteDatabase, SQLiteStatement } from "../../storage/sqlite-adapter.js";
import type { SQLiteManager } from "../../storage/sqlite-manager.js";
import type { CommentRef, Reference, RefSourceType, RefTargetType, RefType } from "../types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const ID_LENGTH = 12;

// =============================================================================
// 2. REF STORAGE CLASS
// =============================================================================

export class RefStorage {
  private db: SQLiteDatabase;
  private sqliteManager: SQLiteManager;
  private initialized = false;

  // Prepared statements cache
  private statements: {
    insertRef?: SQLiteStatement;
    updateRef?: SQLiteStatement;
    deleteRef?: SQLiteStatement;
    getRef?: SQLiteStatement;
    getRefsBySource?: SQLiteStatement;
    getRefsByTarget?: SQLiteStatement;
    getRefsByTargetFile?: SQLiteStatement;
    getBrokenRefs?: SQLiteStatement;
    insertComment?: SQLiteStatement;
    updateComment?: SQLiteStatement;
    deleteComment?: SQLiteStatement;
    getComment?: SQLiteStatement;
    getCommentsByFile?: SQLiteStatement;
  } = {};

  constructor(sqliteManager: SQLiteManager) {
    this.sqliteManager = sqliteManager;
    this.db = sqliteManager.getConnection();
  }

  /**
   * Initialize storage and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.ensureReady();
    this.createTables();
    this.prepareStatements();
    this.initialized = true;
  }

  private ensureReady(): void {
    if (!this.sqliteManager.isOpen()) {
      this.sqliteManager.initialize();
    }
    this.db = this.sqliteManager.getConnection();
  }

  /**
   * Create reference tables if they don't exist
   */
  private createTables(): void {
    // doc_references table
    this.db.exec(`
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
        target_line_end INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_ref_source_file ON doc_references(source_file_path);
      CREATE INDEX IF NOT EXISTS idx_ref_source_type ON doc_references(source_type);
      CREATE INDEX IF NOT EXISTS idx_ref_target_id ON doc_references(target_id);
      CREATE INDEX IF NOT EXISTS idx_ref_target_type ON doc_references(target_type);
      CREATE INDEX IF NOT EXISTS idx_ref_target_entity ON doc_references(target_entity_id);
      CREATE INDEX IF NOT EXISTS idx_ref_target_file ON doc_references(target_file_path);
      CREATE INDEX IF NOT EXISTS idx_ref_valid ON doc_references(valid);
      CREATE INDEX IF NOT EXISTS idx_ref_type ON doc_references(ref_type);
    `);

    // comment_refs table
    this.db.exec(`
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
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comment_file ON comment_refs(file_path);
      CREATE INDEX IF NOT EXISTS idx_comment_parent ON comment_refs(parent_entity_id);
      CREATE INDEX IF NOT EXISTS idx_comment_lines ON comment_refs(file_path, line_start, line_end);
    `);
  }

  /**
   * Prepare commonly used statements
   */
  private prepareStatements(): void {
    this.statements.insertRef = this.db.prepare(`
      INSERT INTO doc_references (
        id, source_type, source_file_path, source_line_start, source_line_end,
        source_char_start, source_char_end, target_type, target_id, ref_type,
        ref_syntax, valid, validation_error, created_at, updated_at,
        target_entity_id, target_file_path, target_line_start, target_line_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.updateRef = this.db.prepare(`
      UPDATE doc_references SET
        target_id = ?, ref_syntax = ?, valid = ?, validation_error = ?, updated_at = ?,
        target_entity_id = ?, target_file_path = ?, target_line_start = ?, target_line_end = ?
      WHERE id = ?
    `);

    this.statements.deleteRef = this.db.prepare(`
      DELETE FROM doc_references WHERE id = ?
    `);

    this.statements.getRef = this.db.prepare(`
      SELECT * FROM doc_references WHERE id = ?
    `);

    this.statements.getRefsBySource = this.db.prepare(`
      SELECT * FROM doc_references WHERE source_file_path = ? ORDER BY source_line_start
    `);

    this.statements.getRefsByTarget = this.db.prepare(`
      SELECT * FROM doc_references WHERE target_id = ?
    `);

    this.statements.getRefsByTargetFile = this.db.prepare(`
      SELECT * FROM doc_references
      WHERE target_file_path = ? AND target_line_start >= ? AND target_line_end <= ?
    `);

    this.statements.getBrokenRefs = this.db.prepare(`
      SELECT * FROM doc_references WHERE valid = 0 ORDER BY source_file_path, source_line_start
    `);

    this.statements.insertComment = this.db.prepare(`
      INSERT INTO comment_refs (
        id, file_path, line_start, line_end, content, parent_entity_id,
        doc_refs, entity_refs, flow_tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.updateComment = this.db.prepare(`
      UPDATE comment_refs SET
        content = ?, parent_entity_id = ?, doc_refs = ?, entity_refs = ?,
        flow_tags = ?, updated_at = ?
      WHERE id = ?
    `);

    this.statements.deleteComment = this.db.prepare(`
      DELETE FROM comment_refs WHERE id = ?
    `);

    this.statements.getComment = this.db.prepare(`
      SELECT * FROM comment_refs WHERE id = ?
    `);

    this.statements.getCommentsByFile = this.db.prepare(`
      SELECT * FROM comment_refs WHERE file_path = ? ORDER BY line_start
    `);
  }

  // ---------------------------------------------------------------------------
  // Reference CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new reference
   */
  createRef(ref: Omit<Reference, "id" | "createdAt" | "updatedAt">): Reference {
    this.ensureReady();

    const now = Date.now();
    const id = nanoid(ID_LENGTH);

    const entity: Reference = {
      ...ref,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.statements.insertRef!.run(
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
    );

    return entity;
  }

  /**
   * Update an existing reference
   */
  updateRef(
    id: string,
    updates: Partial<Omit<Reference, "id" | "sourceType" | "sourceLocation" | "createdAt">>,
  ): Reference | null {
    this.ensureReady();

    const existing = this.getRef(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: Reference = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    this.statements.updateRef!.run(
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
    );

    return updated;
  }

  /**
   * Delete a reference
   */
  deleteRef(id: string): boolean {
    this.ensureReady();

    const result = this.statements.deleteRef!.run(id);
    return result.changes > 0;
  }

  /**
   * Get a reference by ID
   */
  getRef(id: string): Reference | null {
    this.ensureReady();

    const row = this.statements.getRef!.get(id) as RefRow | undefined;
    return row ? this.rowToReference(row) : null;
  }

  /**
   * Get all references from a source file
   */
  getRefsBySource(filePath: string): Reference[] {
    this.ensureReady();

    const rows = this.statements.getRefsBySource!.all(filePath) as RefRow[];
    return rows.map((row) => this.rowToReference(row));
  }

  /**
   * Get all references to a target
   */
  getRefsByTarget(targetId: string): Reference[] {
    this.ensureReady();

    const rows = this.statements.getRefsByTarget!.all(targetId) as RefRow[];
    return rows.map((row) => this.rowToReference(row));
  }

  /**
   * Get references pointing to a line range in a file
   */
  getRefsByTargetLines(filePath: string, lineStart: number, lineEnd: number): Reference[] {
    this.ensureReady();

    const rows = this.statements.getRefsByTargetFile!.all(filePath, lineStart, lineEnd) as RefRow[];
    return rows.map((row) => this.rowToReference(row));
  }

  /**
   * Get all broken (invalid) references
   */
  getBrokenRefs(): Reference[] {
    this.ensureReady();

    const rows = this.statements.getBrokenRefs!.all() as RefRow[];
    return rows.map((row) => this.rowToReference(row));
  }

  /**
   * Mark a reference as invalid
   */
  invalidateRef(id: string, error: string): boolean {
    this.ensureReady();

    return this.updateRef(id, { valid: false, validationError: error }) !== null;
  }

  /**
   * Mark a reference as valid
   */
  validateRef(id: string): boolean {
    this.ensureReady();

    return this.updateRef(id, { valid: true, validationError: undefined }) !== null;
  }

  /**
   * Update target line numbers for references affected by code changes
   */
  updateTargetLines(filePath: string, oldLineStart: number, lineDelta: number): number {
    this.ensureReady();

    const result = this.db
      .prepare(`
      UPDATE doc_references
      SET
        target_line_start = target_line_start + ?,
        target_line_end = target_line_end + ?,
        updated_at = ?
      WHERE target_file_path = ? AND target_line_start >= ?
    `)
      .run(lineDelta, lineDelta, Date.now(), filePath, oldLineStart);

    return result.changes;
  }

  /**
   * Delete all references from a source file
   */
  deleteRefsBySource(filePath: string): number {
    this.ensureReady();

    const result = this.db.prepare("DELETE FROM doc_references WHERE source_file_path = ?").run(filePath);

    return result.changes;
  }

  /**
   * Delete all references to a target
   */
  deleteRefsByTarget(targetId: string): number {
    this.ensureReady();

    const result = this.db.prepare("DELETE FROM doc_references WHERE target_id = ?").run(targetId);

    return result.changes;
  }

  /**
   * Batch create references
   */
  createRefs(refs: Array<Omit<Reference, "id" | "createdAt" | "updatedAt">>): Reference[] {
    this.ensureReady();

    const results: Reference[] = [];

    const transaction = this.db.transaction(() => {
      for (const ref of refs) {
        results.push(this.createRef(ref));
      }
    });

    transaction();
    return results;
  }

  /**
   * Get all references with optional pagination
   * Avoids N+1 queries when getting refs for multiple files
   */
  getAllRefs(options: { limit?: number; offset?: number; validOnly?: boolean } = {}): Reference[] {
    this.ensureReady();

    const { limit, offset, validOnly } = options;
    let sql = "SELECT * FROM doc_references";

    if (validOnly !== undefined) {
      sql += ` WHERE valid = ${validOnly ? 1 : 0}`;
    }

    sql += " ORDER BY source_file_path, source_line_start";

    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
      if (offset !== undefined) {
        sql += ` OFFSET ${offset}`;
      }
    }

    const rows = this.db.prepare(sql).all() as RefRow[];
    return rows.map((row) => this.rowToReference(row));
  }

  /**
   * Count total references
   */
  countRefs(validOnly?: boolean): number {
    this.ensureReady();

    let sql = "SELECT COUNT(*) as count FROM doc_references";
    if (validOnly !== undefined) {
      sql += ` WHERE valid = ${validOnly ? 1 : 0}`;
    }

    const result = this.db.prepare(sql).get() as { count: number };
    return result.count;
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
  createComment(comment: Omit<CommentRef, "id" | "createdAt" | "updatedAt">): CommentRef {
    this.ensureReady();

    const now = Date.now();
    const id = this.generateCommentId(comment.filePath, comment.lineStart);

    const entity: CommentRef = {
      ...comment,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.statements.insertComment!.run(
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
    );

    return entity;
  }

  /**
   * Update a comment reference
   */
  updateComment(
    id: string,
    updates: Partial<Omit<CommentRef, "id" | "filePath" | "lineStart" | "lineEnd" | "createdAt">>,
  ): CommentRef | null {
    this.ensureReady();

    const existing = this.getComment(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: CommentRef = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    this.statements.updateComment!.run(
      updated.content,
      updated.parentEntityId ?? null,
      JSON.stringify(updated.docRefs),
      JSON.stringify(updated.entityRefs),
      JSON.stringify(updated.flowTags),
      updated.updatedAt,
      id,
    );

    return updated;
  }

  /**
   * Delete a comment reference
   */
  deleteComment(id: string): boolean {
    this.ensureReady();

    const result = this.statements.deleteComment!.run(id);
    return result.changes > 0;
  }

  /**
   * Get a comment reference by ID
   */
  getComment(id: string): CommentRef | null {
    this.ensureReady();

    const row = this.statements.getComment!.get(id) as CommentRow | undefined;
    return row ? this.rowToComment(row) : null;
  }

  /**
   * Get all comment references for a file
   */
  getCommentsByFile(filePath: string): CommentRef[] {
    this.ensureReady();

    const rows = this.statements.getCommentsByFile!.all(filePath) as CommentRow[];
    return rows.map((row) => this.rowToComment(row));
  }

  /**
   * Delete all comment references for a file
   */
  deleteCommentsByFile(filePath: string): number {
    this.ensureReady();

    const result = this.db.prepare("DELETE FROM comment_refs WHERE file_path = ?").run(filePath);

    return result.changes;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get reference statistics
   */
  getStats(): { totalRefs: number; validRefs: number; brokenRefs: number; totalComments: number } {
    this.ensureReady();

    const totalRefs = (this.db.prepare("SELECT COUNT(*) as count FROM doc_references").get() as { count: number })
      .count;

    const validRefs = (
      this.db.prepare("SELECT COUNT(*) as count FROM doc_references WHERE valid = 1").get() as { count: number }
    ).count;

    const totalComments = (this.db.prepare("SELECT COUNT(*) as count FROM comment_refs").get() as { count: number })
      .count;

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
        charStart: row.source_char_start ?? undefined,
        charEnd: row.source_char_end ?? undefined,
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
      parentEntityId: row.parent_entity_id ?? undefined,
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
  clear(): void {
    this.ensureReady();

    this.db.exec(`
      DELETE FROM doc_references;
      DELETE FROM comment_refs;
    `);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.statements = {};
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
