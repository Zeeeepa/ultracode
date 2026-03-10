# Embedding Providers & Configuration

Consolidated documentation covering all embedding providers, performance tuning, setup, and troubleshooting.

---

## Provider Overview

| Provider | Endpoint | Batch | GPU | Docker | Speed | Best For |
|----------|----------|-------|-----|--------|-------|----------|
| **llamacpp** | `/v1/embeddings` | Yes | CUDA/Vulkan/CPU | No | **441/s** | Native GGUF, low VRAM |
| **vllm** | `/v1/embeddings` | Yes | CUDA | Yes | **1352/s** | Max throughput (NVIDIA) |
| **tei** | `/embed` | Yes | CUDA/CPU | Yes | **1169/s** | HuggingFace models |
| **ovms** | `/v3/embeddings` | Yes | CPU/iGPU | Yes/No | **260-326/s** | Intel optimized |
| **ollama** | `/api/embeddings` | No | CUDA/CPU | No | -- | Simple setup |
| **openai** | `/v1/embeddings` | Yes | Cloud | No | -- | Cloud API |

### Performance Comparison (RTX 5090, multilingual-e5-small)

| Provider | Speed | Relative |
|----------|-------|----------|
| OVMS Native (CPU/iGPU) | 260-326/s | 0.7x |
| llama.cpp (optimized) | 441/s | 1x |
| TEI (120-latest) | 1169/s | 2.7x |
| **vLLM (optimized)** | **1352/s** | **3.1x** |

---

## Quick Start

```bash
# Interactive setup wizard (recommended)
npx ultracode setup

# Or with specific provider
npx ultracode setup --provider llamacpp    # Universal (CUDA/Vulkan/CPU)
npx ultracode setup --provider vllm        # NVIDIA GPU Production (Docker)
npx ultracode setup --provider tei         # HuggingFace models (Docker)
npx ultracode setup --provider ovms        # Intel optimized (iGPU/CPU)
npx ultracode setup --provider ollama      # Simple setup
```

Configuration location:
- Windows: `%LOCALAPPDATA%\UltraCode\semantic-config.json`
- macOS: `~/Library/Application Support/UltraCode/semantic-config.json`
- Linux: `~/.config/ultracode/semantic-config.json`

---

## llama.cpp (Native GGUF)

**Files:** `llamacpp-provider.ts`, `llamacpp-server-manager.ts`

Native inference server for GGUF models. No Docker required. Supports CUDA, Vulkan, CPU.

### Server Configuration

```bash
llama-server \
  --model <path>.gguf \
  --embedding \
  --port 8085 \
  --n-gpu-layers 99 \
  --ctx-size 2048 \
  --batch-size 3072 \
  --ubatch-size 1536 \
  --flash-attn on \
  --parallel 4 \
  --mlock \
  --threads <auto-detected P-cores>
```

### Client Configuration (semantic-config.json)

```json
{
  "embedding": {
    "platform": "llamacpp",
    "llamacpp": {
      "endpoint": "http://127.0.0.1:8085",
      "selected_model": "multilingual-e5-base",
      "context_size": 2048,
      "n_gpu_layers": 99,
      "parallel_slots": 4,
      "ubatch_size": 1536,
      "batch_size": 3072,
      "max_batch_size": 256,
      "concurrency": 4,
      "auto_start": true
    }
  }
}
```

### Key Parameters

| Server Parameter | CLI Flag | Default | Description |
|-----------------|----------|---------|-------------|
| `context_size` | `--ctx-size` | 2048 | Total context (divided by parallel_slots) |
| `parallel_slots` | `--parallel` | 4 | Parallel request processing slots |
| `ubatch_size` | `--ubatch-size` | 1536 | Micro-batch size (10% speedup vs 512) |
| `batch_size` | `--batch-size` | 3072 | Prompt processing batch |
| `n_gpu_layers` | `--n-gpu-layers` | 99 | GPU layers (-1 = all) |

| Client Parameter | Default | Description |
|-----------------|---------|-------------|
| `max_batch_size` | 256 | Texts per HTTP request |
| `concurrency` | 4 | Parallel HTTP requests (should = parallel_slots) |
| `auto_start` | true | Auto-start llama-server |

### Performance Tuning

