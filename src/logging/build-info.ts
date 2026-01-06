/**
 * Build information provider
 * Gets git commit hash and other build metadata
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

let cachedBuildHash: string | null = null;
let cachedPid: number | null = null;

/**
 * Get current git commit hash (first 8 chars)
 * Caches result for performance
 */
export function getBuildHash(): string {
  if (cachedBuildHash !== null) {
    return cachedBuildHash;
  }

  // Try to get from git
  try {
    const hash = execSync("git rev-parse --short=8 HEAD", {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (hash && hash.length === 8) {
      cachedBuildHash = hash;
      return hash;
    }
  } catch {
    // Git not available or not in repo
  }

  // Try to get from version file (set during build)
  try {
    const versionFile = join(import.meta.dirname || process.cwd(), "..", "..", "VERSION");
    if (existsSync(versionFile)) {
      const version = readFileSync(versionFile, "utf-8").trim();
      if (version) {
        cachedBuildHash = version.slice(0, 8).padEnd(8, "0");
        return cachedBuildHash;
      }
    }
  } catch {
    // Version file not available
  }

  // Try to get from package.json version
  try {
    const pkgFile = join(import.meta.dirname || process.cwd(), "..", "..", "package.json");
    if (existsSync(pkgFile)) {
      const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
      if (pkg.version) {
        // Convert version like "1.2.3" to hash-like "01020300"
        const parts = pkg.version.split(".").map((p: string) => parseInt(p, 10) || 0);
        const hash = parts
          .map((p: number) => String(p).padStart(2, "0"))
          .join("")
          .slice(0, 8)
          .padEnd(8, "0");
        cachedBuildHash = hash;
        return hash;
      }
    }
  } catch {
    // Package.json not available
  }

  // Fallback to zeros
  cachedBuildHash = "00000000";
  return cachedBuildHash;
}

/**
 * Get current process PID
 * Caches result for performance
 */
export function getPid(): number {
  if (cachedPid !== null) {
    return cachedPid;
  }
  cachedPid = process.pid;
  return cachedPid;
}

/**
 * Set custom PID (for workers)
 */
export function setPid(pid: number): void {
  cachedPid = pid;
}

/**
 * Reset cached values (for testing)
 */
export function resetBuildInfo(): void {
  cachedBuildHash = null;
  cachedPid = null;
}

/**
 * Get build info object
 */
export function getBuildInfo(): { hash: string; pid: number } {
  return {
    hash: getBuildHash(),
    pid: getPid(),
  };
}
