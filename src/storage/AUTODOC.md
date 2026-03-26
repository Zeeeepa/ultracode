# Storage

> Unified async data storage for the code graph and vector embeddings, built on native SQLite (better-sqlite3 / bun:sqlite) via NativeSQLiteClient with Prolly Tree versioning. Provides multi-project, multi-branch isolation through composite primary keys. Migrated from LibSQL in v6.5 for performance (prepared statement cache, sync FFI, no IPC overhead).

## Overview

The storage module is the persistence backbone of the system. It stores code entities, relationships, file metadata, and vector embeddings across 4 database files (graph.db, semantic.db, versioning.db, cache.db) using native SQLite. Data isolation across projects and branches is achieved via composite primary keys `(id, project_hash, branch_name)`. The module uses a singleton factory pattern with mutex-protected initialization, LRU caches for hot data, CBOR binary serialization for metadata, and DiskANN for efficient vector similarity search. Prolly Tree provides content-addressed graph versioning with time travel and branch diffs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ semantic-agent   │    │ indexer-agent    │    │ pattern-search   │   │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘   │
└───────────┼─────────────────────────┼─────────────────────┼─────────────┘
            │                         │                     │
            ▼                         ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GraphStorageFactory (Singleton)                     │
│  - getGraphStorage() → GraphStorageLibSQL                                │
│  - configureGraphStorage(config)                                         │
│  - setGlobalProjectContext(projectPath, branchName)                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GraphStorageLibSQL                               │
│  - Entity CRUD (insertEntity, findEntities, searchEntities...)          │
│  - Relationship CRUD (insertRelationship, getRelationshipsForEntity...) │
│  - File tracking (updateFileInfo, getFileInfo, getOutdatedFiles)        │
│  - Branch operations (findEntitiesInBranch, getEntityFromBranch...)     │
│  - Metrics (getMetrics, getStatistics)                                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        LibSQLGraphAdapter                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       unified-storage.db                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │  entities   │  │relationships│  │   files     │               │  │
│  │  │ (PK: id,    │  │ (PK: id,    │  │ (PK: path,  │               │  │
│  │  │  project,   │  │  project,   │  │  project,   │               │  │
│  │  │  branch)    │  │  branch)    │  │  branch)    │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ embeddings  │  │project_meta │  │ query_cache │               │  │
│  │  │ F32_BLOB +  │  │ incremental │  │             │               │  │
│  │  │ DiskANN idx │  │ tracking    │  │             │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        LRU Caches                                  │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐           │  │
│  │  │ embeddings   │  │ search results│  │ metadata      │           │  │
│  │  │ (10 min TTL) │  │ (2 min TTL)   │  │ (5 min TTL)   │           │  │
│  │  └──────────────┘  └───────────────┘  └───────────────┘           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Prolly Tree (Versioning Engine)                      │
│  - ProllyTree, ProllyNodeStore, CommitManager, TimeTravelManager        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Entities

### Classes

| Name | Description | Reference |
|------|-------------|-----------|
| `GraphStorageLibSQL` | Unified storage implementation for code graph and embeddings with composite-key multi-branch support | [`graph-storage-libsql.ts:45-182`](./graph-storage-libsql.ts) |
| `LibSQLGraphAdapter` | Low-level adapter managing entity/relationship/file tables and DiskANN vector index in unified SQLite | [`libsql-graph-adapter.ts:68-320`](./libsql-graph-adapter.ts) |
| `BatchOperationsLibSQL` | High-performance async batch processor for entities, relationships, and embeddings with xxHash stable IDs | [`batch-operations-libsql.ts:20-180`](./batch-operations-libsql.ts) |
| `QueryCacheManager` | LRU cache for query results with TTL-based eviction and memory bounds | [`cache-manager.ts:35-253`](./cache-manager.ts) |

### Functions

| Name | Description | Reference |
|------|-------------|-----------|
| `getGraphStorage` | Get the singleton GraphStorageLibSQL instance | [`graph-storage-factory.ts:80-95`](./graph-storage-factory.ts) |
| `configureGraphStorage` | Configure global storage settings (dimensions, metric, caching) | [`graph-storage-factory.ts:40-68`](./graph-storage-factory.ts) |
| `setGlobalProjectContext` | Set the current project and branch for isolation | [`graph-storage-factory.ts:98-115`](./graph-storage-factory.ts) |
| `getCacheManager` | Get singleton cache manager for query result caching | [`cache-manager.ts:310-315`](./cache-manager.ts) |

