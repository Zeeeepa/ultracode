# Модуль semantic

## Описание

Модуль `semantic` предоставляет набор инструментов для работы с семантическим анализом текста, включая генерацию векторных представлений (embeddings), поиск по векторным хранилищам, разбиение текста на части и расширение сущностей. Используется для реализации семантических поисковых и аналитических функций в проекте.

## Архитектура

```
┌────────────────────────────────────────────────────────────────┐
│                    semantic module                              │
├────────────────────────────────────────────────────────────────┤
│  embedding-generator.ts ◄── providers/ ◄── TEI/OVMS/Ollama     │
│         │                                                       │
│         ▼                                                       │
│  vector-store.ts ────────► faiss/ (hot index, in-memory)       │
│         │                      │                                │
│         ▼                      ▼                                │
│  hybrid-search.ts         gpu/ (CUDA + Faiss via subprocess)   │
│         │                                                       │
│         ▼                                                       │
│  libsql-adapter.ts ────► LibSQL DiskANN (cold storage)         │
└────────────────────────────────────────────────────────────────┘
```

## Файлы

| Файл | Описание |
|------|----------|
| `code-analyzer.ts` | Анализирует исходный код для извлечения семантической информации и структуры |
| `embedding-dump.ts` | Экспорт и дамп эмбеддингов для отладки и анализа |
| `embedding-generator.ts` | Генерирует векторные эмбеддинги для текстов через провайдеры (TEI, OVMS, Ollama) |
| `entity-expander.ts` | Расширяет сущности из текста, добавляя дополнительную семантическую информацию |
| `global-embedding-cache.ts` | Глобальный кэш эмбеддингов для предотвращения повторных вычислений |
| `hybrid-search.ts` | Реализует гибридный поиск, сочетающий текстовый и векторный поиск |
| `libsql-adapter.ts` | Адаптер для работы с базой данных LibSQL и DiskANN индексом |
| `ovms-native-manager.ts` | Управление OVMS (OpenVINO Model Server) для генерации эмбеддингов |
| `semantic-cache.ts` | Кэширует результаты семантических операций для ускорения повторных запросов |
| `smart-chunker.ts` | Разбивает текст на семантически значимые части с учетом структуры и контекста |
| `vector-store.ts` | Предоставляет интерфейс для хранения и поиска векторных представлений |

## Подмодули

### providers/ — Провайдеры эмбеддингов

Провайдеры для генерации векторных представлений через различные бэкенды:

| Провайдер | Описание | Приоритет |
|-----------|----------|-----------|
| `tei-provider.ts` | TEI (Text Embedding Inference) Docker | Высокий |
| `ovms-provider.ts` | OVMS gRPC (OpenVINO Model Server) | Очень высокий |
| `ollama-provider.ts` | Ollama локально (все GPU включая RTX 50xx) | Средний |
| `openai-provider.ts` | OpenAI API (удаленно) | Низкий |
| `huggingface-provider.ts` | Hugging Face API | Низкий |

### faiss/ — Faiss векторный индекс

Высокопроизводительный векторный индекс через faiss-node (Node.js subprocess):

| Файл | Описание |
|------|----------|
| `types.ts` | IPC протокол для Faiss операций |
| `faiss-worker.ts` | Node.js процесс с faiss-node |
| `faiss-client.ts` | Runtime-aware клиент (Direct для Node.js, Subprocess для Bun) |
| `faiss-provider.ts` | Интеграция с semantic pipeline (hot/cold гибрид) |

**Типы индексов:**
- **Flat** — точный поиск, O(n) сложность
- **HNSW** — граф для быстрого ANN, рекомендуется для <1M векторов
- **IVF** — кластеризация для больших датасетов (>1M)
- **IVFPQ** — сжатие для экономии памяти

### gpu/ — Unified GPU Worker

Объединенный GPU worker для CUDA и Faiss операций (работает под Bun через Node.js subprocess):

| Файл | Описание |
|------|----------|
| `types.ts` | Unified IPC протокол (Faiss + CUDA) |
| `gpu-worker.ts` | Node.js процесс с faiss-node + CUDA addon |
| `gpu-client.ts` | Runtime-aware клиент (GpuDirectClient / GpuSubprocessClient) |
| `index.ts` | Модульный entry point |

**CUDA операции:**
- `cuda.cosine` — косинусное сходство
- `cuda.batchCosine` — batch косинусное сходство
- `cuda.euclidean` — евклидово расстояние
- `cuda.normalize` — нормализация векторов

## Hot/Cold Architecture

```
Новые эмбеддинги ──► Faiss (hot, in-memory, HNSW)
                         │
                         │ периодический flush
                         ▼
Старые эмбеддинги ──► LibSQL DiskANN (cold, persistent)

Поиск = Faiss results + DiskANN results → merge по score
```

**Преимущества:**
- Мгновенное индексирование новых файлов (Faiss in-memory)
- Персистентное хранение (LibSQL на диске)
- Быстрый поиск (Faiss для свежих, DiskANN для архива)
- Graceful restart (reload из LibSQL → rebuild Faiss)

## Экспорты

Внутренний модуль. Нет публичных экспортов.

## Пример использования

```typescript
// Генерация эмбеддингов
import { EmbeddingGenerator } from './semantic/embedding-generator';

const generator = new EmbeddingGenerator();
const embedding = await generator.generate("Hello world");

// Гибридный поиск
import { HybridSearch } from './semantic/hybrid-search';

const search = new HybridSearch();
const results = await search.search(embedding, { k: 10 });

// Faiss клиент (runtime-aware)
import { getFaissClient } from './semantic/faiss/faiss-client';

const client = getFaissClient();
await client.start();
await client.initialize({ dimensions: 768, indexType: 'hnsw' });
await client.add(['id1', 'id2'], vectors);
const results = await client.search(queryVector, 10);
```
