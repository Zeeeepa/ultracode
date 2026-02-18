# Embedding Providers - Implementation Details

Документация по провайдерам генерации embeddings в UltraScript Tools.

## Quick Reference

| Provider | Endpoint | Batch | GPU | Docker | Speed | Use Case |
|----------|----------|-------|-----|--------|-------|----------|
| **llamacpp** | `/v1/embeddings` | Yes | CUDA/Vulkan/CPU | No | **441/s** | Native GGUF, low VRAM |
| **vllm** | `/v1/embeddings` | Yes | CUDA | Yes | **1352/s** | Max throughput |
| **tei** | `/embed` | Yes | CUDA/CPU | Yes | **1169/s** | HuggingFace models |
| **ollama** | `/api/embeddings` | No | CUDA/CPU | No | Simple setup |
| **ovms** | `/v3/embeddings` | Yes | CPU/iGPU | Yes/No | **260-326/s** | Intel optimized, centralized |
| **openai** | `/v1/embeddings` | Yes | Cloud | No | OpenAI API |

---

## llamacpp (Native GGUF)

**Файлы:** `llamacpp-provider.ts`, `llamacpp-server-manager.ts`

### Описание
Нативный сервер llama.cpp для GGUF моделей. Без Docker. Поддерживает CUDA, Vulkan, CPU.

### Server Configuration
```bash
llama-server \
  --model <path>.gguf \
  --embedding \
  --port 8085 \
  --n-gpu-layers 99 \
  --ctx-size 2048 \
  --batch-size 1024 \
  --ubatch-size 512 \
  --flash-attn on \
  --parallel 4 \
  --mlock \
  --threads <auto-detected P-cores>
```

### Client Configuration
```typescript
batchSize: 256      // texts per HTTP request
concurrency: 4      // parallel requests (matches --parallel)
timeoutMs: 30000    // request timeout
```

### Critical: ctx-size и parallel

**ВАЖНО:** `ctx-size` делится на `parallel`!

```
tokens_per_slot = ctx-size / parallel
```

| ctx-size | parallel | Токенов на slot |
|----------|----------|-----------------|
| 512 | 4 | 128 ❌ мало! |
| 2048 | 4 | **512** ✅ |
| 4096 | 8 | 512 |

Если ваши тексты длиннее чем `ctx-size / parallel`, они будут обрезаны!

### Auto-Tuning
- **Threads**: Автоопределение P-cores (WMIC на Windows, sysctl на macOS, procfs на Linux)
- **Hybrid CPU**: Детекция Intel 12th+ gen, использует только P-cores
- **Flash Attention**: Включен по умолчанию (`--flash-attn on`)
- **Continuous Batching**: Включен (НЕ используем --no-cont-batching)

### batch-size vs ubatch-size

| Параметр | Описание | Рекомендация |
|----------|----------|--------------|
| `batch-size` | Размер batch для prompt processing | 1024 (для embeddings влияние меньше) |
| `ubatch-size` | Micro-batch размер | 512 (>1024 минимальный профит) |

Агрессивные значения (4096/2048) увеличивают memory overhead без значительного прироста скорости.

### Benchmark

| Metric | Value |
|--------|-------|
| **Speed** | **441 emb/s** (centralized mode, optimized) |
| **Embeddings** | 1976 |
| **Duration** | 4.5s |
| **Workers** | 6 |
| **Batches** | 9 |
| **Model** | multilingual-e5-small Q8 |
| **Config** | ctx=4096, parallel=8, queueBatchSize=72, PARALLEL_BATCHES=12 |

**Оптимизированные параметры (v3.1+):**
| Параметр | Значение | Описание |
|----------|----------|----------|
| `queueBatchSize` | 72 | Текстов на HTTP запрос (оптимально для parallel=8) |
| `PARALLEL_BATCHES` | 12 | Параллельных batch запросов в полёте |
| `parallel_slots` | 8 | llama-server --parallel |
| `context_size` | 4096 | llama-server --ctx-size |
| Sort by length | DESC | Длинные тексты первыми (лучше GPU KV cache) |

