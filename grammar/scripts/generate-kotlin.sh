#!/bin/bash
# Generate TypeScript parser from Kotlin ANTLR grammar

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/../kotlin/grammar"
OUTPUT_DIR="$SCRIPT_DIR/../../src/generated/kotlin"
PROJECT_ROOT="$SCRIPT_DIR/../.."

echo "=== Generating Kotlin TypeScript Parser ==="

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
if [ ! -f "$GRAMMAR_DIR/KotlinLexer.g4" ]; then
    echo "ERROR: Grammar files not found in $GRAMMAR_DIR"
    echo "Run download-kotlin.sh first"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Install antlr4ng-cli if not available
echo "Checking antlr4ng-cli..."
cd "$PROJECT_ROOT"

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
    "$GRAMMAR_DIR/UnicodeClasses.g4"

echo "Generating Parser..."
npx antlr4ng -Dlanguage=TypeScript \
    -visitor \
    -listener \
    -lib "$GRAMMAR_DIR" \
    -o "$OUTPUT_DIR" \
    "$GRAMMAR_DIR/KotlinLexer.g4" \
    "$GRAMMAR_DIR/KotlinParser.g4"

# Post-process generated files
echo ""
echo "Post-processing generated files..."

# Add @ts-nocheck to all TypeScript files (after first comment line)
for f in "$OUTPUT_DIR"/*.ts; do
    if [ -f "$f" ]; then
        sed -i '1 a\// @ts-nocheck - Auto-generated code' "$f"
    fi
done

# Fix modeStack bug in KotlinLexer.ts
sed -i 's/this\._modeStack\.isEmpty()/this.modeStack.length > 0/g' "$OUTPUT_DIR/KotlinLexer.ts"

# Create index.ts for convenient imports
cat > "$OUTPUT_DIR/index.ts" << 'EOF'
// Auto-generated index file for Kotlin ANTLR parser
// DO NOT EDIT - regenerate using scripts/generate-kotlin.sh
// @ts-nocheck

export * from './KotlinLexer.js';
export * from './KotlinParser.js';
export * from './KotlinParserVisitor.js';
export * from './KotlinParserListener.js';
EOF

echo ""
echo "=== Generation Complete ==="
echo "Output directory: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
echo ""
echo "Generated files are ready to use. Commit them to the repository."
echo ""
echo "Usage in TypeScript:"
echo "  import { KotlinLexer, KotlinParser } from './generated/kotlin';"
