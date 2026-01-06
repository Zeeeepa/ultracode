/**
 * Time parser for ulog CLI
 * Supports absolute and relative time formats
 *
 * Relative formats:
 * - 5m   -> 5 minutes ago
 * - 1h   -> 1 hour ago
 * - 2d   -> 2 days ago
 * - 30s  -> 30 seconds ago
 *
 * Absolute formats:
 * - 20260106            -> January 6, 2026 00:00:00
 * - 20260106-1500       -> January 6, 2026 15:00:00
 * - 20260106-153045     -> January 6, 2026 15:30:45
 * - 20260106-153045.123 -> January 6, 2026 15:30:45.123
 * - 1500                -> Today at 15:00
 * - 153045              -> Today at 15:30:45
 */

/** Time unit multipliers in milliseconds */
const TIME_UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse relative time string
 * @example parseRelativeTime('5m') -> Date 5 minutes ago
 */
export function parseRelativeTime(input: string): Date | null {
  const match = input.match(/^(\d+)([smhdw])$/);
  if (!match || !match[1] || !match[2]) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = TIME_UNITS[unit];

  if (multiplier === undefined) return null;

  return new Date(Date.now() - value * multiplier);
}

/**
 * Parse absolute time string in log format
 * @example parseAbsoluteTime('20260106-153045.123') -> Date
 */
export function parseAbsoluteTime(input: string): Date | null {
  // Full format: YYYYMMDD-HHmmss.mmm
  if (/^\d{8}-\d{6}\.\d{3}$/.test(input)) {
    const y = parseInt(input.slice(0, 4), 10);
    const m = parseInt(input.slice(4, 6), 10) - 1;
    const d = parseInt(input.slice(6, 8), 10);
    const h = parseInt(input.slice(9, 11), 10);
    const min = parseInt(input.slice(11, 13), 10);
    const s = parseInt(input.slice(13, 15), 10);
    const ms = parseInt(input.slice(16, 19), 10);
    return new Date(y, m, d, h, min, s, ms);
  }

  // Without milliseconds: YYYYMMDD-HHmmss
  if (/^\d{8}-\d{6}$/.test(input)) {
    const y = parseInt(input.slice(0, 4), 10);
    const m = parseInt(input.slice(4, 6), 10) - 1;
    const d = parseInt(input.slice(6, 8), 10);
    const h = parseInt(input.slice(9, 11), 10);
    const min = parseInt(input.slice(11, 13), 10);
    const s = parseInt(input.slice(13, 15), 10);
    return new Date(y, m, d, h, min, s);
  }

  // Date with hours/minutes: YYYYMMDD-HHmm
  if (/^\d{8}-\d{4}$/.test(input)) {
    const y = parseInt(input.slice(0, 4), 10);
    const m = parseInt(input.slice(4, 6), 10) - 1;
    const d = parseInt(input.slice(6, 8), 10);
    const h = parseInt(input.slice(9, 11), 10);
    const min = parseInt(input.slice(11, 13), 10);
    return new Date(y, m, d, h, min);
  }

  // Date only: YYYYMMDD
  if (/^\d{8}$/.test(input)) {
    const y = parseInt(input.slice(0, 4), 10);
    const m = parseInt(input.slice(4, 6), 10) - 1;
    const d = parseInt(input.slice(6, 8), 10);
    return new Date(y, m, d);
  }

  // Time only (today): HHmm
  if (/^\d{4}$/.test(input)) {
    const now = new Date();
    const h = parseInt(input.slice(0, 2), 10);
    const min = parseInt(input.slice(2, 4), 10);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
  }

  // Time only (today): HHmmss
  if (/^\d{6}$/.test(input)) {
    const now = new Date();
    const h = parseInt(input.slice(0, 2), 10);
    const min = parseInt(input.slice(2, 4), 10);
    const s = parseInt(input.slice(4, 6), 10);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, s);
  }

  return null;
}

/**
 * Parse time string (relative or absolute)
 */
export function parseTime(input: string): Date | null {
  // Try relative first
  const relative = parseRelativeTime(input);
  if (relative) return relative;

  // Try absolute
  return parseAbsoluteTime(input);
}

/**
 * Format date to relative string
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const s = TIME_UNITS["s"]!;
  const m = TIME_UNITS["m"]!;
  const h = TIME_UNITS["h"]!;
  const d = TIME_UNITS["d"]!;
  const w = TIME_UNITS["w"]!;

  if (diff < 0) return "future";
  if (diff < m) return `${Math.floor(diff / s)}s ago`;
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  if (diff < w) return `${Math.floor(diff / d)}d ago`;
  return `${Math.floor(diff / w)}w ago`;
}

/**
 * Parse time range from --from and --to options
 */
export interface TimeRange {
  from: Date | null;
  to: Date | null;
}

export function parseTimeRange(from?: string, to?: string, shortcut?: string): TimeRange {
  // Shortcut: -t 15m means --from 15m
  if (shortcut) {
    return {
      from: parseTime(shortcut),
      to: null,
    };
  }

  return {
    from: from ? parseTime(from) : null,
    to: to ? parseTime(to) : null,
  };
}
