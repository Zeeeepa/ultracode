/**
 * Merkle File Tracker - Fast File Change Detection
 *
 * Wraps FileWatcher with Merkle tree support for:
 * - Fast startup: verify root hash instead of full scan
 * - Incremental updates: detect only changed files
 * - Branch sync: efficiently compare file trees
 *
 * Usage:
 * - First run: full scan + build Merkle tree
 * - Subsequent runs: verify root hash, process only changes
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { log } from "../logging/index.js";
import type { Client } from "../storage/libsql/types.js";
import type { MerkleFileInfo } from "../storage/prolly/types.js";
import { FileMerkleTree } from "./file-merkle.js";
import { type FileChangeEvent, FileWatcher, type FileWatcherConfig } from "./file-watcher.js";

// =============================================================================
// TYPES
// =============================================================================

export interface MerkleFileTrackerConfig extends FileWatcherConfig {
  /** Enable Merkle-based fast startup */
  enableMerkle?: boolean;
  /** Hash algorithm for file content */
  hashAlgorithm?: "xxhash" | "sha256";
}

export interface FastStartupResult {
  /** Whether fast startup was used */
  fastStartup: boolean;
  /** Number of changed files detected */
  changedFiles: number;
  /** Time taken for startup */
  startupMs: number;
  /** Root hash after startup */
  rootHash: string | null;
}

// =============================================================================
// MERKLE FILE TRACKER
// =============================================================================

export class MerkleFileTracker {
  private fileWatcher: FileWatcher;
  private fileMerkle: FileMerkleTree;
  private config: Required<MerkleFileTrackerConfig>;
  private isInitialized = false;

  constructor(config: MerkleFileTrackerConfig) {
    this.config = {
      rootDir: config.rootDir,
      include: config.include || ["**/*"],
      exclude: config.exclude || ["**/node_modules/**", "**/.git/**"],
      debounceMs: config.debounceMs ?? 100,
      bulkThreshold: config.bulkThreshold ?? 1000,
      enableMerkle: config.enableMerkle ?? true,
      hashAlgorithm: config.hashAlgorithm ?? "xxhash",
    };

    this.fileWatcher = new FileWatcher(config);
    this.fileMerkle = new FileMerkleTree();
  }

  /**
   * Initialize with database client
   */
  async initialize(client: Client, projectHash: string, branchName: string): Promise<void> {
    await this.fileMerkle.initialize(client);
    this.fileMerkle.setContext(projectHash, branchName, this.config.rootDir);

    this.isInitialized = true;
    log.i("MERKLE_TRACKER", "initialized", { project: projectHash.slice(0, 8), branch: branchName });
  }

  /**
   * Start tracking with Merkle-optimized startup.
   * Returns information about startup performance.
   */
  async start(): Promise<FastStartupResult> {
    const startTime = Date.now();

    if (!this.config.enableMerkle || !this.isInitialized) {
      // Fall back to standard FileWatcher
      await this.fileWatcher.start();
      return {
        fastStartup: false,
        changedFiles: 0,
        startupMs: Date.now() - startTime,
        rootHash: null,
      };
    }

    try {
      // Check if we have a stored Merkle tree
      const storedRootHash = await this.fileMerkle.getRootHash();

      if (storedRootHash) {
        // Try fast startup with Merkle diff
        const result = await this.fastStartup(storedRootHash);
        return {
          ...result,
          startupMs: Date.now() - startTime,
        };
      }

      // First run - full scan and build Merkle tree
      log.i("MERKLE_TRACKER", "first_run_full_scan");
      const result = await this.fullScanAndBuild();
      return {
        ...result,
        startupMs: Date.now() - startTime,
      };
    } catch (error) {
      log.e("MERKLE_TRACKER", "startup_error", { error: (error as Error).message });
      // Fall back to standard FileWatcher
      await this.fileWatcher.start();
      return {
        fastStartup: false,
        changedFiles: 0,
        startupMs: Date.now() - startTime,
        rootHash: null,
      };
    }
  }

  /**
   * Fast startup using Merkle diff
   */
  private async fastStartup(storedRootHash: string): Promise<Omit<FastStartupResult, "startupMs">> {
    log.i("MERKLE_TRACKER", "fast_startup_attempt", { storedRoot: storedRootHash.slice(0, 8) });

    // Quick scan of current files
    const currentFiles = await this.scanFilesWithHashes();

    // Diff with stored Merkle tree
    const diff = await this.fileMerkle.diffWithFS(currentFiles);

    if (diff.changes.length === 0) {
      // No changes - instant startup!
      log.i("MERKLE_TRACKER", "fast_startup_success", { noChanges: true });
      await this.fileWatcher.start();
      return {
        fastStartup: true,
        changedFiles: 0,
        rootHash: storedRootHash,
      };
    }

    // Process only changed files
    log.i("MERKLE_TRACKER", "fast_startup_with_changes", { changes: diff.changes.length });

    // Update Merkle tree with changes
    let newRootHash = storedRootHash;
    for (const change of diff.changes) {
      if (change.type === "add" || change.type === "modify") {
        newRootHash = await this.fileMerkle.updateFile(change.path, change.newHash!);
      } else if (change.type === "delete") {
        newRootHash = await this.fileMerkle.deleteFile(change.path);
      }
    }

    // Emit change events
    const changeEvents: FileChangeEvent[] = diff.changes.map((c) => ({
      path: `${this.config.rootDir}/${c.path}`,
      type: c.type === "add" ? "add" : c.type === "delete" ? "unlink" : "change",
      timestamp: Date.now(),
    }));

    // Start watcher and emit changes
    await this.fileWatcher.start();
    if (changeEvents.length > 0) {
      this.fileWatcher.emit("change", changeEvents, changeEvents.length >= this.config.bulkThreshold);
    }

    return {
      fastStartup: true,
      changedFiles: diff.changes.length,
      rootHash: newRootHash,
    };
  }

