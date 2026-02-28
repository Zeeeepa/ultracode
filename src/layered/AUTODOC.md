---
module_name: layered
description: Three-layer symbol indexing with Git branch awareness and delta architecture
status: production
language: TypeScript
entry_point: index.ts
exports:
  - LayeredIndexManager
  - LayeredGraphIndex
  - BranchDelta
  - GitDeltaComputer
  - IncrementalUpdateQueue
  - FileChangeIntegration
  - LayeredVectorStore
  - VectorDelta
  - LayeredCacheManager
  - VectorCacheManager
  - DeltaMaintenanceService
dependencies:
  - src/core/branch-manager
  - src/core/git-watcher
  - src/core/layered-index
  - src/logging
  - src/semantic/vector-store
  - src/semantic/embedding-generator
  - src/storage/sqlite-adapter
  - src/types/layered
  - src/types/storage
  - src/utils/fast-hash
  - src/utils/simd-vector-ops
  - lru-cache
tags: [indexing, layered, delta, branch-aware, vector-search, incremental, cache, git]
---

## Overview

The **layered** module implements three-layer symbol indexing with Git branch awareness.
Each layer provides increasingly specific context:
Layer 0 (Base) holds immutable main-branch entities shared across all clients;
Layer 1 (Branch Deltas) stores per-branch committed changes relative to main;
Layer 2 (Working Deltas) is reserved for per-client uncommitted changes (future).

Delta-based composition avoids full re-indexing on branch switch.
Changes are computed from `git diff` and merged at query time.
`LayeredIndexManager` is the main facade orchestrating all components:
graph index, vector store, git delta computer, incremental update queue,
file change integration, cache managers, and the maintenance service.
The module supports both Bun (with SQLite persistence) and Node.js (in-memory only).

## Data Flow

```
GitWatcher -> FileChangeIntegration -> IncrementalUpdateQueue (300ms debounce)
  -> LayeredGraphIndex.updateEntitiesFromFile()
     Layer 0: GraphStorage base index (main branch)
     Layer 1: BranchDelta LRU cache (per-branch changes)
     Layer 2: WorkingDelta map (per-client, future)

Query path: Layer0 -> apply L1 delta -> apply L2 delta -> merged results
Vector path: Layer0 search (2K candidates) -> re-rank with L1 -> top-K results

Branch switch: ensureBranchDelta() -> cache hit | SQLite load | git diff compute
Persistence: LayeredCacheManager (entity deltas) + VectorCacheManager (vector deltas)
Maintenance: DeltaMaintenanceService compacts large deltas, cleans orphans
```

## Public API

| Export | Kind | Description | Location |
|--------|------|-------------|----------|
| `LayeredIndexManager` | class | Main facade, orchestrates all components | [`layered-index-manager.ts:127-501`](./layered-index-manager.ts) |
| `LayeredIndexManagerConfig` | interface | Configuration for the manager | [`layered-index-manager.ts:42-60`](./layered-index-manager.ts) |
| `IndexStatus` | interface | Status with entity counts and queue info | [`layered-index-manager.ts:103-121`](./layered-index-manager.ts) |
| `LayeredGraphIndex` | class | Three-layer entity/relationship index | [`layered-graph-index.ts:69-891`](./layered-graph-index.ts) |
| `BranchDelta` | class | Layer 1 entity/relationship delta | [`branch-delta.ts:19-345`](./branch-delta.ts) |
| `GitDeltaComputer` | class | Computes deltas from git diff output | [`git-delta-computer.ts:28-514`](./git-delta-computer.ts) |
| `IncrementalUpdateQueue` | class | Debounces and batches file changes | [`incremental-update-queue.ts:87-435`](./incremental-update-queue.ts) |
| `FileChangeEvent` | interface | File change notification payload | [`incremental-update-queue.ts:28-46`](./incremental-update-queue.ts) |
| `FileChangeType` | type | `"added" \| "modified" \| "deleted" \| "renamed"` | [`incremental-update-queue.ts:26-26`](./incremental-update-queue.ts) |
| `FileChangeIntegration` | class | GitWatcher to UpdateQueue bridge | [`file-change-integration.ts:61-373`](./file-change-integration.ts) |
| `FileChangeIntegrationConfig` | interface | Integration settings | [`file-change-integration.ts:26-41`](./file-change-integration.ts) |
| `LayeredVectorStore` | class | Three-layer semantic search | [`layered-vector-store.ts:46-525`](./layered-vector-store.ts) |
| `LayeredSimilarityResult` | interface | Search result with layer provenance | [`layered-vector-store.ts:34-40`](./layered-vector-store.ts) |
| `VectorDelta` | class | Layer 1 embedding changes | [`vector-delta.ts:22-372`](./vector-delta.ts) |
| `LayeredCacheManager` | class | SQLite persistence for branch deltas | [`layered-cache-manager.ts:50-460`](./layered-cache-manager.ts) |
| `VectorCacheManager` | class | SQLite persistence for vector deltas | [`vector-cache-manager.ts:137-565`](./vector-cache-manager.ts) |
| `DeltaMaintenanceService` | class | Background maintenance and compaction | [`delta-maintenance-service.ts:122-515`](./delta-maintenance-service.ts) |
| `DeltaMaintenanceConfig` | interface | Maintenance configuration | [`delta-maintenance-service.ts:42-60`](./delta-maintenance-service.ts) |
| `CompactionResult` | interface | Delta compaction outcome | [`delta-maintenance-service.ts:82-97`](./delta-maintenance-service.ts) |
| `MaintenanceStats` | interface | Maintenance run statistics | [`delta-maintenance-service.ts:62-80`](./delta-maintenance-service.ts) |

