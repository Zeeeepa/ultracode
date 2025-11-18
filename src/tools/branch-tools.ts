/**
 * Branch Management Tools
 *
 * MCP tool handlers for branch-aware indexing operations.
 *
 * Architecture References:
 * - Branch Manager: src/core/branch-manager.ts
 * - Git Watcher: src/core/git-watcher.ts
 * - Indexer Agent: src/agents/indexer-agent.ts
 */

import type { BranchManager } from "../core/branch-manager.js";
import type { GitWatcher } from "../core/git-watcher.js";

// =============================================================================
// BRANCH TOOLS
// =============================================================================

/**
 * List all indexed branches for a repository
 */
export async function listBranches(
  branchManager: BranchManager | null,
  repoPath?: string,
): Promise<{
  branches: Array<{
    name: string;
    dbPath: string;
    lastAccessed: number;
    sizeBytes: number;
    metadata: {
      lastCommitHash: string | null;
      lastIndexedAt: number;
      entityCount: number;
      relationshipCount: number;
      fileCount: number;
    } | null;
  }>;
  currentBranch: string | null;
}> {
  if (!branchManager) {
    throw new Error("Branch-aware indexing is not enabled. Set indexing.branchAware: true in config.");
  }

  const currentBranch = branchManager.getCurrentBranch(repoPath);
  const activeBranches = branchManager.getActiveBranches(repoPath);

  return {
    branches: activeBranches.map((branch) => ({
      name: branch.name,
      dbPath: branch.dbPath,
      lastAccessed: branch.lastAccessed,
      sizeBytes: branch.sizeBytes,
      metadata: branch.metadata
        ? {
            lastCommitHash: branch.metadata.lastCommitHash,
            lastIndexedAt: branch.metadata.lastIndexedAt,
            entityCount: branch.metadata.entityCount,
            relationshipCount: branch.metadata.relationshipCount,
            fileCount: branch.metadata.fileCount,
          }
        : null,
    })),
    currentBranch,
  };
}

/**
 * Switch to a different branch
 */
export async function switchBranch(
  branchManager: BranchManager | null,
  branch: string,
  repoPath?: string,
): Promise<{
  success: boolean;
  previousBranch: string | null;
  newBranch: string;
  message: string;
}> {
  if (!branchManager) {
    throw new Error("Branch-aware indexing is not enabled. Set indexing.branchAware: true in config.");
  }

  const previousBranch = branchManager.getCurrentBranch(repoPath);

  await branchManager.switchBranch(branch, repoPath);

  return {
    success: true,
    previousBranch,
    newBranch: branch,
    message: `Switched from ${previousBranch} to ${branch}`,
  };
}

/**
 * Get status of current branch
 */
export async function getBranchStatus(
  branchManager: BranchManager | null,
  repoPath?: string,
): Promise<{
  currentBranch: string | null;
  lastCommitHash: string | null;
  metadata: {
    lastIndexedAt: number;
    entityCount: number;
    relationshipCount: number;
    fileCount: number;
    indexVersion: string;
  } | null;
  databasePath: string | null;
  databaseExists: boolean;
}> {
  if (!branchManager) {
    throw new Error("Branch-aware indexing is not enabled. Set indexing.branchAware: true in config.");
  }

  const currentBranch = branchManager.getCurrentBranch(repoPath);
  if (!currentBranch) {
    return {
      currentBranch: null,
      lastCommitHash: null,
      metadata: null,
      databasePath: null,
      databaseExists: false,
    };
  }

  const metadata = branchManager.getBranchMetadata(currentBranch, repoPath);
  const dbPath = branchManager.getBranchDbPath(currentBranch, repoPath);
  const dbExists = branchManager.hasBranchDatabase(currentBranch, repoPath);
  const lastCommitHash = branchManager.getLastCommitHash(repoPath);

  return {
    currentBranch,
    lastCommitHash,
    metadata: metadata
      ? {
          lastIndexedAt: metadata.lastIndexedAt,
          entityCount: metadata.entityCount,
          relationshipCount: metadata.relationshipCount,
          fileCount: metadata.fileCount,
          indexVersion: metadata.indexVersion,
        }
      : null,
    databasePath: dbPath,
    databaseExists: dbExists,
  };
}

/**
 * Cleanup old branches
 */
export async function cleanupBranches(
  branchManager: BranchManager | null,
  keep?: number,
): Promise<{
  deletedCount: number;
  message: string;
}> {
  if (!branchManager) {
    throw new Error("Branch-aware indexing is not enabled. Set indexing.branchAware: true in config.");
  }

  const deletedCount = await branchManager.cleanupOldBranches(keep);

  return {
    deletedCount,
    message: `Cleaned up ${deletedCount} old branch database(s)`,
  };
}

/**
 * Get changed files between branches
 */
export async function getChangedFiles(
  gitWatcher: GitWatcher | null,
  fromBranch: string,
  toBranch: string,
): Promise<{
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
  }>;
  totalFiles: number;
}> {
  if (!gitWatcher) {
    throw new Error("Git integration is not enabled. Set git.enabled: true in config.");
  }

  const changes = await gitWatcher.getChangedFilesBetweenBranches(fromBranch, toBranch);

  return {
    files: changes,
    totalFiles: changes.length,
  };
}
