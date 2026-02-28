---
module_name: gpu
description: "Unified GPU worker for FAISS vector indexing and CUDA similarity operations"
status: active
language: typescript
---

# GPU

> Provides a unified GPU client that combines FAISS vector indexing and CUDA similarity operations, with runtime-aware execution (direct for Node.js, subprocess for Bun) and CPU fallback.

## Overview

The gpu module implements a unified GPU worker architecture that combines FAISS (vector indexing) and CUDA (similarity computation) operations in a single interface. Under Node.js, faiss-napi is used directly; under Bun, a Node.js subprocess handles NAPI-dependent operations via Named Pipe IPC. The module includes adaptive thresholds that dynamically choose between CPU and GPU execution based on vector count and dimensions. CUDA operations include cosine similarity, batch cosine similarity, Euclidean distance, and vector normalization. The module also supports an embeddings pipeline for unified vector + content storage.

## Data Flow

- **Inputs**: FAISS index configuration, vectors (Float32Array/number[]), query vectors, CUDA operation parameters.
- **Processing**: GpuClient routes requests to direct NAPI calls (Node.js) or subprocess via Named Pipe IPC (Bun); adaptive thresholds select CPU vs GPU execution path.
- **Outputs**: FAISS search results (id, distance, score), CUDA similarity scores, normalized vectors, comprehensive statistics.

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `getGpuClient` | function | Singleton factory for IGpuClient (auto-detects runtime) | [`gpu-client.ts`](./gpu-client.ts) |
| `shutdownGpuClient` | function | Graceful shutdown of GPU worker | [`gpu-client.ts`](./gpu-client.ts) |
| `IGpuClient` | interface | Unified interface for FAISS + CUDA + embeddings operations | [`gpu-client.ts`](./gpu-client.ts) |
| `GpuWorkerRequest` | type | Union of all IPC request types (FAISS, CUDA, embeddings, lifecycle) | [`types.ts:179-213`](./types.ts) |
| `GpuWorkerResponse` | type | Union of all IPC response types | [`types.ts:393-428`](./types.ts) |
| `FaissIndexConfig` | interface | FAISS index configuration (dimensions, type, HNSW/IVF params) | [`types.ts:14-26`](./types.ts) |
| `FaissSearchResult` | interface | Search result with id, distance, and normalized score | [`types.ts:223-227`](./types.ts) |
| `CudaDeviceInfo` | interface | CUDA device information (name, compute capability, memory) | [`types.ts:32-38`](./types.ts) |
| `GpuStatsResponse` | interface | Combined FAISS + CUDA statistics | [`types.ts:373-387`](./types.ts) |
| `GpuWorkerState` | interface | Complete worker state including FAISS, CUDA, and content cache | [`types.ts:430-447`](./types.ts) |

## Dependencies

### Internal Modules

| Module | Purpose |
|--------|---------|
| `logging` | Structured logging |
| `shared/storage-paths` | Data directory resolution |
| `utils/simd-vector-ops` | CPU fallback for cosine similarity and L2 normalization |
| `utils/runtime` | Runtime detection and sleep utility |

### External Packages

| Package | Purpose |
|---------|---------|
| `faiss-napi` | FAISS NAPI bindings (loaded in worker or direct client) |
| CUDA addon | Optional native CUDA module for GPU-accelerated similarity |

## Behavioral Properties

| Property | Value |
|----------|-------|
| IPC transport | Named Pipes (Windows) / Unix domain sockets (Linux/macOS) |
| CUDA Blackwell support | Automatically skipped for compute capability >= 12.0 |
| CPU fallback | Automatic when CUDA is unavailable; uses SIMD-optimized operations |

## Error Handling

GPU client gracefully degrades to CPU when CUDA is unavailable or fails to initialize. Named Pipe transport implements reconnection logic for subprocess communication failures. Subprocess crashes are detected and logged. All GPU operations return typed error responses rather than throwing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bun MCP Process                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ vector-store │───▶│ gpu-client   │    │ OVMS Native  │      │
│  │ pattern-search│───▶│ (unified)    │    │ (embeddings) │      │
│  │ semantic-merge│───▶│              │    └──────────────┘      │
│  └──────────────┘    └──────┬───────┘                          │
│                             │ spawn("node")                     │
└─────────────────────────────┼───────────────────────────────────┘
                              │ IPC (stdin/stdout JSON)
┌─────────────────────────────▼───────────────────────────────────┐
│                  Node.js GPU Worker                             │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ CUDA Module         │  │ faiss-node          │              │
│  │ (similarity ops)    │  │ (vector indexing)   │              │
│  │                     │  │                     │              │
│  │ - cosineSimilarity  │  │ - init/add/search   │              │
│  │ - batchCosine       │  │ - batchSearch       │              │
│  │ - euclidean         │  │ - train/save/load   │              │
│  │ - normalize         │  │                     │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## IPC Protocol

### CUDA commands
```typescript
type CudaCommands =
  | { type: "cuda.info" }
  | { type: "cuda.cosine"; a: number[]; b: number[] }
  | { type: "cuda.batchCosine"; query: number[]; database: number[][] }
  | { type: "cuda.euclidean"; a: number[]; b: number[] }
  | { type: "cuda.normalize"; vectors: number[][] };
```

### Faiss commands
```typescript
type FaissCommands =
  | { type: "faiss.init"; config: FaissIndexConfig; loadPath?: string }
  | { type: "faiss.add"; ids: string[]; vectors: number[] }
  | { type: "faiss.search"; vector: number[]; k: number }
  | { type: "faiss.batchSearch"; vectors: number[]; nQueries: number; k: number }
  | { type: "faiss.train"; vectors: number[]; nVectors: number }
  | { type: "faiss.save"; path: string }
  | { type: "faiss.load"; path: string }
  | { type: "faiss.remove"; ids: string[] }
  | { type: "faiss.stats" };
```

## Known Limitations

- CUDA addon is not compatible with NVIDIA Blackwell architecture (compute capability >= 12.0).
- Named Pipe IPC adds serialization overhead for large vector batches compared to direct calls.
- Single GPU worker process may become a bottleneck under very high concurrency.

## Exports



## Files

| File | Description |
|------|-------------|
| `adaptive-thresholds.ts` | Dynamic CPU vs GPU threshold selection based on vector dimensions and batch size |
| `cuda-handlers.ts` | CUDA operation handlers for cosine, euclidean, normalization, and batch operations |
| `embeddings-handlers.ts` | Embeddings pipeline handlers for unified vector + content storage |
| `faiss-handlers.ts` | FAISS operation handlers for init, add, search, save, load, and remove |
| `gpu-client.ts` | Runtime-aware IGpuClient with direct (Node.js) and subprocess (Bun) modes |
| `gpu-worker.ts` | Node.js subprocess entry point combining FAISS and CUDA modules |
| `index.ts` | Re-exports gpu-client and types |
| `named-pipe-transport.ts` | Named Pipe / Unix socket IPC transport with packet framing |
| `request-helpers.ts` | Request serialization helpers for Float32Array and batch vectors |
| `type-guards.ts` | Type guard utilities for GPU response types |
| `types.ts` | Complete IPC protocol types for FAISS, CUDA, embeddings, and lifecycle operations |
