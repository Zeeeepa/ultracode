/**
 * CUDA Native Backend
 *
 * Direct NVIDIA GPU programming via CUDA native addon (N-API).
 * Maximum performance for NVIDIA GPUs.
 *
 * Performance: 100-200x speedup vs pure JS
 * - GTX 1650 Ti: ~0.1-0.2ms per 10K vectors
 * - RTX 5060: ~0.05-0.1ms per 10K vectors
 *
 * Environment Variables:
 * - CUDA_FORCE_DISABLE=1 - Force disable CUDA backend (useful if addon crashes)
 *
 * Requires:
 * - NVIDIA GPU (GTX 16xx+)
 * - CUDA Toolkit installed
 * - Native addon compiled: `npm run build:cuda`
 *
 * Known Issues:
 * - Native addon may not be compatible with newest GPU architectures
 * - If crashing, set CUDA_FORCE_DISABLE=1 to use WASM fallback
 */

import { log } from "../../logging/index.js";
import type { BackendCapabilities, VectorBackend } from "./base.js";

// CUDA native addon interface (Node.js N-API) - matches binding.cpp exports
interface CUDAAddon {
  cosineSimilarity(vecA: number[], vecB: number[]): number;
  batchCosineSimilarity(vecsA: number[][], vecsB: number[][]): number[];
  euclideanDistance(vecA: number[], vecB: number[]): number;
  normalizeVectors(vectors: number[][]): number[][];
  getDeviceInfo(): {
    deviceCount: number;
    deviceName?: string;
    computeCapability?: string;
    totalMemoryMB?: number;
    multiProcessorCount?: number;
  };
}

let cudaAddon: CUDAAddon | null = null;

export class CUDABackend implements VectorBackend {
  readonly name = "CUDA Native";
  readonly type = "cuda" as const;
  readonly priority = 100; // Highest priority

  private deviceInfo: CUDAAddon["getDeviceInfo"] extends () => infer R ? R : never = { deviceCount: 0 };
  private initialized = false;

  async isAvailable(): Promise<boolean> {
    // Check environment override
    if (process.env["CUDA_FORCE_DISABLE"] === "1") {
      log.i("CUDABACKEND", "disabled_env");
      return false;
    }

    // Note: Blackwell (CC 12.0) support added to CMakeLists.txt
    // Try loading addon directly - it's compiled for CC 120

    try {
      // Try to load native CUDA addon from multiple possible locations
      // Priority: bundled in npm package -> local builds
      const plat = process.platform === "win32" ? "win32" : "linux";
      const possiblePaths = [
        // Bundled in npm package (external-libs/)
        `../../../external-libs/cuda-${plat}-x64/ultracode_cuda.node`,
        // Local development builds
        "../../../dist/native/cuda/ultracode_cuda.node",
        "../../../build/Release/ultracode_cuda.node",
        "../../../external-tools/native/cuda/build/Release/ultracode_cuda.node",
      ];

      for (const addonPath of possiblePaths) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          cudaAddon = require(addonPath);
          const info = cudaAddon!.getDeviceInfo();
          if (info.deviceCount > 0) {
            return true;
          }
        } catch {
          // Try next path
        }
      }

      log.d("CUDABACKEND", "addon_not_found");
      log.d("CUDABACKEND", "build_hint", { cmd: "npm run build:cuda" });
      return false;
    } catch (error) {
      log.d("CUDABACKEND", "avail_check_err", { err: (error as Error).message });
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (!cudaAddon) {
      throw new Error("CUDA addon not available. Build with: npm run build:cuda");
    }

    this.deviceInfo = cudaAddon.getDeviceInfo();
    this.initialized = true;

    log.i("CUDABACKEND", "init", {
      device: this.deviceInfo.deviceName || "Unknown",
      cc: this.deviceInfo.computeCapability || "N/A",
      memMB: this.deviceInfo.totalMemoryMB || 0,
      sms: this.deviceInfo.multiProcessorCount || 0,
    });
  }

  getCapabilities(): BackendCapabilities {
    return {
      maxVectorCount: 1_000_000, // 1M vectors
      maxDimension: 8192,
      supportsBatching: true,
      supportsAsync: true,
      memoryMB: this.deviceInfo.totalMemoryMB || 0,
    };
  }

  async cosineSimilarity(a: Float32Array, b: Float32Array): Promise<number> {
    if (!cudaAddon || !this.initialized) {
      throw new Error("CUDA backend not initialized");
    }

    // Convert Float32Array to number[]
    const vecA = Array.from(a);
    const vecB = Array.from(b);

    return cudaAddon.cosineSimilarity(vecA, vecB);
  }

  async batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array> {
    if (!cudaAddon || !this.initialized) {
      throw new Error("CUDA backend not initialized");
    }

    // Convert to format expected by C++ binding: arrays of arrays
    const queryArr = Array.from(query);

    // Create query array repeated for each database vector
    const vecsA: number[][] = [];
    const vecsB: number[][] = [];

    for (const dbVec of database) {
      vecsA.push(queryArr);
      vecsB.push(Array.from(dbVec));
    }

    // Call CUDA kernel
    const results = cudaAddon.batchCosineSimilarity(vecsA, vecsB);

    return new Float32Array(results);
  }

  async euclideanDistance(a: Float32Array, b: Float32Array): Promise<number> {
    if (!cudaAddon || !this.initialized) {
      throw new Error("CUDA backend not initialized");
    }

    const vecA = Array.from(a);
    const vecB = Array.from(b);

    return cudaAddon.euclideanDistance(vecA, vecB);
  }

  async normalizeVectors(vectors: Float32Array[]): Promise<Float32Array[]> {
    if (!cudaAddon || !this.initialized) {
      throw new Error("CUDA backend not initialized");
    }

    const input = vectors.map((v) => Array.from(v));
    const normalized = cudaAddon.normalizeVectors(input);

    return normalized.map((v) => new Float32Array(v));
  }

  async close(): Promise<void> {
    this.initialized = false;
    log.i("CUDABACKEND", "closed");
  }
}
