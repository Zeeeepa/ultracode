#!/bin/bash
# Development Setup Script
# Автоматическая установка всех dependencies и сборка GPU backends

set -e  # Exit on error

# Ensure common tool paths are available (macOS: bun, cargo, etc.)
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

COLORS_RESET='\033[0m'
COLORS_BOLD='\033[1m'
COLORS_GREEN='\033[32m'
COLORS_YELLOW='\033[33m'
COLORS_BLUE='\033[34m'
COLORS_RED='\033[31m'
COLORS_GRAY='\033[90m'

log() {
    echo -e "${2:-$COLORS_RESET}$1${COLORS_RESET}"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

separator() {
    log "$(printf '═%.0s' {1..70})" "$COLORS_BOLD"
}

separator
log "  🚀 Code Graph RAG - Development Setup" "$COLORS_BOLD"
separator

# Step 1: Check Node.js
log "\n📦 Step 1: Checking Node.js..." "$COLORS_BLUE"
if ! check_command node; then
    log "❌ Node.js not found!" "$COLORS_RED"
    log "   Install from: https://nodejs.org/" "$COLORS_GRAY"
    exit 1
fi

NODE_VERSION=$(node --version)
log "✅ Node.js $NODE_VERSION" "$COLORS_GREEN"

# Step 2: Install npm dependencies
log "\n📦 Step 2: Installing npm dependencies..." "$COLORS_BLUE"
npm install

# Step 3: Install Rust (for WASM)
log "\n🦀 Step 3: Checking Rust toolchain..." "$COLORS_BLUE"
if ! check_command rustc; then
    log "⚠️  Rust not installed - attempting automatic installation..." "$COLORS_YELLOW"

    if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
        log "✅ Rust installed successfully" "$COLORS_GREEN"
    else
        log "❌ Please install Rust manually from: https://rustup.rs/" "$COLORS_RED"
        log "   After installation, run this script again" "$COLORS_GRAY"
    fi
else
    RUST_VERSION=$(rustc --version)
    log "✅ Rust $RUST_VERSION" "$COLORS_GREEN"
fi

# Step 4: Install wasm-pack
log "\n📦 Step 4: Checking wasm-pack..." "$COLORS_BLUE"
if ! check_command wasm-pack; then
    log "⚠️  wasm-pack not installed - installing..." "$COLORS_YELLOW"
    cargo install wasm-pack
    log "✅ wasm-pack installed" "$COLORS_GREEN"
else
    WASM_PACK_VERSION=$(wasm-pack --version)
    log "✅ $WASM_PACK_VERSION" "$COLORS_GREEN"
fi

# Step 5: Build WASM module
log "\n🔨 Step 5: Building WASM SIMD module..." "$COLORS_BLUE"
if [ -d "external-tools/wasm/vector-ops" ]; then
    cd external-tools/wasm/vector-ops
    wasm-pack build --target nodejs --release
    cd ../..
    log "✅ WASM module built (4-8x speedup)" "$COLORS_GREEN"
else
    log "⚠️  WASM source directory not found" "$COLORS_YELLOW"
fi

# Step 6: Check for CUDA (optional)
log "\n🚀 Step 6: Checking CUDA Toolkit..." "$COLORS_BLUE"
if check_command nvidia-smi; then
    log "✅ NVIDIA GPU detected" "$COLORS_GREEN"
    nvidia-smi --query-gpu=name --format=csv,noheader | head -1

    if check_command nvcc; then
        CUDA_VERSION=$(nvcc --version | grep "release" | sed 's/.*release \([0-9.]*\).*/\1/')
        log "✅ CUDA Toolkit $CUDA_VERSION detected" "$COLORS_GREEN"

        # Check for CMake (required for CUDA build)
        if ! check_command cmake; then
            log "⚠️  CMake not installed - attempting automatic installation..." "$COLORS_YELLOW"

            # Detect package manager
            if check_command apt-get; then
                # Debian/Ubuntu
                log "📦 Installing CMake via apt-get..." "$COLORS_BLUE"
                sudo apt-get update -qq && sudo apt-get install -y cmake
                log "✅ CMake installed successfully" "$COLORS_GREEN"
            elif check_command yum; then
                # RHEL/CentOS/Fedora
                log "📦 Installing CMake via yum..." "$COLORS_BLUE"
                sudo yum install -y cmake
                log "✅ CMake installed successfully" "$COLORS_GREEN"
            elif check_command dnf; then
                # Fedora (modern)
                log "📦 Installing CMake via dnf..." "$COLORS_BLUE"
                sudo dnf install -y cmake
                log "✅ CMake installed successfully" "$COLORS_GREEN"
            elif check_command pacman; then
                # Arch Linux
                log "📦 Installing CMake via pacman..." "$COLORS_BLUE"
                sudo pacman -S --noconfirm cmake
                log "✅ CMake installed successfully" "$COLORS_GREEN"
            elif check_command brew; then
                # macOS (Homebrew)
                log "📦 Installing CMake via Homebrew..." "$COLORS_BLUE"
                brew install cmake
                log "✅ CMake installed successfully" "$COLORS_GREEN"
            else
                log "⚠️  No supported package manager found" "$COLORS_YELLOW"
                log "   Please install CMake manually from: https://cmake.org/download/" "$COLORS_GRAY"
            fi
        else
            CMAKE_VERSION=$(cmake --version | head -1)
            log "✅ CMake detected: $CMAKE_VERSION" "$COLORS_GREEN"
        fi

        log "🔨 Building CUDA native addon..." "$COLORS_BLUE"
        if npm run build:cuda; then
            log "✅ CUDA backend built (100-200x speedup)" "$COLORS_GREEN"
        else
            log "⚠️  CUDA build failed (optional)" "$COLORS_YELLOW"
        fi
    else
        log "⚠️  CUDA Toolkit not installed (optional)" "$COLORS_YELLOW"
        log "   Download from: https://developer.nvidia.com/cuda-downloads" "$COLORS_GRAY"
    fi
else
    log "⚠️  NVIDIA GPU not detected - skipping CUDA" "$COLORS_YELLOW"
fi

# Step 7: Install WebGPU (optional)
log "\n🎨 Step 7: Installing WebGPU support..." "$COLORS_BLUE"
npm install @webgpu/node @webgpu/types --save-optional
log "✅ WebGPU support installed" "$COLORS_GREEN"

# Step 8: Build TypeScript
log "\n🔨 Step 8: Building TypeScript..." "$COLORS_BLUE"
npm run build
log "✅ TypeScript compiled" "$COLORS_GREEN"

# Step 9: Run tests
log "\n🧪 Step 9: Running tests..." "$COLORS_BLUE"
if npm test; then
    log "✅ All tests passed" "$COLORS_GREEN"
else
    log "⚠️  Some tests failed (check above)" "$COLORS_YELLOW"
fi

# Final summary
separator
log "  ✅ Development Environment Ready!" "$COLORS_BOLD$COLORS_GREEN"
separator

log "\n📊 Installed Backends:" "$COLORS_BOLD"
log "  • Pure JS (Loop Unrolling) - ✅ Always available (1.45x)" "$COLORS_GRAY"

if [ -f "external-tools/wasm/vector-ops/pkg/index.js" ]; then
    log "  • WASM SIMD                - ✅ Built (4-8x)" "$COLORS_GREEN"
else
    log "  • WASM SIMD                - ❌ Not built" "$COLORS_RED"
fi

if npm list @webgpu/node >/dev/null 2>&1; then
    log "  • WebGPU Compute           - ✅ Installed (50-100x)" "$COLORS_GREEN"
else
    log "  • WebGPU Compute           - ❌ Not installed" "$COLORS_RED"
fi

if [ -f "build/Release/cuda_vector_ops.node" ]; then
    log "  • CUDA Native              - ✅ Built (100-200x)" "$COLORS_GREEN"
else
    log "  • CUDA Native              - ⚠️  Not built (optional)" "$COLORS_YELLOW"
fi

log "\n🚀 Next steps:" "$COLORS_BOLD"
log "  • Run tests:    npm test" "$COLORS_GRAY"
log "  • Start coding: npm run build:watch" "$COLORS_GRAY"
log "  • Check docs:   cat GPU_IMPLEMENTATION_STATUS.md" "$COLORS_GRAY"

log "\n"
