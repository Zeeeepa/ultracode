/**
 * TurboQuant — two-stage online vector quantization for ANN search.
 *
 * Port of Zig `semantic/turbo_quant.zig`.
 *
 * Stage 1 (PolarQuant): Randomized Hadamard rotation -> i.i.d. Gaussian coordinates,
 * then Lloyd-Max scalar quantizer at 2/3/4 bits per dimension.
 *
 * Stage 2 (QJL): 1-bit Johnson-Lindenstrauss correction for unbiased inner product.
 * Activatable in search for +1-5% recall improvement.
 *
 * Dimension-agnostic: all sizes computed from `dim` at init time.
 * Deterministic: same seed -> same rotation -> same encoding.
 *
 * Reference: "TurboQuant: Online Vector Quantization" (Google Research, 2025)
 * Extensions from TurboQuant+: multi-bit (2/3/4), QJL-corrected search.
 *
 * @history
 *  - 2026-03-29: Created — Zig->TS sync, IVF+TurboQuant Phase Step 6
 *  - 2026-03-31: TurboQuant+ — multi-bit, residual_norm, QJL-corrected search
 */

import { computeNorm } from "./native-vector-index.js";

// =============================================================================
// Lloyd-Max optimal quantizers for N(0,1)
// Source: Max (1960), "Quantizing for Minimum Distortion"
// =============================================================================

// -- 4-bit: 16 reconstruction levels --

const LLOYD_MAX_4BIT_LEVELS: Float32Array = new Float32Array([
  -2.7326, -2.069, -1.618, -1.2562, -0.9423, -0.6568, -0.3881, -0.1284, 0.1284, 0.3881, 0.6568, 0.9423, 1.2562, 1.618,
  2.069, 2.7326,
]);

const LLOYD_MAX_4BIT_THRESHOLDS: Float32Array = new Float32Array([
  -2.4008, -1.8435, -1.4371, -1.0993, -0.7996, -0.5224, -0.2582, 0.0, 0.2582, 0.5224, 0.7996, 1.0993, 1.4371, 1.8435,
  2.4008,
]);

// -- 3-bit: 8 reconstruction levels --

const LLOYD_MAX_3BIT_LEVELS: Float32Array = new Float32Array([
  -2.152, -1.344, -0.756, -0.2451, 0.2451, 0.756, 1.344, 2.152,
]);

const LLOYD_MAX_3BIT_THRESHOLDS: Float32Array = new Float32Array([-1.748, -1.05, -0.5006, 0.0, 0.5006, 1.05, 1.748]);

// -- 2-bit: 4 reconstruction levels --

const LLOYD_MAX_2BIT_LEVELS: Float32Array = new Float32Array([-1.5104, -0.4528, 0.4528, 1.5104]);

const LLOYD_MAX_2BIT_THRESHOLDS: Float32Array = new Float32Array([-0.9816, 0.0, 0.9816]);

/** sqrt(pi/2) - QJL correction scale factor */
const QJL_SCALE = Math.sqrt(Math.PI / 2);

// =============================================================================
// Quantizer functions (unrolled binary search)
// =============================================================================

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

function lloydMaxQuantize3(val: number): number {
  const t = LLOYD_MAX_3BIT_THRESHOLDS;
  if (val < t[3]!) {
    if (val < t[1]!) return val < t[0]! ? 0 : 1;
    return val < t[2]! ? 2 : 3;
  }
  if (val < t[5]!) return val < t[4]! ? 4 : 5;
  return val < t[6]! ? 6 : 7;
}

function lloydMaxQuantize2(val: number): number {
  const t = LLOYD_MAX_2BIT_THRESHOLDS;
  if (val < t[1]!) return val < t[0]! ? 0 : 1;
  return val < t[2]! ? 2 : 3;
}

// =============================================================================
// Fast Walsh-Hadamard Transform
// =============================================================================

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

