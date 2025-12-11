# План оптимизации ultrascript-tools-mcp

> Дата: 2025-12-11
> Версия: 1.0
> Автор: Claude Code Analysis

## Резюме

Проект уже имеет хорошую базу оптимизаций (SWC Direct Parser, SIMD ops, GPU backends, Adaptive Vector Backend). Данный план фокусируется на устранении оставшихся bottlenecks и добавлении новых оптимизаций для достижения максимальной производительности.

**Ожидаемый суммарный эффект:** 2-5x ускорение hot paths при увеличении потребления памяти на 20-50%.

---

## Фаза 1: Устранение сериализационных bottlenecks

### 1.1 Прямой Buffer для векторов в sqlite-vec

**Приоритет:** КРИТИЧЕСКИЙ
**Сложность:** Низкая
**Ожидаемый эффект:** 3-5x ускорение insert операций

**Текущее состояние:**
```typescript
// src/semantic/vector-store.ts:519-522
const vectorJson = JSON.stringify(Array.from(e.vector));
this.insertVecStmt.run(e.id, vectorJson);
```

**Целевое состояние:**
```typescript
// Использовать прямой Buffer без конверсии
const vectorBuffer = Buffer.from(
  e.vector.buffer,
  e.vector.byteOffset,
  e.vector.byteLength
);
this.insertVecStmt.run(e.id, vectorBuffer);
```

**Файлы для изменения:**
- `src/semantic/vector-store.ts` - методы `insert`, `insertBatch`, `update`

**Критерий готовности:**
- [ ] Все insert/update операции используют Buffer напрямую
- [ ] Benchmark показывает ≥3x ускорение для batch insert 10K векторов

---

### 1.2 CBOR вместо JSON для metadata

**Приоритет:** ВЫСОКИЙ
**Сложность:** Средняя
**Ожидаемый эффект:** 2-3x ускорение search, 30% экономия размера БД

**Зависимости:**
```bash
bun add cbor-x
```

**Текущее состояние:**
```typescript
// src/semantic/vector-store.ts
const metadataStr = embedding.metadata ? JSON.stringify(embedding.metadata) : null;
// ...
metadata: row.metadata ? JSON.parse(row.metadata) : undefined
```

**Целевое состояние:**
```typescript
import { encode, decode } from 'cbor-x';

// Insert
const metadataBuffer = embedding.metadata ? encode(embedding.metadata) : null;

// Search
metadata: row.metadata ? decode(row.metadata) : undefined
```

**Файлы для изменения:**
- `src/semantic/vector-store.ts`
- `src/semantic/vectorlite-adapter.ts`
- `src/storage/batch-operations.ts`

**Миграция данных:**
```sql
-- Скрипт миграции существующих данных (опционально)
-- Новые записи будут в CBOR, старые останутся в JSON
-- Детектировать формат по первому байту: 0x7B = JSON, иначе CBOR
```

**Критерий готовности:**
- [ ] Все metadata сериализуются через CBOR
- [ ] Backwards-compatible чтение JSON для старых записей
- [ ] Benchmark показывает ≥2x ускорение search

---

### 1.3 LRU кэш для распарсенных metadata

**Приоритет:** СРЕДНИЙ
**Сложность:** Низкая
**Ожидаемый эффект:** 1.5-2x ускорение повторных search

**Текущее состояние:** Metadata парсится при каждом обращении

**Целевое состояние:**
```typescript
// src/semantic/vector-store.ts
import { LRUCache } from 'lru-cache';

private metadataCache = new LRUCache<string, Record<string, unknown>>({
  max: 10000,
  ttl: 1000 * 60 * 5, // 5 минут
});

// В search методе
let metadata = this.metadataCache.get(row.id);
if (!metadata && row.metadata) {
  metadata = decode(row.metadata);
  this.metadataCache.set(row.id, metadata);
}
```

**Критерий готовности:**
- [ ] LRU кэш интегрирован в VectorStore
- [ ] Cache hit rate >70% на повторных запросах

---

## Фаза 2: SIMD оптимизация вычислений

### 2.1 SIMD Mean Pooling для OpenVINO

