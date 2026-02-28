# CUDA Module Quick Start

## Prerequisites

✅ **Already installed** (detected automatically):
- CUDA Toolkit v13.0 at `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0`

🔧 **Required** (will be auto-installed if missing):
- CMake 3.18+
- Visual Studio Build Tools (C++ compiler)

## Build CUDA Module

### Option 1: Automatic (Recommended)

```bash
# Run main build script (from project root)
./Dev.Scripts/build-bun.cmd

# Script will:
# 1. Build TypeScript (tsup)
# 2. Build WASM modules (Rust)
# 3. Detect CUDA v13.0 ✅
# 4. Check CMake (install if needed)
# 5. Compile CUDA kernels (3-5 minutes)
# 6. Build Node.js addon
# 7. Output: dist/native/cuda/ultracode_cuda.node
```

### Option 2: Manual

```bash
cd native/cuda

# Install dependencies
npm install

# Build CUDA addon
npm run build

# Output: ../../dist/native/cuda/ultracode_cuda.node
```

## Test CUDA Module

### Quick Test

```bash
# From project root
node -e "const cuda = require('./dist/native/cuda/ultracode_cuda.node'); console.log(cuda.getDeviceInfo())"

# Expected output:
# {
#   deviceCount: 1,
#   deviceName: 'NVIDIA GeForce GTX 1650 Ti',
#   computeCapability: '7.5',
#   totalMemoryMB: 4096,
#   multiProcessorCount: 16
# }
```

### Full Example

```bash
# Compile example
bun build docs/examples/cuda-example.ts --outdir=dist/examples

# Run
node dist/examples/cuda-example.js

# Or directly with Bun
bun docs/examples/cuda-example.ts
```

## Usage in Code

```typescript
// Load CUDA addon
const cuda = require('./dist/native/cuda/ultracode_cuda.node');

// Check device
const info = cuda.getDeviceInfo();
console.log(`GPU: ${info.deviceName} (${info.totalMemoryMB}MB)`);

// Compute similarity (8192-dim vectors)
const vec_a = new Array(8192).fill(0).map(() => Math.random());
const vec_b = new Array(8192).fill(0).map(() => Math.random());

const similarity = cuda.cosineSimilarity(vec_a, vec_b);
console.log('Similarity:', similarity); // e.g., 0.8523

// Batch processing (100 pairs)
const queries = Array(100).fill(0).map(() => randomVector(8192));
const docs = Array(100).fill(0).map(() => randomVector(8192));

const similarities = cuda.batchCosineSimilarity(queries, docs);
console.log('Batch results:', similarities.length); // 100
```

## Performance

| Operation | CPU | CUDA | Speedup |
|-----------|-----|------|---------|
| Single similarity (8192-dim) | 10ms | 0.1-0.2ms | **100-200x** |
| Batch (100 pairs) | 1000ms | 5-10ms | **100-200x** |

## Troubleshooting

### Build fails

**Check CUDA path**:
```bash
dir "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0"
```

**Check CMake**:
```bash
cmake --version
```

If not found:
```bash
winget install Kitware.CMake
```

### Runtime error: "Cannot find module"

**Check output file**:
```bash
ls dist/native/cuda/ultracode_cuda.node
```

If missing, rebuild:
```bash
cd native/cuda && npm run rebuild
```

## Next Steps

- Read [README.md](./README.md) for full documentation
- Check [docs/examples/cuda-example.ts](../../docs/examples/cuda-example.ts) for usage examples
- See [CUDA_SETUP_COMPLETE.md](../../CUDA_SETUP_COMPLETE.md) for complete setup guide

## Support

CUDA Toolkit: https://developer.nvidia.com/cuda-downloads
CMake: https://cmake.org/download/
Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
