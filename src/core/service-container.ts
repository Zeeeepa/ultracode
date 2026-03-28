/**
 * Service Container - Dependency Injection for MCP Tools
 *
 * Provides lazy initialization of all services with proper dependency management.
 * Replaces scattered getters in index.ts with centralized service access.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConductorOrchestrator } from "../agents/conductor-orchestrator.js";
import type { TechnologyDetector } from "../analysis/technology-detector.js";
import { TechnologyDetector as TechnologyDetectorClass } from "../analysis/technology-detector.js";
import type { AutoDocManager } from "../autodoc/storage/autodoc-manager.js";
import { getAutoDocManager as getAutoDocManagerFactory } from "../autodoc/storage/autodoc-manager.js";
import type { CodeModifier } from "../modification/code-modifier.js";
import { CodeModifier as CodeModifierClass } from "../modification/code-modifier.js";
import type { FileOperations } from "../modification/file-operations.js";
import { FileOperations as FileOperationsClass } from "../modification/file-operations.js";
import { PreviewManager } from "../modification/preview-manager.js";
import type { PatternSearch } from "../search/pattern-search.js";
import { PatternSearch as PatternSearchClass } from "../search/pattern-search.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import { sleep } from "../utils/runtime-detection.js";
import type { CodeValidator } from "../validation/code-validator.js";
import { CodeValidator as CodeValidatorClass } from "../validation/code-validator.js";
import type { VersionManager } from "../versioning/version-manager.js";
import { VersionManager as VersionManagerClass } from "../versioning/version-manager.js";
import { knowledgeBus } from "./knowledge-bus.js";

/**
 * Configuration for ServiceContainer
 */
export interface ServiceContainerConfig {
  /** Working directory for the project */
  directory: string;
  /** Function to get ConductorOrchestrator */
  getConductor: () => ConductorOrchestrator;
  /** Function to get global vector store */
  getGlobalVectorStore: () => unknown;
  /** Function to get semantic agent */
  getSemanticAgentFn?: () => Promise<unknown>;
}

/**
 * Centralized service container with lazy initialization
 */
export class ServiceContainer {
  private config: ServiceContainerConfig;

  // Cached service instances
  private _versionManager: VersionManager | null = null;
  private _codeModifier: CodeModifier | null = null;
  private _fileOperations: FileOperations | null = null;
  private _codeValidator: CodeValidator | null = null;
  private _technologyDetector: TechnologyDetector | null = null;
  private _patternSearch: PatternSearch | null = null;
  private _autoDocManager: AutoDocManager | null = null;

  // AutoDoc embeddings state
  private _autodocEmbeddingsGenerated = false;
  private _autodocEmbeddingsSubscriptionId: string | null = null;

  constructor(config: ServiceContainerConfig) {
    this.config = config;
  }

  /** Get working directory */
  get directory(): string {
    return this.config.directory;
  }

  /** Get graph storage (delegated to factory, per-project layout) */
  async getGraphStorage() {
    return getGraphStorage(this.config.directory);
  }

  /** Get conductor orchestrator */
  getConductor(): ConductorOrchestrator {
    return this.config.getConductor();
  }

  /** Get global vector store */
  getGlobalVectorStore(): unknown {
    return this.config.getGlobalVectorStore();
  }

  /** Get version manager (lazy) */
  async getVersionManager(): Promise<VersionManager> {
    if (!this._versionManager) {
      this._versionManager = new VersionManagerClass({ workingDirectory: this.config.directory });
      await this._versionManager.initialize();
    }
    return this._versionManager;
  }

  /** Get code modifier (lazy) */
  async getCodeModifier(): Promise<CodeModifier> {
    if (!this._codeModifier) {
      const storage = await this.getGraphStorage();
      const vectorStore = this.getGlobalVectorStore() as any;
      this._codeModifier = new CodeModifierClass(storage, vectorStore, this.config.directory);
      await this._codeModifier.initialize();
    }
    return this._codeModifier;
  }