function hashSign(seed: bigint, index: number): number {
  let h = seed ^ BigInt(index);
  h = ((h >> 33n) ^ h) * 0xff51afd7ed558ccdn;
  h = ((h >> 33n) ^ h) * 0xc4ceb9fe1a85ec53n;
  h = (h >> 33n) ^ h;
  return (h & 1n) === 0n ? 1 : -1;
}

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
  readonly bits: number; // 2, 3, or 4
  readonly jlDim: number;
  readonly seed: bigint;
  private readonly invSqrtPadded: number;
  private readonly signFlips: Int8Array;
  private readonly jlSigns: Int8Array;

  constructor(dim: number, bits: number, seed: bigint) {
    if (bits < 2 || bits > 4) throw new Error("UnsupportedBits");
    if (dim === 0) throw new Error("InvalidDimension");

    const padded = nextPow2(dim);
    // 3-bit packing needs groups of 8 dims (24 bits = 3 bytes)
    if ((padded * bits) % 8 !== 0) throw new Error("InvalidDimension");

    this.dim = dim;
    this.paddedDim = padded;
    this.bits = bits;
    this.jlDim = Math.max(Math.floor(dim / 4), 1);
    this.seed = seed;
    this.invSqrtPadded = 1.0 / Math.sqrt(padded);

    this.signFlips = new Int8Array(padded);
    for (let i = 0; i < padded; i++) {
      this.signFlips[i] = hashSign(seed, i);
    }

    const jlTotal = this.jlDim * padded;
    this.jlSigns = new Int8Array(jlTotal);
    const jlSeed = seed + 0x9e3779b97f4a7c15n;
    for (let i = 0; i < jlTotal; i++) {
      this.jlSigns[i] = hashSign(jlSeed, i);
    }
  }

  // =========================================================================
  // Layout: [code_bytes][4: f32 norm][4: f32 residual_norm][jl_bytes]
  // =========================================================================

  codeBytes(): number {
    return (this.paddedDim * this.bits) / 8;
  }

  private normOffset(): number {
    return this.codeBytes();
  }

  private residualNormOffset(): number {
    return this.codeBytes() + 4;
  }

  private jlOffset(): number {
    return this.codeBytes() + 8;
  }

  private jlBytes(): number {
    return Math.ceil(this.jlDim / 8);
  }

  encodedSize(): number {
    return this.jlOffset() + this.jlBytes();
  }

  // =========================================================================
  // Encode
  // =========================================================================

  encode(vector: Float32Array): Uint8Array {
    if (vector.length !== this.dim) throw new Error("DimensionMismatch");

    const norm = computeNorm(vector);
    const pdim = this.paddedDim;

    // Padded buffer for rotation
    const buf = new Float32Array(pdim);
    buf.set(vector);

    // D·x (random sign flips)
    for (let i = 0; i < pdim; i++) {
      buf[i]! *= this.signFlips[i]!;
    }

    // H·D·x / sqrt(n) (orthogonal Hadamard rotation)
    hadamardTransformInPlace(buf);
    const scale = this.invSqrtPadded;
    for (let i = 0; i < pdim; i++) {
      buf[i]! *= scale;
    }

    // Standardize: / sigma = norm/sqrt(n) -> components ~ N(0,1)
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

    // Quantize, pack, compute residual in-place (buf becomes residual)
    let residualSq = 0;

    switch (this.bits) {
      case 4: {
        for (let i = 0; i < pdim; i += 2) {
          const c0 = lloydMaxQuantize4(buf[i]!);
          const c1 = lloydMaxQuantize4(buf[i + 1]!);
          result[i / 2] = c0 | (c1 << 4);
          const r0 = buf[i]! - LLOYD_MAX_4BIT_LEVELS[c0]!;
          const r1 = buf[i + 1]! - LLOYD_MAX_4BIT_LEVELS[c1]!;
          buf[i] = r0;
          buf[i + 1] = r1;
          residualSq += r0 * r0 + r1 * r1;
        }
        break;
      }
      case 3: {
        for (let dimI = 0; dimI < pdim; dimI += 8) {
          const bi = (dimI * 3) / 8;
          const c = new Uint8Array(8);
          for (let k = 0; k < 8; k++) {
            const q3 = lloydMaxQuantize3(buf[dimI + k]!);
            c[k] = q3;
            const r = buf[dimI + k]! - LLOYD_MAX_3BIT_LEVELS[q3]!;
            buf[dimI + k] = r;
            residualSq += r * r;
          }
          result[bi] = (c[0]! & 7) | ((c[1]! & 7) << 3) | ((c[2]! & 3) << 6);
          result[bi + 1] = (c[2]! >> 2) | ((c[3]! & 7) << 1) | ((c[4]! & 7) << 4) | ((c[5]! & 1) << 7);
          result[bi + 2] = (c[5]! >> 1) | ((c[6]! & 7) << 2) | ((c[7]! & 7) << 5);
        }
        break;
      }
      case 2: {
        for (let i = 0; i < pdim; i += 4) {
          const c0 = lloydMaxQuantize2(buf[i]!);
          const c1 = lloydMaxQuantize2(buf[i + 1]!);
          const c2 = lloydMaxQuantize2(buf[i + 2]!);
          const c3 = lloydMaxQuantize2(buf[i + 3]!);
          result[i / 4] = c0 | (c1 << 2) | (c2 << 4) | (c3 << 6);
          const codes = [c0, c1, c2, c3];
          for (let k = 0; k < 4; k++) {
            const r = buf[i + k]! - LLOYD_MAX_2BIT_LEVELS[codes[k]!]!;
            buf[i + k] = r;
            residualSq += r * r;
          }
        }
        break;
      }
    }

    // Store norms
    const normView = new DataView(result.buffer, result.byteOffset + this.normOffset(), 4);
    normView.setFloat32(0, norm, true);
    const residualNormView = new DataView(result.buffer, result.byteOffset + this.residualNormOffset(), 4);
    residualNormView.setFloat32(0, Math.sqrt(residualSq), true);

    // QJL sign bits from residual (now in buf)
    const jlOff = this.jlOffset();
    for (let j = 0; j < this.jlDim; j++) {
      let dot = 0;
      const rowOff = j * pdim;
      for (let i = 0; i < pdim; i++) {
        dot += buf[i]! * this.jlSigns[rowOff + i]!;
      }
      if (dot >= 0) {
        const byteIdx = Math.floor(j / 8);
        const bitIdx = j % 8;
        result[jlOff + byteIdx]! |= 1 << bitIdx;
      }
    }

    return result;
  }

  // =========================================================================
  // Query rotation + JL projection
  // =========================================================================

  rotateQuery(query: Float32Array): Float32Array {
    const pdim = this.paddedDim;
    const out = new Float32Array(pdim);
    out.set(query.subarray(0, this.dim));

    for (let i = 0; i < pdim; i++) {
      out[i]! *= this.signFlips[i]!;
    }
    hadamardTransformInPlace(out);
    const s = this.invSqrtPadded;
    for (let i = 0; i < pdim; i++) {
      out[i]! *= s;
    }
    return out;
  }

  precomputeJlProjection(queryRotated: Float32Array): Float32Array {
    const jlProj = new Float32Array(this.jlDim);
    const pdim = this.paddedDim;
    for (let j = 0; j < this.jlDim; j++) {
      let dot = 0;
      const rowOff = j * pdim;
      for (let i = 0; i < pdim; i++) {
        dot += queryRotated[i]! * this.jlSigns[rowOff + i]!;
      }
      jlProj[j] = dot;
    }
    return jlProj;
  }

  // =========================================================================
  // Asymmetric inner product
  // =========================================================================

  asymmetricIP(queryRotated: Float32Array, encoded: Uint8Array): number {
    const rawSum = this.rawSumDispatch(queryRotated, encoded);
    const vecNorm = this.getStoredNorm(encoded);
    const sigma = vecNorm / Math.sqrt(this.paddedDim);
    return rawSum * sigma;
  }

  asymmetricIPCorrected(queryRotated: Float32Array, jlProjection: Float32Array, encoded: Uint8Array): number {
    const rawSum = this.rawSumDispatch(queryRotated, encoded);

    // QJL correction in standardized space
    const residualNorm = this.getStoredResidualNorm(encoded);
    let correction = 0;
    if (residualNorm > 1e-10) {
      const jlOff = this.jlOffset();
      for (let j = 0; j < this.jlDim; j++) {
        const byteI = Math.floor(j / 8);
        const bitI = j % 8;
        const signBit = encoded[jlOff + byteI]! & (1 << bitI);
        const sign = signBit !== 0 ? 1.0 : -1.0;
        correction += sign * jlProjection[j]!;
      }
      correction *= (QJL_SCALE / this.jlDim) * residualNorm;
    }

    const vecNorm = this.getStoredNorm(encoded);
    const sigma = vecNorm / Math.sqrt(this.paddedDim);
    return (rawSum + correction) * sigma;
  }

  // -- Raw sum helpers (standardized space, before sigma scaling) --

  private rawSumDispatch(qr: Float32Array, enc: Uint8Array): number {
    switch (this.bits) {
      case 4:
        return this.rawSum4(qr, enc);
      case 3:
        return this.rawSum3(qr, enc);
      case 2:
        return this.rawSum2(qr, enc);
      default:
        throw new Error("UnsupportedBits");
    }
  }

  private rawSum4(qr: Float32Array, enc: Uint8Array): number {
    const pdim = this.paddedDim;
    let sum = 0;
    for (let i = 0; i < pdim; i += 2) {
      const byte = enc[i / 2]!;
      const lo = byte & 0xf;
      const hi = (byte >> 4) & 0xf;
      sum += qr[i]! * LLOYD_MAX_4BIT_LEVELS[lo]!;
      sum += qr[i + 1]! * LLOYD_MAX_4BIT_LEVELS[hi]!;
    }
    return sum;
  }

  private rawSum3(qr: Float32Array, enc: Uint8Array): number {
    const pdim = this.paddedDim;
    let sum = 0;
    for (let di = 0; di < pdim; di += 8) {
      const bi = (di * 3) / 8;
      const b0 = enc[bi]!;
      const b1 = enc[bi + 1]!;
      const b2 = enc[bi + 2]!;
      sum += qr[di]! * LLOYD_MAX_3BIT_LEVELS[b0 & 7]!;
      sum += qr[di + 1]! * LLOYD_MAX_3BIT_LEVELS[(b0 >> 3) & 7]!;
      sum += qr[di + 2]! * LLOYD_MAX_3BIT_LEVELS[((b0 >> 6) | (b1 << 2)) & 7]!;
      sum += qr[di + 3]! * LLOYD_MAX_3BIT_LEVELS[(b1 >> 1) & 7]!;
      sum += qr[di + 4]! * LLOYD_MAX_3BIT_LEVELS[(b1 >> 4) & 7]!;
      sum += qr[di + 5]! * LLOYD_MAX_3BIT_LEVELS[((b1 >> 7) | (b2 << 1)) & 7]!;
      sum += qr[di + 6]! * LLOYD_MAX_3BIT_LEVELS[(b2 >> 2) & 7]!;
      sum += qr[di + 7]! * LLOYD_MAX_3BIT_LEVELS[(b2 >> 5) & 7]!;
    }
    return sum;
  }

  private rawSum2(qr: Float32Array, enc: Uint8Array): number {
    const pdim = this.paddedDim;
    let sum = 0;
    for (let i = 0; i < pdim; i += 4) {
      const byte = enc[i / 4]!;
      sum += qr[i]! * LLOYD_MAX_2BIT_LEVELS[byte & 3]!;
      sum += qr[i + 1]! * LLOYD_MAX_2BIT_LEVELS[(byte >> 2) & 3]!;
      sum += qr[i + 2]! * LLOYD_MAX_2BIT_LEVELS[(byte >> 4) & 3]!;
      sum += qr[i + 3]! * LLOYD_MAX_2BIT_LEVELS[(byte >> 6) & 3]!;
    }
    return sum;
  }

  // =========================================================================
  // Cosine similarity
  // =========================================================================

  asymmetricCosine(queryRotated: Float32Array, queryNorm: number, encoded: Uint8Array): number {
    const ip = this.asymmetricIP(queryRotated, encoded);
    const vecNorm = this.getStoredNorm(encoded);
    const denom = queryNorm * vecNorm;
    if (denom < 1e-10) return 0;
    return ip / denom;
  }

  asymmetricCosineCorrected(
    queryRotated: Float32Array,
    queryNorm: number,
    jlProjection: Float32Array,
    encoded: Uint8Array,
  ): number {
    const ip = this.asymmetricIPCorrected(queryRotated, jlProjection, encoded);
    const vecNorm = this.getStoredNorm(encoded);
    const denom = queryNorm * vecNorm;
    if (denom < 1e-10) return 0;
    return ip / denom;
  }

  batchAsymmetricCosine(
    queryRotated: Float32Array,
    queryNorm: number,
    encodedData: Uint8Array,
    count: number,
    scores: Float32Array,
    jlProjection: Float32Array | null,
  ): void {
    const esize = this.encodedSize();
    if (jlProjection) {
      for (let i = 0; i < count; i++) {
        const enc = encodedData.subarray(i * esize, (i + 1) * esize);
        scores[i] = this.asymmetricCosineCorrected(queryRotated, queryNorm, jlProjection, enc);
      }
    } else {
      for (let i = 0; i < count; i++) {
        const enc = encodedData.subarray(i * esize, (i + 1) * esize);
        scores[i] = this.asymmetricCosine(queryRotated, queryNorm, enc);
      }
    }
  }

  // =========================================================================
  // Norm accessors
  // =========================================================================

  getStoredNorm(encoded: Uint8Array): number {
    const off = this.normOffset();
    const dv = new DataView(encoded.buffer, encoded.byteOffset + off, 4);
    return dv.getFloat32(0, true);
  }

  getStoredResidualNorm(encoded: Uint8Array): number {
    const off = this.residualNormOffset();
    const dv = new DataView(encoded.buffer, encoded.byteOffset + off, 4);
    return dv.getFloat32(0, true);
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  saveToBuffer(): Buffer {
    const buf = Buffer.alloc(17); // u32 + u32 + u8 + u64
    buf.writeUInt32LE(this.dim, 0);
    buf.writeUInt32LE(this.paddedDim, 4);
    buf.writeUInt8(this.bits, 8);
    buf.writeBigUInt64LE(this.seed, 9);
    return buf;
  }

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
