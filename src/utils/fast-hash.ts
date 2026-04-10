/**
 * Fast Hashing Utilities
 *
 * Runtime-adaptive: uses Bun.hash (SIMD-native) when available,
 * falls back to xxhash-wasm for Node.js.
 *
 * Performance:
 * - Bun.hash (SIMD):      ~2-5µs, sync, no init
 * - xxHash (WASM):         ~15µs, async init required
 */

import type { XXHashAPI } from "xxhash-wasm";

// =============================================================================
// RUNTIME DETECTION
// =============================================================================

const isBun = typeof globalThis.Bun !== "undefined" && typeof (globalThis.Bun as any).hash?.xxHash32 === "function";

// =============================================================================
// MODULE STATE (only used for xxhash-wasm fallback)
// =============================================================================

let hasher: XXHashAPI | null = null;
let initPromise: Promise<void> | null = null;
let initialized = isBun; // Bun needs no init

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize hashing backend.
 * Under Bun: instant (no-op, SIMD-native).
 * Under Node.js: loads xxhash WASM module.
 */
export async function initHasher(): Promise<void> {
  if (initialized) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      const xxhash = (await import("xxhash-wasm")).default;
      hasher = await xxhash();
      initialized = true;
      console.log("[FastHash] xxHash WASM initialized");
    } catch (error) {
      console.error("[FastHash] CRITICAL: xxHash initialization failed:", error);
      throw new Error("xxHash initialization failed - cannot continue without deterministic hashing");
    }
  })();

  await initPromise;
}

// Start initialization immediately
if (isBun) {
  console.log("[FastHash] Using Bun.hash (SIMD-native)");
} else {
  initPromise = initHasher().catch((e) => {
    console.error("[FastHash] Background init failed:", e);
  });
}

// =============================================================================
// INTERNAL — Bun.hash wrappers (BigInt → hex string)
// =============================================================================

function bunHash32(text: string): string {
  return ((globalThis.Bun as any).hash.xxHash32(text) as number).toString(16).padStart(8, "0");
}

function bunHash64(text: string): string {
  return ((globalThis.Bun as any).hash.xxHash64(text) as bigint).toString(16).padStart(16, "0");
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fast 32-bit hash (hex string).
 * @throws Error if not initialized (Node.js only)
 */
export function hashText(text: string): string {
  if (isBun) return bunHash32(text);
  if (!hasher) {
    throw new Error("hashText called before xxHash initialized. Call await initHasher() first.");
  }
  return hasher.h32ToString(text);
}

/**
 * Fast 64-bit hash (hex string).
 * Use for content hashing, entity IDs, merkle trees.
 * @throws Error if not initialized (Node.js only)
 */
export function hashText64(text: string): string {
  if (isBun) return bunHash64(text);
  if (!hasher) {
    throw new Error("hashText64 called before xxHash initialized. Call await initHasher() first.");
  }
  return hasher.h64ToString(text);
}

/**
 * Fast 64-bit hash (BigInt).
 * Used by prolly trees for boundary decisions.
 * @throws Error if not initialized (Node.js only)
 */
export function hashBigInt64(text: string): bigint {
  if (isBun) return (globalThis.Bun as any).hash.xxHash64(text) as bigint;
  if (!hasher) {
    throw new Error("hashBigInt64 called before xxHash initialized. Call await initHasher() first.");
  }
  return hasher.h64(text);
}

/**
 * Async hash — waits for initialization if needed.
 */
export async function hashTextAsync(text: string): Promise<string> {
  if (isBun) return bunHash32(text);
  if (!initialized) {
    await initHasher();
  }
  return hasher!.h32ToString(text);
}

/**
 * Hash number (for numeric keys).
 * @throws Error if not initialized (Node.js only)
 */
export function hashNumber(num: number): string {
  return hashText(num.toString());
}

/**
 * @deprecated Use initHasher() instead
 */
export async function preloadHasher(): Promise<void> {
  return initHasher();
}

/**
 * Check if hasher is ready.
 */
export function isHasherReady(): boolean {
  return initialized;
}

/**
 * Get hasher status for diagnostics.
 */
export function getHasherStatus(): {
  initialized: boolean;
  fallback: boolean;
  enabled: boolean;
  backend: "bun-simd" | "xxhash-wasm";
} {
  return {
    initialized,
    fallback: false,
    enabled: true,
    backend: isBun ? "bun-simd" : "xxhash-wasm",
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default hashText;
