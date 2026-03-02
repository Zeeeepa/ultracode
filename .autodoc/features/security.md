# Security Analysis

## taint_analysis

Interprocedural taint analysis that traces untrusted data from sources to sinks and detects missing sanitization.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `projectPath` | string | current project | Project directory path |
| `category` | enum | `"all"` | `sql_injection`, `xss`, `command_injection`, `path_traversal`, `ssrf`, `prototype_pollution`, or `all` |
| `maxDepth` | number | `15` | Maximum path depth for flow tracing |
| `includeTests` | boolean | `false` | Include test files in analysis |
| `offset` | number | `0` | Number of vulnerabilities to skip (for pagination) |
| `limit` | number | `20` | Maximum vulnerabilities to return (max 200) |

### Returns

| Field | Description |
|-------|-------------|
| `summary` | One-line summary: total flows, critical/high counts, unsanitized count |
| `pagination` | Pagination metadata: `offset`, `limit`, `total`, `hasMore`, `nextOffset` |
| `stats` | Counts: sources, sinks, sanitizers, total vulnerabilities, category breakdown |
| `formatted` | Human-readable text report for the current page of vulnerabilities |

### Pagination

Results are paginated by default (20 per page). Use `offset` and `limit` to navigate:

```ts
// First page (default)
taint_analysis({ category: "all" })
// → pagination: { offset: 0, limit: 20, total: 85, hasMore: true, nextOffset: 20 }

// Next page
taint_analysis({ category: "all", offset: 20, limit: 20 })

// Smaller pages for faster responses
taint_analysis({ category: "sql_injection", offset: 0, limit: 5 })
```

### Examples

```ts
// Full security scan
taint_analysis({ category: "all" })

// Focus on SQL injection only
taint_analysis({ category: "sql_injection" })

// Include test files
taint_analysis({ category: "xss", includeTests: true })

// Paginated scan
taint_analysis({ category: "all", offset: 0, limit: 10 })
```

### How It Works

1. **Discovery phase**: Scans all entities for source/sink/sanitizer patterns using regex catalogs
2. **Path finding**: For each (source, sink) pair with matching vulnerability category, uses graph-based path finding
3. **Sanitizer checking**: Checks if any sanitizer on the path protects against the relevant category
4. **Severity calculation**: Based on category (sql_injection=critical, xss=high, etc.), path length, and sanitization status
5. **Confidence scoring**: Based on path length and sanitization status

### Supported Categories

| Category | Sources | Sinks | Example |
|----------|---------|-------|---------|
| `sql_injection` | req.body, req.query | db.query, knex.raw | User input -> raw SQL query |
| `xss` | req.body, location.hash | innerHTML, document.write | User input -> DOM insertion |
| `command_injection` | req.body, process.env | exec, spawn | User input -> shell command |
| `path_traversal` | req.params | fs.writeFile, path.join | User input -> file path |
| `ssrf` | req.body | fetch, http.request | User input -> outbound URL |
| `prototype_pollution` | req.body | Object.assign, spread | User input -> object merge |
