/**
 * Multi-Pass Parser Types
 *
 * Defines the data structures for tiered parsing strategy:
 * - Pass 1 (SWC): Fast structural analysis (~1ms/file)
 * - Pass 2 (TS API): Detailed type analysis (on-demand)
 */

// Types are self-contained, no external imports needed

/**
 * Complexity score for prioritizing detailed parsing
 */
export interface ComplexityScore {
  /** Overall complexity (0-100) */
  total: number;
  /** Number of classes/interfaces */
  typeCount: number;
  /** Number of functions/methods */
  functionCount: number;
  /** Estimated nesting depth */
  maxNesting: number;
  /** Has generics/complex types */
  hasGenerics: boolean;
  /** Has decorators (Angular, etc.) */
  hasDecorators: boolean;
  /** Has JSX/TSX */
  hasJsx: boolean;
  /** Line count */
  lines: number;
}

/**
 * Quick parse result from SWC (Pass 1)
 */
export interface QuickParseResult {
  filePath: string;
  /** Basic entities (name, type, location only) */
  entities: QuickEntity[];
  /** Complexity analysis for prioritization */
  complexity: ComplexityScore;
  /** Imports for dependency graph */
  imports: ImportInfo[];
  /** Exports for API surface */
  exports: ExportInfo[];
  /** Parse time in ms */
  parseTimeMs: number;
  /** Whether detailed pass is recommended */
  needsDetailedPass: boolean;
  /** Cached content for reuse in detailed pass */
  content?: string;
}

/**
 * Lightweight entity from fast pass
 */
export interface QuickEntity {
  name: string;
  type: "class" | "interface" | "function" | "type" | "enum" | "variable" | "namespace";
  startLine: number;
  endLine: number;
  /** Exported? */
  exported: boolean;
  /** Has decorators? */
  decorated: boolean;
  /** Parent entity name (for nested) */
  parent?: string;
}

/**
 * Import information
 */
export interface ImportInfo {
  source: string;
  specifiers: string[];
  isTypeOnly: boolean;
  isDynamic: boolean;
}

/**
 * Export information
 */
export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isTypeOnly: boolean;
  source?: string; // re-export source
}

/**
 * Batch processing strategy
 */
export interface BatchStrategy {
  /** Files to process with fast pass only */
  fastOnly: string[];
  /** Files needing detailed pass (high priority) */
  detailed: string[];
  /** Files for worker threads (medium complexity) */
  workers: string[];
}

/**
 * Multi-pass configuration
 */
export interface MultiPassConfig {
  /** Enable SWC fast pass */
  enableFastPass: boolean;
  /** Complexity threshold for detailed pass (0-100) */
  detailedThreshold: number;
  /** Max concurrent SWC parses */
  swcConcurrency: number;
  /** Max concurrent TS parses */
  tsConcurrency: number;
  /** Worker pool size for medium files */
  workerPoolSize: number;
  /** Cache SWC results */
  cacheQuickResults: boolean;
  /** Skip TS API for low-complexity files (use SWC results only) */
  skipDetailedForSimple: boolean;
  /** Complexity threshold below which to skip detailed pass */
  simpleFileThreshold: number;
}

export const DEFAULT_MULTIPASS_CONFIG: MultiPassConfig = {
  enableFastPass: true,
  detailedThreshold: 50,
  swcConcurrency: 16, // SWC is very fast
  tsConcurrency: 8, // TS API with parallelism
  workerPoolSize: 16,
  cacheQuickResults: true,
  skipDetailedForSimple: true, // Skip TS API for simple files (1.2x speedup)
  simpleFileThreshold: 50, // Files with complexity < 50 are "simple"
};
