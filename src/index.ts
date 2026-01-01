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
import { ChaosAnalyzer } from "./analysis/chaos/index.js";
import { TechnologyDetector } from "./analysis/technology-detector.js";
// AutoDoc: Semantic documentation layer
import {
  type AutoDocManager,
  // AutoDoc Watcher for automatic updates
  type AutoDocWatcherConfig,
  type FileSyncResult,
  getAutoDocManager as getAutoDocManagerFactory,
  getAutoDocWatcher,
  syncBidirectional,
  syncDbToDisk,
  syncDiskToDb,
  writeDocumentToDisk,
} from "./autodoc/index.js";
// TASK-001: Import new YAML configuration system
import { ConfigLoader, initializeConfig, validateConfig } from "./config/yaml-config.js";
import { getOrCreateAgent, registerAllAgents } from "./core/agent-registry.js";
// VARIANT-C: DI Container integration
import { getGlobalContainer } from "./core/di-container.js";
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
// SQLiteManager removed - using libsql via graph-storage-factory
import { collectAgentMetrics } from "./tools/agent-metrics.js";
import type { ToolContext } from "./tools/base-tool-handler.js";
import { branchToolDefinitions } from "./tools/branch-schemas.js";
// Import branch management tools
import * as branchTools from "./tools/branch-tools.js";
// graph-query removed - functionality in graph-storage-libsql
import { runJscpdCloneDetection } from "./tools/jscpd.js";
import { toolRegistry } from "./tools/tool-registry.js";
import type { AgentTask } from "./types/agent.js";
import { AgentType } from "./types/agent.js";
import { AgentBusyError } from "./types/errors.js";
import type { CloneGroup } from "./types/semantic.js";
import type { Entity, Relationship } from "./types/storage.js";
import { EntityType, RelationType } from "./types/storage.js";
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
const args = process.argv.slice(2);
let overrideConfigPath: string | undefined;
let helpRequested = false;
let versionRequested = false;
let setupRequested = false;
let noAutoIndex = false;
let pipeServerMode = false; // Default: use stdio transport (for Claude Code)
let quietMode = false; // Disable console.* output (auto-enabled in --pipe mode)

// Per-project indexing state tracking (no longer global blocking)
interface IndexingState {
  startTime: number;
  directory: string;
}
const indexingProjects = new Map<string, IndexingState>();

// Legacy global state for backward compatibility
let legacyIndexingDirectory: string | null = null;

// =============================================================================
// TIMER SYSTEM (Simplified - no longer need suspension for HTTP providers)
// =============================================================================

// Legacy exports for compatibility (no-op now)
export const registerAsyncLoopStarter = (_starter: () => void): void => {};
export function areTimersSuspended(): boolean {
  return false;
}
export function resumeTimers(): void {}

/**
 * Check if indexing is currently in progress for ANY project
 */
export function isIndexing(): boolean {
  return indexingProjects.size > 0;
}

/**
 * Check if a specific project is being indexed
 */
export function isProjectIndexing(directory: string): boolean {
  const normalizedDir = directory.toLowerCase().replace(/\\/g, "/");
  for (const [key] of indexingProjects) {
    if (key.toLowerCase().replace(/\\/g, "/") === normalizedDir) {
      return true;
    }
  }
  return false;
}

/**
 * Get indexing status for user-friendly messages
 */
export function getIndexingStatus(): {
  inProgress: boolean;
  directory: string | null;
  elapsedSeconds: number | null;
  allProjects: string[];
} {
  if (indexingProjects.size === 0) {
    return { inProgress: false, directory: null, elapsedSeconds: null, allProjects: [] };
  }

  // Return first project for backward compatibility
  const [firstDir, firstState] = indexingProjects.entries().next().value || [null, null];
  return {
    inProgress: true,
    directory: firstDir,
    elapsedSeconds: firstState ? Math.round((Date.now() - firstState.startTime) / 1000) : null,
    allProjects: Array.from(indexingProjects.keys()),
  };
}

/**
 * Set indexing state for a specific project
 * No longer blocks other projects!
 */
export function setIndexingState(inProgress: boolean, directory?: string): void {
  const dir = directory || legacyIndexingDirectory || "unknown";

  if (inProgress) {
    indexingProjects.set(dir, {
      startTime: Date.now(),
      directory: dir,
    });
    legacyIndexingDirectory = dir;
  } else {
    // Remove this project from indexing
    indexingProjects.delete(dir);
    if (legacyIndexingDirectory === dir) {
      legacyIndexingDirectory = null;
    }

    // Resume timers when all indexing completes
    if (indexingProjects.size === 0) {
      resumeTimers();
    }
  }
}
const positionalArgs: string[] = [];

