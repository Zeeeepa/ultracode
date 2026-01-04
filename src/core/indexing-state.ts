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

/** Legacy global state for backward compatibility */
let legacyIndexingDirectory: string | null = null;

// =============================================================================
// TIMER SYSTEM (Simplified - no longer need suspension for HTTP providers)
// =============================================================================

/** Legacy export for compatibility (no-op now) */
export const registerAsyncLoopStarter = (_starter: () => void): void => {};

/** Legacy export for compatibility (always returns false) */
export function areTimersSuspended(): boolean {
  return false;
}

/** Legacy export for compatibility (no-op now) */
export function resumeTimers(): void {}

/**
 * Check if indexing is currently in progress for ANY project
 */
export function isIndexing(): boolean {
  return indexingProjects.size > 0;
}

/**
 * Check if a specific project is being indexed
 */
export function isProjectIndexing(directory: string): boolean {
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
