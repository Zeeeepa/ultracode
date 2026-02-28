---
module_name: versioning
description: Code snapshot management with dual-backend strategy (git stash and file-system backup) for safe rollback
status: active
language: TypeScript
entry_point: version-manager.ts
exports:
  - SnapshotMetadata
  - VersionManagerConfig
  - SnapshotListEntry
  - VersionManager
dependencies:
  - ../logging/index
  - ../utils/stream-helpers
  - xxhash-wasm
  - node:child_process
  - node:fs
  - node:fs/promises
  - node:path
tags:
  - snapshot
  - rollback
  - git-stash
  - backup
  - versioning
  - integrity
---

## Overview

Dual-backend snapshot engine that automatically selects git stash (for git repos) or
file-system `.backup/` directory (for non-git projects). On `initialize()`, it detects
whether a `.git` directory exists and picks the backend accordingly. All snapshots are
tracked via JSON metadata files stored under `<backupDir>/metadata/`. Large files (>1 MB)
are copied via streaming; all snapshot content is integrity-checked with xxHash (64-bit).
Automatic cleanup removes snapshots older than a configurable retention period.
The module is consumed by `CodeModifier` and exposed through snapshot MCP tool handlers.

## Data Flow

```
createSnapshot(description, files?)
  -> [1] Detect backend (git vs backup) from initialize()
  -> [2a] Git path: git stash push, capture stash ref, xxHash the ref
  -> [2b] Backup path: mkdir snapshot dir, stream-copy files, xxHash metadata
  -> [3] Save SnapshotMetadata JSON to <backupDir>/metadata/<id>.json
rollback(snapshotId)
  -> [1] Load metadata JSON
  -> [2a] Git: git stash apply <ref>
  -> [2b] Backup: stream-copy files back from snapshot dir to working dir
cleanup(olderThanDays?)
  -> [1] List all snapshots, filter by cutoff timestamp, delete expired
```

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `SnapshotMetadata` | interface | Full snapshot record: id, timestamp, backend, hash, paths | [`version-manager.ts:30-40`](./version-manager.ts) |
| `VersionManagerConfig` | interface | Constructor config: workingDirectory, backupDir, maxSnapshots, autoCleanupDays | [`version-manager.ts:42-47`](./version-manager.ts) |
| `SnapshotListEntry` | interface | Lightweight list entry: id, timestamp, description, backend, size, count | [`version-manager.ts:49-56`](./version-manager.ts) |
| `VersionManager` | class | Main snapshot manager with dual-backend support | [`version-manager.ts:62-506`](./version-manager.ts) |
| `.initialize()` | method | Init xxHash, detect git, ensure backup directory exists | [`version-manager.ts:79-93`](./version-manager.ts) |
| `.createSnapshot(desc, files?)` | method | Create snapshot using auto-detected backend; returns snapshot ID | [`version-manager.ts:98-108`](./version-manager.ts) |
| `.rollback(snapshotId)` | method | Restore files from a snapshot (git stash apply or file copy) | [`version-manager.ts:113-127`](./version-manager.ts) |
| `.listSnapshots(limit?)` | method | List all snapshots sorted newest-first, optional limit | [`version-manager.ts:132-164`](./version-manager.ts) |
| `.deleteSnapshot(snapshotId)` | method | Remove snapshot data and metadata (stash drop or rm -rf) | [`version-manager.ts:169-202`](./version-manager.ts) |
| `.cleanup(olderThanDays?)` | method | Delete snapshots older than retention period; returns count | [`version-manager.ts:207-223`](./version-manager.ts) |
| `.getSnapshotMetadata(id)` | method | Load and return raw metadata for a snapshot | [`version-manager.ts:228-230`](./version-manager.ts) |

## Dependencies

| Module | Purpose | Import Path |
|--------|---------|-------------|
| log | Structured logging (info/warn/error) with tag `VERSIONMGR` | `../logging/index.js` |
| streamCopyFile | Streaming file copy for files >1 MB | `../utils/stream-helpers.js` |
| xxhash-wasm | 64-bit xxHash for snapshot integrity checksums | `xxhash-wasm` |
| execSync | Synchronous git CLI commands (stash push/apply/drop, status) | `node:child_process` |
| existsSync | Quick existence checks for directories and metadata files | `node:fs` |
| mkdir, readdir, readFile, rm, stat, unlink, writeFile | Async file system operations for backup snapshots | `node:fs/promises` |
| dirname, join, relative | Path construction and normalization | `node:path` |

## Configuration

