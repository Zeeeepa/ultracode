#!/bin/bash
# Build script for UltraScript Tools MCP Server using Bun
# Compiles TypeScript to dist/ directory using tsup with Bun runtime

set -e  # Exit on error

echo "========================================"
echo "Building with Bun (Ultra-Fast Build)"
echo "========================================"
echo ""

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "ERROR: Bun is not installed!"
    echo ""
    echo "Please install Bun from: https://bun.sh"
    echo "  Unix/Linux/Mac: curl -fsSL https://bun.sh/install | bash"
    echo "  Windows:        powershell -c \"irm bun.sh/install.ps1 | iex\""
    echo ""
    exit 1
fi

# Show Bun version
BUN_VERSION=$(bun --version)
echo "Using Bun v$BUN_VERSION"
echo ""

# Check if node_modules exists, install with Bun if not
if [ ! -d "node_modules" ]; then
    echo "node_modules not found, installing dependencies with Bun..."
    bun install
    echo ""
fi

# Run TypeScript type checking first
echo "[1/4] Running TypeScript type check..."
bun run typecheck
echo "Type check passed!"
echo ""

# ============================================================================
# STEP 2: Build Comm proxy (Cosmopolitan binary)
# ============================================================================
echo "[2/4] Checking Comm proxy (ultrascript-tools.com)..."

COMM_SRC="$(pwd)/src/comm/comm.c"
COMM_OUT="$(pwd)/src/comm/ultrascript-tools.com"

# Check for cosmocc
COSMOCC=""
if [ -f "$HOME/.cosmo/bin/cosmocc" ]; then
    COSMOCC="$HOME/.cosmo/bin/cosmocc"
elif [ -f "$HOME/.local/cosmocc/bin/cosmocc" ]; then
    COSMOCC="$HOME/.local/cosmocc/bin/cosmocc"
elif command -v cosmocc &> /dev/null; then
    COSMOCC="cosmocc"
fi

if [ -n "$COSMOCC" ]; then
    # Check if source is newer than binary
    NEED_BUILD=0
    if [ ! -f "$COMM_OUT" ]; then
        NEED_BUILD=1
        echo "[INFO] Comm binary not found, building..."
    elif [ "$COMM_SRC" -nt "$COMM_OUT" ]; then
        NEED_BUILD=1
        echo "[INFO] Comm source updated, rebuilding..."
    fi

    if [ "$NEED_BUILD" -eq 1 ]; then
        echo "[INFO] Building Comm proxy with cosmocc..."
        if "$COSMOCC" -Os -DNDEBUG -o "$COMM_OUT" "$COMM_SRC"; then
            echo "[OK] Comm proxy built successfully"
        else
            echo "[WARNING] Comm build failed, using existing binary"
        fi
    else
        echo "[OK] Comm binary is up to date"
    fi
else
    if [ -f "$COMM_OUT" ]; then
        echo "[OK] Using pre-built Comm binary (cosmocc not installed)"
    else
        echo "[WARNING] cosmocc not found and no pre-built binary!"
        echo "         Install cosmocc: https://github.com/jart/cosmopolitan"
        echo "         Or download: curl -L -o cosmocc.zip https://cosmo.zip/pub/cosmocc/cosmocc.zip"
    fi
fi
echo ""

# Run build with Bun
echo "[3/4] Building with tsup (Bun runtime)..."
bun run build
echo "Build completed successfully!"
echo ""

# Build native modules if toolchains available
echo "[4/6] Setting up native module toolchains..."
echo ""

WASM_BUILT=false

# Check for Rust (required for WASM modules)
if ! command -v cargo &> /dev/null; then
    echo "[INFO] Rust not found, installing via rustup..."
    echo ""

    # Download and install rustup
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

    if [ $? -eq 0 ]; then
        # Source cargo env for current session
        source "$HOME/.cargo/env"

        echo ""
        echo "[OK] Rust installed successfully"
        echo "[INFO] Cargo added to PATH for current session"
    else
        echo "[ERROR] Failed to install Rust"
        echo "[INFO] Please install Rust manually: https://rustup.rs/"
        echo ""
        echo "[SKIP] WASM build skipped"
        echo ""
    fi
fi

# Check for wasm-pack (required for building WASM modules)
if ! command -v wasm-pack &> /dev/null; then
    echo "[INFO] wasm-pack not found, installing..."

    # Verify cargo is available
    if command -v cargo &> /dev/null; then
        echo "  → Installing wasm-pack via cargo (~1-2 minutes)..."
        cargo install wasm-pack

        if [ $? -eq 0 ]; then
            echo "[OK] wasm-pack installed successfully"
        else
            echo "[WARNING] wasm-pack installation failed"
            echo "[INFO] WASM modules may not build correctly"
        fi
    else
        echo "[WARNING] Cargo not found, cannot install wasm-pack"
        echo ""
    fi
fi

# Verify both tools are now available
if ! command -v cargo &> /dev/null; then
    echo "[SKIP] WASM build skipped - Rust not available"
    echo ""
    echo "To enable WASM acceleration (3-10x faster):"
    echo "  1. Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  2. Restart shell or run: source \$HOME/.cargo/env"
    echo "  3. Re-run this build script"
    echo ""
elif ! command -v wasm-pack &> /dev/null; then
    echo "[WARNING] wasm-pack not found in PATH"
    echo "[INFO] Try restarting this script after Rust installation"
    echo ""
    echo "[SKIP] WASM build skipped"
    echo ""
