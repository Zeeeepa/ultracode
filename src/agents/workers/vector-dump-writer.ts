/**
 * Vector Dump Writer
 *
 * Writes embeddings directly to disk in binary format (bypasses IPC).
 *
 * Binary format:
 * - Header: magic(4) + version(2) + dimensions(2) + count(4) = 12 bytes
 * - Entry: id_length(2) + id(variable) + vector(dimensions * 4)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkerEmbeddingConfig } from "../../types/semantic.js";
import { workerLog } from "./worker-logging.js";

// Magic number and version for binary format
export const VECTOR_DUMP_MAGIC = 0x56454354; // "VECT" in hex
export const VECTOR_DUMP_VERSION = 1;

// Buffer threshold - flush after this many vectors
const VECTOR_DUMP_THRESHOLD = 500;

export interface VectorDumpBuffer {
  id: string;
  vector: Float32Array;
}

// State variables
let vectorDumpDir: string | null = null;
let vectorDumpDimensions = 384;
let vectorDumpBatchIndex = 0;
let vectorDumpBuffer: VectorDumpBuffer[] = [];
let vectorDumpTotalWritten = 0;
let workerIdGetter: () => string = () => "unknown";

/**
 * Set worker ID getter for file naming
 */
export function setVectorDumpWorkerIdGetter(getter: () => string): void {
  workerIdGetter = getter;
}

/**
 * Get dump directory
 */
export function getVectorDumpDir(): string | null {
  return vectorDumpDir;
}

/**
 * Get total vectors written
 */
export function getVectorDumpTotalWritten(): number {
  return vectorDumpTotalWritten;
}

/**
 * Initialize vector dump directory from config
 */
export function initVectorDump(config: WorkerEmbeddingConfig): void {
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
export function addVectorToDump(id: string, vector: Float32Array): void {
  if (!vectorDumpDir) return;

  vectorDumpBuffer.push({ id, vector });

  if (vectorDumpBuffer.length >= VECTOR_DUMP_THRESHOLD) {
    flushVectorDump();
  }
}

/**
 * Flush vector buffer to disk as binary file
 */
export function flushVectorDump(): number {
  if (!vectorDumpDir || vectorDumpBuffer.length === 0) return 0;

  const workerId = workerIdGetter();
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
 * Reset state (for testing)
 */
export function resetVectorDump(): void {
  vectorDumpDir = null;
  vectorDumpDimensions = 384;
  vectorDumpBatchIndex = 0;
  vectorDumpBuffer = [];
  vectorDumpTotalWritten = 0;
}
