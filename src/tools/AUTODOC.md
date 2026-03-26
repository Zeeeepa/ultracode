# Tools Module

## Overview

Central MCP tool infrastructure providing the bridge between MCP protocol and internal subsystems (agents, semantic search, graph storage, code analysis, AutoDoc). The module contains `ToolRegistry` with lazy-loaded handler groups (~80% deferred imports), `BaseToolHandler` abstract base class with built-in response limiting and argument validation, and 60+ handler implementations organized into 12 lazy-loaded categories plus 6 eager-loaded utilities. Reduces cold start from ~2s to <500ms via deferred loading; enforces 50KB response limits via binary-search truncation and serializes heavy analysis tools through a concurrency queue to prevent memory spikes.

## Flow

```
MCP Request (tool_name, args)
  ↓
ToolRegistry.getHandler(toolName, context)
  ├─ Check eager-loaded cache (help, index, graph, entity, metrics)
  └─ If miss: LazyHandlerLoader → Promise<Constructor> → instantiate
  ↓
Handler.handle(args)
  ├─ parseArgs(args) → Zod schema validation
  ├─ execute(args) → business logic
  │   ├─ resolveProjectPath() → session/context/fallback
  │   ├─ ensureGraphStorage() → GraphStorage (SQLite native)
  │   ├─ getSemanticAgent() → SemanticAgent / VectorStore
  │   └─ execute core logic (search, analysis, modification, etc.)
  ├─ applyResponseLimits() → truncateResponse() if >50KB
  └─ return ToolResult { content: [{ type: "text", text }] }
  ↓
Transport-level check: enforceResponseLimit (Buffer.byteLength)
  └─ Serialize to MCP response
```

## Entities

### Public API

| Entity | Type | Location | Purpose |
|--------|------|----------|---------|
| `BaseToolHandler<TArgs>` | abstract class | `base-tool-handler.ts:63-311` | Base class for all handlers; implements parseArgs, execute, and response limiting lifecycle with automatic argument validation and response truncation. |
| `ToolResult` | interface | `base-tool-handler.ts:26-31` | MCP response envelope containing typed content array with text payloads. |
| `ToolContext` | interface | `base-tool-handler.ts:33-61` | Per-request context injected into all handlers; provides session access, conductor instance, graph storage factory, and semantic agent factory. |
| `ToolRegistry` | class | `tool-registry.ts:43-229` | Central handler registry managing handler registration, lazy loading via deferred imports, and per-request instantiation. |
| `ImpactAnalyzer` | class | `impact-analyzer.ts:69-445` | Code change impact analysis engine computing direct callers, state mutations, and breaking changes for refactoring decisions. |
| `ImpactAnalysisResult` | interface | `impact-analyzer.ts:21-54` | Impact analysis output containing direct callers, state impact mutations, breaking changes, and affected file list. |
| `AgentMetricsSnapshot` | interface | `agent-metrics.ts:68-83` | Aggregated performance metrics snapshot from Conductor, agents, KnowledgeBus, and ResourceManager. |
| `collectAgentMetrics()` | async function | `agent-metrics.ts:105-158` | Collects and aggregates real-time performance metrics from system components into a single snapshot. |
| `MAX_RESPONSE_SIZE_BYTES` | const | `response-limits.ts:11-11` | Soft limit constant (50,000 bytes) triggering automatic response truncation. |
| `paginate<T>()` | function | `response-limits.ts:49-67` | Slices array with offset/limit and returns pagination metadata (total, offset, limit, truncated). |
| `truncateResponse()` | function | `response-limits.ts:83-106` | Binary-search JSON truncation preserving essential fields (id, name, type) within byte limits. |
| `projectPathParam` | Zod schema | `base-schemas.ts:13-18` | Optional project path parameter auto-resolved via session or fallback. |
| `PaginationParams` | Zod schema | `base-schemas.ts:39-42` | Standard offset/limit pagination schema for list-type tools. |
| `branchParam` | Zod schema | `base-schemas.ts:47-47` | Optional branch name parameter for branch-aware tool operations. |

