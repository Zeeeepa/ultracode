/**
 * Scalar Quantization + Tier System for memory-tiered vector storage.
 *
 * Port of Zig `semantic/quantization.zig`.
 *
 * Tiers:
 *   hot  = f32 exact     (functions, classes)      — 1x memory
 *   warm = int8 quantized (methods, variables)      — 4x compression
 *   cold = LSH hash only  (fields, imports)         — 48x compression
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 2
 */

// =============================================================================
// Tier System
// =============================================================================

/** Quantization tier (matches Zig enum u2 values). */
export type Tier = 0 | 1 | 2;
export const TIER_HOT: Tier = 0;
export const TIER_WARM: Tier = 1;
export const TIER_COLD: Tier = 2;

const HIGH_VALUE_TYPES = new Set([
  "function",
  "method",
  "class",
  "struct_decl",
  "interface",
  "enum_decl",
  "type_alias",
  "module",
]);

/** Classify an entity into a quantization tier based on type and connectivity. */
export function classifyTier(entityType: string, fanIn: number): Tier {
  if (fanIn > 10 || HIGH_VALUE_TYPES.has(entityType)) return TIER_HOT;
  if (fanIn > 0) return TIER_WARM;
  return TIER_COLD;
}

// =============================================================================
// Scalar int8 Quantization
// =============================================================================

export interface ScalarQuantized {
  data: Uint8Array;
  min: number;
  scale: number;
}

/** Quantize f32 vector to uint8 (4x compression). */
export function scalarQuantize(vector: Float32Array): ScalarQuantized {
  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i]!;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }

  const scale = Math.abs(vmax - vmin) < 1e-10 ? 1.0 : (vmax - vmin) / 255.0;
  const data = new Uint8Array(vector.length);

  for (let i = 0; i < vector.length; i++) {
    const normalized = (vector[i]! - vmin) / scale;
    data[i] = Math.max(0, Math.min(255, Math.round(normalized)));
  }

  return { data, min: vmin, scale };
}

/**
 * Approximate cosine similarity between quantized vector and f32 query.
 * Dequantizes on-the-fly without allocating the full f32 vector.
 */
export function scalarCosineSimilarity(sq: ScalarQuantized, query: Float32Array, queryNorm: number): number {
  if (sq.data.length !== query.length || queryNorm < 1e-10) return 0;

  let dot = 0;
  let sqNorm = 0;
  for (let i = 0; i < sq.data.length; i++) {
    const reconstructed = sq.data[i]! * sq.scale + sq.min;
    dot += reconstructed * query[i]!;
    sqNorm += reconstructed * reconstructed;
  }

  const norm = Math.sqrt(sqNorm);
  if (norm < 1e-10) return 0;
  return dot / (norm * queryNorm);
}
