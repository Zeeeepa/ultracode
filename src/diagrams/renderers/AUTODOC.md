# Renderers

Converts diagram intermediate representation to multiple text formats

## Exports

| Name | Type | Description | Location |
|------|------|-------------|----------|
| `createRenderer` | function | Factory function instantiating appropriate renderer based on format | [→ index.ts:12-14] |
| `D2Renderer` | class | Implements DiagramRenderer to generate D2 diagram language output | [→ d2-renderer.ts:66-164] |
| `DiagramRenderer` | interface | Interface contract specifying render method for all renderers | [→ index.ts:12-14] |
| `GraphvizRenderer` | class | Implements DiagramRenderer to generate Graphviz DOT language output | [→ graphviz-renderer.ts:64-172] |
| `MermaidRenderer` | class | Implements DiagramRenderer to generate Mermaid syntax diagrams | [→ mermaid-renderer.ts:25-40] |

## Files

- **d2-renderer.ts** — Renders DiagramIR as D2 language with nesting and class shapes
- **graphviz-renderer.ts** — Renders DiagramIR as Graphviz DOT format with record shapes
- **index.ts** — Defines DiagramRenderer interface and provides factory creation function
- **mermaid-renderer.ts** — Renders DiagramIR as Mermaid flowchart or class diagram syntax
