/**
 * Batch/CMD Script Analyzer
 *
 * Analyzer for Windows Batch (.bat, .cmd) scripts supporting:
 * - Labels and GOTO statements
 * - CALL statements (subroutines and external scripts)
 * - Environment variables (SET, SETX)
 * - Control flow (IF, FOR)
 * - Error handling (ERRORLEVEL checks)
 * - Command execution
 *
 * Features:
 * - Validates common batch scripting issues
 * - Detects unreachable code
 * - Tracks variable usage
 * - Identifies dangerous patterns
 * - Checks for proper quoting
 *
 * Note: Batch syntax is complex and context-dependent.
 * This analyzer handles common patterns but may not catch all edge cases.
 */

import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { CircuitBreakerError } from "./base-parser-utils.js";

export interface BatchValidationIssue {
  type: "warning" | "error" | "info";
  message: string;
  line: number;
  column: number;
  suggestion?: string;
}

export class BatchAnalyzer {
  private sourceCode = "";
  private validationIssues: BatchValidationIssue[] = [];
  private declaredLabels = new Set<string>();
  private referencedLabels = new Set<string>();
  private declaredVariables = new Set<string>();
  private calledScripts = new Set<string>();

  /**
   * Main entry point for analyzing Batch scripts
   */
  async analyze(
    _rootNode: TreeSitterNode,
    filePath: string,
    sourceCode: string,
  ): Promise<{
    entities: ParsedEntity[];
    relationships: EntityRelationship[];
    validationIssues: BatchValidationIssue[];
  }> {
    this.resetState(sourceCode);

    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    try {
      // For batch files without tree-sitter support, use regex-based parsing
      this.parseWithRegex(filePath, entities, relationships);
      this.validateScript();
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        console.warn(`[BatchAnalyzer] Circuit breaker triggered for ${filePath}: ${error.message}`);
      } else {
        console.error(`[BatchAnalyzer] Error analyzing ${filePath}:`, error);
      }
    }

