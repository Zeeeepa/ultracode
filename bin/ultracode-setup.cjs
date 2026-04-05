#!/usr/bin/env node
/**
 * ultracode-setup — Cross-runtime setup launcher
 *
 * Detects whether installed via npm or bun and resolves the correct
 * setup-command.js path. Handles PATH conflicts when both npm and bun
 * have ultracode installed globally.
 */

const { existsSync } = require("node:fs");
const { join, dirname } = require("node:path");
const { execSync } = require("node:child_process");
const { platform } = require("node:os");

// 1. Try relative path (same package installation)
const relPath = join(__dirname, "..", "dist", "cli", "setup-command.js");
if (existsSync(relPath)) {
  runSetup(relPath);
} else {
  // 2. Try npm global root
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const npmPath = join(npmRoot, "ultracode", "dist", "cli", "setup-command.js");
    if (existsSync(npmPath)) {
      runSetup(npmPath);
    } else {
      tryBunPath();
    }
  } catch {
    tryBunPath();
  }
}

function tryBunPath() {
  // 3. Try bun global path
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const bunPath = platform() === "win32"
    ? join(home, ".bun", "install", "global", "node_modules", "ultracode", "dist", "cli", "setup-command.js")
    : join(home, ".bun", "install", "global", "node_modules", "ultracode", "dist", "cli", "setup-command.js");

  if (existsSync(bunPath)) {
    runSetup(bunPath);
  } else {
    console.error("Error: ultracode setup-command.js not found.");
    console.error("Try: npm install -g ultracode  OR  bun i -g ultracode --trust");
    process.exit(1);
  }
}

function runSetup(scriptPath) {
  // Use dynamic import for ESM module
  import("file://" + scriptPath.replace(/\\/g, "/")).catch((err) => {
    console.error("Setup failed:", err.message);
    process.exit(1);
  });
}
