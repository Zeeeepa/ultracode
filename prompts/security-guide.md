# UltraCode — Security Analysis Guide

## Overview

UltraCode provides interprocedural taint analysis to detect security vulnerabilities by tracing untrusted data from sources to sinks.

## Key Concepts

### Sources
Entry points where untrusted data enters the application:
- HTTP request data: `req.body`, `req.params`, `req.query`, `req.headers`
- Environment variables: `process.env`
- File reads: `fs.readFile`
- Network responses: `fetch()`, `axios`
- User input: `readline`, `prompt()`, `window.location`
- WebSocket messages: `socket.on('message')`

### Sinks
Dangerous operations where untrusted data can cause harm:
- Code execution: `eval()`, `new Function()`, `setTimeout(string)`
- Shell execution: `exec()`, `spawn()`
- SQL queries: `db.query()`, `knex.raw()`
- DOM insertion: `innerHTML`, `document.write()`, `dangerouslySetInnerHTML`
- File operations: `fs.writeFile()`, `path.join()` with user input
- HTTP requests: `fetch(dynamicUrl)`, `http.request()`

### Sanitizers
Protective functions that neutralize tainted data:
- Encoding: `encodeURIComponent()`, `escapeHtml()`
- Purification: `DOMPurify.sanitize()`
- Validation: `zod.parse()`, `joi.validate()`
- Type coercion: `parseInt()`, `Number()`, `Boolean()`
- SQL parameterization: Prepared statements (`?` placeholders)
- Path safety: `path.basename()`, `path.normalize()`

## Workflows

### Full Security Scan
```
taint_analysis({ category: "all" })
```
Scans all entity pairs for all vulnerability categories. Returns first 20 vulnerabilities by default.

### Targeted Category Scan
```
taint_analysis({ category: "sql_injection" })
taint_analysis({ category: "xss" })
taint_analysis({ category: "command_injection" })
```
Focus on specific vulnerability type for faster results.

### Paginated Scan (Large Codebases)
```
// First page
taint_analysis({ category: "all", offset: 0, limit: 10 })
// → pagination: { total: 85, hasMore: true, nextOffset: 10 }

// Next page
taint_analysis({ category: "all", offset: 10, limit: 10 })

// All SQL injections, 5 at a time
taint_analysis({ category: "sql_injection", offset: 0, limit: 5 })
```
Use `offset`/`limit` to paginate through large vulnerability sets without overwhelming the response.

### Security + Architecture Combined
```
1. taint_analysis({ category: "all" })
   -> Find vulnerable flows

2. graph_metrics({ metric: "pagerank", topN: 20 })
   -> Identify most important entities

3. Cross-reference: vulnerable + high PageRank = critical priority
```

### Security Audit Workflow
```
1. taint_analysis({ category: "all" })
2. detect_patterns({ category: "anti-pattern", tags: ["security"] })
3. trace_data_flow({ entryPoint: "handleRequest", targetState: "database" })
4. analyze_code_impact({ entityId: "<vulnerable-entity>" })
```

## Vulnerability Categories

| Category | Risk | Common Fix |
|----------|------|------------|
| `sql_injection` | Critical | Use parameterized queries, ORM |
| `command_injection` | Critical | Use execFile(), whitelist commands |
| `xss` | High | DOMPurify, textContent, output encoding |
| `path_traversal` | High | path.basename(), validate paths |
| `ssrf` | High | URL allowlist, block private IPs |
| `prototype_pollution` | Medium | Object.create(null), Map |

## Understanding Results

### Severity Levels
- **Critical**: Direct unsanitized flow to dangerous sink (SQL injection, command injection)
- **High**: Unsanitized flow to risky sink (XSS, path traversal, SSRF)
- **Medium**: Unsanitized flow but lower exploitability (prototype pollution, long paths)
- **Low**: Sanitized flow (review recommended but not urgent)

### Confidence Score
- **0.8-1.0**: Short direct path, high likelihood of real vulnerability
- **0.5-0.7**: Moderate path length, likely real but needs verification
- **0.1-0.4**: Long path or sanitized, lower probability

## Response Limits

Heavy analysis tools (including `taint_analysis`) are protected by a two-layer response limiting system:

1. **Handler-level pagination**: Results are paginated via `offset`/`limit` (default 20 items). Only the current page is formatted and returned.
2. **Transport-level safety net** (`enforceResponseLimit`): If the response still exceeds 50KB, it is automatically truncated with a `_responseMeta` hint to use pagination.

Heavy tools are also serialized via `pLimit(1)` queue to prevent concurrent memory spikes.

## Tips

- Run `graph_metrics({metric:'pagerank', persist:true})` first to enhance subsequent search results
- Use `includeTests: false` (default) for production code analysis
- Focus on unsanitized flows first — sanitized flows are informational
- Cross-reference with `detect_patterns` for comprehensive security review
- Use `offset`/`limit` pagination for large codebases with many vulnerabilities
