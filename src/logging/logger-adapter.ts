/**
 * Adapter for compatibility with old RotatedLogger API
 * Allows gradual migration from old logger to new fixed-position logger
 */

import { type FixedLogger, getLogger, initLogger } from "./fixed-logger.js";
import type { FixedLoggerConfig, KVPairs, ModuleName } from "./log-types.js";
import { MODULES } from "./log-types.js";

/** Old category to new module mapping */
const CATEGORY_TO_MODULE: Record<string, ModuleName> = {
  // MCP categories
  MCP_REQUEST: MODULES.MCP_REQUEST,
  MCP_RESPONSE: MODULES.MCP_RESPONSE,
  MCP_ERROR: MODULES.MCP_ERROR,

  // Activity categories
  AGENT_ACTIVITY: MODULES.AGENT,
  PARSE_ACTIVITY: MODULES.PARSER,
  QUERY_ACTIVITY: MODULES.QUERY,

  // System categories
  SYSTEM: MODULES.SYSTEM,
  STARTUP: MODULES.STARTUP,
  ASYNC: MODULES.ASYNC,
  STORAGE: MODULES.STORAGE,
  EMBEDDING: MODULES.EMBEDDING,
  INDEXING: MODULES.INDEXER,
  AGENT: MODULES.AGENT,
  PERFORMANCE: MODULES.PERF,
  INCIDENT: MODULES.INCIDENT,
  RECOVERY: MODULES.RECOVERY,

  // Worker categories
  WORKER: MODULES.WORKER,
  FAISS: MODULES.FAISS,

  // AutoDoc
  AUTODOC: MODULES.AUTODOC,

  // Progress
  PROGRESS: MODULES.PROGRESS,
};

/**
 * Map old category to new module
 */
function mapCategory(category: string): string {
  return CATEGORY_TO_MODULE[category] || category.slice(0, 20);
}

/**
 * Extract event from message
 * Tries to find a short identifier in the message
 */
function extractEvent(message: string): string {
  // Check for common patterns
  const patterns = [
    /^(\w+):/, // "pattern: rest"
    /^(\w+)\s*\(/, // "operation(...)"
    /^(\w+ing)\s/, // "Processing ..."
    /^(\w+ed)\s/, // "Completed ..."
    /^▶\s*(\w+)/, // "▶ operation"
    /^◀\s*(\w+)/, // "◀ operation"
    /^\[(\w+)\]/, // "[operation]"
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase().slice(0, 20);
    }
  }

  // Fallback: use first word(s)
  const words = message.split(/\s+/);
  const firstWord = words[0];
  if (firstWord) {
    return (
      firstWord
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20) || "log"
    );
  }
  return "log";
}

/**
 * Convert data object to KV pairs
 */
function dataToKV(data: unknown, requestId?: string): KVPairs {
  const kv: KVPairs = {};

  if (requestId) {
    kv["req"] = requestId;
  }

  if (data === null || data === undefined) {
    return kv;
  }

  if (typeof data !== "object") {
    kv["data"] = String(data);
    return kv;
  }

  // Flatten object to KV pairs
  const obj = data as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    const normalizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 16);

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      kv[normalizedKey] = value;
    } else if (Array.isArray(value)) {
      kv[normalizedKey] = value.length;
      kv[`${normalizedKey}_type`] = "array";
    } else if (typeof value === "object") {
      // Skip nested objects or stringify
      kv[normalizedKey] = JSON.stringify(value).slice(0, 64);
    }
  }

  return kv;
}

/**
 * Logger adapter that mimics old RotatedLogger API
 */
export class LoggerAdapter {
  private logger: FixedLogger;

  constructor(config?: Partial<FixedLoggerConfig>) {
    this.logger = config ? initLogger(config) : getLogger();
  }

  // ============================================
  // Old API compatibility methods
  // ============================================

  trace(category: string, message: string, data?: unknown, requestId?: string): void {
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    this.logger.t(module, event, kv);
  }

  debug(category: string, message: string, data?: unknown, requestId?: string): void {
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    this.logger.d(module, event, kv);
  }

  info(category: string, message: string, data?: unknown, requestId?: string): void {
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    this.logger.i(module, event, kv);
  }

  warn(category: string, message: string, data?: unknown, requestId?: string): void {
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    this.logger.w(module, event, kv);
  }

  error(category: string, message: string, data?: unknown, requestId?: string, error?: Error): void {
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    if (error) {
      kv["err"] = error.message.slice(0, 64);
    }
    this.logger.e(module, event, kv);
  }

  critical(category: string, message: string, data?: unknown, requestId?: string, error?: Error): void {
    // Critical maps to Error with extra flag
    const module = mapCategory(category);
    const event = extractEvent(message);
    const kv = dataToKV(data, requestId);
    kv["msg"] = message.slice(0, 64);
    kv["critical"] = true;
    if (error) {
      kv["err"] = error.message.slice(0, 64);
    }
    this.logger.e(module, event, kv);
  }

  // ============================================
  // MCP-specific methods (old API)
  // ============================================

  mcpRequest(method: string, params: unknown, requestId: string): void {
    this.logger.i(MODULES.MCP_REQUEST, "request", {
      method,
      req: requestId,
      params: typeof params === "object" ? Object.keys(params as object).length : 0,
    });
  }

  mcpResponse(method: string, duration: number, requestId: string): void {
    this.logger.i(MODULES.MCP_RESPONSE, "response", {
      method,
      req: requestId,
      dur: duration,
    });
  }

  mcpError(method: string, error: Error, requestId: string): void {
    this.logger.e(MODULES.MCP_ERROR, "error", {
      method,
      req: requestId,
      err: error.message.slice(0, 64),
    });
  }

  agentActivity(agentName: string, activity: string, data?: unknown): void {
    const kv = dataToKV(data);
    kv["agent"] = agentName;
    this.logger.i(MODULES.AGENT, activity.slice(0, 20), kv);
  }

  parseActivity(activity: string, data?: unknown): void {
    const kv = dataToKV(data);
    this.logger.i(MODULES.PARSER, activity.slice(0, 20), kv);
  }

  queryActivity(activity: string, data?: unknown): void {
    const kv = dataToKV(data);
    this.logger.i(MODULES.QUERY, activity.slice(0, 20), kv);
  }

  incident(activity: string, data?: unknown): void {
    const kv = dataToKV(data);
    this.logger.e(MODULES.INCIDENT, activity.slice(0, 20), kv);
  }

  recovery(activity: string, data?: unknown): void {
    const kv = dataToKV(data);
    this.logger.i(MODULES.RECOVERY, activity.slice(0, 20), kv);
  }

  // ============================================
  // Lifecycle methods
  // ============================================

  flush(): void {
    this.logger.flush();
  }

  stopFlushLoop(): void {
    this.logger.close();
  }

  // ============================================
  // Direct access to new logger
  // ============================================

  get fixed(): FixedLogger {
    return this.logger;
  }
}

/**
 * Create adapter instance
 */
export function createLoggerAdapter(config?: Partial<FixedLoggerConfig>): LoggerAdapter {
  return new LoggerAdapter(config);
}
