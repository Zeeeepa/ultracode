/**
 * Indexing Context
 *
 * Shared state for current indexing directory.
 * Used by SemanticAgent for adaptive vector backend selection.
 */

let currentIndexingDirectory: string | undefined;

/**
 * Get the current directory being indexed
 */
export function getCurrentIndexingDirectory(): string | undefined {
  return currentIndexingDirectory;
}

/**
 * Set the current directory being indexed
 */
export function setCurrentIndexingDirectory(directory: string | undefined): void {
  currentIndexingDirectory = directory;
}
