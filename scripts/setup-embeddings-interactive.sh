#!/usr/bin/env bash
# ==============================================================================
# UltraScript Tools MCP - Interactive Embeddings Setup (Bash)
# For Linux/macOS users without PowerShell Core
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_ROOT/config/embedding-models.json"
OUTPUT_DIR="$PROJECT_ROOT/.ultrasharp"
OUTPUT_FILE="$OUTPUT_DIR/semantic-config.json"

echo "========================================"
echo "UltraScript Tools MCP - Embeddings Setup"
echo "========================================"
echo ""

# Check jq
if ! command -v jq &> /dev/null; then
    echo -e "${RED}[ERROR] jq is required but not installed${NC}"
    echo ""
    echo "Install jq:"
    echo "  macOS:   brew install jq"
    echo "  Ubuntu:  sudo apt-get install jq"
    echo "  Fedora:  sudo dnf install jq"
    exit 1
fi

# Check config file
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}[ERROR] Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# ==============================================================================
# Step 1: GPU Detection
# ==============================================================================

echo -e "${CYAN}[1/3] GPU Detection${NC}"
echo ""

architecture="cpu"
has_gpu=false

if command -v nvidia-smi &> /dev/null; then
    gpu_info=$(nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader 2>/dev/null | head -1)

    if [ -n "$gpu_info" ]; then
        gpu_name=$(echo "$gpu_info" | cut -d',' -f1 | xargs)
        compute_cap=$(echo "$gpu_info" | cut -d',' -f2 | xargs)

        echo -e "${GREEN}[OK] GPU detected: $gpu_name (CC: $compute_cap)${NC}"

        # Map compute capability
        case "$compute_cap" in
            "7.5") architecture="turing" ;;
            "8.0") architecture="ampere-80" ;;
            "8.6"|"8.7") architecture="ampere-86" ;;
            "8.9") architecture="ada" ;;
            "9.0") architecture="hopper" ;;
            "10.0"|"10.2"|"12.0")
                architecture="blackwell"
                echo -e "${YELLOW}[WARNING] Blackwell GPU - TEI doesn't support it yet${NC}"
                echo "Choose mode:"
                echo "  1) CPU mode (stable)"
                echo "  2) Patched TEI (experimental)"
                read -p "Choice [1-2] (default: 1): " choice
                if [ "$choice" = "2" ]; then
                    architecture="blackwell-patch"
                else
                    architecture="cpu"
                fi
                ;;
            *) architecture="cpu" ;;
        esac

        if [ "$architecture" != "cpu" ]; then
            has_gpu=true
        fi
    fi
else
    echo -e "${YELLOW}[WARNING] No NVIDIA GPU detected${NC}"
fi

echo "Selected architecture: $architecture"
echo ""

# ==============================================================================
# Step 2: Provider Selection
# ==============================================================================

echo -e "${CYAN}[2/3] Provider Selection${NC}"
echo ""

providers=$(jq -r '.providers | keys[]' "$CONFIG_FILE")
i=1

for provider in $providers; do
    name=$(jq -r ".providers.\"$provider\".name" "$CONFIG_FILE")
    desc=$(jq -r ".providers.\"$provider\".description" "$CONFIG_FILE")
    echo "$i) $name"
    echo "   $desc" | sed 's/\\n/\n   /g'
    echo ""
    ((i++))
done

provider_count=$(echo "$providers" | wc -l)
read -p "Choose provider [1-$provider_count]: " provider_choice

selected_provider=$(echo "$providers" | sed -n "${provider_choice}p")

if [ -z "$selected_provider" ]; then
    echo -e "${RED}[ERROR] Invalid choice${NC}"
    exit 1
fi

echo -e "${GREEN}Selected: $(jq -r ".providers.\"$selected_provider\".name" "$CONFIG_FILE")${NC}"
echo ""

# Memory provider
if [ "$selected_provider" = "memory" ]; then
    echo -e "${YELLOW}[WARNING] Memory provider uses deterministic hashing (no ML)${NC}"
    echo ""

    mkdir -p "$OUTPUT_DIR"
    cat > "$OUTPUT_FILE" << EOF
{
  "enabled": true,
  "embedding": {
    "platform": "memory",
    "architecture": "$architecture"
  }
}
EOF

    echo -e "${GREEN}Configuration saved to: $OUTPUT_FILE${NC}"
    exit 0
