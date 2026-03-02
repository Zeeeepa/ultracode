import type { TaintAnalysisResult, TaintVulnerability } from "./types.js";

export class TaintFormatter {
  static formatAsText(result: TaintAnalysisResult): string {
    const lines = [
      `# Taint Analysis Report`,
      ``,
      `## Summary`,
      `- Total vulnerabilities: ${result.summary.totalVulnerabilities}`,
      `- Unsanitized flows: ${result.summary.unsanitizedFlows}`,
      `- Sanitized flows: ${result.summary.sanitizedFlows}`,
      `- Sources discovered: ${result.sources.length}`,
      `- Sinks discovered: ${result.sinks.length}`,
      `- Sanitizers discovered: ${result.sanitizers.length}`,
      ``,
      `### By Severity`,
    ];

    for (const [sev, count] of Object.entries(result.summary.bySeverity)) {
      if (count > 0) lines.push(`- ${sev}: ${count}`);
    }

    lines.push(``, `### By Category`);
    for (const [cat, count] of Object.entries(result.summary.byCategory)) {
      if (count && count > 0) lines.push(`- ${cat}: ${count}`);
    }

    if (result.vulnerabilities.length > 0) {
      lines.push(``, `## Vulnerabilities`);
      const unsanitized = result.vulnerabilities.filter((v) => !v.sanitized);
      const sanitized = result.vulnerabilities.filter((v) => v.sanitized);

      if (unsanitized.length > 0) {
        lines.push(``, `### Unsanitized (Action Required)`);
        for (const v of unsanitized.slice(0, 20)) {
          lines.push(TaintFormatter.formatVulnerability(v));
        }
        if (unsanitized.length > 20) {
          lines.push(`... and ${unsanitized.length - 20} more unsanitized flows`);
        }
      }

      if (sanitized.length > 0) {
        lines.push(``, `### Sanitized (Review Recommended)`);
        for (const v of sanitized.slice(0, 10)) {
          lines.push(TaintFormatter.formatVulnerability(v));
        }
        if (sanitized.length > 10) {
          lines.push(`... and ${sanitized.length - 10} more sanitized flows`);
        }
      }
    }

    return lines.join("\n");
  }

  static toSummary(result: TaintAnalysisResult): string {
    const critical = result.summary.bySeverity.critical;
    const high = result.summary.bySeverity.high;
    return `Taint: ${result.summary.totalVulnerabilities} flows (${critical} critical, ${high} high, ${result.summary.unsanitizedFlows} unsanitized)`;
  }

  static formatAsJSON(result: TaintAnalysisResult): string {
    return JSON.stringify(result, null, 2);
  }

  private static formatVulnerability(v: TaintVulnerability): string {
    const lines = [
      ``,
      `#### [${v.severity.toUpperCase()}] ${v.category} (confidence: ${Math.round(v.confidence * 100)}%)`,
      `- Source: \`${v.source.name}\` (${v.source.file}:${v.source.line}) — ${v.source.description}`,
      `- Sink: \`${v.sink.name}\` (${v.sink.file}:${v.sink.line}) — ${v.sink.sinkType}`,
      `- Flow (${v.flow.length} steps):`,
    ];

    for (const step of v.flow) {
      const icon = step.role === "source" ? "🔴" : step.role === "sink" ? "⚠️" : step.role === "sanitizer" ? "🛡️" : "→";
      lines.push(`  ${icon} ${step.name} (${step.file}:${step.line}) [${step.role}]`);
    }

    if (v.missingSanitizers.length > 0) {
      lines.push(`- Suggested fixes:`);
      for (const fix of v.missingSanitizers) {
        lines.push(`  - ${fix}`);
      }
    }

    return lines.join("\n");
  }
}
