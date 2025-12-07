/**
 * AutoDoc Storage Implementation
 *
 * CRUD operations for documentation entities.
 * Provides efficient querying and batch operations for doc storage.
 *
 * Architecture References:
 * - AutoDoc Types: src/autodoc/types.ts
 * - Schema: src/autodoc/storage/schema.sql
 * - Graph Storage: src/storage/graph-storage.ts
 */

import { nanoid } from "nanoid";
import type { SQLiteDatabase, SQLiteStatement } from "../../storage/sqlite-adapter.js";
import type { SQLiteManager } from "../../storage/sqlite-manager.js";
import type { AutoDocStatus, AutoDocTodo, ChangeLogEntry, DocEntity, DocEntityType, OutdatedDoc } from "../types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const ID_LENGTH = 12;
const OUTDATED_CONFIDENCE_THRESHOLD = 0.7;

// =============================================================================
// 2. DOC STORAGE CLASS
// =============================================================================

export class DocStorage {
  private db: SQLiteDatabase;
  private sqliteManager: SQLiteManager;
  private initialized = false;

  // Prepared statements cache
  private statements: {
    insertDoc?: SQLiteStatement;
    updateDoc?: SQLiteStatement;
    deleteDoc?: SQLiteStatement;
    getDoc?: SQLiteStatement;
    getDocsByFile?: SQLiteStatement;
    getDocsByType?: SQLiteStatement;
    getOutdatedDocs?: SQLiteStatement;
    insertTodo?: SQLiteStatement;
    updateTodo?: SQLiteStatement;
    getTodos?: SQLiteStatement;
    insertChangelog?: SQLiteStatement;
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
   * Create AutoDoc tables if they don't exist
   */
  private createTables(): void {
    // doc_entities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        section TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        auto_generated INTEGER DEFAULT 1,
        confidence REAL DEFAULT 1.0,
        last_sync INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_doc_file ON doc_entities(file_path);
      CREATE INDEX IF NOT EXISTS idx_doc_type ON doc_entities(type);
      CREATE INDEX IF NOT EXISTS idx_doc_section ON doc_entities(section);
      CREATE INDEX IF NOT EXISTS idx_doc_confidence ON doc_entities(confidence);
      CREATE INDEX IF NOT EXISTS idx_doc_updated ON doc_entities(updated_at);
    `);

    // doc_changelog table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_changelog (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        commit_hash TEXT,
        branch TEXT NOT NULL,
        summary TEXT,
        changes TEXT NOT NULL,
        impacted_docs TEXT DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_changelog_time ON doc_changelog(timestamp);
      CREATE INDEX IF NOT EXISTS idx_changelog_commit ON doc_changelog(commit_hash);
      CREATE INDEX IF NOT EXISTS idx_changelog_branch ON doc_changelog(branch);
    `);

    // doc_todos table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_todos (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        reason TEXT,
        related_entity_id TEXT,
        completed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_todo_priority ON doc_todos(priority);
      CREATE INDEX IF NOT EXISTS idx_todo_completed ON doc_todos(completed);
      CREATE INDEX IF NOT EXISTS idx_todo_file ON doc_todos(file_path);
    `);
  }

  /**
   * Prepare commonly used statements for performance
   */
  private prepareStatements(): void {
    this.statements.insertDoc = this.db.prepare(`
      INSERT INTO doc_entities (id, type, file_path, section, title, content, tags, auto_generated, confidence, last_sync, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.updateDoc = this.db.prepare(`
      UPDATE doc_entities
      SET type = ?, title = ?, content = ?, tags = ?, auto_generated = ?, confidence = ?, last_sync = ?, updated_at = ?
      WHERE id = ?
    `);

    this.statements.deleteDoc = this.db.prepare(`
      DELETE FROM doc_entities WHERE id = ?
    `);

    this.statements.getDoc = this.db.prepare(`
      SELECT * FROM doc_entities WHERE id = ?
    `);

    this.statements.getDocsByFile = this.db.prepare(`
      SELECT * FROM doc_entities WHERE file_path = ? ORDER BY section
    `);

    this.statements.getDocsByType = this.db.prepare(`
      SELECT * FROM doc_entities WHERE type = ? ORDER BY file_path, section
    `);

    this.statements.getOutdatedDocs = this.db.prepare(`
      SELECT * FROM doc_entities WHERE confidence < ? ORDER BY confidence ASC
    `);

    this.statements.insertTodo = this.db.prepare(`
      INSERT OR REPLACE INTO doc_todos (id, file_path, title, priority, reason, related_entity_id, completed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `);

    this.statements.updateTodo = this.db.prepare(`
      UPDATE doc_todos SET completed = 1, completed_at = ? WHERE id = ?
    `);

    this.statements.getTodos = this.db.prepare(`
      SELECT * FROM doc_todos WHERE completed = 0 ORDER BY
        CASE priority
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at ASC
    `);

    this.statements.insertChangelog = this.db.prepare(`
      INSERT INTO doc_changelog (id, timestamp, commit_hash, branch, summary, changes, impacted_docs)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  // ---------------------------------------------------------------------------
  // Document CRUD
  // ---------------------------------------------------------------------------

  /**
   * Generate document ID from file path and section
   */
  generateDocId(filePath: string, section?: string | null): string {
    const base = `doc::${filePath}`;
    return section ? `${base}::${this.slugify(section)}` : base;
  }

  /**
   * Create a new documentation entity
   */
  createDoc(doc: Omit<DocEntity, "id" | "createdAt" | "updatedAt">): DocEntity {
    this.ensureReady();

    const now = Date.now();
    const id = this.generateDocId(doc.filePath, doc.section);

    const entity: DocEntity = {
      ...doc,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.statements.insertDoc!.run(
      entity.id,
      entity.type,
      entity.filePath,
      entity.section,
      entity.title,
      entity.content,
      JSON.stringify(entity.tags),
      entity.autoGenerated ? 1 : 0,
      entity.confidence,
      entity.lastSync,
      entity.createdAt,
      entity.updatedAt,
    );

    return entity;
  }

  /**
   * Update an existing documentation entity
   */
  updateDoc(id: string, updates: Partial<Omit<DocEntity, "id" | "filePath" | "createdAt">>): DocEntity | null {
    this.ensureReady();

    const existing = this.getDoc(id);
    if (!existing) return null;

    const now = Date.now();
    const updated: DocEntity = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    this.statements.updateDoc!.run(
      updated.type,
      updated.title,
      updated.content,
      JSON.stringify(updated.tags),
      updated.autoGenerated ? 1 : 0,
      updated.confidence,
      updated.lastSync,
      updated.updatedAt,
      id,
    );

    return updated;
  }

  /**
   * Delete a documentation entity
   */
  deleteDoc(id: string): boolean {
    this.ensureReady();

    const result = this.statements.deleteDoc!.run(id);
    return result.changes > 0;
  }

  /**
   * Get a documentation entity by ID
   */
  getDoc(id: string): DocEntity | null {
    this.ensureReady();

    const row = this.statements.getDoc!.get(id) as DocEntityRow | undefined;
    return row ? this.rowToDocEntity(row) : null;
  }

  /**
   * Get all documentation entities for a file
   */
  getDocsByFile(filePath: string): DocEntity[] {
    this.ensureReady();

    const rows = this.statements.getDocsByFile!.all(filePath) as DocEntityRow[];
    return rows.map((row) => this.rowToDocEntity(row));
  }

  /**
   * Get all documentation entities of a specific type
   */
  getDocsByType(type: DocEntityType): DocEntity[] {
    this.ensureReady();

    const rows = this.statements.getDocsByType!.all(type) as DocEntityRow[];
    return rows.map((row) => this.rowToDocEntity(row));
  }

  /**
   * Get all documentation entities
   */
  getAllDocs(options: { limit?: number; offset?: number } = {}): DocEntity[] {
    this.ensureReady();

    const { limit, offset } = options;
    let sql = "SELECT * FROM doc_entities ORDER BY file_path, section";

    if (limit !== undefined) {
      sql += ` LIMIT ${limit}`;
      if (offset !== undefined) {
        sql += ` OFFSET ${offset}`;
      }
    }

    const rows = this.db.prepare(sql).all() as DocEntityRow[];
    return rows.map((row) => this.rowToDocEntity(row));
  }

  /**
   * Get max lastSync timestamp efficiently
   */
  getMaxLastSync(): number | null {
    this.ensureReady();

    const result = this.db
      .prepare("SELECT MAX(last_sync) as max_sync FROM doc_entities WHERE last_sync IS NOT NULL")
      .get() as { max_sync: number | null } | undefined;

    return result?.max_sync ?? null;
  }

  /**
   * Search documents by text (using SQL LIKE for efficiency)
   */
  searchByText(query: string, limit = 10): DocEntity[] {
    this.ensureReady();

    const likePattern = `%${query}%`;
    const rows = this.db
      .prepare(`
      SELECT * FROM doc_entities
      WHERE title LIKE ? COLLATE NOCASE OR content LIKE ? COLLATE NOCASE
      ORDER BY
        CASE WHEN title LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT ?
    `)
      .all(likePattern, likePattern, likePattern, limit) as DocEntityRow[];

    return rows.map((row) => this.rowToDocEntity(row));
  }

  /**
   * Get outdated documentation (confidence below threshold)
   */
  getOutdatedDocs(threshold = OUTDATED_CONFIDENCE_THRESHOLD): OutdatedDoc[] {
    this.ensureReady();

    const rows = this.statements.getOutdatedDocs!.all(threshold) as DocEntityRow[];
    return rows.map((row) => ({
      docId: row.id,
      filePath: row.file_path,
      section: row.section || undefined,
      reason: `Confidence ${row.confidence.toFixed(2)} below threshold ${threshold}`,
      confidence: row.confidence,
    }));
  }

  /**
   * Mark documentation as outdated (reduce confidence)
   */
  markOutdated(id: string, _reason?: string): boolean {
    this.ensureReady();

    const doc = this.getDoc(id);
    if (!doc) return false;

    this.updateDoc(id, {
      confidence: Math.max(0, doc.confidence - 0.3),
    });

    return true;
  }

  /**
   * Batch upsert documents (optimized - single INSERT OR REPLACE per doc)
   */
  upsertDocs(docs: Array<Omit<DocEntity, "id" | "createdAt" | "updatedAt">>): number {
    this.ensureReady();

    const now = Date.now();

    // Use INSERT OR REPLACE - avoids N+1 getDoc() calls
    const upsertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO doc_entities
        (id, type, file_path, section, title, content, tags, auto_generated, confidence, last_sync, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM doc_entities WHERE id = ?), ?), ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const doc of docs) {
        const id = this.generateDocId(doc.filePath, doc.section);
        upsertStmt.run(
          id,
          doc.type,
          doc.filePath,
          doc.section,
          doc.title,
          doc.content,
          JSON.stringify(doc.tags),
          doc.autoGenerated ? 1 : 0,
          doc.confidence,
          doc.lastSync,
          id, // For COALESCE subquery
          now, // created_at fallback
          now, // updated_at
        );
      }
    });

    transaction();
    return docs.length;
  }

  // ---------------------------------------------------------------------------
  // Todo Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a todo item for documentation
   */
  addTodo(todo: Omit<AutoDocTodo, "sectionId"> & { sectionId?: string }): void {
    this.ensureReady();

    const id = todo.sectionId || nanoid(ID_LENGTH);
    const now = Date.now();

    this.statements.insertTodo!.run(
      id,
      todo.filePath,
      todo.title,
      todo.priority,
      todo.reason,
      todo.relatedEntityId || null,
      now,
    );
  }

  /**
   * Mark a todo as completed
   */
  completeTodo(id: string): boolean {
    this.ensureReady();

    const result = this.statements.updateTodo!.run(Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Get pending todos
   */
  getTodos(priority?: "high" | "medium" | "low"): AutoDocTodo[] {
    this.ensureReady();

    let rows: TodoRow[];
    if (priority) {
      rows = this.db
        .prepare(
          `
        SELECT * FROM doc_todos
        WHERE completed = 0 AND priority = ?
        ORDER BY created_at ASC
      `,
        )
        .all(priority) as TodoRow[];
    } else {
      rows = this.statements.getTodos!.all() as TodoRow[];
    }

    return rows.map((row) => ({
      sectionId: row.id,
      filePath: row.file_path,
      title: row.title,
      priority: row.priority as "high" | "medium" | "low",
      reason: row.reason || "",
      relatedEntityId: row.related_entity_id || undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // Changelog Operations
  // ---------------------------------------------------------------------------

  /**
   * Record a changelog entry
   */
  recordChange(entry: Omit<ChangeLogEntry, "id">): ChangeLogEntry {
    this.ensureReady();

    const id = nanoid(ID_LENGTH);
    const fullEntry: ChangeLogEntry = { ...entry, id };

    this.statements.insertChangelog!.run(
      id,
      entry.timestamp,
      entry.commitHash || null,
      entry.branch,
      entry.summary || null,
      JSON.stringify(entry.changes),
      JSON.stringify(entry.impactedDocs),
    );

    return fullEntry;
  }

  /**
   * Get changelog entries
   */
  getChangelog(options: { since?: number; limit?: number; branch?: string } = {}): ChangeLogEntry[] {
    this.ensureReady();

    const { since, limit = 50, branch } = options;

    let sql = "SELECT * FROM doc_changelog WHERE 1=1";
    const params: (number | string)[] = [];

    if (since) {
      sql += " AND timestamp >= ?";
      params.push(since);
    }

    if (branch) {
      sql += " AND branch = ?";
      params.push(branch);
    }

    sql += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as ChangelogRow[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      commitHash: row.commit_hash || undefined,
      branch: row.branch,
      summary: row.summary || undefined,
      changes: JSON.parse(row.changes),
      impactedDocs: JSON.parse(row.impacted_docs),
    }));
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get documentation statistics
   */
  getStats(): AutoDocStatus["stats"] {
    this.ensureReady();

    const totalDocs = (this.db.prepare("SELECT COUNT(*) as count FROM doc_entities").get() as { count: number }).count;

    const totalSections = (
      this.db.prepare("SELECT COUNT(*) as count FROM doc_entities WHERE section IS NOT NULL").get() as { count: number }
    ).count;

    const filledSections = (
      this.db
        .prepare("SELECT COUNT(*) as count FROM doc_entities WHERE section IS NOT NULL AND LENGTH(content) > 50")
        .get() as { count: number }
    ).count;

    const outdatedSections = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM doc_entities WHERE confidence < ${OUTDATED_CONFIDENCE_THRESHOLD}`)
        .get() as { count: number }
    ).count;

    // Reference stats will be added when RefStorage is implemented
    return {
      totalDocs,
      totalSections,
      filledSections,
      outdatedSections,
      totalRefs: 0,
      validRefs: 0,
      brokenRefs: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert title to URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Convert database row to DocEntity
   */
  private rowToDocEntity(row: DocEntityRow): DocEntity {
    return {
      id: row.id,
      type: row.type as DocEntityType,
      filePath: row.file_path,
      section: row.section,
      title: row.title,
      content: row.content,
      tags: JSON.parse(row.tags || "[]"),
      autoGenerated: row.auto_generated === 1,
      confidence: row.confidence,
      lastSync: row.last_sync ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Clear all documentation data
   */
  clear(): void {
    this.ensureReady();

    this.db.exec(`
      DELETE FROM doc_entities;
      DELETE FROM doc_changelog;
      DELETE FROM doc_todos;
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

interface DocEntityRow {
  id: string;
  type: string;
  file_path: string;
  section: string | null;
  title: string;
  content: string;
  tags: string;
  auto_generated: number;
  confidence: number;
  last_sync: number | null;
  created_at: number;
  updated_at: number;
}

interface TodoRow {
  id: string;
  file_path: string;
  title: string;
  priority: string;
  reason: string | null;
  related_entity_id: string | null;
  completed: number;
  created_at: number;
  completed_at: number | null;
}

interface ChangelogRow {
  id: string;
  timestamp: number;
  commit_hash: string | null;
  branch: string;
  summary: string | null;
  changes: string;
  impacted_docs: string;
}
