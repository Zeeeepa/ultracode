/**
 * Storage paths management for UltraScript Tools
 *
 * All data is stored in a central location:
 * - Windows: %LOCALAPPDATA%\UltraScriptTools\
 * - macOS: ~/Library/Application Support/UltraScriptTools/
 * - Linux: ~/.local/share/UltraScriptTools/
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
 */
export function hashProjectPath(projectPath: string): string {
  // Normalize path for consistent hashing
  const normalized = projectPath.toLowerCase().replace(/\\/g, "/").replace(/\/$/, "");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Get the directory for a specific project
 */
export function getProjectDir(projectPath: string): string {
  const hash = hashProjectPath(projectPath);
  return join(getProjectsDir(), hash);
}

/**
 * Get paths for project databases
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