**Приоритет:** ВЫСОКИЙ
**Сложность:** Средняя
**Ожидаемый эффект:** 4-8x ускорение embedding post-processing

**Текущее состояние:**
```typescript
// src/semantic/providers/openvino-provider.ts:590-628
for (let i = 0; i < seqLen; i++) {
  if (attMask[i] > 0n) {
    tokenCount++;
    for (let j = 0; j < dim; j++) {
      embedding[j] += output[i * dim + j];
    }
  }
}
```

**Целевое состояние:**
```typescript
// Новый файл: src/utils/simd-pooling.ts
export function simdMeanPooling(
  output: Float32Array,
  attMask: BigInt64Array,
  seqLen: number,
  dim: number
): Float32Array {
  const embedding = new Float32Array(dim);
  let tokenCount = 0;

  // SIMD accumulation по 4 элемента
  for (let i = 0; i < seqLen; i++) {
    if (attMask[i] > 0n) {
      tokenCount++;
      const offset = i * dim;

      // Процессировать по 4 float за раз
      let j = 0;
      for (; j + 4 <= dim; j += 4) {
        embedding[j] += output[offset + j];
        embedding[j + 1] += output[offset + j + 1];
        embedding[j + 2] += output[offset + j + 2];
        embedding[j + 3] += output[offset + j + 3];
      }
      // Остаток
      for (; j < dim; j++) {
        embedding[j] += output[offset + j];
      }
    }
  }

  // SIMD normalize
  return simdNormalize(embedding, tokenCount);
}
```

**Альтернатива - WASM SIMD:**
```rust
// external-tools/wasm/vector-ops/src/lib.rs
#[wasm_bindgen]
pub fn mean_pooling(
    output: &[f32],
    att_mask: &[i64],
    seq_len: usize,
    dim: usize
) -> Vec<f32> {
    // Использовать f32x4 SIMD инструкции
}
```

**Файлы для изменения:**
- `src/utils/simd-pooling.ts` (новый)
- `src/semantic/providers/openvino-provider.ts`
- Опционально: `external-tools/wasm/vector-ops/`

**Критерий готовности:**
- [ ] Mean pooling использует SIMD
- [ ] L2 normalize использует SIMD
- [ ] Benchmark показывает ≥4x ускорение

---

### 2.2 SIMD для Hybrid Search RRF Fusion

**Приоритет:** СРЕДНИЙ
**Сложность:** Низкая
**Ожидаемый эффект:** 1.5-2x ускорение fusion

**Текущее состояние:**
```typescript
// src/semantic/hybrid-search.ts:182-198
structural.forEach((item, rank) => {
  const rrfScore = options.structuralWeight / (options.k + rank + 1);
  // Map operations...
});
```

**Целевое состояние:**
```typescript
// Pre-compute RRF scores в Float32Array
const structuralScores = new Float32Array(structural.length);
const k = options.k;
const weight = options.structuralWeight;

for (let i = 0; i < structural.length; i++) {
  structuralScores[i] = weight / (k + i + 1);
}

// Использовать TypedArray для быстрого lookup по index
const scoreMap = new Map<string, number>();
for (let i = 0; i < structural.length; i++) {
  scoreMap.set(structural[i].id, structuralScores[i]);
}
```

**Критерий готовности:**
- [ ] RRF scores вычисляются через TypedArray
- [ ] Benchmark показывает улучшение для >1000 результатов

---

## Фаза 3: Параллелизация

### 3.1 Worker Pool для CPU Similarity Search

**Приоритет:** ВЫСОКИЙ
**Сложность:** Средняя
**Ожидаемый эффект:** 4-8x ускорение (по числу ядер)

**Текущее состояние:**
```typescript
// src/semantic/vector-store.ts:983-990
for (let i = 0; i < database.length; i++) {
  results[i] = cosineSimilaritySIMD(query, database[i]);
}
```

