/**
 * CBOR Metadata Serialization Utilities
 *
 * Encodes/decodes entity and relationship metadata using CBOR binary format.
 * Falls back to JSON for legacy data or when CBOR encoding fails.
 * Used by entity-ops, relationship-ops, vector-ops, and row-mappers.
 */

import * as cbor from "cbor-x";
import { LRUCache } from "lru-cache";
import { CACHE_CONFIG } from "./types.js";

/** LRU cache for decoded metadata objects */
const metadataCache = new LRUCache<string, Record<string, unknown>>(CACHE_CONFIG.metadataCache);

/**
 * Encode metadata object to CBOR binary.
 * Returns null for empty/null metadata.
 * Falls back to JSON if CBOR encoding fails.
 */
export function encodeMetadata(metadata: Record<string, unknown> | null | undefined): Buffer | null {
  if (!metadata) return null;
  try {
    return Buffer.from(cbor.encode(metadata));
  } catch {
    // Fallback to JSON if CBOR fails (e.g., unsupported types)
    return Buffer.from(JSON.stringify(metadata));
  }
}

/**
 * Decode metadata from CBOR binary or legacy JSON string.
 * Auto-detects format: Buffer/Uint8Array → CBOR, string → JSON.
 * Uses LRU cache keyed on first 48 bytes (base64) for deduplication.
 */
export function decodeMetadata(data: Buffer | Uint8Array | string | null): Record<string, unknown> | undefined {
  if (!data) return undefined;

  // Check cache first (optimization: only convert first 48 bytes to base64 → ~64 chars)
  let cacheKey: string;
  if (typeof data === "string") {
    cacheKey = data.length <= 64 ? data : data.slice(0, 64);
  } else {
    // Only encode first 48 bytes (produces ~64 base64 chars) instead of full buffer
    const slice = data.length <= 48 ? data : data.slice(0, 48);
    cacheKey = Buffer.from(slice).toString("base64");
  }
  const cached = metadataCache.get(cacheKey);
  if (cached) return cached;

  try {
    let result: Record<string, unknown>;

    if (typeof data === "string") {
      // Legacy JSON string
      result = JSON.parse(data);
    } else {
      // Try CBOR first, fallback to JSON
      try {
        result = cbor.decode(data instanceof Uint8Array ? data : Buffer.from(data));
      } catch {
        result = JSON.parse(Buffer.from(data).toString("utf8"));
      }
    }

    metadataCache.set(cacheKey, result);
    return result;
  } catch {
    return undefined;
  }
}

/**
 * Clear the metadata decode cache.
 * Call on project context switch or after bulk operations.
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
}

/**
 * Get metadata cache statistics for monitoring.
 */
export function getMetadataCacheStats(): { size: number; maxSize: number } {
  return {
    size: metadataCache.size,
    maxSize: CACHE_CONFIG.metadataCache.max,
  };
}
