/**
 * Client Session - Per-client state isolation
 *
 * Each MCP client (Claude instance) gets its own session with:
 * - Isolated project path (no cross-client interference)
 * - Session-scoped indexing state
 * - Unique session ID for logging/debugging
 *
 * This replaces the global ProjectContextManager singleton pattern
 * to support multi-client scenarios in pipe mode.
 */

import { existsSync, writeFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { log } from "../logging/index.js";
import { clearWorktreeCache, resolveWorktreeInfo, type WorktreeInfo } from "../shared/git-worktree.js";
import {
  ensureProjectDir,
  getCurrentGitBranchOrDefault,
  getProjectDir,
  getProjectHash,
  getProjectPaths,
} from "../shared/storage-paths.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ClientSessionConfig {
  /** Initial project path for this client */
  projectPath: string;

  /** Session ID (auto-generated if not provided) */
  sessionId?: string;

  /** Client identifier from transport (e.g., client #1, #2) */
  clientId?: number;

  /** Explicit branch name from comm.c --branch (skips git detection) */
  branch?: string;

  /** Agent identifier from comm.c --agent-id (for multi-agent coordination) */
  agentId?: string;
}

export interface SessionProjectInfo {
  path: string;
  hash: string;
  branch: string;
  isIndexed: boolean;
  lastAccessedAt: number;
}

// =============================================================================
// CLIENT SESSION CLASS
// =============================================================================

/**
 * Holds per-client state, completely isolated from other clients.
 *
 * Usage:
 * - Create one ClientSession per connected client (in pipe mode)
 * - Pass to ToolContext for all tool operations
 * - Never use global singletons when ClientSession is available
 */
export class ClientSession {
  readonly sessionId: string;
  readonly clientId: number;
  readonly createdAt: number;

  /** Agent identifier for multi-agent coordination (from comm.c --agent-id) */
  readonly agentId: string | null;

  private _projectPath: string;
  private _branch: string;
  private _indexingInProgress: boolean = false;
  private _lastActivityAt: number;

  /** Worktree detection info (cached, null for non-git projects) */
  private _worktreeInfo: WorktreeInfo | null = null;

  constructor(config: ClientSessionConfig) {
    this.sessionId = config.sessionId ?? generateSessionId();
    this.clientId = config.clientId ?? 0;
    this.agentId = config.agentId ?? null;
    this.createdAt = Date.now();
    this._lastActivityAt = this.createdAt;

    // Normalize and resolve project path
    this._projectPath = normalize(resolve(config.projectPath));

    // Use explicit branch from comm.c if provided, else detect from git
    this._branch = config.branch ?? getCurrentGitBranchOrDefault(this._projectPath);

    // Detect worktree info for this project
    this._worktreeInfo = resolveWorktreeInfo(this._projectPath);

    // Ensure project directory exists immediately (not lazily!)
    // This prevents the "missing directory" bug when server crashes early
    this.ensureProjectInitialized();

    // Register in repo-based index
    if (this._worktreeInfo) {
      addSessionToRepoIndex(this._worktreeInfo.repoIdentity, this.sessionId);
    }

    log.i("SESSION", "created", {
      sid: this.sessionId,
      cid: this.clientId,
      agentId: this.agentId,
      proj: this._projectPath,
      branch: this._branch,
      isWorktree: this._worktreeInfo?.isWorktree ?? false,
      repoIdentity: this._worktreeInfo?.repoIdentity ?? null,
    });
  }

  // ===========================================================================
  // PROJECT PATH ACCESSORS
  // ===========================================================================

  /**
   * Get current project path for this session
   */
  get projectPath(): string {
    return this._projectPath;
  }

  /**
   * Get current branch for this session
   */
  get branch(): string {
    return this._branch;
  }

  /**
   * Get project hash for database operations.
   * For worktrees, this returns the same hash as the main repo (repoIdentity).
   */
  get projectHash(): string {
    return getProjectHash(this._projectPath);
  }

  /**
   * Stable repository identity (same for all worktrees of the same repo).
   * Null for non-git projects.
   */
  get repoIdentity(): string | null {
    return this._worktreeInfo?.repoIdentity ?? null;
  }

