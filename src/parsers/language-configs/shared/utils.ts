/**
 * Language Configuration Utilities
 *
 * Helper functions for language detection and validation.
 */

import type { SupportedLanguage } from "../../../types/parser.js";
import { FILE_EXTENSIONS } from "./keywords.js";

/**
 * Detect language from file path
 */
export function detectLanguageFromPath(filePath: string): SupportedLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase();

  // Handle special cases for C vs C++
  if (ext === "h") {
    // Check if it's a C++ header by looking for C++ indicators in the path
    if (filePath.includes("++") || filePath.includes("cpp") || filePath.includes("cxx")) {
      return "cpp";
    }
    return "c";
  }

  if (ext === "C") {
    return "cpp"; // Capital C is typically C++
  }

  return FILE_EXTENSIONS[ext || ""] || "javascript";
}

/**
 * Check if file is supported
 */
export function isFileSupported(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext ? ext in FILE_EXTENSIONS : false;
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(FILE_EXTENSIONS);
}
