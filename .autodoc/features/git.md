# Git Integration

🌐 **Language**: [EN] | [RU](./git_ru.md)

---

Tools for working with git branches and incremental indexing.

---

## list_branches

List all indexed branches of repository with metadata.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repositoryPath` | string | no | Repository path (default current directory) |

### Returns

```typescript
{
  branches: Array<{
    name: string;
    isActive: boolean;
    lastAccessed: string;
    databaseSize: number;       // Database size in bytes
    metadata: {
      entityCount: number;
      relationshipCount: number;
      lastCommit: string;
      lastIndexed: string;
    };
  }>;
  currentBranch: string;
  totalBranches: number;
}
```

### Examples

```
list_branches()
```

---

## switch_branch

Switch active branch for indexing. Changes database context to specified branch.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branch` | string | yes | Branch name |
| `repositoryPath` | string | no | Repository path |

### Returns

```typescript
{
  success: boolean;
  previousBranch: string;
  currentBranch: string;
  needsReindex: boolean;        // Whether reindexing is required
  metadata: {
    entityCount: number;
    lastIndexed: string;
  };
}
```

### Examples

```
switch_branch({ branch: "feature/new-auth" })
```

> **Note:** When switching to a branch that hasn't been indexed yet, you'll need to run `index`.

---

## get_branch_status

Detailed status of current branch — commit, entity count, database information.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repositoryPath` | string | no | Repository path |

### Returns

```typescript
{
  branch: string;
  commit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
  index: {
    entityCount: number;
    relationshipCount: number;
    fileCount: number;
    lastIndexed: string;
    isStale: boolean;           // Are there unindexed changes
  };
  database: {
    path: string;
    size: number;
    vectorsCount: number;
  };
}
```

### Examples

```
get_branch_status()
```

---

## cleanup_branches

Clean up old branches using LRU (Least Recently Used) strategy.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keep` | number | no | Number of branches to keep (default from config) |
| `dryRun` | boolean | no | Show what will be deleted without deleting |

### Returns

```typescript
{
  success: boolean;
  deletedBranches: string[];
  keptBranches: string[];
  freedSpace: number;           // Freed space in bytes
  dryRun: boolean;
}
```

### Examples

**Preview:**
```
cleanup_branches({ keep: 5, dryRun: true })
```

**Cleanup:**
```
cleanup_branches({ keep: 5 })
```

---

## get_changed_files

Get list of changed files between two branches.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fromBranch` | string | yes | Source branch |
| `toBranch` | string | yes | Target branch |

### Returns

```typescript
{
  fromBranch: string;
  toBranch: string;
  files: {
    added: string[];
    modified: string[];
    deleted: string[];
    renamed: Array<{ from: string; to: string; }>;
  };
  summary: {
    totalChanged: number;
    additions: number;
    deletions: number;
  };
}
```

### Examples

```
get_changed_files({
  fromBranch: "main",
  toBranch: "feature/new-auth"
})
```
