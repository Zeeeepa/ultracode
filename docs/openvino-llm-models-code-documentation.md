# LLM модели для OpenVINO: генерация документации кода

**Дата исследования:** Декабрь 2025
**Версия OpenVINO:** 2025.4
**Тестовое оборудование:** Intel Core Ultra 9 275HX + RTX 5060 Laptop + Intel AI Boost NPU

---

## Обзор

OpenVINO значительно расширил поддержку LLM моделей в 2024-2025 годах. Теперь доступны готовые INT4-квантизированные модели для генерации кода и документации, оптимизированные для CPU, GPU и NPU Intel.

**Ключевые возможности OpenVINO 2025.4:**
- Прямая поддержка GGUF файлов (без конвертации)
- NPU ускорение для моделей до 8B параметров
- Поддержка контекста до 10K токенов на NPU (было 8K)
- Dynamic LoRA для персонализации
- NF4-FP16 квантизация для Intel 200 серии CPU
- Structured output с XGrammar
- Tool calling + parsers для agentic AI
- Prefix caching для chat history

---

## Готовые модели для кода (HuggingFace/OpenVINO)

### Специализированные модели для кода

| Модель | Размер | Контекст | Параметры | Назначение | Лицензия |
|--------|--------|----------|-----------|------------|----------|
| **OpenVINO/starcoder2-7b-int4-ov** | ~4GB | 16K | 7B | Генерация кода, docstrings | BigCode OpenRAIL-M |
| **OpenVINO/codegen2-3_7B_P-int4-ov** | ~2GB | 2K | 3.7B | Code completion | Apache 2.0 |
| **OpenVINO/codegen25-7b-multi-int4-ov** | ~4GB | 2K | 7B | Мультиязычный код | Apache 2.0 |
| **AIFunOver/Qwen2.5-Coder-7B-Instruct-openvino-4bit** | ~4GB | 32K | 7B | **Лучший для документации** | Apache 2.0 |

### Универсальные модели с хорошей поддержкой кода

| Модель | Размер INT4 | Контекст | Параметры | Качество для кода |
|--------|-------------|----------|-----------|-------------------|
| **OpenVINO/Phi-3-mini-128k-instruct-int4-ov** | ~2GB | 128K | 3.8B | ⭐⭐⭐⭐⭐ Отличное |
| **OpenVINO/Phi-4-mini-instruct-int4-ov** | ~2.5GB | 16K | 3.8B | ⭐⭐⭐⭐⭐ Отличное |
| **OpenVINO/Qwen3-4B-int4-ov** | ~2.5GB | 32K | 4B | ⭐⭐⭐⭐ Хорошее |
| **OpenVINO/Qwen3-8B-int4-ov** | ~5GB | 32K | 8B | ⭐⭐⭐⭐⭐ Отличное |
| **OpenVINO/gemma-2-9b-it-int4-ov** | ~5GB | 8K | 9B | ⭐⭐⭐⭐ Хорошее |

### Компактные модели (для ограниченных ресурсов)

| Модель | Размер | Контекст | Скорость CPU | Применение |
|--------|--------|----------|--------------|------------|
| **Qwen2.5-0.5B-Instruct** (GGUF) | ~350MB | 32K | ~80-100 tok/s | Быстрые короткие генерации |
| **TinyLlama-1.1B** | ~700MB | 2K | ~40-50 tok/s | Простые docstrings |
| **SmolLM2-135M** (GGUF) | ~100MB | 2K | ~150+ tok/s | Минимальные задачи |
| **DeepSeek-R1-Distill-Qwen-1.5B** | ~1GB | 32K | ~30-40 tok/s | Reasoning + код |

---

## Поддержка устройств

### CPU (Intel Core / Xeon)

**Полная поддержка всех моделей.**

Оптимизации OpenVINO 2025.3:
- INT4/INT8 квантизация с группировкой
- AVX-512/AMX ускорение на новых Xeon
- PagedAttention для эффективного KV-cache
- SnapKV для сжатия кэша

### GPU (Intel Arc / Flex)

