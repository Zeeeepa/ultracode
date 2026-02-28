---
module_name: linters
description: "Linter integrations for code validation via Biome, oxlint, and Pylint"
status: active
language: typescript
---

# Linters

> Linter integration module providing unified `Linter` interface implementations for Biome (TS/JS), oxlint (TS/JS), and Pylint (Python) with autofix and dry-run support.

## Overview

The linters module contains three linter implementations that wrap external tools behind a common `Linter` interface defined in the parent `code-validator` module. Each linter executes the external tool as a subprocess, parses JSON or structured output into `ValidationProblem` arrays, and supports autofix mode with optional dry-run (applies fixes to a temp copy). Biome and oxlint handle TypeScript/JavaScript files, while Pylint handles Python files.

## Data Flow

- **Inputs:** File path and content from the validation tool handler.
- **Processing:** External tool execution via subprocess, JSON output parsing into `ValidationProblem` objects.
- **Outputs:** Array of `ValidationProblem` with severity, message, line, column, and rule ID.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `BiomeLinter` | class | Biome linter with JSON reporter and autofix support | [`biome-linter.ts:8-127`](./biome-linter.ts) |
| `OxlintLinter` | class | oxlint linter (~100x faster than ESLint) | [`oxlint-linter.ts:15-139`](./oxlint-linter.ts) |
| `PylintLinter` | class | Pylint linter for Python files via subprocess | [`pylint-linter.ts:14-97`](./pylint-linter.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `validation/code-validator` | `Linter` interface and `ValidationProblem` type |
| `utils/shell` | Shell command execution utility |
| `logging` | Warning and error logging |

### External Packages

| Package | Purpose |
|---------|---------|
| `@biomejs/biome` | Biome binary (resolved via `require.resolve`) |
| `node:fs/promises` | Temp file creation for dry-run mode |
| `node:child_process` | Subprocess execution for Pylint |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Biome timeout | 30 seconds per lint operation |
| Dry-run approach | Copy to temp file, apply fixes, diff against original |
| Pylint availability | Checked once and cached |

## Error Handling

All linters catch subprocess errors and return empty arrays rather than throwing. Biome and oxlint attempt to parse JSON output even from error exits (since linters exit non-zero when issues are found). Pylint checks its own availability before attempting to lint.

## Known Limitations

- Biome binary path resolution depends on it being in `node_modules`.
- Pylint must be installed globally or in the project's Python environment.
- Autofix dry-run mode creates temporary files in the OS temp directory.

## Files

| File | Description |
|------|-------------|
| `biome-linter.ts` | Biome linter with JSON output parsing and dry-run support |
| `oxlint-linter.ts` | oxlint integration, ~100x faster than ESLint |
| `pylint-linter.ts` | Pylint integration for Python via subprocess |
