/**
 * AutoDoc Watcher
 *
 * Automatically updates AUTODOC.md files when source code changes.
 * Uses debouncing to batch changes and avoid excessive updates.
 *
 * Features:
 * - Watches for file changes via KnowledgeBus
 * - Debounces updates (default 30-60 seconds)
 * - Incrementally updates only affected modules
 * - Updates line number references
 * - Adds/removes exported entities
 */

import path from "node:path";
import { type KnowledgeEntry, knowledgeBus } from "../../core/knowledge-bus.js";
import { log } from "../../logging/index.js";
import { fileExists, readdir, readText, setFileChangeHook, writeFile } from "../../utils/file-ops.js";
import type { ModuleInfo } from "../generator/doc-generator.js";
import { updateAutodocContent } from "./autodoc-updater.js";
import { extractExportsFromFile, getModuleForFile } from "./module-resolver.js";

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export interface AutoDocWatcherConfig {
  /** Debounce delay in milliseconds (default: 45000 = 45 seconds) */
  debounceMs?: number;
  /** Minimum debounce delay (default: 30000 = 30 seconds) */
  minDebounceMs?: number;
  /** Maximum debounce delay (default: 60000 = 60 seconds) */
  maxDebounceMs?: number;
  /** Root directory to watch */
  rootDir: string;
  /** Enable/disable watcher */
  enabled?: boolean | undefined;
  /** Use LLM for description generation */
  useLlm?: boolean | undefined;
  /** LLM provider config */
  llmConfig?: {
    provider: "ollama" | "openai" | "tgi";
    model?: string | undefined;
    endpoint?: string;
  };
}

interface PendingUpdate {
  modulePath: string;
  changedFiles: Set<string>;
  firstChangeAt: number;
  lastChangeAt: number;
}

const MODULE_DOC_FILENAME = "AUTODOC.md";

export class AutoDocWatcher {
  private config: Required<AutoDocWatcherConfig>;
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private debounceControllers: Map<string, AbortController> = new Map();
  private subscriptionId: string | null = null;
  private isProcessing = false;
  private moduleCache: Map<string, ModuleInfo> = new Map();
  private moduleCacheControllers: Map<string, AbortController> = new Map();

  constructor(config: AutoDocWatcherConfig) {
    this.config = {
      debounceMs: config.debounceMs ?? 45000,
      minDebounceMs: config.minDebounceMs ?? 30000,
      maxDebounceMs: config.maxDebounceMs ?? 60000,
      rootDir: config.rootDir,
      enabled: config.enabled ?? true,
      useLlm: config.useLlm ?? false,
      llmConfig: config.llmConfig ?? { provider: "ollama" },
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (!this.config.enabled) {
      log.i("AUTODOCWATCH", "watcher_disabled");
      return;
    }

    if (this.subscriptionId) {
      log.w("AUTODOCWATCH", "already_started");
      return;
    }

    // Subscribe to file change events via KnowledgeBus
    this.subscriptionId = knowledgeBus.subscribe(
      "autodoc-watcher",
      /^(file:changed|entity:modified|index:completed)$/,
      this.handleEvent.bind(this),
    );

    // Also register file-ops hook for direct file write notifications
    setFileChangeHook((filePath, operation) => {
      if (operation === "write") {
        // Only handle code files
        const ext = path.extname(filePath).toLowerCase();
        if ([".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs"].includes(ext)) {
          this.handleFileChange(filePath);
        }
      }
    });

    log.i("AUTODOCWATCH", "watcher_started", {
      root_dir: this.config.rootDir,
      debounce_ms: this.config.debounceMs,
    });
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.subscriptionId) {
      knowledgeBus.unsubscribe(this.subscriptionId);
      this.subscriptionId = null;
    }

    // Remove file-ops hook
    setFileChangeHook(null);

    // Abort all pending debounce controllers
    for (const controller of this.debounceControllers.values()) {
      controller.abort();
    }
    this.debounceControllers.clear();
    this.pendingUpdates.clear();

    // Abort module cache controllers to prevent memory leaks
    for (const controller of this.moduleCacheControllers.values()) {
      controller.abort();
    }
    this.moduleCacheControllers.clear();
    this.moduleCache.clear();

    log.i("AUTODOCWATCH", "watcher_stopped");
  }

