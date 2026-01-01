# Embedding Model Benchmark Results (2025-12-12)

## Сводная таблица (все модели)

| Модель | Provider | Chunks/s | Quality Gap | Контекст | Языки | Рекомендация |
|--------|----------|----------|-------------|----------|-------|--------------|
| **multilingual-e5-base** | OpenVINO | **583** | **0.608** | 512 | MULTI (94) | 🏆🌍 ЛУЧШИЙ ВЫБОР |
| distiluse-base-multilingual | OpenVINO | 534 | **0.608** | 512 | MULTI (15) | ⚡ Быстрый MULTI |
| all-MiniLM-L6-v2 INT8 | OpenVINO | 510 | 0.601 | 256 | EN | 🥇 Best EN-only |
| BGE-M3 | TEI | 342 | 0.307 | 8192 | MULTI (100+) | 📄 8K контекст |
| bge-small-en-v1.5 INT8 | OpenVINO | 92 | - | 512 | EN | Баланс |
| paraphrase-multilingual | OpenVINO | 89 | 0.558 | 512 | MULTI (50+) | 🌍 Альтернатива |
| gte-small INT8 | OpenVINO | 89 | - | 512 | EN | Баланс |
| granite-embedding:30m | Ollama | 71 | 0.312 | 512 | EN | ⚡ Fast Ollama |
| all-minilm | Ollama | 55 | 0.601 | 512 | EN | Ollama fallback |
| snowflake-arctic-embed2 | Ollama | 4 | 0.426 | 8192 | MULTI | ⚠️ Слишком медленный |

**Языки**: EN = только английский, MULTI = мультиязычный (RU/CN/JP/etc комментарии в коде)

> ⚠️ **multilingual-e5-small** показал плохое качество (gap 0.09) — НЕ рекомендуется. Используйте **e5-base**.

> **Quality Gap** — разница между similarity для похожего и разного кода. Выше = лучше различает.

## Test Environment
- **Hardware**: RTX 5060 (Blackwell), Intel CPU
- **OS**: Windows
- **TEI Image**: hotchpotch/tei-blackwell-testing:latest (Blackwell GPU support)
- **Test dataset**: 100 entities from ultrascript-tools-mcp

## Performance Results

### OpenVINO (CPU)

| Model | Chunks/s | ms/chunk | Context | Dims | Языки | Quality Gap |
|-------|----------|----------|---------|------|-------|-------------|
| **multilingual-e5-base** | **583** | 1.7 | 512 | 384 | MULTI (94) | **0.608** |
| distiluse-base-multilingual | 534 | 1.9 | 512 | 384 | MULTI (15) | **0.608** |
| **all-MiniLM-L6-v2 INT8** | 510 | 2.0 | 256 | 384 | EN | 0.601 |
| bge-small-en-v1.5 INT8 | 92 | 10.9 | 512 | 384 | EN | - |
| paraphrase-multilingual | 89 | 11.2 | 512 | 384 | MULTI (50+) | 0.558 |
| gte-small INT8 | 89 | 11.2 | 512 | 384 | EN | - |
| ~~multilingual-e5-small~~ | 90 | 11.1 | 512 | 384 | MULTI (94) | ⚠️ 0.09 |

> ⚠️ **multilingual-e5-small** имеет очень низкий quality gap (0.09) — плохо различает похожий/разный код. НЕ ИСПОЛЬЗОВАТЬ.

### TEI (GPU Docker) - BGE-M3 Batch Size Testing

| Batch Size | Items/s | Notes |
|------------|---------|-------|
| 1 | 11 | No batching |
| 8 | 77 | Small batch |
| 32 | 213 | Good |
| 64 | 288 | Better |
| **128** | **342** | **Optimal** |
| 256 | 340 | Plateau |
| 512 | 338 | Diminishing returns |

### Ollama (GPU/CPU)

| Model | Chunks/s | Tokens/s | Quality Gap | Языки | Status |
|-------|----------|----------|-------------|-------|--------|
| **all-minilm** | 55 | 17,231 | **0.601** | EN | **BEST QUALITY** |
| granite-embedding:30m | 71 | 22,395 | 0.312 | EN | Fast |
| snowflake-arctic-embed2 | 4 | 2,179 | 0.426 | MULTI | Slow (8K context) |
| nomic-embed-text | N/A | N/A | 0.207 | EN | Poor quality |
| granite-embedding:278m | - | - | - | EN | BROKEN (no embeddings) |

## Quality Testing Results

Quality measured by "discrimination gap" - difference between similar (positive) and different (negative) code similarity scores.
Higher gap = better discrimination between similar and different code.

| Model | Avg Positive | Avg Negative | **Gap** | Dims | Языки |
|-------|--------------|--------------|---------|------|-------|
| **all-minilm (Ollama)** | 0.771 | 0.170 | **0.601** | 384 | EN |
| **all-MiniLM-L6-v2 (OpenVINO)** | 0.771 | 0.170 | **0.601** | 384 | EN |
| snowflake-arctic-embed2 | 0.692 | 0.266 | 0.426 | 1024 | MULTI |
| granite-embedding:30m | 0.557 | 0.245 | 0.312 | 384 | EN |
| BGE-M3 (TEI) | 0.595 | 0.288 | 0.307 | 1024 | MULTI (100+) |
| nomic-embed-text | 0.516 | 0.309 | 0.207 | 768 | EN |

## Optimal Batch Sizes

| Provider | Model | Optimal Batch |
|----------|-------|---------------|
| OpenVINO | all-MiniLM-L6-v2 | 32 |
| OpenVINO | Other models | 16 |
| TEI | BGE-M3 | 128 |
| TEI | BGE-small-en | 64 |
| Ollama | all-minilm | 1 (no batch) |
| Ollama | granite-embedding | 1 (no batch) |

## Recommendations

### Development (Fast Indexing)
**OpenVINO all-MiniLM-L6-v2 INT8**
- Speed: 510 chunks/s (FASTEST)
- Quality: 0.601 gap (BEST)
- No GPU required
- 2.0ms/chunk latency

### Production (Quality + Speed Balance)
**TEI with BGE-M3** (batch 128)
- Speed: 342 chunks/s
- 8K context window
- 100+ languages support
- Requires Docker + GPU

### Best Quality (No Speed Priority)
**Ollama all-minilm** or **OpenVINO all-MiniLM-L6-v2**
- Gap: 0.601 (best discrimination)
- all-minilm via Ollama supports all GPUs including RTX 50xx

### Multilingual
**OpenVINO multilingual-e5-small INT8** (CPU) or **TEI BGE-M3** (GPU)
- E5: 94 languages, 74 chunks/s
- BGE-M3: 100+ languages, 342 chunks/s, 8K context

## Models NOT Recommended

| Model | Reason |
|-------|--------|
| granite-embedding:278m | BROKEN - doesn't return embeddings |
| nomic-embed-text | Poor quality (gap 0.207) |
| snowflake-arctic-embed2 | Too slow (4 chunks/s) for most use cases |

## Test Code Used

Quality test: `benchmarks/quality-test.ts`
Performance test: `benchmarks/embedding-benchmark.ts`
TEI batch test: `benchmarks/tei-batch-test.ts`
