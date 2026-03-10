/**
 * Fixed-position log format types
 * Format: YYYYMMDD-HHmmss.mmm L PPPPP HHHHHHHH PPPPPPPP MODULE_______________ EVENT________________ key=value...
 *                                              ^^^^^^^^ project hash (8 chars)
 */

/** Log level single character */
export type LogLevelChar = "E" | "W" | "I" | "D" | "T";

/** Log level numeric values for filtering */
export const LOG_LEVEL_VALUES: Record<LogLevelChar, number> = {
  T: 0, // Trace
  D: 1, // Debug
  I: 2, // Info
  W: 3, // Warn
  E: 4, // Error
};

/** Log level names for display */
export const LOG_LEVEL_NAMES: Record<LogLevelChar, string> = {
  T: "TRACE",
  D: "DEBUG",
  I: "INFO",
  W: "WARN",
  E: "ERROR",
};

/** Field positions in log line (0-indexed) */
export const LOG_FIELD_POSITIONS = {
  TIMESTAMP_START: 0,
  TIMESTAMP_END: 18, // 19 chars: YYYYMMDD-HHmmss.mmm
  LEVEL: 20, // 1 char: E/W/I/D/T
  PID_START: 22,
  PID_END: 26, // 5 chars: 00000-99999
  HASH_START: 28,
  HASH_END: 35, // 8 chars: git hash
  PROJ_START: 37,
  PROJ_END: 44, // 8 chars: project hash
  MODULE_START: 46,
  MODULE_END: 65, // 20 chars: module name
  EVENT_START: 67,
  EVENT_END: 94, // 28 chars: event name
  KV_START: 96, // variable: key=value pairs
} as const;

/** Field lengths */
export const LOG_FIELD_LENGTHS = {
  TIMESTAMP: 19,
  LEVEL: 1,
  PID: 5,
  HASH: 8,
  PROJ: 8,
  MODULE: 20,
  EVENT: 28,
} as const;

/** KV pair constraints */
export const KV_CONSTRAINTS = {
  MAX_KEY_LENGTH: 20,
  MAX_VALUE_LENGTH: 512,
  MAX_TOTAL_LENGTH: 2048,
} as const;

/** Primitive value types allowed in KV pairs */
export type KVValue = string | number | boolean | null | undefined;

/** KV pairs record - values can be primitives, arrays, or objects (serialized to JSON) */
export type KVPairs = Record<string, KVValue | unknown[] | Record<string, unknown>>;

/** Standard KV keys */
export const STANDARD_KEYS = {
  /** Duration in milliseconds */
  dur: "dur",
  /** Request ID */
  req: "req",
  /** Error message */
  err: "err",
  /** File path */
  file: "file",
  /** Count */
  cnt: "cnt",
  /** Success flag */
  ok: "ok",
  /** Operation name */
  op: "op",
  /** Retry number */
  retry: "retry",
  /** Memory in MB */
  mem: "mem",
} as const;

/** Log entry structure */
export interface LogEntry {
  timestamp: Date;
  level: LogLevelChar;
  pid: number;
  buildHash: string;
  projectHash: string;
  module: string;
  event: string;
  kv: KVPairs;
}

/** Parsed log line (from file) */
export interface ParsedLogLine extends LogEntry {
  raw: string;
  lineNumber: number;
}

/** Logger configuration */
export interface FixedLoggerConfig {
  /** Log directory path */
  logDir: string;
  /** Minimum log level to output */
  minLevel: LogLevelChar;
  /** Max file size before rotation (bytes) */
  maxFileSize: number;
  /** Max number of rotated files to keep */
  maxFiles: number;
  /** Max total size of all log files (bytes). Older files deleted to stay under limit. 0 = unlimited */
  maxTotalSize: number;
  /** Buffer size before flush */
  bufferSize: number;
  /** Buffer flush interval (ms) */
  flushInterval: number;
  /** Include console output */
  consoleOutput: boolean;
}

/** Default logger config */
export const DEFAULT_LOGGER_CONFIG: FixedLoggerConfig = {
  logDir: "", // Will be set from environment
  minLevel: "I",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 20,
  maxTotalSize: 100 * 1024 * 1024, // 100MB total limit
  bufferSize: 50,
  flushInterval: 500,
  consoleOutput: false,
};

/** Module name constants */
export const MODULES = {
  MCP_REQUEST: "MCP_REQUEST",
  MCP_RESPONSE: "MCP_RESPONSE",
  MCP_ERROR: "MCP_ERROR",
  PARSER: "PARSER",
  AGENT: "AGENT",
  QUERY: "QUERY",
  INDEXER: "INDEXER",
  EMBEDDING: "EMBEDDING",
  STORAGE: "STORAGE",
  PERF: "PERF",
  WORKER: "WORKER",
  FAISS: "FAISS",
  SYSTEM: "SYSTEM",
  STARTUP: "STARTUP",
  ASYNC: "ASYNC",
  INCIDENT: "INCIDENT",
  RECOVERY: "RECOVERY",
  AUTODOC: "AUTODOC",
  PROGRESS: "PROGRESS",
} as const;

export type ModuleName = (typeof MODULES)[keyof typeof MODULES];
