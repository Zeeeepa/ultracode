/**
 * File Operations - Runtime-optimized file I/O
 *
 * Provides unified file operations that automatically use Bun's optimized APIs
 * when available, with Node.js fallbacks for compatibility.
 *
 * Key optimizations under Bun:
 * - Bun.file() creates lazy file references (no immediate read)
 * - Bun.write() is highly optimized for various data types
 * - Built-in JSON parsing without intermediate string allocation
 *
 * Usage:
 *   import { readText, readJSON, writeFile } from "./file-ops.js";
 *   const content = await readText("./config.yaml");
 *   const data = await readJSON<Config>("./config.json");
 *   await writeFile("./output.txt", content);
 */

import type { Dirent } from "node:fs";
import {
  createReadStream as nodeCreateReadStream,
  existsSync as nodeExistsSync,
  mkdirSync as nodeMkdirSync,
  readdirSync as nodeReaddirSync,
  readFileSync as nodeReadFileSync,
  statSync as nodeStatSync,
  unlinkSync as nodeUnlinkSync,
  writeFileSync as nodeWriteFileSync,
} from "node:fs";
import { log } from "../logging/index.js";
import { features, runtime } from "./runtime.js";

// =============================================================================
// FILE CHANGE NOTIFICATION HOOK
// =============================================================================

/**
 * Optional hook for notifying about file changes.
 * Can be set by AutoDocWatcher or other components that need to track file modifications.
 * Using a global hook avoids circular dependencies with knowledge-bus.
 */
type FileChangeHook = (filePath: string, operation: "write" | "delete" | "rename") => void;

let fileChangeHook: FileChangeHook | null = null;

/**
 * Register a hook to be called when files are modified
 */
export function setFileChangeHook(hook: FileChangeHook | null): void {
  fileChangeHook = hook;
}

/**
 * Notify about file change (called internally after write operations)
 */
function notifyFileChange(filePath: string, operation: "write" | "delete" | "rename"): void {
  if (fileChangeHook) {
    try {
      fileChangeHook(filePath, operation);
    } catch {
      // Ignore errors in hook - don't break file operations
    }
  }
}

// =============================================================================
// ASYNC FILE OPERATIONS
// =============================================================================

/**
 * Read file as text string
 *
 * Performance notes (Bun):
 * - All methods (text(), bytes(), fs.readFile) are within ~20% of each other
 * - text() is optimized for string return, avoids extra conversion
 * - For batch operations, use readFilesParallel() with concurrency=8-16
 *
 * @param path - File path to read
 * @returns File contents as string
 */
export async function readText(path: string): Promise<string> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf-8");
}

/**
 * Read file and parse as JSON
 *
 * Under Bun: Uses Bun.file(path).json() - direct parsing without string allocation
 * Under Node: Reads as text then parses with JSON.parse
 *
 * @param path - JSON file path
 * @returns Parsed JSON data
 */
export async function readJSON<T = unknown>(path: string): Promise<T> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).json() as Promise<T>;
  }
  const content = await readText(path);
  return JSON.parse(content) as T;
}

/**
 * Read file as binary data
 *
 * Under Bun: Uses Bun.file(path).arrayBuffer()
 * Under Node: Uses fs/promises.readFile
 *
 * @param path - File path
 * @returns File contents as ArrayBuffer
 */
export async function readBinary(path: string): Promise<ArrayBuffer> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).arrayBuffer();
  }
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Read file as Uint8Array
 *
 * Under Bun: Uses Bun.file(path).bytes()
 * Under Node: Uses fs/promises.readFile
 *
 * @param path - File path
 * @returns File contents as Uint8Array
 */
export async function readBytes(path: string): Promise<Uint8Array> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).bytes();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

/** Threshold for using FileSink instead of Bun.write (bytes) */
const FILESINK_THRESHOLD = 50 * 1024; // 50KB

