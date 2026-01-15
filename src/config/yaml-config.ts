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

/**
 * Parse embedding provider from string
 */
function parseEmbeddingProvider(
  value: string | undefined,
): "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "ovms" | "auto" | undefined {
  if (!value) return undefined;
  const providers = ["ollama", "openai", "cloudru", "huggingface", "tei", "ovms", "auto"];
  return providers.includes(value)
    ? (value as "ollama" | "openai" | "cloudru" | "huggingface" | "tei" | "ovms" | "auto")
    : undefined;
}

/**
 * Parse database journal mode from string
 */
function parseDatabaseMode(value: string | undefined): "WAL" | "DELETE" | "TRUNCATE" | undefined {
  if (!value) return undefined;
  const modes = ["WAL", "DELETE", "TRUNCATE"];
  return modes.includes(value) ? (value as "WAL" | "DELETE" | "TRUNCATE") : undefined;
}

/**
 * Parse database synchronous level from string
 */
function parseSynchronousLevel(value: string | undefined): "OFF" | "NORMAL" | "FULL" | undefined {
  if (!value) return undefined;
  const levels = ["OFF", "NORMAL", "FULL"];
  return levels.includes(value) ? (value as "OFF" | "NORMAL" | "FULL") : undefined;
}

/**
 * Parse database temp store from string
 */
function parseTempStore(value: string | undefined): "DEFAULT" | "FILE" | "MEMORY" | undefined {
  if (!value) return undefined;
  const stores = ["DEFAULT", "FILE", "MEMORY"];
  return stores.includes(value) ? (value as "DEFAULT" | "FILE" | "MEMORY") : undefined;
}

/**
 * Parse logging level from string
 */
function parseLogLevel(value: string | undefined): "debug" | "info" | "warn" | "error" | undefined {
  if (!value) return undefined;
  const levels = ["debug", "info", "warn", "error"];
  return levels.includes(value) ? (value as "debug" | "info" | "warn" | "error") : undefined;
}

/**
 * Parse logging format from string
 */
function parseLogFormat(value: string | undefined): "json" | "text" | undefined {
  if (!value) return undefined;
  return value === "json" || value === "text" ? value : undefined;
}

/**
 * Parse load balancing strategy from string
 */
