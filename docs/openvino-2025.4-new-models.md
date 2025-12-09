# OpenVINO 2025.4 — Новые модели и возможности

**Дата релиза:** 1 декабря 2025  
**Версия:** 2025.4

---

## Обзор релиза

OpenVINO 2025.4 — это edge-first релиз с фокусом на:
- **Local RAG + Agents** — новые embedding и reranker модели
- **Mixture of Experts (MoE)** — preview поддержка Qwen3-30B-A3B
- **Agentic AI** — structured output, tool calling, парсеры
- **Безопасность** — encrypted blob для защиты моделей
- **Audio API** — text-to-speech и speech-to-text endpoints

---

## Новые модели

### CPU & GPU

| Модель | Тип | Размер | Назначение | Примечание |
|--------|-----|--------|------------|------------|
| **Qwen3-Embedding-0.6B** | Embedding | ~1.2GB | RAG, семантический поиск | Оптимизирован для XMX |
| **Qwen3-Reranker-0.6B** | Reranker | ~1.2GB | Переранжирование результатов | GenAI pipeline |
| **Mistral-Small-24B-Instruct-2501** | LLM | ~14GB INT4 | Генерация текста | Январь 2025 версия |
| **Qwen3-30B-A3B** | MoE LLM | ~18GB | Mixture of Experts | **Preview**, 30B/3B active |
| **BitNet** | LLM | Varies | 2-bit модели | Xeon + Client CPU |

### NPU (Intel Core Ultra)

| Модель | Тип | Контекст | Примечание |
|--------|-----|----------|------------|
| **Gemma-3-4B-it** | LLM | 8K | Новая поддержка |
| **Qwen2.5-VL-3B-Instruct** | VLM | 8K | Мультимодальная |

### Vision-Language Models (VLM)

| Модель | Тип | Особенности |
|--------|-----|-------------|
| **Phi-3-vision** | VLM | Microsoft |
| **Phi-3.5-vision** | VLM | Microsoft, улучшенная |
| **DeepSeek-VL2** | VLM | DeepSeek |
| **GLM4-V** | VLM | ChatGLM |
| **GOT-OCR 2.0** | OCR | Распознавание текста |
| **LLaVA-NeXT-Video** | Video VLM | Видео понимание |
| **nanoLLaVA** | VLM | Компактная |
| **MiniCPM-o-2.6** | VLM | OpenBMB |
| **Qwen2.5-VL-7B** | Video VLM | Video pipeline |
| **Qwen3-VL** | VLM | Новая версия |

### Computer Vision

| Модель | Тип | Примечание |
|--------|-----|------------|
| **YOLO v12** | Object Detection | Последняя версия |

---

## RAG Pipeline (новое в 2025.4)

### Embedding модели

```python
import openvino_genai as ov_genai

# Загрузка Qwen3-Embedding
embedding_pipe = ov_genai.EmbeddingPipeline("Qwen3-Embedding-0.6B-int4-ov")

# Получение embeddings
texts = ["def hello(): print('world')", "function greet() { console.log('hi') }"]
embeddings = embedding_pipe.embed(texts)

# Новые параметры в 2025.4
config = {
    "pad_to_max_length": True,
    "batch_size": 8,
    "pooling_type": "LAST_TOKEN"  # Новый тип pooling
}
```

### Reranker модели

```python
# Загрузка Qwen3-Reranker
rerank_pipe = ov_genai.TextRerankPipeline("Qwen3-Reranker-0.6B-int4-ov")

# Переранжирование результатов поиска
query = "How to sort array in Python"
documents = [
    "Use sorted() function",
    "Arrays in JavaScript",
    "Python list.sort() method"
]

scores = rerank_pipe.rerank(query, documents)
# Returns: [(0, 0.95), (2, 0.87), (1, 0.12)]
```

---

## Mixture of Experts (MoE) — Preview

### Qwen3-30B-A3B

- **30B параметров** total
- **3B активных** за inference
- Качество большой модели при скорости маленькой
- Оптимизирован для CPU и GPU (XMX)

```python
import openvino_genai as ov_genai

# MoE модель
pipe = ov_genai.LLMPipeline("Qwen3-30B-A3B-int4-ov", "GPU")

# Tool calling поддерживается
result = pipe.generate(
    prompt,
    tools=tools_definition,
    max_new_tokens=500
)
```

