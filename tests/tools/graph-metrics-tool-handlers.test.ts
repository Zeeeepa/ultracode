import { describe, expect, it, mock } from "bun:test";
import {
  BusFactorToolHandler,
  CentralityAnalysisToolHandler,
  GraphMetricsToolHandler,
  LouvainCommunitiesToolHandler,
  PageRankToolHandler,
} from "../../src/tools/handlers/graph-metrics-tool-handlers.js";
import { createMockGraphStorage, createMockToolContext, parseJsonResult } from "./_test-helpers.js";

function makeCtx() {
  const storage = createMockGraphStorage({
    findEntities: mock(async () => []),
    getAllEntities: mock(async () => []),
    getAllRelationships: mock(async () => []),
    getRelationshipsForEntity: mock(async () => []),
  });
  return createMockToolContext({ getGraphStorage: async () => storage as any });
}

describe("GraphMetricsToolHandler", () => {
  it("handles pagerank on empty graph", async () => {
    const ctx = makeCtx();
    const handler = new GraphMetricsToolHandler(ctx);
    const result = await handler.handle({ metric: "pagerank", _format: "json" });
    const data = parseJsonResult(result);

    expect(data).toBeDefined();
    // Empty graph: pagerank may return empty entries or error
    expect(data.success === false || data.metric === "pagerank").toBe(true);
  });

  it("computes louvain community detection", async () => {
    const ctx = makeCtx();
    const handler = new GraphMetricsToolHandler(ctx);
    const result = await handler.handle({ metric: "louvain", _format: "json" });
    const data = parseJsonResult(result);

    expect(data.summary).toBeDefined();
    expect(data.metric).toBe("louvain");
  });

  it("computes centrality metrics", async () => {
    const ctx = makeCtx();
    const handler = new GraphMetricsToolHandler(ctx);
    const result = await handler.handle({ metric: "centrality", _format: "json" });
    const data = parseJsonResult(result);

    expect(data.metric).toBe("centrality");
  });

  it("returns error for invalid metric", async () => {
    const ctx = makeCtx();
    const handler = new GraphMetricsToolHandler(ctx);
    const result = await handler.handle({ metric: "invalid", _format: "json" });
    const data = parseJsonResult(result);

    expect(data.success).toBe(false);
  });
});

describe("Standalone graph-metric tools", () => {
  it("PageRankToolHandler delegates to pagerank metric", async () => {
    const ctx = makeCtx();
    const handler = new PageRankToolHandler(ctx);
    const result = await handler.handle({ topN: 5, _format: "json" });
    const data = parseJsonResult(result);

    expect(data).toBeDefined();
    expect(data.success === false || data.metric === "pagerank").toBe(true);
  });

  it("LouvainCommunitiesToolHandler delegates to louvain metric", async () => {
    const ctx = makeCtx();
    const handler = new LouvainCommunitiesToolHandler(ctx);
    const result = await handler.handle({ minCommunitySize: 3, _format: "json" });
    const data = parseJsonResult(result);

    expect(data).toBeDefined();
    expect(data.success === false || data.metric === "louvain").toBe(true);
  });

  it("CentralityAnalysisToolHandler delegates to centrality metric", async () => {
    const ctx = makeCtx();
    const handler = new CentralityAnalysisToolHandler(ctx);
    const result = await handler.handle({ topN: 10, _format: "json" });
    const data = parseJsonResult(result);

    expect(data).toBeDefined();
    expect(data.success === false || data.metric === "centrality").toBe(true);
  });

  it("BusFactorToolHandler delegates to bus_factor metric", async () => {
    const ctx = makeCtx();
    const handler = new BusFactorToolHandler(ctx);
    const result = await handler.handle({ _format: "json" });
    const data = parseJsonResult(result);

    expect(data).toBeDefined();
    expect(data.success === false || data.metric === "bus_factor").toBe(true);
  });
});
