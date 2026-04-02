#!/bin/bash
# Build Comm proxy binaries
#
# Builds:
#   1. Native platform binary (cc) — for current OS
#   2. Windows cross-compile via MinGW (on Linux/WSL2)
#   3. macOS x64 cross-compile (on macOS ARM)
#   4. Cosmopolitan binary (cosmocc) — optional, universal
#
# Usage:
#   bash scripts/build-comm.sh          # build for current platform + cross-targets
#   bash scripts/build-comm.sh --all    # also build Cosmopolitan binary
#   bash scripts/build-comm.sh --cosmo  # only Cosmopolitan

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_SRC="$PROJECT_ROOT/src/comm/comm-native.c"
COSMO_SRC="$PROJECT_ROOT/src/comm/comm.c"

mkdir -p "$PROJECT_ROOT/dist"

echo "=== Building UltraCode Comm Proxy ==="
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"

# ─────────────────────────────────────────────
# Step 1: Native platform binary
# ─────────────────────────────────────────────

case "$OS" in
    Darwin)
        case "$ARCH" in
            arm64) NATIVE_OUT="ultracode-darwin-arm64" ;;
            *)     NATIVE_OUT="ultracode-darwin-x64" ;;
        esac
        ;;
    Linux)
        case "$ARCH" in
            aarch64) NATIVE_OUT="ultracode-linux-arm64" ;;
            *)       NATIVE_OUT="ultracode-linux-x64" ;;
        esac
        ;;
    *)
        NATIVE_OUT=""
        ;;
esac

if [ -n "$NATIVE_OUT" ]; then
    echo "[BUILD] Native: $NATIVE_OUT"
    cc -Os -DNDEBUG -Wall -Wextra -o "$PROJECT_ROOT/dist/$NATIVE_OUT" "$NATIVE_SRC"
    chmod +x "$PROJECT_ROOT/dist/$NATIVE_OUT"
    SIZE=$(stat -f%z "$PROJECT_ROOT/dist/$NATIVE_OUT" 2>/dev/null || stat -c%s "$PROJECT_ROOT/dist/$NATIVE_OUT" 2>/dev/null)
    echo "[OK]    dist/$NATIVE_OUT ($((SIZE / 1024)) KB)"
    echo ""
fi

# ─────────────────────────────────────────────
# Step 2: Cross-compile targets
# ─────────────────────────────────────────────

# macOS ARM → macOS x64
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
    echo "[BUILD] Cross-compile: ultracode-darwin-x64"
    cc -Os -DNDEBUG -Wall -Wextra -target x86_64-apple-macos11 \
        -o "$PROJECT_ROOT/dist/ultracode-darwin-x64" "$NATIVE_SRC" 2>/dev/null && {
        chmod +x "$PROJECT_ROOT/dist/ultracode-darwin-x64"
        echo "[OK]    dist/ultracode-darwin-x64"
    } || echo "[SKIP]  x64 cross-compile not available"
    echo ""
fi

# Linux/WSL2 → Windows x64 via MinGW
if [ "$OS" = "Linux" ]; then
    MINGW=""
    if command -v x86_64-w64-mingw32-gcc &>/dev/null; then
        MINGW="x86_64-w64-mingw32-gcc"
    fi

    if [ -n "$MINGW" ]; then
        echo "[BUILD] Cross-compile: ultracode-win32-x64.exe (MinGW)"
        $MINGW -Os -DNDEBUG -DWIN32 -D_WIN32 -Wall -Wextra \
            -o "$PROJECT_ROOT/dist/ultracode-win32-x64.exe" "$NATIVE_SRC" \
            -lws2_32
        SIZE=$(stat -c%s "$PROJECT_ROOT/dist/ultracode-win32-x64.exe" 2>/dev/null)
        echo "[OK]    dist/ultracode-win32-x64.exe ($((SIZE / 1024)) KB)"
    else
        echo "[SKIP]  Windows cross-compile: mingw-w64 not found"
        echo "        Install: sudo apt install gcc-mingw-w64-x86-64"
    fi
    echo ""

    # Linux x64 → Linux ARM64 (if cross-compiler available)
    if [ "$ARCH" = "x86_64" ] && command -v aarch64-linux-gnu-gcc &>/dev/null; then
        echo "[BUILD] Cross-compile: ultracode-linux-arm64"
        aarch64-linux-gnu-gcc -Os -DNDEBUG -Wall -Wextra -static \
            -o "$PROJECT_ROOT/dist/ultracode-linux-arm64" "$NATIVE_SRC" && {
            chmod +x "$PROJECT_ROOT/dist/ultracode-linux-arm64"
            echo "[OK]    dist/ultracode-linux-arm64"
        } || echo "[SKIP]  ARM64 cross-compile failed"
        echo ""
    fi
fi

# ─────────────────────────────────────────────
# Step 3: Cosmopolitan binary (optional)
# ─────────────────────────────────────────────

if [ "$1" = "--all" ] || [ "$1" = "--cosmo" ]; then
    COSMOCC=""
    if [ -f "$HOME/.cosmo/bin/cosmocc" ]; then
        COSMOCC="$HOME/.cosmo/bin/cosmocc"
    elif [ -f "$HOME/.local/cosmocc/bin/cosmocc" ]; then
        COSMOCC="$HOME/.local/cosmocc/bin/cosmocc"
    elif command -v cosmocc &>/dev/null; then
        COSMOCC="cosmocc"
    fi

    if [ -n "$COSMOCC" ]; then
        echo "[BUILD] Cosmopolitan: ultracode.com"
        "$COSMOCC" -Os -DNDEBUG -o "$PROJECT_ROOT/dist/ultracode.com" "$COSMO_SRC"
        echo "[OK]    dist/ultracode.com (universal)"

        # .cmd wrapper for Windows
        printf '@echo off\r\n"%%~dp0ultracode.com" %%*\r\n' > "$PROJECT_ROOT/dist/ultracode.cmd"
        echo "[OK]    dist/ultracode.cmd (Windows wrapper)"
    else
        echo "[SKIP] cosmocc not found — skipping Cosmopolitan build"
        echo "       Install: curl -L https://cosmo.zip/pub/cosmocc/cosmocc.zip"
    fi
    echo ""
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

echo "=== Summary ==="
for f in ultracode-darwin-arm64 ultracode-darwin-x64 ultracode-linux-x64 ultracode-linux-arm64 ultracode-win32-x64.exe ultracode.com; do
    if [ -f "$PROJECT_ROOT/dist/$f" ]; then
        SIZE=$(stat -f%z "$PROJECT_ROOT/dist/$f" 2>/dev/null || stat -c%s "$PROJECT_ROOT/dist/$f" 2>/dev/null)
        echo "  ✓ dist/$f ($((SIZE / 1024)) KB)"
    fi
done
echo ""
echo "=== Done ==="