**Previous benchmark (RTX 5060 Laptop):**
| Metric | Value |
|--------|-------|
| **Speed** | **371 emb/s** |
| **VRAM Dedicated** | 0.4 GB |
| **VRAM Shared** | 1.1 GB |
| **Total GPU Memory** | 1.5 GB |
| **CPU Threads** | 24 |
| **Config** | ctx=2048, parallel=4, batch=1024, ubatch=512, batchSize=256 |

### Централизованный режим (v3.1+) ✅ IMPLEMENTED

**Архитектура:** Workers отправляют тексты в Main процесс через IPC, Main генерирует эмбеддинги через единый llama.cpp сервер.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN PROCESS                                │
├─────────────────────────────────────────────────────────────────────┤
│  EmbeddingAccumulator                                               │
│  ├── Получает тексты от workers через IPC                          │
│  ├── Параллельные generateBatch() вызовы                           │
│  ├── Фильтрация уже существующих ID через FAISS                    │
│  └── Flush в FAISS                                                 │
├─────────────────────────────────────────────────────────────────────┤
│  LlamaCppProvider (единственный экземпляр)                          │
│  └── HTTP → llama-server :8085                                     │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │ IPC texts          │ IPC texts          │ IPC texts
┌────────┴───────┐  ┌────────┴───────┐  ┌────────┴───────┐
│   Worker-0     │  │   Worker-1     │  │   Worker-N     │
│   (parsing)    │  │   (parsing)    │  │   (parsing)    │
└────────────────┘  └────────────────┘  └────────────────┘
```

**Преимущества:**
- Единственное HTTP соединение к llama-server
- Оптимальный батчинг в Main процессе
- Нет contention между воркерами
- Smart Incremental: пропуск уже существующих embeddings

### Особенности
- **Низкое потребление VRAM** - подходит когда GPU занят LLM
- GGUF dequantization добавляет overhead
- **vs vLLM**: ~30% throughput (371/s vs ~1200/s)
- **Централизованный режим** включается автоматически

---

## vllm (GPU Docker)

**Файл:** `vllm-provider.ts`

### Описание
vLLM - высокопроизводительный inference server с continuous batching и paged attention. Максимальный throughput на NVIDIA GPU.

### Server Configuration
```bash
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest-cu130 \
  --model intfloat/multilingual-e5-base \
  --task embed \
  --dtype auto \
  --max-model-len 512 \
  --disable-log-requests
```

### Client Configuration
```typescript
batchSize: 200       // texts per request (vLLM 0.14+ handles larger batches)
concurrency: 12      // high parallelism for continuous batching
encodingFormat: "base64"  // ~33% smaller payloads (vLLM 0.14+)
timeoutMs: 30000
```

### Benchmark (RTX 5090, multilingual-e5-small)

| Metric | Value |
|--------|-------|
| **Speed** | **1352 emb/s** (optimized server) |
| **Baseline** | ~1260 emb/s (default settings) |
| **vs llama.cpp** | **3.6x** faster (1352 vs 373) |
| **VRAM** | ~1.5 GB (e5-small) |
| **Model** | intfloat/multilingual-e5-small (384 dims) |
| **GPU** | RTX 5090 (Blackwell, sm_120) |
| **Config** | max-num-batched-tokens=16384, max-num-seqs=256 |

### Особенности
- Continuous batching - автоматическое объединение запросов
- Paged attention - эффективное использование памяти
- OpenAI-compatible API
- Требует Docker + NVIDIA Container Toolkit

---

## tei (HuggingFace Text Embeddings Inference)

**Файл:** `tei-provider.ts`

### Описание
Официальный inference server от HuggingFace для embedding моделей. Оптимизирован для GPU.

### Server Configuration
```bash
# Стандартные GPU (Turing/Ampere/Ada/Hopper):
docker run --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id intfloat/multilingual-e5-small \
  --max-batch-tokens 32768 \
  --max-client-batch-size 1024

