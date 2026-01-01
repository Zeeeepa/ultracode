# Faiss Integration - Implementation Plan

## Overview

Faiss integration for high-performance vector indexing via Node.js subprocess.
Bun MCP spawns Node.js worker with faiss-node for full native compatibility.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Bun MCP Process                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ semantic-    │    │ faiss-       │    │ libsql       │      │
│  │ agent.ts     │───▶│ client.ts    │    │ DiskANN      │      │
│  └──────────────┘    └──────┬───────┘    └──────────────┘      │
│                             │ spawn()                           │
└─────────────────────────────┼───────────────────────────────────┘
                              │ IPC (stdin/stdout JSON)
┌─────────────────────────────▼───────────────────────────────────┐
│                    Node.js Subprocess                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ faiss-       │───▶│ faiss-node   │───▶│ libfaiss.so  │      │
│  │ worker.ts    │    │ (NAPI)       │    │ (C++ native) │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                │                │
│                                          ┌─────▼─────┐          │
│                                          │ OpenMP    │          │
│                                          │ (CPU)     │          │
│                                          └───────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Stage 1: CPU-only via faiss-node ✅ COMPLETE

### Files

- `types.ts` - IPC protocol types
- `faiss-worker.ts` - Node.js worker process
- `faiss-client.ts` - Bun IPC client (runtime-aware: Direct/Subprocess)
- `faiss-provider.ts` - Integration with semantic pipeline

### Features

- [x] IPC protocol definition
- [x] HNSW index support (fast ANN)
- [x] IVF index support (memory efficient)
- [x] IVFPQ index support (compressed)
- [x] OpenMP parallelization (all CPU cores)
- [x] Batch add with 100k+ vectors
- [x] Index persistence (save/load)
- [x] Graceful shutdown (cleanup handlers)
- [x] Hot index (Faiss) + Cold storage (libSQL) hybrid
- [x] Runtime-aware client (FaissDirectClient for Node.js, FaissSubprocessClient for Bun)

### Optimization Parameters

```typescript
{
  // OpenMP - use all cores
  numThreads: os.cpus().length,

  // HNSW (recommended for <1M vectors)
  hnswM: 32,              // connections per layer
  hnswEfConstruction: 200, // build quality
  hnswEfSearch: 64,        // search quality

  // IVF (recommended for >1M vectors)
  ivfNlist: Math.sqrt(n),  // number of clusters
  ivfNprobe: 10-50,        // clusters to search

  // IVFPQ (for memory constraints)
  pqM: 8,                  // subquantizers
  pqNbits: 8,              // bits per code
}
```

## Stage 2: CUDA GPU Support ✅ COMPLETE

### Context

Native CUDA libraries are already built in `external-libs/`:
- `cuda-win32-x64/*.node` - Windows x64 CUDA bindings
- `cuda-linux-x64/*.node` - Linux x64 CUDA bindings

These work under Node.js but fail under Bun due to:
- Missing `process.dlopen` support in Bun
- NAPI compatibility issues with Bun's runtime
- GPU context initialization requires Node.js specific APIs

### Solution: Unified GPU Worker

CUDA operations are now handled via the GPU Worker subprocess, enabling CUDA acceleration under Bun.

### Existing CUDA Code Locations

- `src/gpu/backends/cuda-backend.ts` - CUDA backend implementation (Node.js native)
- `src/gpu/backends/gpu-worker-backend.ts` - CUDA via worker (Bun compatible)
- `external-tools/native/cuda/` - Native CUDA source code
- `external-libs/cuda-*/` - Prebuilt CUDA binaries

### Completed Features

- [x] CUDA detection in gpu-worker.ts
- [x] Reuse existing CUDA modules from `external-libs/`
- [x] CUDA operations via IPC: `cuda.cosine`, `cuda.batchCosine`, `cuda.euclidean`, `cuda.normalize`, `cuda.info`
- [x] Blackwell architecture (CC >= 12.0) compatibility check

## Stage 2.5: Unified GPU Worker ✅ COMPLETE

### Motivation

Instead of separate workers for Faiss and CUDA, created **one unified GPU worker** that handles ALL GPU operations:

1. **CUDA similarity** - existing native module doesn't work in Bun ✅
2. **Faiss indexing** - faiss-node requires Node.js ✅

**Note**: Embeddings generation stays with OVMS native (fastest option, already implemented).

### Architecture (Implemented)

