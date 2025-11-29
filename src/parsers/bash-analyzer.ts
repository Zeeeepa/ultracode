/**
 * Bash/Shell Script Analyzer
 *
 * Comprehensive analyzer for Bash shell scripts supporting:
 * - Function declarations and definitions
 * - Variable assignments and exports
 * - Source/import statements
 * - Command execution and pipelines
 * - Control flow (if/while/for/case)
 * - String expansions and substitutions
 * - Error handling (set -e, trap)
 *
 * Features:
 * - Validates syntax and common issues (missing quotes, undefined variables)
 * - Detects dangerous patterns (eval, rm -rf without safeguards)
 * - Tracks variable scope and exports
 * - Identifies command dependencies
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { CircuitBreakerError, checkCircuitBreakers, getNodeLocation, getNodeText } from "./base-parser-utils.js";

const MAX_RECURSION_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const PARSE_TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

/**
 * Bash script validation issues
 */
export interface BashValidationIssue {
  type: "warning" | "error" | "info";
  message: string;
  line: number;
  column: number;
  suggestion?: string;
}

export class BashAnalyzer {
  private recursionDepth = 0;
  private parseStartTime = 0;
  private sourceCode = "";
  private validationIssues: BashValidationIssue[] = [];
  private declaredVariables = new Set<string>();
  private exportedVariables = new Set<string>();
  private definedFunctions = new Set<string>();
  private referencedCommands = new Set<string>();

  /**
   * Main entry point for analyzing Bash scripts
   */
  async analyze(
    rootNode: TreeSitterNode,
    filePath: string,
    sourceCode: string,
  ): Promise<{
    entities: ParsedEntity[];
    relationships: EntityRelationship[];
    validationIssues: BashValidationIssue[];
  }> {
    this.resetState(sourceCode);

    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    try {
      this.extractEntities(rootNode, filePath, entities, relationships);
      this.validateScript(rootNode, filePath);
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        console.warn(`[BashAnalyzer] Circuit breaker triggered for ${filePath}: ${error.message}`);
      } else {
        console.error(`[BashAnalyzer] Error analyzing ${filePath}:`, error);
      }
    }

