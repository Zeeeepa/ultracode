/**
 * Delta Maintenance Service - Optimization & Cleanup
 *
 * Manages maintenance tasks for layered indexing:
 * - Delta compaction (reduce memory usage for large deltas)
 * - Orphaned delta cleanup (remove deltas for deleted branches)
 * - Periodic maintenance scheduling
 * - Statistics tracking
 *
 * Key features:
 * - Background tasks (non-blocking)
 * - Configurable schedules
 * - Auto-compaction when threshold exceeded
 * - LRU-based delta eviction
 *
 * Based on: ultrasharp-tools-mcp DeltaMaintenanceService.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import type { BranchManager } from "../core/branch-manager.js";
import type { ILayeredIndex } from "../core/layered-index.js";
import type { LayeredCacheManager } from "./layered-cache-manager.js";
import type { VectorCacheManager } from "./vector-cache-manager.js";

// =============================================================================
// TYPES
// =============================================================================

export interface DeltaMaintenanceConfig {
  /** Enable automatic maintenance (default: true) */
  enabled: boolean;

  /** Delta compaction threshold (number of changes) (default: 1000) */
  compactionThreshold: number;

  /** Orphaned delta max age in days (default: 7) */
  orphanedDeltaMaxAgeDays: number;

  /** Maintenance interval in milliseconds (default: 1 hour) */
  maintenanceIntervalMs: number;

  /** Enable auto-compaction on threshold (default: true) */
  autoCompaction: boolean;

  /** Enable debug logging (default: false) */
  debug: boolean;
}

export interface MaintenanceStats {
  /** Last maintenance run timestamp */
  lastRunTime: number;

  /** Total maintenance runs */
  totalRuns: number;

  /** Deltas compacted */
  deltasCompacted: number;

  /** Deltas deleted */
  deltasDeleted: number;

  /** Bytes freed */
  bytesFreed: number;

  /** Last run duration (ms) */
  lastRunDurationMs: number;
}

export interface CompactionResult {
  /** Branch name */
  branch: string;

  /** Changes before compaction */
  changesBefore: number;

  /** Changes after compaction */
  changesAfter: number;

  /** Memory freed (bytes) */
  memoryFreed: number;

  /** Compaction successful */
  success: boolean;
}

// =============================================================================
// DELTA MAINTENANCE SERVICE CLASS
// =============================================================================

export class DeltaMaintenanceService {
  private layeredIndex: ILayeredIndex;
  private cacheManager: LayeredCacheManager | null;
  private vectorCacheManager: VectorCacheManager | null;
  private branchManager: BranchManager | null;
  private config: DeltaMaintenanceConfig;

  // State
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Statistics
  private stats: MaintenanceStats = {
    lastRunTime: 0,
    totalRuns: 0,
    deltasCompacted: 0,
    deltasDeleted: 0,
    bytesFreed: 0,
    lastRunDurationMs: 0,
  };