fi

# ==============================================================================
# Step 3: Model Selection
# ==============================================================================

echo -e "${CYAN}[3/3] Model Selection${NC}"
echo ""

models=$(jq -c ".models[] | select(.provider == \"$selected_provider\")" "$CONFIG_FILE")
i=1

while IFS= read -r model; do
    name=$(echo "$model" | jq -r '.name')
    badge=$(echo "$model" | jq -r '.badge // empty')
    context=$(echo "$model" | jq -r '.context_tokens')
    dims=$(echo "$model" | jq -r '.dimensions')
    size=$(echo "$model" | jq -r '.size_mb')
    desc=$(echo "$model" | jq -r '.description')

    if [ -n "$badge" ]; then
        echo "$i) $name $badge"
    else
        echo "$i) $name"
    fi
    echo "   Context: $context tokens | Dim: $dims | Size: ~${size}MB"
    echo "   $desc"
    echo ""
    ((i++))
done <<< "$models"

model_count=$(echo "$models" | wc -l)
read -p "Choose model [1-$model_count]: " model_choice

selected_model=$(echo "$models" | sed -n "${model_choice}p")
model_id=$(echo "$selected_model" | jq -r '.model_id')
model_name=$(echo "$selected_model" | jq -r '.name')

echo -e "${GREEN}Selected: $model_name${NC}"
echo ""

# ==============================================================================
# Save Configuration
# ==============================================================================

mkdir -p "$OUTPUT_DIR"

if [ "$selected_provider" = "tei" ]; then
    cat > "$OUTPUT_FILE" << EOF
{
  "enabled": true,
  "embedding": {
    "platform": "tei",
    "architecture": "$architecture",
    "tei": {
      "endpoint": "http://127.0.0.1:8080",
      "selected_model": "$model_id"
    }
  }
}
EOF
else
    cat > "$OUTPUT_FILE" << EOF
{
  "enabled": true,
  "embedding": {
    "platform": "ollama",
    "architecture": "$architecture",
    "ollama": {
      "endpoint": "http://127.0.0.1:11434",
      "selected_model": "$model_id"
    }
  }
}
EOF
fi

echo -e "${GREEN}Configuration saved to: $OUTPUT_FILE${NC}"
echo ""

# ==============================================================================
# Installation
# ==============================================================================

if [ "$selected_provider" = "tei" ]; then
    echo -e "${CYAN}Installing TEI...${NC}"
    echo ""

    if [ -f "$SCRIPT_DIR/setup-tei.sh" ]; then
        chmod +x "$SCRIPT_DIR/setup-tei.sh"
        "$SCRIPT_DIR/setup-tei.sh" --model-id "$model_id" --architecture "$architecture"
    else
        echo -e "${YELLOW}[WARNING] setup-tei.sh not found${NC}"
        echo "Install TEI manually:"
        echo "  docker pull ghcr.io/huggingface/text-embeddings-inference:1.8.3"
        echo "  docker run -d --name tei-server -p 8080:80 --gpus all \\"
        echo "    ghcr.io/huggingface/text-embeddings-inference:1.8.3 \\"
        echo "    --model-id $model_id"
    fi
elif [ "$selected_provider" = "ollama" ]; then
    echo -e "${CYAN}Installing Ollama...${NC}"
    echo ""

    if ! command -v ollama &> /dev/null; then
        echo "Installing Ollama..."
        curl -fsSL https://ollama.com/install.sh | sh
    fi

    # Start service if not running
    if ! curl -sf http://localhost:11434/ &> /dev/null; then
        echo "Starting Ollama service..."
        nohup ollama serve > /dev/null 2>&1 &
        sleep 3
    fi

    echo "Downloading model: $model_id"
    ollama pull "$model_id"
fi

echo ""
echo "========================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================"
echo ""
echo "Provider: $selected_provider"
echo "Model: $model_name"
echo "Config: $OUTPUT_FILE"
echo ""
