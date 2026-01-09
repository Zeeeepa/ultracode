/**
 * Query parser for ulog CLI
 * Parses command line arguments into filter structure
 */

import type { LogLevelChar, ParsedLogLine } from "../../logging/log-types.js";
import { LOG_LEVEL_VALUES } from "../../logging/log-types.js";
import { parseTimeRange, type TimeRange } from "./time-parser.js";

/**
 * KV filter operation
 */
export type KVFilterOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

/**
 * KV filter
 */
export interface KVFilter {
  key: string;
  op: KVFilterOp;
  value: string | number;
}

/**
 * Query filter structure
 */
export interface LogQueryFilter {
  timeRange: TimeRange;
  levels: LogLevelChar[];
  modules: string[];
  events: string[];
  kvFilters: KVFilter[];
  pid?: number;
  requestId?: string;
  limit: number;
  offset: number;
}

/**
 * Output options
 */
export interface OutputOptions {
  format: "raw" | "table" | "json" | "csv";
  countOnly: boolean;
  stats: boolean;
  follow: boolean;
  noColor: boolean;
  fields: string[];
  embeddings: boolean;
  logType: "main" | "worker" | "all";
}

/**
 * Parse level filter string
 * @example parseLevels('E,W') -> ['E', 'W']
 */
export function parseLevels(input: string): LogLevelChar[] {
  const levels: LogLevelChar[] = [];
  const parts = input.toUpperCase().split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed in LOG_LEVEL_VALUES) {
      levels.push(trimmed as LogLevelChar);
    }
  }

  return levels;
}

/**
 * Parse module/event filter (glob pattern)
 * @example parsePattern('MCP_*') -> regex /^MCP_.*$/
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Parse KV filter string
 * @example parseKVFilter('dur>100') -> { key: 'dur', op: '>', value: 100 }
 */
export function parseKVFilter(input: string): KVFilter | null {
  const match = input.match(/^([a-z][a-z0-9_]*)(>=|<=|!=|>|<|=|~)(.+)$/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  const key = match[1].toLowerCase();
  const op = match[2] as KVFilterOp;
  const rawValue = match[3];

  // Parse numeric values (including with ms suffix)
  let value: string | number;
  if (/^\d+ms$/.test(rawValue)) {
    value = parseInt(rawValue.slice(0, -2), 10);
  } else if (/^\d+s$/.test(rawValue)) {
    value = parseInt(rawValue.slice(0, -1), 10) * 1000;
  } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    value = parseFloat(rawValue);
  } else {
    value = rawValue;
  }

  return { key, op, value };
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): {
  filter: LogQueryFilter;
  output: OutputOptions;
  files: string[];
} {
  const filter: LogQueryFilter = {
    timeRange: { from: null, to: null },
    levels: [],
    modules: [],
    events: [],
    kvFilters: [],
    limit: 1000,
    offset: 0,
  };

  const output: OutputOptions = {
    format: "raw",
    countOnly: false,
    stats: false,
    follow: false,
    noColor: false,
    fields: [],
    embeddings: false,
    logType: "main",
  };

  const files: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "-l":
      case "--level": {
        i++;
        const levelArg = args[i];
        if (levelArg) filter.levels = parseLevels(levelArg);
        break;
      }

      case "-m":
      case "--module": {
        i++;
        const moduleArg = args[i];
        if (moduleArg) filter.modules.push(moduleArg);
        break;
      }

      case "-e":
      case "--event": {
        i++;
        const eventArg = args[i];
        if (eventArg) filter.events.push(eventArg);
        break;
      }

      case "-t":
      case "--time": {
        i++;
        const timeArg = args[i];
        if (timeArg) filter.timeRange = parseTimeRange(timeArg);
        break;
      }

      case "--from": {
        i++;
        const fromArg = args[i];
        if (fromArg) {
          filter.timeRange = parseTimeRange(fromArg, filter.timeRange.to?.toISOString());
        }
        break;
      }

      case "--to": {
        i++;
        const toArg = args[i];
        if (toArg) {
          const range = parseTimeRange(filter.timeRange.from?.toISOString(), toArg);
          filter.timeRange.to = range.to;
        }
        break;
      }

      case "-k":
      case "--kv": {
        i++;
        const kvArg = args[i];
        if (kvArg) {
          const kvFilter = parseKVFilter(kvArg);
          if (kvFilter) filter.kvFilters.push(kvFilter);
        }
        break;
      }

      case "--pid": {
        i++;
        const pidArg = args[i];
        if (pidArg) filter.pid = parseInt(pidArg, 10);
        break;
      }

      case "--req": {
        i++;
        const reqArg = args[i];
        if (reqArg) filter.requestId = reqArg;
        break;
      }

      case "-n":
      case "--limit": {
        i++;
        const limitArg = args[i];
        if (limitArg) filter.limit = parseInt(limitArg, 10);
        break;
      }

      case "--offset": {
        i++;
        const offsetArg = args[i];
        if (offsetArg) filter.offset = parseInt(offsetArg, 10);
        break;
      }

      case "-o":
      case "--output": {
        i++;
        const outputArg = args[i];
        if (outputArg && ["raw", "table", "json", "csv"].includes(outputArg)) {
          output.format = outputArg as OutputOptions["format"];
        }
        break;
      }

      case "-c":
      case "--count":
        output.countOnly = true;
        break;

      case "--stats":
        output.stats = true;
        break;

      case "--emb":
      case "--embeddings":
        output.embeddings = true;
        break;

      case "-f":
      case "--follow":
        output.follow = true;
        break;

      case "--no-color":
        output.noColor = true;
        break;

      case "-w":
      case "--worker":
        output.logType = "worker";
        break;

      case "-a":
      case "--all":
        output.logType = "all";
        break;

      case "--fields": {
        i++;
        const fieldsArg = args[i];
        if (fieldsArg) output.fields = fieldsArg.split(",").map((f) => f.trim());
        break;
      }

      case "-h":
      case "--help":
        // Will be handled by CLI
        break;

      default:
        // Assume it's a file path
        if (arg && !arg.startsWith("-")) {
          files.push(arg);
        }
    }

    i++;
  }

  return { filter, output, files };
}