# Blackwell GPU (RTX 50xx, sm_120):
docker run --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:120-latest \
  --model-id intfloat/multilingual-e5-small \
  --max-batch-tokens 32768 \
  --max-client-batch-size 1024
```

**ВАЖНО:** Стандартный `latest` image скомпилирован для compute cap 80 (Ampere).
Для Blackwell GPU (compute cap 120) необходим image `120-latest` (TEI 1.9.1+).

### Client Configuration
```typescript
batchSize: 50           // optimized for TEI (queueBatchSize)
parallelBatches: 4      // concurrent batch requests (TEI-specific, lower than llamacpp=12)
concurrency: 16         // TEI server concurrency
timeoutMs: 120000
```

### Accumulator Config (TEI-specific)
TEI требует более низкий параллелизм чем llamacpp/vLLM из-за внутреннего batching:
- `queueBatchSize: 50` (vs llamacpp=72, ovms=200)
- `parallelBatches: 4` (vs default=12)
- При 429 "overloaded" — backoff 500ms с автоматическим re-queue

### Benchmark (RTX 5090, multilingual-e5-small)

| Metric | Value |
|--------|-------|
| **Accumulator speed** | **1169 emb/s** (overall), peak **2442 emb/s** |
| **Worker embedding** | **924 emb/s** (7911 embeddings in 8.6s) |
| **FAISS flush** | 8206 vectors in 531ms = **15,440/s** |
| **Full index** | 800 files in **10.2 sec** |
| **429 errors** | **0** (with optimized config) |
| **Model** | intfloat/multilingual-e5-small (384 dims) |
| **GPU** | RTX 5090 (Blackwell, sm_120, image `120-latest`) |
| **Config** | queueBatchSize=50, parallelBatches=4 |
| **TEI startup** | 0 sec (hot), >5 min (cold model download) |

### Docker Image Tags (TEI 1.9.1+)

| GPU Architecture | Compute Cap | Image Tag |
|-----------------|-------------|-----------|
| Turing (RTX 20xx) | 7.5 | `latest` |
| Ampere (RTX 30xx) | 8.0/8.6 | `latest` |
| Ada (RTX 40xx) | 8.9 | `latest` |
| Hopper (H100) | 9.0 | `hopper-latest` |
| **Blackwell (RTX 50xx)** | **12.0** | **`120-latest`** |
| CPU | — | `cpu-latest` |

### Особенности
- Нативная поддержка HuggingFace моделей
- Endpoint `/embed` (не OpenAI-compatible)
- Поддержка reranking (`/rerank`)
- RTX 50xx: требует image `120-latest` (sm_120 support, TEI 1.9.1+)

---

## ollama (Local LLM)

**Файл:** `ollama-provider.ts`

### Описание
Простой локальный inference. Поддерживает все GPU включая RTX 50xx.

### Server Configuration
```bash
# Установка
curl -fsSL https://ollama.com/install.sh | sh

# Запуск модели
ollama pull all-minilm
ollama serve
```

### Client Configuration
```typescript
batchSize: 1        // Ollama не поддерживает batch
concurrency: 4      // параллельные запросы
timeoutMs: 30000
```

### Benchmark

| Metric | Value |
|--------|-------|
| **Speed** | TBD |
| **VRAM** | TBD |
| **Model** | TBD |
| **GPU** | TBD |

### Особенности
- Простая установка без Docker
- НЕ поддерживает batch - каждый текст отдельным запросом
- Endpoint `/api/embeddings`
- Медленнее TEI/vLLM из-за отсутствия batching

---

## ovms (OpenVINO Model Server)

**Файлы:** `ovms-provider.ts`, `ovms-grpc-client.ts`, `ovms-container.ts`

### Описание
Intel OpenVINO оптимизированный inference. Работает на CPU и NPU без GPU.

### Server Configuration
```bash
docker run -d -p 9000:9000 -p 8000:8000 \
  -v /models:/models \
  openvino/model_server:latest \
  --model_path /models/multilingual-e5-base \
  --model_name multilingual-e5-base \
  --port 9000 \
  --rest_port 8000
