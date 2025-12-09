# Best embedding models for code semantic search in 2025

**Voyage-code-3 and Nomic Embed Code now lead the code embedding landscape**, with ModernBERT-based models emerging as the best balance of 8K context, efficiency, and code understanding for self-hosted deployments. The era of 512-token limits is over—**8K-32K context is now standard** for serious code search applications, and Matryoshka embeddings enable 14x storage reduction with minimal accuracy loss.

For most self-hosted code search use cases, **jina-embeddings-v2-base-code** (161M params, Apache 2.0) offers the best balance of quality, speed, and compatibility across OpenVINO, TEI, and Ollama. For maximum accuracy, Voyage-code-3's 32K context and SOTA benchmarks make it the premium choice. ModernBERT-embed-base represents the new architecture frontier—trained on code data, 8K context, and 4x faster than DeBERTa.

---

## Comprehensive model comparison table

| Model | Provider Support | Context | Languages | Dims | Size | Speed (GPU) | MTEB Retrieval | Notes |
|-------|-----------------|---------|-----------|------|------|-------------|----------------|-------|
| **jina-embeddings-v2-base-code** | ✅ OpenVINO ✅ TEI ✅ Ollama | 8,192 | EN + 30 prog langs | 768 | 322MB | ~8,000 tok/s | ~55 | **Best open code-specific model** |
| **nomic-embed-text-v1.5** | ✅ OpenVINO ✅ TEI ✅ Ollama | 8,192 | EN | 768 (MRL: 256) | 274MB | ~6,000 tok/s | 53.1 | Matryoshka, task prefixes required |
| **modernbert-embed-base** | ✅ OpenVINO ✅ TEI ❌ Ollama | 8,192 | EN | 768 (MRL: 256) | ~550MB | ~10,000 tok/s | ~53+ | **New architecture**, code-trained |
| **gte-modernbert-base** | ✅ OpenVINO ✅ TEI ❌ Ollama | 8,192 | EN | 768 | ~550MB | ~10,000 tok/s | ~54+ | Alibaba's ModernBERT variant |
| **BGE-M3** | ✅ OpenVINO ✅ TEI ✅ Ollama | 8,192 | **100+ langs** | 1024 | 1.1GB | ~3,500 tok/s | ~55+ | **Best multilingual**, hybrid retrieval |
| **snowflake-arctic-embed-l-v2.0** | ✅ OpenVINO ✅ TEI ✅ Ollama | 8,192 | **Multilingual** | 1024 | ~600MB | ~5,000 tok/s | 57.1 | Dec 2024 release, MRL + quantization |
| **gte-large-en-v1.5** | ✅ OpenVINO ✅ TEI ❌ Ollama | 8,192 | EN | 1024 | 870MB | ~4,500 tok/s | 65.39 | Strong all-rounder |
| **BGE-base-en-v1.5** | ✅ OpenVINO ✅ TEI ✅ Ollama | 512 | EN | 768 | 440MB | ~8,000 tok/s | 53.3 | Reliable workhorse |
| **all-MiniLM-L6-v2** | ✅ OpenVINO ✅ TEI ✅ Ollama | 512 | EN | 384 | 90MB | **~14,000 tok/s** | 41-43 | **Fastest**, quality tradeoff |
| **mxbai-embed-large** | ✅ OpenVINO ✅ TEI ✅ Ollama | 512 | EN | 1024 | 1.2GB | ~6,500 tok/s | 64.68 | Best MTEB in Ollama |
| **CodeRankEmbed** | ✅ OpenVINO ✅ TEI ❌ Ollama | 8,192 | EN + code | 768 | ~550MB | ~7,000 tok/s | ~55+ | Best efficiency/performance for code |
| **Voyage-code-3** (API) | ❌ API only | **32,000** | 300+ langs | 2048 (MRL) | N/A | N/A | SOTA | **Best accuracy**, $0.22/M tokens |

---

## Answering specific questions

### 1. Is nomic-embed-text-v1.5 still best for 8K context?

**No longer the clear winner.** While nomic-embed-text-v1.5 remains excellent (62.28 MTEB overall, 85.53 LoCo score), several December 2024 releases now compete:

- **gte-large-en-v1.5** achieves 65.39 MTEB (higher) with same 8K context
- **Snowflake Arctic-embed-l-v2.0** hits 57.1 retrieval with multilingual support
- **modernbert-embed-base** offers 8K context with superior code understanding (56.4 CodeSearchNet)
- **jina-embeddings-v2-base-code** is purpose-built for code with 8K context

