export type GraphMetricType = "pagerank" | "louvain" | "centrality" | "bus_factor";

export interface PageRankEntry {
  entityId: string;
  name: string;
  file: string;
  type: string;
  score: number;
  inDegree: number;
  outDegree: number;
}

export interface PageRankResult {
  metric: "pagerank";
  entries: PageRankEntry[];
  distribution: {
    mean: number;
    median: number;
    max: number;
    stdDev: number;
  };
  totalNodes: number;
}

export interface LouvainCommunity {
  communityId: number;
  entities: Array<{
    entityId: string;
    name: string;
    file: string;
    type: string;
  }>;
  size: number;
  mainFiles: string[];
  cohesion: number;
  /** Total entities before per-community limit was applied */
  _totalEntities?: number;
}

export interface LouvainResult {
  metric: "louvain";
  communities: LouvainCommunity[];
  modularity: number;
  totalCommunities: number;
  totalNodes: number;
}

export type CentralityRole = "hub" | "authority" | "bridge" | "leaf";

export interface CentralityEntry {
  entityId: string;
  name: string;
  file: string;
  type: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  role: CentralityRole;
}

export interface CentralityResult {
  metric: "centrality";
  entries: CentralityEntry[];
  totalNodes: number;
}

export type BusFactorRiskLevel = "critical" | "high" | "medium" | "low";

export interface BusFactorFileEntry {
  file: string;
  authors: Array<{ name: string; email: string; linesChanged: number; percentage: number }>;
  busFactor: number;
  riskLevel: BusFactorRiskLevel;
}

export interface BusFactorModuleEntry {
  module: string;
  authors: Array<{ name: string; email: string; filesContributed: number }>;
  busFactor: number;
  riskLevel: BusFactorRiskLevel;
}

export interface BusFactorResult {
  metric: "bus_factor";
  overall: {
    busFactor: number;
    riskLevel: BusFactorRiskLevel;
    totalAuthors: number;
    topAuthors: Array<{ name: string; email: string; filesContributed: number; percentage: number }>;
  };
  byFile: BusFactorFileEntry[];
  byModule: BusFactorModuleEntry[];
}

export type GraphMetricsResult = PageRankResult | LouvainResult | CentralityResult | BusFactorResult;

export interface GraphMetricsParams {
  projectPath?: string;
  metric: GraphMetricType;
  topN?: number;
  minCommunitySize?: number;
  persist?: boolean;
}
