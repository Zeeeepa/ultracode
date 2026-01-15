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

import { execSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import type { BranchManager } from "../../core/branch-manager.js";
import { knowledgeBus } from "../../core/knowledge-bus.js";
import { log } from "../../logging/index.js";
import { sleep } from "../../utils/runtime-detection.js";

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

  log.i("GITWATCHER", "uncommitted_changes", { cnt: files.length });

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

  log.d("GITWATCHER", "published_changes", { cnt: absolutePaths.length });
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

  log.d("GITWATCHER", "debounced_embed", { cnt: files.length, bulkMode });

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

  log.d("GITWATCHER", "embed_event_pub", { cnt: files.length, bulkMode });
}

/**
 * Get changed files between two branches using git diff
 */
function getChangedFilesBetweenBranches(oldBranch: string, newBranch: string, repoPath: string): string[] {
  try {
    // Use git diff to get files that differ between branches
    const output = execSync(`git diff --name-only ${oldBranch}...${newBranch}`, {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });

    const files = output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0)
      .map((f) => join(repoPath, f));

    return files;
  } catch (error) {
    log.w("GITWATCHER", "get_branch_diff_fail", { err: String(error) });
    return [];
  }
}

/**
 * Handle branch change event
 */
export async function handleBranchChange(newBranch: string, oldBranch: string, ctx: GitEventContext): Promise<void> {
  log.i("GITWATCHER", "branch_changed", { oldBranch, newBranch });

  if (!ctx.branchManager || !ctx.currentRepositoryPath) {
    log.w("GITWATCHER", "branch_mgr_not_init");
    return;
  }

  try {
    // Switch to new branch database
    await ctx.branchManager.switchBranch(newBranch, ctx.currentRepositoryPath);

    // Get files that changed between branches
    const changedFiles = getChangedFilesBetweenBranches(oldBranch, newBranch, ctx.currentRepositoryPath);

    log.i("GITWATCHER", "branch_files_diff", { cnt: changedFiles.length, oldBranch, newBranch });

    // Emit event for other components
    knowledgeBus.publish(
      "indexer:branch:changed",
      {
        oldBranch,
        newBranch,
        repositoryPath: ctx.currentRepositoryPath,
        changedFiles: changedFiles.length,
      },
      ctx.agentId,
    );

    // Trigger incremental reindexing for changed files
    if (changedFiles.length > 0) {
      knowledgeBus.publish(
        "indexer:files:changed",
        {
          files: changedFiles,
          count: changedFiles.length,
          repositoryPath: ctx.currentRepositoryPath,
          source: "git-watcher-branch-switch",
        },
        ctx.agentId,
      );
      log.i("GITWATCHER", "branch_reindex_triggered", { files: changedFiles.length });
    }

    log.i("GITWATCHER", "branch_switched", { newBranch });
  } catch (error) {
    log.e("GITWATCHER", "branch_change_fail", { err: String(error) });
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
  await sleep(ms);
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

  log.d("INDEXER", "embed_scheduled", { ms: ctx.debouncePeriodMs });

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
    log.d("INDEXER", "embed_pending_skip");
    return;
  }

  ctx.setPendingGeneration(true);
  log.i("INDEXER", "embed_batch_trigger");

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
