#!/usr/bin/env python3
"""
Reshape OpenVINO model for NPU compatibility.

NPU requires fixed input shapes (no dynamic dimensions).
This script converts a model with dynamic shapes to fixed shapes.

Usage:
    python reshape-model-for-npu.py <model_dir> [--batch-size 1] [--max-seq-len 512]

Example:
    python reshape-model-for-npu.py %LOCALAPPDATA%/UltraScriptTools/models/embeddings --max-seq-len 512
"""

import argparse
import shutil
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Reshape OpenVINO model for NPU")
    parser.add_argument("model_dir", type=str, help="Path to model directory with openvino_model.xml")
    parser.add_argument("--batch-size", type=int, default=1, help="Fixed batch size (default: 1)")
    parser.add_argument("--max-seq-len", type=int, default=512, help="Max sequence length (default: 512)")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory (default: model_dir_npu)")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing output directory")
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    model_xml = model_dir / "openvino_model.xml"

    if not model_xml.exists():
        print(f"Error: {model_xml} not found")
        sys.exit(1)

    # Import OpenVINO
    try:
        import openvino as ov
    except ImportError:
        print("Error: OpenVINO not installed. Run: pip install openvino")
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else model_dir.parent / f"{model_dir.name}_npu"

    if output_dir.exists():
        if args.overwrite:
            shutil.rmtree(output_dir)
        else:
            print(f"Error: {output_dir} already exists. Use --overwrite to replace.")
            sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from: {model_xml}")
    core = ov.Core()
    model = core.read_model(str(model_xml))

    # Get original input shapes
    print("\nOriginal input shapes:")
    for inp in model.inputs:
        print(f"  {inp.any_name}: {inp.partial_shape}")

    # Build new shapes with fixed dimensions
    new_shapes = {}
    batch_size = args.batch_size
    max_seq_len = args.max_seq_len

    for inp in model.inputs:
        name = inp.any_name
        shape = inp.partial_shape

        # Common patterns for transformer models:
        # input_ids: [batch, seq_len]
        # attention_mask: [batch, seq_len]
        # token_type_ids: [batch, seq_len]
        if len(shape) == 2:
            new_shapes[name] = [batch_size, max_seq_len]
        elif len(shape) == 3:
            # Some models have 3D inputs
            new_shapes[name] = [batch_size, max_seq_len, shape[2].get_length() if shape[2].is_static else max_seq_len]
        else:
            print(f"  Warning: Keeping original shape for {name}: {shape}")
            continue

    print(f"\nReshaping to fixed dimensions (batch={batch_size}, seq_len={max_seq_len}):")
    for name, shape in new_shapes.items():
        print(f"  {name}: {shape}")

    # Reshape model
    try:
        model.reshape(new_shapes)
        print("\nModel reshaped successfully!")
    except Exception as e:
        print(f"\nError reshaping model: {e}")
        sys.exit(1)

    # Save reshaped model
    output_xml = output_dir / "openvino_model.xml"
    print(f"\nSaving reshaped model to: {output_xml}")
    ov.save_model(model, str(output_xml))

    # Copy tokenizer files
    for file in ["openvino_tokenizer.xml", "openvino_tokenizer.bin", "graph.pbtxt"]:
        src = model_dir / file
        if src.exists():
            dst = output_dir / file
            shutil.copy(src, dst)
            print(f"Copied: {file}")

    # Update graph.pbtxt for NPU
    graph_pbtxt = output_dir / "graph.pbtxt"
    if graph_pbtxt.exists():
        content = graph_pbtxt.read_text()
        content = content.replace('target_device: "CPU"', 'target_device: "NPU"')
        content = content.replace('target_device: "GPU"', 'target_device: "NPU"')
        graph_pbtxt.write_text(content)
        print("Updated graph.pbtxt with target_device: NPU")

    print(f"\nDone! NPU-compatible model saved to: {output_dir}")
    print("\nTo use this model:")
    print(f"1. Update config.json to point to {output_dir.name}")
    print("2. Or copy files to your embeddings directory")

if __name__ == "__main__":
    main()
