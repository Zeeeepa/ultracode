/**
 * Runtime detection utilities
 *
 * Detects whether running under Bun or Node.js
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCoreLockPath, getCorePidPath } from "./storage-paths.js";

// =============================================================================
// Runtime Detection
// =============================================================================

export type Runtime = "bun" | "node";

// Cache detected runtime
let cachedRuntime: Runtime | null = null;

/**
 * Detect the current runtime
 */
export function detectRuntime(): Runtime {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  // Method 1: Check globalThis.Bun
  if (typeof globalThis !== "undefined" && "Bun" in globalThis) {
    cachedRuntime = "bun";
    console.error(`[Runtime] Detected: bun (via globalThis.Bun)`);
    return "bun";
  }

  // Method 2: Check process.versions.bun
  if (process.versions && "bun" in process.versions) {
    cachedRuntime = "bun";
    console.error(`[Runtime] Detected: bun (via process.versions.bun)`);
    return "bun";
  }

  // Method 3: Check process.execPath contains "bun"
  if (process.execPath?.toLowerCase().includes("bun")) {
    cachedRuntime = "bun";
    console.error(`[Runtime] Detected: bun (via execPath: ${process.execPath})`);
    return "bun";
  }

  // Method 4: Check if Bun global functions exist
  if (
    typeof globalThis.Bun !== "undefined" &&
    "version" in globalThis.Bun &&
    typeof globalThis.Bun["version"] === "string"
  ) {
    cachedRuntime = "bun";
    console.error(`[Runtime] Detected: bun (via Bun.version)`);
    return "bun";
  }

  cachedRuntime = "node";
  console.error(`[Runtime] Detected: node (execPath: ${process.execPath})`);
  return "node";
}

/**
 * Get the executable path for the current runtime
 */
export function getRuntimeExecutable(): string {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    // Use full path from process.execPath if available
    if (process.execPath?.toLowerCase().includes("bun")) {
      return process.execPath;
    }
    // Fallback to "bun" command
    return "bun";
  }

  return process.execPath;
}

// =============================================================================
// Core Process Management
// =============================================================================

/**
 * Get the path to the Core entry point
 */
export function getCoreEntryPath(): string {
  // Get the directory of this file
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Core is at ../core/index.js relative to shared/
  return join(currentDir, "..", "core", "index.js");
}

/**
 * Check if Core process is running
 */
export function isCoreRunning(): boolean {
  const pidPath = getCorePidPath();

  if (!existsSync(pidPath)) {
    return false;
  }

  try {
    const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);

    if (Number.isNaN(pid)) {
      return false;
    }

    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running or no permission
    return false;
  }
}

// =============================================================================
// Lock File Management
// =============================================================================

/**
 * Acquire a lock file (for Core process singleton)
 */
export function acquireLock(): boolean {
  const lockPath = getCoreLockPath();

  try {
    // Try to create lock file exclusively
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      // Lock file exists, check if process is alive
      try {
        const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
        process.kill(pid, 0);
        return false; // Process is alive
      } catch {
        // Process is dead, take over lock
        writeFileSync(lockPath, String(process.pid));
        return true;
      }
    }
    throw error;
  }
}

/**
 * Release the lock file
 */
export function releaseLock(): void {
  const lockPath = getCoreLockPath();
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore
  }
}
