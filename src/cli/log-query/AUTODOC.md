---
module_name: log-query
description: "CLI tool for reading, filtering, and analyzing structured log files with time range and KV pair support"
status: active
language: typescript
---

# Log Query

> CLI-based log querying system (ulog) that reads structured log files and filters them by level, module, event, time range, and key-value pairs with multiple output formats.

## Overview

The log-query module implements the `ulog` command-line tool for querying UltraCode structured logs. It supports filtering by log levels (E/W/I/D/T), module and event glob patterns, time ranges (relative like "5m" or absolute like "20260106-1500"), and arbitrary KV pair comparisons. Output can be formatted as raw, table, JSON, or CSV, with support for follow mode (tail -f), statistics, and embedding session analysis.

## Data Flow

- **Inputs:** Log files from the default log directory or user-specified paths, CLI arguments for filter and output configuration.
- **Processing:** Line-by-line parsing of structured log entries, filter matching against time ranges/levels/modules/events/KV pairs, statistics accumulation.
- **Outputs:** Filtered log entries in chosen format (raw/table/JSON/CSV), statistics summaries, embedding session reports.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `LogStats` | interface | Statistics accumulator for matched log entries | [`log-reader.ts:17-28`](./log-reader.ts) |
| `createStats` | function | Creates an empty log statistics object | [`log-reader.ts:33-46`](./log-reader.ts) |
| `updateStats` | function | Updates statistics with a matched entry | [`log-reader.ts:51-71`](./log-reader.ts) |
| `formatEntry` | function | Formats a log entry for the chosen output format | [`log-reader.ts:76-113`](./log-reader.ts) |
| `getDefaultLogDir` | function | Returns platform-specific default log directory | [`log-reader.ts:128-145`](./log-reader.ts) |
| `findLogFiles` | function | Finds log files in a directory by type (main/worker/all) | [`log-reader.ts:152-173`](./log-reader.ts) |
| `processLogFiles` | async generator | Streams filtered log entries from files | [`log-reader.ts:178-216`](./log-reader.ts) |
| `followLogFile` | function | Follows a log file for new entries (tail -f style) | [`log-reader.ts:221-271`](./log-reader.ts) |
| `EmbeddingSession` | interface | Embedding generation session data | [`log-reader.ts:276-284`](./log-reader.ts) |
| `collectEmbeddingSessions` | function | Aggregates embedding sessions from log entries | [`log-reader.ts:290-379`](./log-reader.ts) |
| `LogQueryFilter` | interface | Complete filter structure for log queries | [`query-parser.ts:27-37`](./query-parser.ts) |
| `OutputOptions` | interface | Output format and display options | [`query-parser.ts:42-51`](./query-parser.ts) |
| `parseArgs` | function | Parses CLI arguments into filter, output, and file list | [`query-parser.ts:113-117`](./query-parser.ts) |
| `matchesFilter` | function | Tests if a log entry matches a filter | [`query-parser.ts:308-387`](./query-parser.ts) |
| `TimeRange` | interface | Time range with from/to dates | [`time-parser.ts:148-151`](./time-parser.ts) |
| `parseTime` | function | Parses relative or absolute time string | [`time-parser.ts:115-122`](./time-parser.ts) |
| `parseTimeRange` | function | Parses from/to into a TimeRange | [`time-parser.ts:153-166`](./time-parser.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging/log-formatter` | Colored log line formatting and field extraction |
| `logging/log-types` | Log level types and constants |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:fs` | File reading, directory listing, file watching |
| `node:readline` | Line-by-line stream reading |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default result limit | 1000 entries |
| Session grouping window | 60 seconds between embedding events |
| Time formats supported | Relative (5m, 1h, 2d) and absolute (YYYYMMDD-HHmmss) |

## Error Handling

Missing log directories return empty file lists gracefully. Unparseable log lines are silently skipped. Follow mode handles file truncation by resetting the read position. JSON parse errors in KV filters return `false` for the match.

## Known Limitations

- Follow mode uses `fs.watch` which may miss rapid changes on some platforms.
- Embedding session grouping uses a fixed 60-second window which may split long sessions.
- No support for compressed (.gz) log files.

## Files

| File | Description |
|------|-------------|
| `log-query-cli.ts` | Main CLI entry point for the ulog command |
| `log-reader.ts` | Log file reading, processing, statistics, and embedding session collection |
| `query-parser.ts` | CLI argument parsing into filter and output structures |
| `time-parser.ts` | Relative and absolute time format parsing |
