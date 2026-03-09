/**
 * Versioning Operations — Prolly Tree, staging, index management, GC
 *
 * Handles all versioned storage operations:
 * - Prolly Tree component initialization and access
 * - Graph commit creation and pruning
 * - Branch diff cache for optimized reads
 * - Staging mode (bulk reindex)
 * - Bulk index drop/recreate
 * - WAL checkpoint
 */

import { log } from "../../logging/index.js";
import type { Entity, Relationship } from "../../types/storage.js";
import type { MultiDbManager } from "../multi-db-manager.js";
import { BranchDiffCache, CommitManager, ProllyNodeStore, ProllyTree, serializeEntity } from "../prolly/index.js";
import type { Client } from "./types.js";

// =============================================================================
// VERSIONING OPERATIONS CLASS
// =============================================================================

export class VersioningOps {
  // Prolly Tree components for versioned graph storage
  private prollyNodeStore: ProllyNodeStore | null = null;
  private prollyTree: ProllyTree | null = null;
  private commitManager: CommitManager | null = null;
  private branchDiffCache: BranchDiffCache | null = null;
  private lastGcRunAt = 0;

  constructor(
    private getClient: () => Client | null,
    private dbManager: MultiDbManager | null,
  ) {}

  // ===========================================================================
  // PROLLY TREE INITIALIZATION
  // ===========================================================================

  /**
   * Initialize Prolly Tree components for versioned storage.
   */
  async initializeProllyComponents(): Promise<void> {
    const versioningClient = this.dbManager?.isInitialized ? this.dbManager.getVersioningClient() : this.getClient();
    if (!versioningClient) throw new Error("Client not initialized");

    this.prollyNodeStore = new ProllyNodeStore();
    await this.prollyNodeStore.initialize(versioningClient);

    this.commitManager = new CommitManager();
    await this.commitManager.initialize(versioningClient);

    this.prollyTree = new ProllyTree(this.prollyNodeStore);
    await this.prollyTree.initialize();

    this.branchDiffCache = new BranchDiffCache(this.prollyNodeStore, this.commitManager);

    log.i("LIBSQLADAPT", "prolly_components_init", { components: 4 });
  }

  /**
   * Set Prolly Tree context for current project/branch.
   */
  setProllyContext(projectHash: string, branchName: string): void {
    if (this.commitManager) {
      this.commitManager.setContext(projectHash, branchName);
    }
    log.d("LIBSQLADAPT", "prolly_context_set", { project: projectHash.slice(0, 8), branch: branchName });
  }

