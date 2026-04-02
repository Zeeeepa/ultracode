#!/bin/bash

# Generate TypeScript parser from Java ANTLR grammar

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/../java/grammar"
OUTPUT_DIR="$SCRIPT_DIR/../../src/generated/java"
PROJECT_ROOT="$SCRIPT_DIR/../.."

echo "=== Generating Java TypeScript Parser ==="

# Check Java is installed
if ! command -v java &> /dev/null; then
    echo "ERROR: Java is required for ANTLR code generation"
    echo "Please install JDK 11+ and try again"
    exit 1
fi

echo "Java version:"
java -version
echo ""

# Check grammar files exist
if [ ! -f "$GRAMMAR_DIR/Java20Lexer.g4" ]; then
    echo "ERROR: Grammar files not found in $GRAMMAR_DIR"
    echo "Run download-java.sh first"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Navigate to project root for npm commands
pushd "$PROJECT_ROOT" > /dev/null

# Check/install antlr4ng-cli
echo "Checking antlr4ng-cli..."
if ! npx antlr4ng --version &> /dev/null; then
    echo "Installing antlr4ng-cli..."
    npm install --save-dev antlr4ng-cli
fi

# Generate TypeScript code
echo ""
echo "Generating Lexer..."
npx antlr4ng -Dlanguage=TypeScript \
    -visitor \
    -listener \
    -o "$OUTPUT_DIR" \
    "$GRAMMAR_DIR/Java20Lexer.g4" || {
    echo "ERROR: Failed to generate Lexer"
    popd > /dev/null
    exit 1
}

echo "Generating Parser..."
npx antlr4ng -Dlanguage=TypeScript \
    -visitor \
    -listener \
    -lib "$GRAMMAR_DIR" \
    -o "$OUTPUT_DIR" \
    "$GRAMMAR_DIR/Java20Parser.g4" || {
    echo "ERROR: Failed to generate Parser"
    popd > /dev/null
    exit 1
}

popd > /dev/null

# Post-process generated files
echo ""
echo "Post-processing generated files..."

# Add @ts-nocheck to all TypeScript files
for f in "$OUTPUT_DIR"/*.ts; do
    if [ -f "$f" ]; then
        sed -i '1s/^/\/\/ @ts-nocheck - Auto-generated code\n/' "$f"
    fi
done

# Create index.ts for convenient imports
cat > "$OUTPUT_DIR/index.ts" << 'EOF'
// Auto-generated index file for Java ANTLR parser
// DO NOT EDIT - regenerate using scripts/generate-java.sh
// @ts-nocheck

export * from './Java20Lexer.js';
export * from './Java20Parser.js';
export * from './Java20ParserVisitor.js';
export * from './Java20ParserListener.js';
EOF

echo ""
echo "=== Generation Complete ==="
echo "Output directory: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
echo ""
echo "Generated files are ready to use. Commit them to the repository."
echo ""
echo "Usage in TypeScript:"
echo "  import { Java20Lexer, Java20Parser } from './generated/java';"
