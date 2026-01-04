#!/usr/bin/env node

/**
 * TASK-002: MCP Server for Code Graph Analysis with Semantic Tools
 * Multi-agent LiteRAG architecture optimized for commodity hardware
 *
 * This server implements 8 new semantic-aware MCP tools that leverage
 * QueryAgent and SemanticAgent for advanced code analysis capabilities.
 *
 * @task_id TASK-002
 * @history
 *  - 2025-09-14: Enhanced by Dev-Agent - TASK-002: Added 8 new semantic MCP tools
 */

// CRITICAL: Check for --pipe flag BEFORE any imports (to prevent JSON-RPC corruption)
// Set env variable early so imported modules can check it
if (process.argv.includes("--pipe")) {
  process.env["MCP_QUIET_MODE"] = "true";
}

// CRITICAL: Override console BEFORE any imports (to prevent JSON-RPC corruption in --pipe mode)
// In Bun with native modules, even console function calls can cause crashes
// Make console completely no-op in quiet mode (when running as MCP server)
(() => {
  const isBun = typeof (globalThis as any).Bun !== "undefined";
  const quietMode = process.env["MCP_QUIET_MODE"] === "true";

  // CRITICAL: In Bun+quiet mode, use absolute minimal no-op functions
  // Even argument spreading (...args) can cause issues with native modules
  if (isBun && quietMode) {
    // Absolute minimum - empty functions with no parameter handling
    const noop = () => {};
    console.error = noop;
    console.warn = noop;
    console.log = noop;
    console.info = noop;
    console.debug = noop;
  } else if (quietMode) {
    // Node.js quiet mode: suppress output but safely
    const noop = () => {};
    console.error = noop;
    console.warn = noop;
    console.log = noop;
    console.info = noop;
    console.debug = noop;
  }
  // Non-quiet mode: leave console as-is
})();

// TASK-001: Environment variable fallback for embedding model - MUST BE FIRST
function createSafeEnvironment() {
  // Provide safe defaults for environment variables that might be undefined
  const safeEnv = {
    ...process.env,
    // Ensure these are defined to prevent "env is not defined" errors
    NODE_ENV: process.env["NODE_ENV"] || "development",
    MCP_EMBEDDING_ENABLED: process.env["MCP_EMBEDDING_ENABLED"] || "true",
    MCP_EMBEDDING_PROVIDER: process.env["MCP_EMBEDDING_PROVIDER"] || "transformers",
    MCP_EMBEDDING_FALLBACK: process.env["MCP_EMBEDDING_FALLBACK"] || "true",
  };

  // Make env globally available for embedding models
  (globalThis as any).env = safeEnv;
  return safeEnv;
}

// Initialize safe environment BEFORE any imports that might use embedding generator
createSafeEnvironment();

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Consolidated MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
// Schema and Node.js built-ins
import { z } from "zod";

// Tool schemas (extracted to separate files)
import {
  AddMemberSchema,
  AnalyzeCodeImpactSchema,
  AnalyzeHotspotsSchema,
  AnalyzeMergeConflictsSchema,
  AnalyzeStateChaosSchema,
  AutoDocChangelogSchema,
  AutoDocDetectLanguageSchema,
  AutoDocGenerateSchema,
  AutoDocGetSchema,
  AutoDocInitSchema,
  AutoDocInstallHooksSchema,
  AutoDocSaveSchema,
  AutoDocSearchSchema,
  AutoDocStatusSchema,
  AutoDocSyncSchema,
  AutoDocValidateSchema,
  CleanIndexSchema,
  CleanupSnapshotsSchema,
  ClearBusTopicSchema,
  CopyFileSchema,
  CreateFileSchema,
  CreateSnapshotSchema,
  CrossLanguageSearchSchema,
  DetectCodeClonesSchema,
  DetectTechnologyStackSchema,
  FindRelatedConceptsSchema,
  FindSimilarCodeSchema,
  GetAgentMetricsSchema,
  GetBusStatsSchema,
  GetGraphHealthSchema,
  GetGraphSchema,
  GetGraphStatsSchema,
  GetMergeSuggestionsSchema,
  GetSemanticMergeInfoSchema,
  IndexToolSchema,
  JscpdCloneDetectionSchema,
  ListEntitiesToolSchema,
  ListRelationshipsToolSchema,
  ListSnapshotsSchema,
  ModifyEntityCodeSchema,
  PatternSearchSchema,
  QueryToolSchema,
  RenameFileSchema,
  RenameSymbolSchema,
  RollbackSnapshotSchema,
  SemanticMergeSchema,
  SemanticSearchSchema,
  SplitFileSchema,
  SuggestRefactoringSchema,
  SynthesizeFilesSchema,
  ValidateDirectorySchema,
  ValidateFileSchema,
} from "./tools/schemas/index.js";

// Helper to convert Zod schemas to JSON Schema using native Zod v4 method
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  const result = z.toJSONSchema(schema) as Record<string, unknown>;
  // Ensure type: "object" is present for MCP compatibility
  if (!result["type"]) {
    result["type"] = "object";
  }
  return result;
}

// Import our multi-agent components
import { ConductorOrchestrator } from "./agents/conductor-orchestrator.js";
import type { IndexerAgent } from "./agents/indexer-agent.js";
import { TechnologyDetector } from "./analysis/technology-detector.js";
// AutoDoc: Semantic documentation layer
import {
  type AutoDocManager,
  type AutoDocWatcherConfig,
  getAutoDocManager as getAutoDocManagerFactory,
  getAutoDocWatcher,
} from "./autodoc/index.js";
// CLI argument parsing
import { handleSetupCommand, parseArgs, printHelp } from "./cli/args-parser.js";
// TASK-001: Import new YAML configuration system
import { ConfigLoader, initializeConfig, validateConfig } from "./config/yaml-config.js";
import { getOrCreateAgent, registerAllAgents } from "./core/agent-registry.js";
// VARIANT-C: DI Container integration
import { getGlobalContainer } from "./core/di-container.js";
// Indexing state management
import {
  areTimersSuspended,
  getIndexingStatus,
  isIndexing,
  isProjectIndexing,
  registerAsyncLoopStarter,
  resumeTimers,
  setIndexingState,
} from "./core/indexing-state.js";
import { knowledgeBus } from "./core/knowledge-bus.js";
import { PipeServer } from "./core/pipe-transport.js";
import { resourceManager } from "./core/resource-manager.js";
// LayeredIndexManager for branch-aware indexing
import { LayeredIndexManager } from "./layered/index.js";
import { CodeModifier } from "./modification/code-modifier.js";
import { FileOperations } from "./modification/file-operations.js";
import { PreviewManager } from "./modification/preview-manager.js";
import { PatternSearch } from "./search/pattern-search.js";
import { shutdownFaissProvider } from "./semantic/faiss/faiss-provider.js";
import { getGpuClient, shutdownGpuClient } from "./semantic/gpu/gpu-client.js";
// OVMS Native lifecycle management
import { initializeOVMSNative, type OVMSNativeConfig, shutdownOVMSNative } from "./semantic/ovms-native-manager.js";
import { detectRuntime } from "./shared/runtime-detect.js";
// Storage initialization
import { DEFAULT_BRANCH, getLogsDir, getProjectHash, initializeStorageDirs } from "./shared/storage-paths.js";
import { configureGraphStorage, getGraphStorage, initializeGraphStorage } from "./storage/graph-storage-factory.js";
import type { ToolContext } from "./tools/base-tool-handler.js";
import { branchToolDefinitions } from "./tools/branch-schemas.js";
import { toolRegistry } from "./tools/tool-registry.js";
// Re-export for external consumers
export {
  areTimersSuspended,
  getIndexingStatus,
  isIndexing,
  isProjectIndexing,
  registerAsyncLoopStarter,
  resumeTimers,
  setIndexingState,
};

// Service container for dependency injection
import { initServiceContainer, type ServiceContainer } from "./core/service-container.js";

import type { AgentTask } from "./types/agent.js";
import { AgentType } from "./types/agent.js";
import { AgentBusyError } from "./types/errors.js";
import type { CloneGroup } from "./types/semantic.js";
import type { Entity, Relationship } from "./types/storage.js";
import { EntityType } from "./types/storage.js";
import { getVectorDimensions, loadSemanticConfig } from "./utils/config-paths.js";
import { initHasher } from "./utils/fast-hash.js";
import { createRequestId, logger } from "./utils/logger.js";
import { ensureOllamaRunning, getStatusMessage } from "./utils/ollama-checker.js";

