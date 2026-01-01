# Модуль faiss

## Описание

Модуль `faiss` предоставляет высокопроизводительное векторное индексирование через библиотеку Facebook AI Similarity Search (Faiss). Реализован как Node.js subprocess для совместимости с Bun runtime, поскольку faiss-node использует NAPI, который не поддерживается Bun напрямую.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                      Bun MCP Process                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ semantic-    │    │ faiss-       │    │ vector-      │      │
│  │ agent.ts     │───▶│ client.ts    │    │ store.ts     │      │
│  └──────────────┘    └──────┬───────┘    └──────────────┘      │
│                             │ spawn("node")                     │
└─────────────────────────────┼───────────────────────────────────┘
                              │ IPC (stdin/stdout JSON)
┌─────────────────────────────▼───────────────────────────────────┐
│                    Node.js Subprocess                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ faiss-       │───▶│ faiss-node   │───▶│ libfaiss     │      │
│  │ worker.ts    │    │ (NAPI)       │    │ (C++ native) │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                │                │
│                                          ┌─────▼─────┐          │
│                                          │ OpenMP    │          │
│                                          │ (all CPU) │          │
│                                          └───────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Файлы

| Файл | Описание |
|------|----------|
| `types.ts` | IPC протокол и типы для Faiss операций |
| `faiss-worker.ts` | Node.js процесс с faiss-node (запускается как subprocess) |
| `faiss-client.ts` | Runtime-aware клиент (FaissDirectClient / FaissSubprocessClient) |
| `faiss-provider.ts` | Интеграция с semantic pipeline, hot/cold гибридное хранение |
| `IMPLEMENTATION_PLAN.md` | План реализации и статус этапов |

## Runtime-Aware Client

```typescript
// Автоматический выбор клиента в зависимости от runtime
import { getFaissClient } from './faiss-client';

const client = getFaissClient();
// Node.js → FaissDirectClient (прямой вызов faiss-node)
// Bun → FaissSubprocessClient (IPC через subprocess)
```

## Типы индексов

| Тип | Описание | Когда использовать |
|-----|----------|-------------------|
| `flat` | Точный поиск (brute force) | <10k векторов, нужна 100% точность |
| `hnsw` | Hierarchical NSW граф | <1M векторов, баланс скорость/точность |
| `ivf` | Inverted File Index | >1M векторов, кластеризация |
| `ivfpq` | IVF + Product Quantization | >1M векторов, ограничена память |

## IPC Протокол

### Запросы (stdin)

```typescript
type FaissRequest =
  | { type: "init"; config: FaissIndexConfig; loadPath?: string }
  | { type: "add"; ids: string[]; vectors: number[] }
  | { type: "search"; vector: number[]; k: number }
  | { type: "batchSearch"; vectors: number[]; nQueries: number; k: number }
  | { type: "train"; vectors: number[]; nVectors: number }
  | { type: "save"; path: string }
  | { type: "load"; path: string }
  | { type: "remove"; ids: string[] }
  | { type: "stats" }
  | { type: "shutdown" };
```

### Ответы (stdout)

```typescript
type FaissResponse =
  | FaissInitResponse
  | FaissAddResponse
  | FaissSearchResponse
  | FaissBatchSearchResponse
  | FaissTrainResponse
  | FaissSaveResponse
  | FaissLoadResponse
  | FaissRemoveResponse
  | FaissStatsResponse
  | FaissErrorResponse;
```

## Конфигурация индекса

```typescript
interface FaissIndexConfig {
  dimensions: number;        // Размерность векторов (например, 768)
  indexType: "flat" | "hnsw" | "ivf" | "ivfpq";
  metric?: "l2" | "ip" | "cosine";  // L2, Inner Product, Cosine

  // HNSW параметры
  hnswM?: number;            // Connections per layer (default: 32)
  hnswEfConstruction?: number; // Build quality (default: 200)
  hnswEfSearch?: number;     // Search quality (default: 64)

  // IVF параметры
  ivfNlist?: number;         // Number of clusters (default: sqrt(n))
  ivfNprobe?: number;        // Clusters to search (default: 10)

  // IVFPQ параметры
  pqM?: number;              // Subquantizers (default: 8)
  pqNbits?: number;          // Bits per code (default: 8)

  // OpenMP
  numThreads?: number;       // CPU threads (default: all cores)
}
```

## Hot/Cold Architecture

```
Новые эмбеддинги ──► Faiss (hot, in-memory)
                         │
                         │ периодический flush (каждые N минут)
                         ▼
Старые эмбеддинги ──► LibSQL DiskANN (cold, persistent)

Search = merge(Faiss results, DiskANN results) по score
```

## Пример использования

```typescript
import { getFaissClient } from './faiss-client';

// Получение клиента (runtime-aware)
const client = getFaissClient();
await client.start();

// Инициализация индекса
await client.initialize({
  dimensions: 768,
  indexType: 'hnsw',
  hnswM: 32,
  hnswEfConstruction: 200,
  hnswEfSearch: 64,
});

// Добавление векторов
const ids = ['doc1', 'doc2', 'doc3'];
const vectors = new Float32Array(3 * 768); // Заполнить данными
await client.add(ids, vectors);

// Поиск
const queryVector = new Float32Array(768); // Заполнить данными
const results = await client.search(queryVector, 10);
// results: [{ id: 'doc1', distance: 0.15, score: 0.87 }, ...]

// Сохранение на диск
await client.save('/path/to/index.faiss');

// Остановка
await client.stop();
```

## Performance Targets

| Метрика | Цель | Примечание |
|---------|------|------------|
| Add latency | <1ms/vector | Batch mode |
| Search latency | <5ms для k=10 | HNSW index |
| Memory | <2GB для 1M vectors | 768-dim, float32 |
| Throughput | >10k vectors/sec | OpenMP |

## Зависимости

```json
{
  "optionalDependencies": {
    "faiss-node": "^0.8.0"
  }
}
```

Faiss-node — опциональная зависимость, модуль gracefully degraded если не установлен.