/**
 * Write data to file
 *
 * Under Bun:
 * - Small files (<50KB): Uses Bun.write() - optimized for low latency
 * - Large files (>=50KB): Uses FileSink - 4-20x faster than Bun.write for bulk writes
 *
 * Under Node: Uses fs/promises.writeFile
 *
 * @see https://bun.sh/guides/write-file/filesink
 *
 * @param path - Destination file path
 * @param data - Data to write (string or binary)
 * @param encoding - Encoding for string data (default: "utf-8"), ignored for binary
 */
export async function writeFile(
  path: string,
  data: string | Uint8Array | ArrayBuffer,
  encoding?: BufferEncoding,
): Promise<void> {
  if (features.bunWrite && globalThis.Bun) {
    // Calculate data size
    const dataSize =
      typeof data === "string"
        ? Buffer.byteLength(data, encoding || "utf-8")
        : data instanceof ArrayBuffer
          ? data.byteLength
          : data.length;

    // Use FileSink for large files (much faster than Bun.write)
    if (dataSize >= FILESINK_THRESHOLD) {
      const file = globalThis.Bun.file(path);
      const writer = file.writer({ highWaterMark: Math.min(dataSize, 1024 * 1024) });
      writer.write(data);
      await writer.flush();
      await writer.end();
      notifyFileChange(path, "write");
      return;
    }

    // Use Bun.write for small files
    await globalThis.Bun.write(path, data);
    notifyFileChange(path, "write");
    return;
  }

  // Node.js fallback
  const { writeFile: fsWriteFile } = await import("node:fs/promises");
  const writeData = data instanceof ArrayBuffer ? Buffer.from(data) : data;
  await fsWriteFile(path, writeData, typeof data === "string" ? encoding || "utf-8" : undefined);
  notifyFileChange(path, "write");
}

/**
 * Write JSON data to file with pretty formatting
 *
 * @param path - Destination file path
 * @param data - Data to serialize as JSON
 * @param indent - Indentation (default: 2)
 */
export async function writeJSON(path: string, data: unknown, indent: number = 2): Promise<void> {
  const json = JSON.stringify(data, null, indent);
  await writeFile(path, json);
}

/**
 * Check if file exists
 *
 * Under Bun: Uses Bun.file(path).exists()
 * Under Node: Uses fs/promises.stat
 *
 * @param path - File path to check
 * @returns true if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).exists();
  }
  const { stat } = await import("node:fs/promises");
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 *
 * Under Bun: Uses Bun.file(path).size
 * Under Node: Uses fs/promises.stat
 *
 * @param path - File path
 * @returns File size in bytes
 */
export async function getFileSize(path: string): Promise<number> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).size;
  }
  const { stat } = await import("node:fs/promises");
  const stats = await stat(path);
  return stats.size;
}

/**
 * Get file MIME type
 *
 * Under Bun: Uses Bun.file(path).type
 * Under Node: Basic extension-based detection
 *
 * @param path - File path
 * @returns MIME type string
 */
export async function getFileMimeType(path: string): Promise<string> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).type;
  }

  // Simple extension-based fallback
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    json: "application/json",
    js: "application/javascript",
    ts: "application/typescript",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    xml: "application/xml",
    yaml: "text/yaml",
    yml: "text/yaml",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

// =============================================================================
// SYNC FILE OPERATIONS (for startup/critical paths)
// =============================================================================

/**
 * Synchronously read file as text
 *
 * Note: Prefer async version when possible. Sync is for startup config loading.
 *
 * @param path - File path to read
 * @returns File contents as string
 */
export function readTextSync(path: string): string {
  // Bun's file API is async-only, use Node's sync version
  return nodeReadFileSync(path, "utf-8");
}

/**
 * Synchronously read JSON file
 *
 * @param path - JSON file path
 * @returns Parsed JSON data
 */