// =============================================================================
// RUNTIME-AWARE SLEEP HELPER
// Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
// =============================================================================
const currentRuntime = detectRuntime();
async function sleep(ms: number): Promise<void> {
  if (currentRuntime === "bun" && typeof (globalThis as any).Bun?.sleep === "function") {
    // Bun: use Bun.sleep which works correctly
    await (globalThis as any).Bun.sleep(ms);
  } else {
    // Node.js: setTimeout
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// GLOBAL EXCEPTION HANDLERS - Catch crashes and log them to file
// =============================================================================

// Local timestamp with timezone (e.g., 2026-01-01T03:45:30.123+04:00)
function getLocalTimestamp(): string {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mins = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return `${localTime.toISOString().slice(0, -1)}${sign}${hours}:${mins}`;
}

// Get local date string for log file names (YYYY-MM-DD in local time)
function getLocalDateString(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

function writeToLogFile(message: string): void {
  try {
    const logsDir = getLogsDir();
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const dateStr = getLocalDateString();
    const logFile = join(logsDir, `mcp-server-${dateStr}.log`);
    appendFileSync(logFile, message + "\n");
  } catch {
    // Fallback to stderr if log file fails
    process.stderr.write(message + "\n");
  }
}

process.on("uncaughtException", (error, origin) => {
  const timestamp = getLocalTimestamp();
  const message = `[${timestamp}] [FATAL] [CRASH] Uncaught exception (${origin}): ${error.message}\n${error.stack}`;
  writeToLogFile(message);
  console.error(message);
  // Exit after brief delay without setTimeout (Bun compatibility)
  (async () => {
    const start = Date.now();
    while (Date.now() - start < 100) await sleep(10);
    process.exit(1);
  })();
});

process.on("unhandledRejection", (reason, _promise) => {
  const timestamp = getLocalTimestamp();
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const message = `[${timestamp}] [FATAL] [CRASH] Unhandled rejection: ${error.message}\n${error.stack}`;
  writeToLogFile(message);
  console.error(message);
});

// SIGTERM/SIGINT handlers are defined later in startMcpServer() after all imports
// This allows proper async shutdown including OVMS Native

import { CodeValidator } from "./validation/code-validator.js";
// PHASE 8: Import new code modification and analysis components
import { VersionManager } from "./versioning/version-manager.js";

// === STARTUP TIMING WITH TRACE LOGGING ===
const _startupTimers: Record<string, number> = {};
const PROCESS_START_TIME = Date.now();

function _startTimer(name: string) {
  _startupTimers[name] = Date.now();
  const uptimeMs = Date.now() - PROCESS_START_TIME;
  logger.trace("STARTUP", `[+${uptimeMs}ms] ▶ START: ${name}`);
}
function _endTimer(name: string) {
  const elapsed = Date.now() - (_startupTimers[name] || Date.now());
  const uptimeMs = Date.now() - PROCESS_START_TIME;
  logger.trace("STARTUP", `[+${uptimeMs}ms] ◀ END: ${name} (${elapsed}ms)`);
  console.error(`[STARTUP] ${name}: ${elapsed}ms`);
  return elapsed;
}

// Initialize xxHash WASM BEFORE any hashing operations (required for deterministic project paths)
_startTimer("initHasher");
await initHasher();
_endTimer("initHasher");

// Initialize centralized storage directories BEFORE any storage operations
_startTimer("initializeStorageDirs");
initializeStorageDirs();
_endTimer("initializeStorageDirs");

// Parse command line arguments
const cliArgs = parseArgs();
const {
  configPath: overrideConfigPath,
  helpRequested,
  versionRequested,
  setupRequested,
  noAutoIndex,
  pipeServerMode,
  quietMode,
  positionalArgs,
} = cliArgs;

if (helpRequested) {
  printHelp();
  process.exit(0);
}

// Handle setup command - launch PowerShell/Bash script
if (setupRequested) {
  handleSetupCommand(import.meta.url);
}

const versionInfo = getVersionInfo();

type NormalizedSemanticGroup = {
  id: string;
  cloneType: CloneGroup["cloneType"];
  avgSimilarity: number;
  files: Array<{
    filePath: string;
    occurrences: Array<{
      id: string;
      similarity: number;
      startLine?: number | undefined;
      snippet: string;
    }>;
  }>;
};

function parseSemanticMemberPath(
  memberId: string,
  memberPath: string | undefined,
): {
  filePath: string;
  startLine?: number | undefined;
} {
  let filePath = memberPath ?? "";
  let startLine: number | undefined;

  if (!filePath || filePath.startsWith("parsed:")) {
    const match = /^parsed:(.*?):(\d+):\d+$/.exec(memberId);
    if (match) {
      filePath = match[1] ?? filePath;
      startLine = Number.parseInt(match[2] ?? "", 10);
    }
  }

  if (!filePath && memberId.includes(":")) {
    filePath = memberId.split(":")[0] ?? memberId;
  }

  return { filePath, startLine };
}

function _normalizeSemanticCloneGroups(
  groups: CloneGroup[],
  baseDir: string,
): {
  groups: NormalizedSemanticGroup[];
  skippedGroups: number;
} {
  const normalized: NormalizedSemanticGroup[] = [];
  let skippedGroups = 0;

  for (const group of groups) {
    const files = new Map<
      string,
      {
        filePath: string;
        occurrences: Array<{
          id: string;
          similarity: number;
          startLine?: number | undefined;
          snippet: string;
        }>;
      }
    >();

    for (const member of group.members) {
      const { filePath: rawPath, startLine } = parseSemanticMemberPath(member.id, member.path);
      const sanitizedPath =
        rawPath && baseDir && rawPath.startsWith(baseDir)
          ? relative(baseDir, rawPath) || rawPath
          : rawPath || member.id;
      const record =
        files.get(sanitizedPath) ??
        files.set(sanitizedPath, { filePath: sanitizedPath, occurrences: [] }).get(sanitizedPath)!;
      record.occurrences.push({
        id: member.id,
        similarity: member.similarity,
        startLine,
        snippet: member.content,
      });
    }

    if (files.size < 2) {
      skippedGroups += 1;
      continue;
    }

    normalized.push({
      id: group.id,
      cloneType: group.cloneType,
      avgSimilarity: group.avgSimilarity,
      files: Array.from(files.values()),
    });
  }

  return { groups: normalized, skippedGroups };
}

if (versionRequested) {
  console.error(
    `${versionInfo.name} ${versionInfo.version}\nNode ${versionInfo.nodeVersion} (${versionInfo.platform} ${versionInfo.arch})`,
  );
  process.exit(0);
}

// Default to cwd if no directory specified (for Comm proxy mode)
if (positionalArgs.length < 1) {
  positionalArgs.push(process.cwd());
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}

if (overrideConfigPath) {
  ConfigLoader.setOverridePath(overrideConfigPath);
}

/**
 * Get version information from package.json
 */
function getVersionInfo() {
  try {
    // Get the directory of the current file
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const currentDir = dirname(currentFilePath);

    // package.json is in the root, one level up from dist/
    const packageJsonPath = join(currentDir, "../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    return {
      name: packageJson.name || "@er77/ultrascript-tools-mcp",
      version: packageJson.version || "unknown",
      description: packageJson.description || "",
      homepage: packageJson.homepage || "",
      repository: packageJson.repository?.url || "",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  } catch (error) {
    // Fallback if package.json cannot be read
    return {
      name: "@er77/ultrascript-tools-mcp",
      version: "unknown",
      description: "Multi-agent LiteRAG MCP server for advanced code graph analysis",
      homepage: "https://github.com/er77/ultrascript-tools-mcp",
      repository: "git+https://github.com/er77/ultrascript-tools-mcp.git",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      error: error instanceof Error ? error.message : "Failed to read package.json",
    };
  }
}

const directory = normalize(resolve(expandHome(positionalArgs[0]!)));

// Re-export from shared module for backward compatibility
import { getCurrentIndexingDirectory, setCurrentIndexingDirectory } from "./shared/indexing-context.js";
export { getCurrentIndexingDirectory };

type DebugRequest = {
  raw: string;
  parsed: unknown;
};

const debugRequestStrings = positionalArgs.slice(1);
const debugRequests: DebugRequest[] = [];
const isDebugMode = debugRequestStrings.length > 0;

for (const raw of debugRequestStrings) {
  const trimmed = raw.trim();
  if (!trimmed) continue;
  try {
    debugRequests.push({ raw: trimmed, parsed: JSON.parse(trimmed) });
  } catch (error) {
    console.error(`[Debug] Failed to parse JSON request: ${trimmed}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (isDebugMode) {
  process.env["MCP_DEBUG_MODE"] = process.env["MCP_DEBUG_MODE"] ?? "1";
  if (!process.env["PARSER_DISABLE_CACHE"]) {
    process.env["PARSER_DISABLE_CACHE"] = "1";
  }
  process.env["MCP_DEBUG_DISABLE_SEMANTIC"] = process.env["MCP_DEBUG_DISABLE_SEMANTIC"] ?? "1";
}

function normalizeInputPath(rawPath: string): string;
function normalizeInputPath(rawPath?: string | null): string | undefined;
function normalizeInputPath(rawPath?: string | null): string | undefined {
  if (!rawPath) return undefined;
  const expanded = expandHome(rawPath);
  const target = isAbsolute(expanded) ? expanded : resolve(directory, expanded);
  return normalize(target);
}

// TASK-001: Initialize YAML configuration system
_startTimer("initializeConfig");
const config = initializeConfig();
_endTimer("initializeConfig");

// Validate configuration at startup
const validation = validateConfig(config);
if (!validation.valid) {
  // Can't use console.error in quiet mode, but this is a critical error
  if (!quietMode) {
    console.error("[Config] Configuration validation failed:");
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
  }
  process.exit(1);
}

// Initialize global SQLiteManager with database configuration
console.error("[Main] Initializing global SQLiteManager with config.database.path:", config.database.path);
console.error("[Main] CLI directory argument:", directory);
console.error("[Main] process.cwd():", process.cwd());

// IMPORTANT: Set the indexing directory BEFORE creating SQLiteManager
// This ensures getDefaultDbPath() uses the correct project path
setCurrentIndexingDirectory(directory);
console.error("[Main] Set current indexing directory to:", directory);

// SQLiteManager removed - using libsql-based storage via graph-storage-factory
// Storage initialization happens lazily via getGraphStorage()

// Track current project for context switching
let currentProjectPath = directory;

/**
 * Switch global context to a different project
 * v3: With unified database, we just change project context on GraphStorage and VectorStore
 * No SQLiteManager recreation needed!
 *
 * @param projectPath - Path to the new project
 * @param branchName - Optional branch name (defaults to DEFAULT_BRANCH)
 */
async function _switchGlobalProjectContext(projectPath: string, branchName?: string): Promise<void> {
  const newBranch = branchName || DEFAULT_BRANCH;

  if (projectPath === currentProjectPath) {
    console.error(`[Main] v3: Already on project: ${projectPath}`);
    return; // Already on this project
  }

  console.error(`[Main] v3: Switching project context: ${currentProjectPath} -> ${projectPath}`);
  console.error(`[Main] v3: Project hash: ${getProjectHash(projectPath)}, branch: ${newBranch}`);

  // v3: Update project path tracking
  currentProjectPath = projectPath;

  // v3: Update GraphStorage context (no recreation needed!)
  const storage = await getGraphStorage();
  storage.setProject(projectPath, newBranch);
  console.error(`[Main] v3: GraphStorage context updated`);

  // v3: Update SemanticAgent's VectorStore context (no recreation needed!)
  try {
    const cond = getConductor();
    if (cond) {
      const existingAgents = cond.getAgentsByType(AgentType.SEMANTIC);
      if (existingAgents.length > 0) {
        const semanticAgent = existingAgents[0] as any;
        if (semanticAgent && typeof semanticAgent.reinitializeForProject === "function") {
          // v3: reinitializeForProject now just changes context
          await semanticAgent.reinitializeForProject(projectPath, newBranch);
        }
      }
    }
  } catch (e) {
    console.error(`[Main] v3: Failed to update SemanticAgent context: ${(e as Error).message}`);
  }

  // Update indexing directory for compatibility
  console.error(`[Main] v3: Setting indexing directory to ${projectPath}`);
  setCurrentIndexingDirectory(projectPath);
  console.error(`[Main] v3: getCurrentIndexingDirectory() now = ${getCurrentIndexingDirectory()}`);

  // v3: No need to reset conductor or recreate agents - context change is sufficient!
  // Just reset cached search/modifier instances that may have cached project-specific data
  patternSearch = null;
  codeModifier = null;
  fileOperations = null;

  console.error(`[Main] v3: Project context switched to: ${projectPath} (branch: ${newBranch})`);
}

// Initialize global GraphStorage (libsql unified storage)
console.error("[Main] Initializing global GraphStorage (libsql unified)");

// Configure vector dimensions from semantic-config.json BEFORE initializing storage
const vectorDimensions = getVectorDimensions();
configureGraphStorage({ dimensions: vectorDimensions });

_startTimer("initializeGraphStorage");
await initializeGraphStorage();
_endTimer("initializeGraphStorage");

// Early GPU worker startup (non-blocking) - starts Named Pipe connection in background
// This takes ~5s, so start early to overlap with other initialization
let gpuWorkerStartPromise: Promise<boolean> | null = null;
const gpuStartTime = Date.now();
try {
  const gpuClient = getGpuClient();
  gpuWorkerStartPromise = gpuClient.start();
  gpuWorkerStartPromise
    .then((success) => {
      console.error(`[Main] GPU worker started in background (${Date.now() - gpuStartTime}ms, success=${success})`);
    })
    .catch((err) => {
      console.error(`[Main] GPU worker background start failed: ${(err as Error).message}`);
    });
  console.error("[Main] GPU worker start initiated (non-blocking)");
} catch (err) {
  console.error(`[Main] Failed to initiate GPU worker: ${(err as Error).message}`);
}

// v3: Set initial project context for GraphStorage
const initialStorage = await getGraphStorage();
initialStorage.setProject(directory, DEFAULT_BRANCH);
console.error(
  `[Main] v3: Initial GraphStorage context: project=${getProjectHash(directory)}, branch=${DEFAULT_BRANCH}`,
);

// Initialize logging system with config
logger.systemEvent("MCP Server Starting", {
  directory,
  nodeVersion: process.version,
  platform: process.platform,
  pid: process.pid,
  configEnvironment: config.environment,
  embeddingEnabled: config.mcp.embedding?.enabled,
});

// Initialize resource manager with configuration constraints
const conductorResources = config.conductor.resourceConstraints;

// Determine actual provider: semantic-config.json takes priority over YAML
const semanticConfig = loadSemanticConfig();
const semanticProvider = semanticConfig?.embedding?.platform;
const yamlProvider = config.mcp.embedding?.provider;
const actualProvider = semanticProvider || yamlProvider || "auto";

// Start resource monitoring (disabled in pipe mode - Bun compatibility)
if (!pipeServerMode) {
  resourceManager.startMonitoring();
}

logger.systemEvent("Resource Manager Started", {
  maxMemoryMB: conductorResources.maxMemoryMB,
  maxCpuPercent: conductorResources.maxCpuPercent,
  embeddingProvider: actualProvider,
  semanticConfigProvider: semanticProvider,
  yamlProvider,
  monitoringEnabled: true,
});

// Initialize OVMS Native if configured (auto-start embedding server)
if (actualProvider === "ovms-native") {
  const ovmsNativeConfig: OVMSNativeConfig = {
    enabled: true,
    autoStart: true,
    restPort: 8083,
    grpcPort: 9001,
    healthCheckIntervalMs: 30000,
    startupTimeoutMs: 120000, // 2 minutes for model loading
  };

  const ovmsStarted = await initializeOVMSNative(ovmsNativeConfig);
  if (ovmsStarted) {
    logger.systemEvent("OVMS Native Started", { provider: actualProvider, restPort: 8083, grpcPort: 9001 });
    console.error("[Main] OVMS Native started on port 8083");
  } else {
    // No fallback - if ovms-native is configured, it must start
    console.error("[Main] ERROR: OVMS Native failed to start. Check installation with: setup-embedding");
    console.error("[Main] Embedding generation will not work until OVMS Native is running.");
    logger.error("OVMS_NATIVE", "Failed to start OVMS Native - embedding disabled");
  }
}

// VARIANT-C: Initialize DI Container and register all agents
_startTimer("registerAllAgents");
const container = getGlobalContainer();
// Storage is accessed via getGraphStorage() - no need to register SQLiteManager
await registerAllAgents(container);
_endTimer("registerAllAgents");
console.error("[Main] DI Container initialized with all agents");

// Initialize conductor orchestrator lazily
let conductor: ConductorOrchestrator | null = null;

function getConductor(): ConductorOrchestrator {
  if (!conductor) {
    // TASK-001: Use YAML configuration for conductor setup
    conductor = new ConductorOrchestrator(config.conductor ?? {});
  }
  return conductor;
}

// Global VectorStore instance (lazy-loaded from SemanticAgent)
// Used by code modification components (CodeModifier, FileOperations, PatternSearch)
let globalVectorStore: any = null;

// Initialize globalVectorStore on first semantic agent access
async function initializeGlobalVectorStore(): Promise<void> {
  if (!globalVectorStore) {
    try {
      const semanticAgent = await getSemanticAgent();
      globalVectorStore = semanticAgent.getVectorStore();
    } catch (error) {
      console.warn("[Main] Failed to get VectorStore:", error);
      globalVectorStore = null;
      patternSearch = null; // Reset PatternSearch to use new GraphStorage
      codeModifier = null; // Reset CodeModifier (uses GraphStorage)
      fileOperations = null; // Reset FileOperations (uses GraphStorage)
      autoDocManager = null; // Reset AutoDocManager
    }
  }
}

// ============================================================================
// PHASE 8: Service Container initialization
// ============================================================================

// Initialize ServiceContainer (will be fully configured after getSemanticAgent is defined)
let serviceContainerInstance: ServiceContainer | null = null;

function getOrInitServiceContainer(): ServiceContainer {
  if (!serviceContainerInstance) {
    serviceContainerInstance = initServiceContainer({
      directory,
      getConductor,
      getGlobalVectorStore: () => globalVectorStore,
      getSemanticAgentFn: () => getSemanticAgent(),
    });
  }
  return serviceContainerInstance;
}

// Legacy global instances (will be migrated to ServiceContainer)
let versionManager: VersionManager | null = null;
let codeModifier: CodeModifier | null = null;
let fileOperations: FileOperations | null = null;
let codeValidator: CodeValidator | null = null;
let technologyDetector: TechnologyDetector | null = null;
let patternSearch: PatternSearch | null = null;
let autoDocManager: AutoDocManager | null = null;

async function _getVersionManager(): Promise<VersionManager> {
  if (!versionManager) {
    versionManager = new VersionManager({ workingDirectory: directory });
    await versionManager.initialize();
  }
  return versionManager;
}

async function _getCodeModifier(): Promise<CodeModifier> {
  if (!codeModifier) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    codeModifier = new CodeModifier(storage, vectorStore, directory);
    await codeModifier.initialize();
  }
  return codeModifier;
}

async function _getFileOperations(): Promise<FileOperations> {
  if (!fileOperations) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    const previewManager = new PreviewManager(storage, vectorStore);
    await previewManager.initialize();
    fileOperations = new FileOperations(storage, vectorStore, previewManager);
  }
  return fileOperations;
}

async function _getCodeValidator(): Promise<CodeValidator> {
  if (!codeValidator) {
    codeValidator = new CodeValidator();
  }
  return codeValidator;
}

async function getTechnologyDetector(): Promise<TechnologyDetector> {
  if (!technologyDetector) {
    const storage = await getGraphStorage();
    technologyDetector = new TechnologyDetector(storage, directory);
  }
  return technologyDetector;
}

async function _getPatternSearch(): Promise<PatternSearch> {
  if (!patternSearch) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    const techDetector = await getTechnologyDetector();
    patternSearch = new PatternSearch(storage, vectorStore, techDetector);
    await patternSearch.initialize();
  }
  return patternSearch;
}

async function _getAutoDocManager(): Promise<AutoDocManager> {
  if (!autoDocManager) {
    // Use autodoc.db in the same directory as unified storage
    const { getGlobalDbPaths } = await import("./shared/storage-paths.js");
    const { dirname, join } = await import("node:path");
    const paths = getGlobalDbPaths();
    const autodocDbPath = join(dirname(paths.graphDbPath), "autodoc.db");
    autoDocManager = getAutoDocManagerFactory(autodocDbPath);
    const graphStorage = await getGraphStorage();
    await autoDocManager.initialize(graphStorage);
  }
  return autoDocManager;
}

// LayeredIndexManager - orchestrates branch-aware indexing with delta layers
let layeredIndexManager: LayeredIndexManager | null = null;

async function _getLayeredIndexManager(): Promise<LayeredIndexManager | null> {
  if (layeredIndexManager) {
    return layeredIndexManager;
  }

  try {
    // Get required dependencies
    const baseIndex = await getGraphStorage();
    const cond = getConductor();
    await cond.initialize();

    // Get semantic agent for vector store
    const agent = await getOrCreateAgent(container, cond, AgentType.SEMANTIC);
    const baseVectorStore = agent?.getVectorStore?.();

    if (!baseVectorStore) {
      console.error("[Main] getLayeredIndexManager: No vector store available");
      return null;
    }

    // Get indexer agent for branch manager and git watcher
    const indexerAgent = cond.getAgentByType(AgentType.INDEXER) as any;
    const branchManager = indexerAgent?.getBranchManager?.();
    const gitWatcher = indexerAgent?.getGitWatcher?.();

    if (!branchManager) {
      console.error("[Main] getLayeredIndexManager: No branch manager available");
      return null;
    }

    // Create LayeredIndexManager
    layeredIndexManager = new LayeredIndexManager(baseIndex, baseVectorStore, branchManager, gitWatcher || null, {
      workingDirectory: directory,
      enableFileWatching: !!gitWatcher,
      enableMaintenance: true,
      debug: false,
    });

    await layeredIndexManager.initialize();
    console.error("[Main] LayeredIndexManager initialized successfully");

    return layeredIndexManager;
  } catch (error) {
    console.error("[Main] Failed to initialize LayeredIndexManager:", error);
    return null;
  }
}

// VARIANT-C: Unified agent getter using DI Container
async function getSemanticAgent(): Promise<any> {
  const currentDir = getCurrentIndexingDirectory();
  console.error(
    `[Main] getSemanticAgent: getCurrentIndexingDirectory()=${currentDir}, currentProjectPath=${currentProjectPath}`,
  );

  const cond = getConductor();
  await cond.initialize();
  const agent = await getOrCreateAgent(container, cond, AgentType.SEMANTIC);

  // v3: Ensure agent's VectorStore has correct project context
  if (agent && typeof agent.reinitializeForProject === "function" && currentDir) {
    const vectorStore = agent.getVectorStore?.();
    const currentContext = vectorStore?.getProjectContext?.();
    const expectedProjectHash = getProjectHash(currentDir);

    if (currentContext?.projectHash !== expectedProjectHash) {
      console.error(
        `[Main] v3: getSemanticAgent: VectorStore project mismatch! current=${currentContext?.projectHash}, expected=${expectedProjectHash}`,
      );
      await agent.reinitializeForProject(currentDir);
    }
  }

  return agent;
}

async function getDevAgent(): Promise<any> {
  const cond = getConductor();
  await cond.initialize();
  return await getOrCreateAgent(container, cond, AgentType.DEV);
}

async function getDoraAgent(): Promise<any> {
  const cond = getConductor();
  await cond.initialize();
  return await getOrCreateAgent(container, cond, AgentType.DORA);
}

async function _ensureSemanticsReady(minVectors = 1, timeoutMs = 15000): Promise<boolean> {
  if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] === "1") {
    return true;
  }
  const startEnsure = Date.now();
  const agent = await getSemanticAgent();
  const agentTime = Date.now() - startEnsure;

  await initializeGlobalVectorStore(); // Initialize global vector store for code modification
  const initTime = Date.now() - startEnsure - agentTime;

  // First check cached metrics
  const metrics = typeof agent.getSemanticMetrics === "function" ? agent.getSemanticMetrics() : undefined;
  if (metrics && metrics.vectorsStored >= minVectors) {
    logger.info("SEMANTIC_READY", `Ready immediately (cached)`, {
      vectors: metrics.vectorsStored,
      agentMs: agentTime,
      initMs: initTime,
    });
    return true;
  }

  // If cached metrics show 0, check vector store directly (metrics may not be updated)
  const vectorStore = agent.getVectorStore();
  if (vectorStore) {
    const actualCount = await vectorStore.count();
    if (actualCount >= minVectors) {
      logger.info("SEMANTIC_READY", `Ready (actual count)`, {
        actualVectors: actualCount,
        cachedVectors: metrics?.vectorsStored ?? 0,
        agentMs: agentTime,
        initMs: initTime,
      });
      return true;
    }
  }

  // Poll for vectors during indexing
  logger.info("SEMANTIC_READY", `No vectors found, polling...`, { timeoutMs });
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const currentMetrics = typeof agent.getSemanticMetrics === "function" ? agent.getSemanticMetrics() : undefined;
      if (currentMetrics && currentMetrics.vectorsStored >= minVectors) {
        logger.info("SEMANTIC_READY", `Ready after polling`, {
          pollingMs: Date.now() - start,
          vectors: currentMetrics.vectorsStored,
        });
        return true;
      }
    } catch {}

    // Small delay to allow initialization to complete
    await sleep(100);
  }
  logger.warn("SEMANTIC_READY", `Timeout, proceeding anyway`, { timeoutMs });
  return false;
}

function toPosixPath(p?: string): string {
  return (p || "").replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function _resolveEntity(
  storage: Awaited<ReturnType<typeof getGraphStorage>>,
  identifier: string,
): Promise<Entity | null> {
  const direct = await storage.getEntity(identifier);
  if (direct) return direct;

  const query = await storage.executeQuery({
    type: "entity",
    filters: { name: new RegExp(escapeRegExp(identifier), "i") },
    limit: 5,
  });
  if (query.entities.length > 0) {
    return query.entities[0]!;
  }

  const fallback = await storage.executeQuery({ type: "entity", limit: 1 });
  return fallback.entities[0] ?? null;
}

async function _resolveEntityWithHint(
  storage: Awaited<ReturnType<typeof getGraphStorage>>,
  name: string,
  hintFilePath?: string,
): Promise<Entity | null> {
  const esc = (s: string) => escapeRegExp(s);
  const resolvedHintPath = hintFilePath ? normalizeInputPath(hintFilePath) : undefined;

  if (resolvedHintPath) {
    const hintLower = toPosixPath(resolvedHintPath).toLowerCase();

    const exact = await storage.executeQuery({
      type: "entity",
      filters: {
        filePath: resolvedHintPath,
        name: new RegExp(`^${esc(name)}$`, "i"),
      },
      limit: 5,
    });
    if (exact.entities.length > 0) {
      exact.entities.sort((a, b) => (a.filePath?.length ?? 0) - (b.filePath?.length ?? 0));
      return exact.entities[0]!;
    }

    const fuzzy = await storage.executeQuery({
      type: "entity",
      filters: { name: new RegExp(`^${esc(name)}$`, "i") },
      limit: 30,
    });

    const badPaths = [
      "/dist/",
      "/build/",
      "/out/",
      "/.next/",
      "/.nuxt/",
      "/coverage/",
      "/node_modules/",
      "/tmp/",
      "/temp/",
      "/archives/",
      "/archive/",
      ".zip",
      ".tar",
      ".gz",
      ".tgz",
      ".rar",
      ".7z",
      ".xz",
      ".bz2",
      ".zst",
    ];

    const ranked = fuzzy.entities
      .map((e) => {
        const p = toPosixPath(e.filePath).toLowerCase();
        let score = 0;
        if (p === hintLower) score += 5;
        else if (p.endsWith(hintLower)) score += 4;
        else if (p.includes(hintLower)) score += 3;

        if (badPaths.some((b) => p.includes(b))) score -= 2;
        else score += 1;

        return { e, score };
      })
      .sort((a, b) => b.score - a.score || (a.e.filePath?.length ?? 0) - (b.e.filePath?.length ?? 0));

    const top = ranked[0];
    if (top && top.score > 0) {
      return top.e ?? null;
    }
  }

  const query = await storage.executeQuery({
    type: "entity",
    filters: { name: new RegExp(esc(name), "i") },
    limit: 20,
  });
  if (query.entities.length === 0) {
    const fb = await storage.executeQuery({ type: "entity", limit: 1 });
    return fb.entities[0] ?? null;
  }

  const badPaths = [
    "/dist/",
    "/build/",
    "/out/",
    "/.next/",
    "/.nuxt/",
    "/coverage/",
    "/node_modules/",
    "/tmp/",
    "/temp/",
    "/archives/",
    "/archive/",
    ".zip",
    ".tar",
    ".gz",
    ".tgz",
    ".rar",
    ".7z",
    ".xz",
    ".bz2",
    ".zst",
  ];

  const ranked = query.entities
    .map((e) => {
      const p = toPosixPath(e.filePath).toLowerCase();
      let score = 0;
      if (e.name?.toLowerCase() === name.toLowerCase()) score += 1;
      if (badPaths.some((b) => p.includes(b))) score -= 2;
      else score += 1;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || (a.e.filePath?.length ?? 0) - (b.e.filePath?.length ?? 0));

  return ranked[0]?.e ?? null;
}

function _mapEntitySummary(entity: Entity) {
  const normalizedPath = normalizeInputPath(entity.filePath) ?? entity.filePath;
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    filePath: normalizedPath,
    location: entity.location,
    metadata: entity.metadata,
  };
}

function _summarizeRelationships(relationships: Relationship[], neighbors: Map<string, Entity>) {
  return relationships.map((rel) => ({
    id: rel.id,
    type: rel.type,
    from: {
      id: rel.fromId,
      name: neighbors.get(rel.fromId)?.name ?? null,
    },
    to: {
      id: rel.toId,
      name: neighbors.get(rel.toId)?.name ?? null,
    },
    metadata: rel.metadata,
  }));
}

function _normalizeEntityTypes(types?: string[]): EntityType[] | undefined {
  if (!types?.length) return undefined;

  const allowed = new Set<string>(Object.values(EntityType));
  const normalized: EntityType[] = [];

  for (const value of types) {
    const lower = value.toLowerCase();
    if (allowed.has(lower)) {
      normalized.push(lower as EntityType);
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

// GraphStorage singleton is now managed by graph-storage-factory.ts

// Full list of available tools (used by all MCP server instances)
function getToolsList() {
  return [
    {
      name: "index",
      description: "Index a codebase using multi-agent parsing and analysis",
      inputSchema: zodToJsonSchema(IndexToolSchema),
    },
    {
      name: "get_members",
      description:
        "List parsed entities within a single file (imports, functions, classes, etc.); use as the entry point to discover stable entity identifiers before running relationship queries.",
      inputSchema: zodToJsonSchema(ListEntitiesToolSchema),
    },
    {
      name: "list_entity_relationships",
      description:
        "List outgoing relationships for an entity (imports, references, containment). Provide either the entity id (preferred) or name+file path to inspect its dependencies.",
      inputSchema: zodToJsonSchema(ListRelationshipsToolSchema),
    },
    {
      name: "query",
      description: "Query the code graph using natural language or structured queries",
      inputSchema: zodToJsonSchema(QueryToolSchema),
    },
    {
      name: "get_metrics",
      description: "Get system metrics and agent performance statistics",
      inputSchema: zodToJsonSchema(z.object({})) as any,
    },
    {
      name: "get_version",
      description: "Get MCP server version information and runtime details",
      inputSchema: zodToJsonSchema(z.object({})) as any,
    },
    {
      name: "semantic_search",
      description:
        "Search the codebase using natural language keywords or file/module paths. Useful for discovery before diving into structural graph queries.",
      inputSchema: zodToJsonSchema(SemanticSearchSchema),
    },
    {
      name: "find_similar_code",
      description: "Find code similar to a given snippet using semantic analysis",
      inputSchema: zodToJsonSchema(FindSimilarCodeSchema),
    },
    {
      name: "analyze_code_impact",
      description:
        "Discover entities and files that depend on a given symbol. Use together with get_members to obtain the precise entity id for impact analysis.",
      inputSchema: zodToJsonSchema(AnalyzeCodeImpactSchema),
    },
    {
      name: "find_duplicates",
      description: "Find duplicate or similar code blocks across the codebase using semantic similarity",
      inputSchema: zodToJsonSchema(DetectCodeClonesSchema),
    },
    {
      name: "jscpd_detect_clones",
      description: "Run JSCPD clone detection using a lightweight tokenizer",
      inputSchema: zodToJsonSchema(JscpdCloneDetectionSchema),
    },
    {
      name: "suggest_refactoring",
      description: "Get refactoring suggestions for improving code quality",
      inputSchema: zodToJsonSchema(SuggestRefactoringSchema),
    },
    {
      name: "cross_language_search",
      description: "Search across multiple programming languages",
      inputSchema: zodToJsonSchema(CrossLanguageSearchSchema),
    },
    {
      name: "analyze_hotspots",
      description: "Find code hotspots based on complexity, changes, or coupling",
      inputSchema: zodToJsonSchema(AnalyzeHotspotsSchema),
    },
    {
      name: "find_related_concepts",
      description: "Find conceptually related code to a given entity",
      inputSchema: zodToJsonSchema(FindRelatedConceptsSchema),
    },
    {
      name: "analyze_state_chaos",
      description:
        "Analyze state management chaos in TypeScript/Angular codebases. Detects scattered state, measures coupling, identifies mutations, and suggests refactoring strategies. Returns AI-friendly summary or detailed report.",
      inputSchema: zodToJsonSchema(AnalyzeStateChaosSchema),
    },
    {
      name: "get_graph",
      description: "Get the code graph with all entities and relationships",
      inputSchema: zodToJsonSchema(GetGraphSchema),
    },
    {
      name: "get_graph_stats",
      description: "Get statistics about the code graph",
      inputSchema: zodToJsonSchema(GetGraphStatsSchema),
    },
    {
      name: "reset_graph",
      description: "Clear all graph data (entities, relationships, files)",
      inputSchema: zodToJsonSchema(z.object({})) as any,
    },
    {
      name: "clean_index",
      description: "Reset graph and then perform a full index",
      inputSchema: zodToJsonSchema(CleanIndexSchema),
    },
    {
      name: "get_graph_health",
      description: "Health check for graph storage (totals + sample)",
      inputSchema: zodToJsonSchema(GetGraphHealthSchema),
    },
    {
      name: "get_agent_metrics",
      description: "Collect runtime telemetry for conductor and registered agents",
      inputSchema: zodToJsonSchema(GetAgentMetricsSchema),
    },
    {
      name: "get_bus_stats",
      description: "Inspect knowledge bus statistics (topics, entries, subscriptions)",
      inputSchema: zodToJsonSchema(GetBusStatsSchema),
    },
    {
      name: "clear_bus_topic",
      description: "Remove cached knowledge entries for a specific topic",
      inputSchema: zodToJsonSchema(ClearBusTopicSchema),
    },
    {
      name: "create_snapshot",
      description:
        "Create a version snapshot for rollback. Uses git stash if available, otherwise .backup/ directory. Returns snapshot ID for rollback.",
      inputSchema: zodToJsonSchema(CreateSnapshotSchema),
    },
    {
      name: "undo",
      description: "Rollback to a previous snapshot by ID. Restores all files to their snapshot state.",
      inputSchema: zodToJsonSchema(RollbackSnapshotSchema),
    },
    {
      name: "list_snapshots",
      description: "List available snapshots with creation time and description.",
      inputSchema: zodToJsonSchema(ListSnapshotsSchema),
    },
    {
      name: "cleanup_snapshots",
      description: "Delete old snapshots to free disk space.",
      inputSchema: zodToJsonSchema(CleanupSnapshotsSchema),
    },
    {
      name: "modify_code",
      description:
        "Modify code of a specific entity by ID. Automatically creates snapshot, validates before/after, updates embeddings, and can rollback on error. Default preview mode shows changes without applying.",
      inputSchema: zodToJsonSchema(ModifyEntityCodeSchema),
    },
    {
      name: "copy_file",
      description:
        "Copy file or directory with automatic graph updates. Streaming for large files. Token-efficient alternative to reading full content.",
      inputSchema: zodToJsonSchema(CopyFileSchema),
    },
    {
      name: "rename_file",
      description:
        "Rename file with automatic import updates across project. Updates graph and embeddings. Token-efficient alternative to read-write pattern.",
      inputSchema: zodToJsonSchema(RenameFileSchema),
    },
    {
      name: "split_file",
      description:
        "Extract entities from a file into separate files. Useful for refactoring large files. Updates graph with new locations.",
      inputSchema: zodToJsonSchema(SplitFileSchema),
    },
    {
      name: "synthesize_files",
      description:
        "Combine multiple files into one. Merges entities in graph. Can optionally delete originals. Token-efficient way to consolidate code.",
      inputSchema: zodToJsonSchema(SynthesizeFilesSchema),
    },
    {
      name: "create_file",
      description:
        "Create a new file with content. Automatically parses and adds entities to graph. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(CreateFileSchema),
    },
    {
      name: "rename_symbol",
      description:
        "Rename a symbol (variable, function, class, etc.) and update all references. Supports entity ID or name-based lookup. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(RenameSymbolSchema),
    },
    {
      name: "add_member",
      description:
        "Add a new member (method, property, field) to a class or interface. Supports precise positioning. Unified naming with UltrasharpTools.",
      inputSchema: zodToJsonSchema(AddMemberSchema),
    },
    {
      name: "validate_file",
      description:
        "Validate code file using appropriate linter (ESLint for JS/TS, Pylint for Python). Returns problems categorized by severity.",
      inputSchema: zodToJsonSchema(ValidateFileSchema),
    },
    {
      name: "validate_directory",
      description:
        "Validate all code files in directory. Batch processing with concurrency limit. Returns aggregated validation report.",
      inputSchema: zodToJsonSchema(ValidateDirectorySchema),
    },
    {
      name: "detect_technology_stack",
      description:
        "Automatically detect languages, frameworks, build tools, and dependencies. Useful for understanding project context. Can generate tech context for embeddings.",
      inputSchema: zodToJsonSchema(DetectTechnologyStackSchema),
    },
    {
      name: "pattern_search",
      description:
        "Advanced search with multiple modes: entity (name/type regex), content (inside entity bodies), semantic (vector similarity), hybrid (all combined). Framework-aware filtering. SIMD-accelerated similarity computation.",
      inputSchema: zodToJsonSchema(PatternSearchSchema),
    },
    // ==========================================================================
    // Merge Tools
    // ==========================================================================
    {
      name: "semantic_merge",
      description:
        "AI-powered semantic merge of git branches. Automatically finds merge-base, reads files from branches, performs semantic 3-way merge, and writes results as unstaged changes. Supports dry-run mode and auto-resolve.",
      inputSchema: zodToJsonSchema(SemanticMergeSchema),
    },
    {
      name: "analyze_merge_conflicts",
      description:
        "Analyze potential merge conflicts between two branches without performing the merge. Returns conflicts with severity classification and affected code units.",
      inputSchema: zodToJsonSchema(AnalyzeMergeConflictsSchema),
    },
    {
      name: "get_merge_suggestions",
      description:
        "Get AI-generated suggestions for resolving a specific merge conflict. Requires conflict ID from analyze_merge_conflicts.",
      inputSchema: zodToJsonSchema(GetMergeSuggestionsSchema),
    },
    {
      name: "get_semantic_merge_info",
      description: "Get information about semantic merge capabilities, supported features, and usage examples.",
      inputSchema: zodToJsonSchema(GetSemanticMergeInfoSchema),
    },
    // ==========================================================================
    // AutoDoc Tools
    // ==========================================================================
    {
      name: "autodoc_init",
      description:
        "Initialize AutoDoc semantic documentation layer. Configure language, docs directory, and enable/disable.",
      inputSchema: zodToJsonSchema(AutoDocInitSchema),
    },
    {
      name: "autodoc_save",
      description:
        "Save a markdown documentation file. Parses sections, extracts references to code entities, and indexes for search.",
      inputSchema: zodToJsonSchema(AutoDocSaveSchema),
    },
    {
      name: "autodoc_get",
      description: "Get documentation by ID or file path. Returns parsed sections with metadata.",
      inputSchema: zodToJsonSchema(AutoDocGetSchema),
    },
    {
      name: "autodoc_search",
      description: "Search documentation by text query. Returns matching sections with relevance scores.",
      inputSchema: zodToJsonSchema(AutoDocSearchSchema),
    },
    {
      name: "autodoc_validate",
      description:
        "Validate documentation references. Checks that all code entity references point to existing entities.",
      inputSchema: zodToJsonSchema(AutoDocValidateSchema),
    },
    {
      name: "autodoc_status",
      description: "Get AutoDoc status including statistics on documents, references, and broken links.",
      inputSchema: zodToJsonSchema(AutoDocStatusSchema),
    },
    {
      name: "autodoc_sync",
      description: "Sync documentation with code changes. Validates references and marks outdated docs.",
      inputSchema: zodToJsonSchema(AutoDocSyncSchema),
    },
    {
      name: "autodoc_generate",
      description:
        "Auto-generate documentation for the codebase. Creates .autodoc/ for general docs and README.md in each module folder.",
      inputSchema: zodToJsonSchema(AutoDocGenerateSchema),
    },
    {
      name: "autodoc_changelog",
      description: "View documentation change history. Shows what docs were affected by code changes.",
      inputSchema: zodToJsonSchema(AutoDocChangelogSchema),
    },
    {
      name: "autodoc_install_hooks",
      description:
        "Install or uninstall git pre-commit hooks for documentation validation. Ensures references are valid before commits.",
      inputSchema: zodToJsonSchema(AutoDocInstallHooksSchema),
    },
    {
      name: "autodoc_detect_language",
      description: "Detect documentation language from code comments and existing docs. Supports en, ru, zh.",
      inputSchema: zodToJsonSchema(AutoDocDetectLanguageSchema),
    },
    ...branchToolDefinitions,
    // Tracing tools
    {
      name: "trace_flow",
      description: `Trace execution flow from point A to point B in the codebase. Finds all possible paths and analyzes state changes, conditions, and async boundaries along each path. Returns paths with confidence scores and optional Mermaid diagrams.`,
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Starting point (function/method name or semantic query)" },
          to: { type: "string", description: "Ending point (function/method name or semantic query)" },
          trackStates: { type: "boolean", description: "Track state changes along paths", default: true },
          trackConditions: { type: "boolean", description: "Track conditions/branches", default: true },
          maxDepth: { type: "number", description: "Maximum traversal depth", default: 15 },
          format: {
            type: "string",
            enum: ["sequence", "tree", "graph", "mermaid"],
            description: "Output format",
            default: "sequence",
          },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "trace_backwards",
      description: `Trace backwards from a method to find why it might not be called. Analysis types: why_not_called (blocking conditions), what_affects (dependencies), dependencies (full graph). Returns callers, blocking conditions, state dependencies, and diagnosis.`,
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "Target method/function to analyze" },
          question: {
            type: "string",
            enum: ["why_not_called", "what_affects", "dependencies"],
            description: "Type of analysis",
          },
          depth: { type: "number", description: "Backward traversal depth", default: 15 },
          includeStates: { type: "boolean", description: "Include state dependencies", default: true },
          includeEffects: { type: "boolean", description: "Include side effects", default: true },
        },
        required: ["target", "question"],
      },
    },
    {
      name: "trace_data_flow",
      description: `Trace how data flows from sources to affect a target state. Identifies data sources, transformations, branching, and builds behavior matrix for different inputs.`,
      inputSchema: {
        type: "object",
        properties: {
          entryPoint: { type: "string", description: "Entry point function" },
          targetState: { type: "string", description: "Target state to trace" },
          dataSources: {
            type: "array",
            items: { type: "string" },
            description: "Data sources to analyze (auto-detected if not specified)",
          },
          trackTransformations: { type: "boolean", description: "Track data transformations", default: true },
        },
        required: ["entryPoint", "targetState"],
      },
    },
    {
      name: "analyze_state_impact",
      description: `Analyze the impact of a state variable across different scenarios. Shows usages, reachable/blocked paths per scenario, conflicts, and ripple effects.`,
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", description: "State variable to analyze" },
          scenarios: {
            type: "array",
            items: {
              type: "object",
              properties: { value: {}, label: { type: "string" } },
              required: ["value", "label"],
            },
            description: "Scenarios to analyze",
            minItems: 1,
          },
          scope: { type: "string", description: "Scope of analysis (semantic query)" },
        },
        required: ["state", "scenarios"],
      },
    },
    {
      name: "find_decision_points",
      description: `Find all decision points in a scenario's execution flow. Types: validation, api_response, state_mutation, guard, loop, error_handling, feature_flag. Returns grouped by impact with Mermaid flowchart.`,
      inputSchema: {
        type: "object",
        properties: {
          scenario: { type: "string", description: "Scenario to analyze" },
          includeGuards: { type: "boolean", description: "Include guard conditions", default: true },
          includeEffects: { type: "boolean", description: "Include side effects", default: true },
          groupBy: {
            type: "string",
            enum: ["impact", "location", "type"],
            description: "How to group results",
            default: "impact",
          },
        },
        required: ["scenario"],
      },
    },
  ];
}

// Function to create MCP server with handlers (supports multiple clients in pipe mode)
function createMcpServer(): Server {
  const srv = new Server(
    {
      name: versionInfo.name,
      version: versionInfo.version,
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
      },
    },
  );

  // Handler for listing available prompts
  srv.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "quick-start",
          description: "Quick start guide for UltraScript Tools MCP - when and how to use tools",
        },
        {
          name: "tool-reference",
          description: "Complete reference of all 50+ tools with parameters and examples",
        },
        {
          name: "workflows",
          description: "Common workflows: analyze project, search & refactor, find duplicates, git integration",
        },
        {
          name: "autodoc-guide",
          description: "AutoDoc guide - automatic documentation layer with semantic search, code-doc linking",
        },
      ],
    };
  });

  // Handler for getting a specific prompt
  srv.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
    const promptFile = join(promptsDir, `${name}.md`);

    try {
      const content = readFileSync(promptFile, "utf-8");
      return {
        description: `UltraScript Tools MCP - ${name}`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: content,
            },
          },
        ],
      };
    } catch {
      throw new Error(`Prompt not found: ${name}`);
    }
  });

  // Handler for listing available tools
  srv.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getToolsList() };
  });

  // Handler for tool execution
  srv.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const requestId = createRequestId();
    const startTime = Date.now();

    logger.mcpRequest(name, args, requestId);

    return executeToolCall(name, args, requestId, startTime);
  });

  return srv;
}

