# Graph Metrics

Computes graph metrics (PageRank, Louvain, centrality, bus factor) for code dependency networks.

## Overview

This module computes and formats code graph metrics for analyzing dependency networks and code structure. It provides four main analysis operations: PageRank scoring (entity importance in dependency flow), Louvain community detection (automatic code clustering), centrality analysis (network role classification), and bus factor assessment (knowledge concentration and contributor risk). Results can be persisted and formatted as text or JSON output, with built-in caching to avoid redundant computations.

## Flow

```
GraphStorage (dependency data)
      ↓
GraphMetricsAnalyzer.analyze(GraphMetricsParams)
      ↓
  ┌─────────────────────────────────┐
  │  Metric Type Dispatch           │
  │  ├─ PageRank (importance)       │
  │  ├─ Louvain (communities)       │
  │  ├─ Centrality (roles)          │
  │  └─ BusFactor (risk)            │
  └─────────────────────────────────┘
      ↓
  GraphMetricsResult
      ↓
  GraphMetricsFormatter
      ↓
  [Text Output | JSON Output]
```

## Entity Listing

### Public API — Classes

- `GraphMetricsAnalyzer` (graph-metrics-analyzer.ts:22-25) — Main analyzer computing PageRank, Louvain, centrality, and bus factor metrics from code dependency graphs with caching.
- `GraphMetricsFormatter` (metrics-formatter.ts:9-145) — Formats metric analysis results as human-readable text or structured JSON output.

### Configuration & Result Types

- `GraphMetricType` (types.ts:1) — Enumeration of available metric computation types: pagerank, louvain, centrality, or busfactor.
- `GraphMetricsParams` (types.ts:95-95) — Configuration parameters for metric analysis including metric type, result limits (topN), filtering (minCommunitySize), and persistence options.
- `GraphMetricsResult` (types.ts:95) — Union type representing the result of any graph metric computation operation.

### PageRank Analysis

- `PageRankEntry` (types.ts:1-1) — Single entity PageRank score with in-degree and out-degree counts indicating importance and dependency flow.
- `PageRankResult` (types.ts:13-23) — PageRank analysis results containing per-entity scores and distribution statistics (mean, median, percentiles).

### Louvain Community Detection

- `LouvainCommunity` (types.ts:25-38) — Detected code module cluster from Louvain modularity optimization with member list and internal edge count.
- `LouvainResult` (types.ts:40-46) — Community detection results with cluster assignments for all entities and overall modularity quality score.

### Centrality Analysis

- `CentralityRole` (types.ts:48) — Network role classification derived from entity degree patterns: hub, bridge, peripheral, or isolated.
- `CentralityEntry` (types.ts:48-48) — Centrality metrics (degree, betweenness, closeness) and network role for a code entity.
- `CentralityResult` (types.ts:61-65) — Centrality results for all graph entities with per-role distribution and centrality statistics.

### Bus Factor Assessment

- `BusFactorRiskLevel` (types.ts:67) — Risk level classification for author dependency concentration: critical, high, medium, or low.
- `BusFactorFileEntry` (types.ts:61-65) — Bus factor metrics including concentrated author list and risk level for a single file.
- `BusFactorModuleEntry` (types.ts:67-67) — Bus factor metrics and contributor risk assessment for a code module or component.
- `BusFactorResult` (types.ts:76-81) — Overall bus factor analysis with per-file breakdown, module-level metrics, and aggregate organizational risk assessment.


### Added Entities

- **BrandesResult** — `brandes.ts:15-22`
- **computeBetweenness** — `brandes.ts:31-135`
- **allNodes** — `brandes.ts:33-33`
- **n** — `brandes.ts:34-34`
- **nodeToIdx** — `brandes.ts:37-37`
- **neighbors** — `brandes.ts:41-41`
- **adj** — `brandes.ts:43-43`
- **nbs** — `brandes.ts:48-48`
- **j** — `brandes.ts:50-50`
- **cb** — `brandes.ts:57-57`
- **sigma** — `brandes.ts:60-60`
- **dist** — `brandes.ts:61-61`
- **delta** — `brandes.ts:62-62`
- **SENTINEL** — `brandes.ts:65-65`
- **predHead** — `brandes.ts:66-66`
- **predValue** — `brandes.ts:67-67`
- **predNext** — `brandes.ts:68-68`
- **queue** — `brandes.ts:71-71`
- **stack** — `brandes.ts:72-72`
- **sourcesToUse** — `brandes.ts:74-74`
- **v** — `brandes.ts:94-94`
- **slot** — `brandes.ts:105-105`
- **w** — `brandes.ts:115-115`
- **v** — `brandes.ts:118-118`
- **scores** — `brandes.ts:129-129`
- **i** — `brandes.ts:38-38`
- **i** — `brandes.ts:42-42`
- **si** — `brandes.ts:76-76`
- **qHead** — `brandes.ts:92-92`
- **i** — `brandes.ts:114-114`
- **slot** — `brandes.ts:116-116`
- **i** — `brandes.ts:130-130`

## Dependencies

**Internal:**
- `GraphologyPathBuilder` — Loads and manages code dependency graphs from storage for analysis.
- `GraphStorage` — Persistence layer providing access to code dependency and graph data.
- `logging` — Application logging for execution traces and analysis diagnostics.

**External:**
- `graphology` — Graph algorithm library providing PageRank, community detection, and centrality computations.