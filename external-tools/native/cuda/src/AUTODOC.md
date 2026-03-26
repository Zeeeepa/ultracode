# external-tools/native/cuda/src

## Overview

This module implements a Node.js native addon providing GPU-accelerated vector search and similarity operations using CUDA and FAISS (Facebook AI Similarity Search). It exposes CPU and GPU implementations of Inverted File (IVF) indexing, allowing JavaScript applications to perform efficient vector operations on large datasets with both CPU fallback and GPU acceleration paths. The module bridges the NAPI layer with FAISS library implementations, managing GPU resources and handling index lifecycle operations.

## Flow

```
JavaScript API
     ↓
NAPI Binding Layer (binding.cpp)
     ↓
Operation Router
   ↙         ↘
CPU IVF     GPU IVF
(cpu_ivf)   (gpu_ivf)
   ↘         ↙
FAISS Index Backend
     ↓
Vector Operations
(train/add/search/delete)
     ↓
Index Results
```

## Entity Listing

### Main Class

- **CUDAVectorOps** `binding.h:10-29` — Node.js native addon class binding vector operations to JavaScript and managing initialization.

### Data Structures

- **FaissIndexEntry** `cpu_ivf_ops.cpp:41-48` — Container for CPU-side FAISS index metadata and state.
- **FloatData** `cpu_ivf_ops.cpp:68-71` — Float vector data buffer structure for holding training and query vectors.
- **GpuIndexEntry** `gpu_ivf_ops.cpp:40-48` — GPU device memory representation of FAISS index with CUDA-specific state.

### NAPI Module Initialization & Exports

- **Init function** `binding.cpp:12-26` — Initializes the native module and registers NAPI method exports.
- **Exported method** `binding.cpp:259-259` — NAPI export for CPU IVF training operation.
- **Exported method** `binding.cpp:260-260` — NAPI export for CPU IVF add/insert operation.
- **Exported method** `binding.cpp:261-261` — NAPI export for CPU IVF search operation.
- **Exported method** `binding.cpp:262-262` — NAPI export for CPU IVF delete operation.
- **Exported method** `binding.cpp:263-263` — NAPI export for CPU IVF index save operation.
- **Exported method** `binding.cpp:264-264` — NAPI export for CPU IVF index load operation.
- **Exported method** `binding.cpp:265-265` — NAPI export for GPU IVF training operation.
- **Exported method** `binding.cpp:266-266` — NAPI export for GPU IVF add/insert operation.
- **Exported method** `binding.cpp:267-267` — NAPI export for GPU IVF search operation.
- **Exported method** `binding.cpp:268-268` — NAPI export for GPU IVF delete operation.
- **Exported method** `binding.cpp:269-269` — NAPI export for GPU IVF index save operation.
- **Exported method** `binding.cpp:276-285` — Collection of additional NAPI method exports for resource management and utility operations.

### NAPI Binding Functions

#### JavaScript-to-C++ Bridges (binding.cpp)

- **Constructor wrapper** `binding.cpp:39-66` — NAPI constructor that initializes CUDAVectorOps instance from JavaScript.
- **Method binding** `binding.cpp:73-140` — NAPI wrapper for a core vector operation with parameter marshalling and error handling.
- **Method binding** `binding.cpp:147-171` — NAPI wrapper for index manipulation with result conversion to JavaScript.
- **Method binding** `binding.cpp:178-223` — NAPI wrapper for bulk vector operations with data transfer management.
- **Method binding** `binding.cpp:230-251` — NAPI wrapper for query/search operations with output formatting.
- **Registration helper** `binding.cpp:292-331` — Helper function that registers all NAPI methods on the class prototype.

#### CPU IVF Operations (cpu_ivf_ops.cpp)

