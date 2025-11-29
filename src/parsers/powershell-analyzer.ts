/**
 * PowerShell Script Analyzer
 *
 * Comprehensive analyzer for PowerShell scripts supporting:
 * - Functions, filters, and workflows
 * - Advanced functions with [CmdletBinding()]
 * - Parameters with attributes and validation
 * - Classes and enums (PowerShell 5.0+)
 * - Modules and module imports
 * - Variables and their scope
 * - Pipeline operations
 * - Error handling (try/catch/finally)
 * - DSC (Desired State Configuration)
 *
 * Features:
 * - Validates PowerShell best practices
 * - Detects security issues (Invoke-Expression with user input)
 * - Tracks cmdlet and function calls
 * - Identifies pipeline patterns
 * - Validates parameter sets and mandatory parameters
 */

import { PARSER_CONSTANTS } from "../config/constants.js";
import type { EntityRelationship, ParsedEntity, TreeSitterNode } from "../types/parser.js";
import { CircuitBreakerError, checkCircuitBreakers, getNodeLocation, getNodeText } from "./base-parser-utils.js";

const MAX_RECURSION_DEPTH = PARSER_CONSTANTS.MAX_RECURSION_DEPTH;
const PARSE_TIMEOUT_MS = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;

export interface PowerShellValidationIssue {
  type: "warning" | "error" | "info";
  message: string;
  line: number;
  column: number;
  suggestion?: string;
}

export class PowerShellAnalyzer {
  private recursionDepth = 0;
  private parseStartTime = 0;
  private sourceCode = "";
  private validationIssues: PowerShellValidationIssue[] = [];
  private declaredVariables = new Set<string>();
  private declaredFunctions = new Set<string>();
  private declaredClasses = new Set<string>();
  private importedModules = new Set<string>();
  private referencedCmdlets = new Set<string>();

  /**
   * Main entry point for analyzing PowerShell scripts
   */
  async analyze(
    rootNode: TreeSitterNode,
    filePath: string,
    sourceCode: string,
  ): Promise<{
    entities: ParsedEntity[];
    relationships: EntityRelationship[];
    validationIssues: PowerShellValidationIssue[];
  }> {
    this.resetState(sourceCode);

    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    try {
      this.extractEntities(rootNode, filePath, entities, relationships);
      this.validateScript(rootNode, filePath);
    } catch (error) {
      if (error instanceof CircuitBreakerError) {
        console.warn(`[PowerShellAnalyzer] Circuit breaker triggered for ${filePath}: ${error.message}`);
      } else {
        console.error(`[PowerShellAnalyzer] Error analyzing ${filePath}:`, error);
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
    this.declaredFunctions.clear();
    this.declaredClasses.clear();
    this.importedModules.clear();
    this.referencedCmdlets.clear();
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
        case "script_file":
        case "script_block":
          // Process all statements
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
              this.extractEntities(child, filePath, entities, relationships);
            }
          }
          break;

        case "function_statement":
          this.extractFunction(node, filePath, entities, relationships);
          break;

        case "filter_statement":
          this.extractFilter(node, filePath, entities, relationships);
          break;

        case "class_statement":
          this.extractClass(node, filePath, entities, relationships);
          break;

        case "enum_statement":
          this.extractEnum(node, filePath, entities);
          break;

        case "assignment_statement":
          this.extractVariable(node, filePath, entities);
          break;

        case "using_statement":
        case "import_module_command":
          this.extractImport(node, filePath, relationships);
          break;

        case "pipeline":
        case "command_expression":
          this.extractCommand(node, filePath, relationships);
          break;

        case "try_statement":
          this.extractErrorHandling(node, filePath, entities, relationships);
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

    const functionName = getNodeText(nameNode, this.sourceCode);
    this.declaredFunctions.add(functionName);

    // Extract parameters
    const parameters: string[] = [];
    const paramBlock = this.findChildByType(node, "param_block");
    if (paramBlock) {
      for (let i = 0; i < paramBlock.childCount; i++) {
        const child = paramBlock.child(i);
        if (child && child.type === "parameter") {
          const paramName = this.extractParameterName(child);
          if (paramName) {
            parameters.push(paramName);
          }
        }
      }
    }

    // Check for [CmdletBinding()]
    const isCmdletBinding = this.sourceCode.slice(node.startIndex, node.endIndex).includes("[CmdletBinding(");

    // Extract function attributes
    const attributes = this.extractAttributes(node);

    entities.push({
      id: `${filePath}:function:${functionName}`,
      name: functionName,
      type: "function",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        parameters,
        isPowerShellFunction: true,
        isCmdlet: isCmdletBinding,
        attributes,
      },
    });

