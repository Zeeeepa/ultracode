# Diagrams

Universal diagram intermediate representation and collection pipeline for flowcharts, class diagrams, and component visualizations.

## Overview

This module generates architecture diagrams by analyzing the indexed code graph without reading source files. It uses a phased approach: graph traversal with `CONTAINS`-only relationships, relationship lifting (method-level calls elevated to class-level at diagram depth 2), batch enrichment via `TraceEngine`, and optional field-level mapping via regex analysis. All diagrams are built into a universal intermediate representation (`DiagramIR`), then rendered to target format (Mermaid, Graphviz, or D2). The design includes LRU caching (SHA256 keys, 5-minute TTL, 20-entry max) and automatic filtering of non-application code (scripts/, tests/, generated/, docs/).

## Flow

```
GraphStorage (indexed entities + relationships)
    ↓
SchemaCollector (phase-based traversal + enrichment)
    ├─ Phase 1: Structural BFS via CONTAINS relationships
    ├─ Phase 2: Inter-node edges (CALLS/IMPORTS/EXTENDS/IMPLEMENTS)
    │            + relationship lifting to class-level (depth ≥ 2)
    ├─ Phase 3: Data flow enrichment via batch TraceEngine queries
    └─ Phase 4: Field-level mapping via regex (dataFlowLevel=3 only)
    ↓
DiagramIR (nodes, edges, groups, metadata, stats)
    ↓
Renderer (format-specific)
    ├─ MermaidRenderer  → flowchart / classDiagram / component
    ├─ GraphvizRenderer → digraph DOT with cluster subgraphs
    └─ D2Renderer       → D2 native nesting and shapes
    ↓
Output (diagram source code or rendered visualization)
```

## Public API

| Entity | Kind | Purpose |
|--------|------|---------|
| `SchemaCollector` | class | BFS graph traversal with CONTAINS-only structural edges, inter-node relationship collection, data-flow enrichment via batch SQL queries, optional field-level mapping via regex, and LRU caching of `DiagramIR` results. |
| `DiagramRenderer` | interface | Renderer contract defining the rendering boundary: `{ render(ir: DiagramIR): string }`. |
| `createRenderer` | function | Factory function that instantiates and returns a `MermaidRenderer`, `GraphvizRenderer`, or `D2Renderer` based on requested format string. |

## Types & Interfaces

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `FieldMapping` | interface | Field-level transformation record capturing source parameter/field name, target field name, and operation type (spread, assign, destructure, transform). | diagram-ir.ts:11-16 |
| `DataAnnotation` | interface | Data-flow metadata attached to edges: input parameter types, output type, transformation description, conditional hints, and source field references for tracking data lineage. | diagram-ir.ts:20-27 |
| `DiagramNode` | interface | Node entity with id, label, semantic type, optional input/output type annotations, and field-level mappings for data-flow visualization. | diagram-ir.ts:31-43 |
| `DiagramEdge` | interface | Edge entity connecting two nodes with relationship type, visual style (solid/dashed/dotted), and optional data-flow annotation. | diagram-ir.ts:47-54 |
| `DiagramGroup` | interface | Logical grouping container (module, package, namespace) with label, file path, and child node ids for hierarchical diagram organization. | diagram-ir.ts:60-66 |
| `DiagramIR` | interface | Root intermediate representation structure containing nodes, edges, groups, metadata (title, description, creation timestamp), and diagram statistics (node/edge/group counts, depth). | diagram-ir.ts:70-85 |
| `DiagramType` | type | Enumerated diagram logical type: `"flowchart"` or `"class"` or `"component"` (independent of output format). | diagram-ir.ts:88 |
| `DiagramDirection` | type | Layout direction: `"TD"` (top-down) or `"LR"` (left-right). | diagram-ir.ts:89 |
| `DiagramFormat` | type | Target output format: `"mermaid"` or `"graphviz"` or `"d2"`. | diagram-ir.ts:90 |
| `EdgeStyle` | type | Visual edge appearance: `"solid"` or `"dashed"` or `"dotted"`. | diagram-ir.ts:91 |

## Renderers

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `MermaidRenderer` | class | Renders `DiagramIR` to Mermaid syntax supporting flowchart, class diagram, and component modes with hash-to-label ID mapping for node references. | renderers/mermaid-renderer.ts |
| `GraphvizRenderer` | class | Renders `DiagramIR` to Graphviz DOT language using cluster subgraphs for groups, record node shapes, and styled edges for relationship types. | renderers/graphviz-renderer.ts |
| `D2Renderer` | class | Renders `DiagramIR` to D2 language leveraging native nesting for hierarchies, class shapes for nodes, and style properties for visual distinction. | renderers/d2-renderer.ts |

## Utilities

| Entity | Kind | Description | Location |
|--------|------|-------------|----------|
| `analyzeFieldMappings` | function | Analyzes TypeScript parameter objects and function signatures via regex to extract field-level data-flow mappings (parameter → target field assignments). | utils/field-mapping.ts |
| `normalizePath` | function | Normalizes file paths to forward-slash notation and applies source filtering (excludes scripts/, tests/, generated/, docs/ paths). | utils/path-utils.ts |
| `getLRUCache` | function | Returns or initializes a thread-safe LRU cache for `DiagramIR` results (capacity: 20 entries, TTL: 5 minutes, key: SHA256 hash of request parameters). | utils/cache.ts |
| `relationshipLift` | function | Promotes method-level `CALLS` relationships to class-level edges at diagram depth 2 and above for improved readability and abstraction. | utils/relationship-lift.ts |

## Dependencies

**Internal:**
- `GraphStorage` (from `src/storage`) — indexed entities and relationships; source of truth for graph structure
- `TraceEngine` (from `src/analysis`) — batch node context enrichment via `getBatchNodeContext(nodeIds)` for data-flow annotations
- `Node` / `Edge` / `Group` types (from `src/generated/proto`) — protocol buffer definitions for code graph entities

**External:**
- `mermaid` (NPM) — Mermaid diagram syntax and validation (optional, for Mermaid output)
- `crypto` (Node.js stdlib) — SHA256 hashing for LRU cache keys