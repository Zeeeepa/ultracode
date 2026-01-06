/**
 * Bash Native Parser
 *
 * Uses shfmt for AST extraction or falls back to regex.
 * Philosophy: Shell developers often have shfmt or can use regex fallback.
 *
 * Architecture:
 * - Tries to use shfmt -tojson for AST (if available)
 * - Falls back to regex-based extraction
 *
 * No native modules required.
 */

import { execSync, spawn } from "node:child_process";
import { log } from "../logging/index.js";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";

// =============================================================================
// BASH PARSER CLASS
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

interface BashParseResult {
  entities: ParsedEntity[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

export class BashNativeParser {
  private shfmtAvailable: boolean | null = null;
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
   * Initialize the parser and check if shfmt is available
   */
  async initialize(): Promise<void> {
    log.d("BASHPARSER", "check_avail");

    try {
      execSync("shfmt --version", { stdio: "ignore", windowsHide: true });
      this.shfmtAvailable = true;
      log.i("BASHPARSER", "init_done", { shfmt: true });
    } catch {
      this.shfmtAvailable = false;
      log.i("BASHPARSER", "init_done", { shfmt: false });
    }
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return (
      ext.endsWith(".sh") ||
      ext.endsWith(".bash") ||
      ext.endsWith(".zsh") ||
      ext.endsWith(".bashrc") ||
      ext.endsWith(".zshrc") ||
      ext.endsWith(".profile")
    );
  }

  /**
   * Parse a Bash file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      let result: BashParseResult;

      if (this.shfmtAvailable) {
        result = await this.parseWithShfmt(filePath, content);
      } else {
        result = this.parseWithRegex(filePath, content);
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "bash" as SupportedLanguage,
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
        language: "bash" as SupportedLanguage,
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
   * Parse using shfmt
   */
  private parseWithShfmt(filePath: string, content: string): Promise<BashParseResult> {
    return new Promise((resolve) => {
      const proc = spawn("shfmt", ["-tojson"], {
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

      proc.stdin.write(content);
      proc.stdin.end();

      proc.on("close", (code) => {
        if (code !== 0 || !stdout) {
          // Fall back to regex
          resolve(this.parseWithRegex(filePath, content));
          return;
        }

        try {
          const ast = JSON.parse(stdout);
          const entities = this.extractEntitiesFromShfmtAST(ast, filePath);
          resolve({ entities, errors: [] });
        } catch {
          // Fall back to regex
          resolve(this.parseWithRegex(filePath, content));
        }
      });

      proc.on("error", () => {
        resolve(this.parseWithRegex(filePath, content));
      });
    });
  }

  /**
   * Extract entities from shfmt AST
   */
  private extractEntitiesFromShfmtAST(ast: any, filePath: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    const processNode = (node: any) => {
      if (!node || typeof node !== "object") return;

      // Function definition
      if (node.Type === "FuncDecl" && node.Name) {
        entities.push({
          name: node.Name.Value || node.Name,
          type: "function",
          filePath,
          location: {
            start: { line: node.Pos?.Line || 1, column: node.Pos?.Col || 0, index: node.Pos?.Offset || 0 },
            end: { line: node.End?.Line || 1, column: node.End?.Col || 0, index: node.End?.Offset || 0 },
          },
        });
      }

      // Process children
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            processNode(child);
          }
        } else if (typeof value === "object" && value !== null) {
          processNode(value);
        }
      }
    };

    processNode(ast);
    return entities;
  }

  /**
   * Regex-based parser for Bash
   */
  private parseWithRegex(filePath: string, content: string): BashParseResult {
    const entities: ParsedEntity[] = [];
    let match: RegExpExecArray | null;

    // Shebang
    const shebangMatch = /^#!\s*(.+)$/m.exec(content);
    if (shebangMatch?.[1]) {
      entities.push({
        name: shebangMatch[1],
        type: "module",
        filePath,
        location: this.getLocationFromIndex(content, 0),
        metadata: { shebang: shebangMatch[1] },
      });
    }

    // Source/import statements
    const sourceRe = /^\s*(?:source|\.|\.)\s+["']?([^"'\s]+)["']?/gm;
    while ((match = sourceRe.exec(content))) {
      const source = match[1];
      if (!source) continue;
      entities.push({
        name: source,
        type: "import",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        importData: {
          source,
          specifiers: [{ local: source.split("/").pop() || source }],
        },
      });
    }

    // Functions - multiple patterns
    // Pattern 1: function name { or function name() {
    const funcRe1 = /^\s*function\s+(\w+)\s*(?:\(\s*\))?\s*\{/gm;
    while ((match = funcRe1.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
      });
    }

    // Pattern 2: name() {
    const funcRe2 = /^\s*(\w+)\s*\(\s*\)\s*\{/gm;
    while ((match = funcRe2.exec(content))) {
      const name = match[1];
      if (!name || name === "function") continue;
      // Avoid duplicates
      if (!entities.some((e) => e.name === name && e.type === "function")) {
        entities.push({
          name,
          type: "function",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
        });
      }
    }

    // Variables (exported or readonly)
    const varRe = /^\s*(?:export|readonly|declare(?:\s+-[a-zA-Z]+)*)\s+(\w+)(?:=|$)/gm;
    while ((match = varRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      const isExport = match[0].includes("export");
      const isReadonly = match[0].includes("readonly");
      const modifiers: string[] = [];
      if (isExport) modifiers.push("export");
      if (isReadonly) modifiers.push("readonly");

      entities.push({
        name,
        type: isReadonly ? "constant" : "variable",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        ...(modifiers.length > 0 && { modifiers }),
      });
    }

    // Aliases
    const aliasRe = /^\s*alias\s+(\w+)=/gm;
    while ((match = aliasRe.exec(content))) {
      const name = match[1];
      if (!name) continue;
      entities.push({
        name,
        type: "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: ["alias"],
      });
    }

    return { entities, errors: [] };
  }

  /**
   * Get location from character index
   */
  private getLocationFromIndex(content: string, index: number): ParsedEntity["location"] {
    let line = 1;
    let column = 0;
    for (let i = 0; i < index; i++) {
      if (content[i] === "\n") {
        line++;
        column = 0;
      } else {
        column++;
      }
    }

    return {
      start: { line, column, index },
      end: { line, column: column + 1, index: index + 1 },
    };
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
