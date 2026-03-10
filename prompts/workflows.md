# UltraCode — Common Workflows

## 1. Analyze New Project

```
1. index directory="/path/to/project"
2. detect_technology_stack
3. get_graph_stats
4. analyze_hotspots metric="complexity" limit=20
```

## 2. Search and Refactor

```
1. semantic_search query="authentication error handling"
2. list_entity_relationships entityName="AuthService" depth=2
3. analyze_code_impact entityId="AuthService.login"
4. create_snapshot description="Before auth refactoring"
5. modify_code entityId="AuthService.login" newCode="..." preview=true
6. modify_code entityId="AuthService.login" newCode="..." preview=false
```

## 3. Find Duplicates

```
1. detect_code_clones minSimilarity=0.75
2. find_similar_code code="<snippet>" threshold=0.6
3. suggest_refactoring
```

## 4. Work with Branches

```
1. list_branches
2. switch_branch branch="feature/new-api"
3. get_changed_files fromBranch="main" toBranch="feature/new-api"
4. index incremental=true
```

## 5. Impact Analysis Before Changes

```
1. semantic_search query="function to modify"
2. analyze_code_impact entity="targetFunction" includeSemantic=true
3. Review dependents and semantic related code
4. create_snapshot description="Before changes"
5. Make modifications
```

## 6. Code Quality Audit

```
1. index directory="/project"
2. detect_code_clones minSimilarity=0.8
3. analyze_hotspots metric="complexity" limit=30
4. analyze_state_chaos scope="project" autoDetect=true
5. validate_directory dirPath="/project/src"
```

## 7. Understanding New Codebase

```
1. index directory="/new-project"
2. detect_technology_stack generateContext=true
3. get_graph_stats
4. pattern_search pattern="main|entry|init" mode="entity"
5. list_entity_relationships entityName="MainController" depth=3
```

## 8. Safe Rename Across Project

```
1. list_entity_relationships entityName="OldName"
2. analyze_code_impact entity="OldName"
3. create_snapshot description="Before renaming OldName"
4. rename_symbol entityName="OldName" newName="NewName" preview=true
5. Review changes
6. rename_symbol entityName="OldName" newName="NewName" preview=false
```

## 9. Find Complex Code Needing Refactoring

```
1. semantic_search query="data processing" minCyclomatic=10
2. semantic_search query="validation" hasExceptions=true hasLoops=true
3. analyze_code_impact entityId="complexFunction"
4. suggest_refactoring
```

## 10. Find Undocumented Code

```
1. semantic_search query="public API" hasDocumentation=false
2. semantic_search query="exported functions" hasDocumentation=false limit=50
3. Review results and add documentation
```

## 11. Find Async Code Patterns

```
1. semantic_search query="database operations" hasAwaits=true
2. semantic_search query="API calls" hasAwaits=true hasExceptions=false
3. Review for missing error handling in async code
```

## 12. Analyze Code Quality by Complexity

```
1. semantic_search query="" minCyclomatic=15  # Very complex code
2. semantic_search query="" maxCyclomatic=3   # Simple code
3. analyze_hotspots metric="complexity" limit=20
```

## 13. AutoDoc Workflow

Set up and maintain automatic documentation for a project:

```
1. Detect project language
   autodoc_detect_language scope="comments"
   -> Determines language from code comments

2. Initialize AutoDoc
   autodoc_init enabled=true language="en"
   -> Creates .autodoc/ directory structure

3. Check status
   autodoc_status
   -> Shows docs count, sections, refs

4. Generate documentation for key modules
   autodoc_generate filePath="src/core/" scope="module" style="detailed"
   -> Generates AutoDoc content using LLM

5. Save generated documentation
   autodoc_save filePath="ARCHITECTURE.md" content="..."
   -> Parses links, generates embeddings, extracts sections

6. Search documentation
   autodoc_search query="authentication flow" mode="semantic"
   -> Finds relevant docs and code

7. After code changes — sync and validate
   autodoc_sync scope="outdated"
   -> Finds outdated documents
   autodoc_validate fixBrokenRefs=true
   -> Fixes broken references

8. View change history
   autodoc_changelog limit=10
   -> Shows what docs changed after code modifications
```

**AutoDoc Watcher** provides automatic updates when enabled in config:
```yaml
mcp:
  autodoc:
    watcherEnabled: true
```

## 14. Semantic Merge Workflow

Resolve merge conflicts using semantic code understanding:

```
1. Analyze merge conflicts
   analyze_merge_conflicts filePath="src/service.ts"
   -> Lists conflicts with type classification:
      structural, semantic, textual
   -> Shows risk assessment per conflict

2. Get AI-powered resolution suggestions
   get_merge_suggestions conflictId="conflict_1" strategy="auto"
   -> Returns suggested code with confidence score
   -> Explains reasoning

3. Check merge engine status
   get_semantic_merge_info filePath="src/service.ts"
   -> Shows supported languages, active sessions

4. Apply semantic merge
   semantic_merge \
     basePath="src/service.ts.base" \
     oursPath="src/service.ts.ours" \
     theirsPath="src/service.ts.theirs" \
     outputPath="src/service.ts" \
     strategy="semantic"
   -> Merges using structural understanding

5. Validate result
   validate_file filePath="src/service.ts"
   -> Ensures merged file is syntactically valid
```