  /** Get file operations (lazy) */
  async getFileOperations(): Promise<FileOperations> {
    if (!this._fileOperations) {
      const storage = await this.getGraphStorage();
      const vectorStore = this.getGlobalVectorStore() as any;
      const previewManager = new PreviewManager(storage, vectorStore);
      await previewManager.initialize();
      this._fileOperations = new FileOperationsClass(storage, vectorStore, previewManager);
    }
    return this._fileOperations;
  }

  /** Get code validator (lazy) */
  async getCodeValidator(): Promise<CodeValidator> {
    if (!this._codeValidator) {
      this._codeValidator = new CodeValidatorClass();
    }
    return this._codeValidator;
  }

  /** Get technology detector (lazy) */
  async getTechnologyDetector(): Promise<TechnologyDetector> {
    if (!this._technologyDetector) {
      const storage = await this.getGraphStorage();
      this._technologyDetector = new TechnologyDetectorClass(storage, this.config.directory);
    }
    return this._technologyDetector;
  }

  /** Get pattern search (lazy) */
  async getPatternSearch(): Promise<PatternSearch> {
    if (!this._patternSearch) {
      const storage = await this.getGraphStorage();
      const vectorStore = this.getGlobalVectorStore() as any;
      const techDetector = await this.getTechnologyDetector();
      this._patternSearch = new PatternSearchClass(storage, vectorStore, techDetector);
      await this._patternSearch.initialize();
    }
    return this._patternSearch;
  }

  /** Check if AutoDoc is enabled (has .autodoc folder) */
  isAutoDocEnabled(): boolean {
    const autodocDir = join(this.config.directory, ".autodoc");
    return existsSync(autodocDir);
  }

  /** Get AutoDoc manager (lazy, only if enabled) */
  async getAutoDocManager(): Promise<AutoDocManager | null> {
    if (!this.isAutoDocEnabled()) {
      return null;
    }

    if (!this._autoDocManager) {
      // Per-project layout: autodoc.db in same dir as graph.db (projects/{hash}/)
      const { getPerProjectMultiDbPaths, hashProjectPath } = await import("../shared/storage-paths.js");
      const projectHash = hashProjectPath(this.config.directory);
      const perProject = getPerProjectMultiDbPaths(projectHash);
      const { mkdirSync, existsSync } = await import("node:fs");
      if (!existsSync(perProject.baseDir)) mkdirSync(perProject.baseDir, { recursive: true });
      const autodocDbPath = join(perProject.baseDir, "autodoc.db");
      this._autoDocManager = getAutoDocManagerFactory(autodocDbPath);
      const graphStorage = await this.getGraphStorage();
      await this._autoDocManager.initialize(graphStorage);

      // Sync project context with graph storage
      const currentContext = graphStorage.getProjectContext();
      this._autoDocManager.setProjectContext(currentContext);

      // Auto-configure if not already configured
      if (!this._autoDocManager.getConfig()) {
        const autodocDir = join(this.config.directory, ".autodoc");
        this._autoDocManager.setConfig({
          enabled: true,
          language: "en",
          docsDir: autodocDir,
        });

        // Background sync: index .autodoc files into database
        this.runAutoDocSync(this._autoDocManager, autodocDir).catch(() => {
          // Ignore sync errors - non-critical background operation
        });
      }
    }
    return this._autoDocManager;
  }