**Critical:** `ctx-size` is divided by `parallel`!
```
tokens_per_slot = ctx-size / parallel
```
Example: ctx-size=2048, parallel=4 -> 512 tokens per slot. Texts longer than this will be truncated.

**Thread count:** Use P-cores only, NOT all logical cores. UltraCode auto-detects P-cores.

**Do NOT use `--no-cont-batching`** -- continuous batching is a key optimization for throughput.

### Benchmark (RTX 5090)

| Configuration | Speed | Change |
|--------------|-------|--------|
| parallel=4, ubatch=512 (baseline) | 336/s | -- |
| parallel=4, ubatch=1536 (optimized) | 373/s | +11% |
| Centralized mode (v3.1+) | **441/s** | +31% |

### Centralized Mode (v3.1+)

Workers send texts to Main process via IPC; Main generates embeddings through a single llama.cpp server:

```
Main Process: EmbeddingAccumulator -> LlamaCppProvider -> llama-server :8085
  ^            ^            ^
  | IPC texts  | IPC texts  | IPC texts
Worker-0     Worker-1     Worker-N
(parsing)    (parsing)    (parsing)
```

Benefits: single HTTP connection, optimal batching, no contention between workers.

### Bottlenecks vs vLLM

llama.cpp is inherently slower due to: GGUF dequantization overhead, single-threaded prompt processing, no paged attention, CPU-centric design.

**Use llama.cpp when:** no Docker, AMD/Intel GPU (Vulkan), limited resources, simplicity over speed.

---

## vLLM (GPU Docker)

**File:** `vllm-provider.ts`

High-performance inference server with continuous batching and paged attention. Maximum throughput on NVIDIA GPUs.

### Server Configuration

```bash
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest-cu130 \
  --model intfloat/multilingual-e5-base \
  --task embed \
  --dtype auto \
  --max-model-len 512 \
  --gpu-memory-utilization 0.8 \
  --max-num-batched-tokens 16384 \
  --max-num-seqs 256 \
  --disable-log-requests
```

### Client Configuration

```json
{
  "embedding": {
    "platform": "vllm",
    "vllm": {
      "endpoint": "http://127.0.0.1:8000",
      "max_batch_size": 200,
      "encoding_format": "base64",
      "concurrency": 12,
      "selected_model": "intfloat/multilingual-e5-small"
    }
  }
}
```

### Key Server Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `--max-model-len` | 512 (dynamic) | Max context length |
| `--gpu-memory-utilization` | 0.8 | GPU memory fraction |
| `--max-num-batched-tokens` | 16384 | Tokens per batch (high for encoder models) |
| `--max-num-seqs` | 256 | Concurrent sequences for batching |
| `--disable-log-requests` | -- | Reduces overhead (vLLM 0.14+) |

### Optimization Tips

1. **Increase `max-num-batched-tokens`** to 16384+ for encoder models (embeddings)
2. **Increase `max-num-seqs`** to 256 for better GPU utilization
3. **Use `encoding_format: "base64"`** for ~33% smaller payloads
4. **GPU memory utilization** up to 0.9 for dedicated embedding servers
5. **Model selection:** e5-small (384 dim) is usually sufficient for code search

### Benchmark (RTX 5090, e5-small)

| Configuration | Speed |
|--------------|-------|
| Default vLLM | ~1260/s |
| + max-num-batched-tokens=16384, max-num-seqs=256 | **1352/s** (+7%) |

**vLLM is 3.6x faster than llama.cpp** for embedding workloads.

### When to Use vLLM

- NVIDIA GPU with Docker available
- Maximum throughput needed
- Production workloads

---

## TEI (HuggingFace Text Embeddings Inference)

**File:** `tei-provider.ts`

Official HuggingFace inference server for embedding models. Optimized for GPU.

### Server Configuration

```bash
# Standard GPUs (Turing/Ampere/Ada/Hopper):
docker run --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id intfloat/multilingual-e5-small \
  --max-batch-tokens 32768 \
  --max-client-batch-size 1024

# Blackwell GPU (RTX 50xx, sm_120):
docker run --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:120-latest \
  --model-id intfloat/multilingual-e5-small
```

### Docker Image Tags (TEI 1.9.1+)

