---
module_name: modification
description: Safe, atomic code and file modification with preview, validation, snapshot rollback, and incremental embedding updates
status: production
language: TypeScript
entry_point: code-modifier.ts
exports:
  - CodeModifier
  - CodeModificationRequest
  - CodeModificationResult
  - FileOperations
  - FileOperationResult
  - CopyOptions
  - RenameOptions
  - SplitOptions
  - SynthesizeOptions
  - PreviewManager
  - DiffPreview
  - FileDiff
  - DiffHunk
dependencies:
  - ../versioning/version-manager
  - ../validation/code-validator
  - ../semantic/embedding-generator
  - ../semantic/vector-store
  - ../types/storage
  - ../parsers/incremental-parser
  - ../utils/file-ops
  - ../utils/stream-helpers
  - ../utils/comment-extractor
  - ../logging/index
  - nanoid
  - xxhash-wasm
tags:
  - code-modification
  - file-operations
  - preview
  - snapshot
  - validation
  - embedding
  - streaming
---

## Overview

Entity-based code and file modification engine with a multi-phase transactional workflow.
All destructive operations support preview-first mode, automatic snapshot creation for rollback,
before/after validation tracking, and incremental graph and embedding updates.
Handles large files (>1 MB) via streaming; uses WASM SIMD-accelerated diff when available.
Three classes collaborate: `CodeModifier` orchestrates entity replacement, `FileOperations`
provides copy/rename/split/synthesize, and `PreviewManager` generates unified diffs with
impact estimation. Operations default to preview mode (dry-run) unless explicitly applied.

## Data Flow

```
Request (modifyEntity / copy / rename / split / synthesize)
  -> [1] PreviewManager generates DiffPreview (return early if preview=true)
  -> [2] VersionManager.createSnapshot() for rollback
  -> [3] CodeValidator.validateFile() pre-check (if !skipValidation)
  -> [4] Core modification (in-memory <1 MB, streaming >1 MB)
  -> [5] GraphStorage.updateEntity() with new hash/timestamps
  -> [6] EmbeddingGenerator + VectorStore.update() (if available)
  -> [7] Import updates across project (if updateImports, rename only)
  -> [8] CodeValidator post-check, compare improvement metrics
  -> Success: return result | Error: auto-rollback via VersionManager
```

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `CodeModificationRequest` | interface | Entity modification request with preview/validation options | [`code-modifier.ts:32-39`](./code-modifier.ts) |
| `CodeModificationResult` | interface | Result with files modified, embeddings, validation report | [`code-modifier.ts:41-50`](./code-modifier.ts) |
| `CodeModifier` | class | Main entity code replacement engine | [`code-modifier.ts:56-56`](./code-modifier.ts) |
| `.initialize()` | method | Init VersionManager, PreviewManager, CodeValidator | [`code-modifier.ts:74-78`](./code-modifier.ts) |
| `.modifyEntity(request)` | method | Full 9-phase entity modification workflow | [`code-modifier.ts:83-168`](./code-modifier.ts) |
| `.rollback(snapshotId)` | method | Rollback to a specific snapshot | [`code-modifier.ts:173-176`](./code-modifier.ts) |
| `DiffPreview` | interface | Unified diff with stats and impact estimation | [`preview-manager.ts:32-46`](./preview-manager.ts) |
| `FileDiff` | interface | Single file diff with hunks in unified format | [`preview-manager.ts:48-54`](./preview-manager.ts) |
| `DiffHunk` | interface | Hunk data (old/new line ranges, diff lines) | [`preview-manager.ts:56-62`](./preview-manager.ts) |
| `PreviewManager` | class | Universal preview for all modification operations | [`preview-manager.ts:68-463`](./preview-manager.ts) |
| `.previewCodeModification(entityId, newCode)` | method | Preview entity code replacement with impact | [`preview-manager.ts:100-139`](./preview-manager.ts) |
| `.previewFileOperation(op, params)` | method | Preview copy/rename/split/synthesize | [`preview-manager.ts:144-147`](./preview-manager.ts) |
| `FileOperationResult` | interface | Result of file operation with affected counts | [`file-operations.ts:33-40`](./file-operations.ts) |
| `CopyOptions` | interface | Options for copy (preview, updateGraph) | [`file-operations.ts:42-45`](./file-operations.ts) |
| `RenameOptions` | interface | Options for rename (preview, updateImports, updateGraph) | [`file-operations.ts:47-51`](./file-operations.ts) |
| `SplitOptions` | interface | Options for split (preview, updateGraph) | [`file-operations.ts:53-56`](./file-operations.ts) |
| `SynthesizeOptions` | interface | Options for synthesize (preview, deleteOriginals, updateGraph) | [`file-operations.ts:58-62`](./file-operations.ts) |
| `FileOperations` | class | High-level file operations with graph/embedding sync | [`file-operations.ts:68-517`](./file-operations.ts) |
| `.copy(source, target, opts)` | method | Copy file/directory with streaming support | [`file-operations.ts:78-78`](./file-operations.ts) |
| `.rename(oldPath, newPath, opts)` | method | Rename with automatic import updates | [`file-operations.ts:105-105`](./file-operations.ts) |
| `.split(filePath, entityIds, opts)` | method | Extract entities to separate files | [`file-operations.ts:160-160`](./file-operations.ts) |
| `.synthesize(files, targetPath, opts)` | method | Combine multiple files into one | [`file-operations.ts:219-219`](./file-operations.ts) |

## Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| VersionManager | Snapshot creation and rollback | `../versioning/version-manager.js` |
| CodeValidator | Before/after validation and comparison | `../validation/code-validator.js` |
| EmbeddingGenerator | Generate code embeddings for vector store | `../semantic/embedding-generator.js` |
| VectorStore (type) | Update/query vector embeddings | `../semantic/vector-store.js` |
| GraphStorage (type) | Entity/relationship CRUD and queries | `../types/storage.js` |
| IncrementalParser | Re-parse for signature change detection | `../parsers/incremental-parser.js` |
| CommentExtractor | Extract and associate comments with entities | `../utils/comment-extractor.js` |
| readText, stat, writeFile, mkdir, readdir, rm, copyFile | File system operations | `../utils/file-ops.js` |
| streamReplaceRange, streamCopyFile | Streaming for large files | `../utils/stream-helpers.js` |
| log | Structured logging (info/warn/error) | `../logging/index.js` |
| nanoid | Generate unique entity IDs | `nanoid` |
| xxhash-wasm | Fast 64-bit hashing for entity signatures | `xxhash-wasm` |
| WASM diff module | SIMD-accelerated diff (optional) | `../../dist/external-tools/wasm/diff-simd/diff_simd.js` |
| readFile | File reading in PreviewManager | `node:fs/promises` |
| dirname, extname, join | Path utilities | `node:path` |

## Configuration

| Setting | Value | Context |
|---------|-------|---------|
| File size threshold | 1 MB (1024 * 1024) | In-memory (<1 MB) vs streaming (>1 MB) for code replacement and copy |
| Copy concurrency | 8 | Parallel file copies in directory copy operations |
| Encoding | `utf-8` | All file I/O operations |
| WASM diff | optional | Loaded dynamically at init; falls back to JS line-by-line diff |
| Snapshot prefix | `code-modification-{entityId}` | VersionManager snapshot naming convention |
| Preview default | `true` | All operations default to preview mode (dry-run) |

## Behavioral Properties

| Behavior | Detail |
|----------|--------|
| Atomicity | Snapshot before modification; automatic rollback on any error in the workflow |
| Preview-first | All operations return `DiffPreview` with impact stats; no side effects until `preview=false` |
| Validation tracking | Compares before/after error and warning counts; reports `netChange` improvement metric |
| Comment preservation | Scans upward from entity start for `//`, `/*`, `*` lines; preserved in replacement |
| Signature detection | Re-parses entity via IncrementalParser; triggers relationship count if signature differs |
| Graceful degradation | VectorStore unavailable: warns and continues; WASM unavailable: JS fallback diff |
| Directory recursion | Parallel `walk()` with concurrency-limited `Promise.all()` (8 concurrent copies) |
| Entity deduplication | Copy generates new entity IDs via `nanoid()`; preserves all metadata except id/filePath/timestamps |

## Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Entity not found | `!entity` check | Throws `Error("Entity {id} not found")` |
| Modification failure | try/catch in `modifyEntity` | Rolls back snapshot, rethrows error |
| Embedding generation error | try/catch in `updateEntityEmbedding` | Logs `embedding_fail`, returns `false` |
| Signature detection error | try/catch in `updateRelationships` | Logs `rel_update_fail`, returns 0 |
| WASM load failure | catch in `PreviewManager.initialize()` | Falls back to JS diff implementation |
| WASM diff runtime error | try/catch in `computeDiff()` | Falls back to JS diff for that invocation |
| VectorStore unavailable | `!this.vectorStore` check | Skips embedding update, logs warning |

## Observability

| Component | Event | Level | Tag |
|-----------|-------|-------|-----|
| CodeModifier | `init` - initialization complete | info | `CODEMOD` |
| CodeModifier | `snapshot_created` - snapshot before modification | info | `CODEMOD` |
| CodeModifier | `validate_before` / `validate_after` - validation reports | info | `CODEMOD` |
| CodeModifier | `embedding_updated` - entity embedding regenerated | info | `CODEMOD` |
| CodeModifier | `sig_changed` - signature changed, relationships detected | info | `CODEMOD` |
| CodeModifier | `mod_fail_rollback` - error during modification | error | `CODEMOD` |
| CodeModifier | `embedding_fail` / `rel_update_fail` - subsystem errors | error | `CODEMOD` |
| CodeModifier | `no_vectorstore` - VectorStore unavailable | warn | `CODEMOD` |
| PreviewManager | `wasm_diff_loaded` / `wasm_unavail_fallback` / `wasm_diff_fail` | info/warn | `PREVIEWMGR` |
| FileOperations | `emb_path_not_impl` / `emb_dup_not_impl` / `emb_merge_not_impl` | warn | `FILEOPS` |

## Known Limitations

1. **Relationship updates partial** - `updateRelationships()` detects signature changes but only returns a count; does not auto-update import statements in dependent files.
2. **Embedding file-path updates not implemented** - `updateEmbeddingsFilePath()`, `duplicateEmbeddings()`, `mergeEmbeddings()` are stubs returning 0; VectorStore lacks batch filePath update methods.
3. **WASM diff optional** - WASM SIMD module may not exist at runtime; JS fallback is simpler (line-by-line) and slower for large diffs.
4. **Comment preservation limited** - Only detects `//`, `/*`, `*` comment prefixes; scans upward from entity start and stops at first non-comment line.
5. **Import update regex-based** - Uses `from ['"]${oldPath}['"]` pattern; does not handle `require()`, dynamic imports, or re-exports.
6. **No partial-failure rollback** - If error occurs after file write but before graph update, snapshot rollback may leave graph state inconsistent.

## TypeScript Notes

- `VectorStore | null` constructor parameter; guarded by `if (!this.vectorStore)` before every use.
- Dynamic imports for heavy dependencies: `xxhash-wasm`, `IncrementalParser`, `CommentExtractor`.
- Entity type cast: `entity as unknown as ParsedEntity` in `updateEntityEmbedding()` due to storage/parser type mismatch.
- `previewFileOperation()` uses union params type with runtime `as` casts per operation branch.
- WASM path stored in `const WASM_DIFF_PATH` variable to prevent TypeScript static analysis of the import path.

## Files

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| [`code-modifier.ts`](./code-modifier.ts) | 357 | CodeModificationRequest, CodeModificationResult, CodeModifier | Entity code replacement engine with snapshot, validation, embedding, and relationship workflow |
| [`file-operations.ts`](./file-operations.ts) | 517 | FileOperationResult, CopyOptions, RenameOptions, SplitOptions, SynthesizeOptions, FileOperations | Copy/rename/split/synthesize with streaming, graph sync, and import updates |
| [`preview-manager.ts`](./preview-manager.ts) | 463 | DiffPreview, FileDiff, DiffHunk, PreviewManager | Universal diff preview with WASM SIMD acceleration and impact estimation |
