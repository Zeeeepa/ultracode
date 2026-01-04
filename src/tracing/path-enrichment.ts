/**
 * Path Enrichment Module
 *
 * Functions for enriching raw paths with control flow information.
 * Extracted from PathBuilder for better modularity.
 */

import type {
  AdjacencyGraph,
  ConfidenceLevel,
  GraphNode,
  RawPath,
  TraceActionType,
  TracePath,
  TraceStep,
} from "./types.js";

/**
 * Determine action type for a step based on node control flow
 */
export function determineAction(node: GraphNode, position: number, totalLength: number): TraceActionType {
  // Last step is typically a return
  if (position === totalLength - 1) {
    return "return";
  }

  // Check for specific patterns
  if (node.controlFlow?.branches && node.controlFlow.branches.length > 0) {
    return "condition";
  }

  if (node.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
    return "await";
  }

  if (node.controlFlow?.loops && node.controlFlow.loops.length > 0) {
    return "loop";
  }

  if (node.controlFlow?.exceptions && node.controlFlow.exceptions.length > 0) {
    return "throw";
  }

  return "call";
}

/**
 * Calculate confidence score for a path
 */
export function calculateConfidence(raw: RawPath): number {
  // Base confidence
  let confidence = 1.0;

  // Reduce for longer paths
  confidence -= raw.entityIds.length * 0.02;

  // Reduce for conditional paths
  confidence -= raw.conditionCount * 0.1;

  // Reduce for high weight
  confidence -= raw.weight * 0.05;

  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Generate human-readable path summary
 */
export function generatePathSummary(steps: TraceStep[]): string {
  if (steps.length === 0) return "Empty path";

  if (steps.length === 1) {
    return `Direct call to ${steps[0]!.entity}`;
  }

  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  const conditions = steps.filter((s) => s.action === "condition").length;
  const awaits = steps.filter((s) => s.awaits).length;

  let summary = `${first.entity} → ${last.entity} (${steps.length} steps)`;

  if (conditions > 0) {
    summary += `, ${conditions} condition${conditions > 1 ? "s" : ""}`;
  }

  if (awaits > 0) {
    summary += `, ${awaits} await${awaits > 1 ? "s" : ""}`;
  }

  return summary;
}

/**
 * Generate warnings for a path
 */
export function generateWarnings(raw: RawPath, graph: AdjacencyGraph): string[] {
  const warnings: string[] = [];

  // Warn about long paths
  if (raw.entityIds.length > 10) {
    warnings.push("Long call chain - may indicate design issues");
  }

  // Warn about many conditions
  if (raw.conditionCount > 5) {
    warnings.push("Many conditional branches - path may be rarely executed");
  }

  // Warn about async boundaries
  let asyncCount = 0;
  for (const id of raw.entityIds) {
    const node = graph.nodes.get(id);
    if (node?.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
      asyncCount++;
    }
  }
  if (asyncCount > 3) {
    warnings.push("Multiple async boundaries - consider timing issues");
  }

  return warnings;
}

/**
 * Get confidence level from numeric score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/**
 * Enrich a single raw path to a full TracePath
 */
export function enrichPath(raw: RawPath, graph: AdjacencyGraph, pathIndex: number): TracePath {
  const steps: TraceStep[] = [];

  for (let j = 0; j < raw.entityIds.length; j++) {
    const nodeId = raw.entityIds[j]!;
    const node = graph.nodes.get(nodeId);

    if (!node) continue;

    const step: TraceStep = {
      order: j + 1,
      entity: node.name,
      entityId: nodeId,
      file: node.file,
      line: node.line,
      action: determineAction(node, j, raw.entityIds.length),
    };

    // Add condition info if present
    if (node.controlFlow?.branches && node.controlFlow.branches.length > 0) {
      step.condition = node.controlFlow.branches[0]?.condition;
      step.branches = {};
      for (const branch of node.controlFlow.branches) {
        step.branches[branch.condition] = branch.target || "continue";
      }
    }

    // Add await info if present
    if (node.controlFlow?.awaits && node.controlFlow.awaits.length > 0) {
      step.awaits = true;
      step.awaitTarget = node.controlFlow.awaits[0]?.target;
    }

    steps.push(step);
  }

  const confidence = calculateConfidence(raw);

  return {
    id: `path-${pathIndex + 1}`,
    confidence,
    steps,
    summary: generatePathSummary(steps),
    warnings: generateWarnings(raw, graph),
  };
}

/**
 * Enrich multiple raw paths to full TracePaths
 */
export function enrichPaths(rawPaths: RawPath[], graph: AdjacencyGraph): TracePath[] {
  return rawPaths.map((raw, i) => enrichPath(raw, graph, i));
}
