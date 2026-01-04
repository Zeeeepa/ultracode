/**
 * TypeScript Native Parser
 *
 * Uses TypeScript Compiler API for parsing JavaScript/TypeScript/JSX/TSX files.
 * Provides full AST with type information, replacing tree-sitter for JS/TS.
 *
 * Architecture:
 * - ts.createSourceFile() for fast syntax-only parsing
 * - ts.createProgram() + TypeChecker for full type analysis (optional)
 * - Extracts entities compatible with ParseResult interface
 *
 * Entity extraction is modularized into separate files:
 * - ts-function-extractor.ts - Function declarations, arrow functions
 * - ts-class-extractor.ts - Class declarations with members
 * - ts-interface-extractor.ts - Interface declarations
 * - ts-type-extractor.ts - Type aliases and enums
 * - ts-import-export-extractor.ts - Import and export declarations
 * - ts-js-patterns-extractor.ts - JavaScript-specific patterns
 *
 * No native modules required - pure TypeScript implementation.
 */

import ts from "typescript";
import type { EntityRelationship, ParsedEntity, ParseResult } from "../types/parser.js";
import { enhanceWithAngularInfo, isAngularFile } from "./angular-parser.js";
import { isNgRxFile, parseNgRxFile } from "./ngrx-parser.js";
// AST helpers
import { getExtension, getLanguage, SCRIPT_KINDS, SCRIPT_TARGETS } from "./ts-ast-helpers.js";
// Entity extractors
import { extractClassDeclaration } from "./ts-class-extractor.js";
import {
  extractArrowFunctionOrExpression,
  extractFunctionDeclaration,
  extractVariableWithNgRx,
} from "./ts-function-extractor.js";
import { extractExportDeclaration, extractImportDeclaration } from "./ts-import-export-extractor.js";
import { extractInterfaceDeclaration } from "./ts-interface-extractor.js";
import {
  extractCommonJSExport,
  extractCommonJSRequire,
  extractIIFE,
  extractObjectLiteralWithMethods,
  extractPrototypeMethod,
  markConstructorFunction,
} from "./ts-js-patterns-extractor.js";
import { extractEnumDeclaration, extractTypeAliasDeclaration } from "./ts-type-extractor.js";

// =============================================================================
// ENTITY EXTRACTION
// =============================================================================

export interface ExtractorContext {
  sourceFile: ts.SourceFile;
  filePath: string;
  entities: ParsedEntity[];
  relationships: EntityRelationship[];
  /** Current parent entity name for contains relationships */
  parentEntity?: string;
}

/**
 * Main entity extraction function - delegates to specialized extractors
 */
export function extractEntities(ctx: ExtractorContext, node: ts.Node): void {
  const { entities } = ctx;

  // Function declarations
  if (ts.isFunctionDeclaration(node) && node.name) {
    extractFunctionDeclaration(node, ctx);
    // Check if this is a constructor function pattern
    markConstructorFunction(node, entities);
  }

  // Arrow functions and function expressions in variable statements
  if (ts.isVariableStatement(node)) {
    const extractedArrow = extractArrowFunctionOrExpression(node, ctx);

    // If not an arrow function, check for NgRx patterns or regular variables
    if (!extractedArrow) {
      extractVariableWithNgRx(node, ctx);
    }

    // Check for object literals with methods
    extractObjectLiteralWithMethods(node, ctx);

    // Check for CommonJS require()
    extractCommonJSRequire(node, ctx);
  }

  // Class declarations
  if (ts.isClassDeclaration(node) && node.name) {
    extractClassDeclaration(node, ctx);
    return; // Don't recurse into class - members already handled
  }

  // Interface declarations
  if (ts.isInterfaceDeclaration(node)) {
    extractInterfaceDeclaration(node, ctx);
    return;
  }

  // Type alias declarations
  if (ts.isTypeAliasDeclaration(node)) {
    extractTypeAliasDeclaration(node, ctx);
  }

  // Enum declarations
  if (ts.isEnumDeclaration(node)) {
    extractEnumDeclaration(node, ctx);
    return;
  }

  // Import declarations
  if (ts.isImportDeclaration(node)) {
    extractImportDeclaration(node, ctx);
  }

  // Export declarations
  if (ts.isExportDeclaration(node)) {
    extractExportDeclaration(node, ctx);
  }

  // =============================================================================
  // JAVASCRIPT-SPECIFIC PATTERNS (handled via expression statements)
  // =============================================================================

  if (ts.isExpressionStatement(node)) {
    // Prototype method assignments
    if (extractPrototypeMethod(node, ctx)) {
      return;
    }

    // CommonJS exports
    if (extractCommonJSExport(node, ctx)) {
      return;
    }

    // IIFE
    if (extractIIFE(node, ctx)) {
      return;
    }
  }

  // Recurse into children (except for nodes we've already handled)
  ts.forEachChild(node, (child) => extractEntities(ctx, child));
}

