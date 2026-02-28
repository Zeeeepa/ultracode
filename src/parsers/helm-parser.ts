/**
 * Helm Template Parser
 *
 * Regex-based parser for Helm chart templates, values, and Chart.yaml files.
 * Extracts named templates (define), includes, value references, control flow,
 * variable assignments, and indent usage patterns.
 *
 * Supports:
 * - .tpl files (always)
 * - .yaml/.yml files containing {{ }} within a Helm context (Chart.yaml present)
 * - Chart.yaml (chart metadata and dependencies)
 * - values.yaml / values-*.yaml (top-level value keys)
 *
 * No native modules required.
 */

import { basename, dirname, extname, join } from "node:path";
import { log } from "../logging/index.js";
import type { EntityRelationship, ParsedEntity, ParseResult, SupportedLanguage } from "../types/parser.js";
import { existsSync } from "../utils/file-ops.js";

// =============================================================================
// REGEX PATTERNS
// =============================================================================

const DEFINE_RE = /\{\{-?\s*define\s+"([^"]+)"\s*-?\}\}/g;
const END_RE = /\{\{-?\s*end\s*-?\}\}/g;
const INCLUDE_RE = /\{\{-?\s*include\s+"([^"]+)"\s+(.*?)\s*-?\}\}/g;
const TEMPLATE_RE = /\{\{-?\s*template\s+"([^"]+)"\s+(.*?)\s*-?\}\}/g;
const VALUE_REF_RE = /\.(Values|Release|Chart|Capabilities|Template|Files)(\.[a-zA-Z_][\w.-]*)/g;
const IF_RE = /\{\{-?\s*(?:if|else\s+if)\s+(.*?)\s*-?\}\}/g;
const RANGE_RE = /\{\{-?\s*range\s+(.*?)\s*-?\}\}/g;
const WITH_RE = /\{\{-?\s*with\s+(.*?)\s*-?\}\}/g;
const ELSE_RE = /\{\{-?\s*else\s*-?\}\}/g;
const VAR_ASSIGN_RE = /\{\{-?\s*\$(\w+)\s*:=\s*(.*?)\s*-?\}\}/g;
const NINDENT_RE = /\|\s*nindent\s+(\d+)/g;
const INDENT_RE = /\|\s*indent\s+(\d+)/g;
const TOYAML_INDENT_RE = /toYaml\s*\|\s*n?indent\s+(\d+)/g;

// =============================================================================
// TYPES
// =============================================================================

interface ParserStats {
  filesParsed: number;
  cacheHits: number;
  cacheMisses: number;
  avgParseTimeMs: number;
  totalParseTimeMs: number;
  throughput: number;
  cacheMemoryMB: number;
  errorCount: number;
}

interface IndentUsage {
  indentFunction: string;
  indentValue: number;
  pipeline: string;
  yamlContextIndent: number;
  context: string;
  location: {
    start: { line: number; column: number; index: number };
    end: { line: number; column: number; index: number };
  };
}

// =============================================================================
// HELM PARSER CLASS
// =============================================================================

export class HelmParser {
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

