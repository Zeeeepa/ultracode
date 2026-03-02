import type { BusFactorResult, CentralityResult, GraphMetricsResult, LouvainResult, PageRankResult } from "./types.js";

export class GraphMetricsFormatter {
  static formatAsText(result: GraphMetricsResult): string {
    switch (result.metric) {
      case "pagerank":
        return GraphMetricsFormatter.formatPageRank(result);
      case "louvain":
        return GraphMetricsFormatter.formatLouvain(result);
      case "centrality":
        return GraphMetricsFormatter.formatCentrality(result);
      case "bus_factor":
        return GraphMetricsFormatter.formatBusFactor(result);
    }
  }

  static toSummary(result: GraphMetricsResult): string {
    switch (result.metric) {
      case "pagerank":
        return `PageRank: ${result.entries.length} top entities of ${result.totalNodes} total (mean=${result.distribution.mean.toFixed(4)})`;
      case "louvain":
        return `Louvain: ${result.totalCommunities} communities detected (modularity=${result.modularity})`;
      case "centrality":
        return `Centrality: ${result.entries.length} top entities of ${result.totalNodes} total`;
      case "bus_factor":
        return `Bus Factor: ${result.overall.busFactor} (risk=${result.overall.riskLevel}, ${result.overall.totalAuthors} authors)`;
    }
  }

  static formatAsJSON(result: GraphMetricsResult): string {
    return JSON.stringify(result, null, 2);
  }

  private static formatPageRank(result: PageRankResult): string {
    const lines = [
      `# PageRank Analysis`,
      `Total nodes: ${result.totalNodes}`,
      `Distribution: mean=${result.distribution.mean.toFixed(6)}, median=${result.distribution.median.toFixed(6)}, max=${result.distribution.max.toFixed(6)}, stdDev=${result.distribution.stdDev.toFixed(6)}`,
      ``,
      `## Top Entities by PageRank`,
      `| # | Score | Name | Type | File | In° | Out° |`,
      `|---|-------|------|------|------|-----|------|`,
    ];

    for (let i = 0; i < result.entries.length; i++) {
      const e = result.entries[i]!;
      lines.push(
        `| ${i + 1} | ${e.score.toFixed(4)} | ${e.name} | ${e.type} | ${e.file} | ${e.inDegree} | ${e.outDegree} |`,
      );
    }

    return lines.join("\n");
  }

  private static formatLouvain(result: LouvainResult): string {
    const lines = [
      `# Louvain Community Detection`,
      `Total nodes: ${result.totalNodes}`,
      `Communities: ${result.totalCommunities}`,
      `Modularity: ${result.modularity}`,
      ``,
    ];

    const MAX_COMMUNITIES_TEXT = 20;
    const displayCommunities = result.communities.slice(0, MAX_COMMUNITIES_TEXT);

    for (const c of displayCommunities) {
      const totalEntities = c._totalEntities ?? c.size;
      lines.push(`## Community ${c.communityId} (${totalEntities} entities, cohesion=${c.cohesion})`);
      lines.push(`Main files: ${c.mainFiles.join(", ")}`);
      lines.push(`| Name | Type | File |`);
      lines.push(`|------|------|------|`);
      for (const e of c.entities.slice(0, 20)) {
        lines.push(`| ${e.name} | ${e.type} | ${e.file} |`);
      }
      if (totalEntities > 20) {
        lines.push(`... and ${totalEntities - Math.min(c.entities.length, 20)} more`);
      }
      lines.push(``);
    }

    if (result.communities.length > MAX_COMMUNITIES_TEXT) {
      lines.push(
        `... and ${result.communities.length - MAX_COMMUNITIES_TEXT} more communities (${result.totalCommunities} total)`,
      );
    }

    return lines.join("\n");
  }

  private static formatCentrality(result: CentralityResult): string {
    const lines = [
      `# Centrality Analysis`,
      `Total nodes: ${result.totalNodes}`,
      ``,
      `## Top Entities by Degree Centrality`,
      `| # | Total° | In° | Out° | Role | Name | Type | File |`,
      `|---|--------|-----|------|------|------|------|------|`,
    ];

    for (let i = 0; i < result.entries.length; i++) {
      const e = result.entries[i]!;
      lines.push(
        `| ${i + 1} | ${e.totalDegree} | ${e.inDegree} | ${e.outDegree} | ${e.role} | ${e.name} | ${e.type} | ${e.file} |`,
      );
    }

    return lines.join("\n");
  }

  private static formatBusFactor(result: BusFactorResult): string {
    const lines = [
      `# Bus Factor Analysis`,
      `Overall bus factor: ${result.overall.busFactor} (${result.overall.riskLevel})`,
      `Total authors: ${result.overall.totalAuthors}`,
      ``,
      `## Top Authors`,
      `| Name | Files | % |`,
      `|------|-------|---|`,
    ];

    for (const a of result.overall.topAuthors) {
      lines.push(`| ${a.name} | ${a.filesContributed} | ${a.percentage}% |`);
    }

    lines.push(``, `## High Risk Files (bus factor ≤ 2)`);
    lines.push(`| File | Bus Factor | Risk | Top Author |`);
    lines.push(`|------|-----------|------|------------|`);

    for (const f of result.byFile.filter((f) => f.busFactor <= 2).slice(0, 20)) {
      const top = f.authors[0];
      lines.push(`| ${f.file} | ${f.busFactor} | ${f.riskLevel} | ${top?.name ?? "?"} (${top?.percentage ?? 0}%) |`);
    }

    lines.push(``, `## Modules`);
    lines.push(`| Module | Bus Factor | Risk |`);
    lines.push(`|--------|-----------|------|`);

    for (const m of result.byModule) {
      lines.push(`| ${m.module} | ${m.busFactor} | ${m.riskLevel} |`);
    }

    return lines.join("\n");
  }
}
