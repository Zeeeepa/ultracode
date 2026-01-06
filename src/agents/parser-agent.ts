/**
 * TASK-001: Parser Agent Implementation
    const memoryThreshold = config.memoryLimit * 0.8;      if (usage.memory > config.memoryLimit * 0.9) { * High-performance parser agent using tree-sitter for code analysis.
 * Achieves 100+ files/second throughput with incremental parsing.
 *
 * Architecture References:
 * - Base Agent: src/agents/base.ts
 * - Agent Types: src/types/agent.ts
 * - Parser Types: src/types/parser.ts
 * - Incremental Parser: src/parsers/incremental-parser.ts
 */

import type { EventEmitter } from "node:events";
import { extname } from "node:path";
// =============================================================================
// 1. IMPORTS AND DEPENDENCIES
// =============================================================================
import { getConfig } from "../config/yaml-config.js";
import { log } from "../logging/index.js";
// NOTE: IncrementalParser removed from main - all parsing done via subprocess workers
import { isFileSupported } from "../parsers/language-configs.js";
import { type EmbeddingAccumulator, getEmbeddingAccumulator } from "../semantic/embedding-accumulator.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { FileChange, ParseResult, ParserOptions, ParserStats, ParserTask } from "../types/parser.js";
import type { WorkerEmbeddingConfig } from "../types/semantic.js";
import { BaseAgent } from "./base.js";
import type { BinaryEmbedding } from "./workers/language-worker-pool.js";
import { ParsingSubprocessPool, type StreamingResultCallback } from "./workers/parsing-subprocess-pool.js";

// =============================================================================
// 2. CONSTANTS AND CONFIGURATION
// =============================================================================
function getParserConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.parser.agent?.maxConcurrency ?? 4,
    memoryLimit: config.parser.agent?.memoryLimit ?? 512,
    priority: config.parser.agent?.priority ?? 8,
    batchSize: config.parser.agent?.batchSize ?? 20,
    cacheSize: config.parser.agent?.cacheSize ?? 100 * 1024 * 1024,
    workerPoolSize: config.parser.agent?.workerPoolSize ?? 8,
  };
}

// Knowledge Bus topics
const TOPICS = {
  PARSE_COMPLETE: "parse:complete",
  PARSE_FAILED: "parse:failed",
  FILE_CHANGED: "file:changed",
  CACHE_UPDATED: "cache:updated",
};

// =============================================================================
// 3. DATA MODELS AND TYPE DEFINITIONS
// =============================================================================
// Note: WorkerTask interface would be used for actual worker thread implementation

// =============================================================================
// 4. UTILITY FUNCTIONS AND HELPERS
// =============================================================================

/**
 * Filter files to only supported extensions
 */
function filterSupportedFiles(files: string[]): string[] {
  return files.filter((file) => isFileSupported(file));
}

/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();

  const languageMap: Record<string, string> = {
    ".py": "python",
    ".pyi": "python",
    ".pyw": "python",
    ".rs": "rust",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".java": "java",
    ".go": "go",
    ".c": "c",
    ".h": "c",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".css": "css",
    ".scss": "css",
    ".sass": "css",
    ".less": "css",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
  };

  return languageMap[ext] || "unknown";
}

/**
 * Group files by programming language
 */
function groupFilesByLanguage(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const language = detectLanguage(file);
    if (language !== "unknown") {
      const existing = groups.get(language) || [];
      existing.push(file);
      groups.set(language, existing);
    }
  }

  return groups;
}

// =============================================================================
// 5. CORE BUSINESS LOGIC
// =============================================================================

/**
 * Parser Agent - High-performance code parsing with tree-sitter
 *
 * Enhanced with language-specific worker pools for maximum parallelism:
 * - Python: 4 workers (266ms/file → 78ms target)
 * - Rust: 4 workers (30-40ms/file → optimized)
 * - C#, C++, Java, Go, C, TypeScript, JavaScript, VBA: dedicated pools
 *
 * Optimizations:
 * - Lazy initialization: pools created only for used languages
 * - Threshold: workers activated only for 50+ files
 * - Pool reuse: workers persist across indexing sessions
 */
// All parsing via subprocess workers for memory isolation
type WorkerPool = ParsingSubprocessPool;

