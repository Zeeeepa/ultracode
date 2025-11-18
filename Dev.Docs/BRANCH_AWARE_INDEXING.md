# Branch-Aware Indexing Design

## Problem Statement

When users switch Git branches or make large code changes, the code graph index becomes stale and inaccurate. Current implementation uses a single `vectors.db` database that doesn't track branch context.

### Key Issues:
1. Index contains stale data when switching branches
2. No automatic reindexing on branch switch
3. No incremental update detection based on Git state
4. Cross-branch pollution of indexed entities

## Proposed Solution: Branch-Scoped Databases

### Architecture Overview

**Hybrid approach**: Per-branch databases + incremental synchronization + LRU eviction

```
data/
├── {repo-hash}/
│   ├── main/
│   │   ├── vectors.db
│   │   ├── metadata.json
│   │   └── query_cache.db
│   ├── develop/
│   │   ├── vectors.db
│   │   ├── metadata.json
│   │   └── query_cache.db
│   └── feature-auth/
│       ├── vectors.db
│       ├── metadata.json
│       └── query_cache.db
└── branch-registry.json
```

### Core Components

#### 1. BranchManager (`src/core/branch-manager.ts`)

**Responsibilities:**
- Detect current Git branch
- Manage branch-scoped database paths
- LRU eviction of old branch databases
- Branch metadata persistence

**API:**
```typescript
class BranchManager {
  getCurrentBranch(): string | null
  getBranchDbPath(branch: string): string
  switchBranch(newBranch: string): Promise<void>
  getActiveBranches(): BranchInfo[]
  cleanupOldBranches(keep: number): Promise<void>
  getBranchMetadata(branch: string): BranchMetadata | null
}
```

#### 2. GitWatcher (`src/core/git-watcher.ts`)

**Responsibilities:**
- Watch `.git/HEAD` for branch changes
- Detect commits and file changes via Git
- Trigger incremental reindex on changes

**API:**
```typescript
class GitWatcher {
  startWatching(dir: string): void
  stopWatching(): void
  onBranchChange(callback: (newBranch: string, oldBranch: string) => void): void
  onCommit(callback: (commitHash: string) => void): void
  getChangedFiles(since: string): Promise<string[]>
}
```

#### 3. Branch Metadata (`metadata.json`)

Stored in each branch database directory:

```json
{
  "branch": "main",
  "repositoryPath": "/path/to/repo",
  "repositoryHash": "abc123def456",
  "lastCommitHash": "commit-sha",
  "lastIndexedAt": 1705123456789,
  "fileCount": 1234,
  "entityCount": 5678,
  "relationshipCount": 8901,
  "indexVersion": "2.7.6",
  "accessedAt": 1705123456789
}
```

#### 4. Branch Registry (`data/branch-registry.json`)

Global registry of all indexed branches across repositories:

```json
{
  "repositories": {
    "abc123def456": {
      "path": "/path/to/repo",
      "branches": {
        "main": {
          "dbPath": "data/abc123def456/main",
          "lastAccessed": 1705123456789,
          "sizeBytes": 52428800
        },
        "develop": {
          "dbPath": "data/abc123def456/develop",
          "lastAccessed": 1705123400000,
          "sizeBytes": 48234800
        }
      }
    }
  },
  "config": {
    "maxBranchesPerRepo": 10,
    "maxTotalBranches": 50,
    "evictionStrategy": "LRU"
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. **BranchManager** - Basic branch detection and path resolution
2. **GitWatcher** - File system watcher for `.git/HEAD`
3. **Update SQLiteManager** - Support branch-scoped paths
4. **Branch metadata** - Persistence layer

### Phase 2: Automatic Switching

1. **Auto-detect branch changes** via GitWatcher
2. **Trigger reindex** on branch switch
3. **Incremental sync** using Git diff
4. **Event emission** via KnowledgeBus

### Phase 3: LRU Eviction & Cleanup

1. **LRU tracking** in branch registry
2. **Automatic cleanup** of old branches
3. **Configurable limits** (max branches, max size)
4. **Manual cleanup** via MCP method

### Phase 4: MCP Methods

1. `list_branches` - List all indexed branches
2. `switch_branch` - Manually switch active branch
3. `cleanup_branches` - Remove old/unused branch databases
4. `get_branch_status` - Get metadata for current branch
5. `sync_current_branch` - Force incremental sync

## Configuration

Add to `config/default.yaml`:

```yaml
indexing:
  branchAware: true                    # Enable branch-aware indexing
  autoSwitchOnBranchChange: true       # Auto-switch when Git branch changes
  maxBranchesPerRepo: 10               # Max branches to keep indexed
  maxTotalBranches: 50                 # Max total branches across all repos
  evictionStrategy: "LRU"              # LRU, LFU, or FIFO
  cleanupIntervalMs: 3600000           # Cleanup every hour
  incrementalThreshold: 20             # If >20 files changed, full reindex

