/**
 * Development Agent - Handles implementation and indexing tasks
 * This agent is responsible for code development, indexing, and implementation tasks
 * that are delegated by the Conductor orchestrator
 */

import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { extname } from "node:path";
import { buildWorkerEmbeddingConfig } from "../config/worker-embedding-config.js";
import { ConfigLoader, getConfig } from "../config/yaml-config.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { getFaissProvider } from "../semantic/faiss/faiss-provider.js";
import { getCurrentIndexingDirectory } from "../shared/indexing-context.js";
import { setGlobalProjectContext } from "../storage/graph-storage-factory.js";
// SQLiteManager removed - using libsql via GraphStorage
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { ParseResult, ParserOptions } from "../types/parser.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";
import { BaseAgent } from "./base.js";
import { createHeuristicEntities } from "./dev/heuristic-parser.js";
import { collectFiles, isCodeExtension, isDataExtension } from "./dev/index.js";
import { IndexerAgent } from "./indexer-agent.js";
// Temporarily disable ParserAgent due to web-tree-sitter ESM issues
import { ParserAgent } from "./parser-agent.js";
import { type ResourceAdjustmentCapable, ResourceAdjustmentMixin } from "./resource-adjustment-mixin.js";

// Re-export for backward compatibility
export { ALL_SUPPORTED_EXTENSIONS } from "./dev/index.js";

// Helper: yield to event loop between indexing chunks (allows vectors.written callbacks to process)
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function getDevAgentConfig() {
  const config = getConfig();
  return {
    maxConcurrency: config.devAgent?.maxConcurrency ?? 3,
    memoryLimit: config.devAgent?.memoryLimit ?? 256,
    priority: config.devAgent?.priority ?? 7,
  };
}

export class DevAgent extends BaseAgent implements ResourceAdjustmentCapable {
  private parserAgent: ParserAgent | null = null;
  private indexerAgent: IndexerAgent | null = null;
  private indexBatchSize: number;
  private defaultBatchSize: number;
  private readonly defaultMaxConcurrency: number;
  private readonly defaultMemoryLimit: number;
  private resourceMixin = new ResourceAdjustmentMixin();

  constructor(_agentId?: string) {
    const agentConfig = getDevAgentConfig();
    super(AgentType.DEV, {
      maxConcurrency: agentConfig.maxConcurrency,
      memoryLimit: agentConfig.memoryLimit,
      priority: agentConfig.priority,
    });

    this.defaultMaxConcurrency = this.capabilities.maxConcurrency;
    this.defaultMemoryLimit = this.capabilities.memoryLimit;
    this.defaultBatchSize = 100;
    this.indexBatchSize = this.defaultBatchSize;
  }

  protected async onInitialize(): Promise<void> {
    try {
      const configLoader = ConfigLoader.getInstance();
      this.defaultBatchSize = configLoader.getDevIndexBatchSize();
      this.indexBatchSize = this.defaultBatchSize;
      const useParser = configLoader.shouldUseParser();
      if (useParser) {
        try {
          this.parserAgent = new ParserAgent();
          await this.parserAgent.initialize();
          console.error(`[DevAgent ${this.id}] ParserAgent initialized`);
        } catch (e) {
          console.warn(`[DevAgent ${this.id}] ParserAgent unavailable, fallback to heuristic indexing:`, e);
          this.parserAgent = null;
        }
      }

      // Initialize IndexerAgent with current indexing directory context
      const currentDir = getCurrentIndexingDirectory() || process.cwd();
      console.error(`[DevAgent ${this.id}] Using project directory for IndexerAgent: ${currentDir}`);
      this.indexerAgent = new IndexerAgent();
      await this.indexerAgent.initialize();
      // Set project context on GLOBAL GraphStorage singleton
      setGlobalProjectContext(currentDir);
      console.error(`[DevAgent ${this.id}] Called setGlobalProjectContext(${currentDir}) during init`);
      console.error(`[DevAgent ${this.id}] IndexerAgent initialized`);
    } catch (error) {
      console.error(`[DevAgent ${this.id}] Failed to initialize sub-agents:`, error);
      throw error;
    }

    // Subscribe to relevant knowledge bus topics
    knowledgeBus.subscribe(this.id, "task:implementation", async (entry: KnowledgeEntry) => {
      const data = entry.data as { targetAgent: string; taskId: string; priority?: number; [k: string]: unknown };
      if (data.targetAgent === "dev-agent") {
        const task: AgentTask = {
          id: data.taskId,
          type: "implementation",
          priority: data.priority || 5,
          payload: data,
          createdAt: Date.now(),
        };
        await this.process(task);
      }
    });

    knowledgeBus.subscribe(this.id, "resources:adjusted", (entry) => this.handleResourceAdjustment(entry));

    // Subscribe to file change events for incremental reindexing (from GitWatcher)
    // Protected against circular loop: only process events from git-watcher source
    knowledgeBus.subscribe(this.id, "indexer:files:changed", async (entry: KnowledgeEntry) => {
      const data = entry.data as { files: string[]; repositoryPath?: string; source?: string };
      // Only process events from git-watcher to avoid circular loop
      if (data.files && data.files.length > 0 && data.source?.startsWith("git-watcher")) {
        console.error(
          `[DevAgent ${this.id}] Received file change event: ${data.files.length} files from ${data.source}`,
        );
        await this.handleIncrementalReindex(data.files, data.repositoryPath);
      }
    });

    console.error(`[DevAgent ${this.id}] Initialized and ready for implementation tasks`);
  }

