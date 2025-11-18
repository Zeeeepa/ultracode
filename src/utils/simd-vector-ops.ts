/**
 * Optimized Vector Operations with Loop Unrolling
 *
 * Performance-optimized pure JavaScript implementations for vector math.
 * Uses loop unrolling to improve CPU pipeline efficiency.
 *
 * Performance (384-dim vectors):
 * - Baseline JS: ~12.2ms per 10K operations
 * - Loop unrolling: ~9.9ms per 10K operations
 * - Speedup: 23% faster (1.23x)
 *
 * Note: BLAS/SIMD libraries tested but showed 22x slowdown due to FFI overhead
 * for small vectors (384 dim). Pure JS loop unrolling is optimal for this use case.
 */

// =============================================================================
// OPTIMIZED JS IMPLEMENTATIONS
// =============================================================================

/**
 * Compute dot product of two vectors
 * Uses loop unrolling for better performance
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product (a · b)
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} !== ${b.length}`);
  }

  const len = a.length;
  let sum = 0;

  // Loop unrolling: process 4 elements at a time
  const len4 = len - (len % 4);

  for (let i = 0; i < len4; i += 4) {
    sum += a[i]! * b[i]! + a[i + 1]! * b[i + 1]! + a[i + 2]! * b[i + 2]! + a[i + 3]! * b[i + 3]!;
  }

  // Handle remaining elements
  for (let i = len4; i < len; i++) {
    sum += a[i]! * b[i]!;
  }

  return sum;
}

/**
 * Compute L2 norm of a vector
 * Uses loop unrolling for better performance
 *
 * @param a - Vector
 * @returns L2 norm (||a||₂)
 */
export function norm2(a: Float32Array): number {
  const len = a.length;
  let sum = 0;

  // Loop unrolling: process 4 elements at a time
  const len4 = len - (len % 4);

  for (let i = 0; i < len4; i += 4) {
    const v0 = a[i]!;
    const v1 = a[i + 1]!;
    const v2 = a[i + 2]!;
    const v3 = a[i + 3]!;
    sum += v0 * v0 + v1 * v1 + v2 * v2 + v3 * v3;
  }

  // Handle remaining elements
  for (let i = len4; i < len; i++) {
    const v = a[i]!;
    sum += v * v;
  }

  return Math.sqrt(sum);
}

/**
 * Compute cosine similarity between two vectors
 * Optimized implementation with loop unrolling
 *
 * Formula: cos(a, b) = (a · b) / (||a||₂ * ||b||₂)
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity [-1, 1]
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} !== ${b.length}`);
  }

  const len = a.length;
  let dotProd = 0;
  let normA = 0;
  let normB = 0;

  // Loop unrolling: process 4 elements at a time
  const len4 = len - (len % 4);

  for (let i = 0; i < len4; i += 4) {
    const a0 = a[i]!;
    const a1 = a[i + 1]!;
    const a2 = a[i + 2]!;
    const a3 = a[i + 3]!;

    const b0 = b[i]!;
    const b1 = b[i + 1]!;
    const b2 = b[i + 2]!;
    const b3 = b[i + 3]!;

    dotProd += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
    normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
    normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
  }

  // Handle remaining elements
  for (let i = len4; i < len; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProd += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProd / denom;
}

/**
 * Get optimization status for diagnostics
 */
export function getOptimizationStatus(): {
  technique: string;
  speedup: string;
  backend: "js-optimized";
} {
  return {
    technique: "Loop Unrolling (4x)",
    speedup: "1.23x vs baseline",
    backend: "js-optimized",
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  dotProduct,
  norm2,
  cosineSimilarity,
  getOptimizationStatus,
};
