/**
 * Layered Indexing - Public API
 *
 * Three-layer symbol indexing with branch awareness:
 * - Layer 0 (Base): Main branch entities, shared, immutable
 * - Layer 1 (Branch Deltas): Per-branch changes, shared, mostly immutable
 * - Layer 2 (Working Deltas): Per-client uncommitted changes [FUTURE]
 *
 * Based on: ultrasharp-tools-mcp (.NET) implementation
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

// =============================================================================
// MAIN FACADE (Recommended entry point)
// =============================================================================

export type { IndexStatus, LayeredIndexManagerConfig } from "./layered-index-manager.js";
export { LayeredIndexManager } from "./layered-index-manager.js";

// =============================================================================
// CORE COMPONENTS
// =============================================================================

export { BranchDelta } from "./branch-delta.js";
export { GitDeltaComputer } from "./git-delta-computer.js";
export { LayeredGraphIndex } from "./layered-graph-index.js";

// =============================================================================
// CACHE MANAGERS
// =============================================================================

export { LayeredCacheManager } from "./layered-cache-manager.js";
export { VectorCacheManager } from "./vector-cache-manager.js";

// =============================================================================
// INCREMENTAL UPDATES
// =============================================================================

export type { FileChangeIntegrationConfig, IntegrationStats } from "./file-change-integration.js";
export { FileChangeIntegration } from "./file-change-integration.js";
export type {
  BatchProcessingResult,
  FileChangeEvent,
  FileChangeType,
  IncrementalUpdateConfig,
} from "./incremental-update-queue.js";
export { IncrementalUpdateQueue } from "./incremental-update-queue.js";

// =============================================================================
// VECTOR INTEGRATION
// =============================================================================

export type { LayeredSimilarityResult } from "./layered-vector-store.js";
export { LayeredVectorStore } from "./layered-vector-store.js";
export { VectorDelta } from "./vector-delta.js";

// =============================================================================
// MAINTENANCE & OPTIMIZATION
// =============================================================================

export type {
  CompactionResult,
  DeltaMaintenanceConfig,
  MaintenanceStats,
} from "./delta-maintenance-service.js";
export { DeltaMaintenanceService } from "./delta-maintenance-service.js";

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/**
 * Basic usage:
 *
 * ```typescript
 * import { LayeredIndexManager } from "./layered/index.js";
 *
 * const manager = new LayeredIndexManager(
 *   baseIndex,
 *   baseVectorStore,
 *   branchManager,
 *   gitWatcher,
 *   {
 *     workingDirectory: process.cwd(),
 *     enableFileWatching: true,
 *     enableMaintenance: true,
 *     estimatedFileCount: 5000,
 *   }
 * );
 *
 * await manager.initialize();
 *
 * // Query entities in current branch
 * const entities = await manager.queryEntities("MyClass", "feature-branch");
 *
 * // Semantic search
 * const results = await manager.searchSimilar(queryEmbedding, 10, "feature-branch");
 *
 * // Switch branch
 * await manager.switchBranch("main");
 *
 * // Cleanup
 * await manager.shutdown();
 * ```
 */
