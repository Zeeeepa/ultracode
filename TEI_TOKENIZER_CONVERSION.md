# Конвертация Slow Tokenizer → Fast Tokenizer для TEI

## Проблема

TEI (Text Embeddings Inference) поддерживает **только fast tokenizers** (на базе Rust библиотеки `tokenizers`).

Ваша модель `ibm-granite/granite-embedding-30m-english` использует **slow tokenizer** (Python-based), поэтому TEI выдаёт ошибку:

```
tokenizer.json not found. text-embeddings-inference only supports fast tokenizers
```

## Решение: Конвертация токенайзера

### Способ 1: Автоматический скрипт (рекомендуется)

```bash
# 1. Установить зависимости
pip install transformers tokenizers torch

# 2. Конвертировать модель
python scripts/convert-tokenizer-to-fast.py ibm-granite/granite-embedding-30m-english ./converted-granite

# Скрипт автоматически:
# ✅ Загрузит модель из HuggingFace
# ✅ Конвертирует токенайзер в fast format
# ✅ Создаст tokenizer.json
# ✅ Сохранит модель в ./converted-granite/
```

### Способ 2: Ручная конвертация

```python
from transformers import AutoTokenizer, AutoModel

# Загрузить модель и токенайзер
model_id = "ibm-granite/granite-embedding-30m-english"
tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=False)
model = AutoModel.from_pretrained(model_id, trust_remote_code=True)

# Попытаться получить fast tokenizer
try:
    fast_tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True)
except:
    print("Fast tokenizer недоступен напрямую")
    # Требуется ручная конвертация (см. скрипт выше)

# Сохранить с fast tokenizer
output_dir = "./converted-granite"
fast_tokenizer.save_pretrained(output_dir)
model.save_pretrained(output_dir)

# Проверить что tokenizer.json создан
import os
assert os.path.exists(f"{output_dir}/tokenizer.json"), "tokenizer.json not created!"
```

## Использование конвертированной модели с TEI

### Запуск TEI с локальной моделью

```bash
# Остановить старый контейнер
docker stop tei-server && docker rm tei-server

# Запустить TEI с конвертированной моделью
docker run -d \
  --name tei-server \
  -p 8080:80 \
  -v "$(pwd)/converted-granite:/model" \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id /model
```

### Проверка работы

```bash
# Проверить логи
docker logs tei-server

# Ожидаемый вывод (успех):
# INFO text_embeddings_router: Args { model_id: "/model", ... }
# INFO download_artifacts: Model artifacts downloaded
# INFO text_embeddings_router: Starting server on port 80

# Тест embedding
curl -X POST http://localhost:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": "Hello, world!"}'

# Ожидаемый JSON с эмбеддингом:
# [[0.123, -0.456, 0.789, ...]]
```

## Альтернатива: Готовые fast-tokenizer модели

Если конвертация не работает, используйте модели с встроенным fast tokenizer:

### Рекомендованные модели для TEI:

1. **sentence-transformers/all-MiniLM-L6-v2** (384-dim, быстрая)
   ```bash
   docker run -d -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
     --model-id sentence-transformers/all-MiniLM-L6-v2
   ```

2. **BAAI/bge-small-en-v1.5** (384-dim, качественная)
   ```bash
   docker run -d -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
     --model-id BAAI/bge-small-en-v1.5
   ```

3. **BAAI/bge-base-en-v1.5** (768-dim, лучше качество)
   ```bash
   docker run -d -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
     --model-id BAAI/bge-base-en-v1.5
   ```

4. **intfloat/e5-base-v2** (768-dim, хорошая для retrieval)
   ```bash
   docker run -d -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
     --model-id intfloat/e5-base-v2
   ```

## Проверка совместимости модели

Перед конвертацией проверьте, есть ли у модели fast tokenizer:

```python
from transformers import AutoTokenizer

model_id = "ibm-granite/granite-embedding-30m-english"

# Попытаться загрузить fast tokenizer
try:
    tokenizer = AutoTokenizer.from_pretrained(model_id, use_fast=True)
    print(f"✅ Fast tokenizer доступен: {type(tokenizer).__name__}")
    print(f"   Backend: {tokenizer.is_fast}")
except Exception as e:
    print(f"❌ Fast tokenizer недоступен: {e}")
    print("   Требуется конвертация!")
```

## Troubleshooting

### Ошибка: "data did not match any variant of untagged enum ModelWrapper"

**Причина**: Модель использует custom architecture, несовместимую с TEI.

**Решение**: Используйте стандартную архитектуру (BERT, RoBERTa, etc.) или другую модель.

### Конвертация не создаёт tokenizer.json

**Причина**: Модель имеет сложный токенайзер, который нельзя конвертировать автоматически.

**Решение**:
1. Проверьте, есть ли у модели `tokenizer_config.json` с `tokenizer_class`
2. Попробуйте использовать другую модель той же семейства
3. Используйте модель с нативным fast tokenizer (см. рекомендации выше)

### TEI всё равно не запускается

**Проверьте структуру директории**:
```bash
ls -la converted-granite/

# Должны быть файлы:
# - config.json
# - tokenizer.json ← ОБЯЗАТЕЛЬНО
# - tokenizer_config.json
# - vocab.txt (или vocab.json)
# - pytorch_model.bin (или model.safetensors)
```

Если `tokenizer.json` отсутствует - конвертация не удалась.

## Производительность

| Модель | Размер | Dimension | Качество | Скорость |
|--------|--------|-----------|----------|----------|
| all-MiniLM-L6-v2 | 22MB | 384 | ⭐⭐⭐ | ⚡⚡⚡ |
| bge-small-en-v1.5 | 33MB | 384 | ⭐⭐⭐⭐ | ⚡⚡⚡ |
| bge-base-en-v1.5 | 109MB | 768 | ⭐⭐⭐⭐⭐ | ⚡⚡ |
| e5-base-v2 | 109MB | 768 | ⭐⭐⭐⭐⭐ | ⚡⚡ |
| granite-embedding-30m | 30MB | 384 | ⭐⭐⭐⭐ | ⚡⚡⚡ |

## Конфигурация для UltraScript Tools MCP

После успешного запуска TEI обновите `config/default.yaml`:

```yaml
embedding:
  provider: "tei"  # Text Embeddings Inference
  tei:
    baseUrl: "http://localhost:8080"
    timeout: 30000
    batchSize: 32
    maxRetries: 3
  # Или используйте готовую модель:
  # provider: "tei"
  # model: "BAAI/bge-small-en-v1.5"  # Автоматически загрузится в TEI
```

## Полезные ссылки

- **TEI GitHub**: https://github.com/huggingface/text-embeddings-inference
- **HuggingFace Tokenizers**: https://github.com/huggingface/tokenizers
- **Supported Models**: https://huggingface.co/models?library=sentence-transformers&sort=downloads
- **Fast Tokenizer Guide**: https://huggingface.co/docs/tokenizers/index

## Итого

**Рекомендация**:
1. ✅ **Попробуйте конвертацию** через `scripts/convert-tokenizer-to-fast.py`
2. ⚠️ Если не работает - используйте **BAAI/bge-small-en-v1.5** (проверенная модель с fast tokenizer)
3. 🚀 Для production - **bge-base-en-v1.5** (лучше качество, 768-dim)

**Быстрый старт**:
```bash
# Остановить текущий контейнер
docker stop tei-server && docker rm tei-server

# Запустить с рабочей моделью
docker run -d --name tei-server -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.2 \
  --model-id BAAI/bge-small-en-v1.5

# Проверить через 30 секунд
docker logs tei-server
curl http://localhost:8080/health
```

Готово! ✅
