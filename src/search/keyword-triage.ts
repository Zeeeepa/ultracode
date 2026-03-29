/**
 * Keyword Triage — ported from ultracode.zig/src/parsers/simd_triage.zig
 *
 * Fast scan to determine if a file contains entity-defining keywords
 * (function, class, def, struct, etc.) in live code (not in strings/comments).
 *
 * Purpose: skip expensive tree-sitter parsing for files that have no entities
 * (data files, config, generated code with no structure). Typical savings:
 * 30-50% of files in a project are pure data or have no entity keywords.
 *
 * The Zig version uses SIMD CodeClassifier + keyword first-byte filter
 * to skip ~80% of byte positions. This TS port uses scalar CodeClassifier
 * with the same word-boundary + first-byte optimization.
 */

import { CodeClassifier, isWordBoundary } from "./code-classifier.js";

const CHUNK_LEN = 32;

export interface KeywordScanResult {
  hasEntityKeywords: boolean;
  keywordCount: number;
  estimatedEntities: number;
}

/**
 * Scan file for entity-defining keywords using CodeClassifier to skip strings/comments.
 * Returns false if file has no entity keywords → safe to skip tree-sitter.
 *
 * @param source - File content as bytes
 * @param language - Language identifier (lowercase: 'javascript', 'python', 'go', etc.)
 * @returns Scan result with keyword presence and count
 */
export function scanForKeywords(source: Uint8Array, language: string): KeywordScanResult {
  const keywords = getKeywordsForLanguage(language);
  if (keywords.length === 0) {
    return { hasEntityKeywords: true, keywordCount: 0, estimatedEntities: 0 };
  }

  const hashComments = language === "python" || language === "bash";

  // Build unique first-byte set for fast filtering
  const firstBytes = new Set<number>();
  for (const kw of keywords) {
    if (kw.length > 0) firstBytes.add(kw.charCodeAt(0));
  }

  // Encode keywords as byte arrays once
  const encoder = new TextEncoder();
  const kwBytes = keywords.map((kw) => encoder.encode(kw));

  const cc = new CodeClassifier();
  let count = 0;

  let offset = 0;
  while (offset < source.length) {
    const chunkLen = Math.min(CHUNK_LEN, source.length - offset);

    // Classify which bytes are live code
    const codeMask = cc.classifyChunk(source, offset, hashComments);

    // Scan code bytes for keyword starts
    for (let j = 0; j < chunkLen; j++) {
      const bit = 1 << j;
      if (!(codeMask & bit)) continue; // skip non-code bytes

      const absPos = offset + j;
      const ch = source[absPos]!;

      // First-byte filter: skip if this byte can't start any keyword
      if (!firstBytes.has(ch)) continue;

      // Word boundary check: previous char must be a boundary
      const prev = absPos > 0 ? source[absPos - 1]! : 0;
      if (!isWordBoundary(prev)) continue;

      // Full keyword match
      for (const kw of kwBytes) {
        if (absPos + kw.length > source.length) continue;

        // Check keyword bytes match
        let match = true;
        for (let k = 0; k < kw.length; k++) {
          if (source[absPos + k] !== kw[k]) {
            match = false;
            break;
          }
        }
        if (!match) continue;

        // Check word boundary after keyword
        const afterPos = absPos + kw.length;
        if (afterPos < source.length && isIdentCont(source[afterPos]!)) continue;

        count++;
        break; // found a keyword at this position
      }
    }

    offset += chunkLen;
  }

  return {
    hasEntityKeywords: count > 0,
    keywordCount: count,
    estimatedEntities: count,
  };
}

function isIdentCont(ch: number): boolean {
  return (
    (ch >= 0x61 && ch <= 0x7a) || // a-z
    (ch >= 0x41 && ch <= 0x5a) || // A-Z
    (ch >= 0x30 && ch <= 0x39) || // 0-9
    ch === 0x5f // _
  );
}

/**
 * Per-language entity-defining keywords.
 * Matches ultracode.zig/src/parsers/simd_triage.zig exactly.
 */
function getKeywordsForLanguage(language: string): string[] {
  switch (language) {
    case "javascript":
    case "typescript":
    case "tsx":
    case "jsx":
      return ["function", "class", "interface", "import", "export", "enum", "type", "const", "let", "var"];
    case "python":
      return ["def", "class", "import", "from", "async"];
    case "go":
      return ["func", "type", "import", "var", "const", "package"];
    case "java":
      return ["class", "interface", "enum", "import", "void", "public", "private", "protected"];
    case "kotlin":
      return ["fun", "class", "interface", "import", "object", "enum", "val", "var"];
    case "rust":
      return ["fn", "struct", "enum", "trait", "impl", "mod", "use", "const", "static", "pub"];
    case "c":
    case "cpp":
      return ["struct", "enum", "class", "namespace", "typedef", "void", "int", "char", "float", "double", "#include"];
    case "bash":
      return ["function"];
    case "csharp":
      return ["class", "interface", "struct", "enum", "namespace", "void", "public", "private", "protected"];
    case "swift":
      return ["func", "class", "struct", "enum", "protocol", "import", "var", "let"];
    case "zig":
      return ["fn", "const", "pub", "struct", "enum", "union", "test"];
    default:
      return []; // unknown language — don't filter, always parse
  }
}
