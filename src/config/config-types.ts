/**
 * Configuration Type Definitions
 *
 * Type definitions for the YAML configuration system.
 * Extracted from yaml-config.ts for better modularity.
 */

// =============================================================================
// MCP CONFIGURATION
// =============================================================================

export interface MCPConfig {
  embedding?: {
    model?: string | undefined;
    provider?: "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "ovms" | "auto";
    apiKey?: string | undefined;
    enabled?: boolean | undefined;

    // Two-stage retrieval with reranker
    useReranker?: boolean;
    rerankerModel?: string;
    rerankerTopK?: number;
    rerankerFinalK?: number;

    // Language hint for optimization
    queryLanguage?: "english" | "multilingual";

    // Two-phase mode: dump embeddings to disk, then insert to DB
    // Improves stability by separating CPU-intensive embedding from DB writes
    twoPhaseMode?: boolean;

    // Provider-specific configurations
    ollama?: {
      baseUrl?: string | undefined;
      timeout?: number | undefined;
      timeoutMs?: number | undefined;
      concurrency?: number | undefined;
      headers?: Record<string, string>;
      autoPull?: boolean;
      warmupText?: string;
      checkServer?: boolean;
      pullTimeoutMs?: number;
    };
    openai?: {
      baseUrl?: string | undefined;
      apiKey?: string | undefined;
      timeout?: number | undefined;
      timeoutMs?: number | undefined;
      concurrency?: number | undefined;
      maxBatchSize?: number | undefined;
    };
    cloudru?: {
      baseUrl?: string | undefined;
      apiKey?: string | undefined;
      timeout?: number | undefined;
      timeoutMs?: number | undefined;
      concurrency?: number | undefined;
      maxBatchSize?: number | undefined;
    };
    huggingface?: {
      apiKey?: string | undefined;
      baseUrl?: string | undefined;
      timeout?: number | undefined;
      timeoutMs?: number | undefined;
      concurrency?: number | undefined;
      warmupText?: string;
    };
    tei?: {
      baseUrl?: string | undefined;
      timeoutMs?: number | undefined;
      concurrency?: number | undefined;
      checkServer?: boolean;
    };
  };
  server?: { host?: string | undefined; port?: number | undefined; timeout?: number };
  agents?: {
    maxConcurrent?: number | undefined;
    defaultTimeout?: number | undefined;
    useParser?: boolean; // MCP_USE_PARSER
    devIndexBatch?: number; // MCP_DEV_INDEX_BATCH
  };
  semantic?: {
    cacheWarmupLimit?: number | undefined;
    popularEntitiesTopic?: string | undefined;
  };
  autodoc?: {
    /** Enable AutoDoc watcher for automatic documentation updates */
    watcherEnabled?: boolean;
    /** Debounce delay in milliseconds (default: 45000) */
    debounceMs?: number;
    /** Minimum debounce delay in milliseconds (default: 30000) */
    minDebounceMs?: number;
    /** Maximum debounce delay in milliseconds (default: 60000) */
    maxDebounceMs?: number;
    /** Use LLM for description generation */
    useLlm?: boolean | undefined;
    /** LLM configuration for AutoDoc */
    llmConfig?: {
      provider: "ollama" | "openai" | "tgi";
      model?: string | undefined;
      endpoint?: string;
    };
  };
}

// =============================================================================
// EMBEDDING CONFIGURATION
// =============================================================================

// Resolved embedding configuration returned to callers
export interface EmbeddingConfigResolved {
  model: string;
  provider: "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "ovms" | "auto" | string;
  apiKey: string;
  enabled: boolean;

  // Two-stage retrieval with reranker
  useReranker: boolean;
  rerankerModel: string;
  rerankerTopK: number;
  rerankerFinalK: number;

  // Language hint for optimization
  queryLanguage: "english" | "multilingual";

  // Two-phase mode: dump embeddings to disk, then insert to DB
  // Improves stability by separating CPU-intensive embedding from DB writes
  twoPhaseMode: boolean;

  // Provider-specific configurations
  ollama?: {
    baseUrl?: string | undefined;
    timeout?: number | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    headers?: Record<string, string>;
    autoPull?: boolean;
    warmupText?: string;
    checkServer?: boolean;
    pullTimeoutMs?: number;
  };
  openai?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    timeout?: number | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
  };
  cloudru?: {
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    timeout?: number | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    maxBatchSize?: number | undefined;
  };
  huggingface?: {
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    timeout?: number | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    warmupText?: string;
  };
  tei?: {
    baseUrl?: string | undefined;
    timeoutMs?: number | undefined;
    concurrency?: number | undefined;
    checkServer?: boolean;
  };
}

// =============================================================================
// DATABASE AND LOGGING CONFIGURATION
// =============================================================================

export interface DatabaseConfig {
  path?: string | undefined;
  mode?: "WAL" | "DELETE" | "TRUNCATE";
  cacheSize?: number | undefined;
  mmapSize?: number;
  synchronous?: "OFF" | "NORMAL" | "FULL";
  tempStore?: "DEFAULT" | "FILE" | "MEMORY";
}

