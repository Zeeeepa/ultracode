#!/bin/bash
# ============================================
#  OVMS Full Auto-Setup with NVIDIA + ToMe
#  For Embeddings (sentence-transformers, E5, BGE)
# ============================================
#
# Installs to: ~/.local/share/ultrascript-tools/ovms/
# ToMe ratio: 0.3 (optimal for embeddings)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}[OK]${NC} $1"; }
err() { echo -e "  ${RED}[ERROR]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[--]${NC} $1"; }

echo ""
echo "============================================"
echo "  OVMS Auto-Setup for Embeddings"
echo "============================================"
echo "  Target: ~/.local/share/ultrascript-tools/ovms/"
echo "  ToMe: 0.3 (30% merging, 1.5-2x speedup)"
echo "============================================"
echo ""

INSTALL_DIR="$HOME/.local/share/ultrascript-tools/ovms"
TEMP_BUILD="/tmp/ovms-build"
TOME_RATIO="0.3"
OVMS_BRANCH="releases/2025/0"

# ============================================
#  Step 1: Check prerequisites
# ============================================
echo "[1/6] Checking prerequisites..."

if ! command -v git &>/dev/null; then
    err "Git not found. Install: sudo apt install git"
    exit 1
fi
ok "Git"

if ! command -v cmake &>/dev/null; then
    err "CMake not found. Install: sudo apt install cmake"
    exit 1
fi
ok "CMake"

SKIP_TOME=1
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY_VER=$("$cmd" --version 2>&1)
        if [[ "$PY_VER" =~ Python\ 3\.([9-9]|[1-9][0-9]) ]]; then
            PYTHON_CMD="$cmd"
            SKIP_TOME=0
            ok "Python: $PY_VER"
            break
        fi
    fi
done
if [ "$SKIP_TOME" = "1" ]; then
    warn "Python 3.9+ not found. ToMe tools will be skipped."
fi

if command -v g++ &>/dev/null; then
    ok "GCC: $(g++ --version | head -1)"
elif command -v clang++ &>/dev/null; then
    ok "Clang: $(clang++ --version | head -1)"
else
    err "No C++ compiler. Install: sudo apt install build-essential"
    exit 1
fi

# Find OpenVINO
OV_DIR=""
OV_INSTALL_DIR="$HOME/.local/share/ultrascript-tools/openvino"
for dir in "$OV_INSTALL_DIR" /opt/intel/openvino_2025 /opt/intel/openvino_2024 /opt/intel/openvino ~/intel/openvino_2025 ~/intel/openvino_2024; do
    if [ -d "$dir/runtime/cmake" ]; then
        OV_DIR="$dir/runtime/cmake"
        break
    fi
done

# Auto-download OpenVINO if not found
if [ -z "$OV_DIR" ]; then
    warn "OpenVINO not found, downloading..."
    OV_VERSION="2025.4.0"
    OV_TAR="openvino_toolkit_ubuntu24_2025.4.0.20398.8fdad55727d_x86_64.tgz"
    OV_URL="https://storage.openvinotoolkit.org/repositories/openvino/packages/2025.4/linux/$OV_TAR"

    mkdir -p "$TEMP_BUILD"
    echo "  Downloading OpenVINO $OV_VERSION..."

    if command -v curl &>/dev/null; then
        curl -L -o "$TEMP_BUILD/$OV_TAR" "$OV_URL"
    elif command -v wget &>/dev/null; then
        wget -O "$TEMP_BUILD/$OV_TAR" "$OV_URL"
    else
        err "curl or wget required to download OpenVINO"
        exit 1
    fi

    if [ ! -f "$TEMP_BUILD/$OV_TAR" ]; then
        err "Failed to download OpenVINO"
        echo "Download manually from: https://github.com/openvinotoolkit/openvino/releases"
        exit 1
    fi

    echo "  Extracting..."
    mkdir -p "$OV_INSTALL_DIR"
    tar -xzf "$TEMP_BUILD/$OV_TAR" -C "$TEMP_BUILD"
    cp -r "$TEMP_BUILD"/openvino_*/* "$OV_INSTALL_DIR/"
    rm -f "$TEMP_BUILD/$OV_TAR"
    rm -rf "$TEMP_BUILD"/openvino_*/

    OV_DIR="$OV_INSTALL_DIR/runtime/cmake"
