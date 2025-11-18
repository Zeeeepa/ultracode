import type { ConductorOrchestrator } from "../../agents/conductor-orchestrator.js";
import { getOrCreateAgent } from "../../core/agent-registry.js";
import type { BranchManager } from "../../core/branch-manager.js";
import { getGlobalContainer } from "../../core/di-container.js";
import { AgentType } from "../../types/agent.js";
import type { GitIntegration } from "../integration/git-integration.js";
import type { VersionedIndex } from "../models/versioned-index.js";

/**
 * Multi-Version Indexer - Parallel indexing for 3-way merge
 *
 * Indexes base + branchA + branchB in sequence:
 * 1. Save current branch
 * 2. Checkout and index each branch
 * 3. Cache indexes in per-branch databases
 * 4. Restore original branch
 *
 * Supports incremental indexing (only changed files).
 */

// =============================================================================
// 1. TYPES AND INTERFACES
// =============================================================================

export interface MultiVersionIndexResult {
  base: VersionedIndex;
  branchA: VersionedIndex;
  branchB: VersionedIndex;
  mergeBase: string; // Common ancestor commit hash
  stats: {
    totalUnits: number;
    totalFiles: number;
    indexingTimeMs: number;
    cacheHits: number; // How many branches loaded from cache
  };
}

export interface IndexingOptions {
  incremental?: boolean; // Use incremental indexing (default: true)
  fullScan?: boolean; // Force full scan even if cache exists (default: false)
  excludePatterns?: string[]; // Patterns to exclude from indexing
  reset?: boolean; // Reset databases before indexing (default: false)
}

// =============================================================================
// 2. MULTI-VERSION INDEXER IMPLEMENTATION
// =============================================================================

export class MultiVersionIndexer {
  private branchManager: BranchManager;
  private gitIntegration: GitIntegration;
  private conductor: ConductorOrchestrator;

  constructor(branchManager: BranchManager, gitIntegration: GitIntegration, conductor: ConductorOrchestrator) {
    this.branchManager = branchManager;
    this.gitIntegration = gitIntegration;
    this.conductor = conductor;
  }

  /**
   * Index 3 branches for merge: base, branchA, branchB
   *
   * This is the main entry point for Phase 4.
   */
  async indexThreeBranches(
    branchA: string,
    branchB: string,
    options: IndexingOptions = {},
  ): Promise<MultiVersionIndexResult> {
    const startTime = Date.now();
    let cacheHits = 0;

    console.log(`[MultiVersionIndexer] Starting 3-way indexing: ${branchA} + ${branchB}`);

    try {
      // 1. Find merge base (common ancestor)
      const mergeBase = this.gitIntegration.getMergeBase(branchA, branchB);
      if (!mergeBase) {
        throw new Error(`No merge base found between ${branchA} and ${branchB}`);
      }

      console.log(`[MultiVersionIndexer] Merge base: ${mergeBase.slice(0, 8)}`);

      // 2. Index base commit
      const baseIndex = await this.indexBranch(mergeBase, "base", options);
      if (this.wasCacheHit(baseIndex)) cacheHits++;

      // 3. Index branchA
      const branchAIndex = await this.indexBranch(branchA, branchA, options);
      if (this.wasCacheHit(branchAIndex)) cacheHits++;

      // 4. Index branchB
      const branchBIndex = await this.indexBranch(branchB, branchB, options);
      if (this.wasCacheHit(branchBIndex)) cacheHits++;

      // 5. Restore original branch
      await this.gitIntegration.restoreOriginalBranch();

      // 6. Compute statistics
      const totalUnits = baseIndex.stats.totalUnits + branchAIndex.stats.totalUnits + branchBIndex.stats.totalUnits;

      const totalFiles =
        (baseIndex.stats.byFile?.size || 0) +
        (branchAIndex.stats.byFile?.size || 0) +
        (branchBIndex.stats.byFile?.size || 0);

      const indexingTimeMs = Date.now() - startTime;

      console.log(`[MultiVersionIndexer] Completed in ${indexingTimeMs}ms`);
      console.log(`[MultiVersionIndexer] Total units: ${totalUnits}, Cache hits: ${cacheHits}/3`);

      return {
        base: baseIndex,
        branchA: branchAIndex,
        branchB: branchBIndex,
        mergeBase,
        stats: {
          totalUnits,
          totalFiles,
          indexingTimeMs,
          cacheHits,
        },
      };
    } catch (error) {
      // Cleanup on error
      await this.gitIntegration.cleanup();
      throw error;
    }
  }

