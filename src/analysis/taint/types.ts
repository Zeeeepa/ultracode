export type TaintCategory =
  | "sql_injection"
  | "xss"
  | "command_injection"
  | "path_traversal"
  | "ssrf"
  | "prototype_pollution";

export type TaintSeverity = "critical" | "high" | "medium" | "low";

export interface TaintSource {
  id: string;
  name: string;
  file: string;
  line: number;
  sourceType: string;
  description: string;
  priority: number;
}

export interface TaintSink {
  id: string;
  name: string;
  file: string;
  line: number;
  sinkType: string;
  categories: TaintCategory[];
  priority: number;
}

export interface TaintSanitizer {
  id: string;
  name: string;
  file: string;
  line: number;
  sanitizerType: string;
  protectsAgainst: TaintCategory[];
}

export type TaintFlowRole = "source" | "passthrough" | "sanitizer" | "sink";

export interface TaintFlowStep {
  order: number;
  entityId: string;
  name: string;
  file: string;
  line: number;
  role: TaintFlowRole;
}

export interface TaintVulnerability {
  category: TaintCategory;
  severity: TaintSeverity;
  source: TaintSource;
  sink: TaintSink;
  flow: TaintFlowStep[];
  sanitized: boolean;
  missingSanitizers: string[];
  confidence: number;
}

export interface TaintAnalysisParams {
  projectPath?: string;
  category?: TaintCategory | "all";
  maxDepth?: number;
  includeTests?: boolean;
}

export interface TaintAnalysisResult {
  vulnerabilities: TaintVulnerability[];
  sources: TaintSource[];
  sinks: TaintSink[];
  sanitizers: TaintSanitizer[];
  summary: {
    totalVulnerabilities: number;
    bySeverity: Record<TaintSeverity, number>;
    byCategory: Partial<Record<TaintCategory, number>>;
    sanitizedFlows: number;
    unsanitizedFlows: number;
    _limitReached?: boolean;
    _maxVulnerabilities?: number;
    _sourcesTotal?: number;
    _sinksTotal?: number;
    _timeoutReached?: boolean;
    _elapsedMs?: number;
    _cachedClassifications?: number;
  };
}