  /** Run background sync of .autodoc folder and AUTODOC.md files to database */
  private async runAutoDocSync(adm: AutoDocManager, autodocDir: string): Promise<void> {
    const { log } = await import("../logging/index.js");

    // Subscribe to index:completed FIRST (before sync) to not miss the event
    this.subscribeToIndexCompleted(adm, log);

    try {
      const { syncDiskToDb } = await import("../autodoc/sync/file-sync.js");

      // 1. Sync .autodoc folder (architecture, flow, glossary, etc.)
      const autodocResult = await syncDiskToDb(
        autodocDir,
        (filePath) => adm.getDocumentsByFile(filePath),
        (filePath, content) => adm.saveDocument(filePath, content),
        4,
      );
      log.i("AUTODOC", "sync_autodoc_folder", {
        added: autodocResult.added.length,
        updated: autodocResult.updated.length,
        errors: autodocResult.errors.length,
      });

      // 2. Sync AUTODOC.md files from modules (src/**/AUTODOC.md)
      const srcDir = join(this.config.directory, "src");
      if (existsSync(srcDir)) {
        const srcResult = await syncDiskToDb(
          srcDir,
          (filePath) => adm.getDocumentsByFile(filePath),
          (filePath, content) => adm.saveDocument(filePath, content),
          4,
        );
        log.i("AUTODOC", "sync_src_modules", {
          added: srcResult.added.length,
          updated: srcResult.updated.length,
          errors: srcResult.errors.length,
        });
      }
    } catch (err) {
      log.w("AUTODOC", "sync_failed", { error: (err as Error).message });
    }
  }

  /** Subscribe to index:completed event to trigger embeddings generation */
  private subscribeToIndexCompleted(adm: AutoDocManager, log: unknown): void {
    // Already generated or subscribed - skip
    if (this._autodocEmbeddingsGenerated || this._autodocEmbeddingsSubscriptionId) {
      return;
    }

    // Type assertion for logger (passed from caller, always valid)
    const logger = log as {
      i: (tag: string, msg: string, data?: unknown) => void;
      w: (tag: string, msg: string, data?: unknown) => void;
      d: (tag: string, msg: string, data?: unknown) => void;
    };

    const generateEmbeddings = async () => {
      if (this._autodocEmbeddingsGenerated) {
        return;
      }

      logger.i("AUTODOC", "embeddings_triggered_by_event", { event: "index:completed" });

      try {
        await this.generateAutoDocEmbeddings(adm);
        this._autodocEmbeddingsGenerated = true;

        // Unsubscribe after successful generation
        if (this._autodocEmbeddingsSubscriptionId) {
          knowledgeBus.unsubscribe(this._autodocEmbeddingsSubscriptionId);
          this._autodocEmbeddingsSubscriptionId = null;
        }
      } catch (err) {
        logger.w("AUTODOC", "embeddings_failed", { error: (err as Error).message });
      }
    };

    this._autodocEmbeddingsSubscriptionId = knowledgeBus.subscribe(
      "autodoc-embeddings",
      "index:completed",
      generateEmbeddings,
    );

    logger.d("AUTODOC", "embeddings_subscribed", { event: "index:completed" });

    // Fallback: check if index already completed (event was missed)
    // Query knowledge bus for recent index:completed events
    const recentEvents = knowledgeBus.query("index:completed");
    if (recentEvents.length > 0) {
      logger.i("AUTODOC", "embeddings_fallback", { reason: "index_already_completed", events: recentEvents.length });
      generateEmbeddings().catch((err) => {
        logger.w("AUTODOC", "embeddings_fallback_failed", { error: (err as Error).message });
      });
    }
  }

