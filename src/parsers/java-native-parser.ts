/**
 * Java Native Parser
 *
 * Uses Chevrotain-based java-parser for fast parsing (5-10x faster than ANTLR).
 * Falls back to ANTLR for complex cases or when Chevrotain fails.
 * Regex-based parsing as final fallback.
 *
 * Performance comparison:
 * - Chevrotain (java-parser): ~15-30ms/file
 * - ANTLR: ~150ms/file
 * - Regex: ~5-10ms/file (less accurate)
 *
 * No native modules or JDK required - uses bundled parsers.
 */

import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";

// Lazy-loaded Chevrotain parser (primary, faster)
type JavaChevrotainParserType = typeof import("./java-chevrotain-parser.js").JavaChevrotainParser;
let JavaChevrotainParserClass: JavaChevrotainParserType | null = null;

async function getJavaChevrotainParser(): Promise<JavaChevrotainParserType> {
  if (!JavaChevrotainParserClass) {
    const module = await import("./java-chevrotain-parser.js");
    JavaChevrotainParserClass = module.JavaChevrotainParser;
  }
  return JavaChevrotainParserClass;
}

// Lazy-loaded ANTLR parser (fallback, more accurate for edge cases)
type JavaAntlrParserType = typeof import("./java-antlr-parser.js").JavaAntlrParser;
let JavaAntlrParserClass: JavaAntlrParserType | null = null;

async function getJavaAntlrParser(): Promise<JavaAntlrParserType> {
  if (!JavaAntlrParserClass) {
    const module = await import("./java-antlr-parser.js");
    JavaAntlrParserClass = module.JavaAntlrParser;
  }
  return JavaAntlrParserClass;
}

// =============================================================================
// PARSER STATS
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

// =============================================================================
// JAVA PARSER CLASS
// =============================================================================

