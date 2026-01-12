/**
 * Generic Language Worker
 *
 * Universal worker that can parse any supported language.
 * Dynamically loads appropriate analyzer based on language parameter.
 *
 * Supports 3 modes:
 * 1. Bun Web Worker (postMessage)
 * 2. Node.js worker_threads (parentPort)
 * 3. Subprocess (V8 native IPC via fork()) - for memory isolation
 *
 * Subprocess mode: process dies after batch, OS reclaims memory.
 *
 * Supported: TypeScript, JavaScript, Python, C, C++, C#, Rust, Go, Java, VBA
 */

import { readFile } from "node:fs/promises";
import type { ParseResult, ParserOptions } from "../../types/parser.js";
// Extracted modules
import { clearAnalyzerCache, getAnalyzer, SUPPORTED_WORKER_LANGUAGES } from "./analyzer-loader.js";
import {
  clearDeduplicationForFiles,
  clearEmbeddingClient,
  generateEmbeddingsForEntities,
  getEmbeddingClient,
  getEmbeddingConfig,
  initEmbeddingClient,
  sendCollectedEmbeddings,
  sendCollectedTexts,
  setEmbeddingConfig,
} from "./embedding-processor.js";
// WorkerEmbeddingConfig imported by embedding-processor
import { detectLanguage } from "./language-detection.js";
import { setWorkerIdGetter, WORKER_ID, workerLog } from "./worker-logging.js";

// Early stderr logging for debugging worker startup (process.stderr.write bypasses console)
process.stderr.write(`[WORKER:${WORKER_ID}] Starting worker process, pid=${process.pid}\n`);

