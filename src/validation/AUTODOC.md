---
module_name: validation
description: Multi-language code validation with pluggable linters, batch processing, and before/after comparison
status: active
language: TypeScript
entry_point: code-validator.ts
exports:
  - CodeValidator
  - ValidationReport
  - ValidationProblem
  - BeforeAfterReport
  - Linter
dependencies:
  - ../logging/index
  - ../utils/file-ops
  - ../utils/shell
  - oxlint
  - pylint
  - "@biomejs/biome"
tags:
  - validation
  - linting
  - code-quality
  - oxlint
  - pylint
  - biome
---

## Overview

Multi-language code validation module with a pluggable linter architecture.
`CodeValidator` is the central orchestrator that selects the appropriate linter based on file
extension, supports single-file and directory-level batch validation with configurable concurrency,
and provides before/after comparison reports for tracking code quality improvements.
Three linter implementations are provided: `OxlintLinter` for TypeScript/JavaScript (~100x faster
than ESLint), `BiomeLinter` as an alternative JS/TS linter, and `PylintLinter` for Python.
All linters are loaded lazily on first use to avoid import errors when binaries are missing.
OxlintLinter and BiomeLinter support autofix with a dry-run mode that applies fixes to a
temporary copy, compares the result, and reports what would change without modifying the original.

## Data Flow

