---
module_name: handlers
description: "MCP tool handler implementations for analysis, search, modification, branching, merging, and more"
status: active
language: typescript
---

# Handlers

> Complete set of MCP tool handler implementations covering code analysis, semantic search, file modification, branch management, merge operations, snapshots, tracing, validation, documentation, and system metrics.

## Overview

The handlers module contains all tool handler classes that implement the business logic behind MCP tools. Each handler extends `BaseToolHandler`, validates input via Zod schemas, and returns structured `ToolResult` responses. The module supports lazy loading: basic handlers (graph, entity, metrics, index) load immediately at startup, while all other handlers are dynamically imported on first use via the `ToolRegistry` for faster startup times.

## Data Flow

- **Inputs:** Validated tool arguments from MCP protocol requests, parsed through Zod schemas.
- **Processing:** Handler-specific logic using GraphStorage, SemanticAgent, ImpactAnalyzer, CodeValidator, etc.
- **Outputs:** Structured `ToolResult` objects with text content and optional metadata.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `AnalyzeCodeImpactToolHandler` | class | Analyzes impact of code changes on dependents | [`analysis-tool-handlers.ts`](./analysis-tool-handlers.ts) |
| `AnalyzeHotspotsToolHandler` | class | Finds complex/frequently-changed code areas | [`analysis-tool-handlers.ts`](./analysis-tool-handlers.ts) |
| `AnalyzeStateChaosToolHandler` | class | Detects scattered state and race conditions | [`analysis-tool-handlers.ts`](./analysis-tool-handlers.ts) |
| `DetectTechnologyStackToolHandler` | class | Identifies project technologies and frameworks | [`analysis-tool-handlers.ts`](./analysis-tool-handlers.ts) |
| `SemanticSearchToolHandler` | class | Natural language code search via embeddings | [`semantic-tool-handlers.ts`](./semantic-tool-handlers.ts) |
| `FindSimilarCodeToolHandler` | class | Finds semantically similar code fragments | [`semantic-tool-handlers.ts`](./semantic-tool-handlers.ts) |
| `PatternSearchToolHandler` | class | Regex and framework-aware pattern search | [`semantic-tool-handlers.ts`](./semantic-tool-handlers.ts) |
| `ModifyEntityCodeToolHandler` | class | Modifies code of an individual entity | [`file-tool-handlers.ts`](./file-tool-handlers.ts) |
| `RenameSymbolToolHandler` | class | Renames symbols with reference updates | [`file-tool-handlers.ts`](./file-tool-handlers.ts) |
| `CreateFileToolHandler` | class | Creates new files with content | [`file-tool-handlers.ts`](./file-tool-handlers.ts) |
| `ListBranchesToolHandler` | class | Lists all git branches | [`branch-tool-handlers.ts`](./branch-tool-handlers.ts) |
| `SwitchBranchToolHandler` | class | Switches git branches with re-indexing | [`branch-tool-handlers.ts`](./branch-tool-handlers.ts) |
| `SemanticMergeToolHandler` | class | Semantic branch merging with conflict resolution | [`merge-tool-handlers.ts`](./merge-tool-handlers.ts) |
| `TraceFlowToolHandler` | class | Traces code execution flow from A to B | [`tracing-tool-handlers.ts`](./tracing-tool-handlers.ts) |
| `ValidateFileToolHandler` | class | Validates file syntax via linters | [`validation-tool-handlers.ts`](./validation-tool-handlers.ts) |
| `IndexToolHandler` | class | Triggers project directory indexing | [`index-tool-handler.ts`](./index-tool-handler.ts) |
| `GetGraphStatsToolHandler` | class | Returns knowledge graph statistics | [`graph-tool-handlers.ts`](./graph-tool-handlers.ts) |
| `TaintAnalysisToolHandler` | class | Taint analysis with offset/limit pagination | [`taint-tool-handlers.ts`](./taint-tool-handlers.ts) |
| `GraphMetricsToolHandler` | class | Graph metrics: pagerank, louvain, centrality, bus_factor | [`graph-metrics-tool-handlers.ts`](./graph-metrics-tool-handlers.ts) |
| `GetHelpToolHandler` | class | Serves documentation from prompts/ directory | [`help-tool-handler.ts`](./help-tool-handler.ts) |
| `GetToolsForTaskHandler` | class | Recommends tools based on task description | [`get-tools-for-task-handler.ts`](./get-tools-for-task-handler.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `tools/base-tool-handler` | `BaseToolHandler` base class and `ToolResult` type |
| `tools/schemas` | Zod validation schemas for all tools |
| `tools/response-limits` | `paginate()`, `SAFE_LIMITS`, `MAX_PAGE_SIZE` for pagination |
| `tools/tool-definitions` | Tool metadata and descriptions |
| `tools/impact-analyzer` | Code impact analysis engine |
| `analysis/chaos` | State chaos and race condition detection |
| `validation/code-validator` | Linter integration for file validation |

### External Packages

| Package | Purpose |
|---------|---------|
| `zod` | Input validation for tool arguments |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Loading strategy | Basic handlers eager, others lazy-loaded on first use |
| Handler groups | 13 groups: analysis, autodoc, branch, entity, file, graph, graph-metrics, merge, metrics, security (taint), semantic, snapshot, tracing, validation |
| Total handlers | 50+ tool handler classes |
| Paginated handlers | `TaintAnalysisToolHandler`, `AnalyzeHotspotsToolHandler` use `paginate()` with `offset`/`limit` |

## Error Handling

Each handler wraps execution in try/catch and returns error details in the `ToolResult` structure. Input validation failures from Zod produce descriptive error messages. Missing dependencies (e.g., no vector store for semantic search) return informative fallback messages.

## Known Limitations

- Lazy loading means first invocation of advanced tools has a small import delay.
- Some handlers require semantic embedding to be configured (semantic search, find similar code).
- File modification handlers do not support binary files.

## Exports

- `ListEntityRelationshipsToolHandler`
- `ListFileEntitiesToolHandler`
- `QueryToolHandler`
- `CleanIndexToolHandler`
- `GetGraphHealthToolHandler`
- `GetGraphStatsToolHandler`
- `GetGraphToolHandler`
- `ResetGraphToolHandler`
- `IndexToolHandler`
- `ClearBusTopicToolHandler`
- `GetAgentMetricsToolHandler`
- `GetBusStatsToolHandler`
- `GetMetricsToolHandler`
- `GetVersionToolHandler`
- `GetWatcherStatusToolHandler`
- `AnalyzeCodeImpactToolHandler`
- `AnalyzeHotspotsToolHandler`
- `AnalyzeStateChaosToolHandler`
- `DetectTechnologyStackToolHandler`
- `FindRelatedConceptsToolHandler`
- `SuggestRefactoringToolHandler`
- `AutoDocChangelogToolHandler`
- `AutoDocDetectLanguageToolHandler`
- `AutoDocGenerateToolHandler`
- `AutoDocGetToolHandler`
- `AutoDocInitToolHandler`
- `AutoDocInstallHooksToolHandler`
- `AutoDocSaveToolHandler`
- `AutoDocSearchToolHandler`
- `AutoDocStatusToolHandler`
- `AutoDocSyncToolHandler`
- `AutoDocValidateToolHandler`
- `CleanupBranchesToolHandler`
- `GetBranchStatusToolHandler`
- `GetChangedFilesToolHandler`
- `ListBranchesToolHandler`
- `SwitchBranchToolHandler`
- `AddMemberToolHandler`
- `CopyFileToolHandler`
- `CreateFileToolHandler`
- `ModifyEntityCodeToolHandler`
- `RenameFileToolHandler`
- `RenameSymbolToolHandler`
- `SplitFileToolHandler`
- `SynthesizeFilesToolHandler`
- `AnalyzeMergeConflictsToolHandler`
- `GetMergeSuggestionsToolHandler`
- `GetSemanticMergeInfoToolHandler`
- `SemanticMergeToolHandler`
- `CrossLanguageSearchToolHandler`

## Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports all handler classes (eager + lazy-loaded) |
| `analysis-tool-handlers.ts` | Code impact, hotspots, state chaos, tech stack, refactoring |
| `autodoc-tool-handlers.ts` | AutoDoc init, save, get, search, validate, generate, sync |
| `branch-tool-handlers.ts` | Branch list, switch, status, cleanup, changed files |
| `entity-tool-handlers.ts` | Entity listing, relationships, natural language queries |
| `file-tool-handlers.ts` | File modify, copy, rename, split, synthesize, create, add member |
| `file-tool-utils.ts` | Shared utilities for file tool handlers |
| `get-tools-for-task-handler.ts` | Task-based tool recommendation engine |
| `graph-tool-handlers.ts` | Graph retrieval, stats, health, reset, bus operations |
| `help-tool-handler.ts` | Documentation serving from prompts/ directory |
| `history-tool-handlers.ts` | Entity history, commit diffing, time travel |
| `index-tool-handler.ts` | Project directory indexing trigger |
| `merge-tool-handlers.ts` | Semantic merge, conflict analysis, suggestions |
| `metrics-tool-handlers.ts` | System metrics, agent metrics, watcher status, version |
| `semantic-tool-handlers.ts` | Semantic search, similar code, clones, patterns, cross-language |
| `snapshot-tool-handlers.ts` | Snapshot create, rollback, list, cleanup |
| `taint-tool-handlers.ts` | Taint analysis handler with offset/limit pagination via `paginate()` |
| `graph-metrics-tool-handlers.ts` | Graph metrics handler: pagerank, louvain, centrality, bus_factor |
| `tracing-tool-handlers.ts` | Flow tracing, backwards tracing, data flow, state impact |
| `validation-tool-handlers.ts` | File and directory validation via linters |
