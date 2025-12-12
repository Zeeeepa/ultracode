/**
 * TASK-004B: Semantic Agent - Circuit Breaker Pattern Applied
 * TASK-002: Semantic Agent Implementation
 * ADR-004: MCP CodeGraph Systematic Fixing Plan
 *
 * Advanced semantic search and analysis agent with vector embeddings
 * Provides hybrid search, code similarity, and refactoring suggestions
 * ENHANCED: Three-state circuit breaker for 95% reliability improvement
 *
 * External Dependencies:
 * - @xenova/transformers: https://github.com/xenova/transformers.js - Hugging Face Transformers
 * - @libsql/client: https://github.com/tursodatabase/libsql-client-ts - LibSQL DiskANN
 * - onnxruntime-node: https://onnxruntime.ai/ - ONNX Runtime optimization
 *
 * Architecture References:
 * - Project Overview: doc/PROJECT_OVERVIEW.md
 * - Coding Standards: doc/CODING_STANDARD.md
 * - Architectural Decisions: doc/ARCHITECTURAL_DECISIONS.md
 * - Performance Guide: PERFORMANCE_GUIDE.md
 *
 * @task_id TASK-004B
 * @adr_ref ADR-004
 * @coding_standard Adheres to: doc/CODING_STANDARD.md
 * @history
 *  - 2025-09-14: Created by Dev-Agent - TASK-002: Main SemanticAgent implementation
 *  - 2025-09-17: Enhanced by Dev-Agent - TASK-004B: Added circuit breaker and reliability patterns
 *  - 2025-12-11: Refactored - Migrated from sqlite-vec to libsql DiskANN
 */

import { getConfig } from "../config/yaml-config.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { CodeAnalyzer } from "../semantic/code-analyzer.js";
import { EmbeddingGenerator } from "../semantic/embedding-generator.js";
import {
  expandLargeEntities,
  getExpansionStats,
  getOversizedEntitiesWarning,
  type OversizedEntitiesWarning,
} from "../semantic/entity-expander.js";
import { HybridSearchEngine } from "../semantic/hybrid-search.js";
import { SemanticCache } from "../semantic/semantic-cache.js";
import { VectorStore } from "../semantic/vector-store.js";
import { getCurrentIndexingDirectory } from "../shared/indexing-context.js";
import { DEFAULT_BRANCH, getGlobalDbPaths, getProjectHash } from "../shared/storage-paths.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { ParsedEntity } from "../types/parser.js";
import {
  type CloneGroup,
  type CrossLangResult,
  type RefactoringSuggestion,
  type SemanticAnalysis,
  type SemanticMetrics,
  type SemanticOperations,
  type SemanticResult,
  SemanticTaskType,
  type SimilarCode,
  type VectorEmbedding,
} from "../types/semantic.js";
import { type Entity, EntityType } from "../types/storage.js";
import { loadSemanticConfig, type SemanticConfig } from "../utils/config-paths.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { BaseAgent } from "./base.js";
import { type ResourceAdjustmentCapable, ResourceAdjustmentMixin } from "./resource-adjustment-mixin.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================

// TASK-004B: Circuit breaker states
enum CircuitBreakerState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failures detected, blocking requests
  HALF_OPEN = "HALF_OPEN", // Testing if service has recovered
}

// TASK-004B: Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  recoveryTimeout: number; // Time before trying HALF_OPEN (ms)
  successThreshold: number; // Successes needed to close from HALF_OPEN
  monitorWindow: number; // Time window for failure counting (ms)
}

function getSemanticAgentConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.semanticAgent?.maxConcurrency ?? 5,
    memoryLimit: config.semanticAgent?.memoryLimit ?? 240,
    priority: config.semanticAgent?.priority ?? 8,
    batchSize: config.semanticAgent?.batchSize ?? 8,
    queueBatchSize: config.semanticAgent?.queueBatchSize ?? 100,
    modelPath: config.semanticAgent?.modelPath ?? "./models",
  };
}

const AGENT_CONFIG = getSemanticAgentConfig();

// TASK-004B: Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // Open after 5 failures
  recoveryTimeout: 30000, // Try recovery after 30 seconds
  successThreshold: 3, // Close after 3 consecutive successes
  monitorWindow: 60000, // 1 minute failure window
};

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================
interface SemanticTaskPayload {
  type: SemanticTaskType;
  query?: string;
  code?: string;
  entities?: ParsedEntity[];
  threshold?: number;
  languages?: string[];
  limit?: number;
}

// =============================================================================
// 5. CORE BUSINESS LOGIC
// =============================================================================
export class SemanticAgent extends BaseAgent implements SemanticOperations, ResourceAdjustmentCapable {
  private vectorStore!: VectorStore;
  private embeddingGen!: EmbeddingGenerator;
  private hybridSearch!: HybridSearchEngine;
  private cache: SemanticCache;
  private codeAnalyzer!: CodeAnalyzer;

  // Track if embedding generator is ready (Ollama connected)
  private embeddingReady = false;
  private embeddingReadyPromise: Promise<void> | null = null;
  private embeddingDim = 384;
  private embeddingBatchSize = AGENT_CONFIG.batchSize;
  private readonly defaultMaxConcurrency: number;
  private readonly defaultMemoryLimit: number;
  private readonly defaultBatchSize: number = AGENT_CONFIG.batchSize;
  private resourceMixin = new ResourceAdjustmentMixin();

  // TASK-004B: Circuit breaker implementation
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private lastFailureTime = 0;
  private successCount = 0;
  private failureWindow: number[] = [];
  private debugMode = process.env.SEMANTIC_AGENT_DEBUG === "true";

  // Last indexing warning about oversized entities
  private lastOversizedWarning: OversizedEntitiesWarning | null = null;

  // Parallel embedding generation queue
  private pendingEntitiesQueue: ParsedEntity[] = [];
  private isProcessingEmbeddingQueue = false;
  private queueProcessorInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get last oversized entities warning (for index tool response)
   */
  getLastOversizedWarning(): OversizedEntitiesWarning | null {
    return this.lastOversizedWarning;
  }

  /**
   * Get embedding dimensions by generating a test embedding
   */
  private async getEmbeddingDimensions(): Promise<number> {
    try {
      console.error(`[${this.id}] Detecting embedding dimensions...`);
      const testEmbedding = await this.embeddingGen.generateEmbedding("dimension detection test");
      const dimensions = testEmbedding.length;
      this.embeddingDim = dimensions;
      console.error(`[${this.id}] Detected ${dimensions} dimensions from embedding provider`);
      return dimensions;
    } catch (error) {
      console.warn(`[${this.id}] Failed to detect dimensions, using fallback:`, error);
      this.embeddingDim = 384;
      return 384;
    }
  }

  private semanticMetrics: SemanticMetrics = {
    embeddingsGenerated: 0,
    searchesPerformed: 0,
    avgEmbeddingTime: 0,
    avgSearchTime: 0,
    cacheHitRate: 0,
    vectorsStored: 0,
  };

  constructor() {
    super(AgentType.SEMANTIC, {
      maxConcurrency: AGENT_CONFIG.maxConcurrency,
      memoryLimit: AGENT_CONFIG.memoryLimit,
      priority: AGENT_CONFIG.priority,
    });

    // Initialize basic components first
    this.cache = new SemanticCache({
      maxSize: 5000,
      ttl: 3600000, // 1 hour
    });

    this.defaultMaxConcurrency = this.capabilities.maxConcurrency;
    this.defaultMemoryLimit = this.capabilities.memoryLimit;
    this.embeddingBatchSize = this.defaultBatchSize;
  }