```
validateFile(filePath)
  -> [1] Determine file extension
  -> [2] selectLinter(ext) -> lazy-load linter via dynamic import
  -> [3] readText(filePath) to get file content
  -> [4] linter.lint(filePath, content) -> spawn external tool (oxlint/pylint/biome)
  -> [5] Parse JSON output into ValidationProblem[]
  -> [6] categorizeProblems() -> summary {errors, warnings, info, total}
  -> Return ValidationReport

validateModification(filePath, beforeReport?)
  -> [1] Capture before report (existing or fresh)
  -> [2] Run validateFile() again for after report
  -> [3] compareReports() -> improvement metrics (errorsFixed, newErrors, netChange)
  -> Return BeforeAfterReport
```

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ValidationReport` | interface | Single-file lint result with problems and summary counts | [`code-validator.ts:26-37`](./code-validator.ts) |
| `ValidationProblem` | interface | Individual lint problem with severity, message, line, column, ruleId | [`code-validator.ts:39-46`](./code-validator.ts) |
| `BeforeAfterReport` | interface | Before/after comparison with improvement metrics | [`code-validator.ts:48-58`](./code-validator.ts) |
| `Linter` | interface | Pluggable linter contract: `name` + `lint()` method | [`code-validator.ts:64-67`](./code-validator.ts) |
| `CodeValidator` | class | Main validator orchestrator with linter selection and batch support | [`code-validator.ts:73-291`](./code-validator.ts) |
| `.validateFile(filePath)` | method | Validate a single file, returns `ValidationReport` | [`code-validator.ts:91-121`](./code-validator.ts) |
| `.validateDirectory(dirPath, extensions?)` | method | Batch validate directory with concurrency limit of 10 | [`code-validator.ts:126-142`](./code-validator.ts) |
| `.validateModification(filePath, beforeReport?)` | method | Before/after comparison returning `BeforeAfterReport` | [`code-validator.ts:147-154`](./code-validator.ts) |
| `OxlintLinter` | class | Oxlint linter for JS/TS with autofix and dry-run support | [`linters/oxlint-linter.ts:15-139`](./linters/oxlint-linter.ts) |
| `PylintLinter` | class | Pylint linter for Python via subprocess | [`linters/pylint-linter.ts:14-97`](./linters/pylint-linter.ts) |
| `BiomeLinter` | class | Biome linter for JS/TS with autofix and dry-run support | [`linters/biome-linter.ts:8-127`](./linters/biome-linter.ts) |

## Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| log | Structured logging for linter load/lint failures | `../logging/index.js` |
| readdir, readText | File system reading for validation and directory traversal | `../utils/file-ops.js` |
| exec | Shell command execution for oxlint and biome subprocesses | `../utils/shell.js` |
| child_process.exec | Shell execution for pylint subprocess | `node:child_process` |
| fs/promises | copyFile, readFile, unlink for dry-run temp file management | `node:fs/promises` |
| path | extname, join, dirname for file path operations | `node:path` |
| os | tmpdir for dry-run temporary file location | `node:os` |
| module | createRequire for resolving oxlint/biome binary paths | `node:module` |

## Configuration

| Setting | Value | Context |
|---------|-------|---------|
| Batch concurrency | 10 | Max parallel file validations in `validateDirectory()` |
| Lint timeout | 30000 ms | Timeout for oxlint and biome subprocess execution |
| Default extensions | `.ts`, `.tsx`, `.js`, `.jsx`, `.py` | File types scanned in `validateDirectory()` |
| Excluded directories | `node_modules`, `.git`, `dist`, `build`, `coverage` | Skipped during directory traversal |
| Pylint output format | `--output-format=json` | JSON parsing of pylint results |
| Oxlint output format | `--format json` | JSON parsing of oxlint diagnostics |
| Biome output format | `--reporter=json` | JSON parsing of biome diagnostics |

## Behavioral Properties

| Behavior | Detail |
|----------|--------|
| Lazy linter loading | Linters are loaded via dynamic `import()` on first use; avoids errors if binary is missing |
| Linter caching | Once loaded, linter instances are cached in a `Map<string, Linter>` for reuse |
| Graceful degradation | If a linter fails to load or is not installed, returns empty problems array with warning log |
| Dry-run autofix | OxlintLinter and BiomeLinter copy file to temp, apply fixes, compare, then delete temp file |
| Extension-based routing | `.ts/.tsx/.js/.jsx/.mjs/.cjs` -> oxlint; `.py/.pyi` -> pylint; unknown -> null (no-op) |
| Parallel directory walk | `findFiles()` uses recursive `Promise.all()` for concurrent subdirectory traversal |
| Non-zero exit handling | All linters catch non-zero exit codes (common for lint errors) and attempt JSON parsing |

## Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Linter binary not found | Dynamic import or subprocess failure | Logs `linter_load_fail`, returns `null` linter |
| Pylint not in PATH | `pylint --version` check fails | Sets `pylintAvailable = false`, returns empty problems |
| Biome not installed | `access()` check on resolved binary path fails | Throws `Error("Biome binary not found")` |
| Lint subprocess error | Non-zero exit code from oxlint/pylint/biome | Attempts to parse stdout/stderr as JSON; returns empty on failure |
| JSON parse failure | `JSON.parse()` throws on malformed output | Catches silently, returns empty problems array |
| Dry-run temp file | `finally` block cleanup | Calls `unlink(tempFile).catch(() => {})` to ensure temp is removed |

## Observability

| Component | Event | Level | Tag |
|-----------|-------|-------|-----|
| CodeValidator | `linter_load_fail` - linter dynamic import failed | warn | `CODEVALIDATOR` |
| OxlintLinter | `lint_fail` - oxlint subprocess error | warn | `OXLINT` |
| PylintLinter | `unavailable` - pylint not in PATH | warn | `PYLINT` |
| PylintLinter | `detected` - pylint found and available | info | `PYLINT` |
| PylintLinter | `not_in_path` - pylint version check failed | warn | `PYLINT` |
| PylintLinter | `lint_fail` - pylint subprocess error | warn | `PYLINT` |
| BiomeLinter | `lint_fail` - biome subprocess error | warn | `BIOME` |
| BiomeLinter | `not_found` - biome binary not found in node_modules | error | `BIOME` |

## Known Limitations

1. **No incremental validation** - every call re-lints the entire file; no caching of previous results.
2. **Biome not wired into CodeValidator** - `selectLinter()` maps JS/TS to oxlint only; BiomeLinter must be used directly.
3. **Pylint ignores content parameter** - `_content` is unused; pylint always reads from disk.
4. **Oxlint ignores content parameter** - `_content` is unused; oxlint always reads from disk.
5. **No ESLint support** - ESLint linter was removed; only oxlint serves the JS/TS linting role in CodeValidator.
6. **Directory traversal unbounded** - `findFiles()` has no depth limit or file count cap; very large trees may cause memory pressure.

## TypeScript Notes

- `Linter` interface uses optional `autofix` and `dryRun` parameters; PylintLinter omits them in its signature.
- `ValidationProblem.source` is typed as `string | undefined` (explicit union, not just optional).
- Linter map uses `Map<string, Linter>` with `has()`/`get()!` pattern (non-null assertion after existence check).
- Binary resolution in OxlintLinter and BiomeLinter uses `createRequire(import.meta.url)` for ESM compatibility.
- `exec` error objects are cast via `error as { stdout?: string; stderr?: string }` for subprocess output extraction.

## Files

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| [`code-validator.ts`](./code-validator.ts) | 291 | ValidationReport, ValidationProblem, BeforeAfterReport, Linter, CodeValidator | Core validator with linter selection, batch validation, and before/after comparison |
| [`linters/oxlint-linter.ts`](./linters/oxlint-linter.ts) | 139 | OxlintLinter | Oxlint integration for JS/TS with autofix, dry-run, and binary resolution |
| [`linters/pylint-linter.ts`](./linters/pylint-linter.ts) | 97 | PylintLinter | Pylint integration for Python via subprocess with availability check |
| [`linters/biome-linter.ts`](./linters/biome-linter.ts) | 127 | BiomeLinter | Biome integration for JS/TS with autofix, dry-run, and binary resolution |