export function readJSONSync<T = unknown>(path: string): T {
  const content = readTextSync(path);
  return JSON.parse(content) as T;
}

/**
 * Synchronously write file
 *
 * @param path - Destination file path
 * @param data - Data to write
 * @param encoding - Encoding for string data (default: "utf-8"), ignored for binary
 */
export function writeFileSync(path: string, data: string | Uint8Array, encoding?: BufferEncoding): void {
  nodeWriteFileSync(path, data, typeof data === "string" ? encoding || "utf-8" : undefined);
}

/**
 * Synchronously check if file exists
 *
 * @param path - File path to check
 * @returns true if file exists
 */
export function existsSync(path: string): boolean {
  return nodeExistsSync(path);
}

// =============================================================================
// DIRECTORY OPERATIONS
// =============================================================================

/**
 * Create directory (with recursive option)
 *
 * @param path - Directory path to create
 * @param options - Options object { recursive: boolean } or just boolean for recursive
 */
export async function mkdir(path: string, options?: { recursive?: boolean } | boolean): Promise<void> {
  const { mkdir: fsMkdir } = await import("node:fs/promises");
  const recursive = typeof options === "boolean" ? options : (options?.recursive ?? true);
  await fsMkdir(path, { recursive });
}

/**
 * Synchronously create directory
 *
 * @param path - Directory path to create
 * @param options - Options object { recursive: boolean } or just boolean for recursive
 */
export function mkdirSync(path: string, options?: { recursive?: boolean } | boolean): void {
  const recursive = typeof options === "boolean" ? options : (options?.recursive ?? true);
  nodeMkdirSync(path, { recursive });
}

/**
 * Read directory contents
 *
 * @param path - Directory path
 * @param options - Options for readdir
 * @returns Array of file/directory names or Dirent objects
 */
export async function readdir(path: string): Promise<string[]>;
export async function readdir(path: string, options: { withFileTypes: true; recursive?: boolean }): Promise<Dirent[]>;
export async function readdir(path: string, options: { withFileTypes?: false; recursive?: boolean }): Promise<string[]>;
export async function readdir(
  path: string,
  options?: { withFileTypes?: boolean; recursive?: boolean },
): Promise<string[] | Dirent[]> {
  const { readdir: fsReaddir } = await import("node:fs/promises");
  return fsReaddir(path, options as any);
}

/**
 * Remove file or directory
 *
 * @param path - Path to remove
 * @param recursive - Remove directories recursively (default: false)
 */
export async function rm(path: string, recursive: boolean = false): Promise<void> {
  const { rm: fsRm } = await import("node:fs/promises");
  await fsRm(path, { recursive, force: true });
  notifyFileChange(path, "delete");
}

/**
 * Synchronously remove file
 *
 * @param path - Path to remove
 */
export function unlinkSync(path: string): void {
  nodeUnlinkSync(path);
}

/**
 * Synchronously read directory contents
 *
 * @param path - Directory path
 * @returns Array of file/directory names
 */
export function readdirSync(path: string, options?: { withFileTypes?: boolean }): string[] {
  if (options?.withFileTypes) {
    const entries = nodeReaddirSync(path, { withFileTypes: true }) as Dirent[];
    return entries.map((e) => e.name);
  }
  return nodeReaddirSync(path) as string[];
}

/**
 * Synchronously get file/directory stats
 *
 * @param path - Path to stat
 * @returns Stats object with isFile(), isDirectory(), size, mtimeMs
 */
export function statSync(path: string): {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mtimeMs: number;
} {
  return nodeStatSync(path);
}

/**
 * Get file/directory stats
 *
 * @param path - Path to stat
 * @returns Stats object with isFile() and isDirectory() methods
 */
export async function stat(path: string): Promise<{
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}> {
  const { stat: fsStat } = await import("node:fs/promises");
  const stats = await fsStat(path);
  const isFileResult = stats.isFile();
  const isDirResult = stats.isDirectory();
  return {
    isFile: () => isFileResult,
    isDirectory: () => isDirResult,
    size: stats.size,
    mtime: stats.mtime,
    ctime: stats.ctime,
  };
}

