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

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { ParsedEntity, ParseResult, ParserOptions } from "../../types/parser.js";
import type { WorkerEmbeddingConfig } from "../../types/semantic.js";

// Early stderr logging for debugging worker startup (process.stderr.write bypasses console)
const WORKER_ID = process.env["PARSING_WORKER_ID"] || "unknown";
process.stderr.write(`[WORKER:${WORKER_ID}] Starting worker process, pid=${process.pid}\n`);

// Ensure logs directory exists early
try {
  const logsDir = join(process.env["APPDATA"] || join(homedir(), "AppData", "Local"), "UltraScriptTools", "logs");
  mkdirSync(logsDir, { recursive: true });
} catch {}

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

// =============================================================================
// WORKER FILE LOGGER (writes directly to log file)
// =============================================================================

// Get local date string for log file (YYYY-MM-DD in local time, not UTC)
function getLocalDateForLog(): string {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

const WORKER_LOG_FILE = join(
  process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local"),
  "UltraScriptTools",
  "logs",
  `worker-${getLocalDateForLog()}.log`,
);

function workerLog(level: string, message: string, data?: any): void {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const mins = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const timestamp = `${localTime.toISOString().slice(0, -1)}${sign}${hours}:${mins}`;

  const id = getWorkerId();
  let line = `[${timestamp}] [${level}] [WORKER:${id}] ${message}`;
  if (data) {
    line += ` DATA: ${JSON.stringify(data)}`;
  }
  line += "\n";

  try {
    appendFileSync(WORKER_LOG_FILE, line);
  } catch {
    // Ignore write errors in worker
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface WorkerTask {
  id: string;
  files: string[];
  language: string; // Language identifier (e.g., "python", "rust", "typescript")
  options?: ParserOptions | undefined;
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

// =============================================================================
// EMBEDDING CLIENT (lightweight HTTP-only)
// =============================================================================

/** Worker embedding configuration received from main process */
let embeddingConfig: WorkerEmbeddingConfig | null = null;

/**
 * Entity types excluded from embedding generation.
 * Low-value (import/export) or duplicates (method/property already in class embedding)
 */
const EMBEDDING_EXCLUDE_ENTITY_TYPES = new Set([
  "import",
  "export",
  "module",
  "constant",
  "variable",
  "method",
  "property",
  "async_function",
]);

/** Lightweight embedding client instance */
let embeddingClient: import("./worker-embedding-client.js").WorkerEmbeddingClient | null = null;
let embeddingClientInitPromise: Promise<void> | null = null;

/** Local deduplication: track entity IDs already processed in this worker session */
const generatedEntityIds = new Set<string>();

// =============================================================================
// INLINE VECTOR DUMP WRITER (writes directly to disk, no IPC)
// Binary format: header + entries
// Header: magic(4) + version(2) + dimensions(2) + count(4) = 12 bytes
// Entry: id_length(2) + id(variable) + vector(dimensions * 4)
// =============================================================================

const VECTOR_DUMP_MAGIC = 0x56454354; // "VECT" in hex
const VECTOR_DUMP_VERSION = 1;

interface VectorDumpBuffer {
  id: string;
  vector: Float32Array;
}

let vectorDumpDir: string | null = null;
let vectorDumpDimensions = 384;
let vectorDumpBatchIndex = 0;
let vectorDumpBuffer: VectorDumpBuffer[] = [];
let vectorDumpTotalWritten = 0;
const VECTOR_DUMP_THRESHOLD = 500; // Flush after 500 vectors

/**
 * Initialize vector dump directory from config
 */
function initVectorDump(config: WorkerEmbeddingConfig): void {
  if (config.vectorDumpDir) {
    vectorDumpDir = config.vectorDumpDir;
    vectorDumpDimensions = config.dimensions || 384;
    // Ensure directory exists
    try {
      mkdirSync(vectorDumpDir, { recursive: true });
      workerLog("INFO", `Vector dump initialized`, { dir: vectorDumpDir, dims: vectorDumpDimensions });
    } catch (e) {
      workerLog("ERROR", `Failed to create vector dump dir: ${(e as Error).message}`);
      vectorDumpDir = null;
    }
  }
}

/**
 * Add vector to dump buffer, flush if threshold reached
 */
function addVectorToDump(id: string, vector: Float32Array): void {
  if (!vectorDumpDir) return;

  vectorDumpBuffer.push({ id, vector });

  if (vectorDumpBuffer.length >= VECTOR_DUMP_THRESHOLD) {
    flushVectorDump();
  }
}

/**
 * Flush vector buffer to disk as binary file
 */
function flushVectorDump(): number {
  if (!vectorDumpDir || vectorDumpBuffer.length === 0) return 0;

  const workerId = getWorkerId();
  const filename = `worker-${workerId}-batch-${String(vectorDumpBatchIndex).padStart(6, "0")}.bin`;
  const filepath = join(vectorDumpDir, filename);

  // Calculate total size
  let totalSize = 12; // Header size
  for (const entry of vectorDumpBuffer) {
    const idBytes = Buffer.byteLength(entry.id, "utf8");
    totalSize += 2 + idBytes + vectorDumpDimensions * 4;
  }

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // Write header
  buffer.writeUInt32LE(VECTOR_DUMP_MAGIC, offset);
  offset += 4;
  buffer.writeUInt16LE(VECTOR_DUMP_VERSION, offset);
  offset += 2;
  buffer.writeUInt16LE(vectorDumpDimensions, offset);
  offset += 2;
  buffer.writeUInt32LE(vectorDumpBuffer.length, offset);
  offset += 4;

  // Write entries
  for (const entry of vectorDumpBuffer) {
    const idBytes = Buffer.byteLength(entry.id, "utf8");

    buffer.writeUInt16LE(idBytes, offset);
    offset += 2;
    buffer.write(entry.id, offset, idBytes, "utf8");
    offset += idBytes;

    for (let i = 0; i < vectorDumpDimensions; i++) {
      buffer.writeFloatLE(entry.vector[i] ?? 0, offset);
      offset += 4;
    }
  }

  // Write file synchronously (workers are already async)
  try {
    const { writeFileSync } = require("node:fs");
    writeFileSync(filepath, buffer);
  } catch (e) {
    workerLog("ERROR", `Failed to write vector dump: ${(e as Error).message}`);
    return 0;
  }

  const count = vectorDumpBuffer.length;
  vectorDumpTotalWritten += count;
  vectorDumpBatchIndex++;
  vectorDumpBuffer = [];

  workerLog("DEBUG", `Vector dump flushed`, { file: filename, count, total: vectorDumpTotalWritten });

  return count;
}

/**
 * Initialize lightweight embedding client with config from main process
 */
async function initEmbeddingClient(config: WorkerEmbeddingConfig): Promise<void> {
  if (!config.enabled) {
    workerLog("INFO", "Embeddings disabled in worker config");
    return;
  }

  // Initialize vector dump for direct file writing (bypasses IPC)
  initVectorDump(config);

  if (embeddingClientInitPromise) {
    await embeddingClientInitPromise;
    return;
  }

  embeddingClientInitPromise = (async () => {
    try {
      workerLog("INFO", `Initializing WorkerEmbeddingClient`, { provider: config.provider, model: config.modelName });

      // Use lightweight HTTP-only client (no heavy dependencies)
      const { WorkerEmbeddingClient } = await import("./worker-embedding-client.js");
      embeddingClient = new WorkerEmbeddingClient(config);
      await embeddingClient.initialize();

      workerLog("INFO", `WorkerEmbeddingClient initialized successfully`);
    } catch (error) {
      workerLog("ERROR", `Failed to init WorkerEmbeddingClient: ${(error as Error).message}`);
      workerLog("ERROR", `Stack: ${(error as Error).stack}`);
      embeddingClient = null;
    }
  })();

  await embeddingClientInitPromise;
}

/**
 * Build embedding text for an entity.
 * Includes: name, type, signature, code snippet (truncated to maxTokens).
 */
function buildEmbeddingText(entity: ParsedEntity, fileContent: string, maxTokens: number): string {
  const parts: string[] = [];

  // Header: name + type + signature
  const header = `${entity.name ?? ""} ${entity.type ?? ""} ${entity.signature ?? ""}`.trim();
  parts.push(header);

  // Extract code snippet from file content using location
  // Use ~2.0 chars per token for code (very conservative for safety)
  const charsPerToken = 2.0;
  if (entity.location) {
    try {
      const { start, end } = entity.location;
      if (typeof start?.index === "number" && typeof end?.index === "number") {
        const maxLen = Math.min(Math.floor(maxTokens * charsPerToken), 10000);
        const code = fileContent.slice(start.index, Math.min(end.index, start.index + maxLen));
        parts.push(code);
      } else if (typeof start?.line === "number" && typeof end?.line === "number") {
        const lines = fileContent.split("\n");
        const startLine = Math.max(0, start.line - 1);
        const endLine = Math.min(lines.length, end.line);
        const code = lines
          .slice(startLine, endLine)
          .join("\n")
          .slice(0, Math.floor(maxTokens * charsPerToken));
        parts.push(code);
      }
    } catch {
      // Ignore extraction errors
    }
  }

  // Add documentation if available
  if ((entity as any).documentation?.description) {
    parts.push(`description: ${(entity as any).documentation.description}`);
  }

  // Add return type
  if (entity.returnType) {
    parts.push(`returns: ${entity.returnType}`);
  }

  // Combine and truncate
  const text = parts.join("\n").trim();
  // Very conservative truncation: ~2.0 chars per token for code
  return text.slice(0, Math.floor(maxTokens * 2.0));
}

/**
 * Collected embeddings for batch transfer to main process
 * Uses ArrayBuffer for binary transfer (zero-copy via transferList)
 */
interface CollectedEmbedding {
  id: string;
  vectorBuffer: ArrayBuffer; // Binary data for zero-copy transfer
  content: string;
  metadata?: Record<string, unknown>;
}

const collectedEmbeddings: CollectedEmbedding[] = [];

/**
 * Generate embeddings for entities and collect them for batch transfer
 * For subprocess mode: embeddings are collected and sent separately via embeddings.ready message
 * For backward compatibility: also attaches Base64 encoded embeddings to entities
 */
async function generateEmbeddingsForEntities(
  entities: ParsedEntity[],
  fileContent: string,
  filePath: string,
): Promise<number> {
  if (!embeddingClient || !embeddingConfig?.enabled) {
    return 0;
  }

  // Use contextTokens (model limit) for truncation, fallback to maxTokens
  const contextTokens = embeddingConfig.contextTokens || embeddingConfig.maxTokens || 512;
  const batchSize = embeddingConfig.batchSize || 32;
  const concurrency = 3; // Process up to 3 batches in parallel

  // Filter out low-value entity types before embedding generation
  const filteredEntities = entities.filter((e) => !EMBEDDING_EXCLUDE_ENTITY_TYPES.has(e.type));

  // Build texts for filtered entities, with local deduplication
  const entityTexts: { entity: ParsedEntity; text: string; entityId: string }[] = [];
  let skippedDuplicates = 0;

  for (const entity of filteredEntities) {
    // Pre-compute entity ID for deduplication
    const rawEntityId = (entity as any).id || `${filePath}:${entity.type}:${entity.name}`;
    const entityId = `ent:${rawEntityId}`;

    // Skip if already generated in this worker session
    if (generatedEntityIds.has(entityId)) {
      skippedDuplicates++;
      continue;
    }

    const text = buildEmbeddingText(entity, fileContent, contextTokens);
    if (text.length > 0) {
      entityTexts.push({ entity, text, entityId });
    }
  }

  if (skippedDuplicates > 0) {
    workerLog("DEBUG", `Skipped ${skippedDuplicates} duplicate entities (local dedup)`);
  }

  if (entityTexts.length === 0) {
    return 0;
  }

  // Split into batches
  const batches: (typeof entityTexts)[] = [];
  for (let i = 0; i < entityTexts.length; i += batchSize) {
    batches.push(entityTexts.slice(i, i + batchSize));
  }

  let generatedCount = 0;

  // Process batches in waves of 'concurrency' size
  // Each wave runs in parallel, then we start next wave
  const processBatch = async (batch: typeof entityTexts, idx: number): Promise<void> => {
    const texts = batch.map((et) => et.text);
    try {
      const embeddings = await embeddingClient!.generateBatch(texts);

      // Process embeddings - write to file dump or collect for IPC
      for (let j = 0; j < batch.length; j++) {
        const et = batch[j]!;
        const embedding = embeddings[j];
        if (embedding) {
          // Use pre-computed entityId from deduplication phase
          const { entityId } = et;

          // Mark as generated for local deduplication
          generatedEntityIds.add(entityId);

          // PRIMARY PATH: Write directly to file dump (bypasses IPC entirely)
          if (vectorDumpDir) {
            addVectorToDump(entityId, embedding);
          } else {
            // FALLBACK: Collect for IPC transfer (legacy path)
            const vectorBuffer = embedding.buffer.slice(
              embedding.byteOffset,
              embedding.byteOffset + embedding.byteLength,
            ) as ArrayBuffer;

            const rawEntityId = (et.entity as any).id || `${filePath}:${et.entity.type}:${et.entity.name}`;
            collectedEmbeddings.push({
              id: entityId,
              vectorBuffer,
              content: et.text.slice(0, 500),
              metadata: {
                entityId: rawEntityId,
                entityType: et.entity.type,
                entityName: et.entity.name,
                path: filePath,
                filePath,
                line: et.entity.location?.start?.line,
                start: et.entity.location?.start?.index,
                end: et.entity.location?.end?.index,
              },
            });
          }

          // Store embedding text for search result display
          et.entity.embeddingText = et.text.slice(0, 200);

          generatedCount++;
        }
      }
    } catch (error) {
      workerLog("WARN", `Embedding batch failed: ${(error as Error).message}`, { batchIdx: idx });
    }
  };

  // Process in waves - run 'concurrency' batches in parallel, wait, repeat
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    await Promise.all(wave.map((batch, j) => processBatch(batch, i + j)));
  }

  return generatedCount;
}

/**
 * Send collected embeddings to main process
 * PRIMARY PATH: If vectorDumpDir is set, just flush remaining buffer and notify
 * FALLBACK: Uses binary IPC transfer for legacy path
 */
function sendCollectedEmbeddings(): void {
  // PRIMARY PATH: File dump mode - flush and notify
  if (vectorDumpDir) {
    // Flush any remaining buffered vectors to disk
    flushVectorDump();

    // Notify main process that vectors were written to files
    // Main will read files and load into FAISS at end of indexing
    if (vectorDumpTotalWritten > 0) {
      postWorkerMessage({
        type: "vectors.written",
        count: vectorDumpTotalWritten,
        dumpDir: vectorDumpDir,
        workerId: getWorkerId(),
      });

      workerLog("INFO", `Vectors written to files (no IPC)`, {
        count: vectorDumpTotalWritten,
        dir: vectorDumpDir,
      });
    }
    return;
  }

  // FALLBACK: IPC transfer mode (legacy)
  if (collectedEmbeddings.length === 0) {
    return;
  }

  const transferList: ArrayBuffer[] = collectedEmbeddings.map((e) => e.vectorBuffer);

  postWorkerMessage(
    {
      type: "embeddings.ready",
      count: collectedEmbeddings.length,
      embeddings: collectedEmbeddings,
    },
    transferList,
  );

  workerLog("INFO", `Sent embeddings to main process (binary transfer)`, {
    count: collectedEmbeddings.length,
    totalBytes: transferList.reduce((sum, buf) => sum + buf.byteLength, 0),
  });

  collectedEmbeddings.length = 0;
}

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
        const { UnifiedParser } = await import("../../parsers/unified-parser.js");
        analyzer = new UnifiedParser();
        await analyzer.initialize();
        break;
      }

      case "json": {
        // Simple JSON parser - just returns empty entities (JSON doesn't have code entities)
        // JSON files are indexed for search but don't have AST entities
        analyzer = {
          parse: async (filePath: string, _content: string, hash: string) => ({
            entities: [],
            filePath,
            hash,
            language: "json",
          }),
        };
        break;
      }

      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    analyzerCache.set(language, analyzer);
    return analyzer;
  } catch (error) {
    throw new Error(`Failed to load analyzer for ${language}`, { cause: error });
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

  return languageMap[ext] || "unknown";
}

// =============================================================================
// TASK PROCESSING
// =============================================================================

async function processTask(task: WorkerTask): Promise<WorkerResult> {
  const startTime = Date.now();
  const results: ParseResult[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  workerLog("INFO", `Task started`, {
    taskId: task.id,
    language: task.language,
    fileCount: task.files.length,
  });

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

  // Track file contents for embedding generation
  const fileContents = new Map<string, string>();

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

      // Skip generated code (huge files with low semantic value)
      // NOTE: Swagger/OpenAPI NOT skipped - useful for endpoint search
      const header = content.slice(0, 800).toLowerCase();
      const fileName = file.toLowerCase();

      // Detection by file header markers
      const generatedMarkers = [
        // ANTLR parser generators
        {
          check: () => header.includes("generated from") && (header.includes("by antlr") || header.includes("antlr4")),
          type: "ANTLR",
        },
        // Protobuf
        { check: () => header.includes("code generated by protoc"), type: "Protobuf" },
        // gRPC
        { check: () => header.includes("code generated by protoc-gen"), type: "gRPC" },
        // Thrift
        { check: () => header.includes("autogenerated by thrift"), type: "Thrift" },
        // Bison/Yacc
        { check: () => header.includes("a bison parser") || header.includes("generated by bison"), type: "Bison" },
        // Flex/Lex
        {
          check: () => header.includes("generated by flex") || header.includes("a lexical scanner generated by flex"),
          type: "Flex",
        },
        // SWIG (C/C++ bindings)
        { check: () => header.includes("swig") && header.includes("generated"), type: "SWIG" },
        // PEG.js / Peggy
        { check: () => header.includes("generated by peg") || header.includes("generated by peggy"), type: "PEG" },
        // Tree-sitter bindings
        { check: () => header.includes("tree-sitter") && header.includes("generated"), type: "TreeSitter" },
      ];

      // Detection by file name patterns
      const generatedFilePatterns = [
        {
          check: () =>
            fileName.endsWith(".pb.go") ||
            fileName.endsWith(".pb.ts") ||
            fileName.endsWith("_pb.js") ||
            fileName.endsWith("_pb2.py"),
          type: "Protobuf",
        },
        { check: () => fileName.includes("_grpc.pb."), type: "gRPC" },
        { check: () => fileName.endsWith(".min.js") || fileName.endsWith(".min.css"), type: "Minified" },
      ];

      // Check all markers
      let skipped = false;
      for (const marker of [...generatedMarkers, ...generatedFilePatterns]) {
        if (marker.check()) {
          workerLog("DEBUG", `Skipping ${marker.type}-generated file`, { file });
          skipped = true;
          break;
        }
      }
      if (skipped) continue;

      fileContents.set(file, content); // Save for embedding generation

      // Parse file with native parser
      // All parsers use parse(path, content, hash) method
      const hash = Date.now().toString(16); // Simple hash for worker
      const result: ParseResult = await analyzer.parse(file, content, hash);

      // Log parse result for every file (debugging totalEntities: 0 issue)
      workerLog("DEBUG", `Parsed file`, {
        file,
        entities: result.entities?.length || 0,
        relationships: result.relationships?.length || 0,
        language: task.language,
      });

      results.push(result);

      const fileDuration = Date.now() - fileStart;

      // Log slow files for monitoring
      if (fileDuration > 300) {
        workerLog("WARN", `Slow parse: ${file} took ${fileDuration}ms`);
      }
    } catch (error) {
      errors.push({
        file,
        message: (error as Error).message,
      });
    }
  }

  // Generate embeddings for all entities (if embedding client is ready)
  if (embeddingClient && embeddingConfig?.enabled) {
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
    workerLog("INFO", `Embeddings generated`, {
      taskId: task.id,
      embeddingCount,
      embeddingTimeMs: embeddingTime,
    });

    // Send collected embeddings to main process via separate optimized message
    // This allows main process to route embeddings directly to GPU subprocess
    sendCollectedEmbeddings();
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
        embeddingConfig = message.embeddingConfig as WorkerEmbeddingConfig;
        await initEmbeddingClient(embeddingConfig);
      }

      postWorkerMessage({
        type: "initialized",
        workerId: getWorkerId(),
        embeddingEnabled: embeddingClient !== null,
        supportedLanguages: [
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
        ],
      });
      return;
    }

    // Configure embeddings after init (for late configuration)
    if (message.type === "configure-embeddings") {
      embeddingConfig = message.config as WorkerEmbeddingConfig;
      await initEmbeddingClient(embeddingConfig);
      postWorkerMessage({
        type: "embeddings-configured",
        enabled: embeddingClient !== null,
      });
      return;
    }

    if (message.type === "shutdown") {
      // Clear caches
      analyzerCache.clear();
      // Cleanup embedding client (nothing to do for HTTP client)
      embeddingClient = null;
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
