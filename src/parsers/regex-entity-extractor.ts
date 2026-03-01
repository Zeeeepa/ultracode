/**
 * Regex Entity Extractor
 *
 * Unified abstraction for regex-based entity extraction across parsers.
 * Replaces the repeated pattern of:
 *   const re = /pattern/gm;
 *   while ((match = re.exec(content))) { entities.push({...}) }
 *
 * Used by: bash, python, powershell, cpp, rust, go native parsers.
 *
 * NOT used by parsers with complex body-parsing logic (swift, zig)
 * or line-by-line analysis (batch-analyzer).
 */

import type { ParsedEntity } from "../types/parser.js";
import { LineOffsetMap } from "./base-parser-utils.js";

/**
 * A single regex extraction rule that maps regex matches to ParsedEntity objects.
 *
 * @param regex - The regex pattern (must have 'g' flag). Will be reset before use.
 * @param mapper - Converts a regex match into a ParsedEntity (or null to skip).
 *                 Receives the match, filePath, and a location resolver.
 * @param dedupKey - Optional dedup function. If provided and returns a key that
 *                   was already seen, the entity is skipped.
 */
export interface RegexExtractionRule {
  regex: RegExp;
  mapper: (
    match: RegExpExecArray,
    filePath: string,
    getLocation: (index: number) => ParsedEntity["location"],
  ) => ParsedEntity | null;
  dedupKey?: (match: RegExpExecArray) => string | null;
}

/**
 * Run a set of regex extraction rules against content and collect entities.
 *
 * Features:
 * - Uses LineOffsetMap for O(log n) location lookups instead of O(n) per entity
 * - Automatically resets regex lastIndex before each pass
 * - Supports deduplication across rules via dedupKey
 * - Null returns from mapper are silently skipped
 *
 * @param content - The source code text
 * @param filePath - The file path for entity attribution
 * @param rules - Array of extraction rules to apply in order
 * @returns Array of extracted ParsedEntity objects
 */
export function runRegexExtractors(content: string, filePath: string, rules: RegexExtractionRule[]): ParsedEntity[] {
  const entities: ParsedEntity[] = [];
  const lineMap = new LineOffsetMap(content);
  const getLocation = (index: number) => lineMap.getEntityLocation(index);
  const seen = new Set<string>();

  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.regex.exec(content))) {
      if (rule.dedupKey) {
        const key = rule.dedupKey(match);
        if (key !== null) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
      }

      const entity = rule.mapper(match, filePath, getLocation);
      if (entity) {
        entities.push(entity);
      }
    }
  }

  return entities;
}
