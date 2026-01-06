/**
 * Binary Vector Dump
 *
 * Workers write embeddings directly to binary files.
 * Main process reads all files and batch-loads into FAISS.
 *
 * Binary format (per embedding):
 *   - id_length: u16 (2 bytes)
 *   - id: utf8 string (id_length bytes)
 *   - vector: f32[dimensions] (dimensions * 4 bytes)
 *
 * Benefits:
 * - No IPC overhead (workers write directly to disk)
 * - No JSON/base64 serialization
 * - Efficient batch loading into FAISS
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../logging/index.js";
import { getDataDir } from "../shared/storage-paths.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const DUMP_DIR_NAME = ".vector-dump";
const MAGIC_HEADER = 0x56454354; // "VECT" in hex
const FORMAT_VERSION = 1;

// =============================================================================
// TYPES
// =============================================================================

export interface VectorDumpConfig {
  dimensions: number;
  workerId: string;
}

export interface VectorDumpEntry {
  id: string;
  vector: Float32Array;
}

export interface VectorDumpStats {
  totalFiles: number;
  totalVectors: number;
  totalBytes: number;
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Get the vector dump directory path
 */
export function getVectorDumpDir(): string {
  return join(getDataDir(), DUMP_DIR_NAME);
}

/**
 * Initialize dump directory (create if not exists)
 */
export function initVectorDumpDir(clean = false): string {
  const dumpDir = getVectorDumpDir();

  if (clean && existsSync(dumpDir)) {
    try {
      rmSync(dumpDir, { recursive: true, force: true });
      log.d("DUMP", "Cleaned dump directory");
    } catch (e) {
      log.w("DUMP", `Could not clean dump dir: ${e}`);
    }
  }

  if (!existsSync(dumpDir)) {
    mkdirSync(dumpDir, { recursive: true });
    log.d("DUMP", `Created dump directory: ${dumpDir}`);
  }

  return dumpDir;
}

// =============================================================================
// WRITER (used by Workers)
// =============================================================================

/**
 * Vector Dump Writer - used by workers to write embeddings directly to disk
 */
export class VectorDumpWriter {
  private dumpDir: string;
  private workerId: string;
  private dimensions: number;
  private batchIndex = 0;
  private buffer: VectorDumpEntry[] = [];
  private bufferThreshold: number;
  private totalWritten = 0;

  constructor(config: VectorDumpConfig, bufferThreshold = 500) {
    this.dumpDir = getVectorDumpDir();
    this.workerId = config.workerId;
    this.dimensions = config.dimensions;
    this.bufferThreshold = bufferThreshold;

    // Ensure directory exists
    if (!existsSync(this.dumpDir)) {
      mkdirSync(this.dumpDir, { recursive: true });
    }
  }

  /**
   * Add embedding to buffer, flush if threshold reached
   */
  add(id: string, vector: Float32Array): void {
    this.buffer.push({ id, vector });

    if (this.buffer.length >= this.bufferThreshold) {
      this.flush();
    }
  }

  /**
   * Add batch of embeddings
   */
  addBatch(entries: VectorDumpEntry[]): void {
    for (const entry of entries) {
      this.add(entry.id, entry.vector);
    }
  }

  /**
   * Flush buffer to disk
   */
  flush(): number {
    if (this.buffer.length === 0) return 0;

    const filename = `worker-${this.workerId}-batch-${String(this.batchIndex).padStart(6, "0")}.bin`;
    const filepath = join(this.dumpDir, filename);

    const binaryData = this.encodeBatch(this.buffer);
    writeFileSync(filepath, binaryData);

    const count = this.buffer.length;
    this.totalWritten += count;
    this.batchIndex++;
    this.buffer = [];

    return count;
  }

  /**
   * Get stats
   */
  getStats(): { written: number; pending: number } {
    return {
      written: this.totalWritten,
      pending: this.buffer.length,
    };
  }

