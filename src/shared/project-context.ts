/**
 * Project Context Manager
 *
 * Central service for managing project-specific storage and indexing.
 * Ensures all database operations (graph, vectors, cache) are scoped to the correct project.
 *
 * Key responsibilities:
 * - Track current active project
 * - Provide project-specific storage paths
 * - Check if project is indexed
 * - Trigger auto-indexing when needed
 *
 * Note: Storage is now managed via libsql through getGraphStorage() which
 * handles project context via setProject().
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "../logging/index.js";
import { ensureProjectDir, getProjectDir, getProjectPaths } from "./storage-paths.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectInfo {
  path: string;
  hash: string;
  isIndexed: boolean;
  hasGraphDb: boolean;
  hasVectorsDb: boolean;
  lastIndexedAt?: number | undefined;
}

export interface ProjectContextState {
  currentProject: string;
  previousProject: string | null;
}

// =============================================================================
// PROJECT CONTEXT MANAGER
// =============================================================================

export class ProjectContextManager {
  private state: ProjectContextState;

  constructor() {
    const cwd = process.cwd();
    log.i("PROJCTX", `[ProjectContextManager] Initializing with cwd: ${cwd}`);
    this.state = {
      currentProject: cwd,
      previousProject: null,
    };
  }

  private indexingInProgress: Set<string> = new Set();
  private onProjectChangeCallbacks: Array<(newPath: string, oldPath: string | null) => void> = [];

  /**
   * Get current project path
   */
  getCurrentProject(): string {
    return this.state.currentProject;
  }

  /**
   * Resolve and normalize project path
   * - If absolute path provided, use it
   * - If relative path, resolve from CWD
   * - If undefined/null, use current project
   */
  resolveProjectPath(projectPath?: string | null): string {
    if (!projectPath) {
      return this.state.currentProject;
    }

    // Normalize path
    const resolved = resolve(projectPath);
    return resolved;
  }

  /**
   * Get project info including indexing status
   */
  getProjectInfo(projectPath?: string): ProjectInfo {
    const path = this.resolveProjectPath(projectPath);
    const paths = getProjectPaths(path);
    const projectDir = getProjectDir(path);

    // Check for hash (last 16 chars of project dir)
    const hash = projectDir.split(/[/\\]/).pop() || "";

    const hasGraphDb = existsSync(paths.graphDbPath);
    const hasVectorsDb = existsSync(paths.vectorsDbPath);
    const isIndexed = hasGraphDb; // Graph DB is the minimum requirement

    // Try to read metadata for last indexed time
    let lastIndexedAt: number | undefined;
    if (existsSync(paths.metaPath)) {
      try {
        const meta = JSON.parse(require("node:fs").readFileSync(paths.metaPath, "utf-8"));
        lastIndexedAt = meta.lastIndexedAt;
      } catch {
        // Ignore metadata read errors
      }
    }

    return {
      path,
      hash,
      isIndexed,
      hasGraphDb,
      hasVectorsDb,
      lastIndexedAt,
    };
  }

  /**
   * Check if project is indexed
   */
  isProjectIndexed(projectPath?: string): boolean {
    const info = this.getProjectInfo(projectPath);
    return info.isIndexed;
  }

  /**
   * Switch to a different project context
   * Returns true if switch was successful
   */
  async switchProject(projectPath: string): Promise<boolean> {
    const resolved = this.resolveProjectPath(projectPath);

    // Skip if already current project
    if (resolved === this.state.currentProject) {
      return true;
    }

    // Ensure project directory exists in centralized storage
    ensureProjectDir(resolved);

    // Update state
    this.state.previousProject = this.state.currentProject;
    this.state.currentProject = resolved;

    log.i("PROJCTX", `[ProjectContext] Switched project: ${this.state.previousProject} -> ${resolved}`);

    // Notify callbacks
    for (const callback of this.onProjectChangeCallbacks) {
      try {
        callback(resolved, this.state.previousProject);
      } catch (error) {
        log.e("PROJCTX", "callback_error", { err: String(error) });
      }
    }

    return true;
  }

  /**
   * Get storage paths for current or specified project
   */
  getStoragePaths(projectPath?: string) {
    const resolved = this.resolveProjectPath(projectPath);
    return getProjectPaths(resolved);
  }

  /**
   * Check if indexing is in progress for a project
   */
  isIndexingInProgress(projectPath?: string): boolean {
    const resolved = this.resolveProjectPath(projectPath);
    return this.indexingInProgress.has(resolved);
  }

  /**
   * Mark indexing as started for a project
   */
  startIndexing(projectPath?: string): void {
    const resolved = this.resolveProjectPath(projectPath);
    this.indexingInProgress.add(resolved);
    log.i("PROJCTX", `[ProjectContext] Indexing started for: ${resolved}`);
  }

  /**
   * Mark indexing as completed for a project
   */
  finishIndexing(projectPath?: string): void {
    const resolved = this.resolveProjectPath(projectPath);
    this.indexingInProgress.delete(resolved);
    log.i("PROJCTX", `[ProjectContext] Indexing completed for: ${resolved}`);
  }

  /**
   * Register callback for project changes
   */
  onProjectChange(callback: (newPath: string, oldPath: string | null) => void): void {
    this.onProjectChangeCallbacks.push(callback);
  }

  /**
   * Get status summary for debugging
   */
  getStatus(): {
    currentProject: string;
    previousProject: string | null;
    isIndexed: boolean;
    indexingInProgress: string[];
  } {
    return {
      currentProject: this.state.currentProject,
      previousProject: this.state.previousProject,
      isIndexed: this.isProjectIndexed(),
      indexingInProgress: Array.from(this.indexingInProgress),
    };
  }

  /**
   * Reset to default state (mainly for testing)
   */
  reset(): void {
    this.state = {
      currentProject: process.cwd(),
      previousProject: null,
    };
    this.indexingInProgress.clear();
    this.onProjectChangeCallbacks = [];
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let instance: ProjectContextManager | null = null;

export function getProjectContext(): ProjectContextManager {
  if (!instance) {
    instance = new ProjectContextManager();
  }
  return instance;
}

/**
 * Convenience function to get current project path
 */
export function getCurrentProjectPath(): string {
  return getProjectContext().getCurrentProject();
}

/**
 * Convenience function to resolve project path with fallback to current
 */
export function resolveProjectPath(projectPath?: string | null): string {
  return getProjectContext().resolveProjectPath(projectPath);
}

/**
 * Convenience function to check if project is indexed
 */
export function isProjectIndexed(projectPath?: string): boolean {
  return getProjectContext().isProjectIndexed(projectPath);
}

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

// Re-export for backward compatibility with indexing-context.ts
export function getCurrentIndexingDirectory(): string | undefined {
  return getProjectContext().getCurrentProject();
}

export function setCurrentIndexingDirectory(directory: string | undefined): void {
  if (directory) {
    getProjectContext().switchProject(directory);
  }
}
