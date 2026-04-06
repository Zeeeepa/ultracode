/**
 * Rust Native Parser
 *
 * Uses ANTLR-based parsing with optional rust-analyzer enhancement.
 * Provides accurate AST parsing without external dependencies.
 *
 * Architecture:
 * - Uses ANTLR grammar for full AST parsing
 * - Falls back to regex-based extraction if ANTLR fails
 * - Optionally enhances with rust-analyzer info
 *
 * No native modules or Rust toolchain required - uses bundled ANTLR parser.
 */

import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { LineOffsetMap } from "./base-parser-utils.js";
import type { RegexExtractionRule } from "./regex-entity-extractor.js";
import { runRegexExtractors } from "./regex-entity-extractor.js";
import {
  enhanceWithRustAnalyzer,
  findCargoToml,
  findRustAnalyzer,
  getRustAnalyzerVersion,
  isRustAnalyzerAvailable,
  startRustAnalyzer,
  stopRustAnalyzer,
} from "./rust-analyzer-integration.js";

// Lazy-loaded ANTLR parser (loaded on first use to reduce initial bundle size)
type RustAntlrParserType = typeof import("./rust-antlr-parser.js").RustAntlrParser;
let RustAntlrParserClass: RustAntlrParserType | null = null;

async function getRustAntlrParser(): Promise<RustAntlrParserType> {
  if (!RustAntlrParserClass) {
    const module = await import("./rust-antlr-parser.js");
    RustAntlrParserClass = module.RustAntlrParser;
  }
  return RustAntlrParserClass;
}

// =============================================================================
// RUST PARSER CLASS
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

interface RustParseResult {
  entities: ParsedEntity[];
  errors: Array<{ message: string; location?: { line: number; column: number } }>;
}

export class RustNativeParser {
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

  private useAntlr = true; // Use ANTLR parser by default
  private rustAnalyzerEnabled = true; // Try to use rust-analyzer by default
  private useRustAnalyzerEnhancement = true; // Enhance with rust-analyzer info
  private currentWorkspace: string | null = null;

  /** Check if rust-analyzer is available */
  public get rustAnalyzerAvailable(): boolean {
    return isRustAnalyzerAvailable();
  }

  /**
   * Initialize the parser and check if rust-analyzer is available
   */
  async initialize(): Promise<void> {
    log.d("RUSTPARSER", "init_start");

    if (this.rustAnalyzerEnabled) {
      const raPath = await findRustAnalyzer();
      if (raPath) {
        const version = await getRustAnalyzerVersion();
        log.i("RUSTPARSER", "init_done", { ra: true, ver: version || "unknown" });
        return;
      }
    }

    log.i("RUSTPARSER", "init_done", { ra: false });
  }

  /**
   * Enable or disable rust-analyzer integration
   */
  setRustAnalyzerEnabled(enabled: boolean): void {
    this.rustAnalyzerEnabled = enabled;
  }

  /**
   * Enable or disable rust-analyzer enhancement
   */
  setRustAnalyzerEnhancementEnabled(enabled: boolean): void {
    this.useRustAnalyzerEnhancement = enabled;
  }

  /**
   * Start rust-analyzer for a workspace
   */
  async startForWorkspace(workspacePath: string): Promise<boolean> {
    if (!this.rustAnalyzerEnabled || !isRustAnalyzerAvailable()) {
      return false;
    }

    this.currentWorkspace = workspacePath;
    return startRustAnalyzer(workspacePath);
  }

