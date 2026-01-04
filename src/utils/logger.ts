/**
 * Rotated Debug Logger for MCP Server Activity
 *
 * Provides comprehensive logging with rotation for all MCP server activities
 * Stores logs in logs_llm folder with automatic rotation based on size and time
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LoggerConfig } from "./logger-types.js";
import { LogLevel } from "./logger-types.js";
// Event-driven architecture: buffer flush triggered by size threshold, not polling

// =============================================================================
// LOGGING CONFIGURATION
// =============================================================================

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
  stackTrace?: string | undefined;
  requestId?: string | undefined;
  duration?: number;
}

// Import centralized configuration
import { LOGGING_CONFIG } from "../config/logging-config.js";

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = LOGGING_CONFIG;

// =============================================================================
// LOGGER CLASS
// =============================================================================

export class RotatedLogger {
  private config: LoggerConfig;
  private currentLogFile: string;
  private logDir: string;

  // Buffered async logging to reduce CPU usage
  // Event-driven: flush triggered by BUFFER_SIZE threshold or time elapsed
  private logBuffer: string[] = [];
  private readonly BUFFER_SIZE = 50; // Flush every 50 entries
  private readonly FLUSH_INTERVAL_MS = 500; // Flush every 500ms (lazy, no setTimeout)
  private lastFlushTime: number = Date.now();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = resolve(this.config.logDir);
    this.ensureLogDirectory();
    this.currentLogFile = this.getCurrentLogFile();
    // Event-driven: flush is triggered by buffer size threshold in writeLog()
  }

  /**
   * Synchronously flush buffer to disk (for shutdown/crash scenarios)
   * Uses appendFileSync to guarantee data is written before process exit
   */
  private flushBufferSync(): void {
    if (this.logBuffer.length === 0) return;

    // Check if we need to rotate
    if (this.shouldRotate()) {
      this.rotateLogFile();
      this.currentLogFile = this.getCurrentLogFile();
    }

    // Take all buffered entries and clear buffer
    const entries = this.logBuffer.join("");
    this.logBuffer = [];
    this.lastFlushTime = Date.now(); // Update flush time

    // Write synchronously - BLOCKS until written to disk
    try {
      appendFileSync(this.currentLogFile, entries, "utf8");
    } catch (error) {
      console.error("Failed to write log (sync):", error);
    }
  }

  /**
   * Final flush on shutdown (for cleanup)
   */
  stopFlushLoop(): void {
    // Flush any remaining entries SYNCHRONOUSLY
    this.flushBufferSync();
  }

  /**
   * Public method to force flush buffer to disk
   * Call this after critical operations to ensure logs are visible
   */
  flush(): void {
    this.flushBufferSync();
  }

  /**
   * Register process exit handlers to flush logs
   * Call this once during initialization
   */
  registerExitHandlers(): void {
    const flushAndExit = () => {
      this.flushBufferSync();
    };
    process.on("exit", flushAndExit);
    process.on("SIGINT", flushAndExit);
    process.on("SIGTERM", flushAndExit);
    process.on("uncaughtException", (err) => {
      this.error("PROCESS", "Uncaught exception", { error: err.message, stack: err.stack });
      this.flushBufferSync();
    });
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getCurrentLogFile(): string {
    const now = new Date();
    // Use local date for log file name (not UTC)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    return join(this.logDir, `mcp-server-${dateStr}.log`);
  }

  private shouldRotate(): boolean {
    if (!this.config.enableRotation || !existsSync(this.currentLogFile)) {
      return false;
    }

    const stats = statSync(this.currentLogFile);
    return stats.size >= this.config.maxFileSize;
  }

  private rotateLogFile(): void {
    if (!existsSync(this.currentLogFile)) return;

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const rotatedFile = this.currentLogFile.replace(".log", `-${timestamp}.log`);

    try {
      renameSync(this.currentLogFile, rotatedFile);
      this.cleanupOldLogs();
    } catch (error) {
      console.error("Failed to rotate log file:", error);
    }
  }

  private cleanupOldLogs(): void {
    try {
      const files = readdirSync(this.logDir)
        .filter((f) => f.startsWith("mcp-server-") && f.endsWith(".log"))
        .map((f) => ({
          name: f,
          path: join(this.logDir, f),
          mtime: statSync(join(this.logDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the most recent files
      const filesToDelete = files.slice(this.config.maxFiles);
      for (const file of filesToDelete) {
        try {
          unlinkSync(file.path);
        } catch (error) {
          console.error(`Failed to delete old log file ${file.name}:`, error);
        }
      }
    } catch (error) {
      console.error("Failed to cleanup old logs:", error);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.config.enableTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    parts.push(`[${LogLevel[entry.level]}]`);
    parts.push(`[${entry.category}]`);

    if (entry.requestId) {
      parts.push(`[${entry.requestId}]`);
    }

    parts.push(entry.message);

    if (entry.data) {
      parts.push(`DATA: ${JSON.stringify(entry.data, null, 2)}`);
    }

    if (entry.duration !== undefined) {
      parts.push(`DURATION: ${entry.duration}ms`);
    }

    if (entry.stackTrace && this.config.enableStackTrace) {
      parts.push(`STACK: ${entry.stackTrace}`);
    }

    return `${parts.join(" ")}\n`;
  }

  private writeLog(entry: LogEntry): void {
    if (entry.level < this.config.logLevel) {
      return; // Skip logs below configured level
    }

    // Add to buffer instead of writing immediately
    const logLine = this.formatLogEntry(entry);
    this.logBuffer.push(logLine);

    // Flush if buffer is full OR time interval exceeded (lazy, no setTimeout)
    const now = Date.now();
    const timeExceeded = now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS;
    if (this.logBuffer.length >= this.BUFFER_SIZE || timeExceeded) {
      this.flushBuffer();
      this.lastFlushTime = now;
    }
  }

  /**
   * Async flush buffer to disk (non-blocking)
   * Uses appendFile for better Bun compatibility
   */
  private flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    // Check if we need to rotate
    if (this.shouldRotate()) {
      this.rotateLogFile();
      this.currentLogFile = this.getCurrentLogFile();
    }

    // Take all buffered entries and clear buffer
    const entries = this.logBuffer.join("");
    this.logBuffer = [];
    this.lastFlushTime = Date.now(); // Update flush time

    // Write async - fire and forget
    appendFile(this.currentLogFile, entries).catch((error) => {
      console.error("Failed to write log:", error);
    });
  }

  // =============================================================================
  // PUBLIC LOGGING METHODS
  // =============================================================================

  /**
   * TRACE level - for startup timing and async flow analysis
   * Uses sync flush to ensure visibility before crashes
   */
  trace(category: string, message: string, data?: unknown, requestId?: string): void {
    this.log(LogLevel.TRACE, category, message, data, requestId);
    // Sync flush for crash debugging - ensures trace is visible
    this.flushBufferSync();
  }

  /**
   * TRACE with timing - logs with delta from a start time
   */
  traceTime(category: string, message: string, startTime: number, data?: unknown): void {
    const elapsed = Date.now() - startTime;
    const uptimeMs = process.uptime() * 1000;
    this.log(LogLevel.TRACE, category, `[+${uptimeMs.toFixed(0)}ms] ${message} (${elapsed}ms)`, data);
  }

  /**
   * Start a trace timer, returns a function to end it
   */
  traceStart(category: string, operation: string): () => void {
    const startTime = Date.now();
    const uptimeMs = process.uptime() * 1000;
    this.log(LogLevel.TRACE, category, `[+${uptimeMs.toFixed(0)}ms] ▶ START: ${operation}`);
    return () => {
      const elapsed = Date.now() - startTime;
      const endUptimeMs = process.uptime() * 1000;
      this.log(LogLevel.TRACE, category, `[+${endUptimeMs.toFixed(0)}ms] ◀ END: ${operation} (${elapsed}ms)`);
    };
  }

  debug(category: string, message: string, data?: unknown, requestId?: string): void {
    this.log(LogLevel.DEBUG, category, message, data, requestId);
  }

  info(category: string, message: string, data?: unknown, requestId?: string): void {
    this.log(LogLevel.INFO, category, message, data, requestId);
  }

  warn(category: string, message: string, data?: unknown, requestId?: string): void {
    this.log(LogLevel.WARN, category, message, data, requestId);
  }

  error(category: string, message: string, data?: unknown, requestId?: string | undefined, error?: Error): void {
    const stackTrace = error?.stack || (this.config.enableStackTrace ? new Error().stack : undefined);
    this.log(LogLevel.ERROR, category, message, data, requestId, stackTrace);
  }

  critical(category: string, message: string, data?: unknown, requestId?: string | undefined, error?: Error): void {
    const stackTrace = error?.stack || (this.config.enableStackTrace ? new Error().stack : undefined);
    this.log(LogLevel.CRITICAL, category, message, data, requestId, stackTrace);
  }

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: unknown,
    requestId?: string | undefined,
    stackTrace?: string | undefined,
  ): void {
    const entry: LogEntry = {
      timestamp: this.getLocalTimestamp(),
      level,
      category,
      message,
      data,
      stackTrace,
      requestId,
    };

    this.writeLog(entry);
  }

  /**
   * Get timestamp in local timezone (ISO-like format)
   * Example: 2025-12-27T22:51:38.090+03:00
   */
  private getLocalTimestamp(): string {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    const localTime = new Date(now.getTime() - offsetMs);
    const iso = localTime.toISOString().slice(0, -1); // Remove 'Z'

    // Format offset as +HH:MM or -HH:MM
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMin);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    const mins = String(absOffset % 60).padStart(2, "0");

    return `${iso}${sign}${hours}:${mins}`;
  }

  // =============================================================================
  // MCP-SPECIFIC LOGGING METHODS
  // =============================================================================

  mcpRequest(method: string, params: unknown, requestId: string): void {
    this.info("MCP_REQUEST", `Incoming MCP request: ${method}`, { method, params }, requestId);
  }

  mcpResponse(method: string, result: unknown, duration: number, requestId: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: "MCP_RESPONSE",
      message: `MCP response: ${method}`,
      data: { method, result },
      requestId,
      duration,
    };
    this.writeLog(entry);
  }

  mcpError(method: string, error: Error, requestId: string): void {
    this.error("MCP_ERROR", `MCP request failed: ${method}`, { method, error: error.message }, requestId, error);
  }

  agentActivity(agentId: string, activity: string, data?: Record<string, unknown>, requestId?: string): void {
    this.debug("AGENT_ACTIVITY", `Agent ${agentId}: ${activity}`, { agentId, ...data }, requestId);
  }

  parseActivity(filePath: string, language: string, entitiesFound: number, duration: number, requestId?: string): void {
    this.info(
      "PARSE_ACTIVITY",
      `Parsed ${filePath}`,
      {
        filePath,
        language,
        entitiesFound,
        duration,
      },
      requestId,
    );
  }

  queryActivity(query: string, results: number, duration: number, requestId?: string): void {
    this.info(
      "QUERY_ACTIVITY",
      `Query executed`,
      {
        query: query.substring(0, 200), // Truncate long queries
        results,
        duration,
      },
      requestId,
    );
  }

  performanceMetrics(component: string, metrics: unknown, requestId?: string): void {
    this.debug("PERFORMANCE", `Performance metrics for ${component}`, metrics, requestId);
  }

  systemEvent(event: string, data?: unknown): void {
    this.info("SYSTEM", event, data);
  }

  // =============================================================================
  // INCIDENT/RECOVERY LOGGING (for SYSTEM_HANG_RECOVERY_PLAN)
  // =============================================================================

  incident(event: string, data?: Record<string, unknown>, requestId?: string | undefined, error?: Error): void {
    if (error) {
      this.error("INCIDENT", event, { ...data, error: error.message }, requestId, error);
    } else {
      this.warn("INCIDENT", event, data, requestId);
    }
  }

  recovery(event: string, data?: unknown, requestId?: string): void {
    this.info("RECOVERY", event, data, requestId);
  }
}

// =============================================================================
// SINGLETON LOGGER INSTANCE
// =============================================================================

export const logger = new RotatedLogger();

// Register exit handlers to ensure logs are flushed on shutdown
logger.registerExitHandlers();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function logMCPOperation<T>(
  operation: string,
  fn: (requestId: string) => Promise<T>,
  params?: unknown,
): Promise<T> {
  const requestId = createRequestId();
  const startTime = Date.now();

  logger.mcpRequest(operation, params, requestId);

  return fn(requestId)
    .then((result) => {
      const duration = Date.now() - startTime;
      logger.mcpResponse(operation, result, duration, requestId);
      return result;
    })
    .catch((error) => {
      logger.mcpError(operation, error, requestId);
      throw error;
    });
}

// =============================================================================
// MEMORY PROFILING
// =============================================================================

/**
 * Detailed memory profiling for diagnosing memory issues.
 * Logs RSS, heap, external (native), and array buffers separately.
 */
export function logMemoryProfile(label: string): void {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heapTotal = Math.round(mem.heapTotal / 1024 / 1024);
  const heapUsed = Math.round(mem.heapUsed / 1024 / 1024);
  const external = Math.round(mem.external / 1024 / 1024);
  const arrayBuffers = Math.round(mem.arrayBuffers / 1024 / 1024);

  // Calculate native memory (RSS - heap - external approximation)
  const nativeApprox = rss - heapTotal - external;

  logger.info("MEMORY_PROFILE", label, {
    rssMB: rss,
    heapTotalMB: heapTotal,
    heapUsedMB: heapUsed,
    externalMB: external, // C++ objects bound to JS (libsql, faiss bindings)
    arrayBuffersMB: arrayBuffers, // ArrayBuffer/SharedArrayBuffer
    nativeApproxMB: nativeApprox, // Rough estimate of other native memory
  });
}

/**
 * Force garbage collection if available (node --expose-gc or bun).
 * Returns true if GC was triggered.
 */
export function forceGC(): boolean {
  if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
    return true;
  }
  // Bun has Bun.gc()
  if (typeof (globalThis as any).Bun?.gc === "function") {
    (globalThis as any).Bun.gc(true); // true = sync
    return true;
  }
  return false;
}

// Re-export types for backward compatibility
export type { LoggerConfig } from "./logger-types.js";
export { LogLevel } from "./logger-types.js";
