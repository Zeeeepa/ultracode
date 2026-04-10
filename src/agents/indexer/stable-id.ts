/**
 * Stable ID Generation Module
 *
 * Entity IDs: Semantic hierarchical IDs (Zig-compatible semId format).
 * Relationship IDs: xxHash for fast, collision-resistant hashing.
 */

import type { Entity, RelationType } from "../../types/storage.js";
import { hashText64, initHasher } from "../../utils/fast-hash.js";
import { generateSemId, type OrdinalMap, type ParentContext } from "./sem-id.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const ID_LENGTH = 12;

// =============================================================================
// XXHASH INITIALIZATION (delegated to fast-hash — Bun.hash SIMD or xxhash-wasm)
// =============================================================================

/**
 * Initialize xxHash (delegates to fast-hash.ts)
 */
export async function initXXHash(): Promise<void> {
  await initHasher();
}

// =============================================================================
// STABLE ID GENERATION — SemId (Zig-compatible)
// =============================================================================

/**
 * Generate semantic entity ID (Zig-compatible).
 * Uses hierarchical format: "module/type:name" instead of hex hash.
 *
 * @param base - Entity without id/timestamps
 * @param ordinalMap - Per-file ordinal tracker (caller must create one per file)
 * @param parentCtx - Optional parent context for nested entities
 */
export function stableEntityId(
  base: Omit<Entity, "id" | "createdAt" | "updatedAt">,
  ordinalMap?: OrdinalMap,
  parentCtx?: ParentContext | null,
): string {
  // If no ordinalMap provided, use legacy xxHash (backwards compat during transition)
  if (!ordinalMap) {
    const isGlobal = base.type === "package" || base.type === "import";
    const key = isGlobal
      ? `${base.type}|${base.name}`
      : `${base.filePath}|${base.type}|${base.name}|${base.location?.start?.index ?? -1}-${base.location?.end?.index ?? -1}`;
    return hashText64(key).slice(0, ID_LENGTH);
  }

  return generateSemId(base.filePath, base.name, base.type, parentCtx ?? null, ordinalMap);
}

/**
 * Generate stable relationship ID based on source, target, and type.
 * Still uses xxHash (same as Zig).
 */
export function stableRelationshipId(fromId: string, toId: string, type: RelationType | string): string {
  return hashText64(`${fromId}|${toId}|${type}`).slice(0, ID_LENGTH);
}

// Re-export sem-id types for convenience
export type { OrdinalMap, ParentContext } from "./sem-id.js";
export { generateSemId } from "./sem-id.js";
