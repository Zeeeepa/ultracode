/**
 * File Change Integration - GitWatcher + IncrementalUpdateQueue
 *
 * Connects GitWatcher events to IncrementalUpdateQueue for automatic
 * incremental indexing on file changes and branch switches.
 *
 * Architecture:
 * - GitWatcher detects file/branch changes via .git monitoring
 * - FileChangeIntegration converts events to FileChangeEvent
 * - IncrementalUpdateQueue batches and processes changes
 * - LayeredGraphIndex applies updates to appropriate delta layer
 *
 * Based on: ultrasharp-tools-mcp FileChangeHandler.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import type { FileChange, GitWatcher } from "../core/git-watcher.js";
import type { ILayeredIndex } from "../core/layered-index.js";
import type { FileChangeEvent, IncrementalUpdateQueue } from "./incremental-update-queue.js";

// =============================================================================
// TYPES
// =============================================================================

export interface FileChangeIntegrationConfig {
  /** Enable automatic indexing on file changes (default: true) */
  enableFileWatching: boolean;

  /** Enable automatic delta recomputation on branch change (default: true) */
  enableBranchWatching: boolean;

  /** Enable automatic delta update on new commits (default: true) */
  enableCommitWatching: boolean;

  /** Max files to process incrementally (fallback to full rebuild) (default: 100) */
  maxIncrementalFiles: number;

  /** Enable debug logging (default: false) */
  debug: boolean;
}

export interface IntegrationStats {
  /** Total file changes processed */
  totalFileChanges: number;

  /** Total branch switches */
  totalBranchSwitches: number;

  /** Total commits processed */
  totalCommits: number;

  /** Last update timestamp */
  lastUpdateTime: number;
}

// =============================================================================
// FILE CHANGE INTEGRATION CLASS
// =============================================================================

export class FileChangeIntegration {
  private gitWatcher: GitWatcher;
  private updateQueue: IncrementalUpdateQueue;
  private layeredIndex: ILayeredIndex;
  private config: FileChangeIntegrationConfig;

  // State
  private currentBranch: string | null = null;
  private isInitialized = false;

  // Statistics
  private stats: IntegrationStats = {
    totalFileChanges: 0,
    totalBranchSwitches: 0,
    totalCommits: 0,
    lastUpdateTime: 0,
  };