### Производительность MoE

| Платформа | Tokens/sec | Примечание |
|-----------|------------|------------|
| Intel Arc A770 | ~25-30 | XMX оптимизация |
| Intel Xeon 6 | ~10-15 | AMX FP16 |
| Intel Core Ultra | ~8-12 | CPU fallback |

---

## Agentic AI улучшения

### Structured Output

```python
from openvino_genai import LLMPipeline, StructuredOutputConfig

pipe = LLMPipeline("model", "CPU")

# XGrammar structural tags
config = StructuredOutputConfig(
    type="json_schema",
    schema={
        "type": "object",
        "properties": {
            "function": {"type": "string"},
            "docstring": {"type": "string"},
            "parameters": {"type": "array"}
        }
    }
)

result = pipe.generate(prompt, structured_output=config)
```

### Парсеры (новое в 2025.4)

```python
# Парсеры для разбора ответов на секции
result = pipe.generate(
    prompt,
    parsers=["thinking", "tool_call", "code"]
)

# Доступ к секциям
thinking = result.get_section("thinking")
tool_calls = result.get_section("tool_call")
code = result.get_section("code")
```

### ChatHistory API (новое)

```python
from openvino_genai import ChatHistory

# Управление историей диалога
history = ChatHistory()
history.add_user_message("Write a docstring for: def add(a, b): return a + b")
history.add_assistant_message("...")
history.add_tool_result(tool_id, result)

# Генерация с историей
response = pipe.generate(history, max_new_tokens=200)
```

---

## Audio API (OpenVINO Model Server)

### Text-to-Speech

```python
import requests

response = requests.post(
    "http://localhost:8000/audio/speech",
    json={
        "model": "tts-model",
        "input": "Hello, this is a test",
        "voice": "alloy"
    }
)

# Сохранение аудио
with open("output.mp3", "wb") as f:
    f.write(response.content)
```

### Speech-to-Text

```python
# Транскрипция
response = requests.post(
    "http://localhost:8000/audio/transcription",
    files={"file": open("audio.mp3", "rb")},
    data={"model": "whisper"}
)
print(response.json()["text"])

# Перевод на английский
response = requests.post(
    "http://localhost:8000/audio/translation",
    files={"file": open("audio_russian.mp3", "rb")},
    data={"model": "whisper"}
)
```

---

## Encrypted Blob (безопасность)

### Экспорт зашифрованной модели

```python
import openvino_genai as ov_genai

pipe = ov_genai.LLMPipeline("model", "CPU")

# Экспорт с шифрованием
pipe.export(
    "encrypted_model.blob",
    encryption_key="your-secret-key-here"
)
```

### Загрузка зашифрованной модели

```python
# Импорт требует ключ
pipe = ov_genai.LLMPipeline.from_blob(
    "encrypted_model.blob",
    "CPU",
    encryption_key="your-secret-key-here"
)
```

---

## Производительность

### GPU улучшения

| Функция | Описание | Выигрыш |
|---------|----------|---------|
| **Prefix caching** | Кэширование chat history | До 5x TTFT |
| **Dynamic INT8** | Per-group quantization | Лучшая точность |
| **Multi-token gen** | Оптимизированные kernels | ~20% throughput |
| **XAttention** | Block Sparse Attention (Xe2) | Быстрее TTFT |
| **4.2GB limit removed** | Большие allocations | Модели >4GB VRAM |

### NPU улучшения

| Функция | Описание | Примечание |
|---------|----------|------------|
| **Prefix caching** | `NPUW_LLM_ENABLE_PREFIX_CACHING:YES` | Длинные чаты |
| **Контекст до 10K** | Было 8K | `--max_prompt_length` |
| **Memory-mapped import** | Меньше RAM при загрузке | Автоматически |
| **Batch support** | Reshape к batch=1 | Совместимость драйверов |

### CPU улучшения

| Функция | Описание | Платформа |
|---------|----------|-----------|
| **Core Ultra Series 3** | Полная поддержка | Новые процессоры |
| **MoE optimization** | Qwen3-30B-A3B | Все CPU |
| **BitNet 2-bit** | Экстремальное сжатие | Xeon + Client |
| **FP16 AMX** | Улучшенная производительность | Xeon 6 |

---

