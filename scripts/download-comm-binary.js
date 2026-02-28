#!/usr/bin/env node
/**
 * Download pre-built ultracode.com binary
 *
 * This script downloads the Cosmopolitan portable binary from GitHub releases.
 * The binary works on Windows, Linux, macOS, FreeBSD, NetBSD, OpenBSD - all from one file!
 */

import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");
const OUTPUT_FILE = join(DIST_DIR, "ultracode.com");

// GitHub release URL (update version as needed)
const VERSION = "1.0.0";
const RELEASE_URL = `https://github.com/faxenoff/ultracode/releases/download/v${VERSION}/ultracode.com`;

// Alternative: build from source if binary not available
const SOURCE_FILE = join(__dirname, "..", "src", "comm", "ultracode.com");

function log(msg) {
  console.log(`[comm-binary] ${msg}`);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);

    const request = (url) => {
      get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          log(`Redirecting to: ${redirectUrl}`);
          request(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", (err) => {
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  // Create dist directory if needed
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Check if binary already exists
  if (existsSync(OUTPUT_FILE)) {
    log("ultracode.com already exists, skipping download");
    return;
  }

  // Check if source binary exists (local build)
  if (existsSync(SOURCE_FILE)) {
    log(`Copying from source: ${SOURCE_FILE}`);
    const { copyFileSync } = await import("node:fs");
    copyFileSync(SOURCE_FILE, OUTPUT_FILE);
    chmodSync(OUTPUT_FILE, 0o755);
    log("Copied successfully!");
    return;
  }

  // Download from GitHub releases
  log(`Downloading ultracode.com v${VERSION}...`);
  log(`URL: ${RELEASE_URL}`);

  try {
    await downloadFile(RELEASE_URL, OUTPUT_FILE);
    chmodSync(OUTPUT_FILE, 0o755);
    log("Download complete!");
  } catch (error) {
    log(`Warning: Could not download binary: ${error.message}`);
    log("You can build it manually:");
    log("  cd src/comm && ./setup.ps1 && ./build.ps1");
    log("Or use the TypeScript proxy instead (requires Node.js)");
    // Don't fail - the TypeScript commer still works
  }
}

main().catch((err) => {
  console.error("[comm-binary] Error:", err);
  // Don't exit with error - optional binary
});
