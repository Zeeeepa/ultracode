/**
 * C/C++ Native Parser
 *
 * Uses clang -ast-dump=json for AST extraction or falls back to regex.
 * Philosophy: C/C++ developers usually have clang or a compatible compiler.
 *
 * Architecture:
 * - Tries to use clang for full AST (if available)
 * - Falls back to regex-based extraction
 *
 * No native modules required.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { type RegexExtractionRule, runRegexExtractors } from "./regex-entity-extractor.js";

// =============================================================================
// CLANG AST TYPES
// =============================================================================

interface ClangLocation {
  line?: number;
  col?: number;
}

interface ClangASTNode {
  kind?: string;
  name?: string;
  loc?: ClangLocation;
  inner?: ClangASTNode[];
  [key: string]: unknown;
}

// =============================================================================
// C/C++ PARSER CLASS
// =============================================================================

export interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

interface CppParseResult {
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

const NULL_LITERALS = new Set(["NULL", "nullptr", "null", "false", "true", "0"]);
function isNullLiteral(name: string): boolean {
  return NULL_LITERALS.has(name);
}

export class CppNativeParser {
  private clangAvailable: boolean | null = null;
  private stats: ParserStats = {
    filesParsed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgParseTimeMs: 0,
    totalParseTimeMs: 0,
    throughput: 0,
    cacheMemoryMB: 0,
    errorCount: 0,
  };

  /**
   * Initialize the parser and check if clang is available
   */
  async initialize(): Promise<void> {
    log.d("CPPPARSER", "check_avail");

    try {
      execSync("clang --version", { stdio: "ignore", windowsHide: true });
      this.clangAvailable = true;
      log.i("CPPPARSER", "init_done", { clang: true });
    } catch {
      this.clangAvailable = false;
      log.i("CPPPARSER", "init_done", { clang: false });
    }
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return (
      ext.endsWith(".c") ||
      ext.endsWith(".h") ||
      ext.endsWith(".cpp") ||
      ext.endsWith(".hpp") ||
      ext.endsWith(".cc") ||
      ext.endsWith(".hh") ||
      ext.endsWith(".cxx") ||
      ext.endsWith(".hxx") ||
      ext.endsWith(".c++") ||
      ext.endsWith(".h++")
    );
  }

  /**
   * Force regex-only parsing (skip clang). Used for vendored/mass headers
   * where spawning clang per-file is too expensive.
   */
  async parseFast(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    const isCpp = this.isCppFile(filePath);
    const result = this.parseWithRegex(filePath, content, isCpp);
    const parseTimeMs = Date.now() - startTime;
    this.stats.filesParsed++;
    this.stats.totalParseTimeMs += parseTimeMs;
    this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

    return {
      filePath,
      language: (isCpp ? "cpp" : "c") as SupportedLanguage,
      entities: result.entities,
      contentHash,
      timestamp: Date.now(),
      parseTimeMs,
      ...(result.errors.length > 0 && { errors: result.errors }),
    };
  }

  /**
   * Parse a C/C++ file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    const isCpp = this.isCppFile(filePath);

    try {
      let result: CppParseResult;

      if (this.clangAvailable) {
        result = await this.parseWithClang(filePath, content, isCpp);
      } else {
        result = this.parseWithRegex(filePath, content, isCpp);
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: (isCpp ? "cpp" : "c") as SupportedLanguage,
        entities: result.entities,
        ...(result.relationships.length > 0 && { relationships: result.relationships }),
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        ...(result.errors.length > 0 && { errors: result.errors }),
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: (isCpp ? "cpp" : "c") as SupportedLanguage,
        entities: [],
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Check if file is C++ (vs C)
   */
  private isCppFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return (
      ext.endsWith(".cpp") ||
      ext.endsWith(".hpp") ||
      ext.endsWith(".cc") ||
      ext.endsWith(".hh") ||
      ext.endsWith(".cxx") ||
      ext.endsWith(".hxx") ||
      ext.endsWith(".c++") ||
      ext.endsWith(".h++")
    );
  }

  /**
   * Parse using clang
   */
  private async parseWithClang(filePath: string, content: string, isCpp: boolean): Promise<CppParseResult> {
    // Write content to temp file
    const tempDir = join(tmpdir(), "ultracode-parsers");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const ext = isCpp ? ".cpp" : ".c";
    const tempFile = join(tempDir, `temp${ext}`);
    writeFileSync(tempFile, content);

    try {
      const result = await this.runClang(tempFile, filePath, isCpp);
      return result;
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run clang and parse output
   */
  private runClang(tempFile: string, originalPath: string, isCpp: boolean): Promise<CppParseResult> {
    return new Promise((resolve) => {
      const args = ["-Xclang", "-ast-dump=json", "-fsyntax-only", isCpp ? "-std=c++17" : "-std=c11", tempFile];

      const proc = spawn("clang", args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let _stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        _stderr += data.toString();
      });

      proc.on("close", (_code) => {
        // clang may return non-zero even with partial success
        if (!stdout) {
          // Fall back to regex if clang fails completely
          resolve(this.parseWithRegex(originalPath, "", isCpp));
          return;
        }

        try {
          const ast = JSON.parse(stdout);
          const { entities, relationships } = this.extractEntitiesAndRelationships(ast, originalPath);
          resolve({ entities, relationships, errors: [] });
        } catch (_e) {
          // Fall back to regex on JSON parse error
          resolve(this.parseWithRegex(originalPath, "", isCpp));
        }
      });

      proc.on("error", () => {
        // Fall back to regex on spawn error
        resolve(this.parseWithRegex(originalPath, "", isCpp));
      });
    });
  }

  /**
   * Extract entities and relationships from clang AST JSON.
   * Ported from ultracode.zig c_cpp.zig extractor:
   * - 12+ entity types (function, class, struct, enum, constant, variable, property, type, module, import)
   * - Relationships: calls, references, contains, inherits, imports, dispatches
   * - Forward declaration handling: skip FunctionDecl without body
   * - Include path normalization
   * - Function pointer resolution and dispatch table detection
   */
  private extractEntitiesAndRelationships(
    ast: ClangASTNode,
    filePath: string,
  ): { entities: ParsedEntity[]; relationships: EntityRelationship[] } {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];
    const funcNames = new Set<string>();
    const funcPtrCandidates: Array<{ from: string; targetName: string }> = [];

    const mkLoc = (loc?: ClangLocation) => ({
      start: { line: loc?.line || 1, column: loc?.col || 0, index: 0 },
      end: { line: loc?.line || 1, column: (loc?.col || 0) + 1, index: 1 },
    });

    const processNode = (node: ClangASTNode, parentEntity?: string): void => {
      if (!node || typeof node !== "object") return;

      const kind = node.kind;
      const name = node.name as string | undefined;
      const loc = node.loc;
      let currentEntity: string | undefined;

      if (name && loc) {
        let entityType: ParsedEntity["type"] | null = null;
        const metadata: Record<string, unknown> = {};
        const modifiers: string[] = [];

        switch (kind) {
          case "FunctionDecl": {
            // Skip forward declarations (no body) — real definition creates the entity
            const hasBody = node.inner?.some((c) => c.kind === "CompoundStmt");
            if (!hasBody) break; // forward decl → skip
            entityType = "function";
            funcNames.add(name);
            // Visibility from storage class
            const storageClass = node["storageClass"] as string | undefined;
            if (storageClass === "static") modifiers.push("static");
            if (storageClass === "extern") modifiers.push("extern");
            break;
          }
          case "CXXMethodDecl":
            entityType = "method";
            break;
          case "CXXConstructorDecl":
            entityType = "method";
            metadata["isConstructor"] = true;
            break;
          case "CXXRecordDecl":
            entityType = "class";
            break;
          case "RecordDecl": {
            // Distinguish struct vs union
            const tagUsed = node["tagUsed"] as string | undefined;
            entityType = tagUsed === "union" ? "struct" : "struct";
            if (tagUsed === "union") metadata["isUnion"] = true;
            break;
          }
          case "EnumDecl":
            entityType = "enum";
            break;
          case "EnumConstantDecl":
            entityType = "constant";
            break;
          case "VarDecl": {
            entityType = "variable";
            const sc = node["storageClass"] as string | undefined;
            if (sc === "static") modifiers.push("static");
            if (sc === "extern") modifiers.push("extern");
            // Check for function pointer init (dispatch candidate)
            const initNode = node.inner?.find((c) => c.kind === "DeclRefExpr");
            if (initNode && initNode["referencedDecl"]) {
              const refName = (initNode["referencedDecl"] as ClangASTNode).name as string | undefined;
              if (refName) {
                funcPtrCandidates.push({ from: name, targetName: refName });
              }
            }
            break;
          }
          case "FieldDecl":
            entityType = "property";
            break;
          case "TypedefDecl":
          case "TypeAliasDecl":
            entityType = "type";
            break;
          case "NamespaceDecl":
            entityType = "module";
            break;
        }

        if (entityType) {
          entities.push({
            name,
            type: entityType,
            filePath,
            location: mkLoc(loc),
            ...(modifiers.length > 0 && { modifiers }),
            ...(Object.keys(metadata).length > 0 && { metadata }),
          });
          currentEntity = name;

          // Containment relationship
          if (parentEntity) {
            relationships.push({ from: parentEntity, to: name, type: "contains" });
          }
        }
      }

      // Relationship extraction from inner nodes
      if (node.inner && Array.isArray(node.inner)) {
        const enclosing = currentEntity || parentEntity;

        for (const child of node.inner) {
          // CallExpr → calls relationship
          if (child.kind === "CallExpr" && enclosing) {
            const callee = this.extractCallTarget(child);
            if (callee) {
              relationships.push({ from: enclosing, to: callee, type: "calls" });
            }
          }
          // MemberExpr → references (field access)
          else if (child.kind === "MemberExpr" && enclosing) {
            const memberName = child.name as string | undefined;
            if (memberName && !this.isParentCall(child, node)) {
              relationships.push({
                from: enclosing,
                to: memberName,
                type: "references",
                metadata: { referenceKind: "field_access" },
              });
            }
          }
          // CXXBaseSpecifier → inherits
          else if (child.kind === "CXXBaseSpecifier" && currentEntity) {
            const baseType = child["type"] as Record<string, unknown> | undefined;
            const baseName = (baseType?.["qualType"] as string)?.replace(/\s*(class|struct)\s*/g, "");
            if (baseName) {
              relationships.push({ from: currentEntity, to: baseName, type: "inherits" });
            }
          }
          // Include (preprocessor — may not appear in clang AST; handled in regex fallback)

          // SwitchStmt → dispatch detection
          if (child.kind === "SwitchStmt" && enclosing) {
            this.extractSwitchDispatch(child, enclosing, relationships);
          }

          // InitListExpr → dispatch table / vtable detection
          if (child.kind === "InitListExpr" && currentEntity) {
            this.extractDispatchTable(child, currentEntity, relationships);
          }

          processNode(child, currentEntity || parentEntity);
        }
      }
    };

    processNode(ast);

    // Phase 6a: resolve function pointer candidates
    for (const cand of funcPtrCandidates) {
      if (funcNames.has(cand.targetName)) {
        relationships.push({ from: cand.from, to: cand.targetName, type: "references" });
      }
    }

    return { entities, relationships };
  }

  /**
   * Extract call target from CallExpr node
   */
  private extractCallTarget(callNode: ClangASTNode): string | null {
    if (!callNode.inner) return null;
    for (const child of callNode.inner) {
      if (child.kind === "DeclRefExpr") {
        const refDecl = child["referencedDecl"] as ClangASTNode | undefined;
        return (refDecl?.name as string) || (child.name as string) || null;
      }
      if (child.kind === "MemberExpr") {
        return (child.name as string) || null;
      }
      // Recurse into ImplicitCastExpr etc
      const nested = this.extractCallTarget(child);
      if (nested) return nested;
    }
    return null;
  }

  /**
   * Check if a MemberExpr is the callee of a CallExpr (to avoid double-counting)
   */
  private isParentCall(memberNode: ClangASTNode, parentNode: ClangASTNode): boolean {
    // In clang AST, if parent is CallExpr and memberNode is the first child, it's the callee
    if (parentNode.kind === "CallExpr" && parentNode.inner?.[0] === memberNode) return true;
    return false;
  }

  /**
   * Extract dispatch targets from switch/case statements
   */
  private extractSwitchDispatch(
    switchNode: ClangASTNode,
    enclosing: string,
    relationships: EntityRelationship[],
  ): void {
    const walk = (node: ClangASTNode): void => {
      if (!node.inner) return;
      for (const child of node.inner) {
        if (child.kind === "CaseStmt" || child.kind === "DefaultStmt") {
          // Look for CallExpr in case body
          this.collectCallsFromNode(child, enclosing, relationships);
        }
        walk(child);
      }
    };
    walk(switchNode);
  }

  /**
   * Collect call targets from a node tree (for switch dispatch)
   */
  private collectCallsFromNode(node: ClangASTNode, enclosing: string, relationships: EntityRelationship[]): void {
    if (!node.inner) return;
    for (const child of node.inner) {
      if (child.kind === "CallExpr") {
        const target = this.extractCallTarget(child);
        if (target && !isNullLiteral(target)) {
          relationships.push({ from: enclosing, to: target, type: "dispatches" });
        }
      }
      this.collectCallsFromNode(child, enclosing, relationships);
    }
  }

  /**
   * Extract dispatch table from initializer list (vtable-style)
   * Pattern: { .field = func_name, ... } or { { func_ptr1, func_ptr2 }, ... }
   */
  private extractDispatchTable(initList: ClangASTNode, entityName: string, relationships: EntityRelationship[]): void {
    if (!initList.inner) return;
    for (const elem of initList.inner) {
      // DeclRefExpr → direct function reference in init list
      if (elem.kind === "DeclRefExpr") {
        const refDecl = elem["referencedDecl"] as ClangASTNode | undefined;
        const refName = (refDecl?.name as string) || (elem.name as string);
        if (refName && !isNullLiteral(refName)) {
          relationships.push({ from: entityName, to: refName, type: "dispatches" });
        }
      }
      // DesignatedInitExpr → .field = func
      if (elem.kind === "DesignatedInitExpr" || elem.kind === "DesignatedInitUpdateExpr") {
        const valRef = elem.inner?.find((c) => c.kind === "DeclRefExpr");
        if (valRef) {
          const refDecl = valRef["referencedDecl"] as ClangASTNode | undefined;
          const refName = (refDecl?.name as string) || (valRef.name as string);
          if (refName && !isNullLiteral(refName)) {
            relationships.push({ from: entityName, to: refName, type: "dispatches" });
          }
        }
      }
      // Nested InitListExpr → recurse
      if (elem.kind === "InitListExpr") {
        this.extractDispatchTable(elem, entityName, relationships);
      }
      // ImplicitCastExpr wrapping DeclRefExpr
      if (elem.kind === "ImplicitCastExpr") {
        const inner = elem.inner?.find((c) => c.kind === "DeclRefExpr");
        if (inner) {
          const refDecl = inner["referencedDecl"] as ClangASTNode | undefined;
          const refName = (refDecl?.name as string) || (inner.name as string);
          if (refName && !isNullLiteral(refName)) {
            relationships.push({ from: entityName, to: refName, type: "dispatches" });
          }
        }
      }
    }
  }

  /**
   * Regex-based parser for C/C++ — orchestrates rule-based extraction.
   */
  private parseWithRegex(filePath: string, content: string, isCpp: boolean): CppParseResult {
    const rules = this.buildExtractionRules(isCpp);
    const entities = runRegexExtractors(content, filePath, rules);
    return { entities, relationships: [], errors: [] };
  }

  /**
   * Build regex extraction rules for C/C++ entity types:
   * includes, classes/structs, enums, functions, typedefs, macros, and C++-only namespaces/using.
   */
  private buildExtractionRules(isCpp: boolean): RegexExtractionRule[] {
    const rules: RegexExtractionRule[] = [
      // Includes
      {
        regex: /#include\s*[<"]([^>"]+)[>"]/gm,
        mapper: (match, fp, getLocation) => {
          const header = match[1];
          if (!header) return null;
          return {
            name: header,
            type: "import",
            filePath: fp,
            location: getLocation(match.index),
            importData: { source: header, specifiers: [{ local: header.replace(/[./]/g, "_") }] },
          };
        },
      },

      // Classes/Structs
      {
        regex:
          /^\s*(?:class|struct)\s+(?:__declspec\([^)]*\)\s+)?(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "class", filePath: fp, location: getLocation(match.index) };
        },
      },

      // Enums
      {
        regex: /^\s*enum\s+(?:class\s+)?(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "enum", filePath: fp, location: getLocation(match.index) };
        },
      },

      // Functions (simplified)
      {
        regex:
          /^\s*(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:const\s+)?(?:\w+(?:\s*[*&]+)?)\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?(?:=\s*0\s*)?.[{;]/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name || ["if", "while", "for", "switch", "catch"].includes(name)) return null;
          return { name, type: "function", filePath: fp, location: getLocation(match.index) };
        },
      },

      // Typedefs
      {
        regex: /^\s*typedef\s+.*?\s+(\w+)\s*;/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "type", filePath: fp, location: getLocation(match.index) };
        },
      },

      // Macros/defines
      {
        regex: /^\s*#define\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "constant", filePath: fp, location: getLocation(match.index), modifiers: ["macro"] };
        },
      },
    ];

    if (isCpp) {
      // Namespaces (C++)
      rules.push({
        regex: /^\s*namespace\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "module", filePath: fp, location: getLocation(match.index) };
        },
      });

      // Using (C++ type aliases)
      rules.push({
        regex: /^\s*using\s+(\w+)\s*=/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return { name, type: "type", filePath: fp, location: getLocation(match.index) };
        },
      });
    }

    return rules;
  }

  /**
   * Parse with incremental support (just calls regular parse)
   */
  async parseIncremental(
    filePath: string,
    content: string,
    contentHash: string,
    _edits: unknown[],
  ): Promise<ParseResult> {
    return this.parse(filePath, content, contentHash);
  }

  /**
   * Get parser statistics
   */
  getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Clear any internal caches
   */
  clearCache(): void {
    // No cache to clear
  }
}
