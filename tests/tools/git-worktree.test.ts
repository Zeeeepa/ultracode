import { beforeAll, describe, expect, it } from "bun:test";
import {
  clearWorktreeCache,
  detectSubmodules,
  detectSubtrees,
  getMainRepoPath,
  getRepoIdentity,
  isGitWorktree,
  listSiblingWorktrees,
  resolveGitHeadPath,
  resolveWorktreeInfo,
} from "../../src/shared/git-worktree.js";
import { initHasher } from "../../src/utils/fast-hash.js";

beforeAll(async () => {
  await initHasher();
});

// Use the UltraCode repo itself as test subject
const REPO_PATH = process.cwd();

describe("resolveWorktreeInfo", () => {
  it("returns info for a git repository", () => {
    clearWorktreeCache();
    const info = resolveWorktreeInfo(REPO_PATH);

    expect(info).not.toBeNull();
    expect(info!.repoIdentity).toBeTruthy();
    expect(info!.mainRepoPath).toBeTruthy();
    expect(info!.gitCommonDir).toBeTruthy();
    expect(info!.worktreePath).toBe(REPO_PATH);
    // Main repo is not a linked worktree
    expect(info!.isWorktree).toBe(false);
    expect(info!.worktreeName).toBeNull();
  });

  it("returns null for non-git directory", () => {
    clearWorktreeCache();
    const info = resolveWorktreeInfo("/tmp");
    expect(info).toBeNull();
  });

  it("caches results", () => {
    clearWorktreeCache();
    const info1 = resolveWorktreeInfo(REPO_PATH);
    const info2 = resolveWorktreeInfo(REPO_PATH);
    // Same object reference (cached)
    expect(info1).toBe(info2);
  });
});

describe("getRepoIdentity", () => {
  it("returns stable identity for a git repo", () => {
    clearWorktreeCache();
    const id1 = getRepoIdentity(REPO_PATH);
    clearWorktreeCache();
    const id2 = getRepoIdentity(REPO_PATH);

    expect(id1).toBeTruthy();
    expect(id1).toBe(id2); // Stable across cache clears
  });

  it("returns null for non-git directory", () => {
    const id = getRepoIdentity("/tmp");
    expect(id).toBeNull();
  });
});

describe("isGitWorktree", () => {
  it("returns false for main repo", () => {
    expect(isGitWorktree(REPO_PATH)).toBe(false);
  });

  it("returns false for non-git directory", () => {
    expect(isGitWorktree("/tmp")).toBe(false);
  });
});

describe("getMainRepoPath", () => {
  it("returns the repo path for main repo", () => {
    const mainPath = getMainRepoPath(REPO_PATH);
    expect(mainPath).toBeTruthy();
    // For main repo, mainRepoPath should be the repo itself
    expect(mainPath).toBe(REPO_PATH);
  });

  it("returns null for non-git directory", () => {
    expect(getMainRepoPath("/tmp")).toBeNull();
  });
});

describe("listSiblingWorktrees", () => {
  it("returns at least one worktree (the main one)", () => {
    const worktrees = listSiblingWorktrees(REPO_PATH);
    expect(worktrees.length).toBeGreaterThanOrEqual(1);

    const main = worktrees.find((wt) => wt.isMain);
    expect(main).toBeDefined();
    expect(main!.branch).toBeTruthy();
  });
});

describe("resolveGitHeadPath", () => {
  it("returns HEAD path for git repo", () => {
    const headPath = resolveGitHeadPath(REPO_PATH);
    expect(headPath).not.toBeNull();
    expect(headPath!).toContain("HEAD");
  });

  it("returns null for non-git directory", () => {
    const headPath = resolveGitHeadPath("/tmp");
    expect(headPath).toBeNull();
  });
});

describe("detectSubmodules", () => {
  it("returns an array (may be empty if no submodules)", () => {
    const submodules = detectSubmodules(REPO_PATH);
    expect(Array.isArray(submodules)).toBe(true);
  });
});

describe("detectSubtrees", () => {
  it("returns an array (may be empty if no subtrees)", () => {
    const subtrees = detectSubtrees(REPO_PATH);
    expect(Array.isArray(subtrees)).toBe(true);
  });
});
