/**
 * Graph Storage Factory - Unified LibSQL Storage
 *
 * Creates and manages the singleton GraphStorage instance using LibSQL.
 * Single database for entities, relationships, AND vectors.
 */

import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { getGlobalDbPaths } from "../shared/storage-paths.js";
import { logger } from "../utils/logger.js";
import { GraphStorageLibSQL } from "./graph-storage-libsql.js";
import { DatabaseCorruptionError, LibSQLGraphAdapter, type LibSQLGraphConfig } from "./libsql-graph-adapter.js";

// Re-export types and helpers for compatibility
export type { ProjectContext } from "./libsql-graph-adapter.js";
export {
  DatabaseCorruptionError,
  getEmbeddingColumn,
  normalizeToSupportedDimension,
  SUPPORTED_DIMENSIONS,
  type SupportedDimension,
} from "./libsql-graph-adapter.js";

// Singleton instances
let graphStorage: GraphStorageLibSQL | null = null;
let libsqlAdapter: LibSQLGraphAdapter | null = null;
let initializationPromise: Promise<GraphStorageLibSQL> | null = null;

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
  logger.warn("GraphStorageFactory", `[CONFIG] DiskANN params`, {
    dims: globalConfig.dimensions,
    compression: globalConfig.compression,
    maxNeighbors: globalConfig.maxNeighbors,
    insertL: globalConfig.insertL,
  });
}

/**
 * Get the unified GraphStorage instance using LibSQL
 * Uses mutex pattern to prevent race conditions during initialization
 */
export async function getGraphStorage(): Promise<GraphStorageLibSQL> {
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
      console.error("[GraphStorageFactory] Creating LibSQL GraphStorage singleton");

      // Get global database path
      const paths = getGlobalDbPaths();
      const unifiedDbPath = join(dirname(paths.graphDbPath), "unified-storage.db");

      // Ensure directory exists
      const dbDir = dirname(unifiedDbPath);
      if (!existsSync(dbDir)) {
        console.error(`[GraphStorageFactory] Creating directory: ${dbDir}`);
        mkdirSync(dbDir, { recursive: true });
      }

      // Create adapter
      libsqlAdapter = new LibSQLGraphAdapter(globalConfig);

      const initialized = await libsqlAdapter.initialize(unifiedDbPath);
      if (!initialized) {
        throw new Error("Failed to initialize LibSQL adapter");
      }

      // Create storage wrapper
      graphStorage = new GraphStorageLibSQL(libsqlAdapter);
      await graphStorage.initialize();

      console.error(`[GraphStorageFactory] Initialized unified storage at ${unifiedDbPath}`);
      return graphStorage;
    } catch (error) {
      // Reset on failure so next call can retry
      initializationPromise = null;

      // Auto-recovery: if initialization fails, try to delete corrupt DB and retry once
      const paths = getGlobalDbPaths();
      const unifiedDbPath = join(dirname(paths.graphDbPath), "unified-storage.db");
      if (existsSync(unifiedDbPath)) {
        logger.warn("STORAGE", `Initialization failed, attempting auto-recovery by deleting corrupt DB`, {
          path: unifiedDbPath,
          error: (error as Error).message,
        });
        try {
          unlinkSync(unifiedDbPath);
          // Also delete WAL and SHM files if they exist
          const walPath = unifiedDbPath + "-wal";
          const shmPath = unifiedDbPath + "-shm";
          if (existsSync(walPath)) unlinkSync(walPath);
          if (existsSync(shmPath)) unlinkSync(shmPath);
          logger.info("STORAGE", `Deleted corrupt DB, will recreate on next access`);
        } catch (deleteError) {
          logger.error("STORAGE", `Failed to delete corrupt DB`, {
            error: (deleteError as Error).message,
          });
        }
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
  graphStorage = null;
  initializationPromise = null;
  console.error("[GraphStorageFactory] Storage reset");
}

/**
 * Set project context on the global GraphStorage singleton.
 * Must be called before operations to ensure correct project_hash.
 */
export function setGlobalProjectContext(projectPath: string, branchName?: string): void {
  if (graphStorage) {
    graphStorage.setProject(projectPath, branchName);
    console.error(`[GraphStorageFactory] Global context set: ${projectPath}, branch: ${branchName || "main"}`);
  } else {
    console.error(`[GraphStorageFactory] WARNING: Cannot set context - graphStorage not initialized yet`);
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
  console.error("[GraphStorageFactory] ⚠️ HANDLING DATABASE CORRUPTION");

  // Get database path
  const paths = getGlobalDbPaths();
  const unifiedDbPath = join(dirname(paths.graphDbPath), "unified-storage.db");

  // Close existing adapter
  if (libsqlAdapter) {
    try {
      await libsqlAdapter.close();
    } catch {
      // Ignore close errors on corrupt db
    }
    libsqlAdapter = null;
  }
  graphStorage = null;
  initializationPromise = null;

  // Delete corrupt database files
  const filesToDelete = [unifiedDbPath, `${unifiedDbPath}-journal`, `${unifiedDbPath}-wal`, `${unifiedDbPath}-shm`];

  for (const file of filesToDelete) {
    try {
      if (existsSync(file)) {
        const size = statSync(file).size;
        const sizeMB = (size / 1024 / 1024).toFixed(1);
        unlinkSync(file);
        console.error(`[GraphStorageFactory] Deleted: ${file} (${sizeMB} MB)`);
      }
    } catch (error) {
      console.error(`[GraphStorageFactory] Failed to delete ${file}: ${(error as Error).message}`);
    }
  }

  // Reinitialize with fresh database
  try {
    console.error("[GraphStorageFactory] 🔄 Reinitializing with fresh database...");
    await getGraphStorage();
    console.error("[GraphStorageFactory] ✓ Database recreated successfully");
    return true;
  } catch (error) {
    console.error("[GraphStorageFactory] ✗ Failed to recreate database:", error);
    return false;
  }
}

/**
 * Check if an error is a database corruption error
 */
export function isDatabaseCorruptionError(error: unknown): error is DatabaseCorruptionError {
  return error instanceof DatabaseCorruptionError;
}