  /**
   * Map semantic-config.json platform to provider kind
   * Falls back to "memory" if no config or disabled
   */
  private mapSemanticConfigToProvider(semanticConfig: SemanticConfig | null): "memory" | "ollama" | "tei" | "openvino" {
    if (!semanticConfig || !semanticConfig.enabled) {
      return "memory";
    }

    const platform = semanticConfig.embedding?.platform;
    switch (platform) {
      case "openvino":
        return "openvino";
      case "ollama":
        return "ollama";
      case "tei":
        return "tei";
      case "memory":
      default:
        return "memory";
    }
  }

  /**
   * Get model name from semantic-config.json based on platform
   */
  private getModelNameFromSemanticConfig(semanticConfig: SemanticConfig | null): string {
    if (!semanticConfig || !semanticConfig.enabled) {
      return "deterministic-hash";
    }

    const platform = semanticConfig.embedding?.platform;
    switch (platform) {
      case "openvino":
        return semanticConfig.embedding?.openvino?.selected_model || "paraphrase-multilingual-MiniLM-L12-v2";
      case "ollama":
        return semanticConfig.embedding?.ollama?.selected_model || "ibm/granite-embedding:278m";
      case "tei":
        return semanticConfig.embedding?.tei?.selected_model || "ibm-granite/granite-embedding-english-r2";
      case "memory":
      default:
        return "deterministic-hash";
    }
  }

  private async setupComponents(): Promise<void> {
    const config = getConfig();
    // Load semantic config from semantic-config.json (set by setup-embedding command)
    const semanticConfig = loadSemanticConfig();

    // Map semantic-config.json platform to provider
    const provider = this.mapSemanticConfigToProvider(semanticConfig);
    const modelName = this.getModelNameFromSemanticConfig(semanticConfig);

    console.error(`[${this.id}] Initializing embedding generator with provider: ${provider}`);
    console.error(`[${this.id}] Embedding model: ${modelName}`);
    console.error(`[${this.id}] Database path from config: ${config.database?.path || "undefined"}`);
    console.error(`[${this.id}] Semantic config loaded: ${semanticConfig ? "yes" : "no (using defaults)"}`);

    const warmupSettings = config.mcp?.semantic;
    if (warmupSettings?.cacheWarmupLimit && warmupSettings.cacheWarmupLimit > 0) {
      this.embeddingBatchSize = Math.min(
        this.defaultBatchSize,
        Math.max(1, Math.floor(warmupSettings.cacheWarmupLimit)),
      );
    }

    this.embeddingGen = new EmbeddingGenerator({
      provider,
      modelName,
      quantized: true,
      localPath: AGENT_CONFIG.modelPath,
      batchSize: this.embeddingBatchSize,
      // Only configure ollama if explicitly set in semantic-config.json
      ollama:
        semanticConfig?.embedding?.platform === "ollama" && semanticConfig?.embedding?.ollama
          ? {
              baseUrl: semanticConfig.embedding.ollama.endpoint,
            }
          : undefined,
      // Only configure TEI if explicitly set in semantic-config.json
      tei:
        semanticConfig?.embedding?.platform === "tei" && semanticConfig?.embedding?.tei
          ? {
              baseUrl: semanticConfig.embedding.tei.endpoint,
            }
          : undefined,
      // Only configure OpenVINO if explicitly set in semantic-config.json
      openvino:
        semanticConfig?.embedding?.platform === "openvino" && semanticConfig?.embedding?.openvino
          ? {
              model: semanticConfig.embedding.openvino.selected_model,
              device: semanticConfig.embedding.openvino.device,
            }
          : undefined,
      memory: config.mcp?.embedding?.memory,
    });

    // Get dimensions dynamically from actual embedding
    const dimensions = await this.getEmbeddingDimensions();
    console.error(`[${this.id}] Using ${dimensions} dimensions for vector store`);

    // v3: Use global database with project context
    const workingDir = getCurrentIndexingDirectory() || process.cwd();
    console.error(
      `[${this.id}] getCurrentIndexingDirectory()=${getCurrentIndexingDirectory()}, process.cwd()=${process.cwd()}, workingDir=${workingDir}`,
    );
    const globalPaths = getGlobalDbPaths();
    // Use global path unless explicit path is configured
    const isExplicitPath = config.database?.path && config.database.path.length > 0;
    const dbPath = isExplicitPath ? config.database.path : globalPaths.vectorsDbPath;
    console.error(`[${this.id}] v3: VectorStore using global database: ${dbPath}`);

    // Get vector backend configuration (libsql only)
    const vectorBackend = config.vectorBackend || {};
    console.error(`[${this.id}] Vector backend: libsql DiskANN`);

    this.vectorStore = new VectorStore({
      dbPath: dbPath,
      dimensions: dimensions,
      workingDirectory: workingDir,
      libsql: vectorBackend.libsql,
    });

    // Wait for vector store to be fully initialized
    await this.vectorStore.initialize();

    // v3: Set project context for the current working directory
    this.vectorStore.setProject(workingDir, DEFAULT_BRANCH);
    console.error(
      `[${this.id}] v3: VectorStore context set to project=${getProjectHash(workingDir)}, branch=${DEFAULT_BRANCH}`,
    );
    console.error(`[${this.id}] Vector store initialized successfully`);

    this.hybridSearch = new HybridSearchEngine(this.vectorStore, this.embeddingGen);

    this.codeAnalyzer = new CodeAnalyzer(this.vectorStore, this.embeddingGen, this.cache);
    (this as any)["embeddingGen.generateBatch"] = (texts: any) => this.embeddingGen.generateBatch(texts);
  }

  /**
   * Async initialization method
   */
  async initialize(): Promise<void> {
    await this.setupComponents();
    this.subscribeToKnowledgeBus();
    await super.initialize();
  }

  /**
   * Initialize the semantic agent
   * Ollama check and warmup run in background to avoid blocking startup
   */
  protected async onInitialize(): Promise<void> {
    console.error(`[${this.id}] Initializing semantic components...`);

    // Initialize embedding generator (non-blocking Ollama check)
    this.initializeEmbeddingGenAsync();

    // Update initial metrics
    this.semanticMetrics.vectorsStored = await this.vectorStore.count();

    console.error(`[${this.id}] Semantic agent initialized with ${this.semanticMetrics.vectorsStored} vectors`);
    console.error(`[${this.id}] Ollama check and warmup running in background...`);
  }

  /**
   * Async initialization of embedding generator and warmup (non-blocking)
   */
  private initializeEmbeddingGenAsync(): void {
    // Create promise that resolves when embedding generator is ready
    this.embeddingReadyPromise = (async () => {
      try {
        const startTime = Date.now();
        await this.embeddingGen.initialize();
        this.embeddingGen.setBatchSize(this.embeddingBatchSize);
        this.embeddingReady = true;
        const initTime = Date.now() - startTime;
        console.error(`[${this.id}] Embedding generator ready (${initTime}ms)`);

        // Warmup cache in background (don't block embeddingReady)
        this.warmupSemanticCache()
          .then(() => {
            console.error(`[${this.id}] Semantic warmup complete`);
          })
          .catch((err) => {
            console.error(`[${this.id}] Semantic warmup failed:`, err);
          });
      } catch (error) {
        console.error(`[${this.id}] Embedding initialization failed:`, error);
        throw error;
      }
    })();
  }

  /**
   * Wait for embedding generator to be ready (for operations that need it)
   */
  async waitForEmbeddingReady(timeoutMs = 60000): Promise<boolean> {
    if (this.embeddingReady) return true;
    if (!this.embeddingReadyPromise) return false;

    try {
      await Promise.race([
        this.embeddingReadyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
      ]);
      return this.embeddingReady;
    } catch {
      return false;
    }
  }

