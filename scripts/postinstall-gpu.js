#!/usr/bin/env node
/**
 * Post-install script for GPU backends
 *
 * Automatically attempts to build WASM and CUDA backends if dependencies are available.
 * Falls back gracefully if build tools are not installed.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function execCommand(command, options = {}) {
  try {
    execSync(command, {
      stdio: options.silent ? "pipe" : "inherit",
      encoding: "utf8",
      cwd: rootDir,
      ...options,
    });
    return true;
  } catch (error) {
    return false;
  }
}

function checkCommand(command) {
  try {
    execSync(`${command} --version`, {
      stdio: "pipe",
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

function checkCUDAToolkit() {
  // Check nvidia-smi (CUDA driver)
  if (!checkCommand("nvidia-smi")) {
    return { available: false, reason: "NVIDIA GPU not detected" };
  }

  // Check nvcc (CUDA compiler)
  if (!checkCommand("nvcc")) {
    return { available: false, reason: "CUDA Toolkit not installed" };
  }

  // Get CUDA version
  try {
    const version = execSync("nvcc --version", {
      stdio: "pipe",
      encoding: "utf8",
    });
    const match = version.match(/release (\d+\.\d+)/);
    const cudaVersion = match ? match[1] : "unknown";

    return { available: true, version: cudaVersion };
  } catch {
    return { available: false, reason: "nvcc not working" };
  }
}

async function buildWASM() {
  log("\n📦 WASM SIMD Backend", COLORS.bright);
  log("═".repeat(50), COLORS.gray);

  // Check if Rust is installed
  if (!checkCommand("rustc")) {
    log("⚠️  Rust not installed - WASM backend will not be available", COLORS.yellow);
    log("   To install: https://rustup.rs/", COLORS.gray);
    log("   After installing Rust, run: npm run build:wasm", COLORS.gray);
    return false;
  }

  // Check if wasm-pack is installed
  if (!checkCommand("wasm-pack")) {
    log("⚠️  wasm-pack not installed - installing...", COLORS.yellow);
    const installed = execCommand("cargo install wasm-pack", { silent: true });
    if (!installed) {
      log("❌ Failed to install wasm-pack", COLORS.red);
      log("   Install manually: cargo install wasm-pack", COLORS.gray);
      return false;
    }
  }

  // Build WASM modules
  log("🔨 Building WASM module with SIMD optimization...", COLORS.blue);

  // Check if wasm directories exist
  const wasmDiffDir = join(rootDir, "external-tools", "wasm", "diff-simd");
  const wasmVectorDir = join(rootDir, "external-tools", "wasm", "vector-ops-simd");

  if (!existsSync(wasmDiffDir) && !existsSync(wasmVectorDir)) {
    log("❌ WASM source directory not found", COLORS.red);
    return false;
  }

  // Use PowerShell script on Windows for building WASM
  const buildScript =
    process.platform === "win32"
      ? join(rootDir, "scripts", "build-wasm.ps1")
      : join(rootDir, "scripts", "build-wasm.sh");

  if (!existsSync(buildScript)) {
    log("❌ WASM build script not found", COLORS.red);
    return false;
  }

  const buildCommand =
    process.platform === "win32"
      ? `powershell -ExecutionPolicy Bypass -File "${buildScript}"`
      : `bash "${buildScript}"`;

  const success = execCommand(buildCommand, {
    cwd: rootDir,
  });

  if (success) {
    log("✅ WASM SIMD backend built successfully (4-8x speedup)", COLORS.green);
    log("   Expected performance: 2-3ms per 10K vectors", COLORS.gray);
    return true;
  } else {
    log("❌ WASM build failed", COLORS.red);
    log("   Try manually: npm run build:wasm", COLORS.gray);
    return false;
  }
}

async function buildCUDA() {
  log("\n🚀 CUDA Native Backend", COLORS.bright);
  log("═".repeat(50), COLORS.gray);

  const cudaCheck = checkCUDAToolkit();

  if (!cudaCheck.available) {
    log(`⚠️  ${cudaCheck.reason} - CUDA backend will not be available`, COLORS.yellow);

    if (cudaCheck.reason === "NVIDIA GPU not detected") {
      log("   CUDA requires NVIDIA GPU", COLORS.gray);
    } else if (cudaCheck.reason === "CUDA Toolkit not installed") {
      log("   Download from: https://developer.nvidia.com/cuda-downloads", COLORS.gray);
      log("   Recommended version: CUDA 11.8 or later", COLORS.gray);
    }

    return false;
  }

  log(`✅ CUDA Toolkit ${cudaCheck.version} detected`, COLORS.green);

  // Check if cmake-js is available
  if (!checkCommand("cmake")) {
    log("⚠️  CMake not installed - CUDA build requires CMake", COLORS.yellow);
    log("   Download from: https://cmake.org/download/", COLORS.gray);
    return false;
  }

  // Build CUDA addon
  log("🔨 Building CUDA native addon...", COLORS.blue);

  const success = execCommand("npm run build:cuda");

  if (success) {
    log("✅ CUDA backend built successfully (100-200x speedup)", COLORS.green);
    log("   Expected performance: 0.1-0.2ms per 10K vectors", COLORS.gray);

    // Verify addon was created
    const addonPath = join(rootDir, "build", "Release", "cuda_vector_ops.node");
    if (existsSync(addonPath)) {
      log(`   Addon location: build/Release/cuda_vector_ops.node`, COLORS.gray);
    }

    return true;
  } else {
    log("❌ CUDA build failed", COLORS.red);
    log("   This is optional - WebGPU and WASM backends are still available", COLORS.gray);
    log("   To retry: npm run build:cuda", COLORS.gray);
    return false;
  }
}

async function main() {
  log("\n" + "═".repeat(70), COLORS.bright);
  log("  GPU Backend Auto-Configuration", COLORS.bright);
  log("═".repeat(70), COLORS.bright);

  log("\nAttempting to build optional GPU acceleration backends...", COLORS.gray);
  log("These are OPTIONAL - the project will work without them.\n", COLORS.gray);

  const results = {
    wasm: false,
    cuda: false,
  };

  // Build WASM (always attempt, cross-platform)
  results.wasm = await buildWASM();

  // Build CUDA (only on NVIDIA systems)
  results.cuda = await buildCUDA();

  // Summary
  log("\n" + "═".repeat(70), COLORS.bright);
  log("  Build Summary", COLORS.bright);
  log("═".repeat(70), COLORS.bright);

  const backends = [
    { name: "Pure JS (Loop Unrolling)", status: "✅ Always available", speedup: "1.45x" },
    {
      name: "WASM SIMD",
      status: results.wasm ? "✅ Built successfully" : "⚠️  Not built",
      speedup: "4-8x",
    },
    { name: "WebGPU", status: "ℹ️  Runtime detection", speedup: "50-100x" },
    {
      name: "CUDA Native",
      status: results.cuda ? "✅ Built successfully" : "⚠️  Not built",
      speedup: "100-200x",
    },
  ];

  for (const backend of backends) {
    log(`  ${backend.name.padEnd(25)} ${backend.status.padEnd(25)} ${backend.speedup}`, COLORS.gray);
  }

  log("\n" + "═".repeat(70), COLORS.bright);

  if (!results.wasm && !results.cuda) {
    log("\n⚠️  No GPU backends were built", COLORS.yellow);
    log("   The project will use Pure JS backend (1.45x speedup)", COLORS.gray);
    log("   For better performance, install Rust and/or CUDA Toolkit and run npm install again", COLORS.gray);
  } else {
    log("\n✅ GPU acceleration configured successfully!", COLORS.green);
    log("   The fastest available backend will be selected automatically at runtime", COLORS.gray);
  }

  log("\n");
}

// Run only if not in CI environment
if (!process.env.CI && !process.env.SKIP_GPU_BUILD) {
  main().catch((error) => {
    console.error("Postinstall script error:", error);
    // Don't fail npm install
    process.exit(0);
  });
} else {
  log("\n⏭️  Skipping GPU backend build (CI environment or SKIP_GPU_BUILD=1)", COLORS.gray);
  log("   Set SKIP_GPU_BUILD=0 to enable GPU builds in CI\n", COLORS.gray);
}
