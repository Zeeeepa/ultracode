/**
 * Development Agent - Handles implementation and indexing tasks
 * This agent is responsible for code development, indexing, and implementation tasks
 * that are delegated by the Conductor orchestrator
 */

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { ConfigLoader, getConfig } from "../config/yaml-config.js";
import { type KnowledgeEntry, knowledgeBus } from "../core/knowledge-bus.js";
import { getCurrentIndexingDirectory } from "../shared/indexing-context.js";
import { getProjectSQLiteManager } from "../storage/sqlite-manager.js";
import { type AgentMessage, type AgentTask, AgentType } from "../types/agent.js";
import type { ParserOptions } from "../types/parser.js";
import { hashText } from "../utils/fast-hash.js";
import { logger } from "../utils/logger.js";
import { BaseAgent } from "./base.js";
import { IndexerAgent } from "./indexer-agent.js";
// Temporarily disable ParserAgent due to web-tree-sitter ESM issues
import { ParserAgent } from "./parser-agent.js";
import { type ResourceAdjustmentCapable, ResourceAdjustmentMixin } from "./resource-adjustment-mixin.js";

const SUPPORTED_CODE_EXTENSIONS = [
  ".js",
  ".ts",
  ".jsx",
  ".tsx", // JavaScript/TypeScript
  ".py", // Python
  ".java", // Java
  ".cpp",
  ".c", // C/C++
  ".go", // Go
  ".rs", // Rust
  ".swift", // Swift
  ".kt",
  ".kts", // Kotlin
  ".css",
  ".scss",
  ".sass",
  ".less", // CSS
  ".html",
  ".htm", // HTML
  ".json", // JSON with AST parsing (swagger, package.json, tsconfig.json)
] as const;

/**
 * Non-AST файлы для semantic merge.
 * Эти файлы индексируются как File units с contentHash,
 * без AST-парсинга, для поддержки merge конфигов, документации и ресурсов.
 */
const SUPPORTED_DATA_EXTENSIONS = [
  ".yaml",
  ".yml", // Config files
  ".toml", // Cargo.toml, pyproject.toml
  ".xml", // Maven pom.xml, Android layouts
  ".md",
  ".mdx", // Documentation
  ".txt", // Plain text
  ".svg", // Vector graphics (часто в коде)
  ".graphql",
  ".gql", // GraphQL schemas
  ".proto", // Protocol Buffers
  ".sql", // SQL scripts
  ".env",
  ".env.example", // Environment configs
  ".gitignore",
  ".dockerignore", // Ignore files
  ".editorconfig", // Editor config
  ".prettierrc",
  ".eslintrc", // Linter configs (without .json)
] as const;

/** Все поддерживаемые расширения для индексации */
export const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_CODE_EXTENSIONS, ...SUPPORTED_DATA_EXTENSIONS] as const;

/** Проверяет, является ли расширение code-файлом (требует AST-парсинг) */
function isCodeExtension(ext: string): boolean {
  return SUPPORTED_CODE_EXTENSIONS.includes(ext as (typeof SUPPORTED_CODE_EXTENSIONS)[number]);
}

