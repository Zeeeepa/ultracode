# External Tools

This directory contains external tools and dependencies that are downloaded during setup or build process.

**Note:** This directory is in `.gitignore` and NOT tracked in git.

## Structure

```
external-tools/
├── wasm/           # WASM source code (Rust) - compiled with wasm-pack
│   ├── diff-simd/         # SIMD-optimized diff algorithm
│   └── vector-ops-simd/   # SIMD vector operations
├── native/         # Native modules source code
│   └── cuda/              # CUDA acceleration module
├── emsdk/          # Emscripten SDK for WASM compilation
├── nodejs/         # Node.js runtime (if bundled)
└── python/         # Python interpreter (if needed for build scripts)
```

## Purpose

External tools are separated from the main codebase to:
- ✅ Keep repository size small
- ✅ Avoid tracking large binaries in git
- ✅ Allow platform-specific installations
- ✅ Enable easy cleanup (`rm -rf external-tools`)

## Installation

External tools are automatically downloaded by setup scripts:

```bash
# Linux/macOS
./scripts/dev-setup.sh

# Windows
scripts\dev-setup.ps1
```

## Building WASM/Native Modules

### WASM Modules (Rust)

```bash
# Build all WASM modules
./scripts/build-wasm.sh      # Linux/macOS
scripts\build-wasm.ps1        # Windows

# Or build individually
cd external-tools/wasm/diff-simd
wasm-pack build --target bundler --out-dir ../../../dist/wasm/diff-simd --release
```

### CUDA Module (C++)

```bash
# Build CUDA module
./scripts/build.sh            # Linux/macOS (includes CUDA build step)
```

## Cleanup

To remove all external tools:

```bash
# Linux/macOS/Windows
rm -rf external-tools
```

Then run setup scripts again to reinstall.

## Manual Installation

### Emscripten SDK (for WASM builds)

```bash
cd external-tools/emsdk
git clone https://github.com/emscripten-core/emsdk.git .
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### Node.js (if bundling)

Download from https://nodejs.org/dist/ and extract to `external-tools/nodejs/`

### Python (if needed)

Download from https://www.python.org/downloads/ and install to `external-tools/python/`