  protected canProcessTask(task: AgentTask): boolean {
    // DevAgent can handle index, implementation, refactor, dev, and parse tasks
    return (
      task.type === "index" ||
      task.type === "implementation" ||
      task.type === "refactor" ||
      task.type === "dev" ||
      task.type === "parse"
    );
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    console.error(`[DevAgent ${this.id}] Received message from ${message.from}: ${message.type}`);
    // Handle inter-agent messages if needed
  }

  protected async processTask(task: AgentTask): Promise<unknown> {
    console.error(`[DevAgent ${this.id}] Processing task ${task.id} of type ${task.type}`);

    try {
      switch (task.type) {
        case "index":
          return await this.handleIndexTask(task);

        case "implementation":
          return await this.handleImplementationTask(task);

        case "refactor":
          return await this.handleRefactorTask(task);

        case "parse":
          return await this.handleParseTask(task);

        default:
          // For any other task type, delegate to appropriate agents
          return await this.delegateTask(task);
      }
    } catch (error) {
      console.error(`[DevAgent ${this.id}] Error processing task:`, error);
      throw error;
    }
  }

  private async handleIndexTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    console.error(`[DevAgent ${this.id}] Starting real indexing for ${payload.directory}`);

    if (!this.indexerAgent) {
      throw new Error("Indexer agent not initialized");
    }

    // v3: Set project context on GLOBAL GraphStorage singleton before indexing
    setGlobalProjectContext(payload.directory);
    // v3: Also set context on IndexerAgent (for BatchOperations)
    this.indexerAgent.setProjectContext(payload.directory);
    console.error(`[DevAgent ${this.id}] Set project context: ${payload.directory}`);

    const result = {
      status: "started",
      directory: payload.directory,
      incremental: payload.incremental || false,
      excludePatterns: payload.excludePatterns || [],
      batchMode: payload.batchMode || false,
      timestamp: Date.now(),
      filesProcessed: 0,
      entitiesExtracted: 0,
      relationshipsCreated: 0,
    };

    // Publish indexing started event
    // Publish indexing started event (topic, data, source)
    knowledgeBus.publish("indexing:started", result, this.id);

    // Perform real indexing using parser and indexer agents
    const indexingResult = await this.performRealIndexing(payload);

