import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ConductorOrchestrator } from "../../../agents/conductor-orchestrator.js";
import type { BranchManager } from "../../../core/branch-manager.js";
import type { GitIntegration } from "../../integration/git-integration.js";
import { type IndexingOptions, MultiVersionIndexer } from "../multi-version-indexer.js";

// Create mock functions
const mockHasBranchDatabase = mock(() => false);
const mockGetBranchMetadata = mock(() => null);
const mockUpdateBranchMetadata = mock(() => {});
const mockGetRepositoryHash = mock(() => "repo-hash-123");

const mockGetMergeBase = mock(() => "base-commit-hash");
const mockCheckoutBranch = mock(() => Promise.resolve());
const mockRestoreOriginalBranch = mock(() => Promise.resolve());
const mockCleanup = mock(() => Promise.resolve());
const mockGetCommitHash = mock((ref: string) => `${ref}-hash`);

const mockDevAgentExecute = mock(() => Promise.resolve({ success: true }));

// Mock dependencies
const mockBranchManager = {
  hasBranchDatabase: mockHasBranchDatabase,
  getBranchMetadata: mockGetBranchMetadata,
  updateBranchMetadata: mockUpdateBranchMetadata,
  getRepositoryHash: mockGetRepositoryHash,
} as unknown as BranchManager;

const mockGitIntegration = {
  getMergeBase: mockGetMergeBase,
  checkoutBranch: mockCheckoutBranch,
  restoreOriginalBranch: mockRestoreOriginalBranch,
  cleanup: mockCleanup,
  getCommitHash: mockGetCommitHash,
  config: { repoPath: "/test/repo" },
} as unknown as GitIntegration;

const mockConductor = {} as ConductorOrchestrator;

const mockDevAgent = {
  execute: mockDevAgentExecute,
};

// Mock global container and agent registry
mock.module("../../../core/di-container.js", () => ({
  getGlobalContainer: () => ({}),
}));

mock.module("../../../core/agent-registry.js", () => ({
  AgentType: { DEV: "dev" },
  getOrCreateAgent: () => Promise.resolve(mockDevAgent),
}));

