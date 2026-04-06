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
```

## Configuration & Constants

| Config | Default | Purpose |
|--------|---------|---------|
| `metric` | `"cosine"` | Vector similarity metric (cosine, l2, ip) |
| `dimensions` | `768` | Vector embedding dimensions |
| `compression` | none | Optional compression (float8, float16) |
| `efConstruction` | `200` | DiskANN build quality (higher = better recall, slower) |
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

## Entity Reference

### Classes

| Entity | Location | Description |
|--------|----------|-------------|
| `MultiDbManager` | `multi-db-manager.ts:48-196` | Manages lifecycle and access to multiple SQLite database connections (graph, semantic, versioning, cache) with atomic initialization and cleanup. |
| `NativeSQLiteClient` | `native-sqlite-client.ts:42-163` | Unified SQLite client wrapper supporting both Bun (bun:sqlite) and Node.js (better-sqlite3) runtimes with prepared statement caching. |

### Interfaces & Types

| Entity | Location | Description |
|--------|----------|-------------|
| `BunSQLiteOptions` | `bun-sqlite-adapter.ts:16-20` | Configuration options for Bun's native SQLite database including filename and optional parameters. |
| `BunSQLiteRunResult` | `bun-sqlite-adapter.ts:22-25` | Result object returned from Bun SQLite statement execution containing changes count and last insert row ID. |
| `BunSQLiteStatement` | `bun-sqlite-adapter.ts:31-36` | Prepared statement interface for Bun SQLite supporting parameterized queries with `.bind()` and execution methods. |
| `BunSQLiteDatabase` | `bun-sqlite-adapter.ts:41-47` | Bun's native SQLite database handle providing methods for statement preparation and transaction management. |
| `MultiDbPaths` | `multi-db-manager.ts:19-24` | Container holding file paths for all four database files (graph, semantic, versioning, cache). |
| `ResultSet` | `native-sqlite-client.ts:25-30` | Result set interface for SQLite queries containing rows array and statement metadata. |

### Functions

| Entity | Location | Description |
|--------|----------|-------------|
| `isBunRuntime` | `bun-sqlite-adapter.ts:52-59` | Detects whether the current runtime environment is Bun or Node.js. |
| `loadBunSQLite` | `bun-sqlite-adapter.ts:65-75` | Dynamically loads the Bun SQLite module with error handling for non-Bun environments. |
| `createBunDatabase` | `bun-sqlite-adapter.ts:80-83` | Creates and returns a Bun SQLite database connection with specified file path. |
| `getMultiDbPaths` | `multi-db-manager.ts:26-33` | Returns the filesystem paths for all four database files based on the provided storage directory. |

### Methods (MultiDbManager)

| Entity | Location | Description |
|--------|----------|-------------|
| `isInitialized` | `multi-db-manager.ts:59-61` | Returns whether the MultiDbManager has been initialized with database connections. |
| `initialize` | `multi-db-manager.ts:63-95` | Atomically initializes all four database connections with schema creation and integrity verification. |
| `getGraphClient` | `multi-db-manager.ts:97-99` | Returns the graph database client for code entity and relationship storage. |
| `getSemanticClient` | `multi-db-manager.ts:101-103` | Returns the semantic database client for vector embeddings. |
| `getVersioningClient` | `multi-db-manager.ts:105-107` | Returns the versioning database client for Prolly Tree commit history. |
| `getCacheClient` | `multi-db-manager.ts:109-111` | Returns the query cache database client. |
| `getPaths` | `multi-db-manager.ts:113-115` | Returns the MultiDbPaths object containing all database file paths. |
| `flushClient` | `multi-db-manager.ts:117-*` | Flushes and closes the specified database connection. |

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

### Added Entities

- **BatchOperationsLibSQL** — `batch-operations-libsql.ts:28-401`
- **DbWriteMutex** — `db-write-mutex.ts:14-66`
- **yieldToEventLoop** — `batch-operations-libsql.ts:22-22`
- **constructor** — `batch-operations-libsql.ts:38-41`
- **setProjectContext** — `batch-operations-libsql.ts:43-47`
- **setProject** — `batch-operations-libsql.ts:49-56`
- **initialize** — `batch-operations-libsql.ts:58-60`
- **destroy** — `batch-operations-libsql.ts:62-64`
- **entityKey** — `batch-operations-libsql.ts:70-75`
- **stableEntityId** — `batch-operations-libsql.ts:77-83`
- **relationshipKey** — `batch-operations-libsql.ts:85-87`
- **stableRelationshipId** — `batch-operations-libsql.ts:89-95`
- **generateReverseRelationships** — `batch-operations-libsql.ts:102-148`
- **insertEntities** — `batch-operations-libsql.ts:154-227`
- **updateEntities** — `batch-operations-libsql.ts:229-249`
- **deleteEntities** — `batch-operations-libsql.ts:251-293`
- **insertRelationships** — `batch-operations-libsql.ts:299-382`
- **optimizeBatchSize** — `batch-operations-libsql.ts:388-396`
- **getBatchSize** — `batch-operations-libsql.ts:398-400`
- **constructor** — `db-write-mutex.ts:19-21`
- **run** — `db-write-mutex.ts:27-45`
- **drain** — `db-write-mutex.ts:52-55`
- **queueDepth** — `db-write-mutex.ts:58-60`
- **label** — `db-write-mutex.ts:63-65`
- **DEFAULT_BATCH_SIZE** — `batch-operations-libsql.ts:17-17`
- **MAX_BATCH_SIZE** — `batch-operations-libsql.ts:18-18`
- **ID_LENGTH** — `batch-operations-libsql.ts:19-19`
- **resolvedBranch** — `batch-operations-libsql.ts:51-51`
- **isGlobal** — `batch-operations-libsql.ts:71-71`
- **key** — `batch-operations-libsql.ts:81-81`
- **key** — `batch-operations-libsql.ts:93-93`
- **reverseMap** — `batch-operations-libsql.ts:103-132`
- **reverse** — `batch-operations-libsql.ts:134-134`
- **reverseType** — `batch-operations-libsql.ts:136-136`
- **start** — `batch-operations-libsql.ts:158-158`
- **errors** — `batch-operations-libsql.ts:159-159`
- **{ projectHash, branchName }** — `batch-operations-libsql.ts:162-162`
- **seen** — `batch-operations-libsql.ts:166-166`
- **uniq** — `batch-operations-libsql.ts:167-167`
- **key** — `batch-operations-libsql.ts:169-169`
- **batchCount** — `batch-operations-libsql.ts:177-177`
- **batch** — `batch-operations-libsql.ts:179-179`
- **batchNum** — `batch-operations-libsql.ts:180-180`
- **entitiesWithIds** — `batch-operations-libsql.ts:184-192`
- **now** — `batch-operations-libsql.ts:185-185`
- **result** — `batch-operations-libsql.ts:195-195`
- **entities** — `batch-operations-libsql.ts:234-245`
- **start** — `batch-operations-libsql.ts:255-255`
- **errors** — `batch-operations-libsql.ts:256-256`
- **ids** — `batch-operations-libsql.ts:260-263`
- **batch** — `batch-operations-libsql.ts:266-266`
- **start** — `batch-operations-libsql.ts:303-303`
- **errors** — `batch-operations-libsql.ts:304-304`
- **{ projectHash, branchName }** — `batch-operations-libsql.ts:307-307`
- **reverseRels** — `batch-operations-libsql.ts:310-310`
- **allRelationships** — `batch-operations-libsql.ts:311-311`
- **seen** — `batch-operations-libsql.ts:321-321`
- **uniq** — `batch-operations-libsql.ts:322-322`
- **key** — `batch-operations-libsql.ts:324-324`
- **batchCount** — `batch-operations-libsql.ts:332-332`
- **batch** — `batch-operations-libsql.ts:334-334`
- **batchNum** — `batch-operations-libsql.ts:335-335`
- **relsWithIds** — `batch-operations-libsql.ts:339-346`
- **now** — `batch-operations-libsql.ts:340-340`
- **result** — `batch-operations-libsql.ts:349-349`
- **nextLink** — `db-write-mutex.ts:30-32`
- **prevLink** — `db-write-mutex.ts:33-33`
- **totalProcessed** — `batch-operations-libsql.ts:160-160`
- **i** — `batch-operations-libsql.ts:178-178`
- **totalProcessed** — `batch-operations-libsql.ts:257-257`
- **i** — `batch-operations-libsql.ts:265-265`
- **totalProcessed** — `batch-operations-libsql.ts:305-305`
- **i** — `batch-operations-libsql.ts:333-333`
- **releaseLock** — `db-write-mutex.ts:29-29`

