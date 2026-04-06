/**
 * JVM Shared Complexity Analysis
 *
 * Functions 100% identical between Java and Kotlin complexity analyzers.
 * Language-specific cyclomatic/cognitive calculations, nesting structures,
 * and thresholds remain in java/kotlin extractors.
 */

import type { ParserRuleContext } from "antlr4ng";
import type { ComplexityMetrics } from "./shared-types.js";

// =============================================================================
// LINES OF CODE METRICS (100% identical)
// =============================================================================

export function calculateLinesOfCode(code: string): number {
  const lines = code.split("\n");

  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) continue;

    if (inBlockComment) {
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    if (trimmed.startsWith("//")) continue;

    loc++;
  }

  return loc;
}

export function calculatePhysicalLines(code: string): number {
  return code.split("\n").length;
}

export function calculateCommentDensity(code: string): number {
  const lines = code.split("\n");
  let commentLines = 0;
  let codeLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) continue;

    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      commentLines++;
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    if (trimmed.startsWith("//")) {
      commentLines++;
      continue;
    }

    codeLines++;
  }

  const totalLines = commentLines + codeLines;
  return totalLines > 0 ? commentLines / totalLines : 0;
}

// =============================================================================
// NESTING DEPTH (shared skeleton — nesting structure names passed in)
// =============================================================================

export function calculateNestingDepth(bodyCtx: ParserRuleContext, nestingStructures: string[]): number {
  let maxDepth = 0;
  let currentDepth = 0;

  visitForNesting(
    bodyCtx,
    nestingStructures,
    () => {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    },
    () => {
      currentDepth--;
    },
  );

  return maxDepth;
}

function visitForNesting(
  node: ParserRuleContext,
  nestingStructures: string[],
  onEnter: () => void,
  onExit: () => void,
): void {
  const nodeName = node.constructor.name;
  const isNesting = nestingStructures.includes(nodeName);

  if (isNesting) {
    onEnter();
  }

  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i);
    if (child && "ruleIndex" in child) {
      visitForNesting(child as ParserRuleContext, nestingStructures, onEnter, onExit);
    }
  }

  if (isNesting) {
    onExit();
  }
}

// =============================================================================
// CLASS-LEVEL METRICS (100% identical)
// =============================================================================

export function calculateClassComplexity(
  methods: Array<{
    complexity: ComplexityMetrics;
    isPublic: boolean;
  }>,
): {
  totalCyclomatic: number;
  averageCyclomatic: number;
  maxCyclomatic: number;
  totalCognitive: number;
  averageCognitive: number;
  methodCount: number;
  publicMethodCount: number;
  weightedMethodsPerClass: number;
} {
  if (methods.length === 0) {
    return {
      totalCyclomatic: 0,
      averageCyclomatic: 0,
      maxCyclomatic: 0,
      totalCognitive: 0,
      averageCognitive: 0,
      methodCount: 0,
      publicMethodCount: 0,
      weightedMethodsPerClass: 0,
    };
  }

  const totalCyclomatic = methods.reduce((sum, m) => sum + m.complexity.cyclomatic, 0);
  const totalCognitive = methods.reduce((sum, m) => sum + m.complexity.cognitive, 0);
  const maxCyclomatic = Math.max(...methods.map((m) => m.complexity.cyclomatic));
  const publicMethodCount = methods.filter((m) => m.isPublic).length;

  return {
    totalCyclomatic,
    averageCyclomatic: totalCyclomatic / methods.length,
    maxCyclomatic,
    totalCognitive,
    averageCognitive: totalCognitive / methods.length,
    methodCount: methods.length,
    publicMethodCount,
    weightedMethodsPerClass: totalCyclomatic,
  };
}

// =============================================================================
// UTILITY FUNCTIONS (100% identical)
// =============================================================================

export function formatComplexityMetrics(metrics: ComplexityMetrics): string {
  return [
    `Cyclomatic: ${metrics.cyclomatic}`,
    `Cognitive: ${metrics.cognitive}`,
    `LOC: ${metrics.linesOfCode}`,
    `Nesting: ${metrics.nestingDepth}`,
    `Params: ${metrics.parameterCount}`,
  ].join(", ");
}

// =============================================================================
// THRESHOLDS + RATINGS (parameterized — thresholds differ between Java/Kotlin)
// =============================================================================

export interface ComplexityThresholds {
  cyclomatic: { low: number; medium: number; high: number };
  cognitive: { low: number; medium: number; high: number };
  linesOfCode: { low: number; medium: number; high: number };
  nestingDepth: { low: number; medium: number; high: number };
}

export function getComplexityRating(
  metrics: ComplexityMetrics,
  thresholds: ComplexityThresholds,
): "low" | "medium" | "high" | "very-high" {
  if (metrics.cyclomatic > thresholds.cyclomatic.high) return "very-high";
  if (metrics.cyclomatic > thresholds.cyclomatic.medium) return "high";
  if (metrics.cyclomatic > thresholds.cyclomatic.low) return "medium";

  if (metrics.cognitive > thresholds.cognitive.high) return "very-high";
  if (metrics.cognitive > thresholds.cognitive.medium) return "high";
  if (metrics.cognitive > thresholds.cognitive.low) return "medium";

  if (metrics.nestingDepth > thresholds.nestingDepth.high) return "high";
  if (metrics.nestingDepth > thresholds.nestingDepth.medium) return "medium";

  return "low";
}

export function exceedsThresholds(metrics: ComplexityMetrics, thresholds: ComplexityThresholds): boolean {
  return (
    metrics.cyclomatic > thresholds.cyclomatic.medium ||
    metrics.cognitive > thresholds.cognitive.medium ||
    metrics.nestingDepth > thresholds.nestingDepth.medium ||
    metrics.linesOfCode > thresholds.linesOfCode.high
  );
}

export function getBaseRefactoringSuggestions(metrics: ComplexityMetrics, thresholds: ComplexityThresholds): string[] {
  const suggestions: string[] = [];

  if (metrics.cyclomatic > thresholds.cyclomatic.medium) {
    suggestions.push("Consider breaking down this method into smaller methods");
  }
  if (metrics.cognitive > thresholds.cognitive.medium) {
    suggestions.push("Consider simplifying control flow to reduce cognitive load");
  }
  if (metrics.nestingDepth > thresholds.nestingDepth.medium) {
    suggestions.push("Consider using early returns or extracting nested code");
  }
  if (metrics.linesOfCode > thresholds.linesOfCode.high) {
    suggestions.push("Method is too long, consider splitting into smaller units");
  }
  if (metrics.parameterCount > 5) {
    suggestions.push("Too many parameters, consider using a parameter object");
  }

  return suggestions;
}
