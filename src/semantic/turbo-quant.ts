/**
 * TurboQuant — two-stage online vector quantization for ANN search.
 *
 * Port of Zig `semantic/turbo_quant.zig`.
 *
 * Stage 1 (PolarQuant): Randomized Hadamard rotation makes coordinates ≈ i.i.d. Gaussian,
 * then Lloyd-Max scalar quantizer at 4 bits/dimension.
 *
 * Stage 2 (QJL): 1-bit Johnson-Lindenstrauss correction for unbiased inner product.
 *
 * Dimension-agnostic: all sizes computed from `dim` at init time.
 * Deterministic: same seed → same rotation → same encoding.
 *
 * Reference: "TurboQuant: Online Vector Quantization" (Google Research, 2025)
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 6
 */

import { computeNorm } from "./native-vector-index.js";

// =============================================================================
// Lloyd-Max 4-bit optimal quantizer for N(0,1)
// =============================================================================

/** Optimal reconstruction levels for unit Gaussian, 16 levels (4-bit). */
const LLOYD_MAX_4BIT_LEVELS: Float32Array = new Float32Array([
  -2.7326, -2.069, -1.618, -1.2562, -0.9423, -0.6568, -0.3881, -0.1284, 0.1284, 0.3881, 0.6568, 0.9423, 1.2562,
  1.618, 2.069, 2.7326,
]);

/** Decision boundaries between adjacent levels. */
const LLOYD_MAX_4BIT_THRESHOLDS: Float32Array = new Float32Array([
  -2.4008, -1.8435, -1.4371, -1.0993, -0.7996, -0.5224, -0.2582, 0.0, 0.2582, 0.5224, 0.7996, 1.0993, 1.4371,
  1.8435, 2.4008,
]);

/** Quantize scalar to 4-bit code (unrolled binary search). */
function lloydMaxQuantize4(val: number): number {
  const t = LLOYD_MAX_4BIT_THRESHOLDS;
  if (val < t[7]!) {
    if (val < t[3]!) {
      if (val < t[1]!) return val < t[0]! ? 0 : 1;
      return val < t[2]! ? 2 : 3;
    }
    if (val < t[5]!) return val < t[4]! ? 4 : 5;
    return val < t[6]! ? 6 : 7;
  }
  if (val < t[11]!) {
    if (val < t[9]!) return val < t[8]! ? 8 : 9;
    return val < t[10]! ? 10 : 11;
  }
  if (val < t[13]!) return val < t[12]! ? 12 : 13;
  return val < t[14]! ? 14 : 15;
}

// =============================================================================
// Fast Walsh-Hadamard Transform
// =============================================================================