  /**
   * Whether this session's project is a linked git worktree (not main).
   */
  get isWorktree(): boolean {
    return this._worktreeInfo?.isWorktree ?? false;
  }

  /**
   * Get worktree detection info. Null for non-git projects.
   */
  get worktreeInfo(): WorktreeInfo | null {
    return this._worktreeInfo;
  }

  /**
   * Get project storage paths
   */
  getStoragePaths() {
    return getProjectPaths(this._projectPath);
  }

  /**
   * Get project directory in centralized storage
   */
  getProjectDir(): string {
    return getProjectDir(this._projectPath);
  }

  // ===========================================================================
  // PROJECT SWITCHING
  // ===========================================================================

  /**
   * Switch to a different project within this session.
   * This is safe because it only affects THIS client's context.
   */
  switchProject(newProjectPath: string, newBranch?: string): void {
    const resolved = normalize(resolve(newProjectPath));

    if (resolved === this._projectPath && (!newBranch || newBranch === this._branch)) {
      // No change needed
      return;
    }

    const oldPath = this._projectPath;
    const oldBranch = this._branch;

    // Remove from old repo index
    if (this._worktreeInfo) {
      removeSessionFromRepoIndex(this._worktreeInfo.repoIdentity, this.sessionId);
    }

    this._projectPath = resolved;
    this._branch = newBranch ?? getCurrentGitBranchOrDefault(resolved);
    this._lastActivityAt = Date.now();

    // Re-detect worktree info for new project
    clearWorktreeCache();
    this._worktreeInfo = resolveWorktreeInfo(this._projectPath);

    // Add to new repo index
    if (this._worktreeInfo) {
      addSessionToRepoIndex(this._worktreeInfo.repoIdentity, this.sessionId);
    }

    // Ensure new project directory exists
    this.ensureProjectInitialized();

    log.i("SESSION", "switched", {
      sid: this.sessionId,
      from: `${oldPath}@${oldBranch}`,
      to: `${this._projectPath}@${this._branch}`,
      isWorktree: this._worktreeInfo?.isWorktree ?? false,
    });
  }

  /**
   * Resolve a path relative to current project or return absolute path
   */
  resolvePath(inputPath?: string | null): string {
    if (!inputPath) {
      return this._projectPath;
    }

    // If path is absolute, use it directly
    if (inputPath.startsWith("/") || /^[A-Za-z]:/.test(inputPath)) {
      return normalize(resolve(inputPath));
    }

    // Relative path - resolve from current project
    return normalize(resolve(this._projectPath, inputPath));
  }

  // ===========================================================================
  // INDEXING STATE
  // ===========================================================================

  /**
   * Check if indexing is in progress for this session's project
   */
  get isIndexing(): boolean {
    return this._indexingInProgress;
  }

  /**
   * Mark indexing as started
   */
  startIndexing(): void {
    this._indexingInProgress = true;
    this._lastActivityAt = Date.now();
    log.i("SESSION", "indexing_start", { sid: this.sessionId, proj: this._projectPath });
  }

