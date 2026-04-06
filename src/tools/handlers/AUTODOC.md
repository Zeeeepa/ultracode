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


### Added Entities

- **AutoDocBatchGenerateHandler** — `autodoc-batch-handler.ts:32-123`
- **GrepIndexToolHandler** — `zig-compat-tool-handlers.ts:30-112`
- **BatchModifyToolHandler** — `zig-compat-tool-handlers.ts:118-177`
- **BatchRenameToolHandler** — `zig-compat-tool-handlers.ts:183-226`
- **SecurityScanToolHandler** — `zig-compat-tool-handlers.ts:232-281`
- **GetReviewContextToolHandler** — `zig-compat-tool-handlers.ts:287-335`
- **DetectArchitectureLayersToolHandler** — `zig-compat-tool-handlers.ts:352-399`
- **GenerateOnboardingToolHandler** — `zig-compat-tool-handlers.ts:405-453`
- **SetupEmbeddingToolHandler** — `zig-compat-tool-handlers.ts:459-498`
- **getChangedDirectories** — `autodoc-batch-handler.ts:133-146`
- **generateForDirectory** — `autodoc-batch-handler.ts:152-246`
- **syncAutodocFiles** — `autodoc-batch-handler.ts:251-272`
- **startEnrichBackground** — `autodoc-batch-handler.ts:277-352`
- **parseArgs** — `autodoc-batch-handler.ts:33-35`
- **execute** — `autodoc-batch-handler.ts:37-118`
- **textResult** — `autodoc-batch-handler.ts:120-122`
- **parseArgs** — `zig-compat-tool-handlers.ts:31-33`
- **execute** — `zig-compat-tool-handlers.ts:35-111`
- **parseArgs** — `zig-compat-tool-handlers.ts:119-121`
- **execute** — `zig-compat-tool-handlers.ts:123-176`
- **parseArgs** — `zig-compat-tool-handlers.ts:184-186`
- **execute** — `zig-compat-tool-handlers.ts:188-225`
- **parseArgs** — `zig-compat-tool-handlers.ts:233-235`
- **execute** — `zig-compat-tool-handlers.ts:237-280`
- **parseArgs** — `zig-compat-tool-handlers.ts:288-290`
- **execute** — `zig-compat-tool-handlers.ts:292-334`
- **parseArgs** — `zig-compat-tool-handlers.ts:355-357`
- **execute** — `zig-compat-tool-handlers.ts:359-398`
- **parseArgs** — `zig-compat-tool-handlers.ts:406-408`
- **execute** — `zig-compat-tool-handlers.ts:410-452`
- **parseArgs** — `zig-compat-tool-handlers.ts:460-462`
- **execute** — `zig-compat-tool-handlers.ts:464-497`
- **projectPath** — `autodoc-batch-handler.ts:38-38`
- **forceRegen** — `autodoc-batch-handler.ts:39-39`
- **enrich** — `autodoc-batch-handler.ts:40-40`
- **target** — `autodoc-batch-handler.ts:41-41`
- **result** — `autodoc-batch-handler.ts:43-43`
- **enrichFullDirs** — `autodoc-batch-handler.ts:44-44`
- **enrichIncrDirs** — `autodoc-batch-handler.ts:45-45`
- **graphStorage** — `autodoc-batch-handler.ts:49-49`
- **storagePaths** — `autodoc-batch-handler.ts:52-52`
- **docDbPath** — `autodoc-batch-handler.ts:53-53`
- **docStorage** — `autodoc-batch-handler.ts:54-54`
- **dirs** — `autodoc-batch-handler.ts:62-62`
- **change** — `autodoc-batch-handler.ts:72-72`
- **entities** — `autodoc-batch-handler.ts:135-135`
- **dirSet** — `autodoc-batch-handler.ts:136-136`
- **dir** — `autodoc-batch-handler.ts:140-140`
- **all** — `autodoc-batch-handler.ts:167-167`
- **dirNorm** — `autodoc-batch-handler.ts:168-168`
- **fp** — `autodoc-batch-handler.ts:170-170`
- **summaryEntities** — `autodoc-batch-handler.ts:181-189`
- **compositeHash** — `autodoc-batch-handler.ts:192-192`
- **dirNorm** — `autodoc-batch-handler.ts:195-195`
- **entityId** — `autodoc-batch-handler.ts:196-196`
- **curCount** — `autodoc-batch-handler.ts:199-199`
- **existingMeta** — `autodoc-batch-handler.ts:204-204`
- **change** — `autodoc-batch-handler.ts:205-205`
- **templateContent** — `autodoc-batch-handler.ts:213-213`
- **sourceHash** — `autodoc-batch-handler.ts:214-214`
- **existingDoc** — `autodoc-batch-handler.ts:222-222`
- **isEnriched** — `autodoc-batch-handler.ts:224-227`
- **mergedContent** — `autodoc-batch-handler.ts:230-233`
- **dirNorm** — `autodoc-batch-handler.ts:255-255`
- **entityId** — `autodoc-batch-handler.ts:256-256`
- **doc** — `autodoc-batch-handler.ts:257-257`
- **absDir** — `autodoc-batch-handler.ts:261-261`
- **filePath** — `autodoc-batch-handler.ts:262-262`
- **{ enrichSingleDoc }** — `autodoc-batch-handler.ts:284-284`
- **{ detectLLMProviders }** — `autodoc-batch-handler.ts:285-285`
- **{ recommended }** — `autodoc-batch-handler.ts:287-287`
- **dirNorm** — `autodoc-batch-handler.ts:297-297`
- **entityId** — `autodoc-batch-handler.ts:298-298`
- **doc** — `autodoc-batch-handler.ts:299-299`
- **codeCtx** — `autodoc-batch-handler.ts:302-302`
- **result** — `autodoc-batch-handler.ts:303-308`
- **dirNorm** — `autodoc-batch-handler.ts:324-324`
- **entityId** — `autodoc-batch-handler.ts:325-325`
- **doc** — `autodoc-batch-handler.ts:326-326`
- **codeCtx** — `autodoc-batch-handler.ts:329-329`
- **result** — `autodoc-batch-handler.ts:330-335`
- **resolvedPath** — `zig-compat-tool-handlers.ts:36-36`
- **{ TrigramIndex }** — `zig-compat-tool-handlers.ts:40-40`
- **{ join }** — `zig-compat-tool-handlers.ts:41-41`
- **indexPath** — `zig-compat-tool-handlers.ts:42-42`
- **index** — `zig-compat-tool-handlers.ts:43-43`
- **matches** — `zig-compat-tool-handlers.ts:47-52`
- **{ execSync }** — `zig-compat-tool-handlers.ts:80-80`
- **rgArgs** — `zig-compat-tool-handlers.ts:81-81`
- **output** — `zig-compat-tool-handlers.ts:87-92`
- **storage** — `zig-compat-tool-handlers.ts:124-124`
- **isPreview** — `zig-compat-tool-handlers.ts:125-125`
- **where** — `zig-compat-tool-handlers.ts:128-128`
- **query** — `zig-compat-tool-handlers.ts:129-129`
- **entities** — `zig-compat-tool-handlers.ts:135-140`
- **changes** — `zig-compat-tool-handlers.ts:148-155`
- **storage** — `zig-compat-tool-handlers.ts:189-189`
- **isPreview** — `zig-compat-tool-handlers.ts:190-190`
- **entities** — `zig-compat-tool-handlers.ts:192-197`
- **renames** — `zig-compat-tool-handlers.ts:199-204`
- **storage** — `zig-compat-tool-handlers.ts:238-238`
- **entities** — `zig-compat-tool-handlers.ts:241-241`
- **sinks** — `zig-compat-tool-handlers.ts:242-242`
- **meta** — `zig-compat-tool-handlers.ts:245-245`
- **code** — `zig-compat-tool-handlers.ts:246-246`
- **storage** — `zig-compat-tool-handlers.ts:293-293`
- **affectedEntities** — `zig-compat-tool-handlers.ts:295-295`
- **entities** — `zig-compat-tool-handlers.ts:298-298`
- **entityNames** — `zig-compat-tool-handlers.ts:299-299`
- **dependents** — `zig-compat-tool-handlers.ts:302-302`
- **rels** — `zig-compat-tool-handlers.ts:304-304`
- **LAYER_PATTERNS** — `zig-compat-tool-handlers.ts:341-350`
- **storage** — `zig-compat-tool-handlers.ts:360-360`
- **entities** — `zig-compat-tool-handlers.ts:361-361`
- **layers** — `zig-compat-tool-handlers.ts:363-363`
- **path** — `zig-compat-tool-handlers.ts:367-367`
- **storage** — `zig-compat-tool-handlers.ts:411-411`
- **maxSteps** — `zig-compat-tool-handlers.ts:412-412`
- **entities** — `zig-compat-tool-handlers.ts:414-414`
- **scored** — `zig-compat-tool-handlers.ts:417-421`
- **steps** — `zig-compat-tool-handlers.ts:423-434`
- **{ loadModelsCatalog, getModelById }** — `zig-compat-tool-handlers.ts:465-465`
- **catalog** — `zig-compat-tool-handlers.ts:466-466`
- **model** — `zig-compat-tool-handlers.ts:467-467`
- **resolvedTarget** — `autodoc-batch-handler.ts:58-58`
- **entities** — `autodoc-batch-handler.ts:162-162`
- **curLoc** — `autodoc-batch-handler.ts:200-200`
- **synced** — `autodoc-batch-handler.ts:252-252`
- **total** — `autodoc-batch-handler.ts:293-293`
- **filtered** — `zig-compat-tool-handlers.ts:143-143`
- **Args** — `autodoc-batch-handler.ts:30-30`

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

