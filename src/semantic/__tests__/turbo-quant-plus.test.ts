/**
 * TurboQuant+ smoke tests: multi-bit encoding, QJL correction, bounded heap,
 * format compatibility with Zig.
 */
import { describe, expect, it } from "bun:test";
import { computeNorm } from "../native-vector-index.js";
import { classifyTier, TIER_COLD, TIER_HOT, TIER_WARM, tierBitWidth } from "../quantization.js";
import { nextPow2, TurboQuant } from "../turbo-quant.js";

// =============================================================================
// Quantization tier
// =============================================================================

describe("tierBitWidth", () => {
  it("maps hot=4, warm=3, cold=2", () => {
    expect(tierBitWidth(TIER_HOT)).toBe(4);
    expect(tierBitWidth(TIER_WARM)).toBe(3);
    expect(tierBitWidth(TIER_COLD)).toBe(2);
  });

  it("classifyTier still works", () => {
    expect(classifyTier("function", 15)).toBe(TIER_HOT);
    expect(classifyTier("class", 0)).toBe(TIER_HOT);
    expect(classifyTier("variable", 5)).toBe(TIER_WARM);
    expect(classifyTier("import_decl", 0)).toBe(TIER_COLD);
  });
});

// =============================================================================
// TurboQuant multi-bit
// =============================================================================

describe("TurboQuant constructor", () => {
  it("accepts bits 2, 3, 4", () => {
    expect(() => new TurboQuant(384, 2, 42n)).not.toThrow();
    expect(() => new TurboQuant(384, 3, 42n)).not.toThrow();
    expect(() => new TurboQuant(384, 4, 42n)).not.toThrow();
  });

  it("rejects bits 0, 1, 5", () => {
    expect(() => new TurboQuant(384, 0, 42n)).toThrow("UnsupportedBits");
    expect(() => new TurboQuant(384, 1, 42n)).toThrow("UnsupportedBits");
    expect(() => new TurboQuant(384, 5, 42n)).toThrow("UnsupportedBits");
  });
});

describe("TurboQuant encodedSize — Zig compatibility", () => {
  // These must match Zig exactly for binary format interop
  it("384d 4-bit = 276", () => {
    const tq = new TurboQuant(384, 4, 42n);
    // codeBytes=512*4/8=256, norm=4, residualNorm=4, jl=ceil(96/8)=12 → 276
    expect(tq.encodedSize()).toBe(276);
  });

  it("384d 3-bit = 212", () => {
    const tq = new TurboQuant(384, 3, 42n);
    // codeBytes=512*3/8=192, +4+4+12=212
    expect(tq.encodedSize()).toBe(212);
  });

  it("384d 2-bit = 148", () => {
    const tq = new TurboQuant(384, 2, 42n);
    // codeBytes=512*2/8=128, +4+4+12=148
    expect(tq.encodedSize()).toBe(148);
  });

  it("768d 4-bit = 544", () => {
    const tq = new TurboQuant(768, 4, 0n);
    // padded=1024, code=512, jl=ceil(192/8)=24, total=512+8+24=544
    expect(tq.encodedSize()).toBe(544);
  });

  it("256d 4-bit = 144", () => {
    const tq = new TurboQuant(256, 4, 0n);
    // padded=256, code=128, jl=ceil(64/8)=8, total=128+8+8=144
    expect(tq.encodedSize()).toBe(144);
  });
});

// =============================================================================
// Encode + norm preservation
// =============================================================================

function makeVec(dim: number, seed = 1): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.sin(seed * (i + 1) * 0.7) * (i % 3 === 0 ? -1 : 1);
  return v;
}

describe("TurboQuant encode", () => {
  for (const bits of [2, 3, 4] as const) {
    it(`${bits}-bit preserves norm`, () => {
      const tq = new TurboQuant(8, bits, 42n);
      const vec = new Float32Array([0.5, -0.3, 0.8, 0.1, -0.6, 0.4, -0.2, 0.7]);
      const encoded = tq.encode(vec);

      expect(encoded.length).toBe(tq.encodedSize());
      const storedNorm = tq.getStoredNorm(encoded);
      const originalNorm = computeNorm(vec);
      expect(Math.abs(storedNorm - originalNorm)).toBeLessThan(0.001);
    });
  }

  it("4-bit stores residual norm > 0", () => {
    const tq = new TurboQuant(8, 4, 42n);
    const vec = new Float32Array([0.5, -0.3, 0.8, 0.1, -0.6, 0.4, -0.2, 0.7]);
    const encoded = tq.encode(vec);
    const rn = tq.getStoredResidualNorm(encoded);
    expect(rn).toBeGreaterThan(0);
    expect(rn).toBeLessThan(10);
  });

  it("deterministic encoding (same seed = same output)", () => {
    const tq1 = new TurboQuant(8, 4, 999n);
    const tq2 = new TurboQuant(8, 4, 999n);
    const vec = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const e1 = tq1.encode(vec);
    const e2 = tq2.encode(vec);
    expect(Buffer.from(e1).equals(Buffer.from(e2))).toBe(true);
  });
});

// =============================================================================
// Asymmetric cosine self-similarity
// =============================================================================