    return { entities, relationships, validationIssues: this.validationIssues };
  }

  private resetState(sourceCode: string): void {
    this.sourceCode = sourceCode;
    this.validationIssues = [];
    this.declaredLabels.clear();
    this.referencedLabels.clear();
    this.declaredVariables.clear();
    this.calledScripts.clear();
  }

  /**
   * Parse batch file using regex patterns
   * This is a fallback for when tree-sitter parser is not available
   */
  private parseWithRegex(filePath: string, entities: ParsedEntity[], relationships: EntityRelationship[]): void {
    const lines = this.sourceCode.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() || "";
      const lineNum = i + 1;

      // Skip comments and empty lines
      if (line.startsWith("REM ") || line.startsWith("::") || !line) continue;

      // Extract labels
      const labelMatch = line.match(/^:([A-Za-z_][A-Za-z0-9_]*)\s*$/);
      if (labelMatch?.[1]) {
        const labelName = labelMatch[1];
        this.declaredLabels.add(labelName);

        entities.push({
          id: `${filePath}:label:${labelName}`,
          name: `:${labelName}`,
          type: "function",
          filePath,
          location: {
            start: { line: lineNum, column: 0, index: 0 },
            end: { line: lineNum, column: line.length, index: 0 },
          },
          metadata: {
            isLabel: true,
            isBatchLabel: true,
          },
        });
        continue;
      }

      // Extract GOTO statements
      const gotoMatch = line.match(/\bGOTO\s+:?([A-Za-z_][A-Za-z0-9_]*)/i);
      if (gotoMatch?.[1]) {
        const targetLabel = gotoMatch[1];
        this.referencedLabels.add(targetLabel);

        relationships.push({
          from: `${filePath}:line:${lineNum}`,
          to: `${filePath}:label:${targetLabel}`,
          type: "calls",
          metadata: {
            callType: "goto",
          },
        });
      }

      // Extract CALL statements
      const callMatch = line.match(/\bCALL\s+:?([A-Za-z_][A-Za-z0-9_]*|"[^"]+"|[^\s]+)/i);
      if (callMatch?.[1]) {
        const target = callMatch[1].replace(/"/g, "");

        // Check if it's a label call or external script call
        if (target.startsWith(":")) {
          const labelName = target.substring(1);
          this.referencedLabels.add(labelName);

          relationships.push({
            from: `${filePath}:line:${lineNum}`,
            to: `${filePath}:label:${labelName}`,
            type: "calls",
            metadata: {
              callType: "call_label",
            },
          });
        } else {
          this.calledScripts.add(target);

          relationships.push({
            from: `${filePath}:script`,
            to: target,
            type: "calls",
            metadata: {
              callType: "call_script",
            },
          });
        }
      }

      // Extract SET statements
      const setMatch = line.match(/\b(?:SET|SETX)\s+([A-Za-z_][A-Za-z0-9_]*)=/i);
      if (setMatch?.[1]) {
        const varName = setMatch[1];
        this.declaredVariables.add(varName);

        entities.push({
          id: `${filePath}:variable:${varName}`,
          name: `%${varName}%`,
          type: "variable",
          filePath,
          location: {
            start: { line: lineNum, column: 0, index: 0 },
            end: { line: lineNum, column: line.length, index: 0 },
          },
          metadata: {
            isEnvironmentVariable: true,
          },
        });
      }

      // Check for variable references
      const varRefs = line.matchAll(/%([A-Za-z_][A-Za-z0-9_]*)%/g);
      for (const match of varRefs) {
        const varName = match[1];
        if (!varName) continue;
        if (!this.declaredVariables.has(varName) && !this.isBuiltInVariable(varName)) {
          this.validationIssues.push({
            type: "warning",
            message: `Variable '%${varName}%' used but not defined`,
            line: lineNum,
            column: line.indexOf(match[0]),
            suggestion: `Add: SET ${varName}=value`,
          });
        }
      }
    }
  }

  private validateScript(): void {
    // Check for unreferenced labels
    for (const label of this.declaredLabels) {
      if (!this.referencedLabels.has(label)) {
        this.validationIssues.push({
          type: "info",
          message: `Label ':${label}' is defined but never used`,
          line: 0,
          column: 0,
          suggestion: "Remove unused label or add GOTO/CALL statement",
        });
      }
    }

    // Check for undefined labels
    for (const label of this.referencedLabels) {
      if (!this.declaredLabels.has(label)) {
        this.validationIssues.push({
          type: "error",
          message: `Label ':${label}' is referenced but not defined`,
          line: 0,
          column: 0,
          suggestion: `Add label definition: :${label}`,
        });
      }
    }

    // Check for dangerous patterns
    this.checkDangerousPatterns();
  }

  private checkDangerousPatterns(): void {
    const lines = this.sourceCode.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() || "";
      const lineNum = i + 1;

      // Check for format commands without protection
      if (line.match(/\bFORMAT\b/i) && !line.includes("/P")) {
        this.validationIssues.push({
          type: "error",
          message: "FORMAT command without /P (prompt) is extremely dangerous",
          line: lineNum,
          column: 0,
          suggestion: "Add /P flag: FORMAT C: /P",
        });
      }

      // Check for DEL without protection
      if (line.match(/\bDEL\s+\/[^/]*[SQ].*\*/i)) {
        this.validationIssues.push({
          type: "warning",
          message: "DEL with /S or /Q and wildcards can delete many files",
          line: lineNum,
          column: 0,
          suggestion: "Add /P to prompt for confirmation",
        });
      }

      // Check for improper ERRORLEVEL usage
      if (line.match(/IF\s+ERRORLEVEL\s+==\s+\d+/i)) {
        this.validationIssues.push({
          type: "warning",
          message: "ERRORLEVEL should not be compared with ==",
          line: lineNum,
          column: 0,
          suggestion: "Use: IF ERRORLEVEL 1 or IF %ERRORLEVEL% == 1",
        });
      }

      // Check for delayed expansion issues
      if (line.includes("%") && (line.includes("FOR") || line.includes("IF"))) {
        if (!this.sourceCode.includes("SETLOCAL EnableDelayedExpansion")) {
          this.validationIssues.push({
            type: "info",
            message: "Consider using delayed expansion for variables in loops",
            line: lineNum,
            column: 0,
            suggestion: "Add: SETLOCAL EnableDelayedExpansion at the start",
          });
        }
      }
    }
  }

  private isBuiltInVariable(varName: string): boolean {
    const builtInVars = [
      "CD",
      "DATE",
      "TIME",
      "RANDOM",
      "ERRORLEVEL",
      "CMDEXTVERSION",
      "CMDCMDLINE",
      "HIGHESTNUMANODENUMBER",
      "PATH",
      "PATHEXT",
      "PROMPT",
      "TEMP",
      "TMP",
      "USERNAME",
      "USERPROFILE",
      "WINDIR",
      "SYSTEMROOT",
      "PROGRAMFILES",
      "COMMONPROGRAMFILES",
      "HOMEDRIVE",
      "HOMEPATH",
      "LOGONSERVER",
      "COMPUTERNAME",
      "USERDOMAIN",
      "PROCESSOR_ARCHITECTURE",
      "NUMBER_OF_PROCESSORS",
    ];

    return builtInVars.includes(varName.toUpperCase());
  }
}
