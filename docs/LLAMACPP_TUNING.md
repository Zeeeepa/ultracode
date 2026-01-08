# llama.cpp Performance Tuning Guide

## Overview

llama.cpp - нативный сервер для GGUF моделей без Docker. При правильной настройке достигает **50-67% от vLLM** для embedding workloads (400-800/s vs 1200/s).

## Key Optimizations

### 1. Thread Count (`-t`)

**КРИТИЧНО:** Используйте P-cores (физические ядра), НЕ все логические!

```
❌ ПЛОХО:  -t 24  (все логические на i9-12900K)
✅ ХОРОШО: -t 8   (только P-cores на i9-12900K)
```

**Почему:**
- E-cores (efficiency) медленнее P-cores в 2-3x
- Hyperthreading добавляет contention, а не производительность
- llama.cpp оптимизирован для физических ядер

**Автоопределение:**
UltraScript автоматически определяет P-cores через:
- Windows: `wmic cpu get NumberOfCores`
- macOS: `sysctl -n hw.physicalcpu`
- Linux: `/proc/cpuinfo`

### 2. GPU Layers (`--n-gpu-layers`)

```bash
# Все слои на GPU (рекомендуется)
--n-gpu-layers -1

# Постепенное увеличение при ограниченной VRAM
--n-gpu-layers 20  # Начните с 20
--n-gpu-layers 30  # Увеличивайте пока хватает VRAM
```

### 3. Batch Parameters

```bash
# Embedding workload (рекомендуется)
--batch-size 4096     # Prompt processing batch
--ubatch-size 2048    # Micro-batch размер

# Увеличение ubatch на 25% может дать ~25% speedup
```

### 4. Flash Attention (`--flash-attn`)

```bash
# ВСЕГДА включайте для embedding
--flash-attn
```

Ускоряет KV cache operations, критично для batch inference.

### 5. Parallel Slots (`--parallel`)

```bash
# Concurrent request processing
--parallel 4  # 4 параллельных запроса
```

Позволяет обрабатывать несколько batch requests одновременно.

### 6. Memory Locking (`--mlock`)

```bash
# Блокировка модели в RAM
--mlock
```

Предотвращает swapping, стабильная латентность.

## КРИТИЧНО: Continuous Batching

**НЕ используйте `--no-cont-batching`!**

Continuous batching - ключевая оптимизация для throughput. Отключение драматически снижает производительность.

```bash
❌ --no-cont-batching  # НИКОГДА не используйте
✅ (по умолчанию включен)
```

## Recommended Server Command

```bash
llama-server \
  --model /path/to/model.gguf \
  --embedding \
  --port 8085 \
  --n-gpu-layers -1 \
  --batch-size 4096 \
  --ubatch-size 2048 \
  --flash-attn \
  --parallel 4 \
  --mlock \
  --threads 8  # Замените на ваше число P-cores
```

## UltraScript Auto-Configuration

UltraScript автоматически применяет эти оптимизации в `llamacpp-server-manager.ts`:

| Параметр | Значение по умолчанию |
|----------|----------------------|
| `--flash-attn` | Включен |
| `--parallel` | 4 |
| `--batch-size` | 3072 |
| `--ubatch-size` | 1536 |
| `--mlock` | Включен |
| `--threads` | Auto (P-cores) |
| `--n-gpu-layers` | 99 (почти все на GPU) |

## Configurable Parameters (semantic-config.json)

Все параметры можно настроить через `~/.ultrascript/semantic-config.json`:

