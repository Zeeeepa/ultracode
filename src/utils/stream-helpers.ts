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
import { pipeline, Readable, Transform, Writable } from "node:stream";
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

export interface ChunkProcessorOptions<T, R> {
  chunkSize: number;
  processor: (chunk: T[]) => Promise<R[]>;
  onProgress?: (processed: number, total: number) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB (reserved for future use)
const DEFAULT_HIGH_WATER_MARK = 16 * 1024; // 16KB
const DEFAULT_MAX_LINE_LENGTH = 1024 * 1024; // 1MB per line

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

/**
 * Read file line by line using streams (memory-efficient)
 */
export async function streamReadLines(
  filePath: string,
  lineHandler: (line: string, lineNumber: number) => Promise<void> | void,
  options: LineTransformOptions = {},
): Promise<number> {
  const { encoding = "utf-8", skipEmpty = false, maxLineLength = DEFAULT_MAX_LINE_LENGTH } = options;

  let lineNumber = 0;
  let buffer = "";

  const readStream = createReadStream(filePath, { encoding, highWaterMark: DEFAULT_HIGH_WATER_MARK });

  const lineProcessor = new Transform({
    encoding: encoding as BufferEncoding,
    async transform(chunk: Buffer, _encoding, callback) {
      buffer += chunk.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (skipEmpty && line.trim().length === 0) continue;

        if (line.length > maxLineLength) {
          callback(new Error(`Line ${lineNumber + 1} exceeds max length (${maxLineLength})`));
          return;
        }

        lineNumber++;
        try {
          await lineHandler(line, lineNumber);
        } catch (error) {
          callback(error as Error);
          return;
        }
      }

      callback();
    },

    async flush(callback) {
      // Process remaining buffer
      if (buffer.length > 0 && (!skipEmpty || buffer.trim().length > 0)) {
        lineNumber++;
        try {
          await lineHandler(buffer, lineNumber);
        } catch (error) {
          callback(error as Error);
          return;
        }
      }
      callback();
    },
  });

  await pipelineAsync(
    readStream,
    lineProcessor,
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );

  return lineNumber;
}

/**
 * Write lines to file using streams
 */
export async function streamWriteLines(
  filePath: string,
  lines: AsyncIterable<string> | Iterable<string>,
  options: { encoding?: BufferEncoding; appendNewline?: boolean } = {},
): Promise<number> {
  const { encoding = "utf-8", appendNewline = true } = options;

  let linesWritten = 0;
  const writeStream = createWriteStream(filePath, { encoding });

  const lineReader = Readable.from(lines, { encoding: encoding as BufferEncoding });

  const lineFormatter = new Transform({
    encoding: encoding as BufferEncoding,
    transform(chunk: Buffer, _encoding, callback) {
      linesWritten++;
      const line = chunk.toString();
      const output = appendNewline ? `${line}\n` : line;
      callback(null, output);
    },
  });

  await pipelineAsync(lineReader, lineFormatter, writeStream);

  return linesWritten;
}

// =============================================================================
// STREAMING TRANSFORMATIONS
// =============================================================================

/**
 * Transform stream that processes lines
 */
export class LineTransformStream extends Transform {
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

// =============================================================================
// BATCH PROCESSING WITH STREAMING
// =============================================================================

/**
 * Process items in batches using streams
 */
export async function streamBatchProcess<T, R>(
  items: AsyncIterable<T> | Iterable<T>,
  options: ChunkProcessorOptions<T, R>,
): Promise<R[]> {
  const { chunkSize, processor, onProgress } = options;

  const results: R[] = [];
  let batch: T[] = [];
  let processedCount = 0;

  const itemReader = Readable.from(items);

  const batchProcessor = new Transform({
    objectMode: true,
    async transform(item: T, _encoding, callback) {
      batch.push(item);

      if (batch.length >= chunkSize) {
        try {
          const batchResults = await processor(batch);
          results.push(...batchResults);
          processedCount += batch.length;

          if (onProgress) {
            onProgress(processedCount, -1); // Total unknown in streaming
          }

          batch = [];
          callback();
        } catch (error) {
          callback(error as Error);
        }
      } else {
        callback();
      }
    },

    async flush(callback) {
      // Process remaining batch
      if (batch.length > 0) {
        try {
          const batchResults = await processor(batch);
          results.push(...batchResults);
          processedCount += batch.length;

          if (onProgress) {
            onProgress(processedCount, processedCount);
          }

          callback();
        } catch (error) {
          callback(error as Error);
        }
      } else {
        callback();
      }
    },
  });

  await pipelineAsync(
    itemReader,
    batchProcessor,
    new Writable({
      objectMode: true,
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );

  return results;
}

// =============================================================================
// STREAMING UTILITIES
// =============================================================================

/**
 * Create a readable stream from async generator
 */
export function createReadableFromAsync<T>(asyncGenerator: AsyncIterable<T>): Readable {
  return Readable.from(asyncGenerator, { objectMode: true });
}

/**
 * Create a transform stream from async function
 */
export function createTransformFromAsync<T, R>(transformer: (chunk: T) => Promise<R>): Transform {
  return new Transform({
    objectMode: true,
    async transform(chunk: T, _encoding, callback) {
      try {
        const result = await transformer(chunk);
        callback(null, result);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

/**
 * Collect all chunks from stream into array
 */
export async function streamToArray<T>(stream: Readable): Promise<T[]> {
  const chunks: T[] = [];

  await pipelineAsync(
    stream,
    new Writable({
      objectMode: true,
      write(chunk: T, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    }),
  );

  return chunks;
}

/**
 * Pipe stream with error handling
 */
export async function safePipeline(...streams: (Readable | Writable | Transform)[]): Promise<void> {
  try {
    // @ts-expect-error - pipelineAsync accepts variable number of stream arguments
    await pipelineAsync(...streams);
  } catch (error) {
    // Cleanup: destroy all streams on error
    for (const stream of streams) {
      if ("destroy" in stream && typeof stream.destroy === "function") {
        stream.destroy();
      }
    }
    throw error;
  }
}

// =============================================================================
// MEMORY MONITORING
// =============================================================================

/**
 * Monitor memory usage during streaming operation
 */
export async function streamWithMemoryMonitoring<T>(
  operation: () => Promise<T>,
  options: { logInterval?: number; maxMemoryMB?: number } = {},
): Promise<{ result: T; peakMemoryMB: number; avgMemoryMB: number }> {
  const { logInterval = 1000, maxMemoryMB = 500 } = options;

  let peakMemory = 0;
  let totalMemory = 0;
  let samples = 0;

  const monitorInterval = setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    peakMemory = Math.max(peakMemory, heapUsedMB);
    totalMemory += heapUsedMB;
    samples++;

    if (maxMemoryMB && heapUsedMB > maxMemoryMB) {
      console.warn(`[StreamHelpers] Memory usage (${heapUsedMB}MB) exceeds limit (${maxMemoryMB}MB)`);
    }
  }, logInterval);

  try {
    const result = await operation();
    clearInterval(monitorInterval);

    return {
      result,
      peakMemoryMB: peakMemory,
      avgMemoryMB: samples > 0 ? Math.round(totalMemory / samples) : 0,
    };
  } catch (error) {
    clearInterval(monitorInterval);
    throw error;
  }
}
