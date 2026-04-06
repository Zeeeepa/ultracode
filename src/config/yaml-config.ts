/**
 * TASK-001: YAML Configuration System
 *
 * Centralized configuration management with YAML files and environment
 * fallbacks. Provides runtime validation and graceful degradation for missing
 * dependencies.
 *
 * Architecture Decision Record: ADR-001
 * Part of Method 3: Hybrid Targeted Fix with YAML Foundation
 */

import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { log } from "../logging/index.js";
import { existsSync, readTextSync } from "../utils/file-ops.js";

// =============================================================================
// IMPORTS FROM EXTRACTED MODULES
// =============================================================================

import { DEFAULT_CONFIG } from "./config-defaults.js";

// =============================================================================
// TYPE-SAFE ENV PARSING HELPERS
// =============================================================================

/** Generic enum-like string validator */
function parseOneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

const EMBEDDING_PROVIDERS = ["ollama", "openai", "cloudru", "huggingface", "tei", "ovms", "auto"] as const;
const DATABASE_MODES = ["WAL", "DELETE", "TRUNCATE"] as const;
const SYNC_LEVELS = ["OFF", "NORMAL", "FULL"] as const;
const TEMP_STORES = ["DEFAULT", "FILE", "MEMORY"] as const;
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const LB_STRATEGIES = ["round-robin", "least-loaded", "priority"] as const;

function parseEmbeddingProvider(
  value: string | undefined,
): "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "ovms" | "auto" | undefined {
  return parseOneOf(value, EMBEDDING_PROVIDERS);
}

function parseDatabaseMode(value: string | undefined): "WAL" | "DELETE" | "TRUNCATE" | undefined {
  return parseOneOf(value, DATABASE_MODES);
}

function parseSynchronousLevel(value: string | undefined): "OFF" | "NORMAL" | "FULL" | undefined {
  return parseOneOf(value, SYNC_LEVELS);
}

function parseTempStore(value: string | undefined): "DEFAULT" | "FILE" | "MEMORY" | undefined {
  return parseOneOf(value, TEMP_STORES);
}

function parseLogLevel(value: string | undefined): "debug" | "info" | "warn" | "error" | undefined {
  return parseOneOf(value, LOG_LEVELS);
}

function parseLogFormat(value: string | undefined): "json" | "text" | undefined {
  if (!value) return undefined;
  return value === "json" || value === "text" ? value : undefined;
}

function parseLoadBalancingStrategy(
  value: string | undefined,
): "round-robin" | "least-loaded" | "priority" | undefined {
  return parseOneOf(value, LB_STRATEGIES);
}

// Re-export types for backward compatibility
export type {
  AgentResourceConstraints,
  AgentRuntimeConfig,
  AppConfig,
  ConductorConfig,
  CoordinatorConfig,
  DatabaseConfig,
  DevAgentConfig,
  DoraAgentConfig,
  EmbeddingConfigResolved,
  GitConfig,
  IndexerConfig,
  IndexingConfig,
  LoggingConfig,
  MCPConfig,
  ParserConfig,
  QueryAgentConfig,
  SemanticAgentConfig,
  VectorBackendConfig,
} from "./config-types.js";

import type {
  AppConfig,
  DatabaseConfig,
  EmbeddingConfigResolved,
  LoggingConfig,
  MCPConfig,
  ParserConfig,
} from "./config-types.js";

// =============================================================================
// HELPER: resolve value from yaml -> env -> default with coercion
// =============================================================================

/** Boolean-aware pick: yaml first, then env (with "true"/"false" parsing), then fallback */
function pickBool(yamlVal: boolean | undefined, envName: string, fallback: boolean | undefined): boolean | undefined {
  if (yamlVal !== undefined) return yamlVal;
  const envVal = process.env[envName];
  if (envVal === "true") return true;
  if (envVal === "false") return false;
  return fallback;
}

