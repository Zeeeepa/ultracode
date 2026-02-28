/**
 * llama.cpp Native Installation
 *
 * Downloads and installs llama-server binary and GGUF models.
 * Auto-detects GPU backend: CUDA > Vulkan > CPU
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CPUInfo } from "../../../cpu/cpu-detector.js";
import { getDataDir } from "../../../utils/config-paths.js";
import { toError } from "../../../utils/error-handling.js";
import { t, ti } from "../i18n/index.js";
import type { EmbeddingModel, GPUInfo, InstallResult } from "../setup-types.js";
import { c, printError, printInfo, printOK, printWarn, prompt } from "../setup-ui.js";
import { sleep } from "../utils/index.js";

/**
 * EmbeddingModel with optional GGUF configuration
 */
interface EmbeddingModelWithGGUF extends EmbeddingModel {
  gguf_repo?: string;
  gguf_file?: string;
}

// GitHub repo for llama.cpp (moved from ggerganov to ggml-org)
const LLAMACPP_REPO = "ggml-org/llama.cpp";

// Cached version (fetched dynamically)
let cachedVersion: string | null = null;

/**
 * Get latest llama.cpp version from GitHub
 */
async function getLatestVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;

  try {
    const response = await fetch(`https://api.github.com/repos/${LLAMACPP_REPO}/releases/latest`, {
      headers: {
        "User-Agent": "ultracode/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.ok) {
      const data = (await response.json()) as { tag_name: string };
      cachedVersion = data.tag_name;
      return cachedVersion;
    }
  } catch {
    // Fallback
  }

  // Fallback to known working version
  cachedVersion = "b4969";
  printWarn(ti("llamacpp.fallback_version", { version: cachedVersion }));
  return cachedVersion;
}

// CUDA 13.1 is used for all modern NVIDIA GPUs (works on both Blackwell and older)
type Backend = "cuda" | "vulkan" | "cpu";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/**
 * Detect best available backend
 * Uses CUDA 13.1 for all NVIDIA GPUs (compatible with Blackwell and older)
 */
function detectBackend(gpu: GPUInfo, _cpu: CPUInfo): Backend {
  const gpuName = gpu.name?.toLowerCase() || "";

  // Check for NVIDIA GPU (prefer CUDA)
  if (gpu.available && /nvidia|geforce|rtx|gtx|quadro|tesla/.test(gpuName)) {
    // Verify CUDA is available via nvidia-smi or nvcc
    try {
      const nvcc = spawnSync("nvcc", ["--version"], { timeout: 5000, windowsHide: true, stdio: "pipe" });
      if (nvcc.status === 0) {
        return "cuda";
      }
      const nvidiaSmi = spawnSync("nvidia-smi", [], { timeout: 5000, windowsHide: true, stdio: "pipe" });
      if (nvidiaSmi.status === 0) {
        return "cuda";
      }
    } catch {
      try {
        const nvidiaSmi = spawnSync("nvidia-smi", [], { timeout: 5000, windowsHide: true, stdio: "pipe" });
        if (nvidiaSmi.status === 0) {
          return "cuda";
        }
      } catch {
        /* no CUDA */
      }
    }
  }

  // Check for Vulkan support (AMD, Intel, or NVIDIA without CUDA)
  if (gpu.available) {
    // Most modern GPUs support Vulkan
    if (/amd|radeon|rx\s?\d|vega|navi/.test(gpuName)) {
      return "vulkan";
    }
    if (/intel|arc|iris|uhd/.test(gpuName)) {
      return "vulkan";
    }
    // NVIDIA fallback to Vulkan if CUDA not available
    if (/nvidia|geforce|rtx|gtx/.test(gpuName)) {
      return "vulkan";
    }
  }

  // Fallback to CPU
  return "cpu";
}

/**
 * Get download URL for llama.cpp release
 */
async function getDownloadUrl(backend: Backend): Promise<{ url: string; filename: string } | null> {
  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const isMac = process.platform === "darwin";

  const version = await getLatestVersion();
  printInfo(`Using llama.cpp version: ${version}`);

  // Fetch release info from GitHub
  try {
    const releaseUrl = `https://api.github.com/repos/${LLAMACPP_REPO}/releases/tags/${version}`;
    const response = await fetch(releaseUrl, {
      headers: {
        "User-Agent": "ultracode/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      printWarn(`GitHub API returned ${response.status}, trying direct URL...`);
      return getDirectDownloadUrl(backend);
    }

    const release = (await response.json()) as { assets: ReleaseAsset[] };
    const assets = release.assets || [];

    let pattern: RegExp;

    if (isWindows) {
      if (backend === "cuda") {
        // CUDA 13.1 for all modern NVIDIA GPUs
        pattern = /llama-.*-bin-win-cuda-13\.1-x64\.zip$/i;
      } else if (backend === "vulkan") {
        pattern = /llama-.*-bin-win-vulkan-x64\.zip$/i;
      } else {
        pattern = /llama-.*-bin-win-avx2-x64\.zip$/i;
      }
    } else if (isLinux) {
      if (backend === "cuda") {
        pattern = /llama-.*-bin-ubuntu-x64.*cuda.*13\.1.*\.tar\.gz$/i;
      } else if (backend === "vulkan") {
        pattern = /llama-.*-bin-ubuntu-x64(?!.*cuda).*\.tar\.gz$/i;
      } else {
        pattern = /llama-.*-bin-ubuntu-x64(?!.*cuda).*\.tar\.gz$/i;
      }
    } else if (isMac) {
      pattern = /llama-.*-bin-macos-.*\.zip$/i;
    } else {
      printError(ti("llamacpp.unsupported_platform", { platform: process.platform }));
      return null;
    }

    const asset = assets.find((a) => pattern.test(a.name));
    if (asset) {
      return { url: asset.browser_download_url, filename: asset.name };
    }

    // Fallback patterns for different naming conventions
    if (isWindows && backend === "cpu") {
      const cpuAsset = assets.find((a) => /llama-.*-bin-win.*x64\.zip$/i.test(a.name) && !/cuda|vulkan/i.test(a.name));
      if (cpuAsset) {
        return { url: cpuAsset.browser_download_url, filename: cpuAsset.name };
      }
    }

    printWarn(`No matching asset found for ${backend} on ${process.platform}`);
    return getDirectDownloadUrl(backend);
  } catch (error: unknown) {
    printWarn(`Failed to fetch release info: ${toError(error).message}`);
    return getDirectDownloadUrl(backend);
  }
}

/**
 * Fallback direct download URLs
 */
function getDirectDownloadUrl(backend: Backend): { url: string; filename: string } | null {
  const isWindows = process.platform === "win32";
  const version = cachedVersion || "b4969";
  const baseUrl = `https://github.com/${LLAMACPP_REPO}/releases/download/${version}`;

  if (isWindows) {
    if (backend === "cuda") {
      // CUDA 13.1 for all modern NVIDIA GPUs
      return {
        url: `${baseUrl}/llama-${version}-bin-win-cuda-13.1-x64.zip`,
        filename: `llama-${version}-bin-win-cuda-13.1-x64.zip`,
      };
    } else if (backend === "vulkan") {
      return {
        url: `${baseUrl}/llama-${version}-bin-win-vulkan-x64.zip`,
        filename: `llama-${version}-bin-win-vulkan-x64.zip`,
      };
    } else {
      return {
        url: `${baseUrl}/llama-${version}-bin-win-avx2-x64.zip`,
        filename: `llama-${version}-bin-win-avx2-x64.zip`,
      };
    }
  } else {
    // Linux
    if (backend === "cuda") {
      return {
        url: `${baseUrl}/llama-${version}-bin-ubuntu-x64-cuda-13.1.tar.gz`,
        filename: `llama-${version}-bin-ubuntu-x64-cuda-13.1.tar.gz`,
      };
    } else {
      return {
        url: `${baseUrl}/llama-${version}-bin-ubuntu-x64.tar.gz`,
        filename: `llama-${version}-bin-ubuntu-x64.tar.gz`,
      };
    }
  }
}

/**
 * Get CUDA 13.1 runtime DLLs URL
 */
function getCudartDownloadUrl(): { url: string; filename: string } | null {
  const isWindows = process.platform === "win32";
  if (!isWindows) return null;

  const version = cachedVersion || "b7668";
  const baseUrl = `https://github.com/${LLAMACPP_REPO}/releases/download/${version}`;

  return {
    url: `${baseUrl}/cudart-llama-bin-win-cuda-13.1-x64.zip`,
    filename: `cudart-llama-bin-win-cuda-13.1-x64.zip`,
  };
}

/**
 * Download file with progress
 */
async function downloadFile(url: string, destPath: string): Promise<boolean> {
  try {
    printInfo(`Downloading: ${url}`);

    const response = await fetch(url, {
      headers: { "User-Agent": "ultracode/1.0" },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
    if (totalSize > 0) {
      printInfo(ti("llamacpp.size_mb", { size: (totalSize / 1024 / 1024).toFixed(1) }));
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(destPath, Buffer.from(buffer));

    printOK(t("ovms.downloaded"));
    return true;
  } catch (error: unknown) {
    printError(ti("ovms.download_error", { error: toError(error).message }));
    return false;
  }
}

/**
 * Download GGUF model from HuggingFace
 */
async function downloadGGUFModel(modelId: string, filename: string, destDir: string): Promise<string | null> {
  const destPath = join(destDir, filename);

  if (existsSync(destPath)) {
    printOK(ti("llamacpp.model_exists", { file: filename }));
    return destPath;
  }

  // HuggingFace URL format: https://huggingface.co/{repo}/resolve/main/{filename}
  const url = `https://huggingface.co/${modelId}/resolve/main/${filename}`;

  printInfo(ti("llamacpp.downloading_gguf", { repo: modelId, file: filename }));
  printInfo(t("llamacpp.download_time_hint"));

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ultracode/1.0",
        ...(process.env["HF_TOKEN"] ? { Authorization: `Bearer ${process.env["HF_TOKEN"]}` } : {}),
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
    printInfo(ti("llamacpp.size_mb", { size: (totalSize / 1024 / 1024).toFixed(1) }));

    const buffer = await response.arrayBuffer();
    writeFileSync(destPath, Buffer.from(buffer));

    printOK(ti("llamacpp.model_downloaded", { file: filename }));
    return destPath;
  } catch (error: unknown) {
    printError(ti("llamacpp.model_download_failed", { error: toError(error).message }));
    return null;
  }
}

/**
 * Extract archive
 */
function extractArchive(archivePath: string, destDir: string): boolean {
  const isWindows = process.platform === "win32";

  try {
    printInfo(t("ovms.extracting"));

    if (archivePath.endsWith(".zip")) {
      if (isWindows) {
        execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
          stdio: "pipe",
          windowsHide: true,
        });
      } else {
        execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: "pipe" });
      }
    } else if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
      execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: "pipe" });
    } else {
      throw new Error(`Unknown archive format: ${archivePath}`);
    }

    printOK(t("ovms.extracted"));
    return true;
  } catch (error: unknown) {
    printError(ti("ovms.convert_error", { error: toError(error).message }));
    return false;
  }
}