  constructor(
    layeredIndex: ILayeredIndex,
    cacheManager: LayeredCacheManager | null = null,
    vectorCacheManager: VectorCacheManager | null = null,
    branchManager: BranchManager | null = null,
    config?: Partial<DeltaMaintenanceConfig>,
  ) {
    this.layeredIndex = layeredIndex;
    this.cacheManager = cacheManager;
    this.vectorCacheManager = vectorCacheManager;
    this.branchManager = branchManager;

    // Merge config with defaults
    this.config = {
      enabled: config?.enabled ?? true,
      compactionThreshold: config?.compactionThreshold ?? 1000,
      orphanedDeltaMaxAgeDays: config?.orphanedDeltaMaxAgeDays ?? 7,
      maintenanceIntervalMs: config?.maintenanceIntervalMs ?? 60 * 60 * 1000, // 1 hour
      autoCompaction: config?.autoCompaction ?? true,
      debug: config?.debug ?? false,
    };

    if (this.config.debug) {
      console.log(
        `[DeltaMaintenanceService] Initialized with ` +
          `compactionThreshold=${this.config.compactionThreshold}, ` +
          `orphanedMaxAge=${this.config.orphanedDeltaMaxAgeDays}d, ` +
          `interval=${this.config.maintenanceIntervalMs}ms`,
      );
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Start maintenance service
   */
  start(): void {
    if (!this.config.enabled) {
      console.log("[DeltaMaintenanceService] Maintenance is disabled");
      return;
    }

    if (this.maintenanceInterval) {
      console.log("[DeltaMaintenanceService] Already running");
      return;
    }

    console.log(
      `[DeltaMaintenanceService] Starting maintenance service (interval: ${this.config.maintenanceIntervalMs}ms)`,
    );

    // Run immediately
    this.runMaintenance().catch((error) => {
      console.error("[DeltaMaintenanceService] Initial maintenance failed:", error);
    });

    // Schedule periodic maintenance
    this.maintenanceInterval = setInterval(() => {
      this.runMaintenance().catch((error) => {
        console.error("[DeltaMaintenanceService] Maintenance failed:", error);
      });
    }, this.config.maintenanceIntervalMs);
  }

  /**
   * Stop maintenance service
   */
  stop(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
      console.log("[DeltaMaintenanceService] Stopped maintenance service");
    }
  }

  // =========================================================================
  // MAINTENANCE OPERATIONS
  // =========================================================================

  /**
   * Run full maintenance cycle
   */
  async runMaintenance(): Promise<void> {
    if (this.isRunning) {
      if (this.config.debug) {
        console.log("[DeltaMaintenanceService] Maintenance already running, skipping");
      }
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log("[DeltaMaintenanceService] Starting maintenance cycle...");

      // 1. Compact large deltas
      await this.compactLargeDeltas();

      // 2. Cleanup orphaned deltas
      await this.cleanupOrphanedDeltas();

      // 3. Delete old deltas
      await this.deleteOldDeltas();

      // 4. Compact databases
      this.compactDatabases();

      // Update stats
      this.stats.totalRuns++;
      this.stats.lastRunTime = Date.now();
      this.stats.lastRunDurationMs = Date.now() - startTime;

      console.log(`[DeltaMaintenanceService] Maintenance cycle completed in ${this.stats.lastRunDurationMs}ms`);
    } catch (error) {
      console.error("[DeltaMaintenanceService] Maintenance cycle failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Compact large deltas (exceeding threshold)
   */
  private async compactLargeDeltas(): Promise<void> {
    if (!this.config.autoCompaction) {
      return;
    }

    try {
      const branches = await this.layeredIndex.getCachedBranches();

      if (this.config.debug) {
        console.log(`[DeltaMaintenanceService] Checking ${branches.length} branches for compaction`);
      }

      for (const branch of branches) {
        try {
          const delta = await this.layeredIndex.getBranchDelta(branch);

          if (!delta) {
            continue;
          }

          // Check if compaction needed
          if (delta.totalChanges > this.config.compactionThreshold) {
            console.log(
              `[DeltaMaintenanceService] Branch ${branch} has ${delta.totalChanges} changes, ` +
                `exceeds threshold ${this.config.compactionThreshold} - compacting`,
            );

            const result = await this.compactBranchDelta(branch);

            if (result.success) {
              this.stats.deltasCompacted++;
              this.stats.bytesFreed += result.memoryFreed;
            }
          }
        } catch (error) {
          console.error(`[DeltaMaintenanceService] Failed to compact branch ${branch}:`, error);
        }
      }
    } catch (error) {
      console.error("[DeltaMaintenanceService] Failed to compact large deltas:", error);
    }
  }

  /**
   * Compact a single branch delta
   *
   * Strategy:
   * - Recompute delta from git diff (fresher, more efficient)
   * - Replace cached delta with compacted version
   *
   * @param branch - Branch name
   */
  async compactBranchDelta(branch: string): Promise<CompactionResult> {
    const result: CompactionResult = {
      branch,
      changesBefore: 0,
      changesAfter: 0,
      memoryFreed: 0,
      success: false,
    };

    try {
      // Get current delta
      const currentDelta = await this.layeredIndex.getBranchDelta(branch);

      if (!currentDelta) {
        return result;
      }

      result.changesBefore = currentDelta.totalChanges;

      // Recompute delta (this will be more efficient)
      const newDelta = await this.layeredIndex.ensureBranchDelta(branch);

      result.changesAfter = newDelta.totalChanges;

      // Estimate memory freed (rough)
      result.memoryFreed = (result.changesBefore - result.changesAfter) * 1000; // ~1KB per change

      result.success = true;

      console.log(
        `[DeltaMaintenanceService] Compacted ${branch}: ` +
          `${result.changesBefore} → ${result.changesAfter} changes, ` +
          `freed ~${(result.memoryFreed / 1024).toFixed(2)} KB`,
      );

      return result;
    } catch (error) {
      console.error(`[DeltaMaintenanceService] Failed to compact ${branch}:`, error);
      return result;
    }
  }

  /**
   * Cleanup orphaned deltas (branches that no longer exist)
   */
  private async cleanupOrphanedDeltas(): Promise<void> {
    try {
      const cachedBranches = await this.layeredIndex.getCachedBranches();

      if (!this.branchManager) {
        if (this.config.debug) {
          console.log("[DeltaMaintenanceService] No branch manager, skipping orphaned cleanup");
        }
        return;
      }

      // Get existing branches from git (not available in BranchManager API yet)
      // For now, skip this check
      // TODO: Add getAllBranches() to BranchManager

      if (this.config.debug) {
        console.log(`[DeltaMaintenanceService] Checking ${cachedBranches.length} cached branches for orphans`);
      }
    } catch (error) {
      console.error("[DeltaMaintenanceService] Failed to cleanup orphaned deltas:", error);
    }
  }

  /**
   * Delete old deltas (older than configured age)
   */
  private async deleteOldDeltas(): Promise<void> {
    try {
      let deletedCount = 0;

      // Delete old entity deltas
      if (this.cacheManager) {
        const deleted = await this.cacheManager.deleteOldDeltas(this.config.orphanedDeltaMaxAgeDays);
        deletedCount += deleted;
      }

      // Delete old vector deltas
      if (this.vectorCacheManager) {
        const deleted = await this.vectorCacheManager.deleteOldDeltas(this.config.orphanedDeltaMaxAgeDays);
        deletedCount += deleted;
      }

      if (deletedCount > 0) {
        this.stats.deltasDeleted += deletedCount;
        console.log(`[DeltaMaintenanceService] Deleted ${deletedCount} old deltas`);
      }
    } catch (error) {
      console.error("[DeltaMaintenanceService] Failed to delete old deltas:", error);
    }
  }

  /**
   * Compact databases (VACUUM)
   */
  private compactDatabases(): void {
    try {
      if (this.cacheManager) {
        this.cacheManager.compact();
      }

      if (this.vectorCacheManager) {
        this.vectorCacheManager.compact();
      }
    } catch (error) {
      console.error("[DeltaMaintenanceService] Failed to compact databases:", error);
    }
  }

  // =========================================================================
  // MANUAL OPERATIONS
  // =========================================================================

  /**
   * Force compaction of all deltas
   */
  async forceCompactAll(): Promise<void> {
    console.log("[DeltaMaintenanceService] Force compacting all deltas...");

    const branches = await this.layeredIndex.getCachedBranches();

    for (const branch of branches) {
      await this.compactBranchDelta(branch);
    }

    console.log("[DeltaMaintenanceService] Force compaction complete");
  }

  /**
   * Force cleanup of all orphaned deltas
   */
  async forceCleanupOrphaned(): Promise<void> {
    console.log("[DeltaMaintenanceService] Force cleanup of orphaned deltas...");
    await this.cleanupOrphanedDeltas();
    console.log("[DeltaMaintenanceService] Force cleanup complete");
  }

  // =========================================================================
  // STATISTICS
  // =========================================================================

  /**
   * Get maintenance statistics
   */
  getStats(): MaintenanceStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      lastRunTime: 0,
      totalRuns: 0,
      deltasCompacted: 0,
      deltasDeleted: 0,
      bytesFreed: 0,
      lastRunDurationMs: 0,
    };
  }

  /**
   * Get comprehensive status report
   */
  async getStatusReport(): Promise<{
    maintenance: MaintenanceStats;
    entityCache?: any;
    vectorCache?: any;
  }> {
    const report: any = {
      maintenance: this.getStats(),
    };

    // Entity cache stats
    if (this.cacheManager) {
      report.entityCache = this.cacheManager.getStatistics();
    }

    // Vector cache stats
    if (this.vectorCacheManager) {
      report.vectorCache = this.vectorCacheManager.getStatistics();
    }

    return report;
  }
}
