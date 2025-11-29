/**
 * Layered Index Manager - Main Integration Facade
 *
 * Orchestrates all layered indexing components:
 * - LayeredGraphIndex (three-layer entity indexing)
 * - LayeredVectorStore (three-layer semantic search)
 * - GitDeltaComputer (git diff analysis)
 * - IncrementalUpdateQueue (batching & debouncing)
 * - FileChangeIntegration (GitWatcher integration)
 * - DeltaMaintenanceService (optimization & cleanup)
 *
 * Provides simple API for:
 * - Initialization
 * - Branch switching
 * - Incremental updates
 * - Lifecycle management
 *
 * Based on: ultrasharp-tools-mcp LayeredIndexManager.cs
 * @see Dev.Docs/LAYERED_INDEXING_IMPLEMENTATION_PLAN.md
 */

import type { BranchManager } from "../core/branch-manager.js";
import type { GitWatcher } from "../core/git-watcher.js";
import type { VectorStore } from "../semantic/vector-store.js";
import type { LayeredIndexConfig } from "../types/layered.js";
import { LayeredIndexConfigPresets } from "../types/layered.js";
import type { GraphStorage } from "../types/storage.js";
import { DeltaMaintenanceService } from "./delta-maintenance-service.js";
import { FileChangeIntegration } from "./file-change-integration.js";
import { GitDeltaComputer } from "./git-delta-computer.js";
import { IncrementalUpdateQueue } from "./incremental-update-queue.js";
import { LayeredCacheManager } from "./layered-cache-manager.js";
import { LayeredGraphIndex } from "./layered-graph-index.js";
import { LayeredVectorStore } from "./layered-vector-store.js";
import { VectorCacheManager } from "./vector-cache-manager.js";

// =============================================================================
// TYPES
// =============================================================================

export interface LayeredIndexManagerConfig {
  /** Working directory */
  workingDirectory: string;

  /** Layered index configuration */
  layeredConfig?: Partial<LayeredIndexConfig>;

  /** Enable file watching (default: true) */
  enableFileWatching?: boolean;

  /** Enable maintenance service (default: true) */
  enableMaintenance?: boolean;

  /** Estimated file count (for adaptive backend selection) */
  estimatedFileCount?: number;

  /** Debug mode (default: false) */
  debug?: boolean;
}

export interface IndexStatus {
  /** Is initialized */
  initialized: boolean;

  /** Current branch */
  currentBranch: string | null;

  /** Cached branches */
  cachedBranches: string[];

  /** Total entities in base index */
  totalEntities: number;

  /** Maintenance stats */
  maintenance: any;

  /** Queue status */
  queue: any;
}

// =============================================================================
// LAYERED INDEX MANAGER CLASS
// =============================================================================

export class LayeredIndexManager {
  // Configuration
  private config: LayeredIndexManagerConfig;
  private layeredConfig: LayeredIndexConfig;

  // Core components
  private baseIndex: GraphStorage;
  private baseVectorStore: VectorStore;
  private branchManager: BranchManager;
  private gitWatcher: GitWatcher | null;

  // Layered components
  private layeredIndex: LayeredGraphIndex;
  private layeredVectorStore: LayeredVectorStore | null = null;
  private gitDeltaComputer: GitDeltaComputer | null = null;

  // Cache managers
  private cacheManager: LayeredCacheManager;
  private vectorCacheManager: VectorCacheManager;

  // Update & integration
  private updateQueue: IncrementalUpdateQueue;
  private fileIntegration: FileChangeIntegration | null = null;

  // Maintenance
  private maintenanceService: DeltaMaintenanceService | null = null;

  // State
  private isInitialized = false;

