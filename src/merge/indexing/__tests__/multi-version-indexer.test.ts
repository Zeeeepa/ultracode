import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ConductorOrchestrator } from "../../../agents/conductor-orchestrator.js";
import type { BranchManager } from "../../../core/branch-manager.js";
import type { GitIntegration } from "../../integration/git-integration.js";
import { type IndexingOptions, MultiVersionIndexer } from "../multi-version-indexer.js";

// Mock dependencies
const mockBranchManager = {
  hasBranchDatabase: jest.fn(),
  getBranchMetadata: jest.fn(),
  updateBranchMetadata: jest.fn(),
  getRepositoryHash: jest.fn(),
} as unknown as BranchManager;

const mockGitIntegration = {
  getMergeBase: jest.fn(),
  checkoutBranch: jest.fn(),
  restoreOriginalBranch: jest.fn(),
  cleanup: jest.fn(),
  getCommitHash: jest.fn(),
  config: { repoPath: "/test/repo" },
} as unknown as GitIntegration;

const mockConductor = {} as ConductorOrchestrator;

const mockDevAgent = {
  execute: jest.fn(),
};

// Mock global container and agent registry
jest.mock("../../../core/di-container.js", () => ({
  getGlobalContainer: jest.fn(() => ({})),
}));

jest.mock("../../../core/agent-registry.js", () => ({
  AgentType: { DEV: "dev" },
  getOrCreateAgent: jest.fn(() => Promise.resolve(mockDevAgent)),
}));

describe("MultiVersionIndexer", () => {
  let indexer: MultiVersionIndexer;

  beforeEach(() => {
    jest.clearAllMocks();

    indexer = new MultiVersionIndexer(mockBranchManager, mockGitIntegration, mockConductor);

    // Default mocks
    (mockGitIntegration.getMergeBase as jest.Mock).mockReturnValue("base-commit-hash");
    (mockGitIntegration.getCommitHash as jest.Mock).mockImplementation((ref) => `${ref}-hash`);
    // @ts-expect-error - Jest mock types issue
    (mockGitIntegration.checkoutBranch as jest.Mock).mockResolvedValue(undefined);
    // @ts-expect-error - Jest mock types issue
    (mockGitIntegration.restoreOriginalBranch as jest.Mock).mockResolvedValue(undefined);
    (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(false);
    (mockBranchManager.getRepositoryHash as jest.Mock).mockReturnValue("repo-hash-123");
    // @ts-expect-error - Jest mock types issue
    mockDevAgent.execute.mockResolvedValue({ success: true });
  });

  describe("indexThreeBranches", () => {
    it("should index base, branchA, branchB successfully", async () => {
      const result = await indexer.indexThreeBranches("main", "feature");

      // Should find merge base
      expect(mockGitIntegration.getMergeBase).toHaveBeenCalledWith("main", "feature");

      // Should checkout and index each branch
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalledTimes(3);
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalledWith("base-commit-hash");
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalledWith("main");
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalledWith("feature");

      // Should restore original branch
      expect(mockGitIntegration.restoreOriginalBranch).toHaveBeenCalled();

      // Should return result
      expect(result).toBeDefined();
      expect(result.base).toBeDefined();
      expect(result.branchA).toBeDefined();
      expect(result.branchB).toBeDefined();
      expect(result.mergeBase).toBe("base-commit-hash");
      expect(result.stats).toBeDefined();
    });

    it("should throw error if no merge base found", async () => {
      (mockGitIntegration.getMergeBase as jest.Mock).mockReturnValue(null);

      await expect(indexer.indexThreeBranches("main", "unrelated")).rejects.toThrow(/No merge base found/);
    });

    it("should cleanup on error", async () => {
      // @ts-expect-error - Jest mock types issue
      (mockGitIntegration.checkoutBranch as jest.Mock).mockRejectedValue(new Error("Checkout failed"));

      await expect(indexer.indexThreeBranches("main", "feature")).rejects.toThrow(/Checkout failed/);

      // Should call cleanup
      expect(mockGitIntegration.cleanup).toHaveBeenCalled();
    });

    it("should use cached indexes when available", async () => {
      // Mock cached metadata
      (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(true);
      (mockBranchManager.getBranchMetadata as jest.Mock).mockImplementation((branch) => ({
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
      expect(mockGitIntegration.checkoutBranch).not.toHaveBeenCalled();

      // Should have cache hits
      expect(result.stats.cacheHits).toBe(3);
    });

    it("should reindex if cache is outdated", async () => {
      (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(true);
      (mockBranchManager.getBranchMetadata as jest.Mock).mockReturnValue({
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
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });

    it("should force full scan when fullScan=true", async () => {
      (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(true);
      (mockBranchManager.getBranchMetadata as jest.Mock).mockReturnValue({
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
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });

    it("should compute total statistics correctly", async () => {
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result.stats.totalUnits).toBeGreaterThanOrEqual(0);
      expect(result.stats.totalFiles).toBeGreaterThanOrEqual(0);
      expect(result.stats.indexingTimeMs).toBeGreaterThan(0);
      expect(result.stats.cacheHits).toBeGreaterThanOrEqual(0);
      expect(result.stats.cacheHits).toBeLessThanOrEqual(3);
    });
  });

  describe("Cache management", () => {
    it("should save metadata after indexing", async () => {
      await indexer.indexThreeBranches("main", "feature");

      // Should update metadata for each branch
      expect(mockBranchManager.updateBranchMetadata).toHaveBeenCalledTimes(3);

      // Verify metadata structure
      const calls = (mockBranchManager.updateBranchMetadata as jest.Mock).mock.calls;
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
      (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(true);
      (mockBranchManager.getBranchMetadata as jest.Mock).mockReturnValue({
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
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalled();

      // Should have no cache hits
      expect(result.stats.cacheHits).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("should handle DevAgent execution errors", async () => {
      // @ts-expect-error - Jest mock types issue
      mockDevAgent.execute.mockRejectedValue(new Error("Indexing failed"));

      await expect(indexer.indexThreeBranches("main", "feature")).rejects.toThrow(/Indexing failed/);
    });

    it("should handle metadata read errors gracefully", async () => {
      (mockBranchManager.hasBranchDatabase as jest.Mock).mockReturnValue(true);
      (mockBranchManager.getBranchMetadata as jest.Mock).mockImplementation(() => {
        throw new Error("Read error");
      });

      // Should fallback to fresh indexing
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result).toBeDefined();
      expect(mockGitIntegration.checkoutBranch).toHaveBeenCalled();
    });

    it("should handle metadata write errors gracefully", async () => {
      (mockBranchManager.updateBranchMetadata as jest.Mock).mockImplementation(() => {
        throw new Error("Write error");
      });

      // Should still complete indexing
      const result = await indexer.indexThreeBranches("main", "feature");

      expect(result).toBeDefined();
    });
  });
});