// Check for "setup" command first
if (args[0] === "setup") {
  setupRequested = true;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;

  // Skip "setup" and its arguments if setup was requested
  if (setupRequested && i === 0) {
    continue;
  }

  if (arg === "--config") {
    const next = args[++i];
    if (!next) {
      console.error("Error: --config requires a path argument");
      console.error("Usage: ultrascript-tools-mcp [--config <path>] <directory>");
      process.exit(1);
    }
    overrideConfigPath = next;
  } else if (arg.startsWith("--config=")) {
    const value = arg.slice("--config=".length);
    if (!value) {
      console.error("Error: --config requires a non-empty path");
      console.error("Usage: ultrascript-tools-mcp [--config <path>] <directory>");
      process.exit(1);
    }
    overrideConfigPath = value;
  } else if (arg === "--help" || arg === "-h") {
    helpRequested = true;
  } else if (arg === "--version" || arg === "-v") {
    versionRequested = true;
  } else if (arg === "--no-auto-index") {
    noAutoIndex = true;
  } else if (arg === "--stdio") {
    pipeServerMode = false; // Use stdio transport (explicit, same as default)
  } else if (arg === "--pipe") {
    pipeServerMode = true; // Use pipe/TCP transport for multi-client mode
    quietMode = true; // Auto-enable quiet mode (disable console output)
    process.env["MCP_QUIET_MODE"] = "true"; // Set env for imported modules
  } else if (arg === "-d" || arg === "--directory") {
    // Support -d <path> for compatibility with other tools
    const next = args[++i];
    if (next) {
      positionalArgs.push(next);
    }
  } else if (arg.startsWith("-d=") || arg.startsWith("--directory=")) {
    const value = arg.includes("=") ? arg.split("=")[1] : undefined;
    if (value) {
      positionalArgs.push(value);
    }
  } else if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`);
    console.error("Usage: ultrascript-tools-mcp [--config <path>] [-d] <directory>");
    process.exit(1);
  } else {
    positionalArgs.push(arg);
  }
}

function printHelp() {
  console.error(`UltraScript Tools MCP Server

Usage:
  ultrascript-tools-mcp [options] <directory>
  ultrascript-tools-mcp [options] -d <directory>
  ultrascript-tools-mcp setup [--provider <tei|ollama|memory>]

Commands:
  setup             Interactive setup for semantic embedding providers

Options:
  -d, --directory   Project directory to index (alternative syntax)
  --config <path>   Use an alternate YAML configuration file
  --no-auto-index   Disable automatic indexing on startup
  --stdio           Use stdio transport (default)
  --pipe            Use pipe transport for multi-client mode
  --help, -h        Show this help message and exit
  --version, -v     Print version information and exit

Setup Options:
  --provider <provider>   Choose provider (tei, ollama, memory)
  --model <model-id>      Choose specific model

Examples:
  ultrascript-tools-mcp /path/to/project
  ultrascript-tools-mcp --config config/production.yaml /repo
  ultrascript-tools-mcp setup
  ultrascript-tools-mcp setup --provider ollama
  ultrascript-tools-mcp --version
`);
}

if (helpRequested) {
  printHelp();
  process.exit(0);
}

// Handle setup command - launch PowerShell/Bash script
if (setupRequested) {
  const { spawnSync } = await import("node:child_process");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { existsSync } = await import("node:fs");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Find scripts directory (works for both dev and installed package)
  let scriptsDir = join(__dirname, "..", "scripts");
  if (!existsSync(scriptsDir)) {
    scriptsDir = join(__dirname, "scripts");
  }

  const isWindows = process.platform === "win32";

  if (isWindows) {
    const ps1Script = join(scriptsDir, "setup-semantic-embedding.ps1");
    if (existsSync(ps1Script)) {
      // Try pwsh first, fallback to powershell
      const pwshResult = spawnSync("pwsh", ["-ExecutionPolicy", "Bypass", "-File", ps1Script], {
        stdio: "inherit",
        windowsHide: true,
      });
      if (pwshResult.error) {
        // Fallback to Windows PowerShell
        const psResult = spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", ps1Script], {
          stdio: "inherit",
          windowsHide: true,
        });
        process.exit(psResult.status ?? 1);
      } else {
        process.exit(pwshResult.status ?? 0);
      }
    } else {
      console.error(`Setup script not found: ${ps1Script}`);
      process.exit(1);
    }
  } else {
    // Linux/macOS - use bash script
    const shScript = join(scriptsDir, "setup-embeddings-interactive.sh");
    if (existsSync(shScript)) {
      const result = spawnSync("bash", [shScript], { stdio: "inherit" });
      process.exit(result.status ?? 0);
    } else {
      console.error(`Setup script not found: ${shScript}`);
      process.exit(1);
    }
  }
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

function normalizeSemanticCloneGroups(
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
async function switchGlobalProjectContext(projectPath: string, branchName?: string): Promise<void> {
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
// PHASE 8: Global instances for code modification components
// ============================================================================
let versionManager: VersionManager | null = null;
let codeModifier: CodeModifier | null = null;
let fileOperations: FileOperations | null = null;
let codeValidator: CodeValidator | null = null;
let technologyDetector: TechnologyDetector | null = null;
let patternSearch: PatternSearch | null = null;
let autoDocManager: AutoDocManager | null = null;

async function getVersionManager(): Promise<VersionManager> {
  if (!versionManager) {
    versionManager = new VersionManager({ workingDirectory: directory });
    await versionManager.initialize();
  }
  return versionManager;
}

async function getCodeModifier(): Promise<CodeModifier> {
  if (!codeModifier) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    codeModifier = new CodeModifier(storage, vectorStore, directory);
    await codeModifier.initialize();
  }
  return codeModifier;
}

async function getFileOperations(): Promise<FileOperations> {
  if (!fileOperations) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    const previewManager = new PreviewManager(storage, vectorStore);
    await previewManager.initialize();
    fileOperations = new FileOperations(storage, vectorStore, previewManager);
  }
  return fileOperations;
}

async function getCodeValidator(): Promise<CodeValidator> {
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

async function getPatternSearch(): Promise<PatternSearch> {
  if (!patternSearch) {
    const storage = await getGraphStorage();
    const vectorStore = globalVectorStore || null;
    const techDetector = await getTechnologyDetector();
    patternSearch = new PatternSearch(storage, vectorStore, techDetector);
    await patternSearch.initialize();
  }
  return patternSearch;
}

async function getAutoDocManager(): Promise<AutoDocManager> {
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

async function getLayeredIndexManager(): Promise<LayeredIndexManager | null> {
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

async function ensureSemanticsReady(minVectors = 1, timeoutMs = 15000): Promise<boolean> {
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

async function resolveEntity(
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

async function resolveEntityWithHint(
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

function mapEntitySummary(entity: Entity) {
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

function summarizeRelationships(relationships: Relationship[], neighbors: Map<string, Entity>) {
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

function normalizeEntityTypes(types?: string[]): EntityType[] | undefined {
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

// Tool schemas
const IndexToolSchema = z.object({
  directory: z.string().describe("Directory to index").optional(),
  incremental: z.boolean().describe("Perform incremental indexing").optional().default(false),
  reset: z.boolean().describe("Clear existing graph before indexing").optional().default(false),
  excludePatterns: z.array(z.string()).describe("Patterns to exclude").optional().default([
    // Standard ignore patterns for large codebases
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "out/**",
    ".next/**",
    ".nuxt/**",
    "coverage/**",
    ".nyc_output/**",
    "__pycache__/**",
    "*.pyc",
    ".pytest_cache/**",
    "venv/**",
    "env/**",
    ".venv/**",
    ".env/**",
    "vendor/**",
    "target/**",
    ".gradle/**",
    ".idea/**",
    ".vscode/**",
    "**/.memory_bank/**",
    "tmp/**",
    "temp/**",
    "**/tmp/**",
    "**/temp/**",
    "*.log",
    "*.tmp",
    "*.cache",
    "**/*.md",
    "*.zip",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.gz",
    "*.bz2",
    "*.xz",
    "*.7z",
    "*.rar",
    "*.zst",
    ".DS_Store",
    "Thumbs.db",
  ]),
  fullScan: z.boolean().optional().default(false),
});

const ListEntitiesToolSchema = z.object({
  filePath: z.string().describe("Path to the file to list entities from"),
  entityTypes: z.array(z.string()).describe("Types of entities to list").optional(),
});

const ListRelationshipsToolSchema = z
  .object({
    entityId: z.string().optional().describe("Exact entity ID to find relationships for"),
    entityName: z.string().optional().describe("Name of the entity to find relationships for"),
    filePath: z.string().optional().describe("Optional file path hint to disambiguate entity"),
    depth: z.number().optional().default(1).describe("Depth of relationship traversal"),
    relationshipTypes: z.array(z.string()).optional().describe("Types of relationships to include"),
  })
  .refine((value) => Boolean(value.entityId || value.entityName), {
    message: "Provide either entityId or entityName",
    path: ["entityId"],
  });

const QueryToolSchema = z.object({
  query: z.string().describe("Natural language or structured query"),
  limit: z.number().describe("Maximum number of results").optional().default(10),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
});

// New semantic tool schemas - TASK-002
const SemanticSearchSchema = z.object({
  query: z.string().describe("Natural language search query"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
  projectPath: z.string().optional().describe("Project directory path for cross-project search"),
});

const FindSimilarCodeSchema = z.object({
  code: z.string().describe("Code snippet to find similar code for"),
  threshold: z.number().optional().default(0.5).describe("Similarity threshold (0-1)"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
});

const AnalyzeCodeImpactSchema = z.object({
  entityId: z.string().describe("Entity ID or name to analyze impact for"),
  filePath: z.string().optional().describe("Optional file path hint to disambiguate entity"),
  depth: z.number().optional().default(2).describe("Depth of impact analysis"),
  branch: z.string().optional().describe("Branch name (null = main branch)"),
});

const DetectCodeClonesSchema = z.object({
  minSimilarity: z.number().optional().default(0.8).describe("Minimum similarity for clones"),
  scope: z.string().optional().default("all").describe("Scope: all, file, or module"),
});

const JscpdCloneDetectionSchema = z.object({
  paths: z
    .array(z.string())
    .nonempty()
    .optional()
    .describe("Directories or files to scan. Relative paths resolve against the server root."),
  pattern: z.string().optional().describe("Glob pattern to apply within each path (default **/*)."),
  ignore: z.array(z.string()).optional().describe("Glob patterns to exclude from scanning."),
  formats: z
    .array(z.string().regex(/^[^.]+$/))
    .optional()
    .describe("File extensions to include without dots (e.g. ['ts','js'])."),
  minLines: z.number().int().min(1).optional().describe("Minimum lines per clone block."),
  maxLines: z.number().int().min(1).optional().describe("Maximum lines per clone block."),
  minTokens: z.number().int().min(1).optional().describe("Minimum tokens per clone (interpreted as lines)."),
  ignoreCase: z.boolean().optional().describe("Lowercase tokens before comparison."),
});

const SuggestRefactoringSchema = z
  .object({
    filePath: z.string().describe("File to analyze for refactoring"),
    focusArea: z.string().optional().describe("Specific entity name to focus on"),
    entityId: z.string().optional().describe("Exact entity ID to analyze"),
    startLine: z.number().int().min(1).optional().describe("1-based start line for manual selection"),
    endLine: z.number().int().min(1).optional().describe("1-based end line (exclusive)"),
  })
  .refine(
    (v) =>
      (v.startLine == null && v.endLine == null) ||
      (v.startLine != null && v.endLine != null && v.startLine < v.endLine),
    {
      message: "startLine and endLine must both be provided and startLine < endLine",
      path: ["startLine"],
    },
  );

const CrossLanguageSearchSchema = z.object({
  query: z.string().describe("Search query"),
  languages: z.array(z.string()).optional().describe("Languages to search in"),
});

const AnalyzeHotspotsSchema = z.object({
  metric: z.string().optional().default("complexity").describe("Metric: complexity, changes, or coupling"),
  limit: z.number().optional().default(10).describe("Maximum hotspots to return"),
});

const FindRelatedConceptsSchema = z.object({
  entityId: z.string().describe("Entity to find related concepts for"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
});

// Chaos Analysis Schema
const AnalyzeStateChaosSchema = z.object({
  scope: z.enum(["file", "module", "project"]).describe("Analysis scope"),
  stateIdentifiers: z
    .array(z.string())
    .optional()
    .describe("Specific state identifiers to analyze (e.g., ['token', 'userId'])"),
  autoDetect: z.boolean().optional().default(false).describe("Automatically detect state patterns"),
  format: z
    .enum(["summary", "detailed", "json"])
    .optional()
    .default("summary")
    .describe("Output format: summary (AI-friendly), detailed (human), json (raw)"),
  maxDepth: z.number().optional().default(10).describe("Maximum trace depth"),
  excludePatterns: z.array(z.string()).optional().describe("File patterns to exclude"),
});

const GetGraphSchema = z.object({
  query: z.string().optional().describe("Optional search query"),
  limit: z.number().optional().default(100).describe("Maximum entities to return"),
});

const GetGraphStatsSchema = z.object({});
const GetGraphHealthSchema = z.object({
  minEntities: z.number().optional().default(1).describe("Minimum entity count for healthy status"),
  minRelationships: z.number().optional().default(0).describe("Minimum relationship count for healthy status"),
  sample: z.number().optional().default(1).describe("Sample size to fetch for verification"),
});

const GetBusStatsSchema = z.object({});
const ClearBusTopicSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe("Exact knowledge bus topic to clear (use wildcards via knowledgeBus.query for inspection)"),
});

// Convenience tool: clean index (reset + index)
const CleanIndexSchema = z.object({
  directory: z.string().describe("Directory to index after reset").optional(),
  excludePatterns: z.array(z.string()).describe("Patterns to exclude during indexing").optional().default([]),
  fullScan: z.boolean().optional().default(false),
});

const GetAgentMetricsSchema = z.object({});

// ============================================================================
// PHASE 8: NEW TOOL SCHEMAS - Code Modification & Analysis Features
// ============================================================================

// Version Manager Schemas
const CreateSnapshotSchema = z.object({
  description: z.string().describe("Description of the snapshot"),
  files: z.array(z.string()).optional().describe("Files to include in snapshot (all if not specified)"),
});

const RollbackSnapshotSchema = z.object({
  snapshotId: z.string().describe("Snapshot ID to rollback to"),
});

const ListSnapshotsSchema = z.object({
  limit: z.number().optional().default(10).describe("Maximum number of snapshots to return"),
});

const CleanupSnapshotsSchema = z.object({
  olderThanDays: z.number().optional().default(30).describe("Delete snapshots older than N days"),
});

// Code Modification Schema
const ModifyEntityCodeSchema = z.object({
  entityId: z.string().describe("ID of entity to modify"),
  newCode: z.string().describe("New code to replace entity"),
  preserveComments: z.boolean().optional().default(true).describe("Preserve leading comments"),
  updateImports: z.boolean().optional().default(true).describe("Update imports if signature changed"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
  skipValidation: z.boolean().optional().default(false).describe("Skip validation checks"),
});

// File Operations Schemas
const CopyFileSchema = z.object({
  source: z.string().describe("Source file or directory path"),
  target: z.string().describe("Target path"),
  preview: z.boolean().optional().default(true).describe("Preview before copying"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with copied entities"),
});

const RenameFileSchema = z.object({
  oldPath: z.string().describe("Current file path"),
  newPath: z.string().describe("New file path"),
  preview: z.boolean().optional().default(true).describe("Preview before renaming"),
  updateImports: z.boolean().optional().default(true).describe("Update imports across project"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new paths"),
});

const SplitFileSchema = z.object({
  filePath: z.string().describe("File to split"),
  entityIds: z.array(z.string()).describe("Entity IDs to extract to separate files"),
  preview: z.boolean().optional().default(true).describe("Preview before splitting"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new file locations"),
});

const SynthesizeFilesSchema = z.object({
  files: z.array(z.string()).min(2).describe("Files to combine into one"),
  targetPath: z.string().describe("Target file path for combined result"),
  preview: z.boolean().optional().default(true).describe("Preview before synthesizing"),
  deleteOriginals: z.boolean().optional().default(false).describe("Delete original files after synthesis"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with merged entities"),
});

// Code Validation Schemas
const ValidateFileSchema = z.object({
  filePath: z.string().describe("File to validate"),
  linter: z.string().optional().describe("Specific linter to use (auto-detect if not specified): eslint, pylint"),
});

const ValidateDirectorySchema = z.object({
  dirPath: z.string().describe("Directory to validate"),
  extensions: z.array(z.string()).optional().describe("File extensions to validate (e.g., ['.ts', '.js', '.py'])"),
  recursive: z.boolean().optional().default(true).describe("Recursively validate subdirectories"),
});

// Technology Detection Schema
const DetectTechnologyStackSchema = z.object({
  generateContext: z.boolean().optional().default(false).describe("Generate tech context string for embeddings"),
});

// Pattern Search Schema
const PatternSearchSchema = z.object({
  pattern: z.string().describe("Regex pattern or semantic query"),
  mode: z
    .enum(["entity", "content", "semantic", "hybrid"])
    .describe("Search mode: entity (name/type), content (inside bodies), semantic (vector), hybrid (all)"),
  entityTypes: z.array(z.string()).optional().describe("Filter by entity types (function, class, interface, etc.)"),
  files: z.array(z.string()).optional().describe("Filter by file paths"),
  frameworks: z.array(z.string()).optional().describe("Filter by frameworks (React, Vue, Angular, etc.)"),
  contentContains: z.string().optional().describe("Content must contain this string"),
  contentRegex: z.string().optional().describe("Content must match this regex"),
  semanticQuery: z.string().optional().describe("Semantic similarity query for content"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
});

// =============================================================================
// Merge Tool Schemas
// =============================================================================
const SemanticMergeSchema = z.object({
  sourceBranch: z.string().describe("Source branch name (where changes come from), e.g. 'feature/caching'"),
  targetBranch: z
    .string()
    .optional()
    .describe("Target branch name (where to merge), e.g. 'main'. Defaults to current branch."),
  dryRun: z.boolean().optional().default(true).describe("Preview only, don't apply changes (default: true)"),
  autoResolve: z.boolean().optional().default(false).describe("Auto-resolve compatible conflicts (default: false)"),
  includeAISuggestions: z
    .boolean()
    .optional()
    .default(true)
    .describe("Generate AI suggestions for conflicts (default: true)"),
});

const AnalyzeMergeConflictsSchema = z.object({
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

const GetMergeSuggestionsSchema = z.object({
  conflictId: z.string().describe("ID of the conflict to get suggestions for (from analyze_merge_conflicts)"),
  branchA: z.string().describe("First branch name"),
  branchB: z.string().describe("Second branch name"),
});

const GetSemanticMergeInfoSchema = z.object({});

// Unified Tool Schemas (cross-compatibility with UltrasharpTools)
const CreateFileSchema = z.object({
  filePath: z.string().describe("Absolute path for the new file to create"),
  content: z.string().describe("Content to write to the file"),
  createDirectories: z.boolean().optional().default(true).describe("Create parent directories if they don't exist"),
  updateGraph: z.boolean().optional().default(true).describe("Parse and add entities to graph after creation"),
  overwrite: z.boolean().optional().default(false).describe("Overwrite file if it already exists"),
});

const RenameSymbolSchema = z.object({
  entityId: z.string().optional().describe("Entity ID to rename (preferred)"),
  entityName: z.string().optional().describe("Entity name to rename (if entityId not provided)"),
  filePath: z.string().optional().describe("File path hint for disambiguation"),
  newName: z.string().describe("New name for the symbol"),
  updateReferences: z.boolean().optional().default(true).describe("Update all references to this symbol"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
});

const AddMemberSchema = z.object({
  entityId: z.string().optional().describe("Parent entity ID (class/interface) to add member to"),
  filePath: z.string().describe("File path where to add the member"),
  memberCode: z.string().describe("Code for the new member (method, property, etc.)"),
  position: z.enum(["start", "end", "after"]).optional().default("end").describe("Where to insert the member"),
  afterMember: z.string().optional().describe("Member name to insert after (when position='after')"),
  preview: z.boolean().optional().default(true).describe("Preview changes before applying"),
  updateGraph: z.boolean().optional().default(true).describe("Update graph with new member"),
});

// ==========================================================================
// AutoDoc Tool Schemas
// ==========================================================================

const AutoDocInitSchema = z.object({
  enabled: z.boolean().optional().default(true).describe("Enable AutoDoc functionality"),
  language: z.enum(["en", "ru"]).optional().default("en").describe("Documentation language"),
  docsDir: z.string().optional().describe("Directory for documentation files"),
});

const AutoDocSaveSchema = z.object({
  filePath: z.string().describe("Path to the markdown documentation file"),
  content: z.string().describe("Markdown content to save"),
  type: z
    .enum(["entity_doc", "architecture", "flow", "process", "dependency", "deployment", "glossary", "module_index"])
    .optional()
    .describe("Document type"),
  autoGenerated: z.boolean().optional().default(true).describe("Mark as auto-generated"),
});

const AutoDocGetSchema = z.object({
  docId: z.string().optional().describe("Document ID to retrieve"),
  filePath: z.string().optional().describe("File path to retrieve documents for"),
});

const AutoDocSearchSchema = z.object({
  query: z.string().describe("Search query for documentation"),
  limit: z.number().optional().default(10).describe("Maximum results to return"),
  mode: z
    .enum(["text", "semantic", "hybrid"])
    .optional()
    .default("text")
    .describe("Search mode: text (keyword), semantic (vector similarity), hybrid (both)"),
});

const AutoDocValidateSchema = z.object({
  filePath: z.string().optional().describe("Validate references in a specific file"),
  fixBroken: z.boolean().optional().default(false).describe("Attempt to fix broken references"),
});

const AutoDocStatusSchema = z.object({});

const AutoDocSyncSchema = z.object({
  scope: z
    .enum(["all", "outdated", "file"])
    .optional()
    .default("outdated")
    .describe("Sync scope: all docs, only outdated, or specific file"),
  filePath: z.string().optional().describe("File path when scope is 'file'"),
  docsDir: z.string().optional().describe("Documentation directory for bidirectional sync"),
  direction: z
    .enum(["both", "disk-to-db", "db-to-disk"])
    .optional()
    .default("both")
    .describe("Sync direction: both (bidirectional), disk-to-db, or db-to-disk"),
});

const AutoDocGenerateSchema = z.object({
  rootDir: z.string().optional().describe("Root directory to scan (default: current indexed directory)"),
  autodocDir: z.string().optional().describe("Output directory for general docs (default: .autodoc)"),
  preview: z.boolean().optional().default(true).describe("Preview mode - show what would be generated without writing"),
  exclude: z.array(z.string()).optional().describe("Patterns to exclude from scanning"),
  maxDepth: z.number().optional().default(4).describe("Max depth to scan for modules"),
  useLlm: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use LLM to generate meaningful documentation (requires Ollama/TGI/OpenAI)"),
  incremental: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Incremental mode: only update changed parts, preserve existing content, mark deleted items. Set to false to regenerate from scratch.",
    ),
  module: z
    .string()
    .optional()
    .describe("Generate docs for a single module by name (e.g., 'utils', 'parsers'). Faster for testing LLM."),
  language: z
    .enum(["auto", "en", "ru", "zh"])
    .optional()
    .default("auto")
    .describe("Documentation language: 'auto' (detect from comments), 'en', 'ru', 'zh'"),
});

const AutoDocChangelogSchema = z.object({
  since: z.number().optional().describe("Unix timestamp to filter changes since"),
  limit: z.number().optional().default(20).describe("Maximum entries to return"),
  branch: z.string().optional().describe("Filter by git branch"),
});

const AutoDocInstallHooksSchema = z.object({
  action: z
    .enum(["install", "uninstall", "status"])
    .optional()
    .default("install")
    .describe("Action: install, uninstall, or check status"),
});

const AutoDocDetectLanguageSchema = z.object({
  scope: z
    .enum(["comments", "docs", "all"])
    .optional()
    .default("all")
    .describe("Scope: analyze code comments, existing docs, or both"),
  sampleSize: z.number().optional().default(20).describe("Number of files to sample for detection"),
});

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

async function executeToolCall(name: string, args: unknown, requestId: string, startTime: number) {
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
    switch (name) {
      case "index": {
        const { directory: indexDir, incremental, excludePatterns, reset, fullScan } = IndexToolSchema.parse(args);
        const targetDir = indexDir || directory;

        // Switch global context if indexing a different directory
        if (targetDir !== currentProjectPath) {
          await switchGlobalProjectContext(targetDir);
        }

        // Optional reset
        if (reset) {
          const storage = await getGraphStorage();
          await storage.clear();
          logger.systemEvent("Graph storage cleared before indexing", { directory: targetDir });
        }

        // Set current indexing directory for adaptive vector backend selection
        setCurrentIndexingDirectory(targetDir);

        if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
          await getSemanticAgent();
        }

        // Enhanced exclude patterns for large codebases
        const enhancedExcludePatterns = [...excludePatterns];

        // Check codebase size and add adaptive patterns
        try {
          const { getCodebaseMetrics } = await import("./utils/shell.js");
          const metrics = await getCodebaseMetrics(targetDir);
          const numFiles = metrics.fileCount;
          const projectSizeMB = metrics.sizeMB;

          logger.info(
            "INDEXING",
            `Detected ${numFiles} source files in codebase`,
            { directory: targetDir, fileCount: numFiles },
            requestId,
          );

          // Adjust resource allocation based on codebase size
          resourceManager.adjustForCodebaseSize(numFiles, projectSizeMB);

          // For very large codebases (>2000 files), add more aggressive patterns
          if (numFiles > 2000) {
            logger.info(
              "INDEXING",
              "Large codebase detected, adding additional exclude patterns",
              { fileCount: numFiles },
              requestId,
            );
            // Removed automatic pattern injection - was too aggressive
            // User should explicitly specify excludePatterns if needed
          }

          // For extremely large codebases (>5000 files), enable incremental by default
          if (numFiles > 5000 && !incremental) {
            logger.info(
              "INDEXING",
              "Extremely large codebase detected, recommending incremental mode",
              { fileCount: numFiles },
              requestId,
            );
          }

          if (!fullScan) {
            if (numFiles > 2000) {
              logger.info(
                "INDEXING",
                "Large codebase detected, enabling batch processing",
                { fileCount: numFiles },
                requestId,
              );
              enhancedExcludePatterns.push("__batch_processing_enabled__"); // Special marker for batch processing
            }
          } else {
            logger.info("INDEXING", "Full scan requested, batch mode disabled", { fileCount: numFiles }, requestId);
          }
        } catch (error) {
          logger.warn(
            "INDEXING",
            "Could not detect codebase size, using default patterns",
            { error: (error as Error).message },
            requestId,
          );
        }

        // Create indexing task with enhanced exclude patterns
        const task: AgentTask = {
          id: `index-${Date.now()}`,
          type: "index",
          priority: 8,
          payload: {
            directory: targetDir,
            incremental,
            excludePatterns: enhancedExcludePatterns,
          },
          createdAt: Date.now(),
        };

        // Initialize dev-agent BEFORE conductor starts delegating
        await getDevAgent();

        // Process through conductor with mandatory delegation
        const cond = getConductor();
        await cond.initialize();
        // Indexing can take significant time for large codebases (e.g., 90+ seconds for 350 files)
        // Use a longer default timeout (5 minutes) to allow completion without early termination
        const INDEX_DEFAULT_TIMEOUT = 300000; // 5 minutes
        const configuredTimeout =
          config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || INDEX_DEFAULT_TIMEOUT;
        const timeoutMs = isDebugMode
          ? Math.max(configuredTimeout, 300000)
          : Math.max(configuredTimeout, INDEX_DEFAULT_TIMEOUT);
        const result = await withTimeout(cond.process(task), timeoutMs, "index", requestId);

        // Generate embeddings for indexed entities (batch mode)
        let embeddingStats: { generated: number; skipped: number } | null = null;
        let oversizedWarning: { aiMessage: string | null; oversizedCount: number; maxTokens: number } | null = null;

        if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
          await ensureSemanticsReady(1, 5000);

          try {
            const semanticAgent = await getSemanticAgent();

            // Generate embeddings for all entities in storage
            console.error(`[index tool] Generating embeddings from storage...`);
            embeddingStats = await semanticAgent.generateEmbeddingsFromStorage();
            console.error(
              `[index tool] Embeddings: generated=${embeddingStats?.generated ?? 0}, skipped=${embeddingStats?.skipped ?? 0}`,
            );

            // Get oversized entity warning
            const warning = semanticAgent.getLastOversizedWarning?.();
            if (warning?.hasWarning) {
              oversizedWarning = {
                aiMessage: warning.aiMessage,
                oversizedCount: warning.oversizedCount,
                maxTokens: warning.maxTokens,
              };
            }
          } catch (error) {
            console.error(`[index tool] Failed to generate embeddings:`, error);
          }
        }

        // Log indexing activity
        logger.agentActivity(
          "conductor",
          "indexing completed",
          {
            directory: targetDir,
            incremental,
            excludePatterns,
            entitiesFound: Array.isArray((result as any)?.entities) ? (result as any).entities.length : 0,
          },
          requestId,
        );

        // Publish to knowledge bus
        knowledgeBus.publish("index:completed", result, "mcp-server");

        const duration = Date.now() - startTime;
        logger.mcpResponse(name, result, duration, requestId);

        // Build response with embedding stats and optional AI warning
        const indexResponse: any = {
          success: true,
          message: "Indexing completed",
          result,
        };

        // Add embedding statistics
        if (embeddingStats) {
          indexResponse.embeddings = embeddingStats;
        }

        if (oversizedWarning?.aiMessage) {
          indexResponse.warning = oversizedWarning.aiMessage;
          indexResponse.oversizedEntities = {
            count: oversizedWarning.oversizedCount,
            maxTokens: oversizedWarning.maxTokens,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(indexResponse, null, 2),
            },
          ],
        };
      }

      case "reset_graph": {
        const storage = await getGraphStorage();
        await storage.clear();
        logger.systemEvent("Graph storage cleared via tool");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "Graph storage cleared" }, null, 2),
            },
          ],
        };
      }

      case "clean_index": {
        const { directory: indexDir, excludePatterns, fullScan } = CleanIndexSchema.parse(args);
        const targetDir = indexDir || directory;

        // Switch global context if indexing a different directory
        if (targetDir !== currentProjectPath) {
          await switchGlobalProjectContext(targetDir);
        }

        // Set current indexing directory for adaptive vector backend selection
        setCurrentIndexingDirectory(targetDir);

        // Reset graph first
        const storage = await getGraphStorage();
        await storage.clear();
        logger.systemEvent("Graph storage cleared before clean index", { directory: targetDir });

        if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
          await getSemanticAgent();
        }

        // Perform index with reset semantics (already cleared), non-incremental
        const enhancedExcludePatterns = [...(excludePatterns || [])];

        // Adaptive patterns as in index tool
        try {
          const { getCodebaseMetrics } = await import("./utils/shell.js");
          const metrics = await getCodebaseMetrics(targetDir);
          const numFiles = metrics.fileCount;
          const projectSizeMB = metrics.sizeMB;

          logger.info(
            "INDEXING",
            `Detected ${numFiles} source files in codebase (clean_index)`,
            { directory: targetDir, fileCount: numFiles },
            requestId,
          );
          resourceManager.adjustForCodebaseSize(numFiles, projectSizeMB);
          // Large codebase detection - log only, no automatic pattern injection
          // User should explicitly specify excludePatterns if needed

          if (!fullScan) {
            if (numFiles > 2000) {
              logger.info(
                "INDEXING",
                "Large codebase detected, enabling batch processing (clean_index)",
                { fileCount: numFiles },
                requestId,
              );
              enhancedExcludePatterns.push("__batch_processing_enabled__");
            }
          } else {
            logger.info(
              "INDEXING",
              "Full scan requested, batch mode disabled (clean_index)",
              { fileCount: numFiles },
              requestId,
            );
          }
        } catch (error) {
          logger.warn(
            "INDEXING",
            "Could not detect codebase size (clean_index), using default patterns",
            { error: (error as Error).message },
            requestId,
          );
        }

        const task: AgentTask = {
          id: `clean-index-${Date.now()}`,
          type: "index",
          priority: 8,
          payload: {
            directory: targetDir,
            incremental: false,
            excludePatterns: enhancedExcludePatterns,
          },
          createdAt: Date.now(),
        };

        // Initialize dev-agent BEFORE conductor starts delegating
        await getDevAgent();

        const cond = getConductor();
        await cond.initialize();
        // clean_index includes full reindexing, needs longer timeout
        const CLEAN_INDEX_DEFAULT_TIMEOUT = 300000; // 5 minutes
        const timeoutMs = Math.max(
          config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || CLEAN_INDEX_DEFAULT_TIMEOUT,
          CLEAN_INDEX_DEFAULT_TIMEOUT,
        );
        const result = await withTimeout(cond.process(task), timeoutMs, "clean_index", requestId);

        // Get oversized entity warning from semantic agent
        let cleanOversizedWarning: { aiMessage: string | null; oversizedCount: number; maxTokens: number } | null =
          null;
        if (process.env["MCP_DEBUG_DISABLE_SEMANTIC"] !== "1") {
          await ensureSemanticsReady(1, 5000);

          try {
            const semanticAgent = await getSemanticAgent();
            const warning = semanticAgent.getLastOversizedWarning?.();
            if (warning?.hasWarning) {
              cleanOversizedWarning = {
                aiMessage: warning.aiMessage,
                oversizedCount: warning.oversizedCount,
                maxTokens: warning.maxTokens,
              };
            }
          } catch {
            // Ignore if semantic agent not available
          }
        }

        knowledgeBus.publish("index:completed", result, "mcp-server");
        const duration = Date.now() - startTime;
        logger.mcpResponse(name, result, duration, requestId);

        // Build response with optional AI warning
        const cleanIndexResponse: any = {
          success: true,
          message: "Clean indexing completed",
          result,
        };

        if (cleanOversizedWarning?.aiMessage) {
          cleanIndexResponse.warning = cleanOversizedWarning.aiMessage;
          cleanIndexResponse.oversizedEntities = {
            count: cleanOversizedWarning.oversizedCount,
            maxTokens: cleanOversizedWarning.maxTokens,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cleanIndexResponse, null, 2),
            },
          ],
        };
      }

      case "get_members": {
        const { filePath, entityTypes } = ListEntitiesToolSchema.parse(args);
        const targetFilePath = normalizeInputPath(filePath);

        const cacheKey = `entities:${targetFilePath}`;
        const cached = knowledgeBus.query(cacheKey, 1);
        if (cached.length > 0) {
          const entry = cached[0];
          if (entry && Date.now() - entry.timestamp < 60000) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(entry.data, null, 2),
                },
              ],
            };
          }
        }

        const storage = await getGraphStorage();
        const normalizedEntityTypes = normalizeEntityTypes(entityTypes);
        const query = await storage.executeQuery({
          type: "entity",
          filters: {
            filePath: targetFilePath,
            ...(normalizedEntityTypes ? { entityType: normalizedEntityTypes } : {}),
          },
          limit: 500,
        });

        const entities = query.entities
          .slice()
          .sort((a, b) => (a.location.start.index ?? 0) - (b.location.start.index ?? 0))
          .map((entity) => mapEntitySummary(entity));

        const response = {
          filePath: targetFilePath,
          total: entities.length,
          entities,
          stats: query.stats,
        };

        knowledgeBus.publish(cacheKey, response, "mcp-server", 60000);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }
      case "list_entity_relationships": {
        const {
          entityId: directId,
          entityName,
          relationshipTypes,
          filePath: hintFilePath,
        } = ListRelationshipsToolSchema.parse(args);
        const storage = await getGraphStorage();
        const resolvedHintPath = hintFilePath ? normalizeInputPath(hintFilePath) : undefined;

        let entity: Entity | null = null;
        if (directId) {
          entity = await storage.getEntity(directId);
        }
        if (!entity) {
          entity = await resolveEntityWithHint(storage, entityName ?? directId ?? "", resolvedHintPath);
        }
        if (!entity) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: `Entity not found: ${entityName}` }, null, 2),
              },
            ],
          };
        }

        // Get relationships by entity ID
        const relationshipsByID = await storage.getRelationshipsForEntity(entity.id);

        // Also find incoming relationships by entity name (for NgRx phantom entities)
        const incomingByName = await storage.findIncomingRelationshipsByName(entity.name, relationshipTypes as any);

        // Merge and deduplicate relationships
        const relMap = new Map<string, Relationship>();
        for (const rel of relationshipsByID) {
          relMap.set(rel.id, rel);
        }
        for (const rel of incomingByName) {
          if (!relMap.has(rel.id)) {
            relMap.set(rel.id, rel);
          }
        }
        const relationships = Array.from(relMap.values());

        const filtered =
          Array.isArray(relationshipTypes) && relationshipTypes.length > 0
            ? relationships.filter((rel) => relationshipTypes.includes(rel.type))
            : relationships;

        const neighborIds = new Set<string>();
        for (const rel of filtered) {
          neighborIds.add(rel.fromId);
          neighborIds.add(rel.toId);
        }

        const neighborMap = new Map<string, Entity>();
        neighborMap.set(entity.id, entity);
        for (const id of neighborIds) {
          if (neighborMap.has(id)) continue;
          const neighbor = await storage.getEntity(id);
          if (neighbor) {
            neighborMap.set(id, neighbor);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  entity: mapEntitySummary(entity),
                  relationships: summarizeRelationships(filtered, neighborMap),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "query": {
        const { query, limit, branch: _branch } = QueryToolSchema.parse(args);
        await ensureSemanticsReady(1, 20000);
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;
        let semanticResult: unknown = [];

        // Base query
        try {
          const semanticAgent = await getSemanticAgent();
          semanticResult = await withTimeout(
            semanticAgent.semanticSearch(query, limit),
            timeoutMs,
            "query:semantic_search",
            requestId,
          );
        } catch (error) {
          logger.warn(
            "SEMANTIC_QUERY",
            "Semantic search fallback engaged",
            { query, error: (error as Error).message },
            requestId,
          );
          semanticResult = [];
        }

        const storage = await getGraphStorage();
        const structural = await storage.executeQuery({
          type: "entity",
          filters: { name: query },
          limit: limit ?? 10,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  semantic: semanticResult,
                  structural: {
                    entities: structural.entities.map((entity) => mapEntitySummary(entity)),
                    relationships: structural.relationships.length,
                    stats: structural.stats,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_metrics": {
        const resourceStats = resourceManager.getCurrentUsage();
        const knowledgeStats = knowledgeBus.getStats();
        const cond = getConductor();
        const conductorMetrics = cond.getMetrics();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  resources: resourceStats,
                  knowledge: knowledgeStats,
                  conductor: conductorMetrics,
                  agents: Array.from(cond.agents.values()).map((agent) => ({
                    id: agent.id,
                    type: agent.type,
                    status: agent.status,
                    memoryUsage: agent.getMemoryUsage(),
                    cpuUsage: agent.getCpuUsage(),
                    queueSize: agent.getTaskQueue().length,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_version": {
        const versionInfo = getVersionInfo();
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  server: {
                    name: versionInfo.name,
                    version: versionInfo.version,
                    description: versionInfo.description,
                    homepage: versionInfo.homepage,
                    repository: versionInfo.repository,
                  },
                  runtime: {
                    nodeVersion: versionInfo.nodeVersion,
                    platform: versionInfo.platform,
                    arch: versionInfo.arch,
                    pid: process.pid,
                    uptime: {
                      seconds: Math.floor(uptime),
                      formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
                    },
                  },
                  memory: {
                    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                    external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
                  },
                  indexedDirectory: directory,
                  configEnvironment: config.environment,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // New semantic tool handlers - TASK-002
      case "semantic_search": {
        const { query, limit, branch, projectPath } = SemanticSearchSchema.parse(args);

        // Switch project context if different project requested
        if (projectPath) {
          const resolvedPath = resolve(projectPath);
          if (resolvedPath !== currentProjectPath) {
            await switchGlobalProjectContext(resolvedPath);
          }
        }

        await ensureSemanticsReady(1, 20000);

        // Check cache first (include branch and project in cache key)
        const cacheKey = `semantic:search:${query}:${limit}:${branch || "main"}:${currentProjectPath}`;
        const cached = knowledgeBus.query(cacheKey, 1);
        if (cached.length > 0) {
          const firstCache = cached[0];
          if (firstCache && Date.now() - firstCache.timestamp < 30000) {
            // 30s cache
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(firstCache.data, null, 2),
                },
              ],
            };
          }
        }

        const semanticAgent = await getSemanticAgent();
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;

        // Base search
        const result = await withTimeout(
          semanticAgent.semanticSearch(query, limit),
          timeoutMs,
          "semantic_search",
          requestId,
        );

        // Cache result
        knowledgeBus.publish(cacheKey, result, "mcp-server", 30000);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "find_similar_code": {
        const { code, threshold, limit, branch: _branch } = FindSimilarCodeSchema.parse(args);
        await ensureSemanticsReady(1, 20000);
        const semanticAgent = await getSemanticAgent();
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;

        // Base search
        const sim = await withTimeout(
          semanticAgent.findSimilarCode(code, threshold ?? 0.5),
          timeoutMs,
          "find_similar_code",
          requestId,
        );
        const result = Array.isArray(sim) && limit ? sim.slice(0, limit) : sim;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // analyze_code_impact handled below (single implementation with fallback)

      case "find_duplicates": {
        const { minSimilarity } = DetectCodeClonesSchema.parse(args);
        await ensureSemanticsReady(1, 20000);
        const semanticAgent = await getSemanticAgent();
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;
        const semanticResult = await withTimeout<CloneGroup[]>(
          semanticAgent.detectClones(minSimilarity),
          timeoutMs,
          "find_duplicates",
          requestId,
        );

        const jscpdResult = await runJscpdCloneDetection({
          paths: [directory],
          minTokens: 20,
          minLines: 3,
          ignore: ["node_modules/**", "dist/**", "coverage/**", "tmp/**", "**/tmp/**", "**/*.d.ts"],
        });

        const semanticNormalized = normalizeSemanticCloneGroups(semanticResult, directory);

        const combined = {
          semantic: {
            totalGroups: semanticNormalized.groups.length,
            skippedGroups: semanticNormalized.skippedGroups,
            groups: semanticNormalized.groups,
            raw: semanticResult,
          },
          jscpd: {
            summary: jscpdResult.summary,
            clones: jscpdResult.summary.clones,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(combined, null, 2),
            },
          ],
        };
      }

      case "jscpd_detect_clones": {
        const parsed = JscpdCloneDetectionSchema.parse(args);
        const rawPaths = parsed.paths && parsed.paths.length > 0 ? parsed.paths : [directory];
        const resolvedPaths = rawPaths
          .map((p) => normalizeInputPath(p) ?? directory)
          .filter((p): p is string => Boolean(p));

        const result = await runJscpdCloneDetection({
          paths: resolvedPaths,
          pattern: parsed.pattern,
          ignore: parsed.ignore,
          formats: parsed.formats?.map((fmt) => fmt.toLowerCase()),
          minLines: parsed.minLines,
          maxLines: parsed.maxLines,
          minTokens: parsed.minTokens,
          ignoreCase: parsed.ignoreCase,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "suggest_refactoring": {
        const { filePath, focusArea, entityId, startLine, endLine } = SuggestRefactoringSchema.parse(args);
        const targetFilePath = normalizeInputPath(filePath);

        const semanticAgent = await getSemanticAgent();
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;

        const storage = await getGraphStorage();

        const MAX_SNIPPET = 10000;
        const { readText } = await import("./utils/file-ops.js");

        const readFileSafe = async (p: string) => {
          const normalizedPath = normalizeInputPath(p);
          try {
            return await readText(normalizedPath);
          } catch {
            return "";
          }
        };

        const sliceByLines = (text: string, sLine: number, eLine: number) => {
          const lines = text.split(/\r?\n/);
          const startIdx = Math.max(1, Math.min(sLine, lines.length));
          const endIdx = Math.max(startIdx + 1, Math.min(eLine, lines.length + 1)); // end exclusive
          const snippet = lines.slice(startIdx - 1, endIdx - 1).join("\n");
          return { snippet, range: { startLine: startIdx, endLine: endIdx } };
        };

        const sliceByEntity = (text: string, e: Entity) => {
          const loc: any = (e as any).location ?? {};
          let snippet = "";
          let range:
            | { startIndex?: number; endIndex?: number; startLine?: number | undefined; endLine?: number }
            | undefined;

          if (typeof loc.start?.index === "number" && typeof loc.end?.index === "number") {
            const start = Math.max(0, Math.min(loc.start.index, text.length));
            const end = Math.max(start, Math.min(loc.end.index, text.length));
            snippet = text.slice(start, end);
            range = { startIndex: start, endIndex: end };
          } else if (typeof loc.start?.line === "number" && typeof loc.end?.line === "number") {
            const res = sliceByLines(text, loc.start.line, loc.end.line);
            snippet = res.snippet;
            range = { startLine: res.range.startLine, endLine: res.range.endLine };
          } else {
            snippet = text;
          }
          return { snippet, range };
        };

        const runSuggest = async (snippet: string) => {
          const limited = snippet.length > MAX_SNIPPET ? snippet.slice(0, MAX_SNIPPET) : snippet;
          return await withTimeout(
            semanticAgent.suggestRefactoring(limited),
            timeoutMs,
            "suggest_refactoring",
            requestId,
          );
        };

        const analyzed: Array<{
          entity?: ReturnType<typeof mapEntitySummary>;
          range?: { startLine?: number | undefined; endLine?: number; startIndex?: number; endIndex?: number };
          suggestions: unknown;
        }> = [];

        const fileText = await readFileSafe(targetFilePath);

        if (!fileText) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: `Cannot read file: ${targetFilePath}` }, null, 2),
              },
            ],
          };
        }

        if (startLine != null && endLine != null) {
          const { snippet, range } = sliceByLines(fileText, startLine, endLine);
          const suggestions = await runSuggest(snippet);
          analyzed.push({ range, suggestions });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ filePath: targetFilePath, focus: { mode: "range", range }, analyzed }, null, 2),
              },
            ],
          };
        }

        if (entityId) {
          const ent = await storage.getEntity(entityId);
          if (!ent) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: false, error: `Entity not found by id: ${entityId}` }, null, 2),
                },
              ],
            };
          }

          const { snippet, range } = sliceByEntity(fileText, ent);
          const suggestions = await runSuggest(snippet);
          analyzed.push({ entity: mapEntitySummary(ent), range, suggestions });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { filePath: targetFilePath, focus: { mode: "entityId", entityId: ent.id }, analyzed },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (focusArea) {
          const ent = await resolveEntityWithHint(storage, focusArea, targetFilePath);
          if (ent) {
            const { snippet, range } = sliceByEntity(fileText, ent);
            const suggestions = await runSuggest(snippet);
            analyzed.push({ entity: mapEntitySummary(ent), range, suggestions });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { filePath: targetFilePath, focus: { mode: "focusArea", focusArea }, analyzed },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }

        const query = await storage.executeQuery({
          type: "entity",
          filters: { filePath: targetFilePath },
          limit: 500,
        });

        const sorted = query.entities
          .filter((e) => (e as any).location?.start != null && (e as any).location?.end != null)
          .map((e) => {
            const s = (e as any).location?.start?.index ?? 0;
            const ed = (e as any).location?.end?.index ?? 0;
            return { e, len: Math.max(0, ed - s) };
          })
          .sort((a, b) => b.len - a.len)
          .slice(0, 3)
          .map((x) => x.e);

        if (sorted.length === 0) {
          const suggestions = await runSuggest(fileText);
          analyzed.push({ range: { startIndex: 0, endIndex: Math.min(fileText.length, MAX_SNIPPET) }, suggestions });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ filePath: targetFilePath, focus: { mode: "file" }, analyzed }, null, 2),
              },
            ],
          };
        }

        for (const ent of sorted) {
          const { snippet, range } = sliceByEntity(fileText, ent);
          const suggestions = await runSuggest(snippet);
          analyzed.push({ entity: mapEntitySummary(ent), range, suggestions });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { filePath: targetFilePath, focus: { mode: "auto-top-entities", count: analyzed.length }, analyzed },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "cross_language_search": {
        const { query, languages } = CrossLanguageSearchSchema.parse(args);
        await ensureSemanticsReady(1, 20000);
        const semanticAgent = await getSemanticAgent();
        const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;
        const result = await withTimeout(
          semanticAgent.crossLanguageSearch(query, languages || []),
          timeoutMs,
          "cross_language_search",
          requestId,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "analyze_hotspots": {
        const { metric, limit } = AnalyzeHotspotsSchema.parse(args);
        const storage = await getGraphStorage();
        const relationshipSample = await storage.executeQuery({ type: "relationship", limit: 10000 });

        const counts = new Map<string, { incoming: number; outgoing: number }>();
        for (const rel of relationshipSample.relationships) {
          const from = counts.get(rel.fromId) ?? { incoming: 0, outgoing: 0 };
          from.outgoing += 1;
          counts.set(rel.fromId, from);

          const to = counts.get(rel.toId) ?? { incoming: 0, outgoing: 0 };
          to.incoming += 1;
          counts.set(rel.toId, to);
        }

        const ranked = Array.from(counts.entries())
          .map(([id, data]) => ({ id, ...data, total: data.incoming + data.outgoing }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit ?? 10);

        const hotspots = [] as Array<{
          entity: ReturnType<typeof mapEntitySummary>;
          metrics: { incoming: number; outgoing: number; total: number };
          score: number;
        }>;

        for (const entry of ranked) {
          const entity = await storage.getEntity(entry.id);
          if (!entity) continue;
          const baseScore = entry.total * 10 + entry.incoming * 5;
          const metricScore =
            metric === "complexity" ? entry.total * 2 : metric === "coupling" ? entry.incoming * 3 : entry.outgoing * 3;
          hotspots.push({
            entity: mapEntitySummary(entity),
            metrics: { incoming: entry.incoming, outgoing: entry.outgoing, total: entry.total },
            score: Math.round(baseScore + metricScore),
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  metric,
                  limit: limit ?? 10,
                  hotspots,
                  sampleSize: relationshipSample.relationships.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "find_related_concepts": {
        const { entityId, limit } = FindRelatedConceptsSchema.parse(args);
        await ensureSemanticsReady(1, 20000);
        const storage = await getGraphStorage();
        const entity = await resolveEntity(storage, entityId);
        if (!entity) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: `Entity not found: ${entityId}` }, null, 2),
              },
            ],
          };
        }

        // Read code snippet for this entity using optimized range reading
        const { readByteRange, readLineRange, readText } = await import("./utils/file-ops.js");
        const entityFilePath = normalizeInputPath(entity.filePath) ?? entity.filePath;
        let snippet = "";
        try {
          const loc = (entity as any).location;
          // Try byte-range first (most efficient)
          if (typeof loc?.start?.index === "number" && typeof loc?.end?.index === "number") {
            const result = await readByteRange(entityFilePath, loc.start.index, loc.end.index, 10000);
            if (result) snippet = result;
          }
          // Fallback to line range
          if (!snippet && typeof loc?.start?.line === "number" && typeof loc?.end?.line === "number") {
            const result = await readLineRange(entityFilePath, loc.start.line, loc.end.line, 10000);
            if (result) snippet = result;
          }
          // Last resort: read full file
          if (!snippet) {
            snippet = await readText(entityFilePath);
            if (snippet.length > 10000) snippet = snippet.slice(0, 10000);
          }
        } catch {
          // If read fails, return empty
          snippet = "";
        }

        let results: unknown = [];
        try {
          const semanticAgent = await getSemanticAgent();
          const timeoutMs = config.mcp.agents?.defaultTimeout || config.mcp.server?.timeout || 30000;
          const sim = await withTimeout(
            semanticAgent.findSimilarCode(snippet, 0.65),
            timeoutMs,
            "find_related_concepts",
            requestId,
          );
          results = Array.isArray(sim) && limit ? sim.slice(0, limit) : sim;
        } catch (error) {
          logger.warn(
            "SEMANTIC_RELATED",
            "Related concepts fallback",
            { entityId, error: (error as Error).message },
            requestId,
          );
          results = [];
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { entity: { id: entity.id, name: entity.name, filePath: entityFilePath }, related: results },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "analyze_state_chaos": {
        const { scope, stateIdentifiers, autoDetect, format, maxDepth, excludePatterns } =
          AnalyzeStateChaosSchema.parse(args);

        const storage = await getGraphStorage();

        // Create ChaosAnalyzer
        const analyzer = new ChaosAnalyzer(storage);

        const options = {
          scope,
          stateIdentifiers,
          autoDetect,
          maxDepth,
          excludePatterns,
        };

        const results = await analyzer.analyze(options);

        let output: string;
        switch (format) {
          case "summary":
            output = analyzer.formatForAI(results);
            break;
          case "detailed":
            output = results.map((r) => analyzer.formatDetailed(r)).join("\n\n---\n\n");
            break;
          default:
            // "json" or any other format defaults to JSON
            output = JSON.stringify(results, null, 2);
            break;
        }

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      case "get_graph": {
        const { query, limit } = GetGraphSchema.parse(args);

        // Use direct database query instead of going through agents
        const storage = await getGraphStorage();
        const result = await storage.executeQuery({
          type: "entity",
          filters: { name: query },
          limit: limit ?? 100,
        });

        logger.info(
          "GRAPH_QUERY",
          `Retrieved graph with ${result.entities.length} entities and ${result.relationships.length} relationships`,
          {
            query,
            limit,
            stats: result.stats,
          },
          requestId,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  entities: result.entities,
                  relations: result.relationships,
                  stats: {
                    totalNodes: result.stats.totalEntities,
                    totalRelations: result.stats.totalRelationships,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "analyze_code_impact": {
        const { entityId, filePath: hintFilePath, branch: _branch } = AnalyzeCodeImpactSchema.parse(args);
        const storage = await getGraphStorage();
        const resolvedHintPath = hintFilePath ? normalizeInputPath(hintFilePath) : undefined;

        // Base analysis
        let entity = await storage.getEntity(entityId);
        if (!entity) {
          entity = await resolveEntityWithHint(storage, entityId, resolvedHintPath);
        }

        if (!entity) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: false, error: `Entity not found: ${entityId}` }, null, 2),
              },
            ],
          };
        }

        const relationships = await storage.getRelationshipsForEntity(entity.id);
        const directIds = new Set<string>();
        const outboundIds = new Set<string>();

        for (const rel of relationships) {
          if (rel.toId === entity.id) {
            directIds.add(rel.fromId);
          }
          if (rel.fromId === entity.id) {
            outboundIds.add(rel.toId);
          }
        }

        const directEntities = (await Promise.all(Array.from(directIds).map((id) => storage.getEntity(id)))).filter(
          (e): e is Entity => Boolean(e),
        );

        const indirectIds = new Set<string>();
        for (const direct of directEntities) {
          const rels = await storage.getRelationshipsForEntity(direct.id);
          for (const rel of rels) {
            const candidate = rel.fromId === direct.id ? rel.toId : rel.fromId;
            if (candidate !== entity.id && !directIds.has(candidate)) {
              indirectIds.add(candidate);
            }
          }
        }

        const indirectEntities = (await Promise.all(Array.from(indirectIds).map((id) => storage.getEntity(id)))).filter(
          (e): e is Entity => Boolean(e),
        );

        const affectedFiles = new Set<string>();
        for (const sample of [...directEntities, ...indirectEntities]) {
          affectedFiles.add(normalizeInputPath(sample.filePath) ?? sample.filePath);
        }

        const totalImpact = directEntities.length + indirectEntities.length;
        const riskLevel =
          totalImpact > 50 ? "critical" : totalImpact > 20 ? "high" : totalImpact > 5 ? "medium" : "low";

        const outboundSummaries = (
          await Promise.all(
            Array.from(outboundIds).map(async (id) => {
              const dep = await storage.getEntity(id);
              return dep ? mapEntitySummary(dep) : null;
            }),
          )
        ).filter((item): item is ReturnType<typeof mapEntitySummary> => Boolean(item));

        const impact = {
          source: mapEntitySummary(entity),
          directImpacts: directEntities.map((item) => mapEntitySummary(item)),
          indirectImpacts: indirectEntities.map((item) => mapEntitySummary(item)),
          outboundDependencies: outboundSummaries,
          affectedFiles: Array.from(affectedFiles),
          riskLevel,
          totals: {
            direct: directEntities.length,
            indirect: indirectEntities.length,
            outbound: outboundIds.size,
          },
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(impact, null, 2),
            },
          ],
        };
      }

      case "get_graph_stats": {
        const storage = await getGraphStorage();
        const stats = await storage.getStatistics();

        logger.info("GRAPH_STATS", "Retrieved graph statistics", stats, requestId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case "get_graph_health": {
        const { minEntities, minRelationships, sample } = GetGraphHealthSchema.parse(args ?? {});
        const storage = await getGraphStorage();
        const metrics = await storage.getMetrics();

        // Try a tiny sample query to ensure read path is functional
        const sampleQuery = await storage.executeQuery({ type: "entity", limit: Math.max(1, sample) });

        const healthy =
          (metrics.totalEntities ?? 0) >= minEntities &&
          (metrics.totalRelationships ?? 0) >= minRelationships &&
          sampleQuery.entities.length >= Math.min(1, sample);

        const reason = healthy
          ? "OK"
          : `Mismatch: totals e=${metrics.totalEntities}, r=${metrics.totalRelationships}, sample=${sampleQuery.entities.length}`;

        logger.info(
          "GRAPH_HEALTH",
          "Graph health check",
          {
            healthy,
            reason,
            totals: {
              entities: metrics.totalEntities,
              relationships: metrics.totalRelationships,
              files: metrics.totalFiles,
            },
            sampleCount: sampleQuery.entities.length,
          },
          requestId,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  healthy,
                  reason,
                  totals: {
                    entities: metrics.totalEntities,
                    relationships: metrics.totalRelationships,
                    files: metrics.totalFiles,
                  },
                  sampleCount: sampleQuery.entities.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_agent_metrics": {
        GetAgentMetricsSchema.parse(args ?? {});

        const cond = getConductor();
        await cond.initialize();

        const snapshot = await collectAgentMetrics({
          conductor: cond,
          resourceManager,
          knowledgeBus,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(snapshot, null, 2),
            },
          ],
        };
      }

      case "get_bus_stats": {
        GetBusStatsSchema.parse(args ?? {});

        const stats = knowledgeBus.getStats();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case "clear_bus_topic": {
        const { topic } = ClearBusTopicSchema.parse(args ?? {});

        knowledgeBus.clearTopic(topic);
        const stats = knowledgeBus.getStats();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  topicCleared: topic,
                  stats,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Branch management tools
      case "list_branches": {
        if (!conductor) {
          throw new Error("Conductor not initialized");
        }
        const indexerAgent = conductor.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        const branchManager = indexerAgent?.getBranchManager() || null;
        const { repositoryPath } = args as { repositoryPath?: string };

        const result = await branchTools.listBranches(branchManager, repositoryPath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "switch_branch": {
        if (!conductor) {
          throw new Error("Conductor not initialized");
        }
        const indexerAgent = conductor.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        const branchManager = indexerAgent?.getBranchManager() || null;
        const { branch, repositoryPath } = args as { branch: string; repositoryPath?: string };

        const result = await branchTools.switchBranch(branchManager, branch, repositoryPath);

        // Also switch branch in LayeredIndexManager for delta sync
        const layeredMgr = await getLayeredIndexManager();
        if (layeredMgr) {
          await layeredMgr.switchBranch(branch);
          console.error(`[Main] LayeredIndexManager switched to branch: ${branch}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_branch_status": {
        if (!conductor) {
          throw new Error("Conductor not initialized");
        }
        const indexerAgent = conductor.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        const branchManager = indexerAgent?.getBranchManager() || null;
        const { repositoryPath } = args as { repositoryPath?: string };

        const result = await branchTools.getBranchStatus(branchManager, repositoryPath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "cleanup_branches": {
        if (!conductor) {
          throw new Error("Conductor not initialized");
        }
        const indexerAgent = conductor.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        const branchManager = indexerAgent?.getBranchManager() || null;
        const { keep } = args as { keep?: number };

        const result = await branchTools.cleanupBranches(branchManager, keep);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_changed_files": {
        if (!conductor) {
          throw new Error("Conductor not initialized");
        }
        const indexerAgent = conductor.getAgentByType(AgentType.INDEXER) as IndexerAgent | undefined;
        const gitWatcher = indexerAgent?.getGitWatcher() || null;
        const { fromBranch, toBranch } = args as { fromBranch: string; toBranch: string };

        const result = await branchTools.getChangedFiles(gitWatcher, fromBranch, toBranch);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // ============================================================================
      // PHASE 8: New Code Modification & Analysis Tool Handlers
      // ============================================================================

      // Version Manager Tools
      case "create_snapshot": {
        const { description, files } = CreateSnapshotSchema.parse(args);
        const vm = await getVersionManager();
        const snapshotId = await vm.createSnapshot(description, files);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  snapshotId,
                  description,
                  filesCount: files?.length || "all",
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "undo": {
        const { snapshotId } = RollbackSnapshotSchema.parse(args);
        const vm = await getVersionManager();
        await vm.rollback(snapshotId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  snapshotId,
                  message: "Successfully rolled back to snapshot",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_snapshots": {
        const { limit } = ListSnapshotsSchema.parse(args);
        const vm = await getVersionManager();
        const snapshots = await vm.listSnapshots(limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  count: snapshots.length,
                  snapshots,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "cleanup_snapshots": {
        const { olderThanDays } = CleanupSnapshotsSchema.parse(args);
        const vm = await getVersionManager();
        const deletedCount = await vm.cleanup(olderThanDays);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  deletedCount,
                  olderThanDays,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Code Modification Tool
      case "modify_code": {
        const params = ModifyEntityCodeSchema.parse(args);
        const modifier = await getCodeModifier();
        const result = await modifier.modifyEntity(params);

        // Notify AutoDoc about entity modification
        if (result.success && params.entityId) {
          try {
            const adm = await getAutoDocManager();
            await adm.onEntityModified(params.entityId, "modified");
          } catch (error) {
            // AutoDoc notification failure shouldn't break the main operation
            logger.warn("AUTODOC", `Failed to notify entity modification: ${(error as Error).message}`, {}, requestId);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // File Operations Tools
      case "copy_file": {
        const { source, target, preview, updateGraph } = CopyFileSchema.parse(args);
        const fileOps = await getFileOperations();
        const result = await fileOps.copy(source, target, { preview, updateGraph });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "rename_file": {
        const { oldPath, newPath, preview, updateImports, updateGraph } = RenameFileSchema.parse(args);
        const fileOps = await getFileOperations();
        const result = await fileOps.rename(oldPath, newPath, { preview, updateImports, updateGraph });

        // Notify AutoDoc about file rename (if not preview)
        if (result.success && !preview) {
          try {
            const adm = await getAutoDocManager();
            await adm.onFileRenamed(oldPath, newPath);
          } catch (error) {
            logger.warn("AUTODOC", `Failed to notify file rename: ${(error as Error).message}`, {}, requestId);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "split_file": {
        const { filePath, entityIds, preview, updateGraph } = SplitFileSchema.parse(args);
        const fileOps = await getFileOperations();
        const result = await fileOps.split(filePath, entityIds, { preview, updateGraph });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "synthesize_files": {
        const { files, targetPath, preview, deleteOriginals, updateGraph } = SynthesizeFilesSchema.parse(args);
        const fileOps = await getFileOperations();
        const result = await fileOps.synthesize(files, targetPath, { preview, deleteOriginals, updateGraph });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Unified Tools (cross-compatibility with UltrasharpTools)
      case "create_file": {
        const { filePath, content, createDirectories, updateGraph, overwrite } = CreateFileSchema.parse(args);
        const targetPath = normalizeInputPath(filePath);

        // Check if file exists
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        try {
          await fs.access(targetPath);
          if (!overwrite) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: `File already exists: ${targetPath}. Use overwrite=true to replace it.`,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } catch {
          // File doesn't exist, ok to create
        }

        // Create parent directories if needed
        if (createDirectories) {
          const dirPath = path.dirname(targetPath);
          await fs.mkdir(dirPath, { recursive: true });
        }

        // Write file
        await fs.writeFile(targetPath, content, "utf-8");

        // Parse and update graph if requested
        let parseResult = null;
        if (updateGraph) {
          const devAgent = await getDevAgent();
          const parseTask: AgentTask = {
            id: `parse-${Date.now()}`,
            type: "parse",
            priority: 5,
            payload: { filePath: targetPath },
            createdAt: Date.now(),
          };
          parseResult = await devAgent.process(parseTask);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  filePath: targetPath,
                  bytesWritten: content.length,
                  parseResult: parseResult || "Graph update skipped",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "rename_symbol": {
        const { entityId, entityName, filePath, newName, updateReferences, preview } = RenameSymbolSchema.parse(args);

        const storage = await getGraphStorage();

        // Find entity
        let entity = null;
        if (entityId) {
          entity = await storage.getEntity(entityId);
        } else if (entityName && filePath) {
          const targetPath = normalizeInputPath(filePath);
          const fileEntities = await storage.searchEntities({ filePath: targetPath });
          entity = fileEntities.find((e: Entity) => e.name === entityName) || null;
        }

        if (!entity) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    error: "Entity not found. Provide valid entityId or entityName + filePath.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Find all references if updateReferences is true
        const references = updateReferences
          ? await storage.getRelationshipsForEntity(entity.id, RelationType.REFERENCES)
          : [];

        const changes = [
          {
            file: entity.filePath,
            line: entity.location.start.line,
            oldName: entity.name,
            newName: newName,
            type: "definition",
          },
          ...references.map((ref: Relationship) => ({
            file: entity.filePath, // Relationships don't track target file
            line: ref.metadata?.line || 0,
            oldName: entity.name,
            newName: newName,
            type: "reference",
          })),
        ];

        if (preview) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    preview: true,
                    entity: {
                      id: entity.id,
                      name: entity.name,
                      type: entity.type,
                      file: entity.filePath,
                    },
                    newName,
                    changes,
                    message: "Preview mode: no changes applied. Set preview=false to apply.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Apply changes (simplified - in production would use AST transformation)
        const fs = await import("node:fs/promises");
        const modifiedFiles = new Set<string>();
        const oldName = entity.name; // Store for regex

        for (const change of changes) {
          const fileContent = await fs.readFile(change.file, "utf-8");
          const lines = fileContent.split("\n");

          // Simple regex replacement (in production, use AST)
          const regex = new RegExp(`\\b${oldName}\\b`, "g");
          const targetLine = lines[change.line];
          if (targetLine !== undefined) {
            lines[change.line] = targetLine.replace(regex, newName);
          }

          await fs.writeFile(change.file, lines.join("\n"), "utf-8");
          modifiedFiles.add(change.file);
        }

        // Update entity in graph
        storage.updateEntity(entity.id, { name: newName });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  preview: false,
                  oldName: entity.name,
                  newName,
                  changesApplied: changes.length,
                  filesModified: Array.from(modifiedFiles),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_member": {
        const { entityId, filePath, memberCode, position, afterMember, preview, updateGraph } =
          AddMemberSchema.parse(args);

        const targetPath = normalizeInputPath(filePath);
        const fs = await import("node:fs/promises");

        // Read file
        const fileContent = await fs.readFile(targetPath, "utf-8");
        const lines = fileContent.split("\n");

        let insertLine = -1;

        if (entityId) {
          // Find entity by ID and determine insert position
          const storage = await getGraphStorage();
          const entity = await storage.getEntity(entityId);

          if (!entity) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: false, error: "Entity not found by ID" }, null, 2),
                },
              ],
            };
          }

          if (position === "start") {
            insertLine = entity.location.start.line + 1; // After opening brace
          } else if (position === "end") {
            insertLine = entity.location.end.line; // Before closing brace
          } else if (position === "after" && afterMember) {
            // Find member with name afterMember (simplified)
            const fileEntities = await storage.searchEntities({ filePath: targetPath });
            const targetMember = fileEntities.find(
              (e: Entity) =>
                e.name === afterMember &&
                e.location.start.line >= entity.location.start.line &&
                e.location.end.line <= entity.location.end.line,
            );
            if (targetMember) {
              insertLine = targetMember.location.end.line + 1;
            } else {
              insertLine = entity.location.end.line; // Fallback to end
            }
          }
        } else {
          // No entity ID - append to end of file
          insertLine = lines.length;
        }

        if (insertLine === -1) {
          insertLine = lines.length;
        }

        // Preview mode
        if (preview) {
          const previewLines = [...lines];
          previewLines.splice(insertLine, 0, memberCode);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    preview: true,
                    filePath: targetPath,
                    insertLine,
                    memberCode,
                    previewSnippet: previewLines.slice(Math.max(0, insertLine - 3), insertLine + 5).join("\n"),
                    message: "Preview mode: no changes applied. Set preview=false to apply.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Apply changes
        lines.splice(insertLine, 0, memberCode);
        await fs.writeFile(targetPath, lines.join("\n"), "utf-8");

        // Re-parse file to update graph
        let parseResult = null;
        if (updateGraph) {
          const devAgent = await getDevAgent();
          const parseTask: AgentTask = {
            id: `parse-${Date.now()}`,
            type: "parse",
            priority: 5,
            payload: { filePath: targetPath },
            createdAt: Date.now(),
          };
          parseResult = await devAgent.process(parseTask);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  preview: false,
                  filePath: targetPath,
                  insertLine,
                  memberCode,
                  parseResult: parseResult || "Graph update skipped",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Code Validation Tools
      case "validate_file": {
        const { filePath } = ValidateFileSchema.parse(args);
        const validator = await getCodeValidator();
        const report = await validator.validateFile(filePath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      }

      case "validate_directory": {
        const { dirPath, extensions } = ValidateDirectorySchema.parse(args);
        const validator = await getCodeValidator();
        const reports = await validator.validateDirectory(dirPath, extensions);

        // Aggregate summary
        const totalProblems = reports.reduce((sum, r) => sum + r.summary.total, 0);
        const totalErrors = reports.reduce((sum, r) => sum + r.summary.errors, 0);
        const totalWarnings = reports.reduce((sum, r) => sum + r.summary.warnings, 0);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  filesValidated: reports.length,
                  summary: {
                    totalProblems,
                    totalErrors,
                    totalWarnings,
                  },
                  reports,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Technology Detection Tool
      case "detect_technology_stack": {
        const { generateContext } = DetectTechnologyStackSchema.parse(args);
        const detector = await getTechnologyDetector();
        const stack = await detector.detectStack();

        const result: any = { success: true, stack };

        if (generateContext) {
          result.techContext = detector.generateTechContext(stack);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Pattern Search Tool
      case "pattern_search": {
        const { pattern, mode, entityTypes, files, frameworks, contentContains, contentRegex, semanticQuery, limit } =
          PatternSearchSchema.parse(args);

        const search = await getPatternSearch();

        const query: any = {
          pattern,
          mode,
          limit,
        };

        if (entityTypes || files || frameworks) {
          query.scope = {
            entityTypes,
            files,
            frameworks,
          };
        }

        if (contentContains || contentRegex || semanticQuery) {
          query.contentFilter = {
            contains: contentContains,
            regex: contentRegex,
            semantic: semanticQuery,
          };
        }

        const results = await search.search(query);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  mode,
                  resultsCount: results.length,
                  results,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // ==========================================================================
      // AutoDoc Tools
      // ==========================================================================

      case "autodoc_init": {
        const { enabled, language, docsDir } = AutoDocInitSchema.parse(args);
        const adm = await getAutoDocManager();

        adm.setConfig({
          enabled,
          language,
          docsDir: docsDir || join(directory, ".memory_bank"),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "AutoDoc initialized",
                  config: adm.getConfig(),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_save": {
        const { filePath, content, type, autoGenerated } = AutoDocSaveSchema.parse(args);
        const adm = await getAutoDocManager();

        const normalizedPath = normalizeInputPath(filePath) || filePath;
        const savedDocs = await adm.saveDocument(normalizedPath, content, {
          type: type as any,
          autoGenerated,
        });

        // Write file to disk (bidirectional sync: DB → Disk)
        let fileWritten = false;
        try {
          await writeDocumentToDisk(normalizedPath, content);
          fileWritten = true;
        } catch (error) {
          logger.warn("AUTODOC", `Failed to write file to disk: ${(error as Error).message}`, {}, requestId);
        }

        // Generate embeddings for semantic search (if VectorStore available)
        let embeddingsGenerated = 0;
        if (globalVectorStore && savedDocs.length > 0) {
          try {
            const semanticAgent = await getSemanticAgent();
            for (const doc of savedDocs) {
              // Generate embedding for title + content
              const textToEmbed = `${doc.title}\n\n${doc.content}`;
              const embedding = await semanticAgent.generateEmbedding(textToEmbed);

              if (embedding) {
                await globalVectorStore.insert({
                  id: doc.id,
                  content: textToEmbed.slice(0, 1000), // Truncate for storage
                  vector: embedding,
                  metadata: {
                    type: "autodoc",
                    docType: doc.type,
                    filePath: doc.filePath,
                    section: doc.section,
                    title: doc.title,
                  },
                  createdAt: Date.now(),
                });
                embeddingsGenerated++;
              }
            }
          } catch (error) {
            logger.warn("AUTODOC", `Failed to generate embeddings: ${(error as Error).message}`, {}, requestId);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Saved ${savedDocs.length} sections`,
                  fileWritten,
                  embeddingsGenerated,
                  docs: savedDocs.map((d) => ({
                    id: d.id,
                    title: d.title,
                    section: d.section,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_get": {
        const { docId, filePath } = AutoDocGetSchema.parse(args);
        const adm = await getAutoDocManager();

        if (docId) {
          const doc = await adm.getDocument(docId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: !!doc,
                    doc: doc || null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (filePath) {
          const normalizedPath = normalizeInputPath(filePath) || filePath;
          const docs = await adm.getDocumentsByFile(normalizedPath);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    count: docs.length,
                    docs,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: "Provide docId or filePath" }, null, 2),
            },
          ],
        };
      }

      case "autodoc_search": {
        const { query, limit, mode } = AutoDocSearchSchema.parse(args);
        const adm = await getAutoDocManager();

        interface SearchResult {
          id: string;
          title: string;
          filePath: string;
          section: string | null;
          snippet: string;
          score?: number;
          source: "text" | "semantic";
        }

        const searchResults: SearchResult[] = [];

        // Text search
        if (mode === "text" || mode === "hybrid") {
          const textResults = await adm.searchDocsByText(query, limit);
          for (const d of textResults) {
            searchResults.push({
              id: d.id,
              title: d.title,
              filePath: d.filePath,
              section: d.section,
              snippet: d.content.slice(0, 200),
              source: "text",
            });
          }
        }

        // Semantic search (if enabled and VectorStore available)
        if ((mode === "semantic" || mode === "hybrid") && globalVectorStore) {
          try {
            const semanticAgent = await getSemanticAgent();
            const queryEmbedding = await semanticAgent.generateEmbedding(query);

            if (queryEmbedding) {
              // Search for doc embeddings (prefixed with "doc::")
              const semanticResults = await globalVectorStore.search(queryEmbedding, limit);

              for (const result of semanticResults) {
                if (result.id.startsWith("doc::")) {
                  const doc = await adm.getDocument(result.id);
                  if (doc && !searchResults.some((r) => r.id === doc.id)) {
                    searchResults.push({
                      id: doc.id,
                      title: doc.title,
                      filePath: doc.filePath,
                      section: doc.section,
                      snippet: doc.content.slice(0, 200),
                      score: result.similarity,
                      source: "semantic",
                    });
                  }
                }
              }
            }
          } catch (error) {
            // Semantic search failed, continue with text results
            logger.warn("AUTODOC", `Semantic search failed: ${(error as Error).message}`, {}, requestId);
          }
        }

        // Sort by score (semantic results first if hybrid)
        searchResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  query,
                  mode: mode || "text",
                  resultsCount: searchResults.length,
                  results: searchResults.slice(0, limit),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_validate": {
        const { filePath } = AutoDocValidateSchema.parse(args);
        const adm = await getAutoDocManager();

        const validation = await adm.validateReferences();

        const result: any = {
          success: true,
          total: validation.total,
          valid: validation.valid,
          broken: validation.broken.length,
        };

        if (filePath) {
          const normalizedPath = normalizeInputPath(filePath) || filePath;
          result.brokenInFile = validation.broken.filter((b) => b.ref.sourceLocation.filePath === normalizedPath);
        } else {
          result.brokenRefs = validation.broken.slice(0, 20);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "autodoc_status": {
        const adm = await getAutoDocManager();
        const status = await adm.getStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  status,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_sync": {
        const { scope, filePath, docsDir, direction } = AutoDocSyncSchema.parse(args);
        const adm = await getAutoDocManager();

        const syncResult: {
          validated: number;
          brokenRefs: number;
          outdatedDocs: number;
          markedOutdated: string[];
          fileSync?: FileSyncResult;
        } = {
          validated: 0,
          brokenRefs: 0,
          outdatedDocs: 0,
          markedOutdated: [],
        };

        // Bidirectional file sync (if docsDir provided)
        if (docsDir) {
          const normalizedDocsDir = normalizeInputPath(docsDir) || docsDir;

          if (direction === "disk-to-db") {
            // Sync only from disk to database
            const diskToDb = await syncDiskToDb(
              normalizedDocsDir,
              async (fp) => adm.getDocumentsByFile(fp),
              async (fp, content) => adm.saveDocument(fp, content),
              8, // concurrency
            );
            syncResult.fileSync = { diskToDb, dbToDisk: { written: [], errors: [] } };
          } else if (direction === "db-to-disk") {
            // Sync only from database to disk
            const dbToDisk = await syncDbToDisk(
              async () => adm.getAllDocuments(),
              8, // concurrency
            );
            syncResult.fileSync = { diskToDb: { added: [], updated: [], errors: [] }, dbToDisk };
          } else {
            // Bidirectional sync (both directions)
            syncResult.fileSync = await syncBidirectional(
              normalizedDocsDir,
              async (fp) => adm.getDocumentsByFile(fp),
              async () => adm.getAllDocuments(),
              async (fp, content) => adm.saveDocument(fp, content),
              8, // concurrency
            );
          }
        }

        // Validate all references
        const validation = await adm.validateReferences();
        syncResult.validated = validation.total;
        syncResult.brokenRefs = validation.broken.length;

        // Get and report outdated docs
        const outdated = await adm.getOutdatedDocs();
        syncResult.outdatedDocs = outdated.length;

        // If scope is "file", only process that file
        if (scope === "file" && filePath) {
          const normalizedPath = normalizeInputPath(filePath) || filePath;
          const fileDocs = await adm.getDocumentsByFile(normalizedPath);
          for (const doc of fileDocs) {
            if (doc.confidence < 0.7) {
              syncResult.markedOutdated.push(doc.id);
            }
          }
        } else {
          // Report all outdated docs
          syncResult.markedOutdated = outdated.map((o) => o.docId);
        }

        // Build result message
        const fileSyncMsg = syncResult.fileSync
          ? ` Files: ${syncResult.fileSync.diskToDb.added.length} added, ${syncResult.fileSync.diskToDb.updated.length} updated, ${syncResult.fileSync.dbToDisk.written.length} written.`
          : "";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Sync completed. ${syncResult.brokenRefs} broken refs, ${syncResult.outdatedDocs} outdated docs.${fileSyncMsg}`,
                  ...syncResult,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_generate": {
        const {
          rootDir,
          autodocDir,
          preview,
          exclude,
          maxDepth,
          useLlm,
          incremental,
          module: moduleFilter,
          language: langParam,
        } = AutoDocGenerateSchema.parse(args);
        const nodePath = await import("node:path");
        const { execSync } = await import("node:child_process");

        // Use provided rootDir or current directory
        const targetDir = normalizeInputPath(rootDir || "") || process.cwd();

        // Find git repo root for .autodoc/ (falls back to targetDir)
        let repoRoot = targetDir;
        try {
          repoRoot = execSync("git rev-parse --show-toplevel", {
            cwd: targetDir,
            encoding: "utf-8",
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
        } catch {
          // Not a git repo, use targetDir
        }

        const targetAutodocDir = autodocDir
          ? normalizeInputPath(autodocDir) || autodocDir
          : nodePath.join(repoRoot, ".autodoc");

        // Detect language if auto
        let docLanguage: "auto" | "en" | "ru" | "zh" = langParam || "auto";
        if (docLanguage === "auto") {
          try {
            const adm = await getAutoDocManager();
            docLanguage = adm.getConfig()?.language || "en";
          } catch {
            docLanguage = "en"; // Default to English
          }
        }

        // Import generator and general docs handler
        const { generateDocs } = await import("./autodoc/generator/doc-generator.js");
        const { ensureGeneralDocs } = await import("./autodoc/generator/general-docs.js");

        // Ensure .autodoc/ exists with template files (creates only if missing)
        ensureGeneralDocs(targetAutodocDir);

        // Generate module docs only (NOT .autodoc/ files - those are user-maintained)
        const result = await generateDocs({
          rootDir: targetDir,
          exclude,
          maxDepth,
        });

        // Filter by module name if specified
        if (moduleFilter) {
          const filterLower = moduleFilter.toLowerCase();
          result.modules = result.modules.filter(
            (m) => m.name.toLowerCase() === filterLower || m.name.toLowerCase().includes(filterLower),
          );
          result.files = result.files.filter((f) => result.modules.some((m) => f.path.includes(m.path)));
        }

        // Detect and use LLM if requested
        let llmStatus = "not_requested";
        if (useLlm && result.modules.length > 0) {
          const { detectLLMProviders, batchGenerateDocs } = await import("./autodoc/llm/index.js");
          const { recommended } = await detectLLMProviders();

          if (recommended) {
            // Get selected model name if available (for Ollama)
            const modelName = (recommended as any).selectedModel || recommended.name;
            llmStatus = `using_${recommended.name}:${modelName}`;
            logger.info(
              "AUTODOC",
              `Using LLM: ${recommended.name} (${modelName}) for ${result.modules.length} module(s), lang=${docLanguage}`,
              {},
              requestId,
            );

            // Enhance documentation with LLM
            try {
              const enhancedDocs = await batchGenerateDocs(recommended, result.modules, {
                concurrency: 1, // Sequential for single module, safer
                language: docLanguage,
                onProgress: (completed, total) => {
                  logger.debug("AUTODOC", `LLM progress: ${completed}/${total}`, {}, requestId);
                },
              });

              // Update result files with LLM-generated content
              for (const file of result.files) {
                const enhanced = enhancedDocs.get(file.path.replace(/AUTODOC\.md$/, "").replace(/[\\/]$/, ""));
                if (enhanced) {
                  file.content = enhanced;
                }
              }
            } catch (error) {
              logger.warn("AUTODOC", `LLM generation failed: ${(error as Error).message}`, {}, requestId);
              llmStatus = `error_${recommended.name}`;
            }
          } else {
            llmStatus = "no_provider_available";
            logger.warn("AUTODOC", "No LLM provider available. Install Ollama or configure TGI/OpenAI.", {}, requestId);
          }
        }

        // If not preview, write files (with incremental update support)
        let filesWritten = 0;
        const incrementalChanges: Array<{ path: string; changes: string[] }> = [];

        if (!preview) {
          const adm = await getAutoDocManager();

          if (incremental) {
            // Use incremental updater to preserve existing content
            const { updateModuleDoc } = await import("./autodoc/generator/incremental-updater.js");

            for (const file of result.files) {
              try {
                // Get module path from doc path
                const modulePath = file.path.replace(/[\\/]AUTODOC\.md$/, "");

                const updateResult = await updateModuleDoc(modulePath, file.path, file.content, {
                  useLlm,
                });

                if (updateResult.updated && updateResult.newContent) {
                  // Save updated content
                  await adm.saveDocument(file.path, updateResult.newContent, {
                    autoGenerated: true,
                  });
                  await writeDocumentToDisk(file.path, updateResult.newContent);
                  filesWritten++;

                  incrementalChanges.push({
                    path: file.path,
                    changes: updateResult.changes.map((c) => c.description),
                  });
                }
              } catch (error) {
                logger.warn(
                  "AUTODOC",
                  `Incremental update failed for ${file.path}: ${(error as Error).message}`,
                  {},
                  requestId,
                );
                // Fall back to full overwrite
                try {
                  await adm.saveDocument(file.path, file.content, { autoGenerated: true });
                  await writeDocumentToDisk(file.path, file.content);
                  filesWritten++;
                } catch (innerError) {
                  logger.warn(
                    "AUTODOC",
                    `Failed to write ${file.path}: ${(innerError as Error).message}`,
                    {},
                    requestId,
                  );
                }
              }
            }
          } else {
            // Full overwrite mode (incremental=false)
            for (const file of result.files) {
              try {
                await adm.saveDocument(file.path, file.content, {
                  autoGenerated: true,
                });
                await writeDocumentToDisk(file.path, file.content);
                filesWritten++;
              } catch (error) {
                logger.warn("AUTODOC", `Failed to write ${file.path}: ${(error as Error).message}`, {}, requestId);
              }
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  preview,
                  useLlm,
                  llmStatus,
                  incremental,
                  language: docLanguage,
                  modulesFound: result.modules.length,
                  filesToGenerate: result.files.length,
                  filesWritten,
                  incrementalChanges: incremental ? incrementalChanges : undefined,
                  modules: result.modules.map((m) => ({
                    name: m.name,
                    path: m.path,
                    files: m.files.length,
                    exports: m.exports.slice(0, 5),
                  })),
                  files: result.files.map((f) => ({
                    path: f.path,
                    type: f.type,
                    preview: preview ? f.content.slice(0, 200) + "..." : undefined,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_changelog": {
        const { since, limit, branch } = AutoDocChangelogSchema.parse(args);
        const adm = await getAutoDocManager();

        // Get changelog entries
        const changelog = await adm.getChangelog({ since, limit, branch });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  entriesCount: changelog.length,
                  entries: changelog.map((entry: any) => ({
                    id: entry.id,
                    timestamp: entry.timestamp,
                    date: new Date(entry.timestamp).toISOString(),
                    branch: entry.branch,
                    summary: entry.summary,
                    changesCount: entry.changes?.length || 0,
                    impactedDocsCount: entry.impactedDocs?.length || 0,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_install_hooks": {
        const { action } = AutoDocInstallHooksSchema.parse(args);
        const { installPreCommitHook, uninstallHooks, getHookStatus } = await import(
          "./autodoc/hooks/hook-installer.js"
        );

        const projectPath = directory;

        if (action === "status") {
          const status = await getHookStatus(projectPath);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    gitRepo: status.gitRepo,
                    hooksDir: status.hooksDir,
                    preCommitInstalled: status.preCommit,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (action === "uninstall") {
          const result = await uninstallHooks(projectPath);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: result.success,
                    removed: result.installed,
                    skipped: result.skipped,
                    errors: result.errors,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Default: install
        const result = await installPreCommitHook(projectPath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  installed: result.installed,
                  skipped: result.skipped,
                  errors: result.errors,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "autodoc_detect_language": {
        const { scope, sampleSize } = AutoDocDetectLanguageSchema.parse(args);
        const { detectLanguageFromText, aggregateLanguageDetection } = await import(
          "./autodoc/i18n/language-detector.js"
        );

        type DetectionResult = ReturnType<typeof detectLanguageFromText>;
        const results: DetectionResult[] = [];

        // Analyze code comments
        if (scope === "comments" || scope === "all") {
          const graphStorage = await getGraphStorage();
          const allEntities = await graphStorage.getAllEntities();
          const entities = allEntities.slice(0, sampleSize * 2);

          let analyzed = 0;
          for (const entity of entities) {
            if (analyzed >= sampleSize) break;
            if (entity.metadata?.["comments"]) {
              const commentsText = Array.isArray(entity.metadata["comments"])
                ? entity.metadata["comments"].join("\n")
                : String(entity.metadata["comments"]);
              const result = detectLanguageFromText(commentsText);
              if (result.confidence > 0) {
                results.push(result);
                analyzed++;
              }
            }
          }
        }

        // Analyze existing docs
        if (scope === "docs" || scope === "all") {
          const adm = await getAutoDocManager();
          const allDocs = await adm.searchDocsByText("", sampleSize);

          for (const doc of allDocs) {
            const result = detectLanguageFromText(doc.content);
            if (result.confidence > 0) {
              results.push(result);
            }
          }
        }

        // Aggregate results
        const aggregated = aggregateLanguageDetection(results);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  detectedLanguage: aggregated.language,
                  confidence: Math.round(aggregated.confidence * 100) / 100,
                  samplesAnalyzed: results.length,
                  charCounts: aggregated.charCounts,
                  recommendation:
                    aggregated.confidence > 0.5
                      ? `Use language: ${aggregated.language}`
                      : "Low confidence - defaulting to 'en'",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      default: {
        // Try ToolRegistry fallback for handlers not in switch (tracing tools, etc.)
        if (toolRegistry.has(name)) {
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
            normalizeInputPath,
            withTimeout,
          };

          const handler = toolRegistry.getHandler(name, toolContext);
          return await handler.handle(args);
        }

        throw new Error(`Unknown tool: ${name}`);
      }
    }
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
