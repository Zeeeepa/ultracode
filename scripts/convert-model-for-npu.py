#!/usr/bin/env python3
"""
Convert embedding model to OpenVINO IR format optimized for NPU.

Requirements:
  pip install optimum[openvino] transformers torch

Usage:
  python scripts/convert-model-for-npu.py
"""

import argparse
from pathlib import Path


def convert_model(model_id: str, output_dir: Path, int8: bool = True):
    """Convert HuggingFace model to OpenVINO IR format."""
    try:
        from optimum.intel import OVModelForFeatureExtraction
        from transformers import AutoTokenizer
    except ImportError:
        print("Installing required packages...")
        import subprocess
        subprocess.run(["pip", "install", "optimum[openvino]", "transformers", "torch"], check=True)
        from optimum.intel import OVModelForFeatureExtraction
        from transformers import AutoTokenizer

    print(f"Converting {model_id}...")
    print(f"Output: {output_dir}")

    # Load and export model
    model = OVModelForFeatureExtraction.from_pretrained(
        model_id,
        export=True,
        compile=False,
    )

    # Save model
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output_dir)

    # Save tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.save_pretrained(output_dir)

    print(f"✓ Model saved to {output_dir}")

    # List created files
    print("\nCreated files:")
    for f in sorted(output_dir.iterdir()):
        size = f.stat().st_size / 1024 / 1024
        print(f"  {f.name}: {size:.2f} MB")

    # Optional: INT8 quantization
    if int8:
        print("\nApplying INT8 quantization...")
        try:
            from optimum.intel import OVQuantizer
            import nncf

            int8_dir = output_dir.parent / f"{output_dir.name}-int8"
            int8_dir.mkdir(parents=True, exist_ok=True)

            quantizer = OVQuantizer.from_pretrained(model)
            quantizer.quantize(
                save_directory=int8_dir,
                weights_only=True,  # Weight-only quantization is safer
            )

            # Copy tokenizer to int8 dir
            tokenizer.save_pretrained(int8_dir)

            print(f"✓ INT8 model saved to {int8_dir}")

        except Exception as e:
            print(f"⚠ INT8 quantization failed: {e}")
            print("  You can still use the FP32 model")


def main():
    parser = argparse.ArgumentParser(description="Convert model for OpenVINO NPU")
    parser.add_argument(
        "--model",
        default="sentence-transformers/all-MiniLM-L6-v2",
        help="HuggingFace model ID",
    )
    parser.add_argument(
        "--output",
        default="models/all-MiniLM-L6-v2-openvino",
        help="Output directory",
    )
    parser.add_argument(
        "--no-int8",
        action="store_true",
        help="Skip INT8 quantization",
    )

    args = parser.parse_args()

    convert_model(
        model_id=args.model,
        output_dir=Path(args.output),
        int8=not args.no_int8,
    )


if __name__ == "__main__":
    main()
