# GPU Compatibility Guide

## Overview

UltraScript Tools MCP supports GPU acceleration through:
- **CUDA** - Native NVIDIA GPU backend (highest performance)
- **WebGPU** - Cross-platform GPU via Dawn/wgpu (browser compatible)
- **WASM SIMD** - Fallback (always available)

## Known Issues

### NVIDIA Blackwell (RTX 50xx Series)

**Problem:** Dawn/WebGPU crashes on Blackwell GPUs (Compute Capability 12.x)

**Affected GPUs:**
- RTX 5090, 5080, 5070 Ti, 5070, 5060 Ti, 5060
- Any GPU with CC >= 12.0

**Symptoms:**
```
panic(main thread): Segmentation fault at address 0x...
...win32-x64.dawn.node...
```

**Status:** WebGPU is auto-disabled for Blackwell until `webgpu` npm package updates Dawn with support.

### CUDA Native Addon

The CUDA native addon may also crash on very new architectures if compiled with older CUDA Toolkit.

## Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `WEBGPU_FORCE_DISABLE` | `1` | Disable WebGPU detection entirely |
| `WEBGPU_FORCE_ENABLE` | `1` | Force WebGPU even on unsafe architectures (may crash!) |
| `CUDA_FORCE_DISABLE` | `1` | Disable CUDA native addon |

## Running Tests

### Standard Test Run (Auto-detection)

```bash
# On stable GPUs (GTX 16xx, RTX 20xx/30xx/40xx)
bun test

# On Blackwell GPUs - WebGPU auto-skipped
bun test
```

### Explicitly Disable Native Backends

```bash
# Disable both CUDA and WebGPU (safest)
CUDA_FORCE_DISABLE=1 bun test

# Disable only WebGPU
WEBGPU_FORCE_DISABLE=1 bun test

# Disable only CUDA
CUDA_FORCE_DISABLE=1 bun test
```

### Testing WebGPU Compatibility (No Crash)

```bash
# Safe test - checks compatibility without loading Dawn
bun test tests/gpu/webgpu-blackwell.test.ts
```

### Force Enable WebGPU (Danger - May Crash!)

```bash
# Only use on stable architectures to test WebGPU
WEBGPU_FORCE_ENABLE=1 bun test
```

## Programmatic API

### Check GPU Compatibility

```typescript
import { GPUDetector } from "./src/gpu/detection/gpu-detector.js";

// Safe - doesn't load WebGPU
const compat = await GPUDetector.testWebGPUCompatibility();
console.log(compat);
// {
//   cudaDetected: true,
//   computeCapability: 12,
//   model: "NVIDIA GeForce RTX 5060",
//   webgpuSafe: false,
//   skipReason: "NVIDIA Blackwell architecture (CC 12) - Dawn/WebGPU crashes...",
//   envOverride: null
// }

// Full detection (skips WebGPU on Blackwell)
const info = await GPUDetector.detect();
console.log(info);
// {
//   vendor: "nvidia",
//   model: "NVIDIA GeForce RTX 5060",
//   cudaAvailable: true,
//   webgpuAvailable: false,
//   webgpuSkipped: true,
//   webgpuSkipReason: "..."
// }
```

### Check Safety Manually

```typescript
import { GPUDetector, WEBGPU_UNSAFE_MIN_CC } from "./src/gpu/detection/gpu-detector.js";

const safety = GPUDetector.isWebGPUSafe({
  computeCapability: 12.0,
  model: "RTX 5060",
});

if (!safety.safe) {
  console.log("WebGPU unsafe:", safety.reason);
}
```

## Testing After webgpu Package Update

When a new version of `webgpu` is released with Blackwell support:

1. **Update package:**
   ```bash
   npm update webgpu
   ```

2. **Run compatibility test:**
   ```bash
   bun test tests/gpu/webgpu-blackwell.test.ts
   ```

3. **Test WebGPU loading (may crash if not fixed):**
   ```bash
   WEBGPU_FORCE_ENABLE=1 bun test tests/gpu/webgpu-blackwell.test.ts
   ```

4. **If successful, update constants:**
   ```typescript
   // src/gpu/detection/gpu-detector.ts
   const WEBGPU_UNSAFE_MIN_CC = 13.0; // Next unsupported architecture
   ```

## Architecture Reference

| Architecture | CC | GPUs | WebGPU Status |
|--------------|-----|------|---------------|
| Kepler | 3.x | GTX 600/700 | ✅ Supported |
| Maxwell | 5.x | GTX 900 | ✅ Supported |
| Pascal | 6.x | GTX 10xx | ✅ Supported |
| Volta | 7.0 | Titan V | ✅ Supported |
| Turing | 7.5 | RTX 20xx | ✅ Supported |
| Ampere | 8.x | RTX 30xx | ✅ Supported |
| Ada Lovelace | 8.9 | RTX 40xx | ✅ Supported |
| Blackwell | 12.x | RTX 50xx | ❌ Auto-disabled |

## Files

| File | Purpose |
|------|---------|
| `src/gpu/detection/gpu-detector.ts` | GPU detection with safety checks |
| `src/gpu/backends/cuda-backend.ts` | CUDA native addon backend |
| `src/gpu/backends/webgpu-backend.ts` | WebGPU backend |
| `tests/gpu/webgpu-blackwell.test.ts` | Blackwell compatibility tests |
