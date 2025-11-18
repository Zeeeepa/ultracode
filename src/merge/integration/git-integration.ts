import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Git Integration - Utilities for merge operations
 *
 * Provides safe git operations for multi-version indexing:
 * - Branch checkout
 * - Changed files detection
 * - Branch restoration
 *
 * Works with BranchManager and GitWatcher for robust git interaction.
 */

// =============================================================================
// 1. TYPES AND INTERFACES
// =============================================================================

export interface GitBranchInfo {
  name: string;
  commitHash: string;
  shortHash: string;
  isDetached: boolean;
}

export interface GitFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string; // For renamed files
}

export interface GitDiffResult {
  files: GitFileChange[];
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitIntegrationConfig {
  repoPath: string;
  allowDetachedHead?: boolean; // Allow checkout of commits/tags (default: false)
  restoreOnError?: boolean; // Restore original branch on error (default: true)
}

// =============================================================================
// 2. GIT INTEGRATION IMPLEMENTATION
// =============================================================================

export class GitIntegration {
  private config: GitIntegrationConfig;
  private originalBranch: string | null = null;

  constructor(config: GitIntegrationConfig) {
    this.config = {
      allowDetachedHead: false,
      restoreOnError: true,
      ...config,
    };

    // Validate repository exists
    if (!this.isGitRepository()) {
      throw new Error(`Not a git repository: ${this.config.repoPath}`);
    }
  }

  /**
   * Check if path is a git repository
   */
  isGitRepository(): boolean {
    const gitDir = join(this.config.repoPath, ".git");
    return existsSync(gitDir);
  }