  /**
   * Encode batch to binary format
   */
  private encodeBatch(entries: VectorDumpEntry[]): Buffer {
    // Calculate total size
    // Header: magic(4) + version(2) + dimensions(2) + count(4) = 12 bytes
    // Per entry: id_length(2) + id(variable) + vector(dimensions * 4)
    let totalSize = 12;
    for (const entry of entries) {
      const idBytes = Buffer.byteLength(entry.id, "utf8");
      totalSize += 2 + idBytes + this.dimensions * 4;
    }

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write header
    buffer.writeUInt32LE(MAGIC_HEADER, offset);
    offset += 4;
    buffer.writeUInt16LE(FORMAT_VERSION, offset);
    offset += 2;
    buffer.writeUInt16LE(this.dimensions, offset);
    offset += 2;
    buffer.writeUInt32LE(entries.length, offset);
    offset += 4;

    // Write entries
    for (const entry of entries) {
      const idBytes = Buffer.byteLength(entry.id, "utf8");

      // ID length and string
      buffer.writeUInt16LE(idBytes, offset);
      offset += 2;
      buffer.write(entry.id, offset, idBytes, "utf8");
      offset += idBytes;

      // Vector (Float32Array to bytes)
      for (let i = 0; i < this.dimensions; i++) {
        buffer.writeFloatLE(entry.vector[i] ?? 0, offset);
        offset += 4;
      }
    }

    return buffer;
  }
}

// =============================================================================
// READER (used by Main process)
// =============================================================================

/**
 * Read all vector dump files and return entries
 */
export function readAllVectorDumps(dimensions: number): {
  entries: VectorDumpEntry[];
  stats: VectorDumpStats;
} {
  const dumpDir = getVectorDumpDir();

  if (!existsSync(dumpDir)) {
    return {
      entries: [],
      stats: { totalFiles: 0, totalVectors: 0, totalBytes: 0 },
    };
  }

  const files = readdirSync(dumpDir)
    .filter((f) => f.endsWith(".bin"))
    .sort();

  const allEntries: VectorDumpEntry[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const filepath = join(dumpDir, file);
    const data = readFileSync(filepath);
    totalBytes += data.length;

    try {
      const entries = decodeBatch(data, dimensions);
      allEntries.push(...entries);
    } catch (error) {
      log.w("DUMP", `Failed to decode ${file}: ${(error as Error).message}`);
    }
  }

  log.i("DUMP", "Read all dumps", {
    files: files.length,
    vectors: allEntries.length,
    sizeMB: (totalBytes / 1024 / 1024).toFixed(2),
  });

  return {
    entries: allEntries,
    stats: {
      totalFiles: files.length,
      totalVectors: allEntries.length,
      totalBytes,
    },
  };
}

/**
 * Decode binary batch to entries
 */
