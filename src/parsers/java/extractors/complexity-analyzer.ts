/**
 * Java Complexity Analyzer
 *
 * Java-specific complexity calculations. Shared functions
 * (LOC, comment density, nesting, class metrics, formatting)
 * are imported from jvm/shared-complexity.
 */

import type { ParserRuleContext } from "antlr4ng";
import {
  type ComplexityThresholds,
  calculateClassComplexity,
  calculateCommentDensity,
  calculateLinesOfCode,
  calculateNestingDepth,
  calculatePhysicalLines,
  exceedsThresholds as exceedsThresholdsBase,
  formatComplexityMetrics,
  getBaseRefactoringSuggestions,
  getComplexityRating as getComplexityRatingBase,
} from "../../jvm/shared-complexity.js";
import type { ComplexityMetrics, ControlFlowInfo } from "../types.js";
import { extractControlFlow } from "./control-flow-extractor.js";

// Re-export shared functions for backward compatibility
export {
  calculateClassComplexity,
  calculateCommentDensity,
  calculateLinesOfCode,
  calculatePhysicalLines,
  formatComplexityMetrics,
};

// =============================================================================
// JAVA NESTING STRUCTURES
// =============================================================================

const JAVA_NESTING_STRUCTURES = [
  "IfThenStatementContext",
  "IfThenElseStatementContext",
  "ForStatementContext",
  "BasicForStatementContext",
  "EnhancedForStatementContext",
  "WhileStatementContext",
  "DoStatementContext",
  "SwitchStatementContext",
  "TryStatementContext",
  "LambdaExpressionContext",
  "AnonymousClassDeclarationContext",
];

// =============================================================================
// JAVA COMPLEXITY THRESHOLDS
// =============================================================================

export const COMPLEXITY_THRESHOLDS: ComplexityThresholds = {
  cyclomatic: { low: 10, medium: 20, high: 50 },
  cognitive: { low: 15, medium: 30, high: 60 },
  linesOfCode: { low: 20, medium: 50, high: 100 },
  nestingDepth: { low: 3, medium: 5, high: 7 },
};

// =============================================================================
// COMPLEXITY CALCULATION
// =============================================================================

export function calculateComplexity(bodyCtx: ParserRuleContext | null, code?: string): ComplexityMetrics {
  const metrics: ComplexityMetrics = {
    cyclomatic: 1,
    cognitive: 0,
    linesOfCode: 0,
    linesOfLogic: 0,
    nestingDepth: 0,
    parameterCount: 0,
    returnCount: 0,
  };

  if (!bodyCtx) return metrics;

  const controlFlow = extractControlFlow(bodyCtx);
  metrics.cyclomatic = calculateCyclomaticComplexity(controlFlow);
  metrics.cognitive = calculateCognitiveComplexity(bodyCtx, controlFlow);

  if (code) {
    metrics.linesOfCode = calculateLinesOfCode(code);
  } else {
    const text = bodyCtx.getText?.() || "";
    metrics.linesOfCode = calculateLinesOfCode(text);
  }

  metrics.nestingDepth = calculateNestingDepth(bodyCtx, JAVA_NESTING_STRUCTURES);

  return metrics;
}

// =============================================================================
// JAVA-SPECIFIC CYCLOMATIC COMPLEXITY
// =============================================================================

export function calculateCyclomaticComplexity(controlFlow: ControlFlowInfo): number {
  let complexity = 1;

  for (const branch of controlFlow.branches) {
    switch (branch.type) {
      case "if":
      case "else-if":
      case "case":
      case "ternary":
        complexity++;
        break;
    }
  }

  complexity += controlFlow.loops.length;
  const catchCount = controlFlow.exceptions.filter((e) => e.type === "catch").length;
  complexity += catchCount;

  return complexity;
}

// =============================================================================
// JAVA-SPECIFIC COGNITIVE COMPLEXITY
// =============================================================================

export function calculateCognitiveComplexity(bodyCtx: ParserRuleContext, controlFlow: ControlFlowInfo): number {
  let complexity = 0;
  const nestingLevels = new Map<number, number>();

  for (const branch of controlFlow.branches) {
    const line = branch.location.start.line;
    const nesting = nestingLevels.get(line) || 0;

    switch (branch.type) {
      case "if":
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "else-if":
        complexity += 1;
        break;
      case "else":
        complexity += 1;
        break;
      case "switch":
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "case":
        break;
      case "ternary":
        complexity += 1 + nesting;
        break;
    }
  }

  for (const loop of controlFlow.loops) {
    const line = loop.location.start.line;
    const nesting = nestingLevels.get(line) || 0;
    complexity += 1 + nesting;
    nestingLevels.set(line, nesting + 1);
  }

  for (const exc of controlFlow.exceptions) {
    if (exc.type === "catch") {
      complexity += 1;
    }
  }

  const text = bodyCtx.getText?.() || "";
  const andOrCount = (text.match(/&&|\|\|/g) || []).length;
  complexity += andOrCount;

  return complexity;
}

// =============================================================================
// THRESHOLDS / RATINGS (delegate to shared with Java thresholds)
// =============================================================================

export function getComplexityRating(metrics: ComplexityMetrics): "low" | "medium" | "high" | "very-high" {
  return getComplexityRatingBase(metrics, COMPLEXITY_THRESHOLDS);
}

export function exceedsThresholds(metrics: ComplexityMetrics): boolean {
  return exceedsThresholdsBase(metrics, COMPLEXITY_THRESHOLDS);
}

export function getRefactoringSuggestions(metrics: ComplexityMetrics): string[] {
  return getBaseRefactoringSuggestions(metrics, COMPLEXITY_THRESHOLDS);
}
