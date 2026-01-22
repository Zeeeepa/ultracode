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
const initPromiseCache: Map<string, Promise<BaseParser>> = new Map();

/**
 * Get or create analyzer for specific language
 * Uses promise caching to prevent race conditions during initialization
 */
export async function getAnalyzer(language: string): Promise<BaseParser> {
  // Return cached analyzer if ready
  if (analyzerCache.has(language)) {
    return analyzerCache.get(language)!;
  }

  // If initialization is in progress, wait for it
  if (initPromiseCache.has(language)) {
    return initPromiseCache.get(language)!;
  }

  // Create and cache initialization promise
  const initPromise = createAnalyzer(language);
  initPromiseCache.set(language, initPromise);

  try {
    const analyzer = await initPromise;
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
  } finally {
    // Clear promise cache after initialization (success or failure)
    initPromiseCache.delete(language);
  }
}

/**
 * Create analyzer for specific language (internal)
 */
async function createAnalyzer(language: string): Promise<BaseParser> {
  let analyzer: BaseParser;

  switch (language) {
    case "python": {
      const { workerLog } = await import("./worker-logging.js");
      workerLog("INFO", `Loading PythonNativeParser`);
      const { PythonNativeParser } = await import("../../parsers/python-native-parser.js");
      analyzer = new PythonNativeParser();
      workerLog("INFO", `Calling initialize() for Python CLI detection`);
      await analyzer.initialize();
      const parserInfo = analyzer as { cliScriptAvailable?: boolean; pythonAvailable?: boolean };
      workerLog("INFO", `PythonNativeParser initialized`, {
        cliAvail: parserInfo.cliScriptAvailable,
        pyAvail: parserInfo.pythonAvailable,
      });
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
      const { workerLog } = await import("./worker-logging.js");
      workerLog("INFO", `Loading JavaNativeParser`);
      const { JavaNativeParser } = await import("../../parsers/java-native-parser.js");
      analyzer = new JavaNativeParser();
      await analyzer.initialize();
      workerLog("INFO", `JavaNativeParser initialized (Chevrotain mode)`);
      break;
    }

    case "go": {
      const { GoNativeParser } = await import("../../parsers/go-native-parser.js");
      analyzer = new GoNativeParser();
      break;
    }

    case "kotlin": {
      const { workerLog } = await import("./worker-logging.js");
      workerLog("INFO", `[KOTLIN_DEBUG] Loading KotlinNativeParser (case kotlin reached)`);
      const { KotlinNativeParser } = await import("../../parsers/kotlin-native-parser.js");
      analyzer = new KotlinNativeParser();
      workerLog("INFO", `Calling initialize() for Kotlin LSP detection`);
      await analyzer.initialize();
      workerLog("INFO", `KotlinNativeParser initialized`);
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

  return analyzer;
}

/**
 * Clear all cached analyzers (for shutdown)
 */
export function clearAnalyzerCache(): void {
  analyzerCache.clear();
  initPromiseCache.clear();
}

// =============================================================================
// ANTLR Parser Warmup
// =============================================================================

/**
 * Minimal code snippets for ANTLR parser warmup.
 * These trigger JIT compilation of the parser before real files arrive.
 *
 * Note: Java uses Chevrotain (java-parser) which doesn't need warmup.
 * Only ANTLR-based parsers (Kotlin, Rust) benefit from warmup.
 */
const WARMUP_SNIPPETS: Record<string, string> = {
  kotlin: `package warmup
class WarmupClass {
  fun warmupMethod(): String = "warmup"
  val warmupProperty: Int = 42
}`,
  rust: `mod warmup {
  pub fn warmup_fn() -> i32 { 42 }
  pub struct WarmupStruct { field: i32 }
}`,
};

/**
 * Languages that benefit from warmup (ANTLR-based parsers)
 * Note: Java now uses Chevrotain (java-parser) which doesn't need JIT warmup
 */
const WARMUP_LANGUAGES = new Set(["kotlin", "rust"]);

/**
 * Warmup analyzer for a language by parsing a minimal snippet.
 * This triggers JIT compilation of ANTLR parsers before real files arrive.
 * Returns true if warmup was performed, false if not needed.
 */
export async function warmupAnalyzer(language: string): Promise<boolean> {
  if (!WARMUP_LANGUAGES.has(language)) {
    return false;
  }

  const snippet = WARMUP_SNIPPETS[language];
  if (!snippet) {
    return false;
  }

  try {
    const { workerLog } = await import("./worker-logging.js");
    const startTime = Date.now();

    // Get or create analyzer (this loads the ANTLR parser)
    const analyzer = await getAnalyzer(language);

    // Parse minimal snippet to trigger JIT compilation
    await analyzer.parse(
      `warmup.${language === "kotlin" ? "kt" : language === "java" ? "java" : "rs"}`,
      snippet,
      "warmup-hash",
    );

    const elapsed = Date.now() - startTime;
    workerLog("INFO", `ANTLR warmup complete for ${language}`, { elapsed });
    return true;
  } catch (error) {
    const { workerLog } = await import("./worker-logging.js");
    workerLog("WARN", `ANTLR warmup failed for ${language}`, { error: String(error) });
    return false;
  }
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

/**
 * Check if analyzer supports batch parsing
 */
export function supportsBatchParsing(language: string): boolean {
  return language === "python";
}

/**
 * Get Python analyzer with batch support (for optimized multi-file parsing)
 */
type BatchParseFunction = (
  files: Array<{ filePath: string; content: string; contentHash: string }>,
) => Promise<import("../../types/parser.js").ParseResult[]>;

interface AnalyzerWithBatch {
  parseBatch: BatchParseFunction;
}

export async function getPythonAnalyzerWithBatch(): Promise<AnalyzerWithBatch | null> {
  try {
    const analyzer = await getAnalyzer("python");
    // Check if it's PythonNativeParser with parseBatch method
    const maybeWithBatch = analyzer as unknown as { parseBatch?: unknown };
    if (analyzer && typeof maybeWithBatch.parseBatch === "function") {
      return analyzer as unknown as AnalyzerWithBatch;
    }
    return null;
  } catch {
    return null;
  }
}
