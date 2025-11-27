#!/usr/bin/env bash
# ==============================================================================
# UltraScript Tools MCP - Semantic Embedding Setup
# Simple launcher for Linux/macOS users
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "Semantic Embedding Configuration Setup"
echo "========================================"
echo ""

# Check if pwsh is available
if command -v pwsh &> /dev/null; then
    echo "Using PowerShell Core..."
    pwsh -ExecutionPolicy Bypass -File "$SCRIPT_DIR/setup-semantic-embedding.ps1" "$@"
else
    echo "PowerShell Core (pwsh) is required but not installed."
    echo ""
    echo "Install PowerShell Core:"
    echo "  macOS:  brew install powershell/tap/powershell"
    echo "  Ubuntu: sudo apt-get install powershell"
    echo "  Other:  https://aka.ms/powershell"
    echo ""
    echo "Alternative: Run the interactive bash script:"
    echo "  ./scripts/setup-embeddings-interactive.sh"
    exit 1
fi
