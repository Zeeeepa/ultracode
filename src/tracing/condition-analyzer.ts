/**
 * Condition Analyzer for Semantic Tracing
 *
 * Analyzes branching conditions, guards, and decision points.
 * Identifies critical control flow patterns.
 *
 * Architecture References:
 * - Tracing Types: src/tracing/types.ts
 * - Path Builder: src/tracing/path-builder.ts
 */

import type { Entity, GraphStorage } from "../types/storage.js";
import { RelationType } from "../types/storage.js";
import type {
  ConditionsSummary,
  DecisionPoint,
  DecisionPointType,
  FindDecisionPointsParams,
  FindDecisionPointsResult,
  ImpactLevel,
} from "./types.js";

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const GUARD_PATTERNS = [/^if\s*\([^)]+\)\s*(return|throw)/, /^\s*(return|throw)\s+if/, /^guard\s+/, /^unless\s+/];

const VALIDATION_PATTERNS = [/valid/i, /check/i, /verify/i, /assert/i, /ensure/i, /require/i];

// =============================================================================
// 2. CONDITION ANALYZER CLASS
// =============================================================================

export class ConditionAnalyzer {
  private storage: GraphStorage;
  private decisionPointCache: Map<string, DecisionPoint[]> = new Map();

  constructor(storage: GraphStorage) {
    this.storage = storage;
  }

  // ===========================================================================
  // 3. DECISION POINT DETECTION
  // ===========================================================================

  /**
   * Find all decision points in a scenario
   */
  async findDecisionPoints(params: FindDecisionPointsParams): Promise<FindDecisionPointsResult> {
    const { scenario, includeGuards = true, includeEffects = true, groupBy = "impact" } = params;

    // 1. Find entry points for the scenario
    const entryPoints = await this.findEntryPoints(scenario);

    // 2. Collect all decision points
    const allDecisionPoints: DecisionPoint[] = [];
    const visited = new Set<string>();

    for (const entry of entryPoints) {
      const points = await this.collectDecisionPoints(entry.id, visited, includeGuards, includeEffects);
      allDecisionPoints.push(...points);
    }

    // 3. Deduplicate
    const uniquePoints = this.deduplicateDecisionPoints(allDecisionPoints);

    // 4. Sort/group by specified criteria
    const sortedPoints = this.sortDecisionPoints(uniquePoints, groupBy);

    // 5. Generate flow diagram
    const mermaid = this.generateFlowDiagram(sortedPoints, entryPoints);

    // 6. Calculate summary
    const summary = this.calculateSummary(sortedPoints);

    return {
      scenario,
      entryPoints: entryPoints.map((e) => ({ name: e.name, file: e.filePath })),
      decisionPoints: sortedPoints,
      flowDiagram: { mermaid },
      summary,
    };
  }

  /**
   * Find entry points for a scenario
   */
  private async findEntryPoints(scenario: string): Promise<Entity[]> {
    // Search by name pattern
    const entities = await this.storage.searchEntities({
      namePattern: scenario,
    });

    if (entities.length > 0) {
      return entities.slice(0, 5); // Limit to top 5 matches
    }

    // Try broader search
    const keywords = scenario.split(/\s+/);
    for (const keyword of keywords) {
      const results = await this.storage.searchEntities({
        namePattern: keyword,
      });
      if (results.length > 0) {
        return results.slice(0, 5);
      }
    }

    return [];
  }

  /**
   * Collect decision points starting from an entity
   */
  private async collectDecisionPoints(
    entityId: string,
    visited: Set<string>,
    includeGuards: boolean,
    includeEffects: boolean,
    depth: number = 0,
    maxDepth: number = 10,
  ): Promise<DecisionPoint[]> {
    if (visited.has(entityId) || depth > maxDepth) return [];
    visited.add(entityId);

    const points: DecisionPoint[] = [];
    const entity = await this.storage.getEntity(entityId);

    if (!entity) return points;

    // Extract decision points from this entity
    const entityPoints = this.extractDecisionPoints(entity, includeGuards, includeEffects);
    points.push(...entityPoints);

    // Follow calls to find more decision points
    const rels = await this.storage.getRelationshipsForEntity(entityId, RelationType.CALLS);
    for (const rel of rels) {
      if (rel.fromId === entityId) {
        const childPoints = await this.collectDecisionPoints(
          rel.toId,
          visited,
          includeGuards,
          includeEffects,
          depth + 1,
          maxDepth,
        );
        points.push(...childPoints);
      }
    }

    return points;
  }

