/**
 * Stable ID Generation Module
 *
 * Generates stable, deterministic IDs for entities and relationships
 * using xxHash for fast, collision-resistant hashing.
 * Extracted from indexer-agent.ts for better modularity.
 */

import xxhash from "xxhash-wasm";
import type { Entity, RelationType } from "../../types/storage.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const ID_LENGTH = 12;

// =============================================================================
// XXHASH INITIALIZATION
// =============================================================================

let xxhashInstance: Awaited<ReturnType<typeof xxhash>> | null = null;

/**
 * Initialize xxHash once
 */
export async function initXXHash(): Promise<void> {
  if (!xxhashInstance) {
    xxhashInstance = await xxhash();
  }
}

/**
 * Get xxHash instance (throws if not initialized)
 */
function getXXHash(): Awaited<ReturnType<typeof xxhash>> {
  if (!xxhashInstance) {
    throw new Error("xxHash not initialized - call initXXHash() first");
  }
  return xxhashInstance;
}

// =============================================================================
// STABLE ID GENERATION
// =============================================================================

/**
 * Generate stable entity ID based on entity properties.
 * For packages and imports, uses global ID (no filePath) since they represent
 * the same entity across files.
 */
export function stableEntityId(base: Omit<Entity, "id" | "createdAt" | "updatedAt">): string {
  // For packages and imports, use global ID (no filePath, no location) since they represent the same entity across files
  const isGlobal = base.type === "package" || base.type === "import";

  const key = isGlobal
    ? `${base.type}|${base.name}` // Only type and name for global entities
    : `${base.filePath}|${base.type}|${base.name}|${base.location?.start?.index ?? -1}-${base.location?.end?.index ?? -1}`; // Full path for file-specific entities

  return getXXHash().h64ToString(key).slice(0, ID_LENGTH);
}

/**
 * Generate stable relationship ID based on source, target, and type.
 */
export function stableRelationshipId(fromId: string, toId: string, type: RelationType | string): string {
  return getXXHash().h64ToString(`${fromId}|${toId}|${type}`).slice(0, ID_LENGTH);
}