## OpenVINO Model Server 2025.4

### GGUF напрямую из HuggingFace

```bash
# Установка переменной окружения
export OVMS_MODEL_REPOSITORY_PATH=/models

# Скачивание модели
ovms -pull -task text_generation OpenVINO/Qwen3-8B-int4

# Просмотр моделей
ovms -list_models

# Добавление в конфиг
ovms -add_to_models -model_name OpenVINO/Qwen3-8B-int4

# Запуск сервера
ovms --rest_port 8000
```

### Новые CLI параметры

| Параметр | Описание |
|----------|----------|
| `--api_key` | Авторизация клиентов |
| `--max_prompt_length` | Контекст для NPU (до 10K) |
| `--enable_prefix_caching` | Кэширование для всех устройств |
| `--cache_dir` | Кэш компиляции |
| `--plugin_config` | Конфиг для GenAI pipelines |

### Tool Parsers

Поддерживаемые модели для tool calling:
- Qwen3-Coder-30B
- Qwen3-30B-A3B-Instruct
- Phi-4-mini-instruct (streaming)
- Mistral-7B-v0.4 (streaming)

---

## Сравнение версий

| Функция | 2025.2 | 2025.3 | 2025.4 |
|---------|--------|--------|--------|
| Qwen3-Embedding | ❌ | ❌ | ✅ |
| Qwen3-Reranker | ❌ | ❌ | ✅ |
| MoE модели | ❌ | ❌ | ✅ preview |
| BitNet 2-bit | ❌ | ❌ | ✅ |
| Video VLM | ❌ | ❌ | ✅ |
| Audio API | ❌ | ❌ | ✅ |
| GGUF reader | ✅ preview | ✅ | ✅ improved |
| NPU контекст | 4K | 8K | **10K** |
| Encrypted blobs | ❌ | ❌ | ✅ |
| Core Ultra Series 3 | ❌ | ❌ | ✅ |
| Prefix caching GPU | ❌ | Basic | **Optimized** |
| Structured output | Basic | Improved | **XGrammar** |

---

## Jupyter Notebooks (новые)

- **AFM-4.5B** — chatbot
- **SmolLM2-135M-GGUF** — GGUF inference
- **Qwen2.5-0.5B-Instruct-GGUF** — компактные модели
- **Mistral-Small-24B-Instruct-2501** — chatbot
- **TextRerankPipeline** — RAG с LangChain
- **Gemma3 + OpenVINO GenAI** — новые модели
- **BitNet** — 2-bit inference
- **Qwen3-VL** — visual-language assistant

---

## Известные проблемы

| Компонент | Проблема | Workaround |
|-----------|----------|------------|
| OpenVINO Tokenizers | Mistral-7b-v0.2/v0.3 accuracy regression | Использовать IR из 2025.3 |
| GenAI Python | callback в Image pipelines может зависнуть | Не использовать callback |
| ONNX | SmoothQuant для некоторых моделей | Использовать PyTorch backend |

---

## Миграция с 2025.3

### Изменения API

```python
# Было (2025.3)
from openvino_genai import LLMPipeline
pipe.start_chat()
pipe.generate(prompt)
pipe.finish_chat()

# Стало (2025.4) — рекомендуется
from openvino_genai import LLMPipeline, ChatHistory
history = ChatHistory()
history.add_user_message(prompt)
pipe.generate(history)
```

### StreamerBase

```python
# Было (2025.3)
def streamer(token):
    print(token, end="")
    return False  # bool

# Стало (2025.4)
from openvino_genai import StreamingStatus

def streamer(token):
    print(token, end="")
    return StreamingStatus.RUNNING  # enum
```

---

## Полезные ссылки

- [Release Notes 2025.4](https://www.intel.com/content/www/us/en/developer/articles/release-notes/openvino/2025-4.html)
- [OpenVINO Documentation](https://docs.openvino.ai/2025/)
- [OpenVINO GenAI Samples](https://github.com/openvinotoolkit/openvino.genai/tree/releases/2025/4/samples)
- [OpenVINO Model Server Docs](https://docs.openvino.ai/2025/model-server/)
- [Jupyter Notebooks](https://openvinotoolkit.github.io/openvino_notebooks/)
- [HuggingFace OpenVINO Models](https://huggingface.co/OpenVINO)