- **Vector preprocessor** `cpu_ivf_ops.cpp:56-63` — Macro for normalizing and preparing float vectors for CPU IVF indexing.
- **Data buffer handler** `cpu_ivf_ops.cpp:73-89` — Function managing float vector memory allocation and data copying for CPU operations.
- **IVF trainer** `cpu_ivf_ops.cpp:98-152` — NAPI wrapper that trains a CPU-side FAISS IVF index on vector data.
- **Index writer** `cpu_ivf_ops.cpp:158-186` — NAPI wrapper that adds vectors to a trained CPU IVF index.
- **Index searcher** `cpu_ivf_ops.cpp:192-220` — NAPI wrapper that performs k-nearest neighbor search on CPU IVF index.
- **Index deleter** `cpu_ivf_ops.cpp:227-277` — NAPI wrapper that removes vectors from CPU IVF index by ID.
- **Index persister** `cpu_ivf_ops.cpp:283-339` — NAPI wrapper that saves CPU IVF index state to file.
- **Index loader** `cpu_ivf_ops.cpp:345-365` — NAPI wrapper that restores CPU IVF index state from file.
- **Index metadata** `cpu_ivf_ops.cpp:371-418` — NAPI wrapper that retrieves CPU IVF index statistics (size, dimensions, state).
- **Index cleaner** `cpu_ivf_ops.cpp:424-434` — NAPI wrapper that clears or resets CPU IVF index.
- **Index validator** `cpu_ivf_ops.cpp:441-459` — NAPI wrapper that verifies CPU IVF index integrity and validity.
- **Batch searcher** `cpu_ivf_ops.cpp:465-515` — NAPI wrapper that performs batch search queries on CPU IVF index with aggregated results.

#### GPU IVF Operations (gpu_ivf_ops.cpp)

- **GPU init helper** `gpu_ivf_ops.cpp:56-62` — Ensures CUDA device is available and GPU memory is allocated for IVF operations.
- **Device selector** `gpu_ivf_ops.cpp:64-68` — Selects and configures the active CUDA device for index operations.
- **GPU IVF trainer** `gpu_ivf_ops.cpp:78-128` — NAPI wrapper that trains a GPU-accelerated FAISS IVF index on vector data.
- **GPU index writer** `gpu_ivf_ops.cpp:133-159` — NAPI wrapper that adds vectors to trained GPU IVF index with CUDA transfers.
- **GPU index searcher** `gpu_ivf_ops.cpp:164-191` — NAPI wrapper that performs k-nearest neighbor search on GPU IVF index.
- **GPU index deleter** `gpu_ivf_ops.cpp:197-242` — NAPI wrapper that removes vectors from GPU IVF index by ID.
- **GPU index persister** `gpu_ivf_ops.cpp:248-290` — NAPI wrapper that saves GPU IVF index state to file with device-to-host transfer.
- **GPU index loader** `gpu_ivf_ops.cpp:296-322` — NAPI wrapper that restores GPU IVF index state from file with host-to-device transfer.
- **GPU index metadata** `gpu_ivf_ops.cpp:328-377` — NAPI wrapper that retrieves GPU IVF index statistics and device memory usage.
- **GPU index cleaner** `gpu_ivf_ops.cpp:383-393` — NAPI wrapper that clears GPU IVF index and frees device memory.
- **GPU batch searcher** `gpu_ivf_ops.cpp:399-433` — NAPI wrapper that performs batch search queries on GPU IVF index with aggregated results.

### Class Methods

- **Constructor** `binding.h:12-12` — Initializes CUDAVectorOps with default GPU/CPU configuration.
- **CPU operation handler** `binding.h:19-19` — Routes operations to CPU IVF implementation path.
- **GPU operation handler** `binding.h:20-20` — Routes operations to GPU IVF implementation path.
- **Resource manager** `binding.h:21-21` — Manages CUDA device memory and GPU resource lifecycle.
- **Configuration setter** `binding.h:24-24` — Sets module-level configuration for device selection and memory limits.

### Module Constants

- **Module marker** `binding.h:6-7` — Define constants for module identification and version tagging.

## Dependencies

**External Libraries:**
- FAISS — Facebook AI Similarity Search library for vector indexing and search
- CUDA Runtime — NVIDIA GPU compute platform and API
- Node-API (NAPI) — Node.js native addon interface for JavaScript/C++ interop

**Internal:**
- Shared GPU resource management across CPU and GPU implementations
- FAISS index lifecycle management (train → add → search → persist)