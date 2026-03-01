/**
 * Pattern Detection System — Public API
 */

export { ExemplarStore } from "./exemplar-store.js";

export { PatternEngine } from "./pattern-engine.js";
export { PatternFormatter } from "./pattern-formatter.js";
export { PatternRegistry } from "./pattern-registry.js";
export { SemanticValidator } from "./semantic-validator.js";
export { registerDetector, registerDetectors, StructuralDetector } from "./structural-detector.js";
export type {
  CustomDetectorFn,
  CustomDetectorResult,
  PatternCategory,
  PatternDefinition,
  PatternExemplar,
  PatternMatch,
  PatternScanOptions,
  PatternScanResult,
  PatternSeverity,
  RelationshipCriteria,
  StructuralCandidate,
  StructuralCriteria,
} from "./types.js";
