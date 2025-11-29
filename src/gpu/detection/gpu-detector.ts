/**
 * GPU Detection System
 *
 * Automatically detects available GPU capabilities:
 * - CUDA (NVIDIA via nvidia-smi or native addon)
 * - WebGPU (All GPUs via adapter query)
 * - Compute Capability (NVIDIA only)
 *
 * Cache results for performance.
 */

import { execSync } from "node:child_process";

export interface GPUInfo {
  vendor: "nvidia" | "amd" | "intel" | "unknown";
  model: string;
  computeCapability?: number; // NVIDIA only (e.g. 7.5 for GTX 1650 Ti)
  memoryMB: number;
  cudaAvailable: boolean;
  webgpuAvailable: boolean;
}

export class GPUDetector {
  private static cachedInfo: GPUInfo | null = null;

  /**
   * Detect all available GPU capabilities
   */
  static async detect(): Promise<GPUInfo> {
    if (GPUDetector.cachedInfo) return GPUDetector.cachedInfo;

    const info: GPUInfo = {
      vendor: "unknown",
      model: "Unknown",
      memoryMB: 0,
      cudaAvailable: false,
      webgpuAvailable: false,
    };

    // 1. Try CUDA detection (NVIDIA only)
    try {
      const cudaInfo = await GPUDetector.detectCUDA();
      if (cudaInfo) {
        info.vendor = "nvidia";
        info.model = cudaInfo.name;
        info.computeCapability = cudaInfo.computeCapability;
        info.memoryMB = cudaInfo.totalMemory;
        info.cudaAvailable = true;

        console.error("[GPUDetector] CUDA GPU detected:", {
          model: cudaInfo.name,
          cc: cudaInfo.computeCapability,
          memoryGB: (cudaInfo.totalMemory / 1024).toFixed(1),
        });
      }
    } catch (_e) {
      console.debug("[GPUDetector] CUDA not available");
    }

    // 2. Try WebGPU detection (all vendors)
    try {
      const webgpuInfo = await GPUDetector.detectWebGPU();
      if (webgpuInfo) {
        info.webgpuAvailable = true;

        // Update vendor/model if CUDA didn't detect
        if (!info.cudaAvailable) {
          info.vendor = GPUDetector.parseVendor(webgpuInfo.vendor);
          info.model = webgpuInfo.adapter;
          info.memoryMB = webgpuInfo.memoryMB;
        }

        console.error("[GPUDetector] WebGPU available:", {
          vendor: webgpuInfo.vendor,
          adapter: webgpuInfo.adapter,
        });
      }
    } catch (_e) {
      console.debug("[GPUDetector] WebGPU not available");
    }

    GPUDetector.cachedInfo = info;
    return info;
  }

  /**
   * Detect CUDA via nvidia-smi or native addon
   */
  private static async detectCUDA(): Promise<{
    name: string;
    computeCapability: number;
    totalMemory: number;
  } | null> {
    try {
      // Option 1: Try native CUDA addon (if compiled)
      // Skip in bundled builds - use nvidia-smi instead
      if (typeof process !== "undefined" && !process.env.BUNDLED) {
        try {
          // Dynamic require to avoid bundler resolution
          const modulePath = "../../../build/Release/cuda_vector_ops.node";
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const cudaAddon = require(/* webpackIgnore: true */ modulePath);
          const deviceInfo = cudaAddon.getDeviceInfo();

          return {
            name: deviceInfo.name,
            computeCapability: deviceInfo.major + deviceInfo.minor / 10,
            totalMemory: deviceInfo.totalMemory / (1024 * 1024), // bytes → MB
          };
        } catch {
          // Addon not compiled, try nvidia-smi
        }
      }

      // Option 2: nvidia-smi CLI
      const output = execSync("nvidia-smi --query-gpu=name,compute_cap,memory.total --format=csv,noheader,nounits", {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["pipe", "pipe", "ignore"], // Suppress stderr
        windowsHide: true, // Hide console window on Windows
      }).trim();

      if (!output) return null;

      const [name, cc, memory] = output.split(",").map((s) => s.trim());

      return {
        name: name || "Unknown NVIDIA GPU",
        computeCapability: Number.parseFloat(cc || "0"),
        totalMemory: Number.parseInt(memory || "0", 10),
      };
    } catch {
      return null;
    }
  }

  /**
   * Detect WebGPU via webgpu package or browser API
   */
  private static async detectWebGPU(): Promise<{
    vendor: string;
    adapter: string;
    memoryMB: number;
  } | null> {
    try {
      let gpu: unknown;

      // Try Node.js WebGPU (webgpu package - Dawn/wgpu bindings)
      try {
        const webgpu = await import("webgpu");
        // webgpu package exports GPU instance directly
        gpu = (webgpu as any).GPU ? (webgpu as any).GPU : webgpu;
      } catch {
        // Try browser native WebGPU
        if (typeof navigator !== "undefined" && "gpu" in navigator) {
          gpu = (navigator as any).gpu;
        } else {
          return null;
        }
      }

      const adapter = await (gpu as any).requestAdapter();
      if (!adapter) return null;

      // Get adapter info
      let vendor = "unknown";
      let adapterName = "Unknown Adapter";
      let memoryMB = 0;

      try {
        // WebGPU standard API
        const info = await adapter.requestAdapterInfo?.();
        if (info) {
          vendor = info.vendor || vendor;
          adapterName = info.device || info.description || adapterName;
        }
      } catch {
        // Fallback: try getting info from adapter directly
        vendor = adapter.vendor || vendor;
        adapterName = adapter.name || adapter.description || adapterName;
      }

      // Estimate memory from limits
      const limits = adapter.limits;
      if (limits?.maxBufferSize) {
        memoryMB = limits.maxBufferSize / (1024 * 1024);
      }

      return {
        vendor,
        adapter: adapterName,
        memoryMB,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse vendor string to normalized vendor type
   */
  private static parseVendor(vendor: string): "nvidia" | "amd" | "intel" | "unknown" {
    const v = vendor.toLowerCase();
    if (v.includes("nvidia") || v.includes("0x10de")) return "nvidia";
    if (v.includes("amd") || v.includes("radeon") || v.includes("0x1002")) return "amd";
    if (v.includes("intel") || v.includes("0x8086")) return "intel";
    return "unknown";
  }

  /**
   * Check if specific backend is likely available
   */
  static async checkBackendAvailability(type: "cuda" | "webgpu" | "wasm"): Promise<boolean> {
    const info = await GPUDetector.detect();

    switch (type) {
      case "cuda":
        return info.cudaAvailable && info.vendor === "nvidia";
      case "webgpu":
        return info.webgpuAvailable;
      case "wasm":
        return true; // WASM SIMD always available (with fallback)
      default:
        return false;
    }
  }
}