```

### Client Configuration
```typescript
batchSize: 32       // optimized for CPU
concurrency: 4
timeoutMs: 30000
pooling: "mean"     // or "cls" depending on model
```

### Benchmark

| Metric | Value |
|--------|-------|
| **Speed** | TBD |
| **RAM** | TBD |
| **Model** | TBD |
| **Device** | TBD |

### Особенности
- INT8 квантизация для CPU
- V3 API (`/v3/embeddings`) с MEAN pooling
- gRPC протокол для низкой латентности
- Поддержка Intel NPU

---

## ovms-native (OpenVINO Native Binary)

**Файлы:** `ovms-provider.ts`, `ovms-native-manager.ts`, `worker-embedding-client.ts`

### Описание
Локальный бинарник OVMS без Docker. Автоматическое управление lifecycle. MediaPipe graph для embeddings.

### Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN PROCESS                                │
├─────────────────────────────────────────────────────────────────────┤
│  OVMSNativeManager                                                  │
│  ├── Автостарт OVMS бинарника при первом запросе                   │
│  ├── Health checks каждые 30 секунд                                 │
│  └── Graceful shutdown при завершении MCP                           │
├─────────────────────────────────────────────────────────────────────┤
│  SemanticAgent                                                      │
│  ├── OVMSProvider (main process embeddings)                         │
│  │   ├── Warmup: 1 + 64 texts для прогрева GPU/CPU                 │
│  │   └── GlobalEmbeddingCache: ~450 стандартных API терминов        │
│  └── Round-robin по endpoints: [gpu,gpu,gpu,gpu,gpu,gpu,cpu,cpu]   │
├─────────────────────────────────────────────────────────────────────┤
│  ParserAgent                                                        │
│  └── SubprocessPool (TypeScript, Python, etc.)                      │
│      ├── Worker-0 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
│      ├── Worker-1 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
│      ├── Worker-2 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
│      ├── Worker-3 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
│      ├── Worker-4 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
│      └── Worker-5 ──► WorkerEmbeddingClient ──► OVMS /v3/embeddings │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OVMS NATIVE PROCESS                              │
├─────────────────────────────────────────────────────────────────────┤
│  ovms.exe --rest_port 8083 --port 9001 --config_path config.json    │
├─────────────────────────────────────────────────────────────────────┤
│  MediaPipe Graph Endpoints:                                         │
│  ├── embeddings-gpu  (6 instances) ── Intel GPU / NPU               │
│  └── embeddings-cpu  (2 instances) ── Intel CPU fallback            │
├─────────────────────────────────────────────────────────────────────┤
│  API: /v3/embeddings (OpenAI-compatible)                            │
│  ├── Request:  { model: "embeddings-gpu", input: [...], encoding_format: "base64" }
│  └── Response: { data: [{ embedding: "base64...", index: 0 }] }     │
└─────────────────────────────────────────────────────────────────────┘
```

### Конфигурация OVMS

**semantic-config.json:**
```json
{
  "enabled": true,
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
      "models": [{ "id": "multilingual-e5-base", "vector_size": 768 }],
      "useEmbeddingsApi": true,
      "encodingFormat": "base64"
    }
  }
}
```

**Оптимизированный ratio 3:5 (GPU:CPU)** — iGPU слабее CPU на sustained load.

### Worker Configuration