  /** Generate embeddings for all autodoc documents */
  private async generateAutoDocEmbeddings(adm: AutoDocManager): Promise<void> {
    const { log } = await import("../logging/index.js");

    // Get semantic agent and vector store
    let semanticAgent: unknown;
    let vectorStore: unknown;

    try {
      semanticAgent = await this.getSemanticAgent();
      // Get VectorStore directly from SemanticAgent (more reliable than config.getGlobalVectorStore)
      // Type assertion needed for optional chaining on unknown
      const agent = semanticAgent as { getVectorStore?: () => unknown } | undefined;
      vectorStore = agent?.getVectorStore?.();
    } catch (err) {
      log.w("AUTODOC", "embeddings_skipped", { reason: "SemanticAgent not available", error: (err as Error).message });
      return;
    }

    if (!semanticAgent || !vectorStore) {
      log.d("AUTODOC", "embeddings_skipped", {
        reason: "Missing semanticAgent or vectorStore",
        hasAgent: !!semanticAgent,
        hasStore: !!vectorStore,
      });
      return;
    }

    // Type assertions for method calls (validated by null checks above)
    const agent = semanticAgent as { generateEmbedding: (text: string) => Promise<Float32Array | null> };
    const store = vectorStore as {
      insert: (data: {
        id: string;
        content: string;
        vector: Float32Array;
        metadata: Record<string, unknown>;
      }) => Promise<void>;
    };

    // Get all documents
    const allDocs = await adm.getAllDocuments();
    if (allDocs.length === 0) {
      return;
    }

    log.i("AUTODOC", "embeddings_start", { totalDocs: allDocs.length });

    let generated = 0;
    let skipped = 0;

    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 20;
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = allDocs.slice(i, i + BATCH_SIZE);

      for (const doc of batch) {
        try {
          // Skip docs with empty content
          if (!doc.content || doc.content.length < 10) {
            skipped++;
            continue;
          }

          const textToEmbed = `${doc.title}\n\n${doc.content}`;
          const embedding = await agent.generateEmbedding(textToEmbed);

          if (embedding) {
            await store.insert({
              id: doc.id,
              content: textToEmbed.slice(0, 1000),
              vector: embedding,
              metadata: {
                type: "autodoc",
                docType: doc.type,
                filePath: doc.filePath,
                section: doc.section,
                title: doc.title,
                createdAt: Date.now(),
              },
            });
            generated++;
          }
        } catch {
          // Skip individual doc errors
          skipped++;
        }
      }

      // Small delay between batches (using sleep for Bun compatibility)
      if (i + BATCH_SIZE < allDocs.length) {
        await sleep(100);
      }
    }

    log.i("AUTODOC", "embeddings_complete", { generated, skipped, total: allDocs.length });

    // Flush and save to disk
    if (generated > 0) {
      log.i("AUTODOC", "flushing_to_disk");
      const storeWithFlush = vectorStore as { flushAndSave?: () => Promise<void> };
      if (typeof storeWithFlush.flushAndSave === "function") {
        await storeWithFlush.flushAndSave();
      }
      log.i("AUTODOC", "embeddings_saved_to_disk");
    }
  }

  /** Get semantic agent (delegated) */
  async getSemanticAgent(): Promise<any> {
    if (this.config.getSemanticAgentFn) {
      return this.config.getSemanticAgentFn();
    }
    throw new Error("SemanticAgent getter not configured");
  }

  /** Reset all cached services */
  reset(): void {
    // Unsubscribe from embeddings event if subscribed
    if (this._autodocEmbeddingsSubscriptionId) {
      knowledgeBus.unsubscribe(this._autodocEmbeddingsSubscriptionId);
      this._autodocEmbeddingsSubscriptionId = null;
    }
    this._autodocEmbeddingsGenerated = false;

    this._versionManager = null;
    this._codeModifier = null;
    this._fileOperations = null;
    this._codeValidator = null;
    this._technologyDetector = null;
    this._patternSearch = null;
    this._autoDocManager = null;
  }
}

// Singleton instance (will be initialized in index.ts)
let serviceContainer: ServiceContainer | null = null;

/** Initialize the global service container */
export function initServiceContainer(config: ServiceContainerConfig): ServiceContainer {
  serviceContainer = new ServiceContainer(config);
  return serviceContainer;
}

/** Get the global service container */
export function getServiceContainer(): ServiceContainer {
  if (!serviceContainer) {
    throw new Error("ServiceContainer not initialized. Call initServiceContainer() first.");
  }
  return serviceContainer;
}

/** Check if service container is initialized */
export function isServiceContainerInitialized(): boolean {
  return serviceContainer !== null;
}
