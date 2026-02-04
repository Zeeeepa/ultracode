# Prolly Tree - Versioned Graph Storage

## Overview

Prolly Tree (Probabilistic B-Tree) is a data structure for graph versioning with efficient diff between versions. The system provides:

- **Fast startup** — root hash verification instead of full scan
- **O(log n) branch sync** — efficient diff instead of tombstone queries
- **Time travel** — queries to historical graph states
- **Deduplication** — structural sharing between versions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LibSQLGraphAdapter                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ EntityOps   │  │ RelationOps │  │ Prolly Components   │  │
│  └─────────────┘  └─────────────┘  │ ┌─────────────────┐ │  │
│                                     │ │ ProllyNodeStore │ │  │
│                                     │ ├─────────────────┤ │  │
│                                     │ │ ProllyTree      │ │  │
│                                     │ ├─────────────────┤ │  │
│                                     │ │ CommitManager   │ │  │
│                                     │ ├─────────────────┤ │  │
│                                     │ │ BranchDiffCache │ │  │
│                                     │ └─────────────────┘ │  │
│                                     └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         LibSQL                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ prolly_nodes │  │ graph_commits│  │ branch_heads │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Components

### ProllyNodeStore

Content-addressed storage for tree nodes. Each node is identified by xxHash64 of its content.

**File:** `src/storage/prolly/node-store.ts`

```typescript
const nodeStore = new ProllyNodeStore({ cacheSize: 1000 });
await nodeStore.initialize(client);

// Store node (returns content hash)
const hash = await nodeStore.put({
  type: "leaf",
  data: serializedData,
  entryCount: 10,
});

// Get node
const node = await nodeStore.get(hash);

// Batch operations
const nodes = await nodeStore.getBatch(hashes);
```

**Database table:**
```sql
CREATE TABLE prolly_nodes (
  content_hash TEXT PRIMARY KEY,  -- xxHash64
  node_type TEXT NOT NULL,        -- 'internal' | 'leaf'
  data BLOB,                      -- CBOR-serialized data
  children_hashes TEXT,           -- JSON array for internal nodes
  key_range_start TEXT,
  key_range_end TEXT,
  entry_count INTEGER,
  created_at INTEGER
);
```

### ProllyTree

Core data structure — B-tree with probabilistic chunking.

**File:** `src/storage/prolly/prolly-tree.ts`

```typescript
const tree = new ProllyTree(nodeStore);
await tree.initialize();

// Build tree from entries
const entries = entities.map(e => ({
  key: e.id,
  value: serializeEntity(e)
}));
const rootHash = await tree.build(entries);

// Key lookup
const value = await tree.get("entity-id");

// Range query
const range = await tree.range("a", "z");

// Diff between trees (O(log n))
tree.setRootHash(baseRootHash);
const diff = await tree.diff(otherRootHash);
// diff = { added: [...], modified: [...], deleted: [...] }
```

**Probabilistic Chunking Algorithm:**
```typescript
const CHUNK_PATTERN = 0xFFF; // ~4KB average chunk size

function shouldSplit(keyHash: bigint): boolean {
  // Split when last 12 bits = 0
  return (keyHash & BigInt(CHUNK_PATTERN)) === 0n;
}
```

This ensures deterministic tree structure — same data always produces the same tree.

### CommitManager

Graph version management.

**File:** `src/storage/prolly/commit-manager.ts`

```typescript
const commitManager = new CommitManager();
await commitManager.initialize(client);
commitManager.setContext(projectHash, branchName);

// Create commit
const commit = await commitManager.commit(
  rootNodeHash,
  fileTreeHash,  // optional
  { entityCount: 1000, relationshipCount: 500 },
  "Indexed 50 new files"
);

// Commit history
const history = await commitManager.getHistory(100);

// Get branch HEAD
const head = await commitManager.getBranchHead();

// Time travel
const oldCommit = await commitManager.getCommit(commitHash);
const rootHash = await commitManager.getRootHashAt(commitHash);
```

**Database tables:**
```sql
CREATE TABLE graph_commits (
  commit_hash TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  parent_hash TEXT,
  root_node_hash TEXT NOT NULL,
  file_tree_hash TEXT,
  message TEXT,
  entity_count INTEGER,
  relationship_count INTEGER,
  created_at INTEGER
);

CREATE TABLE branch_heads (
  project_hash TEXT,
  branch_name TEXT,
  commit_hash TEXT,
  updated_at INTEGER,
  PRIMARY KEY (project_hash, branch_name)
);
```

### BranchDiffCache

Branch diff cache for O(1) checks instead of SQL tombstone queries.

**File:** `src/storage/prolly/branch-diff-cache.ts`

```typescript
const cache = new BranchDiffCache(nodeStore, commitManager);

// Initialize when switching to feature branch
await cache.initForBranch("main", "feature/new-api");

// O(1) checks
if (cache.isDeleted(entityId)) { /* ... */ }
if (cache.isAdded(entityId)) { /* ... */ }
if (cache.isModified(entityId)) { /* ... */ }

// Get all IDs for batch operations
const deletedIds = cache.getDeletedIds();
```

### TimeTravelManager

API for querying historical states.

**File:** `src/storage/prolly/time-travel.ts`

```typescript
const timeTravel = new TimeTravelManager(nodeStore, commitManager);

// Entity at specific commit
const entity = await timeTravel.getEntityAt(entityId, commitHash);

// Entity change history
const history = await timeTravel.getEntityHistory(entityId);
// [{ commit, change: 'added'|'modified'|'deleted', entity? }]

// Diff between commits
const diff = await timeTravel.diffCommits(commitA, commitB);

// Find commit by condition
const commit = await timeTravel.findLastModified(entityId);
```

