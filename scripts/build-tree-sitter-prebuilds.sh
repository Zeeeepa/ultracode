#!/bin/bash
# Build Tree-sitter Prebuilds for Node.js 24+ (C++20)
# Creates prebuilt native bindings for tree-sitter and language parsers

set -e

echo "======================================================================"
echo "  Building Tree-sitter Prebuilds for Node.js 24+"
echo "======================================================================"

# Detect platform
case "$(uname -s)" in
  Darwin*)  PLATFORM="darwin" ;;
  Linux*)   PLATFORM="linux" ;;
  *)        echo "Unsupported platform: $(uname -s)"; exit 1 ;;
esac

# Detect architecture
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  *)             ARCH="x64" ;;
esac

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

OUTPUT_DIR="$PROJECT_ROOT/external-libs/tree-sitter-${PLATFORM}-${ARCH}"

echo ""
echo "Project root: $PROJECT_ROOT"
echo "Output directory: $OUTPUT_DIR"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# List of packages to build
PACKAGES=(
  "tree-sitter"
  "tree-sitter-javascript"
  "tree-sitter-typescript"
  "tree-sitter-python"
  "tree-sitter-go"
  "tree-sitter-rust"
  "tree-sitter-c"
  "tree-sitter-cpp"
  "tree-sitter-java"
  "tree-sitter-kotlin"
  "tree-sitter-swift"
  "tree-sitter-bash"
  "tree-sitter-css"
  "tree-sitter-html"
  "tree-sitter-powershell"
  "tree-sitter-c-sharp"
)

echo ""
echo " Step 1: Patching binding.gyp files for C++20..."

for pkg in "${PACKAGES[@]}"; do
  pkg_path="$PROJECT_ROOT/node_modules/$pkg"
  binding_gyp="$pkg_path/binding.gyp"

  if [ -f "$binding_gyp" ]; then
    # Patch C++17 -> C++20 for Node.js 24 compatibility
    if grep -q 'c++17' "$binding_gyp" 2>/dev/null; then
      sed -i.bak 's/-std=c++17/-std=c++20/g' "$binding_gyp"
      sed -i.bak 's/-std:c++17/-std:c++20/g' "$binding_gyp"
      sed -i.bak 's/"CLANG_CXX_LANGUAGE_STANDARD": "c++17"/"CLANG_CXX_LANGUAGE_STANDARD": "c++20"/g' "$binding_gyp"
      rm -f "$binding_gyp.bak"
      echo "   Patched: $pkg"
    else
      echo "   Already patched or no C++17: $pkg"
    fi
  fi
done

echo ""
echo " Step 2: Rebuilding native modules..."

BUILT_COUNT=0
FAILED_COUNT=0

for pkg in "${PACKAGES[@]}"; do
  pkg_path="$PROJECT_ROOT/node_modules/$pkg"

  if [ ! -d "$pkg_path" ]; then
    echo "   Skipping (not installed): $pkg"
    continue
  fi

  echo "   Building: $pkg..."

  # Rebuild the package
  if npm rebuild "$pkg" >/dev/null 2>&1; then
    # Find and copy .node files
    while IFS= read -r -d '' node_file; do
      filename=$(basename "$node_file")
      cp "$node_file" "$OUTPUT_DIR/$filename"
      echo "   Copied: $filename"
      ((BUILT_COUNT++))
    done < <(find "$pkg_path" -name "*.node" -print0 2>/dev/null | head -1)
  else
    echo "   FAILED: $pkg"
    ((FAILED_COUNT++))
  fi
done

echo "======================================================================"
echo ""
echo " Results:"
echo "   Built: $BUILT_COUNT modules"
if [ "$FAILED_COUNT" -gt 0 ]; then
  echo "   Failed: $FAILED_COUNT modules"
fi

# List built files
echo ""
echo " Built prebuilds in $OUTPUT_DIR:"
for f in "$OUTPUT_DIR"/*.node; do
  if [ -f "$f" ]; then
    size=$(du -h "$f" | cut -f1)
    echo "   $(basename "$f") ($size)"
  fi
done

echo "======================================================================"
echo "  Done! Prebuilds ready for packaging."
echo "======================================================================"
