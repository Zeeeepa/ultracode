# UltraScript Tools — Complete Tool Reference

## Indexing & Search

### `index`
Index codebase for analysis. **Run once before using other tools.**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `directory` | string | current | Directory to index |
| `incremental` | boolean | false | Incremental indexing (changed files only) |
| `reset` | boolean | false | Clear graph before indexing |
| `excludePatterns` | string[] | node_modules, .git, dist... | Exclude patterns |
| `fullScan` | boolean | false | Full scan without cache |

### `semantic_search`
**Semantic search by meaning.** Understands natural language. Returns rich metadata including complexity metrics, control flow info, call graphs, and documentation status.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Natural language search query |
| `limit` | number | 10 | Max results |
| `branch` | string | main | Branch to search |
| `projectPath` | string | current | **Cross-project search:** path to another project |
| `includeContent` | boolean | false | **Include source code** (startLine to endLine) in results. Token-limited: large functions may fill the limit, remaining results shown without content. Use `offset` to paginate. |
| `minCyclomatic` | number | - | Filter: minimum cyclomatic complexity |
| `maxCyclomatic` | number | - | Filter: maximum cyclomatic complexity |
| `hasExceptions` | boolean | - | Filter: must have try-catch blocks |
| `hasLoops` | boolean | - | Filter: must have loops |
| `hasAwaits` | boolean | - | Filter: must have await expressions (async code) |
| `hasDocumentation` | boolean | - | Filter: must have documentation/docstrings |
| `isDeprecated` | boolean | - | Filter: deprecated entities only |
| `minCallCount` | number | - | Filter: minimum number of function calls |
| `changedInLastCommits` | number | - | Filter: only entities changed in last N graph commits (Prolly Tree). **⚡ Dramatically faster** — narrows 500+ results to 10-20 |
| `changedSinceMs` | number | - | Filter: only entities changed since this Unix timestamp (ms). **⚡ Same speedup** as changedInLastCommits |

**Returns (enhanced):**
```json
{
  "results": [{
    "id": "...",
    "name": "processData",
    "type": "function",
    "similarity": 0.89,
    "filePath": "src/utils.ts",
    "startLine": 45,
    "endLine": 89,
    "content": "function processData(...) { ... }",  // only with includeContent=true
    "complexity": {
      "cyclomatic": 8,
      "cognitive": 12,
      "linesOfCode": 45,
      "nestingDepth": 3
    },
    "controlFlow": {
      "hasBranches": true,
      "hasLoops": true,
      "hasExceptions": true,
      "hasAwaits": false,
      "branchCount": 5,
      "loopCount": 2,
      "returnCount": 3
    },
    "calls": {
      "count": 12,
      "hasAsync": false
    },
    "documentation": {
      "hasDocumentation": true,
      "hasParams": true,
      "hasExamples": false,
      "isDeprecated": false
    }
  }],
  "contentPagination": {  // only when content exceeds ~8K tokens
    "includedCount": 3,
    "totalCount": 10,
    "tokensUsed": 7500,
    "tokenLimit": 8000,
    "hasMore": true,
    "message": "Content included for 3 of 10 results. Use offset to see more."
  }
}
```

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
| `changedInLastCommits` | number | - | Filter: only entities changed in last N graph commits (Prolly Tree). **⚡ Much faster responses** |
| `changedSinceMs` | number | - | Filter: only entities changed since this Unix timestamp (ms). **⚡ Much faster responses** |

### `find_similar_code`
Find semantically similar code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | **required** | Code snippet to find similar |
| `threshold` | number | 0.5 | Similarity threshold (0-1) |
| `limit` | number | 10 | Max results |
| `includeContent` | boolean | false | Include source code in results (token-limited) |

### `cross_language_search`
Search across multiple languages.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Search query |
| `languages` | string[] | all | Languages (ts, js, py, go...) |
| `includeContent` | boolean | false | Include source code in results (token-limited) |

---

## Entity Analysis

