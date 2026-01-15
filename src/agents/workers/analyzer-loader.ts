/**
 * Language Analyzer Loader
 *
 * Dynamically loads and caches language-specific parsers.
 * Supports: TypeScript, JavaScript, Python, C, C++, C#, Rust, Go, Java, Kotlin, Bash, PowerShell
 *
 * Extracted from generic-language-worker.ts for better modularity.
 */

import type { BaseParser } from "../../parsers/base-parser.js";

// =============================================================================
// Analyzer Cache
// =============================================================================

const analyzerCache: Map<string, BaseParser> = new Map();

/**
 * Get or create analyzer for specific language
 */
export async function getAnalyzer(language: string): Promise<BaseParser> {
  if (analyzerCache.has(language)) {
    return analyzerCache.get(language)!;
  }

  try {
    // Dynamically import language-specific analyzer
    let analyzer: BaseParser;

    switch (language) {
      case "python": {
        const { PythonNativeParser } = await import("../../parsers/python-native-parser.js");
        analyzer = new PythonNativeParser();
        break;
      }

      case "rust": {
        const { RustNativeParser } = await import("../../parsers/rust-native-parser.js");
        analyzer = new RustNativeParser();
        break;
      }

      case "cpp":
      case "c": {
        const { CppNativeParser } = await import("../../parsers/cpp-native-parser.js");
        analyzer = new CppNativeParser();
        break;
      }

      case "java": {
        const { JavaNativeParser } = await import("../../parsers/java-native-parser.js");
        analyzer = new JavaNativeParser();
        break;
      }

      case "go": {
        const { GoNativeParser } = await import("../../parsers/go-native-parser.js");
        analyzer = new GoNativeParser();
        break;
      }

      case "kotlin": {
        const { KotlinNativeParser } = await import("../../parsers/kotlin-native-parser.js");
        analyzer = new KotlinNativeParser();
        break;
      }

      case "bash": {
        const { BashNativeParser } = await import("../../parsers/bash-native-parser.js");
        analyzer = new BashNativeParser();
        break;
      }

      case "powershell": {
        const { PowerShellNativeParser } = await import("../../parsers/powershell-native-parser.js");
        analyzer = new PowerShellNativeParser();
        break;
      }

      case "typescript":
      case "javascript": {
        // Use UnifiedParser for TS/JS (TypeScript Compiler API)
        const { workerLog } = await import("./worker-logging.js");
        workerLog("INFO", `Loading UnifiedParser for ${language}`);
        const { UnifiedParser } = await import("../../parsers/unified-parser.js");
        workerLog("INFO", `UnifiedParser imported, creating instance`);
        analyzer = new UnifiedParser();
        workerLog("INFO", `Calling initialize()`);
        await analyzer.initialize();
        workerLog("INFO", `UnifiedParser initialized OK`);
        break;
      }

      case "json": {
        // Simple JSON parser - just returns empty entities (JSON doesn't have code entities)
        // JSON files are indexed for search but don't have AST entities
        analyzer = {
          initialize: async () => {},
          supportsFile: () => true,
          parse: async (filePath: string, _content: string, hash: string) => ({
            entities: [],
            filePath,
            contentHash: hash,
            language: "json",
            timestamp: Date.now(),
            parseTimeMs: 0,
          }),
          parseIncremental: async (filePath: string, _content: string, hash: string) => ({
            entities: [],
            filePath,
            contentHash: hash,
            language: "json",
            timestamp: Date.now(),
            parseTimeMs: 0,
          }),
          getStats: () => ({
            filesParsed: 0,
            cacheHits: 0,
            cacheMisses: 0,
            avgParseTimeMs: 0,
            totalParseTimeMs: 0,
            throughput: 0,
            cacheMemoryMB: 0,
            errorCount: 0,
          }),
          clearCache: () => {},
        };
        break;
      }

      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    analyzerCache.set(language, analyzer);
    return analyzer;
  } catch (error) {
    const { workerLog } = await import("./worker-logging.js");
    const err = error as Error;
    workerLog("ERROR", `Failed to load analyzer for ${language}`, {
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5).join(" "),
    });
    throw new Error(`Failed to load analyzer for ${language}`, { cause: error });
  }
}

/**
 * Clear all cached analyzers (for shutdown)
 */
export function clearAnalyzerCache(): void {
  analyzerCache.clear();
}

/**
 * List of supported languages
 */
export const SUPPORTED_WORKER_LANGUAGES = [
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
