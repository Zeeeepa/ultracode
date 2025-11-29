#!/bin/bash
set -e

echo "=== WSL CUDA Build Script ==="

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CUDA_SRC="$PROJECT_ROOT/external-tools/native/cuda"
OUTPUT_DIR="$PROJECT_ROOT/external-libs/cuda-linux-x64"

echo "Project root: $PROJECT_ROOT"
echo "CUDA source: $CUDA_SRC"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v cmake &> /dev/null; then
    echo "ERROR: cmake not found!"
    echo "Install with: sudo apt-get update && sudo apt-get install -y cmake build-essential"
    exit 1
fi
echo "✓ cmake found"

if ! command -v nvcc &> /dev/null; then
    echo "ERROR: CUDA (nvcc) not found!"
    echo "Install with: sudo apt-get install -y nvidia-cuda-toolkit"
    exit 1
fi
echo "✓ nvcc found: $(nvcc --version | grep release)"

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found!"
    echo "Install with: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
echo "✓ node found: $(node --version)"

# Clean if --clean flag passed
if [ "$1" = "--clean" ]; then
    echo ""
    echo "Cleaning previous build..."
    rm -rf "$CUDA_SRC/build"
fi

# Install dependencies
cd "$PROJECT_ROOT"
if [ ! -d "node_modules/node-addon-api" ]; then
    echo ""
    echo "Installing node-addon-api..."
    npm install node-addon-api
fi

# Build
cd "$CUDA_SRC"
echo ""
echo "Building CUDA addon..."
npx cmake-js compile

# Copy output
mkdir -p "$OUTPUT_DIR"
if [ -f "build/Release/ultrascript_cuda.node" ]; then
    cp build/Release/ultrascript_cuda.node "$OUTPUT_DIR/"
elif [ -f "build/Debug/ultrascript_cuda.node" ]; then
    cp build/Debug/ultrascript_cuda.node "$OUTPUT_DIR/"
elif [ -f "build/ultrascript_cuda.node" ]; then
    cp build/ultrascript_cuda.node "$OUTPUT_DIR/"
else
    echo ""
    echo "ERROR: Build output not found!"
    echo "Contents of build directory:"
    find build -name "*.node" 2>/dev/null || echo "No .node files found"
    exit 1
fi

echo ""
echo "SUCCESS: Built Linux CUDA addon"
ls -la "$OUTPUT_DIR/"
