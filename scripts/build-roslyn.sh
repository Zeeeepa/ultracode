#!/bin/bash
# Build Roslyn C# Addon (UltraCode.CSharp)
# Usage: bash scripts/build-roslyn.sh [--force]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROSLYN_DIR="$PROJECT_ROOT/roslyn"
PUBLISH_DIR="$PROJECT_ROOT/dist/roslyn-addon"
HASH_FILE="$PUBLISH_DIR/.build-hash"
DLL_FILE="$PUBLISH_DIR/UltraCode.CSharp.dll"
FORCE=0

if [ "$1" = "--force" ]; then
    FORCE=1
fi

# Check dotnet
if ! command -v dotnet &> /dev/null; then
    echo "[SKIP] .NET SDK not found in PATH"
    echo "       Install from: https://dotnet.microsoft.com/download"
    exit 0
fi

# Compute hash of source files
compute_hash() {
    find "$ROSLYN_DIR" \( -name "*.cs" -o -name "*.csproj" -o -name "*.props" \) \
        -not -path "*/obj/*" -not -path "*/bin/*" | \
        sort | xargs cat | sha256sum | awk '{print $1}'
}

CURRENT_HASH=$(compute_hash)

# Check if rebuild needed
if [ "$FORCE" -eq 0 ]; then
    if [ -f "$DLL_FILE" ] && [ -f "$HASH_FILE" ]; then
        SAVED_HASH=$(cat "$HASH_FILE")
        if [ "$SAVED_HASH" = "$CURRENT_HASH" ]; then
            echo "[OK] Roslyn addon is up to date (hash match)"
            exit 0
        fi
    fi

    if [ ! -f "$DLL_FILE" ]; then
        echo "[INFO] DLL not found, building..."
    else
        echo "[INFO] Source changed, rebuilding..."
    fi
fi

# Build
echo "[BUILD] Publishing UltraCode.CSharp..."
dotnet publish "$ROSLYN_DIR/UltraCode.CSharp/UltraCode.CSharp.csproj" \
    -c Release -o "$PUBLISH_DIR" --no-self-contained -v quiet

# Save hash
mkdir -p "$PUBLISH_DIR"
echo -n "$CURRENT_HASH" > "$HASH_FILE"

echo "[OK] Roslyn addon built: $DLL_FILE"