For code specifically, **jina-embeddings-v2-base-code or modernbert-embed-base** are now better choices. Nomic remains excellent for general text + light code mixing.

### 2. Better alternatives to all-MiniLM-L6-v2 for speed?

**BGE-small-en-v1.5** is the recommended upgrade—similar speed (33M vs 22M params), but **62.17 vs 41-43 MTEB retrieval** (20+ point improvement).

| Model | Params | MTEB Retrieval | Speed vs MiniLM |
|-------|--------|----------------|-----------------|
| all-MiniLM-L6-v2 | 22M | 41-43 | 1.0x (baseline) |
| **BGE-small-en-v1.5** | 33M | **62.17** | ~0.6x |
| gte-small | 33M | 61.36 | ~0.6x |
| snowflake-arctic-embed-xs | 22M | 50.15 | ~1.0x |

**Best upgrade path**: BGE-small-en-v1.5 for ~50% speed with 48% quality improvement.

### 3. Best multilingual embedding model under 500MB?

**gte-multilingual-base (305M params, ~400MB)** supports 70+ languages with 8K context and both dense + sparse retrieval.

Alternatives under 500MB:
- **snowflake-arctic-embed-m-v2.0** (113M, ~450MB): 8K context, multilingual (Dec 2024)
- **multilingual-e5-small** (118M, ~470MB): 100+ languages, 512 context

For **Russian, Chinese, Japanese** specifically, **BGE-M3 (567M, ~1.1GB)** is worth the extra size—100+ languages with SOTA multilingual retrieval and hybrid search capability.

### 4. New code-specific embedding models from late 2024?

**Yes, significant releases:**

| Model | Release | Parameters | Context | Key Feature |
|-------|---------|------------|---------|-------------|
| **Nomic Embed Code** | Mar 2025 | 7B | 2048 | SOTA CodeSearchNet, fully open (Apache 2.0) |
| **Voyage-code-3** | Dec 2024 | N/A (API) | 32K | +14% over OpenAI, Matryoshka + quantization |
| **CodeXEmbed-7B** | Nov 2024 | 7B | - | SOTA on CoIR benchmark |
| **CodeRankEmbed** | 2024 | 137M | 8192 | Best small model, MIT license |
| **modernbert-embed-base** | Dec 2024 | 139M | 8192 | First encoder trained on large-scale code |

**Nomic Embed Code** is the breakthrough—7B parameters trained on CoRNStack (21M high-quality code pairs), achieving 81.7% on Python CodeSearchNet versus ~70% for alternatives.

### 5. ModernBERT vs classic BERT architecture for embeddings?

**ModernBERT is definitively better** for code semantic search.

| Feature | Classic BERT | ModernBERT |
|---------|-------------|------------|
| Max context | 512 tokens | **8,192 tokens** |
| Positional encoding | Absolute | **RoPE (rotary)** |
| Attention | Standard | **Flash Attention 2** |
| Training data | ~16GB | **2 trillion tokens** |
| Code training | None | **Large-scale code data** |
| CodeSearchNet score | ~50 | **56.4 (base), 59.5 (large)** |
| Speed | Baseline | **4x faster** on mixed inputs |

ModernBERT is the **first encoder model trained on large-scale code data**—the only model scoring >80 on StackOverflow-QA benchmark. For code search, this architectural advantage is substantial.

### 6. Snowflake Arctic vs BGE vs GTE comparison for code

| Model | MTEB Retrieval | Context | Size | Best For |
|-------|---------------|---------|------|----------|
| **snowflake-arctic-embed-l-v2.0** | 57.1 | 8192 | 303M | Multilingual + compression |
| **BGE-large-en-v1.5** | 54.3 | 512 | 335M | English, proven reliability |
| **BGE-M3** | ~55+ | 8192 | 567M | Multilingual + hybrid search |
| **gte-large-en-v1.5** | **65.39** | 8192 | 434M | **Highest quality** |

**Winner for code: gte-large-en-v1.5** offers highest quality with 8K context. For multilingual codebases, **BGE-M3** wins due to hybrid dense+sparse+ColBERT retrieval (captures both semantic meaning and exact function names).

**Arctic's advantage**: Best Matryoshka compression—achieves 98% quality retention at 128 bytes/vector (24x compression).

### 7. Alibaba GTE models - latest versions and performance

The GTE family has expanded significantly:

