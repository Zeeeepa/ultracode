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
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS entities (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        location TEXT NOT NULL,
        metadata BLOB,
        hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        complexity_score INTEGER DEFAULT 1,
        language TEXT,
        size_bytes INTEGER DEFAULT 0,
        embedding_base64 TEXT,
        embedding_text TEXT,
        file_gen INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS relationships (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata BLOB,
        weight REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS files (
        path TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        hash TEXT,
        last_indexed INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        PRIMARY KEY (path, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS project_metadata (
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL DEFAULT 'main',
        project_path TEXT NOT NULL,
        last_indexed_at INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        file_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_full_index_at INTEGER DEFAULT 0,
        incremental_changes_count INTEGER DEFAULT 0,
        trace_usage_count INTEGER DEFAULT 0,
        PRIMARY KEY (project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS tombstones (
        entity_id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT 'entity',
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY (entity_id, project_hash, branch_name, entity_type)
      )`,
        `CREATE TABLE IF NOT EXISTS file_generations (
        file_path TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        active_gen INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (file_path, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS name_tokens (
        token TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        PRIMARY KEY (token, entity_id, project_hash, branch_name)
      )`,
        // Indexes
        `CREATE INDEX IF NOT EXISTS idx_entities_project_branch ON entities(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_file_path ON entities(file_path, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_relationships_project_branch ON relationships(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_files_project_branch ON files(project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_tombstones_lookup ON tombstones(project_hash, branch_name, entity_type)`,
        `CREATE INDEX IF NOT EXISTS idx_name_tokens_lookup ON name_tokens(token, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_entities_file_gen ON entities(file_path, project_hash, branch_name, file_gen)`,
        // Crash safety: drop leftover staging tables from previous crash
        `DROP TABLE IF EXISTS _staging_entities`,
        `DROP TABLE IF EXISTS _staging_relationships`,
        `DROP TABLE IF EXISTS _staging_name_tokens`,
        `DROP TABLE IF EXISTS _staging_files`,
      ],
      "write",
    );

    // ── Zig-compat columns (added via ALTER TABLE for existing DBs) ────────
    // These are new columns from the Zig schema that don't exist in the
    // original TS schema. ALTER TABLE ADD COLUMN is safe — SQLite fills
    // existing rows with the DEFAULT value automatically.
    const zigCompatColumns: Array<{ table: string; column: string; ddl: string }> = [
      // entities: explicit boolean flags (Zig stores as INTEGER, not in CBOR metadata)
      { table: "entities", column: "is_async", ddl: "ALTER TABLE entities ADD COLUMN is_async INTEGER DEFAULT 0" },
      { table: "entities", column: "is_exported", ddl: "ALTER TABLE entities ADD COLUMN is_exported INTEGER DEFAULT 0" },
      { table: "entities", column: "is_test", ddl: "ALTER TABLE entities ADD COLUMN is_test INTEGER DEFAULT 0" },
      { table: "entities", column: "has_docs", ddl: "ALTER TABLE entities ADD COLUMN has_docs INTEGER DEFAULT 0" },
      // relationships: file_path for provenance tracking
      { table: "relationships", column: "file_path", ddl: "ALTER TABLE relationships ADD COLUMN file_path TEXT DEFAULT ''" },
      { table: "relationships", column: "updated_at", ddl: "ALTER TABLE relationships ADD COLUMN updated_at INTEGER DEFAULT 0" },
      // files: size and language for richer file metadata
      { table: "files", column: "size", ddl: "ALTER TABLE files ADD COLUMN size INTEGER DEFAULT 0" },
      { table: "files", column: "language", ddl: "ALTER TABLE files ADD COLUMN language TEXT DEFAULT ''" },
      // name_tokens: source column (name, doc, etc.)
      { table: "name_tokens", column: "source", ddl: "ALTER TABLE name_tokens ADD COLUMN source TEXT DEFAULT 'name'" },
      // project_metadata: relationship count
      { table: "project_metadata", column: "relationship_count", ddl: "ALTER TABLE project_metadata ADD COLUMN relationship_count INTEGER DEFAULT 0" },
    ];

    for (const { table, column, ddl } of zigCompatColumns) {
      try {
        await client.execute(ddl);
      } catch (e) {
        // "duplicate column" means it already exists — expected for subsequent runs
        const msg = (e as Error).message || "";
        if (!msg.includes("duplicate column")) {
          log.w("SCHEMA", `alter_table_failed`, { table, column, err: msg });
        }
      }
    }

    // ── FTS5 virtual table for full-text entity search (Zig compat) ────────
    try {
      await client.execute(
        `CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(entity_id UNINDEXED, name, file_path)`,
      );
    } catch (e) {
      // FTS5 may not be available in all SQLite builds
      log.w("SCHEMA", "fts5_create_failed", { err: (e as Error).message });
    }

    // ── Index for relationships.file_path ──────────────────────────────────
    try {
      await client.execute(
        `CREATE INDEX IF NOT EXISTS idx_relationships_file ON relationships(file_path, project_hash, branch_name)`,
      );
    } catch {
      // Column may not exist on very old DBs
    }
  }

  /**
   * Create semantic tables: cooccurrence, term_frequency + indexes
   */
  async createSemanticTables(client: Client): Promise<void> {
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS cooccurrence (
          term1 TEXT NOT NULL,
          term2 TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 1,
          pmi REAL,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL DEFAULT 'main',
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (term1, term2, project_hash, branch_name)
        )`,
        `CREATE TABLE IF NOT EXISTS term_frequency (
          term TEXT NOT NULL,
          doc_count INTEGER NOT NULL DEFAULT 1,
          total_count INTEGER NOT NULL DEFAULT 1,
          project_hash TEXT NOT NULL,
          branch_name TEXT NOT NULL DEFAULT 'main',
          PRIMARY KEY (term, project_hash, branch_name)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_cooc_term1 ON cooccurrence(term1, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_cooc_pmi ON cooccurrence(pmi DESC, project_hash, branch_name)`,
        `CREATE INDEX IF NOT EXISTS idx_term_freq_project ON term_frequency(project_hash, branch_name)`,
        // Zig-compat: meta table for key-value storage in semantic.db
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
    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS embedding_cache (
          content_hash TEXT PRIMARY KEY,
          model TEXT NOT NULL,
          embedding BLOB NOT NULL,
          text_preview TEXT,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER NOT NULL,
          hit_count INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS query_cache (
        id TEXT NOT NULL,
        project_hash TEXT NOT NULL DEFAULT 'legacy',
        branch_name TEXT NOT NULL DEFAULT 'main',
        query_hash TEXT NOT NULL,
        result TEXT NOT NULL,
        hit_count INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (id, project_hash, branch_name)
      )`,
        `CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        entity_count INTEGER DEFAULT 0,
        memory_usage INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
        // Zig-compat: git churn cache for hotspot analysis
        `CREATE TABLE IF NOT EXISTS git_churn_cache (
        file_path TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        commit_hash TEXT NOT NULL DEFAULT '',
        churn_count INTEGER DEFAULT 0,
        PRIMARY KEY (file_path, project_hash)
      )`,
        // Zig-compat: metric results cache (PageRank, betweenness, etc.)
        `CREATE TABLE IF NOT EXISTS metric_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        score REAL NOT NULL,
        created_at INTEGER DEFAULT 0
      )`,
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
      INSERT OR IGNORE INTO file_generations (file_path, project_hash, branch_name, active_gen, updated_at)
      SELECT DISTINCT file_path, project_hash, branch_name, 1, ${Date.now()}
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
}
