/**
 * Java Control Flow Extractor
 *
 * Extracts control flow structures from Java method bodies.
 * Handles branches (if/else/switch), loops (for/while/do-while),
 * exception handling (try/catch/finally/throw), and return statements.
 *
 * Key features:
 * - Extracts conditional branches with conditions
 * - Extracts loop constructs
 * - Extracts exception handling patterns
 * - Extracts return statements
 * - Critical for trace_flow and trace_backwards functionality
 */

import type { ParserRuleContext } from "antlr4ng";
import type { ControlFlowInfo } from "../types.js";
import { getLocation } from "../utils/ast-helpers.js";

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract control flow information from a method body
 */
export function extractControlFlow(bodyCtx: ParserRuleContext | null): ControlFlowInfo {
  const result: ControlFlowInfo = {
    branches: [],
    loops: [],
    exceptions: [],
    returns: [],
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
  if (nodeName === "IfThenStatementContext" || nodeName === "IfThenElseStatementContext") {
    extractIfStatement(node, result);
  }

  if (nodeName === "SwitchStatementContext" || nodeName === "SwitchExpressionContext") {
    extractSwitchStatement(node, result);
  }

  if (nodeName === "ConditionalExpressionContext") {
    extractTernaryExpression(node, result);
  }

  // Loop extraction
  if (nodeName === "BasicForStatementContext" || nodeName === "ForStatementContext") {
    extractForLoop(node, result);
  }

  if (nodeName === "EnhancedForStatementContext") {
    extractEnhancedForLoop(node, result);
  }

  if (nodeName === "WhileStatementContext") {
    extractWhileLoop(node, result);
  }

  if (nodeName === "DoStatementContext") {
    extractDoWhileLoop(node, result);
  }

  // Exception handling
  if (nodeName === "TryStatementContext") {
    extractTryStatement(node, result);
  }

  if (nodeName === "ThrowStatementContext") {
    extractThrowStatement(node, result);
  }

  // Return extraction
  if (nodeName === "ReturnStatementContext") {
    extractReturnStatement(node, result);
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
 * Extract if/else statement
 */
function extractIfStatement(node: ParserRuleContext, result: ControlFlowInfo): void {
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
  const elseStatement = nodeAny.statement?.(1); // Second statement is else
  if (elseStatement) {
    // Check if it's else-if
    const elseIfThen = elseStatement.ifThenStatement?.();
    const elseIfThenElse = elseStatement.ifThenElseStatement?.();

    if (elseIfThen || elseIfThenElse) {
      // This is an 'else if', will be extracted separately
    } else {
      // Plain 'else'
      result.branches.push({
        type: "else",
        location: getLocation(elseStatement),
      });
    }
  }
}

/**
 * Extract switch statement
 */
function extractSwitchStatement(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Get selector expression
  const expression = nodeAny.expression?.();
  const condition = expression?.getText?.() || undefined;

  // Add switch branch
  result.branches.push({
    type: "switch",
    condition,
    location: getLocation(node),
  });

  // Extract case labels
  const switchBlock = nodeAny.switchBlock?.();
  if (switchBlock) {
    const switchRules = switchBlock.switchBlockStatementGroup?.() || [];
    const rules = Array.isArray(switchRules) ? switchRules : [switchRules];

    for (const rule of rules) {
      const switchLabels = rule.switchLabel?.() || [];
      const labels = Array.isArray(switchLabels) ? switchLabels : [switchLabels];

      for (const label of labels) {
        const caseConstant = label.caseConstant?.();
        const defaultKeyword = label.DEFAULT?.();

        if (defaultKeyword) {
          result.branches.push({
            type: "default",
            location: getLocation(label),
          });
        } else if (caseConstant) {
          result.branches.push({
            type: "case",
            condition: caseConstant.getText?.(),
            location: getLocation(label),
          });
        }
      }
    }
  }
}

/**
 * Extract ternary expression (conditional operator)
 */
function extractTernaryExpression(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Check if this is actually a ternary (has ? and :)
  const questionMark = nodeAny.QUESTION?.();
  if (!questionMark) return;

  // Get condition
  const expressions = nodeAny.conditionalOrExpression?.() || nodeAny.expression?.();
  const condition = expressions?.getText?.() || undefined;

  result.branches.push({
    type: "ternary",
    condition,
    location: getLocation(node),
  });
}

// =============================================================================
// LOOP EXTRACTION
// =============================================================================

/**
 * Extract basic for loop
 */
function extractForLoop(node: ParserRuleContext, result: ControlFlowInfo): void {
  result.loops.push({
    type: "for",
    location: getLocation(node),
  });
}

/**
 * Extract enhanced for loop (for-each)
 */
function extractEnhancedForLoop(node: ParserRuleContext, result: ControlFlowInfo): void {
  result.loops.push({
    type: "for-each",
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
 * Extract try statement with catch and finally
 */
function extractTryStatement(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Add 'try' block
  result.exceptions.push({
    type: "try",
    location: getLocation(node),
  });

  // Extract catch clauses
  const catches = nodeAny.catchClause?.() || nodeAny.catches?.()?.catchClause?.();
  if (catches) {
    const catchClauses = Array.isArray(catches) ? catches : [catches];

    for (const catchClause of catchClauses) {
      const catchFormalParam = catchClause.catchFormalParameter?.();
      let catchType: string | undefined;

      if (catchFormalParam) {
        const catchType1 = catchFormalParam.catchType?.();
        if (catchType1) {
          catchType = catchType1.getText?.();
        }
      }

      result.exceptions.push({
        type: "catch",
        catchType,
        location: getLocation(catchClause),
      });
    }
  }

  // Extract finally clause
  const finallyBlock = nodeAny.finally_?.() || nodeAny.finallyBlock?.();
  if (finallyBlock) {
    result.exceptions.push({
      type: "finally",
      location: getLocation(finallyBlock),
    });
  }
}

/**
 * Extract throw statement
 */
function extractThrowStatement(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Get the exception type from the expression
  const expression = nodeAny.expression?.();
  let throwType: string | undefined;

  if (expression) {
    // Try to get the type from new expression
    const text = expression.getText?.() || "";
    const newMatch = text.match(/^new\s+(\w+)/);
    if (newMatch) {
      throwType = newMatch[1];
    }
  }

  result.exceptions.push({
    type: "throw",
    catchType: throwType, // Reusing catchType field for thrown type
    location: getLocation(node),
  });
}

// =============================================================================
// RETURN EXTRACTION
// =============================================================================

/**
 * Extract return statement
 */
function extractReturnStatement(node: ParserRuleContext, result: ControlFlowInfo): void {
  const nodeAny = node as any;

  // Check if return has a value
  const expression = nodeAny.expression?.();
  const hasValue = expression !== null && expression !== undefined;

  result.returns.push({
    location: getLocation(node),
    hasValue,
  });
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
} {
  return {
    branchCount: controlFlow.branches.length,
    loopCount: controlFlow.loops.length,
    exceptionCount: controlFlow.exceptions.filter((e) => e.type === "try").length,
    returnCount: controlFlow.returns.length,
    hasEarlyReturn: controlFlow.returns.length > 1,
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