    return {
      ...result,
      ...indexingResult,
      status: "completed",
      message: `Real indexing completed for ${payload.directory}`,
    };
  }

  private async handleImplementationTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    console.error(`[DevAgent ${this.id}] Implementing: ${payload.description || "task"}`);

    // Implementation tasks would involve code generation, modifications, etc.
    // For now, we'll return a success response
    return {
      status: "completed",
      taskId: task.id,
      implementation: {
        description: payload.description,
        targetAgent: "dev-agent",
        completed: true,
        timestamp: Date.now(),
      },
    };
  }

  private async handleRefactorTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as any;
    console.error(`[DevAgent ${this.id}] Refactoring: ${payload.target || "code"}`);

    return {
      status: "completed",
      taskId: task.id,
      refactoring: {
        target: payload.target,
        suggestions: [],
        completed: true,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Handle parse task - parse a single file and return entities
   */
  private async handleParseTask(task: AgentTask): Promise<unknown> {
    const payload = task.payload as { filePath?: string };
    const filePath = payload.filePath;

    if (!filePath) {
      throw new Error("Parse task requires filePath in payload");
    }

    console.error(`[DevAgent ${this.id}] Parsing file: ${filePath}`);

    if (!this.parserAgent) {
      console.warn(`[DevAgent ${this.id}] ParserAgent not available, returning empty result`);
      return {
        filePath,
        entities: [],
        relationships: [],
        error: "Parser not initialized",
        timestamp: Date.now(),
      };
    }

    try {
      // Use ParserAgent's parseFile directly for single file parsing
      const result = await this.parserAgent.parseFile(filePath, {});

      console.error(`[DevAgent ${this.id}] Parsed ${filePath}: ${result.entities?.length || 0} entities`);

      return {
        filePath,
        entities: result.entities || [],
        relationships: result.relationships || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`[DevAgent ${this.id}] Parse error for ${filePath}:`, error);
      // Return empty result instead of crashing
      return {
        filePath,
        entities: [],
        relationships: [],
        error: String(error),
        timestamp: Date.now(),
      };
    }
  }

  private async delegateTask(task: AgentTask): Promise<unknown> {
    console.error(`[DevAgent ${this.id}] Delegating task ${task.id} to appropriate agent`);

    // For now, just return success
    // In a full implementation, this would coordinate with other agents
    return {
      status: "delegated",
      taskId: task.id,
      message: `Task ${task.id} delegated for processing`,
      timestamp: Date.now(),
    };
  }

  private async performRealIndexing(payload: any): Promise<any> {
    const directory = payload.directory;
    const excludePatterns = payload.excludePatterns || [];

    logger.info("DEV_AGENT", "Starting indexing", {
      directory,
      excludePatternsCount: excludePatterns.length,
      samplePatterns: excludePatterns.slice(0, 5),
    });

    const collectResult = collectFiles(directory, { excludePatterns, agentId: this.id });
    const allFiles = collectResult.files;
    logger.info("DEV_AGENT", "Files collected", { count: allFiles.length });

    // Separate code files (AST parsing) from data files (heuristic entities)
    const codeFiles: string[] = [];
    const dataFiles: string[] = [];
    for (const file of allFiles) {
      const ext = extname(file).toLowerCase();
      if (isCodeExtension(ext)) {
        codeFiles.push(file);
      } else {
        dataFiles.push(file);
      }
    }
    logger.info("DEV_AGENT", "Files separated", {
      codeFiles: codeFiles.length,
      dataFiles: dataFiles.length,
    });

    const isDebugMode = process.env["MCP_DEBUG_MODE"] === "1";
    // All files go to parser in ONE batch - parser distributes to workers via chunks
    // No artificial batching needed here, ParserAgent handles parallelization
    const effectiveBatchSize = Infinity;

    console.error(`[${this.id}] Sending all ${codeFiles.length} files to parser in one batch`);
    const parseOptions: ParserOptions = isDebugMode
      ? {
          batchSize: Math.max(1, Math.min(3, effectiveBatchSize)),
          useCache: false,
        }
      : {};
    let totalEntities = 0;
    let totalRelationships = 0;
    let filesProcessed = 0;

    // Configure embedding generation in parser workers (lightweight HTTP client)
    if (this.parserAgent) {
      const embeddingConfig = buildWorkerEmbeddingConfig();
      if (embeddingConfig) {
        this.parserAgent.setEmbeddingConfig(embeddingConfig);
        logger.info("DEV_AGENT", "Embedding config passed to parser workers", {
          provider: embeddingConfig.provider,
          model: embeddingConfig.modelName,
        });

        // Set up incremental Faiss loading callback
        // When a worker completes, Faiss loads its vectors immediately
        const faissProvider = getFaissProvider();
        const dimensions = embeddingConfig.dimensions || 384;
        logger.info("DEV_AGENT", "Setting up incremental Faiss callback", {
          dimensions,
          faissReady: faissProvider.isReady(),
        });
        this.parserAgent.setVectorsWrittenCallback((workerId, count, _dumpDir) => {
          logger.info("DEV_AGENT", ">>> vectors.written callback TRIGGERED", { workerId, count });
          faissProvider
            .loadWorkerDump(workerId, dimensions)
            .then((result) => {
              logger.info("DEV_AGENT", "Faiss loadWorkerDump completed", { workerId, ...result });
            })
            .catch((err) => {
              logger.warn("DEV_AGENT", "Failed to load worker dump", { workerId, error: (err as Error).message });
            });
        });
      }
    }

    // Enable streaming mode: index results as they arrive from workers
    // BATCH ACCUMULATOR: Queue data and flush in batches to reduce DB operations
    // Instead of 492 separate DB calls, we do ~10 batch calls (50 files each)
    const streamingIndexedFiles = new Set<string>();

    if (this.parserAgent && this.indexerAgent) {
      // Streaming callback - queues for batch indexing (instant, non-blocking)
      this.parserAgent.setStreamingMode(true, (result, _taskId, _fileIndex, _totalFiles) => {
        if (!result.filePath || !result.entities || result.entities.length === 0) {
          return;
        }

        // Mark as streaming immediately
        streamingIndexedFiles.add(result.filePath);

        // Queue for batch indexing (non-blocking, accumulates data)
        this.indexerAgent!.queueForIndexing(result.entities, result.filePath, result.relationships || []);
      });
      logger.info("DEV_AGENT", "Streaming mode enabled (batch accumulator)");
    }

    // Process CODE files through ParserAgent (AST parsing with worker pools)
    const files = codeFiles; // Use only code files for parsing
    for (let i = 0; i < files.length; i += effectiveBatchSize) {
      const batch = files.slice(i, Math.min(i + effectiveBatchSize, files.length));

      try {
        if (this.parserAgent) {
          // DEBUG: Log batch extensions before parsing
          const batchExtStats: Record<string, number> = {};
          for (const f of batch) {
            const ext = extname(f).toLowerCase() || "(no ext)";
            batchExtStats[ext] = (batchExtStats[ext] || 0) + 1;
          }
          logger.info("DEV_AGENT", "Sending batch to parser", {
            batchSize: batch.length,
            batchIndex: i,
            extensions: batchExtStats,
          });

          const parseTask: AgentTask = {
            id: `parse-${Date.now()}-${i}`,
            type: "parse:batch",
            priority: 8,
            payload: { files: batch, options: parseOptions },
            createdAt: Date.now(),
          };

          const results = (await this.parserAgent.process(parseTask)) as any[]; // ParseResult[]

          // DEBUG: Log parse results count
          logger.info("DEV_AGENT", "Parser batch completed", {
            batchSent: batch.length,
            resultsReceived: results?.length || 0,
            batchIndex: i,
          });
          logger.flush(); // Ensure batch completion is visible in logs

          // VERBOSE DEBUG: Analyze results structure
          let resultsWithFilePath = 0;
          let resultsWithEntities = 0;
          let resultsWithEmptyEntities = 0;
          let totalEntityCount = 0;
          for (const res of results || []) {
            if (res?.filePath) resultsWithFilePath++;
            if (Array.isArray(res?.entities)) {
              if (res.entities.length > 0) {
                resultsWithEntities++;
                totalEntityCount += res.entities.length;
              } else {
                resultsWithEmptyEntities++;
              }
            }
          }
          console.error(
            `[DevAgent] Batch ${i} parse analysis: results=${results?.length || 0}, withFilePath=${resultsWithFilePath}, withEntities=${resultsWithEntities}, emptyEntities=${resultsWithEmptyEntities}, totalEntities=${totalEntityCount}`,
          );

          const byFile = new Map<string, { entities: any[]; relationships: any[] }>();

          for (const res of results || []) {
            const fp = res?.filePath;
            if (!fp) continue;
            const slot = byFile.get(fp) ?? { entities: [], relationships: [] };

            if (Array.isArray(res.entities)) {
              slot.entities.push(...res.entities);
            }

            if (Array.isArray(res.relationships)) {
              for (const r of res.relationships) {
                if (r?.from && r.to && r.type) {
                  slot.relationships.push({
                    from: r.from,
                    to: r.to,
                    type: r.type,
                    targetFile: fp,
                  });
                }
              }
            }

            byFile.set(fp, slot);
          }

          // DEBUG: Count total relationships extracted from parse results
          let totalRelationshipsExtracted = 0;
          let resultsWithRelationships = 0;
          for (const res of results || []) {
            if (Array.isArray(res?.relationships) && res.relationships.length > 0) {
              resultsWithRelationships++;
              totalRelationshipsExtracted += res.relationships.length;
            }
          }
          console.error(
            `[DevAgent] Batch ${i} relationships: resultsWithRels=${resultsWithRelationships}, totalRels=${totalRelationshipsExtracted}`,
          );

          // DEBUG: Log how many unique files have results (totalEntityCount already calculated above)
          logger.info("DEV_AGENT", "Files ready for indexing", {
            uniqueFiles: byFile.size,
            batchIndex: i,
            totalEntities: totalEntityCount,
            totalRelationships: totalRelationshipsExtracted,
          });

          // VERBOSE DEBUG: Show actual numbers in console
          console.error(
            `[DevAgent] Batch ${i}: sent=${batch.length}, results=${results?.length || 0}, uniqueFiles=${byFile.size}`,
          );

          // PARALLEL indexing with frequent yields to allow IPC callbacks
          // OPTIMIZATION 1: Reduced from 32 to 8 for more frequent event loop yields
          const INDEXING_CONCURRENCY = 8;

          // Filter out files already indexed via streaming
          const fileEntries = Array.from(byFile.entries()).filter(([file]) => !streamingIndexedFiles.has(file));

          if (fileEntries.length > 0) {
            logger.info("DEV_AGENT", "Post-batch indexing (non-streamed files)", {
              total: byFile.size,
              alreadyStreamed: streamingIndexedFiles.size,
              remaining: fileEntries.length,
            });
          }

          // OPTIMIZATION 2: Process files with yields INSIDE the loop, not just between chunks
          // This allows vectors.written callbacks to process between individual file indexings
          let pendingPromises: Promise<{ result: any; error: any }>[] = [];
          let pendingCount = 0;

          for (const [file, group] of fileEntries) {
            const indexTask: AgentTask = {
              id: `index-entities-${Date.now()}-${i}-${file}`,
              type: "index:entities",
              priority: 7,
              payload: {
                entities: group.entities,
                relationships: group.relationships,
                filePath: file,
              },
              createdAt: Date.now(),
            };

            const promise = (async () => {
              try {
                const indexResult = await this.indexerAgent?.enqueue(indexTask);
                return { result: indexResult as any, error: null };
              } catch (err) {
                console.error(`[DevAgent ${this.id}] Indexing failed for file ${file}:`, (err as Error).message);
                return { result: null, error: err };
              }
            })();

            pendingPromises.push(promise);
            pendingCount++;

            // When we hit concurrency limit, wait for all and yield
            if (pendingCount >= INDEXING_CONCURRENCY) {
              const results = await Promise.all(pendingPromises);
              for (const { result } of results) {
                if (result) {
                  totalEntities += result.entitiesIndexed || 0;
                  totalRelationships += result.relationshipsCreated || 0;
                  filesProcessed += 1;
                }
              }
              pendingPromises = [];
              pendingCount = 0;
              // Yield to event loop - allows vectors.written callbacks to process
              await yieldToEventLoop();
            }
          }

          // Process remaining files
          if (pendingPromises.length > 0) {
            const results = await Promise.all(pendingPromises);
            for (const { result } of results) {
              if (result) {
                totalEntities += result.entitiesIndexed || 0;
                totalRelationships += result.relationshipsCreated || 0;
                filesProcessed += 1;
              }
            }
          }

          // NOTE: Streaming results are added after the main loop completes
          // to avoid double-counting (moved outside the batch loop)

          // DISABLED: gc() crashes Bun when called during OpenVINO native operations
          // if (isDebugMode) {
          //   global.gc?.();
          // }
        } else {
          const entities: any[] = [];
          const relationships: any[] = [];

          for (const file of batch) {
            const extWithDot = extname(file).toLowerCase();
            const fileName = file.split("/").pop() || "unknown";
            const fileNameNoExt = fileName.replace(/\.[^/.]+$/, "");
            const ext = extWithDot.slice(1) || fileName; // For dotfiles like .gitignore

            // Определяем тип файла
            const isCode = isCodeExtension(extWithDot);
            const isData = isDataExtension(extWithDot) || isDataExtension("." + fileName.toLowerCase());

            if (!isCode && !isData) {
              continue;
            }

            // Для data-файлов вычисляем contentHash для semantic merge
            let contentHash: string | undefined;
            let fileContent: string | undefined;
            if (isData) {
              try {
                fileContent = readFileSync(file, "utf-8");
                contentHash = hashText(fileContent);
              } catch {
                // Не удалось прочитать файл - пропускаем hash
              }
            }

            // file entity - создаём для всех файлов
            entities.push({
              name: fileName,
              type: "file",
              filePath: file,
              location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              metadata: {
                language: ext,
                path: file,
                isDataFile: isData,
                contentHash, // Для semantic merge
              },
            });

            // Для data-файлов не создаём дополнительных entities (module, class, function)
            if (isData) {
              continue;
            }

            // module entity - для ВСЕХ code файлов (fallback когда parserAgent недоступен)
            // Это минимальная индексация, чтобы файлы были видны в поиске
            entities.push({
              name: fileNameNoExt,
              type: "module",
              filePath: file,
              location: { start: { line: 1, column: 0 }, end: { line: 100, column: 0 } },
              metadata: { language: ext, moduleType: "file" },
            });

            // Python: классы по соглашению начинаются с заглавной буквы
            if (ext === "py" && /^[A-Z]/.test(fileNameNoExt)) {
              entities.push({
                name: fileNameNoExt,
                type: "class",
                filePath: file,
                location: { start: { line: 5, column: 0 }, end: { line: 50, column: 0 } },
                metadata: { language: "python", visibility: "public" },
              });
            }

            // Kotlin/Java: классы по соглашению начинаются с заглавной буквы
            if ((ext === "kt" || ext === "kts" || ext === "java") && /^[A-Z]/.test(fileNameNoExt)) {
              entities.push({
                name: fileNameNoExt,
                type: "class",
                filePath: file,
                location: { start: { line: 5, column: 0 }, end: { line: 50, column: 0 } },
                metadata: { language: ext, visibility: "public" },
              });
            }

            // JS/TS: экспортируемые функции для не-тестовых файлов
            if ((ext === "js" || ext === "ts") && !file.includes(".test.") && !file.includes(".spec.")) {
              entities.push({
                name: `export_default`,
                type: "function",
                filePath: file,
                location: { start: { line: 10, column: 0 }, end: { line: 30, column: 0 } },
                metadata: { language: ext, exported: true },
              });
            }
          }

          // file -> module
          for (const entity of entities) {
            if (entity.type === "file") {
              const moduleEntity = entities.find((e) => e.type === "module" && e.filePath === entity.filePath);
              if (moduleEntity) {
                relationships.push({
                  from: entity.name,
                  to: moduleEntity.name,
                  type: "contains",
                  filePath: entity.filePath,
                });
              }
            }
          }
          // module -> class/function
          for (const entity of entities) {
            if (entity.type === "module") {
              const related = entities.filter(
                (e) => (e.type === "class" || e.type === "function") && e.filePath === entity.filePath,
              );
              for (const rel of related) {
                relationships.push({
                  from: entity.name,
                  to: rel.name,
                  type: rel.type === "class" ? "defines_class" : "defines_function",
                  filePath: entity.filePath,
                });
              }
            }
          }
          // class -> methods
          for (const entity of entities) {
            if (entity.type === "class") {
              const funcs = entities.filter((e) => e.type === "function" && e.filePath === entity.filePath);
              for (const f of funcs) {
                relationships.push({ from: entity.name, to: f.name, type: "has_method", filePath: entity.filePath });
              }
            }
          }

          const byFile = new Map<string, { entities: any[]; relationships: any[] }>();
          for (const e of entities) {
            const slot = byFile.get(e.filePath) ?? { entities: [], relationships: [] };
            slot.entities.push(e);
            byFile.set(e.filePath, slot);
          }
          for (const r of relationships) {
            const fp = r.filePath || null;
            if (!fp) continue;
            const slot = byFile.get(fp) ?? { entities: [], relationships: [] };
            slot.relationships.push({ from: r.from, to: r.to, type: r.type, targetFile: r.filePath });
            byFile.set(fp, slot);
          }

          for (const [file, group] of byFile.entries()) {
            if (!group.entities.length) continue;
            const indexTask: AgentTask = {
              id: `index-entities-${Date.now()}-${i}-${file}`,
              type: "index:entities",
              priority: 7,
              payload: { entities: group.entities, relationships: group.relationships, filePath: file },
              createdAt: Date.now(),
            };
            try {
              const indexResult = await this.indexerAgent?.process(indexTask);
              const indexed = indexResult as any;
              if (indexed) {
                totalEntities += indexed.entitiesIndexed || 0;
                totalRelationships += indexed.relationshipsCreated || 0;
                filesProcessed += 1;
              }
            } catch (err) {
              console.error(`[DevAgent ${this.id}] Indexing failed for file ${file}:`, err);
            }
          }
        }
      } catch (error) {
        console.error(
          `[DevAgent ${this.id}] Error processing batch ${i} (${batch.length} files):`,
          error instanceof Error ? error.message : error,
        );
        console.error(`[DevAgent ${this.id}] Batch files:`, batch);
        // Continue processing next batch despite error
      }

      if ((i + effectiveBatchSize) % 500 === 0 || i + effectiveBatchSize >= files.length) {
        console.error(`[DevAgent ${this.id}] Progress: ${filesProcessed}/${files.length} files processed`);
      }
    }

    // Disable streaming mode after code files parsing is complete
    if (this.parserAgent) {
      this.parserAgent.setStreamingMode(false);
    }

    // Flush any remaining queued data from batch accumulator
    let streamingEntities = 0;
    let streamingRelationships = 0;
    if (this.indexerAgent) {
      const pendingStats = this.indexerAgent.getPendingBatchStats();
      if (pendingStats.files > 0) {
        logger.info("DEV_AGENT", "Flushing remaining batch accumulator", pendingStats);
      }
      const flushResult = await this.indexerAgent.flushPendingBatch();
      streamingEntities = flushResult.entities;
      streamingRelationships = flushResult.relationships;

      logger.info("DEV_AGENT", "Streaming mode disabled, code parsing complete", {
        streamedFiles: streamingIndexedFiles.size,
        flushedEntities: streamingEntities,
        flushedRelationships: streamingRelationships,
      });
    }

    // Add streaming results to totals
    totalEntities += streamingEntities;
    totalRelationships += streamingRelationships;
    filesProcessed += streamingIndexedFiles.size;

    // Process DATA files with heuristic entities (no AST, just file-level indexing)
    // Use parallel processing for better performance
    if (dataFiles.length > 0) {
      const dataResult = await this.processDataFilesParallel(dataFiles);
      totalEntities += dataResult.entities;
      filesProcessed += dataResult.files;
    }

    // VERBOSE DEBUG: Final summary
    console.error(
      `[DevAgent] INDEXING COMPLETE: filesProcessed=${filesProcessed}/${allFiles.length}, entities=${totalEntities}, relationships=${totalRelationships}`,
    );

    // FULL INDEXING COMPLETE: Switch to keepalive mode for fast incremental processing
    // Keep one worker alive per language for instant response to file changes
    logger.info("DEV_AGENT", "=== ALL BATCH PROCESSING COMPLETE ===", {
      totalBatches: Math.ceil(codeFiles.length / effectiveBatchSize),
      codeFiles: codeFiles.length,
      dataFiles: dataFiles.length,
      filesProcessed,
      totalEntities,
      totalRelationships,
    });
    logger.flush(); // Force flush to ensure completion message is visible

    if (this.parserAgent) {
      try {
        const memoryBeforeMB = this.parserAgent.getTotalMemoryMB();
        logger.info("DEV_AGENT", "Switching to keepalive mode (spawning ONE worker for incremental updates)", {
          memoryMB: memoryBeforeMB,
        });

        // Enable keepalive mode - keeps worker 0 alive in each pool
        // Other workers are killed to release memory
        await this.parserAgent.enableKeepaliveMode();

        const memoryAfterMB = this.parserAgent.getTotalMemoryMB();
        logger.info("DEV_AGENT", "Keepalive mode enabled, ready for incremental updates", {
          memoryBeforeMB,
          memoryAfterMB,
        });
        // Force flush to ensure keepalive logs are visible
        logger.flush();
      } catch (err) {
        logger.warn("DEV_AGENT", "Failed to enable keepalive mode, falling back to shutdown", {
          error: (err as Error).message,
        });
        // Fallback: kill all workers
        try {
          await this.parserAgent.shutdown();
          this.parserAgent = null as any;
        } catch {
          // ignore
        }
      }
    }

    return {
      filesProcessed,
      entitiesExtracted: totalEntities,
      relationshipsCreated: totalRelationships,
      totalFiles: allFiles.length,
    };
  }

  private handleResourceAdjustment(entry: KnowledgeEntry): void {
    this.resourceMixin.handleResourceAdjustment.call(this, entry);
  }

  adjustConcurrency(newLimit: number): void {
    const adjusted = Math.max(1, Math.min(this.defaultMaxConcurrency * 2, Math.floor(newLimit)));
    if (this.capabilities.maxConcurrency !== adjusted) {
      console.error(
        `[DevAgent ${this.id}] Adjusting concurrency from ${this.capabilities.maxConcurrency} to ${adjusted} (resources:adjusted)`,
      );
      this.capabilities.maxConcurrency = adjusted;
    }
  }

  adjustBatchSize(newMemoryLimit: number): void {
    const ratio = Math.max(0.5, Math.min(2, newMemoryLimit / this.defaultMemoryLimit));
    const newBatchSize = Math.max(10, Math.round(this.defaultBatchSize * ratio));
    if (this.indexBatchSize !== newBatchSize) {
      console.error(
        `[DevAgent ${this.id}] Adjusting batch size from ${this.indexBatchSize} to ${newBatchSize} (resources:adjusted)`,
      );
      this.indexBatchSize = newBatchSize;
    }
  }

  /**
   * Handle incremental reindexing for changed files
   * Called when GitWatcher detects uncommitted file changes
   */
  private async handleIncrementalReindex(files: string[], _repositoryPath?: string): Promise<void> {
    if (!this.parserAgent || !this.indexerAgent) {
      console.warn(`[DevAgent ${this.id}] ParserAgent or IndexerAgent not available, skipping incremental reindex`);
      return;
    }

    const startTime = Date.now();
    console.error(`[DevAgent ${this.id}] Starting incremental reindex for ${files.length} files`);

    // Separate files into supported (full parsing) and other (heuristic entities)
    const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt"];
    const supportedFiles: string[] = [];
    const otherFiles: string[] = [];

    for (const f of files) {
      const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
      if (supportedExtensions.includes(ext)) {
        supportedFiles.push(f);
      } else {
        otherFiles.push(f);
      }
    }

    if (supportedFiles.length === 0 && otherFiles.length === 0) {
      console.error(`[DevAgent ${this.id}] No files to reindex`);
      return;
    }

    console.error(
      `[DevAgent ${this.id}] Reindexing ${supportedFiles.length} supported + ${otherFiles.length} heuristic files`,
    );

    let successCount = 0;
    let errorCount = 0;

    // Process files in small batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < supportedFiles.length; i += batchSize) {
      const batch = supportedFiles.slice(i, i + batchSize);

      for (const filePath of batch) {
        try {
          // Parse file
          const parseResult = await this.parserAgent.parseFile(filePath, {});

          if (parseResult.entities && parseResult.entities.length > 0) {
            // Index entities
            await this.indexerAgent.indexEntities(parseResult.entities, filePath, parseResult.relationships);
            successCount++;
          }
        } catch (error) {
          console.error(`[DevAgent ${this.id}] Failed to reindex ${filePath}:`, error);
          errorCount++;
        }
      }
    }

    // Process non-supported files with heuristic entities (lightweight, no parser needed)
    for (const filePath of otherFiles) {
      try {
        const heuristicResult = createHeuristicEntities(filePath);
        if (heuristicResult.entities.length > 0) {
          await this.indexerAgent.indexEntities(heuristicResult.entities, filePath, heuristicResult.relationships);
          successCount++;
        }
      } catch (error) {
        console.error(`[DevAgent ${this.id}] Failed to create heuristic entities for ${filePath}:`, error);
        errorCount++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.error(
      `[DevAgent ${this.id}] Incremental reindex completed: ${successCount} files updated, ${errorCount} errors in ${elapsed}ms`,
    );

    // INCREMENTAL: Kill workers only if memory > 500MB (keep alive for next changes)
    if (this.parserAgent) {
      try {
        const killed = await this.parserAgent.killIfMemoryHigh(500);
        if (killed) {
          this.parserAgent = null as any;
          logger.info("DEV_AGENT", "Parser workers killed (memory > 500MB after incremental)");
        }
      } catch (err) {
        // Ignore memory check errors for incremental
      }
    }

    // Publish completion event (without source to avoid circular loop)
    knowledgeBus.publish(
      "indexer:incremental:complete",
      {
        filesProcessed: successCount,
        errors: errorCount,
        elapsedMs: elapsed,
        source: "dev-agent", // Different source to distinguish from git-watcher
      },
      this.id,
    );
  }

  /**
   * Process data files in parallel with batch insert
   * OPTIMIZATION: Instead of sequential await per file, we:
   * 1. Create heuristic entities for all files in parallel (CPU-bound, fast)
   * 2. Group by file and batch insert via indexerAgent
   * 3. Use Promise.all with chunking for controlled parallelism
   */
  private async processDataFilesParallel(dataFiles: string[]): Promise<{ entities: number; files: number }> {
    if (dataFiles.length === 0 || !this.indexerAgent) {
      return { entities: 0, files: 0 };
    }

    const startTime = Date.now();
    logger.info("DEV_AGENT", "Processing data files in PARALLEL", {
      count: dataFiles.length,
    });

    // Step 1: Create heuristic entities for ALL files in parallel
    // createHeuristicEntities is synchronous and fast - just creates module entity
    const CHUNK_SIZE = Math.max(32, cpus().length * 4);
    const allResults: ParseResult[] = [];

    for (let i = 0; i < dataFiles.length; i += CHUNK_SIZE) {
      const chunk = dataFiles.slice(i, i + CHUNK_SIZE);

      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          try {
            return createHeuristicEntities(file);
          } catch {
            return null;
          }
        }),
      );

      // Collect non-null results
      for (const result of chunkResults) {
        if (result && result.entities.length > 0) {
          allResults.push(result);
        }
      }
    }

    // Step 2: Batch insert all entities via indexerAgent
    // Group by file for proper file tracking
    const INDEXING_CHUNK_SIZE = Math.max(32, cpus().length * 2);
    let totalEntities = 0;
    let filesProcessed = 0;

    // Process indexing in parallel chunks
    for (let i = 0; i < allResults.length; i += INDEXING_CHUNK_SIZE) {
      const chunk = allResults.slice(i, i + INDEXING_CHUNK_SIZE);

      const indexPromises = chunk.map(async (result) => {
        try {
          const indexResult = await this.indexerAgent!.indexEntities(
            result.entities,
            result.filePath,
            result.relationships,
          );
          return { entities: indexResult.entitiesIndexed, success: true };
        } catch {
          return { entities: 0, success: false };
        }
      });

      const results = await Promise.all(indexPromises);
      for (const r of results) {
        if (r.success) {
          totalEntities += r.entities;
          filesProcessed++;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info("DEV_AGENT", "Data files processed in PARALLEL", {
      files: filesProcessed,
      entities: totalEntities,
      elapsedMs: elapsed,
      filesPerSec: Math.round((filesProcessed / elapsed) * 1000),
    });

    return { entities: totalEntities, files: filesProcessed };
  }

  protected async onShutdown(): Promise<void> {
    console.error(`[DevAgent ${this.id}] Shutting down...`);

    // Shutdown sub-agents
    if (this.parserAgent) {
      await this.parserAgent.shutdown();
    }
    if (this.indexerAgent) {
      await this.indexerAgent.shutdown();
    }
  }
}

// Export singleton instance
export const devAgent = new DevAgent();
