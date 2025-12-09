/**
 * Chaos Analysis - State Sprawl & Race Condition Detection
 *
 * Full implementation using extended GraphStorage API.
 * Includes detection of:
 * - Scattered state across files
 * - Race conditions (competing mutations, check-then-act, async races)
 * - Hidden async APIs (localStorage, etc.)
 */

// Re-export types
export type {
  ChaosAnalysisOptions,
  ChaosAnalysisResult,
  ChaosAnalysisSummary,
  ChaosMetrics,
  MutationPoint,
  RaceAnalysis,
  RaceConflict,
  RacePatternType,
  RaceRisk,
  RefactoringPlan,
  StatePattern,
} from "../../types/chaos-analysis.js";
export * from "./angular-patterns.js";
export { ChaosAnalyzer } from "./chaos-analyzer.js";
export { RaceDetector } from "./race-detector.js";
export { StateDetector, StatePatternWithRaces } from "./state-detector.js";
