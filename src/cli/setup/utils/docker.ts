/**
 * Docker Utilities
 *
 * Docker detection and management functions.
 */

import { spawnSync } from "node:child_process";
import { c } from "../setup-ui.js";

export function checkDocker(): boolean {
  try {
    // Try docker info first (requires daemon running)
    const result = spawnSync("docker", ["info"], {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
      windowsHide: true,
    });

    if (result.status === 0) {
      console.error("[DEBUG] docker info succeeded");
      return true;
    }

    console.error(`[DEBUG] docker info failed: status=${result.status}`);
    if (result.stderr) {
      console.error(`[DEBUG] docker info stderr: ${result.stderr.slice(0, 300)}`);
    }

    // Fallback: try docker --version (works even if daemon is stopped)
    const versionResult = spawnSync("docker", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
      windowsHide: true,
    });

    if (versionResult.status === 0) {
      console.error("[DEBUG] Docker found but daemon may not be running");
      console.error(`[DEBUG] docker --version: ${versionResult.stdout?.trim()}`);
      return true;
    }

    return false;
  } catch (e: any) {
    console.error(`[DEBUG] checkDocker exception: ${e.message}`);
    return false;
  }
}

export function checkOllama(): boolean {
  // Try up to 3 times with increasing timeout (Ollama may be busy pulling/serving)
  const timeouts = [5000, 15000, 30000];

  for (let i = 0; i < timeouts.length; i++) {
    try {
      const result = spawnSync("ollama", ["--version"], {
        encoding: "utf-8",
        timeout: timeouts[i],
        stdio: "pipe",
        windowsHide: true,
      });

      if (result.status === 0) {
        return true;
      }

      // If not timeout error, don't retry
      if (!result.error?.message?.includes("ETIMEDOUT") && !result.error?.message?.includes("TIMEOUT")) {
        console.error(
          `${c.dim}[DEBUG] ollama --version: status=${result.status}, error=${result.error}, stderr=${result.stderr}${c.reset}`,
        );
        return false;
      }

      // Timeout - Ollama might be busy, retry with longer timeout
      if (i < timeouts.length - 1) {
        console.error(
          `${c.dim}[DEBUG] ollama timeout (${timeouts[i]}ms), retrying with ${timeouts[i + 1]}ms...${c.reset}`,
        );
      }
    } catch (e) {
      console.error(`${c.dim}[DEBUG] checkOllama exception: ${e}${c.reset}`);
      return false;
    }
  }

  console.error(`${c.dim}[DEBUG] ollama --version: all retries timed out (Ollama may be busy)${c.reset}`);
  return false;
}
