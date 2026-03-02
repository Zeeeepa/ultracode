import { z } from "zod";

export const GraphMetricsSchema = z.object({
  projectPath: z.string().optional().describe("Project directory path"),
  metric: z.enum(["pagerank", "louvain", "centrality", "bus_factor"]).describe("Type of graph metric to compute"),
  topN: z.number().optional().default(20).describe("Number of top results to return (for pagerank, centrality)"),
  minCommunitySize: z.number().optional().default(2).describe("Minimum community size to include (for louvain)"),
  persist: z
    .boolean()
    .optional()
    .default(false)
    .describe("Persist computed metrics to entity metadata for use in semantic search ranking"),
});