| Model | Params | Context | MTEB | License |
|-------|--------|---------|------|---------|
| gte-small | 33M | 512 | 61.36 | Apache 2.0 |
| gte-base | 110M | 512 | 62.39 | Apache 2.0 |
| **gte-base-en-v1.5** | 137M | 8192 | 64.11 | Apache 2.0 |
| **gte-large-en-v1.5** | 434M | 8192 | **65.39** | Apache 2.0 |
| gte-multilingual-base | 305M | 8192 | - | Apache 2.0 |
| **gte-modernbert-base** | 139M | 8192 | ~54+ | Apache 2.0 |
| gte-Qwen2-1.5B-instruct | 1.5B | 32K | ~66 | Apache 2.0 |
| gte-Qwen2-7B-instruct | 7B | 32K | **70.24** | Apache 2.0 |

**Best production choice**: gte-large-en-v1.5 (8K context, 65.39 MTEB, Apache 2.0). For cutting-edge results, gte-Qwen2-7B-instruct achieves 70.24 MTEB with 32K context.

### 8. Cohere embed models - availability and performance

**API-only, no open weights available.**

| Model | Dimensions | Context | Languages |
|-------|-----------|---------|-----------|
| embed-english-v3.0 | 1024 | 512 | English |
| embed-multilingual-v3.0 | 1024 | 100+ languages | 100+ |

Supports float, int8, binary embeddings. Available via Cohere API, AWS Bedrock, Azure.

**Limitation for code**: 512-token context is inadequate for most code files. **Not recommended** for code semantic search—choose Jina, Voyage, or open models instead.

### 9. Jina embeddings v2/v3 - 8K context performance

**Jina offers the best code-specific open model** in the mid-size range:

| Model | Params | Context | Dims | Best For |
|-------|--------|---------|------|----------|
| jina-embeddings-v2-base-en | 137M | 8192 | 768 | General English |
| **jina-embeddings-v2-base-code** | 161M | 8192 | 768 | **Code search** (30 prog langs) |
| jina-embeddings-v3 | 570M | 8192 | 1024 (MRL) | Multilingual + task LoRAs |

**jina-embeddings-v2-base-code** is trained on 150M+ code Q&A and docstring-source pairs. It achieved SOTA on 9/15 CodeSearchNet benchmarks at release. The 8K context via ALiBi extrapolation handles most code files.

**Jina v3** adds task-specific LoRA adapters (retrieval.query, retrieval.passage) and Matryoshka support, but lacks a dedicated code adapter.

---

## Provider compatibility matrix

| Model | OpenVINO INT8 | TEI Flash Attention | Ollama |
|-------|--------------|---------------------|--------|
| jina-embeddings-v2-base-code | ✅ Full support | ✅ Native (ALiBi) | ✅ unclemusclez/jina-embeddings-v2-base-code |
| nomic-embed-text-v1.5 | ✅ Full support | ✅ Native (NomicBERT) | ✅ nomic-embed-text |
| BGE-M3 | ✅ Full support | ✅ Native (XLM-RoBERTa) | ✅ bge-m3 |
| BGE-base-en-v1.5 | ✅ Full support | ✅ Native (BERT) | ✅ bge-base |
| gte-large-en-v1.5 | ✅ Full support | ✅ Native (RoPE) | ❌ Not available |
| modernbert-embed-base | ✅ Full support | ✅ Native (ModernBERT) | ❌ Not available |
| all-MiniLM-L6-v2 | ✅ Full support | ✅ Native (BERT) | ✅ all-minilm |
| snowflake-arctic-embed-l-v2.0 | ✅ Full support | ✅ Native | ✅ snowflake-arctic-embed2 |
| mxbai-embed-large | ✅ Full support | ✅ Native | ✅ mxbai-embed-large |

**OpenVINO INT8 quantization** delivers 2.5-3x CPU speedup with ~0.4% accuracy loss. **TEI Flash Attention** requires Ampere 80+ GPUs (A100, A10, RTX 4000+) for automatic enablement.

---

## Recommendations by use case

### Semantic code search (similar functions, patterns)

| Priority | Model | Why |
|----------|-------|-----|
| **Best quality** | Voyage-code-3 (API) | SOTA, 32K context, +14% over OpenAI |
| **Best open-source** | jina-embeddings-v2-base-code | Code-specific training, 8K context, Apache 2.0 |
| **Best efficiency** | CodeRankEmbed (137M) | Outperforms 1.3B models at 10x smaller |
| **Best new architecture** | modernbert-embed-base | Code-trained, 8K context, 4x faster |

### Code documentation search

