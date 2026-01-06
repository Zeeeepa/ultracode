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

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
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
import type { z } from "zod";
// Import our multi-agent components
import { ConductorOrchestrator } from "./agents/conductor-orchestrator.js";
import type { IndexerAgent } from "./agents/indexer-agent.js";
// AutoDoc: Semantic documentation layer
import { type AutoDocWatcherConfig, getAutoDocWatcher } from "./autodoc/index.js";
// CLI argument parsing
import { handleSetupCommand, parseArgs, printHelp } from "./cli/args-parser.js";
// TASK-001: Import new YAML configuration system
import { ConfigLoader, initializeConfig, validateConfig } from "./config/yaml-config.js";
import { getOrCreateAgent, registerAllAgents } from "./core/agent-registry.js";
// Auto-indexing
import {
  type AutoIndexContext,
  countSourceFiles,
  detectSupportedProject,
  performAutoIndex,
} from "./core/auto-indexer.js";
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
import type { LayeredIndexManager } from "./layered/index.js";
import { shutdownFaissProvider } from "./semantic/faiss/faiss-provider.js";
import { getGpuClient, shutdownGpuClient } from "./semantic/gpu/gpu-client.js";
// OVMS Native lifecycle management
import { initializeOVMSNative, type OVMSNativeConfig, shutdownOVMSNative } from "./semantic/ovms-native-manager.js";
// Storage initialization
import { DEFAULT_BRANCH, getProjectHash, initializeStorageDirs } from "./shared/storage-paths.js";
import { configureGraphStorage, getGraphStorage, initializeGraphStorage } from "./storage/graph-storage-factory.js";
import type { ToolContext } from "./tools/base-tool-handler.js";
// Tool list (extracted to separate file)
import { getToolsList } from "./tools/tool-definitions.js";
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

import { expandHome, getVersionInfo } from "./core/environment-setup.js";
// Service container for dependency injection
import { initServiceContainer, type ServiceContainer } from "./core/service-container.js";
import { registerDebugSignalHandler, registerSignalHandlers, setShutdownContext } from "./core/shutdown-handlers.js";
import { runOllamaCheck, runOrphanedEmbeddingsCheck } from "./core/startup-checks.js";
// Import extracted modules
import {
  endTimer as _endTimer,
  startTimer as _startTimer,
  getLocalTimestamp,
  setProcessStartTime,
  sleep,
  writeToLogFile,
} from "./core/startup-utils.js";
import { AgentType } from "./types/agent.js";
import { AgentBusyError } from "./types/errors.js";
import { getVectorDimensions, loadSemanticConfig } from "./utils/config-paths.js";
import { initHasher } from "./utils/fast-hash.js";
import { createRequestId, logger } from "./utils/logger.js";

// =============================================================================
// GLOBAL EXCEPTION HANDLERS - Catch crashes and log them to file
// =============================================================================

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

// === STARTUP TIMING ===
const PROCESS_START_TIME = Date.now();
setProcessStartTime(PROCESS_START_TIME);

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

const versionInfo = getVersionInfo(import.meta.url);

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

if (overrideConfigPath) {
  ConfigLoader.setOverridePath(overrideConfigPath);
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
const currentProjectPath = directory;

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
    // Update shutdown context with conductor reference
    setShutdownContext({ conductor });
  }
  return conductor;
}

// Global VectorStore instance (lazy-loaded from SemanticAgent)
// Used by code modification components (CodeModifier, FileOperations, PatternSearch)
const globalVectorStore: any = null;

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

// LayeredIndexManager - orchestrates branch-aware indexing with delta layers
const layeredIndexManager: LayeredIndexManager | null = null;

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

async function getIndexerAgent(): Promise<IndexerAgent> {
  const cond = getConductor();
  await cond.initialize();
  return await getOrCreateAgent(container, cond, AgentType.INDEXER);
}

// GraphStorage singleton is now managed by graph-storage-factory.ts

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
      getBranchManager: async () => {
        const indexerAgent = await getIndexerAgent();
        return indexerAgent?.getBranchManager?.() || null;
      },
      getSnapshotManager: async () => {
        const container = getOrInitServiceContainer();
        return await container.getVersionManager();
      },
      getKnowledgeBus: () => knowledgeBus,
      getServiceContainer: () => getOrInitServiceContainer(),
      normalizeInputPath,
      withTimeout,
    };

    if (toolRegistry.has(name)) {
      const handler = toolRegistry.getHandler(name, toolContext);
      return await handler.handle(args);
    }

    throw new Error(`Unknown tool: ${name}. Available tools: ${toolRegistry.getRegisteredTools().join(", ")}`);

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

// Register signal handlers from extracted module
registerSignalHandlers();
registerDebugSignalHandler();

/**
 * Create context for auto-indexer
 */
function createAutoIndexContext(): AutoIndexContext {
  return {
    getSemanticAgent,
    getDevAgent,
    getDoraAgent,
    getConductor,
    getGraphStorage,
    setCurrentIndexingDirectory,
    processStartTime: PROCESS_START_TIME,
  };
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

  // Run startup checks in background (extracted to startup-checks.ts)
  runOllamaCheck({
    embeddingEnabled,
    embeddingProvider,
    pipeServerMode,
    processStartTime: PROCESS_START_TIME,
  });

  runOrphanedEmbeddingsCheck({
    embeddingEnabled,
    pipeServerMode,
    processStartTime: PROCESS_START_TIME,
    getSemanticAgent,
  });
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
        await performAutoIndex(directory, extensions, createAutoIndexContext(), useIncrementalMode);
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
