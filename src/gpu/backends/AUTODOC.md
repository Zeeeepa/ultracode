---
module_name: backends
description: "Vector operation backends for cosine similarity and batch operations across CUDA, Metal, WebGPU, WASM, and JS"
status: active
language: typescript
---

# Backends

> Pluggable vector operation backends providing cosine similarity, batch cosine similarity, and vector normalization across CUDA, Metal, WebGPU, WASM SIMD, and pure JavaScript fallback.

## Overview

The backends module implements the `VectorBackend` interface across six different compute backends, each with a priority level for automatic selection. The highest-priority available backend is chosen at runtime via `BackendSelector`. CUDA provides maximum performance on NVIDIA GPUs, with a GPU Worker subprocess variant for Bun runtime compatibility. Metal supports Apple Silicon, WebGPU covers all GPU vendors, WASM SIMD provides portable CPU acceleration, and JS serves as the universal fallback.

## Data Flow

- **Inputs:** Float32Array vectors (query and database vectors) from the semantic search system.
- **Processing:** Backend-specific cosine similarity computation -- CUDA native addon, Metal shaders, WebGPU compute shaders, WASM SIMD instructions, or JS loops.
- **Outputs:** Similarity scores as numbers or Float32Array batches.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `VectorBackend` | interface | Common contract for all vector backends | [`base.ts:12-30`](./base.ts) |
| `BackendCapabilities` | interface | Backend memory and batching capabilities | [`base.ts:32-38`](./base.ts) |
| `GPUBuffer` | interface | Backend-specific GPU buffer handle | [`base.ts:40-45`](./base.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `gpu/detection` | GPU capability detection for backend availability checks |
| `logging` | Performance and availability logging |

### External Packages

| Package | Purpose |
|---------|---------|
| `webgpu` | WebGPU/Dawn bindings for Node.js (optional) |
| Native CUDA addon | NAPI-based CUDA vector operations (optional) |

## Architecture

```
                    VectorBackend (interface)
                           │
    ┌──────────┬───────────┼───────────┬───────────┬──────────┐
    │          │           │           │           │          │
    ▼          ▼           ▼           ▼           ▼          ▼
 CudaBackend  GpuWorker   Metal     WebGPU      WASM       JS
             Backend     Backend    Backend    Backend   Backend
    │          │
    │          │ (Bun runtime)
    │          ▼
    │     gpu-worker.ts (Node.js subprocess)
    │          │
    └──────────┴─► CUDA native addon
```

## VectorBackend Interface

```typescript
interface VectorBackend {
  readonly name: string;
  readonly priority: number;
  isAvailable(): Promise<boolean>;
  cosineSimilarity(a: Float32Array, b: Float32Array): Promise<number>;
  batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array>;
  euclideanDistance(a: Float32Array, b: Float32Array): Promise<number>;
  normalizeVectors(vectors: Float32Array[]): Promise<Float32Array[]>;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
```

## Selection Priorities

| Condition | Selected Backend |
|---------|-------------------|
| Node.js + CUDA + CC < 12.0 | CudaBackend (100) |
| Bun + CUDA available | GpuWorkerBackend (100) |
| Node.js + CUDA available | GpuWorkerBackend (98) |
| macOS + Apple Silicon | MetalBackend (95) |
| WebGPU available | WebGpuBackend (90) |
| WASM SIMD support | WasmBackend (80) |
| Fallback | JsBackend (10) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Backend priorities | CUDA: 100, GpuWorker: 98-100, Metal: 95, WebGPU: 90, WASM: 80, JS: 10 |
| Bun compatibility | GpuWorkerBackend uses Node.js subprocess for CUDA in Bun |
| Blackwell safety | WebGPU auto-disabled for NVIDIA CC >= 12.0 |

## Error Handling

Each backend's `isAvailable()` catches all errors and returns `false` if the backend cannot initialize. The `BackendSelector` iterates through backends by descending priority until one succeeds. GPU Worker Backend handles subprocess IPC failures gracefully with automatic cleanup.

## Known Limitations

- CUDA backend requires native addon compilation and only works in Node.js (not Bun directly).
- WebGPU crashes on NVIDIA Blackwell architecture (RTX 50xx) due to Dawn limitations.
- WASM SIMD requires the external wasm module in `external-tools/wasm/vector-ops-simd/`.

## Files

| File | Description |
|------|-------------|
| `base.ts` | `VectorBackend`, `BackendCapabilities`, and `GPUBuffer` interface definitions |
| `cuda-backend.ts` | CUDA via native NAPI addon (Node.js only, priority 100) |
| `gpu-worker-backend.ts` | CUDA via Node.js subprocess for Bun compatibility (priority 98-100) |
| `metal-backend.ts` | Metal API for Apple Silicon macOS (priority 95) |
| `webgpu-backend.ts` | WebGPU API for all GPU vendors (priority 90) |
| `wasm-backend.ts` | WebAssembly with 128-bit SIMD optimizations (priority 80) |
| `js-backend.ts` | Pure JavaScript fallback, always available (priority 10) |
