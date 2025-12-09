#!/usr/bin/env python3
"""
Test FluidInference/qwen3-1.7b-int4-ov-npu on NPU with NPUW config.
This model is specifically optimized for Intel NPU.
"""

import time
import os
import sys
from pathlib import Path

def main():
    # Short test prompt
    prompt = """Generate brief documentation for this TypeScript class:

class Logger {
  private level: string;
  constructor(level: string) { this.level = level; }
  log(msg: string) { console.log(`[${this.level}] ${msg}`); }
}

Include: purpose, constructor, methods."""

    model_id = "FluidInference/qwen3-1.7b-int4-ov-npu"
    device = "NPU"

    print(f"Testing: {model_id} on {device}")
    print("=" * 60)

    import openvino_genai as ov_genai
    from huggingface_hub import snapshot_download

    # Download model if needed
    cache_dir = Path.home() / ".cache" / "openvino-models"
    model_dir = cache_dir / model_id.replace("/", "_")

    if not model_dir.exists():
        print(f"Downloading {model_id}...")
        snapshot_download(
            repo_id=model_id,
            local_dir=str(model_dir),
            local_dir_use_symlinks=False
        )
        print("Downloaded!")

    # NPUW config for NPU
    npuw_config = {
        'NPU_USE_NPUW': 'YES',
        'NPUW_DEVICES': 'NPU',
        'NPUW_ONLINE_PIPELINE': 'NONE'
    }

    print(f"Loading with NPUW config: {npuw_config}")
    load_start = time.time()

    try:
        pipe = ov_genai.LLMPipeline(str(model_dir), device, **npuw_config)
        load_time = time.time() - load_start
        print(f"Loaded in {load_time:.1f}s")
    except Exception as e:
        print(f"Load failed: {e}")
        return

    # Test generation with short output
    print("Generating (max 50 tokens)...")
    gen_start = time.time()

    config = ov_genai.GenerationConfig()
    config.max_new_tokens = 50  # Very short to avoid NPU hang
    config.do_sample = False  # Greedy

    try:
        output = pipe.generate(prompt, config)
        gen_time = time.time() - gen_start
        tokens = len(output.split())

        print(f"\n{'=' * 60}")
        print(f"SUCCESS!")
        print(f"Load: {load_time:.1f}s")
        print(f"Tokens: {tokens}")
        print(f"Time: {gen_time:.2f}s")
        print(f"Speed: {tokens / gen_time:.1f} tok/s")
        print(f"\nOutput:\n{output[:400]}")
        print(f"{'=' * 60}")

    except Exception as e:
        print(f"Generation failed: {e}")


if __name__ == "__main__":
    main()
