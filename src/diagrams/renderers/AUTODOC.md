# Diagram Renderers

Converts DiagramIR into multiple diagram formats using renderer classes

## Overview

The `src/diagrams/renderers` module implements a pluggable diagram rendering system that converts abstract diagram representations (`DiagramIR`) into concrete diagram syntaxes. Three renderer backends are provided: D2, Graphviz, and Mermaid, each handling diagram node rendering, edge styling, and format-specific syntax constraints. Renderers handle node grouping, shape/color styling, and edge label formatting in a backend-agnostic way through a common interface.

## Flow

```
DiagramIR
  │
  ├─→ D2Renderer ──→ D2 language (with nesting & classes)
  ├─→ GraphvizRenderer ──→ DOT language (with ranks & methods)
  └─→ MermaidRenderer ──→ Mermaid syntax (flowchart & class diagrams)
        │
        ├─→ renderFlowchart (subgraph & node/edge layout)
        └─→ renderClassDiagram (class structure & inheritance)
```

## Public API

### Interface

- **DiagramRenderer** — `index.ts:12-14`  
  Contract for diagram renderers; declares `render(diagram: DiagramIR): string` method that implementations must provide.

### Factory

- **createRenderer** — `index.ts:16-27`  
  Instantiates and returns the appropriate renderer implementation based on diagram type and backend format selection.

---

## Renderer Implementations

### D2 Renderer

- **D2Renderer** — `d2-renderer.ts:66-164`  
  Renders diagrams to D2 language, leveraging D2's native support for nesting and class shapes.

#### Methods
- **render** — `d2-renderer.ts:67-106`  
  Converts a DiagramIR to D2 syntax; groups nodes by parent, recursively renders nested structures, formats edge connections.
- **renderNode** — `d2-renderer.ts:108-138`  
  Generates D2 node declarations with shape (class/interface/package), color, and child containment.
- **renderEdge** — `d2-renderer.ts:140-163`  
  Outputs D2 edge syntax with label and directional arrows; handles sanitized node references.

#### Helpers
- **sanitizeId** — `d2-renderer.ts:11-14`  
  Escapes node identifiers to valid D2 names (alphanumeric, hyphen, underscore, dot); max 50 chars.
- **escapeLabel** — `d2-renderer.ts:16-18`  
  Escapes double quotes in display labels for D2 string literals.
- **nodeShape** — `d2-renderer.ts:20-35`  
  Maps entity types (class, interface, package) to D2 shape declarations.
- **nodeColor** — `d2-renderer.ts:37-52`  
  Assigns D2 colors based on entity kind (e.g., blue for classes, green for interfaces).
- **buildEdgeLabel** — `d2-renderer.ts:54-64`  
  Constructs formatted edge labels with cardinality and relationship type annotations.

---

### Graphviz Renderer

- **GraphvizRenderer** — `graphviz-renderer.ts:64-172`  
  Renders diagrams to Graphviz DOT language with left-to-right ranking and cluster support for nested scopes.

#### Methods
- **render** — `graphviz-renderer.ts:65-110`  
  Converts DiagramIR to DOT syntax; sets graph attributes (rankdir, fontname), groups nodes into clusters, renders all edges.
- **renderNode** — `graphviz-renderer.ts:112-137`  
  Generates DOT node declarations with shape, color, and labels; embeds child methods as subgraph items for classes.
- **renderEdge** — `graphviz-renderer.ts:139-171`  
  Outputs DOT edge syntax with tail/head references, label formatting, and attribute strings (weight, color).

#### Helpers
- **sanitizeId** — `graphviz-renderer.ts:15-17`  
  Escapes node identifiers for DOT; removes or replaces special characters.
- **escapeLabel** — `graphviz-renderer.ts:11-13`  
  Escapes quotes and newlines in labels for DOT string format.
- **nodeShape** — `graphviz-renderer.ts:31-45`  
  Maps entity types to Graphviz shape names (box for class, oval for interface, folder for package).
- **nodeColor** — `graphviz-renderer.ts:47-62`  
  Assigns Graphviz RGB/named colors based on entity kind and semantic category.
- **buildEdgeLabel** — `graphviz-renderer.ts:19-29`  
  Builds edge labels with cardinality annotations and relationship descriptions for DOT output.

---

### Mermaid Renderer

- **MermaidRenderer** — `mermaid-renderer.ts:55-187`  
  Renders diagrams to Mermaid syntax; supports both flowchart (for hierarchical flows) and class diagram (for OOP structures) output formats.

#### Methods
- **render** — `mermaid-renderer.ts:56-65`  
  Dispatches to flowchart or class diagram renderer based on diagram type; returns Mermaid block string.
- **renderFlowchart** — `mermaid-renderer.ts:67-102`  
  Generates Mermaid flowchart syntax with numbered node IDs and directional edges; handles node nesting as subgraphs.
- **renderFlowchartNode** — `mermaid-renderer.ts:104-120`  
  Outputs Mermaid flowchart node syntax with shape indicators (square, round, diamond) and label text.
- **renderFlowchartEdge** — `mermaid-renderer.ts:122-136`  
  Constructs Mermaid edge declarations (→, -->>) with optional labels; maps Mermaid node IDs via resolution function.
- **renderClassDiagram** — `mermaid-renderer.ts:138-186`  
  Generates Mermaid class diagram syntax with class declarations, method/property lists, and relationship annotations (inheritance, composition).

#### Helpers
- **buildIdMap** — `mermaid-renderer.ts:25-40`  
  Creates a map from DiagramNode to Mermaid numeric IDs; ensures unique IDs for flowchart rendering by appending counters to duplicate labels.
- **buildEdgeAnnotation** — `mermaid-renderer.ts:42-53`  
  Constructs relationship annotations in Mermaid syntax (e.g., "*--o" for composition, "<|--" for inheritance).
- **sanitizeId** — `mermaid-renderer.ts:12-14`  
  Escapes node identifiers for Mermaid; removes non-alphanumeric characters except underscore.
- **escapeLabel** — `mermaid-renderer.ts:17-19`  
  Escapes special characters (quotes, newlines, pipe symbols) in labels for Mermaid string context.

---

## Types & Internal Structure

### Type: DiagramEdge
Represents an edge in the diagram IR: carries source and target node identifiers, edge label, and optional arrow style directives.

### Type: DiagramIR
Top-level diagram representation; contains a root node and edges; rooted at a package or module scope.

### Type: DiagramNode
Represents a node in the diagram IR: carries identifier, label, kind (class/interface/function/package), optional styling, and child nodes for nesting.

---

## Design Patterns

**Strategy Pattern**  
Each renderer class encapsulates a different diagram output strategy (D2, Graphviz, Mermaid). The `createRenderer` factory instantiates the strategy based on configuration, allowing callers to swap backends without changing diagram traversal logic.

**Visitor-like Traversal**  
All renderers walk the DiagramIR tree depth-first, processing nodes and edges in the same order; format-specific syntax generation is delegated to renderer-specific helpers.

**Helper Encapsulation**  
Each renderer defines local helper functions (`sanitizeId`, `escapeLabel`, `nodeShape`, `nodeColor`, `buildEdgeLabel`) that encapsulate format-specific rules; this prevents cross-renderer contamination and makes format changes localized.