/**
 * Mini-batch K-Means with K-Means++ initialization.
 *
 * Port of Zig `semantic/kmeans.zig`.
 *
 * Dimension-agnostic, uses inner product metric (cosine on L2-normalized vectors).
 * Centroids are L2-normalized after each update step.
 * Binary-compatible save/load with Zig format.
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 4
 */

import { computeDot } from "./native-vector-index.js";

// =============================================================================
// KMeans
// =============================================================================

export class KMeans {
  readonly k: number;
  readonly dim: number;
  centroids: Float32Array; // [k × dim] contiguous, L2-normalized
  trained = false;

  constructor(k: number, dim: number) {
    if (k === 0 || dim === 0) throw new Error("InvalidParams");
    this.k = k;
    this.dim = dim;
    this.centroids = new Float32Array(k * dim);
  }

  /**
   * Train on N vectors (flat contiguous f32).
   * vectorsFlat: [N × dim]. maxIter: convergence limit.
   */
  train(vectorsFlat: Float32Array, n: number, maxIter: number): void {
    if (n < this.k) throw new Error("TooFewVectors");

    const { k, dim } = this;
    const assignments = new Uint32Array(n);
    const counts = new Uint32Array(k);
    const accum = new Float64Array(k * dim);

    // 1. K-Means++ initialization
    this.kmeansppInit(vectorsFlat, n);

    // 2. Iterative refinement
    for (let iter = 0; iter < maxIter; iter++) {
      // Assign: each vector → nearest centroid
      this.assignStep(vectorsFlat, n, assignments);

      // Update: recompute centroids
      const converged = this.updateStep(vectorsFlat, n, assignments, counts, accum);

      // Handle empty clusters
      this.handleEmptyClusters(vectorsFlat, n, assignments, counts);

      if (converged) break;
    }

    this.trained = true;
  }

  /** Assign single vector to nearest centroid. Returns centroid index. */
  assign(vector: Float32Array): number {
    const { k, dim } = this;
    let bestIdx = 0;
    let bestSim = -Infinity;

    for (let c = 0; c < k; c++) {
      const centroid = this.centroids.subarray(c * dim, (c + 1) * dim);
      const sim = computeDot(vector, centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = c;
      }
    }
    return bestIdx;
  }

  /** Batch assign N vectors. */
  batchAssign(vectorsFlat: Float32Array, n: number, out: Uint32Array): void {
    this.assignStep(vectorsFlat, n, out);
  }

  /** Serialize centroids to Buffer. Format: [k:u32 LE][dim:u32 LE][f32 × k × dim]. */
  saveToBuffer(): Buffer {
    const headerSize = 8;
    const dataSize = this.centroids.length * 4;
    const buf = Buffer.alloc(headerSize + dataSize);
    buf.writeUInt32LE(this.k, 0);
    buf.writeUInt32LE(this.dim, 4);
    Buffer.from(this.centroids.buffer, this.centroids.byteOffset, dataSize).copy(buf, headerSize);
    return buf;
  }

  /** Deserialize from Buffer. */
  static loadFromBuffer(buf: Buffer, offset = 0): { kmeans: KMeans; bytesRead: number } {
    const k = buf.readUInt32LE(offset);
    const dim = buf.readUInt32LE(offset + 4);
    const km = new KMeans(k, dim);

    const dataSize = k * dim * 4;
    const src = buf.subarray(offset + 8, offset + 8 + dataSize);
    const aligned = new Uint8Array(dataSize);
    aligned.set(src);
    km.centroids.set(new Float32Array(aligned.buffer, 0, k * dim));
    km.trained = true;

    return { kmeans: km, bytesRead: 8 + dataSize };
  }