// Global error handler to catch crashes
process.on("uncaughtException", (err) => {
  process.stderr.write(`[WORKER:${WORKER_ID}] UNCAUGHT EXCEPTION: ${err.message}\n`);
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[WORKER:${WORKER_ID}] UNHANDLED REJECTION: ${reason}\n`);
  process.exit(1);
});

// =============================================================================
// RUNTIME-AWARE WORKER COMMUNICATION
// =============================================================================

// Web Worker global scope type (for Bun Web Workers)
declare const self:
  | {
      postMessage: (message: unknown) => void;
      addEventListener: (type: string, listener: (event: any) => void) => void;
      close?: () => void;
      name?: string | undefined;
    }
  | undefined;

// Detect runtime environment
// Priority: Subprocess > Bun Web Worker > Node.js worker_threads
// Subprocess mode: PARSING_WORKER_ID env var is set by parent process
const isSubprocess = !!process.env["PARSING_WORKER_ID"];
const isBunWorker = !isSubprocess && typeof self !== "undefined" && typeof self?.postMessage === "function";
const isNodeWorker = !isSubprocess && !isBunWorker;

// Node.js worker_threads (dynamic import handled at module load)
let parentPort: import("node:worker_threads").MessagePort | null = null;
let workerData: any = null;

// Initialize worker_threads for Node.js (async IIFE)
const initPromise = (async () => {
  if (isNodeWorker) {
    try {
      const wt = await import("node:worker_threads");
      parentPort = wt.parentPort;
      workerData = wt.workerData;
    } catch {
      // Not in worker_threads context
    }
  }
})();

// Unified message posting (supports all 3 modes)
// transferList: ArrayBuffers to transfer (zero-copy) instead of clone
function postWorkerMessage(message: any, transferList?: ArrayBuffer[]): void {
  if (isSubprocess) {
    // Subprocess mode: V8 native IPC via process.send()
    // Note: process.send() doesn't support transferList, but uses structured clone
    process.send?.(message);
  } else if (isBunWorker && self) {
    // Bun Web Worker: supports transferList for zero-copy transfer
    if (transferList && transferList.length > 0) {
      (self as any).postMessage(message, transferList);
    } else {
      self.postMessage(message);
    }
  } else if (parentPort) {
    // Node.js worker_threads: supports transferList
    if (transferList && transferList.length > 0) {
      parentPort.postMessage(message, transferList);
    } else {
      parentPort.postMessage(message);
    }
  }
}

// Get worker ID
function getWorkerId(): string {
  if (isSubprocess) {
    return process.env["PARSING_WORKER_ID"] || "subprocess-worker";
  }
  if (isBunWorker && self) {
    return self.name || "bun-worker";
  }
  return workerData?.workerId || "node-worker";
}

// Configure worker ID getter for extracted modules
setWorkerIdGetter(getWorkerId);

// =============================================================================
// TYPES
// =============================================================================

interface WorkerTask {
  id: string;
  files: string[];
  language: string; // Language identifier (e.g., "python", "rust", "typescript")
  options?: ParserOptions | undefined;
  streamingMode?: boolean; // If true, send results as they become ready (streaming_result messages)
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
// TASK PROCESSING
// =============================================================================

// Prefetch configuration
const PREFETCH_AHEAD = 3; // Number of files to read ahead

// Generated code detection markers
const GENERATED_HEADER_MARKERS = [
  // ANTLR parser generators
  {
    check: (h: string) => h.includes("generated from") && (h.includes("by antlr") || h.includes("antlr4")),
    type: "ANTLR",
  },
  // Protobuf
  { check: (h: string) => h.includes("code generated by protoc"), type: "Protobuf" },
  // gRPC
  { check: (h: string) => h.includes("code generated by protoc-gen"), type: "gRPC" },
  // Thrift
  { check: (h: string) => h.includes("autogenerated by thrift"), type: "Thrift" },
  // Bison/Yacc
  { check: (h: string) => h.includes("a bison parser") || h.includes("generated by bison"), type: "Bison" },
  // Flex/Lex
  {
    check: (h: string) => h.includes("generated by flex") || h.includes("a lexical scanner generated by flex"),
    type: "Flex",
  },
  // SWIG (C/C++ bindings)
  { check: (h: string) => h.includes("swig") && h.includes("generated"), type: "SWIG" },
  // PEG.js / Peggy
  { check: (h: string) => h.includes("generated by peg") || h.includes("generated by peggy"), type: "PEG" },
  // Tree-sitter bindings
  { check: (h: string) => h.includes("tree-sitter") && h.includes("generated"), type: "TreeSitter" },
];

const GENERATED_FILENAME_MARKERS = [
  {
    check: (f: string) => f.endsWith(".pb.go") || f.endsWith(".pb.ts") || f.endsWith("_pb.js") || f.endsWith("_pb2.py"),
    type: "Protobuf",
  },
  { check: (f: string) => f.includes("_grpc.pb."), type: "gRPC" },
  { check: (f: string) => f.endsWith(".min.js") || f.endsWith(".min.css"), type: "Minified" },
];

/**
 * Check if file content indicates generated code
 */
function isGeneratedCode(fileName: string, content: string): { skipped: boolean; type?: string } {
  const header = content.slice(0, 800).toLowerCase();
  const fileNameLower = fileName.toLowerCase();

  // Check header markers
  for (const marker of GENERATED_HEADER_MARKERS) {
    if (marker.check(header)) {
      return { skipped: true, type: marker.type };
    }
  }

  // Check filename patterns
  for (const marker of GENERATED_FILENAME_MARKERS) {
    if (marker.check(fileNameLower)) {
      return { skipped: true, type: marker.type };
    }
  }

  return { skipped: false };
}

/**
 * Prefetch manager for async file reading with overlap
 */
class PrefetchManager {
  private cache = new Map<string, Promise<string>>();
  private files: string[];
  private currentIdx = 0;

  constructor(files: string[]) {
    this.files = files;
  }

  /**
   * Start prefetching from current index
   */
  prefetchAhead(): void {
    const endIdx = Math.min(this.currentIdx + PREFETCH_AHEAD, this.files.length);

    for (let i = this.currentIdx; i < endIdx; i++) {
      const file = this.files[i];
      if (file && !this.cache.has(file)) {
        // Start async read, store promise
        this.cache.set(
          file,
          readFile(file, "utf-8").catch(() => ""),
        );
      }
    }
  }

  /**
   * Get file content (from cache or read)
   */
  async getContent(file: string): Promise<string> {
    const cached = this.cache.get(file);
    if (cached) {
      const content = await cached;
      this.cache.delete(file); // Free memory after use
      return content;
    }
    // Fallback to direct read if not in cache
    return readFile(file, "utf-8");
  }

  /**
   * Advance to next file and trigger prefetch
   */
  advance(): void {
    this.currentIdx++;
    this.prefetchAhead();
  }

  /**
   * Clear all cached content
   */
  clear(): void {
    this.cache.clear();
  }
}

async function processTask(task: WorkerTask): Promise<WorkerResult> {
  const startTime = Date.now();
  const results: ParseResult[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  // Clear deduplication cache for files being parsed
  // This ensures embeddings are regenerated for modified files during incremental indexing
  const clearedDedup = clearDeduplicationForFiles(task.files);

  workerLog("INFO", `Task started`, {
    taskId: task.id,
    language: task.language,
    fileCount: task.files.length,
    ...(clearedDedup > 0 && { clearedDedup }),
  });

  // For universal mode, we get analyzer per-file based on detected language
  // For specific language, we use one analyzer for all files
  const isUniversalMode = task.language === "universal";
  let sharedAnalyzer: any = null;

  if (!isUniversalMode) {
    try {
      sharedAnalyzer = await getAnalyzer(task.language);
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
  }

  // Track file contents for embedding generation
  const fileContents = new Map<string, string>();

  // Initialize prefetch manager for async I/O overlap
  const prefetch = new PrefetchManager(task.files);
  prefetch.prefetchAhead(); // Start prefetching first batch

  let ioTime = 0;
  let parseTime = 0;

  for (const file of task.files) {
    try {
      // Verify language matches (skip check for universal pool)
      const detectedLang = detectLanguage(file);
      if (task.language !== "universal" && detectedLang !== task.language && detectedLang !== "unknown") {
        errors.push({
          file,
          message: `Language mismatch: expected ${task.language}, got ${detectedLang}`,
        });
        prefetch.advance();
        continue;
      }

      const fileStart = Date.now();

      // Get file content from prefetch cache (async, but likely already loaded)
      const ioStart = Date.now();
      const content = await prefetch.getContent(file);
      ioTime += Date.now() - ioStart;

      // Advance prefetch to load next files while we parse
      prefetch.advance();

      // Skip generated code (huge files with low semantic value)
      const generated = isGeneratedCode(file, content);
      if (generated.skipped) {
        workerLog("DEBUG", `Skipping ${generated.type}-generated file`, { file });
        continue;
      }

      fileContents.set(file, content); // Save for embedding generation

      // Parse file with native parser
      const parseStart = Date.now();
      const hash = Date.now().toString(16); // Simple hash for worker

      // Get analyzer: use shared for specific language, or per-file for universal mode
      let analyzer: any;
      if (isUniversalMode) {
        const fileLang = detectLanguage(file);
        try {
          analyzer = await getAnalyzer(fileLang);
        } catch {
          errors.push({ file, message: `No analyzer for language: ${fileLang}` });
          prefetch.advance();
          continue;
        }
      } else {
        analyzer = sharedAnalyzer;
      }

      const result: ParseResult = await analyzer.parse(file, content, hash);
      parseTime += Date.now() - parseStart;

      // Log parse result for every file (debugging totalEntities: 0 issue)
      workerLog("DEBUG", `Parsed file`, {
        file,
        entities: result.entities?.length || 0,
        relationships: result.relationships?.length || 0,
        language: task.language,
      });

      results.push(result);

      const fileDuration = Date.now() - fileStart;

      // Streaming mode: send result immediately via IPC
      if (task.streamingMode) {
        postWorkerMessage({
          type: "streaming_result",
          taskId: task.id,
          result: result,
          fileIndex: results.length - 1,
          totalFiles: task.files.length,
        });
      }

      // Log slow files for monitoring
      if (fileDuration > 300) {
        workerLog("WARN", `Slow parse: ${file} took ${fileDuration}ms`);
      }
    } catch (error) {
      errors.push({
        file,
        message: (error as Error).message,
      });
      prefetch.advance(); // Continue prefetching even on error
    }
  }

  // Clear prefetch cache
  prefetch.clear();

  // Generate embeddings for all entities (if embedding is enabled)
  // Two modes:
  // 1. Distributed (default): worker generates embeddings via HTTP and sends binary vectors
  // 2. Centralized (OVMS/llamacpp): worker sends texts, Main generates embeddings via single connection
  const config = getEmbeddingConfig();
  if (config?.enabled) {
    const isCentralized = config.centralizedEmbeddings === true;

    const embeddingStart = Date.now();
    let embeddingCount = 0;

    for (const result of results) {
      if (result.entities && result.entities.length > 0) {
        const content = fileContents.get(result.filePath) || "";
        const count = await generateEmbeddingsForEntities(result.entities, content, result.filePath);
        embeddingCount += count;
      }
    }

    const embeddingTime = Date.now() - embeddingStart;
    workerLog("INFO", isCentralized ? `Texts collected for centralized embedding` : `Embeddings generated`, {
      taskId: task.id,
      embeddingCount,
      embeddingTimeMs: embeddingTime,
      mode: isCentralized ? "centralized" : "distributed",
    });

    // Send to main process
    if (isCentralized) {
      // Centralized mode: send texts, Main generates embeddings via gRPC
      sendCollectedTexts({ postWorkerMessage, getWorkerId });
    } else {
      // Distributed mode: send binary vectors
      sendCollectedEmbeddings({ postWorkerMessage, getWorkerId });
    }
  }

  // Clear file contents to free memory
  fileContents.clear();

  const totalTime = Date.now() - startTime;
  const totalEntities = results.reduce((sum, r) => sum + (r.entities?.length || 0), 0);

  workerLog("INFO", `Task completed`, {
    taskId: task.id,
    language: task.language,
    filesProcessed: task.files.length,
    totalEntities,
    errors: errors.length,
    totalTimeMs: totalTime,
    ioTimeMs: ioTime,
    parseTimeMs: parseTime,
    ioOverlapRatio: `${Math.round((1 - ioTime / totalTime) * 100)}%`,
  });

  return {
    taskId: task.id,
    results,
    ...(errors.length > 0 && { errors: errors }),
    stats: {
      filesProcessed: task.files.length,
      totalTime,
      avgTimePerFile: task.files.length > 0 ? totalTime / task.files.length : 0,
      language: task.language,
    },
  };
}

// =============================================================================
// MESSAGE HANDLER (Runtime-aware: Node.js worker_threads + Bun Web Worker)
// =============================================================================

async function handleMessage(message: any): Promise<void> {
  try {
    if (message.type === "init") {
      // Initialize embedding client if config provided
      if (message.embeddingConfig) {
        setEmbeddingConfig(message.embeddingConfig);
        await initEmbeddingClient(message.embeddingConfig);
      }

      postWorkerMessage({
        type: "initialized",
        workerId: getWorkerId(),
        embeddingEnabled: getEmbeddingClient() !== null,
        supportedLanguages: SUPPORTED_WORKER_LANGUAGES,
      });
      return;
    }

    // Configure embeddings after init (for late configuration)
    if (message.type === "configure-embeddings") {
      setEmbeddingConfig(message.config);
      await initEmbeddingClient(message.config);
      postWorkerMessage({
        type: "embeddings-configured",
        enabled: getEmbeddingClient() !== null,
      });
      return;
    }

    if (message.type === "shutdown") {
      // Clear caches
      clearAnalyzerCache();
      // Cleanup embedding client (nothing to do for HTTP client)
      clearEmbeddingClient();
      if (isBunWorker && self) {
        self.close?.();
      } else {
        process.exit(0);
      }
      return;
    }

    // Handle memory ping - returns current memory usage (for killIfMemoryHigh)
    if (message.type === "ping") {
      const memUsage = process.memoryUsage();
      postWorkerMessage({
        type: "pong",
        id: message.id,
        memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      });
      return;
    }

    // Handle "parse" from ParsingSubprocessPool (subprocess mode)
    if (message.type === "parse") {
      const task: WorkerTask = {
        id: message.id,
        files: message.files,
        language: message.language,
        options: message.options,
        streamingMode: message.streamingMode,
      };
      const result = await processTask(task);
      // Subprocess pool expects flat response format with memoryUsed
      postWorkerMessage({
        type: "result",
        id: result.taskId,
        results: result.results,
        stats: {
          filesProcessed: result.stats.filesProcessed,
          totalTime: result.stats.totalTime,
          memoryUsed: process.memoryUsage().heapUsed,
        },
      });
      return;
    }

    // Handle "task" from LanguageWorkerPool (Web Worker / worker_threads mode)
    if (message.type === "task") {
      const task = message.payload as WorkerTask;
      const result = await processTask(task);
      postWorkerMessage({
        type: "result",
        payload: result,
      });
    }
  } catch (error) {
    postWorkerMessage({
      type: "error",
      taskId: message.payload?.id || message.id,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

// Setup message listener based on runtime
// Priority: Subprocess > Bun Web Worker > Node.js worker_threads
if (isSubprocess) {
  // Subprocess mode: V8 native IPC via process.on('message')
  process.on("message", async (message: any) => {
    await handleMessage(message);
  });

  // Handle IPC disconnect
  process.on("disconnect", () => {
    process.exit(0);
  });

  // Signal ready via V8 IPC
  postWorkerMessage({
    type: "ready",
    workerId: getWorkerId(),
    mode: "subprocess-v8-ipc",
    pid: process.pid,
    memoryUsage: process.memoryUsage().heapUsed,
  });
} else if (isBunWorker && self) {
  // Bun Web Worker API
  self.addEventListener("message", (event: { data: any }) => {
    handleMessage(event.data);
  });

  // Signal ready
  postWorkerMessage({
    type: "ready",
    workerId: getWorkerId(),
    mode: "bun-web-worker",
  });
} else {
  // Node.js: wait for worker_threads import then setup
  initPromise.then(() => {
    if (parentPort) {
      parentPort.on("message", handleMessage);

      // Signal ready
      postWorkerMessage({
        type: "ready",
        workerId: getWorkerId(),
        mode: "node-worker-threads",
      });
    }
  });
}

// =============================================================================
// ERROR HANDLING (Runtime-aware)
// =============================================================================

if (isSubprocess) {
  // Subprocess error handling - write to stderr and exit
  process.on("uncaughtException", (error) => {
    postWorkerMessage({
      type: "error",
      error: `Uncaught exception in subprocess: ${error.message}`,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    postWorkerMessage({
      type: "error",
      error: `Unhandled rejection in subprocess: ${reason}`,
    });
    process.exit(1);
  });
} else if (isBunWorker && self) {
  // Bun Web Worker error handling
  self.addEventListener("error", (event: { message?: string }) => {
    postWorkerMessage({
      type: "error",
      error: `Uncaught error in bun-worker: ${event.message}`,
    });
  });

  self.addEventListener("unhandledrejection", (event: { reason: unknown }) => {
    postWorkerMessage({
      type: "error",
      error: `Unhandled rejection in bun-worker: ${event.reason}`,
    });
  });
} else {
  // Node.js worker_threads error handling
  process.on("uncaughtException", (error) => {
    postWorkerMessage({
      type: "error",
      error: `Uncaught exception in node-worker: ${error.message}`,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    postWorkerMessage({
      type: "error",
      error: `Unhandled rejection in node-worker: ${reason}`,
    });
    process.exit(1);
  });
}