function parseLoadBalancingStrategy(
  value: string | undefined,
): "round-robin" | "least-loaded" | "priority" | undefined {
  if (!value) return undefined;
  const strategies = ["round-robin", "least-loaded", "priority"];
  return strategies.includes(value) ? (value as "round-robin" | "least-loaded" | "priority") : undefined;
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
// CONFIGURATION LOADER CLASS
// =============================================================================

export class ConfigLoader {
  private static instance: ConfigLoader;
  private static overridePath: string | undefined;
  private config: AppConfig;
  private configPath: string;

  private constructor() {
    this.configPath = this.resolveConfigPath();
    this.config = this.loadConfiguration();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

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
    const embeddingConfig = this.config.mcp.embedding || {};
    return {
      model: embeddingConfig.model || "all-MiniLM-L6-v2",
      provider: parseEmbeddingProvider(embeddingConfig.provider) || "auto",
      apiKey: embeddingConfig.apiKey || "",
      enabled: embeddingConfig.enabled || false,

      // Two-stage retrieval with reranker
      useReranker: embeddingConfig.useReranker || false,
      rerankerModel: embeddingConfig.rerankerModel || "granite-embedding-reranker-english-r2",
      rerankerTopK: embeddingConfig.rerankerTopK || 100,
      rerankerFinalK: embeddingConfig.rerankerFinalK || 10,

      // Language hint for optimization
      queryLanguage: embeddingConfig.queryLanguage || "english",

      // Two-phase mode for Bun compatibility
      twoPhaseMode: embeddingConfig.twoPhaseMode ?? false,

      // Layered FAISS index (base + delta)
      useLayeredIndex: embeddingConfig.useLayeredIndex ?? true,

      // Provider-specific configurations
      ollama: embeddingConfig.ollama || undefined,
      openai: embeddingConfig.openai || undefined,
      cloudru: embeddingConfig.cloudru || undefined,
      huggingface: embeddingConfig.huggingface || undefined,
      tei: embeddingConfig.tei || undefined,
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

    // Try environment-specific config first
    const envConfigPath = join(configDir, `${env}.yaml`);
    if (existsSync(envConfigPath)) {
      return envConfigPath;
    }

    // Fall back to default config
    const defaultConfigPath = join(configDir, "default.yaml");
    if (existsSync(defaultConfigPath)) {
      return defaultConfigPath;
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
        const yamlContent = readTextSync(this.configPath);
        yamlConfig = parseYaml(yamlContent) || {};
        log.i("CONFIG", "loaded", { path: this.configPath });
      } catch (error) {
        log.w("CONFIG", "yaml_load_fail", { err: error instanceof Error ? error.message : String(error) });
        log.w("CONFIG", "fallback_env");
      }
    } else {
      log.i("CONFIG", "no_yaml_found");
    }

    // Merge with defaults and environment variables
    return this.mergeWithEnvironment(yamlConfig);
  }

  /**
   * Merge YAML config with environment variables and defaults
   */
  private mergeWithEnvironment(yamlConfig: Partial<AppConfig>): AppConfig {
    const config: AppConfig = {
      mcp: {
        embedding: {
          model:
            yamlConfig.mcp?.embedding?.model ||
            process.env["MCP_EMBEDDING_MODEL"] ||
            DEFAULT_CONFIG.mcp.embedding?.model,
          provider:
            parseEmbeddingProvider(yamlConfig.mcp?.embedding?.provider) ||
            parseEmbeddingProvider(process.env["MCP_EMBEDDING_PROVIDER"]) ||
            DEFAULT_CONFIG.mcp.embedding?.provider ||
            "auto",
          apiKey:
            yamlConfig.mcp?.embedding?.apiKey ||
            process.env["MCP_EMBEDDING_API_KEY"] ||
            DEFAULT_CONFIG.mcp.embedding?.apiKey,
          enabled:
            yamlConfig.mcp?.embedding?.enabled !== undefined
              ? yamlConfig.mcp?.embedding?.enabled
              : process.env["MCP_EMBEDDING_ENABLED"] === "true" || DEFAULT_CONFIG.mcp.embedding?.enabled,
          ollama: yamlConfig.mcp?.embedding?.ollama || {
            baseUrl: process.env["OLLAMA_BASE_URL"] || undefined,
            timeout: Number(process.env["OLLAMA_TIMEOUT_MS"]) || undefined,
            timeoutMs: Number(process.env["OLLAMA_TIMEOUT_MS"]) || undefined,
            concurrency: Number(process.env["OLLAMA_CONCURRENCY"]) || undefined,
            headers: undefined,
            autoPull: process.env["OLLAMA_AUTO_PULL"] !== "false",
            warmupText: process.env["OLLAMA_WARMUP_TEXT"] || undefined,
            checkServer: process.env["OLLAMA_CHECK_SERVER"] !== "false",
            pullTimeoutMs: Number(process.env["OLLAMA_PULL_TIMEOUT_MS"]) || undefined,
          },
          openai: yamlConfig.mcp?.embedding?.openai || {
            baseUrl: process.env["OPENAI_BASE_URL"] || undefined,
            apiKey: process.env["OPENAI_API_KEY"] || undefined,
            timeout: Number(process.env["OPENAI_TIMEOUT_MS"]) || undefined,
            timeoutMs: Number(process.env["OPENAI_TIMEOUT_MS"]) || undefined,
            concurrency: Number(process.env["OPENAI_CONCURRENCY"]) || undefined,
            maxBatchSize: Number(process.env["OPENAI_MAX_BATCH_SIZE"]) || undefined,
          },
          cloudru: yamlConfig.mcp?.embedding?.cloudru || {
            baseUrl: process.env["CLOUDRU_BASE_URL"] || undefined,
            apiKey: process.env["CLOUDRU_API_KEY"] || undefined,
            timeout: Number(process.env["CLOUDRU_TIMEOUT_MS"]) || undefined,
            timeoutMs: Number(process.env["CLOUDRU_TIMEOUT_MS"]) || undefined,
            concurrency: Number(process.env["CLOUDRU_CONCURRENCY"]) || undefined,
            maxBatchSize: Number(process.env["CLOUDRU_MAX_BATCH_SIZE"]) || undefined,
          },
          huggingface: yamlConfig.mcp?.embedding?.huggingface || {
            apiKey: process.env["HUGGINGFACE_API_KEY"] || undefined,
            baseUrl: process.env["HUGGINGFACE_BASE_URL"] || undefined,
            timeout: Number(process.env["HUGGINGFACE_TIMEOUT_MS"]) || undefined,
            timeoutMs: Number(process.env["HUGGINGFACE_TIMEOUT_MS"]) || undefined,
            concurrency: Number(process.env["HUGGINGFACE_CONCURRENCY"]) || undefined,
            warmupText: process.env["HUGGINGFACE_WARMUP_TEXT"] || undefined,
          },
          tei: yamlConfig.mcp?.embedding?.tei || {
            baseUrl: process.env["TEI_BASE_URL"] || undefined,
            timeoutMs: Number(process.env["TEI_TIMEOUT_MS"]) || undefined,
            concurrency: Number(process.env["TEI_CONCURRENCY"]) || undefined,
            checkServer: process.env["TEI_CHECK_SERVER"] !== "false",
          },
          // Two-phase mode for stability (separate embedding from DB writes)
          twoPhaseMode:
            yamlConfig.mcp?.embedding?.twoPhaseMode !== undefined
              ? yamlConfig.mcp?.embedding?.twoPhaseMode
              : process.env["MCP_EMBEDDING_TWO_PHASE"] === "true",
          // Layered FAISS index (base + delta) - enabled by default
          useLayeredIndex:
            yamlConfig.mcp?.embedding?.useLayeredIndex !== undefined
              ? yamlConfig.mcp?.embedding?.useLayeredIndex
              : process.env["MCP_FAISS_LAYERED"] !== "false",
        },
        server: {
          host: yamlConfig.mcp?.server?.host || process.env["MCP_SERVER_HOST"] || DEFAULT_CONFIG.mcp.server?.host,
          port:
            yamlConfig.mcp?.server?.port || Number(process.env["MCP_SERVER_PORT"]) || DEFAULT_CONFIG.mcp.server?.port,
          timeout:
            yamlConfig.mcp?.server?.timeout ||
            Number(process.env["MCP_SERVER_TIMEOUT"]) ||
            DEFAULT_CONFIG.mcp.server?.timeout,
        },
        agents: {
          maxConcurrent:
            yamlConfig.mcp?.agents?.maxConcurrent ||
            Number(process.env["MCP_MAX_CONCURRENT_AGENTS"]) ||
            DEFAULT_CONFIG.mcp.agents?.maxConcurrent,
          defaultTimeout:
            yamlConfig.mcp?.agents?.defaultTimeout ||
            Number(process.env["MCP_AGENT_TIMEOUT"]) ||
            DEFAULT_CONFIG.mcp.agents?.defaultTimeout,
          useParser:
            yamlConfig.mcp?.agents?.useParser !== undefined
              ? yamlConfig.mcp?.agents?.useParser
              : process.env["MCP_USE_PARSER"] !== "0" || DEFAULT_CONFIG.mcp.agents?.useParser,
          devIndexBatch:
            yamlConfig.mcp?.agents?.devIndexBatch ||
            Number(process.env["MCP_DEV_INDEX_BATCH"]) ||
            DEFAULT_CONFIG.mcp.agents?.devIndexBatch,
        },
        semantic: {
          cacheWarmupLimit:
            yamlConfig.mcp?.semantic?.cacheWarmupLimit !== undefined
              ? yamlConfig.mcp.semantic.cacheWarmupLimit
              : process.env["MCP_SEMANTIC_WARMUP_LIMIT"] !== undefined
                ? Number(process.env["MCP_SEMANTIC_WARMUP_LIMIT"])
                : DEFAULT_CONFIG.mcp.semantic?.cacheWarmupLimit,
          popularEntitiesTopic:
            yamlConfig.mcp?.semantic?.popularEntitiesTopic ||
            process.env["MCP_SEMANTIC_WARMUP_TOPIC"] ||
            DEFAULT_CONFIG.mcp.semantic?.popularEntitiesTopic,
        },
      },
      database: {
        path: yamlConfig.database?.path || process.env["DATABASE_PATH"] || DEFAULT_CONFIG.database?.path,
        mode:
          parseDatabaseMode(yamlConfig.database?.mode) ||
          parseDatabaseMode(process.env["DATABASE_MODE"]) ||
          DEFAULT_CONFIG.database?.mode,
        cacheSize:
          yamlConfig.database?.cacheSize ||
          Number(process.env["DATABASE_CACHE_SIZE"]) ||
          DEFAULT_CONFIG.database?.cacheSize,
        mmapSize:
          yamlConfig.database?.mmapSize ||
          Number(process.env["DATABASE_MMAP_SIZE"]) ||
          DEFAULT_CONFIG.database?.mmapSize,
        synchronous:
          parseSynchronousLevel(yamlConfig.database?.synchronous) ||
          parseSynchronousLevel(process.env["DATABASE_SYNCHRONOUS"]) ||
          DEFAULT_CONFIG.database?.synchronous,
        tempStore:
          parseTempStore(yamlConfig.database?.tempStore) ||
          parseTempStore(process.env["DATABASE_TEMP_STORE"]) ||
          DEFAULT_CONFIG.database?.tempStore,
      },
      logging: {
        level:
          parseLogLevel(yamlConfig.logging?.level) ||
          parseLogLevel(process.env["LOG_LEVEL"]) ||
          DEFAULT_CONFIG.logging?.level,
        format:
          parseLogFormat(yamlConfig.logging?.format) ||
          parseLogFormat(process.env["LOG_FORMAT"]) ||
          DEFAULT_CONFIG.logging?.format,
        outputFile: yamlConfig.logging?.outputFile || process.env["LOG_FILE"] || DEFAULT_CONFIG.logging?.outputFile,
        maxFileSize:
          yamlConfig.logging?.maxFileSize || process.env["LOG_MAX_FILE_SIZE"] || DEFAULT_CONFIG.logging?.maxFileSize,
        maxFiles:
          yamlConfig.logging?.maxFiles || Number(process.env["LOG_MAX_FILES"]) || DEFAULT_CONFIG.logging?.maxFiles,
        enableConsole:
          yamlConfig.logging?.enableConsole !== undefined
            ? yamlConfig.logging?.enableConsole
            : process.env["LOG_ENABLE_CONSOLE"] !== "false" || DEFAULT_CONFIG.logging?.enableConsole,
      },
      parser: {
        treeSitter: {
          enabled:
            yamlConfig.parser?.treeSitter?.enabled !== undefined
              ? yamlConfig.parser?.treeSitter?.enabled
              : process.env["PARSER_TREE_SITTER_ENABLED"] !== "false" || DEFAULT_CONFIG.parser.treeSitter?.enabled,
          languageConfigs:
            yamlConfig.parser?.treeSitter?.languageConfigs ||
            process.env["PARSER_LANGUAGES"]?.split(",") ||
            DEFAULT_CONFIG.parser.treeSitter?.languageConfigs,
          maxFileSize:
            yamlConfig.parser?.treeSitter?.maxFileSize ||
            Number(process.env["PARSER_MAX_FILE_SIZE"]) ||
            DEFAULT_CONFIG.parser.treeSitter?.maxFileSize,
          timeout:
            yamlConfig.parser?.treeSitter?.timeout ||
            Number(process.env["PARSER_TIMEOUT"]) ||
            DEFAULT_CONFIG.parser.treeSitter?.timeout,
          bufferSize:
            yamlConfig.parser?.treeSitter?.bufferSize ||
            Number(process.env["PARSER_BUFFER_SIZE"]) ||
            DEFAULT_CONFIG.parser.treeSitter?.bufferSize,
        },
        incremental: {
          enabled:
            yamlConfig.parser?.incremental?.enabled !== undefined
              ? yamlConfig.parser?.incremental?.enabled
              : process.env["PARSER_INCREMENTAL_ENABLED"] !== "false" || DEFAULT_CONFIG.parser.incremental?.enabled,
          cacheSize:
            yamlConfig.parser?.incremental?.cacheSize ||
            Number(process.env["PARSER_CACHE_SIZE"]) ||
            DEFAULT_CONFIG.parser.incremental?.cacheSize,
          cacheTTL:
            yamlConfig.parser?.incremental?.cacheTTL ||
            Number(process.env["PARSER_CACHE_TTL"]) ||
            DEFAULT_CONFIG.parser.incremental?.cacheTTL,
        },
        agent: {
          maxConcurrency:
            yamlConfig.parser?.agent?.maxConcurrency ||
            Number(process.env["PARSER_AGENT_MAX_CONCURRENCY"]) ||
            DEFAULT_CONFIG.parser.agent?.maxConcurrency,
          memoryLimit:
            yamlConfig.parser?.agent?.memoryLimit ||
            Number(process.env["PARSER_AGENT_MEMORY_LIMIT"]) ||
            DEFAULT_CONFIG.parser.agent?.memoryLimit,
          priority:
            yamlConfig.parser?.agent?.priority ||
            Number(process.env["PARSER_AGENT_PRIORITY"]) ||
            DEFAULT_CONFIG.parser.agent?.priority,
          batchSize:
            yamlConfig.parser?.agent?.batchSize ||
            Number(process.env["PARSER_AGENT_BATCH_SIZE"]) ||
            DEFAULT_CONFIG.parser.agent?.batchSize,
          cacheSize:
            yamlConfig.parser?.agent?.cacheSize ||
            Number(process.env["PARSER_AGENT_CACHE_SIZE"]) ||
            DEFAULT_CONFIG.parser.agent?.cacheSize,
          workerPoolSize:
            yamlConfig.parser?.agent?.workerPoolSize ||
            Number(process.env["PARSER_AGENT_WORKER_POOL_SIZE"]) ||
            DEFAULT_CONFIG.parser.agent?.workerPoolSize,
        },
      },
      indexer: {
        maxConcurrency:
          yamlConfig.indexer?.maxConcurrency ||
          Number(process.env["INDEXER_AGENT_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.indexer?.maxConcurrency,
        memoryLimit:
          yamlConfig.indexer?.memoryLimit ||
          Number(process.env["INDEXER_AGENT_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.indexer?.memoryLimit,
        priority:
          yamlConfig.indexer?.priority ||
          Number(process.env["INDEXER_AGENT_PRIORITY"]) ||
          DEFAULT_CONFIG.indexer?.priority,
        batchSize:
          yamlConfig.indexer?.batchSize ||
          Number(process.env["INDEXER_AGENT_BATCH_SIZE"]) ||
          DEFAULT_CONFIG.indexer?.batchSize,
        cacheSize:
          yamlConfig.indexer?.cacheSize ||
          Number(process.env["INDEXER_AGENT_CACHE_SIZE"]) ||
          DEFAULT_CONFIG.indexer?.cacheSize,
        cacheTTL:
          yamlConfig.indexer?.cacheTTL ||
          Number(process.env["INDEXER_AGENT_CACHE_TTL"]) ||
          DEFAULT_CONFIG.indexer?.cacheTTL,
      },
      indexing: {
        // branchAware removed - auto-detected via .git directory
        autoSwitchOnBranchChange:
          yamlConfig.indexing?.autoSwitchOnBranchChange ??
          (process.env["INDEXING_AUTO_SWITCH"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.indexing.autoSwitchOnBranchChange,
        maxBranchesPerRepo:
          yamlConfig.indexing?.maxBranchesPerRepo ||
          Number(process.env["INDEXING_MAX_BRANCHES_PER_REPO"]) ||
          DEFAULT_CONFIG.indexing.maxBranchesPerRepo,
        maxTotalBranches:
          yamlConfig.indexing?.maxTotalBranches ||
          Number(process.env["INDEXING_MAX_TOTAL_BRANCHES"]) ||
          DEFAULT_CONFIG.indexing.maxTotalBranches,
        evictionStrategy:
          (yamlConfig.indexing?.evictionStrategy as "LRU" | "LFU" | "FIFO") || DEFAULT_CONFIG.indexing.evictionStrategy,
        cleanupIntervalMs:
          yamlConfig.indexing?.cleanupIntervalMs ||
          Number(process.env["INDEXING_CLEANUP_INTERVAL_MS"]) ||
          DEFAULT_CONFIG.indexing.cleanupIntervalMs,
        incrementalThreshold:
          yamlConfig.indexing?.incrementalThreshold ||
          Number(process.env["INDEXING_INCREMENTAL_THRESHOLD"]) ||
          DEFAULT_CONFIG.indexing.incrementalThreshold,
        dataDir: yamlConfig.indexing?.dataDir || process.env["INDEXING_DATA_DIR"] || DEFAULT_CONFIG.indexing.dataDir,
      },
      git: {
        enabled:
          yamlConfig.git?.enabled ??
          (process.env["GIT_ENABLED"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.git.enabled,
        watchBranchChanges:
          yamlConfig.git?.watchBranchChanges ??
          (process.env["GIT_WATCH_BRANCH_CHANGES"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.git.watchBranchChanges,
        watchUncommitted:
          yamlConfig.git?.watchUncommitted ??
          (process.env["GIT_WATCH_UNCOMMITTED"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.git.watchUncommitted,
        uncommittedPollIntervalMs:
          yamlConfig.git?.uncommittedPollIntervalMs ||
          Number(process.env["GIT_UNCOMMITTED_POLL_INTERVAL_MS"]) ||
          DEFAULT_CONFIG.git.uncommittedPollIntervalMs,
        includeUntracked:
          yamlConfig.git?.includeUntracked ??
          (process.env["GIT_INCLUDE_UNTRACKED"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.git.includeUntracked,
        autoReindex:
          yamlConfig.git?.autoReindex ??
          (process.env["GIT_AUTO_REINDEX"] === "true" ? true : undefined) ??
          DEFAULT_CONFIG.git.autoReindex,
        diffMode: (yamlConfig.git?.diffMode as "incremental" | "full") || DEFAULT_CONFIG.git.diffMode,
        pollIntervalMs:
          yamlConfig.git?.pollIntervalMs ||
          Number(process.env["GIT_POLL_INTERVAL_MS"]) ||
          DEFAULT_CONFIG.git.pollIntervalMs,
      },
      devAgent: {
        maxConcurrency:
          yamlConfig.devAgent?.maxConcurrency ||
          Number(process.env["DEV_AGENT_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.devAgent.maxConcurrency,
        memoryLimit:
          yamlConfig.devAgent?.memoryLimit ||
          Number(process.env["DEV_AGENT_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.devAgent.memoryLimit,
        priority:
          yamlConfig.devAgent?.priority ||
          Number(process.env["DEV_AGENT_PRIORITY"]) ||
          DEFAULT_CONFIG.devAgent.priority,
      },
      doraAgent: {
        maxConcurrency:
          yamlConfig.doraAgent?.maxConcurrency ||
          Number(process.env["DORA_AGENT_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.doraAgent.maxConcurrency,
        memoryLimit:
          yamlConfig.doraAgent?.memoryLimit ||
          Number(process.env["DORA_AGENT_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.doraAgent.memoryLimit,
        priority:
          yamlConfig.doraAgent?.priority ||
          Number(process.env["DORA_AGENT_PRIORITY"]) ||
          DEFAULT_CONFIG.doraAgent.priority,
      },
      queryAgent: {
        maxConcurrency:
          yamlConfig.queryAgent?.maxConcurrency ||
          Number(process.env["QUERY_AGENT_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.queryAgent.maxConcurrency,
        memoryLimit:
          yamlConfig.queryAgent?.memoryLimit ||
          Number(process.env["QUERY_AGENT_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.queryAgent.memoryLimit,
        priority:
          yamlConfig.queryAgent?.priority ||
          Number(process.env["QUERY_AGENT_PRIORITY"]) ||
          DEFAULT_CONFIG.queryAgent.priority,
        simpleQueryTimeout:
          yamlConfig.queryAgent?.simpleQueryTimeout ||
          Number(process.env["QUERY_AGENT_SIMPLE_TIMEOUT"]) ||
          DEFAULT_CONFIG.queryAgent.simpleQueryTimeout,
        complexQueryTimeout:
          yamlConfig.queryAgent?.complexQueryTimeout ||
          Number(process.env["QUERY_AGENT_COMPLEX_TIMEOUT"]) ||
          DEFAULT_CONFIG.queryAgent.complexQueryTimeout,
        cacheWarmupSize:
          yamlConfig.queryAgent?.cacheWarmupSize ||
          Number(process.env["QUERY_AGENT_CACHE_WARMUP"]) ||
          DEFAULT_CONFIG.queryAgent.cacheWarmupSize,
      },
      semanticAgent: {
        maxConcurrency:
          yamlConfig.semanticAgent?.maxConcurrency ||
          Number(process.env["SEMANTIC_AGENT_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.semanticAgent.maxConcurrency,
        memoryLimit:
          yamlConfig.semanticAgent?.memoryLimit ||
          Number(process.env["SEMANTIC_AGENT_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.semanticAgent.memoryLimit,
        priority:
          yamlConfig.semanticAgent?.priority ||
          Number(process.env["SEMANTIC_AGENT_PRIORITY"]) ||
          DEFAULT_CONFIG.semanticAgent.priority,
        batchSize:
          yamlConfig.semanticAgent?.batchSize ||
          Number(process.env["SEMANTIC_AGENT_BATCH_SIZE"]) ||
          DEFAULT_CONFIG.semanticAgent.batchSize,
        modelPath:
          yamlConfig.semanticAgent?.modelPath ||
          process.env["SEMANTIC_AGENT_MODEL_PATH"] ||
          DEFAULT_CONFIG.semanticAgent.modelPath,
      },
      coordinator: {
        maxConcurrency:
          yamlConfig.coordinator?.maxConcurrency ||
          Number(process.env["COORDINATOR_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.coordinator.maxConcurrency,
        memoryLimit:
          yamlConfig.coordinator?.memoryLimit ||
          Number(process.env["COORDINATOR_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.coordinator.memoryLimit,
        priority:
          yamlConfig.coordinator?.priority ||
          Number(process.env["COORDINATOR_PRIORITY"]) ||
          DEFAULT_CONFIG.coordinator.priority,
        taskQueueLimit:
          yamlConfig.coordinator?.taskQueueLimit ||
          Number(process.env["COORDINATOR_TASK_QUEUE_LIMIT"]) ||
          DEFAULT_CONFIG.coordinator.taskQueueLimit,
        loadBalancingStrategy:
          parseLoadBalancingStrategy(yamlConfig.coordinator?.loadBalancingStrategy) ||
          parseLoadBalancingStrategy(process.env["COORDINATOR_LOAD_BALANCING_STRATEGY"]) ||
          DEFAULT_CONFIG.coordinator.loadBalancingStrategy,
        resourceConstraints: {
          maxMemoryMB:
            yamlConfig.coordinator?.resourceConstraints?.maxMemoryMB ||
            Number(process.env["COORDINATOR_MAX_MEMORY_MB"]) ||
            DEFAULT_CONFIG.coordinator.resourceConstraints?.maxMemoryMB,
          maxCpuPercent:
            yamlConfig.coordinator?.resourceConstraints?.maxCpuPercent ||
            Number(process.env["COORDINATOR_MAX_CPU_PERCENT"]) ||
            DEFAULT_CONFIG.coordinator.resourceConstraints?.maxCpuPercent,
          maxConcurrentAgents:
            yamlConfig.coordinator?.resourceConstraints?.maxConcurrentAgents ||
            Number(process.env["COORDINATOR_MAX_CONCURRENT_AGENTS"]) ||
            yamlConfig.mcp?.agents?.maxConcurrent ||
            Number(process.env["MCP_MAX_CONCURRENT_AGENTS"]) ||
            DEFAULT_CONFIG.coordinator.resourceConstraints?.maxConcurrentAgents,
          maxTaskQueueSize:
            yamlConfig.coordinator?.resourceConstraints?.maxTaskQueueSize ||
            Number(process.env["COORDINATOR_MAX_TASK_QUEUE_SIZE"]) ||
            DEFAULT_CONFIG.coordinator.resourceConstraints?.maxTaskQueueSize,
        },
      },
      conductor: {
        maxConcurrency:
          yamlConfig.conductor?.maxConcurrency ||
          Number(process.env["CONDUCTOR_MAX_CONCURRENCY"]) ||
          DEFAULT_CONFIG.conductor.maxConcurrency,
        memoryLimit:
          yamlConfig.conductor?.memoryLimit ||
          Number(process.env["CONDUCTOR_MEMORY_LIMIT"]) ||
          DEFAULT_CONFIG.conductor.memoryLimit,
        priority:
          yamlConfig.conductor?.priority ||
          Number(process.env["CONDUCTOR_PRIORITY"]) ||
          DEFAULT_CONFIG.conductor.priority,
        taskQueueLimit:
          yamlConfig.conductor?.taskQueueLimit ||
          Number(process.env["CONDUCTOR_TASK_QUEUE_LIMIT"]) ||
          DEFAULT_CONFIG.conductor.taskQueueLimit,
        loadBalancingStrategy:
          parseLoadBalancingStrategy(yamlConfig.conductor?.loadBalancingStrategy) ||
          parseLoadBalancingStrategy(process.env["CONDUCTOR_LOAD_BALANCING_STRATEGY"]) ||
          DEFAULT_CONFIG.conductor.loadBalancingStrategy,
        resourceConstraints: {
          maxMemoryMB:
            yamlConfig.conductor?.resourceConstraints?.maxMemoryMB ||
            Number(process.env["CONDUCTOR_MAX_MEMORY_MB"]) ||
            DEFAULT_CONFIG.conductor.resourceConstraints?.maxMemoryMB,
          maxCpuPercent:
            yamlConfig.conductor?.resourceConstraints?.maxCpuPercent ||
            Number(process.env["CONDUCTOR_MAX_CPU_PERCENT"]) ||
            DEFAULT_CONFIG.conductor.resourceConstraints?.maxCpuPercent,
          maxConcurrentAgents:
            yamlConfig.conductor?.resourceConstraints?.maxConcurrentAgents ||
            Number(process.env["CONDUCTOR_MAX_CONCURRENT_AGENTS"]) ||
            yamlConfig.mcp?.agents?.maxConcurrent ||
            Number(process.env["MCP_MAX_CONCURRENT_AGENTS"]) ||
            DEFAULT_CONFIG.conductor.resourceConstraints?.maxConcurrentAgents,
          maxTaskQueueSize:
            yamlConfig.conductor?.resourceConstraints?.maxTaskQueueSize ||
            Number(process.env["CONDUCTOR_MAX_TASK_QUEUE_SIZE"]) ||
            DEFAULT_CONFIG.conductor.resourceConstraints?.maxTaskQueueSize,
        },
        complexityThreshold:
          yamlConfig.conductor?.complexityThreshold ||
          Number(process.env["CONDUCTOR_COMPLEXITY_THRESHOLD"]) ||
          DEFAULT_CONFIG.conductor.complexityThreshold,
        mandatoryDelegation:
          yamlConfig.conductor?.mandatoryDelegation !== undefined
            ? yamlConfig.conductor?.mandatoryDelegation
            : process.env["CONDUCTOR_MANDATORY_DELEGATION"] !== "false" &&
              (process.env["CONDUCTOR_MANDATORY_DELEGATION"] === "true" ||
                DEFAULT_CONFIG.conductor.mandatoryDelegation),
      },
      vectorBackend: {
        libsql: yamlConfig.vectorBackend?.libsql || {
          metric: (process.env["LIBSQL_METRIC"] as "cosine" | "l2") || undefined,
          compression: (process.env["LIBSQL_COMPRESSION"] as "float8" | "float16" | "float32") || undefined,
          searchL: Number(process.env["LIBSQL_SEARCH_L"]) || undefined,
          insertL: Number(process.env["LIBSQL_INSERT_L"]) || undefined,
        },
      },
      environment: yamlConfig.environment || process.env.NODE_ENV || DEFAULT_CONFIG.environment,
      debug:
        yamlConfig.debug !== undefined ? yamlConfig.debug : process.env["DEBUG"] === "true" || DEFAULT_CONFIG.debug,
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
  const config = ConfigLoader.getInstance();
  const mcpConfig = config.getMCPConfig();

  return {
    ...mcpConfig,
    embeddingAvailable: config.isEmbeddingEnabled(),
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
  // (%LOCALAPPDATA%/UltraScriptTools/projects/<hash>/)

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
