/**
 * Kotlin Complexity Analyzer
 *
 * Calculates complexity metrics for Kotlin functions and classes.
 * Implements: Cyclomatic Complexity, Cognitive Complexity,
 * and various function-level metrics.
 *
 * Key features:
 * - Cyclomatic complexity (McCabe)
 * - Cognitive complexity (Sonar-style)
 * - Kotlin-specific: when expressions, elvis operators, scope functions
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
 * Calculate complexity metrics for a function
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
  metrics.cyclomatic = calculateCyclomaticComplexity(controlFlow, bodyCtx);

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
 * Kotlin-specific considerations:
 * - 'when' expressions: each branch adds complexity
 * - Elvis operator (?.): adds complexity like ternary
 * - Safe calls (?.) with let/run: conditional execution
 */
export function calculateCyclomaticComplexity(controlFlow: ControlFlowInfo, bodyCtx?: ParserRuleContext): number {
  let complexity = 1; // Base complexity

  // Count branches (decision points)
  for (const branch of controlFlow.branches) {
    switch (branch.type) {
      case "if":
      case "else-if":
      case "when-entry": // Each when branch is a decision point
      case "elvis":
        complexity++;
        break;
      // 'else' in if and 'else' in when don't add to cyclomatic
      // 'when' itself doesn't add, only its entries
    }
  }

  // Count loops
  complexity += controlFlow.loops.length;

  // Count catch blocks
  const catchCount = controlFlow.exceptions.filter((e) => e.type === "catch").length;
  complexity += catchCount;

  // Kotlin-specific: safe calls with scope functions add complexity
  if (bodyCtx) {
    const text = bodyCtx.getText?.() || "";
    const safeLetCount = (text.match(/\?\.\s*let\s*\{/g) || []).length;
    const safeRunCount = (text.match(/\?\.\s*run\s*\{/g) || []).length;
    complexity += safeLetCount + safeRunCount;
  }

  return complexity;
}

/**
 * Calculate cognitive complexity (Sonar-style)
 *
 * Kotlin-specific:
 * - 'when' adds complexity + nesting penalty for each branch
 * - Elvis operator adds complexity
 * - Scope functions (.let, .run, .apply) in chains add cognitive load
 * - Extension functions may add complexity through implicit receivers
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
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "else-if":
        complexity += 1; // No nesting penalty
        break;
      case "else":
        complexity += 1;
        break;
      case "when":
        complexity += 1 + nesting;
        nestingLevels.set(line, nesting + 1);
        break;
      case "when-entry":
        // When entries don't add cognitive complexity individually
        // (already counted in 'when')
        break;
      case "elvis":
        complexity += 1 + nesting; // Elvis adds complexity
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
      complexity += 1;
    }
  }

  // Kotlin-specific: logical operators in conditions
  const text = bodyCtx.getText?.() || "";
  const andOrCount = (text.match(/&&|\|\|/g) || []).length;
  complexity += andOrCount;

  // Kotlin-specific: labeled returns add complexity
  const labeledReturns = (text.match(/return@\w+/g) || []).length;
  complexity += labeledReturns;

  // Kotlin-specific: nested scope functions add cognitive load
  const nestedScopeFunctions = countNestedScopeFunctions(text);
  complexity += nestedScopeFunctions;

  return complexity;
}

/**
 * Count nested scope function calls (adds cognitive complexity)
 */
function countNestedScopeFunctions(code: string): number {
  const scopeFunctions = ["let", "run", "with", "apply", "also"];
  let nestedCount = 0;

  // Simple heuristic: count chains of scope functions
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
// LINES OF CODE METRICS
// =============================================================================

/**
 * Calculate lines of code metrics
 */
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

/**
 * Calculate source lines of code (SLOC)
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

  // Kotlin nesting structures
  const nestingStructures = [
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
    weightedMethodsPerClass: totalCyclomatic,
  };
}

// =============================================================================
// KOTLIN-SPECIFIC METRICS
// =============================================================================

/**
 * Calculate Kotlin-specific complexity metrics
 */
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

/**
 * Calculate coroutine-related complexity
 */
function calculateCoroutineComplexity(code: string): number {
  let complexity = 0;

  // Coroutine builders
  complexity += (code.match(/\b(launch|async|runBlocking)\s*\{/g) || []).length;

  // Nested coroutines
  if (/launch\s*\{[\s\S]*?launch\s*\{/.test(code)) {
    complexity += 2;
  }

  // Flow operators chains
  const flowOperators = (code.match(/\.(map|filter|collect|flatMap|transform)\s*\{/g) || []).length;
  complexity += Math.floor(flowOperators / 3); // Penalty for long chains

  return complexity;
}

// =============================================================================
// THRESHOLDS AND RATINGS
// =============================================================================

/**
 * Complexity thresholds (Kotlin-specific, slightly different from Java)
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
    medium: 40, // Kotlin tends to be more concise
    high: 80,
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
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.high) {
    return "very-high";
  }
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium) {
    return "high";
  }
  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.low) {
    return "medium";
  }

  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.high) {
    return "very-high";
  }
  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium) {
    return "high";
  }
  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.low) {
    return "medium";
  }

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
export function getRefactoringSuggestions(metrics: ComplexityMetrics, code?: string): string[] {
  const suggestions: string[] = [];

  if (metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium) {
    suggestions.push("Consider breaking down this function into smaller functions");
  }

  if (metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium) {
    suggestions.push("Consider simplifying control flow to reduce cognitive load");
  }

  if (metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.medium) {
    suggestions.push("Consider using early returns or extracting nested code");
  }

  if (metrics.linesOfCode > COMPLEXITY_THRESHOLDS.linesOfCode.high) {
    suggestions.push("Function is too long, consider splitting into smaller units");
  }

  if (metrics.parameterCount > 5) {
    suggestions.push("Too many parameters, consider using a data class");
  }

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
 * Check if function exceeds complexity thresholds
 */
export function exceedsThresholds(metrics: ComplexityMetrics): boolean {
  return (
    metrics.cyclomatic > COMPLEXITY_THRESHOLDS.cyclomatic.medium ||
    metrics.cognitive > COMPLEXITY_THRESHOLDS.cognitive.medium ||
    metrics.nestingDepth > COMPLEXITY_THRESHOLDS.nestingDepth.medium ||
    metrics.linesOfCode > COMPLEXITY_THRESHOLDS.linesOfCode.high
  );
}