## New (pending description)

- **GetDatabaseSchemaToolHandler** — `db-schema-tool-handlers.ts:19-161`
- **<anonymous>** — `db-schema-tool-handlers.ts:19-19`
- **GetArchitectureDiagramToolHandler** — `diagram-tool-handler.ts:18-66`
- **<anonymous>** — `diagram-tool-handler.ts:18-18`
- **DetectPatternsToolHandler** — `pattern-tool-handlers.ts:34-147`
- **<anonymous>** — `pattern-tool-handlers.ts:34-34`
- **CheckEntityPatternsToolHandler** — `pattern-tool-handlers.ts:151-209`
- **<anonymous>** — `pattern-tool-handlers.ts:151-151`
- **AnalyzeStacktraceToolHandler** — `stacktrace-tool-handler.ts:25-137`
- **<anonymous>** — `stacktrace-tool-handler.ts:25-25`
- **SpawnAgentWorktreeHandler** — `worktree-tool-handlers.ts:37-144`
- **<anonymous>** — `worktree-tool-handlers.ts:37-37`
- **ListWorktreeAgentsHandler** — `worktree-tool-handlers.ts:152-212`
- **<anonymous>** — `worktree-tool-handlers.ts:152-152`
- **CleanupWorktreeHandler** — `worktree-tool-handlers.ts:220-303`
- **<anonymous>** — `worktree-tool-handlers.ts:220-220`
- **GetWorktreeInfoHandler** — `worktree-tool-handlers.ts:311-377`
- **<anonymous>** — `worktree-tool-handlers.ts:311-311`
- **DbSchemaArgs** — `db-schema-tool-handlers.ts:12-17`
- **e** — `db-schema-tool-handlers.ts:29-29`
- **e** — `db-schema-tool-handlers.ts:33-36`
- **e** — `db-schema-tool-handlers.ts:41-44`
- **e** — `db-schema-tool-handlers.ts:64-64`
- **e** — `db-schema-tool-handlers.ts:65-65`
- **e** — `db-schema-tool-handlers.ts:67-67`
- **e** — `db-schema-tool-handlers.ts:69-69`
- **e** — `db-schema-tool-handlers.ts:70-70`
- **e** — `db-schema-tool-handlers.ts:71-71`
- **e** — `db-schema-tool-handlers.ts:72-72`
- **e** — `db-schema-tool-handlers.ts:74-74`
- **e** — `db-schema-tool-handlers.ts:81-81`
- **e** — `db-schema-tool-handlers.ts:82-82`
- **r** — `db-schema-tool-handlers.ts:84-84`
- **r** — `db-schema-tool-handlers.ts:86-90`
- **e** — `db-schema-tool-handlers.ts:94-94`
- **e** — `db-schema-tool-handlers.ts:95-100`
- **e** — `db-schema-tool-handlers.ts:144-144`
- **e** — `db-schema-tool-handlers.ts:145-145`
- **e** — `db-schema-tool-handlers.ts:146-146`
- **e** — `db-schema-tool-handlers.ts:147-147`
- **e** — `db-schema-tool-handlers.ts:148-148`
- **e** — `db-schema-tool-handlers.ts:149-149`
- **e** — `db-schema-tool-handlers.ts:150-150`
- **e** — `db-schema-tool-handlers.ts:151-151`
- **formatTable** — `db-schema-tool-handlers.ts:167-181`
- **<anonymous>** — `db-schema-tool-handlers.ts:167-167`
- **formatView** — `db-schema-tool-handlers.ts:183-190`
- **<anonymous>** — `db-schema-tool-handlers.ts:183-183`
- **formatProcedure** — `db-schema-tool-handlers.ts:192-202`
- **<anonymous>** — `db-schema-tool-handlers.ts:192-192`
- **formatTrigger** — `db-schema-tool-handlers.ts:204-213`
- **<anonymous>** — `db-schema-tool-handlers.ts:204-204`
- **formatIndex** — `db-schema-tool-handlers.ts:215-224`
- **<anonymous>** — `db-schema-tool-handlers.ts:215-215`
- **formatEnum** — `db-schema-tool-handlers.ts:226-232`
- **<anonymous>** — `db-schema-tool-handlers.ts:226-226`
- **formatRedisKey** — `db-schema-tool-handlers.ts:234-242`
- **<anonymous>** — `db-schema-tool-handlers.ts:234-234`
- **formatLinqQuery** — `db-schema-tool-handlers.ts:244-252`
- **<anonymous>** — `db-schema-tool-handlers.ts:244-244`
- **getEngine** — `pattern-tool-handlers.ts:25-30`
- **<anonymous>** — `pattern-tool-handlers.ts:25-25`
- **m** — `pattern-tool-handlers.ts:87-88`
- **t** — `pattern-tool-handlers.ts:88-88`
- **m** — `pattern-tool-handlers.ts:98-105`
- **e** — `pattern-tool-handlers.ts:110-110`
- **s** — `pattern-tool-handlers.ts:128-128`
- **s** — `pattern-tool-handlers.ts:132-132`
- **m** — `pattern-tool-handlers.ts:181-195`
- **h** — `stacktrace-tool-handler.ts:95-99`
- **formatOutput** — `stacktrace-tool-handler.ts:139-202`
- **<anonymous>** — `stacktrace-tool-handler.ts:139-139`
- **f** — `stacktrace-tool-handler.ts:167-175`
- **s** — `worktree-tool-handlers.ts:172-172`
- **wt** — `worktree-tool-handlers.ts:175-175`
- **wt** — `worktree-tool-handlers.ts:176-186`
- **s** — `worktree-tool-handlers.ts:177-177`
- **wt** — `worktree-tool-handlers.ts:192-199`
- **wt** — `worktree-tool-handlers.ts:231-231`
- **wt** — `worktree-tool-handlers.ts:241-241`
- **s** — `worktree-tool-handlers.ts:342-342`
- **wt** — `worktree-tool-handlers.ts:354-359`
- **sm** — `worktree-tool-handlers.ts:360-365`
- **st** — `worktree-tool-handlers.ts:366-369`
- **parseArgs** — `db-schema-tool-handlers.ts:20-22`
- **execute** — `db-schema-tool-handlers.ts:24-160`
- **parseArgs** — `diagram-tool-handler.ts:19-21`
- **execute** — `diagram-tool-handler.ts:23-65`
- **parseArgs** — `pattern-tool-handlers.ts:35-37`
- **execute** — `pattern-tool-handlers.ts:39-146`
- **parseArgs** — `pattern-tool-handlers.ts:152-154`
- **execute** — `pattern-tool-handlers.ts:156-208`
- **parseArgs** — `stacktrace-tool-handler.ts:26-28`
- **execute** — `stacktrace-tool-handler.ts:30-136`
- **parseArgs** — `worktree-tool-handlers.ts:38-40`
- **execute** — `worktree-tool-handlers.ts:42-137`
- **errorResult** — `worktree-tool-handlers.ts:139-143`
- **parseArgs** — `worktree-tool-handlers.ts:153-155`
- **execute** — `worktree-tool-handlers.ts:157-211`
- **parseArgs** — `worktree-tool-handlers.ts:221-223`
- **execute** — `worktree-tool-handlers.ts:225-302`
- **parseArgs** — `worktree-tool-handlers.ts:312-314`
- **execute** — `worktree-tool-handlers.ts:316-376`
- **storage** — `db-schema-tool-handlers.ts:25-25`
- **allEntities** — `db-schema-tool-handlers.ts:26-26`
- **dbEntities** — `db-schema-tool-handlers.ts:29-29`
- **filter** — `db-schema-tool-handlers.ts:32-32`
- **name** — `db-schema-tool-handlers.ts:34-34`
- **engine** — `db-schema-tool-handlers.ts:40-40`
- **entityEngine** — `db-schema-tool-handlers.ts:42-42`
- **tables** — `db-schema-tool-handlers.ts:64-64`
- **views** — `db-schema-tool-handlers.ts:65-65`
- **procedures** — `db-schema-tool-handlers.ts:66-68`
- **triggers** — `db-schema-tool-handlers.ts:69-69`
- **indexes** — `db-schema-tool-handlers.ts:70-70`
- **enums** — `db-schema-tool-handlers.ts:71-71`
- **redisKeys** — `db-schema-tool-handlers.ts:72-72`
- **linqQueries** — `db-schema-tool-handlers.ts:73-75`
- **relSummary** — `db-schema-tool-handlers.ts:78-78`
- **allRels** — `db-schema-tool-handlers.ts:80-80`
- **dbEntityIds** — `db-schema-tool-handlers.ts:81-81`
- **entityMap** — `db-schema-tool-handlers.ts:82-82`
- **migrationEntities** — `db-schema-tool-handlers.ts:94-94`
- **migrations** — `db-schema-tool-handlers.ts:95-100`
- **driftInfo** — `db-schema-tool-handlers.ts:103-103`
- **classifyMigrations** — `db-schema-tool-handlers.ts:106-106`
- **{ classifyMigrations }** — `db-schema-tool-handlers.ts:106-106`
- **buildMigrationSchema** — `db-schema-tool-handlers.ts:107-107`
- **{ buildMigrationSchema }** — `db-schema-tool-handlers.ts:107-107`
- **detectSchemaDrift** — `db-schema-tool-handlers.ts:108-108`
- **{ detectSchemaDrift }** — `db-schema-tool-handlers.ts:108-108`
- **detectOrmSchemas** — `db-schema-tool-handlers.ts:109-109`
- **{ detectOrmSchemas }** — `db-schema-tool-handlers.ts:109-109`
- **ormLinks** — `db-schema-tool-handlers.ts:111-111`
- **migInfos** — `db-schema-tool-handlers.ts:112-112`
- **migSchema** — `db-schema-tool-handlers.ts:113-113`
- **drift** — `db-schema-tool-handlers.ts:114-114`
- **result** — `db-schema-tool-handlers.ts:131-155`
- **meta** — `db-schema-tool-handlers.ts:168-168`
- **storage** — `diagram-tool-handler.ts:24-24`
- **traceEngine** — `diagram-tool-handler.ts:25-25`
- **collector** — `diagram-tool-handler.ts:26-26`
- **ir** — `diagram-tool-handler.ts:28-42`
- **renderer** — `diagram-tool-handler.ts:44-44`
- **diagram** — `diagram-tool-handler.ts:45-45`
- **sharedEngine** — `pattern-tool-handlers.ts:23-23`
- **resolvedPath** — `pattern-tool-handlers.ts:42-42`
- **storage** — `pattern-tool-handlers.ts:45-45`
- **embeddingGen** — `pattern-tool-handlers.ts:48-48`
- **semanticAgent** — `pattern-tool-handlers.ts:50-50`
- **engine** — `pattern-tool-handlers.ts:56-56`
- **options** — `pattern-tool-handlers.ts:58-70`
- **result** — `pattern-tool-handlers.ts:72-72`
- **nextSteps** — `pattern-tool-handlers.ts:80-80`
- **allMatches** — `pattern-tool-handlers.ts:81-86`
- **hasSecurityPatterns** — `pattern-tool-handlers.ts:87-89`
- **recentChangeSummary** — `pattern-tool-handlers.ts:96-96`
- **entityInfos** — `pattern-tool-handlers.ts:98-105`
- **changedSet** — `pattern-tool-handlers.ts:110-110`
- **output** — `pattern-tool-handlers.ts:119-119`
- **json** — `pattern-tool-handlers.ts:121-121`
- **error** — `pattern-tool-handlers.ts:140-140`
- **storage** — `pattern-tool-handlers.ts:158-158`
- **embeddingGen** — `pattern-tool-handlers.ts:160-160`
- **semanticAgent** — `pattern-tool-handlers.ts:162-162`
- **engine** — `pattern-tool-handlers.ts:168-168`
- **matches** — `pattern-tool-handlers.ts:170-170`
- **output** — `pattern-tool-handlers.ts:178-196`
- **error** — `pattern-tool-handlers.ts:202-202`
- **storage** — `stacktrace-tool-handler.ts:31-31`
- **parsed** — `stacktrace-tool-handler.ts:34-34`
- **traceEngine** — `stacktrace-tool-handler.ts:52-52`
- **diagnosis** — `stacktrace-tool-handler.ts:62-67`
- **recentChangeSummary** — `stacktrace-tool-handler.ts:70-70`
- **crashPointHistory** — `stacktrace-tool-handler.ts:71-71`
- **entityInfos** — `stacktrace-tool-handler.ts:73-73`
- **adapter** — `stacktrace-tool-handler.ts:86-86`
- **commitManager** — `stacktrace-tool-handler.ts:88-88`
- **nodeStore** — `stacktrace-tool-handler.ts:89-89`
- **TimeTravelManager** — `stacktrace-tool-handler.ts:91-91`
- **{ TimeTravelManager }** — `stacktrace-tool-handler.ts:91-91`
- **timeTravel** — `stacktrace-tool-handler.ts:92-92`
- **history** — `stacktrace-tool-handler.ts:93-93`
- **output** — `stacktrace-tool-handler.ts:126-126`
- **text** — `stacktrace-tool-handler.ts:189-189`
- **projectPath** — `worktree-tool-handlers.ts:43-43`
- **wtPath** — `worktree-tool-handlers.ts:45-47`
- **agentId** — `worktree-tool-handlers.ts:49-49`
- **baseBranch** — `worktree-tool-handlers.ts:53-53`
- **cmd** — `worktree-tool-handlers.ts:54-54`
- **wtInfo** — `worktree-tool-handlers.ts:67-67`
- **result** — `worktree-tool-handlers.ts:72-85`
- **msg** — `worktree-tool-handlers.ts:91-91`
- **wtInfo** — `worktree-tool-handlers.ts:104-104`
- **projectPath** — `worktree-tool-handlers.ts:158-158`
- **repoId** — `worktree-tool-handlers.ts:159-159`
- **allWorktrees** — `worktree-tool-handlers.ts:168-168`
- **activeSessions** — `worktree-tool-handlers.ts:171-171`
- **activePathSet** — `worktree-tool-handlers.ts:172-172`
- **worktreeList** — `worktree-tool-handlers.ts:174-186`
- **session** — `worktree-tool-handlers.ts:177-177`
- **displayList** — `worktree-tool-handlers.ts:189-199`
- **result** — `worktree-tool-handlers.ts:201-206`
- **projectPath** — `worktree-tool-handlers.ts:226-226`
- **worktrees** — `worktree-tool-handlers.ts:230-230`
- **target** — `worktree-tool-handlers.ts:231-231`
- **forceFlag** — `worktree-tool-handlers.ts:262-262`
- **projectPath** — `worktree-tool-handlers.ts:317-317`
- **wtInfo** — `worktree-tool-handlers.ts:319-319`
- **siblings** — `worktree-tool-handlers.ts:336-336`
- **submodules** — `worktree-tool-handlers.ts:337-337`
- **subtrees** — `worktree-tool-handlers.ts:338-338`
- **activeSessions** — `worktree-tool-handlers.ts:341-341`
- **activePathSet** — `worktree-tool-handlers.ts:342-342`
- **result** — `worktree-tool-handlers.ts:344-371`
- **Args** — `diagram-tool-handler.ts:16-16`
- **Args** — `stacktrace-tool-handler.ts:23-23`
- **SpawnArgs** — `worktree-tool-handlers.ts:35-35`
- **ListArgs** — `worktree-tool-handlers.ts:150-150`
- **CleanupArgs** — `worktree-tool-handlers.ts:218-218`
- **GetInfoArgs** — `worktree-tool-handlers.ts:309-309`
