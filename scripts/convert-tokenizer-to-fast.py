#!/usr/bin/env python3
"""
Convert Slow Tokenizer to Fast Tokenizer for TEI

This script converts a HuggingFace model with slow tokenizer to fast tokenizer,
making it compatible with Text Embeddings Inference (TEI).

Usage:
    python convert-tokenizer-to-fast.py <model-id> [output-dir]

Example:
    python convert-tokenizer-to-fast.py ibm-granite/granite-embedding-30m-english ./converted-model
"""

import sys
import os
from pathlib import Path

try:
    from transformers import AutoTokenizer, AutoModel
    from tokenizers import Tokenizer
except ImportError:
    print("❌ Missing dependencies!")
    print("Install with: pip install transformers tokenizers torch")
    sys.exit(1)


def convert_to_fast_tokenizer(model_id: str, output_dir: str = "./converted-model"):
    """
    Convert slow tokenizer to fast tokenizer

    Args:
        model_id: HuggingFace model ID (e.g., 'ibm-granite/granite-embedding-30m-english')
        output_dir: Output directory for converted model
    """
    print(f"🔄 Converting tokenizer for model: {model_id}")
    print(f"📂 Output directory: {output_dir}")
    print()

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Step 1: Load the original tokenizer
        print("[1/5] Loading original tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=False)
        print(f"   ✅ Loaded: {type(tokenizer).__name__}")

        # Step 2: Convert to fast tokenizer
        print("[2/5] Converting to fast tokenizer...")

        # Try to get fast tokenizer directly
        try:
            fast_tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True)
            print(f"   ✅ Fast tokenizer available: {type(fast_tokenizer).__name__}")

        except Exception as e:
            print(f"   ⚠️  Direct fast tokenizer not available: {e}")
            print("   ℹ️  Attempting manual conversion...")

            # Manual conversion: train fast tokenizer from slow tokenizer
            from tokenizers import Tokenizer as FastTokenizer
            from tokenizers.models import WordPiece, BPE
            from tokenizers.trainers import WordPieceTrainer, BpeTrainer
            from tokenizers.pre_tokenizers import Whitespace

            # Get vocab from slow tokenizer
            vocab = tokenizer.get_vocab()

            # Create fast tokenizer with same vocab
            if hasattr(tokenizer, 'vocab_file'):
                # WordPiece-based (BERT-like)
                print("   ℹ️  Detected WordPiece tokenizer")
                fast_tokenizer_backend = FastTokenizer(WordPiece(vocab=vocab, unk_token=tokenizer.unk_token))
            else:
                # BPE-based (GPT-like)
                print("   ℹ️  Detected BPE tokenizer")
                fast_tokenizer_backend = FastTokenizer(BPE(vocab=vocab, merges=[]))

            fast_tokenizer_backend.pre_tokenizer = Whitespace()

            # Wrap in AutoTokenizer
            fast_tokenizer = AutoTokenizer.from_pretrained(
                model_id,
                tokenizer_object=fast_tokenizer_backend,
                use_fast=True
            )

            print(f"   ✅ Converted to: {type(fast_tokenizer).__name__}")

        # Step 3: Load model
        print("[3/5] Loading model weights...")
        model = AutoModel.from_pretrained(model_id, trust_remote_code=True)
        print(f"   ✅ Loaded: {type(model).__name__}")

        # Step 4: Save converted model + fast tokenizer
        print("[4/5] Saving converted model...")
        fast_tokenizer.save_pretrained(output_dir)
        model.save_pretrained(output_dir)
        print(f"   ✅ Saved to: {output_dir}")

        # Step 5: Verify tokenizer.json exists
        print("[5/5] Verifying fast tokenizer...")
        tokenizer_json_path = Path(output_dir) / "tokenizer.json"

        if tokenizer_json_path.exists():
            print(f"   ✅ tokenizer.json found: {tokenizer_json_path}")
        else:
            print(f"   ❌ tokenizer.json NOT found!")
            print(f"   ℹ️  This model may not support fast tokenizers")
            return False

        # Test loading
        test_tokenizer = AutoTokenizer.from_pretrained(output_dir, use_fast=True)
        test_encoded = test_tokenizer("Hello world, this is a test.")

        print()
        print("✅ Conversion successful!")
        print()
        print("📋 Summary:")
        print(f"   Model ID: {model_id}")
        print(f"   Output: {output_dir}")
        print(f"   Tokenizer type: {type(test_tokenizer).__name__}")
        print(f"   Test encoding: {test_encoded}")
        print()
        print("🚀 Usage with TEI:")
        print(f"   docker run -d -p 8080:80 -v $(pwd)/{output_dir}:/model \\")
        print(f"     ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \\")
        print(f"     --model-id /model")
        print()

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert-tokenizer-to-fast.py <model-id> [output-dir]")
        print()
        print("Examples:")
        print("  python convert-tokenizer-to-fast.py ibm-granite/granite-embedding-30m-english")
        print("  python convert-tokenizer-to-fast.py sentence-transformers/all-MiniLM-L6-v2 ./my-model")
        sys.exit(1)

    model_id = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "./converted-model"

    success = convert_to_fast_tokenizer(model_id, output_dir)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
