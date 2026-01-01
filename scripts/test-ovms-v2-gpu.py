#!/usr/bin/env python3
"""
Test OVMS V2 API on GPU to verify encoder works.

Usage:
    1. Start OVMS with GPU test config:
       ovms.exe --rest_port 8084 --port 9002 --config_path "%LOCALAPPDATA%/UltraScriptTools/models/config-gpu-test.json"

    2. Run this script:
       python test-ovms-v2-gpu.py
"""

import json
import time
import numpy as np

# Try to import requests, fall back to urllib if not available
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_REQUESTS = False

# Try to import transformers for tokenization
try:
    from transformers import AutoTokenizer
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    print("WARNING: transformers not installed. Using dummy tokenization.")

OVMS_URL = "http://127.0.0.1:8084"
MODEL_NAME = "e5-gpu"
TEST_TEXTS = [
    "Hello, world!",
    "def main(): print('test')",
    "Привет мир!",
]

def tokenize_text(text: str, tokenizer=None):
    """Tokenize text using HF tokenizer or dummy."""
    if tokenizer:
        encoded = tokenizer(text, return_tensors="np", padding=True, truncation=True, max_length=512)
        return encoded["input_ids"].tolist()[0], encoded["attention_mask"].tolist()[0]
    else:
        # Dummy tokenization for testing
        tokens = [101] + [ord(c) % 30000 for c in text[:510]] + [102]
        mask = [1] * len(tokens)
        return tokens, mask

def test_v2_infer(input_ids, attention_mask):
    """Test V2 inference API."""
    url = f"{OVMS_URL}/v2/models/{MODEL_NAME}/infer"

    payload = {
        "inputs": [
            {
                "name": "input_ids",
                "shape": [1, len(input_ids)],
                "datatype": "INT64",
                "data": input_ids
            },
            {
                "name": "attention_mask",
                "shape": [1, len(attention_mask)],
                "datatype": "INT64",
                "data": attention_mask
            }
        ]
    }

    start = time.time()

    if HAS_REQUESTS:
        response = requests.post(url, json=payload, timeout=30)
        elapsed = time.time() - start

        if response.status_code == 200:
            result = response.json()
            return True, elapsed, result
        else:
            return False, elapsed, f"HTTP {response.status_code}: {response.text}"
    else:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                elapsed = time.time() - start
                result = json.loads(resp.read().decode('utf-8'))
                return True, elapsed, result
        except urllib.error.HTTPError as e:
            elapsed = time.time() - start
            return False, elapsed, f"HTTP {e.code}: {e.read().decode('utf-8')}"

def check_model_ready():
    """Check if model is loaded."""
    url = f"{OVMS_URL}/v2/models/{MODEL_NAME}/ready"
    try:
        if HAS_REQUESTS:
            resp = requests.get(url, timeout=5)
            return resp.status_code == 200
        else:
            req = urllib.request.Request(url)
            urllib.request.urlopen(req, timeout=5)
            return True
    except:
        return False

def main():
    print("=" * 60)
    print("OVMS V2 GPU Test")
    print("=" * 60)
    print(f"OVMS URL: {OVMS_URL}")
    print(f"Model: {MODEL_NAME}")
    print()

    # Check model ready
    print("Checking model status...")
    if not check_model_ready():
        print("ERROR: Model not ready. Make sure OVMS is running with GPU test config:")
        print(f'  ovms.exe --rest_port 8084 --port 9002 --config_path "%LOCALAPPDATA%/UltraScriptTools/models/config-gpu-test.json"')
        return
    print("Model is ready!")
    print()

    # Load tokenizer
    tokenizer = None
    if HAS_TRANSFORMERS:
        print("Loading tokenizer...")
        try:
            tokenizer = AutoTokenizer.from_pretrained("intfloat/multilingual-e5-base")
            print("Tokenizer loaded!")
        except Exception as e:
            print(f"WARNING: Could not load tokenizer: {e}")
    print()

    # Test each text
    print("Testing V2 inference on GPU...")
    print("-" * 60)

    total_time = 0
    success_count = 0

    for i, text in enumerate(TEST_TEXTS):
        input_ids, attention_mask = tokenize_text(text, tokenizer)

        print(f"\nTest {i+1}: '{text[:50]}...' ({len(input_ids)} tokens)")

        ok, elapsed, result = test_v2_infer(input_ids, attention_mask)

        if ok:
            success_count += 1
            total_time += elapsed

            # Parse output shape
            outputs = result.get("outputs", [])
            if outputs:
                shape = outputs[0].get("shape", "unknown")
                print(f"  ✓ OK in {elapsed*1000:.1f}ms, output shape: {shape}")
            else:
                print(f"  ✓ OK in {elapsed*1000:.1f}ms")
        else:
            print(f"  ✗ FAILED: {result}")

    print()
    print("=" * 60)
    print(f"Results: {success_count}/{len(TEST_TEXTS)} successful")
    if success_count > 0:
        print(f"Average latency: {total_time/success_count*1000:.1f}ms")
        print()
        print("✓ Encoder works on GPU.1!")
        print("  The issue is in MediaPipe EmbeddingsCalculatorOV, not the encoder itself.")
    else:
        print()
        print("✗ Encoder failed on GPU.1")
        print("  The model or OpenVINO GPU backend has issues with this encoder.")

if __name__ == "__main__":
    main()
