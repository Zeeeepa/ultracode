---
module_name: generator
description: "Automatic documentation generation for codebase modules and architecture"
status: active
language: typescript
---

# Generator

> Scans project directory structure, discovers modules, and generates AUTODOC.md documentation files with export tables, file listings, and architecture overviews. Supports incremental updates, LLM enhancement, and multi-language output.

## Overview

The generator module is the core documentation production engine for AutoDoc. It performs BFS scanning of project directories to discover modules (folders containing code files), extracts export information from index files, and produces structured AUTODOC.md files for each module. It also generates high-level `.autodoc/` template files (architecture, dependencies, deployment, flow, glossary, processes) and supports incremental updates that preserve user edits while keeping references and entity lists current.

## Data Flow

- **Inputs**: Root directory path, generation options (exclude patterns, max depth, concurrency, LLM flag, language, module filter), and optionally an entity extractor function for line-range resolution.
- **Processing**: BFS directory scan discovers modules, extracts exports from index files, generates markdown content per module, optionally enhances via LLM providers, and performs incremental merge with existing docs (reference updates, added/deleted entity tracking).
- **Outputs**: `GenerateResult` containing discovered `ModuleInfo[]` and generated file entries (`path`, `type`, `content`), written to disk as AUTODOC.md files and `.autodoc/` templates.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `GenerateOptions` | interface | Options for documentation generation (rootDir, autodocDir, exclude, maxDepth, concurrency) | [`doc-generator.ts:23-34`](./doc-generator.ts) |
| `GenerateResult` | interface | Result containing discovered modules and generated file entries | [`doc-generator.ts:36-45`](./doc-generator.ts) |
| `ModuleInfo` | interface | Metadata for a discovered module (name, path, files, hasIndex, exports) | [`doc-generator.ts:14-21`](./doc-generator.ts) |
| `generateArchitectureDoc` | function | Generates a project-level architecture overview document from module list | [`doc-generator.ts:369-417`](./doc-generator.ts) |
| `generateDocs` | function | Main entry point: scans modules and generates all AUTODOC.md file entries | [`doc-generator.ts:428-452`](./doc-generator.ts) |
| `generateModuleReadme` | function | Generates basic markdown README content for a single module | [`doc-generator.ts:178-219`](./doc-generator.ts) |
| `scanModules` | function | BFS scans a directory tree to discover all code modules | [`doc-generator.ts:55-61`](./doc-generator.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `autodoc/sync` | `writeDocumentToDisk` used by generate-handler-utils for file output |
| `autodoc/i18n` | Language detection for multi-language doc generation |
| `autodoc/llm` | LLM provider integration for enhanced descriptions |
| `storage/graph-storage` | Entity lookup for incremental change detection |
| `logging` | Structured logging throughout generation pipeline |
| `utils/file-ops` | File system operations (readdir, readText, fileExists) |
| `utils/parallel` | `mapParallel` for concurrent directory scanning |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:path` | Path manipulation for cross-platform module resolution |
| `node:fs` | Synchronous file I/O in general-docs and incremental-updater |
| `node:child_process` | Git repo root detection in generate-handler-utils |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default scan depth | 4 levels |
| Default concurrency | 8 parallel directory reads |
| Export limit per module | 20 (deduped) |
| Incremental merge strategy | Preserves user edits, appends new entities, marks deleted with strikethrough |

## Error Handling

File read errors during scanning are silently caught and the file/directory is skipped. Incremental update failures fall back to full overwrite mode. LLM enhancement failures are logged as warnings and generation continues with basic templates.

## Known Limitations

- Export extraction from index files uses regex, not full AST parsing; complex re-exports may be missed.
- `.autodoc/` general doc files are template-only on first creation and only have line-number references updated thereafter -- content is never auto-overwritten.
- Architecture doc generation groups modules by parent directory name only, without deeper dependency analysis.

## Exports

- `generateArchitectureDoc`
- `generateDocs`
- `generateModuleReadme`
- `scanModules`

## Files

| File | Description |
|------|-------------|
| [`doc-generator.ts`](./doc-generator.ts) | Core module scanning (BFS), export extraction, and AUTODOC.md content generation |
| [`general-docs.ts`](./general-docs.ts) | `.autodoc/` template file creation and line-number reference updating |
| [`generate-handler-utils.ts`](./generate-handler-utils.ts) | MCP tool handler orchestration: language detection, LLM enhancement, incremental/overwrite write modes |
| [`incremental-updater.ts`](./incremental-updater.ts) | Intelligent doc merging: reference extraction, change detection, section merging, deleted-entity marking |
| [`index.ts`](./index.ts) | Module barrel file re-exporting doc-generator public API |