/**
 * Find llama-server binary in extracted directory
 */
function findServerBinary(dir: string): string | null {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "llama-server.exe" : "llama-server";

  // Check direct path
  const directPath = join(dir, binaryName);
  if (existsSync(directPath)) {
    return directPath;
  }

  // Check bin subdirectory
  const binPath = join(dir, "bin", binaryName);
  if (existsSync(binPath)) {
    return binPath;
  }

  // Search recursively (some releases have nested folders)
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = join(dir, entry.name, binaryName);
        if (existsSync(subPath)) {
          return subPath;
        }
        // Check one more level
        const binSubPath = join(dir, entry.name, "bin", binaryName);
        if (existsSync(binSubPath)) {
          return binSubPath;
        }
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Main installation function
 */
export async function installLlamaCpp(model: EmbeddingModel, gpu: GPUInfo, cpu: CPUInfo): Promise<InstallResult> {
  printInfo(t("llamacpp.setup"));
  console.error("");

  const isWindows = process.platform === "win32";
  const isLinux = process.platform === "linux";
  const isMac = process.platform === "darwin";

  if (!isWindows && !isLinux && !isMac) {
    printError(ti("llamacpp.unsupported_platform", { platform: process.platform }));
    return { success: false };
  }

  // Detect best backend
  const backend = detectBackend(gpu, cpu);
  const backendNames: Record<Backend, string> = {
    cuda: t("llamacpp.cuda_backend"),
    vulkan: t("llamacpp.vulkan_backend"),
    cpu: t("llamacpp.cpu_backend"),
  };
  printInfo(ti("llamacpp.detected_backend", { backend: backendNames[backend] }));

  // Get installation directories
  const dataDir = getDataDir();
  const llamacppDir = join(dataDir, "llamacpp");
  const binDir = join(llamacppDir, "bin");
  const modelsDir = join(dataDir, "hf-cache");

  mkdirSync(binDir, { recursive: true });
  mkdirSync(modelsDir, { recursive: true });

  const binaryName = isWindows ? "llama-server.exe" : "llama-server";
  const binaryPath = join(binDir, binaryName);

  // Check if already installed
  if (existsSync(binaryPath)) {
    printOK(t("llamacpp.already_installed"));

    const action = await prompt(
      `  [1=${t("llamacpp.action_use")}, 2=${t("llamacpp.action_reinstall")}, 3=${t("llamacpp.action_cancel")}]: `,
    );
    if (action === "3") return { success: false };
    if (action !== "2") {
      printInfo(t("llamacpp.proceeding_existing"));
    } else {
      printInfo(t("llamacpp.reinstalling"));
      try {
        unlinkSync(binaryPath);
      } catch {
        /* ignore */
      }
    }
  }

  // Download and install llama-server if needed
  if (!existsSync(binaryPath)) {
    const downloadInfo = await getDownloadUrl(backend);
    if (!downloadInfo) {
      printError(t("llamacpp.no_download_url"));
      return { success: false };
    }

    const archivePath = join(llamacppDir, downloadInfo.filename);

    // Download
    const downloaded = await downloadFile(downloadInfo.url, archivePath);
    if (!downloaded) {
      return { success: false };
    }

    // Extract to temp dir first
    const extractDir = join(llamacppDir, "temp_extract");
    mkdirSync(extractDir, { recursive: true });

    const extracted = extractArchive(archivePath, extractDir);
    if (!extracted) {
      return { success: false };
    }

    // Find and move binary + all required DLLs
    const foundBinary = findServerBinary(extractDir);
    if (!foundBinary) {
      printError(t("llamacpp.binary_not_found"));
      return { success: false };
    }

    // Get the directory containing the binary (to find DLLs)
    const sourceDir = dirname(foundBinary);

    // Move llama-server binary
    renameSync(foundBinary, binaryPath);

    // Copy all DLLs and required files (Windows only)
    if (isWindows) {
      try {
        const files = readdirSync(sourceDir) as string[];
        const dllFiles = files.filter((f: string) => f.endsWith(".dll") || f.endsWith(".so") || f.endsWith(".dylib"));
        printInfo(ti("llamacpp.copying_libs", { count: String(dllFiles.length) }));
        for (const dll of dllFiles) {
          const src = join(sourceDir, dll);
          const dst = join(binDir, dll);
          if (existsSync(src)) {
            try {
              renameSync(src, dst);
            } catch {
              // If rename fails (cross-device), try copy
              copyFileSync(src, dst);
            }
          }
        }
        printOK(ti("llamacpp.copied_dlls", { count: String(dllFiles.length) }));
      } catch (error: unknown) {
        printWarn(ti("llamacpp.copy_dlls_failed", { error: toError(error).message }));
      }
    }

    // Set executable permission on Unix
    if (!isWindows) {
      execSync(`chmod +x "${binaryPath}"`, { stdio: "pipe" });
    }

    // Cleanup
    try {
      execSync(isWindows ? `rmdir /s /q "${extractDir}"` : `rm -rf "${extractDir}"`, {
        stdio: "pipe",
        windowsHide: true,
      });
      unlinkSync(archivePath);
    } catch {
      /* ignore cleanup errors */
    }

    printOK(ti("llamacpp.installed", { path: binaryPath }));

    // For CUDA backend, download cudart DLLs (required for GPU acceleration)
    if (backend === "cuda" && isWindows) {
      printInfo(t("llamacpp.downloading_cuda"));
      const cudartInfo = getCudartDownloadUrl();
      if (cudartInfo) {
        const cudartArchivePath = join(llamacppDir, cudartInfo.filename);
        const cudartDownloaded = await downloadFile(cudartInfo.url, cudartArchivePath);
        if (cudartDownloaded) {
          const cudartExtractDir = join(llamacppDir, "temp_cudart");
          mkdirSync(cudartExtractDir, { recursive: true });
          const cudartExtracted = extractArchive(cudartArchivePath, cudartExtractDir);
          if (cudartExtracted) {
            // Copy all cudart DLLs to bin directory
            try {
              const cudartFiles = readdirSync(cudartExtractDir, { recursive: true }) as string[];
              const dlls = cudartFiles.filter((f: string) => f.endsWith(".dll"));
              for (const dll of dlls) {
                const src = join(cudartExtractDir, dll);
                const dllName = dll.includes("/") || dll.includes("\\") ? dll.split(/[/\\]/).pop()! : dll;
                const dst = join(binDir, dllName);
                if (existsSync(src)) {
                  try {
                    copyFileSync(src, dst);
                  } catch {
                    /* ignore individual copy errors */
                  }
                }
              }
              printOK(t("llamacpp.cuda_installed"));
            } catch (error: unknown) {
              printWarn(ti("llamacpp.cuda_copy_failed", { error: toError(error).message }));
            }
          }
          // Cleanup cudart temp
          try {
            execSync(`rmdir /s /q "${cudartExtractDir}"`, { stdio: "pipe", windowsHide: true });
            unlinkSync(cudartArchivePath);
          } catch {
            /* ignore */
          }
        } else {
          printWarn(t("llamacpp.cuda_download_failed"));
        }
      }
    }
  }

  // Download GGUF model
  printInfo(ti("llamacpp.preparing_model", { model: model.model_id }));

  // Parse GGUF model info from model config
  // Expected format in config: "gpustack/bge-m3-GGUF" with gguf_file: "bge-m3-Q8_0.gguf"
  const modelWithGGUF = model as EmbeddingModelWithGGUF;
  const ggufRepo = modelWithGGUF.gguf_repo || model.hf_model;
  const ggufFile = modelWithGGUF.gguf_file || `${model.model_id}.gguf`;

  if (!ggufRepo) {
    printError(t("llamacpp.no_gguf_repo"));
    return { success: false };
  }

  const modelPath = await downloadGGUFModel(ggufRepo, ggufFile, modelsDir);
  if (!modelPath) {
    return { success: false };
  }

  // Save configuration
  const configPath = join(llamacppDir, "config.json");
  const config = {
    version: cachedVersion || "unknown",
    backend,
    binaryPath,
    modelPath,
    embeddingPort: 8085,
    llmPort: 8086,
    contextSize: model.context_tokens || 8192,
    nGpuLayers: backend === "cpu" ? 0 : 99,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Test server startup
  printInfo(t("llamacpp.testing_startup"));

  const testProc = spawn(binaryPath, ["--model", modelPath, "--port", "8099", "--host", "127.0.0.1", "--embedding"], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let testSuccess = false;
  const maxWaitMs = 90000; // 90 seconds - GGUF models can take a while to load
  const startTime = Date.now();
  let dotCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(2000);
    // Progress indicator
    dotCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stderr.write(
      `\r  ${ti("llamacpp.loading_model", { elapsed: String(elapsed) })} ${".".repeat((dotCount % 4) + 1).padEnd(4)}`,
    );

    try {
      const response = await fetch("http://127.0.0.1:8099/health", {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        testSuccess = true;
        process.stderr.write("\r" + " ".repeat(40) + "\r"); // Clear line
        break;
      }
    } catch {
      // Not ready yet
    }
  }

  if (!testSuccess) {
    process.stderr.write("\r" + " ".repeat(40) + "\r"); // Clear line
  }

  // Kill test process
  try {
    if (isWindows) {
      spawnSync("taskkill", ["/F", "/PID", String(testProc.pid)], { windowsHide: true, stdio: "pipe" });
    } else {
      testProc.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }

  if (testSuccess) {
    printOK(t("llamacpp.test_passed"));
  } else {
    printWarn(t("llamacpp.test_timeout"));
  }

  // Summary
  console.error("");
  console.error(`${c.green}${t("llamacpp.setup_complete")}${c.reset}`);
  console.error("");
  console.error(`  ${c.cyan}Binary:${c.reset} ${binaryPath}`);
  console.error(`  ${c.cyan}Model:${c.reset} ${modelPath}`);
  console.error(`  ${c.cyan}Backend:${c.reset} ${backendNames[backend]}`);
  console.error(`  ${c.cyan}Embedding API:${c.reset} http://127.0.0.1:8085/v1/embeddings`);
  console.error("");
  console.error(`  ${c.dim}${t("llamacpp.auto_start_hint")}${c.reset}`);
  console.error("");

  // Manual start command
  const startCmd = `"${binaryPath}" --model "${modelPath}" --port 8085 --host 127.0.0.1 --embedding --ctx-size ${config.contextSize} --n-gpu-layers ${config.nGpuLayers}`;
  console.error(`  ${c.dim}${ti("llamacpp.manual_start", { cmd: startCmd })}${c.reset}`);

  return {
    success: true,
    modelName: model.model_id,
  };
}