**When to use semantic merge over manual resolution:**
- Structural conflicts (both branches modified the same class differently)
- Renamed or moved code that git cannot track
- Complex refactoring merges across multiple files
- Any conflict where line-by-line diff is insufficient

## 15. Prolly Tree History Workflow

Leverage version history for change tracking and time travel:

```
1. List recent graph commits
   list_commits limit=10
   -> Shows commit hashes with timestamps

2. Track entity change history
   get_entity_history entityId="AuthService_class_xyz" limit=20
   -> Shows: added, modified, deleted across commits

3. Compare two points in time
   diff_commits commitA="abc123" commitB="xyz789"
   -> Lists added/modified/deleted entities between commits

4. Time travel — view code at a specific commit
   checkout_commit commitHash="abc123" entityId="AuthService_class_xyz"
   -> Retrieves entity as it existed at that commit

5. Use history filters for faster searches
   semantic_search query="auth" changedInLastCommits=5
   -> Only recently changed entities — 10-20 results instead of 500+

   analyze_code_impact entity="AuthService" highlightRecentChanges=true
   -> Annotates impacted entities with recently-changed status
```

**Key benefits of Prolly Tree history:**
- `changedInLastCommits` / `changedSinceMs` filters dramatically speed up search
- `highlightRecentChanges` available on **10 diagnostic tools** — shows which entities in the analysis results were recently modified:
  - `analyze_code_impact`, `analyze_hotspots`, `trace_flow`, `trace_backwards` (existed before)
  - `analyze_stacktrace`, `detect_patterns`, `analyze_state_chaos`, `trace_data_flow`, `analyze_state_impact`, `find_decision_points` (new)
- `get_entity_history` reveals how code evolved over time
- `checkout_commit` enables viewing any historical state without git checkout

## 16. Security Audit

Comprehensive security analysis of a codebase:

```
1. Full taint analysis
   taint_analysis category="all"
   -> Finds source→sink flows without sanitization

2. Focus on critical categories
   taint_analysis category="sql_injection"
   taint_analysis category="command_injection"
   -> Targeted analysis for specific vulnerability types

3. Check for security patterns
   detect_patterns category="anti-pattern" tags=["security"]
   -> Detects insecure coding patterns

4. Trace suspicious data flows
   trace_data_flow entryPoint="handleRequest" targetState="database"
   -> Understand how user data reaches the database

5. Review high-risk entities
   graph_metrics metric="pagerank" topN=10
   -> Identify most important entities
   -> Cross-reference with taint results for priority
```

## 17. Architecture Review

Understand codebase architecture using graph metrics:

```
1. Identify most important entities
   graph_metrics metric="pagerank" topN=20
   -> Shows entities with highest connectivity importance

2. Detect module boundaries
   graph_metrics metric="louvain"
   -> Community detection reveals natural module clusters

3. Find architectural roles
   graph_metrics metric="centrality" topN=20
   -> Classifies entities as hub/authority/bridge/leaf

4. Knowledge concentration risk
   graph_metrics metric="bus_factor"
   -> Shows files/modules with single-author risk

5. Persist metrics for enhanced search
   graph_metrics metric="pagerank" persist=true
   graph_metrics metric="louvain" persist=true
   -> Subsequent semantic_search results boosted by PageRank

6. Combine with hotspot analysis
   analyze_hotspots metric="complexity" limit=20
   -> Cross-reference complexity hotspots with PageRank importance
```

## Quick Reference

### Search
- `semantic_search` — semantic search by meaning (with complexity/flow/docs filters)
- `query` — natural language query
- `pattern_search` — regex/semantic/hybrid search
- `find_similar_code` — find similar code

### Search Filters (semantic_search)
- `minCyclomatic` / `maxCyclomatic` — filter by cyclomatic complexity
- `hasExceptions` — filter by try-catch presence
- `hasLoops` — filter by loop presence
- `hasAwaits` — filter by async/await usage
- `hasDocumentation` — filter by documentation presence
- `isDeprecated` — filter deprecated entities
- `minCallCount` — filter by number of function calls
- `changedInLastCommits` / `changedSinceMs` — filter by Prolly Tree history

### Analysis
- `list_file_entities` — entities in file
- `list_entity_relationships` — dependencies
- `analyze_code_impact` — impact analysis
- `detect_code_clones` — find duplicates
- `analyze_hotspots` — complex areas
- `find_decision_points` — decision points in execution flow
- `analyze_state_chaos` — state mutation analysis
- `graph_metrics` — PageRank, Louvain communities, centrality, bus factor

### Security
- `taint_analysis` — source→sink flow analysis with vulnerability detection

### Modification
- `modify_code` — modify code
- `rename_symbol` — rename
- `create_file` / `copy_file` / `rename_file` / `split_file` / `synthesize_files`
- `create_snapshot` / `rollback_snapshot` / `undo`
- `semantic_merge` / `analyze_merge_conflicts` / `get_merge_suggestions`

### AutoDoc
- `autodoc_init` / `autodoc_status` / `autodoc_detect_language`
- `autodoc_generate` / `autodoc_save` / `autodoc_get` / `autodoc_search`
- `autodoc_validate` / `autodoc_sync` / `autodoc_changelog`

### Git & History
- `list_branches` — list branches
- `switch_branch` — switch branch
- `get_changed_files` — changed files
- `list_commits` / `diff_commits` / `checkout_commit` / `get_entity_history`
