/**
 * CPU Detection System
 *
 * Automatically detects CPU capabilities for OpenVINO optimization:
 * - AVX2 (minimum for OpenVINO)
 * - AVX-512 (better performance)
 * - VNNI (INT8 acceleration)
 * - AMX (matrix operations)
 *
 * Cache results for performance.
 */

import { execSync } from "node:child_process";
import os from "node:os";
import { log } from "../logging/index.js";

export interface CPUInfo {
  vendor: "intel" | "amd" | "arm" | "unknown";
  model: string;
  cores: number;
  threads: number;

  // Instruction set support
  avx2: boolean; // Minimum for OpenVINO
  avx512: boolean; // Better performance
  vnni: boolean; // INT8 acceleration (10th Gen+)
  amx: boolean; // Matrix operations (12th Gen+)

  // Performance tier for OpenVINO
  openvinoTier: "unsupported" | "basic" | "good" | "excellent" | "optimal";
  openvinoRecommendation: string;
}

export class CPUDetector {
  private static cachedInfo: CPUInfo | null = null;

  /**
   * Detect CPU capabilities
   */
  static detect(): CPUInfo {
    if (CPUDetector.cachedInfo) return CPUDetector.cachedInfo;

    const cpus = os.cpus();
    const model = cpus[0]?.model || "Unknown CPU";

    const info: CPUInfo = {
      vendor: CPUDetector.detectVendor(model),
      model,
      cores: CPUDetector.countPhysicalCores(),
      threads: cpus.length,
      avx2: false,
      avx512: false,
      vnni: false,
      amx: false,
      openvinoTier: "unsupported",
      openvinoRecommendation: "",
    };

    // Detect instruction sets
    const flags = CPUDetector.getCPUFlags();
    info.avx2 = flags.includes("avx2");
    info.avx512 = flags.some((f) => f.startsWith("avx512"));
    info.vnni = flags.includes("avx512_vnni") || flags.includes("avx_vnni");
    info.amx = flags.some((f) => f.startsWith("amx"));

    // Calculate OpenVINO tier
    const { tier, recommendation } = CPUDetector.calculateOpenVINOTier(info);
    info.openvinoTier = tier;
    info.openvinoRecommendation = recommendation;

    CPUDetector.cachedInfo = info;
    return info;
  }

  /**
   * Get CPU flags from system
   */
  private static getCPUFlags(): string[] {
    const platform = os.platform();

    try {
      if (platform === "linux") {
        // Linux: /proc/cpuinfo
        const output = execSync("cat /proc/cpuinfo | grep -m1 flags", {
          encoding: "utf8",
          timeout: 2000,
        });
        const match = output.match(/flags\s*:\s*(.+)/);
        return match?.[1] ? match[1].toLowerCase().split(/\s+/) : [];
      }

      if (platform === "darwin") {
        // macOS: sysctl
        const output = execSync("sysctl -a | grep -E 'cpu.*(features|leaf7)'", {
          encoding: "utf8",
          timeout: 2000,
        });
        // Parse macOS format
        const flags: string[] = [];
        if (output.includes("AVX2")) flags.push("avx2");
        if (output.includes("AVX512")) flags.push("avx512f");
        return flags;
      }

      if (platform === "win32") {
        // Windows: os.cpus() provides best model name (e.g., "Intel Core Ultra 9 275HX")
        // PowerShell Win32_Processor.Caption only returns generic "Intel64 Family 6 Model X"
        const model = os.cpus()[0]?.model || "";
        return CPUDetector.inferFlagsFromModel(model);
      }
    } catch (e) {
      log.d("CPUDETECT", "flags_fail", { err: String(e) });
    }

    // Fallback: infer from model name
    const model = os.cpus()[0]?.model || "";
    return CPUDetector.inferFlagsFromModel(model);
  }