**Целевое состояние:**
```typescript
// src/utils/similarity-worker-pool.ts
import { Worker } from 'worker_threads';
import os from 'os';

const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

export class SimilarityWorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Array<{
    query: Float32Array;
    chunk: Float32Array[];
    resolve: (results: Float32Array) => void;
  }> = [];

  async batchCosineSimilarity(
    query: Float32Array,
    database: Float32Array[]
  ): Promise<Float32Array> {
    const chunkSize = Math.ceil(database.length / NUM_WORKERS);
    const chunks = [];

    for (let i = 0; i < database.length; i += chunkSize) {
      chunks.push(database.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
      chunks.map((chunk, i) => this.submitToWorker(i, query, chunk))
    );

    return this.mergeResults(results);
  }
}
```

**Worker код:**
```typescript
// src/utils/similarity-worker.ts
import { parentPort } from 'worker_threads';
import { cosineSimilarity } from './simd-vector-ops.js';

parentPort?.on('message', ({ query, database }) => {
  const results = new Float32Array(database.length);
  for (let i = 0; i < database.length; i++) {
    results[i] = cosineSimilarity(query, database[i]);
  }
  parentPort?.postMessage(results);
});
```

**Файлы для изменения:**
- `src/utils/similarity-worker-pool.ts` (новый)
- `src/utils/similarity-worker.ts` (новый)
- `src/semantic/vector-store.ts`

**Критерий готовности:**
- [ ] Worker pool инициализируется при старте
- [ ] Автоматическое использование для >500 векторов
- [ ] Graceful shutdown при закрытии VectorStore

---

### 3.2 Parallel Batch Indexing с p-map

**Приоритет:** СРЕДНИЙ
**Сложность:** Низкая
**Ожидаемый эффект:** 2-3x ускорение индексации

**Зависимости:**
```bash
bun add p-map
```

**Текущее состояние:**
```typescript
// src/agents/indexer-agent.ts:280-294
for (const result of results) {
  const task = { ... };
  await this.process(task);
}
```

**Целевое состояние:**
```typescript
import pMap from 'p-map';

const tasks = results.map(result => ({
  id: nanoid(12),
  type: "index:entities",
  // ...
}));

await pMap(tasks, task => this.process(task), {
  concurrency: 4,  // Ограничить параллелизм для SQLite
  stopOnError: false,
});
```

**Критерий готовности:**
- [ ] Batch indexing использует p-map
- [ ] Concurrency настраивается через конфиг
- [ ] Нет deadlocks при параллельной записи в SQLite

---

## Фаза 4: Memory Pool Optimization

### 4.1 Расширение Float32Pool

**Приоритет:** СРЕДНИЙ
**Сложность:** Низкая
**Ожидаемый эффект:** Снижение GC pressure на 30-50%

**Текущее состояние:**
```typescript
// src/utils/float32-pool.ts существует, но не везде используется
```

**Целевое состояние:**
```typescript
// Интеграция в hot paths
// src/semantic/providers/openvino-provider.ts
import { Float32Pool } from '../utils/float32-pool.js';

const pool = new Float32Pool(384, 100); // 100 буферов по 384 элемента

async embed(text: string): Promise<Float32Array> {
  const embedding = pool.acquire();
  try {
    // ... заполнить embedding
    return embedding; // Caller отвечает за release
  } catch (e) {
    pool.release(embedding);
    throw e;
  }
}
```

**Файлы для изменения:**
- `src/utils/float32-pool.ts` - добавить auto-sizing
- `src/semantic/providers/openvino-provider.ts`
- `src/semantic/vector-store.ts`

**Критерий готовности:**
- [ ] Pool используется в embedding generation
- [ ] Pool используется в similarity search
- [ ] Memory profiling показывает снижение allocations

---

### 4.2 Увеличение размеров кэшей

**Приоритет:** НИЗКИЙ
**Сложность:** Тривиальная
**Ожидаемый эффект:** Снижение cache miss rate

**Изменения в конфиге:**
```typescript
// src/semantic/vector-store.ts
const DEFAULT_CONFIG = {
  cacheSize: 128000,  // 512MB вместо 256MB
};

// src/agents/indexer-agent.ts
function getIndexerConfig() {
  return {
    cacheSize: 100 * 1024 * 1024,  // 100MB вместо 50MB
  };
}

// src/storage/cache-manager.ts
const DEFAULT_MAX_SIZE = 100 * 1024 * 1024; // 100MB
```

**Критерий готовности:**
- [ ] Конфигурируемые размеры через YAML
- [ ] Мониторинг cache hit rate

