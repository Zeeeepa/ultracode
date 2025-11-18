#!/bin/bash
# Build script for UltraScript Tools MCP Server
# Compiles TypeScript to dist/ directory using tsup

set -e  # Exit on error

echo "========================================"
echo "Building UltraScript Tools MCP Server..."
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "ERROR: node_modules not found!"
    echo "Please run: npm install"
    echo ""
    exit 1
fi

# Run TypeScript type checking first
echo "[1/3] Running TypeScript type check..."
npm run typecheck
echo "Type check passed!"
echo ""

# Run build
echo "[2/3] Building with tsup..."
npm run build
echo "Build completed successfully!"
echo ""

# Show output
echo "[3/3] Build artifacts:"
echo ""
if [ -f "dist/index.js" ]; then
    size=$(wc -c < "dist/index.js")
    echo "✓ dist/index.js"
    echo "  Size: $size bytes"
fi
[ -f "dist/index.js.map" ] && echo "✓ dist/index.js.map"
[ -f "dist/index.d.ts" ] && echo "✓ dist/index.d.ts"
echo ""

# Count native modules
node_count=$(find dist -name "*.node" 2>/dev/null | wc -l)
if [ "$node_count" -gt 0 ]; then
    echo "✓ $node_count native modules (.node files)"
    echo ""
fi

echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "Output directory: dist/"
echo "Entry point: dist/index.js"
echo ""
echo "To run the server:"
echo "  node dist/index.js [directory]"
echo ""
echo "To create NPM package:"
echo "  make package"
echo ""

exit 0
