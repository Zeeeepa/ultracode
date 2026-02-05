# Version History (Prolly Tree)

🌐 **Language**: [EN] | [RU](./history_ru.md)

---

Tools for working with versioned graph history using Prolly Tree storage. Enables time travel, commit comparison, and entity change tracking.

---

## list_commits

List graph commits (version snapshots) for the current branch.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | no | Project directory path |
| `branchName` | string | no | Branch name (default: current) |
| `limit` | number | no | Maximum commits to return (default: 100) |

### Returns

```typescript
{
  commits: Array<{
    hash: string;           // Commit hash (16 chars)
    message: string;        // Commit message
    entityCount: number;    // Entities in this snapshot
    relationshipCount: number;
    createdAt: string;      // ISO timestamp
    parentHash: string | null;
  }>;
  total: number;
}
```

### Examples

```
list_commits({ limit: 10 })
```

---

## get_entity_history

Get change history for a specific entity across commits. Shows when entity was added, modified, or deleted.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | no | Project directory path |
| `entityId` | string | yes | Entity ID to get history for |
| `limit` | number | no | Maximum commits to return (default: 50) |

### Returns

```typescript
{
  entityId: string;
  history: Array<{
    commitHash: string;
    commitMessage: string;
    timestamp: string;
    changeType: "added" | "modified" | "deleted";
    entity?: Entity;        // Entity state at this commit (if not deleted)
  }>;
  total: number;
}
```

### Examples

```
get_entity_history({ entityId: "abc123def456" })
```

---

## diff_commits

Compare two graph commits and show differences (added, modified, deleted entities).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | no | Project directory path |
| `commitA` | string | yes | First commit hash (older) |
| `commitB` | string | no | Second commit hash (newer, default: HEAD) |
| `includeEntities` | boolean | no | Include full entity data in diff (default: false) |

### Returns

```typescript
{
  commitA: string;
  commitB: string;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    total: number;
  };
  changes: {
    added: Array<{ id: string; name: string; type: string; entity?: Entity }>;
    modified: Array<{ id: string; name: string; type: string; before?: Entity; after?: Entity }>;
    deleted: Array<{ id: string; name: string; type: string; entity?: Entity }>;
  };
}
```

### Examples

**Compare commits:**
```
diff_commits({
  commitA: "abc123def456",
  commitB: "xyz789abc012"
})
```

**With full entity data:**
```
diff_commits({
  commitA: "abc123def456",
  includeEntities: true
})
```

---

## checkout_commit

Time travel — view the graph state at a specific commit. Can retrieve specific entity or search entities in historical state.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | no | Project directory path |
| `commitHash` | string | yes | Commit hash to view |
| `entityId` | string | no | Specific entity to retrieve |
| `query` | string | no | Search entities in historical state |
| `limit` | number | no | Maximum results (default: 100) |
| `offset` | number | no | Pagination offset (default: 0) |

### Returns

```typescript
{
  commitHash: string;
  commitMessage: string;
  timestamp: string;
  // If entityId specified:
  entity?: Entity;
  // If query specified or no filters:
  entities?: Array<Entity>;
  pagination?: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
```

### Examples

**View specific entity at commit:**
```
checkout_commit({
  commitHash: "abc123def456",
  entityId: "xyz789"
})
```

**Search in historical state:**
```
checkout_commit({
  commitHash: "abc123def456",
  query: "authentication"
})
```

---

## Use Cases

### Track Recent Changes

```typescript
// 1. List recent commits
const { commits } = await list_commits({ limit: 5 });

// 2. Compare latest with previous
if (commits.length >= 2) {
  const diff = await diff_commits({
    commitA: commits[1].hash,
    commitB: commits[0].hash
  });
  console.log(`Changed: ${diff.summary.total} entities`);
}
```

### Debug Entity Changes

```typescript
// Find when entity was last modified
const history = await get_entity_history({
  entityId: "abc123",
  limit: 10
});

for (const change of history.history) {
  console.log(`${change.timestamp}: ${change.changeType}`);
}
```

### Time Travel for Investigation

```typescript
// View entity state before it was deleted
const oldState = await checkout_commit({
  commitHash: "older-commit-hash",
  entityId: "deleted-entity-id"
});

console.log("Entity before deletion:", oldState.entity);
```

---

## Integration with analyze_hotspots

The `analyze_hotspots` tool uses Prolly Tree history for change frequency calculation:

```typescript
// Enable historical metrics (default: true)
analyze_hotspots({
  metric: "changes",
  includeHistoricalMetrics: true,
  lookbackDays: 30
})
```

Results include:
- `changeFrequency` — number of changes in lookback period
- `changeFrequencyScore` — normalized score (0-100)
- `changeSource` — "prolly" | "git" | "none"
