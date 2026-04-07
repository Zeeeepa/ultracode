/**
 * Indexing State Management
 * Tracks per-project indexing state and provides status queries
 */

/**
 * State for a single indexing operation
 */
interface IndexingState {
  startTime: number;
  directory: string;
}

/** Per-project indexing state tracking */
const indexingProjects = new Map<string, IndexingState>();

/** Safety timeout: auto-clear stuck indexing locks after 5 minutes */
const INDEXING_TIMEOUT_MS = 5 * 60 * 1000;

/** Post-indexing background work (embedding generation, FAISS save, etc.) */
const postIndexingPromises = new Map<string, { promise: Promise<void>; startTime: number }>();

/** Legacy global state for backward compatibility */
let legacyIndexingDirectory: string | null = null;

// =============================================================================
// TIMER SYSTEM (Simplified - no longer need suspension for HTTP providers)
// =============================================================================

/** Legacy export for compatibility (no-op now) */
export const registerAsyncLoopStarter = (_starter: () => void): void => {};

/**
 * Heavy analysis guard — suspends background watchers (AutoDoc, FileWatcher, GitWatcher)
 * during CPU-intensive tool execution to prevent bun:sqlite concurrent access crashes.
 *
 * Usage:
 *   suspendTimers();
 *   try { ... heavy work ... } finally { resumeTimers(); }
 */
let _timersSuspended = false;

export function areTimersSuspended(): boolean {
  return _timersSuspended;
}

export function suspendTimers(): void {
  _timersSuspended = true;
}

export function resumeTimers(): void {
  _timersSuspended = false;
}

/**
 * Evict stale indexing locks that exceeded the safety timeout.
 * Protects against zombie locks when indexing crashes or the tool call is cancelled.
 */
function evictStaleLocks(): void {
  const now = Date.now();
  for (const [key, state] of indexingProjects) {
    if (now - state.startTime > INDEXING_TIMEOUT_MS) {
      indexingProjects.delete(key);
      if (legacyIndexingDirectory === key) {
        legacyIndexingDirectory = null;
      }
    }
  }
  if (indexingProjects.size === 0) {
    resumeTimers();
  }
}

/**
 * Check if indexing is currently in progress for ANY project
 */
export function isIndexing(): boolean {
  evictStaleLocks();
  return indexingProjects.size > 0;
}

/**
 * Check if a specific project is being indexed
 */
export function isProjectIndexing(directory: string): boolean {
  evictStaleLocks();
  const normalizedDir = directory.toLowerCase().replace(/\\/g, "/");
  for (const [key] of indexingProjects) {
    if (key.toLowerCase().replace(/\\/g, "/") === normalizedDir) {
      return true;
    }
  }
  return false;
}

/**
 * Get indexing status for user-friendly messages
 */
export function getIndexingStatus(): {
  inProgress: boolean;
  directory: string | null;
  elapsedSeconds: number | null;
  allProjects: string[];
} {
  evictStaleLocks();
  if (indexingProjects.size === 0) {
    return { inProgress: false, directory: null, elapsedSeconds: null, allProjects: [] };
  }

  // Return first project for backward compatibility
  const [firstDir, firstState] = indexingProjects.entries().next().value || [null, null];
  return {
    inProgress: true,
    directory: firstDir,
    elapsedSeconds: firstState ? Math.round((Date.now() - firstState.startTime) / 1000) : null,
    allProjects: Array.from(indexingProjects.keys()),
  };
}

// =============================================================================
// POST-INDEXING STATE (background work: embeddings, FAISS, PMI, AutoDoc, etc.)
// The bgPromise now covers ALL background work including knowledgeBus subscribers.
// No hardcoded cooldown — we await the actual completion of all subscribers.
// =============================================================================

function normalizeDir(dir: string): string {
  return dir.toLowerCase().replace(/\\/g, "/");
}

/**
 * Register a post-indexing background promise.
 * The promise should resolve when ALL background work is done
 * (embeddings, FAISS save, PMI, AutoDoc, etc.).
 * Heavy tools (detect_patterns, graph_metrics, etc.) will await this before running.
 */
export function setPostIndexingPromise(directory: string, promise: Promise<void>): void {
  const key = normalizeDir(directory);
  postIndexingPromises.set(key, { promise, startTime: Date.now() });

  // Auto-cleanup when promise completes
  promise.finally(() => {
    postIndexingPromises.delete(key);
  });
}

/**
 * Check if post-indexing background work is active for a project
 */
export function isPostIndexing(directory: string): boolean {
  return postIndexingPromises.has(normalizeDir(directory));
}

/**
 * Wait for post-indexing background work to complete (with timeout).
 * Returns true if waited, false if nothing to wait for.
 */
export async function waitForPostIndexing(directory: string, timeoutMs = 120_000): Promise<boolean> {
  const key = normalizeDir(directory);
  const entry = postIndexingPromises.get(key);
  if (!entry) return false;

  // Race: actual completion vs safety timeout
  await Promise.race([
    entry.promise,
    new Promise<void>((resolve) => {
      if (typeof globalThis.Bun !== "undefined") {
        (globalThis.Bun as any).sleep(timeoutMs).then(resolve);
      } else {
        setTimeout(resolve, timeoutMs);
      }
    }),
  ]);

  postIndexingPromises.delete(key);
  return true;
}

/**
 * Get post-indexing status for diagnostics
 */
export function getPostIndexingStatus(): { active: boolean; directories: string[]; elapsedSeconds: number[] } {
  if (postIndexingPromises.size === 0) {
    return { active: false, directories: [], elapsedSeconds: [] };
  }
  const dirs: string[] = [];
  const elapsed: number[] = [];
  for (const [dir, entry] of postIndexingPromises) {
    dirs.push(dir);
    elapsed.push(Math.round((Date.now() - entry.startTime) / 1000));
  }
  return { active: dirs.length > 0, directories: dirs, elapsedSeconds: elapsed };
}

/**
 * Set indexing state for a specific project
 * No longer blocks other projects!
 */
export function setIndexingState(inProgress: boolean, directory?: string): void {
  const dir = directory || legacyIndexingDirectory || "unknown";

  if (inProgress) {
    indexingProjects.set(dir, {
      startTime: Date.now(),
      directory: dir,
    });
    legacyIndexingDirectory = dir;
  } else {
    // Remove this project from indexing
    indexingProjects.delete(dir);
    if (legacyIndexingDirectory === dir) {
      legacyIndexingDirectory = null;
    }

    // Resume timers when all indexing completes
    if (indexingProjects.size === 0) {
      resumeTimers();
    }
  }
}