**WorkerEmbeddingConfig передаётся воркерам:**
```typescript
{
  enabled: true,
  provider: "ovms",
  modelName: "embeddings-gpu",      // Первый endpoint из списка
  batchSize: 200,
  dimensions: 768,                  // e5-base
  providerOptions: {
    baseUrl: "http://127.0.0.1:8083",
    timeoutMs: 30000,
    concurrency: 8,
    useEmbeddingsApi: true,
    encodingFormat: "base64",
    endpoints: ["embeddings-gpu", "embeddings-gpu", ..., "embeddings-cpu", "embeddings-cpu"]
  }
}
```

### Централизованный режим (v3.1+) ✅ IMPLEMENTED

**Архитектура:** Workers отправляют тексты в Main процесс, Main генерирует эмбеддинги через единый EmbeddingGenerator.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN PROCESS                                │
├─────────────────────────────────────────────────────────────────────┤
│  EmbeddingAccumulator                                               │
│  ├── Получает тексты от workers через IPC                          │
│  ├── Параллельные generateBatch() вызовы                           │
│  ├── Ожидание всех in-flight batches перед flush                   │
│  └── Flush в FAISS (6393/s)                                        │
├─────────────────────────────────────────────────────────────────────┤
│  EmbeddingGenerator (единственный экземпляр)                        │
│  └── OVMSProvider → gRPC/REST → OVMS Server                        │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │ IPC texts          │ IPC texts          │ IPC texts
┌────────┴───────┐  ┌────────┴───────┐  ┌────────┴───────┐
│   Worker-0     │  │   Worker-1     │  │   Worker-N     │
│   (parsing)    │  │   (parsing)    │  │   (parsing)    │
└────────────────┘  └────────────────┘  └────────────────┘
```

**Преимущества:**
- Нет contention между воркерами
- Единственное gRPC соединение к OVMS
- Эффективное batching в Main процессе
- Параллельные generateBatch() с ожиданием перед flush

### Benchmark (Централизованный режим)

| Метрика | Значение | Примечание |
|---------|----------|------------|
| **Скорость генерации** | **260-326 emb/s** | e5-small, GPU-compiled, iGPU + CPU |
| Эмбеддингов | 1923 | ultrascript-tools-mcp проект |
| Время генерации | ~6-7 сек | 9 параллельных batches |
| FAISS flush | 136ms | 14781/s |
| Модель | multilingual-e5-small | 384 dims, 512 ctx |
| Устройство | Intel iGPU (GPU.0) + CPU | NPU не поддерживает BERT |

**NVIDIA GPU.1 Status (Blackwell):** ❌ НЕ РАБОТАЕТ
- OpenVINO NVIDIA plugin не поддерживает MediaPipe embeddings calculator
- Ошибка: `RET_CHECK failure (embeddings_calculator_ov.cc:272)`
- Протестировано с CPU-compiled и GPU-compiled моделями - оба варианта fail
- Старые архитектуры (Ada, Ampere, Turing) не тестировались

**Оптимизированные graph.pbtxt:**

**GPU (iGPU Intel):**
```protobuf
plugin_config: '{"NUM_STREAMS": "4", "AUTO_BATCH_TIMEOUT": "50"}'
target_device: "BATCH:GPU.0(16)"
```

**CPU:**
```protobuf
plugin_config: '{"NUM_STREAMS": "8", "INFERENCE_NUM_THREADS": "0"}'
target_device: "CPU"
```

**Тестированные конфигурации:**
| Ratio GPU:CPU | Скорость | Примечание |
|---------------|----------|------------|
| 6:2 | 94/s | Baseline |
| 5:3 | 105/s | +12% |
| **3:5** | **120/s** | ✅ Оптимально |
| 2:6 | 91/s | Слишком много CPU |
| GPU only | 72/s | iGPU перегружается |

**Сравнение моделей (optimized 3:5 ratio, GPU-compiled):**

| Модель | Dimensions | Скорость | Качество |
|--------|------------|----------|----------|
| **multilingual-e5-small** | 384 | **260-326 emb/s** | ✅ Рекомендуется для скорости |
| multilingual-e5-base | 768 | ~120 emb/s | Баланс качество/скорость |
| multilingual-e5-large | 1024 | ~60-80 emb/s | Максимальное качество |

**Сравнение режимов:**

| Режим | Скорость | Статус |
|-------|----------|--------|
| Distributed (workers → HTTP) | ~21 emb/s | ❌ Deprecated |
| Centralized baseline | 66-72 emb/s | Без оптимизации |
| Centralized optimized (3:5, e5-base) | 120 emb/s | GPU-compiled |
| **Centralized optimized (3:5, e5-small)** | **260-326 emb/s** | ✅ Default |
| Main process only | 400-700 emb/s | Для query-time |

### Конфигурация

Централизованный режим включается автоматически для локальных inference провайдеров:
```typescript
// worker-embedding-config.ts
centralizedEmbeddings: providerKind === "ovms" || providerKind === "llamacpp"
```

**Преимущества:**
- Оптимальный батчинг (контролируется Main процессом)
- Нет HTTP connection contention
- Лучшая GPU утилизация для llama.cpp

### Legacy: Distributed Mode (deprecated)

**Проблема:** Каждый воркер делает round-robin внутри себя:
```
Worker-0: request-1 → gpu, request-2 → gpu, ..., request-7 → cpu
Worker-1: request-1 → gpu, request-2 → gpu, ..., request-7 → cpu
```
6 воркеров конкурируют за 8 endpoints → contention, ~21 emb/s.

---

## openai (Cloud API)

**Файл:** `openai-provider.ts`

### Описание
OpenAI API для cloud embeddings. Также совместим с другими OpenAI-compatible API.

### Client Configuration
```typescript
baseUrl: "https://api.openai.com/v1"
model: "text-embedding-3-small"
batchSize: 100      // OpenAI поддерживает большие batches
concurrency: 5      // rate limiting
```

### Benchmark

| Metric | Value |
|--------|-------|
| **Speed** | TBD |
| **Cost** | TBD |
| **Model** | TBD |

### Особенности
- Cloud-based, не требует локальных ресурсов
- Rate limiting
- Стоимость за токены

---

## Worker Architecture

### Subprocess Model
```
Main Process
    │
    ├── Parser Agent
    │       │
    │       └── Language Pool (TypeScript, Python, etc.)
    │               │
    │               └── Worker Subprocess 1..N
    │                       │
    │                       └── WorkerEmbeddingClient
    │                               │
    │                               └── HTTP → Provider Server
    │
    └── Embedding Accumulator → FAISS Index
