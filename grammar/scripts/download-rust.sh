#!/bin/bash

# Download Rust ANTLR grammar from AmazingAng/rust-antlr4 repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/../rust/grammar"
RUST_GRAMMAR_BASE="https://raw.githubusercontent.com/AmazingAng/rust-antlr4/main/grammar"

echo "=== Downloading Rust ANTLR Grammar ==="
echo "Target directory: $GRAMMAR_DIR"

# Create directory
mkdir -p "$GRAMMAR_DIR"

# Download grammar files
echo "Downloading RustLexer.g4..."
curl -fsSL "$RUST_GRAMMAR_BASE/RustLexer.g4" -o "$GRAMMAR_DIR/RustLexer.g4" || {
    echo "ERROR: Failed to download RustLexer.g4"
    exit 1
}

echo "Downloading RustParser.g4..."
curl -fsSL "$RUST_GRAMMAR_BASE/RustParser.g4" -o "$GRAMMAR_DIR/RustParser.g4" || {
    echo "ERROR: Failed to download RustParser.g4"
    exit 1
}

echo ""
echo "=== Download Complete ==="
echo "Files downloaded to: $GRAMMAR_DIR"
ls -la "$GRAMMAR_DIR"
echo ""
echo "Next step: Run generate-rust.sh to generate TypeScript parser"
