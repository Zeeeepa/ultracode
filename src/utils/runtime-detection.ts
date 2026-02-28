/**
 * Runtime Detection Utilities
 *
 * Typed utilities for detecting the runtime environment (Bun vs Node.js)
 * and safely accessing runtime-specific functions.
 *
 * Used instead of unsafe `(globalThis as any).Bun` constructs.
 */

/**
 * Typed interface for Bun runtime
 */
interface BunRuntime {
  /**
   * Async sleep function from Bun
   * @see https://bun.sh/docs/api/utils#bun-sleep
   */
  sleep(ms: number): Promise<void>;

  /**
   * Bun runtime version
   */
  version?: string;

  /**
   * Trigger garbage collection (synchronous)
   * @param force - If true, forces a full GC
   * @see https://bun.sh/docs/api/utils#bun-gc
   */
  gc(force?: boolean): void;
}

/**
 * Extension of globalThis with Bun runtime
 */
type GlobalWithBun = typeof globalThis & {
  Bun?: BunRuntime;
};

/**
 * Safe check for Bun runtime availability
 *
 * Checks process.versions.bun to detect the Bun environment.
 * Works in both Bun and Node.js.
 *
 * @returns true if code is running in Bun, false in Node.js
 *
 * @example
 * ```typescript
 * if (isBunRuntime()) {
 *   console.log("Running in Bun");
 * } else {
 *   console.log("Running in Node.js");
 * }
 * ```
 */
export function isBunRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    process.versions !== null &&
    "bun" in process.versions
  );
}

/**
 * Typed access to Bun.sleep
 *
 * Safely calls Bun.sleep with availability check.
 * Throws an error if Bun.sleep is unavailable.
 *
 * @param ms - Number of milliseconds to sleep
 * @throws {Error} If Bun.sleep is unavailable
 *
 * @example
 * ```typescript
 * try {
 *   await bunSleep(1000);
 * } catch (error) {
 *   console.log("Bun.sleep not available, falling back to setTimeout");
 * }
 * ```
 */
export async function bunSleep(ms: number): Promise<void> {
  const global = globalThis as GlobalWithBun;

  if (isBunRuntime() && global.Bun && typeof global.Bun.sleep === "function") {
    await global.Bun.sleep(ms);
    return;
  }

  throw new Error("Bun.sleep not available");
}

/**
 * Universal sleep function (Bun or Node.js)
 *
 * Automatically selects Bun.sleep or setTimeout depending on the environment.
 * This is the main function for use in cross-platform code.
 *
 * - In Bun: uses native Bun.sleep (more efficient)
 * - In Node.js: uses setTimeout with promisification
 *
 * @param ms - Number of milliseconds to wait
 *
 * @example
 * ```typescript
 * // Works in both Bun and Node.js
 * await sleep(1000); // Wait 1 second
 *
 * // In a loop with delay
 * for (const item of items) {
 *   await processItem(item);
 *   await sleep(100); // Delay between processing
 * }
 * ```
 */
export async function sleep(ms: number): Promise<void> {
  try {
    // Try to use Bun.sleep
    await bunSleep(ms);
  } catch {
    // Fallback to setTimeout for Node.js
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Get the Bun runtime version
 *
 * @returns Bun version or undefined if running in Node.js
 *
 * @example
 * ```typescript
 * const bunVersion = getBunVersion();
 * if (bunVersion) {
 *   console.log(`Running on Bun ${bunVersion}`);
 * }
 * ```
 */
export function getBunVersion(): string | undefined {
  if (!isBunRuntime()) {
    return undefined;
  }

  const global = globalThis as GlobalWithBun;
  return global.Bun?.version;
}

/**
 * Get the current runtime name
 *
 * @returns "bun" or "node"
 *
 * @example
 * ```typescript
 * const runtime = getRuntimeName();
 * log.i("RUNTIME", "detected", { runtime });
 * ```
 */
export function getRuntimeName(): "bun" | "node" {
  return isBunRuntime() ? "bun" : "node";
}

/**
 * Try to trigger garbage collection
 *
 * In Bun: uses Bun.gc(true) for forced full GC
 * In Node.js: no-op (gc requires --expose-gc flag)
 *
 * @param force - If true, forces synchronous full GC (Bun only)
 * @returns true if GC was triggered, false otherwise
 *
 * @example
 * ```typescript
 * // After heavy operation, try to free memory
 * tryGarbageCollect(true);
 * ```
 */
export function tryGarbageCollect(force = true): boolean {
  const global = globalThis as GlobalWithBun;

  if (isBunRuntime() && global.Bun && typeof global.Bun.gc === "function") {
    global.Bun.gc(force);
    return true;
  }

  // Node.js: try global.gc if available (--expose-gc flag)
  const nodeGlobal = globalThis as typeof globalThis & { gc?: () => void };
  if (typeof nodeGlobal.gc === "function") {
    nodeGlobal.gc();
    return true;
  }

  return false;
}
