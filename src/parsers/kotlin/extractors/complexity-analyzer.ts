/**
 * Kotlin Complexity Analyzer
 *
 * Kotlin-specific complexity calculations including when expressions,
 * elvis operators, scope functions, coroutines. Shared functions
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
// KOTLIN NESTING STRUCTURES
// =============================================================================

const KOTLIN_NESTING_STRUCTURES = [
  "IfExpressionContext",
  "WhenExpressionContext",
  "ForStatementContext",
  "WhileStatementContext",
  "DoWhileStatementContext",
  "TryExpressionContext",
  "LambdaLiteralContext",
  "AnonymousFunctionContext",
  "ObjectLiteralContext",
];

// =============================================================================
// KOTLIN COMPLEXITY THRESHOLDS (more concise code → lower LOC thresholds)
// =============================================================================

export const COMPLEXITY_THRESHOLDS: ComplexityThresholds = {
  cyclomatic: { low: 10, medium: 20, high: 50 },
  cognitive: { low: 15, medium: 30, high: 60 },
  linesOfCode: { low: 20, medium: 40, high: 80 },
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
  metrics.cyclomatic = calculateCyclomaticComplexity(controlFlow, bodyCtx);
  metrics.cognitive = calculateCognitiveComplexity(bodyCtx, controlFlow);

  if (code) {
    metrics.linesOfCode = calculateLinesOfCode(code);
  } else {
    const text = bodyCtx.getText?.() || "";
    metrics.linesOfCode = calculateLinesOfCode(text);
  }

  metrics.nestingDepth = calculateNestingDepth(bodyCtx, KOTLIN_NESTING_STRUCTURES);

  return metrics;
}

// =============================================================================
// KOTLIN-SPECIFIC CYCLOMATIC COMPLEXITY
// =============================================================================

export function calculateCyclomaticComplexity(controlFlow: ControlFlowInfo, bodyCtx?: ParserRuleContext): number {
  let complexity = 1;

  for (const branch of controlFlow.branches) {
    switch (branch.type) {
      case "if":
      case "else-if":
      case "when-entry":
      case "elvis":
        complexity++;
        break;
    }
  }

  complexity += controlFlow.loops.length;
  const catchCount = controlFlow.exceptions.filter((e) => e.type === "catch").length;
  complexity += catchCount;

  // Kotlin-specific: safe calls with scope functions
  if (bodyCtx) {
    const text = bodyCtx.getText?.() || "";
    const safeLetCount = (text.match(/\?\.\s*let\s*\{/g) || []).length;
    const safeRunCount = (text.match(/\?\.\s*run\s*\{/g) || []).length;
    complexity += safeLetCount + safeRunCount;
  }

  return complexity;
}

// =============================================================================
// KOTLIN-SPECIFIC COGNITIVE COMPLEXITY
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
      case "when":
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "when-entry":
        break;
      case "elvis":
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

  // Kotlin-specific: labeled returns
  const labeledReturns = (text.match(/return@\w+/g) || []).length;
  complexity += labeledReturns;

  // Kotlin-specific: nested scope functions
  const nestedScopeFunctions = countNestedScopeFunctions(text);
  complexity += nestedScopeFunctions;

  return complexity;
}

function countNestedScopeFunctions(code: string): number {
  const scopeFunctions = ["let", "run", "with", "apply", "also"];
  let nestedCount = 0;

  for (const fn of scopeFunctions) {
    const pattern = new RegExp(`\\.${fn}\\s*\\{[\\s\\S]*?\\.(?:${scopeFunctions.join("|")})\\s*\\{`, "g");
    const matches = code.match(pattern);
    if (matches) {
      nestedCount += matches.length;
    }
  }

  return nestedCount;
}

// =============================================================================
// KOTLIN-SPECIFIC METRICS
// =============================================================================

export function calculateKotlinSpecificComplexity(code: string): {
  extensionFunctionCount: number;
  scopeFunctionUsage: number;
  nullSafetyOperators: number;
  coroutineComplexity: number;
} {
  return {
    extensionFunctionCount: (code.match(/fun\s+\w+\.\w+/g) || []).length,
    scopeFunctionUsage: (code.match(/\.(let|run|with|apply|also)\s*\{/g) || []).length,
    nullSafetyOperators: (code.match(/\?\.|!!|\?:/g) || []).length,
    coroutineComplexity: calculateCoroutineComplexity(code),
  };
}

function calculateCoroutineComplexity(code: string): number {
  let complexity = 0;

  complexity += (code.match(/\b(launch|async|runBlocking)\s*\{/g) || []).length;

  if (/launch\s*\{[\s\S]*?launch\s*\{/.test(code)) {
    complexity += 2;
  }

  const flowOperators = (code.match(/\.(map|filter|collect|flatMap|transform)\s*\{/g) || []).length;
  complexity += Math.floor(flowOperators / 3);

  return complexity;
}

// =============================================================================
// THRESHOLDS / RATINGS (delegate to shared with Kotlin thresholds)
// =============================================================================

export function getComplexityRating(metrics: ComplexityMetrics): "low" | "medium" | "high" | "very-high" {
  return getComplexityRatingBase(metrics, COMPLEXITY_THRESHOLDS);
}

export function exceedsThresholds(metrics: ComplexityMetrics): boolean {
  return exceedsThresholdsBase(metrics, COMPLEXITY_THRESHOLDS);
}

export function getRefactoringSuggestions(metrics: ComplexityMetrics, code?: string): string[] {
  const suggestions = getBaseRefactoringSuggestions(metrics, COMPLEXITY_THRESHOLDS);

  // Kotlin-specific suggestions
  if (code) {
    const kotlinMetrics = calculateKotlinSpecificComplexity(code);

    if (kotlinMetrics.scopeFunctionUsage > 5) {
      suggestions.push("Consider reducing scope function chains for readability");
    }
    if (kotlinMetrics.nullSafetyOperators > 10) {
      suggestions.push("High null-safety operator usage, consider using non-null types or early validation");
    }
    if (kotlinMetrics.coroutineComplexity > 3) {
      suggestions.push("Consider simplifying coroutine structure, avoid nested launches");
    }
  }

  return suggestions;
}
