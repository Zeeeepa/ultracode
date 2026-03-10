/**
 * Git Worktree / Submodule / Subtree Detection
 *
 * Provides utilities to detect git worktrees, submodules, and subtrees.
 * Key concept: `repoIdentity` — a stable hash that is identical for all
 * worktrees of the same repository. This enables shared indexing and
 * cross-worktree agent coordination.
 *
 * How it works:
 * - `git rev-parse --git-common-dir` returns the shared .git directory
 * - For main worktree: returns `.git`
 * - For linked worktree: returns `../../.git` (relative to gitdir)
 * - repoIdentity = xxHash32(normalize(absoluteGitCommonDir))
 *
 * Caching: results are cached per projectPath for process lifetime.
 * Invalidate via `clearWorktreeCache()` on project switch.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { log } from "../logging/index.js";
import { hashText } from "../utils/fast-hash.js";

// =============================================================================
// TYPES
// =============================================================================

export interface WorktreeInfo {
  /** true if this is a linked worktree (not the main working tree) */
  isWorktree: boolean;
  /** Absolute path to the main repository (the one with the real .git dir) */
  mainRepoPath: string;
  /** git rev-parse --git-common-dir (absolute path) */
  gitCommonDir: string;
  /** Stable identity: xxHash32(normalized gitCommonDir) — same for all worktrees */
  repoIdentity: string;
  /** Name of this worktree (null for main) */
  worktreeName: string | null;
  /** Current working path of this worktree */
  worktreePath: string;
}

export interface SubmoduleInfo {
  /** Relative path inside parent repo */
  path: string;
  /** Remote URL */
  url: string;
  /** Tracking branch (null if not set) */
  branch: string | null;
  /** Pinned commit hash */
  commitHash: string;
  /** repoIdentity of the parent repo */
  parentRepoIdentity: string;
}

export interface SubtreeInfo {
  /** Path prefix in the repo (e.g., "libs/shared") */
  prefix: string;
  /** Last merge commit involving this subtree */
  lastMergeCommit: string | null;
}

export interface SiblingWorktree {
  /** Absolute path to the worktree */
  path: string;
  /** Branch checked out in this worktree */
  branch: string;
  /** Whether this is the main working tree */
  isMain: boolean;
}

// =============================================================================
// CACHE
// =============================================================================

const worktreeCache = new Map<string, WorktreeInfo | null>();
const submoduleCache = new Map<string, SubmoduleInfo[]>();
const subtreeCache = new Map<string, SubtreeInfo[]>();

/**
 * Clear all worktree caches. Call on project switch or worktree layout changes.
 */
export function clearWorktreeCache(): void {
  worktreeCache.clear();
  submoduleCache.clear();
  subtreeCache.clear();
}

// =============================================================================
// CORE: WORKTREE DETECTION
// =============================================================================

/**
 * Resolve worktree information for a given project path.
 * Returns null if the path is not a git repository.
 *
 * Results are cached per projectPath for process lifetime.
 */
export function resolveWorktreeInfo(projectPath: string): WorktreeInfo | null {
  const normalized = normalize(resolve(projectPath));

  if (worktreeCache.has(normalized)) {
    return worktreeCache.get(normalized)!;
  }

  const info = resolveWorktreeInfoUncached(normalized);
  worktreeCache.set(normalized, info);
  return info;
}

function resolveWorktreeInfoUncached(projectPath: string): WorktreeInfo | null {
  const gitPath = join(projectPath, ".git");

  if (!existsSync(gitPath)) {
    return null; // Not a git repo
  }

  try {
    // Determine if .git is a file (linked worktree) or directory (main worktree)
    const isLinkedWorktree = statSync(gitPath).isFile();

    // Get the common git directory (shared among all worktrees)
    const gitCommonDirRaw = execSync("git rev-parse --git-common-dir", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    }).trim();

    // Make gitCommonDir absolute
    const gitCommonDir = normalize(resolve(projectPath, gitCommonDirRaw));

    // mainRepoPath = parent of gitCommonDir (since gitCommonDir ends with .git)
    const mainRepoPath = dirname(gitCommonDir);

    // Compute stable repoIdentity
    const normalizedCommon = gitCommonDir.toLowerCase().replace(/\\/g, "/").replace(/\/$/, "");
    const repoIdentity = hashText(normalizedCommon);

    // Determine worktree name for linked worktrees
    let worktreeName: string | null = null;
    if (isLinkedWorktree) {
      // git-dir for a linked worktree is typically: <gitCommonDir>/worktrees/<name>
      // Read .git file to find the gitdir path
      try {
        const gitFileContent = readFileSync(gitPath, "utf-8").trim();
        // Format: "gitdir: /path/to/.git/worktrees/<name>"
        const match = gitFileContent.match(/^gitdir:\s*(.+)$/);
        if (match?.[1]) {
          const gitdir = match[1].trim();
          // Extract worktree name from the path
          const wtMatch = gitdir.match(/worktrees[/\\]([^/\\]+)$/);
          if (wtMatch?.[1]) {
            worktreeName = wtMatch[1];
          }
        }
      } catch {
        // Non-critical
      }
    }

    const info: WorktreeInfo = {
      isWorktree: isLinkedWorktree,
      mainRepoPath,
      gitCommonDir,
      repoIdentity,
      worktreeName,
      worktreePath: projectPath,
    };

    log.t("WORKTREE", "resolved", {
      path: projectPath,
      isWorktree: isLinkedWorktree,
      repoIdentity,
      worktreeName,
    });

    return info;
  } catch (error) {
    log.w("WORKTREE", "resolve_failed", { path: projectPath, err: String(error) });
    return null;
  }
}