### `list_file_entities`
List all entities in file (classes, functions, interfaces...).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filePath` | string | **required** | File path |
| `entityTypes` | string[] | all | Entity types to filter |

### `get_members`
Get class/interface/module members.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | **required** | Entity ID |

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

### `detect_code_clones`
Semantic duplicate code detection.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minSimilarity` | number | 0.8 | Min similarity (0-1) |
| `scope` | string | "all" | Scope: `all` / `file` / `module` |

### `find_duplicates`
Fast duplicate detection (hash-based).

### `jscpd_detect_clones`
Clone detector based on jscpd.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `paths` | string[] | root | Paths to scan |
| `pattern` | string | "**/*" | Glob pattern |
| `formats` | string[] | all | File extensions (ts, js, py...) |
| `minLines` | number | - | Min lines per clone |
| `minTokens` | number | - | Min tokens |

### `analyze_code_impact`
**Change impact analysis** — what breaks when entity changes.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entity` | string | **required** | Entity ID or name |
| `includeSemantic` | boolean | true | Include semantically related entities |
| `semanticLimit` | number | 10 | Max semantic matches |
| `semanticThreshold` | number | 0.7 | Min similarity threshold (0-1) |
| `highlightRecentChanges` | boolean | false | Annotate impacted entities with recently-changed status (Prolly Tree) |
| `recentCommitsCount` | number | 10 | Number of recent commits to consider for highlighting |

### `analyze_hotspots`
Find complex code areas. Uses Prolly Tree history for change frequency with Git fallback.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `metric` | string | "complexity" | Metric: `complexity` / `changes` / `coupling` / `all` |
| `limit` | number | 10 | Max results |
| `includeHistoricalMetrics` | boolean | true | Use Prolly Tree history for changeFrequency |
| `lookbackDays` | number | 30 | Days to look back for change frequency |

**Returns (with history):** `changeFrequency`, `changeFrequencyScore`, `changeSource` ("prolly" | "git" | "none")

### `analyze_state_chaos`
State chaos analysis (mutations, side-effects).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `scope` | enum | **required** | `file` / `module` / `project` |
| `stateIdentifiers` | string[] | - | State identifiers |
| `autoDetect` | boolean | false | Auto-detect state patterns |

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

### `modify_code`
Modify entity code.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | **required** | Entity ID |
| `newCode` | string | **required** | New code |
| `preserveComments` | boolean | true | Preserve comments |
| `updateImports` | boolean | true | Update imports |
| `preview` | boolean | true | Preview changes |

### `create_file`
Create new file.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filePath` | string | **required** | Absolute path |
| `content` | string | **required** | File content |
| `createDirectories` | boolean | true | Create parent dirs |
| `updateGraph` | boolean | true | Add to graph |

### `rename_symbol`
**Rename symbol across entire project** (smart rename).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | - | Entity ID (preferred) |
| `entityName` | string | - | Entity name |
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

---

## Snapshots & Rollback

### `create_snapshot`
Create state snapshot.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | **required** | Snapshot description |
| `files` | string[] | all | Files to include |

### `rollback_snapshot`
Rollback to snapshot.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `snapshotId` | string | **required** | Snapshot ID |

### `undo`
Undo last change.

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

### `switch_branch`
Switch to another branch.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `branch` | string | **required** | Branch name |

### `get_branch_status`
Current branch status.

### `get_changed_files`
Changed files between branches.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `fromBranch` | string | **required** | Source branch |
| `toBranch` | string | **required** | Target branch |

### `cleanup_branches`
Cleanup old branches (LRU).

---

## Version History (Prolly Tree) — NEW

### `list_commits`
List graph commits (version snapshots).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `branchName` | string | current | Branch name |
| `limit` | number | 100 | Max commits |

### `get_entity_history`
Get entity change history across commits.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entityId` | string | **required** | Entity ID |
| `limit` | number | 50 | Max commits |

**Returns:** History with `changeType`: "added" | "modified" | "deleted"

### `diff_commits`
Compare two graph commits (added/modified/deleted entities).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `commitA` | string | **required** | First commit hash (older) |
| `commitB` | string | HEAD | Second commit hash (newer) |
| `includeEntities` | boolean | false | Include full entity data |

### `checkout_commit`
Time travel — view graph at specific commit.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `commitHash` | string | **required** | Commit hash to view |
| `entityId` | string | - | Specific entity to retrieve |
| `query` | string | - | Search in historical state |

```
# List recent commits
list_commits limit=5

