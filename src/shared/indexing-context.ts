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
 * @deprecated Use getProjectContext().switchProject()
 */
export function setCurrentIndexingDirectory(directory: string | undefined): void {
  if (directory) {
    getProjectContext().switchProject(directory);
  }
}
