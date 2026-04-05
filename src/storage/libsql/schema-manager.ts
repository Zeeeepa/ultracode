/**
 * Schema Manager — Database table creation, migrations, and integrity checks
 *
 * Handles all DDL operations: CREATE TABLE, indexes, migrations,
 * integrity checks, stale lock cleanup, and corruption recovery.
 */

import { log } from "../../logging/index.js";
import type { MultiDbManager } from "../multi-db-manager.js";
import type { Client } from "./types.js";

// =============================================================================
// SCHEMA MANAGER CLASS
// =============================================================================

export class SchemaManager {
  constructor(
    private getClient: () => Client | null,
    private dbManager: MultiDbManager | null,
  ) {}

  // ===========================================================================
  // TABLE CREATION
  // ===========================================================================

  async createTables(): Promise<void> {
    const useMultiDb = this.dbManager?.isInitialized === true;
    const startTime = Date.now();

    if (useMultiDb) {
      // Multi-DB mode: create tables in parallel across 4 databases
      await Promise.all([
        this.createGraphTables(this.dbManager!.getGraphClient()!),
        this.createSemanticTables(this.dbManager!.getSemanticClient()!),
        this.createVersioningTables(this.dbManager!.getVersioningClient()!),
        this.createCacheTables(this.dbManager!.getCacheClient()!),
      ]);
    } else {
      // Legacy single-DB mode: all tables in one client
      const client = this.getClient();
      if (!client) throw new Error("Client not initialized");
      await this.createGraphTables(client);
      await this.createSemanticTables(client);
      // Versioning tables are created by ProllyNodeStore/CommitManager in initializeProllyComponents
      await this.createCacheTables(client);
    }

    const batchElapsed = Date.now() - startTime;
    log.i("STORAGE", `Tables and basic indexes created`, {
      ms: batchElapsed,
      mode: useMultiDb ? "multi-db" : "single-db",
    });
    log.i("STORAGE", `Skipping global DiskANN index (using partial indexes per project)`);

    const totalElapsed = Date.now() - startTime;
    log.i("STORAGE", `Total initialization complete`, { ms: totalElapsed });

    // Log memory and libsql stats after init
    await this.logDatabaseStats("after_init");
  }

