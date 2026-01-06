/**
 * Fixed-position logger with buffered writes and rotation
 * Format: YYYYMMDD-HHmmss.mmm L PPPPP HHHHHHHH MODULE_______________ EVENT________________ kv...
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "fs";
import { join } from "path";
import { getBuildHash, getPid } from "./build-info.js";
import { kvError, kvOpEnd, kvOpStart } from "./kv-serializer.js";
import { formatLogLine, formatLogLineColored } from "./log-formatter.js";
import {
  DEFAULT_LOGGER_CONFIG,
  type FixedLoggerConfig,
  type KVPairs,
  LOG_LEVEL_VALUES,
  type LogEntry,
  type LogLevelChar,
  type ModuleName,
} from "./log-types.js";

/** Default project hash when not set */
const NO_PROJECT = "--------";

/**
 * Fixed-position logger instance
 */
export class FixedLogger {
  private config: FixedLoggerConfig;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private currentLogFile: string = "";
  private currentFileSize: number = 0;
  private buildHash: string;
  private projectHash: string;
  private pid: number;

  constructor(config: Partial<FixedLoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.buildHash = getBuildHash();
    this.projectHash = NO_PROJECT;
    this.pid = getPid();

    // Ensure log directory exists
    if (this.config.logDir && !existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }

    // Set up flush timer
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
    }
  }

  /**
   * Get current log file path
   */
  private getLogFilePath(): string {
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return join(this.config.logDir, `ultrascript-${dateStr}.log`);
  }

  /**
   * Check if rotation is needed
   */
  private shouldRotate(): boolean {
    return this.config.maxFileSize > 0 && this.currentFileSize >= this.config.maxFileSize;
  }

  /**
   * Rotate log file
   */
  private rotate(): void {
    if (!this.currentLogFile || !existsSync(this.currentLogFile)) return;

    // Find next rotation number
    let rotationNum = 1;
    while (existsSync(`${this.currentLogFile}.${rotationNum}`) && rotationNum < this.config.maxFiles) {
      rotationNum++;
    }

    // Rename current file
    try {
      renameSync(this.currentLogFile, `${this.currentLogFile}.${rotationNum}`);
      this.currentFileSize = 0;
    } catch {
      // Ignore rotation errors
    }
  }

  /**
   * Write line to file
   */
  private writeLine(line: string): void {
    const logFile = this.getLogFilePath();

    // Check if file changed (new day)
    if (logFile !== this.currentLogFile) {
      this.currentLogFile = logFile;
      this.currentFileSize = existsSync(logFile) ? statSync(logFile).size : 0;
    }

    // Check rotation
    if (this.shouldRotate()) {
      this.rotate();
    }

    // Write to file
    if (this.config.logDir) {
      try {
        appendFileSync(logFile, line + "\n");
        this.currentFileSize += line.length + 1;
      } catch {
        // Ignore write errors
      }
    }
  }

  /**
   * Flush buffer to file
   */
  public flush(): void {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.join("\n");
    this.buffer = [];

    if (this.config.logDir) {
      const logFile = this.getLogFilePath();
      try {
        appendFileSync(logFile, lines + "\n");
        this.currentFileSize += lines.length + 1;
      } catch {
        // Ignore flush errors
      }
    }
  }

  /**
   * Log entry
   */
  private log(level: LogLevelChar, module: string, event: string, kv: KVPairs = {}): void {
    // Check level filter
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      pid: this.pid,
      buildHash: this.buildHash,
      projectHash: this.projectHash,
      module,
      event,
      kv,
    };

    const line = formatLogLine(entry);

    // Console output
    if (this.config.consoleOutput) {
      console.error(formatLogLineColored(entry));
    }

    // Buffer or write immediately
    if (this.config.bufferSize > 0) {
      this.buffer.push(line);
      if (this.buffer.length >= this.config.bufferSize) {
        this.flush();
      }
    } else {
      this.writeLine(line);
    }

    // Sync write for errors
    if (level === "E") {
      this.flush();
    }
  }

  // ============================================
  // Shorthand logging methods
  // ============================================

  /** Log error */
  public e(module: ModuleName | string, event: string, kv?: KVPairs): void {
    this.log("E", module, event, kv);
  }

  /** Log warning */
  public w(module: ModuleName | string, event: string, kv?: KVPairs): void {
    this.log("W", module, event, kv);
  }

  /** Log info */
  public i(module: ModuleName | string, event: string, kv?: KVPairs): void {
    this.log("I", module, event, kv);
  }

  /** Log debug */
  public d(module: ModuleName | string, event: string, kv?: KVPairs): void {
    this.log("D", module, event, kv);
  }

  /** Log trace */
  public t(module: ModuleName | string, event: string, kv?: KVPairs): void {
    this.log("T", module, event, kv);
  }

  // ============================================
  // Operation tracking helpers
  // ============================================

  /**
   * Log operation start
   * @returns start time for duration calculation
   */
  public opStart(module: ModuleName | string, op: string, kv?: KVPairs): number {
    this.t(module, "op_start", kvOpStart(op, kv));
    return Date.now();
  }

  /**
   * Log operation end
   */
  public opEnd(module: ModuleName | string, op: string, startTime: number, ok: boolean, kv?: KVPairs): void {
    const dur = Date.now() - startTime;
    this.t(module, "op_end", kvOpEnd(op, dur, ok, kv));
  }

  /**
   * Log operation with automatic start/end
   */
  public async op<T>(module: ModuleName | string, op: string, fn: () => T | Promise<T>, kv?: KVPairs): Promise<T> {
    const start = this.opStart(module, op, kv);
    try {
      const result = await fn();
      this.opEnd(module, op, start, true);
      return result;
    } catch (err) {
      this.opEnd(module, op, start, false, kvError(err as Error));
      throw err;
    }
  }

  // ============================================
  // Error helpers
  // ============================================

  /**
   * Log error with error object
   */
  public error(module: ModuleName | string, event: string, err: Error | string, kv?: KVPairs): void {
    this.e(module, event, { ...kvError(err), ...kv });
  }

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Set PID (for workers)
   */
  public setPid(pid: number): void {
    this.pid = pid;
  }

  /**
   * Set build hash
   */
  public setBuildHash(hash: string): void {
    this.buildHash = hash;
  }

  /**
   * Set project hash (first 8 chars of project path hash)
   */
  public setProjectHash(hash: string): void {
    this.projectHash = hash ? hash.slice(0, 8) : NO_PROJECT;
  }

  /**
   * Get current project hash
   */
  public getProjectHash(): string {
    return this.projectHash;
  }

  /**
   * Update config
   */
  public configure(config: Partial<FixedLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Close logger (flush and cleanup)
   */
  public close(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ============================================
// Global logger instance
// ============================================

let globalLogger: FixedLogger | null = null;

/**
 * Get or create global logger instance
 */
export function getLogger(): FixedLogger {
  if (!globalLogger) {
    globalLogger = new FixedLogger();
  }
  return globalLogger;
}

/**
 * Initialize global logger with config
 */
export function initLogger(config: Partial<FixedLoggerConfig>): FixedLogger {
  if (globalLogger) {
    globalLogger.close();
  }
  globalLogger = new FixedLogger(config);
  return globalLogger;
}

/**
 * Set project hash on global logger
 */
export function setProjectHash(hash: string): void {
  getLogger().setProjectHash(hash);
}

/**
 * Shorthand for getLogger()
 */
export const log = {
  get e() {
    return getLogger().e.bind(getLogger());
  },
  get w() {
    return getLogger().w.bind(getLogger());
  },
  get i() {
    return getLogger().i.bind(getLogger());
  },
  get d() {
    return getLogger().d.bind(getLogger());
  },
  get t() {
    return getLogger().t.bind(getLogger());
  },
  get error() {
    return getLogger().error.bind(getLogger());
  },
  get opStart() {
    return getLogger().opStart.bind(getLogger());
  },
  get opEnd() {
    return getLogger().opEnd.bind(getLogger());
  },
  get op() {
    return getLogger().op.bind(getLogger());
  },
  get flush() {
    return getLogger().flush.bind(getLogger());
  },
  setProject(hash: string) {
    getLogger().setProjectHash(hash);
  },
};