/**
 * Get the stable repository identity for a project path.
 * Returns the same hash for all worktrees of the same repo.
 * Returns null if the path is not a git repo.
 */
export function getRepoIdentity(projectPath: string): string | null {
  const info = resolveWorktreeInfo(projectPath);
  return info?.repoIdentity ?? null;
}

/**
 * Check if a project path is a linked git worktree (not the main working tree).
 */
export function isGitWorktree(projectPath: string): boolean {
  const info = resolveWorktreeInfo(projectPath);
  return info?.isWorktree ?? false;
}

/**
 * Get the main repository path (the one with the real .git directory).
 * For a main worktree, returns the same path. For linked, returns the main repo.
 * Returns null if not a git repo.
 */
export function getMainRepoPath(projectPath: string): string | null {
  const info = resolveWorktreeInfo(projectPath);
  return info?.mainRepoPath ?? null;
}

/**
 * List all worktrees belonging to the same repository.
 * Uses `git worktree list --porcelain` for reliable parsing.
 */
export function listSiblingWorktrees(projectPath: string): SiblingWorktree[] {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });

    const worktrees: SiblingWorktree[] = [];
    const entries = output.trim().split("\n\n");

    for (const entry of entries) {
      if (!entry.trim()) continue;

      const lines = entry.trim().split("\n");
      let wtPath = "";
      let branch = "";
      let isMain = false;

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          wtPath = line.slice("worktree ".length).trim();
        } else if (line.startsWith("branch ")) {
          // Format: "branch refs/heads/feature-x"
          branch = line
            .slice("branch ".length)
            .trim()
            .replace(/^refs\/heads\//, "");
        } else if (line === "bare") {
        }
      }

      if (wtPath) {
        // First worktree in the list is always the main working tree
        if (worktrees.length === 0) {
          isMain = true;
        }
        worktrees.push({ path: normalize(wtPath), branch, isMain });
      }
    }

    return worktrees;
  } catch (error) {
    log.w("WORKTREE", "list_siblings_failed", { path: projectPath, err: String(error) });
    return [];
  }
}

// =============================================================================
// GIT HEAD PATH RESOLUTION (for GitWatcher)
// =============================================================================

/**
 * Resolve the correct path to the HEAD file for a given repository path.
 * For main worktree: <repoPath>/.git/HEAD
 * For linked worktree: <gitCommonDir>/worktrees/<name>/HEAD
 *
 * This is critical for GitWatcher to watch the correct HEAD file.
 */
export function resolveGitHeadPath(repoPath: string): string | null {
  try {
    const gitDirRaw = execSync("git rev-parse --git-dir", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    }).trim();

    // git-dir is relative to cwd, make it absolute and append HEAD
    const gitDir = normalize(resolve(repoPath, gitDirRaw));
    return join(gitDir, "HEAD");
  } catch {
    // Fallback to standard path
    const fallback = join(repoPath, ".git", "HEAD");
    return existsSync(fallback) ? fallback : null;
  }
}

// =============================================================================
// SUBMODULE DETECTION
// =============================================================================

/**
 * Detect git submodules in a repository.
 * Uses `git submodule status --recursive` and `.gitmodules` file.
 */
export function detectSubmodules(projectPath: string): SubmoduleInfo[] {
  const normalized = normalize(resolve(projectPath));

  if (submoduleCache.has(normalized)) {
    return submoduleCache.get(normalized)!;
  }

  const result = detectSubmodulesUncached(normalized);
  submoduleCache.set(normalized, result);
  return result;
}

