# AutoDoc — Automatic Documentation

🌐 **Language**: [EN] | [RU](./autodoc_ru.md)

---

Automatic documentation generation, update, and search system.

---

## autodoc_init

Initialize AutoDoc for project. Configure language, documentation directory, and parameters.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `language` | string | no | Documentation language: `en`, `ru`, `zh` |
| `docsDirectory` | string | no | Documentation directory (default `.autodoc/`) |
| `enabled` | boolean | no | Enable AutoDoc |

### Returns

```typescript
{
  success: boolean;
  config: {
    language: string;
    docsDirectory: string;
    enabled: boolean;
  };
}
```

### Examples

```
autodoc_init({
  language: "en",
  docsDirectory: ".autodoc/",
  enabled: true
})
```

---

## autodoc_generate

Automatic documentation generation for codebase. Creates `.autodoc/` for general documentation and `README.md` in each module directory.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `scope` | string | no | Scope: `file`, `module`, `project` |
| `filePath` | string | no | File/module path (for scope=file/module) |
| `overwrite` | boolean | no | Overwrite existing documentation |
| `includePrivate` | boolean | no | Include private members |
| `format` | string | no | Format: `markdown`, `jsdoc`, `tsdoc` |

### Returns

```typescript
{
  success: boolean;
  documentsGenerated: number;
  files: Array<{
    filePath: string;
    entities: number;
    sections: number;
  }>;
}
```

### Examples

**Generate for entire project:**
```
autodoc_generate({
  scope: "project",
  overwrite: false,
  includePrivate: false
})
```

**Generate for module:**
```
autodoc_generate({
  scope: "module",
  filePath: "src/services/",
  format: "markdown"
})
```

---

## autodoc_save

Save markdown document. Parses sections, extracts code references, and indexes for search.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `filePath` | string | yes | Documentation file path |
| `content` | string | yes | Content in markdown |
| `metadata` | object | no | Additional metadata |

### Returns

```typescript
{
  success: boolean;
  documentId: string;
  sections: number;
  referencesFound: number;
  indexed: boolean;
}
```

### Examples

```
autodoc_save({
  filePath: ".autodoc/authentication.md",
  content: `
# Authentication

## Overview
Authentication module uses [AuthService](src/services/auth.ts#AuthService).

## API
- [login](src/services/auth.ts#login) — user login
- [logout](src/services/auth.ts#logout) — user logout
`
})
```

---

## autodoc_get

Get documentation by ID or file path.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `documentId` | string | yes* | Document ID |
| `filePath` | string | yes* | File path |

*Specify either `documentId` or `filePath`

### Returns

```typescript
{
  documentId: string;
  filePath: string;
  content: string;
  sections: Array<{
    title: string;
    level: number;
    content: string;
  }>;
  references: Array<{
    text: string;
    entityId: string;
  }>;
  metadata: object;
  lastUpdated: string;
}
```

### Examples

```
autodoc_get({ filePath: ".autodoc/authentication.md" })
```

---

## autodoc_search

Search documentation using semantic search.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `query` | string | yes | Search query |
| `limit` | number | no | Maximum results |
| `filePattern` | string | no | File filter |

### Returns

```typescript
{
  results: Array<{
    documentId: string;
    filePath: string;
    section: string;
    snippet: string;
    score: number;
  }>;
  totalFound: number;
}
```

### Examples

```
autodoc_search({
  query: "how to configure authentication",
  limit: 10
})
```

---

## autodoc_validate

Validate documentation links. Checks that all code references point to existing entities.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `filePath` | string | no | Specific file path (or all files) |
| `fix` | boolean | no | Try to fix broken links |

### Returns

```typescript
{
  valid: boolean;
  documents: number;
  references: number;
  brokenReferences: Array<{
    documentPath: string;
    reference: string;
    suggestion?: string;
  }>;
}
```

### Examples

```
autodoc_validate({ fix: false })
```

---

## autodoc_status

Get AutoDoc status — statistics on documents, references, and issues.

### Parameters

No parameters.

### Returns

```typescript
{
  enabled: boolean;
  config: object;
  statistics: {
    totalDocuments: number;
    totalSections: number;
    totalReferences: number;
    brokenReferences: number;
    lastGenerated: string;
    coverage: number;         // Code documentation coverage percentage
  };
}
```

### Examples

```
autodoc_status()
```

---

## autodoc_sync

Synchronize documentation with code changes. Checks references and marks outdated documents.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `markOutdated` | boolean | no | Mark outdated documents |
| `removeOrphaned` | boolean | no | Remove documents without code links |

### Returns

```typescript
{
  success: boolean;
  documentsChecked: number;
  outdatedMarked: number;
  orphanedRemoved: number;
  referencesUpdated: number;
}
```

### Examples

```
autodoc_sync({
  markOutdated: true,
  removeOrphaned: false
})
```

---

## autodoc_changelog

View documentation change history. Shows which documents were affected by code changes.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `since` | string | no | Start date (ISO format) |
| `limit` | number | no | Maximum entries |

### Returns

```typescript
{
  changes: Array<{
    timestamp: string;
    documentPath: string;
    changeType: "created" | "updated" | "deleted" | "outdated";
    relatedCodeChanges: string[];
  }>;
}
```

### Examples

```
autodoc_changelog({
  since: "2024-01-01",
  limit: 50
})
```

---

## autodoc_install_hooks

Install or remove git pre-commit hooks for documentation validation before commit.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `action` | string | yes | Action: `install`, `uninstall` |
| `validateReferences` | boolean | no | Check references |
| `blockOnError` | boolean | no | Block commit on errors |

### Returns

```typescript
{
  success: boolean;
  action: string;
  hookPath: string;
}
```

### Examples

```
autodoc_install_hooks({
  action: "install",
  validateReferences: true,
  blockOnError: true
})
```

---

## autodoc_detect_language

Automatic documentation language detection from code comments and existing documents.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `sampleSize` | number | no | Number of files to analyze |

### Returns

```typescript
{
  detectedLanguage: "en" | "ru" | "zh";
  confidence: number;
  samples: Array<{
    source: string;
    language: string;
  }>;
}
```

### Examples

```
autodoc_detect_language({ sampleSize: 20 })
```