  /**
   * Handle incoming events from KnowledgeBus
   */
  private async handleEvent(entry: KnowledgeEntry): Promise<void> {
    const data = entry.data as any;

    switch (entry.topic) {
      case "file:changed":
      case "entity:modified":
        await this.handleFileChange(data.filePath || data.file);
        break;

      case "index:completed":
        // After full indexing, update all AUTODOC files
        await this.handleIndexCompleted(data);
        break;
    }
  }

  /**
   * Handle a single file change
   */
  private async handleFileChange(filePath: string): Promise<void> {
    if (!filePath) return;

    // Skip non-code files
    const ext = path.extname(filePath).toLowerCase();
    if (![".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs"].includes(ext)) {
      return;
    }

    // Skip test files
    if (filePath.includes(".test.") || filePath.includes(".spec.")) {
      return;
    }

    // Find which module this file belongs to
    const modulePath = await getModuleForFile(filePath, this.config.rootDir);
    if (!modulePath) {
      return;
    }

    // Add to pending updates
    const now = Date.now();
    let pending = this.pendingUpdates.get(modulePath);

    if (!pending) {
      pending = {
        modulePath,
        changedFiles: new Set(),
        firstChangeAt: now,
        lastChangeAt: now,
      };
      this.pendingUpdates.set(modulePath, pending);
    }

    pending.changedFiles.add(filePath);
    pending.lastChangeAt = now;

    // Schedule debounced update
    this.scheduleUpdate(modulePath);
  }

  /**
   * Schedule a debounced update for a module
   */
  private scheduleUpdate(modulePath: string): void {
    // Abort existing controller
    const existingController = this.debounceControllers.get(modulePath);
    if (existingController) {
      existingController.abort();
    }

    const pending = this.pendingUpdates.get(modulePath);
    if (!pending) return;

    // Calculate adaptive debounce delay
    // More changes = longer delay (up to max)
    const changeCount = pending.changedFiles.size;
    const baseDelay = this.config.debounceMs;
    const adaptiveDelay = Math.min(
      this.config.maxDebounceMs,
      Math.max(this.config.minDebounceMs, baseDelay + changeCount * 1000),
    );

    // Check if we've been waiting too long (force update after maxDebounceMs from first change)
    const timeSinceFirstChange = Date.now() - pending.firstChangeAt;
    const remainingMaxWait = Math.max(0, this.config.maxDebounceMs - timeSinceFirstChange);
    const finalDelay = Math.min(adaptiveDelay, remainingMaxWait);

    if (finalDelay <= 0) {
      // Max wait exceeded, update immediately
      this.processUpdate(modulePath);
      return;
    }

    // Schedule update using async sleep pattern (Bun compatible)
    const abortController = new AbortController();
    this.debounceControllers.set(modulePath, abortController);

    (async () => {
      await sleep(finalDelay);
      if (!abortController.signal.aborted) {
        this.processUpdate(modulePath);
      }
    })();

    log.d("AUTODOCWATCH", "update_scheduled", {
      module_path: modulePath,
      changed_files: changeCount,
      delay_ms: finalDelay,
    });
  }

