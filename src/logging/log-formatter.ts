/**
 * Log line formatter with fixed positions
 * Format: YYYYMMDD-HHmmss.mmm L PPPPP HHHHHHHH PPPPPPPP MODULE_______________ EVENT________________ kv...
 */

import { parseKV, serializeKV } from "./kv-serializer.js";
import {
  LOG_FIELD_LENGTHS,
  LOG_FIELD_POSITIONS,
  type LogEntry,
  type LogLevelChar,
  type ParsedLogLine,
} from "./log-types.js";

/**
 * Format timestamp as YYYYMMDD-HHmmss.mmm (19 chars)
 */
export function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${y}${m}${d}-${h}${min}${s}.${ms}`;
}

/**
 * Parse timestamp from YYYYMMDD-HHmmss.mmm format
 */
export function parseTimestamp(str: string): Date {
  // Format: YYYYMMDD-HHmmss.mmm
  const y = parseInt(str.slice(0, 4), 10);
  const m = parseInt(str.slice(4, 6), 10) - 1;
  const d = parseInt(str.slice(6, 8), 10);
  const h = parseInt(str.slice(9, 11), 10);
  const min = parseInt(str.slice(11, 13), 10);
  const s = parseInt(str.slice(13, 15), 10);
  const ms = parseInt(str.slice(16, 19), 10);
  return new Date(y, m, d, h, min, s, ms);
}

/**
 * Format PID with padding (5 chars)
 */
export function formatPid(pid: number): string {
  return String(pid).slice(-5).padStart(5, "0");
}

/**
 * Format build hash (8 chars)
 */
export function formatBuildHash(hash: string): string {
  return hash.slice(0, 8).padEnd(8, "0");
}

/**
 * Format project hash (8 chars)
 */
export function formatProjectHash(hash: string): string {
  return hash.slice(0, 8).padEnd(8, "-");
}

/**
 * Format module name (20 chars, pad right)
 */
export function formatModule(module: string): string {
  return module.slice(0, LOG_FIELD_LENGTHS.MODULE).padEnd(LOG_FIELD_LENGTHS.MODULE, " ");
}

/**
 * Format event name (20 chars, pad right)
 */
export function formatEvent(event: string): string {
  return event.slice(0, LOG_FIELD_LENGTHS.EVENT).padEnd(LOG_FIELD_LENGTHS.EVENT, " ");
}

/**
 * Format complete log line
 * @example
 * formatLogLine({
 *   timestamp: new Date(),
 *   level: 'I',
 *   pid: 12345,
 *   buildHash: 'a1b2c3d4',
 *   projectHash: 'abcd1234',
 *   module: 'MCP_REQUEST',
 *   event: 'tool_call',
 *   kv: { tool: 'semantic_search', dur: 45 }
 * })
 * // Returns: "20260106-153045.123 I 12345 a1b2c3d4 abcd1234 MCP_REQUEST          tool_call            tool=semantic_search dur=45"
 */
export function formatLogLine(entry: LogEntry): string {
  const ts = formatTimestamp(entry.timestamp);
  const pid = formatPid(entry.pid);
  const hash = formatBuildHash(entry.buildHash);
  const proj = formatProjectHash(entry.projectHash);
  const module = formatModule(entry.module);
  const event = formatEvent(entry.event);
  const kv = serializeKV(entry.kv);

  return `${ts} ${entry.level} ${pid} ${hash} ${proj} ${module} ${event} ${kv}`;
}

/**
 * Parse log line to entry
 */
export function parseLogLine(line: string, lineNumber: number = 0): ParsedLogLine | null {
  if (line.length < LOG_FIELD_POSITIONS.KV_START) {
    return null;
  }

  try {
    const timestamp = parseTimestamp(
      line.slice(LOG_FIELD_POSITIONS.TIMESTAMP_START, LOG_FIELD_POSITIONS.TIMESTAMP_END + 1),
    );
    const level = line[LOG_FIELD_POSITIONS.LEVEL] as LogLevelChar;
    const pid = parseInt(line.slice(LOG_FIELD_POSITIONS.PID_START, LOG_FIELD_POSITIONS.PID_END + 1), 10);
    const buildHash = line.slice(LOG_FIELD_POSITIONS.HASH_START, LOG_FIELD_POSITIONS.HASH_END + 1);
    const projectHash = line.slice(LOG_FIELD_POSITIONS.PROJ_START, LOG_FIELD_POSITIONS.PROJ_END + 1);
    const module = line.slice(LOG_FIELD_POSITIONS.MODULE_START, LOG_FIELD_POSITIONS.MODULE_END + 1).trim();
    const event = line.slice(LOG_FIELD_POSITIONS.EVENT_START, LOG_FIELD_POSITIONS.EVENT_END + 1).trim();
    const kvString = line.slice(LOG_FIELD_POSITIONS.KV_START);
    const kv = parseKV(kvString);

    return {
      timestamp,
      level,
      pid,
      buildHash,
      projectHash,
      module,
      event,
      kv,
      raw: line,
      lineNumber,
    };
  } catch {
    return null;
  }
}

/**
 * Format log line for console with colors
 */
export function formatLogLineColored(entry: LogEntry): string {
  const ts = formatTimestamp(entry.timestamp);
  const pid = formatPid(entry.pid);
  const hash = formatBuildHash(entry.buildHash);
  const proj = formatProjectHash(entry.projectHash);
  const module = formatModule(entry.module);
  const event = formatEvent(entry.event);
  const kv = serializeKV(entry.kv);

  // ANSI colors
  const colors: Record<LogLevelChar, string> = {
    E: "\x1b[31m", // Red
    W: "\x1b[33m", // Yellow
    I: "\x1b[32m", // Green
    D: "\x1b[36m", // Cyan
    T: "\x1b[90m", // Gray
  };
  const reset = "\x1b[0m";
  const dim = "\x1b[2m";
  const cyan = "\x1b[36m";

  const levelColor = colors[entry.level] || "";

  return `${dim}${ts}${reset} ${levelColor}${entry.level}${reset} ${dim}${pid} ${hash}${reset} ${cyan}${proj}${reset} ${levelColor}${module}${reset} ${event} ${kv}`;
}

/**
 * Extract specific fields from log line for display
 */
export function extractFields(entry: ParsedLogLine, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    switch (field) {
      case "ts":
      case "timestamp":
        result["timestamp"] = entry.timestamp.toISOString();
        break;
      case "level":
        result["level"] = entry.level;
        break;
      case "pid":
        result["pid"] = entry.pid;
        break;
      case "hash":
        result["hash"] = entry.buildHash;
        break;
      case "proj":
      case "project":
        result["project"] = entry.projectHash;
        break;
      case "module":
        result["module"] = entry.module;
        break;
      case "event":
        result["event"] = entry.event;
        break;
      default:
        // Try to get from KV
        if (entry.kv[field] !== undefined) {
          result[field] = entry.kv[field];
        }
    }
  }

  return result;
}