```
┌─────────────────────────────────────────────────────────────┐
│                    Bun MCP Process                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ vector-store │───▶│ gpu-client   │    │ OVMS Native  │  │
│  │ pattern-search│───▶│ (unified)    │    │ (embeddings) │  │
│  │ semantic-merge│───▶│              │    └──────────────┘  │
│  └──────────────┘    └──────┬───────┘                      │
│                             │ spawn("node")                 │
└─────────────────────────────┼───────────────────────────────┘
                              │ IPC (stdin/stdout JSON)
┌─────────────────────────────▼───────────────────────────────┐
│                  Node.js GPU Worker                         │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ CUDA Module         │  │ faiss-node          │          │
│  │ (similarity ops)    │  │ (vector indexing)   │          │
│  └─────────────────────┘  └─────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### New Files Created

- `src/semantic/gpu/types.ts` - Unified IPC protocol types
- `src/semantic/gpu/gpu-worker.ts` - Node.js subprocess with Faiss + CUDA
- `src/semantic/gpu/gpu-client.ts` - Runtime-aware client (GpuDirectClient / GpuSubprocessClient)
- `src/semantic/gpu/index.ts` - Module entry point
- `src/gpu/backends/gpu-worker-backend.ts` - VectorBackend implementation using GPU Worker

### IPC Commands (Implemented)

```typescript
type GpuWorkerCommand =
  // CUDA similarity operations
  | { type: "cuda.cosine"; a: number[]; b: number[] }
  | { type: "cuda.batchCosine"; query: number[]; database: number[][] }
  | { type: "cuda.euclidean"; a: number[]; b: number[] }
  | { type: "cuda.normalize"; vectors: number[][] }
  | { type: "cuda.info" }

  // Faiss indexing operations
  | { type: "faiss.init"; config: FaissIndexConfig; loadPath?: string }
  | { type: "faiss.add"; ids: string[]; vectors: number[] }
  | { type: "faiss.search"; vector: number[]; k: number }
  | { type: "faiss.batchSearch"; vectors: number[]; nQueries: number; k: number }
  | { type: "faiss.train"; vectors: number[]; nVectors: number }
  | { type: "faiss.save"; path: string }
  | { type: "faiss.load"; path: string }
  | { type: "faiss.remove"; ids: string[] }
  | { type: "faiss.stats" }

  // Worker lifecycle
  | { type: "stats" }
  | { type: "shutdown" };
```

### Benefits Achieved

1. **Single subprocess** - less overhead than multiple workers ✅
2. **All GPU ops work** - Node.js has full NAPI support ✅
3. **Runtime-aware** - Direct mode for Node.js, Subprocess for Bun ✅
4. **GPU memory management** - one process controls VRAM ✅
5. **Graceful degradation** - CPU fallback if GPU unavailable ✅

### BackendSelector Integration

Updated `src/gpu/backend-selector.ts`:
- Priority 100: CUDA Native (Node.js only)
- Priority 98-100: CUDA Worker (Bun compatible, higher priority under Bun)
- Automatic runtime detection chooses optimal backend

### Completed Tasks

- [x] Merge faiss-worker and CUDA ops into gpu-worker.ts
- [x] Add CUDA module loading in gpu-worker.ts
- [x] Create unified GpuClient with all operations
- [x] Update BackendSelector to prefer GpuWorker for CUDA
- [x] Runtime-aware client selection (Direct/Subprocess)
- [x] Cleanup handlers for worker lifecycle

## Stage 3: Native Bun FFI (Future)

### Goal

Eliminate subprocess overhead by calling libfaiss directly via Bun FFI.

### Challenges

1. **Binary distribution** - need prebuilt libfaiss for all platforms
2. **CUDA integration** - GPU libraries harder to distribute
3. **Testing** - Bun FFI is newer, less battle-tested

### Approach

```typescript
// bun:ffi direct calls
import { dlopen, FFIType, ptr } from "bun:ffi";

const libfaiss = dlopen("libfaiss.so", {
  faiss_IndexFlatL2_new: {
    args: [FFIType.i32],
    returns: FFIType.ptr,
  },
  // ... other symbols
});
```

### TODO for Stage 3

- [ ] Create Bun FFI bindings for Faiss C API
- [ ] Setup binary distribution via optional npm packages
- [ ] Implement lazy download fallback
- [ ] Add graceful degradation to subprocess
- [ ] Benchmark FFI vs subprocess overhead
- [ ] Support CUDA via separate GPU-enabled builds

## Hybrid Architecture (Hot/Cold)

```
New embeddings ──▶ Faiss (hot, in-memory)
                      │
                      │ periodic flush (every N minutes or M vectors)
                      ▼
Old embeddings ──▶ libSQL DiskANN (cold, persistent)

Search = Faiss results + DiskANN results → merge by score
```

### Benefits

- Instant indexing for new files (Faiss in-memory)
- Persistent storage (libSQL on disk)
- Fast search (Faiss for recent, DiskANN for archive)
- Graceful restart (reload from libSQL → rebuild Faiss)

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Add latency | <1ms per vector | Batch mode |
| Search latency | <5ms for k=10 | HNSW index |
| Memory | <2GB for 1M vectors | 768-dim, float32 |
| Indexing throughput | >10k vectors/sec | With OpenMP |

## Dependencies

```json
{
  "optionalDependencies": {
    "faiss-node": "^0.8.0"
  }
}
```

## Related Files

### Faiss Module (Legacy, CPU-only)
- `src/semantic/faiss/types.ts` - Faiss IPC protocol
- `src/semantic/faiss/faiss-worker.ts` - Faiss Node.js worker
- `src/semantic/faiss/faiss-client.ts` - Faiss client (runtime-aware)
- `src/semantic/faiss/faiss-provider.ts` - Hybrid hot/cold provider

### GPU Module (Unified Faiss + CUDA)
- `src/semantic/gpu/types.ts` - GPU Worker IPC protocol
- `src/semantic/gpu/gpu-worker.ts` - Unified Node.js worker (Faiss + CUDA)
- `src/semantic/gpu/gpu-client.ts` - Unified client (runtime-aware)
- `src/semantic/gpu/index.ts` - Module entry point

### GPU Backend Integration
- `src/gpu/backends/cuda-backend.ts` - CUDA backend (Node.js native)
- `src/gpu/backends/gpu-worker-backend.ts` - CUDA backend (via Worker, Bun compatible)
- `src/gpu/backend-selector.ts` - Automatic backend selection

### CUDA Native Modules
- `external-libs/cuda-win32-x64/*.node` - Windows CUDA bindings
- `external-libs/cuda-linux-x64/*.node` - Linux CUDA bindings
