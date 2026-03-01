/**
 * Pattern Formatter — Format PatternScanResult for MCP output
 */

import type { PatternMatch, PatternScanResult } from "./types.js";

export class PatternFormatter {
  /**
   * Format scan result based on output format
   */
  static format(result: PatternScanResult, format: "summary" | "detailed" | "json" = "summary"): string {
    if (format === "json") {
      return JSON.stringify(result, null, 2);
    }

    if (format === "detailed") {
      return PatternFormatter.formatDetailed(result);
    }

    return PatternFormatter.formatSummary(result);
  }

  private static formatSummary(result: PatternScanResult): string {
    const { summary } = result;
    const lines: string[] = [];

    lines.push(`## Pattern Scan Summary`);
    lines.push(`- Entities scanned: ${summary.totalEntitiesScanned}`);
    lines.push(`- Health score: ${summary.healthScore}/100`);
    lines.push(``);

    if (summary.antiPatternCount > 0) {
      lines.push(`### Anti-patterns: ${summary.antiPatternCount}`);
      for (const m of result.antiPatterns.slice(0, 10)) {
        lines.push(
          `  - **${m.pattern.name}** in \`${m.entityName}\` (${m.filePath}:${m.line}) — score: ${m.combinedScore.toFixed(2)}`,
        );
      }
      lines.push(``);
    }

    if (summary.codeSmellCount > 0) {
      lines.push(`### Code smells: ${summary.codeSmellCount}`);
      for (const m of result.codeSmells.slice(0, 10)) {
        lines.push(
          `  - **${m.pattern.name}** in \`${m.entityName}\` (${m.filePath}:${m.line}) — score: ${m.combinedScore.toFixed(2)}`,
        );
      }
      lines.push(``);
    }

    if (summary.optimizationCount > 0) {
      lines.push(`### Optimizations: ${summary.optimizationCount}`);
      for (const m of result.optimizations.slice(0, 10)) {
        const bigO = m.pattern.bigO ? ` [${m.pattern.bigO.before} → ${m.pattern.bigO.after}]` : "";
        const bench = m.pattern.benchmark ? ` (${m.pattern.benchmark})` : "";
        lines.push(`  - **${m.pattern.name}**${bigO}${bench} in \`${m.entityName}\` (${m.filePath}:${m.line})`);
      }
      lines.push(``);
    }

    if (summary.bestPatternCount > 0) {
      lines.push(`### Best patterns: ${summary.bestPatternCount}`);
      for (const m of result.bestPatterns.slice(0, 5)) {
        lines.push(`  - **${m.pattern.name}** in \`${m.entityName}\` (${m.filePath}:${m.line})`);
      }
      lines.push(``);
    }

    if (summary.topIssues.length > 0) {
      lines.push(`### Top Issues`);
      for (const issue of summary.topIssues.slice(0, 5)) {
        lines.push(`  - \`${issue.patternId}\` — ${issue.count} occurrence(s), severity: ${issue.severity}`);
      }
    }

    return lines.join("\n");
  }

  private static formatDetailed(result: PatternScanResult): string {
    const all: PatternMatch[] = [
      ...result.antiPatterns,
      ...result.codeSmells,
      ...result.optimizations,
      ...result.bestPatterns,
    ];

    const lines: string[] = [];
    lines.push(`## Pattern Scan — Detailed (${all.length} matches, health: ${result.summary.healthScore}/100)`);
    lines.push(``);

    for (const m of all) {
      const icon =
        m.pattern.category === "anti-pattern"
          ? "🔴"
          : m.pattern.category === "code-smell"
            ? "🟡"
            : m.pattern.category === "optimization"
              ? "⚡"
              : "🟢";

      lines.push(`### ${icon} ${m.pattern.name} [\`${m.patternId}\`]`);
      lines.push(`- **Category**: ${m.pattern.category} | **Severity**: ${m.pattern.severity}`);
      lines.push(`- **Entity**: \`${m.entityName}\` (${m.entityType}) at ${m.filePath}:${m.line}`);
      lines.push(
        `- **Score**: combined=${m.combinedScore.toFixed(2)}, structural=${m.structuralConfidence.toFixed(2)}, semantic=${m.semanticSimilarity.toFixed(2)}`,
      );
      lines.push(`- **Description**: ${m.pattern.description}`);
      lines.push(`- **Suggestion**: ${m.pattern.suggestion}`);

      if (m.pattern.bigO) {
        lines.push(`- **Complexity**: ${m.pattern.bigO.before} → ${m.pattern.bigO.after}`);
      }
      if (m.pattern.benchmark) {
        lines.push(`- **Benchmark**: ${m.pattern.benchmark}`);
      }
      if (m.closestExemplar) {
        lines.push(
          `- **Closest exemplar**: ${m.closestExemplar.id} (similarity: ${m.closestExemplar.similarity.toFixed(2)}) — ${m.closestExemplar.description}`,
        );
      }
      if (m.matchedCriteria.length > 0) {
        lines.push(`- **Matched criteria**: ${m.matchedCriteria.join(", ")}`);
      }
      lines.push(``);
    }

    return lines.join("\n");
  }

  /**
   * Format for JSON API response (used by MCP handlers)
   */
  static toJSON(result: PatternScanResult): Record<string, unknown> {
    return {
      summary: result.summary,
      antiPatterns: result.antiPatterns.map(PatternFormatter.matchToJSON),
      bestPatterns: result.bestPatterns.map(PatternFormatter.matchToJSON),
      codeSmells: result.codeSmells.map(PatternFormatter.matchToJSON),
      optimizations: result.optimizations.map(PatternFormatter.matchToJSON),
    };
  }

  private static matchToJSON(m: PatternMatch): Record<string, unknown> {
    return {
      patternId: m.patternId,
      category: m.pattern.category,
      severity: m.pattern.severity,
      name: m.pattern.name,
      description: m.pattern.description,
      suggestion: m.pattern.suggestion,
      bigO: m.pattern.bigO,
      benchmark: m.pattern.benchmark,
      entityId: m.entityId,
      entityName: m.entityName,
      entityType: m.entityType,
      filePath: m.filePath,
      line: m.line,
      combinedScore: Number(m.combinedScore.toFixed(3)),
      structuralConfidence: Number(m.structuralConfidence.toFixed(3)),
      semanticSimilarity: Number(m.semanticSimilarity.toFixed(3)),
      matchedCriteria: m.matchedCriteria,
      closestExemplar: m.closestExemplar,
    };
  }
}
