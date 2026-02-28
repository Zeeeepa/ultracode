#!/usr/bin/env bun
/**
 * Bun Proxy for UltraCode Server
 *
 * Lightweight proxy that runs under Claude's Bun and spawns the actual
 * MCP server in a separate Bun process. This isolates the server from
 * Claude's embedded Bun environment.
 *
 * This script:
 * 1. Spawns `bun index.js` as separate child process
 * 2. Proxies stdin → child.stdin
 * 3. Proxies child.stdout → stdout
 * 4. Discards child.stderr (prevents JSON-RPC corruption)
 *
 * Usage in Claude config:
 * {
 *   "command": "bun",
 *   "args": ["D:\\path\\to\\dist\\bun-proxy.js", "."]
 * }
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Get directory of this script
const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the actual MCP server entry point
const serverPath = join(__dirname, "index.js");

// Forward all args
const args = [serverPath, ...process.argv.slice(2)];

// Spawn Bun with our MCP server
const child = spawn("bun", args, {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: process.cwd(),
  env: process.env,
});

// Proxy stdin → child
process.stdin.pipe(child.stdin);

// Proxy child.stdout → stdout (JSON-RPC messages)
child.stdout.pipe(process.stdout);

// Discard stderr - it would corrupt JSON-RPC protocol
child.stderr.on("data", () => {});

// Handle child exit
child.on("exit", (code) => {
  process.exit(code ?? 0);
});

// Handle errors (silent - can't use console.error, it corrupts JSON-RPC)
child.on("error", () => {
  process.exit(1);
});

// Handle signals
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
