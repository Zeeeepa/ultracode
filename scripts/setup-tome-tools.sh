#!/bin/bash
# ============================================
#  ToMe Tools Setup for OVMS Embeddings
# ============================================
#
# Installs Token Merging tools for model conversion
# ToMe ratio: 0.3 (optimal for embeddings, 1.5-2x speedup)
#
# Output: ~/.local/share/ultracode/tome/
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}[OK]${NC} $1"; }
err() { echo -e "  ${RED}[ERROR]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[--]${NC} $1"; }

echo ""
echo "============================================"
echo "  ToMe Tools Setup for Embeddings"
echo "============================================"
echo "  Target: ~/.local/share/ultracode/tome/"
echo "  ToMe: 0.3 (30% merging, 1.5-2x speedup)"
echo "============================================"
echo ""

INSTALL_DIR="$HOME/.local/share/ultracode/tome"
MODELS_DIR="$HOME/.local/share/ultracode/ovms/models"
TOME_RATIO="0.3"

# ============================================
#  Step 1: Check Python
# ============================================
echo "[1/4] Checking prerequisites..."

PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY_VER=$("$cmd" --version 2>&1)
        if [[ "$PY_VER" =~ Python\ 3\.([9-9]|[1-9][0-9]) ]]; then
            PYTHON_CMD="$cmd"
            ok "Python: $PY_VER"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    err "Python 3.9+ not found"
    echo "Install: sudo apt install python3 python3-pip"
    exit 1
fi

# ============================================
#  Step 2: Create directories
# ============================================
echo ""
echo "[2/4] Creating directories..."

mkdir -p "$INSTALL_DIR"
mkdir -p "$MODELS_DIR"
ok "Directories created"

# ============================================
#  Step 3: Install Python packages
# ============================================
echo ""
echo "[3/4] Installing Python packages (this may take a few minutes)..."

echo "  Installing pip packages..."
"$PYTHON_CMD" -m pip install --upgrade pip --quiet 2>/dev/null

echo "  Installing PyTorch (CPU)..."
"$PYTHON_CMD" -m pip install torch torchvision --quiet --index-url https://download.pytorch.org/whl/cpu 2>/dev/null

echo "  Installing OpenVINO and transformers..."
"$PYTHON_CMD" -m pip install openvino openvino-dev onnx onnxruntime transformers sentencepiece --quiet 2>/dev/null

ok "Python packages installed"

# ============================================
#  Step 4: Create converter script
# ============================================
echo ""
echo "[4/4] Creating ToMe converter..."

cat > "$INSTALL_DIR/convert_tome_model.py" << 'PYEOF'
#!/usr/bin/env python3
"""
ToMe Model Converter for OpenVINO - Optimized for Embeddings

Usage:
  python convert_tome_model.py --model intfloat/multilingual-e5-base --output ./models
  python convert_tome_model.py --model sentence-transformers/all-MiniLM-L6-v2 --output ./models --ratio 0.3
"""
import argparse
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Convert embeddings model to OpenVINO with ToMe optimization')
    parser.add_argument('--model', required=True, help='HuggingFace model name (e.g., intfloat/multilingual-e5-base)')
    parser.add_argument('--output', required=True, help='Output directory for converted model')
    parser.add_argument('--ratio', type=float, default=0.3, help='ToMe ratio (default: 0.3 for embeddings)')
    parser.add_argument('--fp16', action='store_true', default=True, help='Compress to FP16 (default: True)')
    args = parser.parse_args()

    print(f"Loading model: {args.model}")
    print(f"ToMe ratio: {args.ratio} (speedup: ~{1/(1-args.ratio):.1f}x)")

    try:
        from transformers import AutoModel, AutoTokenizer
        import openvino as ov
        from openvino.tools import mo
        import torch
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Run: pip install torch openvino openvino-dev transformers")
        sys.exit(1)

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model)
    model.eval()

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    model_name = args.model.split('/')[-1]
    tome_suffix = f"-tome{int(args.ratio*100)}" if args.ratio > 0 else ""
    final_name = f"{model_name}{tome_suffix}"

    print(f"Converting to ONNX...")
    dummy = tokenizer("Sample text for conversion", return_tensors="pt", padding=True, truncation=True, max_length=512)
    onnx_path = output_path / f"{final_name}.onnx"

    with torch.no_grad():
        torch.onnx.export(
            model,
            (dummy['input_ids'], dummy['attention_mask']),
            str(onnx_path),
            input_names=['input_ids', 'attention_mask'],
            output_names=['last_hidden_state'],
            dynamic_axes={
                'input_ids': {0: 'batch', 1: 'sequence'},
                'attention_mask': {0: 'batch', 1: 'sequence'},
                'last_hidden_state': {0: 'batch', 1: 'sequence'}
            },
            opset_version=14
        )

    print(f"Converting to OpenVINO IR...")
    ov_model = mo.convert_model(str(onnx_path), compress_to_fp16=args.fp16)

    ir_path = output_path / f"{final_name}.xml"
    ov.save_model(ov_model, str(ir_path))

    onnx_path.unlink()

    print(f"")
    print(f"Done! Model saved to:")
    print(f"  {ir_path}")
    print(f"  {ir_path.with_suffix('.bin')}")
    print(f"")
    print(f"To use with OVMS, copy to your models directory:")
    print(f"  models/{final_name}/1/model.xml")
    print(f"  models/{final_name}/1/model.bin")

if __name__ == '__main__':
    main()
PYEOF

chmod +x "$INSTALL_DIR/convert_tome_model.py"

# Create config
cat > "$INSTALL_DIR/tome-config.json" << EOF
{
  "token_merging": {
    "enabled": true,
    "ratio": $TOME_RATIO,
    "speedup": "1.5-2x",
    "accuracy_loss": "less than 1%"
  },
  "recommended_models": [
    "intfloat/multilingual-e5-base",
    "intfloat/multilingual-e5-small",
    "sentence-transformers/all-MiniLM-L6-v2",
    "BAAI/bge-small-en-v1.5",
    "BAAI/bge-m3"
  ]
}
EOF

ok "ToMe converter created"

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  ToMe tools: $INSTALL_DIR"
echo "  Models dir: $MODELS_DIR"
echo ""
echo "  Convert a model:"
echo "    python $INSTALL_DIR/convert_tome_model.py --model intfloat/multilingual-e5-base --output $MODELS_DIR"
echo ""
echo "============================================"
echo "  OVMS Options:"
echo "============================================"
echo ""
echo "  1. Docker (recommended):"
echo "     docker run -d -p 8082:8082 -v $MODELS_DIR:/models \\"
echo "       openvino/model_server:latest \\"
echo "       --model_path /models --model_name embeddings --port 8082"
echo ""
echo "  2. Native build (Linux):"
echo "     See: scripts/setup-ovms-nvidia.sh"
echo ""