  constructor(
    gitWatcher: GitWatcher,
    updateQueue: IncrementalUpdateQueue,
    layeredIndex: ILayeredIndex,
    config?: Partial<FileChangeIntegrationConfig>,
  ) {
    this.gitWatcher = gitWatcher;
    this.updateQueue = updateQueue;
    this.layeredIndex = layeredIndex;

    // Merge config with defaults
    this.config = {
      enableFileWatching: config?.enableFileWatching ?? true,
      enableBranchWatching: config?.enableBranchWatching ?? true,
      enableCommitWatching: config?.enableCommitWatching ?? true,
      maxIncrementalFiles: config?.maxIncrementalFiles ?? 100,
      debug: config?.debug ?? false,
    };

    if (this.config.debug) {
      console.log(
        `[FileChangeIntegration] Initialized with ` +
          `file=${this.config.enableFileWatching}, ` +
          `branch=${this.config.enableBranchWatching}, ` +
          `commit=${this.config.enableCommitWatching}`,
      );
    }
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize integration (register event handlers)
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    if (this.config.debug) {
      console.log("[FileChangeIntegration] Registering event handlers...");
    }

    // Register GitWatcher callbacks
    if (this.config.enableBranchWatching) {
      this.gitWatcher.onBranchChange((newBranch, oldBranch) => {
        this.handleBranchChange(newBranch, oldBranch).catch((error) => {
          console.error("[FileChangeIntegration] Branch change handler failed:", error);
        });
      });
    }

    if (this.config.enableCommitWatching) {
      this.gitWatcher.onCommit((commitHash) => {
        this.handleCommit(commitHash).catch((error) => {
          console.error("[FileChangeIntegration] Commit handler failed:", error);
        });
      });
    }

    if (this.config.enableFileWatching) {
      this.gitWatcher.onFileChange((files) => {
        this.handleFileChanges(files).catch((error) => {
          console.error("[FileChangeIntegration] File change handler failed:", error);
        });
      });
    }

    // Subscribe to update queue events (for logging/monitoring)
    this.updateQueue.on("batch-processed", (result) => {
      if (this.config.debug) {
        console.log(
          `[FileChangeIntegration] Batch processed: ` +
            `${result.filesProcessed} files in ${result.processingTimeMs}ms`,
        );
      }
    });

    this.updateQueue.on("full-rebuild-triggered", (info) => {
      console.warn(`[FileChangeIntegration] Full rebuild triggered:`, info);
    });

    this.isInitialized = true;

    if (this.config.debug) {
      console.log("[FileChangeIntegration] Initialization complete");
    }
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================

  /**
   * Handle branch change event
   *
   * Strategy:
   * 1. Ensure branch delta exists (compute from git diff if needed)
   * 2. Switch LayeredIndex to new branch context
   * 3. Notify update queue of branch change
   *
   * @param newBranch - New branch name
   * @param oldBranch - Old branch name
   */
  private async handleBranchChange(newBranch: string, oldBranch: string): Promise<void> {
    console.log(`[FileChangeIntegration] Branch changed: ${oldBranch} -> ${newBranch}`);

    this.currentBranch = newBranch;
    this.stats.totalBranchSwitches++;
    this.stats.lastUpdateTime = Date.now();

    try {
      // Ensure branch delta exists (will compute from git diff if missing)
      const delta = await this.layeredIndex.ensureBranchDelta(newBranch);

      console.log(`[FileChangeIntegration] Branch delta ready: ${delta.totalChanges} changes`);

      // Get changed files between branches
      const changedFiles = await this.gitWatcher.getChangedFilesBetweenBranches(oldBranch, newBranch);

      if (this.config.debug) {
        console.log(`[FileChangeIntegration] ${changedFiles.length} files changed between branches`);
      }

      // Check if we should do incremental update or full rebuild
      if (changedFiles.length > 0 && changedFiles.length <= this.config.maxIncrementalFiles) {
        // Incremental update
        const events = this.convertFileChangesToEvents(changedFiles, newBranch);
        this.updateQueue.enqueueBatch(events);
      } else if (changedFiles.length > this.config.maxIncrementalFiles) {
        // Too many files - full rebuild recommended
        console.warn(
          `[FileChangeIntegration] ${changedFiles.length} files changed, ` +
            `exceeds max ${this.config.maxIncrementalFiles} - consider full rebuild`,
        );
      }
    } catch (error) {
      console.error(`[FileChangeIntegration] Failed to handle branch change:`, error);
    }
  }

  /**
   * Handle new commit event
   *
   * Strategy:
   * 1. Get changed files in commit
   * 2. Enqueue file changes for incremental update
   * 3. Update branch delta if on non-main branch
   *
   * @param commitHash - New commit hash
   */
  private async handleCommit(commitHash: string): Promise<void> {
    if (this.config.debug) {
      console.log(`[FileChangeIntegration] New commit: ${commitHash.slice(0, 8)}`);
    }

    this.stats.totalCommits++;
    this.stats.lastUpdateTime = Date.now();

    try {
      // Get changed files in this commit
      const changedFiles = await this.gitWatcher.getChangedFiles(`${commitHash}~1`);

      if (changedFiles.length > 0) {
        if (this.config.debug) {
          console.log(`[FileChangeIntegration] ${changedFiles.length} files changed in commit`);
        }

        const events = this.convertFileChangesToEvents(changedFiles, this.currentBranch);
        this.updateQueue.enqueueBatch(events);
      }

      // If on non-main branch, update branch delta
      if (this.currentBranch && !this.isMainBranch(this.currentBranch)) {
        // Recompute delta (git diff has changed)
        await this.layeredIndex.ensureBranchDelta(this.currentBranch);
      }
    } catch (error) {
      console.error(`[FileChangeIntegration] Failed to handle commit:`, error);
    }
  }

  /**
   * Handle file changes (generic)
   *
   * @param files - Changed file paths
   */
  private async handleFileChanges(files: string[]): Promise<void> {
    if (this.config.debug) {
      console.log(`[FileChangeIntegration] ${files.length} files changed`);
    }

    this.stats.totalFileChanges += files.length;
    this.stats.lastUpdateTime = Date.now();

    try {
      // Convert to FileChangeEvents (assume modified)
      const events: FileChangeEvent[] = files.map((filePath) => ({
        filePath,
        changeType: "modified",
        timestamp: Date.now(),
        branch: this.currentBranch || undefined,
      }));

      this.updateQueue.enqueueBatch(events);
    } catch (error) {
      console.error(`[FileChangeIntegration] Failed to handle file changes:`, error);
    }
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Convert GitWatcher FileChange to IncrementalUpdateQueue FileChangeEvent
   *
   * @param fileChanges - Git file changes
   * @param branch - Current branch name
   * @returns Array of file change events
   */
  private convertFileChangesToEvents(fileChanges: FileChange[], branch: string | null): FileChangeEvent[] {
    return fileChanges.map((change) => ({
      filePath: change.path,
      changeType: change.status,
      timestamp: Date.now(),
      branch: branch || undefined,
    }));
  }

  /**
   * Check if branch is main/master
   */
  private isMainBranch(branch: string): boolean {
    return branch === "main" || branch === "master";
  }

  // =========================================================================
  // STATUS & STATISTICS
  // =========================================================================

  /**
   * Get integration statistics
   */
  getStats(): IntegrationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalFileChanges: 0,
      totalBranchSwitches: 0,
      totalCommits: 0,
      lastUpdateTime: 0,
    };
  }

  /**
   * Get current branch
   */
  getCurrentBranch(): string | null {
    return this.currentBranch;
  }

  /**
   * Set current branch (for initialization)
   */
  setCurrentBranch(branch: string | null): void {
    this.currentBranch = branch;
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Shutdown integration
   */
  async shutdown(): Promise<void> {
    console.log("[FileChangeIntegration] Shutting down...");

    // Flush pending changes
    await this.updateQueue.flush();

    console.log("[FileChangeIntegration] Shutdown complete");
  }
}
