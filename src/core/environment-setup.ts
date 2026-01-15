/**
 * Environment Setup
 *
 * Console override and safe environment creation for MCP server.
 * Extracted from index.ts for better modularity.
 *
 * IMPORTANT: This module should be imported BEFORE any other imports
 * to ensure console is properly configured for quiet mode.
 */

// =============================================================================
// CONSOLE OVERRIDE
// =============================================================================

/**
 * Override console methods for quiet mode (prevents JSON-RPC corruption in --pipe mode)
 * Call this BEFORE any other imports.
 */
export function setupConsoleOverride(): void {
  const isBun = typeof globalThis.Bun !== "undefined";
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
}

// =============================================================================
// QUIET MODE DETECTION
// =============================================================================

/**
 * Check for --pipe flag and set MCP_QUIET_MODE environment variable.
 * Call this BEFORE any imports.
 */
export function checkQuietMode(): void {
  if (process.argv.includes("--pipe")) {
    process.env["MCP_QUIET_MODE"] = "true";
  }
}

// =============================================================================
// SAFE ENVIRONMENT
// =============================================================================

/**
 * Create safe environment with defaults for embedding models.
 * Prevents "env is not defined" errors in embedding generators.
 */
export function createSafeEnvironment(): Record<string, string | undefined> {
  const safeEnv = {
    ...process.env,
    // Ensure these are defined to prevent "env is not defined" errors
    NODE_ENV: process.env["NODE_ENV"] || "development",
    MCP_EMBEDDING_ENABLED: process.env["MCP_EMBEDDING_ENABLED"] || "true",
    MCP_EMBEDDING_PROVIDER: process.env["MCP_EMBEDDING_PROVIDER"] || "transformers",
    MCP_EMBEDDING_FALLBACK: process.env["MCP_EMBEDDING_FALLBACK"] || "true",
  };

  // Make env globally available for embedding models
  globalThis.env = safeEnv;
  return safeEnv;
}

// =============================================================================
// VERSION INFO
// =============================================================================

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface VersionInfo {
  name: string;
  version: string;
  description: string;
  homepage: string;
  repository: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  error?: string;
}

/**
 * Get version information from package.json
 */
export function getVersionInfo(importMetaUrl: string): VersionInfo {
  try {
    // Get the directory of the current file
    const currentFilePath = fileURLToPath(importMetaUrl);
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

// =============================================================================
// PATH UTILITIES
// =============================================================================

import { homedir } from "node:os";

/**
 * Expand ~ to home directory
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}
