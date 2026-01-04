/**
 * Language Detection
 *
 * Detects programming language from file extension.
 */

import { extname } from "node:path";

/**
 * Extension to language mapping
 */
export const LANGUAGE_MAP: Record<string, string> = {
  ".py": "python",
  ".pyi": "python",
  ".pyw": "python",
  ".rs": "rust",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".java": "java",
  ".go": "go",
  ".c": "c",
  ".h": "c",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".psd1": "powershell",
  ".swift": "swift",
  ".css": "css",
  ".scss": "css",
  ".sass": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
};

/**
 * List of all supported languages
 */
export const SUPPORTED_LANGUAGES = [
  "python",
  "rust",
  "cpp",
  "java",
  "go",
  "c",
  "kotlin",
  "bash",
  "powershell",
  "typescript",
  "javascript",
  "json",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || "unknown";
}
