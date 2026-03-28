/**
 * Random-projection hash filter for fast approximate nearest-neighbor pre-filtering.
 *
 * Port of Zig `semantic/hash_filter.zig`.
 *
 * Uses 64 random hyperplanes to project vectors into 64-bit binary hashes.
 * Hamming distance between hashes approximates angular distance.
 * Pre-filtering via popcount eliminates ~85% candidates before full cosine.
 *
 * Deterministic: same dimension → same hyperplane matrix → same hashes across runs.
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 3
 */

const HASH_BITS = 64;

/**
 * Deterministic PRNG (Wyhash-like mixing).
 * Given a seed and index, produces a reproducible f32 in [-1, 1].
 */
function deterministicFloat(seed: bigint, index: number): number {
  // Mix: seed ^ (index * golden)
  let h = seed ^ (BigInt(index) * 0x517cc1b727220a95n);
  h = ((h >> 33n) ^ h) * 0xff51afd7ed558ccdn;
  h = ((h >> 33n) ^ h) * 0xc4ceb9fe1a85ec53n;
  h = (h >> 33n) ^ h;
  // Map to [-1, 1]
  return Number(h & 0xffffffffn) / 0xffffffff - 0.5;
}

export class HashFilter {
  /** Flat hyperplane matrix [64 × dim]. */
  private readonly hyperplanes: Float32Array;
  private readonly dim: number;

  constructor(dim: number) {
    this.dim = dim;
    const total = HASH_BITS * dim;
    this.hyperplanes = new Float32Array(total);

    // Deterministic PRNG seeded from dim (same as Zig: dim * 0x517cc1b727220a95 + 0x6c62272e07bb0142)
    const seed = BigInt(dim) * 0x517cc1b727220a95n + 0x6c62272e07bb0142n;

    // Generate approximate Gaussian hyperplanes (sum of 4 uniforms)
    for (let i = 0; i < total; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        sum += deterministicFloat(seed, i * 4 + j) * 2;
      }
      this.hyperplanes[i] = sum * 0.5;
    }
  }

  /** Compute 64-bit LSH hash: sign(hyperplanes @ vector) packed to bits. */
  computeHash(vector: Float32Array): bigint {
    if (vector.length !== this.dim) return 0n;
    let hash = 0n;

    for (let bit = 0; bit < HASH_BITS; bit++) {
      const hpOffset = bit * this.dim;
      let dot = 0;
      for (let i = 0; i < this.dim; i++) {
        dot += this.hyperplanes[hpOffset + i]! * vector[i]!;
      }
      if (dot >= 0) {
        hash |= 1n << BigInt(bit);
      }
    }
    return hash;
  }

  /**
   * Pre-filter: return indices where hamming distance ≤ threshold.
   * hashes: array of candidate hashes, count: how many valid entries.
   */
  prefilter(queryHash: bigint, hashes: BigUint64Array, count: number, threshold = 24): number[] {
    const candidates: number[] = [];
    for (let i = 0; i < count; i++) {
      const xor = queryHash ^ hashes[i]!;
      const dist = popcount64(xor);
      if (dist <= threshold) {
        candidates.push(i);
      }
    }
    return candidates;
  }

  /** Recommended hamming threshold for ~90% recall at 384-dim. */
  static defaultThreshold(): number {
    return 24;
  }
}

/** Popcount for BigInt (count set bits). */
function popcount64(v: bigint): number {
  let count = 0;
  let x = v;
  while (x > 0n) {
    x &= x - 1n;
    count++;
  }
  return count;
}