export class JavaNativeParser {
  private useChevrotain = true; // Use Chevrotain parser by default (faster)
  private useAntlrFallback = true; // Fall back to ANTLR on Chevrotain failure
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
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    log.i("JAVAPARSER", "init_done", { parser: "chevrotain" });
  }

  /**
   * Enable or disable Chevrotain parser
   */
  setChevrotainEnabled(enabled: boolean): void {
    this.useChevrotain = enabled;
  }

  /**
   * Enable or disable ANTLR fallback
   */
  setAntlrFallbackEnabled(enabled: boolean): void {
    this.useAntlrFallback = enabled;
  }

  /**
   * @deprecated Use setChevrotainEnabled instead
   */
  setAntlrEnabled(enabled: boolean): void {
    this.useAntlrFallback = enabled;
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".java");
  }

  /**
   * Parse a Java file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    log.d("JAVAPARSER", "parse_start", { file: filePath, size: content.length });

    try {
      let entities: ParsedEntity[];
      let relationships: EntityRelationship[] | undefined;
      const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

      // Try Chevrotain parser first (5-10x faster)
      if (this.useChevrotain) {
        try {
          log.d("JAVAPARSER", "try_chevrotain");
          const JavaChevrotainParser = await getJavaChevrotainParser();
          const result = JavaChevrotainParser.parse(filePath, content);
          entities = result.entities;
          relationships = result.relationships.length > 0 ? result.relationships : undefined;
          log.d("JAVAPARSER", "chevrotain_ok", { ent: entities.length, rel: relationships?.length || 0 });
        } catch (chevrotainError) {
          log.w("JAVAPARSER", "chevrotain_fail", { err: String(chevrotainError) });

          // Fallback to ANTLR if enabled
          if (this.useAntlrFallback) {
            try {
              log.d("JAVAPARSER", "try_antlr_fallback");
              const JavaAntlrParser = await getJavaAntlrParser();
              const antlrResult = JavaAntlrParser.parse(filePath, content);
              entities = antlrResult.entities;
              relationships = antlrResult.relationships.length > 0 ? antlrResult.relationships : undefined;
              log.d("JAVAPARSER", "antlr_fallback_ok", { ent: entities.length, rel: relationships?.length || 0 });
            } catch (antlrError) {
              log.w("JAVAPARSER", "antlr_fallback_fail", { err: String(antlrError) });
              entities = this.parseJava(filePath, content);
              log.d("JAVAPARSER", "regex_fallback_ok", { cnt: entities.length });
            }
          } else {
            entities = this.parseJava(filePath, content);
            log.d("JAVAPARSER", "regex_fallback_ok", { cnt: entities.length });
          }
        }
      } else if (this.useAntlrFallback) {
        // Only ANTLR (no Chevrotain)
        try {
          log.d("JAVAPARSER", "try_antlr");
          const JavaAntlrParser = await getJavaAntlrParser();
          const antlrResult = JavaAntlrParser.parse(filePath, content);
          entities = antlrResult.entities;
          relationships = antlrResult.relationships.length > 0 ? antlrResult.relationships : undefined;
          log.d("JAVAPARSER", "antlr_ok", { ent: entities.length, rel: relationships?.length || 0 });
        } catch (antlrError) {
          log.w("JAVAPARSER", "antlr_fail", { err: String(antlrError) });
          entities = this.parseJava(filePath, content);
          log.d("JAVAPARSER", "regex_ok", { cnt: entities.length });
        }
      } else {
        // Regex-only mode
        entities = this.parseJava(filePath, content);
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "java" as SupportedLanguage,
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
        language: "java" as SupportedLanguage,
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
   * Parse Java code using regex patterns
   */
  private parseJava(filePath: string, content: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    // Package declaration
    const packageMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(content);
    if (packageMatch?.[1]) {
      entities.push({
        name: packageMatch[1],
        type: "module",
        filePath,
        location: this.getLocationFromIndex(content, packageMatch.index),
      });
    }

    // Imports
    const importRe = /^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;/gm;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content))) {
      const importPath = match[1];
      if (!importPath) continue;
      const isStatic = match[0].includes("static");
      entities.push({
        name: importPath,
        type: "import",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: isStatic ? ["static"] : undefined,
        importData: {
          source: importPath,
          specifiers: [{ local: importPath.split(".").pop() || importPath }],
        },
      });
    }

    // Class/Interface/Enum/Record declarations
    const typeRe =
      /(?:^|\s)((?:public|private|protected|abstract|final|static|sealed|non-sealed)\s+)*(?:(class|interface|enum|record|@interface)\s+)(\w+)(?:\s*<[^>]+>)?(?:\s+extends\s+([\w.]+(?:\s*<[^>]+>)?(?:\s*,\s*[\w.]+(?:\s*<[^>]+>)?)*))?(?:\s+implements\s+([\w.]+(?:\s*<[^>]+>)?(?:\s*,\s*[\w.]+(?:\s*<[^>]+>)?)*))?(?:\s+permits\s+([\w.]+(?:\s*,\s*[\w.]+)*))?/gm;

    while ((match = typeRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const kind = match[2];
      const name = match[3];
      if (!kind || !name) continue;
      const extendsClause = match[4];
      const implementsClause = match[5];

      let entityType: ParsedEntity["type"] = "class";
      if (kind === "interface" || kind === "@interface") entityType = "interface";
      if (kind === "enum") entityType = "enum";

      const baseClasses: string[] = [];
      const interfaces: string[] = [];

      if (extendsClause) {
        if (kind === "interface") {
          // For interfaces, extends means interface inheritance
          interfaces.push(...extendsClause.split(",").map((s) => s.trim().replace(/<[^>]+>/, "")));
        } else {
          baseClasses.push(...extendsClause.split(",").map((s) => s.trim().replace(/<[^>]+>/, "")));
        }
      }
      if (implementsClause) {
        interfaces.push(...implementsClause.split(",").map((s) => s.trim().replace(/<[^>]+>/, "")));
      }

      const entity: ParsedEntity = {
        name,
        type: entityType,
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        ...(modifiers.length > 0 && { modifiers: modifiers }),
        inheritance:
          baseClasses.length > 0 || interfaces.length > 0
            ? {
                baseClasses,
                ...(interfaces.length > 0 && { interfaces: interfaces }),
                isAbstract: modifiers.includes("abstract"),
              }
            : undefined,
        children: [],
      };

      entities.push(entity);
    }

    // Methods (simplified pattern)
    const methodRe =
      /(?:^|\s)((?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?(\w+(?:\s*<[^>]+>)?(?:\[\])*)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?(?:\{|;)/gm;

    while ((match = methodRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const returnType = match[2];
      const name = match[3];
      const paramsStr = match[4] || "";
      if (!returnType || !name) continue;

      // Skip constructors (name same as class) - they will be captured separately
      // Also skip if this looks like a class definition
      if (content.substring(match.index - 10, match.index).includes("class ")) {
        continue;
      }

      const parameters = this.parseParameters(paramsStr);
      const isAsync = modifiers.includes("synchronized");

      entities.push({
        name,
        type: isAsync ? "async_function" : "method",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        ...(modifiers.length > 0 && { modifiers: modifiers }),
        returnType,
        parameters,
      });
    }

    // Constructors
    const constructorRe =
      /(?:^|\s)((?:public|private|protected)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?\s*\{/gm;

    while ((match = constructorRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const name = match[2];
      const paramsStr = match[3] || "";
      if (!name) continue;

      // Only include if this looks like a constructor (preceded by class/record definition)
      const precedingContent = content.substring(Math.max(0, match.index - 200), match.index);
      if (precedingContent.includes(`class ${name}`) || precedingContent.includes(`record ${name}`)) {
        entities.push({
          name: "constructor",
          type: "method",
          filePath,
          location: this.getLocationFromIndex(content, match.index),
          ...(modifiers.length > 0 && { modifiers: modifiers }),
          parameters: this.parseParameters(paramsStr),
        });
      }
    }

    // Fields (simplified)
    const fieldRe =
      /(?:^|\s)((?:public|private|protected|static|final|volatile|transient)\s+)+(\w+(?:\s*<[^>]+>)?(?:\[\])*)\s+(\w+)(?:\s*=\s*[^;]+)?;/gm;

    while ((match = fieldRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const type = match[2];
      const name = match[3];
      if (!type || !name) continue;

      // Skip method-local variables
      if (!modifiers.includes("public") && !modifiers.includes("private") && !modifiers.includes("protected")) {
        continue;
      }

      entities.push({
        name,
        type: modifiers.includes("final") ? "constant" : "field",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        ...(modifiers.length > 0 && { modifiers: modifiers }),
        metadata: { fieldType: type },
      });
    }

    // Annotations (simplified - just capture @interface definitions)
    const annotationRe = /@interface\s+(\w+)/g;
    while ((match = annotationRe.exec(content))) {
      // Already captured by typeRe, but ensure it's marked as interface
    }

    return entities;
  }

  /**
   * Parse method parameters
   */
  private parseParameters(paramsStr: string): ParsedEntity["parameters"] {
    if (!paramsStr.trim()) return [];

    const params: ParsedEntity["parameters"] = [];
    // Simple split by comma (doesn't handle generics with commas inside)
    const parts = paramsStr.split(",");

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Pattern: [final] Type name
      const paramMatch = /(?:final\s+)?(\w+(?:\s*<[^>]+>)?(?:\[\])*)\s+(\w+)/.exec(trimmed);
      if (paramMatch?.[1] && paramMatch[2]) {
        params.push({
          name: paramMatch[2],
          type: paramMatch[1],
        });
      }
    }

    return params;
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
    // No internal cache
  }
}
