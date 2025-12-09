#!/usr/bin/env python3
"""
OpenVINO LLM Benchmark Script
Tests CPU and NPU performance on code documentation
"""

import time
import os
import sys
from pathlib import Path

# Test prompt
TEST_CODE = """
class SemanticAgent {
  private embeddingGenerator: EmbeddingGenerator;
  private searchEngine: HybridSearchEngine;
  private cache: SemanticCache;

  constructor(config: SemanticConfig) {
    this.embeddingGenerator = new EmbeddingGenerator(config);
    this.searchEngine = new HybridSearchEngine(config);
    this.cache = new SemanticCache(config.cacheSize);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const cached = await this.cache.getMany(texts);
    const missing = texts.filter((_, i) => !cached[i]);
    if (missing.length > 0) {
      const generated = await this.embeddingGenerator.batchGenerate(missing);
      await this.cache.setMany(missing, generated);
    }
    return texts.map((t, i) => cached[i] || this.cache.get(t));
  }
}
"""

PROMPT = f"""Generate documentation for the following TypeScript class:

{TEST_CODE}

Include: overview, key methods, design patterns."""


def benchmark_model(model_id: str, device: str) -> dict:
    """Benchmark a single model on specified device."""
    import openvino_genai as ov_genai
    from huggingface_hub import snapshot_download

    print(f"\n{'='*60}")
    print(f"Testing: {model_id} on {device}")
    print("="*60)

    result = {
        "model": model_id,
        "device": device,
        "ttft": 0,
        "total_time": 0,
        "tokens": 0,
        "tokens_per_sec": 0,
        "output_chars": 0,
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

        # Load model
        print(f"Loading model on {device}...")
        load_start = time.time()
        pipe = ov_genai.LLMPipeline(str(model_dir), device)
        load_time = time.time() - load_start
        print(f"Model loaded in {load_time:.2f}s")

        # Generate
        print("Generating...")
        gen_start = time.time()

        config = ov_genai.GenerationConfig()
        config.max_new_tokens = 256
        config.temperature = 0.3
        config.do_sample = False  # Greedy for NPU compatibility

        output = pipe.generate(PROMPT, config)

        gen_time = time.time() - gen_start

        # Count tokens (approximate)
        tokens = len(output.split())

        result["ttft"] = load_time
        result["total_time"] = gen_time
        result["tokens"] = tokens
        result["tokens_per_sec"] = tokens / gen_time if gen_time > 0 else 0
        result["output_chars"] = len(output)

        print(f"\n✅ Success!")
        print(f"   Tokens: {tokens}")
        print(f"   Time: {gen_time:.2f}s")
        print(f"   Speed: {result['tokens_per_sec']:.1f} tok/s")
        print(f"\nOutput preview:\n{output[:500]}...")

    except Exception as e:
        result["error"] = str(e)
        print(f"\n❌ Error: {e}")

    return result


def main():
    print("="*60)
    print("OpenVINO LLM Benchmark")
    print("="*60)

    # Check available devices
    from openvino import Core
    core = Core()
    devices = core.available_devices
    print(f"Available devices: {devices}")

    results = []

    # Models to test
    models = [
        # CPU models
        ("OpenVINO/Phi-4-mini-instruct-int4-ov", "CPU"),
        # NPU model (if available)
    ]

    if "NPU" in devices:
        models.append(("OpenVINO/Qwen3-4B-int4-ov", "NPU"))
        models.append(("OpenVINO/Phi-4-mini-instruct-int4-ov", "NPU"))

    for model_id, device in models:
        result = benchmark_model(model_id, device)
        results.append(result)

    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print("\n| Model | Device | Tok/s | Load Time | Gen Time | Status |")
    print("|-------|--------|-------|-----------|----------|--------|")

    for r in results:
        if r["error"]:
            print(f"| {r['model'].split('/')[-1][:25]} | {r['device']} | - | - | - | ❌ |")
        else:
            print(f"| {r['model'].split('/')[-1][:25]} | {r['device']} | {r['tokens_per_sec']:.1f} | {r['ttft']:.1f}s | {r['total_time']:.1f}s | ✅ |")

    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    main()