/**
 * Check if log entry matches filter
 */
export function matchesFilter(entry: ParsedLogLine, filter: LogQueryFilter): boolean {
  // Time range
  if (filter.timeRange.from && entry.timestamp < filter.timeRange.from) {
    return false;
  }
  if (filter.timeRange.to && entry.timestamp > filter.timeRange.to) {
    return false;
  }

  // Levels
  if (filter.levels.length > 0 && !filter.levels.includes(entry.level)) {
    return false;
  }

  // Modules (glob)
  if (filter.modules.length > 0) {
    const matches = filter.modules.some((pattern) => {
      const regex = patternToRegex(pattern);
      return regex.test(entry.module);
    });
    if (!matches) return false;
  }

  // Events (glob)
  if (filter.events.length > 0) {
    const matches = filter.events.some((pattern) => {
      const regex = patternToRegex(pattern);
      return regex.test(entry.event);
    });
    if (!matches) return false;
  }

  // PID
  if (filter.pid !== undefined && entry.pid !== filter.pid) {
    return false;
  }

  // Request ID
  if (filter.requestId !== undefined && entry.kv["req"] !== filter.requestId) {
    return false;
  }

  // KV filters
  for (const kvFilter of filter.kvFilters) {
    const value = entry.kv[kvFilter.key];
    if (value === undefined) return false;

    switch (kvFilter.op) {
      case "=":
        if (value !== kvFilter.value && String(value) !== String(kvFilter.value)) return false;
        break;
      case "!=":
        if (value === kvFilter.value || String(value) === String(kvFilter.value)) return false;
        break;
      case ">":
        if (typeof value !== "number" || value <= (kvFilter.value as number)) return false;
        break;
      case "<":
        if (typeof value !== "number" || value >= (kvFilter.value as number)) return false;
        break;
      case ">=":
        if (typeof value !== "number" || value < (kvFilter.value as number)) return false;
        break;
      case "<=":
        if (typeof value !== "number" || value > (kvFilter.value as number)) return false;
        break;
      case "~":
        // Regex match
        try {
          const regex = new RegExp(String(kvFilter.value), "i");
          if (!regex.test(String(value))) return false;
        } catch {
          return false;
        }
        break;
    }
  }

  return true;
}