  /**
   * Index a single branch
   *
   * Strategy:
   * 1. Check if branch DB exists and is up-to-date
   * 2. If yes → load from cache
   * 3. If no → checkout branch, run full index, save to cache
   */
  private async indexBranch(branch: string, label: string, options: IndexingOptions): Promise<VersionedIndex> {
    console.log(`[MultiVersionIndexer] Indexing ${label}...`);

    // Check if we can use cached index
    if (!options.fullScan && !options.reset) {
      const cachedIndex = await this.loadCachedIndex(branch);
      if (cachedIndex) {
        console.log(`[MultiVersionIndexer] Loaded ${label} from cache`);
        return cachedIndex;
      }
    }

    // Need to index from scratch
    const startTime = Date.now();

    // 1. Checkout branch
    await this.gitIntegration.checkoutBranch(branch);

    // 2. Get DevAgent for indexing
    const container = getGlobalContainer();
    const devAgent = await getOrCreateAgent(container, this.conductor, AgentType.DEV);

    // 3. Run indexing
    const index = await this.runIndexing(devAgent, branch, options);

    // 4. Save to cache
    await this.saveCachedIndex(branch, index);

    const elapsed = Date.now() - startTime;
    console.log(`[MultiVersionIndexer] Indexed ${label} in ${elapsed}ms (${index.stats.totalUnits} units)`);

    return index;
  }

  /**
   * Run actual indexing using DevAgent
   */
  private async runIndexing(devAgent: any, branch: string, options: IndexingOptions): Promise<VersionedIndex> {
    // Get current repo path from git integration
    const repoPath = (this.gitIntegration as any).config.repoPath as string;

    // Use DevAgent to perform indexing
    // Note: This is a simplified version - actual implementation would need to
    // coordinate with ParserAgent, IndexerAgent, etc. through DevAgent
    await (devAgent as any).execute?.({
      task: "index_codebase",
      params: {
        directory: repoPath,
        incremental: options.incremental ?? true,
        fullScan: options.fullScan ?? false,
        excludePatterns: options.excludePatterns || [],
        reset: options.reset ?? false,
      },
    });

    // Extract VersionedIndex from result
    // For now, we create a minimal index structure
    // TODO: Integrate with actual indexing pipeline
    const index: VersionedIndex = {
      branch,
      indexedAt: new Date(),
      units: new Map(),
      contentHashIndex: new Map(),
      structuralHashIndex: new Map(),
      signatureIndex: new Map(),
      filePathIndex: new Map(),
      stats: {
        totalUnits: 0,
        byType: new Map(),
        byLanguage: new Map(),
        byFile: new Map(),
      },
    };

    // TODO: Populate index from DevAgent result
    // This would involve loading data from the branch-specific database

    return index;
  }

  /**
   * Load cached index for a branch
   */
  private async loadCachedIndex(branch: string): Promise<VersionedIndex | null> {
    try {
      // Check if branch database exists
      if (!this.branchManager.hasBranchDatabase(branch)) {
        return null;
      }

      // Get branch metadata
      const metadata = this.branchManager.getBranchMetadata(branch);
      if (!metadata) {
        return null;
      }

      // Check if index is up-to-date
      const currentCommit = this.gitIntegration.getCommitHash(branch);
      if (metadata.lastCommitHash !== currentCommit) {
        console.log(
          `[MultiVersionIndexer] Cache outdated for ${branch} (${metadata.lastCommitHash?.slice(0, 8)} vs ${currentCommit.slice(0, 8)})`,
        );
        return null;
      }

      // Load index from database
      // TODO: Implement actual loading from SQLite
      const index: VersionedIndex = {
        branch,
        indexedAt: new Date(metadata.lastIndexedAt),
        units: new Map(),
        contentHashIndex: new Map(),
        structuralHashIndex: new Map(),
        signatureIndex: new Map(),
        filePathIndex: new Map(),
        stats: {
          totalUnits: metadata.entityCount,
          byType: new Map(),
          byLanguage: new Map(),
          byFile: new Map(),
        },
      };

      // Mark as cache hit
      (index as any)._fromCache = true;

      return index;
    } catch (error) {
      console.error(`[MultiVersionIndexer] Failed to load cached index for ${branch}:`, error);
      return null;
    }
  }

  /**
   * Save index to branch cache
   */
  private async saveCachedIndex(branch: string, index: VersionedIndex): Promise<void> {
    try {
      const repoPath = (this.gitIntegration as any).config.repoPath as string;
      const commitHash = this.gitIntegration.getCommitHash(branch);
      const repoHash = this.branchManager.getRepositoryHash(repoPath);

      // Update branch metadata
      this.branchManager.updateBranchMetadata({
        branch,
        repositoryPath: repoPath,
        repositoryHash: repoHash,
        lastCommitHash: commitHash,
        lastIndexedAt: Date.now(),
        fileCount: index.stats.byFile?.size || 0,
        entityCount: index.stats.totalUnits,
        relationshipCount: 0, // TODO: Track relationships
        indexVersion: "1.0.0",
        accessedAt: Date.now(),
      });

      console.log(`[MultiVersionIndexer] Saved cache for ${branch} (${commitHash.slice(0, 8)})`);
    } catch (error) {
      console.error(`[MultiVersionIndexer] Failed to save cached index for ${branch}:`, error);
    }
  }

  /**
   * Check if index was loaded from cache
   */
  private wasCacheHit(index: VersionedIndex): boolean {
    return (index as any)._fromCache === true;
  }
}