export class ParserAgent extends BaseAgent {
  private languagePools: Map<string, WorkerPool> = new Map();
  private knowledgeBus: EventEmitter | null = null;
  private isProcessing = false;
  private stats: ParserStats;
  private keepPoolsAlive: boolean = false; // Kill pools after batch for memory release
  private embeddingConfig: WorkerEmbeddingConfig | null = null; // Embedding config for workers
  private embeddingAccumulator: EmbeddingAccumulator | null = null; // Accumulator for batch FAISS flush
  private onVectorsWritten: ((workerId: string, count: number, dumpDir: string) => void) | null = null; // Callback for incremental Faiss load
  private streamingMode: boolean = false; // Streaming mode: send results as they become ready
  private onStreamingResult: StreamingResultCallback | null = null; // Callback for streaming results

  constructor(knowledgeBus?: EventEmitter) {
    const config = getParserConfig();

    // TASK-001: Initialize with optimized configuration
    super(AgentType.PARSER, {
      maxConcurrency: config.maxConcurrency,
      memoryLimit: config.memoryLimit,
      priority: config.priority,
    });

    this.knowledgeBus = knowledgeBus || null;

    this.stats = {
      filesParsed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgParseTimeMs: 0,
      totalParseTimeMs: 0,
      throughput: 0,
      cacheMemoryMB: 0,
      errorCount: 0,
    };

    this.setupEventHandlers();
  }

  /**
   * Get callback for handling binary embeddings from workers
   * Routes embeddings to accumulator for batch FAISS flush
   */
  private getEmbeddingsCallback(): (embeddings: BinaryEmbedding[]) => void {
    return (embeddings: BinaryEmbedding[]) => {
      if (!this.embeddingAccumulator) {
        // Lazy init accumulator on first embeddings
        this.embeddingAccumulator = getEmbeddingAccumulator();
        log.d("PARSER", "Initialized embedding accumulator");
      }
      // Add to accumulator (will auto-flush when threshold reached)
      this.embeddingAccumulator.addBinaryEmbeddings(embeddings).catch((err) => {
        log.e("PARSER", "Failed to add embeddings to accumulator", {
          error: (err as Error).message,
        });
      });
    };
  }

  /**
   * Get the embedding accumulator for external flush/stats access
   */
  getAccumulator(): EmbeddingAccumulator | null {
    return this.embeddingAccumulator;
  }

  /**
   * Initialize the parser agent
   */
  protected async onInitialize(): Promise<void> {
    log.i("PARSER", `Initializing Parser Agent (subprocess mode)`);

    // Initialize worker pool for parallel processing
    await this.initializeWorkerPool();

    // Subscribe to knowledge bus events
    if (this.knowledgeBus) {
      this.knowledgeBus.on(TOPICS.FILE_CHANGED, this.handleFileChange.bind(this));
    }

    const config = getParserConfig();
    log.i("PARSER", `Parser Agent initialized with ${config.workerPoolSize} workers`);
  }

  /**
   * Shutdown the parser agent
   *
   * Optimization: Worker pools are NOT shutdown by default to enable reuse.
   * Call destroyWorkerPools() explicitly if you need to cleanup workers.
   */
  protected async onShutdown(): Promise<void> {
    log.i("PARSER", `Shutting down Parser Agent...`);

    // Optimization 3: Keep worker pools alive for reuse (unless explicitly disabled)
    if (!this.keepPoolsAlive) {
      log.i("PARSER", `Shutting down worker pools...`);
      const shutdownPromises: Promise<void>[] = [];
      for (const [_language, pool] of this.languagePools) {
        shutdownPromises.push(pool.shutdown());
      }
      await Promise.all(shutdownPromises);
      this.languagePools.clear();
    } else {
      log.i("PARSER", `Worker pools kept alive for reuse (${this.languagePools.size} pools active)`);
    }

    // NOTE: Cache clearing removed - caches are per-subprocess worker now

    // Unsubscribe from events
    if (this.knowledgeBus) {
      this.knowledgeBus.removeAllListeners(TOPICS.FILE_CHANGED);
    }

    log.i("PARSER", `Parser Agent shutdown complete`);
  }

  /**
   * Explicitly destroy all worker pools (cleanup)
   *
   * Call this when you want to fully cleanup workers:
   * - Before process exit
   * - When switching configurations
   * - For testing cleanup
   */
  async destroyWorkerPools(): Promise<void> {
    log.i("PARSER", `Destroying worker pools...`);

    const shutdownPromises: Promise<void>[] = [];
    for (const [language, pool] of this.languagePools) {
      log.i("PARSER", `Shutting down ${language} pool...`);
      shutdownPromises.push(pool.shutdown());
    }

    await Promise.all(shutdownPromises);
    this.languagePools.clear();

    log.i("PARSER", `All worker pools destroyed`);
  }

