/**
 * Centralized Logging Configuration
 *
 * Provides configuration for the rotated logging system
 * Logs are stored in centralized AppData directory
 */

import { getLogsDir } from "../shared/storage-paths.js";
import { type LoggerConfig, LogLevel } from "../utils/logger-types.js";

export const LOGGING_CONFIG: LoggerConfig = {
  logDir: getLogsDir(),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 20,
  // TRACE level for startup/async flow analysis - change to DEBUG when done investigating
  logLevel: LogLevel.TRACE,
  enableRotation: true,
  enableTimestamp: true,
  enableStackTrace: true,
};

export const MCP_LOG_CATEGORIES = {
  SYSTEM: "SYSTEM",
  MCP_REQUEST: "MCP_REQUEST",
  MCP_RESPONSE: "MCP_RESPONSE",
  MCP_ERROR: "MCP_ERROR",
  AGENT_ACTIVITY: "AGENT_ACTIVITY",
  PARSE_ACTIVITY: "PARSE_ACTIVITY",
  QUERY_ACTIVITY: "QUERY_ACTIVITY",
  PERFORMANCE: "PERFORMANCE",
  INCIDENT: "INCIDENT",
  RECOVERY: "RECOVERY",
  // TRACE categories for startup analysis
  STARTUP: "STARTUP",
  ASYNC: "ASYNC",
  STORAGE: "STORAGE",
  EMBEDDING: "EMBEDDING",
  INDEXING: "INDEXING",
  AGENT: "AGENT",
} as const;

export type MCPLogCategory = (typeof MCP_LOG_CATEGORIES)[keyof typeof MCP_LOG_CATEGORIES];
