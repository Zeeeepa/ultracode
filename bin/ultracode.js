#!/usr/bin/env node
/**
 * UltraCode - Entry Point Wrapper
 *
 * This script resolves paths and launches the Comm proxy binary.
 * Works correctly when installed via npm/bun in node_modules.
 *
 * Architecture:
 *   Claude Code → ultracode.js → ultracode.com (Comm) → Core (index.js)
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve dist directory (relative to this script)
const distDir = join(__dirname, "..", "dist");

// Comm binary name (Cosmopolitan - same binary for all platforms)
const commBinary = join(distDir, "ultracode.com");

// Core MCP server
const corePath = join(distDir, "index.js");

// Verify files exist
if (!existsSync(commBinary)) {
  console.error(`Error: Comm binary not found at ${commBinary}`);
  console.error("Run 'npm run build' or reinstall the package.");
  process.exit(1);
}

if (!existsSync(corePath)) {
  console.error(`Error: Core not found at ${corePath}`);
  console.error("Run 'npm run build' or reinstall the package.");
  process.exit(1);
}

// Set environment variable so Comm knows where Core is
// (useful if Comm can't determine path from /proc/self/exe)
process.env.ULTRACODE_CORE_PATH = corePath;
process.env.ULTRACODE_DIST_DIR = distDir;

// Forward all arguments to Comm
const args = process.argv.slice(2);

// Spawn Comm with inherited stdio (for MCP JSON-RPC over stdio)
// On macOS, APE (Actually Portable Executable) requires sh wrapper on older zsh (<5.9)
// macOS Ventura (13) ships with zsh 5.8 which doesn't support APE directly
let child;
if (platform() === "darwin") {
  // Use sh -c to execute .com file - works on all macOS versions
  const quotedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
  const cmd = quotedArgs ? `"${commBinary}" ${quotedArgs}` : `"${commBinary}"`;
  child = spawn("sh", ["-c", cmd], {
    stdio: "inherit",
    env: process.env,
  });
} else {
  child = spawn(commBinary, args, {
    stdio: "inherit",
    env: process.env,
    windowsHide: true, // Don't show console window on Windows
  });
}

child.on("error", (err) => {
  console.error(`Failed to start Comm: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
