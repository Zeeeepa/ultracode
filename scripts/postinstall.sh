#!/bin/sh
# Postinstall wrapper: ensures Node.js exists, then runs postinstall.cjs
# Works whether installed via npm (node available) or bun (node may be missing)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure bun/homebrew in PATH
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
[ -d "/opt/homebrew/bin" ] && export PATH="/opt/homebrew/bin:$PATH"

# Install Node.js if missing (required for subprocess runtime)
if ! command -v node >/dev/null 2>&1; then
    echo "[postinstall] Node.js not found, installing..."

    OS="$(uname -s)"
    if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
        brew install node 2>&1 | tail -3
    elif [ "$OS" = "Linux" ] && command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
        sudo apt-get install -y nodejs >/dev/null 2>&1
    elif [ "$OS" = "Linux" ] && command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs >/dev/null 2>&1
    fi

    if command -v node >/dev/null 2>&1; then
        echo "[postinstall] Node.js $(node --version) installed"
    else
        echo "[postinstall] WARNING: Could not install Node.js"
        echo "  Install manually: https://nodejs.org/"
        echo "  UltraCode requires Node.js for native subprocess runtime"
        exit 0  # Don't fail npm install
    fi
fi

# Run the actual postinstall
exec node "$SCRIPT_DIR/postinstall.cjs"