| GPU Architecture | Compute Cap | Image Tag |
|-----------------|-------------|-----------|
| Turing (RTX 20xx) | 7.5 | `latest` |
| Ampere (RTX 30xx) | 8.0/8.6 | `latest` |
| Ada (RTX 40xx) | 8.9 | `latest` |
| Hopper (H100) | 9.0 | `hopper-latest` |
| **Blackwell (RTX 50xx)** | **12.0** | **`120-latest`** |
| CPU | -- | `cpu-latest` |

### Client Configuration

```json
{
  "embedding": {
    "platform": "tei",
    "tei": {
      "baseUrl": "http://127.0.0.1:8081",
      "queueBatchSize": 50,
      "parallelBatches": 4,
      "concurrency": 16,
      "timeoutMs": 120000
    }
  }
}
```

TEI requires lower parallelism than llamacpp/vLLM due to internal batching. On HTTP 429 "overloaded" responses, automatic backoff with re-queue is applied.

### Benchmark (RTX 5090, e5-small)

| Metric | Value |
|--------|-------|
| Accumulator speed | **1169 emb/s** (overall), peak **2442 emb/s** |
| Full index (800 files) | **10.2 sec** |
| 429 errors | **0** (with optimized config) |

---

## OVMS (OpenVINO Model Server)

**Files:** `ovms-provider.ts`, `ovms-native-manager.ts`

Intel-optimized inference on CPU and iGPU. Supports native binary mode (no Docker required).

### Configuration

```json
{
  "embedding": {
    "platform": "ovms-native",
    "ovms": {
      "endpoint": "http://127.0.0.1:8083",
      "batch_size": 200,
      "ovms_mini_batch": 8,
      "selected_model": "multilingual-e5-base",
      "target_device": "NPU",
      "endpoints": [
        "embeddings-gpu", "embeddings-gpu", "embeddings-gpu",
        "embeddings-cpu", "embeddings-cpu", "embeddings-cpu",
        "embeddings-cpu", "embeddings-cpu"
      ],
      "useEmbeddingsApi": true,
      "encodingFormat": "base64"
    }
  }
}
```

### Architecture (Native Mode)

```
Main Process
  ├── OVMSNativeManager (auto-start, health checks, graceful shutdown)
  ├── OVMSProvider -> REST/gRPC -> OVMS Server
  └── Round-robin endpoints: [gpu,gpu,gpu,cpu,cpu,cpu,cpu,cpu]

OVMS Native Process
  ├── embeddings-gpu (Intel iGPU) -- 3 instances
  └── embeddings-cpu (Intel CPU)  -- 5 instances
  API: /v3/embeddings (OpenAI-compatible)
```

Optimal GPU:CPU ratio is **3:5** -- iGPU is weaker than CPU on sustained load.

### Benchmark (Centralized Mode)

| Metric | Value |
|--------|-------|
| Speed | **260-326 emb/s** (e5-small, iGPU + CPU) |
| FAISS flush | 136ms (14,781/s) |
| Device | Intel iGPU (GPU.0) + CPU |

**NVIDIA GPU.1 (Blackwell):** Does NOT work with OVMS. OpenVINO NVIDIA plugin does not support MediaPipe embeddings calculator.

### Model Comparison (optimized 3:5 ratio)

| Model | Dimensions | Speed | Recommendation |
|-------|-----------|-------|----------------|
| multilingual-e5-small | 384 | **260-326 emb/s** | Recommended for speed |
| multilingual-e5-base | 768 | ~120 emb/s | Quality/speed balance |
| multilingual-e5-large | 1024 | ~60-80 emb/s | Maximum quality |

---

## Ollama (Local LLM)

**File:** `ollama-provider.ts`

Simple local inference. Supports all GPUs including RTX 50xx.

### Setup

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull all-minilm
ollama serve
```

### Configuration

```json
{
  "embedding": {
    "platform": "ollama",
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "batchSize": 1,
      "concurrency": 4,
      "timeoutMs": 30000
    }
  }
}
```

**Limitations:** Does NOT support batch -- each text is a separate request. Slower than TEI/vLLM due to lack of batching.

---

## OpenAI (Cloud API)

**File:** `openai-provider.ts`

```json
{
  "embedding": {
    "platform": "openai",
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "model": "text-embedding-3-small",
      "batchSize": 100,
      "concurrency": 5,
      "apiKey": "sk-..."
    }
  }
}
```

Cloud-based, no local resources needed. Subject to rate limiting and per-token costs.

---

## Setup Guide

### Enabling Embeddings

**Via config (config/development.yaml):**
```yaml
mcp:
  embedding:
    provider: "auto"   # Auto-detect: Ollama > Memory fallback
    enabled: true
