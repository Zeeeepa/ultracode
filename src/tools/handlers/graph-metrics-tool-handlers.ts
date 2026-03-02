import { z } from "zod";
import { BaseToolHandler, type ToolResult } from "../base-tool-handler.js";

const GraphMetricsSchema = z.object({
  projectPath: z.string().optional(),
  metric: z.enum(["pagerank", "louvain", "centrality", "bus_factor"]),
  topN: z.number().optional().default(20),
  minCommunitySize: z.number().optional().default(2),
  persist: z.boolean().optional().default(false),
});

export class GraphMetricsToolHandler extends BaseToolHandler<z.infer<typeof GraphMetricsSchema>> {
  protected parseArgs(args: unknown) {
    return GraphMetricsSchema.parse(args);
  }

  protected async execute(args: z.infer<typeof GraphMetricsSchema>): Promise<ToolResult> {
    const projectPath = this.resolveProjectPath(args);
    const storage = await this.ensureGraphStorageForProject(args.projectPath);

    const { GraphMetricsAnalyzer } = await import("../../analysis/graph-metrics/index.js");
    const { GraphMetricsFormatter } = await import("../../analysis/graph-metrics/index.js");

    const analyzer = new GraphMetricsAnalyzer(storage);
    const result = await analyzer.analyze({
      projectPath,
      metric: args.metric,
      topN: args.topN,
      minCommunitySize: args.minCommunitySize,
      persist: args.persist,
    });

    const summary = GraphMetricsFormatter.toSummary(result);
    const text = GraphMetricsFormatter.formatAsText(result);

    // Count items for context without including full raw data
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
}
