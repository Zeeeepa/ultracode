#!/usr/bin/env bash
# ==============================================================================
# UltraScript Tools MCP - Semantic Embedding Setup v2
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

# Check if bun is available
if command -v bun &> /dev/null; then
    exec bun run src/cli/setup-command.ts "$@"
fi

# Fallback to tsx if bun not available
if command -v tsx &> /dev/null; then
    exec tsx src/cli/setup-command.ts "$@"
fi

# Fallback to npx tsx
if command -v npx &> /dev/null; then
    exec npx tsx src/cli/setup-command.ts "$@"
fi

echo "ERROR: No TypeScript runtime found (bun, tsx, or npx)"
echo "Please install bun: https://bun.sh"
exit 1