## Dependencies

### Internal Modules

| Module | Purpose | Interaction |
|--------|---------|-------------|
| `logging` | Structured logging | log.i, log.w, log.e, log.t with tags STORAGEFACT, LIBSQLADAPT, etc. |
| `types/storage` | Core type definitions | Entity, Relationship, GraphStorage, FileInfo, CacheManager interfaces |
| `types/semantic` | Vector types | SimilarityResult, VectorEmbedding |
| `shared/storage-paths` | Path helpers | DB path resolution, project hashing, branch detection |
| `semantic/faiss` | Branch detection | detectBaseBranch() for layered branch reads |
| `prolly/` | Graph versioning | ProllyNodeStore, CommitManager, ProllyTree, TimeTravelManager |

### External Packages

| Package | Purpose |
|---------|---------|
| `better-sqlite3` / `bun:sqlite` | Native SQLite driver (via NativeSQLiteClient) |
| `lru-cache` | LRU cache implementation for embedding/search/metadata |
| `cbor-x` | Binary metadata serialization (faster than JSON) |
| `xxhash-wasm` | Fast hashing for stable entity/relationship ID generation |
| `nanoid` | Fallback ID generation when xxHash not ready |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dimensions` | `384` | Embedding dimensions (384, 768, 1024, 4096) |
| `metric` | `"cosine"` | DiskANN distance metric (`"cosine"` or `"l2"`) |
| `compression` | `"float8"` | DiskANN neighbor compression (40-50% memory savings) |
| `searchL` | `150` | DiskANN search quality (higher = better recall, slower) |
| `insertL` | `30` | DiskANN build quality |
| `maxNeighbors` | `12` | Max DiskANN neighbors per node |
| `embeddingCache.max` | `5000` | Max cached embeddings (TTL: 10 min) |
| `searchCache.max` | `500` | Max cached search results (TTL: 2 min) |
| `metadataCache.max` | `10000` | Max cached metadata entries (TTL: 5 min) |
| `cacheManager.maxSize` | `100MB` | Query cache max memory |
| `cacheManager.maxEntries` | `2000` | Query cache max entries |
| `cacheManager.defaultTTL` | `300000` | Query cache default TTL (5 min) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Async model | Fully async (265+ await sites); sync only in Bun-only sqlite-adapter |
| Thread safety | Single-user mode; sequential batch (batchConcurrency: 1) |
| Idempotency | INSERT OR REPLACE with xxHash stable IDs; composite key dedup |
| Statefulness | Singleton factory; mutable project context; LRU cache state |
| Side effects | Cache invalidation on writes; tombstones on branch deletes; reverse relationship auto-gen |
| Initialization | Mutex-protected singleton; auto-recovery on corruption |

## Error Handling

The module uses `DatabaseCorruptionError` for detecting and recovering from SQLite corruption. Factory-level recovery auto-deletes corrupt DB files and reinitializes. CBOR decoding falls back to JSON for legacy data.

| Error | When | Recovery |
|-------|------|----------|
| `DatabaseCorruptionError` | SQLITE_CORRUPT, malformed, disk full | Auto-delete DB + lock files, reinitialize once |
| Client not initialized | Operations called before init | Throw to caller; prevented by singleton pattern |
| CBOR decode failure | Legacy JSON metadata in CBOR column | Silent fallback to JSON.parse |
| Integrity check failure | Page corruption detected in probe queries | Throws to trigger corruption handler |
| Lock file removal | Stale -wal/-shm/-journal files | Log warning, continue (ENOENT is OK) |

## Observability

| Event | Level | When |
|-------|-------|------|
| `[STORAGEFACT] creating_singleton` | info | Factory creates new instance |
| `[LIBSQLADAPT] init_complete` | info | Adapter initialized with DB path |
| `[LIBSQLADAPT] integrity_passed` | info | Quick integrity check succeeded |
| `[LIBSQLADAPT] corruption_detected` | error | SQLITE_CORRUPT found during init |
| `[STORAGE] insertEntities` | trace | Batch entity insert with count and ms |
| `[CACHEMGR] cache_hit` | debug | Query cache hit with key |
| `[CACHEMGR] pruned_stale` | info | Stale cache entries removed |
| `[BATCHOPS] context_set` | info | Batch operations context updated |

## Known Limitations

1. **Single-user mode** -- no inter-process locking; not designed for concurrent multi-process access
2. **DiskANN rebuild** -- must rebuild index on large bulk inserts (performance hit)
3. **Tombstone filtering** -- branch deletes create tombstones rather than true deletes; filtering at operation layer
4. **Conservative cache invalidation** -- search cache cleared on any write, no fine-grained invalidation
5. **Sequential batches** -- batchConcurrency: 1 for safety with native SQLite transactions
6. **Fixed dimensions** -- only [384, 768, 1024, 4096] supported; no automatic conversion
7. **Unbounded history** -- Prolly Tree stores all versions; no built-in pruning of old commits
8. **Global singleton context** -- must call setGlobalProjectContext() before switching projects
9. **CBOR type limits** -- Symbols and BigInt not serializable; fallback to JSON possible
10. **Dual runtime** -- sqlite-adapter.ts supports both Bun (bun:sqlite) and Node.js (better-sqlite3)

## TypeScript Notes

### Event Map

Reverse relationship map in LibSQLGraphAdapter:

| Forward | Reverse |
|---------|---------|
| `CALLS` | `CALLED_BY` |
| `IMPORTS` | `IMPORTED_BY` |
| `REFERENCES` | `REFERENCED_BY` |
| `EXTENDS` | `EXTENDED_BY` |
| `IMPLEMENTS` | `IMPLEMENTED_BY` |

One-directional types (EXPORTS, CONTAINS, DEPENDS_ON, MEMBER_OF, DOCUMENTS, DISPATCHES_ACTION, etc.) have no reverse.

### Module Boundary

- **Public**: `graph-storage-factory.ts` (singleton API), `graph-storage-libsql.ts` (GraphStorage interface), `cache-manager.ts`
- **Semi-public**: `libsql-graph-adapter.ts` (used by tools), `prolly/index.ts` (versioning API)
- **Private**: `libsql/*-ops.ts` (internal operation delegates, not exported from module)

Delegate pattern via function types for dependency injection:

```typescript
type ClientGetter = () => Client | null;
type ContextGetter = () => ProjectContext;
type MetadataEncoder = (metadata) => Buffer | null;
type MetadataDecoder = (data) => Record<string, unknown> | undefined;
```

## Unified Storage Tables

| Table | Description |
|-------|-------------|
| `entities` | Code entities (functions, classes, methods) with composite PK |
| `relationships` | Relationships between entities (calls, imports, extends) |
| `files` | File metadata (hash, last_indexed, entity_count) |
| `embeddings` | Vector embeddings with F32_BLOB and DiskANN index |
| `project_metadata` | Project metadata, incremental tracking |
| `query_cache` | Query result cache |
| `cooccurrence` | Term pair co-occurrence tracking |

## Usage Example

```typescript
import { getGraphStorage, configureGraphStorage, setGlobalProjectContext } from './storage/graph-storage-factory';

// Configuration (optional)
configureGraphStorage({
  dimensions: 768,
  metric: 'cosine',
  compression: 'float8'
});

// Get singleton
const storage = await getGraphStorage();

// Set project context
setGlobalProjectContext('/path/to/project', 'feature-branch');

// Entity operations
await storage.insertEntity({
  id: 'e1',
  name: 'MyClass',
  type: 'class',
  filePath: 'src/my-class.ts',
  location: { start: { line: 1, column: 0 }, end: { line: 50, column: 1 } }
});

const entities = await storage.searchEntities({
  namePattern: 'My',
  types: ['class', 'interface'],
  limit: 100
});

// Vector operations (via adapter)
const adapter = storage.getAdapter();
await adapter.insertEmbedding({
  id: 'emb1',
  content: 'function calculateTotal(items)',
  vector: new Float32Array(768),
  metadata: { entityId: 'e1', type: 'function' }
});

const similar = await adapter.searchVectors(queryVector, 10);
```

## Prolly Tree -- Graph Versioning

```typescript
const adapter = storage.getLibSQLAdapter();
const commitHash = await adapter.createGraphCommit("Index: 42 files");

const commits = await adapter.getCommitManager().getHistory(100);

for (const commit of commits) {
  const branchDiff = await adapter.getTimeTravelManager().getDiff(commit.hash, 'main');
  console.log(`Added: ${branchDiff.added.length}, Removed: ${branchDiff.removed.length}`);
}
```