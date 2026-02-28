#!/usr/bin/env node

/**
 * UltraCode - Native Libraries Downloader
 *
 * Downloads pre-built native libraries from GitHub releases.
 * Falls back to manual build instructions if binaries are not available.
 *
 * Supported platforms:
 * - Windows x64: cuda-win32-x64/ultracode_cuda.node
 * - Linux x64:   cuda-linux-x64/ultracode_cuda.node
 * - macOS ARM:   metal-darwin-arm64/ultracode_metal.node
 */

import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Configuration
const GITHUB_REPO = "faxenoff/ultracode";
const NATIVE_LIBS_DIR = join(projectRoot, "external-libs");

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

function printStep(message) {
  console.log(`\n${colors.cyan}[${colors.bold}NATIVE${colors.reset}${colors.cyan}]${colors.reset} ${message}`);
}

function printSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function printError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function printWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

/**
 * Get platform-specific library info
 */
function getLibraryInfo() {
  const plat = platform();
  const architecture = arch();

  if (plat === "win32" && architecture === "x64") {
    return {
      platform: "win32",
      arch: "x64",
      libraryName: "ultracode_cuda.node",
      folder: "cuda-win32-x64",
      type: "cuda",
      buildCommand: "scripts\\build-cuda-x64.bat",
    };
  }

  if (plat === "linux" && architecture === "x64") {
    return {
      platform: "linux",
      arch: "x64",
      libraryName: "ultracode_cuda.node",
      folder: "cuda-linux-x64",
      type: "cuda",
      buildCommand: "bash scripts/build-linux-wsl.sh",
    };
  }

  if (plat === "darwin" && architecture === "arm64") {
    return {
      platform: "darwin",
      arch: "arm64",
      libraryName: "ultracode_metal.node",
      folder: "metal-darwin-arm64",
      type: "metal",
      buildCommand: "./scripts/build-native-libs-macos.sh",
    };
  }

  if (plat === "darwin" && architecture === "x64") {
    return {
      platform: "darwin",
      arch: "x64",
      libraryName: null, // No CUDA on Intel Macs
      folder: null,
      type: "none",
      buildCommand: null,
    };
  }

  return {
    platform: plat,
    arch: architecture,
    libraryName: null,
    folder: null,
    type: "unsupported",
    buildCommand: null,
  };
}

/**
 * Fetch JSON from URL
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "ultracode",
        Accept: "application/vnd.github.v3+json",
      },
    };

    httpsGet(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        fetchJson(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
      response.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Download file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "ultracode",
        Accept: "application/octet-stream",
      },
    };

    httpsGet(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const file = createWriteStream(destPath);
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });

      file.on("error", (err) => {
        unlinkSync(destPath);
        reject(err);
      });
    }).on("error", reject);
  });
}

/**
 * Download and extract .tar.gz file
 */
function downloadAndExtract(url, destDir) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "ultracode",
        Accept: "application/octet-stream",
      },
    };

    httpsGet(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadAndExtract(response.headers.location, destDir).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      // Use tar module if available, otherwise save as-is
      const tempFile = join(destDir, "_temp_download.tar.gz");
      const file = createWriteStream(tempFile);

      response.pipe(createGunzip()).pipe(file);

      file.on("finish", async () => {
        file.close();
        // Extract tar (need external command or tar module)
        try {
          const { execSync } = await import("node:child_process");
          execSync(`tar -xf "${tempFile}" -C "${destDir}"`, { stdio: "pipe" });
          unlinkSync(tempFile);
          resolve();
        } catch {
          // If tar fails, keep the gzipped file
          printWarning("Could not extract archive, keeping compressed file");
          resolve();
        }
      });

      file.on("error", (err) => {
        if (existsSync(tempFile)) unlinkSync(tempFile);
        reject(err);
      });
    }).on("error", reject);
  });
}

/**
 * Get latest release info from GitHub
 */
async function getLatestRelease() {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

  try {
    return await fetchJson(url);
  } catch (err) {
    // Try releases endpoint if latest not found
    const releasesUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
    const releases = await fetchJson(releasesUrl);
    if (releases && releases.length > 0) {
      return releases[0];
    }
    throw err;
  }
}

/**
 * Find asset for current platform
 */
function findAsset(release, libInfo) {
  if (!release.assets || !libInfo.folder) return null;

  // Look for platform-specific asset
  const patterns = [
    `native-libs-${libInfo.folder}.tar.gz`,
    `${libInfo.folder}.tar.gz`,
    `${libInfo.folder}.zip`,
    libInfo.libraryName,
  ];

  for (const pattern of patterns) {
    const asset = release.assets.find((a) => a.name === pattern || a.name.includes(libInfo.folder));
    if (asset) return asset;
  }

  return null;
}

