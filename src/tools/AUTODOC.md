---
module_name: tools
description: MCP tool infrastructure — registry, base handler, schemas, and 60+ tool handlers for code analysis, semantic search, tracing, file modification, AutoDoc, and project graph operations.
status: active
language: TypeScript
entry_point: tool-registry.ts
exports:
  - ToolRegistry
  - BaseToolHandler
  - ToolContext
  - ToolResult
  - ImpactAnalyzer
  - collectAgentMetrics
  - MAX_RESPONSE_SIZE_BYTES
  - paginate
  - truncateResponse
dependencies:
  - src/agents
  - src/core
  - src/storage
  - src/semantic
  - src/autodoc
  - src/modification
  - src/validation
  - src/analysis
  - src/logging
  - src/types
  - zod
tags:
  - mcp
  - tools
  - handlers
  - schemas
  - lazy-loading
  - validation
---

# Tools Module

## Overview

Central MCP tool infrastructure providing the facade between MCP protocol and internal subsystems (agents, semantic search, graph storage, AutoDoc). The module contains `ToolRegistry` with lazy loading (~80% deferred), `BaseToolHandler` abstract class with built-in response limiting, 60+ handler classes grouped into 11 lazy-loaded categories, and 13 Zod-based schema modules. Cold start reduced from ~2s to <500ms via deferred imports.

## Data Flow

```
MCP Request → conductor.handleRequest()
  → toolRegistry.getHandler(toolName, context)  [lazy load if needed]
    → new Handler(context)
      → handle(args)
        ├─ parseArgs(args)       → Zod schema validation
        ├─ execute(args)         → business logic
        │   ├─ ensureGraphStorage()  → GraphStorage (libsql)
        │   ├─ getSemanticAgent()    → SemanticAgent / VectorStore
        │   └─ resolveProjectPath()  → session-aware resolution
        ├─ applyResponseLimits() → 50KB soft truncation
        └─ return ToolResult     → { content: [{ type: "text", text }] }
```

## Public API

| Export | Type | Location | Description |
|--------|------|----------|-------------|
| `BaseToolHandler<TArgs>` | abstract class | [`base-tool-handler.ts:63-311`](./base-tool-handler.ts) | Base for all handlers; parseArgs, execute, response limiting |
| `ToolResult` | interface | [`base-tool-handler.ts:26-31`](./base-tool-handler.ts) | MCP response: `{ content: [{ type: "text", text }] }` |
| `ToolContext` | interface | [`base-tool-handler.ts:33-61`](./base-tool-handler.ts) | Per-request context: session, getConductor, getGraphStorage, etc. |
| `ToolRegistry` | class | [`tool-registry.ts:43-229`](./tool-registry.ts) | Central registry; register, registerLazy, getHandler (async) |
| `ImpactAnalyzer` | class | [`impact-analyzer.ts:69-445`](./impact-analyzer.ts) | Code change impact: callers, state mutations, breaking changes |
| `ImpactAnalysisResult` | interface | [`impact-analyzer.ts:21-54`](./impact-analyzer.ts) | Impact output: directCallers, stateImpact, breakingChanges |
| `AgentMetricsSnapshot` | interface | [`agent-metrics.ts:68-83`](./agent-metrics.ts) | Conductor/agent metrics: queues, memory, CPU |
| `collectAgentMetrics()` | async function | [`agent-metrics.ts:105-158`](./agent-metrics.ts) | Collects agent performance metrics from Conductor |
| `MAX_RESPONSE_SIZE_BYTES` | const (50KB) | [`response-limits.ts:11-11`](./response-limits.ts) | Response truncation threshold |
| `paginate<T>()` | function | [`response-limits.ts:49-67`](./response-limits.ts) | Array pagination with `PaginationMeta` |
| `truncateResponse()` | function | [`response-limits.ts:83-106`](./response-limits.ts) | JSON truncation with binary-search sizing |
| `projectPathParam` | Zod schema | [`base-schemas.ts:13-18`](./base-schemas.ts) | Optional project path, auto-resolved via session |
| `PaginationParams` | Zod schema | [`base-schemas.ts:39-42`](./base-schemas.ts) | `{ offset, limit }` for list tools |
| `branchParam` | Zod schema | [`base-schemas.ts:47-47`](./base-schemas.ts) | Optional branch for branch-aware operations |

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `src/agents/conductor-orchestrator` | ToolContext.getConductor(), agent orchestration |
| `src/agents/semantic-agent` | Semantic search, vector store access |
| `src/core/client-session` | Per-client session isolation (v5) |
| `src/core/branch-manager` | Branch list, switch, status operations |
| `src/core/knowledge-bus` | Topic pub/sub, bus stats, clear topic |
| `src/core/resource-manager` | Resource constraints, throttling metrics |
| `src/storage/graph-storage-libsql` | Entity/relationship graph persistence |
| `src/semantic/vector-store` | Embedding search for semantic tools |
| `src/autodoc/` | AutoDoc storage, generation, hooks |
| `src/modification/code-modifier` | File modification engine |
| `src/validation/linters/` | Biome, oxlint for file/directory validation |
| `src/analysis/technology-detector` | Tech stack detection |
| `vendor/jscpd/` | Copy-paste detection engine |
| `zod` | Schema validation for all tool arguments |

## Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `MAX_RESPONSE_SIZE_BYTES` | 50,000 | Soft limit; auto-truncates JSON responses |
| `DEFAULT_PAGE_SIZE` | 50 | Default pagination limit |
| `MAX_PAGE_SIZE` | 200 | Maximum pagination limit |
| `SAFE_LIMITS.entities` | 100 | Max entities per response |
| `SAFE_LIMITS.clones` | 30 | Max clone results per response |
| `SAFE_LIMITS.hotspots` | 20 | Max hotspot results per response |
| `SAFE_LIMITS.taintVulnerabilities` | 20 | Max taint vulnerabilities per page |
| Eager-loaded tools | 17 | Help, Index, Graph, Entity, Metrics handlers |
| Lazy-loaded groups | 12 | Semantic, Analysis, Branch, File, Validation, Merge, Trace, AutoDoc, History, Snapshot, Diagram |

## Behavioral Properties

- All `execute()` methods are async; handlers instantiated per-request.
- Lazy loading via `LazyHandlerLoader = () => Promise<ToolHandlerConstructor>` adds latency only on first use of each group.
- Project path resolves in priority: explicit arg > `session.projectPath` > `context.projectPath` > legacy singleton.
- Response truncation uses binary-search to find safe array slice count; prioritizes fields `id, name, type, count, error`.
- `_responseMeta` added when truncated, hinting pagination params.
- **Heavy analysis tools** (taint_analysis, graph_metrics, analyze_hotspots, etc.) are serialized via `pLimit(1)` queue in `index.ts` to prevent concurrent memory spikes.
- **Transport-level safety net** (`enforceResponseLimit` in `index.ts`): checks `Buffer.byteLength` of response after handler execution; if over `MAX_RESPONSE_SIZE_BYTES` (50KB), truncates and injects `_responseMeta` with pagination hint.
- **Handler-level pagination**: tools like `taint_analysis` and `analyze_hotspots` accept `offset`/`limit` and use `paginate()` from `response-limits.ts` to return only a page of results with `PaginationMeta`.
- Branch operations use `execSync` for git commands (blocking).
- JSCPD limits: MAX_FILES=500, MAX_FILE_SIZE=500KB.

## Error Handling

| Scenario | Behavior | Log Level |
|----------|----------|-----------|
| Invalid args | Zod validation throw caught by `handle()` | ERROR |
| Entity not found | Returns `{ error: "Entity not found" }` | DEBUG |
| GraphStorage unavailable | Throws, logged, returns error JSON | ERROR |
| SemanticAgent init failed | Graceful degradation, continues without semantic | WARN |
| Response > 50KB | Auto-truncate, attach `_responseMeta` | INFO |
| Handler lazy load fails | Throws "Unknown tool" from `getHandler` | ERROR |
| File read failure (JSCPD) | Returns empty clone results | WARN |
| Project not indexed | Checks `isProjectIndexed()`, returns status | DEBUG |

## Observability

- **Entry/exit logging**: `log.i("BASETOOL", "mcp_response", { tool, durationMs, respBytes, args, reqId })`.
- **Error logging**: `log.e("BASETOOL", "exec_failed", { tool, err, args })`.
- **Agent metrics**: queue lengths, memory/CPU per agent, conductor task counts.
- **Knowledge bus**: topic count, entry count, subscription count, message queue size.
- **Watcher status**: FileWatcher, GitWatcher, indexing stats exposed via `get_watcher_status`.
- **Request ID correlation**: every handler call carries `context.requestId`.

