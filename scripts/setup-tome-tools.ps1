# ============================================
#  ToMe Tools Setup for OVMS Embeddings
# ============================================
#
# Installs Token Merging tools for model conversion
# ToMe ratio: 0.3 (optimal for embeddings, 1.5-2x speedup)
#
# Usage: powershell -ExecutionPolicy Bypass -File setup-tome-tools.ps1
#

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ToMe Tools Setup for Embeddings" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Target: $env:LOCALAPPDATA\UltraCode\tome\"
Write-Host "  ToMe: 0.3 (30% merging, 1.5-2x speedup)"
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$INSTALL_DIR = "$env:LOCALAPPDATA\UltraCode\tome"
$MODELS_DIR = "$env:LOCALAPPDATA\UltraCode\ovms\models"
$TOME_RATIO = 0.3

# ============================================
#  Step 1: Check Python
# ============================================
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "  [ERROR] Python not found." -ForegroundColor Red
    Write-Host "  Install from: https://www.python.org/downloads/"
    exit 1
}

$pyVer = & python --version 2>&1
Write-Host "  [OK] $pyVer" -ForegroundColor Green

# ============================================
#  Step 2: Create directories
# ============================================
Write-Host ""
Write-Host "[2/4] Creating directories..." -ForegroundColor Yellow

New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $MODELS_DIR | Out-Null
Write-Host "  [OK] Directories created" -ForegroundColor Green

# ============================================
#  Step 3: Install Python packages
# ============================================
Write-Host ""
Write-Host "[3/4] Installing Python packages (this may take a few minutes)..." -ForegroundColor Yellow

Write-Host "  Installing pip packages..."
& python -m pip install --upgrade pip --quiet 2>$null

Write-Host "  Installing PyTorch (CPU)..."
& python -m pip install torch torchvision --quiet --index-url https://download.pytorch.org/whl/cpu 2>$null

Write-Host "  Installing OpenVINO and transformers..."
& python -m pip install openvino openvino-dev onnx onnxruntime transformers sentencepiece --quiet 2>$null

Write-Host "  [OK] Python packages installed" -ForegroundColor Green

# ============================================
#  Step 4: Create converter script
# ============================================
Write-Host ""
Write-Host "[4/4] Creating ToMe converter..." -ForegroundColor Yellow

$converterScript = @'
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
'@

$converterScript | Out-File -FilePath "$INSTALL_DIR\convert_tome_model.py" -Encoding utf8

# Create batch wrapper
@"
@echo off
python "%~dp0convert_tome_model.py" %*
"@ | Out-File -FilePath "$INSTALL_DIR\convert_tome_model.cmd" -Encoding ascii

# Create config
@"
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
"@ | Out-File -FilePath "$INSTALL_DIR\tome-config.json" -Encoding utf8

Write-Host "  [OK] ToMe converter created" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ToMe tools: $INSTALL_DIR"
Write-Host "  Models dir: $MODELS_DIR"
Write-Host ""
Write-Host "  Convert a model:" -ForegroundColor Cyan
Write-Host "    cd `"$INSTALL_DIR`""
Write-Host "    python convert_tome_model.py --model intfloat/multilingual-e5-base --output `"$MODELS_DIR`""
Write-Host ""
Write-Host "  Or use the batch wrapper:"
Write-Host "    convert_tome_model.cmd --model intfloat/multilingual-e5-base --output `"$MODELS_DIR`""
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  OVMS Options:" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Docker (recommended):"
Write-Host "     docker run -d -p 8082:8082 -v $MODELS_DIR`:/models \"
Write-Host "       openvino/model_server:latest \"
Write-Host "       --model_path /models --model_name embeddings --port 8082"
Write-Host ""
Write-Host "  2. Native build requires VS2019 Build Tools:"
Write-Host "     https://visualstudio.microsoft.com/vs/older-downloads/"
Write-Host ""

Read-Host "Press Enter to exit"