/**
 * Check if library already exists
 */
function libraryExists(libInfo) {
  if (!libInfo.folder || !libInfo.libraryName) return false;

  const libPath = join(NATIVE_LIBS_DIR, libInfo.folder, libInfo.libraryName);
  return existsSync(libPath);
}

/**
 * Print build instructions
 */
function printBuildInstructions(libInfo) {
  console.log("");
  printInfo("Pre-built native library not available for your platform.");
  console.log("");

  if (libInfo.type === "cuda") {
    console.log(`${colors.bold}To build CUDA acceleration manually:${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}Prerequisites:${colors.reset}`);
    console.log("  - CUDA Toolkit 11.x+ (https://developer.nvidia.com/cuda-downloads)");
    if (libInfo.platform === "win32") {
      console.log("  - Visual Studio Build Tools 2019+ with C++ workload");
      console.log("  - CMake 3.18+");
    } else {
      console.log("  - GCC/Clang with C++17 support");
      console.log("  - CMake 3.18+");
    }
    console.log("");
    console.log(`${colors.cyan}Build command:${colors.reset}`);
    console.log(`  ${colors.bold}${libInfo.buildCommand}${colors.reset}`);
  } else if (libInfo.type === "metal") {
    console.log(`${colors.bold}To build Metal acceleration manually:${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}Prerequisites:${colors.reset}`);
    console.log("  - Xcode Command Line Tools (xcode-select --install)");
    console.log("  - CMake 3.18+");
    console.log("");
    console.log(`${colors.cyan}Build command:${colors.reset}`);
    console.log(`  ${colors.bold}${libInfo.buildCommand}${colors.reset}`);
  } else if (libInfo.type === "none") {
    console.log(
      `${colors.dim}No native GPU acceleration available for ${libInfo.platform}-${libInfo.arch}.${colors.reset}`,
    );
    console.log(`${colors.dim}Using WASM SIMD fallback (still fast!).${colors.reset}`);
  }

  console.log("");
  printInfo("UltraCode works without native libraries - just slower for large codebases.");
  console.log("");
}

/**
 * Main function
 */
async function main() {
  // Skip in CI
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    printInfo("CI environment detected, skipping native library download");
    return;
  }

  // Skip if disabled
  if (process.env.ULTRACODE_SKIP_NATIVE === "1") {
    printInfo("Native library download disabled via ULTRACODE_SKIP_NATIVE");
    return;
  }

  printStep("Checking native GPU acceleration libraries...");

  const libInfo = getLibraryInfo();
  printInfo(`Platform: ${libInfo.platform}-${libInfo.arch}`);

  // Check if already exists
  if (libraryExists(libInfo)) {
    printSuccess(`Native library already installed: ${libInfo.folder}/${libInfo.libraryName}`);
    return;
  }

  // No native library for this platform
  if (!libInfo.libraryName) {
    if (libInfo.type === "unsupported") {
      printWarning(`Unsupported platform: ${libInfo.platform}-${libInfo.arch}`);
    } else {
      printInfo("No native GPU library for this platform, using WASM SIMD fallback");
    }
    return;
  }

  // Try to download from GitHub releases
  printInfo("Checking GitHub releases for pre-built binaries...");

  try {
    const release = await getLatestRelease();
    printInfo(`Latest release: ${release.tag_name}`);

    const asset = findAsset(release, libInfo);

    if (asset) {
      printInfo(`Found: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`);

      // Create output directory
      if (!existsSync(NATIVE_LIBS_DIR)) {
        mkdirSync(NATIVE_LIBS_DIR, { recursive: true });
      }

      // Download
      printInfo("Downloading...");

      if (asset.name.endsWith(".tar.gz")) {
        // Extract to NATIVE_LIBS_DIR - archive contains folder structure (cuda-win32-x64/...)
        await downloadAndExtract(asset.browser_download_url, NATIVE_LIBS_DIR);
      } else {
        // Direct .node file - put in platform folder
        const outputDir = join(NATIVE_LIBS_DIR, libInfo.folder);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        const destPath = join(outputDir, libInfo.libraryName);
        await downloadFile(asset.browser_download_url, destPath);
      }

      if (libraryExists(libInfo)) {
        printSuccess(`Downloaded: ${libInfo.folder}/${libInfo.libraryName}`);
        return;
      }
    } else {
      printWarning("No pre-built binary found in release assets");
    }
  } catch (err) {
    printWarning(`Could not fetch release info: ${err.message}`);
  }

  // Fall back to build instructions
  printBuildInstructions(libInfo);
}

main().catch((err) => {
  printError(`Failed: ${err.message}`);
  // Don't fail installation
  process.exit(0);
});
