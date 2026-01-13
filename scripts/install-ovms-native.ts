#!/usr/bin/env bun
/**
 * OVMS Native Installation Script
 *
 * Downloads and installs OpenVINO Model Server (OVMS) as a standalone binary
 * without Docker. Supports Windows 11 and Linux (Ubuntu 22/24).
 *
 * Usage:
 *   bun scripts/install-ovms-native.ts [--version 2025.4]
 *
 * After installation:
 *   - Windows: %LOCALAPPDATA%\UltraScriptTools\ovms\ovms.exe
 *   - Linux: ~/.local/share/ultrascript-tools/ovms/ovms
 */

import { execSync, spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  chmodSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar";

const OVMS_VERSION = process.argv.includes("--version")
  ? process.argv[process.argv.indexOf("--version") + 1] || "2025.4"
  : "2025.4";

const c = {
  reset: "\x1b[0m",
  bright: "\x1b[97m",
  dim: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function printOK(msg: string): void {
  console.log(`${c.green}[OK]${c.reset} ${msg}`);
}
function printInfo(msg: string): void {
  console.log(`${c.cyan}[INFO]${c.reset} ${msg}`);
}
function printWarn(msg: string): void {
  console.log(`${c.yellow}[WARN]${c.reset} ${msg}`);
}
function printError(msg: string): void {
  console.log(`${c.red}[ERROR]${c.reset} ${msg}`);
}

/**
 * Get OVMS installation directory
 */
function getOVMSDir(): string {
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || join(process.env.USERPROFILE || "", "AppData", "Local");
    return join(localAppData, "UltraScriptTools", "ovms");
  } else {
    const home = process.env.HOME || "/tmp";
    return join(home, ".local", "share", "ultrascript-tools", "ovms");
  }
}

/**
 * Get models directory
 */
function getModelsDir(): string {
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || join(process.env.USERPROFILE || "", "AppData", "Local");
    return join(localAppData, "UltraScriptTools", "models");
  } else {
    const home = process.env.HOME || "/tmp";
    return join(home, ".local", "share", "ultrascript-tools", "models");
  }
}

/**
 * Get download URL for OVMS binary
 */
