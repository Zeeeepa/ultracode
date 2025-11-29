# UltraScript Tools — Common Workflows

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

## Quick Reference

### Search
- `semantic_search` — semantic search by meaning
- `query` — natural language query
- `pattern_search` — regex/semantic/hybrid search
- `find_similar_code` — find similar code

### Analysis
- `list_file_entities` — entities in file
- `list_entity_relationships` — dependencies
- `analyze_code_impact` — impact analysis
- `detect_code_clones` — find duplicates
- `analyze_hotspots` — complex areas

### Modification
- `modify_code` — modify code
- `rename_symbol` — rename
- `create_file` / `copy_file` / `rename_file`
- `create_snapshot` / `rollback_snapshot` / `undo`

### Git
- `list_branches` — list branches
- `switch_branch` — switch branch
- `get_changed_files` — changed files
