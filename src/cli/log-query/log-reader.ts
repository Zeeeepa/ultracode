/**
 * Log file reader and processor for ulog CLI
 * Reads log files line by line and applies filters
 */

import { createReadStream, existsSync, readdirSync, statSync, watch } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { extractFields, formatLogLineColored, parseLogLine } from "../../logging/log-formatter.js";
import type { LogLevelChar, ParsedLogLine } from "../../logging/log-types.js";
import { LOG_LEVEL_NAMES } from "../../logging/log-types.js";
import { type LogQueryFilter, matchesFilter, type OutputOptions } from "./query-parser.js";

/**
 * Stats accumulator
 */
export interface LogStats {
  total: number;
  matched: number;
  byLevel: Record<LogLevelChar, number>;
  byModule: Record<string, number>;
  byEvent: Record<string, number>;
  firstTimestamp: Date | null;
  lastTimestamp: Date | null;
  avgDuration: number | null;
  totalDuration: number;
  durationCount: number;
}

/**
 * Create empty stats object
 */
export function createStats(): LogStats {
  return {
    total: 0,
    matched: 0,
    byLevel: { E: 0, W: 0, I: 0, D: 0, T: 0 },
    byModule: {},
    byEvent: {},
    firstTimestamp: null,
    lastTimestamp: null,
    avgDuration: null,
    totalDuration: 0,
    durationCount: 0,
  };
}

/**
 * Update stats with entry
 */
export function updateStats(stats: LogStats, entry: ParsedLogLine): void {
  stats.matched++;
  stats.byLevel[entry.level]++;
  stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;
  stats.byEvent[entry.event] = (stats.byEvent[entry.event] || 0) + 1;

  if (!stats.firstTimestamp || entry.timestamp < stats.firstTimestamp) {
    stats.firstTimestamp = entry.timestamp;
  }
  if (!stats.lastTimestamp || entry.timestamp > stats.lastTimestamp) {
    stats.lastTimestamp = entry.timestamp;
  }

  // Track durations
  const dur = entry.kv["dur"];
  if (typeof dur === "number") {
    stats.totalDuration += dur;
    stats.durationCount++;
    stats.avgDuration = stats.totalDuration / stats.durationCount;
  }
}

/**
 * Format entry for output
 */
export function formatEntry(entry: ParsedLogLine, options: OutputOptions): string {
  if (options.format === "json") {
    return JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      pid: entry.pid,
      hash: entry.buildHash,
      module: entry.module,
      event: entry.event,
      ...entry.kv,
    });
  }

  if (options.format === "csv") {
    const values = [
      entry.timestamp.toISOString(),
      entry.level,
      entry.pid,
      entry.buildHash,
      entry.module,
      entry.event,
      JSON.stringify(entry.kv),
    ];
    return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  }

  if (options.format === "table") {
    const ts = entry.timestamp.toISOString().slice(11, 23);
    return `${ts} ${entry.level} ${entry.module.padEnd(20)} ${entry.event.padEnd(20)}`;
  }

  // Raw format (with colors unless disabled)
  if (options.noColor) {
    return entry.raw;
  }

  return formatLogLineColored(entry);
}

/**
 * Format fields output
 */
export function formatFields(entry: ParsedLogLine, fields: string[]): string {
  const extracted = extractFields(entry, fields);
  return Object.entries(extracted)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

/**
 * Get default log directory
 */
export function getDefaultLogDir(): string {
  // Use APPDATA on Windows, HOME/.local/share on Linux
  const appData = process.env["APPDATA"] || process.env["HOME"];
  if (appData) {
    return join(appData, "UltraScriptTools", "logs");
  }
  return join(process.cwd(), "logs");
}

/**
 * Find log files in directory
 */
export function findLogFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("ultrascript-") && f.endsWith(".log"))
      .map((f) => join(dir, f))
      .sort((a, b) => {
        const statA = statSync(a);
        const statB = statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      });
    return files;
  } catch {
    return [];
  }
}

