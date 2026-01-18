/**
 * Kotlin Control Flow Extractor
 *
 * Extracts control flow structures from Kotlin function bodies.
 * Handles branches (if/else/when), loops (for/while/do-while),
 * exception handling (try/catch/finally/throw), return statements,
 * and Kotlin-specific constructs (elvis operator, when expressions).
 *
 * Key features:
 * - Extracts conditional branches with conditions
 * - Handles Kotlin 'when' expressions
 * - Handles elvis operator (?:)
 * - Extracts loop constructs
 * - Extracts exception handling patterns
 * - Extracts labeled returns
 * - Critical for trace_flow and trace_backwards functionality
 */

import type { ParserRuleContext } from "antlr4ng";
import type { ControlFlowInfo } from "../types.js";
import { getLocation } from "../utils/ast-helpers.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract control flow information from a function body
 */
export function extractControlFlow(bodyCtx: ParserRuleContext | null): ControlFlowInfo {
  const result: ControlFlowInfo = {
    branches: [],
    loops: [],
    exceptions: [],
    returns: [],
    awaits: [],
  };

  if (!bodyCtx) return result;

  visitNode(bodyCtx, result);

  return result;
}

// =============================================================================
// AST TRAVERSAL
// =============================================================================

/**
 * Recursively visit nodes to extract control flow
 */
function visitNode(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeName = node.constructor.name;

  // Branch extraction
  if (nodeName === "IfExpressionContext") {
    extractIfExpression(node, result);
  }

  if (nodeName === "WhenExpressionContext") {
    extractWhenExpression(node, result);
  }

  if (nodeName === "ElvisExpressionContext" || nodeName === "InfixFunctionCallContext") {
    extractElvisExpression(node, result);
  }

  // Loop extraction
  if (nodeName === "ForStatementContext") {
    extractForLoop(node, result);
  }

  if (nodeName === "WhileStatementContext") {
    extractWhileLoop(node, result);
  }

  if (nodeName === "DoWhileStatementContext") {
    extractDoWhileLoop(node, result);
  }

  // Exception handling
  if (nodeName === "TryExpressionContext") {
    extractTryExpression(node, result);
  }

  if (nodeName === "ThrowExpressionContext") {
    extractThrowExpression(node, result);
  }

  // Return extraction
  if (nodeName === "JumpExpressionContext") {
    extractJumpExpression(node, result);
  }

  // Recurse into children
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i);
    if (child && "ruleIndex" in child) {
      visitNode(child as ParserRuleContext, result);
    }
  }
}

// =============================================================================
// BRANCH EXTRACTION
// =============================================================================

/**
 * Extract if/else expression
 */
function extractIfExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Get the condition expression
  const expression = nodeAny.expression?.();
  const condition = expression?.getText?.() || undefined;

  // Add 'if' branch
  result.branches.push({
    type: "if",
    condition,
    location: getLocation(node),
  });

  // Check for else clause
  const elseKeyword = nodeAny.ELSE?.();
  if (elseKeyword) {
    // Get the else body (could be another if or a block)
    const controlStructureBody = nodeAny.controlStructureBody?.();
    if (Array.isArray(controlStructureBody) && controlStructureBody.length > 1) {
      const elseBody = controlStructureBody[1];

      // Check if it's else-if
      const nestedIf = elseBody?.statement?.()?.expression?.()?.ifExpression?.();
      if (nestedIf) {
        // This is an 'else if', it will be extracted in recursive call
        result.branches.push({
          type: "else-if",
          location: getLocation(elseBody),
        });
      } else {
        // Plain 'else'
        result.branches.push({
          type: "else",
          location: getLocation(elseBody || node),
        });
      }
    }
  }
}

/**
 * Extract when expression (Kotlin's pattern matching)
 */
function extractWhenExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Get subject expression
  const whenSubject = nodeAny.whenSubject?.();
  const condition = whenSubject?.expression?.()?.getText?.() || undefined;

  // Add 'when' branch
  result.branches.push({
    type: "when",
    condition,
    location: getLocation(node),
  });

  // Extract when entries
  const whenEntries = nodeAny.whenEntry?.() || [];
  const entries = Array.isArray(whenEntries) ? whenEntries : [whenEntries];

  for (const entry of entries) {
    if (!entry) continue;

    // Check for else branch
    const elseKeyword = entry.ELSE?.();
    if (elseKeyword) {
      result.branches.push({
        type: "else",
        location: getLocation(entry),
      });
    } else {
      // Regular when condition
      const whenCondition = entry.whenCondition?.();
      const conditions = Array.isArray(whenCondition) ? whenCondition : [whenCondition];

      for (const cond of conditions) {
        if (!cond) continue;
        result.branches.push({
          type: "when-entry",
          condition: cond.getText?.(),
          location: getLocation(cond),
        });
      }
    }
  }
}

/**
 * Extract elvis expression (?:)
 */
function extractElvisExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Check if this contains elvis operator
  const elvisToken = nodeAny.ELVIS?.() || nodeAny.elvis?.();
  if (!elvisToken) {
    // Check text for elvis pattern
    const text = node.getText?.() || "";
    if (!text.includes("?:")) return;
  }

  // Get the left-hand expression (what's being null-checked)
  const expressions = nodeAny.infixOperation?.() || nodeAny.elvisExpression?.();
  const condition = Array.isArray(expressions) ? expressions[0]?.getText?.() : expressions?.getText?.();

  result.branches.push({
    type: "elvis",
    condition,
    location: getLocation(node),
  });
}

// =============================================================================
// LOOP EXTRACTION
// =============================================================================

/**
 * Extract for loop
 */
function extractForLoop(node: ParserRuleContext, result: ControlFlowInfo): void {
  result.loops.push({
    type: "for",
    location: getLocation(node),
  });
}

/**
 * Extract while loop
 */
function extractWhileLoop(node: ParserRuleContext, result: ControlFlowInfo): void {
  result.loops.push({
    type: "while",
    location: getLocation(node),
  });
}

/**
 * Extract do-while loop
 */
function extractDoWhileLoop(node: ParserRuleContext, result: ControlFlowInfo): void {
  result.loops.push({
    type: "do-while",
    location: getLocation(node),
  });
}

// =============================================================================
// EXCEPTION HANDLING EXTRACTION
// =============================================================================

/**
 * Extract try expression with catch and finally
 */
function extractTryExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Add 'try' block
  result.exceptions.push({
    type: "try",
    location: getLocation(node),
  });

  // Extract catch blocks
  const catchBlocks = nodeAny.catchBlock?.() || [];
  const catches = Array.isArray(catchBlocks) ? catchBlocks : [catchBlocks];

  for (const catchBlock of catches) {
    if (!catchBlock) continue;

    // Get exception type from annotation (Kotlin catch uses type annotation)
    const typeRef = catchBlock.type?.() || catchBlock.userType?.();

    let catchType: string | undefined;
    if (typeRef) {
      catchType = typeRef.getText?.();
    }

    result.exceptions.push({
      type: "catch",
      catchType,
      location: getLocation(catchBlock),
    });
  }

  // Extract finally block
  const finallyBlock = nodeAny.finallyBlock?.();
  if (finallyBlock) {
    result.exceptions.push({
      type: "finally",
      location: getLocation(finallyBlock),
    });
  }
}

/**
 * Extract throw expression
 */
function extractThrowExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Get the exception expression
  const expression = nodeAny.expression?.();
  let throwType: string | undefined;

  if (expression) {
    const text = expression.getText?.() || "";
    // Try to extract type from constructor call
    const typeMatch = text.match(/^(\w+)\s*\(/);
    if (typeMatch) {
      throwType = typeMatch[1];
    }
  }

  result.exceptions.push({
    type: "throw",
    catchType: throwType,
    location: getLocation(node),
  });
}

// =============================================================================
// RETURN/JUMP EXTRACTION
// =============================================================================

/**
 * Extract jump expression (return, break, continue, throw)
 */
function extractJumpExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Check for return
  const returnKeyword = nodeAny.RETURN?.() || nodeAny.RETURN_AT?.();
  if (returnKeyword) {
    // Get return label if present (for labeled returns)
    let label: string | undefined;
    const returnAt = nodeAny.RETURN_AT?.();
    if (returnAt) {
      const text = returnAt.getText?.() || "";
      label = text.replace("return@", "");
    }

    // Check if return has a value
    const expression = nodeAny.expression?.();
    const hasValue = expression !== null && expression !== undefined;

    result.returns.push({
      location: getLocation(node),
      hasValue,
      ...(label && { label }),
    });
  }

  // Note: break and continue are not tracked as returns but could be added if needed
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get control flow statistics
 */
export function getControlFlowStats(controlFlow: ControlFlowInfo): {
  branchCount: number;
  loopCount: number;
  exceptionCount: number;
  returnCount: number;
  hasEarlyReturn: boolean;
  hasWhenExpression: boolean;
  hasElvisOperator: boolean;
} {
  return {
    branchCount: controlFlow.branches.length,
    loopCount: controlFlow.loops.length,
    exceptionCount: controlFlow.exceptions.filter((e) => e.type === "try").length,
    returnCount: controlFlow.returns.length,
    hasEarlyReturn: controlFlow.returns.length > 1,
    hasWhenExpression: controlFlow.branches.some((b) => b.type === "when"),
    hasElvisOperator: controlFlow.branches.some((b) => b.type === "elvis"),
  };
}

/**
 * Check if control flow has exception handling
 */
export function hasExceptionHandling(controlFlow: ControlFlowInfo): boolean {
  return controlFlow.exceptions.some((e) => e.type === "try");
}

/**
 * Get all caught exception types
 */
export function getCaughtExceptionTypes(controlFlow: ControlFlowInfo): string[] {
  return controlFlow.exceptions.filter((e) => e.type === "catch" && e.catchType).map((e) => e.catchType!);
}

/**
 * Check if function has labeled returns (common in lambdas)
 */
export function hasLabeledReturns(controlFlow: ControlFlowInfo): boolean {
  return controlFlow.returns.some((r) => r.label !== undefined);
}
