---
module_name: dev
description: "File collection, extension classification, incremental indexing, and heuristic parsing utilities"
status: active
language: typescript
---

# Dev

> Utilities for collecting, classifying, and processing source code files during indexing, including incremental reindexing and a multi-phase indexing pipeline.

## Overview

The dev module provides the file discovery and classification layer for the DevAgent. It recursively scans directories using Bun.Glob or fast-glob (with `.ultracodeignore` support), classifies files by extension into code vs. data categories, and provides heuristic entity creation for unsupported languages. The module also contains the incremental indexer (file separation, vector provider setup, batch processing) and the indexing pipeline (phased initialization, change detection, stale entity cleanup, and result building).

## Data Flow

- **Inputs**: A root directory path, exclude patterns, and agent configuration.
- **Processing**: Scans directories (async via Bun.Glob/fast-glob or sync via Node.js fs), filters by supported extensions, separates files by language support, processes through parser or heuristic paths, manages incremental change detection.
- **Outputs**: `CollectFilesResult` with file paths and scan statistics; `IndexingResult` with counts of processed files, entities, and relationships.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `collectFiles` | function | Synchronously collects files with extension filtering | [`file-collector.ts:294-358`](./file-collector.ts) |
| `collectFilesAsync` | function | Async file collection using Bun.Glob or fast-glob | [`file-collector.ts:413-476`](./file-collector.ts) |
| `CollectFilesOptions` | interface | Options for file collection (patterns, agentId) | [`file-collector.ts:148-151`](./file-collector.ts) |
| `CollectFilesResult` | interface | Result with files array and scan statistics | [`file-collector.ts:153-161`](./file-collector.ts) |
| `loadIgnoreFile` | function | Loads patterns from `.ultracodeignore` | [`file-collector.ts:29-29`](./file-collector.ts) |
| `SUPPORTED_CODE_EXTENSIONS` | const | Extensions with AST parsing support | [`file-extensions.ts:12-77`](./file-extensions.ts) |
| `SUPPORTED_DATA_EXTENSIONS` | const | Extensions without AST parsing (configs, docs) | [`file-extensions.ts:44-77`](./file-extensions.ts) |
| `ALL_SUPPORTED_EXTENSIONS` | const | Combined array of all supported extensions | [`file-extensions.ts:72-72`](./file-extensions.ts) |
| `isCodeExtension` | function | Checks if extension supports AST parsing | [`file-extensions.ts:75-77`](./file-extensions.ts) |
| `isDataExtension` | function | Checks if extension is a data file | [`file-extensions.ts:80-82`](./file-extensions.ts) |
| `createHeuristicEntities` | function | Creates module entities for non-parseable files | [`heuristic-parser.ts:35-75`](./heuristic-parser.ts) |
| `separateFilesBySupport` | function | Separates files into supported and heuristic groups | [`incremental-indexer.ts:74-100`](./incremental-indexer.ts) |
| `setupVectorProvider` | function | Configures FAISS vector provider for incremental indexing | [`incremental-indexer.ts:120-169`](./incremental-indexer.ts) |
| `setupEmbeddingGenerator` | function | Configures EmbeddingGenerator for centralized mode | [`incremental-indexer.ts:178-225`](./incremental-indexer.ts) |
| `processSupportedFiles` | function | Batch-parses supported files through ParserAgent | [`incremental-indexer.ts:239-243`](./incremental-indexer.ts) |
| `processHeuristicFiles` | function | Processes unsupported files via heuristic parser | [`incremental-indexer.ts:295-298`](./incremental-indexer.ts) |
| `flushPendingEmbeddings` | function | Flushes accumulated embeddings to FAISS index | [`incremental-indexer.ts:335-366`](./incremental-indexer.ts) |
| `initializeIndexing` | function | Phase 1: validates params and collects files | [`indexing-pipeline.ts:89-112`](./indexing-pipeline.ts) |
| `detectChangedFiles` | function | Phase 2: detects changed, new, and deleted files | [`indexing-pipeline.ts:124-195`](./indexing-pipeline.ts) |
| `cleanStaleEntities` | function | Phase 3: removes entities for changed/deleted files | [`indexing-pipeline.ts:207-239`](./indexing-pipeline.ts) |
| `applyChangeAnalysis` | function | Phase 4: applies change analysis to indexing context | [`indexing-pipeline.ts:253-279`](./indexing-pipeline.ts) |
| `separateCodeAndDataFiles` | function | Phase 5: separates files by code vs data extension | [`indexing-pipeline.ts:299-325`](./indexing-pipeline.ts) |
| `buildIndexingResult` | function | Builds final indexing result summary | [`indexing-pipeline.ts:350-363`](./indexing-pipeline.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging` | Structured logging |
| `storage/graph-storage-factory` | Graph storage for change detection |
| `semantic/faiss/*` | FAISS vector provider initialization |
| `semantic/embedding-generator` | Embedding generation |
| `config/yaml-config` | Configuration loading |
| `utils/runtime` | Bun runtime detection |

### External Packages

| Package | Purpose |
|---------|---------|
| `fast-glob` | Async glob-based file scanning on Node.js |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Supported code languages | JS, TS, Python, Go, Rust, Java, C/C++, Kotlin, Swift, C#, CSS, HTML, JSON, Zig |
| Ignore file | `.ultracodeignore` (gitignore-style syntax) |
| Async scanning | Bun.Glob on Bun runtime, fast-glob on Node.js |

## Error Handling

File read errors and stat failures are logged and skipped without aborting the scan. Heuristic parser creates minimal module entities as fallback for any file that cannot be AST-parsed.

## Known Limitations

- Synchronous `collectFiles` does not use Bun.Glob (reserved for async path).
- Heuristic parser only creates a single module-level entity per file with no internal structure.
- Change detection relies on mtime comparison, which may miss files modified within the same second.

## Exports

- `collectFiles`
- `collectFilesAsync`
- `ALL_SUPPORTED_EXTENSIONS`
- `isCodeExtension`
- `isDataExtension`
- `SUPPORTED_CODE_EXTENSIONS`
- `SUPPORTED_DATA_EXTENSIONS`

## Files

| File | Description |
|------|-------------|
| `file-collector.ts` | Recursive file collection with exclude pattern support and runtime-aware scanning |
| `file-extensions.ts` | Supported file extension constants and classification functions |
| `heuristic-parser.ts` | Creates simple module entities for unsupported languages |
| `incremental-indexer.ts` | Incremental reindexing: file separation, provider setup, batch processing |
| `indexing-pipeline.ts` | Multi-phase indexing pipeline: init, change detection, cleanup, file separation |
| `index.ts` | Re-exports file collector and extension utilities |

## New (pending description)

- **VendoredDetectionResult** — `vendored-detector.ts:58-70`
- **detectVendoredDirectories** — `vendored-detector.ts:84-158`
- **<anonymous>** — `vendored-detector.ts:84-84`
- **p** — `vendored-detector.ts:115-115`
- **p** — `vendored-detector.ts:124-124`
- **detectKnownVendored** — `vendored-detector.ts:164-194`
- **<anonymous>** — `vendored-detector.ts:164-164`
- **detectArchMirrors** — `vendored-detector.ts:200-255`
- **<anonymous>** — `vendored-detector.ts:200-200`
- **detectMassHeaders** — `vendored-detector.ts:261-305`
- **<anonymous>** — `vendored-detector.ts:261-261`
- **f** — `vendored-detector.ts:292-295`
- **estimateAvgLoc** — `vendored-detector.ts:310-331`
- **<anonymous>** — `vendored-detector.ts:310-310`
- **isVendoredPath** — `vendored-detector.ts:341-350`
- **<anonymous>** — `vendored-detector.ts:341-341`
- **isSkipEmbeddingExtension** — `vendored-detector.ts:355-357`
- **<anonymous>** — `vendored-detector.ts:355-355`
- **KNOWN_VENDORED_SEGMENTS** — `vendored-detector.ts:23-37`
- **SKIP_EMBEDDING_EXTENSIONS** — `vendored-detector.ts:40-40`
- **ARCH_MIRROR_MIN_SUBDIRS** — `vendored-detector.ts:43-43`
- **MASS_HEADER_MIN_FILES** — `vendored-detector.ts:46-46`
- **MASS_HEADER_MAX_AVG_LOC** — `vendored-detector.ts:49-49`
- **LOC_SAMPLE_SIZE** — `vendored-detector.ts:52-52`
- **startTime** — `vendored-detector.ts:85-85`
- **vendoredPrefixes** — `vendored-detector.ts:86-86`
- **stats** — `vendored-detector.ts:87-87`
- **normalizedRoot** — `vendored-detector.ts:90-90`
- **dirFiles** — `vendored-detector.ts:93-93`
- **rel** — `vendored-detector.ts:95-95`
- **dir** — `vendored-detector.ts:96-96`
- **arr** — `vendored-detector.ts:97-97`
- **knownVendoredDirs** — `vendored-detector.ts:106-106`
- **archMirrorDirs** — `vendored-detector.ts:113-113`
- **massHeaderDirs** — `vendored-detector.ts:122-122`
- **rel** — `vendored-detector.ts:132-132`
- **elapsed** — `vendored-detector.ts:138-138`
- **result** — `vendored-detector.ts:165-165`
- **checked** — `vendored-detector.ts:166-166`
- **segments** — `vendored-detector.ts:169-169`
- **i** — `vendored-detector.ts:170-170`
- **seg** — `vendored-detector.ts:171-171`
- **prefix** — `vendored-detector.ts:174-174`
- **fileCount** — `vendored-detector.ts:178-178`
- **result** — `vendored-detector.ts:201-201`
- **parentToChildren** — `vendored-detector.ts:204-204`
- **parent** — `vendored-detector.ts:206-206`
- **children** — `vendored-detector.ts:208-208`
- **childFileNames** — `vendored-detector.ts:221-221`
- **files** — `vendored-detector.ts:223-223`
- **names** — `vendored-detector.ts:225-225`
- **parts** — `vendored-detector.ts:227-227`
- **allNames** — `vendored-detector.ts:234-234`
- **threshold** — `vendored-detector.ts:242-242`
- **commonFiles** — `vendored-detector.ts:243-243`
- **result** — `vendored-detector.ts:262-262`
- **prefixExtCount** — `vendored-detector.ts:266-266`
- **parts** — `vendored-detector.ts:270-270`
- **prefix** — `vendored-detector.ts:271-271`
- **extMap** — `vendored-detector.ts:273-273`
- **ext** — `vendored-detector.ts:280-280`
- **matchingFiles** — `vendored-detector.ts:292-295`
- **rel** — `vendored-detector.ts:293-293`
- **avgLoc** — `vendored-detector.ts:297-297`
- **step** — `vendored-detector.ts:314-314`
- **totalLines** — `vendored-detector.ts:315-315`
- **sampled** — `vendored-detector.ts:316-316`
- **i** — `vendored-detector.ts:318-318`
- **stat** — `vendored-detector.ts:320-320`
- **content** — `vendored-detector.ts:322-322`
- **normalized** — `vendored-detector.ts:343-343`
