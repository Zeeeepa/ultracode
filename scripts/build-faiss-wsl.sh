#!/bin/bash
set -e

echo "=== WSL FAISS-Node Build Script ==="

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_CACHE="$PROJECT_ROOT/.build-cache/faiss-node"
OUTPUT_DIR="$PROJECT_ROOT/external-libs/faiss-linux-x64"

echo "Project root: $PROJECT_ROOT"
echo "Build cache: $BUILD_CACHE"
echo "Output: $OUTPUT_DIR"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v cmake &> /dev/null; then
    echo "ERROR: cmake not found!"
    echo "Install with: sudo apt-get update && sudo apt-get install -y cmake build-essential"
    exit 1
fi
echo "✓ cmake found: $(cmake --version | head -1)"

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found!"
    echo "Install with: curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node --version)
NODE_ABI=$(node -p "process.versions.modules")
echo "✓ node found: $NODE_VERSION (ABI v$NODE_ABI)"

if [ "$NODE_ABI" != "137" ]; then
    echo "WARNING: Expected Node ABI v137 (Node 24), found v$NODE_ABI"
    echo "The build will continue but may not work as expected."
fi

if ! command -v git &> /dev/null; then
    echo "ERROR: git not found!"
    echo "Install with: sudo apt-get install -y git"
    exit 1
fi
echo "✓ git found"

# Check BLAS/LAPACK
echo ""
echo "Checking BLAS/LAPACK..."
if ! dpkg -l | grep -q libopenblas-dev; then
    echo "WARNING: libopenblas-dev not installed"
    echo "Installing BLAS/LAPACK dependencies..."
    export DEBIAN_FRONTEND=noninteractive
    sudo -E apt-get update -qq
    sudo -E apt-get install -y -qq libopenblas-dev libblas-dev liblapack-dev
else
    echo "✓ BLAS/LAPACK found"
fi

# Clean if --clean flag passed
if [ "$1" = "--clean" ]; then
    echo ""
    echo "Cleaning previous build..."
    rm -rf "$BUILD_CACHE"
fi

# Clone or update faiss-node repository
echo ""
if [ -d "$BUILD_CACHE" ]; then
    echo "Updating faiss-node repository..."
    cd "$BUILD_CACHE"
    git pull || echo "Update failed, continuing with cached version"
else
    echo "Cloning faiss-node repository..."
    mkdir -p "$(dirname "$BUILD_CACHE")"
    git clone --depth 1 --branch main https://github.com/ewfian/faiss-node.git "$BUILD_CACHE"
fi

# Install node-gyp globally if not present
if ! command -v node-gyp &> /dev/null; then
    echo ""
    echo "Installing node-gyp globally..."
    sudo npm install -g node-gyp
fi
echo "✓ node-gyp found"

# Install npm dependencies
cd "$BUILD_CACHE"
echo ""
echo "Installing npm dependencies..."
npm install

# Build with node-gyp
echo ""
echo "Building FAISS native addon (this will take 10-20 minutes)..."
echo "Please be patient, compiling C++ code with FAISS library..."
echo ""

node-gyp configure
node-gyp build --release

# Check build output
BUILT_ADDON="$BUILD_CACHE/build/Release/faiss-node.node"

if [ ! -f "$BUILT_ADDON" ]; then
    echo ""
    echo "ERROR: Build output not found!"
    echo "Expected: $BUILT_ADDON"
    echo "Contents of build directory:"
    find "$BUILD_CACHE/build" -name "*.node" 2>/dev/null || echo "No .node files found"
    exit 1
fi

# Copy to output directory
mkdir -p "$OUTPUT_DIR"
cp "$BUILT_ADDON" "$OUTPUT_DIR/faiss-node.node"

echo ""
echo "✓ Build output copied to: $OUTPUT_DIR/faiss-node.node"

# Test loading
echo ""
echo "Testing built addon..."
if node -e "const f=require('$OUTPUT_DIR/faiss-node.node');console.log('✓ Addon loaded successfully')"; then
    echo ""
    echo "SUCCESS: Built Linux FAISS addon for Node $NODE_VERSION (ABI v$NODE_ABI)"
    ls -lh "$OUTPUT_DIR/faiss-node.node"
else
    echo ""
    echo "ERROR: Addon built but failed to load"
    exit 1
fi

echo ""
echo "Add this file to npm package and commit to git."
