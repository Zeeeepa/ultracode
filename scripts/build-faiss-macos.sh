#!/bin/bash
# Build faiss-node for macOS (Apple Silicon and Intel)
# Requires: Homebrew, Xcode Command Line Tools

set -e

echo "======================================================================"
echo "  Building faiss-node for macOS"
echo "======================================================================"
echo ""

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  PLATFORM="darwin-arm64"
  echo "Detected: Apple Silicon (ARM64)"
elif [ "$ARCH" = "x86_64" ]; then
  PLATFORM="darwin-x64"
  echo "Detected: Intel (x86_64)"
else
  echo "ERROR: Unsupported architecture: $ARCH"
  exit 1
fi

echo ""

# Check Homebrew
if ! command -v brew &> /dev/null; then
  echo "ERROR: Homebrew not found"
  echo ""
  echo "Install Homebrew first:"
  echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  echo ""
  exit 1
fi

echo "✓ Homebrew found: $(brew --version | head -1)"

# Check Xcode Command Line Tools
if ! xcode-select -p &> /dev/null; then
  echo ""
  echo "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo ""
  echo "Please complete the installation and run this script again."
  exit 0
fi

echo "✓ Xcode Command Line Tools found"
echo ""

# Install dependencies
echo "Installing build dependencies..."
echo ""

# OpenBLAS (BLAS/LAPACK implementation)
if brew list openblas &> /dev/null; then
  echo "✓ openblas already installed"
else
  echo "Installing openblas..."
  brew install openblas
fi

# CMake
if brew list cmake &> /dev/null; then
  echo "✓ cmake already installed"
else
  echo "Installing cmake..."
  brew install cmake
fi

# Node 24 (if not already installed)
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
if [ "$NODE_VERSION" -lt 24 ]; then
  echo ""
  echo "WARNING: Node 24 required, found: v$(node --version 2>/dev/null || echo 'none')"
  echo ""
  echo "Install Node 24:"
  echo "  brew install node@24"
  echo "  brew link node@24 --force"
  echo ""
  exit 1
fi

echo "✓ Node $(node --version)"

# node-gyp
if ! command -v node-gyp &> /dev/null; then
  echo ""
  echo "Installing node-gyp..."
  npm install -g node-gyp
fi

echo "✓ node-gyp $(node-gyp --version)"
echo ""

# Get OpenBLAS paths
OPENBLAS_PREFIX=$(brew --prefix openblas)
export LDFLAGS="-L${OPENBLAS_PREFIX}/lib"
export CPPFLAGS="-I${OPENBLAS_PREFIX}/include"
export PKG_CONFIG_PATH="${OPENBLAS_PREFIX}/lib/pkgconfig"

echo "OpenBLAS prefix: $OPENBLAS_PREFIX"
echo ""

# Clone faiss-node
BUILD_DIR=".build-cache/faiss-node"

if [ -d "$BUILD_DIR" ]; then
  echo "Build cache exists, updating..."
  cd "$BUILD_DIR"
  git pull || true
  cd ../..
else
  echo "Cloning faiss-node repository..."
  mkdir -p .build-cache
  git clone --depth 1 https://github.com/ewfian/faiss-node.git "$BUILD_DIR"
fi

echo "✓ Repository ready"
echo ""

# Clean old build artifacts
echo "Cleaning old build artifacts..."
rm -rf "$BUILD_DIR/deps"
rm -rf "$BUILD_DIR/node_modules"
rm -rf "$BUILD_DIR/build"
echo ""

# Build
echo "Building native addon (this will take 10-20 minutes)..."
echo "⏳ Please be patient - compiling FAISS library with OpenBLAS"
echo ""

cd "$BUILD_DIR"

# Set environment for cmake-js to find OpenBLAS
export CMAKE_PREFIX_PATH="$OPENBLAS_PREFIX"

# Install dependencies and build
npm install

cd ../..

echo ""
echo "✓ Build completed successfully"
echo ""

# Copy to external-libs
TARGET_DIR="external-libs/faiss-$PLATFORM"
mkdir -p "$TARGET_DIR"

cp "$BUILD_DIR/build/Release/faiss-node.node" "$TARGET_DIR/"

echo "✓ Copied to $TARGET_DIR/faiss-node.node"
echo ""

# Test
echo "Testing built addon..."
if node -e "require('./$TARGET_DIR/faiss-node.node'); console.log('✓ Addon loaded successfully')"; then
  echo ""
  echo "======================================================================"
  echo "  Build Complete!"
  echo "======================================================================"
  echo ""
  echo "Binary location: $TARGET_DIR/faiss-node.node"
  echo ""
  echo "Next steps:"
  echo "  1. git add $TARGET_DIR/faiss-node.node"
  echo "  2. git commit -m 'feat: add FAISS prebuilt binary for macOS $PLATFORM'"
  echo "  3. git push"
  echo ""
else
  echo ""
  echo "ERROR: Addon test failed"
  echo "Please check the error messages above."
  exit 1
fi