  /**
   * Create graph tables: entities, relationships, files, file_generations,
   * tombstones, name_tokens, project_metadata + indexes
   */
  async createGraphTables(client: Client): Promise<void> {
    // ── Zig-compatible schema (synced with ultracode.zig/src/storage/schema.zig) ──
    // Key design: implicit integer rowid + droppable UNIQUE INDEX (not PK).
    // This enables DROP INDEX during bulk insert for zero constraint checking,
    // then CREATE INDEX after — using SQLite Sorter for fast index rebuild.
    await client.batch(
      [
        // entities: implicit rowid for BTREE_APPEND optimization
        `CREATE TABLE IF NOT EXISTS entities (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        location TEXT DEFAULT '',
        language TEXT DEFAULT '',
        metadata BLOB,
        hash TEXT DEFAULT '',
        complexity INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        is_async INTEGER DEFAULT 0,
        is_exported INTEGER DEFAULT 0,
        is_test INTEGER DEFAULT 0,
        has_docs INTEGER DEFAULT 0,
        file_gen INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      )`,
        // relationships: implicit rowid + droppable UNIQUE INDEX
        `CREATE TABLE IF NOT EXISTS relationships (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT DEFAULT '',
        weight REAL DEFAULT 1.0,
        metadata BLOB,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      )`,
        `CREATE TABLE IF NOT EXISTS files (
        path TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        hash TEXT DEFAULT '',
        last_indexed INTEGER DEFAULT 0,
        entity_count INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        language TEXT DEFAULT '',
        PRIMARY KEY (path, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS project_metadata (
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        entity_count INTEGER DEFAULT 0,
        file_count INTEGER DEFAULT 0,
        relationship_count INTEGER DEFAULT 0,
        last_indexed INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0,
        PRIMARY KEY (project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS tombstones (
        entity_id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        created_at INTEGER DEFAULT 0,
        PRIMARY KEY (entity_id, project_hash, branch_name, entity_type)
      )`,
        `CREATE TABLE IF NOT EXISTS file_generations (
        file_path TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        active_gen INTEGER DEFAULT 1,
        PRIMARY KEY (file_path, project_hash, branch_name)
      )`,
        // name_tokens: implicit rowid + droppable UNIQUE INDEX
        `CREATE TABLE IF NOT EXISTS name_tokens (
        token TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        source TEXT DEFAULT 'name'
      )`,
        // ── Indexes (droppable UNIQUE INDEX for entities/relationships/name_tokens) ──
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_pk ON entities(id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_gen ON entities(file_gen, file_path, project_hash, branch_name)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_rels_pk ON relationships(id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_rels_from ON relationships(from_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_rels_to ON relationships(to_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_rels_file ON relationships(file_path, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_files_project_branch ON files(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_tombstones_lookup ON tombstones(project_hash, branch_name, entity_type)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_pk ON name_tokens(token, entity_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_tokens_entity ON name_tokens(entity_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_tokens_lookup ON name_tokens(token, project_hash, branch_name, source)`,
        // Crash safety: drop leftover staging tables from previous crash
        `DROP TABLE IF EXISTS _staging_entities`,
        `DROP TABLE IF EXISTS _staging_relationships`,
        `DROP TABLE IF EXISTS _staging_name_tokens`,
        `DROP TABLE IF EXISTS _staging_files`,
      ],
      "write",
    );

    // ── FTS5 virtual table for full-text entity search ────────────────────
    try {
      await client.execute(
        `CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(entity_id UNINDEXED, name, file_path)`,
      );
    } catch (e) {
      // FTS5 may not be available in all SQLite builds
      log.w("SCHEMA", "fts5_create_failed", { err: (e as Error).message });
    }
  }

  /**
   * Create semantic tables: cooccurrence, term_frequency + indexes
   */
  async createSemanticTables(client: Client): Promise<void> {
    // ── Zig-compatible schema (synced with ultracode.zig/src/storage/schema.zig) ──
    // cooccurrence + term_frequency: implicit rowid + droppable UNIQUE INDEX
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS cooccurrence (
          term1 TEXT NOT NULL,
          term2 TEXT NOT NULL,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          count INTEGER DEFAULT 1
        )`,
        `CREATE TABLE IF NOT EXISTS term_frequency (
          term TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          frequency REAL DEFAULT 0.0
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_cooc_pk ON cooccurrence(term1, term2, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_cooc_term1 ON cooccurrence(term1, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_cooc_term2 ON cooccurrence(term2, project_hash, branch_name)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_pk ON term_frequency(term, entity_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_tf_term ON term_frequency(term, project_hash, branch_name)`,
        `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
      ],
      "write",
    );
  }

  /**
   * Create versioning tables (placeholder — actual DDL is in ProllyNodeStore/CommitManager).
   */
  private async createVersioningTables(_client: Client): Promise<void> {
    // Tables are created by ProllyNodeStore.initialize() and CommitManager.initialize()
    // which are called in initializeProllyComponents() with the correct client.
    // No need to duplicate DDL here — just a no-op placeholder for the parallel call.
  }

  /**
   * Create cache tables: embedding_cache, query_cache, performance_metrics
   */
  async createCacheTables(client: Client): Promise<void> {
    // ── Zig-compatible schema (synced with ultracode.zig/src/storage/schema.zig) ──
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS embedding_cache (
          key TEXT NOT NULL PRIMARY KEY,
          embedding BLOB,
          model TEXT DEFAULT '',
          created_at INTEGER DEFAULT 0,
          expires_at INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS query_cache (
        query_hash TEXT NOT NULL PRIMARY KEY,
        result TEXT,
        created_at INTEGER DEFAULT 0,
        expires_at INTEGER DEFAULT 0
      )`,
        `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT 0
      )`,
        `CREATE TABLE IF NOT EXISTS metric_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        score REAL NOT NULL,
        created_at INTEGER DEFAULT 0
      )`,
        `CREATE TABLE IF NOT EXISTS git_churn_cache (
        file_path TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        churn_count INTEGER DEFAULT 0,
        PRIMARY KEY (file_path, project_hash)
      )`,
        // Hypothesis inference system (Zig: src/hypothesis/)
        `CREATE TABLE IF NOT EXISTS hypotheses (
        id TEXT NOT NULL PRIMARY KEY,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        hypothesis_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        rel_type TEXT NOT NULL,
        evidence TEXT DEFAULT '',
        strategy TEXT DEFAULT '',
        created_at INTEGER DEFAULT 0
      )`,
        `CREATE INDEX IF NOT EXISTS idx_hyp_source ON hypotheses(project_hash, branch_name, from_id)`,
        `CREATE INDEX IF NOT EXISTS idx_hyp_target ON hypotheses(project_hash, branch_name, to_id)`,
        `CREATE INDEX IF NOT EXISTS idx_hyp_conf ON hypotheses(project_hash, branch_name, confidence DESC)`,
      ],
      "write",
    );
  }

  // ===========================================================================
  // MIGRATIONS
  // ===========================================================================

  /**
   * Migration: Add file_gen column to entities table if missing.
   * Also backfills file_generations for existing data.
   */
  async migrateFileGen(): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    // Check if column already exists
    try {
      await client.execute("SELECT file_gen FROM entities LIMIT 0");
      return; // Column exists, skip migration
    } catch {
      // Column doesn't exist, add it
    }

    log.i("LIBSQLADAPT", "migrate_file_gen_start");
    const start = Date.now();

    await client.execute("ALTER TABLE entities ADD COLUMN file_gen INTEGER NOT NULL DEFAULT 1");

    // Backfill file_generations from existing entities
    await client.execute(`
      INSERT OR IGNORE INTO file_generations (file_path, project_hash, branch_name, active_gen)
      SELECT DISTINCT file_path, project_hash, branch_name, 1
      FROM entities
    `);

    log.i("LIBSQLADAPT", "migrate_file_gen_done", { ms: Date.now() - start });
  }

  // ===========================================================================
  // INTEGRITY & DIAGNOSTICS
  // ===========================================================================

  /**
   * Quick integrity check to detect corruption early.
   * Probes tables AND indexes to catch DiskANN corruption.
   */
  async quickIntegrityCheck(): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    // Check if main tables exist first
    const tables = await client.execute(`
      SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('entities', 'relationships', 'embeddings', 'files')
    `);

    if (tables.rows.length === 0) {
      // No tables yet - fresh database, skip integrity check
      return;
    }

    // Quick probe of each table to detect page corruption
    const probes = [
      "SELECT id FROM entities LIMIT 1",
      "SELECT id FROM relationships LIMIT 1",
      "SELECT path FROM files LIMIT 1",
    ];

    for (const probe of probes) {
      try {
        await client.execute(probe);
      } catch (error) {
        const msg = (error as Error).message || "";
        if (msg.includes("no such table")) continue;
        throw error;
      }
    }

    // Run PRAGMA quick_check - fast check for corruption
    const integrityCheck = await client.execute("PRAGMA quick_check");
    const firstRow = integrityCheck.rows[0];
    const result = firstRow ? String(Object.values(firstRow)[0]) : "ok";
    if (result !== "ok") {
      throw new Error(`SQLITE_CORRUPT: quick_check failed: ${result}`);
    }

    // Probe DiskANN shadow tables (legacy check)
    try {
      const shadowTables = await client.execute(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE '%shadow%'
      `);
      for (const row of shadowTables.rows) {
        const tableName = row["name"] as string;
        try {
          await client.execute(`SELECT COUNT(*) FROM "${tableName}"`);
        } catch (shadowError) {
          const smsg = (shadowError as Error).message || "";
          log.e("LIBSQLADAPT", "shadow_table_corrupt", { table: tableName, err: smsg });
          throw shadowError;
        }
      }
      log.i("LIBSQLADAPT", "shadow_tables_ok");
    } catch (error) {
      const msg = (error as Error).message || "";
      if (!msg.includes("no such table") && !msg.includes("All shadow")) {
        throw error;
      }
    }

    log.i("LIBSQLADAPT", "integrity_passed");
  }

  /**
   * Remove stale SQLite lock files before opening database.
   */
  async cleanupStaleLocks(dbPath: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    const lockFiles = [`${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`];

    for (const lockFile of lockFiles) {
      try {
        await unlink(lockFile);
        log.i("LIBSQLADAPT", "stale_lock_removed", { file: lockFile });
      } catch {
        // File doesn't exist or already removed - OK
      }
    }
  }

  /**
   * Delete corrupt database and all auxiliary files.
   */
  async deleteCorruptDatabase(dbPath: string): Promise<boolean> {
    const { unlink, stat } = await import("node:fs/promises");

    const filesToDelete = [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`];

    let anyDeleted = false;

    for (const file of filesToDelete) {
      try {
        const fileStats = await stat(file);
        const sizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
        await unlink(file);
        log.i("LIBSQLADAPT", "file_deleted", { file, sizeMB });
        anyDeleted = true;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          log.w("LIBSQLADAPT", "file_delete_fail", { file, err: err.message });
        }
      }
    }

    return anyDeleted;
  }

  /**
   * Log database statistics and memory usage for diagnostics.
   */
  async logDatabaseStats(label: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      const pageCount = await client.execute("PRAGMA page_count");
      const pageSize = await client.execute("PRAGMA page_size");
      const cacheSize = await client.execute("PRAGMA cache_size");
      const freelistCount = await client.execute("PRAGMA freelist_count");

      const pages = Number(pageCount.rows[0]?.["page_count"] ?? 0);
      const size = Number(pageSize.rows[0]?.["page_size"] ?? 4096);
      const cache = Number(cacheSize.rows[0]?.["cache_size"] ?? 0);
      const freelist = Number(freelistCount.rows[0]?.["freelist_count"] ?? 0);

      const dbSizeMB = (pages * size) / 1024 / 1024;
      const cacheMB = cache < 0 ? -cache / 1024 : (cache * size) / 1024 / 1024;

      log.i("STORAGE", label, {
        dbSizeMB: dbSizeMB.toFixed(1),
        pages,
        pageSize: size,
        cacheSizeMB: cacheMB.toFixed(1),
        freelistPages: freelist,
      });

      const mem = process.memoryUsage();
      log.i("STORAGE", label, {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024),
      });
    } catch (error) {
      log.d("STORAGE", "Failed to get stats", { error: (error as Error).message });
    }
  }

  // ===========================================================================
  // DROPPABLE INDEXES (Zig-compat: drop during bulk insert, recreate after)
  // ===========================================================================

  /** Droppable indexes for graph.db */
  static readonly GRAPH_DROPPABLE_INDEXES = [
    "idx_entities_pk",
    "idx_entities_file",
    "idx_entities_name",
    "idx_entities_type",
    "idx_entities_gen",
    "idx_rels_pk",
    "idx_rels_from",
    "idx_rels_to",
    "idx_rels_file",
    "idx_tokens_pk",
    "idx_tokens_entity",
    "idx_tokens_lookup",
  ];

  /** Droppable indexes for semantic.db */
  static readonly SEMANTIC_DROPPABLE_INDEXES = [
    "idx_cooc_pk",
    "idx_cooc_term1",
    "idx_cooc_term2",
    "idx_tf_pk",
    "idx_tf_term",
  ];

  /** Drop indexes for bulk insert optimization */
  async dropIndexes(client: Client, indexes: string[]): Promise<void> {
    const stmts = indexes.map((idx) => `DROP INDEX IF EXISTS ${idx}`);
    await client.batch(stmts, "write");
    log.i("SCHEMA", "indexes_dropped", { count: indexes.length });
  }

  /** Recreate graph.db indexes after bulk insert */
  async recreateGraphIndexes(client: Client): Promise<void> {
    await client.batch(
      [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_pk ON entities(id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_entities_gen ON entities(file_gen, file_path, project_hash, branch_name)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_rels_pk ON relationships(id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_rels_from ON relationships(from_id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_rels_to ON relationships(to_id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_rels_file ON relationships(file_path, project_hash, branch_name)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_pk ON name_tokens(token, entity_id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_tokens_entity ON name_tokens(entity_id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_tokens_lookup ON name_tokens(token, project_hash, branch_name, source)",
      ],
      "write",
    );
    log.i("SCHEMA", "indexes_recreated", { type: "graph" });
  }

  /** Recreate semantic.db indexes after bulk insert */
  async recreateSemanticIndexes(client: Client): Promise<void> {
    await client.batch(
      [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_cooc_pk ON cooccurrence(term1, term2, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_cooc_term1 ON cooccurrence(term1, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_cooc_term2 ON cooccurrence(term2, project_hash, branch_name)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_pk ON term_frequency(term, entity_id, project_hash, branch_name)",
        "CREATE INDEX IF NOT EXISTS idx_tf_term ON term_frequency(term, project_hash, branch_name)",
      ],
      "write",
    );
    log.i("SCHEMA", "indexes_recreated", { type: "semantic" });
  }
}