function decodeBatch(data: Buffer, expectedDimensions: number): VectorDumpEntry[] {
  let offset = 0;

  // Read header
  const magic = data.readUInt32LE(offset);
  offset += 4;
  if (magic !== MAGIC_HEADER) {
    throw new Error(`Invalid magic header: ${magic.toString(16)}`);
  }

  const version = data.readUInt16LE(offset);
  offset += 2;
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${version}`);
  }

  const dimensions = data.readUInt16LE(offset);
  offset += 2;
  if (dimensions !== expectedDimensions) {
    throw new Error(`Dimension mismatch: expected ${expectedDimensions}, got ${dimensions}`);
  }

  const count = data.readUInt32LE(offset);
  offset += 4;

  const entries: VectorDumpEntry[] = [];

  for (let i = 0; i < count; i++) {
    // Read ID
    const idLength = data.readUInt16LE(offset);
    offset += 2;
    const id = data.toString("utf8", offset, offset + idLength);
    offset += idLength;

    // Read vector
    const vector = new Float32Array(dimensions);
    for (let j = 0; j < dimensions; j++) {
      vector[j] = data.readFloatLE(offset);
      offset += 4;
    }

    entries.push({ id, vector });
  }

  return entries;
}

/**
 * Clean up dump directory
 */
export function cleanupVectorDump(): void {
  const dumpDir = getVectorDumpDir();

  if (existsSync(dumpDir)) {
    try {
      rmSync(dumpDir, { recursive: true, force: true });
      log.d("DUMP", "Cleaned up dump directory");
    } catch (e) {
      log.w("DUMP", `Failed to cleanup: ${e}`);
    }
  }
}

/**
 * Check if there are pending dumps
 */
export function hasPendingDumps(): boolean {
  const dumpDir = getVectorDumpDir();

  if (!existsSync(dumpDir)) {
    return false;
  }

  const files = readdirSync(dumpDir).filter((f) => f.endsWith(".bin"));
  return files.length > 0;
}

/**
 * Read vector dump files for a specific worker
 */
export function readWorkerVectorDumps(
  workerId: string,
  dimensions: number,
): {
  entries: VectorDumpEntry[];
  stats: VectorDumpStats;
  files: string[];
} {
  const dumpDir = getVectorDumpDir();

  if (!existsSync(dumpDir)) {
    return {
      entries: [],
      stats: { totalFiles: 0, totalVectors: 0, totalBytes: 0 },
      files: [],
    };
  }

  // Filter files for this specific worker
  const workerPrefix = `worker-${workerId}-`;
  const files = readdirSync(dumpDir)
    .filter((f) => f.startsWith(workerPrefix) && f.endsWith(".bin"))
    .sort();

  if (files.length === 0) {
    return {
      entries: [],
      stats: { totalFiles: 0, totalVectors: 0, totalBytes: 0 },
      files: [],
    };
  }

  const allEntries: VectorDumpEntry[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const filepath = join(dumpDir, file);
    const data = readFileSync(filepath);
    totalBytes += data.length;

    try {
      const entries = decodeBatch(data, dimensions);
      allEntries.push(...entries);
    } catch (error) {
      log.w("DUMP", `Failed to decode ${file}: ${(error as Error).message}`);
    }
  }

  log.d("DUMP", `Read worker-${workerId} dumps`, {
    files: files.length,
    vectors: allEntries.length,
    sizeMB: (totalBytes / 1024 / 1024).toFixed(2),
  });

  return {
    entries: allEntries,
    stats: {
      totalFiles: files.length,
      totalVectors: allEntries.length,
      totalBytes,
    },
    files,
  };
}

/**
 * Cleanup dump files for a specific worker
 */
export function cleanupWorkerDumps(workerId: string): number {
  const dumpDir = getVectorDumpDir();

  if (!existsSync(dumpDir)) {
    return 0;
  }

  const workerPrefix = `worker-${workerId}-`;
  const files = readdirSync(dumpDir).filter((f) => f.startsWith(workerPrefix) && f.endsWith(".bin"));

  for (const file of files) {
    try {
      rmSync(join(dumpDir, file));
    } catch (e) {
      log.w("DUMP", `Failed to delete ${file}: ${e}`);
    }
  }

  log.d("DUMP", `Cleaned up worker-${workerId} dumps: ${files.length} files`);
  return files.length;
}

/**
 * Get dump stats without reading all data
 */
export function getVectorDumpStats(): VectorDumpStats {
  const dumpDir = getVectorDumpDir();

  if (!existsSync(dumpDir)) {
    return { totalFiles: 0, totalVectors: 0, totalBytes: 0 };
  }

  const files = readdirSync(dumpDir).filter((f) => f.endsWith(".bin"));
  let totalBytes = 0;
  let totalVectors = 0;

  for (const file of files) {
    const filepath = join(dumpDir, file);
    const data = readFileSync(filepath);
    totalBytes += data.length;

    // Read count from header (offset 8-12)
    if (data.length >= 12) {
      totalVectors += data.readUInt32LE(8);
    }
  }

  return { totalFiles: files.length, totalVectors, totalBytes };
}