git:
  enabled: true                        # Enable Git integration
  watchBranchChanges: true             # Watch for branch changes
  autoReindex: true                    # Auto-reindex on branch switch
  diffMode: "incremental"              # "incremental" or "full"
```

## Database Path Resolution

**Priority order:**

1. **Branch-scoped** (if `branchAware: true`):
   ```
   data/{repo-hash}/{branch-name}/vectors.db
   ```

2. **Fallback** (if Git not available or `branchAware: false`):
   ```
   vectors.db (current behavior)
   ```

**Repository hash calculation:**
```typescript
function getRepositoryHash(repoPath: string): string {
  const gitDir = path.join(repoPath, '.git');
  if (!fs.existsSync(gitDir)) return 'default';

  // Use Git remote URL or repo absolute path
  const remote = execSync('git remote get-url origin', { cwd: repoPath }).toString().trim();
  return xxhash(remote).slice(0, 12);
}
```

## Incremental Synchronization

When switching branches:

```typescript
async function syncBranch(oldBranch: string, newBranch: string) {
  const changedFiles = await git.diff(oldBranch, newBranch);

  if (changedFiles.length > config.incrementalThreshold) {
    // Full reindex
    await indexAll();
  } else {
    // Incremental update
    for (const file of changedFiles) {
      if (file.status === 'deleted') {
        await deleteEntities(file.path);
      } else {
        await reindexFile(file.path);
      }
    }
  }
}
```

## Benefits

1. **Isolation**: Each branch has its own database - no cross-contamination
2. **Performance**: No need to reindex when switching back to recently used branch
3. **Accuracy**: Index always reflects current branch state
4. **Scalability**: LRU eviction prevents unlimited disk usage
5. **Incremental**: Smart diff-based reindexing for efficiency

## Risks & Mitigations

### Risk 1: Disk Space Usage
- **Mitigation**: Configurable limits + LRU eviction + cleanup commands

### Risk 2: Complexity
- **Mitigation**: Graceful fallback to single-DB mode if Git unavailable

### Risk 3: Branch Name Sanitization
- **Mitigation**: Sanitize branch names for filesystem (e.g., `feature/auth` → `feature-auth`)

### Risk 4: Stale Detection
- **Mitigation**: Track last commit hash in metadata, validate on load

## Testing Strategy

1. **Unit tests**: BranchManager, GitWatcher
2. **Integration tests**: Branch switching scenarios
3. **E2E tests**: Full workflow with real Git repo
4. **Performance tests**: Incremental vs full reindex benchmarks

## Backward Compatibility

- **Default**: Branch-aware mode OFF for existing installations
- **Migration**: Auto-migrate `vectors.db` to `data/default/main/vectors.db` on first enable
- **Opt-in**: Users enable via config `indexing.branchAware: true`

## Future Enhancements

1. **Commit-level indexing**: Index at commit granularity for time-travel queries
2. **Cross-branch analysis**: Compare entities across branches
3. **Branch lineage tracking**: Understand branch relationships
4. **Shared entity detection**: Identify common code across branches