  constructor(
    baseIndex: GraphStorage,
    baseVectorStore: VectorStore,
    branchManager: BranchManager,
    gitWatcher: GitWatcher | null,
    config: LayeredIndexManagerConfig,
  ) {
    this.baseIndex = baseIndex;
    this.baseVectorStore = baseVectorStore;
    this.branchManager = branchManager;
    this.gitWatcher = gitWatcher;
    this.config = config;

    // Select layered config preset based on file count
    this.layeredConfig = this.selectConfigPreset();

    // Merge with user config
    if (config.layeredConfig) {
      this.layeredConfig = { ...this.layeredConfig, ...config.layeredConfig };
    }

    // Initialize cache managers
    this.cacheManager = new LayeredCacheManager(config.workingDirectory);
    this.vectorCacheManager = new VectorCacheManager(config.workingDirectory);

    // Initialize layered index
    this.layeredIndex = new LayeredGraphIndex(this.baseIndex, this.layeredConfig);

    // Initialize update queue
    this.updateQueue = new IncrementalUpdateQueue(this.layeredIndex, {
      debounceWindowMs: 300,
      maxBatchSize: 100,
      enabled: true,
      debug: config.debug || false,
    });

    console.error(
      `[LayeredIndexManager] Initialized with preset: ${this.getConfigPresetName()}, ` +
        `fileWatching: ${config.enableFileWatching ?? true}, ` +
        `maintenance: ${config.enableMaintenance ?? true}`,
    );
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize layered index manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.error("[LayeredIndexManager] Initializing...");

    // Initialize layered index
    await this.layeredIndex.initialize();

    // Initialize git delta computer
    this.gitDeltaComputer = new GitDeltaComputer(this.branchManager, this.baseIndex, this.config.workingDirectory);

    // Inject dependencies into layered index
    // Note: This is a workaround - ideally would use dependency injection
    (this.layeredIndex as any).gitDeltaComputer = this.gitDeltaComputer;
    (this.layeredIndex as any).cacheManager = this.cacheManager;

    // Initialize vector store if vector deltas enabled
    if (this.layeredConfig.enableVectorDeltas) {
      this.layeredVectorStore = new LayeredVectorStore(this.baseVectorStore, this.layeredConfig);

      // Inject vector cache manager
      (this.layeredVectorStore as any).cacheManager = this.vectorCacheManager;
    }

    // Initialize file watching integration
    if (this.config.enableFileWatching && this.gitWatcher) {
      this.fileIntegration = new FileChangeIntegration(this.gitWatcher, this.updateQueue, this.layeredIndex, {
        enableFileWatching: true,
        enableBranchWatching: true,
        enableCommitWatching: true,
        maxIncrementalFiles: 100,
        debug: this.config.debug || false,
      });

      this.fileIntegration.initialize();

      // Set current branch
      const currentBranch = this.branchManager.getCurrentBranch(this.config.workingDirectory);
      if (currentBranch) {
        this.fileIntegration.setCurrentBranch(currentBranch);
      }
    }

    // Initialize maintenance service
    if (this.config.enableMaintenance) {
      this.maintenanceService = new DeltaMaintenanceService(
        this.layeredIndex,
        this.cacheManager,
        this.vectorCacheManager,
        this.branchManager,
        {
          enabled: true,
          compactionThreshold: 1000,
          orphanedDeltaMaxAgeDays: 7,
          maintenanceIntervalMs: 60 * 60 * 1000, // 1 hour
          autoCompaction: true,
          debug: this.config.debug || false,
        },
      );

      this.maintenanceService.start();
    }

    this.isInitialized = true;

    console.error("[LayeredIndexManager] Initialization complete");
  }

  // =========================================================================
  // QUERY API
  // =========================================================================

  /**
   * Query entities with three-layer merging
   *
   * @param pattern - Search pattern
   * @param branch - Branch name (null = main)
   * @param clientId - Client ID for Layer 2 [FUTURE]
   */
  async queryEntities(pattern: string, branch: string | null = null, clientId: string | null = null) {
    return this.layeredIndex.queryEntities(branch, clientId, pattern);
  }

  /**
   * Query relationships with three-layer merging
   *
   * @param sourceId - Source entity ID
   * @param targetId - Target entity ID (optional)
   * @param branch - Branch name (null = main)
   * @param clientId - Client ID for Layer 2 [FUTURE]
   */
  async queryRelationships(
    sourceId: string,
    targetId?: string,
    branch: string | null = null,
    clientId: string | null = null,
  ) {
    return this.layeredIndex.queryRelationships(branch, clientId, sourceId, targetId);
  }

  /**
   * Semantic search with three-layer vector merging
   *
   * @param queryEmbedding - Query embedding
   * @param topK - Number of results
   * @param branch - Branch name (null = main)
   * @param clientId - Client ID for Layer 2 [FUTURE]
   */
  async searchSimilar(
    queryEmbedding: Float32Array,
    topK: number,
    branch: string | null = null,
    clientId: string | null = null,
  ) {
    if (!this.layeredVectorStore) {
      throw new Error("Vector deltas not enabled");
    }

    return this.layeredVectorStore.searchSimilar(branch, clientId, queryEmbedding, topK);
  }

