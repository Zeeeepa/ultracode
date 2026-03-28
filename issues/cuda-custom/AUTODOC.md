# cuda-custom

## Overview

The `cuda-custom` module provides a test and validation utility for native CUDA addon support in Node.js and Bun JavaScript runtimes. It detects the active runtime environment, locates the compiled native CUDA addon with fallback resolution logic, and validates GPU device detection capabilities through the native binding. This module serves as a verification point for GPU acceleration functionality within the ultracode ecosystem, with built-in error handling and path hints for addon resolution failures.

## Flow

```
Runtime Detection (Node.js vs Bun)
    ↓
Resolve Addon Path (primary → fallback external-libs)
    ↓
Load Native Module via require()
    ↓
Query GPU Device Info (if available)
    ↓
Report Status (SUCCESS or ERROR with diagnostics)
```

## Entity Listing

**Testing & Validation**

- `test.js:1-1322` — Entry point that detects the runtime environment (Node.js or Bun), resolves the native CUDA addon from the local directory or fallback external-libs path, loads it via Node.js require(), queries GPU device information if available, and reports success or diagnostic errors with path hints for resolution failures.

## Dependencies

**External Native Addon**

- `ultracode_cuda.node` — Compiled native CUDA addon (C++ binding) that provides GPU device information retrieval; resolved from `./ultracode_cuda.node` (primary location) or `../../external-libs/cuda-win32-x64/ultracode_cuda.node` (fallback).

**Built-in Modules**

- `path` — File path resolution and normalization for cross-platform addon location logic.
- `fs` — File system checks (`existsSync`) for validating addon presence before loading.

**Runtime Requirements**

- Node.js v14 or later (primary supported runtime).
- Bun runtime with known stability issues on certain configurations.