| Setting | Default | Context |
|---------|---------|---------|
| `workingDirectory` | (required) | Root project path for all operations |
| `backupDir` | `.backup` | Directory under workingDirectory for backup snapshots and metadata |
| `maxSnapshots` | `10` | Maximum number of snapshots to retain (not currently enforced on create) |
| `autoCleanupDays` | `7` | Default retention period in days for `cleanup()` |
| File size threshold | 1 MB | Files >1 MB use streaming copy; smaller files use in-memory read/write |

## Behavioral Properties

| Behavior | Detail |
|----------|--------|
| Auto-detection | Checks for `.git` directory at init; selects git-stash or file-backup backend |
| Idempotent init | Safe to call `initialize()` multiple times; re-detects git and re-creates backup dir |
| Streaming copy | Files >1 MB copied via `streamCopyFile` to avoid memory pressure |
| Integrity hashing | Every snapshot gets a 16-char xxHash64 stored in metadata for verification |
| Newest-first listing | `listSnapshots()` sorts by timestamp descending |
| Recursive walk | Backup backend traverses entire project tree excluding node_modules, .git, dist, build, coverage |
| Git stash isolation | Git snapshots use `git stash push -m` with a prefixed message for identification |
| Metadata persistence | All snapshot state stored as JSON in `<backupDir>/metadata/<id>.json` |

## Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| Not initialized | `!this.xxhashInstance` check | Throws `"VersionManager not initialized"` |
| Snapshot not found | `loadMetadata()` returns `null` | Throws `"Snapshot {id} not found"` |
| Git stash failure | try/catch around `execSync` | Throws `"Failed to create git snapshot"` with cause |
| Git apply failure | try/catch around `execSync` | Throws `"Failed to apply git stash: {ref}"` with cause |
| Backup dir missing | `existsSync` check in rollback | Throws `"Backup directory not found: {path}"` |
| Git stash ref missing | `!metadata.gitStashRef` | Throws `"Git stash reference not found in metadata"` |
| Stash drop failure | try/catch in `deleteSnapshot` | Logs warning `stash_drop_fail`, continues |
| Metadata parse error | try/catch around `JSON.parse` | Logs error `metadata_load_fail`, returns `null` |

## Observability

| Component | Event | Level | Tag |
|-----------|-------|-------|-----|
| VersionManager | `init` - backend detected (git-stash or backup) | info | `VERSIONMGR` |
| VersionManager | `git_snapshot` - git stash created with ref | info | `VERSIONMGR` |
| VersionManager | `backup_snapshot` - backup created with file count and size | info | `VERSIONMGR` |
| VersionManager | `rolled_back` - rollback completed | info | `VERSIONMGR` |
| VersionManager | `snapshot_deleted` - snapshot removed | info | `VERSIONMGR` |
| VersionManager | `cleanup_done` - cleanup finished with deleted count | info | `VERSIONMGR` |
| VersionManager | `no_changes` - git status clean, nothing to stash | warn | `VERSIONMGR` |
| VersionManager | `stash_drop_fail` - could not drop git stash | warn | `VERSIONMGR` |
| VersionManager | `metadata_load_fail` - JSON parse error on metadata | error | `VERSIONMGR` |

## Known Limitations

1. **maxSnapshots not enforced** - The `maxSnapshots` config is stored but never checked during `createSnapshot`; cleanup must be called explicitly.
2. **Git stash size unknown** - `totalSizeBytes` is always 0 for git-backend snapshots because git stash size is not easily determined.
3. **Synchronous git calls** - All git commands use `execSync`, which blocks the event loop during stash/apply/drop operations.
4. **No partial file snapshot** - Git backend stashes the entire working tree; the `files` parameter is recorded in metadata but does not limit what git stashes.
5. **Backup walk excludes fixed patterns** - Hardcoded exclusion list (node_modules, .git, dist, build, coverage); not configurable.
6. **No concurrent snapshot safety** - No locking mechanism; concurrent `createSnapshot` calls could produce conflicting state.

## TypeScript Notes

- `xxhashInstance` typed as `Awaited<ReturnType<typeof xxhash>> | null`; guarded by null check before use.
- `Required<VersionManagerConfig>` used internally to ensure all optional fields have defaults.
- `walk()` is a nested async function inside `getAllTrackedFiles()` with closure over `files` array.
- Git commands use `windowsHide: true` in `execSync` options for Windows compatibility.
- `Error` constructor uses ES2022 `{ cause }` option for error chaining in git operations.

## Files

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| [`version-manager.ts`](./version-manager.ts) | 507 | SnapshotMetadata, VersionManagerConfig, SnapshotListEntry, VersionManager | Dual-backend snapshot manager with git stash and file-system backup, xxHash integrity, streaming copy |
