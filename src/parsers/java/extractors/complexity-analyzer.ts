/**
 * Java Complexity Analyzer
 *
 * Calculates complexity metrics for Java methods and classes.
 * Implements: Cyclomatic Complexity, Cognitive Complexity,
 * and various method-level metrics.
 *
 * Key features:
 * - Cyclomatic complexity (McCabe)
 * - Cognitive complexity (Sonar-style)
 * - Lines of code metrics
 * - Parameter count metrics
 * - Nesting depth analysis
 */

import type { ParserRuleContext } from "antlr4ng";
import type { ComplexityMetrics, ControlFlowInfo } from "../types.js";
import { extractControlFlow } from "./control-flow-extractor.js";

// =============================================================================
// COMPLEXITY CALCULATION
// =============================================================================

/**
 * Calculate complexity metrics for a method
 */
export function calculateComplexity(bodyCtx: ParserRuleContext | null, code?: string): ComplexityMetrics {
  const metrics: ComplexityMetrics = {
    cyclomatic: 1, // Base complexity
    cognitive: 0,
    linesOfCode: 0,
    linesOfLogic: 0,
    nestingDepth: 0,
    parameterCount: 0,
    returnCount: 0,
  };

  if (!bodyCtx) return metrics;

  // Extract control flow for complexity calculation
  const controlFlow = extractControlFlow(bodyCtx);

  // Calculate cyclomatic complexity
  metrics.cyclomatic = calculateCyclomaticComplexity(controlFlow);

  // Calculate cognitive complexity
  metrics.cognitive = calculateCognitiveComplexity(bodyCtx, controlFlow);

  // Calculate lines of code
  if (code) {
    metrics.linesOfCode = calculateLinesOfCode(code);
  } else {
    const text = bodyCtx.getText?.() || "";
    metrics.linesOfCode = calculateLinesOfCode(text);
  }

  // Calculate nesting depth
  metrics.nestingDepth = calculateNestingDepth(bodyCtx);

  return metrics;
}

/**
 * Calculate cyclomatic complexity (McCabe's metric)
 *
 * Formula: V(G) = E - N + 2P
 * Simplified: 1 + number of decision points
 *
 * Decision points:
 * - if, else if
 * - for, while, do-while
 * - case (in switch)
 * - catch
 * - ternary operator
 * - && and || operators
 */
export function calculateCyclomaticComplexity(controlFlow: ControlFlowInfo): number {
  let complexity = 1; // Base complexity

  // Count branches (decision points)
  for (const branch of controlFlow.branches) {
    switch (branch.type) {
      case "if":
      case "else-if":
      case "case":
      case "ternary":
        complexity++;
        break;
      // 'else' and 'default' don't add to cyclomatic complexity
    }
  }

  // Count loops
  complexity += controlFlow.loops.length;

  // Count catch blocks
  const catchCount = controlFlow.exceptions.filter((e) => e.type === "catch").length;
  complexity += catchCount;

  return complexity;
}

/**
 * Calculate cognitive complexity (Sonar-style)
 *
 * Based on:
 * 1. Inherent complexity: increment for each control structure
 * 2. Nesting penalty: additional increment for each nesting level
 * 3. Structural breaks: increment for breaks from linear flow
 */
export function calculateCognitiveComplexity(bodyCtx: ParserRuleContext, controlFlow: ControlFlowInfo): number {
  let complexity = 0;

  // Track nesting levels
  const nestingLevels = new Map<number, number>();

  // Process branches with nesting
  for (const branch of controlFlow.branches) {
    const line = branch.location.start.line;
    const nesting = nestingLevels.get(line) || 0;

    switch (branch.type) {
      case "if":
        complexity += 1 + nesting; // +1 base, +nesting penalty
        nestingLevels.set(line, nesting + 1);
        break;
      case "else-if":
        complexity += 1; // No nesting penalty for else-if
        break;
      case "else":
        complexity += 1; // +1 for else
        break;
      case "switch":
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "case":
        // Cases don't add cognitive complexity individually
        break;
      case "ternary":
        complexity += 1 + nesting;
        break;
    }
  }

  // Process loops with nesting
  for (const loop of controlFlow.loops) {
    const line = loop.location.start.line;
    const nesting = nestingLevels.get(line) || 0;
    complexity += 1 + nesting;
    nestingLevels.set(line, nesting + 1);
  }

  // Process exception handling
  for (const exc of controlFlow.exceptions) {
    if (exc.type === "catch") {
      complexity += 1; // Each catch adds complexity
    }
  }

  // Check for logical operators in conditions (adds complexity)
  const text = bodyCtx.getText?.() || "";
  const andOrCount = (text.match(/&&|\|\|/g) || []).length;
  complexity += andOrCount;

  return complexity;
}

