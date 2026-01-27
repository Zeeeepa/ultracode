/**
 * Worker Logging
 *
 * File-based logging for worker processes.
 * Writes directly to log file (bypasses main process).
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Get worker ID from environment
export const WORKER_ID = process.env["PARSING_WORKER_ID"] || "unknown";

// Ensure logs directory exists early
try {
  const logsDir = join(process.env["APPDATA"] || join(homedir(), "AppData", "Local"), "UltraScriptTools", "logs");
  mkdirSync(logsDir, { recursive: true });
} catch {}

/**
 * Get local date string for log file (YYYY-MM-DD in local time, not UTC)
 */
export function getLocalDateForLog(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

/**
 * Log file path for current worker
 */
export const WORKER_LOG_FILE = join(
  process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local"),
  "UltraScriptTools",
  "logs",
  `worker-${getLocalDateForLog()}.log`,
);

/** Worker ID getter (for modules that need it) */
let workerIdGetter: () => string = () => WORKER_ID;

/**
 * Set custom worker ID getter
 */
export function setWorkerIdGetter(getter: () => string): void {
  workerIdGetter = getter;
}

/**
 * Write log entry to worker log file
 */
export function workerLog(level: string, message: string, data?: unknown): void {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mins = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const timestamp = `${localTime.toISOString().slice(0, -1)}${sign}${hours}:${mins}`;

  const id = workerIdGetter();
  const parts = [`[${timestamp}]`, `[${level}]`, `[WORKER:${id}]`, message];
  if (data) {
    parts.push(`DATA: ${JSON.stringify(data)}`);
  }
  const line = parts.join(" ") + "\n";

  try {
    appendFileSync(WORKER_LOG_FILE, line);
  } catch {
    // Ignore write errors in worker
  }
}
