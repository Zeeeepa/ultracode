#!/usr/bin/env bash
# ==============================================================================
# UltraCode - Semantic Embedding Setup v2
# ==============================================================================
# Flow:
#   0. Detect CPU (AVX2/VNNI/AMX) + GPU (NVIDIA arch)
#   1. Ask: Comment language (English / Multilingual)
#   2. Recommend best provider (OpenVINO/TEI/Ollama)
#   3. Select model (512 tok + 8K legacy)
#   4. Install
# ==============================================================================

set -e

# Ensure common tool paths are available (macOS: bun, cargo, etc.)
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Determine which file to run - prefer dist (npm install), fallback to src (dev)
SETUP_FILE_JS="dist/cli/setup-command.js"
SETUP_FILE_TS="src/cli/setup-command.ts"

# Use bun (preferred) or node to run setup
if command -v bun &> /dev/null; then
    if [ -f "$SETUP_FILE_JS" ]; then
        exec bun "$SETUP_FILE_JS" "$@"
    elif [ -f "$SETUP_FILE_TS" ]; then
        exec bun "$SETUP_FILE_TS" "$@"
    fi
fi

if command -v node &> /dev/null; then
    if [ -f "$SETUP_FILE_JS" ]; then
        exec node "$SETUP_FILE_JS" "$@"
    fi
fi

if command -v tsx &> /dev/null; then
    [ -f "$SETUP_FILE_TS" ] && exec tsx "$SETUP_FILE_TS" "$@"
fi

echo "ERROR: No JS runtime found (bun, node, or tsx)"
echo "Install bun: https://bun.sh"
exit 1
