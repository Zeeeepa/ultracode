---
name: UltraCode
version: 1.1.0
description: Code analysis for TS/JS/Python/C#/Go/Rust/Java/C++/Swift/Kotlin/Zig/Bash — search, impact, refactoring, security, diagnostics
triggers:
  - code analysis
  - semantic search
  - refactoring
  - code modification
  - impact analysis
  - stacktrace
  - error diagnosis
  - architecture diagram
  - database schema
  - security analysis
  - anti-pattern
  - code quality
  - duplicate detection
---

# UltraCode — Claude Code Skill

**Auto-activated for**: TS/JS/Python/C#/Go/Rust/Java/C++/Swift/Kotlin/Zig/Bash code analysis

## When to Use

**ALWAYS use instead of Grep/Glob** — 5-10x faster, understands meaning.

| Task | Tool | Why |
|------|------|-----|
| Search code by meaning | `semantic_search` | Understands natural language |
| Find similar code | `find_similar_code` | Semantic similarity |
| Impact analysis | `analyze_code_impact` | Shows what breaks |
| Find duplicates | `find_duplicates` / `jscpd_detect_clones` | Semantic + token detection |
| List entities in file | `get_members` | AST parsing |
| Show dependencies | `list_entity_relationships` | Dependency graph |
| Modify code safely | `modify_code` | With preview & rollback |
| Rename across project | `rename_symbol` | Updates all references |
| Diagnose stacktrace | `analyze_stacktrace` | Parse, resolve, suggest fixes |
| Architecture diagram | `get_architecture_diagram` | Mermaid/Graphviz/D2 |
| DB schema | `get_database_schema` | SQL/ORM/Prisma/Redis |
| Security taint analysis | `taint_analysis` | SQL injection, XSS, missing auth |
| Detect anti-patterns | `detect_patterns` | 100+ rules, 6 languages |
| Graph metrics | `graph_metrics` | PageRank, Louvain, centrality |

## Supported Languages

| Language | Support | Features |
|----------|---------|----------|
| TypeScript | Full | Type analysis, JSX/TSX |
| JavaScript | Full | ES6+, JSX, CommonJS/ESM |
| Python | Full | Type hints, async, decorators |
| Go | Full | Goroutines, interfaces |
| Rust | Full | Traits, lifetimes, macros |
| C# | Good | Roslyn, LINQ, async/await |
| Java | Good | Generics, annotations |
| C++ | Good | Templates, namespaces |
| Swift | Good | Protocols, extensions |
| Kotlin | Good | Coroutines, data classes |
| Zig | Basic | Functions, structs, comptime |
| Bash | Basic | Functions, variables |

---

## Stacktrace Diagnosis

#### `analyze_stacktrace`
Parse and diagnose stacktraces from any language. Auto-detects language, resolves frames to code graph entities, classifies errors, runs backwards trace and impact analysis.

```typescript
analyze_stacktrace({
  stacktrace: `TypeError: Cannot read property 'name' of undefined
    at processUser (src/users.ts:42:15)
    at handleRequest (src/server.ts:100:5)`,
  format: "text"         // text | json | mermaid
})
```

**Supported languages**: JS/TS (V8/Node), Python traceback, Java/Kotlin (Caused by chains), C#/.NET, Go goroutine panics, Rust panic/RUST_BACKTRACE, C/C++ (GDB/ASAN), Zig.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `stacktrace` | string | **required** | Full stacktrace text |
| `language` | enum | auto | Language hint |
| `depth` | number | 10 | Backwards trace depth |
| `includeImpactAnalysis` | boolean | true | Run impact analysis |
| `includeBackwardsTrace` | boolean | true | Run backwards trace |
| `format` | enum | "text" | `text` / `json` / `mermaid` |
| `highlightRecentChanges` | boolean | false | Annotate crash/call chain with recently-changed status + crash point history |
| `recentCommitsCount` | number | 10 | Recent commits to consider |

