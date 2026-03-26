# Diagrams

Architecture diagram generation from code graph. Three-layer pipeline: indexing via `SchemaCollector` (graph traversal + data flow enrichment), intermediate representation via `DiagramIR` (format-agnostic), and rendering via format-specific renderers (Mermaid, Graphviz, D2).

## Overview

This module generates architecture diagrams by analyzing the indexed code graph without reading source files. It uses a phased approach: graph traversal with `CONTAINS`-only relationships, relationship lifting (method-level calls elevated to class-level at depth 2), batch enrichment via `TraceEngine`, and optional field-level mapping via regex analysis. All diagrams are built into a universal intermediate representation, then rendered to target format. The design includes LRU caching (SHA256 keys, 5-minute TTL, 20-entry max) and source filtering (excludes scripts/, tests/, generated/, docs/).

## Data Flow

```
GraphStorage (indexed entities + relationships)
    ↓
SchemaCollector (phase-based traversal + enrichment)
    ├─ Phase 1: Structural BFS via CONTAINS relationships
    ├─ Phase 2: Inter-node edges (CALLS/IMPORTS/EXTENDS/IMPLEMENTS)
    │            + relationship lifting to class-level
    ├─ Phase 3: Data flow enrichment via TraceEngine.getBatchNodeContext()
    └─ Phase 4: Field-level mapping via regex (dataFlowLevel=3 only)
    ↓
DiagramIR (nodes, edges, groups, stats)
    ↓
Renderer (format-specific)
    ├─ MermaidRenderer  → flowchart / classDiagram
    ├─ GraphvizRenderer → digraph DOT with clusters
    └─ D2Renderer       → D2 native nesting
```

## Architecture & Design Patterns

**Pipeline Pattern**: Diagram generation is a linear three-stage pipeline (Schema Collector → DiagramIR → Renderer), decoupling graph analysis from rendering and enabling format-agnostic processing.

**Factory Pattern**: `createRenderer(format)` factory function instantiates the appropriate renderer (Mermaid, Graphviz, or D2) based on requested output format.

**Enrichment Strategy**: `SchemaCollector` performs phased enrichment—structural graph first, then relationships, then optional data-flow context and field mappings—allowing efficient queries and selective depth control.

**Relationship Lifting**: Method-level CALLS relationships are automatically promoted to class-level edges at diagram depth 2, abstracting away internal implementation details while preserving calling patterns.

**Caching Layer**: LRU cache on `DiagramIR` objects (keyed by SHA256 of request parameters) reduces redundant graph traversals and enrichment work for repeated requests.

## Core Concepts

**Depth Control** (1–6): Controls structural nesting levels in the diagram. Depth 1 shows a single entity; depth 6 shows full hierarchies.

**Data Flow Level** (0–3): Annotation granularity. Level 0: no annotations. Level 1: input/output types on edges. Level 2: type transformations. Level 3: field-level mappings (sourceParam → targetField).

**Relationship Lifting**: At diagram depth 2 and above, method-level `CALLS` relationships are promoted to class-level edges to reduce clutter and improve readability.

**Batch Enrichment**: When adding data-flow annotations, `SchemaCollector` collects all node IDs and fetches context via two SQL queries (`getBatchNodeContext`) instead of per-node queries, improving performance.

**Source Filtering**: Automatically excludes paths matching `scripts/`, `tests/`, `generated/`, `docs/` to focus diagrams on application code.

## Public API

| Entity | Kind | Purpose |
|--------|------|---------|
| `SchemaCollector` | class | BFS graph traversal with CONTAINS-only edges, inter-node relationship collection, data-flow enrichment via batch queries, optional field mapping, and LRU caching. |
| `DiagramRenderer` | interface | Renderer contract: `{ render(ir: DiagramIR): string }`. |
| `createRenderer` | function | Factory that returns a `MermaidRenderer`, `GraphvizRenderer`, or `D2Renderer` based on format string. |