### Handlers — Eager-Loaded (6 files)

| Entity | Type | Location | Purpose |
|--------|------|----------|---------|
| `get_entity`, `find_entity` handlers | handlers | `handlers/entity-tool-handlers.ts:1-313` | Entity lookup and search operations in graph storage; eagerly loaded for quick entity queries. |
| `reset_graph`, `clean_index`, `get_graph`, `stats`, `health` handlers | handlers | `handlers/graph-tool-handlers.ts:1-264` | Graph storage management, diagnostics, and health checks; eagerly loaded for storage operations. |
| `index` handler | handler | `handlers/index-tool-handler.ts:1-418` | Incremental or full codebase reindexing with progress reporting; eagerly loaded for indexing coordination. |
| `get_metrics`, `get_version`, `agent_metrics`, `bus`, `watcher` handlers | handlers | `handlers/metrics-tool-handlers.ts:1-485` | System health, conductor metrics, and resource monitoring; eagerly loaded for diagnostics. |
| `get_help` handler | handler | `handlers/help-tool-handler.ts:1-104` | Loads and returns formatted help text from prompts directory by topic; eagerly loaded for quick help access. |
| `get_tools_for_task` handler | handler | `handlers/get-tools-for-task-handler.ts:1-184` | Recommends relevant tools based on task description via semantic matching; eagerly loaded for tool recommendations. |

### Handlers — Lazy-Loaded Groups (12 groups)

| Entity | Type | Location | Purpose |
|--------|------|----------|---------|
| `semantic_search`, `pattern_search`, `symbol_search`, `find_references`, `find_implementations`, `detect_complexity` handlers | handlers | `handlers/semantic-tool-handlers.ts:1-1206` | Semantic code search, pattern matching, and complexity analysis; lazy-loaded to reduce startup latency. |
| `analyze_hotspots`, `analyze_refactoring`, `detect_technology_stack`, `detect_code_clones`, `code_quality_metrics`, `codebase_insights` handlers | handlers | `handlers/analysis-tool-handlers.ts:1-825` | Code analysis, metrics, and technology detection; lazy-loaded to defer heavy AST analysis. |
| `modify_code`, `copy_file`, `rename_symbol`, `split_large_file`, `merge_files`, `move_file`, `delete_file`, `preview_changes` handlers | handlers | `handlers/file-tool-handlers.ts:1-811` | File system and code modification operations with preview support; lazy-loaded to avoid filesystem overhead at startup. |
| Helper functions for file tools | utility | `handlers/file-tool-utils.ts:1-119` | Setup utilities for semantic agents and directory operations; lazy-loaded with file handlers. |
| `list_branches`, `switch_branch`, `create_branch`, `delete_branch`, `branch_status` handlers | handlers | `handlers/branch-tool-handlers.ts:1-377` | Git branch management operations; lazy-loaded to defer git operations. |
| `validate_file`, `validate_directory` handlers | handlers | `handlers/validation-tool-handlers.ts:1-542` | Code quality validation using Biome and oxlint linters; lazy-loaded to avoid linter initialization overhead. |
| `show_merge_conflicts`, `resolve_merge_conflict`, `merge_status`, `list_unmerged_files` handlers | handlers | `handlers/merge-tool-handlers.ts:1-330` | Merge conflict detection and resolution; lazy-loaded to defer merge engine initialization. |
| `trace_flow`, `trace_backwards`, `trace_data_flow`, `trace_callers`, `trace_state_mutations` handlers | handlers | `handlers/tracing-tool-handlers.ts:1-739` | Code flow and dependency tracing with state impact analysis; lazy-loaded to defer graph traversal setup. |
| `taint_analysis` handler | handler | `handlers/taint-tool-handlers.ts:1-72` | Security vulnerability detection via taint flow analysis with pagination; lazy-loaded to defer taint engine. |
| Graph-based metrics handlers | handlers | `handlers/graph-metrics-tool-handlers.ts:1-200` | PageRank, Louvain clustering, betweenness centrality, bus factor, and modularity metrics; lazy-loaded to defer heavy graph algorithms. |
| AutoDoc-related handlers (11 tools) | handlers | `handlers/autodoc-tool-handlers.ts:1-1105` | AutoDoc generation, validation, hooks, and repair operations; lazy-loaded to defer AutoDoc engine. |
| Git-related handlers | handlers | `handlers/git-tool-handlers.ts` | Git history, blame, stash, and commit operations; lazy-loaded to defer git operations. |

