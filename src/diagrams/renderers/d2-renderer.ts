/**
 * D2 Diagram Renderer
 *
 * Generates D2 language output from DiagramIR.
 * D2 natively supports nesting, class shapes, and rich styling.
 */

import type { DiagramEdge, DiagramIR, DiagramNode } from "../diagram-ir.js";
import type { DiagramRenderer } from "./index.js";

function sanitizeId(name: string): string {
  // D2 allows hyphens and dots in IDs when quoted
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_").substring(0, 50);
}

function escapeLabel(text: string): string {
  return text.replace(/"/g, '\\"');
}

function nodeShape(type: string): string {
  switch (type) {
    case "class":
      return "class";
    case "interface":
      return "class";
    case "package":
      return "package";
    case "function":
    case "method":
    case "async_function":
      return "rectangle";
    default:
      return "rectangle";
  }
}

function nodeColor(type: string): string {
  switch (type) {
    case "class":
      return "#4A90D9";
    case "interface":
      return "#7B68EE";
    case "function":
    case "method":
    case "async_function":
      return "#50C878";
    case "package":
      return "#FFB347";
    default:
      return "#D3D3D3";
  }
}

function buildEdgeLabel(edge: DiagramEdge): string {
  if (!edge.dataAnnotation) return edge.label || "";
  const da = edge.dataAnnotation;
  const parts: string[] = [];
  if (da.inputTypes.length > 0 && da.outputType) {
    parts.push(`${da.inputTypes.join(",")} → ${da.outputType}`);
  }
  if (da.transformation) parts.push(da.transformation);
  if (da.hasConditionalLogic && da.conditionalHint) parts.push(`⚡${da.conditionalHint}`);
  return parts.join(" | ") || edge.label || "";
}

export class D2Renderer implements DiagramRenderer {
  render(ir: DiagramIR): string {
    const lines: string[] = [];
    lines.push(`direction: ${ir.direction === "LR" ? "right" : "down"}`);
    lines.push("");

    // Track grouped nodes
    const groupedNodeIds = new Set<string>();
    for (const group of ir.groups) {
      for (const nid of group.nodeIds) groupedNodeIds.add(nid);
    }

    // Render groups with nested nodes
    for (const group of ir.groups) {
      const gid = sanitizeId(group.id);
      lines.push(`${gid}: "${escapeLabel(group.label)}" {`);
      for (const nid of group.nodeIds) {
        const node = ir.nodes.find((n) => n.id === nid);
        if (node) {
          this.renderNode(lines, node, ir, "  ");
        }
      }
      lines.push("}");
      lines.push("");
    }

    // Render ungrouped top-level nodes
    for (const node of ir.nodes) {
      if (!groupedNodeIds.has(node.id) && !node.parentId) {
        this.renderNode(lines, node, ir, "");
      }
    }
    lines.push("");

    // Render edges
    for (const edge of ir.edges) {
      this.renderEdge(lines, edge);
    }

    return lines.join("\n");
  }

  private renderNode(lines: string[], node: DiagramNode, ir: DiagramIR, indent: string): void {
    const id = sanitizeId(node.id);
    const shape = nodeShape(node.type);
    const color = nodeColor(node.type);

    if ((node.type === "class" || node.type === "interface") && shape === "class") {
      // D2 class shape with methods
      const children = ir.nodes.filter((n) => n.parentId === node.id);
      lines.push(`${indent}${id}: "${escapeLabel(node.label)}" {`);
      lines.push(`${indent}  shape: class`);
      lines.push(`${indent}  style.fill: "${color}40"`);
      if (node.type === "interface") {
        lines.push(`${indent}  style.stroke-dash: 3`);
      }
      for (const child of children) {
        const cid = sanitizeId(child.id);
        if (child.type === "method" || child.type === "function" || child.type === "async_function") {
          const ret = child.outputType || "void";
          lines.push(`${indent}  ${cid}: "${escapeLabel(child.label)}(): ${ret}"`);
        } else {
          lines.push(`${indent}  ${cid}: "${escapeLabel(child.label)}"`);
        }
      }
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}${id}: "${escapeLabel(node.label)}" {`);
      lines.push(`${indent}  shape: ${shape}`);
      lines.push(`${indent}  style.fill: "${color}40"`);
      lines.push(`${indent}}`);
    }
  }

  private renderEdge(lines: string[], edge: DiagramEdge): void {
    const from = sanitizeId(edge.fromId);
    const to = sanitizeId(edge.toId);
    const label = buildEdgeLabel(edge);

    let arrow: string;
    switch (edge.style) {
      case "dashed":
        arrow = edge.type === "implements" ? "-- .." : "-->";
        break;
      case "dotted":
        arrow = "-- ..";
        break;
      default:
        arrow = edge.type === "extends" ? "<-" : "->";
        break;
    }

    if (label) {
      lines.push(`${from} ${arrow} ${to}: "${escapeLabel(label)}"`);
    } else {
      lines.push(`${from} ${arrow} ${to}`);
    }
  }
}
