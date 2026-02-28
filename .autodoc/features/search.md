# Search and Navigation

🌐 **Language**: [EN] | [RU](./search_ru.md)

---

Tools for searching code by meaning, patterns, and structure.

---

## semantic_search

Semantic search across the codebase using vector embeddings. Finds code by meaning, not exact text matching.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `query` | string | yes | Natural language search query |
| `limit` | number | no | Maximum results (default 10) |
| `threshold` | number | no | Minimum similarity threshold 0-1 (default 0.5) |
| `filePattern` | string | no | Glob pattern for file filtering |
| `entityTypes` | string[] | no | Entity types: function, class, interface, etc. |
| `minCyclomatic` | number | no | Minimum cyclomatic complexity |
| `maxCyclomatic` | number | no | Maximum cyclomatic complexity |
| `hasExceptions` | boolean | no | Filter by presence of try-catch |
| `hasLoops` | boolean | no | Filter by presence of loops |
| `hasAwaits` | boolean | no | Filter by presence of async/await |
| `hasDocumentation` | boolean | no | Filter by presence of documentation |
| `minCallCount` | number | no | Minimum number of calls |

### Returns

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    type: string;
    filePath: string;
    line: number;
    score: number;           // Similarity 0-1
    snippet: string;         // Code snippet
    complexity?: {
      cyclomatic: number;
      cognitive: number;
    };
    documentation?: string;
  }>;
  totalFound: number;
  searchTime: number;
}
```

### Examples

**Basic search:**
```
semantic_search({ query: "email validation function" })
```

**Search complex code without documentation:**
```
semantic_search({
  query: "data processing",
  minCyclomatic: 10,
  hasDocumentation: false
})
```

**Search async code without error handling:**
```
semantic_search({
  query: "API requests",
  hasAwaits: true,
  hasExceptions: false
})
```

---

## pattern_search

Advanced search with multiple modes: by entity name, by content, semantic, and hybrid.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `query` | string | yes | Search query or regex |
| `mode` | string | no | Mode: `entity`, `content`, `semantic`, `hybrid` (default `hybrid`) |
| `entityTypes` | string[] | no | Entity types to filter |
| `filePattern` | string | no | Glob pattern for files |
| `caseSensitive` | boolean | no | Case-sensitive search |
| `limit` | number | no | Maximum results |

### Search Modes

- **entity** — search by entity name (regex)
- **content** — search inside function/class bodies
- **semantic** — vector search by meaning
- **hybrid** — combination of all modes

### Returns

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    type: string;
    filePath: string;
    line: number;
    matchType: "entity" | "content" | "semantic";
    score: number;
    matches?: string[];  // Found matches for content mode
  }>;
}
```

### Examples

**Search by regex in names:**
```
pattern_search({
  query: "^handle.*Error$",
  mode: "entity"
})
```

**Search inside code:**
```
pattern_search({
  query: "console\\.log",
  mode: "content"
})
```

**Hybrid search:**
```
pattern_search({
  query: "user authentication",
  mode: "hybrid",
  entityTypes: ["function", "class"]
})
```

---

## query

Universal natural language query to code graph.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `query` | string | yes | Natural language query |
| `format` | string | no | Output format: `summary`, `detailed`, `json` |

### Returns

```typescript
{
  answer: string;        // Answer to query
  entities: Array<{...}>;  // Found entities
  confidence: number;    // Confidence 0-1
}
```

### Examples

```
query({ query: "which classes inherit from BaseController?" })
query({ query: "where is the validateInput function defined?" })
query({ query: "show all exported functions in utils/" })
```

---

## find_similar_code

Find code similar to given fragment. Uses semantic analysis to find functionally similar code.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `code` | string | yes* | Code fragment to find similar |
| `entityId` | string | yes* | Entity ID to find similar |
| `threshold` | number | no | Minimum similarity threshold (default 0.7) |
| `limit` | number | no | Maximum results |
| `excludeSameFile` | boolean | no | Exclude results from same file |

*Specify either `code` or `entityId`

### Returns

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    filePath: string;
    similarity: number;  // 0-1
    snippet: string;
  }>;
}
```

### Examples

**By code fragment:**
```
find_similar_code({
  code: "function validate(email) { return /^[^@]+@[^@]+$/.test(email); }",
  threshold: 0.8
})
```

**By existing entity:**
```
find_similar_code({
  entityId: "src/utils/validators.ts:validateEmail",
  excludeSameFile: true
})
```

---

## cross_language_search

Search across multiple programming languages simultaneously. Useful for multi-language projects.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `query` | string | yes | Search query |
| `languages` | string[] | no | Languages to search (default all) |
| `limit` | number | no | Maximum results |

### Supported Languages

`typescript`, `javascript`, `python`, `go`, `rust`, `java`, `kotlin`, `cpp`, `swift`, `bash`, `powershell`

### Returns

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    language: string;
    filePath: string;
    score: number;
  }>;
  byLanguage: Record<string, number>;  // Count by languages
}
```

### Examples

```
cross_language_search({
  query: "HTTP client implementation",
  languages: ["typescript", "python", "go"]
})
```

---

## find_related_concepts

Find conceptually related code. Finds entities semantically related to specified one.

### Parameters

| Parameter | Type | Required | Description |
|----------|-----|--------------|----------|
| `entityId` | string | yes* | Entity ID |
| `concept` | string | yes* | Concept to search |
| `depth` | number | no | Relationship search depth (default 2) |
| `limit` | number | no | Maximum results |

*Specify either `entityId` or `concept`

### Returns

```typescript
{
  results: Array<{
    entityId: string;
    name: string;
    relationshipType: string;  // "calls", "imports", "extends", "semantic"
    distance: number;          // Distance in graph
  }>;
}
```

### Examples

**From existing entity:**
```
find_related_concepts({
  entityId: "src/auth/login.ts:LoginService",
  depth: 3
})
```

**By concept:**
```
find_related_concepts({
  concept: "authorization and access rights"
})
```