**Поддержка большинства моделей.**

Особенности:
- Flash Attention на Arc A-серии и выше
- Dynamic quantization для первого токена
- Sage Attention для длинных промптов
- До 70 tok/s на Arc A770 (Mistral 7B)

### NPU (Intel Core Ultra)

**Ограниченная поддержка (модели до 8B).**

Поддерживаемые модели (OpenVINO 2025.3):
- Qwen3-1.7B, Qwen3-4B, Qwen3-8B
- Phi-4-mini-reasoning
- Gemma-3-1B, Gemma-3-4B
- DeepSeek-R1-Distill-Qwen-1.5B, 7B, 14B (NF4-FP16)

Ограничения NPU:
- Только greedy decoding (без beam search)
- Контекст до 8K токенов (preview 12K на 32GB RAM)
- Требуется INT4 symmetrical quantization
- Драйвер 32.0.100.4181+

---

## Производительность (бенчмарки)

### CPU: Intel Core Ultra 9 275HX (Arrow Lake, 24 cores)

**Реальные результаты тестирования (декабрь 2025):**

| Модель | Tokens/sec | Время загрузки | RAM Usage | Примечание |
|--------|------------|----------------|-----------|------------|
| FluidInference/Qwen3-1.7B INT4 | **25.4** | 1.6s | ~2GB | ⭐ Быстрый для документации |
| DeepSeek-R1-1.5B NF4 | **22.3** | ~3s | ~2GB | Отлично для reasoning |
| Qwen3-4B INT4 | 12-15 | ~4s | ~4GB | Стандартный выбор |
| Qwen2.5-Coder-7B INT4 | 8-12 | ~6s | ~6GB | Лучшее качество для кода |

### NPU: Intel Core Ultra 9 275HX (AI Boost NPU, 13 TOPS)

**Реальные результаты тестирования:**

| Модель | Tokens/sec | Время загрузки | Статус |
|--------|------------|----------------|--------|
| OpenVINO/Qwen3-4B-int4-ov | **~2.9** | 11.7s | ✅ Работает |
| FluidInference/Qwen3-1.7B | — | Зависает | ❌ Несовместима |
| Phi-4-mini INT4 | — | Crash | ❌ Несовместима |
| DeepSeek-R1-1.5B | — | Crash | ❌ Несовместима |

**⚠️ Важно: NPU Arrow Lake (275HX) имеет другой vpux-compiler, чем Lunar Lake.**
Большинство моделей с "-npu" суффиксом НЕ работают на Arrow Lake. Только официальные OpenVINO/Qwen3-4B подтверждены.

### NPU: Intel Core Ultra 7 258V (Lunar Lake, NPU 4)

| Модель | Tokens/sec | Time to First Token | Power |
|--------|------------|---------------------|-------|
| Qwen3-4B INT4 | 20-25 | ~300ms | ~15W |
| Phi-4-mini INT4 | 25-30 | ~250ms | ~12W |
| Gemma-3-4B INT4 | 18-22 | ~350ms | ~15W |

### GPU: Intel Arc A770 16GB

| Модель | Tokens/sec | VRAM Usage |
|--------|------------|------------|
| Mistral-7B INT4 | 60-70 | ~8GB |
| Qwen2.5-Coder-7B INT4 | 50-60 | ~8GB |
| Llama-3.1-8B INT4 | 45-55 | ~10GB |

---

## Примеры использования

### 1. Базовое использование (Optimum Intel)

```python
from optimum.intel.openvino import OVModelForCausalLM
from transformers import AutoTokenizer

# Загрузка модели
model_id = "OpenVINO/Phi-4-mini-instruct-int4-ov"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = OVModelForCausalLM.from_pretrained(model_id)

# Генерация документации
code = '''def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)'''

prompt = f"""Generate a comprehensive docstring for this Python function:

```python
{code}
```

Docstring:"""

inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=200, do_sample=False)
result = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(result)
```

### 2. OpenVINO GenAI (рекомендуется)

