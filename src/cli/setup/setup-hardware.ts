/**
 * Hardware detection for setup command - CPU and GPU
 */

import { spawnSync } from "node:child_process";
import type { CPUInfo } from "../../cpu/cpu-detector.js";
import { t } from "./i18n/index.js";
import type { GPUInfo } from "./setup-types.js";
import { c } from "./setup-ui.js";

export function detectGPU(): GPUInfo {
  // ── Apple Silicon (Metal GPU) ──
  if (process.platform === "darwin" && process.arch === "arm64") {
    // Apple Silicon has unified memory — report total system RAM as "VRAM"
    const { totalmem } = require("node:os");
    const vramMB = Math.round(totalmem() / 1024 / 1024);
    // Detect chip name from sysctl
    let chipName = "Apple Silicon";
    try {
      const r = spawnSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "ignore"],
      });
      if (r.status === 0 && r.stdout) chipName = r.stdout.trim();
    } catch { /* keep default */ }
    return { available: true, name: chipName, architecture: "metal", computeCap: 0, isBlackwell: false, vramMB };
  }

  // ── NVIDIA GPU (nvidia-smi) ──
  try {
    const result = spawnSync(
      "nvidia-smi",
      ["--query-gpu=name,compute_cap,memory.total", "--format=csv,noheader,nounits"],
      {
        encoding: "utf-8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );

    if (result.status !== 0 || !result.stdout) {
      // ── AMD GPU (rocm-smi) ──
      return detectAmdGPU();
    }

    const parts = result.stdout.trim().split(",").map((s) => s.trim());
    const gpuName = parts[0] || "Unknown GPU";
    const computeCap = parseFloat(parts[1] || "0");
    const vramMB = parseInt(parts[2] || "0", 10);

    let architecture = "cpu";
    let isBlackwell = false;

    if (computeCap >= 10.0) { architecture = "blackwell"; isBlackwell = true; }
    else if (computeCap >= 9.0) architecture = "hopper";
    else if (computeCap >= 8.9) architecture = "ada";
    else if (computeCap >= 8.6) architecture = "ampere-86";
    else if (computeCap >= 8.0) architecture = "ampere-80";
    else if (computeCap >= 7.5) architecture = "turing";
    else if (computeCap >= 7.0) architecture = "volta";

    return { available: true, name: gpuName, architecture, computeCap, isBlackwell, vramMB };
  } catch {
    return detectAmdGPU();
  }
}

function detectAmdGPU(): GPUInfo {
  try {
    const r = spawnSync("rocm-smi", ["--showproductname"], {
      encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "ignore"],
    });
    if (r.status === 0 && r.stdout) {
      const match = r.stdout.match(/Card series:\s*(.+)/i);
      const name = match?.[1]?.trim() || "AMD GPU";
      return { available: true, name, architecture: "rdna", computeCap: 0, isBlackwell: false, vramMB: 0 };
    }
  } catch { /* fall through */ }
  return { available: false, name: "None", architecture: "cpu", computeCap: 0, isBlackwell: false, vramMB: 0 };
}

export function printHardwareInfo(cpu: CPUInfo, gpu: GPUInfo): void {
  console.error(`${c.dim}${t("hardware.title")}${c.reset}`);
  console.error("");

  // CPU Info - simple user-friendly message
  const cpuMessage =
    {
      optimal: t("hardware.cpu_optimal"),
      excellent: t("hardware.cpu_excellent"),
      good: t("hardware.cpu_good"),
      basic: t("hardware.cpu_basic"),
      unsupported: t("hardware.cpu_weak"),
    }[cpu.openvinoTier] || t("hardware.cpu_unknown");

  console.error(`${c.dim}  CPU: ${cpu.model}${c.reset}`);
  console.error(`${c.dim}       ${cpuMessage}${c.reset}`);
  console.error("");

  // GPU Info - name + architecture + VRAM
  if (gpu.available) {
    if (gpu.architecture === "metal") {
      const ramGB = (gpu.vramMB / 1024).toFixed(0);
      console.error(`${c.dim}  GPU: ${gpu.name} (Metal, ${ramGB}GB unified)${c.reset}`);
      console.error(`${c.dim}       Metal GPU — TEI (Docker CPU) or llama.cpp (Metal)${c.reset}`);
    } else {
      const archName = gpu.architecture.charAt(0).toUpperCase() + gpu.architecture.slice(1);
      const vramGB = (gpu.vramMB / 1024).toFixed(0);
      console.error(`${c.dim}  GPU: ${gpu.name} (${archName}, ${vramGB}GB VRAM)${c.reset}`);
      console.error(`${c.dim}       ${t("hardware.gpu_hint")}${c.reset}`);
    }
  } else {
    console.error(`${c.dim}  GPU: ${t("hardware.gpu_not_detected")}${c.reset}`);
  }
  console.error("");
}
