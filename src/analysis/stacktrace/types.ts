/**
 * Stacktrace Analyzer Types
 *
 * Core type definitions for stacktrace parsing, frame resolution,
 * error classification, and diagnosis output.
 */

// =============================================================================
// 1. PARSED STACKTRACE TYPES
// =============================================================================

/**
 * A single frame in a stacktrace.
 * index=0 is the crash point (innermost frame).
 */
export interface StackFrame {
  index: number;
  functionName: string;
  className?: string | undefined;
  moduleName?: string | undefined;
  filePath?: string | undefined;
  lineNumber?: number | undefined;
  columnNumber?: number | undefined;
  isNative?: boolean | undefined;
  isAsync?: boolean | undefined;
  raw: string;
}

/**
 * Result of parsing a raw stacktrace string.
 * For Java-style "Caused by" chains, `causedBy` links to the inner cause.
 */
export interface ParsedStacktrace {
  language: string;
  errorType: string;
  errorMessage: string;
  frames: StackFrame[];
  rawText: string;
  threadInfo?: string | undefined;
  causedBy?: ParsedStacktrace | undefined;
}

// =============================================================================
// 2. ERROR CLASSIFICATION
// =============================================================================

export type ErrorCategory =
  | "null_reference"
  | "type_error"
  | "index_out_of_bounds"
  | "io_error"
  | "network_error"
  | "permission_error"
  | "assertion_error"
  | "memory_error"
  | "concurrency_error"
  | "import_error"
  | "syntax_error"
  | "timeout_error"
  | "custom_error"
  | "unknown";

export type Severity = "critical" | "high" | "medium" | "low";

export interface ErrorClassification {
  category: ErrorCategory;
  severity: Severity;
  description: string;
  missingCheckHints: string[];
}

// =============================================================================
// 3. FRAME RESOLUTION
// =============================================================================

/**
 * A StackFrame enriched with graph entity bindings.
 */
export interface ResolvedFrame extends StackFrame {
  entityId?: string | undefined;
  entityName?: string | undefined;
  entityType?: string | undefined;
  resolved: boolean;
  confidence: number;
}

// =============================================================================
// 4. DIAGNOSIS OUTPUT
// =============================================================================

export interface SuggestedFix {
  location: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface StacktraceDiagnosis {
  language: string;
  errorCategory: ErrorCategory;
  errorType: string;
  errorMessage: string;
  severity: Severity;
  crashLocation: {
    frame: ResolvedFrame;
    codeContext?: string | undefined;
  };
  callChain: ResolvedFrame[];
  resolvedFrameCount: number;
  totalFrameCount: number;
  backwardsTrace?:
    | {
        callers: Array<{ name: string; file: string; line: number }>;
        blockingConditions: Array<{ condition: string; location: string }>;
        diagnosis: string;
      }
    | undefined;
  impactAnalysis?:
    | {
        affectedEntities: number;
        riskScore: number;
        dependentFiles: string[];
      }
    | undefined;
  relatedPatterns: {
    errorHandlers: string[];
    guards: string[];
    missingChecks: string[];
  };
  suggestedFixes: SuggestedFix[];
  mermaidDiagram: string;
  formatted: string;
}

// =============================================================================
// 5. PARSER INTERFACE
// =============================================================================

/**
 * Each language parser implements this interface.
 * detect() returns 0-1 confidence that the text is this language's stacktrace.
 */
export interface LanguageStacktraceParser {
  language: string;
  detect(text: string): number;
  parse(text: string): ParsedStacktrace;
}