```python
import openvino_genai as ov_genai

# Загрузка модели
model_path = "Phi-4-mini-instruct-int4-ov"
pipe = ov_genai.LLMPipeline(model_path, "CPU")

# Генерация
code = "def add(a, b): return a + b"
prompt = f"Write docstring for: {code}"

result = pipe.generate(prompt, max_new_tokens=100)
print(result)
```

### 3. Использование на NPU

```python
import openvino_genai as ov_genai

# Конфигурация для NPU
pipeline_config = {
    "MAX_PROMPT_LEN": 1024,
    "MIN_RESPONSE_LEN": 150,
    "NPUW_CACHE_DIR": ".npucache"
}

# Загрузка на NPU
pipe = ov_genai.LLMPipeline("Qwen3-4B-int4-ov", "NPU", pipeline_config)

# Генерация (только greedy)
result = pipe.generate(
    "Generate docstring for: def sort(arr): return sorted(arr)",
    max_new_tokens=100,
    do_sample=False  # Обязательно для NPU
)
```

### 4. Прямое использование GGUF (OpenVINO 2025.3+)

```python
import openvino_genai as ov_genai

# Напрямую из GGUF без конвертации!
pipe = ov_genai.LLMPipeline(
    "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    "CPU"
)

result = pipe.generate("Write docstring for: def hello(): print('hi')")
```

### 5. Streaming генерация

```python
import openvino_genai as ov_genai

pipe = ov_genai.LLMPipeline("Phi-4-mini-instruct-int4-ov", "CPU")

def streamer(token):
    print(token, end="", flush=True)
    return False  # Return True to stop

pipe.generate(
    "Generate documentation for: class User: pass",
    max_new_tokens=200,
    streamer=streamer
)
```

---

## Конвертация моделей

### Установка инструментов

```bash
pip install optimum-intel openvino-genai nncf
pip install huggingface_hub
```

### Конвертация в INT4

```bash
# Qwen2.5-Coder-3B (рекомендуется для документации)
optimum-cli export openvino \
  --model Qwen/Qwen2.5-Coder-3B-Instruct \
  --task text-generation-with-past \
  --weight-format int4 \
  --group-size 128 \
  --ratio 0.9 \
  ./qwen2.5-coder-3b-int4-ov

# Phi-4-mini с AWQ (лучшее качество)
optimum-cli export openvino \
  --model microsoft/Phi-4-mini-instruct \
  --task text-generation-with-past \
  --weight-format int4 \
  --quant-mode int4_awq \
  --dataset wikitext2 \
  --num-samples 128 \
  ./phi-4-mini-int4-awq-ov
```

### Конвертация для NPU

```bash
# Симметричная channel-wise квантизация (обязательно для NPU)
optimum-cli export openvino \
  --model Qwen/Qwen2.5-3B-Instruct \
  --task text-generation-with-past \
  --weight-format int4 \
  --sym \
  --ratio 1.0 \
  --group-size -1 \
  ./qwen2.5-3b-npu-int4-ov
```

---

## Сравнение моделей для генерации документации

### Качество генерации docstrings

| Модель | Python | JavaScript | TypeScript | Rust | Общее |
|--------|--------|------------|------------|------|-------|
| **Qwen2.5-Coder-7B** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **Лучший** |
| **Phi-4-mini** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Отличный |
| StarCoder2-7B | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Хороший |
| Qwen3-4B | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | Средний |
| CodeGen2-3.7B | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Базовый |

### Рекомендации по выбору

| Сценарий | Рекомендуемая модель | Почему |
|----------|---------------------|--------|
| **Продакшн, качество важнее скорости** | Qwen2.5-Coder-7B INT4 | Лучшее качество для кода |
| **Баланс скорость/качество** | Phi-4-mini INT4 | Быстрый, хорошее качество |
| **Ограниченная память (<4GB)** | Qwen2.5-Coder-3B INT4 | Компактный, достойное качество |
| **NPU на ноутбуке** | Qwen3-4B INT4 | Официальная оптимизация |
| **Максимальная скорость** | Qwen2.5-0.5B GGUF | 80+ tok/s, простые задачи |
| **Длинный контекст (>32K)** | Phi-3-mini-128k INT4 | 128K токенов |

