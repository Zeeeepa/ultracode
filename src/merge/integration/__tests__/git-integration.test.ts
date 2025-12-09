import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { GitIntegration, type GitIntegrationConfig } from "../git-integration.js";

describe("GitIntegration", () => {
  let config: GitIntegrationConfig;
  let mockExecSync: ReturnType<typeof spyOn>;
  let mockExistsSync: ReturnType<typeof spyOn>;

  beforeEach(() => {
    config = {
      repoPath: "/test/repo",
      allowDetachedHead: false,
      restoreOnError: true,
    };

    // Setup spies
    mockExistsSync = spyOn(fs, "existsSync").mockReturnValue(true);
    mockExecSync = spyOn(childProcess, "execSync");
  });

  describe("constructor", () => {
    it("should create GitIntegration for valid repository", () => {
      const git = new GitIntegration(config);
      expect(git).toBeDefined();
    });

    it("should throw error if not a git repository", () => {
      mockExistsSync.mockReturnValue(false);
      expect(() => new GitIntegration(config)).toThrow(/Not a git repository/);
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch for regular branch", () => {
      mockExecSync.mockReturnValueOnce("main\n").mockReturnValueOnce("abc123def456\n");

      const git = new GitIntegration(config);
      const branch = git.getCurrentBranch();

      expect(branch.name).toBe("main");
      expect(branch.isDetached).toBe(false);
      expect(branch.commitHash).toBe("abc123def456");
    });

    it("should handle detached HEAD state", () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error("Not a symbolic ref");
        })
        .mockReturnValueOnce("abc123def456\n");

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
      mockExecSync.mockReturnValueOnce("");

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
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("");

      const git = new GitIntegration(config);
      await git.checkoutBranch("feature");

      expect(mockExecSync).toHaveBeenCalledWith("git checkout feature", expect.objectContaining({ cwd: "/test/repo" }));
    });

    it("should throw error if branch does not exist", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("abc123\n")
        .mockImplementationOnce(() => {
          throw new Error("Branch not found");
        });

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("nonexistent")).rejects.toThrow(/Branch does not exist/);
    });

    it("should throw error if uncommitted changes exist", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("M file.ts\n");

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("feature")).rejects.toThrow(/uncommitted changes/);
    });

    it("should restore original branch on error if restoreOnError=true", async () => {
      mockExecSync
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("")
        .mockImplementationOnce(() => {
          throw new Error("Checkout failed");
        })
        .mockReturnValueOnce("");

      const git = new GitIntegration(config);

      await expect(git.checkoutBranch("feature")).rejects.toThrow(/Failed to checkout/);

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
        .mockReturnValueOnce("A\tsrc/new.ts\n")
        .mockReturnValueOnce(" 3 files changed, 45 insertions(+), 12 deletions(-)\n");

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
        .mockReturnValueOnce("main\n")
        .mockReturnValueOnce("abc123\n")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("")
        .mockReturnValueOnce("");

      const git = new GitIntegration(config);
      await git.checkoutBranch("feature");
      await git.cleanup();

      // Check that the last call was to restore main
      const calls = mockExecSync.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall?.[0]).toBe("git checkout main");
    });

    it("should do nothing if no original branch", async () => {
      const git = new GitIntegration(config);
      const callCount = mockExecSync.mock.calls.length;
      await git.cleanup();

      // Should not have made any new calls
      expect(mockExecSync.mock.calls.length).toBe(callCount);
    });
  });
});
