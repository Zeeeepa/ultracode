# UltraCode — Full Documentation

All 50 tools with parameters.

---

## Indexing & Search

### `index`
Manually trigger codebase indexing. **Indexing is automatic** — use this only for troubleshooting when search results seem incomplete or outdated.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | current | Directory to index |
| `incremental` | boolean | false | Incremental indexing (changed files only) |
| `reset` | boolean | false | Clear graph before indexing |
| `excludePatterns` | string[] | node_modules, .git, dist... | Exclude patterns |
| `fullScan` | boolean | false | Full scan without cache |

> **Note**: If semantic search returns incomplete results, try `index reset=true` to rebuild the graph.

### `semantic_search`
**Semantic search by meaning.** Understands natural language. Returns rich metadata including complexity metrics, control flow, calls, and documentation.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Natural language search query |
| `limit` | number | 10 | Max results |
| `branch` | string | main | Branch to search |
| `minCyclomatic` | number | - | Filter: minimum cyclomatic complexity |
| `maxCyclomatic` | number | - | Filter: maximum cyclomatic complexity |
| `hasExceptions` | boolean | - | Filter: must have try-catch blocks |
| `hasLoops` | boolean | - | Filter: must have loops |
| `hasAwaits` | boolean | - | Filter: must have await expressions (async) |
| `hasDocumentation` | boolean | - | Filter: must have docs/docstrings |
| `isDeprecated` | boolean | - | Filter: deprecated entities only |
| `minCallCount` | number | - | Filter: minimum function calls |

**Enhanced output includes:**
- `complexity`: cyclomatic, cognitive, linesOfCode, nestingDepth
- `controlFlow`: hasBranches, hasLoops, hasExceptions, hasAwaits, counts
- `calls`: count, hasAsync
- `documentation`: hasDocumentation, hasParams, hasExamples, isDeprecated

### `query`
Natural language query about code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Query |
| `limit` | number | 10 | Max results |

### `pattern_search`
Advanced search with multiple modes.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pattern` | string | **required** | Regex or semantic query |
| `mode` | enum | **required** | `entity` / `content` / `semantic` / `hybrid` |
| `entityTypes` | string[] | all | Entity types (function, class, interface...) |
| `files` | string[] | all | Filter by files |
| `frameworks` | string[] | all | Filter by frameworks (React, Vue...) |
| `contentContains` | string | - | Content must contain string |
| `contentRegex` | string | - | Regex for content |
| `semanticQuery` | string | - | Semantic query for content |

### `find_similar_code`
Find semantically similar code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | **required** | Code snippet to find similar |
| `threshold` | number | 0.5 | Similarity threshold (0-1) |
| `limit` | number | 10 | Max results |

### `cross_language_search`
Search across multiple languages.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Search query |
| `languages` | string[] | all | Languages (ts, js, py, go...) |

### `find_related_concepts`
Find related concepts for entity.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | **required** | Entity ID |
| `limit` | number | 10 | Max results |

---

## Entity Analysis

### `get_members`
List all entities in file (classes, functions, interfaces...).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filePath` | string | **required** | File path |
| `entityTypes` | string[] | all | Entity types to filter |

### `list_entity_relationships`
Show entity dependencies (callers, callees).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | - | Entity ID (preferred) |
| `entityName` | string | - | Entity name |
| `filePath` | string | - | File path hint |
| `depth` | number | 1 | Traversal depth |
| `relationshipTypes` | string[] | all | Relationship types |

### `detect_technology_stack`
Detect project technology stack.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `generateContext` | boolean | false | Generate context for embeddings |

---

## Code Quality

### `find_duplicates`
Semantic duplicate code detection.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minSimilarity` | number | 0.8 | Min similarity (0-1) |
| `scope` | string | "all" | Scope: `all` / `file` / `module` |

### `jscpd_detect_clones`
Clone detector based on jscpd.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `paths` | string[] | root | Paths to scan |
| `pattern` | string | "**/*" | Glob pattern |
| `ignore` | string[] | - | Exclude patterns |
| `formats` | string[] | all | File extensions (ts, js, py...) |
| `minLines` | number | - | Min lines per clone |
| `maxLines` | number | - | Max lines per clone |
| `minTokens` | number | - | Min tokens |
| `ignoreCase` | boolean | false | Ignore case |

### `analyze_code_impact`
**Change impact analysis** — what breaks when entity changes. Includes `contractImpact` section when swagger-linked entities are affected (producers, consumers, generated types).

Combines **graph dependencies** (direct relationships) with **semantic similarity** (SIMD/GPU accelerated vector search) to find both direct and conceptually related code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entity` | string | **required** | Entity ID or name |
| `includeSemantic` | boolean | true | Include semantically related entities (SIMD/GPU accelerated) |
| `semanticLimit` | number | 10 | Max semantic matches to return |
| `semanticThreshold` | number | 0.7 | Min similarity threshold (0-1) |