---

## Известные проблемы и ограничения

### OpenVINO 2025.4

1. **Qwen3-8B + AWQ на GPU** — проблемы с точностью, использовать обычную INT4 квантизацию
2. **Phi-3/3.5 speculative decoding** — OOM на GPU с длинными последовательностями
3. **DeepSeek-R1-Distill** — сниженная точность в chat режиме на некоторых моделях
4. **NPU + Qwen2-VL-7B** — некорректные результаты на Xeon 4th/6th Gen

### NPU Arrow Lake (Core Ultra 200 серия)

⚠️ **Важно:** Arrow Lake NPU (vpux 40.xx) отличается от Lunar Lake (vpux 37.xx):

| Модель | Arrow Lake | Lunar Lake | Причина |
|--------|------------|------------|---------|
| OpenVINO/Qwen3-4B-int4-ov | ✅ 2.9 tok/s | ✅ 20-25 tok/s | Официальная |
| FluidInference/qwen3-1.7b-npu | ❌ Зависает | ✅ Работает | Другой vpux |
| Phi-4-mini-npu | ❌ Crash | ✅ Работает | Другой vpux |
| DeepSeek-R1-1.5B | ❌ Crash | ⚠️ Не тестировано | NF4 issues |

**Рекомендация для Arrow Lake:** Используйте только официальные `OpenVINO/*` модели на NPU. Для остальных — CPU.

### Общие ограничения

- GGUF модели могут иметь небольшое снижение качества vs нативные OV IR
- NPU не поддерживает beam search и sampling
- Модели >8B не помещаются на NPU
- Первый запуск требует компиляции (несколько минут)
- NF4 квантизация работает только на Intel 200 серии CPU

---

## Полезные ссылки

- [OpenVINO GenAI Docs](https://docs.openvino.ai/2025/learn-openvino/llm_inference_guide.html)
- [OpenVINO Models на HuggingFace](https://huggingface.co/OpenVINO)
- [Optimum Intel](https://huggingface.co/docs/optimum-intel)
- [OpenVINO Blog](https://blog.openvino.ai/)
- [Release Notes 2025.3](https://www.intel.com/content/www/us/en/developer/articles/release-notes/openvino/2025-3.html)

---

## Итоговые рекомендации

### Для генерации документации кода на CPU

1. **Лучший выбор:** `Qwen2.5-Coder-7B-Instruct` в INT4
   - Специализирован на коде
   - 32K контекст
   - ~10 tok/s на современном CPU

2. **Быстрая альтернатива:** `FluidInference/qwen3-1.7b-int4-ov-npu` (на CPU!)
   - **25.4 tok/s** на Core Ultra 9 275HX
   - Загрузка всего 1.6 секунды
   - Идеален для потоковой генерации

3. **Reasoning + код:** `DeepSeek-R1-Distill-Qwen-1.5B` в NF4
   - **22.3 tok/s** на Core Ultra 200 серии
   - NF4 квантизация для лучшего качества
   - Хорош для сложных задач анализа

4. **Минимальные ресурсы:** `Qwen2.5-0.5B` через GGUF
   - ~350MB
   - 80+ tok/s
   - Достаточно для простых docstrings

### Для NPU (Intel Core Ultra)

**Lunar Lake (258V и подобные):**
- `Qwen3-4B-int4-ov` — официально оптимизирован, 20-25 tok/s
- `Phi-4-mini-instruct-int4-ov` — 25-30 tok/s
- Используй symmetrical INT4 квантизацию

**Arrow Lake (275HX и подобные):**
- ⚠️ Только `OpenVINO/Qwen3-4B-int4-ov` подтверждена (~2.9 tok/s)
- Другие NPU-модели несовместимы (другой vpux-compiler)
- **Рекомендация:** Используйте CPU — он быстрее (25+ tok/s vs 2.9 tok/s)
