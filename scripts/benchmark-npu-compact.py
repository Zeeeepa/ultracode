#!/usr/bin/env python3
"""
OpenVINO NPU Compact Models Benchmark
Tests new small models: Qwen3-1.7B, DeepSeek-R1-1.5B, Gemma-3-1B
With NPUW_LLM_PREFILL_CHUNK_SIZE optimization for short prompts
"""

import time
import os
import sys
from pathlib import Path

# Test prompt (short for PREFILL_CHUNK_SIZE=256 optimization)
TEST_CODE = """
class Logger {
  private level: string;
  constructor(level: string) { this.level = level; }
  log(msg: string) { console.log(`[${this.level}] ${msg}`); }
}
"""

PROMPT = f"""Generate brief documentation for this TypeScript class:

{TEST_CODE}

Include: purpose, constructor, methods."""


def benchmark_model(model_id: str, device: str, prefill_chunk: int = None) -> dict:
    """Benchmark a single model on specified device."""
    import openvino_genai as ov_genai
    from huggingface_hub import snapshot_download

    print(f"\n{'='*60}")
    print(f"Testing: {model_id} on {device}")
    if prefill_chunk:
        print(f"NPUW_LLM_PREFILL_CHUNK_SIZE={prefill_chunk}")
    print("="*60)

    result = {
        "model": model_id,
        "device": device,
        "prefill_chunk": prefill_chunk,
        "load_time": 0,
        "ttft": 0,
        "total_time": 0,
        "tokens": 0,
        "tokens_per_sec": 0,
        "output_preview": "",
        "error": None
    }

    try:
        # Download model if needed
        cache_dir = Path.home() / ".cache" / "openvino-models"
        model_dir = cache_dir / model_id.replace("/", "_")

        if not model_dir.exists():
            print(f"Downloading {model_id}...")
            start = time.time()
            snapshot_download(
                repo_id=model_id,
                local_dir=str(model_dir),
                local_dir_use_symlinks=False
            )
            print(f"Downloaded in {time.time() - start:.1f}s")

        # Load model with optional NPUW config
        print(f"Loading model on {device}...")
        load_start = time.time()

        if device == "NPU" and prefill_chunk:
            # Set environment variable for NPU prefill optimization
            os.environ["NPUW_LLM_PREFILL_CHUNK_SIZE"] = str(prefill_chunk)
            print(f"Set NPUW_LLM_PREFILL_CHUNK_SIZE={prefill_chunk}")

        try:
            pipe = ov_genai.LLMPipeline(str(model_dir), device)
        except Exception as e:
            result["error"] = f"Model load failed: {e}"
            print(f"❌ Model load failed: {e}")
            return result

        load_time = time.time() - load_start
        result["load_time"] = load_time
        print(f"Model loaded in {load_time:.2f}s")

        # Generate
        print("Generating...")
        gen_start = time.time()

        config = ov_genai.GenerationConfig()
        config.max_new_tokens = 150  # Short output for compact models
        config.temperature = 0.3
        config.do_sample = False  # Greedy for NPU compatibility

        # Measure TTFT
        first_token_time = None
        output_tokens = []

        def streamer(token):
            nonlocal first_token_time
            if first_token_time is None:
                first_token_time = time.time()
            output_tokens.append(token)
            return False  # Continue generation

        output = pipe.generate(PROMPT, config)
        gen_time = time.time() - gen_start

        # Calculate TTFT if streamer captured it
        if first_token_time:
            result["ttft"] = first_token_time - gen_start

        # Count tokens (approximate by words)
        tokens = len(output.split())

        result["total_time"] = gen_time
        result["tokens"] = tokens
        result["tokens_per_sec"] = tokens / gen_time if gen_time > 0 else 0
        result["output_preview"] = output[:300]

        print(f"\n✅ Success!")
        print(f"   Load time: {load_time:.2f}s")
        print(f"   Tokens: {tokens}")
        print(f"   Gen time: {gen_time:.2f}s")
        print(f"   Speed: {result['tokens_per_sec']:.1f} tok/s")
        print(f"\nOutput:\n{output[:400]}...")

    except Exception as e:
        result["error"] = str(e)
        print(f"\n❌ Error: {e}")

    return result


def convert_deepseek_nf4():
    """Convert DeepSeek R1 to NF4 format for 200 series CPU."""
    import subprocess
    import shutil

    output_dir = Path.home() / ".cache" / "openvino-models" / "deepseek-r1-1.5b-nf4-ov"

    if output_dir.exists():
        print(f"DeepSeek R1 NF4 already exists at {output_dir}")
        return str(output_dir)

    # Check if optimum-cli is available
    if not shutil.which("optimum-cli"):
        print("⚠️ optimum-cli not found. Install with: pip install optimum[openvino]")
        print("Skipping DeepSeek R1 NF4 conversion...")
        return None

    print("Converting DeepSeek R1 to NF4 format...")
    print("This may take 5-10 minutes...")

    cmd = [
        "optimum-cli", "export", "openvino",
        "--model", "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
        "--weight-format", "nf4",
        "--ratio", "1.0",
        str(output_dir)
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"Conversion failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"Conversion error: {e}")
        return None

    print(f"Converted to {output_dir}")
    return str(output_dir)


def main():
    print("="*60)
    print("OpenVINO NPU Compact Models Benchmark")
    print("="*60)

    # Check available devices
    from openvino import Core
    core = Core()
    devices = core.available_devices
    print(f"Available devices: {devices}")

    has_npu = "NPU" in devices

    results = []

    # Models to test
    models = [
        # Compact models for NPU
        ("OpenVINO/Qwen3-1.7B-int4-ov", "CPU", None),
        ("OpenVINO/gemma-3-1b-it-int4-ov", "CPU", None),
    ]

    if has_npu:
        # NPU tests with PREFILL_CHUNK_SIZE optimization
        models.extend([
            ("OpenVINO/Qwen3-1.7B-int4-ov", "NPU", 256),
            ("OpenVINO/gemma-3-1b-it-int4-ov", "NPU", 256),
            # Compare with default chunk size
            ("OpenVINO/Qwen3-4B-int4-ov", "NPU", 256),  # Reference
        ])

        # Try DeepSeek R1 NF4 on NPU
        deepseek_path = convert_deepseek_nf4()
        if deepseek_path:
            # For custom converted model, use path directly
            models.append((deepseek_path, "NPU", 256))
            models.append((deepseek_path, "CPU", None))

    for model_spec in models:
        if len(model_spec) == 3:
            model_id, device, chunk = model_spec
        else:
            model_id, device = model_spec
            chunk = None

        result = benchmark_model(model_id, device, chunk)
        results.append(result)

    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("\n| Model | Device | Chunk | Load | Tok/s | Status |")
    print("|-------|--------|-------|------|-------|--------|")

    for r in results:
        model_name = r['model'].split('/')[-1][:20]
        chunk = r.get('prefill_chunk') or '-'
        if r["error"]:
            print(f"| {model_name} | {r['device']} | {chunk} | - | - | ❌ |")
        else:
            print(f"| {model_name} | {r['device']} | {chunk} | {r['load_time']:.1f}s | {r['tokens_per_sec']:.1f} | ✅ |")

    # Save results
    results_file = Path(__file__).parent.parent / "benchmarks" / "results" / "npu-compact-results.json"
    results_file.parent.mkdir(parents=True, exist_ok=True)

    import json
    with open(results_file, "w") as f:
        json.dump({
            "date": time.strftime("%Y-%m-%d %H:%M"),
            "devices": devices,
            "results": results
        }, f, indent=2, default=str)

    print(f"\n✅ Results saved to {results_file}")
    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    main()
