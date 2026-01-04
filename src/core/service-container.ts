/**
 * Service Container - Dependency Injection for MCP Tools
 *
 * Provides lazy initialization of all services with proper dependency management.
 * Replaces scattered getters in index.ts with centralized service access.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
import { getGlobalDbPaths } from "../shared/storage-paths.js";
import { getGraphStorage } from "../storage/graph-storage-factory.js";
import type { CodeValidator } from "../validation/code-validator.js";
import { CodeValidator as CodeValidatorClass } from "../validation/code-validator.js";
import type { VersionManager } from "../versioning/version-manager.js";
import { VersionManager as VersionManagerClass } from "../versioning/version-manager.js";

/**
 * Configuration for ServiceContainer
 */
export interface ServiceContainerConfig {
  /** Working directory for the project */
  directory: string;
  /** Function to get ConductorOrchestrator */
  getConductor: () => ConductorOrchestrator;
  /** Function to get global vector store */
  getGlobalVectorStore: () => any;
  /** Function to get semantic agent */
  getSemanticAgentFn?: () => Promise<any>;
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

  constructor(config: ServiceContainerConfig) {
    this.config = config;
  }

  /** Get working directory */
  get directory(): string {
    return this.config.directory;
  }

  /** Get graph storage (delegated to factory) */
  async getGraphStorage() {
    return getGraphStorage();
  }

  /** Get conductor orchestrator */
  getConductor(): ConductorOrchestrator {
    return this.config.getConductor();
  }

  /** Get global vector store */
  getGlobalVectorStore(): any {
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
      const vectorStore = this.getGlobalVectorStore();
      this._codeModifier = new CodeModifierClass(storage, vectorStore, this.config.directory);
      await this._codeModifier.initialize();
    }
    return this._codeModifier;
  }

  /** Get file operations (lazy) */
  async getFileOperations(): Promise<FileOperations> {
    if (!this._fileOperations) {
      const storage = await this.getGraphStorage();
      const vectorStore = this.getGlobalVectorStore();
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
      const vectorStore = this.getGlobalVectorStore();
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
      const paths = getGlobalDbPaths();
      const autodocDbPath = join(dirname(paths.graphDbPath), "autodoc.db");
      this._autoDocManager = getAutoDocManagerFactory(autodocDbPath);
      const graphStorage = await this.getGraphStorage();
      await this._autoDocManager.initialize(graphStorage);
    }
    return this._autoDocManager;
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