## Types & Interfaces

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `DiagramIR` | interface | Root structure containing nodes, edges, groups, metadata, and diagram stats. | [diagram-ir.ts:70-70](./diagram-ir.ts) |
| `DiagramNode` | interface | Node with id, label, type, input/output types, and optional field mappings for data-flow visualization. | [diagram-ir.ts:31-43](./diagram-ir.ts) |
| `DiagramEdge` | interface | Edge connecting two nodes with relationship type, visual style, and optional data-flow annotation. | [diagram-ir.ts:47-47](./diagram-ir.ts) |
| `DiagramGroup` | interface | Logical grouping of nodes (e.g., module, package) with label and file path. | [diagram-ir.ts:60-66](./diagram-ir.ts) |
| `DataAnnotation` | interface | Data-flow metadata on edges: input types, output type, transformation description, conditional hints, and source fields. | [diagram-ir.ts:20-27](./diagram-ir.ts) |
| `FieldMapping` | interface | Field-level transformation: source parameter/field, target field, and operation type (spread, assign, destructure, transform). | [diagram-ir.ts:11-16](./diagram-ir.ts) |
| `DiagramType` | type | `"flowchart" \| "class" \| "component"` — the logical diagram type independent of output format. | [diagram-ir.ts:70](./diagram-ir.ts) |
| `DiagramDirection` | type | `"TD" \| "LR"` — top-down or left-right layout direction. | [diagram-ir.ts:71](./diagram-ir.ts) |
| `DiagramFormat` | type | `"mermaid" \| "graphviz" \| "d2"` — target output format. | [diagram-ir.ts:72](./diagram-ir.ts) |
| `EdgeStyle` | type | `"solid" \| "dashed" \| "dotted"` — visual edge styling. | [diagram-ir.ts:47](./diagram-ir.ts) |

## Renderers

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `MermaidRenderer` | class | Renders `DiagramIR` to Mermaid syntax with flowchart/classDiagram/component modes, hash-to-label ID mapping. | [renderers/mermaid-renderer.ts](./renderers/mermaid-renderer.ts) |
| `GraphvizRenderer` | class | Renders `DiagramIR` to Graphviz DOT with cluster subgraphs for groups, record shapes for nodes, and relationship edge styling. | [renderers/graphviz-renderer.ts](./renderers/graphviz-renderer.ts) |
| `D2Renderer` | class | Renders `DiagramIR` to D2 language using native nesting, class shapes, and style properties for visual distinction. | [renderers/d2-renderer.ts](./renderers/d2-renderer.ts) |

## Utilities

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `analyzeFieldMappings` | function | Performs regex-based field mapping for `dataFlowLevel=3`, extracting destructuring, spread, assignment, and transformation patterns from function bodies. | [field-mapper.ts](./field-mapper.ts) |

## Configuration

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `MAX_DIAGRAM_NODES` | 500 | Hard limit on diagram node count; truncated with overflow indicator if exceeded. |
| `MAX_DIAGRAM_EDGES` | 1000 | Hard limit on diagram edge count. |
| `MAX_NODES_PER_LEVEL` | 100 | Per-BFS-level cap; excess nodes grouped into "… and N more" summary. |
| `RELATIONSHIP_CHUNK_SIZE` | 200 | SQL `IN` clause batch size for relationship queries to avoid query size limits. |
| `CACHE_TTL_MS` | 300000 | LRU cache entry time-to-live in milliseconds (5 minutes). |
| `CACHE_MAX_SIZE` | 20 | Maximum number of `DiagramIR` objects held in LRU cache. |
| `MAX_FUNCTIONS_PER_CALL` | 50 | Maximum function count analyzed per caller when collecting field mappings. |
| `MAX_FUNCTION_SIZE` | 10000 | Maximum function body character length eligible for regex field mapping. |

## File Structure

| File | Purpose |
|------|---------|
| `diagram-ir.ts` | Type definitions: `DiagramIR`, `DiagramNode`, `DiagramEdge`, `DiagramGroup`, `DataAnnotation`, `FieldMapping`, and diagram-level types. |
| `schema-collector.ts` | Core graph traversal via phased BFS, relationship enrichment, batch data-flow context fetching, optional field mapping, and LRU result caching. |
| `field-mapper.ts` | Regex-based field mapping extraction: detects destructuring, spread operators, assignments, and transformations in function code for `dataFlowLevel=3`. |
| `renderers/index.ts` | `DiagramRenderer` interface definition and `createRenderer()` factory function. |
| `renderers/mermaid-renderer.ts` | Mermaid output generation: flowchart, classDiagram, and component diagram modes with hashed node IDs. |
| `renderers/graphviz-renderer.ts` | Graphviz DOT generation with cluster subgraphs for grouping, record shapes for nodes, and relationship-based edge styling. |
| `renderers/d2-renderer.ts` | D2 language generation leveraging native nesting, class shapes, and fill color styling for visual hierarchy. |

## Key Dependencies

- **GraphStorage**: Used to fetch indexed entities and relationships; no source file reads.
- **TraceEngine**: Provides `getBatchNodeContext()` for efficient batch enrichment of data-flow annotations.
- **Mermaid/Graphviz/D2**: Output format standards; renderers generate compliant syntax strings.