## Dependencies

| Dependency | Kind | Purpose |
|------------|------|---------|
| `src/core/branch-manager` | internal | Branch metadata and current branch detection |
| `src/core/git-watcher` | internal | File, branch, and commit change notifications |
| `src/core/layered-index` | internal | `ILayeredIndex`, `ILayeredVectorIndex` interfaces |
| `src/logging` | internal | Structured logging (`log.i`, `log.w`, `log.e`) |
| `src/semantic/vector-store` | internal | Base vector store abstraction |
| `src/semantic/embedding-generator` | internal | Lazy embedding generation for changed entities |
| `src/storage/sqlite-adapter` | internal | SQLite persistence layer (Bun-only sync API) |
| `src/types/layered` | internal | `BranchDelta`, `WorkingDelta`, config presets |
| `src/types/storage` | internal | `Entity`, `Relationship`, `GraphStorage` |
| `src/utils/fast-hash` | internal | `hashText()` for stable entity IDs |
| `src/utils/simd-vector-ops` | internal | `cosineSimilarity()` for vector ranking |
| `lru-cache` | external | LRU eviction for branch/vector delta caches |
| `node:child_process` | external | `execSync` for git commands |
| `node:events` | external | `EventEmitter` base for `IncrementalUpdateQueue` |

## Configuration

`LayeredIndexManagerConfig` accepts `workingDirectory` (required), optional
`layeredConfig`, `enableFileWatching` (default true), `enableMaintenance` (default true),
`estimatedFileCount` (for preset selection), and `debug` (default false).

Presets from `LayeredIndexConfigPresets`: `default` (small), `development` (<10K files),
`production` (10K-50K files), `server` (>50K files, vectorlite backend).

Key tuning parameters: `maxBranchDeltas` (LRU size), `enableVectorDeltas`,
`enablePersistence` (Bun auto-enabled), `compactionThreshold` (default 1000),
`debounceWindowMs` (default 300), `maxBatchSize` (default 100).

## Behavioral Properties

**Query semantics**: `Result = (L0 - deleted) U modified U added U L2`.
Layer 0 provides base results; Layer 1 filters deleted, replaces modified, adds new;
Layer 2 applies working delta when `clientId` is provided (future).

**Update semantics**: Main branch updates go to Layer 0 (`GraphStorage`);
branch updates go to Layer 1 (`BranchDelta`); uncommitted to Layer 2 (future).

**Branch operations**: `switchBranch` ensures delta exists (cache -> SQLite -> git diff -> empty).
`ensureBranchDelta` uses LRU cache with storage fallback. `deleteBranchDelta` removes from both.

**Lifecycle**: Constructor has no side effects. `initialize()` computes first delta and starts
watchers. `shutdown()` flushes updates, saves deltas, closes connections. Idempotent calls.

**Incremental updates**: Debounced 300ms, deduplicated by path (last wins),
batch >100 files logs warning. Failed files logged but do not block the batch.

## Error Handling

Git operations catch `execSync` errors, return empty diffs, log to `GITDELTA`.
File not found returns empty entity list (not an error). Parse failures log and continue.
Index queries catch exceptions, return empty results (fail-safe pattern).

`IncrementalUpdateQueue.processBatch()` accumulates per-file errors in `result.errors[]`,
emits `"error"` event on fatal batch failure, continues processing remaining files.

Error codes: `git_diff_fail`, `extract_fail`, `entity_convert_fail`, `path_query_fail`,
`batch_process_fail`, `file_process_fail`, `base_query_fail`, `rel_query_fail`,
`delta_save_fail`, `branch_handler_fail`, `commit_handler_fail`, `file_handler_fail`.

## Observability

