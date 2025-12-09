/**
 * Kotlin Native Parser
 *
 * Uses ANTLR-based parsing for accurate AST analysis with regex fallback.
 * ANTLR parser provides:
 * - All entity types (classes, functions, properties, etc.)
 * - All relationship types (imports, inherits, implements, calls, etc.)
 *
 * When kotlinc is available, provides additional syntax validation and diagnostics.
 *
 * No native modules required - uses subprocess for kotlinc integration.
 */

import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { KotlinAntlrParser } from "./kotlin-antlr-parser.js";
import {
  enhanceWithKotlinDiagnostics,
  findKotlinc,
  getKotlinVersion,
  isKotlincAvailable,
  isKotlinScript,
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
        console.error(`[KotlinNativeParser] Initialized with kotlinc${version ? ` (v${version})` : ""}`);
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
   * Parse a Kotlin file using ANTLR parser (with regex fallback)
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();
    console.error(`[KotlinNativeParser] Parsing file: ${filePath} (${content.length} bytes)`);

    try {
      let entities: ParsedEntity[];
      let relationships: EntityRelationship[] | undefined;

      // Try ANTLR parser first (accurate AST-based parsing)
      try {
        console.error(`[KotlinNativeParser] Trying ANTLR parser...`);
        const antlrResult = KotlinAntlrParser.parse(filePath, content);
        entities = antlrResult.entities;
        relationships = antlrResult.relationships.length > 0 ? antlrResult.relationships : undefined;
        console.error(
          `[KotlinNativeParser] ANTLR success: ${entities.length} entities, ${relationships?.length || 0} relationships`,
        );
      } catch (antlrError) {
        // Fallback to regex-based parsing
        console.error(`[KotlinNativeParser] ANTLR parser failed, using regex fallback: ${antlrError}`);
        entities = this.parseKotlinRegex(filePath, content);
        console.error(`[KotlinNativeParser] Regex fallback: ${entities.length} entities`);
      }

      // Enhance with kotlinc diagnostics if available
      if (this.useKotlincDiagnostics && isKotlincAvailable() && entities.length > 0) {
        try {
          enhanceWithKotlinDiagnostics(entities, filePath, content);
        } catch (kotlincError) {
          console.error(`[KotlinNativeParser] kotlinc diagnostics failed: ${kotlincError}`);
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: "kotlin" as SupportedLanguage,
        entities,
        relationships,
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
   * Parse Kotlin code using regex patterns (fallback when ANTLR fails)
   */
  private parseKotlinRegex(filePath: string, content: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];

    // Package declaration
    const packageMatch = /^\s*package\s+([\w.]+)/m.exec(content);
    if (packageMatch?.[1]) {
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
      /(?:^|\s)((?:public|private|protected|internal|abstract|final|open|sealed|data|inner|inline|value|enum|annotation|external|actual|expect)\s+)*(class|interface|object|typealias)\s+(\w+)(?:\s*<[^>]+>)?(?:\s*(?:constructor\s*)?\([^)]*\))?(?:\s*:\s*([^{]+))?/gm;

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
          const typeName = part
            .replace(/\([^)]*\)/, "")
            .replace(/<[^>]+>/, "")
            .trim();
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
      /(?:^|\s)((?:public|private|protected|internal|inline|infix|operator|suspend|tailrec|external|actual|expect|override|open|final|abstract)\s+)*fun\s+(?:<[^>]+>\s+)?(?:(\w+)\s*\.\s*)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{=]+))?/gm;

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
      /(?:^|\s)((?:public|private|protected|internal|const|lateinit|override|open|final|abstract|actual|expect)\s+)*(val|var)\s+(?:(\w+)\s*\.\s*)?(\w+)(?:\s*:\s*([^{=\n]+))?/gm;

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

    // Phase 1: Extract KDoc for top-level declarations
    for (const entity of entities) {
      if (entity.type !== "import" && entity.type !== "module") {
        const doc = this.extractKDoc(content, entity.location.start.index);
        if (doc) {
          entity.documentation = doc;
        }
      }
    }

    // Phase 1: Parse class/interface bodies for members
    this.parseClassBodies(content, filePath, entities);

    return entities;
  }

  // =============================================================================
  // KDOC EXTRACTION (Kotlin Phase 1)
  // =============================================================================

  /**
   * Extract KDoc comment before a declaration
   * KDoc format: starts with slash-star-star and ends with star-slash
   */
  private extractKDoc(content: string, declarationIndex: number): ParsedEntity["documentation"] | undefined {
    // Look backwards from declaration to find /** ... */
    const before = content.slice(0, declarationIndex);

    // Find last occurrence of */
    const endIndex = before.lastIndexOf("*/");
    if (endIndex === -1) return undefined;

    // Find matching /**
    const searchStart = Math.max(0, endIndex - 5000); // Limit search range
    const startIndex = before.lastIndexOf("/**", endIndex);
    if (startIndex === -1 || startIndex < searchStart) return undefined;

    // Check there's only whitespace between comment end and declaration
    const between = before.slice(endIndex + 2).trim();
    // Allow annotations between KDoc and declaration
    if (between && !/^(?:@\w+(?:\([^)]*\))?\s*)*$/.test(between)) {
      return undefined;
    }

    const kdocContent = before.slice(startIndex + 3, endIndex);
    return this.parseKDoc(kdocContent);
  }

  /**
   * Parse KDoc content into structured documentation
   */
  private parseKDoc(kdocContent: string): ParsedEntity["documentation"] {
    const lines = kdocContent.split("\n").map(
      (line) => line.replace(/^\s*\*\s?/, "").trim(), // Remove leading * from each line
    );

    const params: Array<{ name: string; type?: string; description?: string; optional?: boolean }> = [];
    const throws: Array<{ type?: string; description?: string }> = [];
    // biome-ignore lint/style/useConst: reassigned later in the function
    let description: string | undefined;
    let returns: { type?: string; description?: string } | undefined;
    let since: string | undefined;
    let author: string | undefined;
    let deprecated: string | boolean | undefined;
    const see: string[] = [];

    const descriptionLines: string[] = [];
    let inDescription = true;

    for (const line of lines) {
      if (!line) continue;

      // @param name description
      const paramMatch = line.match(/^@param\s+(\w+)\s*(.*)/);
      if (paramMatch) {
        inDescription = false;
        params.push({
          name: paramMatch[1]!,
          description: paramMatch[2] || undefined,
        });
        continue;
      }

      // @return/@returns description
      const returnMatch = line.match(/^@returns?\s+(.*)/);
      if (returnMatch) {
        inDescription = false;
        returns = { description: returnMatch[1] };
        continue;
      }

      // @throws/@exception Type description
      const throwsMatch = line.match(/^@(?:throws|exception)\s+(\w+)?\s*(.*)/);
      if (throwsMatch) {
        inDescription = false;
        throws.push({
          type: throwsMatch[1],
          description: throwsMatch[2] || undefined,
        });
        continue;
      }

      // @since version
      const sinceMatch = line.match(/^@since\s+(.*)/);
      if (sinceMatch) {
        inDescription = false;
        since = sinceMatch[1];
        continue;
      }

      // @author name
      const authorMatch = line.match(/^@author\s+(.*)/);
      if (authorMatch) {
        inDescription = false;
        author = authorMatch[1];
        continue;
      }

      // @deprecated description
      const deprecatedMatch = line.match(/^@deprecated\s*(.*)/);
      if (deprecatedMatch) {
        inDescription = false;
        deprecated = deprecatedMatch[1] || true;
        continue;
      }

      // @see reference
      const seeMatch = line.match(/^@see\s+(.*)/);
      if (seeMatch) {
        inDescription = false;
        see.push(seeMatch[1]!);
        continue;
      }

      // @property/@receiver/@suppress - skip
      if (/^@(?:property|receiver|suppress|sample|constructor)/.test(line)) {
        inDescription = false;
        continue;
      }

      // Other @ tags - treat as end of description
      if (line.startsWith("@")) {
        inDescription = false;
        continue;
      }

      // Regular line - add to description if we haven't seen tags yet
      if (inDescription) {
        descriptionLines.push(line);
      }
    }

    description = descriptionLines.join(" ").trim() || undefined;

    if (!description && params.length === 0 && !returns && throws.length === 0) {
      return undefined;
    }

    return {
      description,
      params: params.length > 0 ? params : undefined,
      returns,
      throws: throws.length > 0 ? throws : undefined,
      deprecated,
      see: see.length > 0 ? see : undefined,
      since,
      author,
    };
  }

  // =============================================================================
  // CLASS BODY PARSING (Kotlin Phase 1)
  // =============================================================================

  /**
   * Parse methods and properties inside class/interface bodies
   */
  private parseClassBodies(content: string, filePath: string, entities: ParsedEntity[]): void {
    // Find class/interface/object entities and parse their bodies
    const classEntities = entities.filter((e) => e.type === "class" || e.type === "interface" || e.type === "enum");

    for (const classEntity of classEntities) {
      const bodyStart = this.findClassBodyStart(content, classEntity.location.start.index);
      if (bodyStart === -1) continue;

      const bodyEnd = this.findMatchingBrace(content, bodyStart);
      if (bodyEnd === -1) continue;

      const bodyContent = content.slice(bodyStart + 1, bodyEnd);
      const members = this.parseClassMembers(bodyContent, filePath, classEntity.name, bodyStart + 1);

      if (members.length > 0) {
        classEntity.children = members;
      }
    }
  }

  /**
   * Find the opening brace of a class body
   */
  private findClassBodyStart(content: string, fromIndex: number): number {
    let i = fromIndex;
    let parenDepth = 0;
    let angleDepth = 0;

    while (i < content.length) {
      const char = content[i];

      if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;
      else if (char === "<") angleDepth++;
      else if (char === ">") angleDepth--;
      else if (char === "{" && parenDepth === 0 && angleDepth === 0) {
        return i;
      } else if (char === "\n" && parenDepth === 0 && angleDepth === 0) {
        // Check if line continues or ends (no body for abstract/interface without body)
        const rest = content.slice(i).trimStart();
        if (!rest.startsWith("{")) {
          return -1; // No body
        }
      }

      i++;
    }

    return -1;
  }

  /**
   * Find the matching closing brace
   */
  private findMatchingBrace(content: string, openIndex: number): number {
    let depth = 1;
    let i = openIndex + 1;
    let inString = false;
    let stringChar = "";

    while (i < content.length && depth > 0) {
      const char = content[i];
      const prevChar = content[i - 1];

      // Handle strings
      if ((char === '"' || char === "'") && prevChar !== "\\") {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") depth--;
      }

      i++;
    }

    return depth === 0 ? i - 1 : -1;
  }

  /**
   * Parse members inside a class body
   */
  private parseClassMembers(
    bodyContent: string,
    filePath: string,
    _className: string,
    baseOffset: number,
  ): ParsedEntity[] {
    const members: ParsedEntity[] = [];

    // Methods (fun keyword)
    const funRe =
      /(?:^|\s)((?:public|private|protected|internal|inline|infix|operator|suspend|tailrec|external|actual|expect|override|open|final|abstract)\s+)*fun\s+(?:<[^>]+>\s+)?(?:(\w+)\s*\.\s*)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{=]+))?/gm;

    let match: RegExpExecArray | null;
    while ((match = funRe.exec(bodyContent))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const receiver = match[2];
      const name = match[3];
      if (!name) continue;
      const paramsStr = match[4] || "";
      const returnType = match[5]?.trim();

      const isSuspend = modifiers.includes("suspend");

      // Extract calls from method body
      const methodBodyStart = this.findMethodBodyStart(bodyContent, match.index + match[0].length);
      let calls: ParsedEntity["calls"];
      if (methodBodyStart !== -1) {
        const methodBodyEnd = this.findMatchingBrace(bodyContent, methodBodyStart);
        if (methodBodyEnd !== -1) {
          const methodBody = bodyContent.slice(methodBodyStart + 1, methodBodyEnd);
          calls = this.extractCalls(methodBody);
        }
      }

      const member: ParsedEntity = {
        name: receiver ? `${receiver}.${name}` : name,
        type: isSuspend ? "async_function" : "method",
        filePath,
        location: this.getLocationFromIndex(bodyContent, match.index, baseOffset),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        returnType: returnType || undefined,
        parameters: this.parseParameters(paramsStr),
        calls,
      };

      // Extract KDoc for method
      const doc = this.extractKDoc(bodyContent, match.index);
      if (doc) {
        member.documentation = doc;
      }

      members.push(member);
    }

    // Properties (val/var)
    const propRe =
      /(?:^|\s)((?:public|private|protected|internal|const|lateinit|override|open|final|abstract|actual|expect)\s+)*(val|var)\s+(\w+)(?:\s*:\s*([^{=\n]+))?/gm;

    while ((match = propRe.exec(bodyContent))) {
      const modifiers = (match[1] || "").trim().split(/\s+/).filter(Boolean);
      const kind = match[2];
      const name = match[3];
      if (!kind || !name) continue;
      const type = match[4]?.trim();

      const isConst = kind === "val" || modifiers.includes("const");

      const member: ParsedEntity = {
        name,
        type: isConst ? "constant" : "property",
        filePath,
        location: this.getLocationFromIndex(bodyContent, match.index, baseOffset),
        modifiers: [...modifiers, kind].filter(Boolean),
        metadata: type ? { propertyType: type } : undefined,
      };

      // Extract KDoc for property
      const doc = this.extractKDoc(bodyContent, match.index);
      if (doc) {
        member.documentation = doc;
      }

      members.push(member);
    }

    return members;
  }

  /**
   * Find the start of a method body (opening brace or = for expression body)
   */
  private findMethodBodyStart(content: string, fromIndex: number): number {
    let i = fromIndex;
    let parenDepth = 0;

    while (i < content.length) {
      const char = content[i];

      if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;
      else if (char === "{" && parenDepth === 0) {
        return i;
      } else if (char === "=" && parenDepth === 0) {
        // Expression body - no braces
        return -1;
      } else if (char === "\n" && parenDepth === 0) {
        // Check if next line has body
        const rest = content.slice(i).trimStart();
        if (rest.startsWith("{")) {
          return content.indexOf("{", i);
        }
        // Abstract method or expression body
        return -1;
      }

      i++;
    }

    return -1;
  }

  // =============================================================================
  // CALL GRAPH EXTRACTION (Kotlin Phase 1)
  // =============================================================================

  /**
   * Extract function calls from method body (simple regex-based)
   */
  private extractCalls(bodyContent: string): ParsedEntity["calls"] {
    const calls: NonNullable<ParsedEntity["calls"]> = [];

    // Keywords to exclude
    const kotlinKeywords = new Set([
      "if",
      "else",
      "when",
      "for",
      "while",
      "do",
      "try",
      "catch",
      "finally",
      "throw",
      "return",
      "break",
      "continue",
      "class",
      "interface",
      "object",
      "fun",
      "val",
      "var",
      "is",
      "in",
      "as",
      "true",
      "false",
      "null",
      "this",
      "super",
      "it",
      "constructor",
      "init",
      "get",
      "set",
      "by",
      "where",
      "import",
      "package",
      "typeof",
      "suspend",
      "inline",
    ]);

    // Pattern: identifier( or identifier.identifier(
    // Captures: target (optional), name
    const callRe = /(?:(\w+(?:\.\w+)*)\s*\.\s*)?(\w+)\s*(?:<[^>]+>)?\s*\(/g;

    let match: RegExpExecArray | null;
    while ((match = callRe.exec(bodyContent))) {
      const target = match[1];
      const name = match[2];

      if (!name || kotlinKeywords.has(name)) continue;

      // Skip if it looks like a type (PascalCase without target and followed by typical constructor patterns)
      if (!target && /^[A-Z]/.test(name)) {
        // Could be constructor call - still include it
      }

      calls.push({
        name,
        target,
        location: {
          start: { line: 0, column: 0, index: match.index },
          end: { line: 0, column: 0, index: match.index + match[0].length },
        },
        argumentCount: 0, // Unknown from regex
      });
    }

    return calls.length > 0 ? calls : undefined;
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
      const paramMatch = /(?:vararg\s+)?(\w+)\s*:\s*([^=]+)(?:\s*=\s*(.+))?/.exec(part);
      if (paramMatch?.[1] && paramMatch[2]) {
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
   * @param content - The content to search in
   * @param index - Character index in content
   * @param baseOffset - Base offset to add to the index (for parsing class bodies)
   */
  private getLocationFromIndex(content: string, index: number, baseOffset: number = 0): ParsedEntity["location"] {
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

    const actualIndex = index + baseOffset;
    return {
      start: { line, column, index: actualIndex },
      end: { line, column: column + 1, index: actualIndex + 1 },
    };
  }

  /**
   * Parse with incremental support (just calls regular parse)
   */
  async parseIncremental(filePath: string, content: string, contentHash: string, _edits: any[]): Promise<ParseResult> {
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
