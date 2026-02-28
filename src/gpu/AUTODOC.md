---
module_name: gpu
description: GPU-accelerated vector operations with automatic backend selection and graceful degradation
status: stable
language: TypeScript
entry_point: backend-selector.ts
exports:
  - BackendSelector
  - VectorBackend
  - BackendCapabilities
  - GPUBuffer
  - GPUInfo
  - GPUDetector
  - WEBGPU_UNSAFE_MIN_CC
  - WEBGPU_UNSTABLE_ARCHITECTURES
dependencies:
  - node:os
  - node:child_process
  - webgpu (optional)
  - logging
  - semantic/gpu/gpu-client
  - utils/simd-vector-ops
tags:
  - gpu
  - cuda
  - metal
  - webgpu
  - wasm
  - vector-ops
  - cosine-similarity
  - backend-selector
---

## Overview

The `gpu` module abstracts GPU-accelerated vector operations (cosine similarity, batch cosine similarity,
euclidean distance) behind a unified `VectorBackend` interface. `BackendSelector` (singleton) automatically
detects available hardware via `GPUDetector` and selects the highest-priority backend. Six backends are
supported: CUDA Native, CUDA Worker (Bun-compatible subprocess), Metal (Apple Silicon), WebGPU (universal),
WASM SIMD (CPU), and Pure JS (fallback). The module is runtime-aware (Node.js vs Bun), handles Blackwell
(RTX 50xx) incompatibilities, and degrades gracefully through the priority chain.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BackendSelector                              │
│  ┌──────────────┐                                               │
│  │ detectGPU()  │ ── analysis of available GPUs and APIs        │
│  │ getBestBackend() │ ── selection of optimal backend           │
│  └──────────────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    VectorBackend                            ││
│  │  - cosineSimilarity(a, b)                                   ││
│  │  - batchCosineSimilarity(query, database)                   ││
│  │  - euclideanDistance(a, b)                                  ││
│  │  - normalizeVectors(vectors)                                ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                        │
│         ├── CudaBackend (priority 100) ── Node.js native         │
│         ├── GpuWorkerBackend (priority 98-100) ── Bun via subprocess│
│         ├── MetalBackend (priority 95) ── Apple Silicon          │
│         ├── WebGpuBackend (priority 80) ── Browser/Deno          │
│         ├── WasmBackend (priority 50) ── SIMD optimized          │
│         └── JsBackend (priority 1) ── fallback                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
BackendSelector.initialize()
  │
  ├─ GPUDetector.detect() ─► nvidia-smi / native addon / WebGPU adapter
  │     └─ returns GPUInfo { vendor, model, cc, cuda, webgpu }
  │
  ├─ Build candidates list sorted by priority
  │
  └─ For each candidate:
       ├─ factory() ─► dynamic import of backend module
       ├─ isAvailable() ─► hardware/runtime check
       ├─ initialize() ─► load native addon / WGSL shader / WASM
       └─ on failure ─► log warning, try next candidate
