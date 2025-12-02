/**
 * Kotlin Native Parser
 *
 * Uses regex-based parsing for Kotlin files with optional kotlinc integration.
 * When kotlinc is available, provides syntax validation and diagnostics.
 *
 * Philosophy: Kotlin developers always have JDK/Kotlin installed.
 *
 * No native modules required - uses subprocess.
 */

import type { ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import {
  findKotlinc,
  isKotlincAvailable,
  enhanceWithKotlinDiagnostics,
  isKotlinScript,
  getKotlinVersion,
} from "./kotlin-compiler-integration.js";

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
// KOTLIN PARSER CLASS
// =============================================================================

export class KotlinNativeParser {
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

  private kotlincEnabled = true; // Try to use kotlinc by default
  private useKotlincDiagnostics = true; // Enhance with kotlinc diagnostics

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    console.error("[KotlinNativeParser] Initializing...");

    // Try to find kotlinc
    if (this.kotlincEnabled) {
      const kotlinc = await findKotlinc();
      if (kotlinc) {
        const version = getKotlinVersion();
        console.error(
          `[KotlinNativeParser] Initialized with kotlinc${version ? ` (v${version})` : ""}`,
        );
        return;
      }
    }

    console.error("[KotlinNativeParser] Initialized (regex-based fallback)");
  }

  /**
   * Enable or disable kotlinc integration
   */
  setKotlincEnabled(enabled: boolean): void {
    this.kotlincEnabled = enabled;
  }

  /**
   * Enable or disable kotlinc diagnostics enhancement
   */
  setKotlincDiagnosticsEnabled(enabled: boolean): void {
    this.useKotlincDiagnostics = enabled;
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return lower.endsWith(".kt") || lower.endsWith(".kts");
  }

  /**
   * Check if file is a Kotlin script
   */
  isKotlinScript(filePath: string): boolean {
    return isKotlinScript(filePath);
  }

  /**
   * Parse a Kotlin file
   */
  async parse(
    filePath: string,
    content: string,
    contentHash: string,
  ): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const entities = this.parseKotlin(filePath, content);

      // Enhance with kotlinc diagnostics if available
      if (this.useKotlincDiagnostics && isKotlincAvailable() && entities.length > 0) {
        try {
          enhanceWithKotlinDiagnostics(entities, filePath, content);
        } catch (kotlincError) {
          console.error(
            `[KotlinNativeParser] kotlinc diagnostics failed: ${kotlincError}`,
          );
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs =
        this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "kotlin" as SupportedLanguage,
        entities,
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: "kotlin" as SupportedLanguage,
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
   * Parse Kotlin code using regex patterns
   */
  private parseKotlin(filePath: string, content: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    // Package declaration
    const packageMatch = /^\s*package\s+([\w.]+)/m.exec(content);
    if (packageMatch && packageMatch[1]) {
      entities.push({
        name: packageMatch[1],
        type: "module",
        filePath,
        location: this.getLocationFromIndex(content, packageMatch.index),
      });
    }

    // Imports
    const importRe = /^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm;
    let match: RegExpExecArray | null;
    while ((match = importRe.exec(content))) {
      const source = match[1];
      if (!source) continue;
      const alias = match[2];

      entities.push({
        name: source,
        type: "import",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        importData: {
          source,
          specifiers: [
            {
              local: alias || source.split(".").pop() || source,
              alias: alias || undefined,
            },
          ],
        },
      });
    }

    // Class/Interface/Object/Enum/Data class/Sealed class declarations
    const typeRe =
      /(?:^|\s)((?:public|private|protected|internal|abstract|final|open|sealed|data|inner|inline|value|enum|annotation|external|actual|expect)\s+)*(class|interface|object|typealias)\s+(\w+)(?:\s*<[^>]+>)?(?:\s*(?:constructor\s*)?\([^)]*\))?(?:\s*:\s*([^\{]+))?/gm;

    while ((match = typeRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const kind = match[2];
      const name = match[3];
      if (!kind || !name) continue;
      const inheritance = match[4];

      let entityType: ParsedEntity["type"] = "class";
      if (kind === "interface") entityType = "interface";
      if (kind === "object") entityType = "class"; // Kotlin object is a singleton class
      if (modifiers.includes("enum")) entityType = "enum";
      if (modifiers.includes("data")) modifiers.push("dataclass");

      const baseClasses: string[] = [];
      const interfaces: string[] = [];

      if (inheritance) {
        // Parse inheritance: BaseClass(), Interface1, Interface2
        const parts = inheritance.split(",").map((s) => s.trim());
        for (const part of parts) {
          const typeName = part.replace(/\([^)]*\)/, "").replace(/<[^>]+>/, "").trim();
          if (typeName) {
            if (part.includes("(")) {
              baseClasses.push(typeName);
            } else {
              interfaces.push(typeName);
            }
          }
        }
      }

      const entity: ParsedEntity = {
        name,
        type: entityType,
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        inheritance:
          baseClasses.length > 0 || interfaces.length > 0
            ? {
                baseClasses,
                interfaces: interfaces.length > 0 ? interfaces : undefined,
                isAbstract: modifiers.includes("abstract"),
              }
            : undefined,
        children: [],
      };

      entities.push(entity);
    }

    // Functions (fun keyword)
    const funRe =
      /(?:^|\s)((?:public|private|protected|internal|inline|infix|operator|suspend|tailrec|external|actual|expect|override|open|final|abstract)\s+)*fun\s+(?:<[^>]+>\s+)?(?:(\w+)\s*\.\s*)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^\{=]+))?/gm;

    while ((match = funRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const receiver = match[2]; // Extension function receiver
      const name = match[3];
      if (!name) continue;
      const paramsStr = match[4] || "";
      const returnType = match[5]?.trim();

      const isSuspend = modifiers.includes("suspend");

      entities.push({
        name: receiver ? `${receiver}.${name}` : name,
        type: isSuspend ? "async_function" : "function",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        returnType: returnType || undefined,
        parameters: this.parseParameters(paramsStr),
      });
    }

    // Properties (val/var)
    const propRe =
      /(?:^|\s)((?:public|private|protected|internal|const|lateinit|override|open|final|abstract|actual|expect)\s+)*(val|var)\s+(?:(\w+)\s*\.\s*)?(\w+)(?:\s*:\s*([^\{=\n]+))?/gm;

    while ((match = propRe.exec(content))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const kind = match[2]; // val or var
      const receiver = match[3];
      const name = match[4];
      if (!kind || !name) continue;
      const type = match[5]?.trim();

      const isConst = kind === "val" || modifiers.includes("const");

      entities.push({
        name: receiver ? `${receiver}.${name}` : name,
        type: isConst ? "constant" : "property",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        modifiers: [...modifiers, kind].filter(Boolean),
        metadata: type ? { propertyType: type } : undefined,
      });
    }

    // Type aliases
    const typealiasRe = /(?:^|\s)typealias\s+(\w+)(?:\s*<[^>]+>)?\s*=\s*([^\n]+)/gm;
    while ((match = typealiasRe.exec(content))) {
      const aliasName = match[1];
      const aliasedType = match[2];
      if (!aliasName || !aliasedType) continue;
      entities.push({
        name: aliasName,
        type: "type",
        filePath,
        location: this.getLocationFromIndex(content, match.index),
        metadata: { aliasedType: aliasedType.trim() },
      });
    }

    return entities;
  }

  /**
   * Parse function parameters
   */
  private parseParameters(paramsStr: string): ParsedEntity["parameters"] {
    if (!paramsStr.trim()) return [];

    const params: ParsedEntity["parameters"] = [];
    // Simple split by comma (doesn't handle lambdas with commas inside)
    let depth = 0;
    let current = "";
    const parts: string[] = [];

    for (const char of paramsStr) {
      if (char === "(" || char === "<" || char === "[") depth++;
      else if (char === ")" || char === ">" || char === "]") depth--;
      else if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
      if (!part) continue;

      // Pattern: [vararg] name: Type [= default]
      const paramMatch = /(?:vararg\s+)?(\w+)\s*:\s*([^=]+)(?:\s*=\s*(.+))?/.exec(
        part,
      );
      if (paramMatch && paramMatch[1] && paramMatch[2]) {
        params.push({
          name: paramMatch[1],
          type: paramMatch[2].trim(),
          optional: !!paramMatch[3],
          defaultValue: paramMatch[3]?.trim(),
        });
      }
    }

    return params;
  }

  /**
   * Get location from character index
   */
  private getLocationFromIndex(
    content: string,
    index: number,
  ): ParsedEntity["location"] {
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
    _edits: any[],
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