// =============================================================================
// LINES OF CODE METRICS
// =============================================================================

/**
 * Calculate lines of code metrics
 */
export function calculateLinesOfCode(code: string): number {
  // Split into lines
  const lines = code.split("\n");

  // Count non-empty, non-comment lines
  let loc = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) continue;

    // Handle block comments
    if (inBlockComment) {
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    // Start of block comment
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      continue;
    }

    // Skip line comments
    if (trimmed.startsWith("//")) continue;

    loc++;
  }

  return loc;
}

/**
 * Calculate source lines of code (SLOC) - physical lines
 */
export function calculatePhysicalLines(code: string): number {
  return code.split("\n").length;
}

/**
 * Calculate comment density
 */
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
// NESTING DEPTH ANALYSIS
// =============================================================================

/**
 * Calculate maximum nesting depth
 */
export function calculateNestingDepth(bodyCtx: ParserRuleContext): number {
  let maxDepth = 0;
  let currentDepth = 0;

  visitForNesting(
    bodyCtx,
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

/**
 * Visit nodes to track nesting
 */
function visitForNesting(node: ParserRuleContext, onEnter: () => void, onExit: () => void): void {
  const nodeName = node.constructor.name;

  // Check if this is a nesting structure
  const nestingStructures = [
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

  const isNesting = nestingStructures.includes(nodeName);

  if (isNesting) {
    onEnter();
  }

  // Recurse into children
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i);
    if (child && "ruleIndex" in child) {
      visitForNesting(child as ParserRuleContext, onEnter, onExit);
    }
  }

  if (isNesting) {
    onExit();
  }
}

// =============================================================================
// CLASS-LEVEL METRICS
// =============================================================================

/**
 * Calculate class-level complexity metrics
 */
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
    weightedMethodsPerClass: totalCyclomatic, // WMC = sum of cyclomatic complexities
  };
}

// =============================================================================
// THRESHOLDS AND RATINGS
// =============================================================================

/**
 * Complexity thresholds
 */
export const COMPLEXITY_THRESHOLDS = {
  cyclomatic: {
    low: 10,
    medium: 20,
    high: 50,
  },
  cognitive: {
    low: 15,
    medium: 30,
    high: 60,
  },
  linesOfCode: {
    low: 20,
    medium: 50,
    high: 100,
  },
  nestingDepth: {
    low: 3,
    medium: 5,
    high: 7,
  },
};

/**
 * Get complexity rating
 */
export function getComplexityRating(metrics: ComplexityMetrics): "low" | "medium" | "high" | "very-high" {
  // Check cyclomatic
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.high) {
    return "very-high";
  }
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium) {
    return "high";
  }
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.low) {
    return "medium";
  }

  // Check cognitive
  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.high) {
    return "very-high";
  }
  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium) {
    return "high";
  }
  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.low) {
    return "medium";
  }

  // Check nesting
  if (metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.high) {
    return "high";
  }
  if (metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.medium) {
    return "medium";
  }

  return "low";
}

/**
 * Get refactoring suggestions based on complexity
 */
export function getRefactoringSuggestions(metrics: ComplexityMetrics): string[] {
  const suggestions: string[] = [];

  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium) {
    suggestions.push("Consider breaking down this method into smaller methods");
  }

  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium) {
    suggestions.push("Consider simplifying control flow to reduce cognitive load");
  }

  if (metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.medium) {
    suggestions.push("Consider using early returns or extracting nested code");
  }

  if (metrics.linesOfCode > COMPLEXITY_THRESHOLDS.linesOfCode.high) {
    suggestions.push("Method is too long, consider splitting into smaller units");
  }

  if (metrics.parameterCount > 5) {
    suggestions.push("Too many parameters, consider using a parameter object");
  }

  return suggestions;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format complexity metrics for display
 */
export function formatComplexityMetrics(metrics: ComplexityMetrics): string {
  return [
    `Cyclomatic: ${metrics.cyclomatic}`,
    `Cognitive: ${metrics.cognitive}`,
    `LOC: ${metrics.linesOfCode}`,
    `Nesting: ${metrics.nestingDepth}`,
    `Params: ${metrics.parameterCount}`,
  ].join(", ");
}

/**
 * Check if method exceeds complexity thresholds
 */
export function exceedsThresholds(metrics: ComplexityMetrics): boolean {
  return (
    metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium ||
    metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium ||
    metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.medium ||
    metrics.linesOfCode > COMPLEXITY_THRESHOLDS.linesOfCode.high
  );
}
