/**
 * Generic Language Worker Thread
 *
 * Universal worker that can parse any supported language.
 * Dynamically loads appropriate analyzer based on language parameter.
 *
 * Supported: TypeScript, JavaScript, Python, C, C++, C#, Rust, Go, Java, VBA
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import type { ParseResult, ParserOptions } from "../../types/parser.js";

// =============================================================================
// TYPES
// =============================================================================

interface WorkerTask {
  id: string;
  files: string[];
  language: string; // Language identifier (e.g., "python", "rust", "typescript")
  options?: ParserOptions;
}

interface WorkerResult {
  taskId: string;
  results: ParseResult[];
  errors?: Array<{ file: string; message: string }>;
  stats: {
    filesProcessed: number;
    totalTime: number;
    avgTimePerFile: number;
    language: string;
  };
}

// =============================================================================
// LANGUAGE-SPECIFIC PARSER CACHE
// =============================================================================

const analyzerCache: Map<string, any> = new Map();

/**
 * Get or create analyzer for specific language
 */
async function getAnalyzer(language: string): Promise<any> {
  if (analyzerCache.has(language)) {
    return analyzerCache.get(language);
  }

  try {
    // Dynamically import language-specific analyzer
    let analyzer: any;

    switch (language) {
      case "python": {
        const { createPythonAnalyzer } = await import("../../parsers/python-analyzer.js");
        analyzer = createPythonAnalyzer();
        break;
      }

      case "rust": {
        const { RustAnalyzer } = await import("../../parsers/rust-analyzer.js");
        analyzer = new RustAnalyzer();
        break;
      }

      case "cpp": {
        const { CppAnalyzer } = await import("../../parsers/cpp-analyzer.js");
        analyzer = new CppAnalyzer();
        break;
      }
      case "java": {
        const { JavaAnalyzer } = await import("../../parsers/java-analyzer.js");
        analyzer = new JavaAnalyzer();
        break;
      }

      case "go": {
        const { GoAnalyzer } = await import("../../parsers/go-analyzer.js");
        analyzer = new GoAnalyzer();
        break;
      }

      case "c": {
        const { CAnalyzer } = await import("../../parsers/c-analyzer.js");
        analyzer = new CAnalyzer();
        break;
      }

      case "vba": {
        const { VbaAnalyzer } = await import("../../parsers/vba-analyzer.js");
        analyzer = new VbaAnalyzer();
        break;
      }

      case "typescript":
      case "javascript": {
        // Use IncrementalParser for TS/JS
        const { IncrementalParser } = await import("../../parsers/incremental-parser.js");
        analyzer = new IncrementalParser(100 * 1024 * 1024); // 100MB cache
        await analyzer.initialize();
        break;
      }

      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    analyzerCache.set(language, analyzer);
    return analyzer;
  } catch (error) {
    throw new Error(`Failed to load analyzer for ${language}: ${(error as Error).message}`);
  }
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();

  const languageMap: Record<string, string> = {
    ".py": "python",
    ".pyi": "python",
    ".pyw": "python",
    ".rs": "rust",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".cs": "csharp",
    ".java": "java",
    ".go": "go",
    ".c": "c",
    ".h": "c",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".css": "css",
    ".scss": "css",
    ".sass": "css",
    ".less": "css",
    ".html": "html",
    ".htm": "html",
    ".xml": "xml",
    ".vba": "vba",
    ".bas": "vba",
    ".cls": "vba",
    ".frm": "vba",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
  };

  return languageMap[ext] || "unknown";
}

// =============================================================================
// TASK PROCESSING
// =============================================================================

async function processTask(task: WorkerTask): Promise<WorkerResult> {
  const startTime = Date.now();
  const results: ParseResult[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  // Get analyzer for this language
  let analyzer: any;
  try {
    analyzer = await getAnalyzer(task.language);
  } catch (error) {
    return {
      taskId: task.id,
      results: [],
      errors: [{ file: "all", message: (error as Error).message }],
      stats: {
        filesProcessed: 0,
        totalTime: Date.now() - startTime,
        avgTimePerFile: 0,
        language: task.language,
      },
    };
  }

  for (const file of task.files) {
    try {
      // Verify language matches
      const detectedLang = detectLanguage(file);
      if (detectedLang !== task.language && detectedLang !== "unknown") {
        errors.push({
          file,
          message: `Language mismatch: expected ${task.language}, got ${detectedLang}`,
        });
        continue;
      }

      const fileStart = Date.now();

      // Read file content
      const content = readFileSync(file, "utf-8");

      // Parse file with appropriate analyzer
      let result: ParseResult;

      if (task.language === "typescript" || task.language === "javascript") {
        // IncrementalParser has parseFile method
        result = await analyzer.parseFile(file, undefined, task.options);
      } else {
        // Language-specific analyzers have parseFile(path, content)
        result = await analyzer.parseFile(file, content);
      }

      results.push(result);

      const fileDuration = Date.now() - fileStart;

      // Log slow files for monitoring
      if (fileDuration > 300) {
        console.warn(`[GenericWorker:${task.language}] Slow parse: ${file} took ${fileDuration}ms`);
      }
    } catch (error) {
      errors.push({
        file,
        message: (error as Error).message,
      });
    }
  }

  const totalTime = Date.now() - startTime;

  return {
    taskId: task.id,
    results,
    errors: errors.length > 0 ? errors : undefined,
    stats: {
      filesProcessed: task.files.length,
      totalTime,
      avgTimePerFile: task.files.length > 0 ? totalTime / task.files.length : 0,
      language: task.language,
    },
  };
}

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

if (parentPort) {
  parentPort.on("message", async (message: any) => {
    try {
      if (message.type === "init") {
        if (parentPort) {
          parentPort.postMessage({
            type: "initialized",
            workerId: workerData?.workerId || "generic-worker",
            supportedLanguages: [
              "python",
              "rust",
              "cpp",
              "csharp",
              "java",
              "go",
              "c",
              "vba",
              "typescript",
              "javascript",
            ],
          });
        }
        return;
      }

      if (message.type === "shutdown") {
        // Clear caches
        analyzerCache.clear();
        process.exit(0);
      }

      if (message.type === "task") {
        const task = message.payload as WorkerTask;
        const result = await processTask(task);

        if (parentPort) {
          parentPort.postMessage({
            type: "result",
            payload: result,
          });
        }
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: "error",
          taskId: message.payload?.id,
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    }
  });

  // Signal ready
  parentPort.postMessage({
    type: "ready",
    workerId: workerData?.workerId || "generic-worker",
    mode: "universal",
  });
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

process.on("uncaughtException", (error) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Uncaught exception in generic-worker: ${error.message}`,
      stack: error.stack,
    });
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "error",
      error: `Unhandled rejection in generic-worker: ${reason}`,
    });
  }
  process.exit(1);
});
