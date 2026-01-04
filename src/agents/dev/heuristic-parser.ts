/**
 * Heuristic Parser Module
 *
 * Creates simple module entities for files that can't be parsed with AST.
 * Used for unsupported languages or when parser fails.
 */

import { basename, extname } from "node:path";
import type { ParsedEntity, ParseResult, SupportedLanguage } from "../../types/parser.js";

/**
 * Extension to language mapping for heuristic parsing
 */
const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".swift": "swift",
};

/**
 * Create heuristic entities for a file that can't be parsed with AST.
 * Creates a single module entity representing the file.
 */
export function createHeuristicEntities(filePath: string): ParseResult {
  const fileName = basename(filePath);
  const ext = extname(filePath).toLowerCase();

  // Map extension to language
  const language = EXTENSION_LANGUAGE_MAP[ext] || "python";

  // Create module name from path
  const moduleName = fileName.replace(ext, "");

  // Generate stable entity ID
  const moduleId = `module:${filePath}:${moduleName}`;

  const entities: ParsedEntity[] = [
    {
      id: moduleId,
      name: moduleName,
      type: "module",
      filePath,
      location: {
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 0, index: 0 },
      },
      language,
      metadata: {
        heuristic: true,
        extension: ext,
      },
    },
  ];

  return {
    filePath,
    language,
    entities,
    relationships: [],
    contentHash: moduleId,
    timestamp: Date.now(),
    parseTimeMs: 0,
  };
}