## Known Limitations

1. No tool authentication/authorization -- all tools available to all clients.
2. Global singleton `ProjectContextManager` used as fallback in legacy mode.
3. Response truncation is lossy; may cut important data beyond 50KB.
4. No request timeout enforcement; `withTimeout` available but not always applied.
5. Heavy analysis tools serialized via `pLimit(1)` queue; non-heavy tools still have no concurrency limit.
6. Branch switching uses synchronous `execSync`, can block the event loop.
7. `ImpactAnalyzer` confidence is heuristic-based, not statically proven.

## TypeScript Notes

- Handlers are generic on args type: `class H extends BaseToolHandler<z.infer<typeof Schema>>`.
- `ToolHandlerConstructor = new (context: ToolContext) => BaseToolHandler` for registry.
- `LazyHandlerLoader = () => Promise<ToolHandlerConstructor>` for deferred imports.
- `ToolResult` is strictly typed (only `text` content type).
- All schemas use Zod with `.describe()` for MCP tool descriptions.
- `withProjectPath(schema)` extends any Zod object with optional `projectPath`.

## Files

| File | Lines | Role | Description |
|------|-------|------|-------------|
| [`base-tool-handler.ts`](./base-tool-handler.ts) | 311 | Core | Abstract handler, response limiting, project context helpers |
| [`tool-registry.ts`](./tool-registry.ts) | 232 | Core | Registry with lazy loading, 11 handler groups |
| [`response-limits.ts`](./response-limits.ts) | 245 | Util | Pagination, truncation, size management |
| [`impact-analyzer.ts`](./impact-analyzer.ts) | 480 | Util | Code change impact analysis engine |
| [`agent-metrics.ts`](./agent-metrics.ts) | 158 | Util | Conductor/agent metrics collection |
| [`tool-definitions.ts`](./tool-definitions.ts) | 522 | Config | MCP tool definitions for ListTools |
| [`trace-schemas.ts`](./trace-schemas.ts) | 158 | Config | Trace tool MCP definitions |
| [`base-schemas.ts`](./base-schemas.ts) | 47 | Config | Common params: projectPath, pagination, branch |
| [`branch-tools.ts`](./branch-tools.ts) | 199 | Util | Branch management helpers |
| [`branch-schemas.ts`](./branch-schemas.ts) | 117 | Config | Branch tool schemas |
| [`jscpd.ts`](./jscpd.ts) | 456 | Util | Copy-paste detection (JSCPD wrapper) |
| [`graph-query.ts`](./graph-query.ts) | 59 | Util | GraphStorage query helpers |
| [`handlers/entity-tool-handlers.ts`](./handlers/entity-tool-handlers.ts) | 270 | Handler | get_members, list_entity_relationships, query |
| [`handlers/graph-tool-handlers.ts`](./handlers/graph-tool-handlers.ts) | 264 | Handler | reset_graph, clean_index, get_graph, stats, health |
| [`handlers/index-tool-handler.ts`](./handlers/index-tool-handler.ts) | 418 | Handler | index (incremental/full) |
| [`handlers/metrics-tool-handlers.ts`](./handlers/metrics-tool-handlers.ts) | 485 | Handler | get_metrics, get_version, agent_metrics, bus, watcher |
| [`handlers/help-tool-handler.ts`](./handlers/help-tool-handler.ts) | 104 | Handler | get_help (loads .md from prompts/) |
| [`handlers/get-tools-for-task-handler.ts`](./handlers/get-tools-for-task-handler.ts) | 184 | Handler | get_tools_for_task |
| [`handlers/semantic-tool-handlers.ts`](./handlers/semantic-tool-handlers.ts) | 1206 | Handler | 6 semantic search handlers (lazy) |
| [`handlers/analysis-tool-handlers.ts`](./handlers/analysis-tool-handlers.ts) | 825 | Handler | 6 analysis handlers: hotspots, refactoring, tech stack (lazy) |
| [`handlers/file-tool-handlers.ts`](./handlers/file-tool-handlers.ts) | 811 | Handler | 8 file mod handlers: modify, copy, rename, split (lazy) |
| [`handlers/file-tool-utils.ts`](./handlers/file-tool-utils.ts) | 119 | Util | Semantic search setup, directory helpers |
| [`handlers/branch-tool-handlers.ts`](./handlers/branch-tool-handlers.ts) | 377 | Handler | 5 branch handlers (lazy) |
| [`handlers/validation-tool-handlers.ts`](./handlers/validation-tool-handlers.ts) | 542 | Handler | 2 validation handlers: file, directory (lazy) |
| [`handlers/merge-tool-handlers.ts`](./handlers/merge-tool-handlers.ts) | 330 | Handler | 4 merge handlers (lazy) |
| [`handlers/tracing-tool-handlers.ts`](./handlers/tracing-tool-handlers.ts) | 739 | Handler | 5 trace handlers: flow, backwards, data_flow (lazy) |
| [`handlers/taint-tool-handlers.ts`](./handlers/taint-tool-handlers.ts) | 72 | Handler | Taint analysis with pagination (lazy) |
| [`handlers/graph-metrics-tool-handlers.ts`](./handlers/graph-metrics-tool-handlers.ts) | ~200 | Handler | Graph metrics: pagerank, louvain, centrality, bus_factor (lazy) |
| [`handlers/autodoc-tool-handlers.ts`](./handlers/autodoc-tool-handlers.ts) | 1105 | Handler | 11 AutoDoc handlers (lazy) |
| [`handlers/history-tool-handlers.ts`](./handlers/history-tool-handlers.ts) | 275 | Handler | 4 time travel handlers (lazy) |
| [`handlers/snapshot-tool-handlers.ts`](./handlers/snapshot-tool-handlers.ts) | 258 | Handler | 4 snapshot handlers (lazy) |
| [`handlers/diagram-tool-handler.ts`](./handlers/diagram-tool-handler.ts) | 67 | Handler | Architecture diagram generation (lazy) |
| [`handlers/index.ts`](./handlers/index.ts) | 131 | Config | Re-exports for backward compatibility |
| [`schemas/analysis-schemas.ts`](./schemas/analysis-schemas.ts) | 74 | Schema | Analysis tool arg schemas |
| [`schemas/semantic-schemas.ts`](./schemas/semantic-schemas.ts) | 66 | Schema | Semantic tool arg schemas |
| [`schemas/autodoc-schemas.ts`](./schemas/autodoc-schemas.ts) | 110 | Schema | AutoDoc tool arg schemas |
| [`schemas/modification-schemas.ts`](./schemas/modification-schemas.ts) | 72 | Schema | File modification arg schemas |
| [`schemas/validation-schemas.ts`](./schemas/validation-schemas.ts) | 37 | Schema | Validation tool arg schemas |
| [`schemas/entity-schemas.ts`](./schemas/entity-schemas.ts) | 34 | Schema | Entity tool arg schemas |
| [`schemas/index-schemas.ts`](./schemas/index-schemas.ts) | 68 | Schema | Index tool arg schemas |
| [`schemas/history-schemas.ts`](./schemas/history-schemas.ts) | 51 | Schema | History tool arg schemas |
| [`schemas/merge-schemas.ts`](./schemas/merge-schemas.ts) | 34 | Schema | Merge tool arg schemas |
| [`schemas/snapshot-schemas.ts`](./schemas/snapshot-schemas.ts) | 23 | Schema | Snapshot tool arg schemas |
| [`schemas/graph-schemas.ts`](./schemas/graph-schemas.ts) | 33 | Schema | Graph tool arg schemas |
| [`schemas/taint-schemas.ts`](./schemas/taint-schemas.ts) | ~30 | Schema | Taint analysis arg schema (with offset/limit) |
| [`schemas/graph-metrics-schemas.ts`](./schemas/graph-metrics-schemas.ts) | ~40 | Schema | Graph metrics arg schema |
| [`schemas/diagram-schemas.ts`](./schemas/diagram-schemas.ts) | ~30 | Schema | Architecture diagram arg schema (entryPoint, depth, dataFlowLevel, format, direction, diagramType) |
| [`schemas/index.ts`](./schemas/index.ts) | 88 | Config | Central schema exports |
