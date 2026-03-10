/**
 * Stacktrace Analyzer — Barrel Export
 */

export type { DiagnosisOptions, DiagnosisTraceEngine } from "./diagnosis-engine.js";
export { diagnose } from "./diagnosis-engine.js";
export { classifyError } from "./error-classifier.js";
export { resolveFrames } from "./frame-resolver.js";
export { getSupportedLanguages, parseStacktrace } from "./stacktrace-parser.js";
export type {
  ErrorCategory,
  ErrorClassification,
  LanguageStacktraceParser,
  ParsedStacktrace,
  ResolvedFrame,
  Severity,
  StackFrame,
  StacktraceDiagnosis,
  SuggestedFix,
} from "./types.js";