## Integration with LibSQLGraphAdapter

```typescript
// Initialization (automatic during adapter.initialize())
// Internally calls initializeProllyComponents()

// Set context
adapter.setProllyContext(projectHash, branchName);

// Create commit after indexing
const commitHash = await adapter.createGraphCommit("Indexed project");

// Initialize diff cache for feature branch
await adapter.initBranchDiff("main");

// Check deletion (O(1))
if (adapter.isEntityDeletedOnBranch(entityId)) {
  // Entity deleted on current branch
}

// Direct access to components
const tree = adapter.getProllyTree();
const commits = adapter.getCommitManager();
```

## Data Structures

### Prolly Node

```typescript
interface ProllyNode {
  contentHash: string;      // xxHash64 of content
  type: "internal" | "leaf";
  data?: Uint8Array;        // CBOR for leaf nodes
  childrenHashes?: string[];// For internal nodes
  keyRangeStart?: string;   // Key range
  keyRangeEnd?: string;
  entryCount: number;
  createdAt: number;
}
```

### Leaf Node Data

```typescript
interface LeafNodeData {
  entries: Array<{
    key: string;      // entity.id
    value: Uint8Array; // CBOR(entity)
  }>;
}
```

### Internal Node Data

```typescript
interface InternalNodeData {
  children: Array<{
    hash: string;     // content hash of child node
    keyRangeStart: string;
    keyRangeEnd: string;
  }>;
}
```

## Diff Algorithm (O(log n))

```
compare(hashA, hashB):
  if hashA == hashB:
    return []  // Identical subtrees — SKIP!

  nodeA = get(hashA)
  nodeB = get(hashB)

  if nodeA.type == 'leaf' && nodeB.type == 'leaf':
    return diffEntries(nodeA.entries, nodeB.entries)

  // Recursively compare children with overlapping key ranges
  for each child pair with overlapping ranges:
    results += compare(childA.hash, childB.hash)

  return results
```

Key optimization: if hashes are equal, subtrees are identical and skipped entirely.

## Structural Sharing

```
Commit A (root: abc123)          Commit B (root: def456)
        │                                │
   ┌────┴────┐                     ┌────┴────┐
   │ Internal│                     │ Internal│ ← new node
   │  (xxx)  │                     │  (yyy)  │
   └────┬────┘                     └────┬────┘
   ┌────┴────┬────┐           ┌────┴────┬────┐
   ▼         ▼    ▼           ▼         ▼    ▼
 ┌───┐    ┌───┐ ┌───┐      ┌───┐    ┌───┐ ┌───┐
 │ A │    │ B │ │ C │      │ A │    │ B'│ │ C │
 └───┘    └───┘ └───┘      └───┘    └───┘ └───┘
   ↑               ↑          ↑               ↑
   └───────────────┴──────────┴───────────────┘
        Reused (single instance in DB)
```

When one entity changes, only nodes on the path from leaf to root are created. Others are reused.

## Performance

| Operation | Complexity | Description |
|-----------|------------|-------------|
| Build tree | O(n log n) | Build from n entities |
| Get by key | O(log n) | Find single entity |
| Insert/Delete | O(log n) | Create new version |
| Diff | O(k log n) | k = number of changes |
| Branch check | O(1) | Via BranchDiffCache |

## Storage

**Overhead per entity:**
- Prolly node: ~100 bytes/node × ~n/10 nodes ≈ 10 bytes/entity
- Commits: ~200 bytes/commit

**For 100k entities:**
- Prolly nodes: ~10 MB
- With 1000 commits: +200 KB

## Usage

### Creating version after indexing

```typescript
// After batch insert entities
await adapter.insertEntities(newEntities);

// Create commit
const hash = await adapter.createGraphCommit("Indexed 50 files");
console.log(`Created commit: ${hash}`);
```

### Working with feature branches

```typescript
// Switch to feature branch
adapter.setProjectContext({
  projectHash,
  branchName: "feature/api",
  baseBranch: "main"
});
adapter.setProllyContext(projectHash, "feature/api");

// Initialize diff cache
await adapter.initBranchDiff("main");

// Now all checks are O(1)
const entities = await adapter.getAllEntities();
// Automatically filters entities deleted on feature branch
```

### Time travel queries

```typescript
const timeTravel = new TimeTravelManager(
  adapter.getProllyNodeStore()!,
  adapter.getCommitManager()!
);

// Entity state from a week ago
const history = await adapter.getCommitManager()!.getHistory(100);
const weekAgo = history.find(c => c.createdAt < Date.now() - 7 * 24 * 60 * 60 * 1000);

if (weekAgo) {
  const oldEntity = await timeTravel.getEntityAt("entity-id", weekAgo.commitHash);
}
```

## Testing

```bash
# Run Prolly Tree tests
npm test -- src/storage/prolly/__tests__/

# 42 tests, 91 assertions
```

## Files

| Path | Description |
|------|-------------|
| `src/storage/prolly/types.ts` | TypeScript interfaces |
| `src/storage/prolly/node-store.ts` | Content-addressed storage |
| `src/storage/prolly/prolly-tree.ts` | B-tree with probabilistic chunking |
| `src/storage/prolly/commit-manager.ts` | Versioning |
| `src/storage/prolly/branch-diff-cache.ts` | O(1) branch diff |
| `src/storage/prolly/time-travel.ts` | Time travel API |
| `src/storage/prolly/index.ts` | Re-exports |
| `src/core/file-merkle.ts` | Merkle tree for files |
| `src/core/merkle-file-tracker.ts` | Integration with FileWatcher |

## See Also

- [Branch-aware Indexing](./branch-aware-indexing.md) — Multi-branch indexing
- [Layered Indexing](./layered-indexing.md) — Layered branch storage