/** In-place FWHT, O(n log n). Input length must be power of 2. */
function hadamardTransformInPlace(vec: Float32Array): void {
  const n = vec.length;
  let step = 1;
  while (step < n) {
    for (let i = 0; i < n; i += step * 2) {
      for (let j = 0; j < step; j++) {
        const a = vec[i + j]!;
        const b = vec[i + j + step]!;
        vec[i + j] = a + b;
        vec[i + j + step] = a - b;
      }
    }
    step *= 2;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Deterministic sign from seed + index (no PRNG state). */
function hashSign(seed: bigint, index: number): number {
  let h = seed ^ BigInt(index);
  h = ((h >> 33n) ^ h) * 0xff51afd7ed558ccdn;
  h = ((h >> 33n) ^ h) * 0xc4ceb9fe1a85ec53n;
  h = (h >> 33n) ^ h;
  return (h & 1n) === 0n ? 1 : -1;
}

/** Next power of 2. */
export function nextPow2(v: number): number {
  if (v <= 1) return 1;
  let x = v - 1;
  x |= x >> 1;
  x |= x >> 2;
  x |= x >> 4;
  x |= x >> 8;
  x |= x >> 16;
  return x + 1;
}

// =============================================================================
// TurboQuant
// =============================================================================

export class TurboQuant {
  readonly dim: number;
  readonly paddedDim: number;
  readonly bits: number; // always 4
  readonly jlDim: number;
  readonly seed: bigint;
  private readonly invSqrtPadded: number;

  // PolarQuant: random ±1 sign flips
  private readonly signFlips: Int8Array;
  // QJL: random projection signs [jlDim × paddedDim]
  private readonly jlSigns: Int8Array;

  constructor(dim: number, bits: number, seed: bigint) {
    if (bits !== 4) throw new Error("UnsupportedBits");
    if (dim === 0) throw new Error("InvalidDimension");

    this.dim = dim;
    this.paddedDim = nextPow2(dim);
    this.bits = bits;
    this.jlDim = Math.max(Math.floor(dim / 4), 1);
    this.seed = seed;
    this.invSqrtPadded = 1.0 / Math.sqrt(this.paddedDim);

    this.signFlips = new Int8Array(this.paddedDim);
    for (let i = 0; i < this.paddedDim; i++) {
      this.signFlips[i] = hashSign(seed, i);
    }

    const jlTotal = this.jlDim * this.paddedDim;
    this.jlSigns = new Int8Array(jlTotal);
    const jlSeed = seed + 0x9e3779b97f4a7c15n;
    for (let i = 0; i < jlTotal; i++) {
      this.jlSigns[i] = hashSign(jlSeed, i);
    }
  }

  /** Encoded vector size in bytes. */
  encodedSize(): number {
    const nibbleBytes = this.paddedDim / 2;
    const normBytes = 4;
    const jlBytes = Math.ceil(this.jlDim / 8);
    return nibbleBytes + normBytes + jlBytes;
  }

  /**
   * Encode a single vector.
   * Layout: [paddedDim/2: packed 4-bit codes] [4: f32 norm LE] [ceil(jlDim/8): QJL bits]
   */
  encode(vector: Float32Array): Uint8Array {
    if (vector.length !== this.dim) throw new Error("DimensionMismatch");

    const norm = computeNorm(vector);
    const pdim = this.paddedDim;

    // Padded buffer for rotation
    const buf = new Float32Array(pdim);
    buf.set(vector);
    // rest is already 0

    // Apply random sign flips (D·x)
    for (let i = 0; i < pdim; i++) {
      buf[i]! *= this.signFlips[i]!;
    }

    // Fast Walsh-Hadamard + scale
    hadamardTransformInPlace(buf);
    const scale = this.invSqrtPadded;
    for (let i = 0; i < pdim; i++) {
      buf[i]! *= scale;
    }

    // Standardize: σ = norm/√paddedDim
    const sigma = norm / Math.sqrt(pdim);
    if (sigma > 1e-10) {
      const invSigma = 1.0 / sigma;
      for (let i = 0; i < pdim; i++) {
        buf[i]! *= invSigma;
      }
    }

    // Allocate output
    const encSize = this.encodedSize();
    const result = new Uint8Array(encSize);
    const nibbleBytes = pdim / 2;

    // Quantize + pack nibbles
    for (let i = 0; i < pdim; i += 2) {
      const codeLo = lloydMaxQuantize4(buf[i]!);
      const codeHi = lloydMaxQuantize4(buf[i + 1]!);
      result[i / 2] = codeLo | (codeHi << 4);
    }

    // Store norm as f32 LE
    const normView = new DataView(result.buffer, result.byteOffset + nibbleBytes, 4);
    normView.setFloat32(0, norm, true);

    // Compute QJL sign bits from residual
    const residual = new Float32Array(pdim);
    for (let i = 0; i < pdim; i += 2) {
      const byte = result[i / 2]!;
      const codeLo = byte & 0xf;
      const codeHi = (byte >> 4) & 0xf;
      residual[i] = buf[i]! - LLOYD_MAX_4BIT_LEVELS[codeLo]!;
      residual[i + 1] = buf[i + 1]! - LLOYD_MAX_4BIT_LEVELS[codeHi]!;
    }

    const jlOffset = nibbleBytes + 4;
    for (let j = 0; j < this.jlDim; j++) {
      let dot = 0;
      const rowOff = j * pdim;
      for (let i = 0; i < pdim; i++) {
        dot += residual[i]! * this.jlSigns[rowOff + i]!;
      }
      if (dot >= 0) {
        const byteIdx = Math.floor(j / 8);
        const bitIdx = j % 8;
        result[jlOffset + byteIdx]! |= 1 << bitIdx;
      }
    }

    return result;
  }

  /**
   * Pre-rotate a query vector (sign flips + Hadamard + scale).
   * Call once per search; reuse across all list scans.
   */
  rotateQuery(query: Float32Array): Float32Array {
    const pdim = this.paddedDim;
    const out = new Float32Array(pdim);
    out.set(query.subarray(0, this.dim));

    for (let i = 0; i < pdim; i++) {
      out[i]! *= this.signFlips[i]!;
    }
    hadamardTransformInPlace(out);
    const scale = this.invSqrtPadded;
    for (let i = 0; i < pdim; i++) {
      out[i]! *= scale;
    }
    return out;
  }

  /**
   * Asymmetric inner product: f32 rotated query × TQ-encoded database vector.
   * No allocation — decodes nibbles on-the-fly via LUT.
   */
  asymmetricIP(queryRotated: Float32Array, encoded: Uint8Array): number {
    const pdim = this.paddedDim;
    let sum = 0;

    for (let i = 0; i < pdim; i += 2) {
      const byte = encoded[i / 2]!;
      const codeLo = byte & 0xf;
      const codeHi = (byte >> 4) & 0xf;
      sum += queryRotated[i]! * LLOYD_MAX_4BIT_LEVELS[codeLo]!;
      sum += queryRotated[i + 1]! * LLOYD_MAX_4BIT_LEVELS[codeHi]!;
    }

    // Scale back: sum is in standardized space
    const vecNorm = this.getStoredNorm(encoded);
    const sigma = vecNorm / Math.sqrt(pdim);
    return sum * sigma;
  }

  /** Get stored original norm from encoded vector. */
  getStoredNorm(encoded: Uint8Array): number {
    const normOffset = this.paddedDim / 2;
    const dv = new DataView(encoded.buffer, encoded.byteOffset + normOffset, 4);
    return dv.getFloat32(0, true);
  }

  /** Cosine similarity between f32 query and TQ-encoded vector. */
  asymmetricCosine(queryRotated: Float32Array, queryNorm: number, encoded: Uint8Array): number {
    const ip = this.asymmetricIP(queryRotated, encoded);
    const vecNorm = this.getStoredNorm(encoded);
    const denom = queryNorm * vecNorm;
    if (denom < 1e-10) return 0;
    return ip / denom;
  }

  /** Batch cosine: 1 rotated query × M contiguous encoded vectors. */
  batchAsymmetricCosine(
    queryRotated: Float32Array,
    queryNorm: number,
    encodedData: Uint8Array,
    count: number,
    scores: Float32Array,
  ): void {
    const esize = this.encodedSize();
    for (let i = 0; i < count; i++) {
      const enc = encodedData.subarray(i * esize, (i + 1) * esize);
      scores[i] = this.asymmetricCosine(queryRotated, queryNorm, enc);
    }
  }

  /** Serialize parameters (regenerated from seed on load). */
  saveToBuffer(): Buffer {
    const buf = Buffer.alloc(17); // u32 + u32 + u8 + u64
    buf.writeUInt32LE(this.dim, 0);
    buf.writeUInt32LE(this.paddedDim, 4);
    buf.writeUInt8(this.bits, 8);
    buf.writeBigUInt64LE(this.seed, 9);
    return buf;
  }

  /** Load from buffer. Returns TurboQuant + bytes consumed. */
  static loadFromBuffer(buf: Buffer, offset = 0): { tq: TurboQuant; bytesRead: number } {
    const dim = buf.readUInt32LE(offset);
    const paddedDim = buf.readUInt32LE(offset + 4);
    const bits = buf.readUInt8(offset + 8);
    const seed = buf.readBigUInt64LE(offset + 9);

    const tq = new TurboQuant(dim, bits, seed);
    if (tq.paddedDim !== paddedDim) throw new Error("CorruptedData");

    return { tq, bytesRead: 17 };
  }
}
