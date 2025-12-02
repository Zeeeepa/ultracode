/**
 * Stream Helpers - Memory-efficient streaming utilities
 *
 * Provides utilities for processing large files and data streams
 * with minimal memory footprint using Node.js streams and pipelines.
 *
 * Architecture References:
 * - Node.js Streams: https://nodejs.org/api/stream.html
 * - Pipeline: https://nodejs.org/api/stream.html#stream_stream_pipeline
 */

import { createReadStream, createWriteStream } from "node:fs";
import { pipeline, Transform } from "node:stream";
import { promisify } from "node:util";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface StreamCopyOptions {
  chunkSize?: number;
  encoding?: BufferEncoding;
  highWaterMark?: number;
  onProgress?: (bytesWritten: number, totalBytes: number) => void;
}

export interface LineTransformOptions {
  encoding?: BufferEncoding;
  skipEmpty?: boolean;
  maxLineLength?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_HIGH_WATER_MARK = 16 * 1024; // 16KB

// Promisified pipeline
const pipelineAsync = promisify(pipeline);

// =============================================================================
// STREAMING FILE OPERATIONS
// =============================================================================

/**
 * Copy file using streams (memory-efficient for large files)
 */
export async function streamCopyFile(
  source: string,
  destination: string,
  options: StreamCopyOptions = {},
): Promise<number> {
  const { encoding = "utf-8", highWaterMark = DEFAULT_HIGH_WATER_MARK, onProgress } = options;

  let bytesWritten = 0;
  const readStream = createReadStream(source, { encoding, highWaterMark });
  const writeStream = createWriteStream(destination, { encoding });

  // Progress tracking
  if (onProgress) {
    const { stat } = await import("node:fs/promises");
    const stats = await stat(source);
    const totalBytes = stats.size;

    readStream.on("data", (chunk: Buffer | string) => {
      const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
      bytesWritten += chunkSize;
      onProgress(bytesWritten, totalBytes);
    });
  }

  await pipelineAsync(readStream, writeStream);

  return bytesWritten;
}

// =============================================================================
// STREAMING TRANSFORMATIONS
// =============================================================================

/**
 * Transform stream that processes lines
 */
class LineTransformStream extends Transform {
  private buffer = "";
  private lineNumber = 0;

  constructor(
    private lineHandler: (line: string, lineNumber: number) => string | null,
    private options: LineTransformOptions = {},
  ) {
    super({ encoding: (options.encoding || "utf-8") as BufferEncoding });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: string) => void): void {
    this.buffer += chunk.toString();

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const output: string[] = [];

    for (const line of lines) {
      if (this.options.skipEmpty && line.trim().length === 0) continue;

      this.lineNumber++;

      try {
        const result = this.lineHandler(line, this.lineNumber);
        if (result !== null) {
          output.push(result);
        }
      } catch (error) {
        callback(error as Error);
        return;
      }
    }

    callback(null, output.join("\n") + (output.length > 0 ? "\n" : ""));
  }

  _flush(callback: (error?: Error | null, data?: string) => void): void {
    if (this.buffer.length > 0 && (!this.options.skipEmpty || this.buffer.trim().length > 0)) {
      this.lineNumber++;

      try {
        const result = this.lineHandler(this.buffer, this.lineNumber);
        if (result !== null) {
          callback(null, result + "\n");
          return;
        }
      } catch (error) {
        callback(error as Error);
        return;
      }
    }

    callback();
  }
}

/**
 * Replace text in file using streams (memory-efficient)
 */
export async function streamReplaceInFile(
  filePath: string,
  replacer: (line: string, lineNumber: number) => string,
  options: LineTransformOptions = {},
): Promise<number> {
  const { encoding = "utf-8" } = options;

  const tempPath = `${filePath}.tmp`;
  let linesProcessed = 0;

  const readStream = createReadStream(filePath, { encoding });
  const writeStream = createWriteStream(tempPath, { encoding });

  const transformer = new LineTransformStream((line, lineNumber) => {
    linesProcessed++;
    return replacer(line, lineNumber);
  }, options);

  await pipelineAsync(readStream, transformer, writeStream);

  // Replace original with temp
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, filePath);

  return linesProcessed;
}

/**
 * Replace specific line range in file (memory-efficient for large files)
 */
export async function streamReplaceRange(
  filePath: string,
  startLine: number,
  endLine: number,
  newContent: string,
  options: { encoding?: BufferEncoding } = {},
): Promise<void> {
  const { encoding = "utf-8" } = options;

  let currentLine = 0;
  let replaced = false;

  await streamReplaceInFile(
    filePath,
    (line, lineNumber) => {
      currentLine = lineNumber;

      if (currentLine < startLine) {
        return line;
      }

      if (currentLine >= startLine && currentLine <= endLine) {
        if (!replaced) {
          replaced = true;
          return newContent;
        }
        return ""; // Skip lines in range after replacement (empty string instead of null)
      }

      return line;
    },
    { encoding: encoding as BufferEncoding },
  );
}
