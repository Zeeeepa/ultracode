---
module_name: prolly
description: "Content-addressed Prolly Tree for versioned graph storage with time travel"
status: active
language: typescript
---

# Prolly

> Implements a Prolly Tree (probabilistic B-tree with Merkle hashing) for versioned graph storage, enabling O(log n) diffs between versions, time travel queries, and efficient branch synchronization.

## Overview

The prolly module provides a complete versioned storage system built on content-addressed Prolly Trees. ProllyTree uses probabilistic chunking to create deterministic node boundaries based on key hashes, enabling structural sharing between versions. ProllyNodeStore handles content-addressed node persistence with LRU caching and CBOR serialization. CommitManager tracks graph snapshots as commits with branch head pointers. TimeTravelManager provides the query API for historical lookups and cross-version diffs. BranchDiffCache optimizes feature branch reads by replacing O(n) tombstone queries with O(1) cache lookups computed once on branch switch. The recently-changed utility extracts changed entity IDs from commit history for tools like semantic_search and analyze_hotspots.

## Data Flow

- **Inputs**: Entity objects serialized to CBOR, commit messages, branch names, and project hashes.
- **Processing**: Entries are sorted, chunked into leaf nodes via probabilistic boundaries (xxHash64), and organized into a B-tree with internal nodes; commits reference the tree root hash.
- **Outputs**: GraphCommit objects, TreeDiff results (added/modified/deleted entries), entity snapshots at historical points, and BranchDiffCache for O(1) lookups.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `ProllyTree` | class | Probabilistic B-tree with build, get, insert, and O(log n) diff | [`prolly-tree.ts:33-717`](./prolly-tree.ts) |
| `serializeEntity` | function | Serializes entity objects to CBOR Uint8Array | [`prolly-tree.ts`](./prolly-tree.ts) |
| `deserializeEntity` | function | Deserializes CBOR Uint8Array back to entity objects | [`prolly-tree.ts`](./prolly-tree.ts) |
| `ProllyNodeStore` | class | Content-addressed node storage with LRU cache and CBOR serialization | [`node-store.ts:41-565`](./node-store.ts) |
| `NodeStoreConfig` | interface | Cache size and enable/disable configuration | [`node-store.ts:25-30`](./node-store.ts) |
| `CommitManager` | class | Graph versioning with commit creation and branch head management | [`commit-manager.ts:23-520`](./commit-manager.ts) |
| `TimeTravelManager` | class | Historical queries: entity history, commit diffs, entity-at-version | [`time-travel.ts:23-398`](./time-travel.ts) |
| `BranchDiffCache` | class | O(1) branch diff cache replacing tombstone queries | [`branch-diff-cache.ts:27-217`](./branch-diff-cache.ts) |
| `createCachedTombstoneGetter` | function | Creates tombstone getter backed by BranchDiffCache | [`branch-diff-cache.ts`](./branch-diff-cache.ts) |
| `getRecentlyChangedEntities` | function | Extracts recently changed entity IDs from commit history | [`recently-changed.ts:37-115`](./recently-changed.ts) |
| `GraphCommit` | interface | Commit snapshot with root hash, parent, counts, and timestamp | [`types.ts:92-122`](./types.ts) |
| `TreeDiff` | interface | Diff result with added, modified, deleted entries and statistics | [`types.ts:152-168`](./types.ts) |
| `ProllyNode` | interface | Content-addressed tree node with hash, type, and child references | [`types.ts:26-50`](./types.ts) |
| `ProllyTreeConfig` | interface | Chunk pattern, min/max leaf entries, and cache settings | [`types.ts:256-290`](./types.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging` | Structured logging |
| `storage/libsql-graph-adapter` | LibSQLGraphAdapter reference for recently-changed utility |

### External Packages

| Package | Purpose |
|---------|---------|
| `@libsql/client` | LibSQL database client for node and commit persistence |
| `cbor-x` | CBOR serialization for compact binary node storage |
| `xxhash-wasm` | xxHash64 for fast content-based hashing |
| `lru-cache` | LRU cache for hot node access in ProllyNodeStore |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Default chunk pattern | 0xFFF (~4KB average chunk size) |
| Default leaf entries | min: 4, max: 256 |
| Default node cache size | 1000 nodes LRU |

## Error Handling

CommitManager validates client initialization before operations. ProllyNodeStore returns null for missing nodes rather than throwing. TimeTravelManager returns null when commits or entities are not found at requested versions. BranchDiffCache sets cache to null when branch commits are unavailable.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MCP Tools                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ get_entity_history│  │ diff_commits     │  │ checkout_commit  │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
└───────────┼────────────────────────┼──────────────────┼─────────────────┘
            │                        │                  │
            ▼                        ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        TimeTravelManager                                 │
│  - getEntityHistory(entityId, limit)                                     │
│  - diffCommits(commitA, commitB)                                         │
│  - getEntityAt(entityId, commitHash)                                     │
│  - getAllEntitiesAt(commitHash)                                          │
│  - compareEntity(entityId, commitA, commitB)                             │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   ProllyTree      │    │  CommitManager    │    │ BranchDiffCache   │
│  - build(entries) │    │  - commit(root,   │    │ - initForBranch() │
│  - get(key)       │    │      message)     │    │ - isDeleted(id)   │
│  - insert(k, v)   │    │  - getHistory()   │    │ - O(1) lookups    │
│  - diff(other)    │    │  - getBranchHead()│    │                   │
└─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ProllyNodeStore                                   │
│  - Content-addressed node storage with LRU cache                         │
│  - Hash-based deduplication (structural sharing)                         │
│  - CBOR serialization for compact storage                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           LibSQL Database                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │prolly_nodes │  │graph_commits│  │branch_heads │  │ file_merkle │    │
│  │ hash (PK)   │  │ commitHash  │  │ branchName  │  │ (future)    │    │
│  │ data (BLOB) │  │ rootNodeHash│  │ commitHash  │  │             │    │
│  │ refCount    │  │ parentHash  │  │ projectHash │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Performance

| Operation | Complexity | Typical Time |
|----------|-----------|----------------|
| Tree building (1000 entities) | O(n log n) | ~50ms |
| Diff of two commits (1000 changes) | O(log n + k) | ~30ms |
| Entity history (50 commits) | O(k * log n) | ~100ms |
| Branch diff lookup | O(1) | <1ms |

## Key Concepts

### Prolly Tree

Prolly Tree (Probabilistic B-tree) is a B-tree where node boundaries are determined by content hash rather than fixed size. This provides:

- **Structural sharing** — identical subtrees are shared between versions
- **Efficient diff** — O(log n) version comparison via root hashes
- **Content-addressability** — nodes are identified by content hash

### Commits

Each commit contains:
- `commitHash` — unique identifier (SHA-256)
- `rootNodeHash` — Prolly Tree root at the time of the commit
- `parentHash` — reference to the previous commit
- `entityCount`, `relationshipCount` — statistics
- `message` — optional description
- `createdAt` — timestamp

### Branch Diff Cache

Optimization for feature branches:
- Instead of O(n) tombstone queries — O(1) lookup in the cache
- Cache is built when switching to a feature branch
- Contains a set of deleted entity IDs

## API

### ProllyTree

```typescript
const tree = new ProllyTree(nodeStore);
await tree.initialize();

// Build tree from entries
const entries = entities.map(e => ({
  key: e.id,
  value: serializeEntity(e)
}));
const rootHash = await tree.build(entries);

// Get value by key
const value = await tree.get(entityId);

// Compare with another version
tree.setRootHash(commitA.rootNodeHash);
const diff = await tree.diff(commitB.rootNodeHash);
// diff = { added: [...], modified: [...], deleted: [...] }
```

### CommitManager

```typescript
const commitManager = new CommitManager();
await commitManager.initialize(client);
commitManager.setContext(projectHash, branchName);

// Create a commit
const commit = await commitManager.commit(
  rootHash,
  null, // fileTreeHash
  { entityCount: 100, relationshipCount: 50 },
  "Index: 42 files"
);

// Get history
const history = await commitManager.getHistory(100);

// Get HEAD of the current branch
const head = await commitManager.getBranchHead();

// Get commits for a period (for analyze_hotspots)
const sinceTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
const recentCommits = await commitManager.getCommitsSince(sinceTimestamp, 1000);
```

### TimeTravelManager

```typescript
const timeTravel = new TimeTravelManager(nodeStore, commitManager);

// Entity change history
const history = await timeTravel.getEntityHistory(entityId, 50);
// [{commitHash, changeType: 'add'|'modify'|'delete', timestamp, oldValue?, newValue?}]

// Get entity at a specific version
const entity = await timeTravel.getEntityAt(entityId, commitHash);

// Diff between commits
const diff = await timeTravel.diffCommits(commitA, commitB);
// {fromCommit, toCommit, treeDiff: {added, modified, deleted}, commitPath}

// Compare entity between versions
const cmp = await timeTravel.compareEntity(entityId, commitA, commitB);
// {entityA, entityB, changed: boolean}
```

## MCP Tools

### list_commits

```json
{
  "commits": [
    {
      "hash": "abc123...",
      "message": "Index: 42 files",
      "entityCount": 1500,
      "relationshipCount": 3200,
      "createdAt": "2024-01-15T10:30:00Z",
      "parentHash": "def456"
    }
  ],
  "total": 15
}
```

### get_entity_history

```json
{
  "entityId": "e1a2b3c4",
  "changes": [
    {
      "commitHash": "abc123...",
      "changeType": "modify",
      "timestamp": "2024-01-15T10:30:00Z",
      "entitySnapshot": { "name": "MyClass", "type": "class" }
    },
    {
      "commitHash": "def456...",
      "changeType": "add",
      "timestamp": "2024-01-10T09:00:00Z"
    }
  ],
  "totalChanges": 2
}
```

### diff_commits

```json
{
  "commitA": "def456...",
  "commitB": "abc123...",
  "summary": {
    "added": 5,
    "modified": 12,
    "deleted": 2
  },
  "added": [{"key": "newEntity1"}],
  "modified": [{"key": "changedEntity1"}],
  "deleted": [{"key": "removedEntity1"}]
}
```

### checkout_commit

```json
{
  "commit": {
    "hash": "def456...",
    "message": "Index: 30 files",
    "entityCount": 1200,
    "createdAt": "2024-01-10T09:00:00Z"
  },
  "entity": { "id": "e1a2b3c4", "name": "MyClass", "type": "class" }
}
```

## Integration

### DevAgent

After indexing, a graph commit is automatically created:

```typescript
// In performRealIndexing() and handleIncrementalReindex()
const adapter = storage.getLibSQLAdapter();
if (adapter?.createGraphCommit) {
  const commitHash = await adapter.createGraphCommit(`Index: ${filesProcessed} files`);
}
```

### switch_branch

When switching to a feature branch, BranchDiffCache is initialized:

```typescript
// In SwitchBranchToolHandler.execute()
if (!baseBranches.includes(branchName)) {
  await adapter.initBranchDiff(baseBranch);
}
```

## Database Tables

### prolly_nodes

```sql
CREATE TABLE prolly_nodes (
  hash TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  ref_count INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
)
```

### graph_commits

```sql
CREATE TABLE graph_commits (
  commit_hash TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  root_node_hash TEXT NOT NULL,
  file_tree_hash TEXT,
  parent_hash TEXT,
  entity_count INTEGER NOT NULL,
  relationship_count INTEGER NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL
)
```

### branch_heads

```sql
CREATE TABLE branch_heads (
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_hash, branch_name)
)
```

## Integration with analyze_hotspots

Prolly Tree is used for calculating `changeFrequency` in `analyze_hotspots`:

```typescript
// In AnalyzeHotspotsToolHandler.preloadChangeFrequencies():
// 1. Get commits for the specified period
const recentCommits = await commitManager.getCommitsSince(sinceTimestamp);

