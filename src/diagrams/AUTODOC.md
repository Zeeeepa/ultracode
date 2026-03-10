# Diagrams

Architecture diagram generation from code graph. 3-layer pipeline: `Graph → SchemaCollector → DiagramIR → Renderer`. Supports Mermaid, Graphviz DOT, and D2 output formats with configurable depth (1-6) and data flow annotation levels (0-3).

## Overview

The module generates architecture diagrams by traversing the indexed code graph. Instead of reading source files, it uses the entity/relationship graph to build a format-agnostic intermediate representation (DiagramIR), which is then rendered into text by format-specific renderers.

**Key design decisions:**
- Own BFS with CONTAINS-only traversal (not `getSubgraph` which follows ALL relationship types)
- Relationship lifting: method-level CALLS are lifted to class-level edges at depth=2
- Batch enrichment via `TraceEngine.getBatchNodeContext()` — 2 SQL queries for the entire diagram
- LRU cache on DiagramIR (SHA256 key, TTL 5min, max 20 entries)
- Source entity filtering: excludes scripts/, tests/, generated/, docs/

## Data Flow

```
GraphStorage (entities + relationships)
    |
SchemaCollector (BFS traversal + enrichment)
    |--- Phase 1: Structural BFS via CONTAINS relationships
    |--- Phase 2: Inter-node edges (CALLS/IMPORTS/EXTENDS/IMPLEMENTS) with relationship lifting
    |--- Phase 3: Data flow enrichment via TraceEngine.getBatchNodeContext()
    |--- Phase 4: Field mapping via regex source analysis (L3 only)
    |
DiagramIR (format-agnostic intermediate representation)
    |
Renderer (format-specific)
    |--- MermaidRenderer  → flowchart / classDiagram
    |--- GraphvizRenderer → digraph DOT
    +--- D2Renderer       → D2 language
```

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `DiagramIR` | interface | Root IR structure: nodes, edges, groups, stats | [→ diagram-ir.ts:70-70](./diagram-ir.ts) |
| `DiagramNode` | interface | Node: id, label, type, inputTypes, outputType, fieldMappings | [→ diagram-ir.ts:31-43](./diagram-ir.ts) |
| `DiagramEdge` | interface | Edge: fromId, toId, type, style, dataAnnotation | [→ diagram-ir.ts:47-47](./diagram-ir.ts) |
| `DiagramGroup` | interface | Group: id, label, nodeIds, filePath | [→ diagram-ir.ts:60-66](./diagram-ir.ts) |
| `DataAnnotation` | interface | Flow annotation: inputTypes, outputType, transformation, conditionalHint, sourceFields | [→ diagram-ir.ts:20-27](./diagram-ir.ts) |
| `FieldMapping` | interface | Field-level mapping: sourceParam, sourceField, targetField, operation | [→ diagram-ir.ts:11-16](./diagram-ir.ts) |
| `DiagramType` | type | `"flowchart" \| "class" \| "component"` | [→ diagram-ir.ts:70](./diagram-ir.ts) |
| `DiagramDirection` | type | `"TD" \| "LR"` | [→ diagram-ir.ts:71](./diagram-ir.ts) |
| `DiagramFormat` | type | `"mermaid" \| "graphviz" \| "d2"` | [→ diagram-ir.ts:72](./diagram-ir.ts) |
| `EdgeStyle` | type | `"solid" \| "dashed" \| "dotted"` | [→ diagram-ir.ts:47](./diagram-ir.ts) |
| `SchemaCollector` | class | BFS graph traversal, data flow enrichment, LRU caching | [→ schema-collector.ts](./schema-collector.ts) |
| `analyzeFieldMappings` | function | Regex field mapping for dataFlowLevel=3 | [→ field-mapper.ts](./field-mapper.ts) |
| `DiagramRenderer` | interface | `{ render(ir: DiagramIR): string }` | [→ renderers/index.ts](./renderers/index.ts) |
| `createRenderer` | function | Factory: `(format) → MermaidRenderer \| GraphvizRenderer \| D2Renderer` | [→ renderers/index.ts](./renderers/index.ts) |
| `MermaidRenderer` | class | Mermaid: flowchart + classDiagram + component | [→ renderers/mermaid-renderer.ts](./renderers/mermaid-renderer.ts) |
| `GraphvizRenderer` | class | Graphviz DOT: digraph with clusters and record shapes | [→ renderers/graphviz-renderer.ts](./renderers/graphviz-renderer.ts) |
| `D2Renderer` | class | D2: native nesting, class shapes, style.fill | [→ renderers/d2-renderer.ts](./renderers/d2-renderer.ts) |

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `MAX_DIAGRAM_NODES` | 500 | Maximum nodes in diagram |
| `MAX_DIAGRAM_EDGES` | 1000 | Maximum edges in diagram |
| `MAX_NODES_PER_LEVEL` | 100 | Cap per BFS level (overflow grouped into "... and N more") |
| `RELATIONSHIP_CHUNK_SIZE` | 200 | SQL IN clause chunk size for relationship queries |
| `CACHE_TTL_MS` | 300000 (5min) | LRU cache time-to-live |
| `CACHE_MAX_SIZE` | 20 | Maximum cached DiagramIR entries |
| `MAX_FUNCTIONS_PER_CALL` | 50 | Max functions analyzed for field mapping (L3) |
| `MAX_FUNCTION_SIZE` | 10000 | Max function body size for regex analysis (L3) |

## Files

| File | Purpose |
|------|---------|
| [`diagram-ir.ts`](./diagram-ir.ts) | Type definitions: DiagramIR, DiagramNode, DiagramEdge, DataAnnotation, FieldMapping |
| [`schema-collector.ts`](./schema-collector.ts) | BFS graph traversal, data flow enrichment, LRU caching |
| [`field-mapper.ts`](./field-mapper.ts) | Regex field mapping for dataFlowLevel=3 (destructuring, spread, assign, transform) |
| [`renderers/index.ts`](./renderers/index.ts) | DiagramRenderer interface + createRenderer() factory |
| [`renderers/mermaid-renderer.ts`](./renderers/mermaid-renderer.ts) | Mermaid renderer: flowchart, classDiagram, hash→label mapping |
| [`renderers/graphviz-renderer.ts`](./renderers/graphviz-renderer.ts) | Graphviz DOT renderer: digraph, cluster subgraphs, record shapes |
| [`renderers/d2-renderer.ts`](./renderers/d2-renderer.ts) | D2 renderer: native nesting, class shapes, color coding |
