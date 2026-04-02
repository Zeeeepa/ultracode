#!/bin/bash
# Download Kotlin ANTLR grammar from official kotlin-spec repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAMMAR_DIR="$SCRIPT_DIR/../kotlin/grammar"
KOTLIN_SPEC_BASE="https://raw.githubusercontent.com/Kotlin/kotlin-spec/master/grammar/src/main/antlr"

echo "=== Downloading Kotlin ANTLR Grammar ==="
echo "Target directory: $GRAMMAR_DIR"

# Create directory
mkdir -p "$GRAMMAR_DIR"

# Download grammar files
echo "Downloading KotlinLexer.g4..."
curl -fsSL "$KOTLIN_SPEC_BASE/KotlinLexer.g4" -o "$GRAMMAR_DIR/KotlinLexer.g4"

echo "Downloading KotlinParser.g4..."
curl -fsSL "$KOTLIN_SPEC_BASE/KotlinParser.g4" -o "$GRAMMAR_DIR/KotlinParser.g4"

echo "Downloading UnicodeClasses.g4..."
curl -fsSL "$KOTLIN_SPEC_BASE/UnicodeClasses.g4" -o "$GRAMMAR_DIR/UnicodeClasses.g4"

echo ""
echo "=== Download Complete ==="
echo "Files downloaded to: $GRAMMAR_DIR"
ls -la "$GRAMMAR_DIR"
echo ""
echo "Next step: Run generate-kotlin.sh to generate TypeScript parser"
