/**
 * Graph Storage Factory - Unified LibSQL Storage
 *
 * Creates and manages the singleton GraphStorage instance using LibSQL.
 * v4: Unified storage - both graph and vectors in single libsql database.
 *
 * MIGRATION FROM v3:
 * - Replaced better-sqlite3 with @libsql/client
 * - GraphStorageImpl replaced with GraphStorageLibSQL
 * - Single database for entities, relationships, AND vectors
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getGlobalDbPaths } from "../shared/storage-paths.js";
import { GraphStorageLibSQL } from "./graph-storage-libsql.js";
import { LibSQLGraphAdapter, type LibSQLGraphConfig } from "./libsql-graph-adapter.js";

// Re-export types for compatibility
export type { ProjectContext } from "./libsql-graph-adapter.js";

// Singleton instances
let graphStorage: GraphStorageLibSQL | null = null;
let libsqlAdapter: LibSQLGraphAdapter | null = null;
let initializationPromise: Promise<GraphStorageLibSQL> | null = null;

// Configuration from yaml-config
let globalConfig: LibSQLGraphConfig = {
  dimensions: 384,
  metric: "cosine",
  compression: "float32",
  searchL: 200,
  insertL: 70,
};

/**
 * Configure the graph storage factory with libsql settings
 */
export function configureGraphStorage(config: LibSQLGraphConfig): void {
  globalConfig = { ...globalConfig, ...config };
  console.error(`[GraphStorageFactory] Configured with: ${JSON.stringify(globalConfig)}`);
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
