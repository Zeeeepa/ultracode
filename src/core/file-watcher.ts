/**
 * File Watcher - Lightweight File Change Detection
 *
 * Minimal implementation using:
 * - glob (already in deps) for initial file scan
 * - Bun.watch() when running under Bun (fastest)
 * - fs.watch() when running under Node.js
 *
 * Features:
 * - Runtime auto-detection (Bun vs Node)
 * - Debounced change notifications
 * - Glob pattern filtering
 * - Bulk mode for large changesets
 */

import { EventEmitter } from "node:events";
import { type FSWatcher, watch as fsWatch } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import fg from "fast-glob";
import { log } from "../logging/index.js";
import { sleep } from "../utils/runtime-detection.js";
import { areTimersSuspended } from "./indexing-state.js";

// =============================================================================
// TYPES
// =============================================================================

export type FileChangeType = "add" | "change" | "unlink";

export interface FileChangeEvent {
  path: string;
  type: FileChangeType;
  timestamp: number;
}

export interface FileWatcherConfig {
  rootDir: string;
  include?: string[];
  exclude?: string[];
  debounceMs?: number;
  bulkThreshold?: number;
}

// =============================================================================
// RUNTIME DETECTION
// =============================================================================

const isBunRuntime = typeof globalThis.Bun !== "undefined";
// Check if Bun.watch is actually available (some Bun builds don't have it)
const hasBunWatch =
  isBunRuntime && typeof globalThis.Bun !== "undefined" && typeof globalThis.Bun["watch"] === "function";

// =============================================================================
// FILE WATCHER
// =============================================================================

export class FileWatcher extends EventEmitter {
  private config: Required<FileWatcherConfig>;
  private watchers: Map<string, FSWatcher> = new Map();
  private watchedFiles: Set<string> = new Set();
  private isRunning = false;

  // Debouncing
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private debounceAbort: AbortController | null = null;

  // Bun watcher (when available)
  private bunWatcher: { stop: () => void } | null = null;

