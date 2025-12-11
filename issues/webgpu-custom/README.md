# Bun Native Addon Crash: Custom Dawn/WebGPU Build

## Summary

Bun crashes with **Segmentation fault** when loading custom-built `dawn.node` (Google Dawn WebGPU for Node.js).

This example uses a custom Dawn build with Blackwell (RTX 50xx) support, but the crash is the same as with the npm version.

## Environment

- **OS**: Windows 11
- **Bun**: 1.3.4
- **Node.js**: 24.11.1 (works correctly)
- **Dawn**: Built from source (chromium.googlesource.com/chromium/src/third_party/dawn)
- **GPU**: NVIDIA RTX 5090 (Blackwell)

## Build Info

Custom Dawn build with:
- D3D12 backend (Windows)
- Vulkan backend
- Node.js bindings (N-API)
- Blackwell compute capability support

## Reproduction

```bash
# Copy dawn.node from external-libs
copy ..\..\external-libs\dawn-win32-x64\dawn.node .

# Test with Node.js (works)
node test.js

# Test with Bun (crashes)
bun test.js
```

## Node.js Output (SUCCESS)

```
Runtime: Node.js v24.11.1
Loading custom dawn.node...
Module loaded
GPU created
Adapter: NVIDIA GeForce RTX 5090
Device created
SUCCESS!
```

## Bun Output (CRASH)

```
Runtime: Bun 1.3.4
Loading custom dawn.node...
============================================================
Bun v1.3.4 (5eb2145b) Windows x64
...
panic(main thread): Segmentation fault at address 0x...
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
```

## Analysis

The crash occurs during native addon initialization, same as with the npm webgpu package. This confirms the issue is in Bun's N-API implementation, not in the specific Dawn build.

## Files

- `test.js` - Minimal reproduction script
- `dawn.node` - Custom built Dawn addon (copy from external-libs/dawn-win32-x64/)

## Related

- `../webgpu-npm/` - Same issue with npm webgpu package
- `../cuda-custom/` - Similar issue with CUDA native addon
