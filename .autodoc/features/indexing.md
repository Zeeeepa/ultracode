# Indexing

🌐 **Language**: [EN] | [RU](./indexing_ru.md)

---

Tools for codebase indexing and index management.

---

## index

Main codebase indexing tool. Parses files, builds entity graph, generates embeddings.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `directory` | string | no | Directory to index (default current) |
| `incremental` | boolean | no | Incremental indexing (only changed files) |
| `fullScan` | boolean | no | Full scan (ignore cache) |
| `reset` | boolean | no | Reset graph before indexing |
| `excludePatterns` | string[] | no | Exclusion patterns |
| `languages` | string[] | no | Limit to languages |

### Returns

```typescript
{
  success: boolean;
  directory: string;
  statistics: {
    filesScanned: number;
    filesIndexed: number;
    entitiesCreated: number;
    relationshipsCreated: number;
    embeddingsGenerated: number;
  };
  timing: {
    parseTime: number;
    indexTime: number;
    embeddingTime: number;
    totalTime: number;
  };
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}
```

### Examples

**Initial indexing:**
```
index({ directory: "/path/to/project" })
```

**Incremental indexing:**
```
index({ incremental: true })
```

**Full reindexing:**
```
index({ reset: true, fullScan: true })
```

**With filters:**
```
index({
  excludePatterns: ["**/node_modules/**", "**/*.test.ts"],
  languages: ["typescript", "javascript"]
})
```

---

## clean_index

Reset graph and full reindexing. Combination of `reset_graph` + `index`.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `directory` | string | no | Directory to index |
| `excludePatterns` | string[] | no | Exclusion patterns |

### Returns

```typescript
{
  success: boolean;
  resetStats: {
    deletedEntities: number;
    deletedRelationships: number;
  };
  indexStats: {
    filesIndexed: number;
    entitiesCreated: number;
    relationshipsCreated: number;
  };
  totalTime: number;
}
```

### Examples

```
clean_index({
  directory: "/path/to/project",
  excludePatterns: ["**/dist/**"]
})
```

---

## Indexing Configuration

Indexing parameters are configured in `parser-config.json` or via environment variables:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxFileSize` | 1MB | Maximum file size |
| `timeout` | 60s | Parsing timeout |
| `batchSize` | 50 | Files per batch |
| `workerPoolSize` | 4 | Parallel workers |
| `incrementalThreshold` | 20 | Threshold for full reindexing |

## .ultracodeignore File

To exclude files from indexing, create `.ultracodeignore` in project root:

```gitignore
# Build
**/dist/**
**/build/**
**/out/**

# Dependencies
**/node_modules/**
**/vendor/**

# Tests (optional)
**/*.test.ts
**/*.spec.ts
**/test-fixtures/**

# Generated code
**/*.generated.ts
**/generated/**
```

Syntax is analogous to `.gitignore`.
