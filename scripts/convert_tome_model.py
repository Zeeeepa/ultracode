#!/usr/bin/env python3
"""
ToMe Model Converter for OpenVINO - Optimized for Embeddings

Applies Token Merging (ToMe) to BERT-like models before OpenVINO conversion.
ToMe reduces sequence length by merging similar tokens, providing 1.5-2x speedup.

Usage:
  python convert_tome_model.py --model intfloat/multilingual-e5-base --output ./models
  python convert_tome_model.py --model sentence-transformers/all-MiniLM-L6-v2 --output ./models --ratio 0.3
"""
import argparse
import sys
from pathlib import Path
from typing import Optional, Tuple
import math

def bipartite_soft_matching(
    metric: "torch.Tensor",
    r: int,
    class_token: bool = False,
    distill_token: bool = False,
) -> Tuple["torch.Tensor", "torch.Tensor"]:
    """
    Applies ToMe bipartite soft matching for token merging.

    Args:
        metric: Token features [B, N, C]
        r: Number of tokens to remove per step
        class_token: Whether first token is [CLS]
        distill_token: Whether second token is distillation

    Returns:
        merge: Indices for merging tokens
        unmerge: Indices for unmerging (restoration)
    """
    import torch

    protected = 0
    if class_token:
        protected += 1
    if distill_token:
        protected += 1

    # We can only reduce by a maximum of 50% of tokens
    t = metric.shape[1]
    r = min(r, (t - protected) // 2)

    if r <= 0:
        return torch.arange(t).unsqueeze(0), torch.arange(t).unsqueeze(0)

    with torch.no_grad():
        metric = metric / metric.norm(dim=-1, keepdim=True)
        a, b = metric[..., ::2, :], metric[..., 1::2, :]
        scores = a @ b.transpose(-1, -2)

        if protected:
            # Don't merge protected tokens
            scores[..., :protected, :] = -math.inf

        node_max, node_idx = scores.max(dim=-1)
        edge_idx = node_max.argsort(dim=-1, descending=True)[..., None]

        unm_idx = edge_idx[..., r:, :]  # Unmerged tokens
        src_idx = edge_idx[..., :r, :]  # Source (merged) tokens
        dst_idx = node_idx[..., None].gather(dim=-2, index=src_idx)

    def merge(x: torch.Tensor, mode="mean") -> torch.Tensor:
        src, dst = x[..., ::2, :], x[..., 1::2, :]
        n, t1, c = src.shape
        unm = src.gather(dim=-2, index=unm_idx.expand(n, t1 - r, c))
        src = src.gather(dim=-2, index=src_idx.expand(n, r, c))
        dst = dst.scatter_reduce(-2, dst_idx.expand(n, r, c), src, reduce=mode)
        return torch.cat([unm, dst], dim=1)

    def unmerge(x: torch.Tensor) -> torch.Tensor:
        unm_len = unm_idx.shape[1]
        unm, dst = x[..., :unm_len, :], x[..., unm_len:, :]
        n, _, c = unm.shape

        src = dst.gather(dim=-2, index=dst_idx.expand(n, r, c))

        out = torch.zeros(n, metric.shape[1], c, device=x.device, dtype=x.dtype)
        out[..., 1::2, :] = dst
        out.scatter_(dim=-2, index=(2 * unm_idx).expand(n, unm_len, c), src=unm)
        out.scatter_(dim=-2, index=(2 * src_idx).expand(n, r, c), src=src)

        return out

    return merge, unmerge


class ToMeBertEncoder:
    """
    Wrapper that applies ToMe to BERT encoder layers.
    """
    def __init__(self, encoder, ratio: float = 0.3, class_token: bool = True):
        self.encoder = encoder
        self.ratio = ratio
        self.class_token = class_token
        self._original_forward = encoder.forward

    def patched_forward(self, hidden_states, attention_mask=None, **kwargs):
        import torch

        # Calculate tokens to merge per layer
        num_layers = len(self.encoder.layer)
        seq_len = hidden_states.shape[1]
        total_reduce = int(seq_len * self.ratio)
        r_per_layer = max(1, total_reduce // num_layers)

        for i, layer_module in enumerate(self.encoder.layer):
            # Apply layer
            layer_outputs = layer_module(hidden_states, attention_mask, **kwargs)
            hidden_states = layer_outputs[0]

            # Apply ToMe after each layer (except last)
            if i < num_layers - 1 and r_per_layer > 0:
                merge_fn, _ = bipartite_soft_matching(
                    hidden_states,
                    r=r_per_layer,
                    class_token=self.class_token
                )
                if callable(merge_fn):
                    hidden_states = merge_fn(hidden_states)
                    # Update attention mask
                    if attention_mask is not None:
                        new_len = hidden_states.shape[1]
                        attention_mask = attention_mask[..., :new_len]

        return (hidden_states,)

    def patch(self):
        self.encoder.forward = self.patched_forward

    def unpatch(self):
        self.encoder.forward = self._original_forward


def patch_bert_model(model, ratio: float = 0.3):
    """
    Apply ToMe patch to a BERT-like model.

    Args:
        model: Transformers model (BERT, RoBERTa, XLM-RoBERTa, etc.)
        ratio: Fraction of tokens to merge (0.0-0.5)

    Returns:
        ToMeBertEncoder wrapper
    """
    # Find encoder in model
    encoder = None
    if hasattr(model, 'encoder'):
        encoder = model.encoder
    elif hasattr(model, 'bert') and hasattr(model.bert, 'encoder'):
        encoder = model.bert.encoder
    elif hasattr(model, 'roberta') and hasattr(model.roberta, 'encoder'):
        encoder = model.roberta.encoder
    elif hasattr(model, 'xlm_roberta') and hasattr(model.xlm_roberta, 'encoder'):
        encoder = model.xlm_roberta.encoder

    if encoder is None:
        print(f"Warning: Could not find encoder in model, ToMe not applied")
        return None

    tome_wrapper = ToMeBertEncoder(encoder, ratio=ratio, class_token=True)
    tome_wrapper.patch()
    return tome_wrapper


class ToMeModelWrapper:
    """
    Wrapper for ONNX export that applies ToMe during forward pass.
    """
    def __init__(self, model, tokenizer, ratio: float = 0.3):
        import torch
        import torch.nn as nn

        self.model = model
        self.tokenizer = tokenizer
        self.ratio = ratio
        self.device = next(model.parameters()).device

    def forward(self, input_ids, attention_mask):
        import torch

        # Get embeddings
        if hasattr(self.model, 'embeddings'):
            embeddings = self.model.embeddings(input_ids)
        elif hasattr(self.model, 'bert'):
            embeddings = self.model.bert.embeddings(input_ids)
        elif hasattr(self.model, 'roberta'):
            embeddings = self.model.roberta.embeddings(input_ids)
        else:
            # Fallback: just run the model
            outputs = self.model(input_ids, attention_mask=attention_mask)
            return outputs.last_hidden_state

        hidden_states = embeddings

        # Find encoder
        encoder = None
        if hasattr(self.model, 'encoder'):
            encoder = self.model.encoder
        elif hasattr(self.model, 'bert') and hasattr(self.model.bert, 'encoder'):
            encoder = self.model.bert.encoder
        elif hasattr(self.model, 'roberta') and hasattr(self.model.roberta, 'encoder'):
            encoder = self.model.roberta.encoder

        if encoder is None:
            outputs = self.model(input_ids, attention_mask=attention_mask)
            return outputs.last_hidden_state

        # Apply ToMe-enhanced forward
        num_layers = len(encoder.layer)
        seq_len = hidden_states.shape[1]
        total_reduce = int(seq_len * self.ratio)
        r_per_layer = max(1, total_reduce // num_layers)

        extended_attention_mask = attention_mask[:, None, None, :].float()
        extended_attention_mask = (1.0 - extended_attention_mask) * -10000.0

        for i, layer_module in enumerate(encoder.layer):
            layer_outputs = layer_module(hidden_states, extended_attention_mask)
            hidden_states = layer_outputs[0]

            # Apply ToMe after each layer (except last few)
            if i < num_layers - 2 and r_per_layer > 0 and hidden_states.shape[1] > 16:
                merge_fn, _ = bipartite_soft_matching(
                    hidden_states,
                    r=r_per_layer,
                    class_token=True
                )
                if callable(merge_fn):
                    hidden_states = merge_fn(hidden_states)
                    # Update attention mask
                    new_len = hidden_states.shape[1]
                    extended_attention_mask = extended_attention_mask[..., :new_len]

        return hidden_states


def main():
    parser = argparse.ArgumentParser(description='Convert embeddings model to OpenVINO with ToMe optimization')
    parser.add_argument('--model', required=True, help='HuggingFace model name (e.g., intfloat/multilingual-e5-base)')
    parser.add_argument('--output', required=True, help='Output directory for converted model')
    parser.add_argument('--ratio', type=float, default=0.3, help='ToMe ratio (default: 0.3 for embeddings)')
    parser.add_argument('--fp16', action='store_true', default=True, help='Compress to FP16 (default: True)')
    parser.add_argument('--no-tome', action='store_true', help='Disable ToMe (convert without optimization)')
    args = parser.parse_args()

    print(f"="*60)
    print(f"ToMe Model Converter for OpenVINO")
    print(f"="*60)
    print(f"Model: {args.model}")
    if not args.no_tome:
        print(f"ToMe ratio: {args.ratio} (speedup: ~{1/(1-args.ratio):.1f}x)")
    else:
        print(f"ToMe: DISABLED")
    print(f"Output: {args.output}")
    print(f"="*60)
    print()

    try:
        from transformers import AutoModel, AutoTokenizer
        import openvino as ov
        from openvino.tools import mo
        import torch
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}")
        print("Install: pip install torch openvino openvino-dev transformers")
        sys.exit(1)

    print(f"[1/4] Loading model from HuggingFace...")
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model)
    model.eval()
    print(f"      Model loaded: {model.config.model_type}")

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    model_name = args.model.split('/')[-1]
    tome_suffix = f"-tome{int(args.ratio*100)}" if args.ratio > 0 and not args.no_tome else ""
    final_name = f"{model_name}{tome_suffix}"

    print(f"[2/4] Applying ToMe patch...")
    if not args.no_tome and args.ratio > 0:
        tome_wrapper = patch_bert_model(model, ratio=args.ratio)
        if tome_wrapper:
            print(f"      ToMe applied: ratio={args.ratio}")
        else:
            print(f"      ToMe not applicable to this model type")
    else:
        print(f"      ToMe skipped")

    print(f"[3/4] Converting to ONNX...")
    dummy = tokenizer("Sample text for model conversion and optimization", return_tensors="pt", padding=True, truncation=True, max_length=512)
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
    print(f"      ONNX saved: {onnx_path.name}")

    print(f"[4/4] Converting to OpenVINO IR...")
    ov_model = mo.convert_model(str(onnx_path), compress_to_fp16=args.fp16)

    # Save in OVMS format (model.xml, model.bin)
    ovms_dir = output_path / final_name / "1"
    ovms_dir.mkdir(parents=True, exist_ok=True)
    ir_path = ovms_dir / "model.xml"
    ov.save_model(ov_model, str(ir_path))
    print(f"      OpenVINO IR saved: {ir_path}")

    # Cleanup ONNX
    onnx_path.unlink()

    print()
    print(f"="*60)
    print(f"Conversion complete!")
    print(f"="*60)
    print(f"Model: {output_path / final_name}")
    print(f"Files:")
    print(f"  - {ir_path}")
    print(f"  - {ir_path.with_suffix('.bin')}")
    print()
    print(f"OVMS config entry:")
    print(f'  {{"config": {{"name": "{final_name}", "base_path": "{output_path / final_name}"}}}}')
    print(f"="*60)

if __name__ == '__main__':
    main()
