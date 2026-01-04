/**
 * Git Event Handlers for IndexerAgent
 *
 * Handles Git-related events:
 * - Branch changes
 * - Uncommitted file changes
 * - Debounced embedding generation
 *
 * Extracted from indexer-agent.ts for better modularity.
 */

import { isAbsolute, join } from "node:path";
import type { BranchManager } from "../../core/branch-manager.js";
import { knowledgeBus } from "../../core/knowledge-bus.js";
import { logger } from "../../utils/logger.js";

export interface GitEventContext {
  agentId: string;
  currentRepositoryPath: string | null;
  branchManager: BranchManager | null;
}

/**
 * Handle uncommitted file changes detected by GitWatcher
 * Triggers incremental reindexing for changed files
 */
export async function handleUncommittedChanges(files: string[], ctx: GitEventContext): Promise<void> {
  if (!ctx.currentRepositoryPath || files.length === 0) {
    return;
  }

  console.error(`[${ctx.agentId}] Uncommitted changes detected: ${files.length} files`);

  // Resolve relative paths to absolute
  const absolutePaths = files.map((f) => (isAbsolute(f) ? f : join(ctx.currentRepositoryPath!, f)));

  // Publish file:changed events for each file
  // These will be picked up by components subscribed to the knowledge bus
  for (const filePath of absolutePaths) {
    knowledgeBus.publish(
      "file:changed",
      {
        filePath,
        changeType: "modified",
        source: "git-watcher",
      },
      ctx.agentId,
    );
  }

  // Also publish a batch event for efficiency
  knowledgeBus.publish(
    "indexer:files:changed",
    {
      files: absolutePaths,
      count: absolutePaths.length,
      repositoryPath: ctx.currentRepositoryPath,
      source: "git-watcher-uncommitted",
    },
    ctx.agentId,
  );

  console.error(`[${ctx.agentId}] Published change events for ${absolutePaths.length} files`);
}

/**
 * Handle debounced file changes for embedding generation.
 * Called after user stops editing (debounce period elapsed).
 * @param files - List of changed files (accumulated during debounce)
 * @param bulkMode - If true, many files changed -> drop/rebuild index. If false, incremental insert.
 */
export async function handleDebouncedEmbeddingGeneration(
  files: string[],
  bulkMode: boolean,
  ctx: GitEventContext,
): Promise<void> {
  if (!ctx.currentRepositoryPath || files.length === 0) {
    return;
  }

  console.error(`[${ctx.agentId}] Debounced embedding generation: ${files.length} files (bulkMode: ${bulkMode})`);

  // Publish event for SemanticAgent to pick up
  // SemanticAgent will handle the actual embedding generation with bulk mode flag
  knowledgeBus.publish(
    "indexer:embeddings:generate",
    {
      files,
      count: files.length,
      bulkMode,
      repositoryPath: ctx.currentRepositoryPath,
      source: "git-watcher-debounced",
    },
    ctx.agentId,
  );

  console.error(`[${ctx.agentId}] Published embedding generation event: ${files.length} files, bulkMode=${bulkMode}`);
}

/**
 * Handle branch change event
 */
export async function handleBranchChange(newBranch: string, oldBranch: string, ctx: GitEventContext): Promise<void> {
  console.error(`[${ctx.agentId}] Branch changed from ${oldBranch} to ${newBranch}`);

  if (!ctx.branchManager || !ctx.currentRepositoryPath) {
    console.warn(`[${ctx.agentId}] BranchManager not initialized, skipping branch switch`);
    return;
  }

  try {
    // Switch to new branch database
    await ctx.branchManager.switchBranch(newBranch, ctx.currentRepositoryPath);

    // Emit event for other components
    knowledgeBus.publish(
      "indexer:branch:changed",
      {
        oldBranch,
        newBranch,
        repositoryPath: ctx.currentRepositoryPath,
      },
      ctx.agentId,
    );

    console.error(`[${ctx.agentId}] Successfully switched to branch: ${newBranch}`);
  } catch (error) {
    console.error(`[${ctx.agentId}] Failed to handle branch change:`, error);
  }
}

export interface EmbeddingSchedulerContext {
  agentId: string;
  debouncePeriodMs: number;
  abortController: AbortController | null;
  pendingGeneration: boolean;
  setPendingGeneration: (value: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
}

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
export async function runtimeSleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Schedule debounced embedding generation
 * Waits for debounce period after last change before triggering generation
 */
export function scheduleEmbeddingGeneration(ctx: EmbeddingSchedulerContext, onTrigger: () => Promise<void>): void {
  // Cancel existing timer
  if (ctx.abortController) {
    ctx.abortController.abort();
  }

  // Create new abort controller
  const newAbortController = new AbortController();
  ctx.setAbortController(newAbortController);
  const signal = newAbortController.signal;

  logger.debug("IndexerAgent", `Embedding generation scheduled in ${ctx.debouncePeriodMs}ms`);

  // Start async timer
  (async () => {
    try {
      const startTime = Date.now();
      while (!signal.aborted && Date.now() - startTime < ctx.debouncePeriodMs) {
        await runtimeSleep(1000); // Check every second
      }
      if (!signal.aborted) {
        await onTrigger();
      }
    } catch (error) {
      // Aborted or error - do nothing
    }
  })();
}

/**
 * Trigger embedding generation via knowledge bus
 * SemanticAgent subscribes to this event
 */
export async function triggerEmbeddingGeneration(ctx: EmbeddingSchedulerContext): Promise<void> {
  if (ctx.pendingGeneration) {
    logger.debug("IndexerAgent", "Embedding generation already pending, skipping");
    return;
  }

  ctx.setPendingGeneration(true);
  logger.info("IndexerAgent", "Triggering batch embedding generation after incremental update");

  // Publish event for SemanticAgent
  knowledgeBus.publish(
    "indexer:incremental:complete",
    {
      timestamp: Date.now(),
      reason: "debounced_after_incremental_update",
    },
    ctx.agentId,
  );

  // Reset flag after a delay using runtime-aware sleep
  await runtimeSleep(5000);
  ctx.setPendingGeneration(false);
}
