import type Graph from "graphology";
import { log } from "../../logging/index.js";
import type { GraphEdgeAttributes, GraphNodeAttributes } from "../../tracing/graphology-path-builder.js";
import { GraphologyPathBuilder } from "../../tracing/graphology-path-builder.js";
import type { GraphStorage } from "../../types/storage.js";
import type {
  BusFactorFileEntry,
  BusFactorModuleEntry,
  BusFactorResult,
  BusFactorRiskLevel,
  CentralityEntry,
  CentralityResult,
  CentralityRole,
  GraphMetricsParams,
  GraphMetricsResult,
  LouvainCommunity,
  LouvainResult,
  PageRankEntry,
  PageRankResult,
} from "./types.js";

interface CacheEntry {
  result: GraphMetricsResult;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GraphMetricsAnalyzer {
  private pathBuilder: GraphologyPathBuilder;
  private storage: GraphStorage;
  private cache = new Map<string, CacheEntry>();

  constructor(storage: GraphStorage) {
    this.storage = storage;
    this.pathBuilder = new GraphologyPathBuilder(storage);
  }

  async analyze(params: GraphMetricsParams): Promise<GraphMetricsResult> {
    const cacheKey = `${params.metric}:${params.topN ?? ""}:${params.minCommunitySize ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }

    await this.pathBuilder.loadGraph();
    const graph = this.pathBuilder.getGraph();

    let result: GraphMetricsResult;

    switch (params.metric) {
      case "pagerank":
        result = await this.computePageRank(graph, params.topN ?? 20);
        break;
      case "louvain":
        result = await this.computeLouvain(graph, params.minCommunitySize ?? 2);
        break;
      case "centrality":
        result = await this.computeCentrality(graph, params.topN ?? 20);
        break;
      case "bus_factor":
        result = await this.computeBusFactor(params.projectPath ?? ".");
        break;
    }

    if (params.persist && (params.metric === "pagerank" || params.metric === "louvain")) {
      await this.persistToEntityMetadata(result);
    }

    this.cache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  private async computePageRank(
    graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>,
    topN: number,
  ): Promise<PageRankResult> {
    const { default: pagerank } = await import("graphology-metrics/centrality/pagerank");

    const scores = pagerank(graph, {
      getEdgeWeight: "weight",
      alpha: 0.85,
      maxIterations: 100,
      tolerance: 1e-6,
    });

    const entries: PageRankEntry[] = [];
    for (const [nodeId, score] of Object.entries(scores)) {
      const attrs = graph.getNodeAttributes(nodeId);
      entries.push({
        entityId: nodeId,
        name: attrs.name,
        file: attrs.file,
        type: attrs.type,
        score,
        inDegree: graph.inDegree(nodeId),
        outDegree: graph.outDegree(nodeId),
      });
    }

    entries.sort((a, b) => b.score - a.score);

    const allScores = entries.map((e) => e.score);
    const mean = allScores.reduce((s, v) => s + v, 0) / (allScores.length || 1);
    const sorted = [...allScores].sort((a, b) => a - b);
    const median = sorted.length > 0 ? (sorted[Math.floor(sorted.length / 2)] ?? 0) : 0;
    const max = sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0;
    const variance = allScores.reduce((s, v) => s + (v - mean) ** 2, 0) / (allScores.length || 1);
    const stdDev = Math.sqrt(variance);

    return {
      metric: "pagerank",
      entries: entries.slice(0, topN),
      distribution: { mean, median, max, stdDev },
      totalNodes: graph.order,
    };
  }

  private async computeLouvain(
    graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>,
    minSize: number,
  ): Promise<LouvainResult> {
    const { default: louvain } = await import("graphology-communities-louvain");
    const { toUndirected } = await import("graphology-operators");

    // Louvain requires undirected graph
    const undirected = toUndirected(graph);

    const detailed = louvain.detailed(undirected, {
      getEdgeWeight: "weight",
      resolution: 1.0,
    });

    // Group nodes by community
    const communityMap = new Map<number, Array<{ entityId: string; name: string; file: string; type: string }>>();

    for (const [nodeId, communityId] of Object.entries(detailed.communities)) {
      if (!communityMap.has(communityId)) {
        communityMap.set(communityId, []);
      }
      const attrs = graph.getNodeAttributes(nodeId);
      communityMap.get(communityId)!.push({
        entityId: nodeId,
        name: attrs.name,
        file: attrs.file,
        type: attrs.type,
      });
    }

    const communities: LouvainCommunity[] = [];
    for (const [communityId, entities] of communityMap) {
      if (entities.length < minSize) continue;

      const fileCounts = new Map<string, number>();
      for (const e of entities) {
        fileCounts.set(e.file, (fileCounts.get(e.file) ?? 0) + 1);
      }
      const mainFiles = [...fileCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([f]) => f);

      // Cohesion: ratio of internal edges to total possible
      const entityIds = new Set(entities.map((e) => e.entityId));
      let internalEdges = 0;
      for (const eid of entityIds) {
        if (!graph.hasNode(eid)) continue;
        for (const neighbor of graph.outNeighbors(eid)) {
          if (entityIds.has(neighbor)) internalEdges++;
        }
      }
      const possibleEdges = entities.length * (entities.length - 1);
      const cohesion = possibleEdges > 0 ? internalEdges / possibleEdges : 0;

      communities.push({
        communityId,
        entities,
        size: entities.length,
        mainFiles,
        cohesion: Math.round(cohesion * 1000) / 1000,
      });
    }

    communities.sort((a, b) => b.size - a.size);

    const MAX_COMMUNITIES = 30;
    const MAX_ENTITIES_PER_COMMUNITY = 20;

    const totalCommunitiesBeforeLimit = communities.length;
    const limitedCommunities = communities.slice(0, MAX_COMMUNITIES).map((c) => {
      const totalEntitiesInCommunity = c.entities.length;
      return {
        ...c,
        entities: c.entities.slice(0, MAX_ENTITIES_PER_COMMUNITY),
        _totalEntities: totalEntitiesInCommunity,
      };
    });

    return {
      metric: "louvain",
      communities: limitedCommunities,
      modularity: Math.round(detailed.modularity * 1000) / 1000,
      totalCommunities: totalCommunitiesBeforeLimit,
      totalNodes: graph.order,
    };
  }

  private async computeCentrality(
    graph: Graph<GraphNodeAttributes, GraphEdgeAttributes>,
    topN: number,
  ): Promise<CentralityResult> {
    const entries: CentralityEntry[] = [];

    graph.forEachNode((nodeId, attrs) => {
      const inDeg = graph.inDegree(nodeId);
      const outDeg = graph.outDegree(nodeId);
      const totalDegree = inDeg + outDeg;

      let role: CentralityRole;
      if (inDeg === 0 && outDeg === 0) {
        role = "leaf";
      } else if (outDeg > inDeg * 2) {
        role = "hub"; // mostly calls others
      } else if (inDeg > outDeg * 2) {
        role = "authority"; // mostly called by others
      } else {
        role = "bridge"; // balanced in/out
      }

      entries.push({
        entityId: nodeId,
        name: attrs.name,
        file: attrs.file,
        type: attrs.type,
        inDegree: inDeg,
        outDegree: outDeg,
        totalDegree,
        role,
      });
    });

    entries.sort((a, b) => b.totalDegree - a.totalDegree);

    return {
      metric: "centrality",
      entries: entries.slice(0, topN),
      totalNodes: graph.order,
    };
  }

  private async computeBusFactor(projectPath: string): Promise<BusFactorResult> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    let gitOutput: string;
    try {
      const { stdout } = await execAsync('git log --format="%aN\t%aE" --numstat --no-merges -n 500', {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      gitOutput = stdout;
    } catch {
      log.w("GRAPHMETRICS", "git_log_failed", { projectPath });
      return {
        metric: "bus_factor",
        overall: { busFactor: 0, riskLevel: "low", totalAuthors: 0, topAuthors: [] },
        byFile: [],
        byModule: [],
      };
    }

    // Parse git log output
    const fileAuthors = new Map<string, Map<string, { name: string; email: string; lines: number }>>();
    let currentAuthor = { name: "", email: "" };

    for (const line of gitOutput.split("\n")) {
      const authorMatch = line.match(/^(.+)\t(.+)$/);
      if (authorMatch?.[1] && authorMatch[2] && !line.match(/^\d/)) {
        currentAuthor = { name: authorMatch[1], email: authorMatch[2] };
        continue;
      }

      const statMatch = line.match(/^(\d+)\t(\d+)\t(.+)$/);
      if (statMatch?.[1] && statMatch[2] && statMatch[3] && currentAuthor.name) {
        const added = parseInt(statMatch[1], 10);
        const deleted = parseInt(statMatch[2], 10);
        const file = statMatch[3];
        const lines = added + deleted;

        if (!fileAuthors.has(file)) {
          fileAuthors.set(file, new Map());
        }
        const authorMap = fileAuthors.get(file)!;
        const key = `${currentAuthor.name}<${currentAuthor.email}>`;
        const existing = authorMap.get(key) ?? { ...currentAuthor, lines: 0 };
        existing.lines += lines;
        authorMap.set(key, existing);
      }
    }

    // Build byFile
    const byFile: BusFactorFileEntry[] = [];
    const allAuthors = new Map<string, { name: string; email: string; files: Set<string> }>();

    for (const [file, authorMap] of fileAuthors) {
      const authors = [...authorMap.values()].sort((a, b) => b.lines - a.lines);
      const totalLines = authors.reduce((s, a) => s + a.lines, 0);

      const authorsWithPct = authors.map((a) => ({
        name: a.name,
        email: a.email,
        linesChanged: a.lines,
        percentage: Math.round((a.lines / (totalLines || 1)) * 100),
      }));

      // Bus factor: how many authors contribute 80% of changes
      let cumulative = 0;
      let busFactor = 0;
      for (const a of authorsWithPct) {
        cumulative += a.percentage;
        busFactor++;
        if (cumulative >= 80) break;
      }

      byFile.push({
        file,
        authors: authorsWithPct.slice(0, 5),
        busFactor,
        riskLevel: this.getBusFactorRisk(busFactor),
      });

      for (const a of authors) {
        const key = `${a.name}<${a.email}>`;
        if (!allAuthors.has(key)) {
          allAuthors.set(key, { name: a.name, email: a.email, files: new Set() });
        }
        allAuthors.get(key)!.files.add(file);
      }
    }

    byFile.sort((a, b) => a.busFactor - b.busFactor);

    // Build byModule (group by directory)
    const moduleMap = new Map<string, Map<string, { name: string; email: string; files: Set<string> }>>();
    for (const [file, authorMap] of fileAuthors) {
      const module = file.includes("/") ? file.split("/").slice(0, 2).join("/") : ".";
      if (!moduleMap.has(module)) {
        moduleMap.set(module, new Map());
      }
      const modAuthors = moduleMap.get(module)!;
      for (const [key, a] of authorMap) {
        if (!modAuthors.has(key)) {
          modAuthors.set(key, { name: a.name, email: a.email, files: new Set() });
        }
        modAuthors.get(key)!.files.add(file);
      }
    }

    const byModule: BusFactorModuleEntry[] = [];
    for (const [module, authorMap] of moduleMap) {
      const authors = [...authorMap.values()]
        .map((a) => ({ name: a.name, email: a.email, filesContributed: a.files.size }))
        .sort((a, b) => b.filesContributed - a.filesContributed);

      const totalFiles = new Set([...authorMap.values()].flatMap((a) => [...a.files])).size;
      let cumulative = 0;
      let busFactor = 0;
      for (const a of authors) {
        cumulative += a.filesContributed / (totalFiles || 1);
        busFactor++;
        if (cumulative >= 0.8) break;
      }

      byModule.push({
        module,
        authors: authors.slice(0, 5),
        busFactor,
        riskLevel: this.getBusFactorRisk(busFactor),
      });
    }

    byModule.sort((a, b) => a.busFactor - b.busFactor);

    // Overall
    const totalAuthors = allAuthors.size;
    const topAuthors = [...allAuthors.values()]
      .map((a) => ({
        name: a.name,
        email: a.email,
        filesContributed: a.files.size,
        percentage: Math.round((a.files.size / (fileAuthors.size || 1)) * 100),
      }))
      .sort((a, b) => b.filesContributed - a.filesContributed)
      .slice(0, 10);

    let overallCumulative = 0;
    let overallBusFactor = 0;
    for (const a of topAuthors) {
      overallCumulative += a.percentage;
      overallBusFactor++;
      if (overallCumulative >= 80) break;
    }

    return {
      metric: "bus_factor",
      overall: {
        busFactor: overallBusFactor,
        riskLevel: this.getBusFactorRisk(overallBusFactor),
        totalAuthors,
        topAuthors,
      },
      byFile: byFile.slice(0, 50),
      byModule,
    };
  }

  async persistToEntityMetadata(result: GraphMetricsResult): Promise<void> {
    if (result.metric === "pagerank") {
      const maxScore = result.distribution.max || 1;
      for (const entry of result.entries) {
        try {
          const entity = await this.storage.getEntity(entry.entityId);
          if (entity) {
            const metadata = { ...(entity.metadata ?? {}), pageRank: entry.score / maxScore };
            await this.storage.updateEntity(entry.entityId, { metadata });
          }
        } catch {
          // Skip entities that can't be updated
        }
      }
      log.i("GRAPHMETRICS", "persisted_pagerank", { count: result.entries.length });
    } else if (result.metric === "louvain") {
      for (const community of (result as LouvainResult).communities) {
        for (const e of community.entities) {
          try {
            const entity = await this.storage.getEntity(e.entityId);
            if (entity) {
              const metadata = { ...(entity.metadata ?? {}), communityId: community.communityId };
              await this.storage.updateEntity(e.entityId, { metadata });
            }
          } catch {
            // Skip entities that can't be updated
          }
        }
      }
      log.i("GRAPHMETRICS", "persisted_louvain", { communities: (result as LouvainResult).communities.length });
    }
  }

  private getBusFactorRisk(busFactor: number): BusFactorRiskLevel {
    if (busFactor <= 1) return "critical";
    if (busFactor <= 2) return "high";
    if (busFactor <= 3) return "medium";
    return "low";
  }
}