| Priority | Model | Why |
|----------|-------|-----|
| **Best overall** | BGE-M3 | Hybrid dense+sparse captures keywords + semantics |
| **Best English** | gte-large-en-v1.5 | Highest MTEB, 8K context |
| **Best speed** | BGE-small-en-v1.5 | 62.17 MTEB at near-MiniLM speed |

### Cross-file relationship analysis (long context)

| Priority | Model | Why |
|----------|-------|-----|
| **8K context** | modernbert-embed-base | Fast, code-aware, 8K context |
| **32K context** | Voyage-code-3 (API) | Only option for 500+ line methods |
| **Self-hosted 8K** | gte-large-en-v1.5 | Best quality at 8K |

### Multilingual codebases (RU/CN/JP comments)

| Priority | Model | Why |
|----------|-------|-----|
| **Best overall** | BGE-M3 | 100+ languages, 8K context, hybrid search |
| **Under 500MB** | gte-multilingual-base | 70+ languages, 8K context |
| **Dec 2024 release** | snowflake-arctic-embed-l-v2.0 | Multilingual without English compromise |

---

## Trade-offs analysis

### Speed vs quality vs memory

```
                    QUALITY (MTEB)
                         ↑
    gte-Qwen2-7B (70.24) |  ★ Voyage-code-3 (SOTA)
                         |      ★ gte-large-v1.5 (65.39)
                         |   ★ mxbai-embed-large (64.68)
                         | ★ BGE-M3 (55+, hybrid)
                         |★ jina-code-v2 (code-specific)
    snowflake-arctic ────|───★ modernbert-embed (code-trained)
                         |  ★ nomic-v1.5 (53.1)
                         | ★ BGE-base (53.3)
                         |★ BGE-small (62.17, fast!)
    all-MiniLM (41-43) ★ |
                         +────────────────────────→ SPEED
                        Slow                        Fast
```

**Key insight**: BGE-small-en-v1.5 breaks the speed-quality tradeoff—nearly as fast as MiniLM but 48% higher quality. For code specifically, jina-embeddings-v2-base-code offers the best code-aware quality at reasonable speed.

### Memory optimization strategies

1. **Matryoshka truncation**: Reduce 768→256 dims for 3x memory reduction, ~2% quality loss
2. **INT8 quantization**: 4x model size reduction via OpenVINO, ~0.4% quality loss
3. **Binary embeddings**: 24x storage reduction (Snowflake Arctic achieves 98% quality retention)

---

## Practical deployment recommendations

### For OpenVINO (Intel CPU, INT8)
**Best models**: BGE-base-en-v1.5, jina-embeddings-v2-base-code, nomic-embed-text-v1.5
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-base-en-v1.5", backend="openvino")
# Achieves 2.5-3x speedup with INT8 quantization
```

### For TEI (HuggingFace, GPU + Flash Attention)
**Best models**: jina-embeddings-v2-base-code, gte-large-en-v1.5, modernbert-embed-base
```bash
docker run --gpus all -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.8 \
  --model-id jinaai/jina-embeddings-v2-base-code
```

### For Ollama (local inference)
**Best models**: nomic-embed-text, mxbai-embed-large (highest quality), snowflake-arctic-embed2
```bash
ollama pull nomic-embed-text  # 8K context, Matryoshka
ollama pull mxbai-embed-large # Best MTEB score available
```

---

## Final recommendations

| Use Case | Recommended Model | Provider | Why |
|----------|-------------------|----------|-----|
| **Production code search** | jina-embeddings-v2-base-code | TEI | Code-specific, 8K, fast, Apache 2.0 |
| **Maximum accuracy** | Voyage-code-3 | API | SOTA, 32K context, Matryoshka |
| **Intel CPU deployment** | BGE-base-en-v1.5 + INT8 | OpenVINO | 2.5x speedup, proven reliability |
| **Local development** | nomic-embed-text | Ollama | Easy setup, 8K context, free |
| **Multilingual codebase** | BGE-M3 | TEI | Hybrid search, 100+ languages |
| **Fastest inference** | BGE-small-en-v1.5 | Any | 62.17 MTEB at near-MiniLM speed |
| **Legacy long methods** | Voyage-code-3 or gte-Qwen2-7B | API/TEI | 32K context required |
| **Best new architecture** | modernbert-embed-base | TEI/OpenVINO | Code-trained, 8K, 4x faster |

The embedding landscape has matured significantly—**general-purpose text embedders underperform code-specific models by 10-20%**. For serious code search applications, invest in jina-embeddings-v2-base-code or Voyage-code-3 rather than repurposing text embedders like MiniLM or vanilla BGE.