/**
 * Process log files with filter
 */
export async function* processLogFiles(files: string[], filter: LogQueryFilter): AsyncGenerator<ParsedLogLine> {
  let count = 0;
  let skipped = 0;

  for (const file of files) {
    if (!existsSync(file)) continue;

    const stream = createReadStream(file, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;

      const entry = parseLogLine(line, lineNumber);
      if (!entry) continue;

      filter.timeRange; // Ensure filter is used (stats tracking)

      if (matchesFilter(entry, filter)) {
        // Handle offset
        if (skipped < filter.offset) {
          skipped++;
          continue;
        }

        yield entry;
        count++;

        // Handle limit
        if (count >= filter.limit) {
          rl.close();
          stream.destroy();
          return;
        }
      }
    }
  }
}

/**
 * Follow log file (tail -f style)
 */
export async function followLogFile(
  file: string,
  filter: LogQueryFilter,
  options: OutputOptions,
  callback: (output: string) => void,
): Promise<void> {
  // Read existing content first
  const files = existsSync(file) ? [file] : findLogFiles(getDefaultLogDir());
  const targetFile = files[0];

  if (!targetFile) {
    callback("No log files found");
    return;
  }

  // Process existing
  for await (const entry of processLogFiles([targetFile], { ...filter, limit: 100 })) {
    callback(formatEntry(entry, options));
  }

  // Watch for changes
  const watcher = watch(targetFile, { persistent: true });
  let lastSize = statSync(targetFile).size;

  watcher.on("change", async () => {
    const newSize = statSync(targetFile).size;
    if (newSize <= lastSize) {
      lastSize = newSize;
      return;
    }

    // Read new content
    const stream = createReadStream(targetFile, {
      start: lastSize,
      encoding: "utf-8",
    });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const entry = parseLogLine(line, 0);
      if (entry && matchesFilter(entry, filter)) {
        callback(formatEntry(entry, options));
      }
    }

    lastSize = newSize;
  });

  // Keep running
  await new Promise(() => {});
}

/**
 * Format stats for output
 */
export function formatStats(stats: LogStats, noColor: boolean): string {
  const lines: string[] = [];
  const dim = noColor ? "" : "\x1b[2m";
  const reset = noColor ? "" : "\x1b[0m";
  const bold = noColor ? "" : "\x1b[1m";

  lines.push(`${bold}Log Statistics${reset}`);
  lines.push(`${dim}─────────────────────────────────────${reset}`);
  lines.push(`Total matched: ${stats.matched}`);

  if (stats.firstTimestamp && stats.lastTimestamp) {
    lines.push(`Time range: ${stats.firstTimestamp.toISOString()} - ${stats.lastTimestamp.toISOString()}`);
  }

  lines.push("");
  lines.push(`${bold}By Level:${reset}`);
  for (const [level, count] of Object.entries(stats.byLevel)) {
    if (count > 0) {
      const name = LOG_LEVEL_NAMES[level as LogLevelChar];
      lines.push(`  ${name.padEnd(8)} ${count}`);
    }
  }

  lines.push("");
  lines.push(`${bold}Top Modules:${reset}`);
  const topModules = Object.entries(stats.byModule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [module, count] of topModules) {
    lines.push(`  ${module.padEnd(20)} ${count}`);
  }

  lines.push("");
  lines.push(`${bold}Top Events:${reset}`);
  const topEvents = Object.entries(stats.byEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [event, count] of topEvents) {
    lines.push(`  ${event.padEnd(20)} ${count}`);
  }

  if (stats.avgDuration !== null) {
    lines.push("");
    lines.push(`${bold}Duration Stats:${reset}`);
    lines.push(`  Average: ${Math.round(stats.avgDuration)}ms`);
    lines.push(`  Total: ${Math.round(stats.totalDuration)}ms`);
    lines.push(`  Count: ${stats.durationCount}`);
  }

  return lines.join("\n");
}
