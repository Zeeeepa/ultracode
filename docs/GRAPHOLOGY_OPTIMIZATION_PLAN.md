# Plan: Graphology Integration for Tracing Optimization

## Problem Statement

Current tracing implementation (`trace_flow`, `trace_backwards`) is extremely slow:
- **10+ minutes** for traces that should take seconds
- Root cause: 25000+ SQL queries + O(2^n) path enumeration + `queue.sort()` on every iteration

## Solution

Replace custom graph traversal with **graphology** library:
- In-memory graph loaded once (2 SQL queries)
- Optimized BFS/Dijkstra algorithms O(V+E)
- Linear trace instead of exponential path enumeration

## Target Performance

| Metric | Current | Target |
|--------|---------|--------|
| SQL queries | 25000+ | 2 |
| Time (5000 nodes) | 10+ min | 1-3 sec |
| Memory | Inefficient | Optimized adjacency |

---

## Implementation Phases

### Phase 1: Install Dependencies
**Status:** PENDING

```bash
bun add graphology graphology-types graphology-shortest-path graphology-traversal
```

Packages:
- `graphology` - Core graph data structure (MultiGraph)
- `graphology-types` - TypeScript definitions
- `graphology-shortest-path` - Dijkstra, bidirectional BFS, A*
- `graphology-traversal` - BFS, DFS with callbacks

---

### Phase 2: Create GraphologyPathBuilder
**Status:** PENDING
**File:** `src/tracing/graphology-path-builder.ts`

Core class that:
1. Loads entire graph into memory with 2 SQL queries
2. Provides optimized path finding methods
3. Supports linear trace with branch annotations

Key methods:
- `loadGraph()` - Load all entities/relationships once
- `findShortestPath(from, to)` - Bidirectional BFS
- `traceLinearFlow(from, to)` - Linear trace with conditions
- `findAllPaths(from, to, maxPaths)` - Limited path enumeration
- `traceBackwards(target)` - Reverse BFS to entry points

---

### Phase 3: Add Storage Methods for Bulk Loading
**Status:** PENDING
**File:** `src/storage/graph-storage-libsql.ts`

Add methods:
- `getAllRelationships()` - Single query for all relationships
- Optimize `getAllEntities()` if needed

---

### Phase 4: Create Linear Trace Types
**Status:** PENDING
**File:** `src/tracing/types.ts`

New types for linear tracing:
```typescript
interface LinearTraceStep {
  order: number;
  entity: string;
  entityId: string;
  file: string;
  line: number;
  action: TraceActionType;
  branches?: BranchInfo[];
  sideEffects?: SideEffect[];
}

interface LinearTrace {
  steps: LinearTraceStep[];
  found: boolean;
  summary: string;
}
```

---

### Phase 5: Integrate with Existing Tools
**Status:** PENDING
**Files:**
- `src/tracing/trace-engine.ts`
- `src/tools/handlers/tracing-tool-handlers.ts`

Replace PathBuilder usage with GraphologyPathBuilder:
- `trace_flow` -> Use `traceLinearFlow()` or `findShortestPath()`
- `trace_backwards` -> Use reverse BFS
- Keep backward compatibility with existing API

---

### Phase 6: Optimize NgRx Tracing
**Status:** PENDING
**File:** `src/tracing/ngrx-trace-engine.ts`

Update NgRxTraceEngine to use graphology:
- Load NgRx relationships into graph with proper edge types
- Use edge attributes for action types, selectors
- Optimized action chain traversal

---

### Phase 7: Testing & Benchmarking
**Status:** PENDING

1. Create benchmark comparing old vs new implementation
2. Test on fabuza-front project (5000+ entities)
3. Verify correctness of trace results
4. Memory usage comparison

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | MODIFY | Add graphology dependencies |
| `src/tracing/graphology-path-builder.ts` | CREATE | New optimized path builder |
| `src/tracing/types.ts` | MODIFY | Add LinearTrace types |
| `src/storage/graph-storage-libsql.ts` | MODIFY | Add getAllRelationships() |
| `src/tracing/trace-engine.ts` | MODIFY | Use GraphologyPathBuilder |
| `src/tracing/ngrx-trace-engine.ts` | MODIFY | Use graphology for NgRx |
| `src/tools/handlers/tracing-tool-handlers.ts` | MODIFY | Update tool handlers |
| `src/tracing/path-builder.ts` | DEPRECATE | Keep for reference |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Tools                               │
│  trace_flow | trace_backwards | trace_ngrx_flow | trace_data   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      TraceEngine                                │
│  - Coordinates tracing operations                               │
│  - Formats results for MCP                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               GraphologyPathBuilder (NEW)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  graphology.MultiGraph (in-memory)                      │   │
│  │  - Nodes: entities with metadata                        │   │
│  │  - Edges: relationships with types (calls, ngrx, etc)   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  Methods:                    │                                  │
│  - loadGraph()              Uses:                               │
│  - findShortestPath()       - graphology-shortest-path          │
│  - traceLinearFlow()        - graphology-traversal              │
│  - traceBackwards()         - bidirectional BFS                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GraphStorage (libsql)                        │
│  - getAllEntities()     [1 query]                               │
│  - getAllRelationships() [1 query]                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rollback Plan

If issues arise:
1. GraphologyPathBuilder is a separate class - old PathBuilder remains
2. Feature flag in config to switch between implementations
3. Can revert by changing import in trace-engine.ts

---

## Success Criteria

- [ ] trace_flow completes in < 5 seconds for 5000 node graph
- [ ] trace_backwards completes in < 5 seconds
- [ ] Memory usage < 500MB for typical projects
- [ ] All existing tests pass
- [ ] NgRx tracing works correctly

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Install Dependencies | DONE | graphology, graphology-shortest-path, graphology-traversal |
| 2. GraphologyPathBuilder | DONE | src/tracing/graphology-path-builder.ts |
| 3. Storage Methods | DONE | Using findRelationships with high limit |
| 4. Linear Trace Types | DONE | Included in graphology-path-builder.ts |
| 5. Integrate TraceEngine | DONE | Added useOptimized flag, traceFlowOptimized() |
| 6. NgRx Optimization | PENDING | Can use same graphology graph |
| 7. Testing | PENDING | Need to test on real project |

## Implementation Notes

### Key Changes Made

1. **New file: `src/tracing/graphology-path-builder.ts`**
   - Uses graphology MultiGraph for in-memory graph
   - `loadGraph()` - loads all entities/relationships in 2 queries
   - `findShortestPath()` - bidirectional BFS O(V+E)
   - `traceLinearFlow()` - linear trace with branch annotations
   - `traceBackwards()` - reverse BFS to find entry points
   - `findPaths()` - limited DFS for multiple paths

2. **Updated: `src/tracing/trace-engine.ts`**
   - Added `GraphologyPathBuilder` alongside legacy `PathBuilder`
   - `useOptimized` flag (default: true) to switch implementations
   - `traceFlowOptimized()` - uses graphology for O(V+E) tracing
   - `traceBackwardsOptimized()` - uses graphology for reverse trace
   - `getGraphStats()` - returns node/edge counts and load time

3. **Dependencies added to `package.json`**
   - graphology@0.26.0
   - graphology-types@0.24.8
   - graphology-shortest-path@2.1.0
   - graphology-traversal@0.3.1
