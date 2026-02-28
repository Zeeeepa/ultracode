---
module_name: multipass
description: "Multi-pass parser orchestrator with OXC fast pass and TypeScript API detailed pass"
status: active
language: typescript
---

# Multipass

> Implements a tiered parsing strategy for TypeScript/JavaScript: a fast OXC-based structural pass followed by an on-demand TypeScript API detailed pass, providing 3-10x speedup for large codebases.

## Overview

This module provides the `MultiPassOrchestrator` that coordinates two parsing phases. Phase 1 uses the OXC parser (Rust-based, ~2x faster than SWC) for fast structural analysis at ~0.5-2ms per file, extracting entities, imports, exports, and complexity scores. Phase 2 uses the TypeScript Compiler API for full type analysis on files that exceed a configurable complexity threshold. Low-complexity files skip the detailed pass entirely. The orchestrator manages caching, batch strategy, and worker pool allocation.

## Data Flow

- **Inputs**: File paths and source code strings for TypeScript/JavaScript files
- **Processing**: Phase 1 OXC fast parse for all files, complexity scoring, Phase 2 TS API selective parse with parallel workers
- **Outputs**: `QuickParseResult` (fast) and `ParseResult` (detailed) per file, with batch strategy classification

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `MultiPassOrchestrator` | class | Orchestrates tiered parsing strategy | [`multipass-orchestrator.ts:38-405`](./multipass-orchestrator.ts) |
| `fastParse` | function | OXC-based fast parse for a single file | [`oxc-fast-parser.ts`](./oxc-fast-parser.ts) |
| `fastParseBatch` | function | OXC-based batch parse for multiple files | [`oxc-fast-parser.ts`](./oxc-fast-parser.ts) |
| `QuickParseResult` | interface | Result from fast OXC pass | [`types.ts:36-52`](./types.ts) |
| `QuickEntity` | interface | Lightweight entity from fast pass | [`types.ts:57-68`](./types.ts) |
| `ComplexityScore` | interface | Complexity score for prioritization | [`types.ts:14-31`](./types.ts) |
| `ImportInfo` | interface | Import information | [`types.ts:73-78`](./types.ts) |
| `ExportInfo` | interface | Export information | [`types.ts:83-88`](./types.ts) |
| `BatchStrategy` | interface | Batch processing strategy classification | [`types.ts:93-100`](./types.ts) |
| `MultiPassConfig` | interface | Configuration for orchestrator | [`types.ts:105-122`](./types.ts) |
| `DEFAULT_MULTIPASS_CONFIG` | const | Default configuration values | [`types.ts:124-133`](./types.ts) |

## Dependencies

### Internal Modules
| Module | Purpose |
|--------|---------|
| `../../types/parser` | `ParseResult`, `ParserOptions` types |
| `../../logging/index` | Logging infrastructure |
| `../../utils/file-ops` | `readFilesParallel`, `readText` for file I/O |
| `../../utils/parallel` | `forEachParallel` for concurrent processing |
| `../typescript-parser` | TypeScript API parser (lazy-loaded for Phase 2) |

### External Packages
| Package | Purpose |
|---------|---------|
| `oxc-parser` | Rust-based fast parser for Phase 1 (~2x faster than SWC) |
| `@oxc-project/types` | ESTree-compatible AST type definitions |

## Behavioral Properties

| Property | Value |
|----------|-------|
| OXC parse speed | ~0.5-2ms per file |
| Overall speedup | 3-10x for large codebases |
| Default complexity threshold | 50 (files below skip detailed pass) |
| Default worker pool size | 16 threads |

## Error Handling

OXC parse failures fall back to empty results without blocking other files. TypeScript parser is lazy-loaded and errors are logged. Caching prevents re-parsing on repeated access.

## Known Limitations

- OXC fast pass does not extract type information or complex generics
- Worker pool uses OS CPU count heuristic which may not be optimal for all environments
- Detailed pass cache does not persist across sessions

## Exports



## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports orchestrator, fast parser, and types |
| `multipass-orchestrator.ts` | Main orchestrator with Phase 1/2/3 coordination, caching, and batch strategy |
| `oxc-fast-parser.ts` | OXC-based fast structural parser with entity/import/export/complexity extraction |
| `types.ts` | Type definitions for quick parse results, entities, imports, exports, complexity, config |