  // =========================================================================
  // BRANCH OPERATIONS
  // =========================================================================

  /**
   * Switch to a different branch
   *
   * @param branch - Branch name
   */
  async switchBranch(branch: string): Promise<void> {
    console.error(`[LayeredIndexManager] Switching to branch: ${branch}`);

    // Ensure branch delta exists
    await this.layeredIndex.ensureBranchDelta(branch);

    // Update file integration
    if (this.fileIntegration) {
      this.fileIntegration.setCurrentBranch(branch);
    }

    console.error(`[LayeredIndexManager] Switched to branch: ${branch}`);
  }

  /**
   * Get all cached branches
   */
  async getCachedBranches(): Promise<string[]> {
    return this.layeredIndex.getCachedBranches();
  }

  /**
   * Delete branch delta (cleanup)
   *
   * @param branch - Branch name
   */
  async deleteBranchDelta(branch: string): Promise<void> {
    await this.layeredIndex.deleteBranchDelta(branch);

    // Also delete vector delta if enabled
    if (this.layeredVectorStore) {
      await this.vectorCacheManager.deleteVectorDelta(branch);
    }
  }

  // =========================================================================
  // STATUS & STATISTICS
  // =========================================================================

  /**
   * Get index status
   */
  async getStatus(): Promise<IndexStatus> {
    const status: IndexStatus = {
      initialized: this.isInitialized,
      currentBranch: this.fileIntegration?.getCurrentBranch() || null,
      cachedBranches: await this.getCachedBranches(),
      totalEntities: this.layeredIndex.getTotalEntities(),
      maintenance: this.maintenanceService?.getStats() || null,
      queue: this.updateQueue.getStatus(),
    };

    return status;
  }

  /**
   * Get comprehensive status report
   */
  async getStatusReport(): Promise<any> {
    const report: any = {
      index: await this.getStatus(),
      cacheManager: this.cacheManager.getStatistics(),
    };

    if (this.layeredConfig.enableVectorDeltas) {
      report.vectorCacheManager = this.vectorCacheManager.getStatistics();
    }

    if (this.maintenanceService) {
      report.maintenance = await this.maintenanceService.getStatusReport();
    }

    return report;
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    console.error("[LayeredIndexManager] Shutting down...");

    // Stop maintenance
    if (this.maintenanceService) {
      this.maintenanceService.stop();
    }

    // Shutdown file integration
    if (this.fileIntegration) {
      await this.fileIntegration.shutdown();
    }

    // Shutdown update queue
    await this.updateQueue.shutdown();

    // Shutdown layered index
    await this.layeredIndex.shutdown();

    // Shutdown vector store
    if (this.layeredVectorStore) {
      await this.layeredVectorStore.shutdown();
    }

    // Close cache managers
    this.cacheManager.close();
    this.vectorCacheManager.close();

    console.error("[LayeredIndexManager] Shutdown complete");
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Select configuration preset based on file count
   */
  private selectConfigPreset(): LayeredIndexConfig {
    const fileCount = this.config.estimatedFileCount || 0;

    if (fileCount === 0) {
      // No estimate, use default
      return LayeredIndexConfigPresets.default(this.config.workingDirectory);
    } else if (fileCount < 10000) {
      // Small project
      return LayeredIndexConfigPresets.development(this.config.workingDirectory);
    } else if (fileCount < 50000) {
      // Medium project
      return LayeredIndexConfigPresets.production(this.config.workingDirectory);
    } else {
      // Large project (>50K files) - use vectorlite
      const config = LayeredIndexConfigPresets.server(this.config.workingDirectory);

      // Override vector backend to vectorlite
      // Note: This will be handled by VectorStore's adaptive backend

      return config;
    }
  }

  /**
   * Get config preset name (for logging)
   */
  private getConfigPresetName(): string {
    const fileCount = this.config.estimatedFileCount || 0;

    if (fileCount === 0) return "default";
    if (fileCount < 10000) return "development";
    if (fileCount < 50000) return "production";
    return "server (vectorlite)";
  }
}
