# Embedding Providers - Implementation Details

Документация по провайдерам генерации embeddings в UltraScript Tools.

## Quick Reference

| Provider | Endpoint | Batch | GPU | Docker | Speed | Use Case |
|----------|----------|-------|-----|--------|-------|----------|
| **llamacpp** | `/v1/embeddings` | Yes | CUDA/Vulkan/CPU | No | **371/s** | Native GGUF, low VRAM |
| **vllm** | `/v1/embeddings` | Yes | CUDA | Yes | Max throughput |
| **tei** | `/embed` | Yes | CUDA/CPU | Yes | HuggingFace models |
| **ollama** | `/api/embeddings` | No | CUDA/CPU | No | Simple setup |
| **ovms** | `/v3/embeddings` | Yes | CPU/iGPU | Yes/No | **66-72/s** | Intel optimized, centralized |
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
| **Speed** | **371 emb/s** |
| **VRAM Dedicated** | 0.4 GB |
| **VRAM Shared** | 1.1 GB |
| **Total GPU Memory** | 1.5 GB |
| **Model** | multilingual-e5-base Q8 (450MB) |
| **GPU** | RTX 5060 Laptop |
| **CPU Threads** | 24 |
| **Config** | ctx=2048, parallel=4, batch=1024, ubatch=512, batchSize=256 |

### Особенности
- **Низкое потребление VRAM** - подходит когда GPU занят LLM
- GGUF dequantization добавляет overhead
- **vs vLLM**: ~30% throughput (371/s vs ~1200/s)

---

## vllm (GPU Docker)

**Файл:** `vllm-provider.ts`

### Описание
vLLM - высокопроизводительный inference server с continuous batching и paged attention. Максимальный throughput на NVIDIA GPU.

### Server Configuration
```bash
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model intfloat/multilingual-e5-base \
  --task embed \
  --dtype auto \
  --max-model-len 512
```

### Client Configuration
```typescript
batchSize: 64       // texts per request
concurrency: 8      // high parallelism for continuous batching
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
docker run --gpus all -p 8081:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.8.3 \
  --model-id intfloat/multilingual-e5-small \
  --max-batch-tokens 32768 \
  --max-client-batch-size 1024
```

### Client Configuration
```typescript
batchSize: 50       // optimized for TEI
concurrency: 16     // high concurrency
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
- Нативная поддержка HuggingFace моделей
- Endpoint `/embed` (не OpenAI-compatible)
- Поддержка reranking (`/rerank`)
- RTX 50xx: использовать `hotchpotch/tei-blackwell-testing`

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
        "embeddings-gpu", "embeddings-gpu", "embeddings-gpu",
        "embeddings-cpu", "embeddings-cpu"
      ],
      "models": [{ "id": "multilingual-e5-base", "vector_size": 768 }],
      "useEmbeddingsApi": true,
      "encodingFormat": "base64"
    }
  }
}
```

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
| **Скорость генерации** | **66-72 emb/s** | CPU + iGPU (NPU недоступен) |
| Эмбеддингов | 2017 | ultrascript-tools-mcp проект |
| Время генерации | ~30 сек | 13 параллельных batches |
| FAISS flush | 575ms | 3506/s |
| Модель | multilingual-e5-base | 768 dims, 512 ctx |
| Устройство | Intel iGPU + CPU | NPU не поддерживает BERT |

**Сравнение моделей:**

| Модель | Dimensions | Скорость | Качество |
|--------|------------|----------|----------|
| multilingual-e5-small | 384 | ~80-90 emb/s | Базовое |
| **multilingual-e5-base** | 768 | **66-72 emb/s** | ✅ Рекомендуется |
| multilingual-e5-large | 1024 | ~40-50 emb/s | Максимальное |

**Сравнение режимов:**

| Режим | Скорость | Статус |
|-------|----------|--------|
| Distributed (workers → HTTP) | ~21 emb/s | ❌ Deprecated |
| **Centralized (Main → REST)** | **66-72 emb/s** | ✅ Default |
| Main process only | 400-700 emb/s | Для query-time |

### Конфигурация

Централизованный режим включается автоматически для OVMS:
```typescript
// worker-embedding-config.ts
centralizedEmbeddings: providerKind === "ovms"
```

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