// =============================================================================
// COPY OPERATIONS
// =============================================================================

/**
 * Copy file (uses Bun.write with Bun.file for zero-copy when possible)
 *
 * Under Bun: Bun.write(dest, Bun.file(src)) - potential zero-copy
 * Under Node: fs/promises.copyFile
 *
 * @param src - Source file path
 * @param dest - Destination file path
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  if (features.bunWrite && features.bunFile && globalThis.Bun) {
    await globalThis.Bun.write(dest, globalThis.Bun.file(src));
    return;
  }
  const { copyFile: fsCopyFile } = await import("node:fs/promises");
  await fsCopyFile(src, dest);
}

// =============================================================================
// STREAMING OPERATIONS
// =============================================================================

/**
 * Get readable stream for file
 *
 * Under Bun: Uses Bun.file(path).stream()
 * Under Node: Uses fs.createReadStream
 *
 * @param path - File path
 * @returns ReadableStream
 */
export function createReadStream(path: string): ReadableStream<Uint8Array> {
  if (features.bunFile && globalThis.Bun) {
    return globalThis.Bun.file(path).stream();
  }
  // Node.js fallback - convert Node stream to Web stream
  const nodeStream = nodeCreateReadStream(path);
  return new ReadableStream<Uint8Array>({
    start(controller: ReadableStreamDefaultController<Uint8Array>) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buffer));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err: Error) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

// =============================================================================
// BATCH AND LINE-BY-LINE READING
// =============================================================================

/**
 * Read multiple files in parallel with concurrency control
 *
 * Benchmarked optimal settings:
 * - concurrency=8-16 gives best performance (9x faster than sequential!)
 * - Higher concurrency (32+) doesn't improve and may hurt performance
 * - Both Bun.file() and fs.readFile perform similarly under Bun
 *
 * @param paths - Array of file paths to read
 * @param options - Options for batch reading
 * @param options.concurrency - Max concurrent reads (default: 12, optimal range: 8-16)
 * @param options.encoding - "text" for strings, "bytes" for Uint8Array
 * @returns Array of file contents (in same order as paths)
 *
 * @example
 * // Read 100 source files in parallel
 * const contents = await readFilesParallel(filePaths, { concurrency: 12 });
 */
export async function readFilesParallel(
  paths: string[],
  options: { concurrency?: number | undefined; encoding?: "text" | "bytes" } = {},
): Promise<(string | Uint8Array)[]> {
  const { concurrency = 12, encoding = "text" } = options; // 12 is in optimal 8-16 range

  // Simple concurrency limiter
  let active = 0;
  const queue: Array<() => void> = [];

  const limit = async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };

  const tasks = paths.map((path) =>
    limit(async () => {
      if (features.bunFile && globalThis.Bun) {
        const file = globalThis.Bun.file(path);
        return encoding === "bytes" ? file.bytes() : file.text();
      }
      return encoding === "bytes" ? readBytes(path) : readText(path);
    }),
  );

  return Promise.all(tasks);
}

/**
 * Helper to iterate over ReadableStream
 */
async function* streamToAsyncIterator(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Read file line by line using streaming
 *
 * Efficient for large files - doesn't load entire file into memory.
 * Uses Bun.file().stream() under Bun for optimal performance.
 *
 * @param path - File path
 * @param callback - Called for each line
 */
export async function readLines(
  path: string,
  callback: (line: string, lineNumber: number) => void | Promise<void>,
): Promise<void> {
  const stream = createReadStream(path);
  const decoder = new TextDecoder();
  let buffer = "";
  let lineNumber = 0;

  for await (const chunk of streamToAsyncIterator(stream)) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      lineNumber++;
      await callback(line, lineNumber);
    }
  }

  // Process remaining buffer
  if (buffer) {
    lineNumber++;
    await callback(buffer, lineNumber);
  }
}