  /**
   * Extract decision points from an entity
   */
  private extractDecisionPoints(entity: Entity, includeGuards: boolean, includeEffects: boolean): DecisionPoint[] {
    const points: DecisionPoint[] = [];
    const meta = entity.metadata as Record<string, any>;
    let pointIndex = 0;

    // Check for branching conditions
    if (meta.controlFlow?.branches && Array.isArray(meta.controlFlow.branches)) {
      for (const branch of meta.controlFlow.branches) {
        const type = this.classifyConditionType(branch.condition, entity.name);

        // Skip guards if not requested
        if (type === "guard" && !includeGuards) continue;

        const point: DecisionPoint = {
          id: `dp-${entity.id}-${pointIndex++}`,
          location: `${entity.filePath}:${entity.location.start.line}`,
          type,
          condition: branch.condition,
          outcomes: this.buildOutcomes(branch),
          impact: this.assessImpact(type, branch),
          dataDepends: this.extractDataDependencies(branch.condition),
          triggeredBy: entity.name,
        };

        if (includeEffects && branch.effects) {
          point.effects = branch.effects;
        }

        points.push(point);
      }
    }

    // Check for loops
    if (meta.controlFlow?.loops && Array.isArray(meta.controlFlow.loops)) {
      for (const loop of meta.controlFlow.loops) {
        points.push({
          id: `dp-${entity.id}-${pointIndex++}`,
          location: `${entity.filePath}:${entity.location.start.line}`,
          type: "loop",
          condition: loop.condition,
          outcomes: {
            continue: "Next iteration",
            break: "Exit loop",
          },
          impact: "medium",
          dataDepends: this.extractDataDependencies(loop.condition || ""),
          triggeredBy: entity.name,
        });
      }
    }

    // Check for exception handling
    if (meta.controlFlow?.exceptions && Array.isArray(meta.controlFlow.exceptions)) {
      for (const exc of meta.controlFlow.exceptions) {
        points.push({
          id: `dp-${entity.id}-${pointIndex++}`,
          location: `${entity.filePath}:${entity.location.start.line}`,
          type: "error_handling",
          action: `catch ${exc.type || "Error"}`,
          outcomes: {
            caught: "Handle error",
            rethrown: "Propagate error",
          },
          impact: "high",
          dataDepends: [],
          triggeredBy: entity.name,
        });
      }
    }

    return points;
  }

  /**
   * Classify condition type
   */
  private classifyConditionType(condition: string, entityName: string): DecisionPointType {
    // Check for validation
    if (VALIDATION_PATTERNS.some((p) => p.test(condition) || p.test(entityName))) {
      return "validation";
    }

    // Check for guard
    if (GUARD_PATTERNS.some((p) => p.test(condition))) {
      return "guard";
    }

    // Check for state mutation
    if (condition.includes("set") || condition.includes("update") || condition.includes("=")) {
      return "state_mutation";
    }

    // Check for API response handling
    if (condition.includes("response") || condition.includes("status") || condition.includes("error")) {
      return "api_response";
    }

    // Check for feature flag
    if (condition.includes("feature") || condition.includes("flag") || condition.includes("enabled")) {
      return "feature_flag";
    }

    // Default to guard for simple conditions
    return "guard";
  }

  /**
   * Build outcomes map from branch info
   */
  private buildOutcomes(branch: { condition: string; target?: string }): Record<string, string> {
    const outcomes: Record<string, string> = {};

    outcomes["true"] = branch.target || "continue";
    outcomes["false"] = "skip";

    // Parse condition for more specific outcomes
    if (branch.condition.includes("===") || branch.condition.includes("==")) {
      const parts = branch.condition.split(/===?/);
      if (parts.length === 2) {
        outcomes[`${parts[1]?.trim()}`] = branch.target || "match";
      }
    }

    return outcomes;
  }

  /**
   * Assess impact level of a decision point
   */
  private assessImpact(type: DecisionPointType, branch: { condition: string; target?: string }): ImpactLevel {
    // Critical impacts
    if (type === "validation" && branch.target === "throw") {
      return "critical";
    }
    if (type === "api_response" && branch.condition.includes("error")) {
      return "critical";
    }

    // High impacts
    if (type === "guard") {
      return "high";
    }
    if (type === "error_handling") {
      return "high";
    }

    // Medium impacts
    if (type === "state_mutation") {
      return "medium";
    }
    if (type === "feature_flag") {
      return "medium";
    }

    // Default
    return "low";
  }

