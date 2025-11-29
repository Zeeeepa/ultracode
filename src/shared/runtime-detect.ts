/**
 * Runtime detection and Core process spawning utilities
 *
 * Detects whether running under Bun or Node.js and spawns Core accordingly
 */

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCoreLockPath, getCorePidPath, getIPCSocketPath, initializeStorageDirs } from "./storage-paths.js";

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
  if (typeof (globalThis as any).Bun?.version === "string") {
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

/**
 * Try to connect to an existing Core process
 */
export async function tryConnectToCore(timeout = 5000): Promise<Socket | null> {
  const socketPath = getIPCSocketPath();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, timeout);

    const socket = createConnection(socketPath, () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Spawn the Core process
 */
export function spawnCoreProcess(): ChildProcess {
  initializeStorageDirs();

  const runtime = detectRuntime();
  const executable = getRuntimeExecutable();
  const coreEntry = getCoreEntryPath();

  console.error(`[Runtime] Current runtime: ${runtime}`);
  console.error(`[Runtime] Executable: ${executable}`);
  console.error(`[Runtime] Core entry: ${coreEntry}`);
  console.error(`[Runtime] Spawning Core process...`);

  // Clean up old socket if it exists (Unix only)
  const socketPath = getIPCSocketPath();
  if (process.platform !== "win32" && existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // Ignore
    }
  }

  const spawnOptions: SpawnOptions = {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ULTRASCRIPT_CORE: "1",
    },
  };

  const child = spawn(executable, [coreEntry], spawnOptions);

  // Allow parent to exit independently
  child.unref();

  // Save PID
  if (child.pid) {
    writeFileSync(getCorePidPath(), String(child.pid), "utf-8");
  }

  return child;
}

/**
 * Wait for Core to become available
 */
export async function waitForCore(maxAttempts = 50, intervalMs = 100): Promise<Socket> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const socket = await tryConnectToCore(1000);
    if (socket) {
      return socket;
    }
    await sleep(intervalMs);
  }

  throw new Error("Core process failed to start");
}

/**
 * Connect to Core, spawning it if necessary
 */
export async function connectToCore(): Promise<Socket> {
  // Try to connect to existing Core
  let socket = await tryConnectToCore();

  if (socket) {
    console.error("[Runtime] Connected to existing Core process");
    return socket;
  }

  // Check if PID file exists but process is dead
  if (existsSync(getCorePidPath())) {
    if (!isCoreRunning()) {
      console.error("[Runtime] Stale PID file found, cleaning up");
      try {
        unlinkSync(getCorePidPath());
      } catch {
        // Ignore
      }
    }
  }

  // Spawn new Core process
  console.error("[Runtime] No Core process found, spawning new one");
  spawnCoreProcess();

  // Wait for Core to be ready
  socket = await waitForCore();
  console.error("[Runtime] Connected to newly spawned Core process");

  return socket;
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire a lock file (for Core process singleton)
 */
export function acquireLock(): boolean {
  const lockPath = getCoreLockPath();

  try {
    // Try to create lock file exclusively
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch (error: any) {
    if (error.code === "EEXIST") {
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