**Returns:**
```json
{
  "entity": "handleLogin",
  "entityType": "function",
  "filePath": "src/auth/login.ts",
  "dependents": [...],           // Direct: who calls this
  "dependencies": [...],         // Direct: what this calls
  "semanticRelated": [           // NEW: Similar by meaning (GPU accelerated)
    { "name": "handleLogout", "similarity": 0.85, "reason": "semantic_similarity" }
  ],
  "impactScore": 5,              // Direct dependents count
  "semanticImpactScore": 3,      // Semantic matches count
  "totalImpactScore": 6          // Combined (semantic weighted 0.5x)
}
```

**Performance:**
- Direct graph: O(n) SQLite queries
- Semantic: O(1) vector similarity with SIMD/CUDA acceleration

### `suggest_refactoring`
AI refactoring suggestions.

### `analyze_hotspots`
Find complex code areas.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `metric` | string | "complexity" | Metric: `complexity` / `changes` / `coupling` |
| `limit` | number | 10 | Max results |

### `analyze_swagger_impact`
**Swagger/OpenAPI impact analysis** — shows affected controllers, generated clients, and generated types when swagger specs change.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `swaggerFile` | string | auto | Path to swagger file |
| `schemaName` | string | - | Specific schema to analyze |
| `endpointPath` | string | - | Specific endpoint (`GET /api/users`) |
| `projectPath` | string | current | Project path |

```
analyze_swagger_impact schemaName="User"
analyze_swagger_impact endpointPath="GET /api/users"
```

### `analyze_state_chaos`
State chaos analysis (mutations, side-effects).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `scope` | enum | **required** | `file` / `module` / `project` |
| `stateIdentifiers` | string[] | - | State identifiers (token, userId...) |
| `autoDetect` | boolean | false | Auto-detect state patterns |
| `format` | enum | "summary" | `summary` / `detailed` / `json` |
| `maxDepth` | number | 10 | Max trace depth |

### `validate_file`
Validate file (syntax, types).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filePath` | string | **required** | File path |

### `validate_directory`
Validate directory.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dirPath` | string | **required** | Directory path |
| `extensions` | string[] | all | Extensions to validate |
| `recursive` | boolean | true | Recursive |

---

## Code Modification

> ⚡ **Automatic Validation**: All modification tools automatically run linting and error checking. Results (errors/warnings) are returned immediately in the response — no need to manually validate.

### `modify_code`
Modify entity code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | **required** | Entity ID |
| `newCode` | string | **required** | New code |
| `preserveComments` | boolean | true | Preserve comments |
| `updateImports` | boolean | true | Update imports |
| `preview` | boolean | true | Preview changes |
| `skipValidation` | boolean | false | Skip validation |

