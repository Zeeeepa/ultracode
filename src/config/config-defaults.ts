/**
 * Default Configuration Values
 *
 * Default values for the YAML configuration system.
 * Extracted from yaml-config.ts for better modularity.
 */

import { SUPPORTED_CODE_EXTENSIONS } from "../agents/dev/file-extensions.js";
import type { AppConfig } from "./config-types.js";

// =============================================================================
// DEFAULT CONFIGURATION VALUES
// =============================================================================

export const DEFAULT_CONFIG: AppConfig = {
  mcp: {
    embedding: {
      model: "all-MiniLM-L6-v2",
      provider: "auto",
      enabled: false,
      useLayeredIndex: true, // Use layered FAISS index (base + delta) for branch switching
    },
    server: {
      host: "localhost",
      port: 3000,
      timeout: 30000,
    },
    agents: {
      // Allow more registered agents by default; conductor still reuses by type
      maxConcurrent: 12,
      defaultTimeout: 15000,
      useParser: true, // MCP_USE_PARSER: Enable ParserAgent by default
      devIndexBatch: 100, // MCP_DEV_INDEX_BATCH: Default batch size for indexing
    },
    semantic: {
      cacheWarmupLimit: 50,
      popularEntitiesTopic: "semantic:warmup:entities",
    },
  },
  database: {
    path: "", // Empty = use centralized storage (AppData/UltraCode/projects/<hash>/)
    mode: "WAL",
    cacheSize: 10000,
    mmapSize: 268435456, // 256MB
    synchronous: "NORMAL",
    tempStore: "MEMORY",
  },
  logging: {
    level: "info",
    format: "text",
    enableConsole: true,
    maxFileSize: "10MB",
    maxFiles: 5,
  },
  parser: {
    treeSitter: {
      enabled: true,
      languageConfigs: ["typescript", "javascript", "python", "c", "cpp"],
      maxFileSize: 1048576, // 1MB
      timeout: 5000,
      bufferSize: 1024 * 1024, // 1MB buffer
    },
    incremental: {
      enabled: true,
      cacheSize: 1000,
      cacheTTL: 300000, // 5 minutes
    },
    agent: {
      maxConcurrency: 8, // Increased for multi-pass
      memoryLimit: 1024, // 1GB for SWC + TS API
      priority: 8,
      batchSize: 50, // Increased - SWC handles large batches efficiently
      cacheSize: 209715200, // 200MB - more cache for multi-pass results
      workerPoolSize: 8, // Match CPU cores for parallel TS parsing
    },
  },
  indexer: {
    maxConcurrency: 2,
    memoryLimit: 512,
    priority: 7,
    batchSize: 1000,
    cacheSize: 52428800, // 50MB
    cacheTTL: 300000, // 5 minutes
  },
  indexing: {
    // branchAware removed - auto-detected via .git directory
    autoSwitchOnBranchChange: true,
    maxBranchesPerRepo: 10,
    maxTotalBranches: 50,
    evictionStrategy: "LRU",
    cleanupIntervalMs: 3600000, // 1 hour
    incrementalThreshold: 20, // If >20 files changed, do full reindex
    dataDir: "", // Empty = use centralized storage (AppData/UltraCode/projects/<hash>/branches/)
    autoIndex: false, // Disabled: tree-sitter parsing blocks UI 25+ sec. Use `index` command.
    autoIndexExtensions: [...SUPPORTED_CODE_EXTENSIONS],
  },
  git: {
    enabled: true, // Enabled by default for git repositories
    watchBranchChanges: true,
    watchUncommitted: true, // Watch uncommitted file changes
    uncommittedPollIntervalMs: 10000, // Check for uncommitted changes every 10 seconds
    includeUntracked: true, // Include new (untracked) files
    autoReindex: true,
    diffMode: "incremental",
    pollIntervalMs: 5000, // Check for commits every 5 seconds
  },
  devAgent: {
    maxConcurrency: 3,
    memoryLimit: 256,
    priority: 7,
  },
  doraAgent: {
    maxConcurrency: 2,
    memoryLimit: 128,
    priority: 6,
  },
  queryAgent: {
    maxConcurrency: 10,
    memoryLimit: 112,
    priority: 9,
    simpleQueryTimeout: 100,
    complexQueryTimeout: 1000,
    cacheWarmupSize: 100,
  },
  semanticAgent: {
    maxConcurrency: 5,
    memoryLimit: 240,
    priority: 8,
    batchSize: 8,
    modelPath: "./models",
  },
  coordinator: {
    maxConcurrency: 100,
    memoryLimit: 128,
    priority: 10,
    taskQueueLimit: 100,
    loadBalancingStrategy: "least-loaded",
    resourceConstraints: {
      maxMemoryMB: 1024,
      maxCpuPercent: 80,
      maxConcurrentAgents: 10,
      maxTaskQueueSize: 100,
    },
  },
  conductor: {
    maxConcurrency: 100,
    memoryLimit: 128,
    priority: 10,
    taskQueueLimit: 100,
    loadBalancingStrategy: "least-loaded",
    resourceConstraints: {
      maxMemoryMB: 1024,
      maxCpuPercent: 80,
      maxConcurrentAgents: 10,
      maxTaskQueueSize: 100,
    },
    complexityThreshold: 8,
    mandatoryDelegation: true,
  },
  environment: "development",
  debug: false,
};