### Type Definitions

| Entity | Type | Location | Purpose |
|--------|------|----------|---------|
| `ToolHandler` | interface | `types/tool-handler.ts` | Interface defining tool handler contract: handle method accepting args and returning ToolResult promise. |
| `ResponseMeta` | interface | `response-limits.ts` | Metadata added to truncated responses indicating truncation state and field priority. |

### Utilities & Schemas

| Entity | Type | Location | Purpose |
|--------|------|----------|---------|
| Handler registration system | module | `tool-registry.ts` | Registers handler constructors and manages lazy initialization via dynamic imports. |
| Response limiting pipeline | module | `response-limits.ts` | Enforces 50KB soft limits via binary-search JSON truncation and pagination helpers. |
| Base schemas | module | `base-schemas.ts` | Zod schemas for common parameters (projectPath, pagination, branch) shared across handlers. |
| Impact analysis engine | module | `impact-analyzer.ts` | Analyzes code dependencies and change impact; computes caller chains and state mutations. |
| Agent metrics collection | module | `agent-metrics.ts` | Aggregates performance metrics from Conductor, agents, message bus, and resource manager. |

## Dependencies

### Internal

- `src/session` — Per-client session isolation and context management
- `src/core/branch-manager` — Branch list, switch, and status operations
- `src/core/knowledge-bus` — Topic pub/sub messaging and bus statistics
- `src/core/resource-manager` — Resource constraints, throttling, and memory management
- `src/agents/conductor-orchestrator` — Agent orchestration and task coordination
- `src/storage/graph-storage-libsql` — Entity and relationship graph persistence (native SQLite)
- `src/semantic/vector-store` — Embedding indexing and semantic search backend
- `src/semantic/semantic-agent` — Semantic code analysis and search
- `src/autodoc/` — AutoDoc storage, generation, validation, hooks, and repair
- `src/modification/code-modifier` — Code modification engine (replace, insert, delete operations)
- `src/validation/linters/` — Biome and oxlint integrations for code quality validation
- `src/analysis/` — Technology detection, hotspot analysis, and refactoring suggestions
- `src/merge/` — Merge conflict detection and resolution engine
- `vendor/jscpd/` — Copy-paste detection for code clone analysis

### External

- `zod` — Schema validation library for all tool argument parsing
- `p-limit` — Concurrency control for serializing heavy analysis tools

## Behavioral Properties

- **Lazy loading**: 12 handler groups defer imports until first invocation; reduces startup import size by ~80%.
- **Eager loading**: 6 core handlers (help, index, graph, entity, metrics) pre-loaded at initialization.
- **Per-request instantiation**: Handler instance created for each MCP tool invocation; destroyed after response generation.
- **Response limits**: Soft 50KB limit via binary-search truncation; preserves essential fields (id, name, type, count).
- **Session isolation**: ToolContext carries session; projectPath resolves: explicit argument > session.projectPath > fallback directory.
- **Concurrency control**: Heavy tools (taint_analysis, graph_metrics, analyze_hotspots) serialized via pLimit(1) queue to prevent memory spikes.
- **Transport safety**: enforceResponseLimit double-checks Buffer.byteLength after handler execution to catch serialization growth.
- **Pagination**: Standard offset/limit pattern with PaginationMeta (total, offset, limit, truncated flag).
- **Argument validation**: All handlers use Zod schemas for type-safe, documented parameter parsing.