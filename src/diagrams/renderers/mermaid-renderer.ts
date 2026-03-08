/**
 * Mermaid Diagram Renderer
 *
 * Generates Mermaid-compatible text from DiagramIR.
 * Supports flowchart, classDiagram, and component (flowchart with box style) modes.
 */

import type { DiagramEdge, DiagramIR, DiagramNode } from "../diagram-ir.js";
import type { DiagramRenderer } from "./index.js";

/** Sanitize string for use as Mermaid node ID */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 40);
}

/** Escape label text for Mermaid (quotes and special chars) */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/[<>]/g, "_");
}

/**
 * Build a stable mapping from node.id (hash) → unique sanitized label.
 * Handles collisions by appending _2, _3, etc.
 */
function buildIdMap(nodes: DiagramNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedLabels = new Map<string, number>();

  for (const node of nodes) {
    let label = sanitizeId(node.label);
    const count = usedLabels.get(label) || 0;
    if (count > 0) {
      label = `${label}_${count + 1}`;
    }
    usedLabels.set(sanitizeId(node.label), count + 1);
    map.set(node.id, label);
  }

  return map;
}

function buildEdgeAnnotation(edge: DiagramEdge): string {
  if (!edge.dataAnnotation) return edge.label || "";
  const da = edge.dataAnnotation;
  const parts: string[] = [];
  if (da.inputTypes.length > 0 && da.outputType) {
    parts.push(`${da.inputTypes.join(",")} → ${da.outputType}`);
  }
  if (da.transformation) parts.push(da.transformation);
  if (da.hasConditionalLogic && da.conditionalHint) parts.push(`⚡${da.conditionalHint}`);
  if (da.sourceFields && da.sourceFields.length > 0) parts.push(da.sourceFields.join(","));
  return parts.join(" | ") || edge.label || "";
}

export class MermaidRenderer implements DiagramRenderer {
  render(ir: DiagramIR): string {
    switch (ir.diagramType) {
      case "class":
        return this.renderClassDiagram(ir);
      case "flowchart":
      case "component":
      default:
        return this.renderFlowchart(ir);
    }
  }

  private renderFlowchart(ir: DiagramIR): string {
    const idMap = buildIdMap(ir.nodes);
    const resolve = (id: string) => idMap.get(id) || sanitizeId(id);
    const lines: string[] = [];
    lines.push(`flowchart ${ir.direction}`);

    // Track which nodes are in groups
    const groupedNodeIds = new Set<string>();
    for (const group of ir.groups) {
      for (const nid of group.nodeIds) groupedNodeIds.add(nid);
    }

    // Render groups as subgraphs
    for (const group of ir.groups) {
      lines.push(`  subgraph ${sanitizeId(group.id)}["${escapeLabel(group.label)}"]`);
      for (const nid of group.nodeIds) {
        const node = ir.nodes.find((n) => n.id === nid);
        if (node) lines.push(`    ${this.renderFlowchartNode(node, resolve)}`);
      }
      lines.push("  end");
    }

    // Render ungrouped nodes
    for (const node of ir.nodes) {
      if (!groupedNodeIds.has(node.id)) {
        lines.push(`  ${this.renderFlowchartNode(node, resolve)}`);
      }
    }

    // Render edges
    for (const edge of ir.edges) {
      lines.push(`  ${this.renderFlowchartEdge(edge, resolve)}`);
    }

    return lines.join("\n");
  }

  private renderFlowchartNode(node: DiagramNode, resolve: (id: string) => string): string {
    const id = resolve(node.id);
    const label = escapeLabel(node.label);
    switch (node.type) {
      case "class":
      case "interface":
        return `${id}[["${label}"]]`;
      case "function":
      case "method":
      case "async_function":
        return `${id}("${label}")`;
      case "package":
        return `${id}[/"${label}"/]`;
      default:
        return `${id}["${label}"]`;
    }
  }

  private renderFlowchartEdge(edge: DiagramEdge, resolve: (id: string) => string): string {
    const from = resolve(edge.fromId);
    const to = resolve(edge.toId);
    const label = buildEdgeAnnotation(edge);
    const labelPart = label ? `|"${escapeLabel(label)}"|` : "";

    switch (edge.style) {
      case "dashed":
        return `${from} -.-> ${labelPart} ${to}`;
      case "dotted":
        return `${from} -..- ${labelPart} ${to}`;
      default:
        return `${from} --> ${labelPart} ${to}`;
    }
  }

  private renderClassDiagram(ir: DiagramIR): string {
    const idMap = buildIdMap(ir.nodes);
    const resolve = (id: string) => idMap.get(id) || sanitizeId(id);
    const lines: string[] = [];
    lines.push("classDiagram");

    // Render class nodes
    for (const node of ir.nodes) {
      if (node.type === "class" || node.type === "interface") {
        const className = resolve(node.id);
        lines.push(`  class ${className} {`);
        if (node.type === "interface") lines.push("    <<interface>>");
        // Find children (methods/properties) among nodes
        const children = ir.nodes.filter((n) => n.parentId === node.id);
        for (const child of children) {
          if (child.type === "method" || child.type === "function" || child.type === "async_function") {
            const params = child.inputTypes.join(", ");
            const ret = child.outputType || "void";
            lines.push(`    +${child.label}(${params}) ${ret}`);
          } else {
            lines.push(`    +${child.label}`);
          }
        }
        lines.push("  }");
      }
    }

    // Render relationships
    for (const edge of ir.edges) {
      const from = resolve(edge.fromId);
      const to = resolve(edge.toId);
      const label = edge.label ? ` : ${escapeLabel(edge.label)}` : "";
      switch (edge.type) {
        case "extends":
          lines.push(`  ${from} --|> ${to}${label}`);
          break;
        case "implements":
          lines.push(`  ${from} ..|> ${to}${label}`);
          break;
        case "calls":
          lines.push(`  ${from} --> ${to}${label}`);
          break;
        default:
          lines.push(`  ${from} --> ${to}${label}`);
      }
    }

    return lines.join("\n");
  }
}
