/**
 * Backend Selector - Auto-selection of Optimal Vector Backend
 *
 * Priority order (highest to lowest):
 * 1. CUDA (100-200x speedup, NVIDIA only)
 * 2. WebGPU (50-100x speedup, all GPUs)
 * 3. WASM SIMD (4-8x speedup, CPU SIMD)
 * 4. Pure JS (1.45x speedup, baseline)
 *
 * Graceful degradation: tries each backend in order, uses first available.
 */

import type { VectorBackend } from "./backends/base.js";
import { JSBackend } from "./backends/js-backend.js";
import { GPUDetector } from "./detection/gpu-detector.js";

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
      console.log(`[BackendSelector] Already initialized: ${this.selectedBackend.name}`);
      return this.selectedBackend;
    }

    console.log("[BackendSelector] Detecting GPU capabilities...");
    const gpuInfo = await GPUDetector.detect();

    console.log("[BackendSelector] System GPU:", {
      vendor: gpuInfo.vendor,
      model: gpuInfo.model,
      computeCapability: gpuInfo.computeCapability,
      cuda: gpuInfo.cudaAvailable,
      webgpu: gpuInfo.webgpuAvailable,
    });

    // Build backend candidates (priority order)
    const candidates: Array<{
      name: string;
      priority: number;
      factory: () => Promise<VectorBackend>;
    }> = [];

    // 1. CUDA (highest priority if NVIDIA + addon compiled)
    if (gpuInfo.cudaAvailable && gpuInfo.vendor === "nvidia") {
      candidates.push({
        name: "CUDA",
        priority: 100,
        factory: async () => {
          const { CUDABackend } = await import("./backends/cuda-backend.js");
          return new CUDABackend();
        },
      });
    }

    // 2. WebGPU (universal GPU)
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

    // 3. WASM SIMD (CPU fallback)
    candidates.push({
      name: "WASM SIMD",
      priority: 50,
      factory: async () => {
        const { WASMBackend } = await import("./backends/wasm-backend.js");
        return new WASMBackend();
      },
    });

    // 4. Pure JS (ultimate fallback, always available)
    candidates.push({
      name: "Pure JS",
      priority: 1,
      factory: async () => new JSBackend(),
    });

    // Try each backend in priority order
    for (const candidate of candidates) {
      try {
        console.log(`[BackendSelector] Trying ${candidate.name}...`);
        const backend = await candidate.factory();

        const available = await backend.isAvailable();
        if (!available) {
          console.log(`[BackendSelector] ${candidate.name} not available`);
          continue;
        }

        await backend.initialize();
        this.availableBackends.push(backend);

        // Select first available (highest priority)
        if (!this.selectedBackend) {
          this.selectedBackend = backend;
          console.log(`[BackendSelector] ✅ Selected: ${candidate.name} (priority: ${candidate.priority})`);

          const caps = backend.getCapabilities();
          console.log("[BackendSelector] Capabilities:", {
            maxVectors: caps.maxVectorCount.toLocaleString(),
            maxDim: caps.maxDimension,
            batching: caps.supportsBatching,
            async: caps.supportsAsync,
            memoryMB: caps.memoryMB > 0 ? `${caps.memoryMB} MB` : "CPU",
          });
        }
      } catch (error) {
        console.warn(`[BackendSelector] ${candidate.name} initialization failed:`, (error as Error).message);
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
   */
  async switchBackend(type: "cuda" | "webgpu" | "wasm" | "js"): Promise<VectorBackend> {
    const backend = this.availableBackends.find((b) => b.type === type);
    if (!backend) {
      throw new Error(
        `Backend ${type} not available. Available: ${this.availableBackends.map((b) => b.type).join(", ")}`,
      );
    }

    this.selectedBackend = backend;
    console.log(`[BackendSelector] Switched to: ${backend.name}`);
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
    console.log("[BackendSelector] Closing all backends...");
    for (const backend of this.availableBackends) {
      await backend.close();
    }
    this.availableBackends = [];
    this.selectedBackend = null;
  }
}