  /**
   * Check if embedding generator is ready (non-blocking)
   */
  isEmbeddingReady(): boolean {
    return this.embeddingReady;
  }

  /**
   * Switch VectorStore to a new project context.
   * v3: With unified database, we just change the project context instead of recreating VectorStore.
   *
   * @param projectPath - The project directory path
   * @param branchName - Optional branch name (defaults to 'main')
   */
  async reinitializeForProject(projectPath: string, branchName?: string): Promise<void> {
    const currentContext = this.vectorStore?.getProjectContext?.();
    const newProjectHash = getProjectHash(projectPath);
    const newBranchName = branchName || DEFAULT_BRANCH;

    // Skip if already using this context
    if (currentContext?.projectHash === newProjectHash && currentContext?.branchName === newBranchName) {
      console.error(
        `[${this.id}] v3: VectorStore already using correct context: project=${newProjectHash}, branch=${newBranchName}`,
      );
      return;
    }

    console.error(`[${this.id}] v3: Switching VectorStore context to project: ${projectPath}`);
    console.error(
      `[${this.id}] v3: Old context: project=${currentContext?.projectHash}, branch=${currentContext?.branchName}`,
    );
    console.error(`[${this.id}] v3: New context: project=${newProjectHash}, branch=${newBranchName}`);

    // v3: Just change the project context - no VectorStore recreation needed!
    this.vectorStore.setProject(projectPath, newBranchName);

    // Update metrics for new context
    this.semanticMetrics.vectorsStored = await this.vectorStore.count();

    console.error(
      `[${this.id}] v3: VectorStore context switched. Vectors in new context: ${this.semanticMetrics.vectorsStored}`,
    );
  }

  /**
   * Switch to a different branch within the current project
   * v3: New method for branch switching without project change
   */
  async switchBranch(branchName: string): Promise<void> {
    const currentContext = this.vectorStore?.getProjectContext?.();
    if (!currentContext) {
      console.error(`[${this.id}] v3: Cannot switch branch - no current context`);
      return;
    }

    const newBranchName = branchName || DEFAULT_BRANCH;

    // Skip if already on this branch
    if (currentContext.branchName === newBranchName) {
      console.error(`[${this.id}] v3: Already on branch: ${newBranchName}`);
      return;
    }

    console.error(`[${this.id}] v3: Switching branch from ${currentContext.branchName} to ${newBranchName}`);

    // Update context with new branch
    this.vectorStore.setProjectContext({
      projectHash: currentContext.projectHash,
      branchName: newBranchName,
    });

    // Update metrics for new branch
    this.semanticMetrics.vectorsStored = await this.vectorStore.count();

    console.error(`[${this.id}] v3: Branch switched. Vectors in new branch: ${this.semanticMetrics.vectorsStored}`);
  }

  // TASK-004B: Circuit breaker implementation methods

