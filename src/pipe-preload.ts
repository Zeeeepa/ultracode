#!/usr/bin/env node
/**
 * Pipe mode preload - MUST run BEFORE any imports
 *
 * This script:
 * 1. Sets MCP_QUIET_MODE env variable
 * 2. Overrides console.* methods to suppress output
 * 3. Injects --pipe into argv
 * 4. Dynamically imports the main index.ts
 *
 * Usage: node dist/pipe-preload.js [args...]
 * Or: bun dist/pipe-preload.js [args...]
 *
 * The --pipe flag is automatically added - don't pass it manually.
 */

// Step 1: Set environment variable BEFORE any imports
process.env["MCP_QUIET_MODE"] = "true";

// Step 2: Inject --pipe into argv if not already present
if (!process.argv.includes("--pipe")) {
  // Insert --pipe after the script name (argv[1])
  process.argv.splice(2, 0, "--pipe");
}

// Step 3: Override console methods globally BEFORE any imports
const originalConsole = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

// Suppress all console output (write to file via logger instead)
console.error = () => {};
console.warn = () => {};
console.log = () => {};
console.info = () => {};
console.debug = () => {};

// Store original console for emergency use
(globalThis as any).__originalConsole = originalConsole;

// Step 4: Now import the main module (after console is suppressed)
// Use import.meta.url to resolve path relative to this file, not cwd
const indexPath = new URL("./index.js", import.meta.url).href;
import(indexPath).catch((err) => {
  // Restore console for error reporting
  console.error = originalConsole.error;
  console.error("[FATAL] Failed to load index.js:", err);
  process.exit(1);
});