| Component | Log Tag | Key Events |
|-----------|---------|------------|
| LayeredIndexManager | `LAYEREDMGR` | Init, preset selection, branch switch, shutdown |
| LayeredGraphIndex | `LAYEREDIDX` | Build, query timing (L0/L1/L2 ms), delta eviction |
| GitDeltaComputer | `GITDELTA` | Delta computation, git operations, entity extraction |
| IncrementalUpdateQueue | `INCQUEUE` | Enqueue, batch start/completion, errors |
| FileChangeIntegration | `FILECHANGE` | Branch change, commit, file change, full rebuild |
| LayeredCacheManager | `LAYEREDCACHE` | Init, schema creation, save/load |
| VectorCacheManager | `VECTORCACHE` | Init, serialize/deserialize |
| DeltaMaintenanceService | `DELTAMAINT` | Maintenance start/end, compaction, cleanup |

Events emitted by `IncrementalUpdateQueue`: `enqueued`, `batch-enqueued`,
`batch-processed`, `full-rebuild-triggered`, `error`, `cleared`, `stats-reset`.
`getStatus()` and `getStatusReport()` provide runtime introspection.

## Known Limitations

1. **Layer 2 not implemented** -- Working deltas infrastructure exists but `clientId` is unused.
2. **Node.js has no persistence** -- SQLite requires Bun; deltas lost on restart in Node.js.
3. **`getEntitiesByFilePath` returns empty** -- `GitDeltaComputer` relies on full scan fallback.
4. **Git-only** -- No support for non-git version control; falls back to empty deltas.
5. **Circular dependency workaround** -- `GitDeltaComputer` injected via property, not constructor.
6. **Full rebuild not triggered** -- Batch >100 logs warning but still uses incremental path.
7. **Fixed vector dimensionality** -- All branch vectors must match base store dimension.
8. **No bloom filter** -- `BranchDelta.isEmpty()` does O(n) scan instead of O(1).

## TypeScript Notes

All public methods are `async` returning `Promise<T>`. `ILayeredIndex` interface enables
dependency injection (implemented by `LayeredGraphIndex`). `GraphStorageWithExtensions`
adds optional methods (`getEntityCount`, `upsertEntities`).

Union types: `branch: string | null` (null = main), `clientId: string | null` (null = no L2).
`IncrementalUpdateQueue extends EventEmitter` with untyped string event names.
Error handling uses `error instanceof Error ? error.message : String(error)` pattern.

Debouncing uses `AbortController` with `sleep()` for timer cleanup.
`isProcessing` flag prevents concurrent batch processing (race condition protection).

## Exports

- `LayeredIndexManager`
- `BranchDelta`
- `GitDeltaComputer`
- `LayeredGraphIndex`
- `LayeredCacheManager`
- `VectorCacheManager`
- `FileChangeIntegration`
- `IncrementalUpdateQueue`
- `LayeredVectorStore`
- `VectorDelta`
- `DeltaMaintenanceService`

## Files

| File | Lines | Key Export(s) | Purpose |
|------|------:|---------------|---------|
| [`index.ts`](./index.ts) | 105 | Re-exports all | Public API entry point |
| [`layered-index-manager.ts`](./layered-index-manager.ts) | 501 | `LayeredIndexManager` | Main facade and orchestrator |
| [`layered-graph-index.ts`](./layered-graph-index.ts) | 891 | `LayeredGraphIndex` | Three-layer entity/relationship index |
| [`branch-delta.ts`](./branch-delta.ts) | 345 | `BranchDelta` | Layer 1 entity/relationship delta |
| [`git-delta-computer.ts`](./git-delta-computer.ts) | 514 | `GitDeltaComputer` | Compute deltas from git diff |
| [`incremental-update-queue.ts`](./incremental-update-queue.ts) | 435 | `IncrementalUpdateQueue` | Debounce, batch, deduplicate changes |
| [`file-change-integration.ts`](./file-change-integration.ts) | 373 | `FileChangeIntegration` | GitWatcher to UpdateQueue bridge |
| [`layered-vector-store.ts`](./layered-vector-store.ts) | 525 | `LayeredVectorStore` | Three-layer semantic search |
| [`vector-delta.ts`](./vector-delta.ts) | 372 | `VectorDelta` | Layer 1 embedding changes |
| [`layered-cache-manager.ts`](./layered-cache-manager.ts) | 460 | `LayeredCacheManager` | SQLite persistence for entity deltas |
| [`vector-cache-manager.ts`](./vector-cache-manager.ts) | 565 | `VectorCacheManager` | SQLite persistence for vector deltas |
| [`delta-maintenance-service.ts`](./delta-maintenance-service.ts) | 515 | `DeltaMaintenanceService` | Compaction, cleanup, background tasks |
