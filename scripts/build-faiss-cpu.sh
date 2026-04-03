#!/bin/bash
# Build FAISS CPU native addon for macOS (Apple Silicon + Intel)
# Auto-installs dependencies via Homebrew
#
# Output: external-libs/faiss-darwin-arm64/ultracode_faiss.node
#         or external-libs/faiss-darwin-x64/ultracode_faiss.node
#
# Usage:
#   ./scripts/build-faiss-cpu.sh          # Build
#   ./scripts/build-faiss-cpu.sh --check  # Check if already built
#   ./scripts/build-faiss-cpu.sh --force  # Force rebuild

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/external-tools/native/faiss-cpu"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  PLATFORM="darwin-arm64"
elif [ "$ARCH" = "x86_64" ]; then
  PLATFORM="darwin-x64"
else
  echo "ERROR: Unsupported architecture: $ARCH"
  exit 1
fi

TARGET_DIR="$PROJECT_ROOT/external-libs/faiss-$PLATFORM"
TARGET_FILE="$TARGET_DIR/ultracode_faiss.node"

# --check mode: just verify if binary exists
if [ "$1" = "--check" ]; then
  if [ -f "$TARGET_FILE" ]; then
    echo "ok"
    exit 0
  else
    echo "missing"
    exit 1
  fi
fi

# Skip if already built (unless --force)
if [ "$1" != "--force" ] && [ -f "$TARGET_FILE" ]; then
  echo "[faiss-cpu] Already built: $TARGET_FILE"
  exit 0
fi

echo "======================================================================"
echo "  Building FAISS CPU addon for macOS ($PLATFORM)"
echo "======================================================================"
echo ""

# ── Check/install Homebrew ──────────────────────────────────────────────
if ! command -v brew &> /dev/null; then
  echo "ERROR: Homebrew not found"
  echo "Install: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
fi
echo "[ok] Homebrew"

# ── Check/install Xcode Command Line Tools ──────────────────────────────
if ! xcode-select -p &> /dev/null; then
  echo "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "Please complete installation and re-run this script."
  exit 0
fi
echo "[ok] Xcode CLT"

# ── Install brew dependencies ───────────────────────────────────────────
install_brew_dep() {
  if brew list "$1" &> /dev/null; then
    echo "[ok] $1"
  else
    echo "Installing $1..."
    brew install "$1"
    echo "[ok] $1 (installed)"
  fi
}

install_brew_dep cmake
install_brew_dep faiss
install_brew_dep libomp

# ── Check Node.js ───────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js not found. Install via: brew install node"
  exit 1
fi
echo "[ok] Node $(node --version)"

# ── Install npm dependencies ────────────────────────────────────────────
echo ""
echo "Installing build dependencies..."
cd "$BUILD_DIR"
npm install --ignore-scripts 2>&1 | tail -2
echo ""

# ── Build ───────────────────────────────────────────────────────────────
echo "Compiling native addon..."
echo ""

# cmake-js needs to find FAISS
FAISS_PREFIX=$(brew --prefix faiss)
OMP_PREFIX=$(brew --prefix libomp)

# Run cmake-js with FAISS paths
npx cmake-js compile \
  --CDENABLE_FAISS_CPU=ON \
  --CDFAISS_ROOT="$FAISS_PREFIX" \
  --CDCMAKE_PREFIX_PATH="$FAISS_PREFIX;$OMP_PREFIX" \
  2>&1

echo ""

# ── Copy to external-libs ──────────────────────────────────────────────
mkdir -p "$TARGET_DIR"

# cmake-js output is in build/Release/
BUILT_FILE="$BUILD_DIR/build/Release/ultracode_faiss.node"
if [ ! -f "$BUILT_FILE" ]; then
  echo "ERROR: Build output not found at $BUILT_FILE"
  echo "Checking build directory..."
  find "$BUILD_DIR/build" -name "*.node" 2>/dev/null
  exit 1
fi

cp "$BUILT_FILE" "$TARGET_FILE"
echo "[ok] Copied to $TARGET_FILE"

# ── Test ────────────────────────────────────────────────────────────────
echo ""
echo "Testing addon..."
if node -e "
  const m = require('$TARGET_FILE');
  const info = m.getDeviceInfo();
  console.log('[ok] Addon loaded:', {
    hasNativeFaiss: m.hasNativeFaiss,
    hasGpuFaiss: m.hasGpuFaiss,
    faissOnly: info.faissOnly
  });
  if (!m.hasNativeFaiss) {
    console.error('ERROR: hasNativeFaiss is false!');
    process.exit(1);
  }
"; then
  echo ""
  echo "======================================================================"
  echo "  FAISS CPU addon built successfully!"
  echo "  Binary: $TARGET_FILE"
  echo "======================================================================"
else
  echo ""
  echo "ERROR: Addon test failed"
  exit 1
fi