# Compare commits
diff_commits commitA="abc123" commitB="xyz789"

# View entity at old commit
checkout_commit commitHash="abc123" entityId="xyz789"
```

---

## System & Metrics

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

### `reset_graph`
Reset graph (clear all data).

### `get_metrics`
System metrics.

### `get_version`
Server version.

### `get_agent_metrics`
Agent metrics (execution time, memory).

### `get_bus_stats`
Message bus statistics.

---

## Tracing (Static Flow Analysis) — NEW

### `trace_flow`
**Trace execution from point A to B.** Finds all possible paths and analyzes state changes, conditions, and async boundaries.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `from` | string | **required** | Starting point (function name or semantic query) |
| `to` | string | **required** | Ending point (function name or semantic query) |
| `format` | enum | "sequence" | Output: `sequence` / `tree` / `graph` / `mermaid` |
| `maxDepth` | number | 15 | Maximum traversal depth |
| `trackStates` | boolean | true | Track state changes along paths |
| `trackConditions` | boolean | true | Track conditions/branches |
| `highlightRecentChanges` | boolean | false | Annotate trace nodes with recently-changed status (Prolly Tree) |
| `recentCommitsCount` | number | 10 | Number of recent commits to consider |

```
trace_flow from="handleLogin" to="sendEmail" format="mermaid"
trace_flow from="handleLogin" to="sendEmail" highlightRecentChanges=true
```

### `trace_backwards`
**Backward trace** — why a method might not be called.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `target` | string | **required** | Target method to analyze |
| `question` | enum | **required** | `why_not_called` / `what_affects` / `dependencies` |
| `depth` | number | 15 | Backward traversal depth |
| `includeStates` | boolean | true | Include state dependencies |
| `includeEffects` | boolean | true | Include side effects |
| `highlightRecentChanges` | boolean | false | Annotate trace nodes with recently-changed status (Prolly Tree) |
| `recentCommitsCount` | number | 10 | Number of recent commits to consider |

```
trace_backwards target="sendNotification" question="why_not_called"
trace_backwards target="sendNotification" question="why_not_called" highlightRecentChanges=true
```

### `trace_data_flow`
**Data flow trace** — how data flows from sources to affect target state.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `entryPoint` | string | **required** | Entry point function |
| `targetState` | string | **required** | Target state to trace |
| `dataSources` | string[] | auto | Data sources to analyze |
| `trackTransformations` | boolean | true | Track data transformations |

```
trace_data_flow entryPoint="processOrder" targetState="orderTotal"
```

### `analyze_state_impact`
**State impact analysis** — how state affects different scenarios.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `state` | string | **required** | State variable to analyze |
| `scenarios` | object[] | **required** | Scenarios: `[{value: ..., label: "..."}]` |
| `scope` | string | - | Scope of analysis (semantic query) |

```
analyze_state_impact state="isAuthenticated" scenarios=[{value: true, label: "Logged in"}, {value: false, label: "Guest"}]
```

### `find_decision_points`
**Find all decision points** in a scenario's execution flow.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `scenario` | string | **required** | Scenario to analyze |
| `groupBy` | enum | "impact" | `impact` / `location` / `type` |
| `includeGuards` | boolean | true | Include guard conditions |
| `includeEffects` | boolean | true | Include side effects |

**Decision point types:** validation, api_response, state_mutation, guard, loop, error_handling, feature_flag

```
find_decision_points scenario="user registration" groupBy="type"
```

---

## Cross-Project Support — NEW

### Using `projectPath` parameter

Some tools support `projectPath` parameter for **cross-project operations**:

```
# Search in another project without switching context
semantic_search query="authentication" projectPath="D:\\other\\project"

# Index switches context automatically
index directory="D:\\other\\project"
```

### Storage Location

Each project has isolated databases:
```
%LOCALAPPDATA%\UltraScriptTools\projects\{hash}\
├── graph.db      # Entity graph
├── vectors.db    # Embeddings
└── meta.json     # Metadata
```