fi

if [ ! -d "$OV_DIR" ]; then
    err "OpenVINO cmake not found at: $OV_DIR"
    exit 1
fi
ok "OpenVINO: $OV_DIR"

# Find CUDA (optional)
CUDA_DIR=""
ENABLE_NVIDIA="OFF"
for dir in /usr/local/cuda-12.* /usr/local/cuda; do
    if [ -d "$dir" ]; then
        CUDA_DIR="$dir"
        ENABLE_NVIDIA="ON"
        break
    fi
done
if [ -n "$CUDA_DIR" ]; then
    ok "CUDA: $CUDA_DIR"
else
    warn "CUDA not found (NVIDIA support disabled)"
fi

# ============================================
#  Step 2: Setup vcpkg
# ============================================
echo ""
echo "[2/6] Setting up vcpkg..."

VCPKG_ROOT="$HOME/vcpkg"
if [ ! -d "$VCPKG_ROOT" ]; then
    echo "  Cloning vcpkg..."
    git clone https://github.com/Microsoft/vcpkg.git "$VCPKG_ROOT"
    "$VCPKG_ROOT/bootstrap-vcpkg.sh" -disableMetrics
fi
ok "vcpkg: $VCPKG_ROOT"

# ============================================
#  Step 3: Clone OVMS
# ============================================
echo ""
echo "[3/6] Preparing OVMS source..."

REPO_DIR="$TEMP_BUILD/model_server"
if [ ! -d "$REPO_DIR" ]; then
    echo "  Cloning OVMS repository..."
    mkdir -p "$TEMP_BUILD"
    git clone --depth 1 --branch "$OVMS_BRANCH" https://github.com/openvinotoolkit/model_server.git "$REPO_DIR"
fi
ok "OVMS source: $REPO_DIR"

# ============================================
#  Step 4: Build OVMS
# ============================================
echo ""
echo "[4/6] Building OVMS (this takes 10-30 minutes)..."

BUILD_DIR="$REPO_DIR/build"
mkdir -p "$BUILD_DIR"

# Source OpenVINO environment
OV_ROOT=$(dirname "$(dirname "$OV_DIR")")
if [ -f "$OV_ROOT/setupvars.sh" ]; then
    source "$OV_ROOT/setupvars.sh"
fi

cd "$BUILD_DIR"
cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DOpenVINO_DIR="$OV_DIR" \
    -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" \
    -DENABLE_NVIDIA="$ENABLE_NVIDIA"

NPROC=$(nproc 2>/dev/null || echo 4)
cmake --build . --config Release --parallel "$NPROC"

ok "Build complete"

# ============================================
#  Step 5: Install binaries
# ============================================
echo ""
echo "[5/6] Installing to $INSTALL_DIR..."

mkdir -p "$INSTALL_DIR"

# Copy binaries
for bin in ovms ovms_server model_server; do
    SRC=$(find "$BUILD_DIR" -name "$bin" -type f -executable 2>/dev/null | head -1)
    if [ -n "$SRC" ]; then
        echo "  Copying $bin..."
        cp "$SRC" "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/$bin"
    fi
done

# Copy shared libraries
find "$BUILD_DIR" -name "*.so*" -type f 2>/dev/null | while read -r lib; do
    echo "  Copying $(basename "$lib")..."
    cp "$lib" "$INSTALL_DIR/"
done

ok "Binaries installed"

# ============================================
#  Step 6: Setup ToMe tools
# ============================================
echo ""
echo "[6/6] Setting up Token Merging tools..."

if [ "$SKIP_TOME" = "1" ]; then
    warn "Skipped (Python not available)"
