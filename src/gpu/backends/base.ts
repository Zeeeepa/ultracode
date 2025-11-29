/**
 * GPU Backend Interface
 *
 * Abstract interface for different vector operation backends:
 * - CUDA (NVIDIA GPU, highest performance)
 * - Metal (Apple Silicon GPU, macOS ARM64)
 * - WebGPU (Universal GPU, all vendors)
 * - WASM SIMD (CPU SIMD, portable)
 * - Pure JS (CPU baseline, always available)
 */

export interface VectorBackend {
  readonly name: string;
  readonly type: "cuda" | "metal" | "webgpu" | "wasm" | "js";
  readonly priority: number; // Higher = better performance (100 = CUDA, 95 = Metal, 80 = WebGPU, 50 = WASM, 1 = JS)

  // Lifecycle
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): BackendCapabilities;
  close(): Promise<void>;

  // Vector operations
  cosineSimilarity(a: Float32Array, b: Float32Array): Promise<number>;
  batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array>;

  // Memory management (optional, for GPU backends)
  uploadVectors?(vectors: Float32Array[]): Promise<GPUBuffer>;
  releaseBuffer?(buffer: GPUBuffer): Promise<void>;
}

export interface BackendCapabilities {
  maxVectorCount: number; // Max vectors per batch
  maxDimension: number; // Max vector dimension
  supportsBatching: boolean;
  supportsAsync: boolean;
  memoryMB: number; // Available memory (0 for CPU)
}

export interface GPUBuffer {
  id: string;
  size: number;
  backend: string;
  handle?: unknown; // Backend-specific handle
}