**Returns**: error category, severity, crash location, call chain, callers, suggested fixes, Mermaid diagram. With `highlightRecentChanges`: `recentChangeSummary` + `crashPointHistory`.

---

## Architecture Diagrams

#### `get_architecture_diagram`
Generate architecture diagrams in Mermaid, Graphviz DOT, or D2 format.

```typescript
get_architecture_diagram({
  entryPoint: "src/server.ts",  // or omit for project overview
  depth: 2,                     // 1=files, 2=classes, 3=methods
  dataFlowLevel: 1,             // 0=none, 1=types, 2=params, 3=fields
  format: "mermaid"
})
```

---

## Database Schema

#### `get_database_schema`
Show database schema from SQL, Prisma, ORM models (TypeORM, Sequelize, JPA, EF Core, Django, SQLAlchemy, GORM, Dapper, linq2db), and Redis key patterns.

```typescript
get_database_schema({
  tableName: "users",          // partial match filter
  dbEngine: "postgres",       // postgres/mysql/clickhouse/redis/sqlite/mssql
  includeRelationships: true   // FK and code links
})
```

---

## Security Tools

#### `taint_analysis`
Interprocedural taint analysis: trace untrusted data from sources to sinks.

```typescript
taint_analysis({
  category: "missing_auth",  // sql_injection | xss | command_injection | path_traversal | ssrf | prototype_pollution | missing_auth
  offset: 0, limit: 10
})
```

---

## Code Quality

#### `detect_patterns`
Detect anti-patterns, best-patterns, code smells, and optimization opportunities. 100+ rules across 6 languages. Supports `highlightRecentChanges` to annotate matches with recently-changed entity status.

```typescript
detect_patterns({
  category: "anti-pattern",    // anti-pattern | best-pattern | code-smell | optimization
  tags: ["performance"],
  severity: "high",
  highlightRecentChanges: true  // annotate matches with Prolly Tree status
})
```

#### `check_entity_patterns`
Check specific entity for patterns with Big-O analysis.

#### `analyze_state_chaos`
Detect scattered state, race conditions, C# anti-patterns (async-void, mutable-static, god-service). Supports `highlightRecentChanges` to identify recently modified chaotic entities.

#### `graph_metrics`
Graph-based architecture metrics.

```typescript
graph_metrics({
  metric: "pagerank",    // pagerank | louvain | centrality | bus_factor
  topN: 10,
  persist: true          // store in entity metadata
})
```

#### `analyze_api_impact`
Impact of API contract changes across Swagger/OpenAPI, Protobuf/gRPC, and GraphQL.

```typescript
analyze_api_impact({
  contractType: "swagger",   // swagger | protobuf | graphql | auto
  changedFile: "api/openapi.yaml"
})
```

---

## Code Modification via MCP

### Automatic Validation

All code modifications (`modify_code`, `add_member`, `create_file`, `rename_symbol`) **automatically run linting and error checking**.

### Safe Modification Workflow

```
1. semantic_search query="target code"       # Find what to modify
2. get_members filePath="file.ts"            # Get entity IDs
3. analyze_code_impact entityId="..."        # Check what breaks
4. create_snapshot description="Before..."   # Backup
5. modify_code entityId="..." preview=true   # Preview changes
6. modify_code entityId="..." preview=false  # Apply + auto-validate
```

### Available Modification Tools

#### `modify_code` — Replace Entity Code
```typescript
modify_code({
  entityId: "src/utils.ts::processData",
  newCode: `function processData(input: string): Result { ... }`,
  preview: true
})
```

#### `rename_symbol` — Smart Rename
```typescript
rename_symbol({ entityName: "oldName", newName: "newName", preview: true })
```

#### `add_member` — Add to Class/Interface
```typescript
add_member({ filePath: "file.ts", entityId: "MyClass", memberCode: "...", position: "end" })
```