```

**Via environment variables:**
```bash
export MCP_EMBEDDING_PROVIDER=auto
export MCP_EMBEDDING_ENABLED=true
export MCP_EMBEDDING_MODEL=granite-embedding  # optional
```

Priority: **env variables > config file**

### Auto-Detect Logic

1. Checks Ollama at `127.0.0.1:11434`
2. Looks for `granite-embedding` model
3. If not found, uses any available model
4. If Ollama unavailable, falls back to memory provider

### Recommended Models

| Model | Context | Dims | Providers | Recommendation |
|-------|---------|------|-----------|----------------|
| **multilingual-e5-small** | 512 | 384 | llamacpp, OVMS | Fast (441 emb/s) |
| **multilingual-e5-base** | 512 | 768 | llamacpp, vLLM, OVMS | Quality/speed balance |
| nomic-embed-text-v1.5 | 8192 | 768 | TEI | Best for 8K context |
| all-minilm | 512 | 384 | Ollama | Simple setup |
| granite-embedding-english-r2 | 8192 | 768 | TEI, Ollama | IBM Granite (English) |

### Provider Recommendations

- **Production NVIDIA GPU:** vLLM + `multilingual-e5-base`
- **Production Intel:** OVMS + `multilingual-e5-small`
- **Universal:** llama.cpp + `multilingual-e5-small` (441 emb/s, no Docker)
- **Simple setup:** Ollama + `all-minilm`
- **No local resources:** OpenAI API

### Adaptive Vector Backends

The system automatically selects the optimal vector search backend:

| Size | Vectors | Backend | Reason |
|------|---------|---------|--------|
| Small/Medium | <10k | sqlite-vec | Fast inserts, exact search |
| Large | >10k | vectorlite | HNSW index, 3-100x faster search |
| Fallback | any | Pure SQLite | Always available |

Configuration:
```yaml
vectorBackend:
  backend: "auto"              # Automatic selection (recommended)
  autoSwitchThreshold: 10000   # Switch threshold (vectors)
```

---

## Vendored File Exclusion

### Automatic Skip for Embeddings

Vendored/generated directories (libc, musl, glibc, etc.) are automatically detected and excluded from embedding generation. Files are still parsed for graph entities.

Detection is automatic for projects with >500 files. See [dev-guide.md](dev-guide.md#vendoredgenerated-directory-detection) for heuristic details.

### Config Propagation

`WorkerEmbeddingConfig` (in `src/types/semantic.ts`) carries vendored info to worker processes via IPC:

```typescript
interface WorkerEmbeddingConfig {
  // ... existing fields ...
  vendoredPrefixes?: string[];  // Directory prefixes to skip
  projectRoot?: string;         // For relative path calculation
}
```

Workers check `isVendoredFile(filePath)` before calling TEI/vLLM. Extensions `.def` and `.inc` are always skipped.

### TEI Pipelining

For TEI provider, `parallelBatches=4` (was 1) ensures GPU stays saturated during HTTP round-trips. This is critical for short texts (C headers ~30 tokens) where network latency dominates over GPU compute. Impact: 140 → 5513 emb/s on vendored-heavy projects.

---

## Troubleshooting

### Low Throughput

1. Check batch size -- too large may increase latency
2. Check concurrency -- should match server parallelism
3. Check GPU utilization: `nvidia-smi`
4. For llama.cpp: verify thread count = P-cores, `--flash-attn` enabled

### High VRAM Usage

1. Reduce `--n-gpu-layers` for llamacpp
2. Use quantized models (Q4, Q8)
3. Reduce `--ctx-size` or `--max-model-len`
4. For vLLM: reduce `--gpu-memory-utilization` to 0.7

### Connection Errors

1. Verify server is running
2. Check port availability
3. Increase timeout
4. For TEI/vLLM Docker: check `docker logs <container-name>`

### Ollama Issues

**"Connection refused":**
```bash
ollama serve
netstat -an | grep 11434
```

**"Model not found":**
```bash
ollama list
ollama pull granite-embedding
```

### Out of Memory (llama.cpp)

1. Reduce `--n-gpu-layers`
2. Reduce `--batch-size`
3. Use smaller quantization (Q4 instead of Q8)
