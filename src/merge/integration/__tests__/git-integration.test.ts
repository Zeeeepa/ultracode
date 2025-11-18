import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { GitIntegration, type GitIntegrationConfig } from "../git-integration.js";

// Mock child_process and fs
jest.mock("node:child_process");
jest.mock("node:fs");

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe("GitIntegration", () => {
  let config: GitIntegrationConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      repoPath: "/test/repo",
      allowDetachedHead: false,
      restoreOnError: true,
    };

    // Default mocks
    mockExistsSync.mockReturnValue(true); // .git exists
  });

  describe("constructor", () => {
    it("should create GitIntegration for valid repository", () => {
      const git = new GitIntegration(config);
      expect(git).toBeDefined();
    });

    it("should throw error if not a git repository", () => {
      mockExistsSync.mockReturnValue(false); // No .git

      expect(() => new GitIntegration(config)).toThrow(/Not a git repository/);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch for regular branch", () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // symbolic-ref
        .mockReturnValueOnce("abc123def456\n"); // rev-parse

      const git = new GitIntegration(config);
      const branch = git.getCurrentBranch();

      expect(branch.name).toBe("main");
      expect(branch.isDetached).toBe(false);
      expect(branch.commitHash).toBe("abc123def456");
    });

    it("should handle detached HEAD state", () => {
      // symbolic-ref fails for detached HEAD
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error("Not a symbolic ref");
        })
        .mockReturnValueOnce("abc123def456\n"); // rev-parse

      const git = new GitIntegration(config);
      const branch = git.getCurrentBranch();

      expect(branch.name).toBe("detached-abc123de");
      expect(branch.isDetached).toBe(true);
      expect(branch.commitHash).toBe("abc123def456");
    });
  });

  describe("getCommitHash", () => {
    it("should return commit hash for ref", () => {
      mockExecSync.mockReturnValueOnce("abc123def456\n");

      const git = new GitIntegration(config);
      const hash = git.getCommitHash("HEAD");

      expect(hash).toBe("abc123def456");
      expect(mockExecSync).toHaveBeenCalledWith("git rev-parse HEAD", expect.objectContaining({ cwd: "/test/repo" }));
    });

    it("should throw error for invalid ref", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Invalid ref");
      });

      const git = new GitIntegration(config);

      expect(() => git.getCommitHash("invalid-ref")).toThrow(/Failed to get commit hash/);
    });
  });

  describe("branchExists", () => {
    it("should return true if branch exists", () => {
      mockExecSync.mockReturnValueOnce(""); // rev-parse succeeds

      const git = new GitIntegration(config);
      const exists = git.branchExists("feature-branch");

      expect(exists).toBe(true);
    });

    it("should return false if branch does not exist", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Branch not found");
      });

      const git = new GitIntegration(config);
      const exists = git.branchExists("nonexistent");

      expect(exists).toBe(false);
    });
  });

  describe("checkoutBranch", () => {
    it("should successfully checkout existing branch", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // getCurrentBranch (symbolic-ref)
        .mockReturnValueOnce("abc123\n") // getCurrentBranch (rev-parse)
        .mockReturnValueOnce("") // branchExists (rev-parse --verify)
        .mockReturnValueOnce("") // hasUncommittedChanges (git status)
        .mockReturnValueOnce(""); // git checkout

      const git = new GitIntegration(config);
      await git.checkoutBranch("feature");

      expect(mockExecSync).toHaveBeenCalledWith("git checkout feature", expect.objectContaining({ cwd: "/test/repo" }));
    });

    it("should throw error if branch does not exist", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // getCurrentBranch (symbolic-ref)
        .mockReturnValueOnce("abc123\n") // getCurrentBranch (rev-parse)
        .mockImplementationOnce(() => {
          throw new Error("Branch not found");
        }); // branchExists (rev-parse --verify) throws

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("nonexistent")).rejects.toThrow(/Branch does not exist/);
    });

    it("should throw error if uncommitted changes exist", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // getCurrentBranch (symbolic-ref)
        .mockReturnValueOnce("abc123\n") // getCurrentBranch (rev-parse)
        .mockReturnValueOnce("") // branchExists
        .mockReturnValueOnce("M file.ts\n"); // hasUncommittedChanges

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("feature")).rejects.toThrow(/uncommitted changes/);
    });

    it("should restore original branch on error if restoreOnError=true", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // getCurrentBranch
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("") // branchExists
        .mockReturnValueOnce("") // hasUncommittedChanges
        .mockImplementationOnce(() => {
          throw new Error("Checkout failed");
        }) // git checkout fails
        .mockReturnValueOnce(""); // restore (git checkout main)

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("feature")).rejects.toThrow(/Failed to checkout/);

      // Should have called checkout twice (failed + restore)
      expect(mockExecSync).toHaveBeenCalledWith("git checkout main", expect.objectContaining({ cwd: "/test/repo" }));
    });
  });

  describe("getChangedFilesBetween", () => {
    it("should parse added files", async () => {
      mockExecSync.mockReturnValueOnce("A\tsrc/new-file.ts\n");

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        path: "src/new-file.ts",
        status: "added",
      });
    });

    it("should parse modified files", async () => {
      mockExecSync.mockReturnValueOnce("M\tsrc/existing.ts\n");

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        path: "src/existing.ts",
        status: "modified",
      });
    });

    it("should parse deleted files", async () => {
      mockExecSync.mockReturnValueOnce("D\tsrc/old.ts\n");

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        path: "src/old.ts",
        status: "deleted",
      });
    });

    it("should parse renamed files", async () => {
      mockExecSync.mockReturnValueOnce("R100\tsrc/old-name.ts\tsrc/new-name.ts\n");

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        path: "src/new-name.ts",
        status: "renamed",
        oldPath: "src/old-name.ts",
      });
    });

    it("should parse multiple files", async () => {
      mockExecSync.mockReturnValueOnce("A\tsrc/new.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\n");

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toHaveLength(3);
      expect(changes[0]!.status).toBe("added");
      expect(changes[1]!.status).toBe("modified");
      expect(changes[2]!.status).toBe("deleted");
    });

    it("should return empty array on error", async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Git error");
      });

      const git = new GitIntegration(config);
      const changes = await git.getChangedFilesBetween("main", "feature");

      expect(changes).toEqual([]);
    });
  });

  describe("getDiffStats", () => {
    it("should parse diff statistics", async () => {
      mockExecSync
        .mockReturnValueOnce("A\tsrc/new.ts\n") // getChangedFilesBetween
        .mockReturnValueOnce(" 3 files changed, 45 insertions(+), 12 deletions(-)\n"); // shortstat

      const git = new GitIntegration(config);
      const stats = await git.getDiffStats("main", "feature");

      expect(stats.filesChanged).toBe(3);
      expect(stats.insertions).toBe(45);
      expect(stats.deletions).toBe(12);
      expect(stats.files).toHaveLength(1);
    });

    it("should handle stats with only insertions", async () => {
      mockExecSync.mockReturnValueOnce("").mockReturnValueOnce(" 2 files changed, 30 insertions(+)\n");

      const git = new GitIntegration(config);
      const stats = await git.getDiffStats("main", "feature");

      expect(stats.filesChanged).toBe(2);
      expect(stats.insertions).toBe(30);
      expect(stats.deletions).toBe(0);
    });

    it("should handle stats with only deletions", async () => {
      mockExecSync.mockReturnValueOnce("").mockReturnValueOnce(" 1 file changed, 15 deletions(-)\n");

      const git = new GitIntegration(config);
      const stats = await git.getDiffStats("main", "feature");

      expect(stats.filesChanged).toBe(1);
      expect(stats.insertions).toBe(0);
      expect(stats.deletions).toBe(15);
    });
  });

  describe("getMergeBase", () => {
    it("should return merge base commit", () => {
      mockExecSync.mockReturnValueOnce("abc123def456\n");

      const git = new GitIntegration(config);
      const base = git.getMergeBase("main", "feature");

      expect(base).toBe("abc123def456");
      expect(mockExecSync).toHaveBeenCalledWith(
        "git merge-base main feature",
        expect.objectContaining({ cwd: "/test/repo" }),
      );
    });

    it("should return null on error", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("No merge base");
      });

      const git = new GitIntegration(config);
      const base = git.getMergeBase("main", "unrelated");

      expect(base).toBeNull();
    });
  });

  describe("getAllBranches", () => {
    it("should return list of branches", () => {
      mockExecSync.mockReturnValueOnce("main\nfeature\ndevelop\n");

      const git = new GitIntegration(config);
      const branches = git.getAllBranches();

      expect(branches).toEqual(["main", "feature", "develop"]);
    });

    it("should return empty array on error", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("Git error");
      });

      const git = new GitIntegration(config);
      const branches = git.getAllBranches();

      expect(branches).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("should restore original branch if set", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n") // getCurrentBranch
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("") // branchExists
        .mockReturnValueOnce("") // hasUncommittedChanges
        .mockReturnValueOnce("") // checkout feature
        .mockReturnValueOnce(""); // cleanup (restore main)

      const git = new GitIntegration(config);
      await git.checkoutBranch("feature");
      await git.cleanup();

      expect(mockExecSync).toHaveBeenLastCalledWith(
        "git checkout main",
        expect.objectContaining({ cwd: "/test/repo" }),
      );
    });

    it("should do nothing if no original branch", async () => {
      const git = new GitIntegration(config);
      await git.cleanup();

      // Should not call checkout
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });
});
