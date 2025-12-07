/**
 * Language Detector for AutoDoc
 *
 * Detects documentation language based on non-Latin characters in comments.
 * Supports Russian (Cyrillic), Chinese (CJK), and defaults to English.
 *
 * Architecture References:
 * - Types: src/autodoc/types.ts
 * - RFC: docs/design/documentation-layer-rfc.md
 */

import type { DocLanguage } from "../types.js";

/**
 * Unicode ranges for language detection (using charCodeAt for performance)
 */
const UNICODE_RANGES = {
  // Cyrillic characters (Russian): U+0400–U+04FF
  cyrillicStart: 0x0400,
  cyrillicEnd: 0x04ff,
  // CJK Unified Ideographs: U+4E00–U+9FFF
  cjkStart: 0x4e00,
  cjkEnd: 0x9fff,
  // CJK Extension A: U+3400–U+4DBF
  cjkExtAStart: 0x3400,
  cjkExtAEnd: 0x4dbf,
  // Latin characters: a-z (0x61-0x7A), A-Z (0x41-0x5A)
  latinLowerStart: 0x61,
  latinLowerEnd: 0x7a,
  latinUpperStart: 0x41,
  latinUpperEnd: 0x5a,
} as const;

/**
 * Fast character classification using charCodeAt (no regex overhead)
 */
function classifyChar(code: number): "russian" | "chinese" | "latin" | "other" | "whitespace" {
  // Whitespace check (space, tab, newline, etc.)
  if (code <= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
    return "whitespace";
  }

  // Latin (most common in code, check first)
  if (
    (code >= UNICODE_RANGES.latinLowerStart && code <= UNICODE_RANGES.latinLowerEnd) ||
    (code >= UNICODE_RANGES.latinUpperStart && code <= UNICODE_RANGES.latinUpperEnd)
  ) {
    return "latin";
  }

  // Cyrillic
  if (code >= UNICODE_RANGES.cyrillicStart && code <= UNICODE_RANGES.cyrillicEnd) {
    return "russian";
  }

  // CJK
  if (
    (code >= UNICODE_RANGES.cjkStart && code <= UNICODE_RANGES.cjkEnd) ||
    (code >= UNICODE_RANGES.cjkExtAStart && code <= UNICODE_RANGES.cjkExtAEnd)
  ) {
    return "chinese";
  }

  return "other";
}

/**
 * Result of language detection
 */
export interface LanguageDetectionResult {
  /** Detected language code */
  language: DocLanguage;
  /** Confidence score (0-1) */
  confidence: number;
  /** Character counts by script */
  charCounts: {
    russian: number;
    chinese: number;
    latin: number;
    other: number;
  };
}

/**
 * Detect language from a single text string
 * Optimized: uses charCodeAt instead of regex for ~3x faster processing
 */
export function detectLanguageFromText(text: string): LanguageDetectionResult {
  const charCounts = {
    russian: 0,
    chinese: 0,
    latin: 0,
    other: 0,
  };

  // Count characters by script using fast charCodeAt lookup
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    const classification = classifyChar(code);

    if (classification === "russian") {
      charCounts.russian++;
    } else if (classification === "chinese") {
      charCounts.chinese++;
    } else if (classification === "latin") {
      charCounts.latin++;
    } else if (classification === "other") {
      charCounts.other++;
    }
    // Skip whitespace - don't count
  }

  const total = charCounts.russian + charCounts.chinese + charCounts.latin;
  if (total === 0) {
    return { language: "en", confidence: 0, charCounts };
  }

  // Determine language by dominant script
  const russianRatio = charCounts.russian / total;
  const chineseRatio = charCounts.chinese / total;
  const latinRatio = charCounts.latin / total;

  if (russianRatio > 0.3) {
    return {
      language: "ru",
      confidence: Math.min(russianRatio * 1.5, 1),
      charCounts,
    };
  }

  if (chineseRatio > 0.3) {
    return {
      language: "zh",
      confidence: Math.min(chineseRatio * 1.5, 1),
      charCounts,
    };
  }

  return {
    language: "en",
    confidence: Math.min(latinRatio, 1),
    charCounts,
  };
}

/**
 * Detect language from code comments
 */
export function detectLanguageFromComments(comments: string[]): LanguageDetectionResult {
  // Aggregate all comment text
  const allText = comments.join("\n");
  return detectLanguageFromText(allText);
}

/**
 * Detect language from code file content
 * Extracts comments and analyzes them
 */
export function detectLanguageFromCode(code: string, fileExtension: string): LanguageDetectionResult {
  const comments: string[] = [];

  // Extract single-line comments
  const singleLineRegex = /\/\/(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = singleLineRegex.exec(code)) !== null) {
    if (match[1]) comments.push(match[1]);
  }

  // Extract multi-line comments
  const multiLineRegex = /\/\*[\s\S]*?\*\//g;
  while ((match = multiLineRegex.exec(code)) !== null) {
    comments.push(match[0]);
  }

  // Extract Python-style comments
  if (fileExtension === ".py") {
    const pythonCommentRegex = /#(.*)$/gm;
    while ((match = pythonCommentRegex.exec(code)) !== null) {
      if (match[1]) comments.push(match[1]);
    }
    // Extract docstrings
    const docstringRegex = /"""[\s\S]*?"""|'''[\s\S]*?'''/g;
    while ((match = docstringRegex.exec(code)) !== null) {
      comments.push(match[0]);
    }
  }

  if (comments.length === 0) {
    return { language: "en", confidence: 0, charCounts: { russian: 0, chinese: 0, latin: 0, other: 0 } };
  }

  return detectLanguageFromComments(comments);
}

/**
 * Aggregate language detection results from multiple files
 */
export function aggregateLanguageDetection(results: LanguageDetectionResult[]): LanguageDetectionResult {
  const totalCounts = {
    russian: 0,
    chinese: 0,
    latin: 0,
    other: 0,
  };

  for (const result of results) {
    totalCounts.russian += result.charCounts.russian;
    totalCounts.chinese += result.charCounts.chinese;
    totalCounts.latin += result.charCounts.latin;
    totalCounts.other += result.charCounts.other;
  }

  const total = totalCounts.russian + totalCounts.chinese + totalCounts.latin;
  if (total === 0) {
    return { language: "en", confidence: 0, charCounts: totalCounts };
  }

  const russianRatio = totalCounts.russian / total;
  const chineseRatio = totalCounts.chinese / total;
  const latinRatio = totalCounts.latin / total;

  if (russianRatio > 0.3) {
    return {
      language: "ru",
      confidence: Math.min(russianRatio * 1.5, 1),
      charCounts: totalCounts,
    };
  }

  if (chineseRatio > 0.3) {
    return {
      language: "zh",
      confidence: Math.min(chineseRatio * 1.5, 1),
      charCounts: totalCounts,
    };
  }

  return {
    language: "en",
    confidence: Math.min(latinRatio, 1),
    charCounts: totalCounts,
  };
}