export interface LoggingConfig {
  level?: "debug" | "info" | "warn" | "error";
  format?: "json" | "text";
  outputFile?: string | undefined;
  maxFileSize?: string | undefined;
  maxFiles?: number;
  enableConsole?: boolean;
}

// =============================================================================
// PARSER AND INDEXER CONFIGURATION
// =============================================================================

export interface ParserConfig {
  treeSitter?: {
    enabled?: boolean | undefined;
    languageConfigs?: string[];
    maxFileSize?: number | undefined;
    timeout?: number | undefined;
    bufferSize?: number;
  };
  incremental?: { enabled?: boolean | undefined; cacheSize?: number | undefined; cacheTTL?: number };
  agent?: {
    maxConcurrency?: number | undefined;
    memoryLimit?: number | undefined;
    priority?: number;
    batchSize?: number | undefined;
    cacheSize?: number | undefined;
    workerPoolSize?: number;
  };
}

export interface IndexerConfig {
  maxConcurrency?: number | undefined;
  memoryLimit?: number | undefined;
  priority?: number;
  batchSize?: number | undefined;
  cacheSize?: number | undefined;
  cacheTTL?: number;
}

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

export interface AgentRuntimeConfig {
  maxConcurrency?: number | undefined;
  memoryLimit?: number | undefined;
  priority?: number;
}

export type DevAgentConfig = AgentRuntimeConfig;
export type DoraAgentConfig = AgentRuntimeConfig;

export interface QueryAgentConfig extends AgentRuntimeConfig {
  simpleQueryTimeout?: number | undefined;
  complexQueryTimeout?: number | undefined;
  cacheWarmupSize?: number;
}

export interface SemanticAgentConfig extends AgentRuntimeConfig {
  queueBatchSize?: number;
  batchSize?: number | undefined;
  modelPath?: string | undefined;
}

export interface AgentResourceConstraints {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxConcurrentAgents: number;
  maxTaskQueueSize: number;
}

export interface CoordinatorConfig extends AgentRuntimeConfig {
  taskQueueLimit?: number | undefined;
  loadBalancingStrategy?: "round-robin" | "least-loaded" | "priority";
  resourceConstraints: AgentResourceConstraints;
}

export interface ConductorConfig extends CoordinatorConfig {
  complexityThreshold?: number | undefined;
  mandatoryDelegation?: boolean | undefined;
}

// =============================================================================
// INDEXING AND GIT CONFIGURATION
// =============================================================================

export interface IndexingConfig {
  // branchAware removed - auto-detected via .git directory
  autoSwitchOnBranchChange?: boolean | undefined;
  maxBranchesPerRepo?: number;
  maxTotalBranches?: number;
  evictionStrategy?: "LRU" | "LFU" | "FIFO";
  cleanupIntervalMs?: number;
  incrementalThreshold?: number;
  dataDir?: string;
  /** Auto-index on startup if supported files detected (default: true) */
  autoIndex?: boolean;
  /** Supported file extensions for auto-index detection */
  autoIndexExtensions?: string[];
}

export interface GitConfig {
  enabled?: boolean | undefined;
  watchBranchChanges?: boolean | undefined;
  /** Watch uncommitted file changes via git status polling (default: true) */
  watchUncommitted?: boolean;
  /** Interval for uncommitted changes polling in ms (default: 10000) */
  uncommittedPollIntervalMs?: number;
  /** Include untracked (new) files in uncommitted watch (default: true) */
  includeUntracked?: boolean;
  autoReindex?: boolean;
  diffMode?: "incremental" | "full";
  pollIntervalMs?: number;
  /** Debounce delay for embedding generation in ms (default: 60000 = 1 min) */
  debounceMs?: number;
  /** Threshold for bulk mode (drop/rebuild index). Files > threshold = bulk mode (default: 1000) */
  bulkModeThreshold?: number;
}

// =============================================================================
// VECTOR BACKEND CONFIGURATION
// =============================================================================

export interface VectorBackendConfig {
  libsql?: {
    metric?: "cosine" | "l2";
    compression?: "float8" | "float16" | "float32";
    searchL?: number | undefined;
    insertL?: number | undefined;
  };
}

// =============================================================================
// MAIN APPLICATION CONFIGURATION
// =============================================================================

export interface AppConfig {
  mcp: MCPConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
  parser: ParserConfig;
  indexer: IndexerConfig;
  indexing: IndexingConfig;
  git: GitConfig;
  vectorBackend?: VectorBackendConfig;
  devAgent: DevAgentConfig;
  doraAgent: DoraAgentConfig;
  queryAgent: QueryAgentConfig;
  semanticAgent: SemanticAgentConfig;
  coordinator: CoordinatorConfig;
  conductor: ConductorConfig;
  environment: string;
  debug: boolean;
}