  /**
   * Mark indexing as completed
   */
  finishIndexing(): void {
    this._indexingInProgress = false;
    this._lastActivityAt = Date.now();
    log.i("SESSION", "indexing_done", { sid: this.sessionId, proj: this._projectPath });
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  /**
   * Mark activity (for idle detection)
   */
  markActivity(): void {
    this._lastActivityAt = Date.now();
  }

  /**
   * Get time since last activity
   */
  get idleTimeMs(): number {
    return Date.now() - this._lastActivityAt;
  }

  /**
   * Get session info for debugging/logging
   */
  getInfo(): SessionProjectInfo {
    return {
      path: this._projectPath,
      hash: this.projectHash,
      branch: this._branch,
      isIndexed: this.checkProjectIndexed(),
      lastAccessedAt: this._lastActivityAt,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Ensure project directory structure exists
   */
  private ensureProjectInitialized(): void {
    const projectDir = ensureProjectDir(this._projectPath);

    // Write session marker file (for debugging crashed sessions)
    const markerPath = `${projectDir}/session-marker.json`;
    try {
      const marker = {
        sessionId: this.sessionId,
        clientId: this.clientId,
        projectPath: this._projectPath,
        branch: this._branch,
        createdAt: new Date(this.createdAt).toISOString(),
        lastActivityAt: new Date(this._lastActivityAt).toISOString(),
      };
      writeFileSync(markerPath, JSON.stringify(marker, null, 2));
    } catch {
      // Non-critical - just for debugging
    }

    log.t("SESSION", "proj_init", { sid: this.sessionId, dir: projectDir });
  }

  /**
   * Check if project has been indexed
   */
  private checkProjectIndexed(): boolean {
    const paths = this.getStoragePaths();
    return existsSync(paths.graphDbPath);
  }
}

// =============================================================================
// SESSION REGISTRY (for multi-client tracking)
// =============================================================================

const activeSessions = new Map<string, ClientSession>();

// Index for O(k) lookup by project path instead of O(n) filter
const sessionsByProject = new Map<string, Set<string>>();

// Index for O(k) lookup by repoIdentity (all worktrees of the same repo)
const sessionsByRepo = new Map<string, Set<string>>();

/** @internal Add session to repo index */
function addSessionToRepoIndex(repoIdentity: string, sessionId: string): void {
  let sessions = sessionsByRepo.get(repoIdentity);
  if (!sessions) {
    sessions = new Set();
    sessionsByRepo.set(repoIdentity, sessions);
  }
  sessions.add(sessionId);
}

/** @internal Remove session from repo index */
function removeSessionFromRepoIndex(repoIdentity: string, sessionId: string): void {
  const sessions = sessionsByRepo.get(repoIdentity);
  if (sessions) {
    sessions.delete(sessionId);
    if (sessions.size === 0) {
      sessionsByRepo.delete(repoIdentity);
    }
  }
}

/**
 * Register a new session
 */
export function registerSession(session: ClientSession): void {
  activeSessions.set(session.sessionId, session);

  // Add to project index for O(k) lookup
  const projectPath = session.projectPath;
  let projectSessions = sessionsByProject.get(projectPath);
  if (!projectSessions) {
    projectSessions = new Set();
    sessionsByProject.set(projectPath, projectSessions);
  }
  projectSessions.add(session.sessionId);

  log.i("SESSION", "registered", { sid: session.sessionId, total: activeSessions.size });
}

/**
 * Unregister a session (on client disconnect)
 */
export function unregisterSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);

  // Remove from project index
  if (session) {
    const projectSessions = sessionsByProject.get(session.projectPath);
    if (projectSessions) {
      projectSessions.delete(sessionId);
      if (projectSessions.size === 0) {
        sessionsByProject.delete(session.projectPath);
      }
    }

    // Remove from repo index
    if (session.repoIdentity) {
      removeSessionFromRepoIndex(session.repoIdentity, sessionId);
    }
  }

  activeSessions.delete(sessionId);
  log.i("SESSION", "unregistered", { sid: sessionId, total: activeSessions.size });
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): ClientSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): ClientSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get sessions for a specific project
 * O(k) lookup via index instead of O(n) filter
 */
export function getSessionsForProject(projectPath: string): ClientSession[] {
  const normalized = normalize(resolve(projectPath));
  const sessionIds = sessionsByProject.get(normalized);
  if (!sessionIds) return [];

  const result: ClientSession[] = [];
  for (const sessionId of sessionIds) {
    const session = activeSessions.get(sessionId);
    if (session) result.push(session);
  }
  return result;
}

/**
 * Get sessions for a repository identity (all worktrees of the same repo).
 * O(k) lookup via repo index.
 */
export function getSessionsForRepo(repoIdentity: string): ClientSession[] {
  const sessionIds = sessionsByRepo.get(repoIdentity);
  if (!sessionIds) return [];

  const result: ClientSession[] = [];
  for (const sessionId of sessionIds) {
    const session = activeSessions.get(sessionId);
    if (session) result.push(session);
  }
  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `ses-${timestamp}-${random}-${sessionCounter}`;
}
