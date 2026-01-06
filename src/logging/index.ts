/**
 * Fixed-position logging system
 *
 * Format: YYYYMMDD-HHmmss.mmm L PPPPP HHHHHHHH MODULE_______________ EVENT________________ kv...
 *
 * @example
 * // Direct usage
 * import { log } from './logging/index.js';
 * log.i('PARSER', 'file_parsed', { file: '/src/index.ts', dur: 45 });
 * log.e('INDEXER', 'batch_fail', { err: 'timeout', retry: 2 });
 *
 * @example
 * // With operation tracking
 * import { log } from './logging/index.js';
 * const start = log.opStart('INDEXER', 'fullScan', { files: 150 });
 * // ... do work ...
 * log.opEnd('INDEXER', 'fullScan', start, true, { indexed: 150 });
 *
 * @example
 * // Async operation wrapper
 * await log.op('PARSER', 'parse_file', async () => {
 *   return parseFile(path);
 * }, { file: path });
 *
 * @example
 * // Migration: use adapter for old API compatibility
 * import { createLoggerAdapter } from './logging/index.js';
 * const logger = createLoggerAdapter();
 * logger.info('CATEGORY', 'message', { data });  // Old API
 * logger.fixed.i('MODULE', 'event', { kv });     // New API
 */

// Build Info
export {
  getBuildHash,
  getBuildInfo,
  getPid,
  resetBuildInfo,
  setPid,
} from "./build-info.js";
// Logger
export {
  FixedLogger,
  getLogger,
  initLogger,
  log,
  setProjectHash,
} from "./fixed-logger.js";
// KV Serialization
export {
  formatDuration,
  formatMemory,
  kvError,
  kvOpEnd,
  kvOpStart,
  parseKV,
  serializeKV,
} from "./kv-serializer.js";
// Formatting
export {
  extractFields,
  formatBuildHash,
  formatEvent,
  formatLogLine,
  formatLogLineColored,
  formatModule,
  formatPid,
  formatTimestamp,
  parseLogLine,
  parseTimestamp,
} from "./log-formatter.js";
// Types
export {
  DEFAULT_LOGGER_CONFIG,
  type FixedLoggerConfig,
  KV_CONSTRAINTS,
  type KVPairs,
  type KVValue,
  LOG_FIELD_LENGTHS,
  LOG_FIELD_POSITIONS,
  LOG_LEVEL_NAMES,
  LOG_LEVEL_VALUES,
  type LogEntry,
  type LogLevelChar,
  MODULES,
  type ModuleName,
  type ParsedLogLine,
  STANDARD_KEYS,
} from "./log-types.js";

// Adapter
export {
  createLoggerAdapter,
  LoggerAdapter,
} from "./logger-adapter.js";
