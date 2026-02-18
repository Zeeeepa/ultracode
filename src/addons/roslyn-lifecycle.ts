/**
 * Roslyn Addon Lifecycle Manager — singleton pattern for C# parsing via Roslyn.
 *
 * Pattern: GPU client (lazy init, non-blocking startup, graceful shutdown).
 * Requirement: .sln/.slnx MUST exist in project root for C# parsing to activate.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "../logging/index.js";
import { CSharpNativeParser } from "./csharp-native-parser.js";
import { RoslynAddonClient } from "./roslyn-client.js";

// ============================================================================
// Singleton State
// ============================================================================

let roslynClient: RoslynAddonClient | null = null;
let csharpParser: CSharpNativeParser | null = null;
let startPromise: Promise<CSharpNativeParser | null> | null = null;
let exitHandlerRegistered = false;

// ============================================================================
// Solution Discovery
// ============================================================================

/**
 * Find .sln or .slnx file in the root of a directory (non-recursive).
 * Priority: .sln > .slnx
 * Returns full path or null.
 */
export function findSolutionFile(directory: string): string | null {
  try {
    const entries = readdirSync(directory);
    // Priority: .sln first
    const sln = entries.find((e) => e.endsWith(".sln"));
    if (sln) return join(directory, sln);
    const slnx = entries.find((e) => e.endsWith(".slnx"));
    if (slnx) return join(directory, slnx);
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Addon Availability
// ============================================================================

const ADDON_DLL_NAME = "Ultrasharp.Addon.dll";

/**
 * Check if the Roslyn addon DLL is available on disk.
 */
export function isRoslynAvailable(): boolean {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Built alongside ultrascript dist
    join(thisDir, "..", "roslyn-addon", ADDON_DLL_NAME),
    // External libs
    join(process.cwd(), "external-libs", "roslyn-addon", ADDON_DLL_NAME),
    // Development: ultrasharp-tools-mcp build output
    join(process.cwd(), "..", "ultrasharp-tools-mcp", "Run.Publish", "Addon", ADDON_DLL_NAME),
    // Development: Droid/Addon bundled
    join(process.cwd(), "..", "ultrasharp-tools-mcp", "Run.Publish", "Droid", "Addon", ADDON_DLL_NAME),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      log.i("ROSLYN", "dll_found", { path: candidate });
      return true;
    }
  }

  log.w("ROSLYN", "dll_not_found", { searched: candidates });
  return false;
}

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Register process exit handler to clean up Roslyn addon.
 * Called once on first startup.
 */
function registerExitHandler(): void {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;

  const cleanup = () => {
    if (roslynClient) {
      log.i("ROSLYN", "exit_cleanup");
      try {
        // Synchronous cleanup on process exit — just kill the child process
        roslynClient.shutdown().catch(() => {});
      } catch {
        // Best effort
      }
      roslynClient = null;
      csharpParser = null;
    }
  };

  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

/**
 * Get or create the RoslynAddonClient singleton.
 */
export function getRoslynClient(options?: { slnPath?: string }): RoslynAddonClient {
  if (!roslynClient) {
    roslynClient = new RoslynAddonClient({
      slnPath: options?.slnPath,
    });
  }
  return roslynClient;
}

/**
 * Ensure Roslyn addon is started and ready for C# parsing.
 * Returns CSharpNativeParser instance or null if unavailable.
 *
 * - Requires slnPath (won't start without solution file)
 * - Lazy singleton: subsequent calls return cached instance
 * - Non-blocking: Phase 2 (solution loading) runs in background
 * - Protected against concurrent/re-entrant calls via startPromise guard
 */
export async function ensureRoslynStarted(slnPath: string): Promise<CSharpNativeParser | null> {
  // Return existing parser if already initialized and connected
  if (csharpParser?.isAvailable) {
    return csharpParser;
  }

  // Deduplicate concurrent start calls — but DON'T clear startPromise in finally
  // so that rapid concurrent callers all get the same result
  if (startPromise) {
    return startPromise;
  }

  startPromise = doStart(slnPath);
  const result = await startPromise;

  // Only clear startPromise if startup failed, so we can retry.
  // On success, keep it to avoid re-starting.
  if (!result) {
    startPromise = null;
  }

  return result;
}

async function doStart(slnPath: string): Promise<CSharpNativeParser | null> {
  // Check DLL availability
  if (!isRoslynAvailable()) {
    log.w("ROSLYN", "addon_not_available", { hint: "Ultrasharp.Addon.dll not found" });
    return null;
  }

  // Register exit handler to kill dotnet process on parent exit
  registerExitHandler();

  try {
    const client = getRoslynClient({ slnPath });
    const started = await client.start();

    if (!started) {
      log.w("ROSLYN", "addon_start_returned_false", { sln: slnPath });
      return null;
    }

    // Wrap in CSharpNativeParser
    csharpParser = new CSharpNativeParser(client);
    log.i("ROSLYN", "parser_ready", { sln: slnPath, phase: client.phase });
    return csharpParser;
  } catch (error) {
    log.e("ROSLYN", "start_error", { sln: slnPath, err: (error as Error).message });
    return null;
  }
}

/**
 * Get the current CSharpNativeParser singleton (if started).
 * Returns null if addon hasn't been started or isn't available.
 */
export function getCSharpParser(): CSharpNativeParser | null {
  return csharpParser?.isAvailable ? csharpParser : null;
}

/**
 * Graceful shutdown of the Roslyn addon.
 */
export async function shutdownRoslynClient(): Promise<void> {
  if (roslynClient) {
    log.i("ROSLYN", "shutdown_start");
    try {
      await roslynClient.shutdown();
    } catch (error) {
      log.e("ROSLYN", "shutdown_error", { err: (error as Error).message });
    }
    roslynClient = null;
    csharpParser = null;
    startPromise = null;
    log.i("ROSLYN", "shutdown_ok");
  }
}
