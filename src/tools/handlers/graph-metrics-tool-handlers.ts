import { z } from "zod";
import type { GraphStorage } from "../../types/storage.js";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

const GraphMetricsSchema = z.object({
  projectPath: z.string().optional(),
  metric: z.enum(["pagerank", "louvain", "centrality", "bus_factor"]),
  topN: z.number().optional().default(20),
  minCommunitySize: z.number().optional().default(2),
  persist: z.boolean().optional().default(false),
});

/**
 * Shared helper: run GraphMetricsAnalyzer and format result.
 * Accepts already-resolved projectPath and storage to avoid accessing protected methods.
 */
async function runGraphMetric(
  projectPath: string,
  storage: GraphStorage,
  args: {
    metric: "pagerank" | "louvain" | "centrality" | "bus_factor";
    topN?: number;
    minCommunitySize?: number;
    persist?: boolean;
  },
): Promise<ToolResult> {
  const { GraphMetricsAnalyzer } = await import("../../analysis/graph-metrics/index.js");
  const { GraphMetricsFormatter } = await import("../../analysis/graph-metrics/index.js");

  const analyzer = new GraphMetricsAnalyzer(storage);
  const result = await analyzer.analyze({
    projectPath,
    metric: args.metric,
    topN: args.topN ?? 20,
    minCommunitySize: args.minCommunitySize ?? 2,
    persist: args.persist ?? false,
  });

  const summary = GraphMetricsFormatter.toSummary(result);
  const text = GraphMetricsFormatter.formatAsText(result);

  let totalItems = 0;
  if (result.metric === "pagerank" || result.metric === "centrality") {
    totalItems = result.entries.length;
  } else if (result.metric === "louvain") {
    totalItems = result.communities.length;
  } else if (result.metric === "bus_factor") {
    totalItems = result.byFile.length;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            summary,
            formatted: text,
            metric: args.metric,
            totalItems,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export class GraphMetricsToolHandler extends BaseToolHandler<z.infer<typeof GraphMetricsSchema>> {
  protected parseArgs(args: unknown) {
    return GraphMetricsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GraphMetricsSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    return runGraphMetric(projectPath, storage, args);
  }
}

// ==========================================================================
// Standalone graph-metric tools (shortcut wrappers)
// Each wraps GraphMetricsAnalyzer with a fixed metric type.
// ==========================================================================

const PageRankSchema = z.object({
  projectPath: z.string().optional(),
  topN: z.number().optional().default(20).describe("Number of top entities to return"),
  persist: z
    .boolean()
    .optional()
    .default(false)
    .describe("Persist PageRank scores to entity metadata for semantic search boosting"),
});

export class PageRankToolHandler extends BaseToolHandler<z.infer<typeof PageRankSchema>> {
  protected parseArgs(args: unknown) {
    return PageRankSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof PageRankSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    return runGraphMetric(projectPath, storage, { ...args, metric: "pagerank" });
  }
}

const LouvainCommunitiesSchema = z.object({
  projectPath: z.string().optional(),
  minCommunitySize: z.number().optional().default(2).describe("Minimum community size to include"),
  persist: z.boolean().optional().default(false).describe("Persist community IDs to entity metadata"),
});

export class LouvainCommunitiesToolHandler extends BaseToolHandler<z.infer<typeof LouvainCommunitiesSchema>> {
  protected parseArgs(args: unknown) {
    return LouvainCommunitiesSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof LouvainCommunitiesSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    return runGraphMetric(projectPath, storage, { ...args, metric: "louvain" });
  }
}

const CentralityAnalysisSchema = z.object({
  projectPath: z.string().optional(),
  topN: z.number().optional().default(20).describe("Number of top entities to return"),
});

export class CentralityAnalysisToolHandler extends BaseToolHandler<z.infer<typeof CentralityAnalysisSchema>> {
  protected parseArgs(args: unknown) {
    return CentralityAnalysisSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof CentralityAnalysisSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    return runGraphMetric(projectPath, storage, { ...args, metric: "centrality" });
  }
}

const BusFactorSchema = z.object({
  projectPath: z.string().optional(),
});

export class BusFactorToolHandler extends BaseToolHandler<z.infer<typeof BusFactorSchema>> {
  protected parseArgs(args: unknown) {
    return BusFactorSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof BusFactorSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);
    return runGraphMetric(projectPath, storage, { ...args, metric: "bus_factor" });
  }
}
