#!/bin/bash

# WASM Build Script for Linux/macOS
# Builds WASM modules with SIMD optimization using wasm-pack

set -e

echo "========================================="
echo "Building WASM modules with SIMD support"
echo "========================================="

# Check if Rust/Cargo is installed
if ! command -v cargo &> /dev/null; then
    # Try to source Rust environment
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

# Final check
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo not found"
    echo ""
    echo "Please install Rust from: https://rustup.rs/"
    echo "  Linux/macOS: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo ""
    exit 1
fi

echo "✅ Using cargo: $(which cargo)"

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack not found. Installing..."
    cargo install wasm-pack
fi

echo ""
echo "✅ Prerequisites installed"
echo ""

# Build diff-simd module
echo "📦 Building external-tools/wasm/diff-simd..."
cd external-tools/wasm/diff-simd
wasm-pack build --target bundler --out-dir ../../../dist/wasm/diff-simd --release
cd ../..
echo "✅ diff-simd built successfully"
echo ""

# Build vector-ops-simd module
echo "📦 Building external-tools/wasm/vector-ops-simd..."
cd external-tools/wasm/vector-ops-simd
wasm-pack build --target bundler --out-dir ../../../dist/wasm/vector-ops-simd --release
cd ../..
echo "✅ vector-ops-simd built successfully"
echo ""

# Success message
echo "========================================="
echo "✅ All WASM modules built successfully!"
echo "========================================="
echo ""
echo "Output directories:"
echo "  - dist/external-tools/wasm/diff-simd/"
echo "  - dist/external-tools/wasm/vector-ops-simd/"
echo ""
echo "To use in Node.js:"
echo "  import { compute_diff_simd } from './dist/external-tools/wasm/diff-simd/diff_simd.js';"
echo "  import { cosine_similarity_simd } from './dist/external-tools/wasm/vector-ops-simd/vector_ops_simd.js';"
echo ""

exit 0
