/**
 * Hardware detection for setup command - CPU and GPU
 */

import { spawnSync } from "node:child_process";
import type { CPUInfo } from "../../cpu/cpu-detector.js";
import type { GPUInfo } from "./setup-types.js";
import { c } from "./setup-ui.js";

export function detectGPU(): GPUInfo {
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
      return { available: false, name: "None", architecture: "cpu", computeCap: 0, isBlackwell: false, vramMB: 0 };
    }

    const parts = result.stdout
      .trim()
      .split(",")
      .map((s) => s.trim());
    const gpuName = parts[0] || "Unknown GPU";
    const computeCap = parseFloat(parts[1] || "0");
    const vramMB = parseInt(parts[2] || "0", 10);

    let architecture = "cpu";
    let isBlackwell = false;

    if (computeCap >= 12.0) {
      architecture = "blackwell";
      isBlackwell = true;
    } else if (computeCap >= 10.0) {
      architecture = "blackwell";
      isBlackwell = true;
    } else if (computeCap >= 9.0) architecture = "hopper";
    else if (computeCap >= 8.9) architecture = "ada";
    else if (computeCap >= 8.6) architecture = "ampere-86";
    else if (computeCap >= 8.0) architecture = "ampere-80";
    else if (computeCap >= 7.5) architecture = "turing";
    else if (computeCap >= 7.0) architecture = "volta";

    return { available: true, name: gpuName, architecture, computeCap, isBlackwell, vramMB };
  } catch {
    return { available: false, name: "None", architecture: "cpu", computeCap: 0, isBlackwell: false, vramMB: 0 };
  }
}

export function printHardwareInfo(cpu: CPUInfo, gpu: GPUInfo): void {
  console.error(`${c.dim}Hardware Detection${c.reset}`);
  console.error("");

  // CPU Info - simple user-friendly message
  const cpuMessage =
    {
      optimal: "Максимальная производительность для CPU инференса (AVX-512)",
      excellent: "Отличная производительность для CPU инференса (AVX2)",
      good: "Хорошая производительность для CPU инференса",
      basic: "Базовая производительность, рекомендуется GPU",
      unsupported: "Слабый CPU, рекомендуется GPU",
    }[cpu.openvinoTier] || "Неизвестно";

  console.error(`${c.dim}  CPU: ${cpu.model}${c.reset}`);
  console.error(`${c.dim}       ${cpuMessage}${c.reset}`);
  console.error("");

  // GPU Info - name + architecture + VRAM
  if (gpu.available) {
    const archName = gpu.architecture.charAt(0).toUpperCase() + gpu.architecture.slice(1);
    const vramGB = (gpu.vramMB / 1024).toFixed(0);
    console.error(`${c.dim}  GPU: ${gpu.name} (${archName}, ${vramGB}GB VRAM)${c.reset}`);
    console.error(`${c.dim}       Можно использовать GPU embedding/LLM модели через Ollama и TEI (docker)${c.reset}`);
  } else {
    console.error(`${c.dim}  GPU: Не обнаружен${c.reset}`);
  }
  console.error("");
}
