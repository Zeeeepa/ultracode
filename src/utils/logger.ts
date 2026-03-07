import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LoggerConfig } from "./logger-types.js";
import { LogLevel, LogLevelName } from "./logger-types.js";

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

import { LOGGING_CONFIG } from "../config/logging-config.js";

const DEFAULT_CONFIG: LoggerConfig = LOGGING_CONFIG;

export class RotatedLogger {
  private config: LoggerConfig;
  private currentLogFile: string;
  private logDir: string;
  private buf: string[] = [];
  private readonly BUF_CAP = 50;
  private readonly STALE_MS = 500;
  private lastDrain: number = Date.now();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = resolve(this.config.logDir);
    this.ensureDir();
    this.currentLogFile = this.logFilePath();
  }

  private flushSync(): void {
    if (this.buf.length === 0) return;
    if (this.shouldRotate()) {
      this.rotate();
      this.currentLogFile = this.logFilePath();
    }
    const batch = this.buf.join("");
    this.buf.length = 0;
    this.lastDrain = Date.now();
    try {
      appendFileSync(this.currentLogFile, batch, "utf8");
    } catch (err) {
      console.error("Failed to write log (sync):", err);
    }
  }

  private flushAsync(): void {
    if (this.buf.length === 0) return;
    if (this.shouldRotate()) {
      this.rotate();
      this.currentLogFile = this.logFilePath();
    }
    const batch = this.buf.join("");
    this.buf.length = 0;
    this.lastDrain = Date.now();
    appendFile(this.currentLogFile, batch).catch((err) => {
      console.error("Failed to write log:", err);
    });
  }

  stopFlushLoop(): void {
    this.flushSync();
  }

  flush(): void {
    this.flushSync();
  }

  registerExitHandlers(): void {
    const onExit = () => this.flushSync();
    process.on("exit", onExit);
    process.on("SIGINT", onExit);
    process.on("SIGTERM", onExit);
    process.on("uncaughtException", (err) => {
      this.error("PROCESS", "Uncaught exception", { error: err.message, stack: err.stack });
      this.flushSync();
    });
  }

  private ensureDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private logFilePath(): string {
    const datePart = new Date().toLocaleDateString("sv");
    return join(this.logDir, `mcp-server-${datePart}.log`);
  }

  private shouldRotate(): boolean {
    if (!this.config.enableRotation) return false;
    if (!existsSync(this.currentLogFile)) return false;
    return statSync(this.currentLogFile).size >= this.config.maxFileSize;
  }

  private rotate(): void {
    if (!existsSync(this.currentLogFile)) return;
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    const archived = this.currentLogFile.replace(".log", `-${suffix}.log`);
    try {
      renameSync(this.currentLogFile, archived);
      this.pruneOld();
    } catch (err) {
      console.error("Failed to rotate log file:", err);
    }
  }

  private pruneOld(): void {
    try {
      const files = readdirSync(this.logDir)
        .filter((n) => n.startsWith("mcp-server-") && n.endsWith(".log"))
        .map((n) => {
          const p = join(this.logDir, n);
          return { name: n, path: p, mtime: statSync(p).mtime };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      for (let i = this.config.maxFiles; i < files.length; i++) {
        try {
          unlinkSync(files[i]!.path);
        } catch (err) {
          console.error(`Failed to delete old log file ${files[i]!.name}:`, err);
        }
      }
    } catch (err) {
      console.error("Failed to cleanup old logs:", err);
    }
  }

  private format(entry: LogEntry): string {
    const ts = this.config.enableTimestamp ? `[${entry.timestamp}] ` : "";
    const lvl = `[${LogLevelName[entry.level] ?? "UNKNOWN"}]`;
    const cat = `[${entry.category}]`;
    const rid = entry.requestId ? ` [${entry.requestId}]` : "";
    const data = entry.data !== undefined && entry.data !== null ? ` DATA: ${JSON.stringify(entry.data, null, 2)}` : "";
    const dur = entry.duration !== undefined ? ` DURATION: ${entry.duration}ms` : "";
    const stack = entry.stackTrace && this.config.enableStackTrace ? ` STACK: ${entry.stackTrace}` : "";
    return `${ts}${lvl} ${cat}${rid} ${entry.message}${data}${dur}${stack}\n`;
  }

  private writeLog(entry: LogEntry): void {
    if (entry.level < this.config.logLevel) return;
    this.buf.push(this.format(entry));
    const now = Date.now();
    if (this.buf.length >= this.BUF_CAP || now - this.lastDrain >= this.STALE_MS) {
      this.flushAsync();
      this.lastDrain = now;
    }
  }

  trace(category: string, message: string, data?: unknown, requestId?: string): void {
    this.log(LogLevel.TRACE, category, message, data, requestId);
  }

  traceTime(category: string, message: string, startTime: number, data?: unknown): void {
    const delta = Date.now() - startTime;
    const up = process.uptime() * 1000;
    this.log(LogLevel.TRACE, category, `[+${up.toFixed(0)}ms] ${message} (${delta}ms)`, data);
  }

  traceStart(category: string, operation: string): () => void {
    const t0 = Date.now();
    const up = process.uptime() * 1000;
    this.log(LogLevel.TRACE, category, `[+${up.toFixed(0)}ms] ▶ START: ${operation}`);
    return () => {
      const elapsed = Date.now() - t0;
      const endUp = process.uptime() * 1000;
      this.log(LogLevel.TRACE, category, `[+${endUp.toFixed(0)}ms] ◀ END: ${operation} (${elapsed}ms)`);
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
    this.writeLog({
      timestamp: this.localIso(),
      level,
      category,
      message,
      data,
      stackTrace,
      requestId,
    });
  }

  private localIso(): string {
    const now = new Date();
    const tzOff = now.getTimezoneOffset();
    const adjusted = new Date(now.getTime() - tzOff * 60000);
    const base = adjusted.toISOString().slice(0, -1);
    const total = -tzOff;
    const sign = total >= 0 ? "+" : "-";
    const abs = Math.abs(total);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${base}${sign}${hh}:${mm}`;
  }

  mcpRequest(method: string, params: unknown, requestId: string): void {
    this.info("MCP_REQUEST", `Incoming MCP request: ${method}`, { method, params }, requestId);
  }

  mcpResponse(method: string, result: unknown, duration: number, requestId: string): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category: "MCP_RESPONSE",
      message: `MCP response: ${method}`,
      data: { method, result },
      requestId,
      duration,
    });
  }

  mcpError(method: string, error: Error, requestId: string): void {
    this.error("MCP_ERROR", `MCP request failed: ${method}`, { method, error: error.message }, requestId, error);
  }

  agentActivity(agentId: string, activity: string, data?: Record<string, unknown>, requestId?: string): void {
    this.debug("AGENT_ACTIVITY", `Agent ${agentId}: ${activity}`, { agentId, ...data }, requestId);
  }

  parseActivity(filePath: string, language: string, entitiesFound: number, duration: number, requestId?: string): void {
    this.info("PARSE_ACTIVITY", `Parsed ${filePath}`, { filePath, language, entitiesFound, duration }, requestId);
  }

  queryActivity(query: string, results: number, duration: number, requestId?: string): void {
    this.info("QUERY_ACTIVITY", `Query executed`, { query: query.substring(0, 200), results, duration }, requestId);
  }

  performanceMetrics(component: string, metrics: unknown, requestId?: string): void {
    this.debug("PERFORMANCE", `Performance metrics for ${component}`, metrics, requestId);
  }

  systemEvent(event: string, data?: unknown): void {
    this.info("SYSTEM", event, data);
  }

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

export const logger = new RotatedLogger();
logger.registerExitHandlers();

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
      logger.mcpResponse(operation, result, Date.now() - startTime, requestId);
      return result;
    })
    .catch((error) => {
      logger.mcpError(operation, error, requestId);
      throw error;
    });
}

export function logMemoryProfile(label: string): void {
  const mem = process.memoryUsage();
  const toMB = (b: number) => Math.round(b / 1048576);
  const rss = toMB(mem.rss);
  const heapTotal = toMB(mem.heapTotal);
  const heapUsed = toMB(mem.heapUsed);
  const external = toMB(mem.external);
  const arrayBuffers = toMB(mem.arrayBuffers);
  const nativeApprox = rss - heapTotal - external;
  logger.info("MEMORY_PROFILE", label, {
    rssMB: rss,
    heapTotalMB: heapTotal,
    heapUsedMB: heapUsed,
    externalMB: external,
    arrayBuffersMB: arrayBuffers,
    nativeApproxMB: nativeApprox,
  });
}

export function forceGC(): boolean {
  const g = globalThis as { gc?: () => void; Bun?: { gc?: (force?: boolean) => void } };
  if (typeof g.gc === "function") {
    g.gc();
    return true;
  }
  if (g.Bun && typeof g.Bun.gc === "function") {
    g.Bun.gc(true);
    return true;
  }
  return false;
}

export {
  getLogger as getFixedLogger,
  initLogger as initFixedLogger,
  type KVPairs,
  type LogLevelChar,
  log,
  MODULES,
  setProjectHash,
} from "../logging/index.js";
export type { LoggerConfig } from "./logger-types.js";
export { LogLevel } from "./logger-types.js";

import { getLogger, initLogger, type LogLevelChar } from "../logging/index.js";
import { getConfigDir, getLogsDir } from "../shared/storage-paths.js";

/** Parsed log-config.json */
interface LogConfig {
  minLevel?: LogLevelChar;
  teiBatchDump?: boolean;
}

let logConfig: LogConfig = {};

/**
 * Load log-config.json from config directory.
 * File format: { "minLevel": "D", "teiBatchDump": true }
 */
function loadLogConfig(): LogConfig {
  try {
    const configPath = join(getConfigDir(), "log-config.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const cfg: LogConfig = {};
    if (parsed?.minLevel && "TDIWE".includes(parsed.minLevel)) {
      cfg.minLevel = parsed.minLevel as LogLevelChar;
    }
    if (typeof parsed?.teiBatchDump === "boolean") {
      cfg.teiBatchDump = parsed.teiBatchDump;
    }
    return cfg;
  } catch {
    return {};
  }
}

/** Check if TEI batch dumping is enabled via log-config.json */
export function isTeiBatchDumpEnabled(): boolean {
  return logConfig.teiBatchDump === true;
}

export function initNewLogger(): void {
  logConfig = loadLogConfig();
  initLogger({ logDir: getLogsDir(), minLevel: logConfig.minLevel ?? "I", consoleOutput: false });
}

export function setLoggerProject(projectHash: string): void {
  getLogger().setProjectHash(projectHash);
}
