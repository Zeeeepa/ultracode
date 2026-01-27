/**
 * Memory Logger - Utility for memory monitoring
 *
 * Provides functions to track and log memory usage across components.
 * Used for debugging memory leaks and monitoring memory consumption.
 */

import { log } from "./index.js";

// =============================================================================
// Types
// =============================================================================

export interface MemoryStats {
  /** Heap used in MB */
  heapUsed: number;
  /** Total heap size in MB */
  heapTotal: number;
  /** External memory in MB */
  external: number;
  /** ArrayBuffers in MB */
  arrayBuffers: number;
  /** Resident Set Size in MB */
  rss: number;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Get current memory statistics
 * All values are in MB (rounded)
 */
export function getMemoryStats(): MemoryStats {
  const mem = process.memoryUsage();
  return {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
    arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
  };
}

/**
 * Log memory statistics for a component
 *
 * @param component - Component name (e.g., "FAISS", "INDEXER", "CACHE")
 * @param context - Additional context to include in log (e.g., cache size, queue length)
 *
 * @example
 * ```typescript
 * logMemory("FAISS", { deltaSize: this.deltaIdSet.size });
 * logMemory("INDEXER", { pending: this.pendingFilesCount });
 * ```
 */
export function logMemory(component: string, context?: Record<string, unknown>): void {
  const stats = getMemoryStats();
  log.i(component, "memory_stats", {
    heapMB: stats.heapUsed,
    externalMB: stats.external,
    arrayBuffersMB: stats.arrayBuffers,
    rssMB: stats.rss,
    ...context,
  });
}

/**
 * Log memory delta (change) between two snapshots
 *
 * @param component - Component name
 * @param before - Memory stats before operation
 * @param operation - Description of the operation performed
 */
export function logMemoryDelta(component: string, before: MemoryStats, operation: string): void {
  const after = getMemoryStats();
  const delta = {
    heapDelta: after.heapUsed - before.heapUsed,
    externalDelta: after.external - before.external,
    rssDelta: after.rss - before.rss,
  };

  log.i(component, "memory_delta", {
    operation,
    ...delta,
    afterHeapMB: after.heapUsed,
  });
}

/**
 * Check if memory usage exceeds threshold
 *
 * @param thresholdMB - Threshold in MB
 * @returns true if heap usage exceeds threshold
 */
export function isMemoryHigh(thresholdMB: number): boolean {
  const stats = getMemoryStats();
  return stats.heapUsed > thresholdMB;
}

/**
 * Format memory stats as a compact string for logging
 */
export function formatMemoryStats(stats: MemoryStats): string {
  return `heap=${stats.heapUsed}MB rss=${stats.rss}MB ext=${stats.external}MB`;
}
