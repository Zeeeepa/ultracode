/**
 * Git Watcher - Git Repository Change Detection
 *
 * Watches for Git branch changes and file modifications to trigger
 * automatic reindexing.
 *
 * Architecture References:
 * - Design Doc: docs/BRANCH_AWARE_INDEXING.md
 * - Branch Manager: src/core/branch-manager.ts
 * - Knowledge Bus: src/core/knowledge-bus.ts
 */

import { execSync } from "node:child_process";
import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";

// =============================================================================
// 1. TYPES AND INTERFACES
// =============================================================================

export type BranchChangeCallback = (newBranch: string, oldBranch: string) => void;
export type CommitCallback = (commitHash: string) => void;
export type FileChangeCallback = (files: string[]) => void;

export interface GitWatcherConfig {
  enabled: boolean;
  pollIntervalMs: number;
  autoReindex: boolean;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
}

// =============================================================================
// 2. GIT WATCHER IMPLEMENTATION
// =============================================================================

export class GitWatcher {
  private config: GitWatcherConfig;
  private repoPath: string | null = null;
  private watcher: FSWatcher | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  private currentBranch: string | null = null;
  private currentCommit: string | null = null;

  private branchChangeCallbacks: BranchChangeCallback[] = [];
  private commitCallbacks: CommitCallback[] = [];
  private fileChangeCallbacks: FileChangeCallback[] = [];

  constructor(config: GitWatcherConfig) {
    this.config = config;
  }

  /**
   * Start watching a Git repository
   */
  startWatching(repoPath: string): void {
    if (!this.config.enabled) {
      console.error("[GitWatcher] Git watching is disabled");
      return;
    }

    this.repoPath = repoPath;
    const gitHeadPath = join(repoPath, ".git", "HEAD");

    if (!existsSync(gitHeadPath)) {
      console.error("[GitWatcher] No .git directory found, skipping Git watch");
      return;
    }

    // Initialize current state
    this.currentBranch = this.getCurrentBranch();
    this.currentCommit = this.getCurrentCommit();

    console.error(`[GitWatcher] Started watching repository: ${repoPath}`);
    console.error(`[GitWatcher] Current branch: ${this.currentBranch}`);
    console.error(`[GitWatcher] Current commit: ${this.currentCommit}`);

    // Watch .git/HEAD for branch changes
    this.watcher = watch(gitHeadPath, (eventType) => {
      if (eventType === "change") {
        this.checkBranchChange();
      }
    });

    // Poll for commit changes (more reliable than watching refs)
    this.pollInterval = setInterval(() => {
      this.checkCommitChange();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop watching the repository
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    console.error("[GitWatcher] Stopped watching repository");
  }

  /**
   * Register callback for branch changes
   */
  onBranchChange(callback: BranchChangeCallback): void {
    this.branchChangeCallbacks.push(callback);
  }

  /**
   * Register callback for new commits
   */
  onCommit(callback: CommitCallback): void {
    this.commitCallbacks.push(callback);
  }

  /**
   * Register callback for file changes
   */
  onFileChange(callback: FileChangeCallback): void {
    this.fileChangeCallbacks.push(callback);
  }

  /**
   * Get files changed since a specific commit/branch
   */
  async getChangedFiles(since: string): Promise<FileChange[]> {
    if (!this.repoPath) {
      return [];
    }

    try {
      // Get changed files between commits
      const output = execSync(`git diff --name-status ${since}..HEAD`, {
        cwd: this.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });

      const changes: FileChange[] = [];
      const lines = output.trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        const [status, ...pathParts] = line.split("\t");
        if (!status) continue;

        const path = pathParts.join("\t");

        let changeStatus: FileChange["status"];
        switch (status[0]) {
          case "A":
            changeStatus = "added";
            break;
          case "M":
            changeStatus = "modified";
            break;
          case "D":
            changeStatus = "deleted";
            break;
          case "R":
            changeStatus = "renamed";
            break;
          default:
            changeStatus = "modified";
        }

        changes.push({ path, status: changeStatus });
      }

      return changes;
    } catch (error) {
      console.error("[GitWatcher] Failed to get changed files:", error);
      return [];
    }
  }

  /**
   * Get changed files between two branches
   */
  async getChangedFilesBetweenBranches(oldBranch: string, newBranch: string): Promise<FileChange[]> {
    if (!this.repoPath) {
      return [];
    }

    try {
      const output = execSync(`git diff --name-status ${oldBranch}...${newBranch}`, {
        cwd: this.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });

      const changes: FileChange[] = [];
      const lines = output.trim().split("\n");

      for (const line of lines) {
        if (!line) continue;

        const [status, ...pathParts] = line.split("\t");
        if (!status) continue;

        const path = pathParts.join("\t");

        let changeStatus: FileChange["status"];
        switch (status[0]) {
          case "A":
            changeStatus = "added";
            break;
          case "M":
            changeStatus = "modified";
            break;
          case "D":
            changeStatus = "deleted";
            break;
          case "R":
            changeStatus = "renamed";
            break;
          default:
            changeStatus = "modified";
        }

        changes.push({ path, status: changeStatus });
      }

      return changes;
    } catch (error) {
      console.error("[GitWatcher] Failed to get changed files between branches:", error);
      return [];
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private getCurrentBranch(): string | null {
    if (!this.repoPath) return null;

    try {
      const branch = execSync("git symbolic-ref --short HEAD", {
        cwd: this.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      }).trim();

      return branch;
    } catch {
      // Detached HEAD
      try {
        const hash = execSync("git rev-parse --short HEAD", {
          cwd: this.repoPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          windowsHide: true,
        }).trim();
        return `detached-${hash}`;
      } catch {
        return null;
      }
    }
  }

  private getCurrentCommit(): string | null {
    if (!this.repoPath) return null;

    try {
      const commit = execSync("git rev-parse HEAD", {
        cwd: this.repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      }).trim();

      return commit;
    } catch {
      return null;
    }
  }

  private checkBranchChange(): void {
    const newBranch = this.getCurrentBranch();

    if (newBranch && newBranch !== this.currentBranch) {
      const oldBranch = this.currentBranch || "unknown";
      console.error(`[GitWatcher] Branch changed: ${oldBranch} -> ${newBranch}`);

      this.currentBranch = newBranch;
      this.currentCommit = this.getCurrentCommit();

      // Trigger callbacks
      for (const callback of this.branchChangeCallbacks) {
        try {
          callback(newBranch, oldBranch);
        } catch (error) {
          console.error("[GitWatcher] Branch change callback error:", error);
        }
      }
    }
  }

  private checkCommitChange(): void {
    const newCommit = this.getCurrentCommit();

    if (newCommit && newCommit !== this.currentCommit) {
      console.error(`[GitWatcher] New commit detected: ${newCommit.slice(0, 8)}`);

      const oldCommit = this.currentCommit;
      this.currentCommit = newCommit;

      // Trigger callbacks
      for (const callback of this.commitCallbacks) {
        try {
          callback(newCommit);
        } catch (error) {
          console.error("[GitWatcher] Commit callback error:", error);
        }
      }

      // Get changed files since last commit
      if (oldCommit) {
        this.getChangedFiles(oldCommit).then((files) => {
          if (files.length > 0) {
            for (const callback of this.fileChangeCallbacks) {
              try {
                callback(files.map((f) => f.path));
              } catch (error) {
                console.error("[GitWatcher] File change callback error:", error);
              }
            }
          }
        });
      }
    }
  }
}