  /**
   * Full scan and build Merkle tree (first run)
   */
  private async fullScanAndBuild(): Promise<Omit<FastStartupResult, "startupMs">> {
    const files = await this.scanFilesWithHashes();

    // Build Merkle tree
    const rootHash = await this.fileMerkle.build(files);

    // Start watcher
    await this.fileWatcher.start();

    // Emit all files as additions
    const changeEvents: FileChangeEvent[] = files.map((f) => ({
      path: f.path,
      type: "add" as const,
      timestamp: Date.now(),
    }));

    if (changeEvents.length > 0) {
      this.fileWatcher.emit("change", changeEvents, true);
    }

    log.i("MERKLE_TRACKER", "full_scan_complete", {
      files: files.length,
      rootHash: rootHash.slice(0, 8),
    });

    return {
      fastStartup: false,
      changedFiles: files.length,
      rootHash,
    };
  }

  /**
   * Scan files and compute hashes
   */
  private async scanFilesWithHashes(): Promise<MerkleFileInfo[]> {
    const files: MerkleFileInfo[] = [];

    // Get file list from watcher's scan method
    // @ts-expect-error - accessing private method
    const filePaths = await this.fileWatcher.scanFiles();

    // Compute hashes in parallel batches
    const batchSize = 100;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const hash = await this.computeFileHash(filePath);
            const stats = await stat(filePath);
            return {
              path: filePath,
              hash,
              size: stats.size,
              mtime: stats.mtimeMs,
            };
          } catch {
            return null;
          }
        }),
      );

      for (const result of results) {
        if (result) files.push(result);
      }
    }

    return files;
  }

  /**
   * Compute hash for a file
   */
  private async computeFileHash(filePath: string): Promise<string> {
    const content = await readFile(filePath);

    if (this.config.hashAlgorithm === "sha256") {
      return createHash("sha256").update(content).digest("hex");
    }

    // Default to xxhash (faster) - would need xxhash-wasm
    // For now, use sha256 as fallback
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Handle file change event and update Merkle tree
   */
  async onFileChange(event: FileChangeEvent): Promise<void> {
    if (!this.config.enableMerkle || !this.isInitialized) return;

    try {
      if (event.type === "unlink") {
        await this.fileMerkle.deleteFile(event.path);
      } else {
        const hash = await this.computeFileHash(event.path);
        await this.fileMerkle.updateFile(event.path, hash);
      }
    } catch (error) {
      log.w("MERKLE_TRACKER", "update_error", { path: event.path, error: (error as Error).message });
    }
  }

  /**
   * Get the underlying FileWatcher
   */
  getFileWatcher(): FileWatcher {
    return this.fileWatcher;
  }

  /**
   * Get the FileMerkleTree
   */
  getFileMerkle(): FileMerkleTree {
    return this.fileMerkle;
  }

  /**
   * Get current root hash
   */
  async getRootHash(): Promise<string | null> {
    if (!this.isInitialized) return null;
    return this.fileMerkle.getRootHash();
  }

  /**
   * Stop tracking
   */
  async stop(): Promise<void> {
    await this.fileWatcher.stop();
  }

  /**
   * Get status
   */
  async getStatus(): Promise<{
    watcherStatus: ReturnType<FileWatcher["getStatus"]>;
    merkleStats: { totalNodes: number; fileNodes: number; dirNodes: number } | null;
    rootHash: string | null;
  }> {
    const watcherStatus = this.fileWatcher.getStatus();

    let merkleStats = null;
    let rootHash = null;

    if (this.isInitialized) {
      merkleStats = await this.fileMerkle.getStats();
      rootHash = await this.fileMerkle.getRootHash();
    }

    return {
      watcherStatus,
      merkleStats,
      rootHash,
    };
  }

  /**
   * Verify Merkle tree integrity
   */
  async verify(): Promise<{ valid: boolean; errors: string[] } | null> {
    if (!this.isInitialized) return null;
    return this.fileMerkle.verify();
  }

  /**
   * Rebuild Merkle tree from scratch
   */
  async rebuild(): Promise<string> {
    const files = await this.scanFilesWithHashes();
    return this.fileMerkle.build(files);
  }
}