---

## Фаза 5: Алгоритмические улучшения

### 5.1 HNSW Parameter Tuning

**Приоритет:** НИЗКИЙ
**Сложность:** Требует бенчмаркинга
**Ожидаемый эффект:** 10-30% улучшение search качества/скорости

**Текущие параметры:**
```typescript
// src/semantic/vectorlite-adapter.ts
M: 16,
efConstruction: 200,
efSearch: 50,
```

**Рекомендуемые эксперименты:**
| Параметр | Текущий | Для скорости | Для качества |
|----------|---------|--------------|--------------|
| M | 16 | 12 | 24 |
| efConstruction | 200 | 100 | 400 |
| efSearch | 50 | 30 | 100 |

**Критерий готовности:**
- [ ] Benchmark suite для измерения recall@10
- [ ] A/B тестирование параметров на реальных данных

---

### 5.2 Batch Rabin-Karp Hashing

**Приоритет:** НИЗКИЙ
**Сложность:** Высокая
**Ожидаемый эффект:** 2x ускорение clone detection

**Текущее состояние:** Последовательное хэширование токенов

**Целевое состояние:**
```typescript
// src/vendor/jscpd/core/rabin-karp.ts
// Использовать xxhash batch API
import { xxhash64 } from 'xxhash-wasm';

function batchHash(tokens: string[]): BigUint64Array {
  const hashes = new BigUint64Array(tokens.length);
  // SIMD-friendly batch hashing
  for (let i = 0; i < tokens.length; i++) {
    hashes[i] = xxhash64(tokens[i]);
  }
  return hashes;
}
```

**Критерий готовности:**
- [ ] Batch hashing для токенов
- [ ] Benchmark на большом codebase (>10K файлов)

---

## Метрики и мониторинг

### Ключевые метрики для отслеживания

| Метрика | Текущее | Целевое |
|---------|---------|---------|
| Parse time (1K files) | ~100ms | ~100ms (уже оптимально) |
| Embedding generation | ~1.3ms/text | ~1.0ms/text |
| Vector insert (batch 1K) | ~500ms | ~100ms |
| Similarity search (10K vectors) | ~50ms | ~10ms |
| Index complete (10K files) | ~30s | ~15s |

### Команды для бенчмаркинга

```bash
# Запуск benchmark suite
bun run benchmark:embedding
bun run benchmark:vector-store
bun run benchmark:indexing

# Профилирование памяти
NODE_OPTIONS="--expose-gc" bun run profile:memory

# CPU профилирование
bun run --inspect benchmark:all
```

---

## Timeline и зависимости

```
Фаза 1 (Сериализация)     ████████░░░░
  1.1 Buffer vectors      ████
  1.2 CBOR metadata           ████
  1.3 LRU cache                   ████

Фаза 2 (SIMD)                 ████████░░
  2.1 Mean pooling            ████████
  2.2 RRF fusion                    ████

Фаза 3 (Параллелизация)           ████████
  3.1 Worker pool                 ████████
  3.2 p-map indexing                  ████

Фаза 4 (Memory)                       ████
  4.1 Float32Pool                     ██
  4.2 Cache sizes                       ██

Фаза 5 (Алгоритмы)                      ████
  5.1 HNSW tuning                       ██
  5.2 Batch hash                          ██
```

**Зависимости:**
- 1.2 (CBOR) → 1.3 (LRU cache)
- 2.1 (SIMD pooling) → можно делать параллельно с Фазой 1
- 3.1 (Worker pool) → зависит от стабильной работы SIMD ops

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Breaking changes в API | Средняя | Версионирование, feature flags |
| Regression в качестве поиска | Низкая | A/B тестирование, golden tests |
| Memory leaks в worker pool | Средняя | Автоматические тесты, мониторинг |
| SQLite lock contention | Высокая | WAL mode, connection pooling |

---

## Чеклист перед релизом

- [ ] Все тесты проходят
- [ ] Benchmark показывает улучшения
- [ ] Memory profiling не показывает leaks
- [ ] Документация обновлена
- [ ] CHANGELOG.md обновлён
- [ ] Backwards compatibility проверена
