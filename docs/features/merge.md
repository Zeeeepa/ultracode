# Semantic Merge

🌐 **Language**: [EN] | [RU](./merge_ru.md)

---

AI-powered tools for merging git branches with code understanding.

---

## semantic_merge

AI-powered 3-way branch merge with semantic code analysis. Automatically finds merge-base, reads files from branches and performs intelligent merge.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceBranch` | string | yes | Source branch (merge from) |
| `targetBranch` | string | yes | Target branch (merge to) |
| `dryRun` | boolean | no | Show result without applying |
| `autoResolve` | boolean | no | Automatically resolve simple conflicts |
| `conflictStrategy` | string | no | Strategy: `ours`, `theirs`, `smart` |

### Returns

```typescript
{
  success: boolean;
  mergeBase: string;              // Common ancestor
  files: {
    merged: string[];             // Successfully merged
    conflicted: string[];         // With conflicts
    autoResolved: string[];       // Automatically resolved
  };
  conflicts: Array<{
    filePath: string;
    conflictId: string;
    type: "content" | "rename" | "delete";
    description: string;
    markers: {
      start: number;
      middle: number;
      end: number;
    };
  }>;
  appliedChanges: boolean;
}
```

### Examples

**Merge preview:**
```
semantic_merge({
  sourceBranch: "feature/new-auth",
  targetBranch: "main",
  dryRun: true
})
```

**Merge with auto-resolution:**
```
semantic_merge({
  sourceBranch: "feature/new-auth",
  targetBranch: "main",
  autoResolve: true,
  conflictStrategy: "smart"
})
```

---

## analyze_merge_conflicts

Analyze potential conflicts between branches without performing merge. Classifies conflicts by severity.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sourceBranch` | string | yes | Source branch |
| `targetBranch` | string | yes | Target branch |
| `detailed` | boolean | no | Detailed analysis of each conflict |

### Returns

```typescript
{
  sourceBranch: string;
  targetBranch: string;
  canAutoMerge: boolean;
  conflicts: Array<{
    conflictId: string;
    filePath: string;
    severity: "low" | "medium" | "high" | "critical";
    type: "content" | "semantic" | "structural" | "rename" | "delete";
    description: string;
    affectedEntities: string[];
    sourceChanges: string;
    targetChanges: string;
    autoResolvable: boolean;
  }>;
  summary: {
    totalConflicts: number;
    bySeverity: Record<string, number>;
    autoResolvable: number;
  };
}
```

### Examples

```
analyze_merge_conflicts({
  sourceBranch: "feature/refactor",
  targetBranch: "main",
  detailed: true
})
```

---

## get_merge_suggestions

Get AI suggestions for resolving specific conflict. Requires `conflictId` from `analyze_merge_conflicts`.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conflictId` | string | yes | Conflict ID |
| `context` | string | no | Additional context for AI |

### Returns

```typescript
{
  conflictId: string;
  suggestions: Array<{
    strategy: string;
    description: string;
    code: string;
    confidence: number;
    pros: string[];
    cons: string[];
  }>;
  recommendation: {
    strategy: string;
    reason: string;
  };
}
```

### Examples

```
get_merge_suggestions({
  conflictId: "conflict_abc123",
  context: "Priority is with new authentication logic"
})
```

---

## get_semantic_merge_info

Information about semantic merge capabilities and usage examples.

### Parameters

None.

### Returns

```typescript
{
  version: string;
  capabilities: string[];
  supportedConflictTypes: string[];
  autoResolveStrategies: string[];
  examples: Array<{
    scenario: string;
    command: object;
  }>;
}
```

### Examples

```
get_semantic_merge_info()
```

---

> **More about architecture:**
> - [SEMANTIC_MERGE_ARCHITECTURE.md](SEMANTIC_MERGE_ARCHITECTURE.md)
> - [SEMANTIC_MERGE_QUICKSTART.md](SEMANTIC_MERGE_QUICKSTART.md)