  /**
   * Stop rust-analyzer
   */
  stop(): void {
    stopRustAnalyzer();
    this.currentWorkspace = null;
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".rs");
  }

  /**
   * Find the Cargo.toml workspace for a file
   */
  findWorkspace(filePath: string): string | null {
    return findCargoToml(filePath);
  }

  /**
   * Enable or disable ANTLR parser (falls back to regex if disabled)
   */
  setAntlrEnabled(enabled: boolean): void {
    this.useAntlr = enabled;
  }

  /**
   * Parse a Rust file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    log.d("RUSTPARSER", "parse_start", { file: filePath, size: content.length });

    try {
      let entities: ParsedEntity[];
      let relationships: EntityRelationship[] | undefined;
      let errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

      // Try ANTLR parser first (lazy-loaded)
      if (this.useAntlr) {
        try {
          log.d("RUSTPARSER", "try_antlr");
          const RustAntlrParser = await getRustAntlrParser();
          const antlrResult = RustAntlrParser.parse(filePath, content);
          entities = antlrResult.entities;
          relationships = antlrResult.relationships.length > 0 ? antlrResult.relationships : undefined;
          log.d("RUSTPARSER", "antlr_ok", { ent: entities.length, rel: relationships?.length || 0 });
        } catch (antlrError) {
          log.w("RUSTPARSER", "antlr_fail", { err: String(antlrError) });
          const result = this.parseWithRegex(filePath, content);
          entities = result.entities;
          errors = result.errors;
          log.d("RUSTPARSER", "regex_ok", { cnt: entities.length });
        }
      } else {
        // Fallback to regex-based parsing
        const result = this.parseWithRegex(filePath, content);
        entities = result.entities;
        errors = result.errors;
      }

      // Enhance with rust-analyzer if available and running
      if (
        this.useRustAnalyzerEnhancement &&
        isRustAnalyzerAvailable() &&
        this.currentWorkspace &&
        entities.length > 0
      ) {
        try {
          await enhanceWithRustAnalyzer(entities, filePath, content);
        } catch (raError) {
          log.d("RUSTPARSER", "ra_fail", { err: String(raError) });
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "rust" as SupportedLanguage,
        entities,
        relationships,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        ...(errors.length > 0 && { errors: errors }),
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: "rust" as SupportedLanguage,
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
   * Regex-based parser for Rust — orchestrates rule-based extraction + use statements.
   */
  private parseWithRegex(filePath: string, content: string): RustParseResult {
    const rules = this.buildExtractionRules();
    const entities = runRegexExtractors(content, filePath, rules);
    const useEntities = this.extractUseStatements(content, filePath);
    entities.push(...useEntities);
    return { entities, errors: [] };
  }

  /**
   * Build regex extraction rules for Rust entity types:
   * modules, structs, enums, traits, impl blocks, functions, constants, type aliases, macros.
   */
  private buildExtractionRules(): RegexExtractionRule[] {
    return [
      // Modules
      {
        regex: /^(?:pub\s+)?mod\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "module",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: match[0].includes("pub") ? ["pub"] : undefined,
          };
        },
      },

      // Structs
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)(?:<[^>]+>)?/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "class",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: match[0].includes("pub") ? ["pub"] : undefined,
          };
        },
      },

      // Enums
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)(?:<[^>]+>)?/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "enum",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: match[0].includes("pub") ? ["pub"] : undefined,
          };
        },
      },

      // Traits (interfaces)
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?trait\s+(\w+)(?:<[^>]+>)?/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          const modifiers: string[] = [];
          if (match[0].includes("pub")) modifiers.push("pub");
          if (match[0].includes("unsafe")) modifiers.push("unsafe");
          return {
            name,
            type: "interface",
            filePath: fp,
            location: getLocation(match.index),
            ...(modifiers.length > 0 && { modifiers }),
          };
        },
      },

      // Impl blocks
      {
        regex: /^impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)(?:<[^>]+>)?/gm,
        mapper: (match, fp, getLocation) => {
          const traitName = match[1];
          const typeName = match[2];
          if (!typeName) return null;
          return {
            name: traitName ? `${traitName} for ${typeName}` : `impl ${typeName}`,
            type: "class",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: ["impl"],
          };
        },
      },

      // Functions
      {
        regex:
          /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          const returnType = match[3]?.trim();
          const modifiers: string[] = [];
          if (match[0].includes("pub")) modifiers.push("pub");
          if (match[0].includes("async")) modifiers.push("async");
          if (match[0].includes("unsafe")) modifiers.push("unsafe");
          if (match[0].includes("const")) modifiers.push("const");

          return {
            name,
            type: modifiers.includes("async") ? "async_function" : "function",
            filePath: fp,
            location: getLocation(match.index),
            ...(modifiers.length > 0 && { modifiers }),
            parameters: this.parseParameters(match[2] || ""),
            ...(returnType && { returnType }),
          };
        },
      },

      // Constants and statics
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?(?:static\s+(?:mut\s+)?|const\s+)(\w+)\s*:\s*([^=]+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          const typeName = match[2]?.trim();
          const modifiers: string[] = [];
          if (match[0].includes("pub")) modifiers.push("pub");
          if (match[0].includes("static")) modifiers.push("static");
          if (match[0].includes("mut")) modifiers.push("mut");

          return {
            name,
            type: "constant",
            filePath: fp,
            location: getLocation(match.index),
            ...(modifiers.length > 0 && { modifiers }),
            metadata: typeName ? { constType: typeName } : undefined,
          };
        },
      },

      // Type aliases
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "type",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: match[0].includes("pub") ? ["pub"] : undefined,
          };
        },
      },

      // Macros
      {
        regex: /^(?:pub(?:\([^)]*\))?\s+)?macro_rules!\s+(\w+)/gm,
        mapper: (match, fp, getLocation) => {
          const name = match[1];
          if (!name) return null;
          return {
            name,
            type: "function",
            filePath: fp,
            location: getLocation(match.index),
            modifiers: ["macro"],
          };
        },
      },
    ];
  }

  /**
   * Extract use statements (imports) — handled separately because one match can produce multiple entities.
   */
  private extractUseStatements(content: string, filePath: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];
    const useRe = /^(?:pub\s+)?use\s+([\w:]+)(?:::\{([^}]+)\})?(?:\s+as\s+(\w+))?;/gm;
    const lineMap = new LineOffsetMap(content);
    const getLocation = (index: number) => lineMap.getEntityLocation(index);
    let match: RegExpExecArray | null;

    while ((match = useRe.exec(content))) {
      const path = match[1];
      const items = match[2];
      const alias = match[3];
      if (!path) continue;

      if (items) {
        for (const item of items.split(",").map((s) => s.trim())) {
          if (!item) continue;
          entities.push({
            name: item,
            type: "import",
            filePath,
            location: getLocation(match.index),
            importData: { source: path, specifiers: [{ local: item }] },
          });
        }
      } else {
        const localName = alias || path.split("::").pop() || path;
        entities.push({
          name: localName,
          type: "import",
          filePath,
          location: getLocation(match.index),
          importData: { source: path, specifiers: [{ local: localName }] },
        });
      }
    }

    return entities;
  }

  /**
   * Parse function parameters
   */
  private parseParameters(paramsStr: string): ParsedEntity["parameters"] {
    if (!paramsStr.trim()) return [];

    const params: ParsedEntity["parameters"] = [];
    // Handle &self, &mut self, self
    if (paramsStr.includes("self")) {
      params.push({
        name: "self",
        type: paramsStr.includes("&mut") ? "&mut Self" : paramsStr.includes("&") ? "&Self" : "Self",
      });
    }

    // Simple param extraction (name: type)
    const paramRe = /(\w+)\s*:\s*([^,]+)/g;
    let match: RegExpExecArray | null;
    while ((match = paramRe.exec(paramsStr))) {
      const name = match[1];
      const type = match[2]?.trim();
      if (name && name !== "self" && type) {
        params.push({ name, type });
      }
    }

    return params;
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