### `create_file`
Create new file.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filePath` | string | **required** | Absolute path |
| `content` | string | **required** | File content |
| `createDirectories` | boolean | true | Create parent dirs |
| `updateGraph` | boolean | true | Add to graph |
| `overwrite` | boolean | false | Overwrite if exists |

### `copy_file`
Copy file.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `source` | string | **required** | Source path |
| `target` | string | **required** | Target path |
| `preview` | boolean | true | Preview |
| `updateGraph` | boolean | true | Update graph |

### `rename_file`
Rename file.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `oldPath` | string | **required** | Current path |
| `newPath` | string | **required** | New path |
| `preview` | boolean | true | Preview |
| `updateImports` | boolean | true | Update imports in project |
| `updateGraph` | boolean | true | Update graph |

### `split_file`
Split file into parts.

### `synthesize_files`
Merge multiple files.

### `rename_symbol`
**Rename symbol across entire project** (smart rename).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | - | Entity ID (preferred) |
| `entityName` | string | - | Entity name |
| `filePath` | string | - | Path hint |
| `newName` | string | **required** | New name |
| `updateReferences` | boolean | true | Update all references |
| `preview` | boolean | true | Preview changes |

### `add_member`
Add member to class/interface.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | - | Parent entity ID |
| `filePath` | string | **required** | File path |
| `memberCode` | string | **required** | New member code |
| `position` | enum | "end" | `start` / `end` / `after` |
| `afterMember` | string | - | After which member (for position=after) |
| `preview` | boolean | true | Preview |

---

## Snapshots & Rollback

### `create_snapshot`
Create state snapshot.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | **required** | Snapshot description |
| `files` | string[] | all | Files to include |

### `undo`
Rollback to snapshot / undo last change.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `snapshotId` | string | optional | Snapshot ID (if not specified, undoes last change) |

### `list_snapshots`
List snapshots.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 10 | Max snapshots |

### `cleanup_snapshots`
Cleanup old snapshots.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `olderThanDays` | number | 30 | Delete older than N days |

---

## Git Integration

### `list_branches`
List indexed branches.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `repositoryPath` | string | current | Repository path |

### `switch_branch`
Switch to another branch.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `branch` | string | **required** | Branch name |
| `repositoryPath` | string | current | Repository path |

### `get_branch_status`
Current branch status.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `repositoryPath` | string | current | Repository path |

### `get_changed_files`
Changed files between branches.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `fromBranch` | string | **required** | Source branch |
| `toBranch` | string | **required** | Target branch |

### `cleanup_branches`
Cleanup old branches (LRU).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `keep` | number | from config | Branches to keep |

---

## Graph & System

### `get_graph`
Get code graph.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | - | Search query |
| `limit` | number | 100 | Max entities |

### `get_graph_stats`
Graph statistics (entity count, relationships).

### `get_graph_health`
Graph health check.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minEntities` | number | 1 | Min entities for healthy |
| `minRelationships` | number | 0 | Min relationships |
| `sample` | number | 1 | Sample size for check |

### `reset_graph`
Reset graph (clear all data).

### `clean_index`
Clear and reindex.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | current | Directory |
| `excludePatterns` | string[] | [] | Exclude patterns |
| `fullScan` | boolean | false | Full scan |

### `lerna_project_graph`
Lerna monorepo graph.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | current | Working directory |
| `ingest` | boolean | false | Store in graph |
| `force` | boolean | false | Force update |

---

## Architecture Diagrams

### `get_architecture_diagram`
Generate architecture diagrams from code graph. Supports Mermaid, Graphviz DOT, D2.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entryPoint` | string | - | Entry point (file, class, module). Omit for project overview |
| `depth` | number | 2 | 1=files, 2=classes, 3=methods, 4+=deeper |
| `dataFlowLevel` | number | 1 | 0=structure, 1=types, 2=conditionals, 3=field mapping |
| `format` | string | mermaid | `mermaid`, `graphviz`, `d2` |
| `direction` | string | TD | `TD` (top-down) or `LR` (left-right) |
| `diagramType` | string | auto | `flowchart`, `class`, `component` |

---

## Metrics & Debug

### `get_metrics`
System metrics.

### `get_version`
Server version.

### `get_agent_metrics`
Agent metrics (execution time, memory).

### `get_bus_stats`
Message bus statistics.

### `clear_bus_topic`
Clear bus topic.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `topic` | string | **required** | Topic name |

---

## Usage Examples

### Analyze new project
```
1. detect_technology_stack
2. get_graph_stats
3. analyze_hotspots metric="complexity" limit=20
4. semantic_search query="entry point"
```

### Search and refactor
```
1. semantic_search query="authentication error handling"
2. list_entity_relationships entityName="AuthService" depth=2
3. analyze_code_impact entityId="AuthService.login"
4. create_snapshot description="Before auth refactoring"
5. modify_code entityId="AuthService.login" newCode="..." preview=true
6. modify_code entityId="AuthService.login" newCode="..." preview=false
```

### Find duplicates
```
1. find_duplicates minSimilarity=0.75
2. find_similar_code code="<snippet>" threshold=0.6
3. suggest_refactoring
```

### Work with branches
```
1. list_branches
2. switch_branch branch="feature/new-api"
3. get_changed_files fromBranch="main" toBranch="feature/new-api"
4. index incremental=true
```
