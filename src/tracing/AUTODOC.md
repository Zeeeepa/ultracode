# Tracing Module

## Overview

The Tracing module provides static code flow analysis without runtime execution, enabling five core analysis patterns: **trace_flow** (forward execution paths from A to B), **trace_backwards** (reverse analysis to find why a method isn't called), **trace_data_flow** (track data transformations through execution), **analyze_state_impact** (ripple effects of state changes), and **find_decision_points** (branching and guard detection). The `TraceEngine` is the primary coordinator, delegating traversal to `GraphologyPathBuilder` (optimized in-memory graph using graphology) or `PathBuilder` (fallback BFS/DFS), while specialized analyzers handle state (`StateTracker`), conditions (`ConditionAnalyzer`), and data sources (`DataFlowAnalyzer`). NgRx patterns are handled by dedicated `NgRxTraceEngine`. All analysis operates on the entity/relationship graph from `GraphStorage` and produces formatted results via `OutputFormatter`.

## Flow

```
GraphStorage (entities, relationships)
         ↓
   TraceEngine (request coordinator)
    /    |    \    |    \
   /     |     \   |     \
  ↓      ↓      ↓  ↓      ↓
GraphologyPathBuilder  StateTracker  ConditionAnalyzer  DataFlowAnalyzer  PathBuilder
(optimized traversal)  (state change) (decision points)  (data sources)     (BFS/DFS)
         |                |                  |                |                |
         └────────────────┴──────────────────┴────────────────┘
                          ↓
                  OutputFormatter
                   (text/mermaid/json)
                          ↓
         TraceFlowResult / TraceBackwardsResult /
         TraceDataFlowResult / StateImpactResult /
         DecisionPointsResult
```

## Entity Listing

### Primary Classes (Engines & Analyzers)

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `TraceEngine` | class | Main coordination engine for all tracing operations; orchestrates `traceFlow()`, `traceBackwards()`, `traceDataFlow()`, `analyzeStateImpact()`, `findDecisionPoints()`; provides `getGraphStats()` and batch context retrieval. | `trace-engine.ts:48-48` |
| `GraphologyPathBuilder` | class | High-performance path traversal using in-memory graphology graph; loads full graph once, supports `loadGraph()`, `traceLinearFlow()`, `findPaths()`, `computePathMetrics()` with O(V+E) complexity for batch operations. | `graphology-path-builder.ts:118-894` |
| `PathBuilder` | class | BFS/DFS-based traversal with caching; methods include `findPathsForward()`, `findPathsBackward()`, `getCallers()`, `getCursorHierarchy()`; processes nodes in batches of 16 and caches adjacency graphs by scope. | `path-builder.ts:48-732` |
| `StateTracker` | class | Detects state changes and analyzes ripple effects; classifies state via setter/getter/boolean patterns; provides `detectStateChanges()`, `analyzeStateImpact()`, `traceStateFlow()`, `buildStateImpactMatrix()`. | `state-tracker.ts:38-511` |
| `ConditionAnalyzer` | class | Identifies branching logic, guards, and decision points; detects guard patterns (if-return), validation patterns (valid/check/verify), and caches decisions per scenario via `findDecisionPoints()`, `analyzeConditions()`. | `condition-analyzer.ts:35-35` |
| `DataFlowAnalyzer` | class | Traces data sources and transformations; classifies sources (API, storage, props, state, config, user_input) and transformations (parse, map, validate, normalize); provides `traceDataFlow()`, `buildBehaviorMatrix()`, `findDataSources()`. | `data-flow-analyzer.ts:58-495` |
| `OutputFormatter` | class | Renders analysis results in multiple formats; implements `formatTraceFlowAsText()`, `formatMermaidDiagram()`, `formatAsJSON()`, `formatDecisionPoints()` with indentation and styling. | `output-formatter.ts:24-24` |
| `NgRxTraceEngine` | class | NgRx-specific tracing for action→reducer→selector chains; provides `traceActionToEffects()`, `traceActionToReducer()`, `traceReducerToSelectors()`, `analyzeStoreImpact()`; understands dispatches, effects, and store subscriptions. | `ngrx-trace-engine.ts:98-449` |

### Interfaces & Parameter Types

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `NodeFlowContext` | interface | Per-entity execution context; contains `inputTypes`, `outputType`, `hasTransformation`, `conditionalHint`, `callers[]`, `callees[]`; used by `TraceEngine.getNodeFlowContext()`. | `trace-engine.ts:53-62` |
| `TraceFlowParams` | interface | Input parameters for `traceFlow()`; specifies `from`, `to` entity names/ids, optional `trackStates`, `maxDepth`, `format`, `useOptimized` flag. | `types.ts:76-89` |
| `TraceFlowResult` | interface | Output from `traceFlow()`; contains `paths[]` (execution sequences), `statesSummary`, `conditionsSummary`, optional `_debug`. | `types.ts:192-217` |
| `TraceBackwardsParams` | interface | Input for `traceBackwards()` reverse analysis; specifies `target` entity, `question` (diagnosis), optional `depth`, `includeStates`, `useOptimized`. | `types.ts:231-242` |
| `TraceBackwardsResult` | interface | Output from reverse analysis; lists `callers[]`, `blockingConditions[]`, diagnostic `blockingConditionsReason`, `diagnosis` explaining why method is unreachable. | `types.ts:321-339` |
| `TraceDataFlowParams` | interface | Input for `traceDataFlow()`; specifies `entryPoint`, `targetState`, optional `dataSources[]`, `maxDepth`, `scope`. | `types.ts:348-357` |
| `TraceDataFlowResult` | interface | Output from data flow analysis; contains `flows[]` (source→transform→state chains), `dataSummary`, `riskAssessment`, optional warnings. | `types.ts:358-380` |
| `AnalyzeStateImpactParams` | interface | Input for `analyzeStateImpact()`; specifies `state`, `scenarios[]`, optional `scope`, `maxDepth`, `trackActors`. | `types.ts:442-452` |
| `AnalyzeStateImpactResult` | interface | Output from state impact analysis; lists `impactAreas[]`, `cascades[]`, risk level, affected entities/selectors. | `types.ts:453-476` |
| `FindDecisionPointsParams` | interface | Input for `findDecisionPoints()`; specifies `scenario`, optional `includeGuards`, `groupBy` strategy (none/byType/byLevel), `minImpactLevel`. | `types.ts:523-532` |
| `FindDecisionPointsResult` | interface | Output from decision point detection; lists `decisionPoints[]`, `controlFlowMap`, `criticality` summary. | `types.ts:533-546` |

### Supporting Types & Enums

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `PathTrace` | interface | Single execution path with `nodes[]`, `edges[]`, `conditions[]`, `confidence`, `warningsCount`. | `types.ts:127-146` |
| `DecisionPoint` | interface | Identified branching decision; specifies `id`, `condition`, `impactLevel`, `type`, affected `entities[]`, resolved values. | `types.ts:477-499` |
| `StateChange` | interface | State modification record; contains `entity`, `property`, `previousValue`, `newValue`, `triggeredBy`, cascade info. | `types.ts:547-565` |
| `DataFlowEdge` | interface | Data source or transformation in sequence; specifies `from`, `to`, `type` (source/transform/sink), `confidence`, metadata. | `types.ts:381-405` |
| `ConditionsSummary` | interface | Summary of conditions encountered; lists `condition[]` entries with `type`, `frequency`, `impactLevel`. | `types.ts:218-230` |
| `ImpactLevel` | type | Severity classification: `critical` \| `high` \| `medium` \| `low`. | `types.ts:21` |
| `DecisionPointType` | type | Classification: `guard` \| `validation` \| `async_boundary` \| `state_check` \| `conditional_call`. | `types.ts:29` |

### Utilities & Helpers

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `clearAllGraphCaches()` | function | Clears all cached graphology graphs and analyzer caches; call after major codebase changes. | `graph-cache.ts` |
| `getCachedGraphBuilder()` | function | Retrieves existing cached `GraphologyPathBuilder` or `null` if cache miss. | `graph-cache.ts` |
| `invalidateAndPreload()` | function | Invalidates cache and preloads graph for subsequent operations; useful before batch analysis. | `graph-cache.ts` |
| `getTraceUsageCount()` | function | Returns number of trace operations executed in current session. | `graph-cache.ts` |
| `incrementTraceUsage()` | function | Increments trace operation counter (internal usage tracking). | `graph-cache.ts` |
| `NgRxResolution` | class | Resolves NgRx patterns (actions, effects, reducers, selectors); identifies relationships between store members. | `ngrx-resolution.ts:201` |
| `enrichPathWithMetadata()` | function | Adds confidence scores, summaries, and warnings to `PathTrace` output. | `path-enrichment.ts:189` |

## Dependencies

### External Libraries

| Dependency | Purpose |
|------------|---------|
| `graphology` | In-memory graph library for optimized O(V+E) path traversal and batch operations. |
| `graphology-shortest-path` | Bidirectional shortest-path algorithm for efficient forward/backward analysis. |

### Internal Dependencies

| Dependency | Purpose | Location |
|------------|---------|----------|
| `GraphStorage` | Core entity/relationship graph interface; provides node and edge access. | `src/types/storage.ts` |
| `Entity`, `Relationship`, `RelationType` | Storage types defining code entities and their relationships. | `src/types/storage.ts` |
| `logging` | Debug and info logging service for trace operations. | `src/logging/index.js` |
| `SemanticSearchService` | Optional service for entity resolution via semantic similarity when exact matches fail. | `src/semantic/...` |

## Configuration & Constants

### Optimization Settings

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `useOptimized` | `true` | Enable graphology-based fast path builder instead of BFS fallback. |
| `maxDepth` | 15 | Maximum traversal depth to prevent infinite cycles and bound complexity. |
| `maxPaths` | 5–10 | Maximum execution paths returned per analysis (engine: 5, builder: 10). |
| `CONDITION_WEIGHT` | 0.3 | Path score penalty for conditional branches; lowers confidence. |
| `CALL_WEIGHT` | 0.1 | Path score penalty for inter-function calls. |
| `ASYNC_WEIGHT` | 0.2 | Path score penalty for async boundaries (promises, async/await). |
| `minSimilarity` | 0.6 | Semantic search threshold for fuzzy entity resolution. |

### Pattern Recognition

| Pattern | Purpose |
|---------|---------|
| Guard patterns: `/^if\s*\([^)]+\)\s*(return\|throw)/` | Detects early-exit guards. |
| Validation patterns: `/valid\|check\|verify\|assert/i` | Identifies validation logic. |
| Setter patterns: `/^set[A-Z]/` | Recognizes state setters. |
| Getter patterns: `/^get[A-Z]/` | Recognizes state getters. |
| Boolean patterns: `/^(is\|has\|should\|can\|will)[A-Z]/` | Identifies boolean properties. |

## Key Behavioral Properties

- **Entity Resolution**: Supports file-qualified format (`src/file.ts:symbol`); falls back through exact name match → suffix match → partial match → semantic search; excludes external/import stubs; prioritizes real code definitions.
- **Graph Caching**: `PathBuilder` caches adjacency graphs keyed by `${nodeIds}:${maxDepth}`; processes nodes in batches of 16 for efficiency; `GraphologyPathBuilder` loads full graph once and reuses for subsequent calls.
- **State Classification**: `StateTracker` uses regex patterns to classify entities (setter, getter, boolean) and tracks property mutations with change history.
- **Condition Detection**: `ConditionAnalyzer` identifies guards (if-return), validation (valid/verify), and caches decision points per scenario to avoid reanalysis.
- **Data Source Classification**: `DataFlowAnalyzer` categorizes sources (API, storage, props, state, config, user_input) and transformations (parse, map, validate, normalize, merge) via regex matching.
- **Optimized vs. Fallback Mode**: Optimized mode (default) loads graphology graph once; fallback uses BFS/DFS with caching; both produce identical results, optimized is 5–10x faster for batch operations.

## Error Handling

- **Unresolvable Entities**: `TraceEngine` throws `Error("Could not find source/target entity: ${name}")` when source or target cannot be resolved through all fallback strategies.
- **Data Flow Resolution**: `DataFlowAnalyzer` throws errors when entry point or target state is unresolvable; includes available entity suggestions in error message.
- **Circular Dependencies**: Both `PathBuilder` and `GraphologyPathBuilder` detect cycles and mark edges as circular; traced paths halt at cycle detection to prevent infinite output.
- **Empty Results**: Analysis methods return empty arrays (not errors) when no paths/decisions/flows are found, allowing downstream consumers to handle no-result cases gracefully.