```

```
Bun Process                           Node.js Subprocess
┌─────────────────┐                   ┌─────────────────┐
│ GpuWorkerBackend│   IPC JSON        │ gpu-worker.ts   │
│                 │ ──────────────►   │  - CUDA addon   │
│ cosineSimilarity│                   │  - faiss-node   │
└─────────────────┘                   └─────────────────┘
```

## Public API

| Export | Type | Description | Source |
|--------|------|-------------|--------|
| `BackendSelector` | class | Singleton selector with priority-based backend selection | [`backend-selector.ts:30-235`](./backend-selector.ts) |
| `BackendSelector.getInstance()` | static | Get or create singleton instance | [`backend-selector.ts:37-42`](./backend-selector.ts) |
| `BackendSelector.initialize()` | async | Detect GPU, select and initialize optimal backend | [`backend-selector.ts:47-177`](./backend-selector.ts) |
| `BackendSelector.getBackend()` | method | Return current selected backend | [`backend-selector.ts:182-184`](./backend-selector.ts) |
| `BackendSelector.switchBackend(type)` | async | Force-switch to a specific backend type | [`backend-selector.ts:190-202`](./backend-selector.ts) |
| `BackendSelector.getAvailableBackends()` | method | List all initialized backends | [`backend-selector.ts:207-209`](./backend-selector.ts) |
| `BackendSelector.getInfo()` | method | Diagnostic info: selected + available backends | [`backend-selector.ts:214-217`](./backend-selector.ts) |
| `BackendSelector.close()` | async | Cleanup all backends and release resources | [`backend-selector.ts:227-234`](./backend-selector.ts) |
| `VectorBackend` | interface | Unified interface for all backends | [`backends/base.ts:12-30`](./backends/base.ts) |
| `BackendCapabilities` | interface | Capabilities report (maxVectorCount, maxDimension, etc.) | [`backends/base.ts:32-38`](./backends/base.ts) |
| `GPUBuffer` | interface | GPU buffer handle with metadata | [`backends/base.ts:40-45`](./backends/base.ts) |
| `GPUInfo` | interface | GPU detection result (vendor, model, CC, memory) | [`detection/gpu-detector.ts:72-81`](./detection/gpu-detector.ts) |
| `GPUDetector` | class | Singleton GPU detection with caching | [`detection/gpu-detector.ts:83-396`](./detection/gpu-detector.ts) |
| `GPUDetector.detect()` | static async | Detect all GPU capabilities (cached per-process) | [`detection/gpu-detector.ts:89-167`](./detection/gpu-detector.ts) |
| `GPUDetector.isWebGPUSafe(info)` | static | Check if WebGPU is safe for given GPU (Blackwell filter) | [`detection/gpu-detector.ts:173-173`](./detection/gpu-detector.ts) |
| `GPUDetector.checkBackendAvailability(type)` | static async | Check if a specific backend type is likely available | [`detection/gpu-detector.ts:327-340`](./detection/gpu-detector.ts) |
| `GPUDetector.clearCache()` | static | Clear cached GPU info (for testing) | [`detection/gpu-detector.ts:345-347`](./detection/gpu-detector.ts) |
| `GPUDetector.testWebGPUCompatibility()` | static async | Test WebGPU safety without loading Dawn | [`detection/gpu-detector.ts:360-367`](./detection/gpu-detector.ts) |
| `WEBGPU_UNSAFE_MIN_CC` | const | Minimum CC that causes WebGPU/Dawn crashes (12.0) | [`detection/gpu-detector.ts:31-31`](./detection/gpu-detector.ts) |
| `WEBGPU_UNSTABLE_ARCHITECTURES` | const | Known unstable GPU architectures for WebGPU | [`detection/gpu-detector.ts:36-36`](./detection/gpu-detector.ts) |

## Dependencies

| Dependency | Type | Used By |
|------------|------|---------|
| `node:os` | built-in | `backend-selector.ts` (platform, arch detection) |
| `node:child_process` | built-in | `gpu-detector.ts` (nvidia-smi via execSync) |
| `webgpu` | npm, optional | `gpu-detector.ts`, `webgpu-backend.ts` (Dawn bindings) |
| `../logging/index.js` | internal | All files (contextual logging) |
| `../../semantic/gpu/gpu-client.js` | internal | `gpu-worker-backend.ts` (IPC to Node.js subprocess) |
| `../../utils/simd-vector-ops.js` | internal | `js-backend.ts` (optimized loop-unrolled cosine) |
| Native `.node` addons | build artifact | `cuda-backend.ts`, `metal-backend.ts` (N-API) |
| Rust WASM module | build artifact | `wasm-backend.ts` (wasm-pack output) |

## Configuration

| Environment Variable | Effect |
|---------------------|--------|
| `CUDA_FORCE_DISABLE=1` | Skip CUDA backend even if NVIDIA GPU is detected |
| `WEBGPU_FORCE_ENABLE=1` | Force-enable WebGPU even on Blackwell (CC >= 12.0) |
| `WEBGPU_FORCE_DISABLE=1` | Force-disable WebGPU detection entirely |
| `BUNDLED=1` | Skip native addon loading, use nvidia-smi CLI only |

## Behavioral Properties

| Property | Detail |
|----------|--------|
| Singleton pattern | `BackendSelector` and `GPUDetector` both cache per-process |
| Lazy initialization | Backends are only loaded on `initialize()`, not on construction |
| Two-phase init | Each backend goes through `isAvailable()` then `initialize()` |
| Runtime-aware | Bun gets `GpuWorkerBackend` (priority 100); Node.js gets `CUDABackend` (priority 100) |
| IPC for Bun | `GpuWorkerBackend` routes CUDA ops through a Node.js subprocess via `gpu-client` |
| Batch optimization | WebGPU and WASM use vector flattening for GPU-optimal batch operations |
| Memory reporting | Each backend reports `maxVectorCount`, `maxDimension`, `memoryMB` |

## Runtime-Aware Backend Selection

| Runtime | CUDA Available | Selected Backend |
|---------|---------------|------------------|
| Node.js | Yes | CudaBackend (native) |
| Node.js | No | WasmBackend / JsBackend |
| Bun | Yes | GpuWorkerBackend (subprocess) |
| Bun | No | WasmBackend / JsBackend |
| Browser | WebGPU | WebGpuBackend |
| Browser | No WebGPU | WasmBackend / JsBackend |

## Error Handling

**Fallback chain** (each failure triggers the next candidate):

```
CUDA Native (100) ──fail──► CUDA Worker (98/100) ──fail──► Metal (95)
  ──fail──► WebGPU (80) ──fail──► WASM SIMD (50) ──fail──► Pure JS (1)