describe("TurboQuant self-cosine", () => {
  const vec32 = new Float32Array([
    1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, -1.0, 0.5, -0.3, 0.8, 0.2, -0.7, 0.4, 0.1, 0.9, -0.4, 0.6, -0.2, 0.3, 0.5,
    -0.8, 0.7, 1.1, -1.2, 0.9, -0.5, 0.3, 0.4, -0.6, 0.2,
  ]);

  it("4-bit self-cosine > 0.85", () => {
    const tq = new TurboQuant(32, 4, 123n);
    const encoded = tq.encode(vec32);
    const rotated = tq.rotateQuery(vec32);
    const qn = computeNorm(vec32);
    expect(tq.asymmetricCosine(rotated, qn, encoded)).toBeGreaterThan(0.85);
  });

  it("3-bit self-cosine > 0.70", () => {
    const tq = new TurboQuant(32, 3, 123n);
    const encoded = tq.encode(vec32);
    const rotated = tq.rotateQuery(vec32);
    const qn = computeNorm(vec32);
    expect(tq.asymmetricCosine(rotated, qn, encoded)).toBeGreaterThan(0.7);
  });

  it("2-bit self-cosine > 0.50", () => {
    const tq = new TurboQuant(32, 2, 123n);
    const encoded = tq.encode(vec32);
    const rotated = tq.rotateQuery(vec32);
    const qn = computeNorm(vec32);
    expect(tq.asymmetricCosine(rotated, qn, encoded)).toBeGreaterThan(0.5);
  });
});

// =============================================================================
// QJL-corrected search
// =============================================================================

describe("TurboQuant QJL correction", () => {
  it("corrected IP is finite and reasonable", () => {
    const tq = new TurboQuant(32, 4, 42n);
    const a = makeVec(32, 1);
    const b = makeVec(32, 2);

    const encA = tq.encode(a);
    const rotB = tq.rotateQuery(b);

    const baseIP = tq.asymmetricIP(rotB, encA);
    const jlProj = tq.precomputeJlProjection(rotB);
    const correctedIP = tq.asymmetricIPCorrected(rotB, jlProj, encA);

    expect(Number.isFinite(baseIP)).toBe(true);
    expect(Number.isFinite(correctedIP)).toBe(true);
    expect(Math.abs(baseIP)).toBeLessThan(100);
    expect(Math.abs(correctedIP)).toBeLessThan(100);
  });

  it("corrected cosine is finite", () => {
    const tq = new TurboQuant(32, 4, 42n);
    const a = makeVec(32, 1);
    const b = makeVec(32, 2);

    const encA = tq.encode(a);
    const rotB = tq.rotateQuery(b);
    const qn = computeNorm(b);
    const jlProj = tq.precomputeJlProjection(rotB);

    const cos = tq.asymmetricCosineCorrected(rotB, qn, jlProj, encA);
    expect(Number.isFinite(cos)).toBe(true);
    expect(Math.abs(cos)).toBeLessThanOrEqual(1.5); // may slightly exceed 1.0 due to approximation
  });
});

// =============================================================================
// Batch cosine with JL projection
// =============================================================================

describe("TurboQuant batch", () => {
  it("batch with jlProjection=null works", () => {
    const tq = new TurboQuant(8, 4, 77n);
    const esize = tq.encodedSize();

    const vecs = [
      new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]),
      new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]),
      new Float32Array([0.7, 0.7, 0, 0, 0, 0, 0, 0]),
    ];

    const packed = new Uint8Array(3 * esize);
    for (let i = 0; i < 3; i++) {
      const enc = tq.encode(vecs[i]!);
      packed.set(enc, i * esize);
    }

    const rotated = tq.rotateQuery(vecs[0]!);
    const qn = computeNorm(vecs[0]!);
    const scores = new Float32Array(3);

    tq.batchAsymmetricCosine(rotated, qn, packed, 3, scores, null);
    // self > partial > orthogonal
    expect(scores[0]!).toBeGreaterThan(scores[2]!);
    expect(scores[2]!).toBeGreaterThan(scores[1]!);
  });

  it("batch with jlProjection works", () => {
    const tq = new TurboQuant(8, 4, 77n);
    const esize = tq.encodedSize();

    const vecs = [new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0, 0, 0, 0, 0, 0])];

    const packed = new Uint8Array(2 * esize);
    for (let i = 0; i < 2; i++) {
      const enc = tq.encode(vecs[i]!);
      packed.set(enc, i * esize);
    }

    const rotated = tq.rotateQuery(vecs[0]!);
    const qn = computeNorm(vecs[0]!);
    const jlProj = tq.precomputeJlProjection(rotated);
    const scores = new Float32Array(2);

    tq.batchAsymmetricCosine(rotated, qn, packed, 2, scores, jlProj);
    expect(scores[0]!).toBeGreaterThan(scores[1]!); // self > orthogonal
  });
});

// =============================================================================
// Save/load round-trip
// =============================================================================

describe("TurboQuant save/load", () => {
  for (const bits of [2, 3, 4] as const) {
    it(`${bits}-bit round-trip`, () => {
      const tq = new TurboQuant(384, bits, 12345n);
      const buf = tq.saveToBuffer();
      const { tq: tq2, bytesRead } = TurboQuant.loadFromBuffer(buf, 0);

      expect(bytesRead).toBe(17);
      expect(tq2.dim).toBe(384);
      expect(tq2.paddedDim).toBe(512);
      expect(tq2.bits).toBe(bits);
      expect(tq2.seed).toBe(12345n);
      expect(tq2.encodedSize()).toBe(tq.encodedSize());
    });
  }
});

// =============================================================================
// nextPow2
// =============================================================================

describe("nextPow2", () => {
  it("known values", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(255)).toBe(256);
    expect(nextPow2(256)).toBe(256);
    expect(nextPow2(384)).toBe(512);
    expect(nextPow2(768)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });
});
