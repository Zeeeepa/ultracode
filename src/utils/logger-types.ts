export const LogLevel = {
  TRACE: -1,
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const LogLevelName: Record<number, string> = Object.fromEntries(
  Object.entries(LogLevel).map(([k, v]) => [v, k]),
);

export interface LoggerConfig {
  logDir: string;
  maxFileSize: number;
  maxFiles: number;
  logLevel: LogLevel;
  enableRotation: boolean;
  enableTimestamp: boolean;
  enableStackTrace: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  stackTrace?: string | undefined;
  requestId?: string | undefined;
  duration?: number;
}
