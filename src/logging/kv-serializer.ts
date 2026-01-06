/**
 * Key-Value pair serializer for fixed-position logs
 * Format: key=value key2="value with spaces" dur=45ms cnt=42 ok=true
 */

import { KV_CONSTRAINTS, type KVPairs, type KVValue } from "./log-types.js";

/** Check if value needs quoting */
function needsQuoting(value: string): boolean {
  return /[\s"\\=]/.test(value);
}

/** Escape special characters in quoted string */
function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Truncate string with ellipsis */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/** Validate key format: lowercase letters, numbers, underscore, starts with letter */
function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(key);
}

/** Normalize key to valid format */
function normalizeKey(key: string): string {
  let normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z]/.test(normalized)) {
    normalized = "k_" + normalized;
  }
  return truncate(normalized, KV_CONSTRAINTS.MAX_KEY_LENGTH);
}

/** Serialize single value */
function serializeValue(value: KVValue): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const str = truncate(String(value), KV_CONSTRAINTS.MAX_VALUE_LENGTH);
  if (needsQuoting(str)) {
    return `"${escapeValue(str)}"`;
  }
  return str;
}

/** Serialize complex value (array or object) to JSON string */
function serializeComplexValue(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    const truncated = truncate(json, KV_CONSTRAINTS.MAX_VALUE_LENGTH);
    return `"${escapeValue(truncated)}"`;
  } catch {
    return '"[object]"';
  }
}

/**
 * Serialize KV pairs to string
 * @example
 * serializeKV({ dur: 45, ok: true, err: "timeout" })
 * // Returns: 'dur=45 ok=true err=timeout'
 */
export function serializeKV(kv: KVPairs): string {
  const parts: string[] = [];
  let totalLength = 0;

  for (const [key, value] of Object.entries(kv)) {
    if (value === undefined || value === null) continue;

    const normalizedKey = isValidKey(key) ? key : normalizeKey(key);

    // Handle complex types (arrays, objects)
    let serializedValue: string;
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
      serializedValue = serializeComplexValue(value);
    } else {
      serializedValue = serializeValue(value as KVValue);
    }

    const part = `${normalizedKey}=${serializedValue}`;

    if (totalLength + part.length + 1 > KV_CONSTRAINTS.MAX_TOTAL_LENGTH) {
      parts.push("...");
      break;
    }

    parts.push(part);
    totalLength += part.length + 1;
  }

  return parts.join(" ");
}

/** Parsed KV pair from log line */
export interface ParsedKVPair {
  key: string;
  value: KVValue;
  raw: string;
}

/**
 * Parse KV string back to object
 * @example
 * parseKV('dur=45 ok=true err="connection timeout"')
 * // Returns: { dur: 45, ok: true, err: "connection timeout" }
 */
export function parseKV(kvString: string): KVPairs {
  const result: KVPairs = {};
  if (!kvString || !kvString.trim()) return result;

  let i = 0;
  const len = kvString.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && kvString[i] === " ") i++;
    if (i >= len) break;

    // Parse key
    const keyStart = i;
    while (i < len && kvString[i] !== "=" && kvString[i] !== " ") i++;
    const key = kvString.slice(keyStart, i);

    if (i >= len || kvString[i] !== "=") {
      // Malformed, skip
      while (i < len && kvString[i] !== " ") i++;
      continue;
    }
    i++; // Skip '='

    // Parse value
    let value: KVValue;
    if (kvString[i] === '"') {
      // Quoted string
      i++; // Skip opening quote
      let valueStr = "";
      while (i < len && kvString[i] !== '"') {
        if (kvString[i] === "\\" && i + 1 < len) {
          i++;
          valueStr += kvString[i];
        } else {
          valueStr += kvString[i];
        }
        i++;
      }
      i++; // Skip closing quote
      value = valueStr;
    } else {
      // Unquoted value
      const valueStart = i;
      while (i < len && kvString[i] !== " ") i++;
      const rawValue = kvString.slice(valueStart, i);

      // Try to parse as number or boolean
      if (rawValue === "true") {
        value = true;
      } else if (rawValue === "false") {
        value = false;
      } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
        value = Number(rawValue);
      } else if (/^-?\d+(\.\d+)?ms$/.test(rawValue)) {
        // Duration with ms suffix -> number
        value = Number(rawValue.slice(0, -2));
      } else if (/^-?\d+(\.\d+)?s$/.test(rawValue)) {
        // Duration with s suffix -> convert to ms
        value = Number(rawValue.slice(0, -1)) * 1000;
      } else {
        value = rawValue;
      }
    }

    result[key] = value;
  }

  return result;
}

/**
 * Format duration value
 * @example formatDuration(1500) -> "1500ms"
 * @example formatDuration(0.5) -> "0ms"
 */
export function formatDuration(ms: number): string {
  return `${Math.round(ms)}ms`;
}

/**
 * Format memory value
 * @example formatMemory(1024 * 1024 * 256) -> "256"  (MB)
 */
export function formatMemory(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/**
 * Create standard KV for operation start
 */
export function kvOpStart(op: string, extra?: KVPairs): KVPairs {
  return { op, ...extra };
}

/**
 * Create standard KV for operation end
 */
export function kvOpEnd(op: string, durationMs: number, ok: boolean, extra?: KVPairs): KVPairs {
  return { op, dur: durationMs, ok, ...extra };
}

/**
 * Create standard KV for error
 */
export function kvError(err: string | Error, extra?: KVPairs): KVPairs {
  const message = err instanceof Error ? err.message : err;
  return { err: message, ...extra };
}