  /**
   * Process pending update for a module
   */
  private async processUpdate(modulePath: string): Promise<void> {
    const pending = this.pendingUpdates.get(modulePath);
    if (!pending) return;

    // Remove from pending
    this.pendingUpdates.delete(modulePath);
    this.debounceControllers.delete(modulePath);

    // Skip if already processing
    if (this.isProcessing) {
      // Re-queue for later
      for (const file of pending.changedFiles) {
        await this.handleFileChange(file);
      }
      return;
    }

    this.isProcessing = true;

    try {
      log.i("AUTODOCWATCH", "processing_update", {
        module_path: modulePath,
        changed_files: pending.changedFiles.size,
      });

      const autodocPath = path.join(modulePath, MODULE_DOC_FILENAME);
      const autodocExists = await fileExists(autodocPath);

      if (!autodocExists) {
        log.d("AUTODOCWATCH", "autodoc_not_found", { module_path: modulePath });
        return;
      }

      // Read current AUTODOC content
      const currentContent = await readText(autodocPath);

      // Get updated module info
      const moduleInfo = await this.getModuleInfo(modulePath);

      // Update content incrementally
      const updatedContent = await updateAutodocContent(currentContent, moduleInfo, Array.from(pending.changedFiles), {
        useLlm: this.config.useLlm,
        llmConfig: this.config.llmConfig,
      });

      if (updatedContent !== currentContent) {
        await writeFile(autodocPath, updatedContent);

        log.i("AUTODOCWATCH", "autodoc_updated", {
          module_path: modulePath,
          changed_files: pending.changedFiles.size,
        });

        // Publish event
        knowledgeBus.publish(
          "autodoc:updated",
          {
            modulePath,
            autodocPath,
            changedFiles: Array.from(pending.changedFiles),
          },
          "autodoc-watcher",
        );
      }
    } catch (error) {
      log.e("AUTODOCWATCH", "update_failed", {
        module_path: modulePath,
        error: String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle index:completed event - update all AUTODOC files
   */
  private async handleIndexCompleted(data: any): Promise<void> {
    // After full indexing, we might want to update all AUTODOC files
    // But this is expensive, so we only do it if explicitly requested
    if (data.updateAutodoc !== true) {
      return;
    }

    log.i("AUTODOCWATCH", "full_update_start");

    // This would trigger a full regeneration
    // For now, just log - full regeneration is done via autodoc_generate tool
  }

  /**
   * Get module info for a directory
   */
  private async getModuleInfo(modulePath: string): Promise<ModuleInfo> {
    // Check cache
    const cached = this.moduleCache.get(modulePath);
    if (cached) {
      return cached;
    }

    // Build module info
    const name = path.basename(modulePath);
    const indexPath = path.join(modulePath, "index.ts");
    const hasIndex = await fileExists(indexPath);
    const exports = hasIndex ? await extractExportsFromFile(indexPath) : [];

    // Get all code files in module (single pass)
    const files: string[] = [];
    try {
      const entries = await readdir(modulePath, { withFileTypes: true });
      for (const e of entries) {
        if (
          e.isFile() &&
          /\.(ts|js|tsx|jsx|mjs|cjs)$/.test(e.name) &&
          !e.name.includes(".test.") &&
          !e.name.includes(".spec.")
        ) {
          files.push(e.name);
        }
      }
    } catch {
      // Directory might not exist
    }

    const moduleInfo: ModuleInfo = {
      name,
      path: modulePath,
      files,
      hasIndex,
      exports,
    };

    // Cache for 5 minutes with tracked abort controller
    this.moduleCache.set(modulePath, moduleInfo);

    // Abort existing controller if any
    const existingController = this.moduleCacheControllers.get(modulePath);
    if (existingController) {
      existingController.abort();
    }

    const abortController = new AbortController();
    this.moduleCacheControllers.set(modulePath, abortController);

    // Schedule cache eviction using async sleep pattern (Bun compatible)
    (async () => {
      await sleep(5 * 60 * 1000);
      if (!abortController.signal.aborted) {
        this.moduleCache.delete(modulePath);
        this.moduleCacheControllers.delete(modulePath);
      }
    })();

    return moduleInfo;
  }

  /**
   * Force update a specific module's AUTODOC.md
   */
  async forceUpdate(modulePath: string): Promise<void> {
    const pending: PendingUpdate = {
      modulePath,
      changedFiles: new Set(["force-update"]),
      firstChangeAt: Date.now(),
      lastChangeAt: Date.now(),
    };
    this.pendingUpdates.set(modulePath, pending);
    await this.processUpdate(modulePath);
  }

  /**
   * Get watcher status
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    pendingUpdates: number;
    config: AutoDocWatcherConfig;
  } {
    return {
      enabled: this.config.enabled,
      running: this.subscriptionId !== null,
      pendingUpdates: this.pendingUpdates.size,
      config: this.config,
    };
  }
}

// Singleton instance
let watcherInstance: AutoDocWatcher | null = null;

export function getAutoDocWatcher(config?: AutoDocWatcherConfig): AutoDocWatcher {
  if (!watcherInstance && config) {
    watcherInstance = new AutoDocWatcher(config);
  }
  if (!watcherInstance) {
    throw new Error("AutoDocWatcher not initialized. Provide config on first call.");
  }
  return watcherInstance;
}

export function resetAutoDocWatcher(): void {
  if (watcherInstance) {
    watcherInstance.stop();
    watcherInstance = null;
  }
}