#### `create_file` — Create New File
```typescript
create_file({ filePath: "new-file.ts", content: "...", updateGraph: true })
```

### Rollback & Safety

| Tool | Purpose |
|------|---------|
| `create_snapshot` | Backup before changes |
| `undo` | Rollback to snapshot |
| `list_snapshots` | View backups |

---

## History & Time Travel

| Tool | Purpose |
|------|---------|
| `get_entity_history` | Change history for entity across commits |
| `diff_commits` | Compare two graph commits |
| `checkout_commit` | View graph state at specific commit |
| `list_commits` | List graph version history |

```typescript
get_entity_history({ entityId: "src/auth.ts::login", limit: 10 })
diff_commits({ from: "abc123", to: "def456" })
```

---

## Merge Tools

| Tool | Purpose |
|------|---------|
| `semantic_merge` | AI-powered 3-way merge |
| `analyze_merge_conflicts` | Predict conflicts before merge |
| `get_merge_suggestions` | AI suggestions for conflict resolution |
| `get_semantic_merge_info` | Merge capabilities info |

---

## Common Workflows

### 1. Understanding New Project

```
1. detect_technology_stack                   # Detect stack
2. get_graph_stats                           # View statistics
3. get_architecture_diagram depth=2          # Visual overview
4. analyze_hotspots metric="complexity"      # Find complex code
5. semantic_search query="entry point"       # Find entry points
```

### 2. Diagnosing an Error

```
1. analyze_stacktrace stacktrace="..." highlightRecentChanges=true  # Parse, diagnose, show recent changes
2. get_members filePath="crash_file.ts"     # Explore crash location
3. analyze_code_impact entityId="..." highlightRecentChanges=true   # What depends on crash point + recent changes
```

### 3. Security Audit

```
1. taint_analysis category="sql_injection"  # Find injection vulnerabilities
2. taint_analysis category="missing_auth"   # Find unprotected endpoints
3. detect_patterns category="anti-pattern" tags=["security"]
```

### 4. Finding Problematic Code

```
semantic_search minCyclomatic=10             # Complex code
semantic_search hasAwaits=true hasExceptions=false  # Async without try/catch
semantic_search hasDocumentation=false       # Undocumented
```

---

## Tool Reference

### Search

| Tool | Purpose |
|------|---------|
| `semantic_search` | Search by meaning (5-10x faster than Grep) |
| `pattern_search` | Multi-mode: entity/content/semantic/hybrid |
| `find_similar_code` | Find similar code by snippet |
| `cross_language_search` | Search across languages |
| `find_related_concepts` | Conceptually related code |

### Analysis

| Tool | Purpose |
|------|---------|
| `analyze_code_impact` | What breaks if I change X |
| `analyze_hotspots` | Complex code by complexity/changes/coupling |
| `analyze_state_chaos` | State management issues |
| `analyze_api_impact` | API contract change impact |
| `analyze_stacktrace` | Stacktrace diagnosis |
| `detect_patterns` | Anti-patterns, code smells, optimizations |
| `graph_metrics` | PageRank, Louvain, centrality, bus factor |
| `taint_analysis` | Security vulnerability detection |
| `get_database_schema` | Reconstructed DB schema |

### Entity & Graph

| Tool | Purpose |
|------|---------|
| `get_members` | List entities in file |
| `list_entity_relationships` | Entity dependencies |
| `query` | Natural language graph query |
| `get_architecture_diagram` | Architecture visualization |

---

## Related Skills

- **`ultracode-trace`** — Debugging, flow analysis, "why not called", stacktrace backwards trace
- **`ultracode-autodoc`** — Project memory with auto-updated code refs, find code by business meaning

---

## Cross-Project Support

```
index directory="D:\\other\\project"
semantic_search query="auth" projectPath="D:\\other\\project"
```

Storage: `%LOCALAPPDATA%\UltraCode\projects\{hash}/`
