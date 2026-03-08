/**
 * Graphviz DOT Renderer
 *
 * Generates DOT language output from DiagramIR.
 * Uses record shapes for classes, box for functions/modules, and cluster subgraphs for groups.
 */

import type { DiagramEdge, DiagramIR, DiagramNode } from "../diagram-ir.js";
import type { DiagramRenderer } from "./index.js";

function escapeLabel(text: string): string {
  return text.replace(/"/g, '\\"').replace(/[<>{}|]/g, "\\$&");
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 50);
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
  return parts.join("\\n") || edge.label || "";
}

function nodeShape(type: string): string {
  switch (type) {
    case "class":
    case "interface":
      return "record";
    case "package":
      return "folder";
    case "function":
    case "method":
    case "async_function":
      return "ellipse";
    default:
      return "box";
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

export class GraphvizRenderer implements DiagramRenderer {
  render(ir: DiagramIR): string {
    const rankdir = ir.direction === "LR" ? "LR" : "TB";
    const lines: string[] = [];

    lines.push("digraph G {");
    lines.push(`  rankdir=${rankdir};`);
    lines.push('  node [fontname="Helvetica", fontsize=10];');
    lines.push('  edge [fontname="Helvetica", fontsize=8];');
    lines.push("");

    // Track grouped nodes
    const groupedNodeIds = new Set<string>();
    for (const group of ir.groups) {
      for (const nid of group.nodeIds) groupedNodeIds.add(nid);
    }

    // Render groups as cluster subgraphs
    for (const group of ir.groups) {
      lines.push(`  subgraph cluster_${sanitizeId(group.id)} {`);
      lines.push(`    label="${escapeLabel(group.label)}";`);
      lines.push("    style=dashed;");
      lines.push('    color="#666666";');
      for (const nid of group.nodeIds) {
        const node = ir.nodes.find((n) => n.id === nid);
        if (node) lines.push(`    ${this.renderNode(node, ir)}`);
      }
      lines.push("  }");
      lines.push("");
    }

    // Render ungrouped nodes
    for (const node of ir.nodes) {
      if (!groupedNodeIds.has(node.id) && !node.parentId) {
        lines.push(`  ${this.renderNode(node, ir)}`);
      }
    }
    lines.push("");

    // Render edges
    for (const edge of ir.edges) {
      lines.push(`  ${this.renderEdge(edge)}`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  private renderNode(node: DiagramNode, ir: DiagramIR): string {
    const id = sanitizeId(node.id);
    const shape = nodeShape(node.type);
    const color = nodeColor(node.type);

    if (shape === "record" && (node.type === "class" || node.type === "interface")) {
      // Build record label with children
      const children = ir.nodes.filter((n) => n.parentId === node.id);
      const methodLines = children
        .map((c) => {
          if (c.type === "method" || c.type === "function" || c.type === "async_function") {
            const ret = c.outputType || "void";
            return `+ ${escapeLabel(c.label)}(): ${ret}`;
          }
          return `+ ${escapeLabel(c.label)}`;
        })
        .join("\\l");
      const prefix = node.type === "interface" ? "\\<\\<interface\\>\\>\\n" : "";
      const label = methodLines
        ? `{${prefix}${escapeLabel(node.label)}|${methodLines}\\l}`
        : `{${prefix}${escapeLabel(node.label)}}`;
      return `${id} [shape=record, label="${label}", style=filled, fillcolor="${color}40"];`;
    }

    return `${id} [shape=${shape}, label="${escapeLabel(node.label)}", style=filled, fillcolor="${color}40"];`;
  }

  private renderEdge(edge: DiagramEdge): string {
    const from = sanitizeId(edge.fromId);
    const to = sanitizeId(edge.toId);
    const label = buildEdgeLabel(edge);
    const attrs: string[] = [];

    if (label) attrs.push(`label="${escapeLabel(label)}"`);

    switch (edge.style) {
      case "dashed":
        attrs.push("style=dashed");
        break;
      case "dotted":
        attrs.push("style=dotted");
        break;
    }

    // Arrow style by relationship type
    switch (edge.type) {
      case "extends":
        attrs.push("arrowhead=empty");
        break;
      case "implements":
        attrs.push("arrowhead=empty", "style=dashed");
        break;
      case "imports":
        attrs.push("arrowhead=vee", "style=dashed");
        break;
    }

    const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
    return `${from} -> ${to}${attrStr};`;
  }
}