// Create default MCP server for stdio mode
const server = createMcpServer();

// Helper: enforce operation timeouts per SYSTEM_HANG_RECOVERY_PLAN
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, requestId: string): Promise<T> {
  let aborted = false;

  // Timeout via polling (no setTimeout for Bun compatibility)
  const timeoutPromise = new Promise<never>((_, reject) => {
    const startTime = Date.now();
    const checkTimeout = async () => {
      while (!aborted && Date.now() - startTime < ms) {
        await sleep(100); // Real sleep without busy-wait
      }
      if (!aborted) {
        const err = new Error(`${label} timed out after ${ms}ms`);
        logger.incident("Operation timeout", { label, timeoutMs: ms }, requestId, err);
        reject(err);
      }
    };
    checkTimeout();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    aborted = true;
  }
}

async function executeToolCall(name: string, args: unknown, requestId: string, _startTime: number) {
  // Check if indexing is in progress for the CURRENT project only
  // Other projects are NOT blocked (fix for cross-project blocking bug)
  const allowedDuringIndexing = new Set([
    "index",
    "clean_index",
    "reset_graph",
    "get_version",
    "get_metrics",
    "get_agent_metrics",
    "get_bus_stats",
    "get_graph_stats",
    "get_graph_health",
  ]);

  // Get target directory from args (if specified) or use current directory
  const argsObj = args as Record<string, unknown>;
  const targetDir = (argsObj?.["directory"] as string) || directory;

  // Only block if THIS SPECIFIC project is being indexed
  if (isProjectIndexing(targetDir) && !allowedDuringIndexing.has(name)) {
    const status = getIndexingStatus();
    const message =
      `⏳ Indexing is currently in progress for this project. Please wait and retry.\n\n` +
      `📂 Directory: ${targetDir}\n` +
      `⏱️ Elapsed: ${status.elapsedSeconds || 0} seconds\n\n` +
      `Tip: You can work with other projects while this one is indexing.`;

    logger.info("INDEXING_BUSY", `Tool ${name} blocked - indexing in progress for ${targetDir}`, { status }, requestId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              errorType: "indexing_in_progress",
              error: "Indexing is currently in progress for this project. Please retry after indexing completes.",
              message,
              status: {
                directory: targetDir,
                elapsedSeconds: status.elapsedSeconds,
                otherProjectsBlocked: false, // Important: other projects are NOT blocked
              },
              retryAfterSeconds: 10,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  try {
    // ==========================================================================
    // All tools handled by ToolRegistry (O(1) lookup, cleaner architecture)
    // Handlers are in src/tools/handlers/*-tool-handlers.ts
    // ==========================================================================
    const toolContext: ToolContext = {
      requestId,
      config,
      logger,
      getConductor,
      getGraphStorage,
      getSQLiteManager: () => null, // Legacy - now using libsql via getGraphStorage()
      getSemanticAgent,
      getBranchManager: () => {
        const cond = getConductor();
        const indexerAgent = cond.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        return indexerAgent?.getBranchManager?.() || null;
      },
      getSnapshotManager: () => versionManager,
      getKnowledgeBus: () => knowledgeBus,
      getServiceContainer: () => getOrInitServiceContainer(),
      normalizeInputPath,
      withTimeout,
    };

    if (toolRegistry.has(name)) {
      const handler = toolRegistry.getHandler(name, toolContext);
      return await handler.handle(args);
    }

    throw new Error(`Unknown tool: ${name}. Available tools: ${toolRegistry.listTools().join(", ")}`);

    // Legacy switch removed - all 47 case statements now in src/tools/handlers/
    // This reduces index.ts from 5165 to ~2900 lines (-44%)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof AgentBusyError) {
      logger.info(
        "AGENT_BUSY",
        `Agent ${error.details.agentId} busy while handling ${name}`,
        { details: error.details },
        requestId,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                errorType: "agent_busy",
                error: errorMessage,
                details: error.details,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    logger.mcpError(name, error instanceof Error ? error : new Error(errorMessage), requestId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

// Handler for tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const requestId = createRequestId();
  const startTime = Date.now();

  // Mark activity to prevent idle mode during active requests
  getConductor().markActivity();

  logger.mcpRequest(name, args, requestId);

  return executeToolCall(name, args, requestId, startTime);
});

async function processDebugRequests(requests: DebugRequest[]): Promise<void> {
  for (const { parsed, raw } of requests) {
    const callRequest: z.infer<typeof CallToolRequestSchema> = (() => {
      try {
        return CallToolRequestSchema.parse(parsed);
      } catch (error: unknown) {
        console.error(`[Debug] Invalid tools/call request payload: ${raw}`);
        throw error;
      }
    })();

    const { name, arguments: args } = (callRequest as any).params;
    const parsedObj = parsed as Record<string, unknown>;
    const responseIdValue = parsedObj?.["id"];
    const responseId =
      typeof responseIdValue === "string" || typeof responseIdValue === "number" ? responseIdValue : createRequestId();
    const requestId = typeof responseId === "string" ? responseId : String(responseId);
    const startTime = Date.now();

    // Mark activity to prevent idle mode during active requests
    getConductor().markActivity();

    logger.mcpRequest(name, args, requestId);
    const result = await executeToolCall(name, args, requestId, startTime);

    const response = {
      jsonrpc: "2.0",
      id: responseId,
      result,
    };

    console.error(JSON.stringify(response, null, 2));
  }
}

// Graceful shutdown - shared logic for SIGINT and SIGTERM
let isShuttingDownGlobal = false;

async function performGlobalShutdown(signal: string): Promise<void> {
  if (isShuttingDownGlobal) return;
  isShuttingDownGlobal = true;

  console.error(`\n[${signal}] Shutting down gracefully...`);
  logger.systemEvent("MCP Server Shutdown Initiated", { signal });

  // Shutdown OVMS Native first (if running)
  try {
    await shutdownOVMSNative();
    logger.systemEvent("OVMS Native Shutdown Complete");
  } catch (error) {
    console.error("[Shutdown] OVMS Native shutdown error:", error);
  }

  // Shutdown GPU worker (if running)
  try {
    await shutdownGpuClient();
    logger.systemEvent("GPU Client Shutdown Complete");
  } catch (error) {
    logger.error("GPU_CLIENT", "Shutdown error", { error: String(error) });
  }

  // Shutdown FAISS provider (if running)
  try {
    await shutdownFaissProvider();
    logger.systemEvent("FAISS Provider Shutdown Complete");
  } catch (error) {
    logger.error("FAISS", "Shutdown error", { error: String(error) });
  }

  if (conductor) {
    await conductor.shutdown();
    logger.systemEvent("Conductor Shutdown Complete");
  }

  if (layeredIndexManager) {
    await layeredIndexManager.shutdown();
    logger.systemEvent("LayeredIndexManager Shutdown Complete");
  }

  resourceManager.stopMonitoring();
  logger.systemEvent("Resource Manager Stopped");
  logger.systemEvent("MCP Server Shutdown Complete", { signal });

  process.exit(0);
}

process.on("SIGINT", () => {
  performGlobalShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  performGlobalShutdown("SIGTERM");
});

// Fallback: beforeExit fires when event loop is empty but before exit
// This catches cases where parent process closes stdin/stdout
process.on("beforeExit", async (code) => {
  if (code === 0 && !isShuttingDownGlobal) {
    await performGlobalShutdown("beforeExit");
  }
});

// Windows: detect parent process exit via stdin close
// When comm.c closes, stdin pipe closes - we must exit
process.stdin.on("close", () => {
  if (!isShuttingDownGlobal) {
    logger.info("SHUTDOWN", "stdin closed (parent exited), shutting down...");
    performGlobalShutdown("stdin-close");
  }
});

process.stdin.on("end", () => {
  if (!isShuttingDownGlobal) {
    logger.info("SHUTDOWN", "stdin ended (parent exited), shutting down...");
    performGlobalShutdown("stdin-end");
  }
});

// Debug signal: dump runtime state (aligns with SYSTEM_HANG_RECOVERY_PLAN)
process.on("SIGUSR1", async () => {
  try {
    const snapshot: any = {
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };
    if (conductor) {
      snapshot.conductor = {
        pendingTasks: (conductor as any).pendingTasks?.size ?? undefined,
        agents: Array.from(conductor.agents.values()).map((a) => ({
          id: a.id,
          type: a.type,
          status: a.status,
          memMB: a.getMemoryUsage(),
          queue: a.getTaskQueue().length,
          lastActivity: (a as any).getMetrics ? (a as any).getMetrics().lastActivity : undefined,
        })),
      };
    }
    logger.incident("SIGUSR1 dump", snapshot);
  } catch (err) {
    logger.incident("SIGUSR1 dump failed", {}, undefined, err as Error);
  }
});

// =============================================================================
// AUTO-INDEXING: Detect supported project and trigger indexing on startup
// =============================================================================

/**
 * Quickly detect if directory contains files with supported extensions.
 * Uses fast glob with early exit (limit: 1) for performance.
 */
async function detectSupportedProject(
  targetDir: string,
  extensions: string[],
): Promise<{ supported: boolean; detectedExt?: string; sampleFile?: string }> {
  try {
    const { glob } = await import("glob");

    // Build glob pattern for all supported extensions
    // e.g., **/*.{ts,tsx,js,jsx,py,go,rs,kt,swift,c,cpp,java}
    const extList = extensions.map((e) => e.replace(/^\./, "")).join(",");
    const pattern = `**/*.{${extList}}`;

    // Use glob with limit 1 for fast detection
    const files = await glob(pattern, {
      cwd: targetDir,
      nodir: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/vendor/**", "**/target/**", "**/__pycache__/**"],
      maxDepth: 5, // Don't go too deep for quick detection
      absolute: false,
    });

    if (files.length > 0) {
      const sampleFile = files[0]!;
      const ext = "." + sampleFile.split(".").pop();
      return { supported: true, detectedExt: ext, sampleFile };
    }

    return { supported: false };
  } catch (error) {
    logger.warn("AUTO_INDEX", "Failed to detect project type", { error: (error as Error).message });
    return { supported: false };
  }
}

/**
 * Base exclude patterns for source file counting and indexing
 * Used by both countSourceFiles and buildAutoIndexExcludePatterns for consistency
 */
const BASE_EXCLUDE_PATTERNS = [
  // Build/dependency directories
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/venv/**",
  "**/.venv/**",
  "**/vendor/**",
  "**/target/**", // Rust
  "**/bin/**",
  "**/obj/**", // .NET
  "**/.vs/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/packages/**",
  // Test data directories (not actual source code)
  "**/fixtures/**",
  "**/testdata/**",
  // Mock files
  "**/mocks/**",
  "**/__mocks__/**",
  // External/third-party
  "**/external-tools/**",
  "**/third_party/**",
  "**/third-party/**",
  "**/thirdparty/**",
  "**/archives/**",
  "**/archive/**",
  "**/backups/**",
  "**/backup/**",
  "**/tmp/**",
  "**/temp/**",
];

/**
 * Fast count of source files on disk for consistency check.
 * Uses glob with stats disabled for maximum speed.
 */
async function countSourceFiles(targetDir: string, extensions: string[]): Promise<number> {
  try {
    const { glob } = await import("glob");
    const extList = extensions.map((e) => e.replace(/^\./, "")).join(",");
    const pattern = `**/*.{${extList}}`;

    const files = await glob(pattern, {
      cwd: targetDir,
      nodir: true,
      ignore: BASE_EXCLUDE_PATTERNS,
      stat: false,
      absolute: false,
    });

    return files.length;
  } catch {
    return -1; // Error - skip consistency check
  }
}

/**
 * Build smart exclude patterns for auto-indexing
 * - Base patterns from BASE_EXCLUDE_PATTERNS
 * - Patterns from .gitignore if exists
 * - Binary/archive extensions
 */
async function buildAutoIndexExcludePatterns(targetDir: string): Promise<string[]> {
  const patterns: string[] = [
    // Include all base directory patterns
    ...BASE_EXCLUDE_PATTERNS,
    // Mock files (often large JSON/generated data)
    "**/*.mock.json",
    "**/*.mock.ts",
    "**/*.mock.js",
    // Binary and archive files
    "**/*.zip",
    "**/*.tar",
    "**/*.tar.gz",
    "**/*.tgz",
    "**/*.rar",
    "**/*.7z",
    "**/*.exe",
    "**/*.dll",
    "**/*.so",
    "**/*.dylib",
    "**/*.bin",
    "**/*.iso",
    "**/*.img",
    "**/*.dmg",
    "**/*.wasm",
    // Large generated files
    "**/*.min.js",
    "**/*.min.css",
    "**/*.bundle.js",
    "**/*.chunk.js",
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/*.lock",
    // Media files
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.png",
    "**/*.gif",
    "**/*.ico",
    "**/*.svg",
    "**/*.mp3",
    "**/*.mp4",
    "**/*.wav",
    "**/*.avi",
    "**/*.mov",
    "**/*.pdf",
    // Database files
    "**/*.db",
    "**/*.sqlite",
    "**/*.sqlite3",
  ];

  // Try to read .gitignore and add patterns
  try {
    const { join } = await import("node:path");
    const gitignorePath = join(targetDir, ".gitignore");
    const { readTextSync, existsSync } = await import("./utils/file-ops.js");

    if (existsSync(gitignorePath)) {
      const content = readTextSync(gitignorePath);
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith("#")) continue;
        // Skip negation patterns (we only want excludes)
        if (trimmed.startsWith("!")) continue;

        // Convert gitignore pattern to glob pattern
        let pattern = trimmed;
        // Handle directory patterns
        if (pattern.endsWith("/")) {
          pattern = `**/${pattern}**`;
        } else if (!pattern.includes("/")) {
          // Pattern without slash matches anywhere
          pattern = `**/${pattern}`;
        } else if (!pattern.startsWith("/") && !pattern.startsWith("**/")) {
          pattern = `**/${pattern}`;
        }
        // Remove leading slash
        if (pattern.startsWith("/")) {
          pattern = pattern.slice(1);
        }

        patterns.push(pattern);
      }
      console.error(
        `   📋 Loaded ${lines.filter((l) => l.trim() && !l.startsWith("#")).length} patterns from .gitignore`,
      );
    }
  } catch (_error) {
    // .gitignore not found or unreadable - that's fine
  }

  return patterns;
}

/**
 * Perform auto-indexing in background (non-blocking)
 */
async function performAutoIndex(targetDir: string, extensions: string[], incremental = false): Promise<void> {
  const requestId = createRequestId();
  const startTime = Date.now();
  logger.trace("INDEXING", `[+${startTime - PROCESS_START_TIME}ms] ▶ performAutoIndex() START`);

  // Set indexing state for user-friendly error messages
  setIndexingState(true, targetDir);

  const mode = incremental ? "incremental" : "full";
  logger.systemEvent(`Auto-indexing started (${mode})`, { directory: targetDir, incremental });
  logger.trace("INDEXING", `[+${Date.now() - PROCESS_START_TIME}ms] mode=${mode}, incremental=${incremental}`);
  console.error(`\n📂 Auto-indexing project (${mode}): ${targetDir}`);

  try {
    // Build smart exclude patterns
    const excludePatterns = await buildAutoIndexExcludePatterns(targetDir);
    console.error(`   🚫 Excluding ${excludePatterns.length} patterns (node_modules, .git, binaries, .gitignore)`);
    // TRACE: Show first 10 patterns
    console.error(`   📋 Sample patterns: ${excludePatterns.slice(0, 10).join(", ")}...`);
    console.error(`   📋 Extensions: ${extensions.join(", ")}`);

    // Set current indexing directory
    setCurrentIndexingDirectory(targetDir);

    // Initialize SemanticAgent and optionally drop vector index for bulk insert mode
    // Only drop index for FULL rebuild, not for incremental updates
    if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
      logger.trace("INDEXING", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ getSemanticAgent for auto-index`);
      console.error("🔄 Initializing SemanticAgent in background...");
      try {
        const semAgentStart = Date.now();
        const semanticAgent = await getSemanticAgent();
        logger.trace(
          "INDEXING",
          `[+${Date.now() - PROCESS_START_TIME}ms] ◀ getSemanticAgent (${Date.now() - semAgentStart}ms)`,
        );
        if (!incremental) {
          // Drop vector index before bulk inserts for faster performance (full rebuild only)
          logger.trace("INDEXING", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ dropVectorIndex`);
          console.error("🔄 Dropping vector index for bulk insert mode...");
          await semanticAgent.dropVectorIndex();
          logger.trace("INDEXING", `[+${Date.now() - PROCESS_START_TIME}ms] ◀ dropVectorIndex`);
        } else {
          console.error("🔄 Incremental mode - keeping existing vector index");
        }
      } catch (err) {
        console.error("⚠️ SemanticAgent initialization failed:", (err as Error).message);
      }
    }

    // Create indexing task with smart excludes
    const task: AgentTask = {
      id: `auto-index-${Date.now()}`,
      type: "index",
      priority: 8,
      payload: {
        directory: targetDir,
        incremental, // Use incremental mode when resuming incomplete index
        excludePatterns,
        // Pass extensions to limit file types
        includeExtensions: extensions,
      },
      createdAt: Date.now(),
    };

    // Initialize agents
    await getDevAgent();
    await getDoraAgent();

    // Run indexing via conductor
    const cond = getConductor();
    await cond.initialize();
    const result = (await cond.process(task)) as { success?: boolean; data?: any; entities?: any[] };

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result?.success !== false) {
      const entityCount = result?.data?.entityCount ?? result?.data?.entities ?? result?.entities?.length ?? "?";
      console.error(`✅ Auto-indexing complete: ${entityCount} entities indexed in ${duration}s`);
      logger.systemEvent("Auto-indexing completed", {
        directory: targetDir,
        entityCount,
        durationMs: Date.now() - startTime,
      });

      // Finalize embeddings (workers generate, main just loads dump files as fallback)
      if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
        try {
          const semanticAgent = await getSemanticAgent();
          console.error(`🔄 Finalizing embeddings...`);
          await semanticAgent.generateEmbeddingsFromStorage();
          console.error(`✅ Embeddings finalized`);
        } catch (error) {
          console.error(`⚠️  Failed to finalize embeddings:`, (error as Error).message);
        }
      }

      // Update incremental tracking
      try {
        const graphStorage = await getGraphStorage();
        if (incremental) {
          // Record incremental changes (count how many files were indexed)
          const indexedCount = typeof entityCount === "number" ? entityCount : parseInt(String(entityCount), 10) || 0;
          // Estimate files from entities (rough: ~3 entities per file on average)
          const estimatedFiles = Math.max(1, Math.ceil(indexedCount / 3));
          await graphStorage.recordIncrementalChanges(estimatedFiles);
          logger.info("TRACKING", `Recorded incremental changes`, { files: estimatedFiles });
        } else {
          // Full rebuild - reset tracking
          await graphStorage.resetIncrementalTracking();
          logger.info("TRACKING", `Reset incremental tracking (full rebuild complete)`);
        }
      } catch (error) {
        logger.warn("TRACKING", `Failed to update tracking`, { error: (error as Error).message });
      }

      // Start GitWatcher for incremental updates (if branchAware enabled)
      try {
        const cond = getConductor();
        const indexerAgent = cond.getAgentByType(AgentType.INDEXER) as any;
        if (indexerAgent?.setRepositoryPath) {
          indexerAgent.setRepositoryPath(targetDir);
          console.error(`✅ GitWatcher started for incremental updates`);
        }
      } catch (error) {
        console.error(`⚠️  Failed to start GitWatcher:`, (error as Error).message);
      }
    } else {
      console.error(`⚠️  Auto-indexing completed with warnings in ${duration}s`);
      logger.warn("AUTO_INDEX", "Auto-indexing completed with issues", { result }, requestId);
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Auto-indexing failed after ${duration}s: ${(error as Error).message}`);
    logger.error("AUTO_INDEX", "Auto-indexing failed", { error: (error as Error).message }, requestId);
  } finally {
    // Always clear indexing state
    setIndexingState(false);
  }
}

// Start the server
async function main() {
  const mainStartTime = Date.now();
  logger.trace("STARTUP", `[+${mainStartTime - PROCESS_START_TIME}ms] ▶ main() started`);

  console.error(`Starting MCP Code Graph Server for directory: ${directory}`);
  console.error("Multi-agent LiteRAG architecture initialized");
  console.error(`Resource constraints: 1GB memory, 80% CPU, 10 concurrent agents`);

  // Check and auto-start Ollama if embeddings are enabled (non-blocking)
  const config = ConfigLoader.getInstance().getConfig();
  const embeddingEnabled = config.mcp?.embedding?.enabled ?? false;
  const embeddingProvider: string = config.mcp?.embedding?.provider ?? "auto";

  if (embeddingEnabled && (embeddingProvider === "auto" || embeddingProvider === "ollama")) {
    // Run Ollama check in background - don't block MCP startup
    logger.trace("ASYNC", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ Launching async: Ollama check`);
    console.error("🔍 Ollama check running in background...");
    (async () => {
      try {
        const ollamaStartTime = Date.now();
        logger.trace("ASYNC", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ START: ensureOllamaRunning`);
        const ollamaStatus = await ensureOllamaRunning(true); // auto-start enabled
        logger.trace(
          "ASYNC",
          `[+${Date.now() - PROCESS_START_TIME}ms] ◀ END: ensureOllamaRunning (${Date.now() - ollamaStartTime}ms)`,
        );
        const statusMessage = getStatusMessage(ollamaStatus);
        console.error(statusMessage);

        if (!ollamaStatus.isRunning) {
          console.error(
            "💡 Tip: Install Ollama from https://ollama.com or run setup-embeddings.cmd/sh for automatic setup",
          );
        } else if (!ollamaStatus.hasGranite && ollamaStatus.hasModels) {
          console.error("💡 Tip: Install granite-embedding with: ollama pull granite-embedding");
        }
      } catch (error) {
        logger.warn("STARTUP", "Ollama check failed, will use auto-detection", {
          error: (error as Error).message,
        });
        console.error("⚠️  Ollama check failed, embedding provider will be auto-detected");
      }
    })();
  }

  // Check for orphaned embeddings (entities without embeddings) in background
  // This handles the case when server was restarted before embeddings completed
  // Runs asynchronously without setTimeout (Bun compatibility)
  if (embeddingEnabled && !pipeServerMode) {
    logger.trace("ASYNC", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ START: orphaned embeddings check`);
    (async () => {
      try {
        const checkStartTime = Date.now();
        const semanticAgent = await getSemanticAgent();
        logger.trace(
          "ASYNC",
          `[+${Date.now() - PROCESS_START_TIME}ms] getSemanticAgent took ${Date.now() - checkStartTime}ms`,
        );
        if (!semanticAgent) return;

        // Check if there are entities without embeddings
        const { getGraphStorage } = await import("./storage/graph-storage-factory.js");
        const storage = await getGraphStorage();
        const allEntities = await storage.findEntities({ type: "entity", limit: 1 });
        const entityCount =
          allEntities.length > 0 ? (await storage.findEntities({ type: "entity", limit: 100000 })).length : 0;

        if (entityCount === 0) return; // No entities indexed yet

        const embeddingCount = (await semanticAgent.getVectorStore()?.count()) ?? 0;
        const missing = entityCount - embeddingCount;

        if (missing > 10) {
          // Check if generation is already in progress
          if (semanticAgent.isEmbeddingGenerationInProgress()) {
            logger.warn("AUTO_RESUME", `[SKIPPED] generation already in progress`, { missing });
            return;
          }
          // Check if generation was recently completed (within 30s)
          if (semanticAgent.wasGenerationRecentlyCompleted(30000)) {
            logger.warn("AUTO_RESUME", `[SKIPPED] generation recently completed`, { missing });
            return;
          }
          logger.info("STARTUP", `Found ${missing} entities without embeddings, generating in background`, { missing });
          logger.trace(
            "EMBEDDING",
            `[+${Date.now() - PROCESS_START_TIME}ms] ▶ START: generateEmbeddingsFromStorage (${missing} missing)`,
          );
          logger.info("STARTUP", "Resuming embedding generation", { missing, entityCount, embeddingCount });
          const embGenStartTime = Date.now();
          // CRITICAL FIX: Run in background (non-blocking) - don't await!
          semanticAgent
            .generateEmbeddingsFromStorage()
            .then((stats: { generated: number; skipped: number }) => {
              logger.trace(
                "EMBEDDING",
                `[+${Date.now() - PROCESS_START_TIME}ms] ◀ END: generateEmbeddingsFromStorage (${Date.now() - embGenStartTime}ms)`,
              );
              logger.info("STARTUP", `Background embedding complete`, {
                generated: stats.generated,
                skipped: stats.skipped,
              });
            })
            .catch((error: Error) => {
              logger.error("EMBEDDING", "Background embedding generation failed", { error: error.message });
            });
        } else {
          logger.trace(
            "EMBEDDING",
            `[+${Date.now() - PROCESS_START_TIME}ms] ◀ END: orphaned embeddings check (no action needed, missing=${missing})`,
          );
        }
      } catch (error) {
        logger.warn("STARTUP", "Background embedding check failed", { error: (error as Error).message });
      }
    })();
  }
  // Initialize AutoDoc Watcher for automatic documentation updates
  logger.trace("STARTUP", `[+${Date.now() - PROCESS_START_TIME}ms] Checking AutoDoc watcher config`);
  const autodocWatcherEnabled = config.mcp?.autodoc?.watcherEnabled ?? true;
  if (autodocWatcherEnabled) {
    logger.trace("STARTUP", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ START: AutoDoc watcher initialization`);
    try {
      const watcherConfig: AutoDocWatcherConfig = {
        rootDir: directory,
        enabled: true,
        debounceMs: config.mcp?.autodoc?.debounceMs ?? 45000,
        minDebounceMs: config.mcp?.autodoc?.minDebounceMs ?? 30000,
        maxDebounceMs: config.mcp?.autodoc?.maxDebounceMs ?? 60000,
        useLlm: config.mcp?.autodoc?.useLlm ?? false,
        llmConfig: config.mcp?.autodoc?.llmConfig,
      };
      const watcher = getAutoDocWatcher(watcherConfig);
      watcher.start();
      console.error("📝 AutoDoc watcher started (auto-updates AUTODOC.md on file changes)");
      logger.systemEvent("AutoDoc watcher started", {
        rootDir: directory,
        debounceMs: watcherConfig.debounceMs,
      });
    } catch (error) {
      logger.warn("STARTUP", "AutoDoc watcher failed to start", {
        error: (error as Error).message,
      });
      console.error("⚠️  AutoDoc watcher failed to start");
    }
  }

  // Connect transport FIRST for fast readiness
  let transportType: string;

  if (pipeServerMode) {
    // Pipe server mode: multi-client support
    // Each client gets its own MCP Server instance, sharing the same storage/agents
    const pipeServer = new PipeServer();
    let clientCount = 0;
    let activeClients = 0;
    let shutdownScheduled = false; // Flag instead of NodeJS.Timeout (Bun compatibility)
    let isShuttingDown = false;

    // Graceful shutdown delay (ms) - wait briefly before shutdown to allow reconnects
    const SHUTDOWN_DELAY_MS = 2000;

    /**
     * Perform graceful shutdown when all clients disconnect
     */
    async function performGracefulShutdown() {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.error("[PipeServer] All clients disconnected. Starting graceful shutdown...");
      logger.systemEvent("Auto-Shutdown Initiated", { reason: "all_clients_disconnected" });

      try {
        // 1. Close pipe server to prevent new connections
        await pipeServer.close();
        console.error("[PipeServer] Server closed, no new connections accepted");

        // 2. Wait for pending indexing operations to complete
        if (conductor) {
          console.error("[PipeServer] Waiting for pending operations to complete...");

          // Poll until all agent task queues are empty
          let waitIterations = 0;
          const maxWaitMs = 30000; // 30 sec max wait
          const pollIntervalMs = 100;
          const maxIterations = maxWaitMs / pollIntervalMs;

          while (waitIterations < maxIterations) {
            let totalPending = 0;
            for (const agent of conductor.agents.values()) {
              totalPending += agent.getTaskQueue().length;
            }
            if (totalPending === 0) break;

            if (waitIterations % 50 === 0) {
              // Log every 5 sec
              console.error(`[PipeServer] Still waiting for ${totalPending} pending tasks...`);
            }
            // Real sleep without busy-wait
            await sleep(100);
            waitIterations++;
          }
          console.error("[PipeServer] All agents idle");
        }

        // 2.5. Shutdown OVMS Native (if running)
        try {
          console.error("[PipeServer] Shutting down OVMS Native...");
          await shutdownOVMSNative();
          console.error("[PipeServer] OVMS Native shutdown complete");
        } catch (error) {
          console.error("[PipeServer] OVMS Native shutdown error:", error);
        }

        // 2.6. Shutdown GPU worker (if running)
        try {
          logger.systemEvent("Shutting down GPU Client...");
          await shutdownGpuClient();
          logger.systemEvent("GPU Client shutdown complete");
        } catch (error) {
          logger.error("GPU_CLIENT", "Shutdown error", { error: String(error) });
        }

        // 2.7. Shutdown FAISS provider (if running)
        try {
          logger.systemEvent("Shutting down FAISS Provider...");
          await shutdownFaissProvider();
          logger.systemEvent("FAISS Provider shutdown complete");
        } catch (error) {
          logger.error("FAISS", "Shutdown error", { error: String(error) });
        }

        // 3. Shutdown conductor and agents
        if (conductor) {
          console.error("[PipeServer] Shutting down Conductor...");
          await conductor.shutdown();
          console.error("[PipeServer] Conductor shutdown complete");
        }

        // 4. Shutdown layered index manager
        if (layeredIndexManager) {
          console.error("[PipeServer] Shutting down LayeredIndexManager...");
          await layeredIndexManager.shutdown();
          console.error("[PipeServer] LayeredIndexManager shutdown complete");
        }

        // 5. Stop resource monitoring
        resourceManager.stopMonitoring();

        console.error("[PipeServer] Graceful shutdown complete. Exiting.");
        logger.systemEvent("Auto-Shutdown Complete", { exitCode: 0 });

        process.exit(0);
      } catch (error) {
        console.error("[PipeServer] Shutdown error:", error);
        logger.error("SHUTDOWN", "Auto-shutdown failed", { error: (error as Error).message });
        process.exit(1);
      }
    }

    /**
     * Schedule shutdown after delay (allows for quick reconnects)
     */
    function scheduleShutdown() {
      shutdownScheduled = false; // Cancel any previous shutdown

      console.error(`[PipeServer] No active clients. Shutdown scheduled in ${SHUTDOWN_DELAY_MS}ms...`);
      logger.systemEvent("Shutdown Scheduled", { delayMs: SHUTDOWN_DELAY_MS, activeClients: 0 });

      // Shutdown delay via polling (no setTimeout for Bun compatibility)
      shutdownScheduled = true;
      (async () => {
        const startTime = Date.now();
        while (shutdownScheduled && Date.now() - startTime < SHUTDOWN_DELAY_MS) {
          await sleep(50); // Real sleep without busy-wait
        }
        if (shutdownScheduled && activeClients === 0) {
          performGracefulShutdown();
        }
      })();
    }

    /**
     * Cancel scheduled shutdown (client reconnected)
     */
    function cancelShutdown() {
      if (shutdownScheduled) {
        shutdownScheduled = false;
        console.error("[PipeServer] Shutdown cancelled - client reconnected");
        logger.systemEvent("Shutdown Cancelled", { reason: "client_reconnected" });
      }
    }

    console.error(`[PipeServer] Starting multi-client mode on ${pipeServer.getPath()}...`);
    logger.systemEvent("MCP Server Transport Starting", {
      transport: "pipe",
      path: pipeServer.getPath(),
      mode: "multi-client",
    });

    await pipeServer.start(async (clientTransport) => {
      clientCount++;
      activeClients++;
      const clientId = clientCount;

      // Cancel any pending shutdown
      cancelShutdown();

      console.error(`[PipeServer] Client #${clientId} connected (active: ${activeClients})`);
      logger.systemEvent("MCP Client Connected", { clientId, activeClients, transport: "pipe" });

      // Create new MCP Server for this client
      const clientServer = createMcpServer();

      // Handle client disconnect
      clientTransport.onclose = () => {
        activeClients--;
        console.error(`[PipeServer] Client #${clientId} disconnected (active: ${activeClients})`);
        logger.systemEvent("MCP Client Disconnected", { clientId, activeClients });

        // Schedule shutdown if no more clients
        if (activeClients === 0) {
          scheduleShutdown();
        }
      };

      // Connect server to client transport (server.connect() calls transport.start() internally)
      await clientServer.connect(clientTransport as any);

      console.error(`[PipeServer] Client #${clientId} ready`);
      logger.systemEvent("MCP Client Ready", { clientId, activeClients });
    });

    transportType = "pipe-multi";
    console.error(`MCP server running on pipe transport (multi-client): ${pipeServer.getPath()}`);
    logger.systemEvent("MCP Server Ready", {
      directory,
      transport: transportType,
      toolsCount: getToolsList().length,
      readyTime: Date.now(),
    });
  } else {
    // Default: stdio transport (single client)
    logger.trace("STARTUP", `[+${Date.now() - PROCESS_START_TIME}ms] ▶ START: stdio transport connect`);
    logger.systemEvent("MCP Server Transport Connecting", { transport: "stdio" });
    const transport = new StdioServerTransport();
    transportType = "stdio";
    console.error("MCP server running on stdio transport");

    const connectStartTime = Date.now();
    await server.connect(transport as any);
    logger.trace(
      "STARTUP",
      `[+${Date.now() - PROCESS_START_TIME}ms] ◀ END: stdio transport connect (${Date.now() - connectStartTime}ms)`,
    );
    logger.systemEvent("MCP Server Ready", {
      directory,
      transport: transportType,
      toolsCount: getToolsList().length,
      readyTime: Date.now(),
    });
  }

  if (debugRequests.length > 0) {
    try {
      await getDevAgent();
      await getDoraAgent();
      if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
        await getSemanticAgent();
      }
      await processDebugRequests(debugRequests);
      console.error("[Debug] Completed processing supplied requests.");
      process.exit(0);
    } catch (error) {
      console.error("[Debug] Request execution failed:", error instanceof Error ? error.message : error);
      logger.error(
        "DEBUG_MODE",
        "Debug request execution failed",
        { error: error instanceof Error ? error.message : String(error) },
        undefined,
        error instanceof Error ? error : undefined,
      );
      process.exit(1);
    }
    return;
  }

  // Set default indexing directory for background agent initialization
  // Will be updated in case "index" if a different directory is provided
  setCurrentIndexingDirectory(directory);

  // All agents are initialized lazily when first used (prevents stdio blocking in MCP)
  console.error("Core agents registered and ready for lazy initialization");

  // =============================================================================
  // AUTO-INDEXING: Check and index project on startup
  // =============================================================================
  logger.trace("STARTUP", `[+${Date.now() - PROCESS_START_TIME}ms] Checking auto-indexing config`);
  const indexingConfig = config.indexing;
  const shouldAutoIndex = !noAutoIndex && (indexingConfig?.autoIndex ?? true);
  logger.trace(
    "INDEXING",
    `[+${Date.now() - PROCESS_START_TIME}ms] shouldAutoIndex=${shouldAutoIndex}, noAutoIndex=${noAutoIndex}`,
  );

  if (shouldAutoIndex) {
    const extensions = indexingConfig?.autoIndexExtensions ?? [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".go",
      ".rs",
      ".kt",
      ".swift",
      ".c",
      ".cpp",
      ".java",
    ];

    // Run detection and indexing in background (don't block MCP ready state)
    setImmediate(async () => {
      try {
        // Check if we already have entities for THIS directory (not global count)
        // v4: Use libsql unified storage instead of better-sqlite3
        const graphStorage = await getGraphStorage();
        const projectHash = getProjectHash(directory);
        console.error(
          `[AUTO-INDEX] Checking for existing index: dir=${directory}, hash=${projectHash}, branch=${DEFAULT_BRANCH}`,
        );
        graphStorage.setProject(directory, DEFAULT_BRANCH);
        const stats = await graphStorage.getStatistics();
        const entityCount = stats.totalEntities ?? 0;
        console.error(
          `[AUTO-INDEX] Statistics result: entities=${entityCount}, rels=${stats.totalRelationships}, files=${stats.totalFiles}`,
        );

        // Track whether we need incremental vs full indexing
        let useIncrementalMode = false;
        // Threshold for cumulative changes to trigger full rebuild (40% of total files)
        const CUMULATIVE_REBUILD_THRESHOLD = 0.4;

        if (entityCount > 0) {
          // Quick consistency check: compare file count on disk vs indexed files
          const diskFileCount = await countSourceFiles(directory, extensions);
          const indexedFileCount = stats.totalFiles ?? 0;

          // Check cumulative incremental changes
          const trackingInfo = await graphStorage.getIncrementalTrackingInfo();
          const cumulativeChanges = trackingInfo.incrementalChangesCount;
          const cumulativePercent = indexedFileCount > 0 ? cumulativeChanges / indexedFileCount : 0;

          // If cumulative changes exceed threshold, force full rebuild
          if (cumulativePercent > CUMULATIVE_REBUILD_THRESHOLD) {
            logger.systemEvent("Cumulative changes threshold exceeded, performing full rebuild", {
              directory,
              cumulativeChanges,
              totalFiles: indexedFileCount,
              cumulativePercent: (cumulativePercent * 100).toFixed(1),
              thresholdPercent: (CUMULATIVE_REBUILD_THRESHOLD * 100).toFixed(0),
            });
            console.error(
              `🔄 Cumulative changes (${cumulativeChanges}/${indexedFileCount} = ${(cumulativePercent * 100).toFixed(0)}%) exceed ${(CUMULATIVE_REBUILD_THRESHOLD * 100).toFixed(0)}% threshold`,
            );
            console.error(`   → Performing full index rebuild for optimal search quality`);
            // Full rebuild - don't use incremental mode
            useIncrementalMode = false;
          } else {
            // If disk has significantly more files (>20% or >10 files), run incremental index
            const missingFiles = diskFileCount - indexedFileCount;
            const mismatchPercent = indexedFileCount > 0 ? (missingFiles / indexedFileCount) * 100 : 0;

            if (diskFileCount > 0 && (missingFiles > 10 || mismatchPercent > 20)) {
              logger.systemEvent("Index incomplete, resuming incremental indexing", {
                directory,
                diskFileCount,
                indexedFileCount,
                missingFiles,
                mismatchPercent: mismatchPercent.toFixed(1),
                cumulativeChanges,
              });
              console.error(
                `⚠️  Index incomplete: ${indexedFileCount}/${diskFileCount} files indexed, resuming incrementally...`,
              );
              if (cumulativeChanges > 0) {
                console.error(
                  `   (cumulative changes: ${cumulativeChanges}, will rebuild at ${(CUMULATIVE_REBUILD_THRESHOLD * 100).toFixed(0)}%)`,
                );
              }
              // Use incremental mode - only index new/changed files
              useIncrementalMode = true;
            } else {
              logger.systemEvent("Existing index found for directory, skipping auto-index", {
                directory,
                entityCount,
                projectHash,
                diskFileCount,
                indexedFileCount,
                cumulativeChanges,
              });
              console.error(
                `📊 Existing index found (${entityCount} entities, ${indexedFileCount}/${diskFileCount} files), ready for queries`,
              );
              if (cumulativeChanges > 0) {
                console.error(
                  `   (cumulative changes: ${cumulativeChanges}/${indexedFileCount}, rebuild at ${(CUMULATIVE_REBUILD_THRESHOLD * 100).toFixed(0)}%)`,
                );
              }
              return;
            }
          }
        }

        // Detect if project has supported files
        const detection = await detectSupportedProject(directory, extensions);
        if (!detection.supported) {
          logger.systemEvent("No supported files detected, skipping auto-index", { directory });
          console.error("ℹ️  No supported source files detected, auto-indexing skipped");
          console.error(`   Supported extensions: ${extensions.slice(0, 8).join(", ")}...`);
          return;
        }

        logger.systemEvent("Supported project detected", {
          directory,
          detectedExt: detection.detectedExt,
          sampleFile: detection.sampleFile,
        });
        console.error(`🔍 Detected ${detection.detectedExt} project (${detection.sampleFile})`);

        // Perform indexing with extension filter
        // Use incremental mode when resuming incomplete index
        await performAutoIndex(directory, extensions, useIncrementalMode);
      } catch (error) {
        console.error("❌ Auto-index failed:", (error as Error).message);
        logger.error("AUTO_INDEX", "Auto-index check failed", { error: (error as Error).message });
      }
    });
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  logger.critical("MCP Server Startup Failed", error.message, undefined, undefined, error);
  process.exit(1);
});
