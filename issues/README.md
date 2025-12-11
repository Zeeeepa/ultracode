# Bun Native Addon Issues

This directory contains minimal reproduction cases for Bun native addon crashes.

## Issue Summary

All three examples demonstrate the same root cause: **Bun crashes with Segmentation fault when loading N-API native addons**.

| Example | Addon | Node.js | Bun |
|---------|-------|---------|-----|
| [webgpu-npm](./webgpu-npm/) | `webgpu` npm package | ✅ Works | ❌ Segfault |
| [webgpu-custom](./webgpu-custom/) | Custom Dawn build | ✅ Works | ❌ Segfault |
| [cuda-custom](./cuda-custom/) | Custom CUDA 13.1 | ✅ Works | ❌ Segfault |

## Environment

- **OS**: Windows 11
- **Bun**: 1.3.4
- **Node.js**: 24.11.1
- **GPU**: NVIDIA RTX 5090 (Blackwell, sm_120)
- **CUDA**: 13.1

## Quick Test

```bash
# Test any example
cd webgpu-npm
npm install
node test.js   # Works
bun test.js    # Crashes
```

## Common Crash Pattern

All crashes show the same pattern:
```
panic(main thread): Segmentation fault at address 0x...
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
```

## Analysis

The addons are built with:
- Node-API (N-API)
- node-addon-api
- CMake build system

The crash occurs during native module initialization (`process_dlopen` feature), before any addon functions can be called.

## Related Bun Issues

- Native addon compatibility
- N-API implementation gaps
- process_dlopen crashes
