# vLLM Performance Tuning Guide

## Overview

vLLM - высокопроизводительный inference сервер для embedding и LLM workloads. На NVIDIA GPU достигает **3.6x скорости llama.cpp** для embedding generation.

## Quick Start

```bash
# Установка через setup
npm run setup
# Выбрать: vLLM (Docker)
```

## Server Parameters (Docker)

Параметры задаются при создании контейнера в `vllm-installer.ts`:

```bash
docker run ... vllm/vllm-openai:latest-cu130 "model-name" \
  --max-model-len 512 \
  --dtype auto \
  --gpu-memory-utilization 0.8 \
  --max-num-batched-tokens 16384 \
  --max-num-seqs 256 \
  --disable-log-requests
```

| Параметр | Значение | Описание |
|----------|----------|----------|
| `--max-model-len` | 512 (dynamic) | Макс. длина контекста (динамически из модели, напр. 8192 для BGE-M3) |
| `--dtype` | auto | Автовыбор типа данных для GPU |
| `--gpu-memory-utilization` | 0.8 | 80% GPU памяти |
| `--max-num-batched-tokens` | 16384 | Токенов в batch (высокое для encoder) |
| `--max-num-seqs` | 256 | Concurrent sequences для batching |
| `--disable-log-requests` | - | Отключает логирование каждого запроса (снижает overhead, vLLM 0.14+) |

## Client Parameters (semantic-config.json)

```json
{
  "embedding": {
    "platform": "vllm",
    "vllm": {
      "endpoint": "http://127.0.0.1:8000",
      "max_batch_size": 200,
      "encoding_format": "base64",
      "concurrency": 12,
      "selected_model": "intfloat/multilingual-e5-small",
      "models": [
        {
          "id": "intfloat/multilingual-e5-small",
          "vector_size": 384
        }
      ]
    }
  }
}
```

| Параметр | Значение | Описание |
|----------|----------|----------|
| `max_batch_size` | 200 | Текстов в HTTP запросе |
| `encoding_format` | `"base64"` | Формат ответа: base64 (~33% меньше трафика) или float |
| `concurrency` | 12 | Параллельных HTTP запросов |

## Benchmark Results (RTX 5090, multilingual-e5-small)

### Client Tuning

| Конфигурация | Скорость | Δ |
|--------------|----------|---|
| batch=64, conc=8 (baseline) | 1267/s | - |
| batch=256, conc=12 | 1256/s | ~0% |

*Клиентские параметры без серверной оптимизации не дают эффекта*

### Server Tuning

| Конфигурация | Скорость | Δ |
|--------------|----------|---|
| Default vLLM | ~1260/s | baseline |
| + max-num-batched-tokens=16384 | **1352/s** | **+7%** |
| + max-num-seqs=256 | (included above) | |

### vLLM vs Other Providers (RTX 5090, e5-small)

| Provider | Скорость | Отношение |
|----------|----------|-----------|
| llama.cpp (optimized) | 441/s | 1x |
| OVMS Native (CPU/iGPU) | 260-326/s | 0.7x |
| **TEI (120-latest)** | **1169/s** | **2.7x** |
| **vLLM (optimized)** | **1352/s** | **3.1x** |

## Optimization Tips

### 1. Увеличить max-num-batched-tokens

Для encoder моделей (embeddings) можно ставить значительно выше default (~2048):

```
--max-num-batched-tokens 16384  # или даже 32768
```

Чем выше - тем больше запросов scheduler собирает в один batch.

### 2. Увеличить max-num-seqs

Больше concurrent sequences = лучше GPU utilization:

```
--max-num-seqs 256  # default ~64
```

### 3. GPU Memory Utilization

Для dedicated embedding server можно поднять до 0.9:

```
--gpu-memory-utilization 0.9
```

### 4. encoding_format: "base64" (vLLM 0.14+)

Запрос с `encoding_format: "base64"` возвращает embeddings в base64 вместо JSON float массива:

- ~33% меньше данных по сети
- Быстрее десериализация (один `atob()` vs парсинг тысяч чисел)
- Автоматический fallback: если сервер вернёт JSON floats, клиент обработает их корректно

```json
{
  "encoding_format": "base64"
}
```

### 5. Client Batching

Согласовать `max_batch_size` и `concurrency` с серверными параметрами:

- `max_batch_size` ≤ `max-num-seqs`
- `concurrency` × `max_batch_size` ≈ `max-num-batched-tokens` / avg_text_length

### 6. Model Selection

| Модель | Размерность | Скорость | Качество |
|--------|-------------|----------|----------|
| e5-small | 384 | Fastest | Good |
| e5-base | 768 | Medium | Better |
| e5-large | 1024 | Slower | Best |

Для code search `e5-small` (384 dim) обычно достаточно.

## Troubleshooting

### Low Throughput

1. Проверь `nvidia-smi` - GPU должен быть загружен 90%+
2. Увеличь `--max-num-batched-tokens`
3. Увеличь `--max-num-seqs`

### Out of Memory

1. Уменьши `--gpu-memory-utilization` до 0.7
2. Уменьши `--max-num-seqs`
3. Используй меньшую модель (e5-small vs e5-base)

### Container Won't Start

```bash
# Проверить логи
docker logs vllm-server

# Пересоздать контейнер
docker stop vllm-server && docker rm vllm-server
npm run setup  # выбрать vLLM
```

## When to Use vLLM

**Используй vLLM когда:**
- NVIDIA GPU (CUDA)
- Docker доступен
- Нужна максимальная производительность
- Production workload

**Используй llama.cpp когда:**
- Нет Docker
- AMD/Intel GPU (Vulkan)
- Простота важнее скорости
- Ограниченные ресурсы
