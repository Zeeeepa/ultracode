/**
 * Version Manager - Git Worktree + Backup Fallback
 *
 * Manages code snapshots with automatic backend selection:
 * - Git worktree/stash for git repositories
 * - .backup/ directory for non-git projects
 *
 * Features:
 * - Streaming file copy for large files
 * - xxHash integrity checks
 * - Automatic cleanup of old snapshots
 *
 * Architecture References:
 * - Stream Helpers: src/utils/stream-helpers.ts
 * - xxHash: xxhash-wasm
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import xxhash from "xxhash-wasm";
import { log } from "../logging/index.js";
import { streamCopyFile } from "../utils/stream-helpers.js";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface SnapshotMetadata {
  id: string;
  timestamp: number;
  description: string;
  backend: "git-worktree" | "backup";
  filesAffected: string[];
  totalSizeBytes: number;
  hash: string; // xxHash of snapshot content
  gitStashRef?: string; // For git backend
  backupPath?: string; // For backup backend
}

export interface VersionManagerConfig {
  workingDirectory: string;
  backupDir?: string; // Default: .backup
  maxSnapshots?: number; // Default: 10
  autoCleanupDays?: number; // Default: 7 days
}

export interface SnapshotListEntry {
  id: string;
  timestamp: number;
  description: string;
  backend: "git-worktree" | "backup";
  sizeBytes: number;
  filesCount: number;
}

// =============================================================================
// VERSION MANAGER IMPLEMENTATION
// =============================================================================

export class VersionManager {
  private config: Required<VersionManagerConfig>;
  private xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;
  private hasGit: boolean = false;

  constructor(config: VersionManagerConfig) {
    this.config = {
      workingDirectory: config.workingDirectory,
      backupDir: config.backupDir || ".backup",
      maxSnapshots: config.maxSnapshots || 10,
      autoCleanupDays: config.autoCleanupDays || 7,
    };
  }

  /**
   * Initialize Version Manager
   */
  async initialize(): Promise<void> {
    // Initialize xxHash
    this.xxhashInstance = await xxhash();

    // Detect git
    this.hasGit = await this.detectGit();

    log.i("VERSIONMGR", "init", { backend: this.hasGit ? "git-stash" : "backup" });

    // Ensure backup directory exists
    const backupPath = join(this.config.workingDirectory, this.config.backupDir);
    if (!existsSync(backupPath)) {
      await mkdir(backupPath, { recursive: true });
    }
  }

  /**
   * Create snapshot of current state
   */
  async createSnapshot(description: string, files?: string[]): Promise<string> {
    if (!this.xxhashInstance) {
      throw new Error("VersionManager not initialized");
    }

    if (this.hasGit) {
      return this.createGitSnapshot(description, files);
    } else {
      return this.createBackupSnapshot(description, files);
    }
  }

  /**
   * Rollback to a snapshot
   */
  async rollback(snapshotId: string): Promise<void> {
    const metadata = await this.loadMetadata(snapshotId);

    if (!metadata) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    if (metadata.backend === "git-worktree") {
      await this.rollbackGit(metadata);
    } else {
      await this.rollbackBackup(metadata);
    }

    log.i("VERSIONMGR", "rolled_back", { snapshot: snapshotId });
  }

  /**
   * List all snapshots
   */
  async listSnapshots(limit?: number): Promise<SnapshotListEntry[]> {
    const metadataDir = join(this.config.workingDirectory, this.config.backupDir, "metadata");

    if (!existsSync(metadataDir)) {
      return [];
    }

    const files = await readdir(metadataDir);
    const snapshots: SnapshotListEntry[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const snapshotId = file.replace(".json", "");
      const metadata = await this.loadMetadata(snapshotId);

      if (metadata) {
        snapshots.push({
          id: metadata.id,
          timestamp: metadata.timestamp,
          description: metadata.description,
          backend: metadata.backend,
          sizeBytes: metadata.totalSizeBytes,
          filesCount: metadata.filesAffected.length,
        });
      }
    }

    // Sort by timestamp (newest first)
    snapshots.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? snapshots.slice(0, limit) : snapshots;
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const metadata = await this.loadMetadata(snapshotId);

    if (!metadata) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    if (metadata.backend === "backup" && metadata.backupPath) {
      // Delete backup directory
      const backupFullPath = join(this.config.workingDirectory, metadata.backupPath);
      if (existsSync(backupFullPath)) {
        await rm(backupFullPath, { recursive: true, force: true });
      }
    } else if (metadata.backend === "git-worktree" && metadata.gitStashRef) {
      // Drop git stash
      try {
        execSync(`git stash drop ${metadata.gitStashRef}`, {
          cwd: this.config.workingDirectory,
          stdio: "ignore",
          windowsHide: true,
        });
      } catch (error) {
        log.w("VERSIONMGR", "stash_drop_fail", { err: String(error) });
      }
    }

    // Delete metadata
    const metadataPath = join(this.config.workingDirectory, this.config.backupDir, "metadata", `${snapshotId}.json`);
    if (existsSync(metadataPath)) {
      await unlink(metadataPath);
    }

    log.i("VERSIONMGR", "snapshot_deleted", { snapshot: snapshotId });
  }

  /**
   * Cleanup old snapshots
   */
  async cleanup(olderThanDays?: number): Promise<number> {
    const days = olderThanDays || this.config.autoCleanupDays;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const snapshots = await this.listSnapshots();
    let deletedCount = 0;

    for (const snapshot of snapshots) {
      if (snapshot.timestamp < cutoffTime) {
        await this.deleteSnapshot(snapshot.id);
        deletedCount++;
      }
    }

    log.i("VERSIONMGR", "cleanup_done", { deleted: deletedCount, olderThanDays: days });
    return deletedCount;
  }

  /**
   * Get snapshot metadata
   */
  async getSnapshotMetadata(snapshotId: string): Promise<SnapshotMetadata | null> {
    return this.loadMetadata(snapshotId);
  }

  // =============================================================================
  // PRIVATE: GIT BACKEND
  // =============================================================================

  private async createGitSnapshot(description: string, files?: string[]): Promise<string> {
    const timestamp = Date.now();
    const snapshotId = `snapshot-${timestamp}`;

    try {
      // Check if there are uncommitted changes
      const status = execSync("git status --porcelain", {
        cwd: this.config.workingDirectory,
        encoding: "utf-8",
        windowsHide: true,
      }).trim();

      if (status.length === 0 && !files) {
        log.w("VERSIONMGR", "no_changes");
      }

      // Create stash
      const stashMessage = `${snapshotId}: ${description}`;
      execSync(`git stash push -m "${stashMessage}"`, {
        cwd: this.config.workingDirectory,
        encoding: "utf-8",
        windowsHide: true,
      });

      // Get stash reference
      const stashRef = execSync("git rev-parse stash@{0}", {
        cwd: this.config.workingDirectory,
        encoding: "utf-8",
        windowsHide: true,
      }).trim();

      // Compute hash
      const hash = this.xxhashInstance!.h64ToString(stashRef);

      // Save metadata
      const metadata: SnapshotMetadata = {
        id: snapshotId,
        timestamp,
        description,
        backend: "git-worktree",
        filesAffected: files || this.getGitChangedFiles(),
        totalSizeBytes: 0, // Git stash size is hard to determine
        hash: hash.slice(0, 16),
        gitStashRef: stashRef,
      };

      await this.saveMetadata(snapshotId, metadata);

      log.i("VERSIONMGR", "git_snapshot", { snapshot: snapshotId, stash: stashRef.slice(0, 8) });
      return snapshotId;
    } catch (error) {
      throw new Error(`Failed to create git snapshot`, { cause: error });
    }
  }

  private async rollbackGit(metadata: SnapshotMetadata): Promise<void> {
    if (!metadata.gitStashRef) {
      throw new Error("Git stash reference not found in metadata");
    }

    try {
      // Apply stash
      execSync(`git stash apply ${metadata.gitStashRef}`, {
        cwd: this.config.workingDirectory,
        encoding: "utf-8",
        windowsHide: true,
      });
    } catch (error) {
      throw new Error(`Failed to apply git stash: ${metadata.gitStashRef}`, { cause: error });
    }
  }

  private getGitChangedFiles(): string[] {
    try {
      const output = execSync("git status --porcelain", {
        cwd: this.config.workingDirectory,
        encoding: "utf-8",
        windowsHide: true,
      });

      const files: string[] = [];
      for (const line of output.split("\n")) {
        if (line.trim().length === 0) continue;

        // Parse git status format: "XY filename"
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          files.push(parts.slice(1).join(" "));
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  // =============================================================================
  // PRIVATE: BACKUP BACKEND
  // =============================================================================

  private async createBackupSnapshot(description: string, files?: string[]): Promise<string> {
    const timestamp = Date.now();
    const snapshotId = `snapshot-${timestamp}`;
    const snapshotDir = join(this.config.backupDir, snapshotId);
    const snapshotFullPath = join(this.config.workingDirectory, snapshotDir);

    await mkdir(snapshotFullPath, { recursive: true });

    // Determine files to backup
    const filesToBackup = files || (await this.getAllTrackedFiles());
    let totalSize = 0;

    // Copy files (streaming for large files)
    for (const file of filesToBackup) {
      const sourcePath = join(this.config.workingDirectory, file);

      // Skip if file doesn't exist
      if (!existsSync(sourcePath)) continue;

      const targetPath = join(snapshotFullPath, file);

      // Create parent directories
      await mkdir(dirname(targetPath), { recursive: true });

      // Stream copy
      const stats = await stat(sourcePath);
      totalSize += stats.size;

      // Use streaming for files >1MB
      if (stats.size > 1024 * 1024) {
        await streamCopyFile(sourcePath, targetPath);
      } else {
        // Small file - direct copy
        const content = await readFile(sourcePath);
        await writeFile(targetPath, content);
      }
    }

    // Compute xxHash of snapshot directory for integrity
    const hashContent = `${snapshotId}:${timestamp}:${filesToBackup.length}`;
    const hash = this.xxhashInstance!.h64ToString(hashContent);

    const metadata: SnapshotMetadata = {
      id: snapshotId,
      timestamp,
      description,
      backend: "backup",
      filesAffected: filesToBackup,
      totalSizeBytes: totalSize,
      hash: hash.slice(0, 16),
      backupPath: snapshotDir,
    };

    await this.saveMetadata(snapshotId, metadata);

    log.i("VERSIONMGR", "backup_snapshot", {
      snapshot: snapshotId,
      files: filesToBackup.length,
      sizeMB: +(totalSize / 1024 / 1024).toFixed(2),
    });
    return snapshotId;
  }

  private async rollbackBackup(metadata: SnapshotMetadata): Promise<void> {
    if (!metadata.backupPath) {
      throw new Error("Backup path not found in metadata");
    }

    const snapshotFullPath = join(this.config.workingDirectory, metadata.backupPath);

    if (!existsSync(snapshotFullPath)) {
      throw new Error(`Backup directory not found: ${snapshotFullPath}`);
    }

    // Restore files from backup (streaming for large files)
    for (const file of metadata.filesAffected) {
      const sourcePath = join(snapshotFullPath, file);
      const targetPath = join(this.config.workingDirectory, file);

      if (!existsSync(sourcePath)) continue;

      // Create parent directories
      await mkdir(dirname(targetPath), { recursive: true });

      // Stream copy
      const stats = await stat(sourcePath);

      if (stats.size > 1024 * 1024) {
        await streamCopyFile(sourcePath, targetPath);
      } else {
        const content = await readFile(sourcePath);
        await writeFile(targetPath, content);
      }
    }
  }

  private async getAllTrackedFiles(): Promise<string[]> {
    const files: string[] = [];
    const excludePatterns = [
      "node_modules",
      ".git",
      "dist",
      "build",
      this.config.backupDir,
      ".backup",
      "coverage",
      ".nyc_output",
    ];

    async function walk(dir: string, basePath: string) {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(basePath, fullPath);

        // Skip excluded directories
        if (excludePatterns.some((pattern) => relativePath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath, basePath);
        } else {
          files.push(relativePath);
        }
      }
    }

    await walk(this.config.workingDirectory, this.config.workingDirectory);
    return files;
  }

  // =============================================================================
  // PRIVATE: UTILITIES
  // =============================================================================

  private async detectGit(): Promise<boolean> {
    try {
      const gitDir = join(this.config.workingDirectory, ".git");
      return existsSync(gitDir);
    } catch {
      return false;
    }
  }

  private async saveMetadata(snapshotId: string, metadata: SnapshotMetadata): Promise<void> {
    const metadataDir = join(this.config.workingDirectory, this.config.backupDir, "metadata");
    await mkdir(metadataDir, { recursive: true });

    const metadataPath = join(metadataDir, `${snapshotId}.json`);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  private async loadMetadata(snapshotId: string): Promise<SnapshotMetadata | null> {
    const metadataPath = join(this.config.workingDirectory, this.config.backupDir, "metadata", `${snapshotId}.json`);

    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const data = await readFile(metadataPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      log.e("VERSIONMGR", "metadata_load_fail", { err: String(error) });
      return null;
    }
  }
}