  /**
   * Check if agent can process the task
   */
  protected canProcessTask(task: AgentTask): boolean {
    if (!this.isParserTask(task)) return false;

    const parserTask = task as ParserTask;

    // Check task type
    if (!["parse:file", "parse:batch", "parse:incremental"].includes(parserTask.type)) {
      return false;
    }

    // Memory limit check disabled - let OS handle memory
    return true;
  }

  /**
   * Process a parser task
   */
  protected async processTask(task: AgentTask): Promise<ParseResult[]> {
    if (!this.isParserTask(task)) {
      throw new Error(`Invalid task type for Parser Agent: ${task.type}`);
    }

    const parserTask = task as ParserTask;
    const startTime = Date.now();

    log.i("PARSER", `Processing task: ${parserTask.type}`);

    try {
      let results: ParseResult[] = [];

      switch (parserTask.type) {
        case "parse:file":
          // Single file parsing
          if (parserTask.payload.files && parserTask.payload.files.length > 0) {
            const filePath = parserTask.payload.files[0];
            if (filePath) {
              const result = await this.parseFile(filePath, parserTask.payload.options);
              results = [result];
            }
          }
          break;

        case "parse:batch":
          // Batch parsing with parallelization
          if (parserTask.payload.files) {
            results = await this.parseBatch(parserTask.payload.files, parserTask.payload.options);
          }
          break;

        case "parse:incremental":
          // Incremental parsing for changes
          if (parserTask.payload.changes) {
            results = await this.processIncremental(parserTask.payload.changes, parserTask.payload.options);
          }
          break;

        default:
          throw new Error(`Unknown parser task type: ${parserTask.type}`);
      }

      // Update statistics
      const elapsed = Date.now() - startTime;

      const resultsWithErrors = results.filter((r) => Array.isArray(r.errors) && r.errors.length > 0);
      if (resultsWithErrors.length > 0) {
        const summaries = resultsWithErrors
          .slice(0, 5)
          .map((r) => {
            const messages = (r.errors ?? []).map((e) => e.message).join(", ");
            return `${r.filePath ?? "unknown"}: ${messages || "unknown error"}`;
          })
          .join("; ");

        log.w("PARSER", `${resultsWithErrors.length} file(s) reported parse errors: ${summaries}`);

        if (this.knowledgeBus) {
          for (const result of resultsWithErrors) {
            this.knowledgeBus.emit(TOPICS.PARSE_FAILED, {
              agentId: this.id,
              taskId: task.id,
              filePath: result.filePath,
              errors: result.errors,
            });
          }
        }

        const additionalErrors = resultsWithErrors.reduce(
          (acc, r) => acc + (Array.isArray(r.errors) ? r.errors.length : 0),
          0,
        );
        this.stats.errorCount += additionalErrors;
      }

      this.updateStats(results, elapsed);

      // Publish results to knowledge bus
      if (this.knowledgeBus && results.length > 0) {
        this.knowledgeBus.emit(TOPICS.PARSE_COMPLETE, {
          agentId: this.id,
          taskId: task.id,
          results,
          stats: this.getParserStats(),
        });
      }

      log.i("PARSER", "Task completed", {
        filesCount: results.length,
        elapsedMs: elapsed,
        filesPerSec: Math.round((results.length / elapsed) * 1000),
      });

      return results;
    } catch (error) {
      log.e("PARSER", "task_failed", { err: String(error) });

      // Publish error to knowledge bus
      if (this.knowledgeBus) {
        this.knowledgeBus.emit(TOPICS.PARSE_FAILED, {
          agentId: this.id,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: AgentMessage): Promise<void> {
    log.i("PARSER", `Received message: ${message.type}`);

    switch (message.type) {
      case "parse:request": {
        // Handle parse request via message
        const task: ParserTask = {
          id: message.id,
          type: "parse:batch",
          priority: 5,
          payload: message.payload as ParserTask["payload"],
          createdAt: Date.now(),
        };
        await this.process(task);
        break;
      }

      case "cache:clear":
        // NOTE: Cache clearing is per-subprocess worker now
        // Each worker manages its own cache and releases on process exit
        log.i("PARSER", `Cache clear requested (no-op: caches are per-subprocess worker)`);
        break;

      case "stats:request":
        // Return parser statistics
        await this.send({
          id: `${message.id}-response`,
          from: this.id,
          to: message.from,
          type: "stats:response",
          payload: this.getParserStats(),
          timestamp: Date.now(),
          correlationId: message.id,
        });
        break;

      default:
        log.w("PARSER", `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Parse a single file via subprocess worker
   */
  async parseFile(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    // Route single file through worker pool
    const results = await this.parseBatch([filePath], options);
    if (results[0]) {
      return results[0];
    }
    // Return error result if parsing failed
    const language = detectLanguage(filePath) as ParseResult["language"];
    return {
      filePath,
      language,
      entities: [],
      contentHash: "",
      timestamp: Date.now(),
      parseTimeMs: 0,
      errors: [{ message: "Failed to parse file via worker" }],
    };
  }

  /**
   * Parse files in batch with parallel processing
   */
  async parseBatch(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    // DEBUG: Log input files count
    log.i("PARSER", `[ParserAgent.parseBatch] Received ${files.length} files`);

    // Filter to supported files only
    const supportedFiles = filterSupportedFiles(files);

    // DEBUG: Log filtered files count
    log.i("PARSER", `[ParserAgent.parseBatch] After filter: ${supportedFiles.length} supported files`);

    // DEBUG: Log filtering stats via logger (for file logging)
    const extStats: Record<string, { total: number; supported: number }> = {};
    for (const file of files) {
      const ext = file.split(".").pop()?.toLowerCase() || "(no ext)";
      if (!extStats[ext]) extStats[ext] = { total: 0, supported: 0 };
      extStats[ext].total++;
    }
    for (const file of supportedFiles) {
      const ext = file.split(".").pop()?.toLowerCase() || "(no ext)";
      if (extStats[ext]) extStats[ext].supported++;
    }
    log.i("PARSER", "parseBatch filtering", {
      agentId: this.id,
      inputFiles: files.length,
      supportedFiles: supportedFiles.length,
      byExtension: extStats,
    });

    if (supportedFiles.length === 0) {
      log.w("PARSER", "No supported files to parse", { agentId: this.id });
      return [];
    }

    log.i("PARSER", "Starting batch parse", {
      agentId: this.id,
      fileCount: supportedFiles.length,
    });

    // Always use subprocess worker pools for memory isolation
    const startTime = Date.now();
    const results = await this.parseWithWorkers(supportedFiles, options);
    const elapsed = Date.now() - startTime;

    const totalEntities = results.reduce((sum, r) => sum + (r.entities?.length || 0), 0);
    log.i("PARSER", "Worker pool parsing completed", {
      agentId: this.id,
      filesProcessed: supportedFiles.length,
      resultsCount: results.length,
      totalEntities,
      elapsedMs: elapsed,
      filesPerSec: Math.round(supportedFiles.length / (elapsed / 1000)),
    });

    return results;
  }

  /**
   * Process incremental file changes via subprocess workers
   */
  async processIncremental(changes: FileChange[], options?: ParserOptions): Promise<ParseResult[]> {
    log.i("PARSER", `Processing ${changes.length} incremental changes...`);

    // Route incremental changes through worker pools
    // Workers will re-parse modified files (caching is per-worker)
    const filesToParse = changes.filter((c) => c.changeType !== "deleted").map((c) => c.filePath);

    if (filesToParse.length === 0) {
      return [];
    }

    const results = await this.parseBatch(filesToParse, options);

    // Emit cache updated event (stats are aggregated from workers)
    if (this.knowledgeBus) {
      this.knowledgeBus.emit(TOPICS.CACHE_UPDATED, {
        agentId: this.id,
        stats: this.getParserStats(),
      });
    }

    return results;
  }

  /**
   * Initialize subprocess worker pools (lazy - enabled but not created yet)
   *
   * Optimization: Pools are created on-demand only for languages that are actually used.
   * This saves ~3-5 seconds of initialization overhead for small projects.
   */
  private async initializeWorkerPool(): Promise<void> {
    // Subprocess workers are always enabled for memory isolation
    // Pools are created lazily in getOrCreateLanguagePool()
    log.i("PARSER", "Subprocess worker pools enabled (lazy initialization mode)");
  }

  /**
   * Get or create a subprocess worker pool on-demand (lazy initialization)
   *
   * Uses ParsingSubprocessPool (separate OS processes):
   * - Memory is released when process dies
   * - Visible in Task Manager
   * - Workers restart automatically when memory exceeds limit
   */
  private async getOrCreateLanguagePool(language: string): Promise<WorkerPool | null> {
    // Check if pool already exists
    if (this.languagePools.has(language)) {
      return this.languagePools.get(language)!;
    }

    // Create new pool for this language
    try {
      // Always use subprocess pools for memory isolation
      log.i("PARSER", `Creating subprocess pool for ${language}`, {
        hasVectorsWrittenCallback: !!this.onVectorsWritten,
        hasEmbeddingConfig: !!this.embeddingConfig,
      });

      const pool: WorkerPool = new ParsingSubprocessPool(language, {
        killAfterBatch: !this.keepPoolsAlive, // Kill process after batch for memory release
        memoryLimitMB: 512, // Restart if memory exceeds 512MB
        ...(this.embeddingConfig && { embeddingConfig: this.embeddingConfig }),
        onEmbeddings: this.getEmbeddingsCallback(), // Binary embeddings callback
        ...(this.onVectorsWritten && { onVectorsWritten: this.onVectorsWritten }), // Incremental Faiss loading
        streamingMode: this.streamingMode, // Streaming results via IPC
        ...(this.onStreamingResult && { onStreamingResult: this.onStreamingResult }), // Streaming callback
      });

      await pool.initialize();
      this.languagePools.set(language, pool);

      const stats = pool.getStats();
      log.i("PARSER", `${language} subprocess pool ready: ${stats.totalWorkers} workers`);

      return pool;
    } catch (error) {
      log.w("PARSER", `Failed to create ${language} pool`, { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Parse files using subprocess worker pools
   *
   * All parsing goes through subprocess workers for memory isolation.
   * Worker pools are created lazily on-demand for each language.
   */
  private async parseWithWorkers(files: string[], options?: ParserOptions): Promise<ParseResult[]> {
    // Step 1: Group files by programming language
    const languageGroups = groupFilesByLanguage(files);

    log.i("PARSER", "Language distribution", {
      agentId: this.id,
      distribution: Object.fromEntries(
        Array.from(languageGroups.entries()).map(([lang, files]) => [lang, files.length]),
      ),
    });

    // Step 2: Create all language pools IN PARALLEL (avoid sequential await blocking)
    const languages = Array.from(languageGroups.keys());
    const poolResults = await Promise.all(
      languages.map(async (language) => ({
        language,
        pool: await this.getOrCreateLanguagePool(language),
        files: languageGroups.get(language) || [],
      })),
    );

    // Step 3: Submit tasks to pools
    const poolPromises: Promise<ParseResult[]>[] = [];
    const languagesUsed: string[] = [];
    const skippedFiles: string[] = [];

    for (const { language, pool, files: languageFiles } of poolResults) {
      if (pool) {
        // Submit to language-specific subprocess pool
        languagesUsed.push(language);
        poolPromises.push(pool.submitTask(languageFiles, options));
      } else {
        // Skip files for unsupported languages (no fallback)
        log.w("PARSER", `No worker pool for ${language}, skipping ${languageFiles.length} files`);
        skippedFiles.push(...languageFiles);
      }
    }

    // Step 4: Wait for ALL subprocess pools to complete (parallel execution)
    const results = await Promise.all(poolPromises);

    // Step 5: Flatten results from all pools
    const flatResults = results.flat();

    // Log pool statistics
    for (const language of languagesUsed) {
      const pool = this.languagePools.get(language);
      if (pool) {
        const stats = pool.getStats();
        log.d("PARSER", `Pool stats: ${language}`, {
          activeWorkers: stats.activeWorkers,
          totalWorkers: stats.totalWorkers,
          completedTasks: stats.completedTasks,
          avgProcessingTimeMs: Math.round(stats.avgProcessingTime),
        });
      }
    }

    if (skippedFiles.length > 0) {
      log.w("PARSER", `Skipped ${skippedFiles.length} files (unsupported languages)`);
    }

    return flatResults;
  }

  /**
   * Handle file change events from knowledge bus
   */
  private handleFileChange(event: any): void {
    if (this.isProcessing) return;

    const change: FileChange = event.change;
    log.i("PARSER", `File change detected: ${change.filePath}`);

    // Create incremental parse task
    const task: ParserTask = {
      id: `file-change-${Date.now()}`,
      type: "parse:incremental",
      priority: 7,
      payload: {
        changes: [change],
      },
      createdAt: Date.now(),
    };

    // Process asynchronously
    this.process(task).catch((error) => {
      log.i("PARSER", `Failed to process file change:`, error);
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Monitor resource usage
    this.on("resource:warning", (usage) => {
      const config = getParserConfig();
      if (usage.memory > config.memoryLimit * 0.9) {
        log.w("PARSER", `Memory usage high: ${usage.memory}MB`, { agentId: this.id });
        // NOTE: Cache is per-subprocess worker now
        // Workers are killed and restarted automatically when memory exceeds limit
      }
    });

    // Monitor task completion
    this.on("task:completed", (event) => {
      log.i("PARSER", `Task completed: ${event.task.id}`);
    });

    this.on("task:failed", (event) => {
      log.i("PARSER", `Task failed: ${event.task.id}`, event.error);
      this.stats.errorCount++;
    });
  }

  /**
   * Update parser statistics
   */
  private updateStats(results: ParseResult[], elapsedMs: number): void {
    this.stats.filesParsed += results.length;
    this.stats.totalParseTimeMs += elapsedMs;
    this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;
    this.stats.throughput = (results.length / elapsedMs) * 1000;

    // NOTE: Cache stats are per-subprocess worker now (no aggregated cache stats)
    // Each worker manages its own cache and releases on process exit
  }

  /**
   * Get parser statistics
   */
  getParserStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Set embedding configuration for subprocess workers.
   * Workers will use this config to generate embeddings during parsing.
   * Call this before parsing to enable embedding generation in workers.
   */
  setEmbeddingConfig(config: WorkerEmbeddingConfig | null): void {
    this.embeddingConfig = config;

    // Update existing pools with new config
    for (const pool of this.languagePools.values()) {
      if (pool instanceof ParsingSubprocessPool) {
        pool.configureEmbeddings(config ?? undefined);
      }
    }

    if (config) {
      log.i("PARSER", `Embedding config set: ${config.provider}/${config.modelName}`);
    } else {
      log.i("PARSER", `Embedding config cleared`);
    }
  }

  /**
   * Set callback for incremental Faiss loading.
   * Called when a worker writes vectors to dump files.
   * Enables parallel indexing: Faiss loads vectors as each worker completes.
   */
  setVectorsWrittenCallback(callback: ((workerId: string, count: number, dumpDir: string) => void) | null): void {
    this.onVectorsWritten = callback;
    if (callback) {
      log.i("PARSER", `Incremental Faiss loading enabled`);
    }
  }

  /**
   * Enable streaming mode for workers.
   * When enabled, workers send parse results immediately after each file via IPC.
   * Use for parallel indexing: start processing results while parsing continues.
   *
   * @param callback Called for each file as it's parsed (before batch completes)
   */
  setStreamingMode(enabled: boolean, callback?: StreamingResultCallback): void {
    this.streamingMode = enabled;
    this.onStreamingResult = callback ?? null;

    if (enabled && callback) {
      log.i("PARSER", "Streaming mode enabled");
    } else {
      log.i("PARSER", "Streaming mode disabled");
    }
  }

  /**
   * Set incremental mode for workers.
   *
   * Full indexing (incremental=false, default):
   *   - Workers are one-shot: process batch → die
   *   - New worker spawned lazily when new task arrives
   *   - Best for bulk processing where we know all files upfront
   *
   * Incremental mode (incremental=true):
   *   - Workers stay alive and process incoming tasks
   *   - Worker dies only when memory exceeds 500MB
   *   - Best for watch mode / file change handling
   */
  setIncrementalMode(enabled: boolean): void {
    this.keepPoolsAlive = enabled;
    log.i("PARSER", `Incremental mode: ${enabled ? "enabled" : "disabled"}`);

    // Note: existing pools keep their current killAfterBatch setting
    // New pools will use the updated setting
  }

  /**
   * Enable keepalive mode for fast incremental processing.
   * After bulk indexing, call this to:
   * 1. Spawn one keepalive worker for TypeScript (main language)
   * 2. Other language workers spawn on-demand
   *
   * The keepalive worker stays alive until memory exceeds 500MB.
   */
  async enableKeepaliveMode(): Promise<void> {
    log.i("PARSER", "Enabling keepalive mode for incremental processing", {
      poolCount: this.languagePools.size,
      pools: Array.from(this.languagePools.keys()),
    });

    // Enable keepalive mode on TypeScript pool only (most common changes)
    // Kill ALL workers from other pools to free memory
    const killedPools: string[] = [];
    const tsPool = this.languagePools.get("typescript");

    for (const [language, pool] of this.languagePools.entries()) {
      if (pool instanceof ParsingSubprocessPool) {
        if (language === "typescript") {
          // TypeScript: enable keepalive, keep worker 0
          pool.setKeepaliveMode(true);
        } else {
          // Other pools: shutdown completely to free memory
          await pool.shutdown();
          killedPools.push(language);
        }
      }
    }

    // Remove killed pools from the map
    for (const lang of killedPools) {
      this.languagePools.delete(lang);
    }

    if (killedPools.length > 0) {
      log.i("PARSER", "Killed non-TypeScript pools to free memory", {
        killedPools,
      });
    }

    // Spawn keepalive worker only for TypeScript
    if (tsPool instanceof ParsingSubprocessPool) {
      log.i("PARSER", "Spawning TypeScript keepalive worker...");
      await tsPool.ensureKeepaliveWorker();
      log.i("PARSER", "TypeScript keepalive worker spawned", {
        activeWorkers: tsPool.getActiveWorkerCount(),
      });
    } else {
      log.w("PARSER", "No TypeScript pool found for keepalive");
    }

    this.keepPoolsAlive = true;
    log.i("PARSER", "Keepalive mode enabled, ready for incremental updates");
  }

  /**
   * Disable keepalive mode. Workers will be killed after completing tasks.
   */
  disableKeepaliveMode(): void {
    for (const pool of this.languagePools.values()) {
      if (pool instanceof ParsingSubprocessPool) {
        pool.setKeepaliveMode(false);
      }
    }
    log.i("PARSER", "Keepalive mode disabled");
  }

  /**
   * Type guard for parser tasks
   */
  private isParserTask(task: AgentTask): task is ParserTask {
    return task.type.startsWith("parse:");
  }

  /**
   * Export cache for persistence
   * @deprecated Cache is per-subprocess worker now, not exportable from main process
   */
  exportCache(): any[] {
    // Cache is per-subprocess worker now
    // Workers manage their own caches and release on process exit
    log.w("PARSER", "exportCache() called but cache is per-subprocess worker now");
    return [];
  }

  /**
   * Import cache for warm restart
   * @deprecated Cache is per-subprocess worker now, not importable to main process
   */
  async importCache(_cacheData: any[]): Promise<void> {
    // Cache is per-subprocess worker now
    // Workers manage their own caches
    log.w("PARSER", "importCache() called but cache is per-subprocess worker now");
  }

  /**
   * Get total memory usage of all worker pools in MB
   */
  getTotalMemoryMB(): number {
    let totalMB = 0;
    for (const pool of this.languagePools.values()) {
      if ("getTotalMemoryMB" in pool) {
        totalMB += (pool as ParsingSubprocessPool).getTotalMemoryMB();
      }
    }
    return totalMB;
  }

  /**
   * Kill all worker pools if total memory exceeds threshold.
   * Returns true if any pools were killed.
   *
   * Use case: After indexing, call killIfMemoryHigh(500) to release memory
   * if workers accumulated more than 500MB total.
   */
  async killIfMemoryHigh(thresholdMB: number): Promise<boolean> {
    const totalMB = this.getTotalMemoryMB();

    if (totalMB > thresholdMB) {
      log.i("PARSER", `Total memory ${totalMB}MB > ${thresholdMB}MB threshold, killing all pools`, {
        agentId: this.id,
        poolCount: this.languagePools.size,
      });

      // Kill all subprocess pools
      const shutdownPromises: Promise<void>[] = [];
      for (const [language, pool] of this.languagePools) {
        if ("shutdown" in pool) {
          log.d("PARSER", `Killing ${language} pool`);
          shutdownPromises.push(pool.shutdown());
        }
      }
      await Promise.all(shutdownPromises);
      this.languagePools.clear();

      log.i("PARSER", "All pools killed, memory released to OS", {
        agentId: this.id,
        previousMemoryMB: totalMB,
      });
      return true;
    } else {
      log.d("PARSER", `Total memory ${totalMB}MB <= ${thresholdMB}MB, keeping pools alive`, {
        agentId: this.id,
      });
      return false;
    }
  }
}
