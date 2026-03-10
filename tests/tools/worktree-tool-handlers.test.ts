import { describe, expect, it } from "bun:test";
import { GetWorktreeInfoHandler, ListWorktreeAgentsHandler } from "../../src/tools/handlers/worktree-tool-handlers.js";
import { createMockToolContext, parseJsonResult } from "./_test-helpers.js";

// ─── GetWorktreeInfo ────────────────────────────────────────────

describe("GetWorktreeInfoHandler", () => {
  it("returns isGitRepo=false for non-git directory", async () => {
    const ctx = createMockToolContext({ projectPath: "/tmp/not-a-repo-123456" });
    const handler = new GetWorktreeInfoHandler(ctx);
    const result = await handler.handle({ directory: "/tmp/not-a-repo-123456" });
    const data = parseJsonResult(result);

    expect(data.isGitRepo).toBe(false);
    // Path is normalized by OS, just check it contains the directory name
    expect(data.path).toContain("not-a-repo-123456");
  });

  it("returns worktree info for current repo", async () => {
    // Use the actual UltraCode repo (we know this is a git repo)
    const ctx = createMockToolContext({ projectPath: process.cwd() });
    const handler = new GetWorktreeInfoHandler(ctx);
    const result = await handler.handle({});
    const data = parseJsonResult(result);

    expect(data.isGitRepo).toBe(true);
    expect(data.worktree).toBeDefined();
    expect(data.worktree.repoIdentity).toBeTruthy();
    expect(typeof data.worktree.isWorktree).toBe("boolean");
    expect(data.siblingWorktrees).toBeArray();
    expect(data.submodules).toBeArray();
    expect(data.subtrees).toBeArray();
  });
});

// ─── ListWorktreeAgents ──────────────────────────────────────────

describe("ListWorktreeAgentsHandler", () => {
  it("returns error for non-git project", async () => {
    const ctx = createMockToolContext({ projectPath: "/tmp/not-a-repo-123456" });
    const handler = new ListWorktreeAgentsHandler(ctx);
    const result = await handler.handle({});
    const data = parseJsonResult(result);

    expect(data.error).toContain("Not a git repository");
  });

  it("lists worktrees for current repo", async () => {
    const ctx = createMockToolContext({ projectPath: process.cwd() });
    const handler = new ListWorktreeAgentsHandler(ctx);
    const result = await handler.handle({ includeInactive: true });
    const data = parseJsonResult(result);

    expect(data.repoIdentity).toBeTruthy();
    expect(data.totalWorktrees).toBeGreaterThanOrEqual(1);
    expect(data.worktrees).toBeArray();
    expect(data.worktrees.length).toBeGreaterThanOrEqual(1);

    // First worktree should be the main one
    const mainWt = data.worktrees.find((wt: any) => wt.isMain);
    expect(mainWt).toBeDefined();
  });
});
