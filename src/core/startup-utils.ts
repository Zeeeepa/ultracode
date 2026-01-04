/**
 * Startup Utilities
 *
 * Timer tracking and logging utilities for startup diagnostics.
 * Extracted from index.ts for better modularity.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { detectRuntime } from "../shared/runtime-detect.js";
import { getLogsDir } from "../shared/storage-paths.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// RUNTIME-AWARE SLEEP
// =============================================================================

const currentRuntime = detectRuntime();

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
export async function sleep(ms: number): Promise<void> {
  if (currentRuntime === "bun" && typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// TIMESTAMP UTILITIES
// =============================================================================

/**
 * Get local timestamp with timezone (e.g., 2026-01-01T03:45:30.123+04:00)
 */
export function getLocalTimestamp(): string {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mins = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return `${localTime.toISOString().slice(0, -1)}${sign}${hours}:${mins}`;
}

/**
 * Get local date string for log file names (YYYY-MM-DD in local time)
 */
export function getLocalDateString(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

/**
 * Write message to log file
 */
export function writeToLogFile(message: string): void {
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

// =============================================================================
// STARTUP TIMER TRACKING
// =============================================================================

const startupTimers: Record<string, number> = {};
let processStartTime = Date.now();

/**
 * Set the process start time (call once at startup)
 */
export function setProcessStartTime(time: number): void {
  processStartTime = time;
}

/**
 * Get the process start time
 */
export function getProcessStartTime(): number {
  return processStartTime;
}

/**
 * Start timing a startup phase
 */
export function startTimer(name: string): void {
  startupTimers[name] = Date.now();
  const uptimeMs = Date.now() - processStartTime;
  logger.trace("STARTUP", `[+${uptimeMs}ms] ▶ START: ${name}`);
}

/**
 * End timing a startup phase and log the elapsed time
 */
export function endTimer(name: string): number {
  const elapsed = Date.now() - (startupTimers[name] || Date.now());
  const uptimeMs = Date.now() - processStartTime;
  logger.trace("STARTUP", `[+${uptimeMs}ms] ◀ END: ${name} (${elapsed}ms)`);
  console.error(`[STARTUP] ${name}: ${elapsed}ms`);
  return elapsed;
}
