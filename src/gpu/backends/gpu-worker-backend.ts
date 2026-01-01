/**
 * GPU Worker Backend - CUDA operations via Node.js subprocess
 *
 * This backend routes CUDA operations through the GPU Worker subprocess,
 * enabling CUDA acceleration under Bun runtime where native NAPI modules
 * don't work directly.
 *
 * Architecture:
 * - Under Bun: spawns Node.js subprocess with faiss-node + CUDA addon
 * - Under Node.js: uses GPU Client directly (no subprocess overhead)
 *
 * Performance:
 * - Slightly lower than direct CUDA due to IPC overhead
 * - But enables CUDA under Bun where it would otherwise be unavailable
 * - IPC optimized for batch operations
 */

import { getGpuClient, type IGpuClient, shutdownGpuClient } from "../../semantic/gpu/gpu-client.js";
import type { BackendCapabilities, VectorBackend } from "./base.js";

export class GpuWorkerBackend implements VectorBackend {
  readonly name = "CUDA (Worker)";
  readonly type = "cuda" as const;
  readonly priority = 98; // Slightly lower than direct CUDA (100)

  private client: IGpuClient | null = null;
  private initialized = false;
  private deviceInfo: {
    deviceName?: string;
    computeCapability?: string;
    totalMemoryMB?: number;
    multiProcessorCount?: number;
  } = {};

  async isAvailable(): Promise<boolean> {
    // Check environment override
    if (process.env["CUDA_FORCE_DISABLE"] === "1") {
      console.error("[GpuWorkerBackend] Disabled via CUDA_FORCE_DISABLE=1");
      return false;
    }

    try {
      // Try to start the GPU client and check CUDA availability
      this.client = getGpuClient();
      const started = await this.client.start();

      if (!started) {
        console.error("[GpuWorkerBackend] Failed to start GPU client");
        return false;
      }

      // Check CUDA availability via worker
      const info = await this.client.cudaInfo();
      if (!info.available) {
        console.error("[GpuWorkerBackend] CUDA not available in worker");
        return false;
      }

      this.deviceInfo = info.deviceInfo;
      console.error(`[GpuWorkerBackend] CUDA available: ${info.deviceInfo.deviceName}`);
      return true;
    } catch (error) {
      console.error(`[GpuWorkerBackend] Error checking availability: ${(error as Error).message}`);
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.client) {
      this.client = getGpuClient();
      await this.client.start();
    }

    this.initialized = true;

    console.error("[GpuWorkerBackend] Initialized:", {
      device: this.deviceInfo.deviceName || "Unknown",
      computeCapability: this.deviceInfo.computeCapability || "N/A",
      memoryMB: this.deviceInfo.totalMemoryMB || 0,
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
    if (!this.client || !this.initialized) {
      throw new Error("GpuWorkerBackend not initialized");
    }

    return this.client.cudaCosineSimilarity(a, b);
  }

  async batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array> {
    if (!this.client || !this.initialized) {
      throw new Error("GpuWorkerBackend not initialized");
    }

    return this.client.cudaBatchCosineSimilarity(query, database);
  }

  async close(): Promise<void> {
    this.initialized = false;
    await shutdownGpuClient();
    this.client = null;
    console.error("[GpuWorkerBackend] Closed");
  }
}