  /**
   * Infer CPU flags from model name (fallback)
   */
  private static inferFlagsFromModel(model: string): string[] {
    const flags: string[] = [];
    const m = model.toLowerCase();

    // Intel detection
    if (m.includes("intel")) {
      // Intel Core Ultra (Meteor Lake, Arrow Lake) - newest gen
      // Examples: "Intel Core Ultra 9 275HX", "Intel Core Ultra 7 165H"
      if (m.includes("ultra")) {
        flags.push("avx2", "avx_vnni");

        // Extract Ultra model number (e.g., 275, 165, 125)
        const ultraMatch = m.match(/ultra\s*\d*\s*(\d{3})/i);
        const ultraModel = ultraMatch?.[1] ? parseInt(ultraMatch[1], 10) : 0;

        // Arrow Lake (2xx series) - Core Ultra 200 series
        if (ultraModel >= 200) {
          // Arrow Lake has AVX-512 on P-cores, AMX support
          flags.push("avx512f", "amx_fp16");
        }
        // Meteor Lake (1xx series) - Core Ultra 100 series
        // Has AVX-VNNI but no AVX-512 (already added above)
      }
      // Classic Core i3/i5/i7/i9
      else if (m.match(/core.*i[3579]|xeon|celeron|pentium/)) {
        // Extract generation from model
        const genMatch = m.match(/(\d{4,5})/); // e.g., 14900, 13700, 12400
        const gen = genMatch?.[1] ? parseInt(genMatch[1], 10) : 0;

        // 4th gen+ (4xxx) have AVX2
        if (gen >= 4000 || m.includes("haswell") || m.includes("broadwell")) {
          flags.push("avx2");
        }

        // 6th gen+ Skylake-X have AVX-512
        if (gen >= 7000 && m.includes("-x")) {
          flags.push("avx512f");
        }

        // 10th gen+ (10xxx) have VNNI
        if (gen >= 10000) {
          flags.push("avx2", "avx_vnni");
        }

        // 12th gen+ (12xxx) have AVX-512 on P-cores (disabled by default)
        if (gen >= 12000) {
          flags.push("avx2", "avx_vnni");
          // Note: AVX-512 disabled on Alder Lake by default
        }

        // 14th gen (14xxx)
        if (gen >= 14000) {
          flags.push("avx2", "avx_vnni");
        }
      }

      // Xeon Scalable with VNNI/AMX
      if (m.includes("xeon")) {
        flags.push("avx2");
        if (m.includes("platinum") || m.includes("gold") || m.includes("scalable")) {
          flags.push("avx512f", "avx512_vnni");
        }
        // 4th Gen Xeon (Sapphire Rapids) has AMX
        if (m.includes("4th") || m.includes("sapphire")) {
          flags.push("amx_bf16", "amx_int8");
        }
      }
    }

    // AMD detection
    if (m.includes("amd") || m.includes("ryzen") || m.includes("epyc")) {
      // Ryzen 1000+ have AVX2
      flags.push("avx2");

      // Ryzen 7000+ (Zen 4) have AVX-512
      const ryzenMatch = m.match(/ryzen.*?(\d)/);
      if (ryzenMatch?.[1]) {
        const series = parseInt(ryzenMatch[1], 10);
        if (series >= 7) {
          flags.push("avx512f");
        }
      }

      // EPYC Genoa has AVX-512
      if (m.includes("epyc") && (m.includes("genoa") || m.includes("9"))) {
        flags.push("avx512f", "avx512_vnni");
      }
    }

    return [...new Set(flags)]; // Deduplicate
  }

  /**
   * Detect CPU vendor
   */
  private static detectVendor(model: string): "intel" | "amd" | "arm" | "unknown" {
    const m = model.toLowerCase();
    if (m.includes("intel")) return "intel";
    if (m.includes("amd") || m.includes("ryzen") || m.includes("epyc")) return "amd";
    if (m.includes("arm") || m.includes("apple") || m.includes("m1") || m.includes("m2") || m.includes("m3"))
      return "arm";
    return "unknown";
  }

