#!/bin/bash

# Download Java ANTLR grammar from antlr/grammars-v4 repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/../java/grammar"
JAVA_GRAMMAR_BASE="https://raw.githubusercontent.com/antlr/grammars-v4/master/java/java20"

echo "=== Downloading Java ANTLR Grammar ==="
echo "Target directory: $GRAMMAR_DIR"

# Create directory
mkdir -p "$GRAMMAR_DIR"

# Download grammar files
echo "Downloading Java20Lexer.g4..."
curl -fsSL "$JAVA_GRAMMAR_BASE/Java20Lexer.g4" -o "$GRAMMAR_DIR/Java20Lexer.g4" || {
    echo "ERROR: Failed to download Java20Lexer.g4"
    exit 1
}

echo "Downloading Java20Parser.g4..."
curl -fsSL "$JAVA_GRAMMAR_BASE/Java20Parser.g4" -o "$GRAMMAR_DIR/Java20Parser.g4" || {
    echo "ERROR: Failed to download Java20Parser.g4"
    exit 1
}

echo ""
echo "=== Download Complete ==="
echo "Files downloaded to: $GRAMMAR_DIR"
ls -la "$GRAMMAR_DIR"
echo ""
echo "Next step: Run generate-java.sh to generate TypeScript parser"
