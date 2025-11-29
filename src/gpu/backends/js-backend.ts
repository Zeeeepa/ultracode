/**
 * Pure JavaScript Backend (Baseline Fallback)
 *
 * Uses loop unrolling optimization from simd-vector-ops.ts
 * Always available, provides 1.45x speedup over naive implementation
 *
 * Performance: ~10ms per 10K vectors (384 dim)
 */

import { cosineSimilarity as cosineSimilarityOptimized } from "../../utils/simd-vector-ops.js";
import type { BackendCapabilities, VectorBackend } from "./base.js";

export class JSBackend implements VectorBackend {
  readonly name = "Pure JS (Loop Unrolling)";
  readonly type = "js" as const;
  readonly priority = 1; // Lowest priority (baseline)

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async initialize(): Promise<void> {
    console.error("[JS Backend] Using pure JavaScript with loop unrolling optimization");
  }

  getCapabilities(): BackendCapabilities {
    return {
      maxVectorCount: 10_000,
      maxDimension: 2048,
      supportsBatching: true,
      supportsAsync: false, // Synchronous only
      memoryMB: 0, // CPU memory (not GPU)
    };
  }

  async cosineSimilarity(a: Float32Array, b: Float32Array): Promise<number> {
    // Direct call to optimized implementation (synchronous)
    return cosineSimilarityOptimized(a, b);
  }

  async batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array> {
    const results = new Float32Array(database.length);

    // Sequential processing (no parallelization)
    for (let i = 0; i < database.length; i++) {
      const vec = database[i];
      if (vec) results[i] = cosineSimilarityOptimized(query, vec);
    }

    return results;
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}
