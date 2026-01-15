/**
 * Auto-Indexer Module
 *
 * Handles automatic project detection and indexing.
 * Extracted from index.ts for better modularity.
 */

import { log } from "../logging/index.js";
import type { Agent, AgentTask } from "../types/agent.js";
import { AgentType } from "../types/agent.js";
import { createRequestId } from "../utils/logger.js";
import { setIndexingState } from "./indexing-state.js";
import { knowledgeBus } from "./knowledge-bus.js";

/**
 * Task processing result structure
 */
interface TaskProcessingResult {
  success?: boolean;
  data?: {
    entityCount?: number;
    entities?: unknown[];
  };
  entities?: unknown[];
}

/**
 * Agent with embedding stats (DevAgent)
 */
interface AgentWithEmbeddingStats extends Agent {
  getEmbeddingStats?: () => {
    total: number;
    durationMs: number;
    speedPerSec: number;
    workers: number;
    batches: number;
  } | null;
}

/**
 * Agent with repository path setter (IndexerAgent)
 */
interface AgentWithRepositoryPath extends Agent {
  setRepositoryPath?: (path: string) => Promise<void>;
}

/**
 * Base exclude patterns for source file counting and indexing
 * Used by both countSourceFiles and buildAutoIndexExcludePatterns for consistency
 */