// =============================================================================
// MAIN PARSER CLASS
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

export class TypeScriptParser {
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
   * Initialize the parser (no-op for TypeScript API, kept for interface compatibility)
   */
  async initialize(): Promise<void> {
    console.error("[TypeScriptParser] Initialized (TypeScript Compiler API)");
  }

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean {
    const ext = getExtension(filePath);
    return ext in SCRIPT_KINDS;
  }

  /**
   * Parse a file and extract entities
   */
  async parse(filePath: string, content: string, contentHash: string): Promise<ParseResult> {
    const startTime = Date.now();

    try {
      const ext = getExtension(filePath);
      const scriptTarget = SCRIPT_TARGETS[ext] || ts.ScriptTarget.ESNext;
      const scriptKind = SCRIPT_KINDS[ext] || ts.ScriptKind.TS;

      // Parse the source file (syntax only, no type checking for speed)
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        scriptTarget,
        true, // setParentNodes
        scriptKind,
      );

      // Extract entities and relationships
      const entities: ParsedEntity[] = [];
      const relationships: EntityRelationship[] = [];
      const ctx: ExtractorContext = {
        sourceFile,
        filePath,
        entities,
        relationships,
      };

      ts.forEachChild(sourceFile, (node) => extractEntities(ctx, node));

      // Enhance with Angular metadata if this is an Angular file
      if (isAngularFile(sourceFile)) {
        enhanceWithAngularInfo(entities, sourceFile);
      }

      // Parse NgRx constructs (actions, effects, reducers, selectors)
      if (isNgRxFile(sourceFile)) {
        const ngrxResult = parseNgRxFile(sourceFile, filePath);

        // Add NgRx entities
        entities.push(...ngrxResult.entities);

        // Convert NgRx relationships to EntityRelationship format
        for (const rel of ngrxResult.relationships) {
          relationships.push({
            from: rel.fromName,
            to: rel.toName,
            type: rel.type as EntityRelationship["type"],
            metadata: rel.metadata,
          });
        }
      }

      // Collect diagnostics
      const errors: Array<{ message: string; location?: { line: number; column: number } }> = [];

      // Get syntax errors from the source file (using internal API)
      const syntaxDiagnostics = (sourceFile as any).parseDiagnostics as ts.Diagnostic[] | undefined;
      if (syntaxDiagnostics) {
        for (const diag of syntaxDiagnostics) {
          const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
          if (diag.start !== undefined) {
            const pos = sourceFile.getLineAndCharacterOfPosition(diag.start);
            errors.push({
              message,
              location: { line: pos.line + 1, column: pos.character },
            });
          } else {
            errors.push({ message });
          }
        }
      }

      const parseTimeMs = Date.now() - startTime;

      // Update stats
      this.stats.filesParsed++;
      this.stats.totalParseTimeMs += parseTimeMs;
      this.stats.avgParseTimeMs = this.stats.totalParseTimeMs / this.stats.filesParsed;

      return {
        filePath,
        language: getLanguage(filePath),
        entities,
        ...(relationships.length > 0 && { relationships }),
        contentHash,
        timestamp: Date.now(),
        parseTimeMs,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
      this.stats.errorCount++;
      const parseTimeMs = Date.now() - startTime;

      return {
        filePath,
        language: getLanguage(filePath),
        entities: [],
        relationships: undefined,
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
   * Parse with incremental support (uses same logic - TS API handles this internally)
   */
  async parseIncremental(filePath: string, content: string, contentHash: string, _edits: any[]): Promise<ParseResult> {
    // TypeScript's createSourceFile is already very fast
    // For true incremental, we'd need ts.createLanguageService
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
    // No internal cache in this implementation
  }
}
