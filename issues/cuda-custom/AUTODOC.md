# cuda-custom

## Overview

The `cuda-custom` module provides testing and integration utilities for native CUDA addon support in Node.js and Bun runtimes. It validates GPU device detection and initialization through a native binding, with fallback logic to locate the compiled addon from external library directories. The module serves as a verification point for GPU acceleration capabilities within the ultracode system and includes runtime compatibility checks across different JavaScript runtimes.

## Flow

```
Runtime Detection (Node.js vs Bun)
    ↓
Locate CUDA Addon (primary path → fallback external-libs path)
    ↓
Load Native Module via require()
    ↓
Query Device Info (getDeviceInfo if available)
    ↓
Report Status (SUCCESS or ERROR with path hints)
```

## Entities

**Test & Validation**

- `test.js:1-1322` — Entry point that detects the JavaScript runtime environment, locates and loads the native CUDA addon with fallback resolution, exports available CUDA functions, and tests GPU device information retrieval with error handling.

## Dependencies

**External**

- `ultracode_cuda.node` — Compiled native CUDA addon (C++ binding) providing GPU device information and CUDA operations; resolved from `./ultracode_cuda.node` or fallback `../../external-libs/cuda-win32-x64/ultracode_cuda.node`.

**Built-in Modules**

- `path` — File path resolution and normalization for addon location logic.
- `fs` — File system checks (`existsSync`) to validate addon availability.

**Runtime Requirements**

- Node.js v14+ or Bun (with documented compatibility issues on Bun causing crashes).