  /**
   * Get current branch info
   */
  getCurrentBranch(): GitBranchInfo {
    try {
      // Try symbolic-ref first (works for regular branches)
      const branch = execSync("git symbolic-ref --short HEAD", {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      const commitHash = this.getCommitHash("HEAD");

      return {
        name: branch,
        commitHash,
        shortHash: commitHash.slice(0, 8),
        isDetached: false,
      };
    } catch {
      // Detached HEAD state
      const commitHash = this.getCommitHash("HEAD");

      return {
        name: `detached-${commitHash.slice(0, 8)}`,
        commitHash,
        shortHash: commitHash.slice(0, 8),
        isDetached: true,
      };
    }
  }

  /**
   * Get commit hash for a reference (branch, tag, commit)
   */
  getCommitHash(ref: string): string {
    try {
      const hash = execSync(`git rev-parse ${ref}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      return hash;
    } catch (error) {
      throw new Error(`Failed to get commit hash for ${ref}: ${error}`);
    }
  }

  /**
   * Check if a branch exists
   */
  branchExists(branch: string): boolean {
    try {
      execSync(`git rev-parse --verify ${branch}`, {
        cwd: this.config.repoPath,
        stdio: ["pipe", "pipe", "ignore"],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely checkout a branch
   *
   * Saves current branch, checks out target, handles errors.
   */
  async checkoutBranch(branch: string): Promise<void> {
    // Save current branch for restoration
    if (!this.originalBranch) {
      this.originalBranch = this.getCurrentBranch().name;
    }

    // Validate target branch exists
    if (!this.branchExists(branch)) {
      throw new Error(`Branch does not exist: ${branch}`);
    }

    // Check for uncommitted changes
    if (this.hasUncommittedChanges()) {
      throw new Error("Cannot checkout branch: uncommitted changes detected. Please commit or stash changes first.");
    }

    try {
      execSync(`git checkout ${branch}`, {
        cwd: this.config.repoPath,
        stdio: ["pipe", "pipe", "pipe"],
      });

      console.log(`[GitIntegration] Checked out branch: ${branch}`);
    } catch (error) {
      if (this.config.restoreOnError && this.originalBranch) {
        await this.restoreOriginalBranch();
      }
      throw new Error(`Failed to checkout branch ${branch}: ${error}`);
    }
  }

  /**
   * Restore original branch (before merge operations)
   */
  async restoreOriginalBranch(): Promise<void> {
    if (!this.originalBranch) {
      console.warn("[GitIntegration] No original branch to restore");
      return;
    }

    try {
      execSync(`git checkout ${this.originalBranch}`, {
        cwd: this.config.repoPath,
        stdio: ["pipe", "pipe", "pipe"],
      });

      console.log(`[GitIntegration] Restored original branch: ${this.originalBranch}`);
      this.originalBranch = null;
    } catch (error) {
      console.error(`[GitIntegration] Failed to restore branch: ${error}`);
      throw error;
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    try {
      const output = execSync("git status --porcelain", {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get changed files between two branches/commits
   */
  async getChangedFilesBetween(base: string, target: string): Promise<GitFileChange[]> {
    try {
      // Use triple-dot diff to compare merge base
      const output = execSync(`git diff --name-status ${base}...${target}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      const changes: GitFileChange[] = [];
      const lines = output.trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        const parts = line.split("\t");
        const status = parts[0];
        if (!status) continue;

        let change: GitFileChange;

        switch (status[0]) {
          case "A":
            change = { path: parts[1]!, status: "added" };
            break;
          case "M":
            change = { path: parts[1]!, status: "modified" };
            break;
          case "D":
            change = { path: parts[1]!, status: "deleted" };
            break;
          case "R":
            // Renamed: R<score>\told\tnew
            change = {
              path: parts[2]!,
              status: "renamed",
              oldPath: parts[1],
            };
            break;
          default:
            change = { path: parts[1]!, status: "modified" };
        }

        changes.push(change);
      }

      return changes;
    } catch (error) {
      console.error(`[GitIntegration] Failed to get changed files: ${error}`);
      return [];
    }
  }

  /**
   * Get detailed diff statistics between branches
   */
  async getDiffStats(base: string, target: string): Promise<GitDiffResult> {
    try {
      // Get file changes
      const files = await this.getChangedFilesBetween(base, target);

      // Get diff stats
      const output = execSync(`git diff --shortstat ${base}...${target}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      // Parse shortstat: "3 files changed, 45 insertions(+), 12 deletions(-)"
      const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);

      const filesChanged = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const insertions = match?.[2] ? Number.parseInt(match[2], 10) : 0;
      const deletions = match?.[3] ? Number.parseInt(match[3], 10) : 0;

      return {
        files,
        filesChanged,
        insertions,
        deletions,
      };
    } catch (error) {
      console.error(`[GitIntegration] Failed to get diff stats: ${error}`);
      return {
        files: [],
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };
    }
  }

  /**
   * Get merge base between two branches
   *
   * The merge base is the common ancestor commit.
   */
  getMergeBase(branchA: string, branchB: string): string | null {
    try {
      const base = execSync(`git merge-base ${branchA} ${branchB}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      return base;
    } catch (error) {
      console.error(`[GitIntegration] Failed to get merge base: ${error}`);
      return null;
    }
  }

  /**
   * Get file content at specific revision
   *
   * @param path - File path relative to repository root
   * @param ref - Git reference (branch, tag, commit hash)
   * @returns File content as string, or null if file doesn't exist at ref
   */
  getFileContent(path: string, ref: string): string | null {
    try {
      const content = execSync(`git show ${ref}:${path}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      return content;
    } catch (_error) {
      // File doesn't exist at this revision
      return null;
    }
  }

  /**
   * Get list of changed file paths between two references
   *
   * Simplified version of getChangedFilesBetween that returns only paths.
   * Useful for quick file enumeration.
   *
   * @param fromRef - Starting reference (branch, tag, commit)
   * @param toRef - Target reference
   * @returns Array of file paths (without status information)
   */
  async getChangedFiles(fromRef: string, toRef: string): Promise<string[]> {
    try {
      const output = execSync(`git diff --name-only ${fromRef}...${toRef}`, {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      return output
        .trim()
        .split("\n")
        .filter((path) => path.length > 0);
    } catch (error) {
      console.error(`[GitIntegration] Failed to get changed files: ${error}`);
      return [];
    }
  }

  /**
   * Get list of all branches
   */
  getAllBranches(): string[] {
    try {
      const output = execSync("git branch --format='%(refname:short)'", {
        cwd: this.config.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });

      return output
        .trim()
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Clean up - restore original branch if not already done
   */
  async cleanup(): Promise<void> {
    if (this.originalBranch) {
      await this.restoreOriginalBranch();
    }
  }
}
