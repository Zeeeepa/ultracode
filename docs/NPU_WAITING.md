# Intel NPU - Waiting for Support

This document tracks what we're waiting for from Intel NPU ecosystem to enable embedding model inference.

## Current Status (December 2025)

### What Works on NPU

| Model Type | Status | Performance |
|------------|--------|-------------|
| CNN Classification (ResNet, MobileNet) | **Working** | 3-4x faster than CPU |
| YOLO Object Detection | **Working** | Real-time capable |
| Image Upscaling (BSRGAN, ESRGAN) | **Working** | Good performance |
| Simple feedforward networks | **Working** | Fast inference |

### What Doesn't Work on NPU

| Model Type | Issue | Workaround |
|------------|-------|------------|
| BERT/Transformers | `masked_fill/Select` operation unsupported | Use CPU INT8 |
| All embedding models | Attention mask operations fail | Use CPU INT8 |
| Stereo-depth models | Complex operations | Use CPU |
| Dynamic shape models | NPU requires static shapes | Reshape to fixed size |

## Blocking Issues

### 1. `masked_fill/Select` Operation

**Error:**
```
[vpux-compiler] Got Diagnostic at loc("aten::masked_fill/Select"):
Got non broadcastable dimensions pair : '0' and -9223372036854775808'
LLVM ERROR: Failed to infer result type(s).
```

**Affected Models:**
- all-MiniLM-L6-v2
- BGE-small-en-v1.5
- GTE-small
- Any BERT-based embedding model

**Root Cause:**
BERT attention mechanism uses `torch.masked_fill()` to apply attention masks. This operation is not supported by the Intel NPU LLVM compiler.

### 2. HETERO Mode Also Fails

Even `HETERO:NPU,CPU` mode crashes because the NPU compiler tries to compile the entire model before distributing operations. The crash happens during compilation, not inference.

### 3. Dynamic Shapes

NPU requires all tensor shapes to be static and known at compile time. Transformer models with variable sequence lengths need special handling.

## What We're Waiting For

### From Intel/OpenVINO Team

1. **`Select` Operation Support** (Critical)
   - GitHub Issue: Track [openvinotoolkit/openvino](https://github.com/openvinotoolkit/openvino/issues)
   - Expected: Unknown timeline
   - This would enable all BERT-based embedding models

2. **Improved HETERO Compilation**
   - Current: Crashes if any operation fails compilation
   - Needed: Graceful fallback during compilation phase
   - Expected: OpenVINO 2026.x?

3. **Dynamic Shape Support**
   - Current: Only static shapes
   - Needed: Dynamic input lengths
   - Progress: OpenVINO 2025.3 added limited support for LLMs

### From Model Developers

1. **NPU-Optimized Embedding Models**
   - Models without attention masking
   - CNN-based text embeddings
   - Static-shape friendly architectures

2. **Qwen3-Embedding NPU Support**
   - Currently: CPU/GPU only (OpenVINO 2025.4)
   - Needed: NPU backend support
   - Status: Under development

## Alternative Approaches to Monitor

### 1. NV-Embed Architecture (ICLR 2025)

[NV-Embed](https://arxiv.org/abs/2405.17428) removes the causal attention mask:
- Uses bidirectional attention
- May have different compatibility
- **Status:** Need to test on NPU

### 2. CNN-Based Code Embeddings

- [SeCNN](https://faculty.buct.edu.cn/) - CNN parser for code
- [ASTNN](https://github.com/zhangj111/astnn) - AST-based neural network
- **Potential:** These don't use attention masks

### 3. Simple Embedding Models

- FastText / Word2Vec style models
- No attention mechanism
- Trade-off: Lower semantic quality

## Current Recommendation

**Use OpenVINO CPU INT8** - it's actually very fast:

| Configuration | Inference Time | Notes |
|---------------|----------------|-------|
| OpenVINO CPU INT8 | **1.34ms** | Best option |
| OpenVINO CPU FP32 | ~3ms | Good fallback |
| OpenVINO GPU | ~3ms | Not faster for small models |
| Ollama | 10-50ms | Easy to use |
| TEI Docker | 5-15ms | Good batch processing |

CPU INT8 is **3-10x faster** than typical embedding solutions!

## NPU Use Cases That Work Today

Even without embedding support, NPU can accelerate:

1. **Image Classification**
   - Language detection from screenshots
   - Code screenshot to text (with OCR)

2. **Object Detection (YOLO)**
   - UI element detection
   - Diagram parsing

3. **Code Analysis (CNN-based)**
   - Syntax pattern detection
   - Code complexity estimation
   - Bug pattern recognition

## Tracking Resources

- [OpenVINO Release Notes](https://docs.openvino.ai/2025/about-openvino/release-notes-openvino.html)
- [OpenVINO GitHub Issues](https://github.com/openvinotoolkit/openvino/issues)
- [Intel NPU Driver Updates](https://www.intel.com/content/www/us/en/download/794734/intel-npu-driver-windows.html)
- [OpenVINO Model Zoo](https://github.com/openvinotoolkit/open_model_zoo)

## Timeline Expectations

| Feature | Optimistic | Realistic | Status |
|---------|------------|-----------|--------|
| Select op support | Q2 2026 | Unknown | No public timeline |
| Embedding models on NPU | Q3 2026 | 2027+ | Depends on Select |
| Better HETERO mode | Q1 2026 | Q2 2026 | Being worked on |

---

*Last updated: December 2025*
*Tested with: OpenVINO 2025.x, openvino-node 2024.5.0*