function getDownloadUrl(): { url: string; filename: string } {
  const baseUrl = `https://github.com/openvinotoolkit/model_server/releases/download/v${OVMS_VERSION}`;

  if (process.platform === "win32") {
    // Windows binary from Intel weekly builds (NPU/GPU support)
    // Latest: https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/
    return {
      url: `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_windows_python_on.zip`,
      filename: "ovms_windows_python_on.zip",
    };
  } else if (process.platform === "linux") {
    // Weekly build for Linux with Python support (NPU/GPU)
    let ubuntuVersion = "24";
    try {
      const osRelease = execSync("cat /etc/os-release 2>/dev/null || echo ''", {
        encoding: "utf-8",
      });
      if (osRelease.includes("22.04") || osRelease.includes("jammy")) {
        ubuntuVersion = "22";
      }
    } catch {
      // Default to Ubuntu 24
    }

    return {
      url: `https://storage.openvinotoolkit.org/repositories/openvino_model_server/packages/weekly/2025.4.0.15ce0188/ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`,
      filename: `ovms_ubuntu${ubuntuVersion}_python_on.tar.gz`,
    };
  } else if (process.platform === "darwin") {
    printError("macOS is not supported for OVMS native. Use Docker instead.");
    process.exit(1);
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * Download file with progress
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  printInfo(`Downloading from: ${url}`);

  const response = await fetch(url, {
    headers: { "User-Agent": "ultrascript-tools-mcp/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get("content-length") || "0", 10);
  const totalMB = (totalSize / 1024 / 1024).toFixed(1);

  printInfo(`Size: ${totalMB} MB`);

  const fileStream = createWriteStream(destPath);
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  let downloadedSize = 0;
  let lastProgress = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(value);
    downloadedSize += value.length;

    const progress = Math.floor((downloadedSize / totalSize) * 100);
    if (progress >= lastProgress + 10) {
      process.stdout.write(`\r  Progress: ${progress}%`);
      lastProgress = progress;
    }
  }

  // Wait for file stream to fully close before returning
  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
    fileStream.end();
  });

  console.log("");
  printOK(`Downloaded: ${destPath}`);
}

/**
 * Extract archive
 */
async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  printInfo(`Extracting to: ${destDir}`);

  mkdirSync(destDir, { recursive: true });

  if (archivePath.endsWith(".zip")) {
    if (process.platform === "win32") {
      // Normalize paths to Windows backslashes for PowerShell
      const winArchive = archivePath.replace(/\//g, "\\");
      const winDest = destDir.replace(/\//g, "\\");

      // Use spawnSync with args array to avoid path escaping issues
      const result = spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -Path '${winArchive}' -DestinationPath '${winDest}' -Force`,
        ],
        { stdio: "pipe", windowsHide: true },
      );

      if (result.status !== 0) {
        const stderr = result.stderr?.toString() || "";
        throw new Error(`PowerShell Expand-Archive failed: ${stderr}`);
      }
    } else {
      execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: "pipe" });
    }
  } else if (archivePath.endsWith(".tar.gz")) {
    await extract({
      file: archivePath,
      cwd: destDir,
      strip: 1,
    });
  }

  printOK("Extraction complete");
}

/**
 * Create OVMS startup script/batch file
 */
function createStartupScript(ovmsDir: string, modelsDir: string, port: number = 8083): string {
  const scriptPath =
    process.platform === "win32" ? join(ovmsDir, "start-ovms.bat") : join(ovmsDir, "start-ovms.sh");

  const ovmsBin = process.platform === "win32" ? join(ovmsDir, "ovms.exe") : join(ovmsDir, "ovms");

  // Convert paths for the script
  const modelsPathArg = modelsDir.replace(/\\/g, "/");

  if (process.platform === "win32") {
    const batchContent = `@echo off
REM OVMS Native Startup Script
REM Generated by UltraScript Tools MCP

set OVMS_DIR=${ovmsDir}
set MODELS_DIR=${modelsDir}

echo Starting OpenVINO Model Server...
echo   REST Port: ${port}
echo   gRPC Port: 9001
echo   Models: %MODELS_DIR%

"${ovmsBin}" --rest_port ${port} --port 9001 --config_path "${modelsDir}\\config.json"
`;
    require("fs").writeFileSync(scriptPath, batchContent);
  } else {
    const shellContent = `#!/bin/bash
# OVMS Native Startup Script
# Generated by UltraScript Tools MCP

OVMS_DIR="${ovmsDir}"
MODELS_DIR="${modelsDir}"

echo "Starting OpenVINO Model Server..."
echo "  REST Port: ${port}"
echo "  gRPC Port: 9001"
echo "  Models: $MODELS_DIR"

"${ovmsBin}" --rest_port ${port} --port 9001 --config_path "${modelsDir}/config.json"
`;
    require("fs").writeFileSync(scriptPath, shellContent);
    chmodSync(scriptPath, 0o755);
    chmodSync(ovmsBin, 0o755);
  }

  printOK(`Created startup script: ${scriptPath}`);
  return scriptPath;
}

/**
 * Create systemd service (Linux only)
 */
function createSystemdService(ovmsDir: string, modelsDir: string): void {
  if (process.platform !== "linux") return;

  const serviceContent = `[Unit]
Description=OpenVINO Model Server (OVMS) Native
After=network.target

[Service]
Type=simple
User=${process.env.USER || "root"}
WorkingDirectory=${ovmsDir}
ExecStart=${ovmsDir}/ovms --rest_port 8083 --port 9001 --config_path ${modelsDir}/config.json
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;

  const serviceDir = join(process.env.HOME || "/tmp", ".config", "systemd", "user");
  mkdirSync(serviceDir, { recursive: true });

  const servicePath = join(serviceDir, "ovms-native.service");
  require("fs").writeFileSync(servicePath, serviceContent);

  printOK(`Created systemd user service: ${servicePath}`);
  printInfo("To enable: systemctl --user enable ovms-native");
  printInfo("To start:  systemctl --user start ovms-native");
}

/**
 * Check if OVMS is already installed
 */
function checkExistingInstallation(ovmsDir: string): boolean {
  const ovmsBin = process.platform === "win32" ? join(ovmsDir, "ovms.exe") : join(ovmsDir, "ovms");

  return existsSync(ovmsBin);
}

/**
 * Main installation function
 */
async function main(): Promise<void> {
  console.log("");
  console.log(`${c.cyan}${c.bright}========================================${c.reset}`);
  console.log(`${c.cyan}${c.bright}  OVMS Native Installation v${OVMS_VERSION}${c.reset}`);
  console.log(`${c.cyan}${c.bright}========================================${c.reset}`);
  console.log("");

  const ovmsDir = getOVMSDir();
  const modelsDir = getModelsDir();

  printInfo(`Platform: ${process.platform}`);
  printInfo(`OVMS directory: ${ovmsDir}`);
  printInfo(`Models directory: ${modelsDir}`);
  console.log("");

  // Check existing installation
  if (checkExistingInstallation(ovmsDir)) {
    printWarn("OVMS is already installed");

    const readline = require("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise<string>((resolve) => {
      rl.question("  Reinstall? [y/N]: ", (ans: string) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });

    if (answer !== "y" && answer !== "yes") {
      printInfo("Installation cancelled");
      return;
    }
  }

  // Create models directory (ovms dir will be created by extraction)
  mkdirSync(modelsDir, { recursive: true });

  // Get download URL - download to temp, not ovmsDir
  const { url, filename } = getDownloadUrl();
  const tempDir = process.env.TEMP || process.env.TMP || "/tmp";
  const archivePath = join(tempDir, filename);

  // Download OVMS
  try {
    await downloadFile(url, archivePath);
  } catch (error: any) {
    printError(`Download failed: ${error.message}`);

    // Fallback URL for Windows
    if (process.platform === "win32") {
      printInfo("Trying alternative download URL...");
      const altUrl = `https://github.com/openvinotoolkit/model_server/releases/download/v${OVMS_VERSION}/ovms_windows.zip`;
      try {
        await downloadFile(altUrl, archivePath);
      } catch (e: any) {
        printError(`Alternative download also failed: ${e.message}`);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  // Remove existing ovms folder if it exists (for clean install)
  if (existsSync(ovmsDir)) {
    printInfo(`Removing existing installation: ${ovmsDir}`);
    rmSync(ovmsDir, { recursive: true, force: true });
  }

  // Extract archive to temp, then move ovms subfolder to target
  const extractTempDir = join(tempDir, "ovms_extract_" + Date.now());
  try {
    await extractArchive(archivePath, extractTempDir);

    // Find the ovms folder inside extracted content
    const extractedOvms = join(extractTempDir, "ovms");
    const sourceDir = existsSync(extractedOvms) ? extractedOvms : extractTempDir;

    if (!existsSync(extractedOvms)) {
      printWarn("No 'ovms' subfolder found, using extracted content directly");
    }

    // Move to target location (use copy on cross-drive moves)
    printInfo(`Moving ${sourceDir} -> ${ovmsDir}`);
    try {
      renameSync(sourceDir, ovmsDir);
    } catch (renameError: any) {
      if (renameError.code === "EXDEV") {
        // Cross-device move, use copy instead
        printInfo("Cross-drive detected, copying files...");
        if (process.platform === "win32") {
          const result = spawnSync("xcopy", [sourceDir, ovmsDir, "/E", "/I", "/H", "/Y"], {
            stdio: "pipe",
          });
          if (result.status !== 0) {
            throw new Error(`xcopy failed: ${result.stderr?.toString()}`);
          }
        } else {
          execSync(`cp -r "${sourceDir}" "${ovmsDir}"`, { stdio: "pipe" });
        }
      } else {
        throw renameError;
      }
    }

    // Cleanup temp extraction folder if it still exists
    if (existsSync(extractTempDir)) {
      rmSync(extractTempDir, { recursive: true, force: true });
    }
  } catch (error: any) {
    printError(`Extraction failed: ${error.message}`);
    process.exit(1);
  }

  // Cleanup archive
  try {
    unlinkSync(archivePath);
    printOK("Cleaned up archive");
  } catch {
    // Ignore cleanup errors
  }

  // Create startup script
  const startScript = createStartupScript(ovmsDir, modelsDir);

  // Create systemd service on Linux
  if (process.platform === "linux") {
    createSystemdService(ovmsDir, modelsDir);
  }

  // Summary
  console.log("");
  console.log(`${c.green}${c.bright}========================================${c.reset}`);
  console.log(`${c.green}${c.bright}  Installation Complete!${c.reset}`);
  console.log(`${c.green}${c.bright}========================================${c.reset}`);
  console.log("");

  const ovmsBin = process.platform === "win32" ? join(ovmsDir, "ovms.exe") : join(ovmsDir, "ovms");

  printInfo(`OVMS binary: ${ovmsBin}`);
  printInfo(`Startup script: ${startScript}`);
  printInfo(`Models directory: ${modelsDir}`);
  console.log("");

  printInfo("Next steps:");
  console.log(`  1. Download embedding model: bun run mcp setup-embedding`);
  console.log(`  2. Start OVMS: ${startScript}`);
  console.log("");

  if (process.platform === "win32") {
    printInfo("To run as Windows Service, use NSSM:");
    console.log(`  nssm install ovms-native "${ovmsBin}"`);
  }
}

main().catch((error) => {
  printError(`Installation failed: ${error.message}`);
  process.exit(1);
});
