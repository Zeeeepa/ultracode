/**
 * Backend Selector - Auto-selection of Optimal Vector Backend
 *
 * Priority order (highest to lowest):
 * 1. CUDA Native (100-200x speedup, NVIDIA only, Node.js only)
 * 2. CUDA Worker (98x speedup, NVIDIA, works under Bun via subprocess)
 * 3. Metal (95x speedup, Apple Silicon only)
 * 4. WebGPU (80x speedup, all GPUs)
 * 5. WASM SIMD (50x speedup, CPU SIMD)
 * 6. Pure JS (1x baseline, always available)
 *
 * Runtime-aware selection:
 * - Node.js: prefers direct CUDA native module
 * - Bun: prefers CUDA Worker (subprocess to Node.js for NAPI compatibility)
 *
 * Graceful degradation: tries each backend in order, uses first available.
 */

import { arch, platform } from "node:os";
import { log } from "../logging/index.js";
import type { VectorBackend } from "./backends/base.js";
import { JSBackend } from "./backends/js-backend.js";
import { GPUDetector } from "./detection/gpu-detector.js";

// Runtime detection
function isBunRuntime(): boolean {
  return typeof globalThis.Bun !== "undefined";
}

export class BackendSelector {
  private static instance: BackendSelector | null = null;
  private selectedBackend: VectorBackend | null = null;
  private availableBackends: VectorBackend[] = [];

  private constructor() {}

  static getInstance(): BackendSelector {
    if (!BackendSelector.instance) {
      BackendSelector.instance = new BackendSelector();
    }
    return BackendSelector.instance;
  }

  /**
   * Initialize and select optimal backend
   */
  async initialize(): Promise<VectorBackend> {
    if (this.selectedBackend) {
      log.d("GPUBACKEND", "already_init", { name: this.selectedBackend.name });
      return this.selectedBackend;
    }

    log.i("GPUBACKEND", "detecting_gpu");
    const gpuInfo = await GPUDetector.detect();

    log.i("GPUBACKEND", "gpu_detected", {
      vendor: gpuInfo.vendor,
      model: gpuInfo.model,
      cc: gpuInfo.computeCapability,
      cuda: gpuInfo.cudaAvailable,
      webgpu: gpuInfo.webgpuAvailable,
    });

    // Build backend candidates (priority order)
    const candidates: Array<{
      name: string;
      priority: number;
      factory: () => Promise<VectorBackend>;
    }> = [];

    // 1. CUDA Native (highest priority if NVIDIA + Node.js runtime)
    // Under Bun, native CUDA addon doesn't work (NAPI incompatibility)
    if (gpuInfo.cudaAvailable && gpuInfo.vendor === "nvidia" && !isBunRuntime()) {
      candidates.push({
        name: "CUDA Native",
        priority: 100,
        factory: async () => {
          const { CUDABackend } = await import("./backends/cuda-backend.js");
          return new CUDABackend();
        },
      });
    }

    // 2. CUDA Worker (works under Bun via Node.js subprocess)
    // Enables CUDA on Bun by routing operations through Node.js worker
    if (gpuInfo.vendor === "nvidia") {
      candidates.push({
        name: "CUDA Worker",
        priority: isBunRuntime() ? 100 : 98, // Higher priority under Bun since native won't work
        factory: async () => {
          const { GpuWorkerBackend } = await import("./backends/gpu-worker-backend.js");
          return new GpuWorkerBackend();
        },
      });
    }

    // 3. Metal (Apple Silicon only)
    if (platform() === "darwin" && arch() === "arm64") {
      candidates.push({
        name: "Metal",
        priority: 95,
        factory: async () => {
          const { MetalBackend } = await import("./backends/metal-backend.js");
          return new MetalBackend();
        },
      });
    }

    // 4. WebGPU (universal GPU)
    if (gpuInfo.webgpuAvailable) {
      candidates.push({
        name: "WebGPU",
        priority: 80,
        factory: async () => {
          const { WebGPUBackend } = await import("./backends/webgpu-backend.js");
          return new WebGPUBackend(gpuInfo);
        },
      });
    }

    // 5. WASM SIMD (CPU fallback)
    candidates.push({
      name: "WASM SIMD",
      priority: 50,
      factory: async () => {
        const { WASMBackend } = await import("./backends/wasm-backend.js");
        return new WASMBackend();
      },
    });

    // 6. Pure JS (ultimate fallback, always available)
    candidates.push({
      name: "Pure JS",
      priority: 1,
      factory: async () => new JSBackend(),
    });

    // Try each backend in priority order
    for (const candidate of candidates) {
      try {
        log.d("GPUBACKEND", "trying_backend", { name: candidate.name });
        const backend = await candidate.factory();

        const available = await backend.isAvailable();
        if (!available) {
          log.d("GPUBACKEND", "backend_unavail", { name: candidate.name });
          continue;
        }

        await backend.initialize();
        this.availableBackends.push(backend);

        // Select first available (highest priority)
        if (!this.selectedBackend) {
          this.selectedBackend = backend;
          log.i("GPUBACKEND", "backend_selected", { name: candidate.name, priority: candidate.priority });

          const caps = backend.getCapabilities();
          log.i("GPUBACKEND", "capabilities", {
            maxVec: caps.maxVectorCount,
            maxDim: caps.maxDimension,
            batch: caps.supportsBatching,
            async: caps.supportsAsync,
            memMB: caps.memoryMB,
          });
        }
      } catch (error) {
        log.w("GPUBACKEND", "backend_init_fail", { name: candidate.name, err: (error as Error).message });
      }
    }

    if (!this.selectedBackend) {
      throw new Error("No backend available - this should never happen (JS always available)");
    }

    return this.selectedBackend;
  }

  /**
   * Get current backend
   */
  getBackend(): VectorBackend | null {
    return this.selectedBackend;
  }

  /**
   * Force switch to specific backend (for testing/benchmarking)
   * Note: "cuda" matches both CUDA Native and CUDA Worker backends
   */
  async switchBackend(type: "cuda" | "metal" | "webgpu" | "wasm" | "js"): Promise<VectorBackend> {
    // "cuda" type matches both native and worker backends
    const backend = this.availableBackends.find((b) => b.type === type);
    if (!backend) {
      throw new Error(
        `Backend ${type} not available. Available: ${this.availableBackends.map((b) => b.type).join(", ")}`,
      );
    }

    this.selectedBackend = backend;
    log.i("GPUBACKEND", "backend_switch", { name: backend.name });
    return backend;
  }

  /**
   * Get all available backends (for benchmarking)
   */
  getAvailableBackends(): VectorBackend[] {
    return this.availableBackends;
  }

  /**
   * Get backend info for diagnostics
   */
  getInfo(): {
    selected: string | null;
    available: string[];
  } {
    return {
      selected: this.selectedBackend?.name || null,
      available: this.availableBackends.map((b) => b.name),
    };
  }

  /**
   * Cleanup all backends
   */
  async close(): Promise<void> {
    log.i("GPUBACKEND", "closing_all");
    for (const backend of this.availableBackends) {
      await backend.close();
    }
    this.availableBackends = [];
    this.selectedBackend = null;
  }
}