  /**
   * Update client references after flush (close/reopen).
   */
  updateClientsAfterFlush(versioningClient: Client): void {
    if (this.prollyNodeStore) {
      this.prollyNodeStore.updateClient(versioningClient);
    }
    if (this.commitManager) {
      this.commitManager.updateClient(versioningClient);
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  getProllyNodeStore(): ProllyNodeStore | null {
    return this.prollyNodeStore;
  }

  getProllyTree(): ProllyTree | null {
    return this.prollyTree;
  }

  getCommitManager(): CommitManager | null {
    return this.commitManager;
  }

  getBranchDiffCache(): BranchDiffCache | null {
    return this.branchDiffCache;
  }

  // ===========================================================================
  // GRAPH COMMITS
  // ===========================================================================

  /**
   * Create a new commit from current graph state.
   */
  async createGraphCommit(
    getAllEntities: () => Promise<Entity[]>,
    getAllRelationships: () => Promise<Relationship[]>,
    message?: string,
  ): Promise<string | null> {
    if (!this.prollyTree || !this.commitManager) {
      log.w("LIBSQLADAPT", "prolly_not_ready");
      return null;
    }

    const entities = await getAllEntities();
    const relationships = await getAllRelationships();

    const entries = entities.map((e) => ({
      key: e.id,
      value: serializeEntity(e),
    }));

    const rootHash = await this.prollyTree.build(entries);

    const commit = await this.commitManager.commit(
      rootHash,
      null,
      { entityCount: entities.length, relationshipCount: relationships.length },
      message,
    );

    log.i("LIBSQLADAPT", "commit_created", {
      hash: commit.commitHash.slice(0, 8),
      entities: entities.length,
      relationships: relationships.length,
    });

    return commit.commitHash;
  }

  /**
   * Prune old commits and garbage-collect orphaned nodes.
   * Rate-limited to once per 10 minutes unless force=true.
   */
  async pruneAndGC(
    keepCommits = 20,
    force = false,
    client?: Client | null,
  ): Promise<{ pruned: number; gcDeleted: number } | null> {
    if (!this.commitManager || !this.prollyNodeStore) {
      return null;
    }

    const now = Date.now();
    if (!force && now - this.lastGcRunAt < 10 * 60 * 1000) {
      return null;
    }
    this.lastGcRunAt = now;

    const pruned = await this.commitManager.pruneHistory(keepCommits);
    if (pruned === 0) return { pruned: 0, gcDeleted: 0 };

    const roots = await this.commitManager.getAllActiveRootHashes();
    const gcDeleted = await this.prollyNodeStore.collectGarbage([...roots]);

    if (gcDeleted > 1000 && client) {
      await client.execute("VACUUM");
      log.i("LIBSQLADAPT", "vacuum_after_gc", { gcDeleted });
    }

    log.i("LIBSQLADAPT", "prune_gc_complete", { pruned, gcDeleted });
    return { pruned, gcDeleted };
  }

  // ===========================================================================
  // BRANCH DIFF
  // ===========================================================================

  /**
   * Initialize branch diff cache for optimized reads on feature branches.
   */
  async initBranchDiff(baseBranch: string, currentBranch: string): Promise<void> {
    if (!this.branchDiffCache || !this.prollyTree) {
      log.w("LIBSQLADAPT", "prolly_not_ready_for_diff");
      return;
    }

    await this.branchDiffCache.initForBranch(baseBranch, currentBranch);
    log.i("LIBSQLADAPT", "branch_diff_init", { branch: currentBranch, base: baseBranch });
  }

  /**
   * Check if entity is deleted on current branch (via diff cache).
   */
  isEntityDeletedOnBranch(entityId: string): boolean {
    if (!this.branchDiffCache) return false;
    return this.branchDiffCache.isDeleted(entityId);
  }

  // ===========================================================================
  // STAGING MODE (bulk reindex)
  // ===========================================================================

  private _stagingMode = false;
  get stagingMode(): boolean {
    return this._stagingMode;
  }

  /**
   * Enable staging mode: creates append-only staging tables (no PK, no indexes)
   * for O(1) bulk inserts during full reindex.
   */
  async enableStagingMode(): Promise<void> {
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;

    await client.batch(
      [
        `CREATE TABLE IF NOT EXISTS _staging_entities (
        id TEXT NOT NULL, project_hash TEXT NOT NULL, branch_name TEXT NOT NULL,
        name TEXT NOT NULL, type TEXT NOT NULL, file_path TEXT NOT NULL,
        location TEXT NOT NULL, metadata BLOB, hash TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        complexity_score INTEGER DEFAULT 1, language TEXT,
        size_bytes INTEGER DEFAULT 0, embedding_base64 TEXT,
        embedding_text TEXT, file_gen INTEGER NOT NULL DEFAULT 1
      )`,
        `CREATE TABLE IF NOT EXISTS _staging_relationships (
        id TEXT NOT NULL, project_hash TEXT NOT NULL, branch_name TEXT NOT NULL,
        from_id TEXT NOT NULL, to_id TEXT NOT NULL, type TEXT NOT NULL,
        metadata BLOB, weight REAL DEFAULT 1.0, created_at INTEGER NOT NULL
      )`,
        `CREATE TABLE IF NOT EXISTS _staging_name_tokens (
        token TEXT NOT NULL, entity_id TEXT NOT NULL,
        project_hash TEXT NOT NULL, branch_name TEXT NOT NULL
      )`,
        `CREATE TABLE IF NOT EXISTS _staging_files (
        path TEXT NOT NULL, project_hash TEXT NOT NULL, branch_name TEXT NOT NULL,
        hash TEXT, last_indexed INTEGER NOT NULL, entity_count INTEGER DEFAULT 0
      )`,
        // Clear any leftover data from previous crash
        `DELETE FROM _staging_entities`,
        `DELETE FROM _staging_relationships`,
        `DELETE FROM _staging_name_tokens`,
        `DELETE FROM _staging_files`,
      ],
      "write",
    );

    this._stagingMode = true;
    log.i("LIBSQLADAPT", "staging_mode_enabled");
  }

  /**
   * Commit staging: move data from staging -> main tables in bulk,
   * then recreate indexes and drop staging tables.
   */
  async commitStaging(): Promise<void> {
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;

    this._stagingMode = false;

    // 1. Delete only entities/relationships/tokens/files for project+branch combos
    //    that exist in staging. Preserves OTHER projects' data.
    await client.batch(
      [
        `DELETE FROM entities WHERE (project_hash, branch_name) IN
           (SELECT DISTINCT project_hash, branch_name FROM _staging_entities)`,
        `DELETE FROM relationships WHERE (project_hash, branch_name) IN
           (SELECT DISTINCT project_hash, branch_name FROM _staging_relationships)`,
        `DELETE FROM name_tokens WHERE (project_hash, branch_name) IN
           (SELECT DISTINCT project_hash, branch_name FROM _staging_name_tokens)`,
        `DELETE FROM files WHERE (project_hash, branch_name) IN
           (SELECT DISTINCT project_hash, branch_name FROM _staging_files)`,
      ],
      "write",
    );

    // 2. Bulk move with deduplication
    await client.batch(
      [
        `INSERT OR REPLACE INTO entities SELECT * FROM _staging_entities`,
        `INSERT OR REPLACE INTO relationships SELECT * FROM _staging_relationships`,
        `INSERT OR IGNORE INTO name_tokens SELECT * FROM _staging_name_tokens`,
        `INSERT OR REPLACE INTO files SELECT * FROM _staging_files`,
      ],
      "write",
    );

    // 3. Recreate indexes
    await client.batch(VersioningOps.GRAPH_INDEX_CREATES, "write");

    // 4. Drop staging tables
    await client.batch(
      [
        `DROP TABLE IF EXISTS _staging_entities`,
        `DROP TABLE IF EXISTS _staging_relationships`,
        `DROP TABLE IF EXISTS _staging_name_tokens`,
        `DROP TABLE IF EXISTS _staging_files`,
      ],
      "write",
    );

    log.i("LIBSQLADAPT", "staging_committed");
  }

  /**
   * Abort staging: drop staging tables and disable staging mode.
   */
  async abortStaging(): Promise<void> {
    this._stagingMode = false;
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;

    await client.batch(
      [
        `DROP TABLE IF EXISTS _staging_entities`,
        `DROP TABLE IF EXISTS _staging_relationships`,
        `DROP TABLE IF EXISTS _staging_name_tokens`,
        `DROP TABLE IF EXISTS _staging_files`,
      ],
      "write",
    );

    log.i("LIBSQLADAPT", "staging_aborted");
  }

  // ===========================================================================
  // BULK INDEX MANAGEMENT
  // ===========================================================================

  private static readonly GRAPH_INDEXES = [
    "idx_entities_project_branch",
    "idx_entities_file_path",
    "idx_entities_type",
    "idx_entities_name",
    "idx_entities_file_gen",
    "idx_relationships_project_branch",
    "idx_relationships_from",
    "idx_relationships_to",
    "idx_files_project_branch",
    "idx_tombstones_lookup",
    "idx_name_tokens_lookup",
  ];

  static readonly GRAPH_INDEX_CREATES = [
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
  ];

  async dropBulkIndexes(): Promise<void> {
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;
    const stmts = VersioningOps.GRAPH_INDEXES.map((name) => `DROP INDEX IF EXISTS ${name}`);
    await client.batch(stmts, "write");
    log.i("LIBSQLADAPT", "indexes_dropped", { count: stmts.length });
  }

  async recreateBulkIndexes(): Promise<void> {
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;
    await client.batch(VersioningOps.GRAPH_INDEX_CREATES, "write");
    log.i("LIBSQLADAPT", "indexes_recreated", { count: VersioningOps.GRAPH_INDEX_CREATES.length });
  }

  // ===========================================================================
  // WAL
  // ===========================================================================

  async walCheckpoint(): Promise<void> {
    const client = this.dbManager?.getGraphClient() ?? this.getClient();
    if (!client) return;
    try {
      await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      await client.execute("PRAGMA wal_autocheckpoint = 1000");
      log.i("LIBSQLADAPT", "wal_checkpoint_done");
    } catch {
      // WAL checkpoint is optional
    }
  }
}
