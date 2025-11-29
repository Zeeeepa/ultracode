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
**Semantic search by meaning.** Understands natural language.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Natural language search query |
| `limit` | number | 10 | Max results |
| `branch` | string | main | Branch to search |

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

### `analyze_hotspots`
Find complex code areas.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `metric` | string | "complexity" | Metric: `complexity` / `changes` / `coupling` |
| `limit` | number | 10 | Max results |

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