  /**
   * Adaptive n_lists: clamp(sqrt(n) * 2, 256, 8192).
   * Matches Zig formula exactly (except for small datasets).
   */
  static computeNLists(nVectors: number): number {
    if (nVectors < 256) return Math.min(nVectors, 256);
    const sq = Math.sqrt(nVectors) * 2;
    return Math.floor(Math.max(256, Math.min(8192, sq)));
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  /**
   * K-Means++ init: pick centroids with probability ∝ distance².
   * Uses Wyhash-style deterministic selection (no Math.random).
   */
  private kmeansppInit(vectorsFlat: Float32Array, n: number): void {
    const { k, dim } = this;
    const minDists = new Float32Array(n);

    // Pick first centroid deterministically
    const firstIdx = Number(wyhash(0x12345678n, n) % BigInt(n));
    this.centroids.set(vectorsFlat.subarray(firstIdx * dim, (firstIdx + 1) * dim), 0);
    l2Normalize(this.centroids, 0, dim);

    // Initialize distances
    for (let i = 0; i < n; i++) {
      const vec = vectorsFlat.subarray(i * dim, (i + 1) * dim);
      const sim = computeDot(vec, this.centroids.subarray(0, dim));
      minDists[i] = 1.0 - sim;
    }

    // Pick remaining centroids
    for (let c = 1; c < k; c++) {
      // Weighted selection: probability ∝ dist²
      let totalWeight = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.max(minDists[i]!, 0);
        totalWeight += w * w;
      }

      // Deterministic selection
      const hash = wyhash(0xabcdef00n + BigInt(c), totalWeight);
      let target = (Number(hash % 1000000n) / 1000000) * totalWeight;

      let chosen = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.max(minDists[i]!, 0);
        target -= w * w;
        if (target <= 0) {
          chosen = i;
          break;
        }
      }

      // Copy chosen vector as centroid
      this.centroids.set(vectorsFlat.subarray(chosen * dim, (chosen + 1) * dim), c * dim);
      l2Normalize(this.centroids, c * dim, dim);

      // Update min distances
      for (let i = 0; i < n; i++) {
        const vec = vectorsFlat.subarray(i * dim, (i + 1) * dim);
        const sim = computeDot(vec, this.centroids.subarray(c * dim, (c + 1) * dim));
        const dist = 1.0 - sim;
        if (dist < minDists[i]!) {
          minDists[i] = dist;
        }
      }
    }
  }

  private assignStep(vectorsFlat: Float32Array, n: number, assignments: Uint32Array): void {
    const { k, dim } = this;
    for (let i = 0; i < n; i++) {
      const vec = vectorsFlat.subarray(i * dim, (i + 1) * dim);
      let bestIdx = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const centroid = this.centroids.subarray(c * dim, (c + 1) * dim);
        const sim = computeDot(vec, centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = c;
        }
      }
      assignments[i] = bestIdx;
    }
  }

  /** Recompute centroids. Returns true if converged. */
  private updateStep(
    vectorsFlat: Float32Array,
    n: number,
    assignments: Uint32Array,
    counts: Uint32Array,
    accum: Float64Array,
  ): boolean {
    const { k, dim } = this;
    counts.fill(0);
    accum.fill(0);

    // Accumulate (f64 for numerical stability)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]!;
      counts[c] = (counts[c] ?? 0) + 1;
      const vecOff = i * dim;
      const accOff = c * dim;
      for (let d = 0; d < dim; d++) {
        accum[accOff + d] = (accum[accOff + d] ?? 0) + vectorsFlat[vecOff + d]!;
      }
    }

    // Update + convergence check
    let maxDelta = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      const invCount = 1.0 / counts[c]!;
      const cOff = c * dim;

      for (let d = 0; d < dim; d++) {
        const newVal = accum[cOff + d]! * invCount;
        const delta = Math.abs(newVal - this.centroids[cOff + d]!);
        if (delta > maxDelta) maxDelta = delta;
        this.centroids[cOff + d] = newVal;
      }

      l2Normalize(this.centroids, cOff, dim);
    }

    return maxDelta < 1e-5;
  }

  /** Re-seed empty clusters from largest cluster. */
  private handleEmptyClusters(
    vectorsFlat: Float32Array,
    n: number,
    assignments: Uint32Array,
    counts: Uint32Array,
  ): void {
    const { k, dim } = this;

    let largestCluster = 0;
    let largestCount = 0;
    for (let i = 0; i < k; i++) {
      if (counts[i]! > largestCount) {
        largestCount = counts[i]!;
        largestCluster = i;
      }
    }
    if (largestCount < 2) return;

    for (let c = 0; c < k; c++) {
      if (counts[c] !== 0) continue;

      for (let i = 0; i < n; i++) {
        if (assignments[i] === largestCluster) {
          const vec = vectorsFlat.subarray(i * dim, (i + 1) * dim);
          const cOff = c * dim;
          for (let d = 0; d < dim; d++) {
            const perturb = d % 2 === 0 ? 0.01 : -0.01;
            this.centroids[cOff + d] = vec[d]! + perturb;
          }
          l2Normalize(this.centroids, cOff, dim);
          break;
        }
      }
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** L2-normalize a slice of an array in-place. */
function l2Normalize(arr: Float32Array, offset: number, len: number): void {
  let sum = 0;
  for (let i = offset; i < offset + len; i++) {
    sum += arr[i]! * arr[i]!;
  }
  const norm = Math.sqrt(sum);
  if (norm > 1e-10) {
    const inv = 1.0 / norm;
    for (let i = offset; i < offset + len; i++) {
      arr[i]! *= inv;
    }
  }
}

/** Deterministic hash mixing (Wyhash-style). */
function wyhash(seed: bigint, data: number): bigint {
  let h = seed ^ (BigInt(Math.floor(data)) * 0x517cc1b727220a95n);
  h = ((h >> 33n) ^ h) * 0xff51afd7ed558ccdn;
  h = ((h >> 33n) ^ h) * 0xc4ceb9fe1a85ec53n;
  h = (h >> 33n) ^ h;
  return h & 0xffffffffffffffffn; // clamp to u64
}
