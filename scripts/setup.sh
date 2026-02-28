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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Determine which file to run - prefer dist (npm install), fallback to src (dev)
SETUP_FILE_JS="dist/cli/setup-command.js"
SETUP_FILE_TS="src/cli/setup-command.ts"

if [ -f "$SETUP_FILE_JS" ]; then
    # Running compiled JS - use node directly
    exec node "$SETUP_FILE_JS" "$@"
fi

# Running TypeScript source - need TS runtime
# Check if bun is available
if command -v bun &> /dev/null; then
    exec bun run "$SETUP_FILE_TS" "$@"
fi

# Fallback to tsx if bun not available
if command -v tsx &> /dev/null; then
    exec tsx "$SETUP_FILE_TS" "$@"
fi

# Fallback to npx tsx
if command -v npx &> /dev/null; then
    exec npx tsx "$SETUP_FILE_TS" "$@"
fi

echo "ERROR: No TypeScript runtime found (bun, tsx, or npx)"
echo "Please install bun: https://bun.sh"
exit 1