    return { entities, relationships, validationIssues: this.validationIssues };
  }

  private resetState(sourceCode: string): void {
    this.recursionDepth = 0;
    this.parseStartTime = Date.now();
    this.sourceCode = sourceCode;
    this.validationIssues = [];
    this.declaredVariables.clear();
    this.exportedVariables.clear();
    this.definedFunctions.clear();
    this.referencedCommands.clear();
  }

  private extractEntities(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    this.recursionDepth++;
    checkCircuitBreakers(this.recursionDepth, this.parseStartTime, MAX_RECURSION_DEPTH, PARSE_TIMEOUT_MS);

    try {
      switch (node.type) {
        case "program":
          // Process all top-level statements
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              this.extractEntities(child, filePath, entities, relationships);
            }
          }
          break;

        case "function_definition":
          this.extractFunction(node, filePath, entities, relationships);
          break;

        case "variable_assignment":
          this.extractVariable(node, filePath, entities);
          break;

        case "declaration_command":
          this.extractDeclaration(node, filePath, entities);
          break;

        case "command":
          this.extractCommand(node, filePath, entities, relationships);
          break;

        case "redirected_statement":
        case "pipeline":
        case "list":
          // Process nested commands
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              this.extractEntities(child, filePath, entities, relationships);
            }
          }
          break;

        case "if_statement":
        case "while_statement":
        case "for_statement":
        case "case_statement":
          // Process control flow structures
          this.extractControlFlow(node, filePath, entities, relationships);
          break;

        default:
          // Recursively process children
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              this.extractEntities(child, filePath, entities, relationships);
            }
          }
      }
    } finally {
      this.recursionDepth--;
    }
  }

  private extractFunction(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const functionName = getNodeText(nameNode, this.sourceCode) || "";
    this.definedFunctions.add(functionName);

    const location = getNodeLocation(node);
    const body = node.childForFieldName("body");

    // Extract function parameters from comments or function body
    const parameters: string[] = [];
    if (body) {
      // Look for $1, $2, etc. in function body
      const bodyText = getNodeText(body, this.sourceCode) || "";
      const paramMatches = bodyText.matchAll(/\$(\d+)/g);
      const paramNumbers = new Set(
        Array.from(paramMatches, (m) => (m[1] ? Number.parseInt(m[1], 10) : 0)).filter((n) => n > 0),
      );
      if (paramNumbers.size > 0) {
        const maxParam = Math.max(...paramNumbers);
        for (let i = 1; i <= maxParam; i++) {
          parameters.push(`$${i}`);
        }
      }
    }

    entities.push({
      id: `${filePath}:function:${functionName}`,
      name: functionName,
      type: "function",
      filePath,
      location,
      metadata: {
        parameters,
        isBashFunction: true,
      },
    });

    // Extract relationships from function body
    if (body) {
      this.extractEntities(body, filePath, entities, relationships);
    }
  }

  private extractVariable(node: TreeSitterNode, _filePath: string, entities: ParsedEntity[]): void {
    const filePath = _filePath;
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const varName = getNodeText(nameNode, this.sourceCode);
    this.declaredVariables.add(varName);

    const valueNode = node.childForFieldName("value");
    const value = valueNode ? getNodeText(valueNode, this.sourceCode) : undefined;

    entities.push({
      id: `${filePath}:variable:${varName}`,
      name: varName,
      type: "variable",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        initialValue: value,
        isExported: this.exportedVariables.has(varName),
      },
    });
  }

  private extractDeclaration(node: TreeSitterNode, _filePath: string, entities: ParsedEntity[]): void {
    const filePath = _filePath;
    // Handle declare, local, export, readonly commands
    const commandName = getNodeText(node.child(0) || node, this.sourceCode);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child || child.type !== "variable_assignment") continue;

      const nameNode = child.childForFieldName("name");
      if (!nameNode) continue;

      const varName = getNodeText(nameNode, this.sourceCode);

      if (commandName.includes("export")) {
        this.exportedVariables.add(varName);
      }

      this.declaredVariables.add(varName);

      entities.push({
        id: `${filePath}:variable:${varName}`,
        name: varName,
        type: "variable",
        filePath,
        location: getNodeLocation(child),
        metadata: {
          declarationType: commandName,
          isExported: commandName.includes("export"),
          isReadonly: commandName.includes("readonly"),
          isLocal: commandName.includes("local"),
        },
      });
    }
  }

  private extractCommand(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    const commandName = node.childForFieldName("name");
    if (!commandName) return;

    const cmd = getNodeText(commandName, this.sourceCode);
    this.referencedCommands.add(cmd);

    // Check for source/dot commands (imports)
    if (cmd === "source" || cmd === ".") {
      const args = node.children.filter((c) => c.type === "word" || c.type === "string");
      if (args.length > 1) {
        const sourceFile = getNodeText(args[1], this.sourceCode).replace(/['"]/g, "");

        relationships.push({
          from: `${filePath}:module`,
          to: sourceFile,
          type: "imports",
          metadata: {
            importType: "source",
          },
        });
      }
    }

    // Recursively process command arguments
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractEntities(child, filePath, entities, relationships);
      }
    }
  }

  private extractControlFlow(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    // Process all children of control flow statements
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractEntities(child, filePath, entities, relationships);
      }
    }
  }

  private validateScript(node: TreeSitterNode, _filePath: string): void {
    this.checkUndefinedVariables(node);
    this.checkDangerousPatterns(node);
    this.checkBestPractices(node);
  }

  private checkUndefinedVariables(node: TreeSitterNode): void {
    if (node.type === "simple_expansion" || node.type === "expansion") {
      const varName = (getNodeText(node, this.sourceCode) || "").replace(/[${}]/g, "");

      // Skip special variables like $?, $@, $#, etc.
      if (/^[0-9@#?*!$-]$/.test(varName)) return;

      if (!this.declaredVariables.has(varName)) {
        this.validationIssues.push({
          type: "warning",
          message: `Variable '${varName}' is used but never declared`,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          suggestion: `Consider declaring with: ${varName}=""`,
        });
      }
    }

    // Recursively check children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.checkUndefinedVariables(child);
      }
    }
  }

  private checkDangerousPatterns(node: TreeSitterNode): void {
    const text = getNodeText(node, this.sourceCode) || "";

    // Check for dangerous rm commands
    if (node.type === "command" && text.includes("rm") && (text.includes("-rf") || text.includes("-fr"))) {
      if (!text.includes("$") || text.includes("rm -rf /")) {
        this.validationIssues.push({
          type: "error",
          message: "Dangerous rm -rf command detected",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          suggestion: "Add safeguards or validate paths before deletion",
        });
      }
    }

    // Check for eval usage
    if (text.includes("eval")) {
      this.validationIssues.push({
        type: "warning",
        message: "eval command can be dangerous with untrusted input",
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        suggestion: "Avoid eval if possible, or carefully validate input",
      });
    }

    // Recursively check children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.checkDangerousPatterns(child);
      }
    }
  }

  private checkBestPractices(node: TreeSitterNode): void {
    // Check for missing quotes in variable expansions
    if (node.type === "command") {
      const text = getNodeText(node, this.sourceCode) || "";

      // Look for unquoted variables in arguments
      const unquotedVars = text.match(/\s\$[A-Za-z_][A-Za-z0-9_]*(?!\})/g);
      if (unquotedVars && unquotedVars.length > 0) {
        this.validationIssues.push({
          type: "info",
          message: "Consider quoting variable expansions to prevent word splitting",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          suggestion: 'Use "$VAR" instead of $VAR',
        });
      }
    }

    // Recursively check children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.checkBestPractices(child);
      }
    }
  }
}