else
    # Build WASM modules
    echo "[INFO] Building WASM modules with Rust/wasm-pack..."
    if [ -f "scripts/build-wasm.sh" ]; then
        bash scripts/build-wasm.sh && WASM_BUILT=true
        if [ "$WASM_BUILT" = true ]; then
            echo "[OK] WASM modules built successfully"
        else
            echo "[ERROR] WASM build failed"
            echo "[INFO] Check scripts/build-wasm.sh for details"
        fi
    else
        echo "[WARNING] scripts/build-wasm.sh not found"
        echo "[INFO] Cannot build WASM modules without build script"
    fi
    echo ""
fi

# Auto-install CMake if not found
if ! command -v cmake &> /dev/null; then
    echo "[INFO] CMake not found, attempting to install..."

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "  → Installing CMake via apt-get..."
        sudo apt-get update > /dev/null 2>&1
        sudo apt-get install -y cmake > /dev/null 2>&1
        echo "[OK] CMake installed successfully"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            echo "  → Installing CMake via Homebrew..."
            brew install cmake > /dev/null 2>&1
            echo "[OK] CMake installed successfully"
        else
            echo "[WARNING] Homebrew not found, please install CMake manually"
            echo "          Install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        fi
    else
        echo "[WARNING] Unsupported OS for auto-install, please install CMake manually"
        echo "          Download from: https://cmake.org/download/"
    fi
fi
echo ""

# Check for CUDA toolkit and build
CUDA_BUILT=false
if [ -d "C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA" ] || [ -d "/usr/local/cuda" ]; then
    echo "[INFO] CUDA Toolkit detected"

    # Verify CMake is now available
    if command -v cmake &> /dev/null; then
        if [ -d "external-tools/native/cuda" ]; then
            echo "[INFO] Building CUDA native module..."
            cd external-tools/native/cuda
            echo "  → Compiling CUDA module (this may take a few minutes)..."
            if cmake-js compile; then
                CUDA_BUILT=true
                echo "[OK] CUDA module built successfully"
            else
                echo "[ERROR] CUDA module build failed"
            fi
            cd ../..
        else
            echo "[WARNING] external-tools/native/cuda directory not found"
            echo "[INFO] CUDA module source code not included in this version"
            echo "[INFO] CUDA support will be added in future releases"
        fi
    else
        echo "[WARNING] CMake not found, cannot build CUDA module"
        echo "[INFO] CMake was installed but requires shell restart"
        echo "[INFO] Please restart this script to build CUDA module"
    fi
else
    echo "[SKIP] CUDA Toolkit not found"
    echo ""
    echo "To enable GPU acceleration (10-50x faster):"
    echo "  1. Download CUDA Toolkit: https://developer.nvidia.com/cuda-downloads"
    echo "  2. Install CUDA Toolkit (~3GB, requires admin rights)"
    echo "  3. Re-run this build script"
fi
echo ""

# Show output
echo "[5/6] Build artifacts:"
echo ""
if [ -f "dist/index.js" ]; then
    size=$(wc -c < "dist/index.js")
    echo "✓ dist/index.js"
    echo "  Size: $size bytes"
fi
[ -f "dist/index.js.map" ] && echo "✓ dist/index.js.map"
[ -f "dist/index.d.ts" ] && echo "✓ dist/index.d.ts"
echo ""

# Count native modules
node_count=$(find dist -name "*.node" 2>/dev/null | wc -l)
if [ "$node_count" -gt 0 ]; then
    echo "✓ $node_count native modules (.node files)"
    echo ""
fi

# Count WASM modules
wasm_count=$(find dist -name "*.wasm" 2>/dev/null | wc -l)
if [ "$wasm_count" -gt 0 ]; then
    echo "✓ $wasm_count WASM modules (.wasm files)"
    echo ""
fi

echo "[6/6] Build summary:"
echo ""
echo "Core build: ✓ Success"
[ "$WASM_BUILT" = true ] && echo "WASM modules: ✓ Built" || echo "WASM modules: ⊗ Skipped (no Emscripten)"
[ "$CUDA_BUILT" = true ] && echo "CUDA module: ✓ Built" || echo "CUDA module: ⊗ Skipped (no CUDA Toolkit or CMake)"
echo ""

echo "========================================"
echo "Build completed with Bun!"
echo "========================================"
echo ""
echo "Output directory: dist/"
echo "Entry point: dist/index.js"
echo ""
echo "To run the server with Bun:"
echo "  bun dist/index.js [directory]"
echo ""
echo "To run with Node.js:"
echo "  node dist/index.js [directory]"
echo ""
echo "Performance optimizations:"
if [ "$WASM_BUILT" = true ]; then
    echo "  ✓ WASM SIMD: 3-10x faster vector operations"
fi
if [ "$CUDA_BUILT" = true ]; then
    echo "  ✓ CUDA GPU: 10-50x faster embeddings"
fi
if [ "$WASM_BUILT" = false ] && [ "$CUDA_BUILT" = false ]; then
    echo "  ⊗ Native optimizations not built"
    echo "    CPU mode: Still fast with SQLite-vec"
fi
echo ""

echo "Why Bun?"
echo "  • 3x faster package installation"
echo "  • 2x faster build times"
echo "  • Native TypeScript support"
echo "  • Drop-in Node.js replacement"
echo ""

exit 0