describe("MultiVersionIndexer", () => {
  let indexer: MultiVersionIndexer;

  beforeEach(() => {
    // Reset all mocks
    mockHasBranchDatabase.mockReset();
    mockGetBranchMetadata.mockReset();
    mockUpdateBranchMetadata.mockReset();
    mockGetRepositoryHash.mockReset();
    mockGetMergeBase.mockReset();
    mockCheckoutBranch.mockReset();
    mockRestoreOriginalBranch.mockReset();
    mockCleanup.mockReset();
    mockGetCommitHash.mockReset();
    mockDevAgentExecute.mockReset();

    indexer = new MultiVersionIndexer(mockBranchManager, mockGitIntegration, mockConductor);

    // Default mocks
    mockGetMergeBase.mockReturnValue("base-commit-hash");
    mockGetCommitHash.mockImplementation((ref: string) => `${ref}-hash`);
    mockCheckoutBranch.mockResolvedValue(undefined);
    mockRestoreOriginalBranch.mockResolvedValue(undefined);
    mockHasBranchDatabase.mockReturnValue(false);
    mockGetRepositoryHash.mockReturnValue("repo-hash-123");
    mockDevAgentExecute.mockResolvedValue({ success: true });
  });

  describe("indexThreeBranches", () => {
    it("should index base, branchA, branchB successfully", async () => {
      const result = await indexer.indexThreeBranches("main", "feature");

      // Should find merge base
      expect(mockGetMergeBase).toHaveBeenCalledWith("main", "feature");

      // Should checkout and index each branch
      expect(mockCheckoutBranch).toHaveBeenCalledTimes(3);
      expect(mockCheckoutBranch).toHaveBeenCalledWith("base-commit-hash");
      expect(mockCheckoutBranch).toHaveBeenCalledWith("main");
      expect(mockCheckoutBranch).toHaveBeenCalledWith("feature");

      // Should restore original branch
      expect(mockRestoreOriginalBranch).toHaveBeenCalled();

      // Should return result
      expect(result).toBeDefined();
      expect(result.base).toBeDefined();
      expect(result.branchA).toBeDefined();
      expect(result.branchB).toBeDefined();
      expect(result.mergeBase).toBe("base-commit-hash");
      expect(result.stats).toBeDefined();
    });

    it("should throw error if no merge base found", async () => {
      mockGetMergeBase.mockReturnValue(null);

      await expect(indexer.indexThreeBranches("main", "unrelated")).rejects.toThrow(/No merge base found/);
    });

    it("should cleanup on error", async () => {
      mockCheckoutBranch.mockRejectedValue(new Error("Checkout failed"));

      await expect(indexer.indexThreeBranches("main", "feature")).rejects.toThrow(/Checkout failed/);

      // Should call cleanup
      expect(mockCleanup).toHaveBeenCalled();
    });

    it("should use cached indexes when available", async () => {
      // Mock cached metadata
      mockHasBranchDatabase.mockReturnValue(true);
      mockGetBranchMetadata.mockImplementation((branch: string) => ({
        branch,
        lastCommitHash: `${branch}-hash`,
        lastIndexedAt: Date.now(),
        entityCount: 10,
        repositoryPath: "/test/repo",
        repositoryHash: "repo-hash",
        fileCount: 2,
        relationshipCount: 0,
        indexVersion: "1.0.0",
        accessedAt: Date.now(),
      }));

      const result = await indexer.indexThreeBranches("main", "feature");

      // Should not checkout branches (using cache)
      expect(mockCheckoutBranch).not.toHaveBeenCalled();

      // Should have cache hits
      expect(result.stats.cacheHits).toBe(3);
    });

    it("should reindex if cache is outdated", async () => {
      mockHasBranchDatabase.mockReturnValue(true);
      mockGetBranchMetadata.mockReturnValue({
        branch: "main",
        lastCommitHash: "old-hash", // Different from current
        lastIndexedAt: Date.now() - 1000000,
        entityCount: 10,
        repositoryPath: "/test/repo",
        repositoryHash: "repo-hash",
        fileCount: 2,
        relationshipCount: 0,
        indexVersion: "1.0.0",
        accessedAt: Date.now(),
      });

      const result = await indexer.indexThreeBranches("main", "feature");

      // Should checkout and reindex
      expect(mockCheckoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });

    it("should force full scan when fullScan=true", async () => {
      mockHasBranchDatabase.mockReturnValue(true);
      mockGetBranchMetadata.mockReturnValue({
        branch: "main",
        lastCommitHash: "main-hash",
        lastIndexedAt: Date.now(),
        entityCount: 10,
        repositoryPath: "/test/repo",
        repositoryHash: "repo-hash",
        fileCount: 2,
        relationshipCount: 0,
        indexVersion: "1.0.0",
        accessedAt: Date.now(),
      });

      const options: IndexingOptions = { fullScan: true };
      const result = await indexer.indexThreeBranches("main", "feature", options);

      // Should checkout and reindex despite cache
      expect(mockCheckoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });

    it("should compute total statistics correctly", async () => {
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result.stats.totalUnits).toBeGreaterThanOrEqual(0);
      expect(result.stats.totalFiles).toBeGreaterThanOrEqual(0);
      expect(result.stats.indexingTimeMs).toBeGreaterThanOrEqual(0); // Can be 0 with mocks
      expect(result.stats.cacheHits).toBeGreaterThanOrEqual(0);
      expect(result.stats.cacheHits).toBeLessThanOrEqual(3);
    });
  });

  describe("Cache management", () => {
    it("should save metadata after indexing", async () => {
      await indexer.indexThreeBranches("main", "feature");

      // Should update metadata for each branch
      expect(mockUpdateBranchMetadata).toHaveBeenCalledTimes(3);

      // Verify metadata structure
      const calls = mockUpdateBranchMetadata.mock.calls;
      for (const call of calls) {
        const metadata = call[0];
        expect(metadata).toHaveProperty("branch");
        expect(metadata).toHaveProperty("repositoryPath");
        expect(metadata).toHaveProperty("lastCommitHash");
        expect(metadata).toHaveProperty("lastIndexedAt");
        expect(metadata).toHaveProperty("entityCount");
      }
    });

    it("should not use cache when reset=true", async () => {
      mockHasBranchDatabase.mockReturnValue(true);
      mockGetBranchMetadata.mockReturnValue({
        branch: "main",
        lastCommitHash: "main-hash",
        lastIndexedAt: Date.now(),
        entityCount: 10,
        repositoryPath: "/test/repo",
        repositoryHash: "repo-hash",
        fileCount: 2,
        relationshipCount: 0,
        indexVersion: "1.0.0",
        accessedAt: Date.now(),
      });

      const options: IndexingOptions = { reset: true };
      const result = await indexer.indexThreeBranches("main", "feature", options);

      // Should checkout and reindex
      expect(mockCheckoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("should handle DevAgent execution errors", async () => {
      mockDevAgentExecute.mockRejectedValue(new Error("Indexing failed"));

      await expect(indexer.indexThreeBranches("main", "feature")).rejects.toThrow(/Indexing failed/);
    });

    it("should handle metadata read errors gracefully", async () => {
      mockHasBranchDatabase.mockReturnValue(true);
      mockGetBranchMetadata.mockImplementation(() => {
        throw new Error("Read error");
      });

      // Should fallback to fresh indexing
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result).toBeDefined();
      expect(mockCheckoutBranch).toHaveBeenCalled();
    });

    it("should handle metadata write errors gracefully", async () => {
      mockUpdateBranchMetadata.mockImplementation(() => {
        throw new Error("Write error");
      });

      // Should still complete indexing
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result).toBeDefined();
    });
  });
});
