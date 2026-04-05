/**
 * Output Formatter for Semantic Tracing
 *
 * Generates various output formats: text, Mermaid, JSON.
 * Provides human-readable summaries and visualizations.
 *
 * Architecture References:
 * - Tracing Types: src/tracing/types.ts
 */

import type {
  AnalyzeStateImpactResult,
  FindDecisionPointsResult,
  TraceBackwardsResult,
  TraceDataFlowResult,
  TraceFlowResult,
  TraceStep,
} from "./types.js";

// =============================================================================
// 1. OUTPUT FORMATTER CLASS
// =============================================================================

export class OutputFormatter {
  // ===========================================================================
  // 2. TRACE FLOW FORMATTING
  // ===========================================================================

  /**
   * Format trace flow result as text
   */
  formatTraceFlowAsText(result: TraceFlowResult & { _debug?: unknown }): string {
    const lines: string[] = [];

    lines.push(`═══ Trace Flow: ${result.from} → ${result.to} ═══`);
    lines.push("");

    if (result.paths.length === 0) {
      lines.push("❌ No paths found between these points.");
      // Add debug info if available
      if (result._debug && typeof result._debug === "object") {
        const debug = result._debug as Record<string, unknown>;
        lines.push("");
        lines.push("--- Debug Info ---");
        lines.push(`Source: ${debug["sourceEntityName"]} (${debug["sourceEntityId"]})`);
        lines.push(`Target: ${debug["targetEntityName"]} (${debug["targetEntityId"]})`);
        const graphStats = debug["graphStats"] as { nodes?: number; edges?: number } | undefined;
        lines.push(`Graph: ${graphStats?.nodes} nodes, ${graphStats?.edges} edges`);
        lines.push(`Linear trace: ${debug["linearTraceSummary"]}`);
        lines.push(`Nodes visited: ${debug["nodesVisited"]}`);
      }
      return lines.join("\n");
    }

    lines.push(`Found ${result.paths.length} path(s):`);
    lines.push("");

    for (let i = 0; i < result.paths.length; i++) {
      const path = result.paths[i]!;
      lines.push(`─── Path ${i + 1} (confidence: ${Math.round(path.confidence * 100)}%) ───`);
      lines.push(`Summary: ${path.summary}`);
      lines.push("");

      for (const step of path.steps) {
        const stepLine = this.formatStep(step);
        lines.push(stepLine);
      }

      if (path.warnings && path.warnings.length > 0) {
        lines.push("");
        lines.push("⚠️ Warnings:");
        for (const warning of path.warnings) {
          lines.push(`  • ${warning}`);
        }
      }

      lines.push("");
    }

    // States summary
    if (result.statesSummary.modified.length > 0 || result.statesSummary.read.length > 0) {
      lines.push("─── States ───");
      if (result.statesSummary.modified.length > 0) {
        lines.push(`Modified: ${result.statesSummary.modified.join(", ")}`);
      }
      if (result.statesSummary.read.length > 0) {
        lines.push(`Read: ${result.statesSummary.read.join(", ")}`);
      }
      if (result.statesSummary.critical.length > 0) {
        lines.push(`Critical: ${result.statesSummary.critical.join(", ")}`);
      }
      lines.push("");
    }

    // Conditions summary
    if (result.conditionsSummary.branches > 0) {
      lines.push("─── Conditions ───");
      lines.push(`Guards: ${result.conditionsSummary.guards}`);
      lines.push(`Branches: ${result.conditionsSummary.branches}`);
      if (result.conditionsSummary.criticalConditions.length > 0) {
        lines.push(`Critical: ${result.conditionsSummary.criticalConditions.join("; ")}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Format a single step
   */
  private formatStep(step: TraceStep): string {
    const prefix = `  ${step.order}. `;
    const icon = this.getStepIcon(step.action);
    let line = `${prefix}${icon} ${step.entity}`;

    line += ` (${step.file}:${step.line})`;

    if (step.condition) {
      line += `\n     └─ if: ${step.condition}`;
    }

    if (step.awaits) {
      line += `\n     └─ await: ${step.awaitTarget || "async"}`;
    }

    if (step.stateChanges && step.stateChanges.length > 0) {
      for (const change of step.stateChanges) {
        line += `\n     └─ ${change.variable}`;
        if (change.from && change.to) {
          line += `: ${change.from} → ${change.to}`;
        }
      }
    }

    // Enclosing conditions (innermost→outermost)
    if (step.conditions && step.conditions.length > 0) {
      for (const cond of step.conditions) {
        line += `\n     ◇ ${cond}`;
      }
    }

    // Hypothesis preconditions
    if (step.preconditions && step.preconditions.length > 0) {
      for (const pre of step.preconditions) {
        line += `\n     ❓ ${pre}`;
      }
    }

    return line;
  }

  /**
   * Get icon for step action
   */
  private getStepIcon(action: string): string {
    const icons: Record<string, string> = {
      call: "→",
      condition: "◇",
      setState: "●",
      await: "⏳",
      return: "↩",
      throw: "⚡",
      loop: "↻",
      guard: "🛡",
    };
    return icons[action] || "•";
  }

  /**
   * Format trace flow as Mermaid sequence diagram
   */
  formatTraceFlowAsMermaid(result: TraceFlowResult): string {
    if (result.mermaid) {
      return result.mermaid;
    }

    const lines: string[] = ["sequenceDiagram"];

    // Collect unique participants
    const participants = new Set<string>();
    for (const path of result.paths) {
      for (const step of path.steps) {
        participants.add(step.entity);
      }
    }

    // Add participants
    let idx = 0;
    const participantIds = new Map<string, string>();
    for (const p of participants) {
      const id = `P${idx++}`;
      participantIds.set(p, id);
      lines.push(`  participant ${id} as ${this.sanitize(p)}`);
    }

    // Add flows for top paths
    for (let i = 0; i < Math.min(result.paths.length, 2); i++) {
      const path = result.paths[i]!;
      lines.push(`  Note right of P0: Path ${i + 1}`);

      for (let j = 0; j < path.steps.length - 1; j++) {
        const from = path.steps[j]!;
        const to = path.steps[j + 1]!;
        const fromId = participantIds.get(from.entity) || "P0";
        const toId = participantIds.get(to.entity) || "P0";

        // Dashed arrow for hypothesis steps, solid for normal
        const isHypothesis = from.preconditions?.some((p) => p.startsWith("?"));
        const arrow = isHypothesis ? "-->>" : from.awaits ? "-->>" : "->>";
        const label = from.condition || from.action;
        lines.push(`  ${fromId}${arrow}${toId}: ${this.sanitize(label)}`);
        // Show hypothesis evidence as Note
        if (isHypothesis && from.preconditions) {
          lines.push(`  Note right of ${toId}: ${this.sanitize(from.preconditions[0] || "hypothesis")}`);
        }
      }
    }

    return lines.join("\n");
  }

  // ===========================================================================
  // 3. TRACE BACKWARDS FORMATTING
  // ===========================================================================

  /**
   * Format trace backwards result as text
   */
  formatTraceBackwardsAsText(result: TraceBackwardsResult): string {
    const lines: string[] = [];

    lines.push(`═══ Trace Backwards: ${result.target.name} ═══`);
    lines.push(`Location: ${result.target.file}`);
    lines.push(`Signature: ${result.target.signature}`);
    lines.push("");

    // Callers
    lines.push(`─── Callers (${result.callers.length}) ───`);
    if (result.callers.length === 0) {
      lines.push("❌ No callers found - this may be dead code");
    } else {
      for (const caller of result.callers) {
        const prob = this.getProbabilityIcon(caller.probability);
        lines.push(`  ${prob} ${caller.name} (${caller.file}:${caller.line})`);
        if (caller.condition) {
          lines.push(`     └─ when: ${caller.condition}`);
        }
      }
    }
    lines.push("");

    // Blocking conditions
    if (result.blockingConditions.length > 0) {
      lines.push(`─── Blocking Conditions (${result.blockingConditions.length}) ───`);
      for (const block of result.blockingConditions) {
        lines.push(`  ⛔ ${block.condition}`);
        lines.push(`     Location: ${block.location}`);
        lines.push(`     Recommendation: ${block.recommendation}`);
      }
      lines.push("");
    }

    // State dependencies
    if (result.statesDependencies.length > 0) {
      lines.push(`─── State Dependencies (${result.statesDependencies.length}) ───`);
      for (const dep of result.statesDependencies) {
        lines.push(`  📊 ${dep.state} (${dep.stateType || "unknown"})`);
        if (dep.modifiedBy.length > 0) {
          lines.push(`     Modified by: ${dep.modifiedBy.join(", ")}`);
        } else {
          lines.push(`     ⚠️ No known modifiers`);
        }
        if (dep.requiredValue) {
          lines.push(`     Required: ${dep.requiredValue}`);
        }
      }
      lines.push("");
    }

    // Call chains
    if (result.callChains.length > 0) {
      lines.push(`─── Call Chains (${result.callChains.length}) ───`);
      for (let i = 0; i < result.callChains.length; i++) {
        const chain = result.callChains[i]!;
        const likelihood = this.getLikelihoodIcon(chain.likelihood);
        lines.push(`  ${i + 1}. ${likelihood} ${chain.chain.join(" → ")}`);
        if (chain.guards.length > 0) {
          lines.push(`     Guards: ${chain.guards.join("; ")}`);
        }
        if (chain.entryPoint) {
          lines.push(`     Entry: ${chain.entryPoint}`);
        }
      }
      lines.push("");
    }

    // Diagnosis
    lines.push("─── Diagnosis ───");
    if (result.diagnosis.mostLikely) {
      lines.push(`🎯 Most likely: ${result.diagnosis.mostLikely}`);
    }
    if (result.diagnosis.possibleReasons.length > 0) {
      lines.push("Possible reasons:");
      for (const reason of result.diagnosis.possibleReasons) {
        lines.push(`  • ${reason}`);
      }
    }
    if (result.diagnosis.suggestedDebugPoints.length > 0) {
      lines.push("Debug points:");
      for (const point of result.diagnosis.suggestedDebugPoints) {
        lines.push(`  🔍 ${point}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get icon for call probability
   */
  private getProbabilityIcon(prob: string): string {
    switch (prob) {
      case "always":
        return "✅";
      case "conditional":
        return "❓";
      case "rare":
        return "⚠️";
      default:
        return "•";
    }
  }

  /**
   * Get icon for likelihood
   */
  private getLikelihoodIcon(likelihood: string): string {
    switch (likelihood) {
      case "high":
        return "🟢";
      case "medium":
        return "🟡";
      case "low":
        return "🔴";
      default:
        return "⚪";
    }
  }

  // ===========================================================================
  // 4. DATA FLOW FORMATTING
  // ===========================================================================

  /**
   * Format data flow result as text
   */
  formatDataFlowAsText(result: TraceDataFlowResult): string {
    const lines: string[] = [];

    lines.push(`═══ Data Flow: ${result.entryPoint} → ${result.targetState} ═══`);
    lines.push("");
    lines.push(`Data sources analyzed: ${result.summary.dataSourcesAnalyzed}`);
    lines.push(`Branching points: ${result.summary.branchingPoints}`);
    lines.push(`Possible outcomes: ${result.summary.possibleOutcomes}`);
    lines.push("");

    // Data flows
    for (let i = 0; i < result.dataFlows.length; i++) {
      const flow = result.dataFlows[i]!;
      const affects = flow.affectsTarget ? "✅" : "❌";
      lines.push(`─── Flow ${i + 1}: ${flow.source} ${affects} ───`);

      for (const step of flow.flow) {
        const icon = this.getDataFlowIcon(step.action);
        let line = `  ${step.step}. ${icon} ${step.action}`;

        if (step.input && step.output) {
          line += `: ${step.input} → ${step.output}`;
        }

        if (step.transformation) {
          line += ` [${step.transformation}]`;
        }

        lines.push(line);

        if (step.condition) {
          lines.push(`     └─ if: ${step.condition}`);
        }
      }

      if (flow.criticalConditions.length > 0) {
        lines.push(`  Critical: ${flow.criticalConditions.join("; ")}`);
      }

      lines.push("");
    }

    // Behavior matrix
    if (result.behaviorMatrix.combinations.length > 0) {
      lines.push("─── Behavior Matrix ───");
      for (const combo of result.behaviorMatrix.combinations.slice(0, 8)) {
        const inputs = Object.entries(combo.inputs)
          .map(([k, v]) => `${k.split(":").pop()}=${v}`)
          .join(", ");
        const outputs = Object.entries(combo.result)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        lines.push(`  ${inputs} → ${outputs}`);
      }
      if (result.behaviorMatrix.combinations.length > 8) {
        lines.push(`  ... and ${result.behaviorMatrix.combinations.length - 8} more combinations`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get icon for data flow action
   */
  private getDataFlowIcon(action: string): string {
    const icons: Record<string, string> = {
      parse: "📥",
      transform: "🔄",
      branch: "◇",
      setState: "💾",
      fetch: "🌐",
      validate: "✓",
      emit: "📤",
    };
    return icons[action] || "•";
  }

  // ===========================================================================
  // 5. STATE IMPACT FORMATTING
  // ===========================================================================

  /**
   * Format state impact result as text
   */
  formatStateImpactAsText(result: AnalyzeStateImpactResult): string {
    const lines: string[] = [];

    lines.push(`═══ State Impact: ${result.state} ═══`);
    lines.push("");

    // Usages
    lines.push(`─── Usages (${result.usages.length}) ───`);
    const usagesByType = this.groupBy(result.usages, "usage");
    for (const [type, usages] of Object.entries(usagesByType)) {
      lines.push(`  ${type}: ${usages.length}`);
      for (const usage of usages.slice(0, 3)) {
        lines.push(`    • ${usage.entityName || usage.location}`);
      }
      if (usages.length > 3) {
        lines.push(`    ... and ${usages.length - 3} more`);
      }
    }
    lines.push("");

    // Scenarios
    lines.push("─── Scenario Analysis ───");
    for (const [label, analysis] of Object.entries(result.scenarioAnalysis)) {
      lines.push(`  ${label}:`);
      lines.push(`    Reachable: ${analysis.reachablePaths.length} paths`);
      lines.push(`    Blocked: ${analysis.blockedPaths.length} paths`);
      if (analysis.enabledFeatures.length > 0) {
        lines.push(`    Features: ${analysis.enabledFeatures.join(", ")}`);
      }
    }
    lines.push("");

    // Conflicts
    if (result.conflicts.length > 0) {
      lines.push(`─── Conflicts (${result.conflicts.length}) ───`);
      for (const conflict of result.conflicts) {
        lines.push(`  ⚠️ ${conflict.description}`);
        lines.push(`     Risk: ${conflict.risk}`);
        lines.push(`     Fix: ${conflict.recommendation}`);
      }
      lines.push("");
    }

    // Ripple effects
    lines.push("─── Ripple Effects ───");
    lines.push(`  Direct: ${result.rippleEffects.directEffects} components`);
    lines.push(`  Indirect: ${result.rippleEffects.indirectEffects} dependencies`);
    if (result.rippleEffects.affectedComponents.length > 0) {
      lines.push(`  Components: ${result.rippleEffects.affectedComponents.join(", ")}`);
    }

    return lines.join("\n");
  }

  // ===========================================================================
  // 6. DECISION POINTS FORMATTING
  // ===========================================================================

  /**
   * Format decision points result as text
   */
  formatDecisionPointsAsText(result: FindDecisionPointsResult): string {
    const lines: string[] = [];

    lines.push(`═══ Decision Points: ${result.scenario} ═══`);
    lines.push("");
    lines.push(`Entry points: ${result.entryPoints.map((e) => e.name).join(", ")}`);
    lines.push(`Total: ${result.summary.totalDecisionPoints} | Critical: ${result.summary.criticalPoints}`);
    lines.push(`Possible outcomes: ${result.summary.possibleOutcomes}`);
    lines.push("");

    // Group by type
    const byType = this.groupBy(result.decisionPoints, "type");

    for (const [type, points] of Object.entries(byType)) {
      lines.push(`─── ${type.toUpperCase()} (${points.length}) ───`);

      for (const point of points) {
        const impact = this.getImpactIcon(point.impact);
        lines.push(`  ${impact} ${point.condition || point.action || point.type}`);
        lines.push(`     Location: ${point.location}`);
        lines.push(`     Outcomes: ${Object.keys(point.outcomes).join(", ")}`);
        if (point.dataDepends.length > 0) {
          lines.push(`     Depends on: ${point.dataDepends.join(", ")}`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Get icon for impact level
   */
  private getImpactIcon(impact: string): string {
    switch (impact) {
      case "critical":
        return "🔴";
      case "high":
        return "🟠";
      case "medium":
        return "🟡";
      case "low":
        return "🟢";
      default:
        return "⚪";
    }
  }

  // ===========================================================================
  // 7. UTILITY METHODS
  // ===========================================================================

  /**
   * Sanitize string for Mermaid
   */
  private sanitize(text: string): string {
    return text
      .replace(/["\n\r]/g, " ")
      .replace(/[{}[\]<>|]/g, "")
      .trim()
      .substring(0, 40);
  }

  /**
   * Group array by property
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce(
      (groups, item) => {
        const value = String(item[key]);
        if (!groups[value]) {
          groups[value] = [];
        }
        groups[value]!.push(item);
        return groups;
      },
      {} as Record<string, T[]>,
    );
  }
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

export default OutputFormatter;
