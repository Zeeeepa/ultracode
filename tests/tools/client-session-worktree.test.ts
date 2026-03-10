import { beforeAll, describe, expect, it } from "bun:test";
import {
  ClientSession,
  getSessionsForRepo,
  registerSession,
  unregisterSession,
} from "../../src/core/client-session.js";
import { clearWorktreeCache, getRepoIdentity } from "../../src/shared/git-worktree.js";
import { initHasher } from "../../src/utils/fast-hash.js";

beforeAll(async () => {
  await initHasher();
});

const REPO_PATH = process.cwd();

describe("ClientSession worktree awareness", () => {
  it("detects repoIdentity for git repo", () => {
    clearWorktreeCache();
    const session = new ClientSession({ projectPath: REPO_PATH, clientId: 100 });

    expect(session.repoIdentity).toBeTruthy();
    expect(session.isWorktree).toBe(false); // Main repo
    expect(session.worktreeInfo).not.toBeNull();

    unregisterSession(session.sessionId);
  });

  it("accepts explicit branch from config", () => {
    clearWorktreeCache();
    const session = new ClientSession({
      projectPath: REPO_PATH,
      clientId: 101,
      branch: "custom-branch-name",
    });

    expect(session.branch).toBe("custom-branch-name");

    unregisterSession(session.sessionId);
  });

  it("accepts agentId from config", () => {
    clearWorktreeCache();
    const session = new ClientSession({
      projectPath: REPO_PATH,
      clientId: 102,
      agentId: "test-agent-42",
    });

    expect(session.agentId).toBe("test-agent-42");

    unregisterSession(session.sessionId);
  });

  it("registers in repo index and can be found", () => {
    clearWorktreeCache();
    const repoId = getRepoIdentity(REPO_PATH);
    expect(repoId).toBeTruthy();

    const session = new ClientSession({ projectPath: REPO_PATH, clientId: 103 });
    registerSession(session);

    const sessions = getSessionsForRepo(repoId!);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.some((s) => s.sessionId === session.sessionId)).toBe(true);

    unregisterSession(session.sessionId);

    // After unregister, should not be found
    const sessionsAfter = getSessionsForRepo(repoId!);
    expect(sessionsAfter.some((s) => s.sessionId === session.sessionId)).toBe(false);
  });
});
