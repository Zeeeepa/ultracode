#!/usr/bin/env node
/**
 * Post-install script for ultrascript-tools-mcp
 * Runs after npm install to guide users through optional setup
 */

import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function printBox(title, lines) {
  const width = 70;
  const border = "=".repeat(width);

  console.log(`\n${colors.cyan}${border}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${border}${colors.reset}\n`);

  for (const line of lines) {
    console.log(line);
  }

  console.log();
}

function printSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function printWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function checkRequiredFiles() {
  const requiredFiles = [
    "dist/index.js",
    "dist/external-tools/wasm/diff-simd/diff_simd.js",
    "dist/external-tools/wasm/vector-ops-simd/vector_ops_simd.js",
  ];

  const missing = requiredFiles.filter((file) => !existsSync(join(projectRoot, file)));

  return { allPresent: missing.length === 0, missing };
}

function detectPlatform() {
  const plat = platform();
  if (plat === "win32") return "Windows";
  if (plat === "darwin") return "macOS";
  if (plat === "linux") return "Linux";
  return plat;
}

function getSetupCommand() {
  const plat = platform();
  if (plat === "win32") {
    return "scripts\\setup-embeddings.cmd";
  }
  return "bash scripts/setup-embeddings.sh";
}

async function main() {
  // Skip in CI environments
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    console.log("CI environment detected, skipping interactive setup");
    return;
  }

  // Skip if --ignore-scripts was used (already skipped, but good practice)
  if (process.env.npm_config_ignore_scripts === "true") {
    return;
  }

  printBox("UltraScript Tools MCP - Installation Complete", [
    `${colors.green}${colors.bright}Thank you for installing UltraScript Tools MCP!${colors.reset}`,
    "",
    "This package provides advanced code analysis capabilities through",
    "the Model Context Protocol (MCP) with multi-agent architecture.",
  ]);

  // Check if this is a global install
  const isGlobal =
    process.env.npm_config_global === "true" || process.argv.includes("-g") || process.argv.includes("--global");

  if (isGlobal) {
    printInfo("Global installation detected");
    console.log();
  }

  // Check built files
  const { allPresent, missing } = checkRequiredFiles();

  if (allPresent) {
    printSuccess("All core modules are ready");
  } else {
    printWarning("Some modules may need building:");
    for (const file of missing) {
      console.log(`  ${colors.dim}- ${file}${colors.reset}`);
    }
    console.log();
    printInfo("These modules will be built on first use if needed");
  }

  console.log();

  // Platform info
  const plat = detectPlatform();
  printInfo(`Platform: ${plat}`);
  console.log();

  // Optional setup guide
  printBox("Optional Setup - Embeddings Provider", [
    "UltraScript Tools MCP supports optional ML-powered semantic search",
    "through local embedding providers:",
    "",
    `${colors.bright}1. TEI (Text Embeddings Inference)${colors.reset}`,
    "   • Docker-based, GPU/CPU support",
    "   • Recommended for best performance",
    "",
    `${colors.bright}2. Ollama${colors.reset}`,
    "   • Native installation, easy setup",
    "   • Good for quick start",
    "",
    `${colors.bright}3. Memory Provider${colors.reset}`,
    "   • No ML, hash-based (default)",
    "   • Works out of the box",
    "",
    `${colors.yellow}${colors.bright}Setup is optional - the tool works without embeddings!${colors.reset}`,
  ]);

  const setupCmd = getSetupCommand();

  console.log(`${colors.bright}To configure embeddings provider:${colors.reset}`);
  console.log(`  ${colors.cyan}cd node_modules/ultrascript-tools-mcp${colors.reset}`);
  console.log(`  ${colors.cyan}${setupCmd}${colors.reset}`);
  console.log();

  // Quick start
  printBox("Quick Start", [
    `${colors.bright}1. Configure MCP Client${colors.reset}`,
    "   Add to your Claude Desktop config:",
    "",
    `   ${colors.dim}"mcpServers": {${colors.reset}`,
    `   ${colors.dim}  "ultrascript-tools": {${colors.reset}`,
    `   ${colors.dim}    "command": "node",${colors.reset}`,
    `   ${colors.dim}    "args": ["node_modules/ultrascript-tools-mcp/dist/index.js"]${colors.reset}`,
    `   ${colors.dim}  }${colors.reset}`,
    `   ${colors.dim}}${colors.reset}`,
    "",
    `${colors.bright}2. Start Using${colors.reset}`,
    "   • Index your codebase: Use MCP tool 'index'",
    "   • Query code: Use MCP tool 'query'",
    "   • Semantic search: Use MCP tool 'semantic_search'",
  ]);

  // Documentation links
  console.log(`${colors.bright}Documentation:${colors.reset}`);
  console.log(`  ${colors.blue}README:${colors.reset}       node_modules/ultrascript-tools-mcp/README.md`);
  console.log(`  ${colors.blue}Performance:${colors.reset}  node_modules/ultrascript-tools-mcp/PERFORMANCE_GUIDE.md`);
  console.log(
    `  ${colors.blue}Embeddings:${colors.reset}   node_modules/ultrascript-tools-mcp/config/embedding-models.json`,
  );
  console.log();

  // Optional backends
  console.log(`${colors.dim}Optional GPU/SIMD Acceleration:${colors.reset}`);
  console.log(`  ${colors.dim}CUDA:   See CUDA_INSTALLATION.md (NVIDIA GPUs)${colors.reset}`);
  console.log(`  ${colors.dim}WebGPU: See WEBGPU_INSTALLATION.md (Cross-platform)${colors.reset}`);
  console.log(`  ${colors.dim}WASM:   Included (automatic SIMD acceleration)${colors.reset}`);
  console.log();

  // Final message
  console.log(`${colors.green}${colors.bright}Ready to analyze your codebase! 🚀${colors.reset}`);
  console.log();
}

main().catch((error) => {
  console.error("Postinstall script failed:", error);
  // Don't exit with error code - postinstall failures shouldn't break installation
  process.exit(0);
});
