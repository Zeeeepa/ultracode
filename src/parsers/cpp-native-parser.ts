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
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
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
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
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
          const entities = this.extractEntitiesFromClangAST(ast, originalPath);
          resolve({ entities, errors: [] });
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
   * Extract entities from clang AST JSON
   */
  private extractEntitiesFromClangAST(ast: ClangASTNode, filePath: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    const processNode = (node: ClangASTNode): void => {
      if (!node || typeof node !== "object") return;

      const kind = node.kind;
      const name = node.name;
      const loc = node.loc;

      if (name && loc) {
        let entityType: ParsedEntity["type"] | null = null;

        switch (kind) {
          case "FunctionDecl":
            entityType = "function";
            break;
          case "CXXMethodDecl":
            entityType = "function";
            break;
          case "CXXRecordDecl":
          case "RecordDecl":
            entityType = "class";
            break;
          case "EnumDecl":
            entityType = "enum";
            break;
          case "VarDecl":
            entityType = "variable";
            break;
          case "FieldDecl":
            entityType = "field";
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
            location: {
              start: { line: loc.line || 1, column: loc.col || 0, index: 0 },
              end: { line: loc.line || 1, column: (loc.col || 0) + 1, index: 1 },
            },
          });
        }
      }

      // Process children
      if (node.inner && Array.isArray(node.inner)) {
        for (const child of node.inner) {
          processNode(child);
        }
      }
    };

    processNode(ast);
    return entities;
  }

  /**
   * Regex-based parser for C/C++
   */
  private parseWithRegex(filePath: string, content: string, isCpp: boolean): CppParseResult {
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
            importData: {
              source: header,
              specifiers: [{ local: header.replace(/[./]/g, "_") }],
            },
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
          return {
            name,
            type: "class",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      },

      // Enums
      {
        regex: /^\s*enum\s+(?:class\s+)?(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "enum",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      },

      // Functions (simplified - won't catch all cases)
      {
        regex:
          /^\s*(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:const\s+)?(?:\w+(?:\s*[*&]+)?)\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?(?:=\s*0\s*)?.[{;]/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name || ["if", "while", "for", "switch", "catch"].includes(name)) return null;
          return {
            name,
            type: "function",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      },

      // Typedefs
      {
        regex: /^\s*typedef\s+.*?\s+(\w+)\s*;/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "type",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      },

      // Macros/defines
      {
        regex: /^\s*#define\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "constant",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: ["macro"],
          };
        },
      },
    ];

    // C++-only rules
    if (isCpp) {
      // Namespaces (C++)
      rules.push({
        regex: /^\s*namespace\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "module",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      });

      // Using (C++ type aliases)
      rules.push({
        regex: /^\s*using\s+(\w+)\s*=/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "type",
            filePath: fp,
            location: getLocation(match.index),
          };
        },
      });
    }

    const entities = runRegexExtractors(content, filePath, rules);
    return { entities, errors: [] };
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