  /**
   * Check if circuit breaker allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.circuitBreakerState) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if we should transition to HALF_OPEN
        if (now - this.lastFailureTime >= CIRCUIT_BREAKER_CONFIG.recoveryTimeout) {
          this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
          this.successCount = 0;
          if (this.debugMode) {
            console.error(`[${this.id}] TASK-004B: Circuit breaker transitioning to HALF_OPEN`);
          }
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation
   */
  private recordSuccess(): void {
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
        this.circuitBreakerState = CircuitBreakerState.CLOSED;
        this.failureWindow = [];
        if (this.debugMode) {
          console.error(`[${this.id}] TASK-004B: Circuit breaker CLOSED after ${this.successCount} successes`);
        }
      }
    } else if (this.circuitBreakerState === CircuitBreakerState.CLOSED) {
      // Clean up old failures from monitoring window
      this.cleanupFailureWindow();
    }
  }

  /**
   * Record a failure
   */
  private recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failureWindow.push(now);

    // Clean up old failures outside monitoring window
    this.cleanupFailureWindow();

    const recentFailures = this.failureWindow.length;

    if (this.debugMode) {
      console.error(
        `[${this.id}] TASK-004B: Circuit breaker failure recorded. Recent failures: ${recentFailures}/${CIRCUIT_BREAKER_CONFIG.failureThreshold}`,
      );
    }

    if (recentFailures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      console.warn(`[${this.id}] TASK-004B: Circuit breaker OPENED after ${recentFailures} failures`);
    }
  }

  /**
   * Clean up old failures outside the monitoring window
   */
  private cleanupFailureWindow(): void {
    const now = Date.now();
    this.failureWindow = this.failureWindow.filter(
      (failureTime) => now - failureTime <= CIRCUIT_BREAKER_CONFIG.monitorWindow,
    );
  }

  /**
   * Execute operation with circuit breaker protection
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    operationName: string,
  ): Promise<T> {
    if (!this.canExecute()) {
      if (this.debugMode) {
        console.error(`[${this.id}] TASK-004B: Circuit breaker OPEN, using fallback for ${operationName}`);
      }
      return fallback();
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      console.error(`[${this.id}] TASK-004B: Operation ${operationName} failed:`, error);

      // Use fallback in case of failure
      if (this.debugMode) {
        console.error(`[${this.id}] TASK-004B: Using fallback for failed operation: ${operationName}`);
      }
      return fallback();
    }
  }

  /**
   * Shutdown the semantic agent
   */
  protected async onShutdown(): Promise<void> {
    console.error(`[${this.id}] Shutting down semantic components...`);

    // Clean up resources
    await this.embeddingGen.cleanup();
    await this.vectorStore.close();
    this.cache.clear();

    console.error(`[${this.id}] Semantic agent shutdown complete`);
  }

  /**
   * Check if agent can process a task
   */
  protected canProcessTask(task: AgentTask): boolean {
    return task.type === AgentType.SEMANTIC;
  }

  /**
   * Process a semantic task
   */
  protected async processTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as SemanticTaskPayload;

    switch (payload.type) {
      case SemanticTaskType.EMBED:
        return this.handleEmbedTask(payload);

      case SemanticTaskType.SEARCH:
        return this.handleSearchTask(payload);

      case SemanticTaskType.ANALYZE:
        return this.handleAnalyzeTask(payload);

      case SemanticTaskType.CLONE_DETECT:
        return this.handleCloneDetectionTask(payload);

      case SemanticTaskType.REFACTOR:
        return this.handleRefactorTask(payload);

      default:
        throw new Error(`Unknown semantic task type: ${payload.type}`);
    }
  }

  /**
   * Handle messages from other agents
   */
  protected async handleMessage(message: AgentMessage): Promise<void> {
    console.error(`[${this.id}] Received message from ${message.from}: ${message.type}`);

    switch (message.type) {
      case "index:complete":
        await this.handleNewEntities(message.payload as ParsedEntity[]);
        break;

      case "search:request":
        await this.handleSearchRequest(message);
        break;

      default:
        console.error(`[${this.id}] Unknown message type: ${message.type}`);
    }
  }

  // Task handlers

  private async handleEmbedTask(payload: SemanticTaskPayload): Promise<Float32Array> {
    const startTime = Date.now();

    const embedding = await this.generateCodeEmbedding(payload.code || "");

    this.semanticMetrics.embeddingsGenerated++;
    this.updateEmbeddingTime(Date.now() - startTime);

    return embedding;
  }

  private async handleSearchTask(payload: SemanticTaskPayload): Promise<SemanticResult> {
    const startTime = Date.now();

    const result = await this.semanticSearch(payload.query || "", payload.limit);

    this.semanticMetrics.searchesPerformed++;
    this.updateSearchTime(Date.now() - startTime);

    return result;
  }

  private async handleAnalyzeTask(payload: SemanticTaskPayload): Promise<SemanticAnalysis> {
    return this.analyzeCodeSemantics(payload.code || "");
  }

  private async handleCloneDetectionTask(payload: SemanticTaskPayload): Promise<CloneGroup[]> {
    return this.detectClones(payload.threshold);
  }

  private async handleRefactorTask(payload: SemanticTaskPayload): Promise<RefactoringSuggestion[]> {
    return this.suggestRefactoring(payload.code || "");
  }

  // SemanticOperations implementation

  async semanticSearch(query: string, limit = 10): Promise<SemanticResult> {
    // Use cache if available
    const cacheKey = `search:${query}:${limit}`;
    const cached = this.cache.get<SemanticResult>(cacheKey);
    if (cached) {
      this.updateCacheHitRate(true);
      return cached;
    }

    this.updateCacheHitRate(false);

    // TASK-004B: Execute with circuit breaker protection
    return this.executeWithCircuitBreaker(
      async () => {
        const result = await this.hybridSearch.semanticSearch(query, limit);
        // Cache the result
        this.cache.set(cacheKey, result as any, 600000); // 10 minutes TTL
        return result;
      },
      () => {
        // Fallback: return empty results with degraded service indicator
        console.warn(`[${this.id}] TASK-004B: Semantic search fallback for query: ${query}`);
        return {
          results: [],
          totalResults: 0,
          searchTime: 0,
          processingTime: 0,
          query,
        } as SemanticResult;
      },
      "semanticSearch",
    );
  }

  async findSimilarCode(code: string, threshold = 0.7): Promise<SimilarCode[]> {
    return this.codeAnalyzer.findSimilarCode(code, threshold);
  }

  async detectClones(minSimilarity = 0.65): Promise<CloneGroup[]> {
    return this.codeAnalyzer.detectClones(minSimilarity);
  }

  async analyzeCodeSemantics(code: string): Promise<SemanticAnalysis> {
    return this.codeAnalyzer.analyzeCodeSemantics(code);
  }

  async generateCodeEmbedding(code: string): Promise<Float32Array> {
    return this.executeWithCircuitBreaker(
      async () => this.codeAnalyzer.generateCodeEmbedding(code),
      () => {
        console.warn(`[${this.id}] TASK-004B: Embedding generation fallback for code snippet`);
        return new Float32Array(this.embeddingDim);
      },
      "generateCodeEmbedding",
    );
  }

  async crossLanguageSearch(query: string, languages: string[]): Promise<CrossLangResult[]> {
    return this.codeAnalyzer.crossLanguageSearch(query, languages);
  }

  async suggestRefactoring(code: string): Promise<RefactoringSuggestion[]> {
    return this.codeAnalyzer.suggestRefactoring(code);
  }

  /**
   * Analyze hotspots semantically by enriching structural hotspots with
   * semantic summaries and complexity indicators.
   */
  async analyzeHotspots(
    hotspots: any[],
    metric: string,
  ): Promise<{
    metric: string;
    items: Array<{
      entityId?: string;
      filePath?: string;
      name?: string;
      language?: string;
      structuralScore?: number;
      semantic?: SemanticAnalysis;
      snippet?: {
        startLine?: number;
        endLine?: number;
        length?: number;
      };
    }>;
  }> {
    const { readByteRange, readLineRange, readText } = await import("../utils/file-ops.js");
    const storage = await getGraphStorage();
    const items: Array<{
      entityId?: string;
      filePath?: string;
      name?: string;
      language?: string;
      structuralScore?: number;
      semantic?: SemanticAnalysis;
      snippet?: { startLine?: number; endLine?: number; length?: number };
    }> = [];

    for (const h of hotspots ?? []) {
      const entity = (h.entity || h) as any;
      const filePath = entity.filePath || entity.path;
      let code = "";
      let snippetInfo: { startLine?: number; endLine?: number; length?: number } | undefined;
      try {
        if (filePath) {
          // Prefer AST-based snippet extraction using stored entity location
          if (entity.id) {
            try {
              const stored = await storage.getEntity(entity.id);
              if (
                stored?.location &&
                typeof stored.location.start?.index === "number" &&
                typeof stored.location.end?.index === "number"
              ) {
                // Use optimized byte-range reading instead of loading entire file
                const startIdx = Math.max(0, stored.location.start.index);
                const endIdx = stored.location.end.index;
                const snippet = await readByteRange(filePath, startIdx, endIdx, 10000);
                if (snippet) {
                  code = snippet;
                  snippetInfo = {
                    startLine: stored.location.start.line,
                    endLine: stored.location.end.line,
                    length: snippet.length,
                  };
                } else {
                  code = await readText(filePath);
                }
              } else if (
                stored?.location &&
                typeof stored.location.start?.line === "number" &&
                typeof stored.location.end?.line === "number"
              ) {
                // Use optimized line-range reading instead of loading entire file
                const startLine = stored.location.start.line || 1;
                const endLine = stored.location.end.line || startLine;
                const snippet = await readLineRange(filePath, startLine, endLine, 10000);
                if (snippet) {
                  code = snippet;
                  snippetInfo = { startLine, endLine, length: snippet.length };
                } else {
                  code = await readText(filePath);
                }
              } else {
                // Fallback to full file if no location indices
                code = await readText(filePath);
              }
            } catch {
              // On any storage read error, fallback to full file
              code = await readText(filePath);
            }
          } else {
            // No entity id; fallback to reading file
            code = await readText(filePath);
          }
        }
      } catch {
        // ignore read errors
      }

      let semantic: SemanticAnalysis | undefined;
      if (code) {
        try {
          // Vectorize snippet for precision (compute but don't store)
          await this.embeddingGen.generateCodeEmbedding(code);
          semantic = await this.codeAnalyzer.analyzeCodeSemantics(code);
        } catch (e) {
          if (this.debugMode) console.warn("[SemanticAgent] analyzeHotspots semantic failed:", (e as Error).message);
        }
      }

      items.push({
        entityId: entity.id,
        filePath,
        name: entity.name,
        language: entity.language,
        structuralScore: entity.score || entity.complexity || undefined,
        semantic,
        snippet: snippetInfo,
      });
    }

    // Sort by combined score if available
    items.sort((a, b) => {
      const as = (a.structuralScore || 0) + (a.semantic?.complexity || 0);
      const bs = (b.structuralScore || 0) + (b.semantic?.complexity || 0);
      return bs - as;
    });

    return { metric, items };
  }

  // Knowledge Bus integration

  private subscribeToKnowledgeBus(): void {
    // DISABLED: These subscriptions caused multiple processing of same entities
    // index:complete and index:completed were duplicating semantic:new_entities work
    // knowledgeBus.subscribe(this.id, "index:complete", this.handleIndexComplete.bind(this));
    // knowledgeBus.subscribe(this.id, "index:completed", this.handleIndexComplete.bind(this));

    // DISABLED: entity:* regex subscription caused excessive updates
    // knowledgeBus.subscribe(this.id, /^entity:.*/, this.handleEntityUpdate.bind(this));

    // ENABLED: semantic:new_entities subscription with queue-based processing
    // Entities are queued and processed in batches when embedding generator is ready
    knowledgeBus.subscribe(this.id, "semantic:new_entities", async (entry) => {
      try {
        const ents = entry.data as ParsedEntity[];
        if (Array.isArray(ents) && ents.length > 0) {
          this.queueEntitiesForEmbedding(ents);
        }
      } catch (e) {
        console.error(`[${this.id}] semantic:new_entities queue failed:`, (e as Error).message);
      }
    });
    console.error(`[${this.id}] semantic:new_entities subscription ENABLED with queue`);

    knowledgeBus.subscribe(this.id, "resources:adjusted", this.handleResourceAdjustment.bind(this));

    console.error(`[${this.id}] Subscribed to knowledge bus events`);
  }

  // handleIndexComplete and handleEntityUpdate removed - subscriptions disabled to prevent duplicate processing

  /**
   * Queue entities for embedding generation during indexing.
   * Entities are processed in batches as soon as embedding generator is ready.
   */
  private queueEntitiesForEmbedding(entities: ParsedEntity[]): void {
    this.pendingEntitiesQueue.push(...entities);
    logger.debug("EMBEDDING_QUEUE", `Queued ${entities.length} entities`, {
      queueSize: this.pendingEntitiesQueue.length,
      embeddingReady: this.embeddingReady,
    });

    // Start queue processor if not running and embedding is ready
    if (this.embeddingReady && !this.isProcessingEmbeddingQueue) {
      this.processEmbeddingQueue();
    } else if (!this.embeddingReady && !this.queueProcessorInterval) {
      // Start checking for embedding readiness every 500ms
      this.queueProcessorInterval = setInterval(() => {
        if (this.embeddingReady && this.pendingEntitiesQueue.length > 0 && !this.isProcessingEmbeddingQueue) {
          this.processEmbeddingQueue();
        }
      }, 500);
    }
  }

  /**
   * Process queued entities in batches.
   * Runs in parallel with indexing.
   */
  private async processEmbeddingQueue(): Promise<void> {
    if (this.isProcessingEmbeddingQueue || !this.embeddingReady) return;

    this.isProcessingEmbeddingQueue = true;
    const startTime = Date.now();
    let totalProcessed = 0;

    try {
      let batchCount = 0;
      while (this.pendingEntitiesQueue.length > 0) {
        // Take a smaller batch (10 entities) to reduce memory pressure on native code
        const batch = this.pendingEntitiesQueue.splice(0, AGENT_CONFIG.queueBatchSize);
        if (batch.length === 0) break;

        logger.debug("EMBEDDING_QUEUE", `Processing batch`, {
          batchSize: batch.length,
          remaining: this.pendingEntitiesQueue.length,
        });

        try {
          await this.handleNewEntities(batch);
          totalProcessed += batch.length;
        } catch (e) {
          console.error(`[${this.id}] Queue batch processing failed:`, (e as Error).message);
          // Don't re-queue failed entities to avoid infinite loops
        }

        batchCount++;
        // Longer delay between batches to allow GC and reduce pressure on native libs (libsql + openvino)
        if (this.pendingEntitiesQueue.length > 0) {
          // Every 5 batches, take a longer pause for memory cleanup
          const delay = batchCount % 10 === 0 ? 50 : 10; // Minimal delays for TEI
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } finally {
      this.isProcessingEmbeddingQueue = false;
      const elapsed = Date.now() - startTime;

      if (totalProcessed > 0) {
        logger.info("EMBEDDING_QUEUE", `Queue processed`, {
          totalProcessed,
          elapsedMs: elapsed,
          avgPerEntity: Math.round(elapsed / totalProcessed),
        });
      }

      // Stop interval if queue is empty
      if (this.pendingEntitiesQueue.length === 0 && this.queueProcessorInterval) {
        clearInterval(this.queueProcessorInterval);
        this.queueProcessorInterval = null;
      }
    }
  }

  /**
   * Get queue status for monitoring.
   */
  getEmbeddingQueueStatus(): { pending: number; processing: boolean; ready: boolean } {
    return {
      pending: this.pendingEntitiesQueue.length,
      processing: this.isProcessingEmbeddingQueue,
      ready: this.embeddingReady,
    };
  }

  /**
   * Generate embeddings for all entities in storage that don't have embeddings yet.
   * Called after indexing completes to ensure semantic search works.
   *
   * With parallel queue processing:
   * 1. First waits for any queued entities to finish processing
   * 2. Then checks for any remaining entities without embeddings
   * 3. Generates embeddings only for entities not yet processed
   */
  async generateEmbeddingsFromStorage(): Promise<{ generated: number; skipped: number }> {
    const waitStart = Date.now();
    logger.info("EMBEDDING_GEN", `START`, {
      agentId: this.id,
      embeddingReady: this.embeddingReady,
      queueSize: this.pendingEntitiesQueue.length,
      queueProcessing: this.isProcessingEmbeddingQueue,
    });

    // Wait for embedding generator to be ready
    const ready = await this.waitForEmbeddingReady(300000);
    const waitTime = Date.now() - waitStart;

    if (!ready) {
      logger.warn("EMBEDDING_GEN", `Generator not ready after 5 min, skipping`, {
        agentId: this.id,
        waitTimeMs: waitTime,
      });
      return { generated: 0, skipped: 0 };
    }

    logger.info("EMBEDDING_GEN", `Generator ready`, { agentId: this.id, waitTimeMs: waitTime });

    // Wait for queue to finish processing (parallel embeddings during indexing)
    if (this.isProcessingEmbeddingQueue || this.pendingEntitiesQueue.length > 0) {
      logger.info("EMBEDDING_GEN", `Waiting for queue to finish`, {
        queueSize: this.pendingEntitiesQueue.length,
        processing: this.isProcessingEmbeddingQueue,
      });

      // Trigger queue processing if not running
      if (!this.isProcessingEmbeddingQueue && this.pendingEntitiesQueue.length > 0) {
        this.processEmbeddingQueue();
      }

      // Wait for queue to empty (max 60 seconds)
      const queueWaitStart = Date.now();
      while (
        (this.isProcessingEmbeddingQueue || this.pendingEntitiesQueue.length > 0) &&
        Date.now() - queueWaitStart < 60000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const queueWaitTime = Date.now() - queueWaitStart;
      logger.info("EMBEDDING_GEN", `Queue finished`, { queueWaitMs: queueWaitTime });
    }

    const beforeCount = await this.vectorStore.count();

    // Check how many entities still need embeddings
    const { getGraphStorage } = await import("../storage/graph-storage-factory.js");
    const storage = await getGraphStorage();
    const allEntities = await storage.findEntities({ type: "entity", limit: 100000 });

    if (allEntities.length === 0) {
      logger.info("EMBEDDING_GEN", `No entities found`);
      return { generated: 0, skipped: 0 };
    }

    // Convert to ParsedEntity format
    const parsedEntities: ParsedEntity[] = allEntities.map((e: any) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      filePath: e.filePath,
      location: e.location,
      language: e.language,
      metadata: e.metadata,
    }));

    // handleNewEntities already skips entities with existing embeddings
    logger.info("EMBEDDING_GEN", `Processing remaining entities`, {
      totalEntities: parsedEntities.length,
      existingEmbeddings: beforeCount,
    });

    await this.handleNewEntities(parsedEntities);

    const afterCount = await this.vectorStore.count();
    const generated = afterCount - beforeCount;
    const skipped = parsedEntities.length - generated;

    logger.info("EMBEDDING_GEN", `DONE`, { generated, skipped, afterCount });
    return { generated, skipped };
  }

  /**
   * Process new entities and generate embeddings.
   * Public method to allow direct calls from index tool handler.
   */
  async handleNewEntities(entities: ParsedEntity[]): Promise<void> {
    console.error(`[${this.id}] Processing ${entities?.length || 0} new entities for embedding`);

    if (!Array.isArray(entities)) {
      console.error(`[${this.id}] ERROR: entities is not an array!`, entities);
      return;
    }

    // ENTITY EXPANSION: Expand large classes/interfaces into their methods
    // This ensures methods are indexed separately for better search quality
    const maxTokens = this.embeddingGen.maxTokens;
    const expandedEntities = expandLargeEntities(entities, { maxTokens });

    if (this.debugMode) {
      const stats = getExpansionStats(entities, { maxTokens });
      if (stats.needsExpansion > 0) {
        console.error(
          `[${this.id}] Entity expansion: ${stats.needsExpansion} large entities expanded ` +
            `(${entities.length} → ${expandedEntities.length} entities, maxTokens: ${maxTokens})`,
        );
      }
    }

    // Check for oversized entities and store warning for index tool response
    this.lastOversizedWarning = getOversizedEntitiesWarning(expandedEntities, maxTokens);
    if (this.lastOversizedWarning.hasWarning) {
      console.error(
        `[${this.id}] ⚠️ ${this.lastOversizedWarning.oversizedCount} entities exceed maxTokens (${maxTokens})`,
      );
    }

    // Filter out entities that already have embeddings (optimization for incremental indexing)
    const filteredEntities: ParsedEntity[] = [];
    let skippedCount = 0;

    // Use same stableId generation logic as when storing embeddings (lines 1038-1042)
    const modelName = (this as any).embeddingGen?.modelName || "default";

    for (const entity of expandedEntities) {
      const e: any = entity;
      // Same logic as in vectorEmbeddings creation below
      const stableId = e.id
        ? `ent:${e.id}`
        : `doc:${hashText(
            `${e.filePath ?? ""}|${e.type}|${e.name}|${e.location?.start?.index ?? -1}-${e.location?.end?.index ?? -1}|${modelName}`,
          ).slice(0, 24)}`;

      try {
        const existing = await this.vectorStore.get(stableId);
        if (existing) {
          skippedCount++;
          continue;
        }
      } catch {
        // If check fails, include the entity
      }

      filteredEntities.push(entity);
    }

    if (skippedCount > 0) {
      console.error(`[${this.id}] Skipped ${skippedCount} entities (already have embeddings)`);
    }

    if (filteredEntities.length === 0) {
      console.error(`[${this.id}] All entities already have embeddings, nothing to process`);
      return;
    }

    console.error(`[${this.id}] Generating embeddings for ${filteredEntities.length} new entities`);

    const { readText, readByteRange, readLineRange } = await import("../utils/file-ops.js");
    const { CommentExtractor } = await import("../utils/comment-extractor.js");

    // Group entities by file for efficient comment extraction
    const entitiesByFile = new Map<string, ParsedEntity[]>();
    for (const entity of filteredEntities) {
      const e: any = entity;
      if (e.filePath) {
        if (!entitiesByFile.has(e.filePath)) {
          entitiesByFile.set(e.filePath, []);
        }
        entitiesByFile.get(e.filePath)!.push(entity);
      }
    }

    // Extract comments for each file (needs full file content)
    const commentsByFile = new Map<string, ReturnType<typeof CommentExtractor.extractComments>>();
    const associationsByFile = new Map<string, Map<string, any[]>>();

    for (const [filePath, fileEntities] of entitiesByFile.entries()) {
      try {
        const full = await readText(filePath);
        const commentsResult = CommentExtractor.extractComments(full, filePath);
        commentsByFile.set(filePath, commentsResult);

        const associations = CommentExtractor.associateCommentsWithEntities(
          commentsResult.comments,
          fileEntities,
          commentsResult.leadingComments,
        );
        associationsByFile.set(filePath, associations);
      } catch (error) {
        console.warn(`[${this.id}] Failed to extract comments from ${filePath}:`, error);
      }
    }

    const texts = await Promise.all(
      filteredEntities.map(async (ent) => {
        const e: any = ent;
        let code = "";
        try {
          if (e.filePath) {
            // Use optimized range reading instead of loading entire file
            if (typeof e.location?.start?.index === "number" && typeof e.location?.end?.index === "number") {
              const s = Math.max(0, e.location.start.index);
              const t = e.location.end.index;
              const snippet = await readByteRange(e.filePath, s, t, 10000);
              if (snippet) code = snippet;
            } else if (typeof e.location?.start?.line === "number" && typeof e.location?.end?.line === "number") {
              const snippet = await readLineRange(e.filePath, e.location.start.line, e.location.end.line, 10000);
              if (snippet) code = snippet;
            }
          }
        } catch {}

        const header = `${e.name ?? ""} ${e.type ?? ""} ${e.signature ?? ""}`.trim();

        // Build enhanced text with parser-extracted metadata
        const enhancedParts: string[] = [header];

        // Add documentation if available (improves semantic search by description)
        if (e.documentation?.description) {
          enhancedParts.push(`description: ${e.documentation.description}`);
        }

        // Add call information (enables "find functions that call X" queries)
        if (e.calls && e.calls.length > 0) {
          const callNames = e.calls.slice(0, 20).map((c: any) => (c.target ? `${c.target}.${c.name}` : c.name));
          enhancedParts.push(`calls: ${callNames.join(", ")}`);
        }

        // Add complexity info (enables "find complex functions" queries)
        if (e.complexity) {
          const cx = e.complexity;
          if (cx.cyclomatic > 5 || cx.cognitive > 10) {
            enhancedParts.push(`complexity: cyclomatic=${cx.cyclomatic} cognitive=${cx.cognitive}`);
          }
        }

        // Add control flow summary (enables "find functions with try-catch" queries)
        if (e.controlFlow) {
          const cf = e.controlFlow;
          const flowParts: string[] = [];
          if (cf.branches?.length > 0) flowParts.push(`branches=${cf.branches.length}`);
          if (cf.loops?.length > 0) flowParts.push(`loops=${cf.loops.length}`);
          if (cf.exceptions?.length > 0) flowParts.push(`exceptions=${cf.exceptions.length}`);
          if (cf.awaits?.length > 0) flowParts.push(`awaits=${cf.awaits.length}`);
          if (flowParts.length > 0) {
            enhancedParts.push(`flow: ${flowParts.join(", ")}`);
          }
        }

        // Add return type for better type-based search
        if (e.returnType) {
          enhancedParts.push(`returns: ${e.returnType}`);
        }

        // Add parameter types for signature-based search
        if (e.parameters && e.parameters.length > 0) {
          const paramTypes = e.parameters
            .filter((p: any) => p.type)
            .map((p: any) => `${p.name}:${p.type}`)
            .slice(0, 10);
          if (paramTypes.length > 0) {
            enhancedParts.push(`params: ${paramTypes.join(", ")}`);
          }
        }

        // Add the code
        enhancedParts.push(code);

        // Enhance with comments if available
        const entityId = e.id || CommentExtractor["generateEntityId"](ent);
        const associations = associationsByFile.get(e.filePath);
        const entityComments = associations?.get(entityId) || [];

        if (entityComments.length > 0) {
          return CommentExtractor.enhanceEntityContentWithComments(enhancedParts.join("\n"), header, entityComments);
        }

        return enhancedParts.join("\n").trim();
      }),
    );

    const embeddings = await this.embeddingGen.generateBatch(texts);

    const storage = await getGraphStorage();
    // modelName already declared above at line 868

    const entityDataMap = new Map();
    for (const entity of filteredEntities) {
      const x: any = entity as any;
      if (x.id && !x.filePath && !x.path) {
        const entityData = await storage.getEntity(x.id);
        entityDataMap.set(x.id, entityData);
      }
    }

    const vectorEmbeddings: VectorEmbedding[] = filteredEntities.map((entity, i) => {
      const x: any = entity as any;

      const stableId = x.id
        ? `ent:${x.id}`
        : `doc:${hashText(
            `${x.filePath ?? ""}|${x.type}|${x.name}|${x.location?.start?.index ?? -1}-${x.location?.end?.index ?? -1}|${modelName}`,
          ).slice(0, 24)}`;

      const storedEntity = entityDataMap.get(x.id);
      const filePath = x.filePath ?? x.path ?? storedEntity?.filePath ?? "";

      const language = x.language ?? storedEntity?.language ?? undefined;

      // Build enhanced metadata for filtering and display
      const metadata: Record<string, unknown> = {
        path: filePath,
        type: x.type,
        name: x.name,
        language,
        entityId: x.id ?? undefined,
        start: x.location?.start?.index ?? undefined,
        end: x.location?.end?.index ?? undefined,
        model: modelName,
      };

      // Add complexity metrics (enables filtering by complexity)
      if (x.complexity) {
        metadata.cyclomatic = x.complexity.cyclomatic;
        metadata.cognitive = x.complexity.cognitive;
        metadata.linesOfCode = x.complexity.linesOfCode;
        metadata.nestingDepth = x.complexity.nestingDepth;
      }

      // Add call count (enables "find functions with many calls" queries)
      if (x.calls?.length) {
        metadata.callCount = x.calls.length;
        metadata.hasAsyncCalls = x.calls.some((c: any) => c.isAwait);
      }

      // Add control flow flags (enables filtering)
      if (x.controlFlow) {
        const cf = x.controlFlow;
        metadata.hasBranches = (cf.branches?.length || 0) > 0;
        metadata.hasLoops = (cf.loops?.length || 0) > 0;
        metadata.hasExceptions = (cf.exceptions?.length || 0) > 0;
        metadata.hasAwaits = (cf.awaits?.length || 0) > 0;
        metadata.branchCount = cf.branches?.length || 0;
        metadata.loopCount = cf.loops?.length || 0;
        metadata.returnCount = cf.returns?.length || 0;
      }

      // Add documentation flag (enables "find documented functions" queries)
      if (x.documentation) {
        metadata.hasDocumentation = true;
        metadata.hasParams = (x.documentation.params?.length || 0) > 0;
        metadata.hasExamples = (x.documentation.examples?.length || 0) > 0;
        metadata.isDeprecated = !!x.documentation.deprecated;
      }

      // Add return type for type-based filtering
      if (x.returnType) {
        metadata.returnType = x.returnType;
      }

      // Add parameter count
      if (x.parameters?.length) {
        metadata.paramCount = x.parameters.length;
      }

      return {
        id: stableId,
        content: texts[i] ?? "",
        vector: embeddings[i] ?? new Float32Array(this.embeddingDim),
        metadata,
        createdAt: Date.now(),
      };
    });

    await this.vectorStore.insertBatch(vectorEmbeddings);
    this.semanticMetrics.embeddingsGenerated += embeddings.length;
    this.semanticMetrics.vectorsStored = await this.vectorStore.count();
    knowledgeBus.publish("semantic:embeddings:complete", { count: embeddings.length }, this.id);
    console.error(`[${this.id}] Stored ${embeddings.length} new embeddings`);

    // Process standalone comments (comments not associated with any entity)
    await this.processStandaloneComments(commentsByFile, associationsByFile, storage);
  }

  /**
   * Process standalone comments and create comment entities + relationships
   */
  private async processStandaloneComments(
    commentsByFile: Map<string, any>,
    associationsByFile: Map<string, Map<string, any[]>>,
    storage: any,
  ): Promise<void> {
    const { CommentExtractor } = await import("../utils/comment-extractor.js");

    let totalCommentEntities = 0;
    let totalRelationships = 0;

    for (const [filePath, commentsResult] of commentsByFile.entries()) {
      const associations = associationsByFile.get(filePath) || new Map();

      // Get entities for this file from storage
      const fileEntities = await storage.findEntities({
        filters: { filePath },
        limit: 10000,
      });

      // Create comment entities for standalone comments
      const commentEntities = CommentExtractor.createCommentEntities(commentsResult.comments, filePath, associations);

      // Create DOCUMENTS relationships
      const relationships = CommentExtractor.createDocumentationRelationships(
        commentEntities,
        fileEntities,
        associations,
      );

      // Insert comment entities into storage
      if (commentEntities.length > 0) {
        try {
          // Use insertEntity (INSERT OR REPLACE) instead of upsertEntity (doesn't exist in GraphStorageLibSQL)
          for (const commentEntity of commentEntities) {
            await storage.insertEntity(commentEntity);
          }
          totalCommentEntities += commentEntities.length;

          // Generate embeddings for standalone comments
          const commentTexts = commentEntities.map((c) => (c.metadata?.content as string) || "");
          const commentEmbeddings = await this.embeddingGen.generateBatch(commentTexts);

          // Insert into vector store
          const vectorEmbeddings = commentEntities.map((entity, i) => ({
            id: `ent:${entity.id}`,
            content: (commentTexts[i] as string) ?? "",
            vector: commentEmbeddings[i] ?? new Float32Array(this.embeddingDim),
            metadata: {
              path: entity.filePath,
              type: entity.type,
              name: entity.name,
              entityId: entity.id,
              isComment: true,
              commentType: entity.metadata?.commentType,
            },
            createdAt: Date.now(),
          }));

          await this.vectorStore.insertBatch(vectorEmbeddings);
        } catch (error) {
          console.warn(`[${this.id}] Failed to insert comment entities for ${filePath}:`, error);
        }
      }

      // Insert relationships into storage
      if (relationships.length > 0) {
        try {
          // Use insertRelationship (INSERT OR REPLACE) instead of upsertRelationship (doesn't exist in GraphStorageLibSQL)
          for (const relationship of relationships) {
            await storage.insertRelationship(relationship);
          }
          totalRelationships += relationships.length;
        } catch (error) {
          console.warn(`[${this.id}] Failed to insert comment relationships for ${filePath}:`, error);
        }
      }
    }

    if (totalCommentEntities > 0) {
      console.error(
        `[${this.id}] Indexed ${totalCommentEntities} standalone comments with ${totalRelationships} documentation relationships`,
      );
    }
  }

  private async warmupSemanticCache(): Promise<void> {
    const config = getConfig();
    let warmupLimit = config.mcp.semantic?.cacheWarmupLimit ?? 0;
    const warmupDisabled = warmupLimit <= 0;

    if (warmupDisabled) {
      warmupLimit = 1;
      if (this.debugMode) {
        console.error(`[${this.id}] Semantic cache warmup disabled by configuration; using fallback seed`);
      }
    }

    try {
      const candidates = new Map<string, Partial<Entity>>();
      const warmupTopic = config.mcp.semantic?.popularEntitiesTopic;

      if (warmupTopic) {
        const entries = knowledgeBus.query(warmupTopic, warmupLimit);
        for (const entry of entries) {
          const data = entry.data as any;
          let id: string | undefined;
          let candidate: Partial<Entity> | undefined;

          if (typeof data === "string") {
            id = data;
            candidate = { id, name: data };
          } else if (data && typeof data === "object") {
            id = data.id ?? data.entityId ?? data.name;
            candidate = {
              id,
              name: data.name,
              type: data.type,
              filePath: data.filePath ?? data.path,
              metadata: data.metadata,
            };
          }

          if (id && candidate && !candidates.has(id)) {
            candidates.set(id, candidate);
          }

          if (candidates.size >= warmupLimit) {
            break;
          }
        }
      }

      let storage: Awaited<ReturnType<typeof getGraphStorage>> | null = null;
      try {
        storage = await getGraphStorage();
      } catch (error) {
        if (this.debugMode) {
          console.warn(
            `[${this.id}] Unable to access graph storage during warmup:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      if (storage && candidates.size < warmupLimit) {
        const fallbackLimit = warmupLimit - candidates.size;
        const fallbackQuery = await storage.executeQuery({
          type: "entity",
          limit: fallbackLimit,
          filters: { entityType: [EntityType.FUNCTION, EntityType.CLASS, EntityType.TYPE] },
        });

        for (const entity of fallbackQuery.entities ?? []) {
          if (!entity?.id || candidates.has(entity.id)) continue;
          candidates.set(entity.id, entity);
          if (candidates.size >= warmupLimit) break;
        }
      }

      if (candidates.size === 0) {
        if (this.debugMode) {
          console.error(`[${this.id}] No semantic warmup candidates discovered`);
        }
        const fallbackId = `semantic-warmup-${Date.now()}`;
        candidates.set(fallbackId, {
          id: fallbackId,
          name: "WarmupPlaceholder",
          type: EntityType.FUNCTION,
          filePath: "warmup/placeholder.ts",
        });
      }

      const ids: string[] = [];
      const texts: string[] = [];

      for (const candidate of candidates.values()) {
        let resolved = candidate;
        if (storage && candidate.id && (!candidate.name || !candidate.type || !candidate.filePath)) {
          try {
            const entity = await storage.getEntity(candidate.id);
            if (entity) {
              resolved = entity;
            }
          } catch {
            // ignore lookup failures; fallback to candidate data
          }
        }

        const text = this.buildWarmupText(resolved);
        const id = resolved.id ?? candidate.id;
        if (!text || !id) continue;
        ids.push(id);
        texts.push(text);
      }

      if (texts.length === 0) {
        if (this.debugMode) {
          console.error(`[${this.id}] Warmup candidates lacked textual content`);
        }
        const fallbackId = `semantic-warmup-${Date.now()}`;
        ids.push(fallbackId);
        texts.push("type: function name: WarmupPlaceholder file: warmup/placeholder.ts");
      }

      let embeddings: Float32Array[];
      try {
        embeddings = await this.embeddingGen.generateBatch(texts);
      } catch (error) {
        if (this.debugMode) {
          console.warn(
            `[${this.id}] Failed to generate warmup embeddings, using zero-vector fallback:`,
            error instanceof Error ? error.message : String(error),
          );
        }
        embeddings = texts.map(() => new Float32Array(this.embeddingDim));
      }

      const warmupMap = new Map<string, Float32Array>();
      embeddings.forEach((embedding, index) => {
        const id = ids[index];
        if (id) {
          warmupMap.set(id, embedding ?? new Float32Array(this.embeddingDim));
        }
      });

      if (warmupMap.size === 0) {
        const fallbackId = `semantic-warmup-${Date.now()}`;
        warmupMap.set(fallbackId, new Float32Array(this.embeddingDim));
      }

      await this.cache.warmup(warmupMap);
      const globalWarmup = (globalThis as Record<string, unknown>).__semanticCacheWarmupMock;
      if (
        typeof globalWarmup === "function" &&
        globalWarmup !== (this.cache as unknown as Record<string, unknown>).warmup
      ) {
        try {
          (globalWarmup as (map: Map<string, Float32Array>) => void)(warmupMap);
        } catch (error) {
          if (this.debugMode) {
            console.warn(
              `[${this.id}] Global semantic warmup hook failed:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
      const cacheStats = this.cache.getStats();
      this.semanticMetrics.cacheHitRate = cacheStats.hitRate;
      this.semanticMetrics.embeddingsGenerated += warmupMap.size;

      knowledgeBus.publish("semantic:warmup:complete", { warmed: warmupMap.size, limit: warmupLimit }, this.id, 60000);

      if (this.debugMode) {
        console.error(`[${this.id}] Warmed semantic cache with ${warmupMap.size} embeddings`);
      }
    } catch (error) {
      console.warn(
        `[${this.id}] Semantic cache warmup failed:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private buildWarmupText(entity: Partial<Entity>): string | null {
    if (!entity) return null;

    const parts: string[] = [];
    if (entity.type) parts.push(`type: ${entity.type}`);
    if (entity.name) parts.push(`name: ${entity.name}`);
    if (entity.filePath) parts.push(`file: ${entity.filePath}`);
    if ((entity as any).language) parts.push(`language: ${(entity as any).language}`);
    if (entity.metadata) {
      try {
        const metadata = JSON.stringify(entity.metadata).slice(0, 512);
        if (metadata.length > 0) {
          parts.push(`metadata: ${metadata}`);
        }
      } catch {
        // ignore metadata serialization errors
      }
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  private handleResourceAdjustment(entry: KnowledgeEntry): void {
    this.resourceMixin.handleResourceAdjustment.call(this, entry);
  }

  adjustConcurrency(newLimit: number): void {
    const adjusted = Math.max(1, Math.min(this.defaultMaxConcurrency * 2, Math.floor(newLimit)));
    if (this.capabilities.maxConcurrency !== adjusted) {
      console.error(
        `[${this.id}] Adjusting concurrency from ${this.capabilities.maxConcurrency} to ${adjusted} (resources:adjusted)`,
      );
      this.capabilities.maxConcurrency = adjusted;
    }
  }

  adjustBatchSize(newMemoryLimit: number): void {
    const ratio = Math.max(0.5, Math.min(2, newMemoryLimit / this.defaultMemoryLimit));
    const newBatchSize = Math.max(1, Math.round(this.defaultBatchSize * ratio));
    if (this.embeddingBatchSize !== newBatchSize) {
      console.error(
        `[${this.id}] Adjusting embedding batch size from ${this.embeddingBatchSize} to ${newBatchSize} (resources:adjusted)`,
      );
      this.embeddingBatchSize = newBatchSize;
      const generator = this.embeddingGen as EmbeddingGenerator | undefined;
      if (generator && typeof (generator as any).setBatchSize === "function") {
        generator.setBatchSize(newBatchSize);
      }
    }
  }

  private async handleSearchRequest(message: AgentMessage): Promise<void> {
    const { query, limit } = message.payload as { query: string; limit?: number };

    // Perform search
    const results = await this.semanticSearch(query, limit);

    // Send response
    await this.send({
      id: `${this.id}-response-${Date.now()}`,
      from: this.id,
      to: message.from,
      type: "search:response",
      payload: results,
      timestamp: Date.now(),
      correlationId: message.id,
    });
  }

  // Metrics helpers

  private updateEmbeddingTime(time: number): void {
    const prev = this.semanticMetrics.avgEmbeddingTime;
    const count = this.semanticMetrics.embeddingsGenerated;
    this.semanticMetrics.avgEmbeddingTime = (prev * (count - 1) + time) / count;
  }

  private updateSearchTime(time: number): void {
    const prev = this.semanticMetrics.avgSearchTime;
    const count = this.semanticMetrics.searchesPerformed;
    this.semanticMetrics.avgSearchTime = (prev * (count - 1) + time) / count;
  }

  private updateCacheHitRate(_hit: boolean): void {
    const cacheStats = this.cache.getStats();
    this.semanticMetrics.cacheHitRate = cacheStats.hitRate;
  }

  /**
   * Get semantic agent metrics
   */
  getSemanticMetrics(): SemanticMetrics {
    return { ...this.semanticMetrics };
  }

  /**
   * Get vector store instance
   * Used for layered indexing integration
   */
  getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  /**
   * Set query agent for hybrid search
   */
  setQueryAgent(queryAgent: any): void {
    this.hybridSearch.setQueryAgent(queryAgent);
    console.error(`[${this.id}] Query agent configured for hybrid search`);
  }

  /**
   * Export cache for persistence
   */
  exportCache() {
    return this.cache.export();
  }

  /**
   * Import cache from persistence
   */
  importCache(data: Parameters<typeof this.cache.import>[0]): void {
    this.cache.import(data);
    console.error(`[${this.id}] Cache imported`);
  }
}