```

### Batching Strategy

1. **Worker-level batching**: Каждый воркер собирает entities в batches
2. **HTTP batching**: Один HTTP запрос = один batch текстов
3. **Concurrency**: Несколько batches параллельно от каждого воркера
4. **Server batching**: Continuous batching на сервере (vLLM, llamacpp)

### Performance Formula
```
Total Speed ≈ min(
  Workers × Concurrency × BatchSize / AvgLatency,
  Server Throughput Limit
)
```

---

## Configuration Files

### semantic-config.json
```json
{
  "provider": "ovms-native",
  "model": "multilingual-e5-base",
  "dimensions": 768,
  "contextTokens": 512
}
```

### embedding-models.json
Содержит полный каталог моделей и провайдеров с benchmark данными.

---

## Troubleshooting

### Low throughput
1. Проверьте batch size - слишком большой может увеличить latency
2. Проверьте concurrency - должен соответствовать server parallelism
3. Проверьте GPU utilization - `nvidia-smi`

### High VRAM usage
1. Уменьшите `--n-gpu-layers` для llamacpp
2. Используйте квантизованные модели (Q4, Q8)
3. Уменьшите `--ctx-size`

### Connection errors
1. Проверьте что сервер запущен
2. Проверьте порт
3. Увеличьте timeout