/** Проверяет, является ли расширение data-файлом (без AST-парсинга) */
function isDataExtension(ext: string): boolean {
  return SUPPORTED_DATA_EXTENSIONS.includes(ext as (typeof SUPPORTED_DATA_EXTENSIONS)[number]);
}

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
      cpuAffinity: undefined,
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

      // Use project-specific SQLiteManager based on current indexing directory
      const currentDir = getCurrentIndexingDirectory() || process.cwd();
      console.error(`[DevAgent ${this.id}] Using project directory for IndexerAgent: ${currentDir}`);
      const sqliteManager = getProjectSQLiteManager(currentDir);
      this.indexerAgent = new IndexerAgent(sqliteManager);
      await this.indexerAgent.initialize();
      console.error(
        `[DevAgent ${this.id}] IndexerAgent initialized with db: ${(sqliteManager as any).config?.path || "unknown"}`,
      );
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

    // Subscribe to file change events for incremental reindexing
    knowledgeBus.subscribe(this.id, "indexer:files:changed", async (entry: KnowledgeEntry) => {
      const data = entry.data as { files: string[]; repositoryPath?: string; source?: string };
      if (data.files && data.files.length > 0) {
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

    const files = await this.collectFiles(directory, excludePatterns);
    logger.info("DEV_AGENT", "Files collected", { count: files.length });

    const configLoader = ConfigLoader.getInstance();
    const isDebugMode = process.env.MCP_DEBUG_MODE === "1";
    const configuredBatchSize = this.indexBatchSize ?? configLoader.getDevIndexBatchSize();
    // Removed artificial batch size limit in debug mode to allow worker pool to function effectively
    // Old: const effectiveBatchSize = isDebugMode ? Math.min(configuredBatchSize, 5) : configuredBatchSize;
    const effectiveBatchSize = configuredBatchSize;

    console.error(
      `[${this.id}] Batch configuration: configured=${configuredBatchSize}, effective=${effectiveBatchSize}, debugMode=${isDebugMode}`,
    );
    const parseOptions: ParserOptions = isDebugMode
      ? {
          batchSize: Math.max(1, Math.min(3, effectiveBatchSize)),
          useCache: false,
        }
      : {};
    let totalEntities = 0;
    let totalRelationships = 0;
    let filesProcessed = 0;

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

          // DEBUG: Log how many unique files have results
          logger.info("DEV_AGENT", "Files ready for indexing", {
            uniqueFiles: byFile.size,
            batchIndex: i,
          });

          // VERBOSE DEBUG: Show actual numbers in console
          console.error(
            `[DevAgent] Batch ${i}: sent=${batch.length}, results=${results?.length || 0}, uniqueFiles=${byFile.size}`,
          );

          // PARALLEL indexing using enqueue() - all tasks are queued and processed in order
          // enqueue() accepts tasks even when agent is busy, queuing them internally
          const INDEXING_CONCURRENCY = 16; // How many tasks to submit in parallel
          const fileEntries = Array.from(byFile.entries());

          // Process in chunks to avoid overwhelming the queue
          for (let j = 0; j < fileEntries.length; j += INDEXING_CONCURRENCY) {
            const chunk = fileEntries.slice(j, j + INDEXING_CONCURRENCY);

            const chunkPromises = chunk.map(async ([file, group]) => {
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

              try {
                // Use enqueue() instead of process() - accepts tasks even when busy
                const indexResult = await this.indexerAgent?.enqueue(indexTask);
                return { result: indexResult as any, error: null };
              } catch (err) {
                console.error(`[DevAgent ${this.id}] Indexing failed for file ${file}:`, (err as Error).message);
                return { result: null, error: err };
              }
            });

            const chunkResults = await Promise.all(chunkPromises);

            for (const { result } of chunkResults) {
              if (result) {
                totalEntities += result.entitiesIndexed || 0;
                totalRelationships += result.relationshipsCreated || 0;
                filesProcessed += 1;
              }
            }
          }

          if (isDebugMode) {
            global.gc?.();
          }
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

    // VERBOSE DEBUG: Final summary
    console.error(
      `[DevAgent] INDEXING COMPLETE: filesProcessed=${filesProcessed}/${files.length}, entities=${totalEntities}, relationships=${totalRelationships}`,
    );

    return {
      filesProcessed,
      entitiesExtracted: totalEntities,
      relationshipsCreated: totalRelationships,
      totalFiles: files.length,
    };
  }

  private async collectFiles(directory: string, excludePatterns: string[]): Promise<string[]> {
    const files: string[] = [];
    // Note: test/tests/__tests__ NOT excluded - they can contain real code
    // Use excludePatterns parameter to explicitly exclude test directories if needed
    const defaultExcludedDirNames = new Set([
      "node_modules",
      "tmp",
      "temp",
      "cache",
      "__pycache__",
      ".pytest_cache",
      "venv",
      ".venv",
      ".memory_bank",
      "build",
      "dist",
      "out",
      ".next",
      ".nuxt",
      "coverage",
      "archives",
      "archive",
      "backups",
      "backup",
    ]);
    const agentId = this.id; // Capture this.id for use in nested function

    function shouldExclude(filePath: string): boolean {
      // Normalize path to forward slashes for cross-platform pattern matching
      const normalizedPath = filePath.replace(/\\/g, "/");
      for (const pattern of excludePatterns) {
        if (pattern.includes("**")) {
          // Convert glob pattern to regex
          // IMPORTANT: Directory names must match exactly as path segments, not substrings
          // e.g., **/test/** should match /test/ but NOT /testrunner/
          const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

          // Replace ** with pattern that matches any path segments
          // Replace * with pattern that matches within a single segment (no slashes)
          // Ensure directory names are matched as complete segments (between slashes)
          const regex = escaped
            .replace(/\*\*\//g, "(?:[^/]+/)*") // **/ matches zero or more directory levels
            .replace(/\/\*\*/g, "(?:/[^/]+)*") // /** matches zero or more trailing levels
            .replace(/\*\*/g, ".*") // standalone ** (rare)
            .replace(/\*/g, "[^/]*"); // * matches within segment

          // For patterns like **/dirname/** also match the directory itself
          // by making trailing pattern optional
          const flexibleRegex = regex.replace(/\(\?:\/\[\^\/\]\+\)\*$/, "(?:/[^/]+)*");

          if (new RegExp(flexibleRegex).test(normalizedPath)) return true;
        } else {
          // Simple pattern matching - extract core path segment
          const normalizedPattern = pattern.replace(/\*/g, "").replace(/\\/g, "/");
          if (normalizedPath.includes(normalizedPattern)) {
            return true;
          }
        }
      }
      return false;
    }

    // TRACE logging for directory scanning
    const dirStats: Record<string, number> = {};
    let excludedByPattern = 0;
    let excludedByDefault = 0;
    let scannedDirs = 0;

    function walkDir(dir: string) {
      try {
        scannedDirs++;
        const items = readdirSync(dir);
        for (const item of items) {
          const fullPath = join(dir, item);

          if (shouldExclude(fullPath)) {
            excludedByPattern++;
            continue;
          }

          const lstat = lstatSync(fullPath, { throwIfNoEntry: false });
          if (!lstat) {
            continue;
          }
          if (lstat.isSymbolicLink()) {
            continue;
          }

          if (lstat.isDirectory()) {
            const lowerItem = item.toLowerCase();
            if (defaultExcludedDirNames.has(lowerItem)) {
              excludedByDefault++;
              continue;
            }
            if (!item.startsWith(".")) {
              walkDir(fullPath);
            }
          } else if (lstat.isFile()) {
            const ext = extname(fullPath).toLowerCase();
            // Поддержка code и data файлов для semantic merge
            const fileName = item.toLowerCase();
            const isSupported =
              isCodeExtension(ext) ||
              isDataExtension(ext) ||
              // Dotfiles без расширения (e.g. .gitignore, .dockerignore)
              SUPPORTED_DATA_EXTENSIONS.some((d) => fileName === d.slice(1) || fileName.endsWith(d));
            if (isSupported) {
              files.push(fullPath);
              // Track files by directory (relative to root)
              const relDir = dir.replace(directory, "").replace(/^[\\/]/, "") || ".";
              dirStats[relDir] = (dirStats[relDir] || 0) + 1;
            }
          }
        }
      } catch (error) {
        console.error(`[DevAgent ${agentId}] Error reading directory ${dir}:`, error);
      }
    }

    walkDir(directory);

    // TRACE: Final summary - use structured logger so it appears in log file
    const sortedDirs = Object.entries(dirStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Count files by extension for diagnostics
    const extStats: Record<string, number> = {};
    for (const f of files) {
      const ext = extname(f).toLowerCase() || "(no ext)";
      extStats[ext] = (extStats[ext] || 0) + 1;
    }

    logger.info("FILE_SCAN", "File collection complete", {
      root: directory,
      dirsScanned: scannedDirs,
      filesCollected: files.length,
      excludedByPattern,
      excludedByDefault,
      byExtension: extStats,
      topDirs: Object.fromEntries(sortedDirs),
    });

    return files;
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

    // Filter to supported file extensions
    const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt"];
    const supportedFiles = files.filter((f) => {
      const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
      return supportedExtensions.includes(ext);
    });

    if (supportedFiles.length === 0) {
      console.error(`[DevAgent ${this.id}] No supported files to reindex`);
      return;
    }

    console.error(`[DevAgent ${this.id}] Reindexing ${supportedFiles.length} supported files`);

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

    const elapsed = Date.now() - startTime;
    console.error(
      `[DevAgent ${this.id}] Incremental reindex completed: ${successCount} files updated, ${errorCount} errors in ${elapsed}ms`,
    );

    // Publish completion event
    knowledgeBus.publish(
      "indexer:incremental:complete",
      {
        filesProcessed: successCount,
        errors: errorCount,
        elapsedMs: elapsed,
        source: "git-watcher",
      },
      this.id,
    );
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