export const BASE_EXCLUDE_PATTERNS = [
  // Build/dependency directories
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/venv/**",
  "**/.venv/**",
  "**/vendor/**",
  "**/target/**", // Rust
  "**/bin/**",
  "**/obj/**", // .NET
  "**/.vs/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/packages/**",
  // Test data directories (not actual source code)
  "**/fixtures/**",
  "**/testdata/**",
  // Mock files
  "**/mocks/**",
  "**/__mocks__/**",
  // External/third-party
  "**/external-tools/**",
  "**/third_party/**",
  "**/third-party/**",
  "**/thirdparty/**",
  "**/archives/**",
  "**/archive/**",
  "**/backups/**",
  "**/backup/**",
  "**/tmp/**",
  "**/temp/**",
];

/**
 * Quickly detect if directory contains files with supported extensions.
 * Uses fast glob with early exit (limit: 1) for performance.
 */
export async function detectSupportedProject(
  targetDir: string,
  extensions: string[],
): Promise<{ supported: boolean; detectedExt?: string; sampleFile?: string }> {
  try {
    const { glob } = await import("glob");

    // Build glob pattern for all supported extensions
    // e.g., **/*.{ts,tsx,js,jsx,py,go,rs,kt,swift,c,cpp,java}
    const extList = extensions.map((e) => e.replace(/^\./, "")).join(",");
    const pattern = `**/*.{${extList}}`;

    // Use glob with limit 1 for fast detection
    const files = await glob(pattern, {
      cwd: targetDir,
      nodir: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/vendor/**", "**/target/**", "**/__pycache__/**"],
      maxDepth: 5, // Don't go too deep for quick detection
      absolute: false,
    });

    if (files.length > 0) {
      const sampleFile = files[0]!;
      const ext = "." + sampleFile.split(".").pop();
      return { supported: true, detectedExt: ext, sampleFile };
    }

    return { supported: false };
  } catch (error) {
    log.w("AUTOINDEX", "detect_fail", { err: (error as Error).message });
    return { supported: false };
  }
}

/**
 * Fast count of source files on disk for consistency check.
 * Uses glob with stats disabled for maximum speed.
 */
export async function countSourceFiles(targetDir: string, extensions: string[]): Promise<number> {
  try {
    const { glob } = await import("glob");
    const extList = extensions.map((e) => e.replace(/^\./, "")).join(",");
    const pattern = `**/*.{${extList}}`;

    const files = await glob(pattern, {
      cwd: targetDir,
      nodir: true,
      ignore: BASE_EXCLUDE_PATTERNS,
      stat: false,
      absolute: false,
    });

    return files.length;
  } catch {
    return -1; // Error - skip consistency check
  }
}

/**
 * Build smart exclude patterns for auto-indexing
 * - Base patterns from BASE_EXCLUDE_PATTERNS
 * - Patterns from .gitignore if exists
 * - Binary/archive extensions
 */
export async function buildAutoIndexExcludePatterns(targetDir: string): Promise<string[]> {
  const patterns: string[] = [
    // Include all base directory patterns
    ...BASE_EXCLUDE_PATTERNS,
    // Mock files (often large JSON/generated data)
    "**/*.mock.json",
    "**/*.mock.ts",
    "**/*.mock.js",
    // Binary and archive files
    "**/*.zip",
    "**/*.tar",
    "**/*.tar.gz",
    "**/*.tgz",
    "**/*.rar",
    "**/*.7z",
    "**/*.exe",
    "**/*.dll",
    "**/*.so",
    "**/*.dylib",
    "**/*.bin",
    "**/*.iso",
    "**/*.img",
    "**/*.dmg",
    "**/*.wasm",
    // Large generated files
    "**/*.min.js",
    "**/*.min.css",
    "**/*.bundle.js",
    "**/*.chunk.js",
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/*.lock",
    // Media files
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.png",
    "**/*.gif",
    "**/*.ico",
    "**/*.svg",
    "**/*.mp3",
    "**/*.mp4",
    "**/*.wav",
    "**/*.avi",
    "**/*.mov",
    "**/*.pdf",
    // Database files
    "**/*.db",
    "**/*.sqlite",
    "**/*.sqlite3",
  ];

  // Try to read .gitignore and add patterns
  try {
    const { join } = await import("node:path");
    const gitignorePath = join(targetDir, ".gitignore");
    const { readTextSync, existsSync } = await import("../utils/file-ops.js");

    if (existsSync(gitignorePath)) {
      const content = readTextSync(gitignorePath);
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith("#")) continue;
        // Skip negation patterns (we only want excludes)
        if (trimmed.startsWith("!")) continue;

        // Convert gitignore pattern to glob pattern
        let pattern = trimmed;
        // Handle directory patterns
        if (pattern.endsWith("/")) {
          pattern = `**/${pattern}**`;
        } else if (!pattern.includes("/")) {
          // Pattern without slash matches anywhere
          pattern = `**/${pattern}`;
        } else if (!pattern.startsWith("/") && !pattern.startsWith("**/")) {
          pattern = `**/${pattern}`;
        }
        // Remove leading slash
        if (pattern.startsWith("/")) {
          pattern = pattern.slice(1);
        }

        patterns.push(pattern);
      }
      log.d("AUTOINDEX", "gitignore_loaded", { cnt: lines.filter((l) => l.trim() && !l.startsWith("#")).length });
    }
  } catch (_error) {
    // .gitignore not found or unreadable - that's fine
  }

  return patterns;
}

/**
 * Context for performing auto-indexing
 * Allows dependency injection from index.ts
 */
export interface AutoIndexContext {
  getSemanticAgent: () => Promise<any>;
  getDevAgent: () => Promise<any>;
  getDoraAgent: () => Promise<any>;
  getConductor: () => any;
  getGraphStorage: () => Promise<any>;
  setCurrentIndexingDirectory: (dir: string) => void;
  processStartTime: number;
}

/**
 * Perform auto-indexing in background (non-blocking)
 */
export async function performAutoIndex(
  targetDir: string,
  extensions: string[],
  ctx: AutoIndexContext,
  incremental = false,
): Promise<void> {
  const requestId = createRequestId();
  const startTime = Date.now();
  log.t("INDEXER", "auto_index_start", { offset: startTime - ctx.processStartTime });

  // Set indexing state for user-friendly error messages
  setIndexingState(true, targetDir);

  const mode = incremental ? "incremental" : "full";
  log.i("INDEXER", "auto_index", { mode, dir: targetDir, req: requestId });

  try {
    // Build smart exclude patterns
    const excludePatterns = await buildAutoIndexExcludePatterns(targetDir);
    log.d("INDEXER", "exclude_patterns", { cnt: excludePatterns.length, exts: extensions.join(",") });

    // Set current indexing directory
    ctx.setCurrentIndexingDirectory(targetDir);

    // Initialize SemanticAgent and optionally drop vector index for bulk insert mode
    // Only drop index for FULL rebuild, not for incremental updates
    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      log.t("INDEXER", "semantic_init_start", {});
      try {
        const semAgentStart = Date.now();
        const semanticAgent = await ctx.getSemanticAgent();
        log.t("INDEXER", "semantic_init_done", { dur: Date.now() - semAgentStart });
        if (!incremental) {
          // Drop vector index before bulk inserts for faster performance (full rebuild only)
          log.t("INDEXER", "drop_index_start", {});
          await semanticAgent.dropVectorIndex();
          log.t("INDEXER", "drop_index_done", {});
        } else {
          log.d("INDEXER", "keep_index", { reason: "incremental" });
        }
      } catch (err) {
        log.w("INDEXER", "semantic_init_fail", { err: (err as Error).message });
      }
    }

    // Create indexing task with smart excludes
    const task: AgentTask = {
      id: `auto-index-${Date.now()}`,
      type: "index",
      priority: 8,
      payload: {
        directory: targetDir,
        incremental, // Use incremental mode when resuming incomplete index
        excludePatterns,
        // Pass extensions to limit file types
        includeExtensions: extensions,
      },
      createdAt: Date.now(),
    };

    // Initialize agents
    await ctx.getDevAgent();
    await ctx.getDoraAgent();

    // Run indexing via conductor
    const cond = ctx.getConductor();
    await cond.initialize();
    const result = (await cond.process(task)) as TaskProcessingResult;

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result?.success !== false) {
      const entityCount = result?.data?.entityCount ?? result?.data?.entities ?? result?.entities?.length ?? 0;
      log.i("INDEXER", "auto_index_done", { entities: entityCount, dur: Date.now() - startTime, req: requestId });

      // Log embedding performance summary
      try {
        const devAgent = cond.getAgentByType?.(AgentType.DEV) as AgentWithEmbeddingStats | undefined;
        const embStats = devAgent?.getEmbeddingStats?.();
        if (embStats && embStats.total > 0) {
          log.i("EMBEDDING", "emb_summary", {
            total: embStats.total,
            dur: `${(embStats.durationMs / 1000).toFixed(1)}s`,
            speed: `${embStats.speedPerSec}/s`,
            workers: embStats.workers,
            batches: embStats.batches,
          });
        }
      } catch {
        // Non-critical
      }

      // Finalize embeddings (workers generate, main just loads dump files as fallback)
      if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
        try {
          const semanticAgent = await ctx.getSemanticAgent();
          log.t("INDEXER", "embed_finalize_start", {});
          await semanticAgent.generateEmbeddingsFromStorage();
          log.t("INDEXER", "embed_finalize_done", {});
        } catch (error) {
          log.w("INDEXER", "embed_finalize_fail", { err: (error as Error).message });
        }
      }

      // Update incremental tracking
      try {
        const graphStorage = await ctx.getGraphStorage();
        if (incremental) {
          // Record incremental changes (count how many files were indexed)
          const indexedCount = typeof entityCount === "number" ? entityCount : parseInt(String(entityCount), 10) || 0;
          // Estimate files from entities (rough: ~3 entities per file on average)
          const estimatedFiles = Math.max(1, Math.ceil(indexedCount / 3));
          await graphStorage.recordIncrementalChanges(estimatedFiles);
          log.i("INDEXER", "tracking_recorded", { files: estimatedFiles });
        } else {
          // Full rebuild - reset tracking
          await graphStorage.resetIncrementalTracking();
          log.i("INDEXER", "tracking_reset", { reason: "full_rebuild" });
        }
      } catch (error) {
        log.w("INDEXER", "tracking_fail", { err: (error as Error).message });
      }

      // Start FileWatcher/GitWatcher for incremental updates
      try {
        const cond = ctx.getConductor();
        const indexerAgent = cond.getAgentByType(AgentType.INDEXER) as AgentWithRepositoryPath | undefined;
        if (indexerAgent?.setRepositoryPath) {
          await indexerAgent.setRepositoryPath(targetDir);
          log.i("INDEXER", "watcher_started", { dir: targetDir });
        }
      } catch (error) {
        log.w("INDEXER", "watcher_fail", { err: (error as Error).message });
      }

      // Flush LibSQL storage to disk (synchronous=OFF buffers writes)
      try {
        const graphStorage = await ctx.getGraphStorage();
        await graphStorage.flush();
        log.d("INDEXER", "storage_flushed");
      } catch (error) {
        log.w("INDEXER", "storage_flush_fail", { err: (error as Error).message });
      }

      // Publish index:completed event for subscribers (e.g., AutoDoc embeddings)
      knowledgeBus.publish(
        "index:completed",
        {
          directory: targetDir,
          incremental,
          entityCount,
          duration: Date.now() - startTime,
        },
        "auto-indexer",
      );
      log.d("INDEXER", "index_completed_event_published");
    } else {
      log.w("INDEXER", "auto_index_warn", { dur: duration, req: requestId });
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log.e("INDEXER", "auto_index_fail", { dur: duration, err: (error as Error).message, req: requestId });
  } finally {
    // Always clear indexing state
    setIndexingState(false);
  }
}
