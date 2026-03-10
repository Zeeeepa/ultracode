# Architecture Diagrams

🌐 **Language**: [EN] | [RU](./diagrams_ru.md)

---

Generate architecture diagrams from the code graph in Mermaid, Graphviz DOT, or D2 format. Visualize project structure, class hierarchies, data flows, and component relationships — all from the indexed code graph without reading source files.

---

## get_architecture_diagram

Generate an architecture diagram from the code graph. Supports multiple output formats, configurable depth, and data flow annotations.

### Parameters

| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| `entryPoint` | string | no | Entry point: file path, module name, class name, or entity ID. Omit for project-wide diagram |
| `depth` | number | yes | Traversal depth: 1=files/modules, 2=classes/functions, 3=methods/properties, 4+=deeper nesting |
| `dataFlowLevel` | number | yes | Data flow detail: 0=structure only, 1=basic types on edges, 2=all params+conditionals, 3=field-level mapping |
| `format` | string | yes | Output format: `mermaid`, `graphviz`, `d2` |
| `direction` | string | yes | Layout direction: `TD` (top-down) or `LR` (left-right) |
| `diagramType` | string | no | Diagram type: `flowchart`, `class`, `component`. Auto-detected if omitted |
| `projectPath` | string | no | Project directory path |

### Data Flow Levels

| Level | What's shown | Edge example |
|-------|-------------|-------------|
| **0** | Structure only — nodes and call/extends/implements relationships | `A --> B` |
| **1** | Basic types: input→output type signatures, transform/passthrough marker, conditional hints | `A --> \|"string → boolean \| transform \| ⚡if cached"\| B` |
| **2** | All from L1 + conditional edges rendered as dashed lines (visual distinction) | `A -.-> \|"string → boolean \| transform \| ⚡if cached"\| B` |
| **3** | All from L2 + field-level mapping via source code regex analysis | `A -.-> \|"... \| user.name,address.city"\| B` |

### Output Formats

| Format | Best for | Rendering |
|--------|---------|-----------|
| **mermaid** | Markdown, GitHub, documentation | [mermaid.live](https://mermaid.live), GitHub/GitLab native |
| **graphviz** | High-quality print/PDF, large graphs | `dot -Tsvg output.dot -o diagram.svg` |
| **d2** | Interactive, modern styling | `d2 output.d2 diagram.svg` |

### Returns

```typescript
{
  format: "mermaid" | "graphviz" | "d2";
  diagramType: "flowchart" | "class" | "component";
  direction: "TD" | "LR";
  diagram: string;              // Rendered diagram text
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalGroups: number;
    truncated: boolean;          // true if limits were hit
    collectionTimeMs: number;
  };
}
```

### Examples

**Project overview (recommended starting point):**
```
get_architecture_diagram({
  depth: 2,
  dataFlowLevel: 1,
  format: "mermaid",
  direction: "TD"
})
```

**Class diagram for a specific module:**
```
get_architecture_diagram({
  entryPoint: "TraceEngine",
  depth: 3,
  dataFlowLevel: 1,
  format: "mermaid",
  direction: "LR",
  diagramType: "class"
})
```

**Graphviz DOT for print-quality output:**
```
get_architecture_diagram({
  entryPoint: "src/agents/conductor-orchestrator.ts",
  depth: 2,
  dataFlowLevel: 0,
  format: "graphviz",
  direction: "TD"
})
```

**D2 with full data flow annotations:**
```
get_architecture_diagram({
  entryPoint: "SchemaCollector",
  depth: 3,
  dataFlowLevel: 2,
  format: "d2",
  direction: "LR"
})
```

**Field-level mapping (L3) for data transformation analysis:**
```
get_architecture_diagram({
  entryPoint: "processOrder",
  depth: 3,
  dataFlowLevel: 3,
  format: "mermaid",
  direction: "TD"
})
```

### Architecture

The tool uses a 3-layer pipeline:

```
Graph (entities + relationships)
  → SchemaCollector (BFS traversal + data flow enrichment)
    → DiagramIR (format-agnostic intermediate representation)
      → Renderer (Mermaid / Graphviz / D2 text output)
```

**Key design decisions:**
- Own BFS with CONTAINS-only structural traversal (not getSubgraph which follows ALL relationship types)
- Relationship lifting: when depth=2 shows classes, method-level CALLS are lifted to class-level edges
- Batch enrichment via `TraceEngine.getBatchNodeContext()` — 2 SQL queries for the entire diagram
- LRU cache on DiagramIR (SHA256 key, TTL 5min, max 20 entries)
- Source entity filtering: excludes scripts, tests, generated code, docs

### Performance

| Metric | Value |
|--------|-------|
| Max nodes | 500 |
| Max edges | 1000 |
| Max nodes per level | 100 |
| Timeout | 10 seconds |
| Cache TTL | 5 minutes |
| Typical response time | 1-2 seconds (first call), <200ms (cached) |