```

- Every `candidate.factory()` call is wrapped in try-catch; failures log a warning and continue.
- Native addon loading tries multiple paths (external-libs, dist/native, build/Release).
- `nvidia-smi` runs with `timeout: 2000ms`, `windowsHide: true`, stderr suppressed.
- WebGPU adapter request returns null gracefully if no GPU adapter is found.
- `GpuWorkerBackend` IPC errors (client.start failure) cause fallback to next backend.
- If all backends fail, an Error is thrown (theoretically impossible since JS is always available).

**Blackwell (RTX 50xx) special handling:**
`GPUDetector.isWebGPUSafe()` checks CC >= 12.0. When detected, WebGPU is excluded from candidates
to prevent Dawn crashes. Override with `WEBGPU_FORCE_ENABLE=1`.

## Observability

Logging uses contextual prefixes via the `log` module:

| Prefix | Scope | Key Events |
|--------|-------|------------|
| `GPUBACKEND` | backend-selector | `detecting_gpu`, `backend_selected`, `capabilities`, `backend_init_fail` |
| `GPUDETECT` | gpu-detector | `cuda_found`, `webgpu_avail`, `webgpu_skipped`, `webgpu_forced` |
| `CUDABACKEND` | cuda-backend | Addon loading, device info |
| `GPUWORKER` | gpu-worker-backend | IPC start, CUDA info relay |
| `METALBACKEND` | metal-backend | Addon loading, device info |
| `WEBGPUBACKEND` | webgpu-backend | Adapter request, shader compilation |
| `WASMBACKEND` | wasm-backend | Module loading |
| `JSBACKEND` | js-backend | Initialization |

Diagnostic methods: `BackendSelector.getInfo()`, `GPUDetector.getCachedInfo()`,
`GPUDetector.testWebGPUCompatibility()`.

## Known Limitations

| Limitation | Description |
|------------|-------------|
| Blackwell incompatibility | RTX 50xx (CC 12.0+) crashes Dawn/WebGPU and CUDA native addon |
| Bun NAPI gap | Bun cannot load N-API addons directly; requires Node.js subprocess |
| Per-process GPU cache | GPU info is cached once; hot-plugging GPUs is not detected |
| WebGPU shader scope | WGSL compute shader is specialized for batch cosine similarity only |
| Metal platform lock | Metal backend requires macOS ARM64 (Apple Silicon only) |
| WASM synchronous | WASM backend has `supportsAsync: false` |
| WebGPU workgroup limit | 256 threads per workgroup in compute shader |
| nvidia-smi dependency | GPU detection without native addon requires nvidia-smi in PATH |
| Float32Array conversion | CUDA and Metal require `Array.from()` conversion (minor perf cost) |

## TypeScript Notes

- `VectorBackend` interface enforces strict typing for all backends with required lifecycle methods.
- `CUDAAddon["getDeviceInfo"]` uses conditional type inference for device info typing.
- Native addon interfaces (`CUDAAddon`, `MetalAddon`) are declared locally, not exported.
- All vector operations return `Promise` even when synchronous (unified async API).
- WebGPU types (`GPUAdapter`, `GPU`, etc.) are declared locally to avoid global type conflicts.
- `type` field uses `as const` assertions for discriminated union support.

## Files

| File | Lines | Description |
|------|-------|-------------|
| [`backend-selector.ts`](./backend-selector.ts) | 236 | Singleton selector with priority-based auto-detection |
| [`backends/base.ts`](./backends/base.ts) | 46 | VectorBackend, BackendCapabilities, GPUBuffer interfaces |
| [`backends/cuda-backend.ts`](./backends/cuda-backend.ts) | 184 | CUDA Native via N-API (Node.js only, priority 100) |
| [`backends/gpu-worker-backend.ts`](./backends/gpu-worker-backend.ts) | 118 | CUDA via Node.js subprocess IPC (Bun-compatible, priority 98/100) |
| [`backends/js-backend.ts`](./backends/js-backend.ts) | 57 | Pure JS with loop unrolling fallback (priority 1) |
| [`backends/metal-backend.ts`](./backends/metal-backend.ts) | 180 | Metal Native via N-API (Apple Silicon, priority 95) |
| [`backends/wasm-backend.ts`](./backends/wasm-backend.ts) | 100 | WASM SIMD via Rust wasm-pack (priority 50) |
| [`backends/webgpu-backend.ts`](./backends/webgpu-backend.ts) | 401 | WebGPU Compute with WGSL shader (universal, priority 80) |
| [`detection/gpu-detector.ts`](./detection/gpu-detector.ts) | 403 | GPU detection, Blackwell safety, WebGPU compatibility |
