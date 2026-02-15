/**
 * Roslyn Addon Lifecycle Manager — singleton pattern for C# parsing via Roslyn.
 *
 * Pattern: GPU client (lazy init, non-blocking startup, graceful shutdown).
 * Requirement: .sln/.slnx MUST exist in project root for C# parsing to activate.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../logging/index.js";
import { CSharpNativeParser } from "./csharp-native-parser.js";
import { RoslynAddonClient } from "./roslyn-client.js";

// ============================================================================
// Singleton State
// ============================================================================

let roslynClient: RoslynAddonClient | null = null;
let csharpParser: CSharpNativeParser | null = null;
let startPromise: Promise<CSharpNativeParser | null> | null = null;

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
  const candidates = [
    // Built alongside ultrascript dist
    join(dirname(new URL(import.meta.url).pathname), "..", "roslyn-addon", ADDON_DLL_NAME),
    // External libs
    join(process.cwd(), "external-libs", "roslyn-addon", ADDON_DLL_NAME),
  ];

  for (const candidate of candidates) {
    // Normalize Windows paths (remove leading / from /D:/...)
    const normalized = process.platform === "win32" && candidate.startsWith("/") ? candidate.slice(1) : candidate;
    if (existsSync(normalized)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Lifecycle
// ============================================================================

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
 */
export async function ensureRoslynStarted(slnPath: string): Promise<CSharpNativeParser | null> {
  // Return existing parser if already initialized
  if (csharpParser?.isAvailable) {
    return csharpParser;
  }

  // Deduplicate concurrent start calls
  if (startPromise) {
    return startPromise;
  }

  startPromise = doStart(slnPath);
  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function doStart(slnPath: string): Promise<CSharpNativeParser | null> {
  // Check DLL availability
  if (!isRoslynAvailable()) {
    log.w("ROSLYN", "addon_not_available", { hint: "Ultrasharp.Addon.dll not found" });
    return null;
  }

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
