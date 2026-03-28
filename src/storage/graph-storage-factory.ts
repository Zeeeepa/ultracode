/**
 * Graph Storage Factory - Unified LibSQL Storage
 *
 * Creates and manages the singleton GraphStorage instance using LibSQL.
 * Single database for entities, relationships, AND vectors.
 */

import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logging/index.js";
import {
  getCurrentGitBranchOrDefault,
  getGlobalDbPaths,
  getPerProjectMultiDbPaths,
  hashProjectPath,
} from "../shared/storage-paths.js";
import {
  DatabaseCorruptionError,
  GraphAdapter,
  type LibSQLGraphAdapter,
  type LibSQLGraphConfig,
} from "./graph-adapter.js";
import { GraphStorageLibSQL } from "./graph-storage-libsql.js";
import { MultiDbManager } from "./multi-db-manager.js";

// Re-export types and helpers for compatibility
export type { ProjectContext } from "./graph-adapter.js";
export {
  DatabaseCorruptionError,
  getEmbeddingColumn,
  normalizeToSupportedDimension,
  SUPPORTED_DIMENSIONS,
  type SupportedDimension,
} from "./graph-adapter.js";

// Singleton instances
let graphStorage: GraphStorageLibSQL | null = null;
let libsqlAdapter: LibSQLGraphAdapter | null = null;
let multiDbManager: MultiDbManager | null = null;
let initializationPromise: Promise<GraphStorageLibSQL> | null = null;

/** Current project hash the DBs are opened for (per-project layout) */
let currentDbProjectHash: string | null = null;

// Configuration from yaml-config
// NOTE: These are defaults, may be overridden by configureGraphStorage()
let globalConfig: LibSQLGraphConfig = {
  dimensions: 768, // granite-278m = 768, all-MiniLM-L6-v2 = 384
  metric: "cosine",
  compression: "float8", // float8 = 1 byte/dim, float32 = 4 bytes/dim (4x savings!)
  searchL: 150,
  insertL: 30,
  maxNeighbors: 12, // DiskANN neighbors (lower = smaller index)
};

/**
 * Configure the graph storage factory with libsql settings
 */
export function configureGraphStorage(config: LibSQLGraphConfig): void {
  globalConfig = { ...globalConfig, ...config };
  log.w("FACTORY", `[CONFIG] DiskANN params`, {
    dims: globalConfig.dimensions,
    compression: globalConfig.compression,
    maxNeighbors: globalConfig.maxNeighbors,
    insertL: globalConfig.insertL,
  });
}

/**
 * Get the GraphStorage instance using LibSQL.
 * Per-project layout: each project gets its own 4 DBs in projects/{hash}/.
 * Uses mutex pattern to prevent race conditions during initialization.
 *
 * @param projectPath - Optional. If provided, opens DBs for this project.
 *   If different from current, re-initializes with new project's DBs.
 */
