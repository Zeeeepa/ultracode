/**
 * Embedding Dump Utility
 *
 * Saves embeddings to disk during generation phase, then loads them
 * into LibSQL in a separate phase. This avoids the Bun crash caused
 * by concurrent OpenVINO + LibSQL native module usage.
 *
 * Flow:
 * 1. Generate embeddings with OpenVINO → save to .embeddings-dump/
 * 2. Close OpenVINO provider (release native resources)
 * 3. Open LibSQL and bulk import from dump files
 * 4. Clean up dump files
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils/config-paths.js";
import { logger } from "../utils/logger.js";

export interface DumpedEmbedding {
  id: string;
  content: string;
  vector: number[]; // Float32Array serialized as number[]
  metadata: Record<string, any>;
  createdAt: number;
}

export interface DumpBatch {
  batchIndex: number;
  embeddings: DumpedEmbedding[];
  timestamp: number;
}

/**
 * Get the dump directory path
 */
export function getDumpDir(): string {
  return join(getDataDir(), ".embeddings-dump");
}

/**
 * Initialize dump directory (create if not exists, clean if exists)
 */
export function initDumpDir(): string {
  const dumpDir = getDumpDir();

  if (existsSync(dumpDir)) {
    // Clean existing dump files
    try {
      rmSync(dumpDir, { recursive: true, force: true });
    } catch (e) {
      logger.warn("DUMP", `Could not clean dump dir: ${e}`);
    }
  }

  mkdirSync(dumpDir, { recursive: true });
  logger.info("DUMP", `Initialized dump directory: ${dumpDir}`);

  return dumpDir;
}

/**
 * Save a batch of embeddings to disk
 */
export function saveBatch(embeddings: DumpedEmbedding[], batchIndex: number): void {
  const dumpDir = getDumpDir();

  if (!existsSync(dumpDir)) {
    mkdirSync(dumpDir, { recursive: true });
  }

  const batch: DumpBatch = {
    batchIndex,
    embeddings,
    timestamp: Date.now(),
  };

  const filename = `batch-${String(batchIndex).padStart(6, "0")}.json`;
  const filepath = join(dumpDir, filename);

  writeFileSync(filepath, JSON.stringify(batch));

  logger.debug("DUMP", `Saved batch ${batchIndex} with ${embeddings.length} embeddings`);
}

/**
 * Load all batches from dump directory
 */
export function loadAllBatches(): DumpedEmbedding[] {
  const dumpDir = getDumpDir();

  if (!existsSync(dumpDir)) {
    return [];
  }

  const files = readdirSync(dumpDir)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort(); // Sort by batch index

  const allEmbeddings: DumpedEmbedding[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(dumpDir, file), "utf-8");
      const batch: DumpBatch = JSON.parse(content);
      allEmbeddings.push(...batch.embeddings);
    } catch (e) {
      logger.error("DUMP", `Failed to load batch ${file}: ${e}`);
    }
  }

  logger.info("DUMP", `Loaded ${allEmbeddings.length} embeddings from ${files.length} batch files`);

  return allEmbeddings;
}

/**
 * Get dump statistics without loading all data
 */
export function getDumpStats(): { batchCount: number; totalEmbeddings: number; diskSizeBytes: number } {
  const dumpDir = getDumpDir();

  if (!existsSync(dumpDir)) {
    return { batchCount: 0, totalEmbeddings: 0, diskSizeBytes: 0 };
  }

  const files = readdirSync(dumpDir).filter((f) => f.startsWith("batch-") && f.endsWith(".json"));

  let totalEmbeddings = 0;
  let diskSizeBytes = 0;

  for (const file of files) {
    try {
      const filepath = join(dumpDir, file);
      const content = readFileSync(filepath, "utf-8");
      diskSizeBytes += content.length;
      const batch: DumpBatch = JSON.parse(content);
      totalEmbeddings += batch.embeddings.length;
    } catch (_e) {
      // Skip corrupted files
    }
  }

  return { batchCount: files.length, totalEmbeddings, diskSizeBytes };
}

/**
 * Clean up dump directory
 */
export function cleanupDump(): void {
  const dumpDir = getDumpDir();

  if (existsSync(dumpDir)) {
    try {
      rmSync(dumpDir, { recursive: true, force: true });
      logger.info("DUMP", `Cleaned up dump directory`);
    } catch (e) {
      logger.warn("DUMP", `Could not clean dump dir: ${e}`);
    }
  }
}

/**
 * Check if there's an incomplete dump from previous run
 */
export function hasIncompleteDump(): boolean {
  const stats = getDumpStats();
  return stats.totalEmbeddings > 0;
}

/**
 * Convert Float32Array to number array for JSON serialization
 */
export function vectorToArray(vector: Float32Array): number[] {
  return Array.from(vector);
}

/**
 * Convert number array back to Float32Array
 */
export function arrayToVector(arr: number[]): Float32Array {
  return new Float32Array(arr);
}