```json
{
  "enabled": true,
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

### Параметры сервера

| Параметр | CLI эквивалент | Описание | По умолчанию |
|----------|----------------|----------|--------------|
| `context_size` | `--ctx-size` | Общий контекст (делится на parallel_slots) | 2048 |
| `parallel_slots` | `--parallel` | Слоты для параллельных запросов | 4 |
| `ubatch_size` | `--ubatch-size` | Микро-batch для обработки | 1536 |
| `batch_size` | `--batch-size` | Batch для prompt processing | 3072 |
| `n_gpu_layers` | `--n-gpu-layers` | Слои на GPU (-1 = все) | 99 |

### Параметры клиента

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `max_batch_size` | Максимум текстов в HTTP запросе | 256 |
| `concurrency` | Параллельные HTTP запросы (должен = parallel_slots) | 4 |
| `auto_start` | Авто-запуск llama-server | true |

**ВАЖНО**: `context_size` делится на `parallel_slots`! Например:
- `context_size=2048`, `parallel_slots=4` → 512 токенов на слот
- `context_size=4096`, `parallel_slots=8` → 512 токенов на слот

## Benchmarking Guide

### Test Configurations

**Базовая конфигурация (371/s):**
```json
{
  "parallel_slots": 4,
  "context_size": 2048,
  "ubatch_size": 512,
  "concurrency": 4
}
```

**Test 1: parallel=8 (vs 4):**
```json
{
  "parallel_slots": 8,
  "context_size": 4096,
  "ubatch_size": 512,
  "concurrency": 8
}
```

**Test 2: ubatch=1024:**
```json
{
  "parallel_slots": 4,
  "context_size": 2048,
  "ubatch_size": 1024,
  "concurrency": 4
}
```

**Test 3: ubatch=1536:**
```json
{
  "parallel_slots": 4,
  "context_size": 2048,
  "ubatch_size": 1536,
  "concurrency": 4
}
```

### Running Benchmarks

```bash
# 1. Остановить текущий llama-server
taskkill /F /IM llama-server.exe

# 2. Обновить semantic-config.json с нужными параметрами

# 3. Запустить индексацию
npx ultrascript-tools-mcp D:\github\ultrascript-tools-mcp

# 4. Смотреть логи для emb_summary
grep "emb_summary" ~/.ultrascript/logs/ultrascript-*.log
```

### Benchmark Results (RTX 5090, multilingual-e5-base)

| Конфигурация | Скорость | Δ от baseline |
|--------------|----------|---------------|
| parallel=4, ubatch=512 | 336/s | baseline |
| parallel=8, ubatch=512 | 340/s | +1% |
| parallel=4, ubatch=1024 | 370/s | +10% |
| **parallel=4, ubatch=1536** | **373/s** | **+11%** |

**Выводы:**
- Увеличение `parallel` с 4 до 8 не даёт улучшения
- Увеличение `ubatch` даёт ~10% прирост
- Оптимальные значения: `ubatch=1536`, `batch=3072`
- Потолок llama.cpp для этой модели: ~370-380/s

## Performance Comparison (RTX 5090)

| Provider | Конфигурация | Скорость | Отношение |
|----------|--------------|----------|-----------|
| llama.cpp | default (ubatch=512) | 336/s | 1x |
| llama.cpp | **optimized (ubatch=1536)** | **373/s** | 1.1x |
| vLLM | default | 1267/s | 3.4x |
| vLLM | **optimized** | **1352/s** | **3.6x** |

**Вывод:** vLLM в **3.6x быстрее** llama.cpp для embedding workloads.

См. также: [VLLM_TUNING.md](./VLLM_TUNING.md) для настройки vLLM.

## Bottlenecks

llama.cpp inherently медленнее vLLM из-за:

1. **GGUF Dequantization** - распаковка квантизованных весов на лету
2. **Single-threaded prompt processing** - ограничение архитектуры
3. **No paged attention** - меньше оптимизаций для batch
4. **CPU-centric design** - оригинально для CPU inference

**Вывод:** Используйте llama.cpp когда:
- Нет Docker
- AMD/Intel GPU (через Vulkan)
- Ограниченные ресурсы
- Простота развёртывания важнее скорости

Для максимальной производительности используйте **vLLM** на NVIDIA GPU.

## Troubleshooting

### Низкая производительность
1. Проверьте число потоков (`-t`) - должно быть = P-cores
2. Убедитесь что `--flash-attn` включен
3. Увеличьте `--ubatch-size` до 2048

### Out of Memory
1. Уменьшите `--n-gpu-layers`
2. Уменьшите `--batch-size`
3. Используйте меньшую квантизацию (Q4 вместо Q8)

### Нестабильная латентность
1. Добавьте `--mlock`
2. Закройте другие GPU-приложения
3. Проверьте thermal throttling
