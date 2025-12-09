#!/usr/bin/env python3
"""
Test single OpenVINO model
Usage: python test-single-model.py <model_id> <device> [chunk_size]
"""

import time
import os
import sys
from pathlib import Path

def main():
    if len(sys.argv) < 3:
        print("Usage: python test-single-model.py <model_id> <device> [chunk_size]")
        print("Example: python test-single-model.py OpenVINO/Qwen3-4B-int4-ov NPU 256")
        sys.exit(1)

    model_id = sys.argv[1]
    device = sys.argv[2]
    chunk_size = int(sys.argv[3]) if len(sys.argv) > 3 else None

    # Short test prompt
    prompt = """Generate brief documentation for this TypeScript class:

class Logger {
  private level: string;
  constructor(level: string) { this.level = level; }
  log(msg: string) { console.log(`[${this.level}] ${msg}`); }
}

Include: purpose, constructor, methods."""

    print(f"Testing: {model_id} on {device}")
    if chunk_size:
        print(f"NPUW_LLM_PREFILL_CHUNK_SIZE={chunk_size}")
        os.environ["NPUW_LLM_PREFILL_CHUNK_SIZE"] = str(chunk_size)

    import openvino_genai as ov_genai

    # Handle local path or HuggingFace repo ID
    if Path(model_id).exists():
        model_dir = Path(model_id)
        print(f"Using local model: {model_dir}")
    else:
        from huggingface_hub import snapshot_download
        cache_dir = Path.home() / ".cache" / "openvino-models"
        model_dir = cache_dir / model_id.replace("/", "_")

        if not model_dir.exists():
            print(f"Downloading {model_id}...")
            snapshot_download(
                repo_id=model_id,
                local_dir=str(model_dir),
                local_dir_use_symlinks=False
            )

    # Load
    print(f"Loading on {device}...")
    load_start = time.time()
    pipe = ov_genai.LLMPipeline(str(model_dir), device)
    load_time = time.time() - load_start
    print(f"Loaded in {load_time:.1f}s")

    # Generate
    print("Generating...")
    gen_start = time.time()

    config = ov_genai.GenerationConfig()
    config.max_new_tokens = 100
    config.do_sample = False  # Greedy

    output = pipe.generate(prompt, config)
    gen_time = time.time() - gen_start
    tokens = len(output.split())

    print(f"\n✅ Success!")
    print(f"Load: {load_time:.1f}s")
    print(f"Tokens: {tokens}")
    print(f"Time: {gen_time:.2f}s")
    print(f"Speed: {tokens / gen_time:.1f} tok/s")
    print(f"\nOutput:\n{output[:400]}")

if __name__ == "__main__":
    main()
