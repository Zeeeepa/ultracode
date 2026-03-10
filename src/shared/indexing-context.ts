/**
 * Indexing Context
 *
 * Backward-compatible wrapper around ProjectContextManager.
 * Used by SemanticAgent and other components for project directory access.
 *
 * @deprecated Use ProjectContextManager directly for new code
 */

import { getProjectContext } from "./project-context.js";

/**
 * Get the current directory being indexed
 * @deprecated Use getProjectContext().getCurrentProject()
 */
export function getCurrentIndexingDirectory(): string | undefined {
  return getProjectContext().getCurrentProject();
}

/**
 * Set the current directory being indexed
 * @deprecated No-op. Use runWithRequestContext() for per-call project scoping.
 * Global project switching is being phased out to prevent race conditions.
 */
export function setCurrentIndexingDirectory(_directory: string | undefined): void {
  // No-op: project context is now set via AsyncLocalStorage (runWithRequestContext)
  // Kept for backward compatibility — callers should migrate to ALS.
}
