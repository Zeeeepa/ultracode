/**
 * Runtime Utilities
 *
 * Cross-runtime utilities for Node.js and Bun compatibility.
 */

/**
 * Runtime-aware sleep - uses Bun.sleep for Bun, setTimeout for Node.js
 */
export async function sleep(ms: number): Promise<void> {
  if (typeof (globalThis as any).Bun?.sleep === "function") {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