/** Number-aware pick */
function pickNum(yamlVal: number | undefined, envName: string, fallback: number | undefined): number | undefined {
  if (yamlVal !== undefined) return yamlVal;
  const raw = process.env[envName];
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

/** String-aware pick */
function pickStr(yamlVal: string | undefined, envName: string, fallback: string | undefined): string | undefined {
  if (yamlVal !== undefined && yamlVal !== "") return yamlVal;
  const raw = process.env[envName];
  if (raw !== undefined && raw !== "") return raw;
  return fallback;
}

// =============================================================================
// CONFIGURATION LOADER CLASS
// =============================================================================

export class ConfigLoader {
  private static instance: ConfigLoader;
  private static overridePath: string | undefined;
  /** Guard against reentrant getInstance during constructor (sync-safe). */
  private static creating = false;
  private config: AppConfig;
  private configPath: string;

  private constructor() {
    this.configPath = this.resolveConfigPath();
    this.config = this.loadConfiguration();
  }

  /**
   * Get singleton instance.
   * Thread-safe for single-threaded JS: all I/O is synchronous,
   * so no async interleaving is possible during construction.
   */
  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      if (ConfigLoader.creating) {
        throw new Error("ConfigLoader: reentrant getInstance() during construction");
      }
      ConfigLoader.creating = true;
      try {
        ConfigLoader.instance = new ConfigLoader();
      } finally {
        ConfigLoader.creating = false;
      }
    }
    return ConfigLoader.instance;
  }

  /**
   * Set override config path and reload if instance exists.
   * Sync-safe: both resolveConfigPath() and loadConfiguration() use sync I/O.
   */
  public static setOverridePath(path?: string): void {
    ConfigLoader.overridePath = path ? resolve(process.cwd(), path) : undefined;
    if (ConfigLoader.instance) {
      ConfigLoader.instance.configPath = ConfigLoader.instance.resolveConfigPath();
      ConfigLoader.instance.reload();
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Reload configuration from files
   */
  public reload(): void {
    this.config = this.loadConfiguration();
  }

  /**
   * Get specific configuration section
   */
  public getMCPConfig(): MCPConfig {
    return this.config.mcp;
  }

  public getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  public getLoggingConfig(): LoggingConfig {
    return this.config.logging;
  }

  public getParserConfig(): ParserConfig {
    return this.config.parser;
  }

  /**
   * Get agent-specific configuration
   */
  public getAgentsConfig() {
    return this.config.mcp.agents || {};
  }

  /**
   * Check if ParserAgent should be used
   */
  public shouldUseParser(): boolean {
    return this.config.mcp.agents?.useParser ?? true;
  }

  /**
   * Get dev index batch size
   */
  public getDevIndexBatchSize(): number {
    return this.config.mcp.agents?.devIndexBatch ?? 100;
  }

  /**
   * Check if embedding model is available
   */
  public isEmbeddingEnabled(): boolean {
    return this.config.mcp.embedding?.enabled === true;
  }

  /**
   * Get embedding configuration with fallback
   */
  public getEmbeddingConfig(): EmbeddingConfigResolved {
    const ec = this.config.mcp.embedding || {};
    return {
      model: ec.model || "all-MiniLM-L6-v2",
      provider: parseEmbeddingProvider(ec.provider) || "auto",
      apiKey: ec.apiKey || "",
      enabled: ec.enabled || false,

      // Two-stage retrieval with reranker
      useReranker: ec.useReranker || false,
      rerankerModel: ec.rerankerModel || "granite-embedding-reranker-english-r2",
      rerankerTopK: ec.rerankerTopK || 100,
      rerankerFinalK: ec.rerankerFinalK || 10,

      // Language hint for optimization
      queryLanguage: ec.queryLanguage || "english",

      // Two-phase mode for Bun compatibility
      twoPhaseMode: ec.twoPhaseMode ?? false,

      // Layered FAISS index (base + delta)
      useLayeredIndex: ec.useLayeredIndex ?? true,

      // Provider-specific configurations
      ollama: ec.ollama || undefined,
      openai: ec.openai || undefined,
      cloudru: ec.cloudru || undefined,
      huggingface: ec.huggingface || undefined,
      tei: ec.tei || undefined,
    };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Resolve configuration file path based on environment
   */
  private resolveConfigPath(): string {
    if (ConfigLoader.overridePath) {
      if (!existsSync(ConfigLoader.overridePath)) {
        log.e("CONFIG", "override_not_found", { path: ConfigLoader.overridePath });
        process.exit(1);
      }
      return ConfigLoader.overridePath;
    }

    const env = process.env.NODE_ENV || "development";
    const configDir = resolve(process.cwd(), "config");

    // Try environment-specific config first, then default
    for (const candidate of [`${env}.yaml`, "default.yaml"]) {
      const candidatePath = join(configDir, candidate);
      if (existsSync(candidatePath)) return candidatePath;
    }

    // No config file found - will use defaults with env variables
    return "";
  }

  /**
   * Load configuration from YAML file with environment variable fallbacks
   */
  private loadConfiguration(): AppConfig {
    let yamlConfig: Partial<AppConfig> = {};

    // Load YAML configuration if file exists
    if (this.configPath && existsSync(this.configPath)) {
      try {
        const rawText = readTextSync(this.configPath);
        yamlConfig = parseYaml(rawText) || {};
        log.i("CONFIG", "loaded", { path: this.configPath });
      } catch (err) {
        log.w("CONFIG", "yaml_load_fail", { err: err instanceof Error ? err.message : String(err) });
        log.w("CONFIG", "fallback_env");
      }
    } else {
      log.i("CONFIG", "no_yaml_found");
    }

    // Merge with defaults and environment variables
    return this.assembleConfig(yamlConfig);
  }

  /**
   * Build the embedding section of config using a layered approach
   */
  private buildEmbeddingConfig(yaml: Partial<AppConfig>) {
    const yEmb = yaml.mcp?.embedding;
    const dEmb = DEFAULT_CONFIG.mcp.embedding;

    return {
      model: pickStr(yEmb?.model, "MCP_EMBEDDING_MODEL", dEmb?.model),
      provider:
        parseEmbeddingProvider(yEmb?.provider) ||
        parseEmbeddingProvider(process.env["MCP_EMBEDDING_PROVIDER"]) ||
        dEmb?.provider ||
        "auto",
      apiKey: pickStr(yEmb?.apiKey, "MCP_EMBEDDING_API_KEY", dEmb?.apiKey),
      enabled: pickBool(yEmb?.enabled, "MCP_EMBEDDING_ENABLED", dEmb?.enabled),
      ollama: yEmb?.ollama || {
        baseUrl: process.env["OLLAMA_BASE_URL"] || undefined,
        timeout: pickNum(undefined, "OLLAMA_TIMEOUT_MS", undefined),
        timeoutMs: pickNum(undefined, "OLLAMA_TIMEOUT_MS", undefined),
        concurrency: pickNum(undefined, "OLLAMA_CONCURRENCY", undefined),
        headers: undefined,
        autoPull: process.env["OLLAMA_AUTO_PULL"] !== "false",
        warmupText: process.env["OLLAMA_WARMUP_TEXT"] || undefined,
        checkServer: process.env["OLLAMA_CHECK_SERVER"] !== "false",
        pullTimeoutMs: pickNum(undefined, "OLLAMA_PULL_TIMEOUT_MS", undefined),
      },
      openai: yEmb?.openai || {
        baseUrl: process.env["OPENAI_BASE_URL"] || undefined,
        apiKey: process.env["OPENAI_API_KEY"] || undefined,
        timeout: pickNum(undefined, "OPENAI_TIMEOUT_MS", undefined),
        timeoutMs: pickNum(undefined, "OPENAI_TIMEOUT_MS", undefined),
        concurrency: pickNum(undefined, "OPENAI_CONCURRENCY", undefined),
        maxBatchSize: pickNum(undefined, "OPENAI_MAX_BATCH_SIZE", undefined),
      },
      cloudru: yEmb?.cloudru || {
        baseUrl: process.env["CLOUDRU_BASE_URL"] || undefined,
        apiKey: process.env["CLOUDRU_API_KEY"] || undefined,
        timeout: pickNum(undefined, "CLOUDRU_TIMEOUT_MS", undefined),
        timeoutMs: pickNum(undefined, "CLOUDRU_TIMEOUT_MS", undefined),
        concurrency: pickNum(undefined, "CLOUDRU_CONCURRENCY", undefined),
        maxBatchSize: pickNum(undefined, "CLOUDRU_MAX_BATCH_SIZE", undefined),
      },
      huggingface: yEmb?.huggingface || {
        apiKey: process.env["HUGGINGFACE_API_KEY"] || undefined,
        baseUrl: process.env["HUGGINGFACE_BASE_URL"] || undefined,
        timeout: pickNum(undefined, "HUGGINGFACE_TIMEOUT_MS", undefined),
        timeoutMs: pickNum(undefined, "HUGGINGFACE_TIMEOUT_MS", undefined),
        concurrency: pickNum(undefined, "HUGGINGFACE_CONCURRENCY", undefined),
        warmupText: process.env["HUGGINGFACE_WARMUP_TEXT"] || undefined,
      },
      tei: yEmb?.tei || {
        baseUrl: process.env["TEI_BASE_URL"] || undefined,
        timeoutMs: pickNum(undefined, "TEI_TIMEOUT_MS", undefined),
        concurrency: pickNum(undefined, "TEI_CONCURRENCY", undefined),
        checkServer: process.env["TEI_CHECK_SERVER"] !== "false",
      },
      // Batching: controls request pressure during indexing
      queueBatchSize: pickNum(yEmb?.queueBatchSize, "MCP_EMBEDDING_QUEUE_BATCH_SIZE", undefined),
      parallelBatches: pickNum(yEmb?.parallelBatches, "MCP_EMBEDDING_PARALLEL_BATCHES", undefined),
      // Two-phase mode for stability (separate embedding from DB writes)
      twoPhaseMode: pickBool(yEmb?.twoPhaseMode, "MCP_EMBEDDING_TWO_PHASE", false),
      // Layered FAISS index (base + delta) - enabled by default
      useLayeredIndex:
        yEmb?.useLayeredIndex !== undefined ? yEmb.useLayeredIndex : process.env["MCP_FAISS_LAYERED"] !== "false",
    };
  }

  /**
   * Build resource constraints block for coordinator/conductor
   */
  private buildResourceConstraints(
    yaml:
      | { maxMemoryMB?: number; maxCpuPercent?: number; maxConcurrentAgents?: number; maxTaskQueueSize?: number }
      | undefined,
    envPrefix: string,
    fallbackMaxConcurrent: number | undefined,
    defaults:
      | { maxMemoryMB?: number; maxCpuPercent?: number; maxConcurrentAgents?: number; maxTaskQueueSize?: number }
      | undefined,
  ) {
    return {
      maxMemoryMB: pickNum(yaml?.maxMemoryMB, `${envPrefix}_MAX_MEMORY_MB`, defaults?.maxMemoryMB) ?? 0,
      maxCpuPercent: pickNum(yaml?.maxCpuPercent, `${envPrefix}_MAX_CPU_PERCENT`, defaults?.maxCpuPercent) ?? 0,
      maxConcurrentAgents:
        pickNum(yaml?.maxConcurrentAgents, `${envPrefix}_MAX_CONCURRENT_AGENTS`, undefined) ||
        fallbackMaxConcurrent ||
        defaults?.maxConcurrentAgents ||
        0,
      maxTaskQueueSize:
        pickNum(yaml?.maxTaskQueueSize, `${envPrefix}_MAX_TASK_QUEUE_SIZE`, defaults?.maxTaskQueueSize) ?? 0,
    };
  }

  /**
   * Assemble final config by merging YAML, env vars, and defaults
   */
  private assembleConfig(yaml: Partial<AppConfig>): AppConfig {
    const d = DEFAULT_CONFIG;

    // Shared fallback for maxConcurrentAgents
    const sharedMaxConcurrent =
      yaml.mcp?.agents?.maxConcurrent || Number(process.env["MCP_MAX_CONCURRENT_AGENTS"]) || undefined;

    const config: AppConfig = {
      mcp: {
        embedding: this.buildEmbeddingConfig(yaml),
        server: {
          host: pickStr(yaml.mcp?.server?.host, "MCP_SERVER_HOST", d.mcp.server?.host),
          port: pickNum(yaml.mcp?.server?.port, "MCP_SERVER_PORT", d.mcp.server?.port),
          timeout: pickNum(yaml.mcp?.server?.timeout, "MCP_SERVER_TIMEOUT", d.mcp.server?.timeout),
        },
        agents: {
          maxConcurrent: pickNum(
            yaml.mcp?.agents?.maxConcurrent,
            "MCP_MAX_CONCURRENT_AGENTS",
            d.mcp.agents?.maxConcurrent,
          ),
          defaultTimeout: pickNum(yaml.mcp?.agents?.defaultTimeout, "MCP_AGENT_TIMEOUT", d.mcp.agents?.defaultTimeout),
          useParser:
            yaml.mcp?.agents?.useParser !== undefined
              ? yaml.mcp.agents.useParser
              : process.env["MCP_USE_PARSER"] !== "0" || d.mcp.agents?.useParser,
          devIndexBatch: pickNum(yaml.mcp?.agents?.devIndexBatch, "MCP_DEV_INDEX_BATCH", d.mcp.agents?.devIndexBatch),
        },
        semantic: {
          cacheWarmupLimit: pickNum(
            yaml.mcp?.semantic?.cacheWarmupLimit,
            "MCP_SEMANTIC_WARMUP_LIMIT",
            d.mcp.semantic?.cacheWarmupLimit,
          ),
          popularEntitiesTopic: pickStr(
            yaml.mcp?.semantic?.popularEntitiesTopic,
            "MCP_SEMANTIC_WARMUP_TOPIC",
            d.mcp.semantic?.popularEntitiesTopic,
          ),
        },
      },
      database: {
        path: pickStr(yaml.database?.path, "DATABASE_PATH", d.database?.path),
        mode:
          parseDatabaseMode(yaml.database?.mode) || parseDatabaseMode(process.env["DATABASE_MODE"]) || d.database?.mode,
        cacheSize: pickNum(yaml.database?.cacheSize, "DATABASE_CACHE_SIZE", d.database?.cacheSize),
        mmapSize: pickNum(yaml.database?.mmapSize, "DATABASE_MMAP_SIZE", d.database?.mmapSize),
        synchronous:
          parseSynchronousLevel(yaml.database?.synchronous) ||
          parseSynchronousLevel(process.env["DATABASE_SYNCHRONOUS"]) ||
          d.database?.synchronous,
        tempStore:
          parseTempStore(yaml.database?.tempStore) ||
          parseTempStore(process.env["DATABASE_TEMP_STORE"]) ||
          d.database?.tempStore,
      },
      logging: {
        level: parseLogLevel(yaml.logging?.level) || parseLogLevel(process.env["LOG_LEVEL"]) || d.logging?.level,
        format: parseLogFormat(yaml.logging?.format) || parseLogFormat(process.env["LOG_FORMAT"]) || d.logging?.format,
        outputFile: pickStr(yaml.logging?.outputFile, "LOG_FILE", d.logging?.outputFile),
        maxFileSize: yaml.logging?.maxFileSize || process.env["LOG_MAX_FILE_SIZE"] || d.logging?.maxFileSize,
        maxFiles: pickNum(yaml.logging?.maxFiles, "LOG_MAX_FILES", d.logging?.maxFiles),
        enableConsole: pickBool(yaml.logging?.enableConsole, "LOG_ENABLE_CONSOLE", d.logging?.enableConsole),
      },
      parser: {
        treeSitter: {
          enabled: pickBool(
            yaml.parser?.treeSitter?.enabled,
            "PARSER_TREE_SITTER_ENABLED",
            d.parser.treeSitter?.enabled,
          ),
          languageConfigs:
            yaml.parser?.treeSitter?.languageConfigs ||
            process.env["PARSER_LANGUAGES"]?.split(",") ||
            d.parser.treeSitter?.languageConfigs,
          maxFileSize: pickNum(
            yaml.parser?.treeSitter?.maxFileSize,
            "PARSER_MAX_FILE_SIZE",
            d.parser.treeSitter?.maxFileSize,
          ),
          timeout: pickNum(yaml.parser?.treeSitter?.timeout, "PARSER_TIMEOUT", d.parser.treeSitter?.timeout),
          bufferSize: pickNum(
            yaml.parser?.treeSitter?.bufferSize,
            "PARSER_BUFFER_SIZE",
            d.parser.treeSitter?.bufferSize,
          ),
        },
        incremental: {
          enabled: pickBool(
            yaml.parser?.incremental?.enabled,
            "PARSER_INCREMENTAL_ENABLED",
            d.parser.incremental?.enabled,
          ),
          cacheSize: pickNum(yaml.parser?.incremental?.cacheSize, "PARSER_CACHE_SIZE", d.parser.incremental?.cacheSize),
          cacheTTL: pickNum(yaml.parser?.incremental?.cacheTTL, "PARSER_CACHE_TTL", d.parser.incremental?.cacheTTL),
        },
        agent: {
          maxConcurrency: pickNum(
            yaml.parser?.agent?.maxConcurrency,
            "PARSER_AGENT_MAX_CONCURRENCY",
            d.parser.agent?.maxConcurrency,
          ),
          memoryLimit: pickNum(
            yaml.parser?.agent?.memoryLimit,
            "PARSER_AGENT_MEMORY_LIMIT",
            d.parser.agent?.memoryLimit,
          ),
          priority: pickNum(yaml.parser?.agent?.priority, "PARSER_AGENT_PRIORITY", d.parser.agent?.priority),
          batchSize: pickNum(yaml.parser?.agent?.batchSize, "PARSER_AGENT_BATCH_SIZE", d.parser.agent?.batchSize),
          cacheSize: pickNum(yaml.parser?.agent?.cacheSize, "PARSER_AGENT_CACHE_SIZE", d.parser.agent?.cacheSize),
          workerPoolSize: pickNum(
            yaml.parser?.agent?.workerPoolSize,
            "PARSER_AGENT_WORKER_POOL_SIZE",
            d.parser.agent?.workerPoolSize,
          ),
        },
      },
      indexer: {
        maxConcurrency: pickNum(
          yaml.indexer?.maxConcurrency,
          "INDEXER_AGENT_MAX_CONCURRENCY",
          d.indexer?.maxConcurrency,
        ),
        memoryLimit: pickNum(yaml.indexer?.memoryLimit, "INDEXER_AGENT_MEMORY_LIMIT", d.indexer?.memoryLimit),
        priority: pickNum(yaml.indexer?.priority, "INDEXER_AGENT_PRIORITY", d.indexer?.priority),
        batchSize: pickNum(yaml.indexer?.batchSize, "INDEXER_AGENT_BATCH_SIZE", d.indexer?.batchSize),
        cacheSize: pickNum(yaml.indexer?.cacheSize, "INDEXER_AGENT_CACHE_SIZE", d.indexer?.cacheSize),
        cacheTTL: pickNum(yaml.indexer?.cacheTTL, "INDEXER_AGENT_CACHE_TTL", d.indexer?.cacheTTL),
      },
      indexing: {
        autoSwitchOnBranchChange: pickBool(
          yaml.indexing?.autoSwitchOnBranchChange,
          "INDEXING_AUTO_SWITCH",
          d.indexing.autoSwitchOnBranchChange,
        ),
        maxBranchesPerRepo: pickNum(
          yaml.indexing?.maxBranchesPerRepo,
          "INDEXING_MAX_BRANCHES_PER_REPO",
          d.indexing.maxBranchesPerRepo,
        ),
        maxTotalBranches: pickNum(
          yaml.indexing?.maxTotalBranches,
          "INDEXING_MAX_TOTAL_BRANCHES",
          d.indexing.maxTotalBranches,
        ),
        evictionStrategy: (yaml.indexing?.evictionStrategy as "LRU" | "LFU" | "FIFO") || d.indexing.evictionStrategy,
        cleanupIntervalMs: pickNum(
          yaml.indexing?.cleanupIntervalMs,
          "INDEXING_CLEANUP_INTERVAL_MS",
          d.indexing.cleanupIntervalMs,
        ),
        incrementalThreshold: pickNum(
          yaml.indexing?.incrementalThreshold,
          "INDEXING_INCREMENTAL_THRESHOLD",
          d.indexing.incrementalThreshold,
        ),
        dataDir: pickStr(yaml.indexing?.dataDir, "INDEXING_DATA_DIR", d.indexing.dataDir),
      },
      git: {
        enabled: pickBool(yaml.git?.enabled, "GIT_ENABLED", d.git.enabled),
        watchBranchChanges: pickBool(
          yaml.git?.watchBranchChanges,
          "GIT_WATCH_BRANCH_CHANGES",
          d.git.watchBranchChanges,
        ),
        watchUncommitted: pickBool(yaml.git?.watchUncommitted, "GIT_WATCH_UNCOMMITTED", d.git.watchUncommitted),
        uncommittedPollIntervalMs: pickNum(
          yaml.git?.uncommittedPollIntervalMs,
          "GIT_UNCOMMITTED_POLL_INTERVAL_MS",
          d.git.uncommittedPollIntervalMs,
        ),
        includeUntracked: pickBool(yaml.git?.includeUntracked, "GIT_INCLUDE_UNTRACKED", d.git.includeUntracked),
        autoReindex: pickBool(yaml.git?.autoReindex, "GIT_AUTO_REINDEX", d.git.autoReindex),
        diffMode: (yaml.git?.diffMode as "incremental" | "full") || d.git.diffMode,
        pollIntervalMs: pickNum(yaml.git?.pollIntervalMs, "GIT_POLL_INTERVAL_MS", d.git.pollIntervalMs),
      },
      devAgent: {
        maxConcurrency: pickNum(yaml.devAgent?.maxConcurrency, "DEV_AGENT_MAX_CONCURRENCY", d.devAgent.maxConcurrency),
        memoryLimit: pickNum(yaml.devAgent?.memoryLimit, "DEV_AGENT_MEMORY_LIMIT", d.devAgent.memoryLimit),
        priority: pickNum(yaml.devAgent?.priority, "DEV_AGENT_PRIORITY", d.devAgent.priority),
      },
      doraAgent: {
        maxConcurrency: pickNum(
          yaml.doraAgent?.maxConcurrency,
          "DORA_AGENT_MAX_CONCURRENCY",
          d.doraAgent.maxConcurrency,
        ),
        memoryLimit: pickNum(yaml.doraAgent?.memoryLimit, "DORA_AGENT_MEMORY_LIMIT", d.doraAgent.memoryLimit),
        priority: pickNum(yaml.doraAgent?.priority, "DORA_AGENT_PRIORITY", d.doraAgent.priority),
      },
      queryAgent: {
        maxConcurrency: pickNum(
          yaml.queryAgent?.maxConcurrency,
          "QUERY_AGENT_MAX_CONCURRENCY",
          d.queryAgent.maxConcurrency,
        ),
        memoryLimit: pickNum(yaml.queryAgent?.memoryLimit, "QUERY_AGENT_MEMORY_LIMIT", d.queryAgent.memoryLimit),
        priority: pickNum(yaml.queryAgent?.priority, "QUERY_AGENT_PRIORITY", d.queryAgent.priority),
        simpleQueryTimeout: pickNum(
          yaml.queryAgent?.simpleQueryTimeout,
          "QUERY_AGENT_SIMPLE_TIMEOUT",
          d.queryAgent.simpleQueryTimeout,
        ),
        complexQueryTimeout: pickNum(
          yaml.queryAgent?.complexQueryTimeout,
          "QUERY_AGENT_COMPLEX_TIMEOUT",
          d.queryAgent.complexQueryTimeout,
        ),
        cacheWarmupSize: pickNum(
          yaml.queryAgent?.cacheWarmupSize,
          "QUERY_AGENT_CACHE_WARMUP",
          d.queryAgent.cacheWarmupSize,
        ),
      },
      semanticAgent: {
        maxConcurrency: pickNum(
          yaml.semanticAgent?.maxConcurrency,
          "SEMANTIC_AGENT_MAX_CONCURRENCY",
          d.semanticAgent.maxConcurrency,
        ),
        memoryLimit: pickNum(
          yaml.semanticAgent?.memoryLimit,
          "SEMANTIC_AGENT_MEMORY_LIMIT",
          d.semanticAgent.memoryLimit,
        ),
        priority: pickNum(yaml.semanticAgent?.priority, "SEMANTIC_AGENT_PRIORITY", d.semanticAgent.priority),
        batchSize: pickNum(yaml.semanticAgent?.batchSize, "SEMANTIC_AGENT_BATCH_SIZE", d.semanticAgent.batchSize),
        modelPath: pickStr(yaml.semanticAgent?.modelPath, "SEMANTIC_AGENT_MODEL_PATH", d.semanticAgent.modelPath),
      },
      coordinator: {
        maxConcurrency: pickNum(
          yaml.coordinator?.maxConcurrency,
          "COORDINATOR_MAX_CONCURRENCY",
          d.coordinator.maxConcurrency,
        ),
        memoryLimit: pickNum(yaml.coordinator?.memoryLimit, "COORDINATOR_MEMORY_LIMIT", d.coordinator.memoryLimit),
        priority: pickNum(yaml.coordinator?.priority, "COORDINATOR_PRIORITY", d.coordinator.priority),
        taskQueueLimit: pickNum(
          yaml.coordinator?.taskQueueLimit,
          "COORDINATOR_TASK_QUEUE_LIMIT",
          d.coordinator.taskQueueLimit,
        ),
        loadBalancingStrategy:
          parseLoadBalancingStrategy(yaml.coordinator?.loadBalancingStrategy) ||
          parseLoadBalancingStrategy(process.env["COORDINATOR_LOAD_BALANCING_STRATEGY"]) ||
          d.coordinator.loadBalancingStrategy,
        resourceConstraints: this.buildResourceConstraints(
          yaml.coordinator?.resourceConstraints,
          "COORDINATOR",
          sharedMaxConcurrent,
          d.coordinator.resourceConstraints,
        ),
      },
      conductor: {
        maxConcurrency: pickNum(
          yaml.conductor?.maxConcurrency,
          "CONDUCTOR_MAX_CONCURRENCY",
          d.conductor.maxConcurrency,
        ),
        memoryLimit: pickNum(yaml.conductor?.memoryLimit, "CONDUCTOR_MEMORY_LIMIT", d.conductor.memoryLimit),
        priority: pickNum(yaml.conductor?.priority, "CONDUCTOR_PRIORITY", d.conductor.priority),
        taskQueueLimit: pickNum(
          yaml.conductor?.taskQueueLimit,
          "CONDUCTOR_TASK_QUEUE_LIMIT",
          d.conductor.taskQueueLimit,
        ),
        loadBalancingStrategy:
          parseLoadBalancingStrategy(yaml.conductor?.loadBalancingStrategy) ||
          parseLoadBalancingStrategy(process.env["CONDUCTOR_LOAD_BALANCING_STRATEGY"]) ||
          d.conductor.loadBalancingStrategy,
        resourceConstraints: this.buildResourceConstraints(
          yaml.conductor?.resourceConstraints,
          "CONDUCTOR",
          sharedMaxConcurrent,
          d.conductor.resourceConstraints,
        ),
        complexityThreshold: pickNum(
          yaml.conductor?.complexityThreshold,
          "CONDUCTOR_COMPLEXITY_THRESHOLD",
          d.conductor.complexityThreshold,
        ),
        mandatoryDelegation:
          yaml.conductor?.mandatoryDelegation !== undefined
            ? yaml.conductor.mandatoryDelegation
            : process.env["CONDUCTOR_MANDATORY_DELEGATION"] !== "false" &&
              (process.env["CONDUCTOR_MANDATORY_DELEGATION"] === "true" || d.conductor.mandatoryDelegation),
      },
      vectorBackend: {
        libsql: yaml.vectorBackend?.libsql || {
          metric: (process.env["LIBSQL_METRIC"] as "cosine" | "l2") || undefined,
          compression: (process.env["LIBSQL_COMPRESSION"] as "float8" | "float16" | "float32") || undefined,
          searchL: pickNum(undefined, "LIBSQL_SEARCH_L", undefined),
          insertL: pickNum(undefined, "LIBSQL_INSERT_L", undefined),
        },
      },
      environment: yaml.environment || process.env.NODE_ENV || d.environment,
      debug: pickBool(yaml.debug, "DEBUG", d.debug) ?? false,
    };

    return config;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get global configuration instance
 */
export function getConfig(): AppConfig {
  return ConfigLoader.getInstance().getConfig();
}

/**
 * Get MCP configuration with embedding safety check
 */
export function getMCPConfigSafe(): MCPConfig & { embeddingAvailable: boolean } {
  const loader = ConfigLoader.getInstance();
  const mcpConfig = loader.getMCPConfig();

  return {
    ...mcpConfig,
    embeddingAvailable: loader.isEmbeddingEnabled(),
  };
}

/**
 * Initialize configuration system
 */
export function initializeConfig(): AppConfig {
  const config = ConfigLoader.getInstance().getConfig();

  log.i("CONFIG", "init", {
    env: config.environment,
    debug: config.debug,
    embEnabled: config.mcp.embedding?.enabled,
    dbPath: config.database.path,
  });

  return config;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate configuration at startup
 */
export function validateConfig(config: AppConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Note: database.path can be empty - empty means use centralized storage
  // (%LOCALAPPDATA%/UltraCode/projects/<hash>/)

  // Validate MCP configuration
  if (config.mcp.embedding?.enabled && !config.mcp.embedding.provider) {
    errors.push("Embedding provider is required when embedding is enabled");
  }

  // Validate logging configuration
  if (!["debug", "info", "warn", "error"].includes(config.logging.level || "")) {
    errors.push("Invalid logging level");
  }

  // Validate parser configuration
  if (
    config.parser.treeSitter?.enabled &&
    (!config.parser.treeSitter.languageConfigs || config.parser.treeSitter.languageConfigs.length === 0)
  ) {
    errors.push("Language configurations required when tree-sitter is enabled");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