/**
 * Async generator for reading file line by line
 *
 * Alternative to callback-based readLines for more flexible iteration.
 *
 * @param path - File path
 * @yields Lines from the file
 */
export async function* readLinesGenerator(path: string): AsyncGenerator<string, void, unknown> {
  const stream = createReadStream(path);
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of streamToAsyncIterator(stream)) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      yield line;
    }
  }

  if (buffer) {
    yield buffer;
  }
}

// =============================================================================
// LINE RANGE READING
// =============================================================================

/**
 * Read specific line range from file without loading entire file into memory.
 * Optimized for extracting code snippets from large files.
 *
 * @param path - File path
 * @param startLine - Start line (1-based, inclusive)
 * @param endLine - End line (1-based, inclusive)
 * @param maxChars - Maximum characters to return (default 10000)
 * @returns Lines joined with newline, or null if file doesn't exist
 */
export async function readLineRange(
  path: string,
  startLine: number,
  endLine: number,
  maxChars: number = 10000,
): Promise<string | null> {
  try {
    const lines: string[] = [];
    let currentLine = 0;
    let totalChars = 0;

    for await (const line of readLinesGenerator(path)) {
      currentLine++;

      if (currentLine > endLine) break;

      if (currentLine >= startLine) {
        if (totalChars + line.length > maxChars) {
          // Truncate to fit maxChars
          const remaining = maxChars - totalChars;
          if (remaining > 0) {
            lines.push(line.slice(0, remaining));
          }
          break;
        }
        lines.push(line);
        totalChars += line.length + 1; // +1 for newline
      }
    }

    return lines.length > 0 ? lines.join("\n") : null;
  } catch {
    return null;
  }
}

/**
 * Read specific byte range from file (for index-based extraction).
 * More efficient than reading entire file when indices are known.
 *
 * @param path - File path
 * @param startIndex - Start byte index (inclusive)
 * @param endIndex - End byte index (exclusive)
 * @param maxBytes - Maximum bytes to read (default 10000)
 * @returns Content string, or null if file doesn't exist
 */
export async function readByteRange(
  path: string,
  startIndex: number,
  endIndex: number,
  maxBytes: number = 10000,
): Promise<string | null> {
  try {
    const length = Math.min(endIndex - startIndex, maxBytes);
    if (length <= 0) return null;

    if (runtime.isBun && features.bunFile && typeof Bun !== "undefined") {
      const file = Bun.file(path);
      const slice = file.slice(startIndex, startIndex + length);
      return await slice.text();
    } else {
      // Node.js: use file handle for partial read
      const { open } = await import("node:fs/promises");
      const handle = await open(path, "r");
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, startIndex);
        return buffer.toString("utf-8", 0, bytesRead);
      } finally {
        await handle.close();
      }
    }
  } catch {
    return null;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Ensure directory exists (create if missing)
 *
 * @param path - Directory path
 */
export async function ensureDir(path: string): Promise<void> {
  try {
    const stats = await stat(path);
    if (!stats.isDirectory) {
      throw new Error(`Path exists but is not a directory: ${path}`);
    }
  } catch {
    await mkdir(path, true);
  }
}

/**
 * Synchronously ensure directory exists
 *
 * @param path - Directory path
 */
export function ensureDirSync(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, true);
  }
}

/**
 * Log file operation statistics (for debugging)
 */
export function logFileOpsInfo(): void {
  log.i("FILEOPS", `[FileOps] Runtime: ${runtime.name}`);
  log.i("FILEOPS", `[FileOps] Bun.file: ${features.bunFile ? "enabled" : "disabled"}`);
  log.i("FILEOPS", `[FileOps] Bun.write: ${features.bunWrite ? "enabled" : "disabled"}`);
}
