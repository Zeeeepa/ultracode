# validation

Multi-language code validator with before/after comparison and extensible linter support

## Overview

The validation module provides multi-language code quality checking with a pluggable linter architecture. `CodeValidator` orchestrates linter selection based on file type, executes batch validation with configurable concurrency, and generates before/after comparison reports to track code quality improvements. Three linter implementations are included: `OxlintLinter` for TypeScript/JavaScript (100x faster than ESLint), `BiomeLinter` as an alternative JS/TS linter, and `PylintLinter` for Python. All linters load lazily on first use to avoid import errors when binaries are unavailable, and support autofix with dry-run mode that safely tests fixes on temporary copies without modifying originals.

## Flow

```
Input: filePath or dirPath
  ↓
[1] Determine file extension (.ts, .js, .py, etc)
  ↓
[2] selectLinter(ext) — lazy-load appropriate linter
  ↓
[3] readText(filePath) — read file content
  ↓
[4] linter.lint(filePath, content) — execute external tool
    (spawn oxlint/biome subprocess or pylint)
  ↓
[5] Parse JSON output → ValidationProblem[]
  ↓
[6] categorizeProblems() — count errors/warnings/info
  ↓
Output: ValidationReport
  {filePath, problems[], summary{errors, warnings, info}}

For validateModification():
before ValidationReport
  ↓
validateFile() (after state)
  ↓
compareReports()
  ↓
Output: BeforeAfterReport
  {before, after, improvement{errorsFixed, newErrors}}
```

## Public API

### Types and Interfaces

| Export | Location | Description |
|--------|----------|-------------|
| `ValidationReport` | `code-validator.ts:26-37` | Single-file lint result containing file path, timestamp, problems array, and summary counts (errors, warnings, info). |
| `ValidationProblem` | `code-validator.ts:39-46` | Individual lint problem with severity level, message text, line and column position, optional rule identifier, and linter source. |
| `BeforeAfterReport` | `code-validator.ts:48-58` | Before/after validation comparison containing baseline and current reports with improvement metrics (errors fixed, warnings fixed, new errors introduced). |
| `Linter` | `code-validator.ts:64-67` | Pluggable linter interface defining `name` property and `lint(filePath: string, content: string)` method returning problems array. |

### Classes

| Export | Location | Description |
|--------|----------|-------------|
| `CodeValidator` | `code-validator.ts:73-291` | Main validation orchestrator that selects language-appropriate linters, validates individual files or entire directories with concurrency limits, and generates improvement reports comparing code quality before and after changes. |

### CodeValidator Methods

| Method | Location | Description |
|--------|----------|-------------|
| `.validateFile(filePath)` | `code-validator.ts:91-121` | Validates a single file and returns a `ValidationReport` with all lint problems discovered. |
| `.validateDirectory(dirPath, extensions?)` | `code-validator.ts:126-142` | Batch validates all files in a directory (recursively) matching specified extensions, respecting a concurrency limit of 10 parallel validations. |
| `.validateModification(filePath, beforeReport?)` | `code-validator.ts:147-154` | Performs before/after validation comparison, accepting an optional pre-computed baseline report or computing one automatically. |
| `.fixFile(filePath)` | `code-validator.ts:156-191` | Applies autofix for supported linters (oxlint, biome) to correct fixable lint problems in a file. |
| `.dryRunFix(filePath)` | `code-validator.ts:193-291` | Simulates autofix on a temporary file copy, compares results, and reports what would change without modifying the original file. |

## Linter Implementations

| Export | Location | Description |
|--------|----------|-------------|
| `OxlintLinter` | `linters/oxlint-linter.ts:15-139` | Fast oxlint implementation for JavaScript and TypeScript with autofix and dry-run support, using JSON output parsing and subprocess execution. |
| `BiomeLinter` | `linters/biome-linter.ts:8-127` | Biome-based linter for JavaScript and TypeScript with similar autofix and dry-run capabilities as OxlintLinter, offering an alternative to oxlint. |
| `PylintLinter` | `linters/pylint-linter.ts:14-97` | Python linter integration that invokes pylint as a subprocess with JSON output format, providing problem detection for `.py` and `.pyi` files. |

## Dependencies

| Module | Purpose |
|--------|---------|
| `../logging/index` | Structured logging for linter initialization failures and lint operation errors. |
| `../utils/file-ops` | File reading (`readText`), directory traversal (`readdir`), and file discovery for validation. |
| `../utils/shell` | Shell command execution wrapper for subprocess-based linters (oxlint, biome). |
| `oxlint` | External binary for fast JavaScript/TypeScript linting via subprocess. |
| `pylint` | External binary for Python linting invoked via subprocess. |
| `@biomejs/biome` | External binary for JavaScript/TypeScript linting as oxlint alternative. |
| `node:child_process` | Native Node subprocess execution for pylint integration. |
| `node:fs/promises` | Async file operations (`copyFile`, `readFile`, `unlink`) for dry-run temporary file handling. |
| `node:path` | Path utilities (`extname`, `join`, `dirname`) for file type detection and path construction. |
| `node:os` | Temporary directory access (`tmpdir`) for safe dry-run file copies. |
| `node:module` | Module resolution (`createRequire`) for locating oxlint and biome binary paths. |

## Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| Batch concurrency limit | 10 | Maximum number of parallel file validations in directory scans. |
| Lint timeout | 30000 ms | Maximum execution time for oxlint and biome subprocess calls. |
| Default file extensions | `.ts`, `.tsx`, `.js`, `.jsx`, `.py` | File types validated when no extensions filter is specified. |
| Excluded directories | `node_modules`, `.git`, `dist`, `build`, `coverage` | Directories skipped during recursive directory traversal. |
| Linter selection strategy | Extension-based routing | `.ts/.tsx/.js/.jsx/.mjs/.cjs` → oxlint; `.py/.pyi` → pylint. |

## Behavioral Properties

| Behavior | Detail |
|----------|--------|
| Lazy linter loading | Linters are dynamically imported on first use; missing binaries do not cause startup errors. |
| Linter instance caching | Successfully loaded linters are cached in a Map to avoid repeated initialization. |
| Graceful degradation | If a linter fails to load or is not installed, validation returns an empty problems array with a warning log. |
| Dry-run autofix safety | File is copied to temporary location, fixes applied, output compared, then temp file deleted; original never modified. |
| Parallel directory walk | Recursive directory traversal uses `Promise.all()` for concurrent subdirectory processing. |
| Non-zero exit tolerance | Linter subprocesses may exit with non-zero codes when problems are found; output is parsed regardless. |
| Problem categorization | Lint output is parsed and problems grouped by severity level (error, warning, info) for summary counts. |