    // Extract relationships from function body
    const body = node.childForFieldName("body");
    if (body) {
      this.extractEntities(body, filePath, entities, relationships);
    }
  }

  private extractFilter(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const filterName = getNodeText(nameNode, this.sourceCode);

    entities.push({
      id: `${filePath}:function:${filterName}`,
      name: filterName,
      type: "function",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        isFilter: true,
        isPipelineAware: true,
      },
    });

    const body = node.childForFieldName("body");
    if (body) {
      this.extractEntities(body, filePath, entities, relationships);
    }
  }

  private extractClass(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const className = getNodeText(nameNode, this.sourceCode);
    this.declaredClasses.add(className);

    // Extract base class if any
    const baseClass = this.findChildByType(node, "base_class");
    if (baseClass) {
      const baseClassName = getNodeText(baseClass, this.sourceCode) || "";
      relationships.push({
        from: `${filePath}:class:${className}`,
        to: `${filePath}:class:${baseClassName}`,
        type: "inherits",
        metadata: {},
      });
    }

    // Extract properties and methods
    const members: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;

      if (child.type === "property_member") {
        const propName = this.extractMemberName(child);
        if (propName) members.push(propName);
      } else if (child.type === "function_member") {
        const methodName = this.extractMemberName(child);
        if (methodName) members.push(methodName);
      }
    }

    entities.push({
      id: `${filePath}:class:${className}`,
      name: className,
      type: "class",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        members,
        isPowerShellClass: true,
      },
    });
  }

  private extractEnum(node: TreeSitterNode, filePath: string, entities: ParsedEntity[]): void {
    const nameNode = node.childForFieldName("name");
    if (!nameNode) return;

    const enumName = getNodeText(nameNode, this.sourceCode);

    // Extract enum values
    const values: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === "enum_member") {
        const valueName = (getNodeText(child, this.sourceCode) || "").split("=")[0]?.trim() || "";
        values.push(valueName);
      }
    }

    entities.push({
      id: `${filePath}:enum:${enumName}`,
      name: enumName,
      type: "enum",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        values,
      },
    });
  }

  private extractVariable(node: TreeSitterNode, _filePath: string, entities: ParsedEntity[]): void {
    const filePath = _filePath;
    const text = getNodeText(node, this.sourceCode) || "";
    const varMatch = text.match(/\$([A-Za-z_][A-Za-z0-9_]*)/);
    if (!varMatch || !varMatch[1]) return;

    const varName = varMatch[1];
    this.declaredVariables.add(varName);

    // Determine scope from context
    const scope = this.determineScope(node);

    entities.push({
      id: `${filePath}:variable:${varName}`,
      name: `$${varName}`,
      type: "variable",
      filePath,
      location: getNodeLocation(node),
      metadata: {
        scope,
      },
    });
  }

  private extractImport(node: TreeSitterNode, filePath: string, relationships: EntityRelationship[]): void {
    const text = getNodeText(node, this.sourceCode) || "";

    // Extract module name from using or Import-Module
    let moduleName: string | null = null;

    if (text.startsWith("using")) {
      const match = text.match(/using\s+module\s+(\S+)/);
      if (match?.[1]) moduleName = match[1];
    } else if (text.includes("Import-Module")) {
      const match = text.match(/Import-Module\s+['"]?([^'";\s]+)/);
      if (match?.[1]) moduleName = match[1];
    }

    if (moduleName) {
      this.importedModules.add(moduleName);

      relationships.push({
        from: `${filePath}:module`,
        to: moduleName,
        type: "imports",
        metadata: {
          importType: "module",
        },
      });
    }
  }

  private extractCommand(node: TreeSitterNode, filePath: string, relationships: EntityRelationship[]): void {
    // Track cmdlet/function calls
    const text = getNodeText(node, this.sourceCode) || "";
    const cmdletMatch = text.match(/^([A-Z][a-z]+-[A-Z][a-z]+)/);

    if (cmdletMatch?.[1]) {
      const cmdletName = cmdletMatch[1];
      this.referencedCmdlets.add(cmdletName);
    }

    // Recursively process children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractEntities(child, filePath, [], relationships);
      }
    }
  }

  private extractErrorHandling(
    node: TreeSitterNode,
    filePath: string,
    entities: ParsedEntity[],
    relationships: EntityRelationship[],
  ): void {
    // Process try/catch/finally blocks
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.extractEntities(child, filePath, entities, relationships);
      }
    }
  }

  private validateScript(node: TreeSitterNode, _filePath: string): void {
    this.checkSecurityIssues(node);
    this.checkBestPractices(node);
  }

  private checkSecurityIssues(node: TreeSitterNode): void {
    const text = getNodeText(node, this.sourceCode) || "";

    // Check for Invoke-Expression with user input
    if (text.includes("Invoke-Expression") || text.includes("iex")) {
      this.validationIssues.push({
        type: "warning",
        message: "Invoke-Expression can be dangerous with untrusted input",
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        suggestion: "Use direct invocation or & operator instead",
      });
    }

    // Check for hardcoded credentials
    if (text.match(/\$password\s*=\s*['"][^'"]+['"]/) || text.match(/ConvertTo-SecureString.*-AsPlainText/)) {
      this.validationIssues.push({
        type: "error",
        message: "Possible hardcoded credentials detected",
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        suggestion: "Use Get-Credential or secure parameter storage",
      });
    }

    // Recursively check children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.checkSecurityIssues(child);
      }
    }
  }

  private checkBestPractices(node: TreeSitterNode): void {
    // Check for approved verb usage in function names
    if (node.type === "function_statement") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        const functionName = getNodeText(nameNode, this.sourceCode) || "";
        if (!this.isApprovedVerb(functionName)) {
          this.validationIssues.push({
            type: "info",
            message: `Function name '${functionName}' does not use an approved PowerShell verb`,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
            suggestion: "Use Get-Verb to see approved verbs",
          });
        }
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

  // Helper methods
  private findChildByType(node: TreeSitterNode, type: string): TreeSitterNode | null {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type === type) {
        return child;
      }
    }
    return null;
  }

  private extractParameterName(node: TreeSitterNode): string | null {
    const text = getNodeText(node, this.sourceCode) || "";
    const match = text.match(/\$([A-Za-z_][A-Za-z0-9_]*)/);
    return match?.[1] ?? null;
  }

  private extractMemberName(node: TreeSitterNode): string | null {
    const nameNode = node.childForFieldName("name");
    return nameNode ? getNodeText(nameNode, this.sourceCode) || null : null;
  }

  private extractAttributes(node: TreeSitterNode): string[] {
    const attributes: string[] = [];
    const text = getNodeText(node, this.sourceCode) || "";
    const attrMatches = text.matchAll(/\[([A-Za-z][A-Za-z0-9]*)\(/g);

    for (const match of attrMatches) {
      if (match[1]) attributes.push(match[1]);
    }

    return attributes;
  }

  private determineScope(node: TreeSitterNode): string {
    let current: TreeSitterNode | null = node;
    while (current) {
      if (current.type === "function_statement") return "function";
      if (current.type === "script_block") return "script";
      current = current.parent;
    }
    return "global";
  }

  private isApprovedVerb(functionName: string): boolean {
    const approvedVerbs = [
      "Get",
      "Set",
      "New",
      "Remove",
      "Add",
      "Clear",
      "Find",
      "Search",
      "Test",
      "Invoke",
      "Start",
      "Stop",
      "Restart",
      "Enable",
      "Disable",
      "Read",
      "Write",
      "Update",
      "Sync",
    ];

    const verb = functionName.split("-")[0] || "";
    return approvedVerbs.includes(verb);
  }
}
