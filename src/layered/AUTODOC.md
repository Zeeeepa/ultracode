# Layered

## Overview

The **layered** module implements a three-layer symbol indexing architecture with Git branch awareness and delta-based composition. Layer 0 (Base) holds immutable main-branch entities shared across all clients; Layer 1 (Branch Deltas) stores per-branch committed changes relative to main; Layer 2 (Working Deltas) is reserved for per-client uncommitted changes (future). Delta-based composition avoids full re-indexing on branch switch—changes are computed from `git diff` and merged at query time. `LayeredIndexManager` orchestrates all components: graph index, vector store, git delta computer, incremental update queue, file change integration, cache managers, and maintenance service.

## Flow

```
GitWatcher                File changes (added/modified/deleted/renamed)
    ↓
FileChangeIntegration    Wraps events from GitWatcher
    ↓
IncrementalUpdateQueue   Debounces (300ms), batches, deduplicates
    ↓
LayeredIndexManager      Routes to appropriate components
    ├─→ LayeredGraphIndex.updateEntitiesFromFile()
    │     ├─→ Layer 0: GraphStorage base (immutable, main branch)
    │     ├─→ Layer 1: BranchDelta LRU cache (per-branch changes)
    │     └─→ Layer 2: WorkingDelta map (per-client, uncommitted) [future]
    │
    ├─→ LayeredVectorStore.updateEmbeddings()
    │     ├─→ Layer 0: Vector index search (2K candidates)
    │     ├─→ Layer 1: VectorDelta re-rank
    │     └─→ Return top-K merged results
    │
    └─→ Cache Persistence
          ├─→ LayeredCacheManager (entity deltas → SQLite)
          ├─→ VectorCacheManager (vector deltas → SQLite)
          └─→ DeltaMaintenanceService (compaction, cleanup)

Query Path:  Layer 0 base result  →  merge Layer 1 delta  →  merge Layer 2 delta

Branch Switch:  ensureBranchDelta()  →  cache hit | SQLite load | git diff compute
```

## Main Facade

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `LayeredIndexManager` | class | `layered-index-manager.ts` | 127–501 | Main orchestrator that manages graph index, vector store, git delta computation, update queue, file change integration, cache managers, and maintenance service; provides unified interface for all indexing operations. |
| `LayeredIndexManagerConfig` | interface | `layered-index-manager.ts` | 42–60 | Configuration object for the index manager containing storage, cache, queue, and vector store settings. |
| `IndexStatus` | interface | `layered-index-manager.ts` | 103–121 | Status report with entity counts per layer, queue depth, and active branch delta information. |

## Core Components

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `LayeredGraphIndex` | class | `layered-graph-index.ts` | 69–891 | Three-layer entity and relationship index combining Layer 0 base storage with Layer 1 and Layer 2 deltas to provide merged query results. |
| `BranchDelta` | class | `branch-delta.ts` | 19–345 | Layer 1 delta storing added/modified/deleted entities and relationships relative to main branch; shared between all clients on the same branch. |
| `GitDeltaComputer` | class | `git-delta-computer.ts` | 28–514 | Computes entity and relationship deltas by parsing `git diff` output for files between two commits; extracts symbols via semantic analysis. |
| `IncrementalUpdateQueue` | class | `incremental-update-queue.ts` | 87–435 | Debounces incoming file changes (300ms), batches them, deduplicates, and emits unified update events to prevent thrashing the index. |
| `FileChangeIntegration` | class | `file-change-integration.ts` | 61–373 | Bridge adapter converting `GitWatcher` file/branch/commit change events into `FileChangeEvent` payloads for `IncrementalUpdateQueue`. |

## Types & Configuration

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `FileChangeEvent` | interface | `incremental-update-queue.ts` | 28–46 | Payload for a file system change event containing path, change type, and optional renamed-from path. |
| `FileChangeType` | type | `incremental-update-queue.ts` | 26–26 | Union of change types: `"added" \| "modified" \| "deleted" \| "renamed"`. |
| `FileChangeIntegrationConfig` | interface | `file-change-integration.ts` | 26–41 | Configuration for file change integration bridge containing queue reference and optional debounce settings. |

## Vector Management

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `LayeredVectorStore` | class | `layered-vector-store.ts` | 46–525 | Three-layer semantic search engine combining Layer 0 base embeddings with Layer 1 and Layer 2 vector deltas; re-ranks and merges results. |
| `VectorDelta` | class | `vector-delta.ts` | 22–372 | Layer 1 embedding changes storing added/modified/deleted vector mappings and similarity index state relative to Layer 0. |
| `LayeredSimilarityResult` | interface | `layered-vector-store.ts` | 34–40 | Query result with entity reference, similarity score, and source layer provenance. |

## Cache Management

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `LayeredCacheManager` | class | `layered-cache-manager.ts` | 50–460 | Persistence layer for branch entity deltas using SQLite; loads/saves `BranchDelta` state and manages LRU cache eviction. |
| `VectorCacheManager` | class | `vector-cache-manager.ts` | 137–565 | Persistence layer for vector deltas using SQLite; caches vector similarity indices and embedding mappings per branch. |

## Maintenance & Cleanup

| Entity | Type | File | Lines | Description |
|--------|------|------|-------|-------------|
| `DeltaMaintenanceService` | class | `delta-maintenance-service.ts` | 122–515 | Background service that compacts large deltas, cleans orphaned branch deltas, and gathers maintenance statistics; runs on-demand or on shutdown. |
| `DeltaMaintenanceConfig` | interface | `delta-maintenance-service.ts` | 42–60 | Configuration for maintenance tasks including enabled flag, compaction threshold, and cleanup schedule. |
| `MaintenanceStats` | interface | `delta-maintenance-service.ts` | 62–80 | Metrics from a maintenance run: branch count, entities processed, deltas compacted, orphans removed, and time elapsed. |
| `CompactionResult` | interface | `delta-maintenance-service.ts` | 82–97 | Outcome of delta compaction for a single branch including size before/after, items merged, and compaction ratio. |

## Dependencies

### Internal
- **GitWatcher**: Emits file/branch/commit change events consumed by `FileChangeIntegration`.
- **GraphStorage**: Layer 0 base—immutable main-branch entity graph shared across branches.
- **BranchManager**: Tracks current branch context; used by `DeltaMaintenanceService` for orphan detection.
- **Storage Types** (`Entity`, `Relationship`): Domain model entities persisted and indexed across layers.

### External
- **SQLite**: Persistence backend for both `LayeredCacheManager` (entity deltas) and `VectorCacheManager` (vector deltas).
- **Git CLI** (`git diff`): Used by `GitDeltaComputer` to compute structural changes between commits.
- **Semantic Analysis**: Entity/symbol extraction from source files (integrated into `GitDeltaComputer`).