  /**
   * Count physical CPU cores (not threads).
   *
   * cgroup-aware: on Linux containers, os.cpus().length (Bun 1.3.12+) respects
   * cgroup CPU limits, but lscpu reports host cores. We cap the result to
   * os.cpus().length to prevent over-provisioning in containers.
   */
  private static countPhysicalCores(): number {
    const platform = os.platform();
    const threadCount = os.cpus().length;

    try {
      if (platform === "linux") {
        const output = execSync("lscpu -p=Core | grep -v '^#' | sort -u | wc -l", {
          encoding: "utf8",
          timeout: 2000,
        });
        const lscpuCores = parseInt(output.trim(), 10);
        // Cap to threadCount: in cgroup containers lscpu sees host cores
        // but os.cpus() (Bun 1.3.12+) sees container limits
        return lscpuCores ? Math.min(lscpuCores, threadCount) : Math.floor(threadCount / 2);
      }

      if (platform === "darwin") {
        const output = execSync("sysctl -n hw.physicalcpu", {
          encoding: "utf8",
          timeout: 2000,
        });
        return parseInt(output.trim(), 10) || Math.floor(threadCount / 2);
      }

      if (platform === "win32") {
        const output = execSync("wmic cpu get NumberOfCores /value", {
          encoding: "utf8",
          timeout: 2000,
          windowsHide: true,
        });
        const match = output.match(/NumberOfCores=(\d+)/);
        return match?.[1] ? parseInt(match[1], 10) : Math.floor(threadCount / 2);
      }
    } catch {
      // Fallback: assume hyperthreading (threads / 2)
    }

    return Math.max(1, Math.floor(threadCount / 2));
  }

  /**
   * Calculate OpenVINO performance tier
   */
  private static calculateOpenVINOTier(info: CPUInfo): {
    tier: CPUInfo["openvinoTier"];
    recommendation: string;
  } {
    // ARM not supported by OpenVINO (use CoreML/Metal instead)
    if (info.vendor === "arm") {
      return {
        tier: "unsupported",
        recommendation: "OpenVINO не поддерживает ARM. Используйте CoreML (macOS) или ONNX Runtime.",
      };
    }

    // No AVX2 = unsupported
    if (!info.avx2) {
      return {
        tier: "unsupported",
        recommendation: "CPU не поддерживает AVX2. OpenVINO требует минимум Intel 4th Gen / AMD Ryzen.",
      };
    }

    // AMX = optimal (4th Gen Xeon)
    if (info.amx) {
      return {
        tier: "optimal",
        recommendation: "🚀 Максимальная производительность! AMX ускорение для INT8/BF16.",
      };
    }

    // VNNI = excellent (10th Gen+)
    if (info.vnni) {
      return {
        tier: "excellent",
        recommendation: "⚡ Отличная производительность! VNNI ускоряет INT8 квантизацию в 2-4x.",
      };
    }

    // AVX-512 = good (Skylake-X, Xeon)
    if (info.avx512) {
      return {
        tier: "good",
        recommendation: "🟢 Хорошая производительность. AVX-512 ускоряет вычисления.",
      };
    }

    // AVX2 only = basic (4-9th Gen)
    return {
      tier: "basic",
      recommendation: "🟡 Базовая поддержка. Рекомендуется Intel 10th Gen+ для лучшей производительности.",
    };
  }

  /**
   * Check if OpenVINO is recommended for this CPU
   */
  static isOpenVINORecommended(): boolean {
    const info = CPUDetector.detect();
    return info.openvinoTier !== "unsupported" && info.openvinoTier !== "basic";
  }

  /**
   * Get quick summary for logging
   */
  static getSummary(): string {
    const info = CPUDetector.detect();
    const features: string[] = [];
    if (info.avx2) features.push("AVX2");
    if (info.avx512) features.push("AVX-512");
    if (info.vnni) features.push("VNNI");
    if (info.amx) features.push("AMX");

    return `${info.model} | ${info.cores}C/${info.threads}T | ${features.join(", ") || "No SIMD"} | OpenVINO: ${info.openvinoTier}`;
  }
}
