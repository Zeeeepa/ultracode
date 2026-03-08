/**
 * Diagram Renderers — Factory + Interface
 *
 * Each renderer converts DiagramIR into a specific text format.
 */

import type { DiagramFormat, DiagramIR } from "../diagram-ir.js";
import { D2Renderer } from "./d2-renderer.js";
import { GraphvizRenderer } from "./graphviz-renderer.js";
import { MermaidRenderer } from "./mermaid-renderer.js";

export interface DiagramRenderer {
  render(ir: DiagramIR): string;
}

export function createRenderer(format: DiagramFormat): DiagramRenderer {
  switch (format) {
    case "mermaid":
      return new MermaidRenderer();
    case "graphviz":
      return new GraphvizRenderer();
    case "d2":
      return new D2Renderer();
    default:
      throw new Error(`Unsupported diagram format: ${format}`);
  }
}
