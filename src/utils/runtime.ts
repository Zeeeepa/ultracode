/**
 * Runtime Detection and Feature Flags
 *
 * Provides utilities for detecting the current JavaScript runtime (Bun vs Node.js)
 * and checking availability of runtime-specific features.
 *
 * Usage:
 *   import { runtime, features } from "./runtime.js";
 *   if (runtime.isBun) { ... }
 *   if (features.bunFile) { await Bun.file(path).text(); }
 */

// =============================================================================
// RUNTIME DETECTION
// =============================================================================

/**
 * Check if running under Bun runtime
 */
export function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== "undefined";
}

/**
 * Check if running under Node.js runtime
 */
export function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions !== "undefined" &&
    typeof process.versions.node !== "undefined" &&
    !isBunRuntime()
  );
}

/**
 * Check if running under Deno runtime
 */
export function isDenoRuntime(): boolean {
  return typeof (globalThis as any).Deno !== "undefined";
}

/**
 * Runtime information object
 */
export const runtime = {
  /** True if running under Bun */
  get isBun(): boolean {
    return isBunRuntime();
  },

  /** True if running under Node.js */
  get isNode(): boolean {
    return isNodeRuntime();
  },

  /** True if running under Deno */
  get isDeno(): boolean {
    return isDenoRuntime();
  },

  /** Runtime name: "bun", "node", "deno", or "unknown" */
  get name(): "bun" | "node" | "deno" | "unknown" {
    if (isBunRuntime()) return "bun";
    if (isNodeRuntime()) return "node";
    if (isDenoRuntime()) return "deno";
    return "unknown";
  },

  /** Runtime version string */
  get version(): string {
    if (isBunRuntime()) {
      return globalThis.Bun?.version ?? "unknown";
    }
    if (isNodeRuntime()) {
      return process.versions.node;
    }
    if (isDenoRuntime()) {
      return (globalThis as any).Deno?.version?.deno ?? "unknown";
    }
    return "unknown";
  },

  /** Full version info */
  get versionInfo(): { runtime: string; version: string; v8?: string } {
    const info: { runtime: string; version: string; v8?: string } = {
      runtime: this.name,
      version: this.version,
    };

    if (isNodeRuntime() && process.versions.v8) {
      info.v8 = process.versions.v8;
    }

    return info;
  },
} as const;

// =============================================================================
// FEATURE DETECTION
// =============================================================================

/**
 * Feature flags for runtime-specific APIs
 */
export const features = {
  /** Bun.file() API for optimized file operations */
  get bunFile(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.file === "function";
  },

  /** Bun.write() API for optimized file writing */
  get bunWrite(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.write === "function";
  },

  /** Bun.Glob for native glob support */
  get bunGlob(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.Glob === "function";
  },

  /** Bun shell ($) for command execution */
  get bunShell(): boolean {
    return isBunRuntime();
  },

  /** bun:sqlite native SQLite support */
  get bunSqlite(): boolean {
    return isBunRuntime();
  },

  /** Bun.password for password hashing */
  get bunPassword(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.password !== "undefined";
  },

  /** Bun.hash for fast hashing */
  get bunHash(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.hash === "function";
  },

  /** Bun compression (gzip, deflate) */
  get bunCompression(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.gzipSync === "function";
  },

  /** Bun.YAML for YAML parsing */
  get bunYaml(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.YAML !== "undefined";
  },

  /** Bun.sleep/sleepSync */
  get bunSleep(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.sleep === "function";
  },

  /** Bun.randomUUIDv7 for time-sortable UUIDs */
  get bunUuid(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.randomUUIDv7 === "function";
  },

  /** Bun.semver for semver comparison */
  get bunSemver(): boolean {
    return isBunRuntime() && typeof globalThis.Bun?.semver !== "undefined";
  },
} as const;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get a human-readable runtime description
 */
export function getRuntimeDescription(): string {
  const { name, version } = runtime;
  return `${name} v${version}`;
}

/**
 * Log runtime info (useful for debugging)
 */
export function logRuntimeInfo(): void {
  const info = runtime.versionInfo;
  console.error(`[Runtime] ${info.runtime} v${info.version}${info.v8 ? ` (V8: ${info.v8})` : ""}`);

  if (runtime.isBun) {
    const enabledFeatures = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name.replace("bun", "").toLowerCase())
      .join(", ");
    console.error(`[Runtime] Bun features: ${enabledFeatures}`);
  }
}

// =============================================================================
// CONDITIONAL IMPORTS HELPER
// =============================================================================

/**
 * Helper for conditional module imports based on runtime
 *
 * @example
 * const sqlite = await importForRuntime({
 *   bun: () => import("bun:sqlite"),
 *   node: () => import("better-sqlite3"),
 * });
 */
export async function importForRuntime<T>(options: {
  bun?: () => Promise<T>;
  node?: () => Promise<T>;
  fallback?: () => Promise<T>;
}): Promise<T> {
  if (runtime.isBun && options.bun) {
    return options.bun();
  }
  if (runtime.isNode && options.node) {
    return options.node();
  }
  if (options.fallback) {
    return options.fallback();
  }
  throw new Error(`No import handler for runtime: ${runtime.name}`);
}

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * High-resolution timestamp (Bun.nanoseconds or process.hrtime)
 */
export function hrtime(): bigint {
  if (runtime.isBun && typeof (globalThis.Bun as any)?.nanoseconds === "function") {
    return BigInt((globalThis.Bun as any).nanoseconds());
  }
  // Node.js fallback
  const [sec, nsec] = process.hrtime();
  return BigInt(sec) * 1_000_000_000n + BigInt(nsec);
}

/**
 * Sleep for specified milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  if (features.bunSleep) {
    return globalThis.Bun!.sleep(ms);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate UUID (v7 if Bun, v4 fallback)
 */
export function randomUUID(): string {
  if (features.bunUuid) {
    return globalThis.Bun!.randomUUIDv7();
  }
  // Node.js crypto.randomUUID
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
