# Snapshots and Rollback

🌐 **Language**: [EN] | [RU](./snapshots_ru.md)

---

Tools for creating restore points and safe change rollback.

---

## create_snapshot

Create snapshot of current state for rollback capability. Uses git stash if available, otherwise `.backup/` directory.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `description` | string | no | Snapshot description |
| `files` | string[] | no | Specific files (default all modified) |
| `includeUntracked` | boolean | no | Include untracked files |

### Returns

```typescript
{
  success: boolean;
  snapshotId: string;
  description: string;
  timestamp: string;
  files: string[];
  method: "git_stash" | "backup_directory";
  size: number;                 // Size in bytes
}
```

### Examples

**Snapshot all changes:**
```
create_snapshot({
  description: "Before refactoring AuthService"
})
```

**Snapshot specific files:**
```
create_snapshot({
  description: "Backup utils",
  files: ["src/utils/validators.ts", "src/utils/formatters.ts"]
})
```

---

## undo

Rollback to previous snapshot. Restores all files to snapshot state.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `snapshotId` | string | yes | Snapshot ID to rollback to |
| `force` | boolean | no | Force rollback even with conflicts |

### Returns

```typescript
{
  success: boolean;
  snapshotId: string;
  restoredFiles: string[];
  conflicts?: Array<{
    file: string;
    reason: string;
  }>;
}
```

### Examples

```
undo({ snapshotId: "snap_abc123" })
```

---

## list_snapshots

List available snapshots with creation time and description.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Maximum results |
| `since` | string | no | Start date (ISO format) |

### Returns

```typescript
{
  snapshots: Array<{
    snapshotId: string;
    description: string;
    timestamp: string;
    files: string[];
    size: number;
    method: "git_stash" | "backup_directory";
  }>;
  totalCount: number;
  totalSize: number;
}
```

### Examples

```
list_snapshots({ limit: 10 })
```

---

## cleanup_snapshots

Remove old snapshots to free space.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keep` | number | no | Number of recent snapshots to keep |
| `olderThan` | string | no | Delete older than specified date |
| `dryRun` | boolean | no | Show what will be deleted |

### Returns

```typescript
{
  success: boolean;
  deletedSnapshots: string[];
  keptSnapshots: string[];
  freedSpace: number;
  dryRun: boolean;
}
```

### Examples

**Preview:**
```
cleanup_snapshots({ keep: 5, dryRun: true })
```

**Cleanup:**
```
cleanup_snapshots({ olderThan: "2024-01-01" })
```