  /**
   * Extract data dependencies from a condition
   */
  private extractDataDependencies(condition: string): string[] {
    if (!condition) return [];

    const deps: string[] = [];
    const varPattern = /\b([a-z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)\b/g;
    const keywords = new Set([
      "if",
      "else",
      "true",
      "false",
      "null",
      "undefined",
      "and",
      "or",
      "not",
      "in",
      "of",
      "typeof",
      "instanceof",
      "return",
      "throw",
      "new",
      "this",
      "super",
    ]);

    let match: RegExpExecArray | null;
    while ((match = varPattern.exec(condition)) !== null) {
      const word = match[1]!;
      if (!keywords.has(word) && !keywords.has(word.split(".")[0]!)) {
        deps.push(word);
      }
    }

    return [...new Set(deps)];
  }

  // ===========================================================================
  // 4. ANALYSIS HELPERS
  // ===========================================================================

  /**
   * Analyze conditions summary from paths
   */
  analyzeConditions(
    paths: { steps: Array<{ action: string; condition?: string; branches?: Record<string, string> }> }[],
  ): ConditionsSummary {
    let guards = 0;
    let branches = 0;
    const criticalConditions = new Set<string>();

    for (const path of paths) {
      for (const step of path.steps) {
        if (step.action === "condition") {
          branches++;

          if (step.branches) {
            const outcomes = Object.values(step.branches);
            if (outcomes.some((o) => o === "return" || o === "throw")) {
              guards++;
            }
          }

          if (step.condition) {
            criticalConditions.add(step.condition);
          }
        }

        if (step.action === "guard") {
          guards++;
        }
      }
    }

    return {
      guards,
      branches,
      criticalConditions: Array.from(criticalConditions),
    };
  }

  /**
   * Deduplicate decision points by location
   */
  private deduplicateDecisionPoints(points: DecisionPoint[]): DecisionPoint[] {
    const seen = new Map<string, DecisionPoint>();

    for (const point of points) {
      const key = `${point.location}:${point.condition || point.action}`;
      if (!seen.has(key)) {
        seen.set(key, point);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Sort decision points by criteria
   */
  private sortDecisionPoints(points: DecisionPoint[], groupBy: "impact" | "location" | "type"): DecisionPoint[] {
    const impactOrder: Record<ImpactLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    switch (groupBy) {
      case "impact":
        return points.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

      case "type":
        return points.sort((a, b) => a.type.localeCompare(b.type));
      default:
        return points.sort((a, b) => a.location.localeCompare(b.location));
    }
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(points: DecisionPoint[]): {
    totalDecisionPoints: number;
    criticalPoints: number;
    possibleOutcomes: number;
    statesModified: string[];
  } {
    let possibleOutcomes = 0;
    const statesModified = new Set<string>();

    for (const point of points) {
      possibleOutcomes += Object.keys(point.outcomes).length;

      if (point.type === "state_mutation" && point.dataDepends) {
        for (const dep of point.dataDepends) {
          statesModified.add(dep);
        }
      }
    }

    return {
      totalDecisionPoints: points.length,
      criticalPoints: points.filter((p) => p.impact === "critical").length,
      possibleOutcomes,
      statesModified: Array.from(statesModified),
    };
  }

  // ===========================================================================
  // 5. DIAGRAM GENERATION
  // ===========================================================================

  /**
   * Generate Mermaid flowchart for decision points
   */
  private generateFlowDiagram(points: DecisionPoint[], entryPoints: Entity[]): string {
    const lines: string[] = ["flowchart TD"];

    // Add entry points
    for (let i = 0; i < entryPoints.length; i++) {
      const entry = entryPoints[i]!;
      lines.push(`  E${i}[${this.sanitizeMermaidLabel(entry.name)}]`);
    }

    // Group points by triggeredBy
    const grouped = new Map<string, DecisionPoint[]>();
    for (const point of points) {
      const key = point.triggeredBy || "unknown";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(point);
    }

    // Add decision points
    let nodeIdx = 0;
    const nodeMap = new Map<string, string>();

    for (const [trigger, triggerPoints] of grouped) {
      // Add subgraph for this trigger
      lines.push(`  subgraph ${this.sanitizeMermaidLabel(trigger)}`);

      for (const point of triggerPoints) {
        const nodeId = `D${nodeIdx++}`;
        nodeMap.set(point.id, nodeId);

        // Shape based on type
        const shape = this.getNodeShape(point.type);
        const label = point.condition
          ? this.sanitizeMermaidLabel(point.condition.substring(0, 30))
          : point.action || point.type;

        lines.push(`    ${nodeId}${shape.open}${label}${shape.close}`);

        // Add outcomes as edges
        for (const [outcome, target] of Object.entries(point.outcomes)) {
          lines.push(`    ${nodeId} -->|${outcome}| ${nodeId}_${this.sanitizeMermaidLabel(target)}`);
        }
      }

      lines.push("  end");
    }

    // Connect entry points to first decisions
    for (let i = 0; i < entryPoints.length; i++) {
      const entryName = entryPoints[i]!.name;
      const firstPoint = grouped.get(entryName)?.[0];
      if (firstPoint) {
        const targetNode = nodeMap.get(firstPoint.id);
        if (targetNode) {
          lines.push(`  E${i} --> ${targetNode}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Get Mermaid node shape based on decision type
   */
  private getNodeShape(type: DecisionPointType): { open: string; close: string } {
    switch (type) {
      case "validation":
      case "guard":
        return { open: "{", close: "}" }; // Diamond

      case "error_handling":
        return { open: "[[", close: "]]" }; // Subroutine

      case "loop":
        return { open: "((", close: "))" }; // Circle

      case "state_mutation":
        return { open: "[/", close: "/]" }; // Parallelogram

      case "feature_flag":
        return { open: "{{", close: "}}" }; // Hexagon

      default:
        return { open: "[", close: "]" }; // Rectangle
    }
  }

  /**
   * Sanitize label for Mermaid
   */
  private sanitizeMermaidLabel(text: string): string {
    return text
      .replace(/["\n\r]/g, " ")
      .replace(/[{}[\]<>|]/g, "")
      .trim()
      .substring(0, 50);
  }

  // ===========================================================================
  // 6. CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Clear condition cache
   */
  clearCache(): void {
    this.decisionPointCache.clear();
  }
}

// =============================================================================
// 7. EXPORTS
// =============================================================================

export default ConditionAnalyzer;