  constructor(config: FileWatcherConfig) {
    super();
    this.config = {
      rootDir: config.rootDir.replace(/\\/g, "/"),
      include: config.include ?? ["**/*"],
      exclude: config.exclude ?? ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.ultracode/**"],
      debounceMs: config.debounceMs ?? 100,
      bulkThreshold: config.bulkThreshold ?? 1000,
    };
  }

  /**
   * Start watching
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const runtime = hasBunWatch ? "Bun.watch" : "fs.watch";
    log.i("FILEWATCHER", "Starting", { runtime, rootDir: this.config.rootDir, isBun: isBunRuntime, hasBunWatch });

    try {
      // Initial file scan with glob
      const files = await this.scanFiles();
      log.d("FILEWATCHER", "Initial scan complete", { files: files.length });

      // Start watching - use Bun.watch only if it's actually available
      if (hasBunWatch) {
        await this.startBunWatcher(files);
      } else {
        await this.startNodeWatcher(files);
      }

      this.emit("ready");
    } catch (error) {
      this.isRunning = false;
      log.e("FILEWATCHER", "Failed to start", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Cancel debounce
    if (this.debounceAbort) {
      this.debounceAbort.abort();
      this.debounceAbort = null;
    }

    // Stop Bun watcher
    if (this.bunWatcher) {
      this.bunWatcher.stop();
      this.bunWatcher = null;
    }

    // Stop Node watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedFiles.clear();
    this.pendingChanges.clear();

    log.d("FILEWATCHER", "Stopped");
  }

  /**
   * Scan files matching patterns
   * Uses Bun.Glob when available (faster), otherwise fast-glob
   */
  private async scanFiles(): Promise<string[]> {
    const patterns = this.config.include.map((p) =>
      p.startsWith("/") || p.includes(":") ? p : `${this.config.rootDir}/${p}`,
    );

    // Use Bun.Glob when available (native, faster)
    // @ts-expect-error - Bun global
    if (isBunRuntime && globalThis.Bun?.Glob) {
      const files: string[] = [];
      for (const pattern of patterns) {
        // @ts-expect-error - Bun global
        const glob = new globalThis.Bun.Glob(pattern);
        for await (const file of glob.scan({ onlyFiles: true, ignore: this.config.exclude })) {
          files.push(file);
        }
      }
      return files;
    }

    // Fallback to fast-glob for Node.js
    const files = await fg(patterns, {
      ignore: this.config.exclude,
      onlyFiles: true,
      absolute: true,
    });

    return files;
  }

  /**
   * Start Bun.watch() - fastest option
   */
  private async startBunWatcher(files: string[]): Promise<void> {
    // Get unique directories to watch
    const dirs = new Set<string>();
    for (const file of files) {
      dirs.add(dirname(file));
      this.watchedFiles.add(file);
    }

    // Bun.watch watches directories recursively
    // @ts-expect-error - Bun global
    this.bunWatcher = Bun.watch(this.config.rootDir, {
      recursive: true,
      filter: (path: string) => this.matchesPatterns(path),
    });

    // @ts-expect-error - Bun types
    this.bunWatcher.on("change", (event: string, path: string) => {
      if (!path) return;
      const fullPath = join(this.config.rootDir, path).replace(/\\/g, "/");

      if (event === "rename") {
        // Could be add or unlink - check if exists
        stat(fullPath)
          .then(() => this.queueChange(fullPath, this.watchedFiles.has(fullPath) ? "change" : "add"))
          .catch(() => this.queueChange(fullPath, "unlink"));
      } else {
        this.queueChange(fullPath, "change");
      }
    });

    log.i("FILEWATCHER", "Bun.watch started", { dirs: dirs.size, files: files.length });
  }

  /**
   * Start Node.js fs.watch()
   *
   * On Windows and macOS: use a single recursive watcher on rootDir (1 handle instead of N).
   * On Linux: recursive fs.watch() is not supported — fall back to per-directory watchers.
   */
  private async startNodeWatcher(files: string[]): Promise<void> {
    for (const file of files) {
      this.watchedFiles.add(file);
    }

    const supportsRecursive = process.platform === "win32" || process.platform === "darwin";

    if (supportsRecursive) {
      // Single recursive watcher — 1 OS handle instead of 1,657
      try {
        const watcher = fsWatch(this.config.rootDir, { persistent: true, recursive: true }, (event, filename) => {
          if (!filename) return;
          const fullPath = join(this.config.rootDir, filename).replace(/\\/g, "/");

          if (!this.matchesPatterns(fullPath)) return;

          if (event === "rename") {
            stat(fullPath)
              .then(() => this.queueChange(fullPath, this.watchedFiles.has(fullPath) ? "change" : "add"))
              .catch(() => this.queueChange(fullPath, "unlink"));
          } else {
            this.queueChange(fullPath, "change");
          }
        });

        watcher.on("error", (err) => {
          log.w("FILEWATCHER", "Recursive watcher error", { error: err.message });
        });

        this.watchers.set(this.config.rootDir, watcher);
        log.i("FILEWATCHER", "fs.watch started (recursive)", { handles: 1, files: files.length });
      } catch (err) {
        log.w("FILEWATCHER", "Recursive watch failed, falling back to per-dir", { error: (err as Error).message });
        await this.startPerDirWatcher(files);
      }
    } else {
      await this.startPerDirWatcher(files);
    }
  }

  /** Fallback: per-directory watchers for Linux (no recursive support). */
  private async startPerDirWatcher(files: string[]): Promise<void> {
    const dirs = new Set<string>();
    for (const file of files) {
      dirs.add(dirname(file));
    }

    for (const dir of dirs) {
      try {
        const watcher = fsWatch(dir, { persistent: true }, (event, filename) => {
          if (!filename) return;
          const fullPath = join(dir, filename).replace(/\\/g, "/");

          if (!this.matchesPatterns(fullPath)) return;

          if (event === "rename") {
            stat(fullPath)
              .then(() => this.queueChange(fullPath, this.watchedFiles.has(fullPath) ? "change" : "add"))
              .catch(() => this.queueChange(fullPath, "unlink"));
          } else {
            this.queueChange(fullPath, "change");
          }
        });

        watcher.on("error", (err) => {
          log.w("FILEWATCHER", "Watcher error", { dir, error: err.message });
        });

        this.watchers.set(dir, watcher);
      } catch (err) {
        log.w("FILEWATCHER", "Failed to watch directory", { dir, error: (err as Error).message });
      }
    }

    log.i("FILEWATCHER", "fs.watch started (per-dir)", { dirs: this.watchers.size, files: files.length });
  }

  /**
   * Check if path matches include/exclude patterns
   */
  private matchesPatterns(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, "/");

    // Check exclude patterns (simple glob matching)
    for (const pattern of this.config.exclude) {
      if (this.simpleMatch(normalizedPath, pattern)) {
        return false;
      }
    }

    // Check include patterns
    for (const pattern of this.config.include) {
      if (this.simpleMatch(normalizedPath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob matching for common patterns
   */
  private simpleMatch(path: string, pattern: string): boolean {
    // Handle **/ prefix (any directory depth)
    if (pattern.startsWith("**/")) {
      const suffix = pattern.slice(3);
      // Check if path contains the pattern anywhere
      if (suffix.includes("*")) {
        // Pattern like **/*.ts
        const ext = suffix.replace("*", "");
        return path.endsWith(ext) || path.includes(`/${suffix.replace("*", "")}`);
      }
      return path.includes(`/${suffix}`) || path.endsWith(`/${suffix}`);
    }

    // Handle *.ext patterns
    if (pattern.startsWith("*.")) {
      return path.endsWith(pattern.slice(1));
    }

    // Handle **/* (all files)
    if (pattern === "**/*") {
      return true;
    }

    // Exact match
    return path === pattern || path.endsWith(`/${pattern}`);
  }

  /**
   * Queue a change for debounced emission
   */
  private queueChange(path: string, type: FileChangeType): void {
    if (!this.isRunning) return;

    // Update tracked files
    if (type === "add") {
      this.watchedFiles.add(path);
    } else if (type === "unlink") {
      this.watchedFiles.delete(path);
    }

    this.pendingChanges.set(path, {
      path,
      type,
      timestamp: Date.now(),
    });

    this.scheduleFlush();
  }

  /**
   * Schedule debounced flush (Bun-compatible using async sleep)
   */
  private scheduleFlush(): void {
    // Abort previous debounce
    if (this.debounceAbort) {
      this.debounceAbort.abort();
    }

    // Create new abort controller for this debounce
    const abortController = new AbortController();
    this.debounceAbort = abortController;

    // Schedule flush using async sleep pattern
    (async () => {
      await sleep(this.config.debounceMs);
      if (!abortController.signal.aborted) {
        this.flush();
      }
    })();
  }

  /**
   * Flush pending changes
   */
  flush(): void {
    // Cancel any pending debounce
    if (this.debounceAbort) {
      this.debounceAbort.abort();
      this.debounceAbort = null;
    }

    if (this.pendingChanges.size === 0) return;

    // Defer if heavy analysis is running
    if (areTimersSuspended()) {
      log.d("FILEWATCHER", "deferred_suspended", { pending: this.pendingChanges.size });
      // Async retry — no setTimeout handle (Bun-safe)
      sleep(2000).then(() => this.flush());
      return;
    }

    const events = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    const isBulk = events.length >= this.config.bulkThreshold;
    log.d("FILEWATCHER", "Emitting changes", { count: events.length, bulkMode: isBulk });

    this.emit("change", events, isBulk);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.isRunning,
      runtime: hasBunWatch ? "bun" : "node",
      isBunRuntime,
      hasBunWatch,
      watchedFiles: this.watchedFiles.size,
      watchedDirs: this.watchers.size,
      pendingChanges: this.pendingChanges.size,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export async function createFileWatcher(config: FileWatcherConfig): Promise<FileWatcher> {
  const watcher = new FileWatcher(config);
  await watcher.start();
  return watcher;
}