  private helmContextCache: Map<string, boolean> = new Map();

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    log.i("HELMPARSER", "init_done");
  }

  /**
   * Check if this parser supports the given file.
   *
   * Returns true for:
   * - .tpl files (always Helm templates)
   * - .yaml/.yml files containing {{ that are in a Helm context
   * - Chart.yaml or values.yaml / values-*.yaml in a Helm context
   */
  supportsFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    const base = basename(filePath);

    // .tpl files are always Helm templates
    if (ext === ".tpl") {
      return true;
    }

    // Chart.yaml and values*.yaml in Helm context
    if (base === "Chart.yaml") {
      return this.isHelmContext(filePath);
    }

    if (base === "values.yaml" || /^values-[\w.-]+\.yaml$/.test(base)) {
      return this.isHelmContext(filePath);
    }

    // .yaml/.yml files need to be in Helm context
    // (actual {{ check is done at parse time since we don't have content here)
    if (ext === ".yaml" || ext === ".yml") {
      return this.isHelmContext(filePath);
    }

    return false;
  }

  /**
   * Parse a Helm file
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const base = basename(filePath);
      let result: ParseResult;

      if (base === "Chart.yaml") {
        result = this.parseChartYaml(filePath, content, contentHash);
      } else if (base === "values.yaml" || /^values-[\w.-]+\.yaml$/.test(base)) {
        result = this.parseValuesYaml(filePath, content, contentHash);
      } else {
        result = this.parseHelmTemplate(filePath, content, contentHash);
      }

      const parseTimeMs = Date.now() - startTime;
      result.parseTimeMs = parseTimeMs;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;
      if (this.stats.totalParseTimeMs > 0) {
        this.stats.throughput = (this.stats.filesParsed / this.stats.totalParseTimeMs) * 1000;
      }

      return result;
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: "helm" as SupportedLanguage,
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
   * Parse with incremental support (delegates to full parse)
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
   * Clear internal caches
   */
  clearCache(): void {
    this.helmContextCache.clear();
  }

  /**
   * Check if a file is within a Helm chart context by walking up directories
   * looking for Chart.yaml. Results are cached by directory.
   * Public so unified-parser can use it.
   */
  isHelmContext(filePath: string): boolean {
    let dir = dirname(filePath);
    const maxLevels = 10;

    for (let i = 0; i < maxLevels; i++) {
      // Check cache
      const cached = this.helmContextCache.get(dir);
      if (cached !== undefined) {
        return cached;
      }

      const chartYamlPath = join(dir, "Chart.yaml");
      if (existsSync(chartYamlPath)) {
        // Cache this directory and all directories below it
        this.helmContextCache.set(dir, true);
        return true;
      }

      const parentDir = dirname(dir);
      if (parentDir === dir) {
        // Reached filesystem root
        break;
      }
      dir = parentDir;
    }

    // Cache negative result for the original directory
    this.helmContextCache.set(dirname(filePath), false);
    return false;
  }

  // ===========================================================================
  // PRIVATE: FILE-TYPE SPECIFIC PARSERS
  // ===========================================================================

  /**
   * Parse Chart.yaml - extract chart metadata and dependencies
   */
  private parseChartYaml(filePath: string, content: string, contentHash: string): ParseResult {
    const entities: ParsedEntity[] = [];
    const relationships: EntityRelationship[] = [];

    // Extract chart name
    const nameMatch = /^name:\s*(.+)$/m.exec(content);
    const chartName = nameMatch?.[1]?.trim() ?? basename(dirname(filePath));

    // Extract version fields
    const versionMatch = /^version:\s*(.+)$/m.exec(content);
    const appVersionMatch = /^appVersion:\s*(.+)$/m.exec(content);
    const descriptionMatch = /^description:\s*(.+)$/m.exec(content);

    const metadata: Record<string, unknown> = {
      helmType: "chart",
    };
    if (versionMatch?.[1]) metadata["version"] = versionMatch[1].trim();
    if (appVersionMatch?.[1]) metadata["appVersion"] = appVersionMatch[1].trim();
    if (descriptionMatch?.[1]) metadata["description"] = descriptionMatch[1].trim();

    // Create module entity for the chart
    const nameIndex = nameMatch?.index ?? 0;
    entities.push({
      name: chartName,
      type: "module",
      filePath,
      location: this.getLocationFromIndex(content, nameIndex),
      metadata,
    });

    // Extract dependencies
    const depsBlockMatch = /^dependencies:\s*\n((?:\s+-\s+.*\n?|\s+\w+:.*\n?)*)/m.exec(content);
    if (depsBlockMatch?.[1]) {
      const depsBlock = depsBlockMatch[1];
      const depNameRe = /^\s+-\s*name:\s*(.+)$/gm;
      let depMatch: RegExpExecArray | null;

      while ((depMatch = depNameRe.exec(depsBlock))) {
        const depName = depMatch[1]?.trim();
        if (!depName) continue;

        relationships.push({
          from: chartName,
          to: depName,
          type: "depends_on",
          sourceFile: filePath,
          metadata: {
            helmType: "chart-dependency",
          },
        });
      }
    }

    return {
      filePath,
      language: "helm" as SupportedLanguage,
      entities,
      relationships: relationships.length > 0 ? relationships : undefined,
      contentHash,
      timestamp: Date.now(),
      parseTimeMs: 0,
    };
  }

  /**
   * Parse values.yaml / values-*.yaml - extract top-level value keys
   */
  private parseValuesYaml(filePath: string, content: string, contentHash: string): ParseResult {
    const entities: ParsedEntity[] = [];
    const lines = content.split("\n");
    const topLevelKeyRe = /^([a-zA-Z_][\w-]*)\s*:/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = topLevelKeyRe.exec(line);
      if (!match?.[1]) continue;

      const keyName = match[1];
      // Extract value hint: whatever is after the colon on the same line
      const colonIdx = line.indexOf(":");
      const valueHint = colonIdx >= 0 ? line.substring(colonIdx + 1).trim() : "";

      // Calculate character index for this line
      let charIndex = 0;
      for (let j = 0; j < i; j++) {
        charIndex += lines[j]!.length + 1; // +1 for \n
      }

      entities.push({
        name: keyName,
        type: "variable",
        filePath,
        location: {
          start: { line: i + 1, column: 0, index: charIndex },
          end: { line: i + 1, column: line.length, index: charIndex + line.length },
        },
        metadata: {
          helmType: "value-key",
          ...(valueHint ? { valueHint } : {}),
        },
      });
    }

    return {
      filePath,
      language: "helm" as SupportedLanguage,
      entities,
      contentHash,
      timestamp: Date.now(),
      parseTimeMs: 0,
    };
  }

  /**
   * Parse a Helm template file (.tpl or template .yaml)
   * Main parsing method that orchestrates all extract methods.
   */
  private parseHelmTemplate(filePath: string, content: string, contentHash: string): ParseResult {
    const { entities: defineEntities, endPositions } = this.extractDefines(content, filePath);
    const { calls, relationships } = this.extractIncludes(content, filePath);
    const valueReferences = this.extractValueReferences(content);
    const controlFlow = this.extractControlFlow(content, filePath);
    const variableEntities = this.extractVariableAssigns(content, filePath);
    const indentUsage = this.extractIndentUsage(content);

    // Build children array from defines and variable assigns
    const children: ParsedEntity[] = [...defineEntities, ...variableEntities];

    // Build indent metadata
    const indentMetadata: Record<string, unknown> = {};
    if (indentUsage.length > 0) {
      indentMetadata["indentPatterns"] = indentUsage.map((u) => ({
        indentFunction: u.indentFunction,
        indentValue: u.indentValue,
        pipeline: u.pipeline,
        yamlContextIndent: u.yamlContextIndent,
        context: u.context,
      }));
    }

    // Create top-level file entity
    const fileEntity: ParsedEntity = {
      name: basename(filePath),
      type: "file",
      filePath,
      location: {
        start: { line: 1, column: 0, index: 0 },
        end: {
          line: content.split("\n").length,
          column: (content.split("\n").pop() ?? "").length,
          index: content.length,
        },
      },
      children: children.length > 0 ? children : undefined,
      calls: calls.length > 0 ? calls : undefined,
      controlFlow:
        controlFlow &&
        (controlFlow.branches.length > 0 ||
          controlFlow.loops.length > 0 ||
          controlFlow.exceptions.length > 0 ||
          controlFlow.returns.length > 0 ||
          controlFlow.awaits.length > 0)
          ? controlFlow
          : undefined,
      references: valueReferences.length > 0 ? valueReferences : undefined,
      metadata: {
        helmType: "template",
        defineCount: defineEntities.length,
        ...(Object.keys(indentMetadata).length > 0 ? indentMetadata : {}),
        ...(endPositions.size > 0 ? { templateEndPositions: Object.fromEntries(endPositions) } : {}),
      },
    };

    return {
      filePath,
      language: "helm" as SupportedLanguage,
      entities: [fileEntity],
      relationships: relationships.length > 0 ? relationships : undefined,
      contentHash,
      timestamp: Date.now(),
      parseTimeMs: 0,
    };
  }

  // ===========================================================================
  // PRIVATE: EXTRACTION METHODS
  // ===========================================================================

  /**
   * Extract {{ define "name" }}...{{ end }} blocks.
   * Creates function entities for named templates and tracks end positions.
   */
  private extractDefines(
    content: string,
    filePath: string,
  ): { entities: ParsedEntity[]; endPositions: Map<string, number> } {
    const entities: ParsedEntity[] = [];
    const endPositions: Map<string, number> = new Map();

    // Collect all define starts and end positions
    interface DefineStart {
      name: string;
      index: number;
      matchEnd: number;
    }

    const defineStarts: DefineStart[] = [];
    const endIndices: number[] = [];

    // Reset regex state
    DEFINE_RE.lastIndex = 0;
    END_RE.lastIndex = 0;

    let match: RegExpExecArray | null;

    while ((match = DEFINE_RE.exec(content))) {
      const name = match[1];
      if (!name) continue;
      defineStarts.push({
        name,
        index: match.index,
        matchEnd: match.index + match[0].length,
      });
    }

    while ((match = END_RE.exec(content))) {
      endIndices.push(match.index + match[0].length);
    }

    // Match defines to ends using nesting depth tracking.
    // Process defines in order of appearance, assigning each
    // the first unmatched {{ end }} that closes its scope.
    for (const def of defineStarts) {
      // Find the matching end by tracking nesting depth.
      // Starting after the define, count nested define/end pairs.
      let depth = 1;
      let matchedEndIndex = -1;

      // Collect all directives (define or end) after this define's start
      type Directive = { type: "define" | "end"; index: number; endIndex: number };
      const directives: Directive[] = [];

      // Re-scan for defines after this point
      DEFINE_RE.lastIndex = def.matchEnd;
      while ((match = DEFINE_RE.exec(content))) {
        directives.push({ type: "define", index: match.index, endIndex: match.index + match[0].length });
      }

      END_RE.lastIndex = def.matchEnd;
      while ((match = END_RE.exec(content))) {
        directives.push({ type: "end", index: match.index, endIndex: match.index + match[0].length });
      }

      // Sort by position
      directives.sort((a, b) => a.index - b.index);

      for (const dir of directives) {
        if (dir.type === "define") {
          depth++;
        } else if (dir.type === "end") {
          depth--;
          if (depth === 0) {
            matchedEndIndex = dir.endIndex;
            break;
          }
        }
      }

      const startLoc = this.getLocationFromIndex(content, def.index);
      let endLoc: { line: number; column: number; index: number };

      if (matchedEndIndex > 0) {
        endPositions.set(def.name, matchedEndIndex);
        const loc = this.getLocationFromIndex(content, matchedEndIndex);
        endLoc = loc.end;
      } else {
        // No matching end found - use the define line end
        endLoc = { ...startLoc.end };
      }

      entities.push({
        name: def.name,
        type: "function",
        filePath,
        location: {
          start: startLoc.start,
          end: endLoc,
        },
        metadata: {
          helmType: "named-template",
        },
      });
    }

    return { entities, endPositions };
  }

  /**
   * Extract include and template calls.
   * Returns call entries and entity relationships.
   */
  private extractIncludes(
    content: string,
    filePath: string,
  ): { calls: NonNullable<ParsedEntity["calls"]>; relationships: EntityRelationship[] } {
    const calls: NonNullable<ParsedEntity["calls"]> = [];
    const relationships: EntityRelationship[] = [];
    const fileBase = basename(filePath);
    let match: RegExpExecArray | null;

    // Reset regex state
    INCLUDE_RE.lastIndex = 0;
    TEMPLATE_RE.lastIndex = 0;

    // Process include directives
    while ((match = INCLUDE_RE.exec(content))) {
      const templateName = match[1];
      if (!templateName) continue;

      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      calls.push({
        name: templateName,
        location,
        argumentCount: 1,
        target: "helm",
      });

      relationships.push({
        from: fileBase,
        to: templateName,
        type: "calls",
        sourceFile: filePath,
      });
    }

    // Process template directives
    while ((match = TEMPLATE_RE.exec(content))) {
      const templateName = match[1];
      if (!templateName) continue;

      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      calls.push({
        name: templateName,
        location,
        argumentCount: 1,
        target: "helm",
      });

      relationships.push({
        from: fileBase,
        to: templateName,
        type: "calls",
        sourceFile: filePath,
      });
    }

    return { calls, relationships };
  }

  /**
   * Extract value references (.Values.x, .Release.Name, etc.)
   * Returns array of unique reference strings.
   */
  private extractValueReferences(content: string): string[] {
    const refs = new Set<string>();
    let match: RegExpExecArray | null;

    VALUE_REF_RE.lastIndex = 0;

    while ((match = VALUE_REF_RE.exec(content))) {
      const root = match[1];
      const path = match[2];
      if (root && path) {
        refs.add(`.${root}${path}`);
      }
    }

    return Array.from(refs);
  }

  /**
   * Extract control flow structures (if/else, range, with).
   */
  private extractControlFlow(content: string, _filePath: string): NonNullable<ParsedEntity["controlFlow"]> {
    const branches: NonNullable<ParsedEntity["controlFlow"]>["branches"] = [];
    const loops: NonNullable<ParsedEntity["controlFlow"]>["loops"] = [];
    const exceptions: NonNullable<ParsedEntity["controlFlow"]>["exceptions"] = [];
    const returns: NonNullable<ParsedEntity["controlFlow"]>["returns"] = [];
    const awaits: NonNullable<ParsedEntity["controlFlow"]>["awaits"] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    IF_RE.lastIndex = 0;
    ELSE_RE.lastIndex = 0;
    RANGE_RE.lastIndex = 0;
    WITH_RE.lastIndex = 0;

    // if / else if
    while ((match = IF_RE.exec(content))) {
      const condition = match[1]?.trim();
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      // Determine if this is "else if" or plain "if"
      const isElseIf = /else\s+if/.test(match[0]);
      branches.push({
        type: isElseIf ? "else-if" : "if",
        condition: condition || undefined,
        location,
      });
    }

    // else
    while ((match = ELSE_RE.exec(content))) {
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);
      branches.push({
        type: "else",
        location,
      });
    }

    // range (iteration → loop of type "for-of")
    while ((match = RANGE_RE.exec(content))) {
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);
      loops.push({
        type: "for-of",
        location,
      });
    }

    // with (scoped context → treated as branch with metadata)
    while ((match = WITH_RE.exec(content))) {
      const condition = match[1]?.trim();
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);
      branches.push({
        type: "if",
        condition: condition || undefined,
        location,
      });
    }

    return { branches, loops, exceptions, returns, awaits };
  }

  /**
   * Extract variable assignments ($varName := expression).
   */
  private extractVariableAssigns(content: string, filePath: string): ParsedEntity[] {
    const entities: ParsedEntity[] = [];
    let match: RegExpExecArray | null;

    VAR_ASSIGN_RE.lastIndex = 0;

    while ((match = VAR_ASSIGN_RE.exec(content))) {
      const varName = match[1];
      const expression = match[2]?.trim();
      if (!varName) continue;

      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      entities.push({
        name: `$${varName}`,
        type: "variable",
        filePath,
        location,
        metadata: {
          helmType: "template-variable",
          expression: expression ?? "",
        },
      });
    }

    return entities;
  }

  /**
   * Extract indent/nindent usage patterns for Helm template analysis.
   * Detects patterns like: | nindent 4, | indent 2, toYaml | nindent 6
   */
  private extractIndentUsage(content: string): IndentUsage[] {
    const results: IndentUsage[] = [];
    const lines = content.split("\n");
    let match: RegExpExecArray | null;

    // Track all indent patterns by scanning the full content
    // For each match, determine the line and leading spaces

    // Helper to find which line an index falls on and the leading whitespace
    const getLineContext = (index: number): { lineNumber: number; leadingSpaces: number; lineText: string } => {
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i]!.length + 1; // +1 for \n
        if (charCount + lineLen > index || i === lines.length - 1) {
          const lineText = lines[i]!;
          const leadingSpaces = lineText.length - lineText.trimStart().length;
          return { lineNumber: i + 1, leadingSpaces, lineText };
        }
        charCount += lineLen;
      }
      return { lineNumber: 1, leadingSpaces: 0, lineText: "" };
    };

    // nindent patterns
    NINDENT_RE.lastIndex = 0;
    while ((match = NINDENT_RE.exec(content))) {
      const indentValue = parseInt(match[1]!, 10);
      const ctx = getLineContext(match.index);
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      // Try to extract the broader pipeline context
      const lineText = ctx.lineText;
      const contextStart = lineText.indexOf("{{");
      const context = contextStart >= 0 ? lineText.substring(contextStart).trim() : lineText.trim();

      results.push({
        indentFunction: "nindent",
        indentValue,
        pipeline: match[0],
        yamlContextIndent: ctx.leadingSpaces,
        context,
        location,
      });
    }

    // indent patterns (without n prefix)
    INDENT_RE.lastIndex = 0;
    while ((match = INDENT_RE.exec(content))) {
      // Skip if this is actually an nindent match (already captured above)
      const preceedingChar = match.index > 0 ? content[match.index - 1] : "";
      if (preceedingChar === "n") continue;

      const indentValue = parseInt(match[1]!, 10);
      const ctx = getLineContext(match.index);
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      const lineText = ctx.lineText;
      const contextStart = lineText.indexOf("{{");
      const context = contextStart >= 0 ? lineText.substring(contextStart).trim() : lineText.trim();

      results.push({
        indentFunction: "indent",
        indentValue,
        pipeline: match[0],
        yamlContextIndent: ctx.leadingSpaces,
        context,
        location,
      });
    }

    // toYaml | [n]indent patterns
    TOYAML_INDENT_RE.lastIndex = 0;
    while ((match = TOYAML_INDENT_RE.exec(content))) {
      const indentValue = parseInt(match[1]!, 10);
      const ctx = getLineContext(match.index);
      const location = this.getLocationFromIndexWithEnd(content, match.index, match.index + match[0].length);

      const isNindent = match[0].includes("nindent");
      const lineText = ctx.lineText;
      const contextStart = lineText.indexOf("{{");
      const context = contextStart >= 0 ? lineText.substring(contextStart).trim() : lineText.trim();

      results.push({
        indentFunction: isNindent ? "toYaml|nindent" : "toYaml|indent",
        indentValue,
        pipeline: match[0],
        yamlContextIndent: ctx.leadingSpaces,
        context,
        location,
      });
    }

    return results;
  }

  // ===========================================================================
  // PRIVATE: LOCATION HELPERS
  // ===========================================================================

  /**
   * Convert a character index to a location with start position.
   * Line numbers start at 1, columns at 0.
   */
  private getLocationFromIndex(
    content: string,
    index: number,
  ): { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } } {
    let line = 1;
    let column = 0;

    for (let i = 0; i < index && i < content.length; i++) {
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
   * Convert start and end character indices to a full location range.
   * Line numbers start at 1, columns at 0.
   */
  private getLocationFromIndexWithEnd(
    content: string,
    startIndex: number,
    endIndex: number,
  ): { start: { line: number; column: number; index: number }; end: { line: number; column: number; index: number } } {
    let line = 1;
    let column = 0;
    let startLine = 1;
    let startColumn = 0;
    let foundStart = false;
    let endLine = 1;
    let endColumn = 0;

    const limit = Math.min(endIndex, content.length);

    for (let i = 0; i < limit; i++) {
      if (i === startIndex) {
        startLine = line;
        startColumn = column;
        foundStart = true;
      }

      if (content[i] === "\n") {
        line++;
        column = 0;
      } else {
        column++;
      }
    }

    if (!foundStart) {
      startLine = line;
      startColumn = column;
    }

    endLine = line;
    endColumn = column;

    return {
      start: { line: startLine, column: startColumn, index: startIndex },
      end: { line: endLine, column: endColumn, index: endIndex },
    };
  }
}