// 2. Compare each pair of commits
for (let i = 0; i < recentCommits.length - 1; i++) {
  const diff = await timeTravel.diffCommits(parent.commitHash, current.commitHash);
  // Count changes for each entity
}

// 3. Git fallback for entities without Prolly data
const gitCount = getChangeFrequencyFromGit(filePath, lookbackDays);
```

**Schema parameters:**
- `includeHistoricalMetrics` (default: true) — use history for changeFrequency
- `lookbackDays` (default: 30) — analysis period in days

**Result:**
```json
{
  "changeFrequency": 5,
  "changeFrequencyScore": 17.92,
  "changeSource": "prolly | git | none"
}
```

## Known Limitations

- File system Merkle tree (file_tree) is defined in types but not yet fully implemented (fileCount always returns 0).
- Garbage collection for orphaned nodes is defined but not automatically triggered.
- Commit history traversal is linear (no merge commit support).

## Exports

- `BranchDiffCache`
- `createCachedTombstoneGetter`
- `CommitManager`
- `ProllyNodeStore`
- `deserializeEntity`
- `ProllyTree`
- `serializeEntity`
- `getRecentlyChangedEntities`
- `TimeTravelManager`

## Files

| File | Description |
|------|-------------|
| `branch-diff-cache.ts` | O(1) branch diff cache computed from Prolly Tree diff on branch switch |
| `commit-manager.ts` | Commit creation, branch head management, and history traversal |
| `index.ts` | Re-exports all Prolly Tree components and types |
| `node-store.ts` | Content-addressed node storage with xxHash64, LRU cache, and CBOR serialization |
| `prolly-tree.ts` | Core Prolly Tree with probabilistic chunking, build, get, insert, and O(log n) diff |
| `recently-changed.ts` | Utility for extracting recently changed entity IDs from commit history |
| `time-travel.ts` | Historical query API: entity-at-version, entity history, and commit diffs |
| `types.ts` | Complete type definitions for nodes, commits, diffs, verification, and configuration |
