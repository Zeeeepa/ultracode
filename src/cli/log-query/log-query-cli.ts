#!/usr/bin/env node

/**
 * ulog - UltraScript Log Query CLI
 *
 * Fast log querying without full-text search.
 * Supports filtering by level, module, event, time, and KV pairs.
 *
 * Usage:
 *   ulog [options] [log-file...]
 *
 * Examples:
 *   ulog -l E                    # Show errors
 *   ulog -l E,W --from 1h        # Errors and warnings from last hour
 *   ulog -m PARSER -k "dur>100ms" # Parser logs with duration > 100ms
 *   ulog --stats                 # Show statistics
 *   ulog -f                      # Follow log file (tail -f style)
 */

import type { ParsedLogLine } from "../../logging/log-types.js";
import {
  collectEmbeddingSessions,
  createStats,
  findLogFiles,
  followLogFile,
  formatEmbeddingStats,
  formatEntry,
  formatFields,
  formatStats,
  getDefaultLogDir,
  processLogFiles,
  updateStats,
} from "./log-reader.js";
import { parseArgs } from "./query-parser.js";

const HELP = `
ulog - UltraScript Log Query CLI

Usage: ulog [options] [log-file...]

Filters:
  -l, --level <levels>     Log levels: E,W,I,D,T (comma-separated)
  -m, --module <pattern>   Module filter (glob pattern, e.g., "MCP_*")
  -e, --event <pattern>    Event filter (glob pattern, e.g., "*_fail")
  -t, --time <duration>    Time filter (e.g., "15m", "1h", "2d")
  --from <time>            Start time (absolute or relative)
  --to <time>              End time (absolute or relative)
  -k, --kv <filter>        KV filter (e.g., "dur>100ms", "ok=true")
  --pid <pid>              Filter by process ID
  --req <id>               Filter by request ID

Log source:
  -w, --worker             Read worker log (worker-*.log) instead of main
  -a, --all                Read both main and worker logs

Output:
  -o, --output <format>    Output format: raw, table, json, csv
  -c, --count              Show only count of matching entries
  --stats                  Show statistics
  --emb                    Show embedding generation statistics
  -f, --follow             Follow log file (tail -f style)
  --no-color               Disable colored output
  --fields <list>          Show only specific fields (comma-separated)
  -n, --limit <n>          Limit number of results (default: 1000)

Time formats:
  Relative: 5m, 1h, 2d, 30s (minutes, hours, days, seconds ago)
  Absolute: 20260106, 20260106-1500, 1500 (date, date-time, time today)

Examples:
  ulog -l E --from 1h             # Errors in the last hour
  ulog -m PARSER -k "dur>100ms"   # Slow parser operations
  ulog -l E,W --stats             # Error/warning statistics
  ulog -o json > errors.json      # Export to JSON
  ulog -f -l E                    # Follow errors in real-time
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  // Parse arguments
  const { filter, output, files } = parseArgs(args);

  // Determine log files
  let logFiles = files;
  if (logFiles.length === 0) {
    const logDir = getDefaultLogDir();
    logFiles = findLogFiles(logDir, output.logType);
    if (logFiles.length === 0) {
      const typeDesc = output.logType === "worker" ? "worker" : output.logType === "all" ? "any" : "main";
      console.error(`No ${typeDesc} log files found in ${logDir}`);
      process.exit(1);
    }
  }

  // Follow mode
  if (output.follow) {
    const firstFile = logFiles[0];
    if (firstFile) {
      await followLogFile(firstFile, filter, output, (line) => {
        console.log(line);
      });
    }
    return;
  }

  // Embedding statistics mode
  if (output.embeddings) {
    // Collect all entries and filter for embedding-related events
    // No filter - collectEmbeddingSessions will handle event filtering
    const embFilter = {
      ...filter,
      limit: 10000, // Higher limit to catch all embedding events
    };

    const entries: ParsedLogLine[] = [];
    for await (const entry of processLogFiles(logFiles, embFilter)) {
      // Filter for embedding-related events
      if (
        (entry.event === "emb_summary" && entry.module === "EMBEDDING") ||
        entry.event === ">>> vectors.written" ||
        entry.event === "Worker wrote vectors"
      ) {
        entries.push(entry);
      }
    }

    const sessions = collectEmbeddingSessions(entries);
    console.log(formatEmbeddingStats(sessions, output.noColor));
    return;
  }

  // Process files
  const stats = createStats();
  let count = 0;

  // CSV header
  if (output.format === "csv" && !output.countOnly && !output.stats) {
    console.log('"timestamp","level","pid","hash","module","event","kv"');
  }

  // JSON array start
  const entries: object[] = [];
  const isJsonArray = output.format === "json" && !output.countOnly && !output.stats;

  for await (const entry of processLogFiles(logFiles, filter)) {
    stats.total++;
    updateStats(stats, entry);
    count++;

    if (!output.countOnly && !output.stats) {
      if (output.fields.length > 0) {
        console.log(formatFields(entry, output.fields));
      } else if (isJsonArray) {
        entries.push({
          timestamp: entry.timestamp.toISOString(),
          level: entry.level,
          pid: entry.pid,
          hash: entry.buildHash,
          module: entry.module,
          event: entry.event,
          ...entry.kv,
        });
      } else {
        console.log(formatEntry(entry, output));
      }
    }
  }

  // Output JSON array
  if (isJsonArray) {
    console.log(JSON.stringify(entries, null, 2));
  }

  // Count only
  if (output.countOnly) {
    console.log(count);
    return;
  }

  // Stats
  if (output.stats) {
    console.log(formatStats(stats, output.noColor));
    return;
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
