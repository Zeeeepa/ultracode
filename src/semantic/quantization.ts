/**
 * Vector quantization tiers — unified under TurboQuant at different bit widths.
 *
 * Port of Zig `semantic/quantization.zig`.
 *
 * | Tier | TQ Bits | Compression | For               |
 * |------|---------|-------------|-------------------|
 * | Hot  | 4       | 3.8x        | functions, classes |
 * | Warm | 3       | 4.6x        | methods, variables |
 * | Cold | 2       | 6.4x        | fields, imports   |
 *
 * @history
 *  - 2026-03-29: Created — Zig→TS sync, IVF+TurboQuant Phase Step 2
 *  - 2026-03-31: TurboQuant+ — remove ScalarQuantized, add tierBitWidth
 */

// =============================================================================
// Tier System
// =============================================================================

/** Quantization tier (matches Zig enum u2 values). */
export type Tier = 0 | 1 | 2;
export const TIER_HOT: Tier = 0; // TQ 4-bit — high-value, primary search targets
export const TIER_WARM: Tier = 1; // TQ 3-bit — medium-value, some graph connectivity
export const TIER_COLD: Tier = 2; // TQ 2-bit — low-value, rarely searched directly

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

/** Map tier to TurboQuant bit width. */
export function tierBitWidth(tier: Tier): number {
  switch (tier) {
    case 0:
      return 4;
    case 1:
      return 3;
    case 2:
      return 2;
  }
}