function detectSubmodulesUncached(projectPath: string): SubmoduleInfo[] {
  const gitmodulesPath = join(projectPath, ".gitmodules");
  if (!existsSync(gitmodulesPath)) {
    return [];
  }

  try {
    // Parse .gitmodules for url and path
    const gitmodulesContent = readFileSync(gitmodulesPath, "utf-8");
    const moduleMap = parseGitmodules(gitmodulesContent);

    // Get status for commit hashes
    const statusOutput = execSync("git submodule status --recursive", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
      timeout: 10000,
    });

    const repoIdentity = getRepoIdentity(projectPath) ?? "";
    const submodules: SubmoduleInfo[] = [];

    for (const line of statusOutput.trim().split("\n")) {
      if (!line.trim()) continue;

      // Format: " <hash> <path> (<describe>)" or "+<hash> <path> (<describe>)" for modified
      const match = line.match(/^\s*[+\- ]?([0-9a-f]+)\s+(\S+)/);
      if (!match) continue;

      const commitHash = match[1] ?? "";
      const subPath = match[2] ?? "";
      if (!subPath) continue;

      const moduleInfo = moduleMap.get(subPath);

      submodules.push({
        path: subPath,
        url: moduleInfo?.url ?? "",
        branch: moduleInfo?.branch ?? null,
        commitHash,
        parentRepoIdentity: repoIdentity,
      });
    }

    log.t("WORKTREE", "submodules_detected", { path: projectPath, count: submodules.length });
    return submodules;
  } catch (error) {
    log.w("WORKTREE", "submodule_detect_failed", { path: projectPath, err: String(error) });
    return [];
  }
}

/**
 * Parse .gitmodules file into a map of path → {url, branch}
 */
function parseGitmodules(content: string): Map<string, { url: string; branch: string | null }> {
  const result = new Map<string, { url: string; branch: string | null }>();
  let currentPath = "";
  let currentUrl = "";
  let currentBranch: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("[submodule")) {
      // Save previous entry
      if (currentPath) {
        result.set(currentPath, { url: currentUrl, branch: currentBranch });
      }
      currentPath = "";
      currentUrl = "";
      currentBranch = null;
    } else if (line.startsWith("path")) {
      const match = line.match(/^path\s*=\s*(.+)$/);
      if (match?.[1]) currentPath = match[1].trim();
    } else if (line.startsWith("url")) {
      const match = line.match(/^url\s*=\s*(.+)$/);
      if (match?.[1]) currentUrl = match[1].trim();
    } else if (line.startsWith("branch")) {
      const match = line.match(/^branch\s*=\s*(.+)$/);
      if (match?.[1]) currentBranch = match[1].trim();
    }
  }

  // Save last entry
  if (currentPath) {
    result.set(currentPath, { url: currentUrl, branch: currentBranch });
  }

  return result;
}

/**
 * Get the parent repository path for a submodule.
 * For a submodule, .git is a file containing "gitdir: ../../.git/modules/<name>".
 * Traverses up the chain to find the parent repo.
 */
export function getParentRepo(submodulePath: string): string | null {
  const gitPath = join(submodulePath, ".git");

  if (!existsSync(gitPath)) return null;

  try {
    const stat = statSync(gitPath);
    if (!stat.isFile()) return null; // Main repo, not a submodule

    const content = readFileSync(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match?.[1]) return null;

    const gitdir = normalize(resolve(submodulePath, match[1].trim()));

    // gitdir for submodule typically: <parent>/.git/modules/<name>
    // Walk up from gitdir to find the parent .git
    const modulesMatch = gitdir.match(/^(.+)[/\\]\.git[/\\]modules[/\\]/);
    if (modulesMatch?.[1]) {
      return normalize(modulesMatch[1]);
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// SUBTREE DETECTION
// =============================================================================

/**
 * Detect git subtrees in a repository.
 * Uses `git log --grep="git-subtree-dir:"` to find subtree merge commits.
 *
 * Note: subtree detection can be slow on large repos due to git log scanning.
 * Results are cached per projectPath.
 */
export function detectSubtrees(projectPath: string): SubtreeInfo[] {
  const normalized = normalize(resolve(projectPath));

  if (subtreeCache.has(normalized)) {
    return subtreeCache.get(normalized)!;
  }

  const result = detectSubtreesUncached(normalized);
  subtreeCache.set(normalized, result);
  return result;
}

function detectSubtreesUncached(projectPath: string): SubtreeInfo[] {
  try {
    // Search for subtree merge commits (git subtree leaves markers in commit messages)
    const output = execSync('git log --all --oneline --grep="git-subtree-dir:" --format="%H %s" -100', {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
      timeout: 15000, // 15s timeout for large repos
    });

    if (!output.trim()) return [];

    const subtreeMap = new Map<string, SubtreeInfo>();

    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;

      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) continue;

      const commitHash = line.slice(0, spaceIdx);
      const message = line.slice(spaceIdx + 1);

      // Extract subtree prefix from commit message
      const dirMatch = message.match(/git-subtree-dir:\s*(\S+)/);
      if (!dirMatch?.[1]) continue;

      const prefix = dirMatch[1];

      // Keep the latest commit for each prefix
      if (!subtreeMap.has(prefix)) {
        subtreeMap.set(prefix, {
          prefix,
          lastMergeCommit: commitHash,
        });
      }
    }

    const result = Array.from(subtreeMap.values());
    log.t("WORKTREE", "subtrees_detected", { path: projectPath, count: result.length });
    return result;
  } catch (error) {
    log.w("WORKTREE", "subtree_detect_failed", { path: projectPath, err: String(error) });
    return [];
  }
}