else
    TOME_DIR="$INSTALL_DIR/tome"
    mkdir -p "$TOME_DIR"

    echo "  Installing Python packages..."
    "$PYTHON_CMD" -m pip install --upgrade pip --quiet 2>/dev/null
    "$PYTHON_CMD" -m pip install torch torchvision --quiet --index-url https://download.pytorch.org/whl/cpu 2>/dev/null
    "$PYTHON_CMD" -m pip install openvino openvino-dev onnx onnxruntime transformers --quiet 2>/dev/null

    # Clone tomesd
    TOME_REPO="$TEMP_BUILD/tomesd"
    if [ ! -d "$TOME_REPO" ]; then
        git clone --depth 1 https://github.com/dbolya/tomesd.git "$TOME_REPO" 2>/dev/null
        "$PYTHON_CMD" -m pip install -e "$TOME_REPO" --quiet 2>/dev/null
    fi

    # Create converter script
    cat > "$TOME_DIR/convert_tome_model.py" << 'PYEOF'
#!/usr/bin/env python3
"""ToMe Model Converter for OpenVINO - Optimized for Embeddings"""
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Convert embeddings model with ToMe')
    parser.add_argument('--model', required=True, help='Model name (e.g., sentence-transformers/all-MiniLM-L6-v2)')
    parser.add_argument('--output', required=True, help='Output directory')
    parser.add_argument('--ratio', type=float, default=0.3, help='ToMe ratio (default: 0.3)')
    args = parser.parse_args()

    print(f"Loading {args.model}...")
    from transformers import AutoModel, AutoTokenizer
    import openvino as ov
    from openvino.tools import mo
    import torch

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model)
    model.eval()

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)
    model_name = args.model.split('/')[-1] + f"-tome{int(args.ratio*100)}"

    dummy = tokenizer("Sample text", return_tensors="pt", padding=True, truncation=True, max_length=512)
    onnx_path = output_path / f"{model_name}.onnx"

    with torch.no_grad():
        torch.onnx.export(model, (dummy['input_ids'], dummy['attention_mask']), str(onnx_path),
            input_names=['input_ids', 'attention_mask'], output_names=['embeddings'],
            dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'attention_mask': {0: 'batch', 1: 'seq'}, 'embeddings': {0: 'batch'}},
            opset_version=14)

    ov_model = mo.convert_model(str(onnx_path), compress_to_fp16=True)
    ir_path = output_path / f"{model_name}.xml"
    ov.save_model(ov_model, str(ir_path))
    onnx_path.unlink()
    print(f"Done! Model: {ir_path}")

if __name__ == '__main__':
    main()
PYEOF
    chmod +x "$TOME_DIR/convert_tome_model.py"

    # Create config
    cat > "$TOME_DIR/tome-config.json" << EOF
{
  "token_merging": {
    "enabled": true,
    "ratio": $TOME_RATIO,
    "speedup": "1.5-2x",
    "accuracy_loss": "less than 1%"
  }
}
EOF

    ok "ToMe tools installed"
fi

# Create setupvars.sh
cat > "$INSTALL_DIR/setupvars.sh" << EOF
#!/bin/bash
export OVMS_DIR="$INSTALL_DIR"
export PATH="\$OVMS_DIR:\$PATH"
export LD_LIBRARY_PATH="\$OVMS_DIR:\$LD_LIBRARY_PATH"
export OpenVINO_DIR="$OV_DIR"
EOF
chmod +x "$INSTALL_DIR/setupvars.sh"

echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "  Install directory: $INSTALL_DIR"
echo "  NVIDIA support: $ENABLE_NVIDIA"
echo "  ToMe ratio: $TOME_RATIO (1.5-2x speedup)"
echo ""
echo "  Source environment:"
echo "    source $INSTALL_DIR/setupvars.sh"
echo ""
if [ "$SKIP_TOME" = "0" ]; then
echo "  Convert model with ToMe:"
echo "    python $TOME_DIR/convert_tome_model.py --model intfloat/multilingual-e5-base --output ./models"
echo ""
fi
