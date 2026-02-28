#!/usr/bin/env node

/**
 * Post-install script for ultracode
 *
 * - CUDA libraries (win32/linux) are bundled in npm package
 * - For Apple Silicon: offers to build Metal backend
 * - For Intel Mac: WASM fallback is used (bundled)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import * as readline from "node:readline";
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
  red: "\x1b[31m",
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

function _printWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function printError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function isAppleSilicon() {
  return platform() === "darwin" && arch() === "arm64";
}

function isIntelMac() {
  return platform() === "darwin" && arch() === "x64";
}

function checkMetalLibExists() {
  const metalPath = join(projectRoot, "external-libs", "metal-darwin-arm64", "ultracode_metal.node");
  return existsSync(metalPath);
}

function checkCudaLibExists() {
  const plat = platform();
  if (plat === "win32") {
    return existsSync(join(projectRoot, "external-libs", "cuda-win32-x64", "ultracode_cuda.node"));
  }
  if (plat === "linux") {
    return existsSync(join(projectRoot, "external-libs", "cuda-linux-x64", "ultracode_cuda.node"));
  }
  return false;
}

async function askYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      rl.close();
      resolve(false);
      return;
    }

    rl.question(`${question} [y/N]: `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function askSkip(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      rl.close();
      resolve(false); // Don't skip - run by default in non-TTY
      return;
    }

    rl.question(`${question} [Y/n]: `, (answer) => {
      rl.close();
      const skip = answer.toLowerCase() === "n" || answer.toLowerCase() === "no" || answer.toLowerCase() === "s";
      resolve(skip);
    });
  });
}

async function buildMetalBackend() {
  printInfo("Building Metal backend for Apple Silicon...");
  console.log();

  const buildScript = join(projectRoot, "scripts", "build-native-libs-macos.sh");

  if (!existsSync(buildScript)) {
    printError("Build script not found: scripts/build-native-libs-macos.sh");
    return false;
  }

  // Run non-interactively with option 1 (Metal)
  const result = spawnSync("bash", ["-c", `echo "1" | bash "${buildScript}"`], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit",
    timeout: 600000, // 10 minutes
  });

  if (result.status === 0 && checkMetalLibExists()) {
    printSuccess("Metal backend built successfully!");
    return true;
  }

  printError("Metal backend build failed");
  return false;
}

async function handleAppleSilicon() {
  // Check if Metal lib already exists
  if (checkMetalLibExists()) {
    printSuccess("Metal GPU acceleration library found");
    return;
  }

  printBox("Apple Silicon Detected", [
    "Your Mac has an Apple Silicon chip (M1/M2/M3/M4).",
    "",
    "UltraCode can use Metal for GPU-accelerated vector operations.",
    "This provides significantly faster semantic search.",
    "",
    `${colors.bright}Requirements to build Metal backend:${colors.reset}`,
    "  • Xcode Command Line Tools (xcode-select --install)",
    "  • Homebrew (https://brew.sh)",
    "  • CMake (brew install cmake)",
    "",
    `${colors.dim}Without Metal, WASM SIMD fallback will be used (slower).${colors.reset}`,
  ]);

  const shouldBuild = await askYesNo("Build Metal backend now?");

  if (shouldBuild) {
    console.log();
    const success = await buildMetalBackend();
    if (!success) {
      console.log();
      printInfo("You can build later by running:");
      console.log(`  ${colors.cyan}./node_modules/ultracode/scripts/build-native-libs-macos.sh${colors.reset}`);
    }
  } else {
    printInfo("Skipping Metal build. Using WASM SIMD fallback.");
    printInfo("You can build later by running:");
    console.log(`  ${colors.cyan}./node_modules/ultracode/scripts/build-native-libs-macos.sh${colors.reset}`);
  }
}

function detectPlatformInfo() {
  const plat = platform();
  const architecture = arch();

  if (plat === "win32") {
    return { name: "Windows", hasGPU: checkCudaLibExists(), gpuType: "CUDA" };
  }
  if (plat === "linux") {
    return { name: "Linux", hasGPU: checkCudaLibExists(), gpuType: "CUDA" };
  }
  if (plat === "darwin") {
    if (architecture === "arm64") {
      return { name: "macOS (Apple Silicon)", hasGPU: checkMetalLibExists(), gpuType: "Metal" };
    }
    return { name: "macOS (Intel)", hasGPU: false, gpuType: "None (WASM fallback)" };
  }
  return { name: plat, hasGPU: false, gpuType: "Unknown" };
}

async function main() {
  // Skip in CI environments
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    console.log("CI environment detected, skipping interactive setup");
    return;
  }

  // Skip if explicitly requested
  if (process.env.ULTRACODE_SKIP_POSTINSTALL === "1") {
    return;
  }

  const platformInfo = detectPlatformInfo();

  printBox("UltraCode - Installed", [
    `${colors.green}${colors.bright}Thank you for installing UltraCode!${colors.reset}`,
    "",
    `Platform: ${platformInfo.name}`,
    `GPU Acceleration: ${platformInfo.hasGPU ? colors.green + "Available" : colors.yellow + "Not available"} (${platformInfo.gpuType})${colors.reset}`,
  ]);

  // Handle Apple Silicon - offer to build Metal
  if (isAppleSilicon()) {
    await handleAppleSilicon();
    console.log();
  } else if (isIntelMac()) {
    printInfo("Intel Mac detected - using WASM SIMD acceleration (GPU not available)");
    console.log();
  } else if (platformInfo.hasGPU) {
    printSuccess(`${platformInfo.gpuType} GPU acceleration library bundled and ready`);
    console.log();
  }

  // Quick start
  printBox("Quick Start", [
    `${colors.bright}Configure your MCP client (e.g., Claude Desktop):${colors.reset}`,
    "",
    `${colors.dim}"mcpServers": {${colors.reset}`,
    `${colors.dim}  "ultracode": {${colors.reset}`,
    `${colors.dim}    "command": "node",${colors.reset}`,
    `${colors.dim}    "args": ["node_modules/ultracode/dist/index.js"]${colors.reset}`,
    `${colors.dim}  }${colors.reset}`,
    `${colors.dim}}${colors.reset}`,
    "",
    `${colors.bright}Available tools:${colors.reset} index, query, semantic_search, modify_code, ...`,
  ]);

  // Run setup wizard
  await runSetupWizard();

  console.log(`${colors.green}${colors.bright}Ready to use! 🚀${colors.reset}`);
  console.log();
}

async function runSetupWizard() {
  // Skip if not interactive
  if (!process.stdin.isTTY) {
    printInfo("Non-interactive mode - skipping setup wizard");
    printInfo("Run setup manually: npx ultracode-setup");
    return;
  }

  const shouldSkip = await askSkip("Run setup wizard to configure semantic search?");

  if (shouldSkip) {
    printInfo("Skipping setup. Run later with: npx ultracode-setup");
    return;
  }

  console.log();
  printInfo("Starting setup wizard...");
  console.log();

  // Determine setup script path
  const setupScript =
    platform() === "win32" ? join(projectRoot, "scripts", "setup.cmd") : join(projectRoot, "scripts", "setup.sh");

  if (!existsSync(setupScript)) {
    // Fallback to running setup-command.js directly
    const setupJs = join(projectRoot, "dist", "cli", "setup-command.js");
    if (existsSync(setupJs)) {
      const result = spawnSync("node", [setupJs], {
        cwd: projectRoot,
        stdio: "inherit",
      });
      if (result.status !== 0) {
        printError("Setup wizard failed");
      }
    } else {
      printError("Setup script not found");
    }
    return;
  }

  // Run platform-specific setup script
  if (platform() === "win32") {
    spawnSync("cmd", ["/c", setupScript], {
      cwd: projectRoot,
      stdio: "inherit",
    });
  } else {
    spawnSync("bash", [setupScript], {
      cwd: projectRoot,
      stdio: "inherit",
    });
  }
}

main().catch((error) => {
  console.error("Postinstall script error:", error.message);
  // Don't exit with error - postinstall failures shouldn't break npm install
  process.exit(0);
});
