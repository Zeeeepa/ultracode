#!/bin/bash
# Build Comm proxy using Cosmopolitan Libc
# Run this in WSL or Linux

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMM_SRC="$PROJECT_ROOT/src/comm/comm.c"
OUTPUT="$PROJECT_ROOT/dist/ultracode.com"

echo "=== Building UltraCode Comm Proxy ==="
echo "Source: $COMM_SRC"
echo "Output: $OUTPUT"
echo ""

# Check for cosmocc
if ! command -v cosmocc &> /dev/null; then
    echo "cosmocc not found. Installing Cosmopolitan..."

    # Download and install cosmocc
    COSMO_DIR="$HOME/.cosmo"
    if [ ! -d "$COSMO_DIR" ]; then
        mkdir -p "$COSMO_DIR"
        cd "$COSMO_DIR"

        # Download latest cosmocc
        echo "Downloading cosmocc..."
        curl -L -o cosmocc.zip https://cosmo.zip/pub/cosmocc/cosmocc.zip
        unzip -q cosmocc.zip
        rm cosmocc.zip

        echo "cosmocc installed to $COSMO_DIR"
    fi

    export PATH="$COSMO_DIR/bin:$PATH"
fi

echo "Using cosmocc: $(which cosmocc)"
echo ""

# Create dist directory if needed
mkdir -p "$(dirname "$OUTPUT")"

# Build with optimizations
echo "Compiling..."
cosmocc -Os -DNDEBUG -o "$OUTPUT" "$COMM_SRC"

# Check result
if [ -f "$OUTPUT" ]; then
    SIZE=$(stat -c%s "$OUTPUT" 2>/dev/null || stat -f%z "$OUTPUT" 2>/dev/null)
    echo ""
    echo "✓ Build successful!"
    echo "  Output: $OUTPUT"
    echo "  Size: $((SIZE / 1024)) KB"
else
    echo "✗ Build failed!"
    exit 1
fi
