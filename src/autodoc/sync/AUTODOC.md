---
module_name: sync
description: "Bidirectional synchronization between markdown files on disk and SQLite database"
status: active
language: typescript
---

# Sync

> Provides bidirectional synchronization between `.md` documentation files on disk and the AutoDoc SQLite database, with parallel file discovery, timestamp-based change detection, and single-file read/write utilities.

## Overview

The sync module bridges the gap between the file system and the database by syncing documentation in both directions. Disk-to-DB sync discovers markdown files via BFS traversal, compares file modification times against database timestamps, and only syncs newer files. DB-to-disk sync groups database documents by file path, generates markdown content, and writes files that are older than the database version. Bidirectional sync runs disk-to-DB first (to pick up user edits) then DB-to-disk (to write API-generated docs). All operations are parallelized for performance.

## Data Flow

- **Inputs**: Documentation directory path, callback functions for DB queries (`getDocsByFile`, `getAllDocs`, `saveDocument`), and concurrency settings.
- **Processing**: `findMarkdownFiles` performs BFS with parallel directory reads and stat calls. `syncDiskToDb` compares file mtimes against `lastSync` timestamps. `syncDbToDisk` groups docs by file, generates markdown, and compares DB `updatedAt` against file mtime.
- **Outputs**: `FileSyncResult` with disk-to-DB results (added/updated/errors) and DB-to-disk results (written/errors).

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `FileInfo` | interface | File path and modification time | [`file-sync.ts:41-44`](./file-sync.ts) |
| `FileSyncResult` | interface | Combined result of bidirectional sync (diskToDb + dbToDisk) | [`file-sync.ts:27-39`](./file-sync.ts) |
| `findMarkdownFiles` | function | Recursively discovers all .md files with BFS and parallel stat | [`file-sync.ts:54-108`](./file-sync.ts) |
| `syncDiskToDb` | function | Syncs newer disk files to database via provided callbacks | [`file-sync.ts:118-167`](./file-sync.ts) |
| `syncDbToDisk` | function | Syncs database documents to disk when DB is newer | [`file-sync.ts:237-291`](./file-sync.ts) |
| `syncBidirectional` | function | Full bidirectional sync: disk-to-DB then DB-to-disk | [`file-sync.ts:300-314`](./file-sync.ts) |
| `writeDocumentToDisk` | function | Writes a single document to disk, creating directories as needed | [`file-sync.ts:323-325`](./file-sync.ts) |
| `readDocumentFromDisk` | function | Reads a document from disk returning content and mtime, or null | [`file-sync.ts:331-331`](./file-sync.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `autodoc/types` | `DocEntity` type definition for document records |
| `utils/file-ops` | Optimized file operations (readdir, readText, writeFile, fileExists, stat, mkdir) |
| `utils/parallel` | `mapParallel` for concurrent file discovery and sync operations |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:path` | Path manipulation for directory traversal and file joining |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default concurrency | 8 parallel file operations |
| Max directory depth | 5 levels for markdown file discovery |
| Sync direction priority | Disk-to-DB first (preserves user edits), then DB-to-disk |

## Error Handling

File discovery silently skips unreadable directories and files that cannot be stat'd. Sync operations catch per-file errors and collect them in the `errors` array of the result rather than failing the entire operation. Directory creation for write operations uses `recursive: true` to handle missing parent directories.

## Known Limitations

- Timestamp-based change detection may miss simultaneous edits where the file and database have the same modification time.
- The `generateMarkdownFromDocs` function infers heading levels from section ID depth, which may not match the original document structure.
- Hidden directories and `node_modules` are always skipped during file discovery with no configuration option.

## Exports

- `findMarkdownFiles`
- `readDocumentFromDisk`
- `syncBidirectional`
- `syncDbToDisk`
- `syncDiskToDb`
- `writeDocumentToDisk`

## Files

| File | Description |
|------|-------------|
| [`file-sync.ts`](./file-sync.ts) | Complete sync implementation: BFS file discovery, disk-to-DB/DB-to-disk sync, bidirectional sync, single-file read/write |
| [`index.ts`](./index.ts) | Module barrel file re-exporting file-sync types and functions |
