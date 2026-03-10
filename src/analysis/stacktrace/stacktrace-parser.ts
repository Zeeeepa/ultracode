/**
 * Stacktrace Parser Dispatcher
 *
 * Auto-detects language and delegates to the appropriate parser.
 * Each parser implements detect() returning 0-1 confidence.
 * The parser with highest confidence wins.
 */

import { DotNetStacktraceParser } from "./parsers/dotnet-parser.js";
import { GoStacktraceParser } from "./parsers/go-parser.js";
import { JavaScriptStacktraceParser } from "./parsers/javascript-parser.js";
import { JvmStacktraceParser } from "./parsers/jvm-parser.js";
import { NativeStacktraceParser } from "./parsers/native-parser.js";
import { PythonStacktraceParser } from "./parsers/python-parser.js";
import { RustStacktraceParser } from "./parsers/rust-parser.js";
import { ZigStacktraceParser } from "./parsers/zig-parser.js";
import type { LanguageStacktraceParser, ParsedStacktrace } from "./types.js";

// All registered parsers
const PARSERS: LanguageStacktraceParser[] = [
  new JavaScriptStacktraceParser(),
  new PythonStacktraceParser(),
  new JvmStacktraceParser(),
  new DotNetStacktraceParser(),
  new GoStacktraceParser(),
  new RustStacktraceParser(),
  new NativeStacktraceParser(),
  new ZigStacktraceParser(),
];

const LANGUAGE_MAP: Record<string, string> = {
  javascript: "javascript",
  js: "javascript",
  typescript: "javascript",
  ts: "javascript",
  node: "javascript",
  python: "python",
  py: "python",
  java: "java",
  kotlin: "java",
  jvm: "java",
  csharp: "csharp",
  "c#": "csharp",
  dotnet: "csharp",
  ".net": "csharp",
  fsharp: "csharp",
  go: "go",
  golang: "go",
  rust: "rust",
  rs: "rust",
  c: "c/c++",
  cpp: "c/c++",
  "c++": "c/c++",
  swift: "c/c++",
  zig: "zig",
};

/**
 * Parse a stacktrace string, auto-detecting language.
 *
 * @param text Raw stacktrace text
 * @param hintLanguage Optional language hint to skip auto-detection
 * @returns Parsed stacktrace with frames, error info, and detected language
 */
export function parseStacktrace(text: string, hintLanguage?: string): ParsedStacktrace {
  // If language hint provided, use matching parser directly
  if (hintLanguage) {
    const normalized = LANGUAGE_MAP[hintLanguage.toLowerCase()] ?? hintLanguage.toLowerCase();
    const parser = PARSERS.find((p) => p.language === normalized);
    if (parser) {
      return parser.parse(text);
    }
  }

  // Auto-detect: run detect() on all parsers, pick highest confidence
  let bestParser: LanguageStacktraceParser | null = null;
  let bestScore = 0;

  for (const parser of PARSERS) {
    const score = parser.detect(text);
    if (score > bestScore) {
      bestScore = score;
      bestParser = parser;
    }
  }

  if (!bestParser || bestScore < 0.1) {
    // Fallback: return a minimal ParsedStacktrace with raw text
    return {
      language: "unknown",
      errorType: "Unknown",
      errorMessage: text.split("\n")[0] ?? "",
      frames: [],
      rawText: text,
    };
  }

  return bestParser.parse(text);
}

/**
 * Get supported language names for schema enum.
 */
export function getSupportedLanguages(): string[] {
  return PARSERS.map((p) => p.language);
}
