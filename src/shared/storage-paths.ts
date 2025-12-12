/**
 * Storage paths management for UltraScript Tools
 *
 * All data is stored in a central location:
 * - Windows: %LOCALAPPDATA%\UltraScriptTools\
 * - macOS: ~/Library/Application Support/UltraScriptTools/
 * - Linux: ~/.local/share/UltraScriptTools/
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { hashText } from "../utils/fast-hash.js";

// =============================================================================
// Base Directory
// =============================================================================

/**
 * Get the base data directory for UltraScript Tools
 */
export function getDataDir(): string {
  let baseDir: string;

  switch (process.platform) {
    case "win32":
      baseDir = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
      break;
    case "darwin":
      baseDir = join(homedir(), "Library", "Application Support");
      break;
    default:
      // Linux and others
      baseDir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  }

  return join(baseDir, "UltraScriptTools");
}

/**
 * Ensure the data directory exists
 */
export function ensureDataDir(): string {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// =============================================================================
// IPC Socket Path
// =============================================================================

/**
 * Get the IPC socket/pipe path
 */
export function getIPCSocketPath(): string {
  if (process.platform === "win32") {
    return "\\\\.\\pipe\\ultrascript-core";
  }
  return "/tmp/ultrascript-core.sock";
}

// =============================================================================
// Subdirectories
// =============================================================================

export function getLogsDir(): string {
  return join(getDataDir(), "logs");
}

export function getCacheDir(): string {
  return join(getDataDir(), "cache");
}

export function getProjectsDir(): string {
  return join(getDataDir(), "projects");
}

export function getModelsDir(): string {
  return join(getDataDir(), "models");
}

export function getConfigDir(): string {
  return join(getDataDir(), "config");
}

export function getConfigPath(): string {
  return join(getDataDir(), "config.yaml");
}

export function getSemanticConfigPath(): string {
  return join(getConfigDir(), "semantic-config.json");
}

export function getCorePidPath(): string {
  return join(getDataDir(), "core.pid");
}

export function getCoreLockPath(): string {
  return join(getDataDir(), "core.lock");
}

// =============================================================================
// Project-specific paths
// =============================================================================

/**
 * Generate a stable hash for a project path
 * Uses xxHash (initialized at module load, no fallback race condition)
 */
export function hashProjectPath(projectPath: string): string {
  // Normalize path for consistent hashing
  const normalized = projectPath.toLowerCase().replace(/\\/g, "/").replace(/\/$/, "");
  return hashText(normalized);
}

/**
 * Get the directory for a specific project
 * @deprecated Use getGlobalDbPaths() for unified database access
 */
export function getProjectDir(projectPath: string): string {
  const hash = hashProjectPath(projectPath);
  return join(getProjectsDir(), hash);
}

/**
 * Get paths for project databases
 * @deprecated Use getGlobalDbPaths() for unified database access
 */
export function getProjectPaths(projectPath: string) {
  const projectDir = getProjectDir(projectPath);

  return {
    dir: projectDir,
    metaPath: join(projectDir, "meta.json"),
    graphDbPath: join(projectDir, "graph.db"),
    vectorsDbPath: join(projectDir, "vectors.db"),
    branchesDir: join(projectDir, "branches"),
    // Cache persistence paths
    parserCachePath: join(projectDir, "parser-cache.json"),
    semanticCachePath: join(projectDir, "semantic-cache.json"),
  };
}

// =============================================================================
// UNIFIED DATABASE ARCHITECTURE
// =============================================================================

/**
 * UNIFIED DATABASE DESIGN
 *
 * All projects and branches share a single database with composite keys:
 *
 * Tables structure:
 * - entities: PRIMARY KEY (project_hash, branch_name, id)
 * - relationships: PRIMARY KEY (project_hash, branch_name, id)
 * - doc_embeddings: PRIMARY KEY (project_hash, branch_name, id)
 * - files: PRIMARY KEY (project_hash, branch_name, path)
 *
 * Indexing strategy:
 * - Composite indexes (project_hash, branch_name, ...) for efficient filtering
 * - SQLite B-tree provides O(log n) seeks, no full table scans
 * - With 10 projects × 1M rows, query for 1000-row project reads only ~1000 rows
 *
 * Branch handling:
 * - Default branch: "main" or "master" (auto-detected)
 * - Branch switch = just change query parameter, no DB reconnection
 * - Cross-branch queries possible: "compare feature/x with main"
 *
 * Benefits over per-project DBs:
 * - No context switching complexity (reinitializeForProject, switchProject)
 * - Cross-project queries: "find similar code in project A and B"
 * - Single connection pool, simpler resource management
 * - Atomic cross-project operations possible
 */

/**
 * Get paths for the global unified database
 * All projects share the same database files with project_hash partitioning
 */
export function getGlobalDbPaths() {
  const dataDir = getDataDir();

  return {
    dir: dataDir,
    graphDbPath: join(dataDir, "global-graph.db"),
    vectorsDbPath: join(dataDir, "global-vectors.db"),
    metaPath: join(dataDir, "global-meta.json"),
    cacheDir: getCacheDir(),
  };
}

/**
 * Get project hash for use in queries
 * Returns the xxHash32 of the normalized project path
 */
export function getProjectHash(projectPath: string): string {
  return hashProjectPath(projectPath);
}

/**
 * Get branch name for use in queries
 * Sanitizes branch name for safe storage (replaces special chars)
 */
export function normalizeBranchName(branchName: string): string {
  // Normalize branch name: lowercase, replace problematic chars
  return branchName.toLowerCase().replace(/[<>:"/\\|?*]/g, "_");
}

/**
 * Default branch name when Git info is unavailable
 */
export const DEFAULT_BRANCH = "main";

/**
 * Ensure project directory exists
 */
export function ensureProjectDir(projectPath: string): string {
  const paths = getProjectPaths(projectPath);
  if (!existsSync(paths.dir)) {
    mkdirSync(paths.dir, { recursive: true });
  }
  return paths.dir;
}

/**
 * Ensure global database directory exists
 */
export function ensureGlobalDbDir(): string {
  const paths = getGlobalDbPaths();
  if (!existsSync(paths.dir)) {
    mkdirSync(paths.dir, { recursive: true });
  }
  return paths.dir;
}

/**
 * Get paths for a specific branch
 */
export function getBranchPaths(projectPath: string, branchName: string) {
  const { branchesDir } = getProjectPaths(projectPath);
  // Sanitize branch name for filesystem
  const safeBranchName = branchName.replace(/[<>:"/\\|?*]/g, "_");
  const branchDir = join(branchesDir, safeBranchName);

  return {
    dir: branchDir,
    graphDbPath: join(branchDir, "graph.db"),
    vectorsDbPath: join(branchDir, "vectors.db"),
  };
}

// =============================================================================
// Cache paths
// =============================================================================

export function getTreeSitterCacheDir(): string {
  return join(getCacheDir(), "tree-sitter");
}

export function getASTCacheDir(): string {
  return join(getCacheDir(), "ast");
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize all required directories
 */
export function initializeStorageDirs(): void {
  const dirs = [
    getDataDir(),
    getLogsDir(),
    getCacheDir(),
    getProjectsDir(),
    getModelsDir(),
    getConfigDir(),
    getTreeSitterCacheDir(),
    getASTCacheDir(),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// =============================================================================
// Migration Helper
// =============================================================================

/**
 * Check if a project has local .ultrascript data that should be migrated
 */
export function hasLocalData(projectPath: string): boolean {
  const localUltrascript = join(projectPath, ".ultrascript");
  return existsSync(localUltrascript);
}

/**
 * Get paths for local .ultrascript data (for migration)
 */
export function getLocalPaths(projectPath: string) {
  const localDir = join(projectPath, ".ultrascript");
  return {
    dir: localDir,
    graphDbPath: join(localDir, "graph.db"),
    vectorsDbPath: join(localDir, "vectors.db"),
    logsDir: join(localDir, "logs"),
  };
}
