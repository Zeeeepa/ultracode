# Renderers

## Overview

This module provides a pluggable renderer architecture that transforms DiagramIR (intermediate representation) into multiple diagram formats. It uses the Factory pattern via `createRenderer()` to instantiate the appropriate renderer based on the requested output format. Each renderer implements the common `DiagramRenderer` interface to ensure consistent transformation behavior. Supported formats include D2 (with nesting and class shapes), Graphviz (DOT language), and Mermaid (flowchart/class diagrams).

## Flow

```
DiagramIR
   ↓
createRenderer(format)
   ↓
┌──────────────────────────┐
│ Format-Specific Renderer │
├──────────────────────────┤
│ • D2Renderer             │
│ • GraphvizRenderer       │
│ • MermaidRenderer        │
└──────────────────────────┘
   ↓
render(ir)
   ↓
Output String
(D2 | DOT | Mermaid syntax)
```

## Interface

| Entity | Description | Location |
|--------|-------------|----------|
| `DiagramRenderer` | Interface contract defining `render(ir: DiagramIR): string` method that all renderers must implement. | `index.ts:12-14` |

## Factory

| Entity | Description | Location |
|--------|-------------|----------|
| `createRenderer` | Factory function that instantiates the appropriate renderer based on the requested `DiagramFormat`; throws error for unsupported formats. | `index.ts:12-14` |

## Implementations

| Entity | Description | Location |
|--------|-------------|----------|
| `D2Renderer` | Renders DiagramIR to D2 language with node shape mapping (class, interface, package, function, rectangle), color coding, and support for nested structures. | `d2-renderer.ts:66-164` |
| `GraphvizRenderer` | Renders DiagramIR to Graphviz DOT format using record shapes and edges with semantic annotations for structured visualization. | `graphviz-renderer.ts:64-172` |
| `MermaidRenderer` | Renders DiagramIR to Mermaid syntax supporting both flowchart and class diagram layout styles. | `mermaid-renderer.ts:25-40` |

## Dependencies

**Internal Types:**
- `DiagramIR` — intermediate representation consumed by all renderers
- `DiagramNode`, `DiagramEdge` — structural components defining graph topology  
- `DiagramFormat` — union type specifying supported output formats

**Renderer Modules:**
- `d2-renderer.ts` — D2 language generation with node type classification and color schemes
- `graphviz-renderer.ts` — Graphviz DOT format generation with record shape styling
- `mermaid-renderer.ts` — Mermaid syntax generation for flowchart and class diagrams

**Design Pattern:**
Factory pattern with strategy-style pluggable implementations, allowing new renderers to be registered without modifying dispatcher logic. Each renderer is selected at runtime based on the requested `DiagramFormat`, enabling format selection without compile-time coupling.