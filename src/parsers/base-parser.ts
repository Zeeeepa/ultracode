/**
 * Base Parser Interface
 *
 * Defines the common interface for all language-specific parsers.
 * Allows IncrementalParser to work with different parser implementations.
 */

import type { ParseResult } from "../types/parser.js";

/**
 * Parser statistics
 */
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

/**
 * Base interface for all language parsers
 */
export interface BaseParser {
  /**
   * Initialize the parser
   */
  initialize(): Promise<void>;

  /**
   * Check if this parser supports the given file
   */
  supportsFile(filePath: string): boolean;

  /**
   * Parse a file and extract entities
   */
  parse(filePath: string, content: string, contentHash: string): Promise<ParseResult>;

  /**
   * Parse with incremental support
   */
  parseIncremental(filePath: string, content: string, contentHash: string, edits: unknown[]): Promise<ParseResult>;

  /**
   * Get parser statistics
   */
  getStats(): ParserStats;

  /**
   * Clear any internal caches
   */
  clearCache(): void;
}