export async function getGraphStorage(projectPath?: string): Promise<GraphStorageLibSQL> {
  // Check if we need to switch to a different project's DBs
  if (projectPath && graphStorage && libsqlAdapter?.isReady()) {
    const requestedHash = hashProjectPath(projectPath);
    if (currentDbProjectHash && currentDbProjectHash !== requestedHash) {
      // Different project — reinitialize with new per-project DBs
      log.i("STORAGEFACT", "project_switch", {
        from: currentDbProjectHash.slice(0, 8),
        to: requestedHash.slice(0, 8),
      });
      await resetGraphStorage();
      // Fall through to initialization below
    }
  }

  // Fast path: return existing singleton
  if (graphStorage && libsqlAdapter?.isReady()) {
    return graphStorage;
  }

  // Mutex: if initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization (only one will run)
  initializationPromise = (async () => {
    try {
      log.i("STORAGEFACT", "creating_singleton", {
        projectPath: projectPath ?? "NONE",
        type: typeof projectPath,
      });

      // Determine base path: per-project if projectPath known, else global fallback
      let basePath: string;
      if (projectPath) {
        const projectHash = hashProjectPath(projectPath);
        const perProject = getPerProjectMultiDbPaths(projectHash);
        basePath = perProject.baseDir;
        currentDbProjectHash = projectHash;
        log.i("STORAGEFACT", "per_project_layout", {
          hash: projectHash.slice(0, 8),
          dir: basePath,
        });
      } else {
        const paths = getGlobalDbPaths();
        basePath = dirname(paths.graphDbPath);
        currentDbProjectHash = null;
      }

      // Ensure directory exists
      if (!existsSync(basePath)) {
        log.i("STORAGEFACT", "creating_dir", { dir: basePath });
        mkdirSync(basePath, { recursive: true });
      }

      // Delete legacy unified-storage.db if it exists (migration to multi-db)
      const legacyDbPath = join(basePath, "unified-storage.db");
      if (existsSync(legacyDbPath)) {
        log.i("STORAGEFACT", "migrating_to_multi_db", { legacy: legacyDbPath });
        try {
          unlinkSync(legacyDbPath);
          for (const suffix of ["-wal", "-shm", "-journal"]) {
            const auxPath = legacyDbPath + suffix;
            if (existsSync(auxPath)) unlinkSync(auxPath);
          }
          log.i("STORAGEFACT", "legacy_db_deleted");
        } catch (deleteError) {
          log.w("STORAGEFACT", "legacy_db_delete_fail", {
            error: (deleteError as Error).message,
          });
        }
      }

      // Initialize MultiDbManager with 4 separate databases
      multiDbManager = new MultiDbManager();
      await multiDbManager.initialize(basePath);

      // Create adapter with multi-db manager
      libsqlAdapter = new GraphAdapter(globalConfig, multiDbManager);

      // Use graph.db path as the "primary" path for adapter
      const graphDbPath = join(basePath, "graph.db");
      const initialized = await libsqlAdapter.initialize(graphDbPath);
      if (!initialized) {
        throw new Error("Failed to initialize LibSQL adapter");
      }

      // Create storage wrapper
      graphStorage = new GraphStorageLibSQL(libsqlAdapter);
      await graphStorage.initialize();

      log.i("STORAGEFACT", "init_complete", {
        mode: "multi-db",
        dbs: "graph, semantic, versioning, cache",
      });
      return graphStorage;
    } catch (error) {
      // Reset on failure so next call can retry
      initializationPromise = null;

      const errMsg = (error as Error).message || "";
      const isBusy = errMsg.includes("SQLITE_BUSY") || errMsg.includes("database is locked");

      if (isBusy) {
        log.w("STORAGE", `Initialization failed due to database lock (will retry on next access)`, {
          error: errMsg,
        });
        throw error;
      }

      // Auto-recovery: delete all DB files and retry on next access
      if (multiDbManager) {
        log.w("STORAGE", `Initialization failed, attempting auto-recovery by deleting corrupt DBs`, {
          error: errMsg,
        });
        try {
          await multiDbManager.close();
          await multiDbManager.deleteAll();
          log.i("STORAGE", `Deleted corrupt DBs, will recreate on next access`);
        } catch (deleteError) {
          log.e("STORAGE", `Failed to delete corrupt DBs`, {
            error: (deleteError as Error).message,
          });
        }
        multiDbManager = null;
      }
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Initialize graph storage (alias for getGraphStorage for compatibility)
 */
export async function initializeGraphStorage(): Promise<GraphStorageLibSQL> {
  return getGraphStorage();
}

/**
 * Get the underlying LibSQL adapter for direct vector operations
 */
export function getLibSQLAdapter(): LibSQLGraphAdapter | null {
  return libsqlAdapter;
}

/**
 * Reset the singleton (for testing or reconfiguration)
 */
export async function resetGraphStorage(): Promise<void> {
  if (libsqlAdapter) {
    await libsqlAdapter.close();
    libsqlAdapter = null;
  }
  if (multiDbManager) {
    await multiDbManager.close();
    multiDbManager = null;
  }
  graphStorage = null;
  initializationPromise = null;
  currentDbProjectHash = null;
  log.i("STORAGEFACT", "storage_reset");
}

/**
 * Set project context on the global GraphStorage singleton.
 * @deprecated Use runWithRequestContext() for tool calls. Only needed for initial startup.
 * If branchName is null/undefined, detects from git or uses "main" fallback.
 *
 * In per-project layout: if the project hash changed, triggers DB re-initialization
 * on next getGraphStorage() call.
 */
export function setGlobalProjectContext(projectPath: string, branchName?: string | null): void {
  if (graphStorage) {
    // Check if project changed (per-project layout: may need DB switch)
    const newHash = hashProjectPath(projectPath);
    if (currentDbProjectHash && currentDbProjectHash !== newHash) {
      log.i("STORAGEFACT", "project_changed_will_reinit", {
        from: currentDbProjectHash.slice(0, 8),
        to: newHash.slice(0, 8),
      });
      // Reset — next getGraphStorage(projectPath) will re-initialize
      resetGraphStorage().catch((err) =>
        log.w("STORAGEFACT", "reset_fail", { err: (err as Error).message }),
      );
      return;
    }

    // Resolve branch: use provided, detect from git, or fallback to "main"
    const resolvedBranch = branchName ?? getCurrentGitBranchOrDefault(projectPath);
    graphStorage.setProject(projectPath, resolvedBranch);
    log.i("STORAGEFACT", "context_set", { path: projectPath, branch: resolvedBranch });
  } else {
    log.w("STORAGEFACT", "context_set_fail", { reason: "not initialized" });
  }
}

/**
 * Check if storage is initialized and ready
 */
export function isStorageReady(): boolean {
  return graphStorage !== null && libsqlAdapter?.isReady() === true;
}

/**
 * Handle database corruption by deleting corrupt files and reinitializing.
 * Call this when DatabaseCorruptionError is caught.
 * @returns true if recovery was successful
 */
export async function handleDatabaseCorruption(): Promise<boolean> {
  log.e("STORAGEFACT", "corruption_handler_start");

  // Close existing adapter and multi-db manager
  if (libsqlAdapter) {
    try {
      await libsqlAdapter.close();
    } catch {
      // Ignore close errors on corrupt db
    }
    libsqlAdapter = null;
  }

  // Delete all database files
  if (multiDbManager) {
    try {
      await multiDbManager.close();
      await multiDbManager.deleteAll();
    } catch {
      // Ignore errors
    }
    multiDbManager = null;
  }

  // Also clean up any legacy unified-storage.db
  const paths = getGlobalDbPaths();
  const legacyDbPath = join(dirname(paths.graphDbPath), "unified-storage.db");
  for (const file of [legacyDbPath, `${legacyDbPath}-journal`, `${legacyDbPath}-wal`, `${legacyDbPath}-shm`]) {
    try {
      if (existsSync(file)) {
        unlinkSync(file);
        log.i("STORAGEFACT", "file_deleted", { file });
      }
    } catch (error) {
      log.w("STORAGEFACT", "file_delete_fail", { file, err: (error as Error).message });
    }
  }

  // Delete multi-db files
  const basePath = dirname(paths.graphDbPath);
  for (const dbName of ["graph.db", "semantic.db", "versioning.db", "cache.db"]) {
    const dbPath = join(basePath, dbName);
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        const file = dbPath + suffix;
        if (existsSync(file)) {
          const size = statSync(file).size;
          const sizeMB = (size / 1024 / 1024).toFixed(1);
          unlinkSync(file);
          log.i("STORAGEFACT", "file_deleted", { file, sizeMB });
        }
      } catch (error) {
        log.w("STORAGEFACT", "file_delete_fail", { err: (error as Error).message });
      }
    }
  }

  graphStorage = null;
  initializationPromise = null;

  // Reinitialize with fresh databases
  try {
    log.i("STORAGEFACT", "reinit_start");
    await getGraphStorage();
    log.i("STORAGEFACT", "reinit_success");
    return true;
  } catch (error) {
    log.e("STORAGEFACT", "reinit_fail", { err: String(error) });
    return false;
  }
}

/**
 * Check if an error is a database corruption error
 */
export function isDatabaseCorruptionError(error: unknown): error is DatabaseCorruptionError {
  return error instanceof DatabaseCorruptionError;
}
