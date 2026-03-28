# Аудит конкурентного доступа к SQLite в TS

> Дата: 2026-03-28
> Контекст: В Zig-версии пришлось долго находить всех "пользователей БД" в разных
> потоках/flow и ставить их в очередь (db_mutex + WriteQueue).
> В TS нужна аналогичная работа.

---

## Текущие механизмы защиты в TS

### Что есть

| Механизм | Где | Что защищает |
|----------|-----|-------------|
| `flushChain` | IndexerAgent:191 | Сериализует flush-операции IndexerAgent (entities+rels к graph.db) |
| `indexingLock` | DevAgent:98 | Сериализует `setProjectContext` (не DB writes) |
| `indexingLocks` | IndexerAgent:112 | Map per branch — предотвращает параллельную индексацию одной ветки |
| `embeddingMutex` | SemanticAgent:183 | Предотвращает concurrent OpenVINO native calls (не DB) |
| `EXCLUSIVE locking` | multi-db-manager | SQLite-уровень: один процесс владеет БД |
| `better-sqlite3 sync` | sqlite-adapter | SQL-операции синхронны, не прерываются event loop |

### Что ОТСУТСТВУЕТ (в отличие от Zig)

| Отсутствует | Риск | Как в Zig |
|-------------|------|-----------|
| **Per-DB write mutex** | Два async flow пишут в одну БД через await points | `db_mutex` (std.Thread.Mutex) |
| **Cross-agent write coordination** | IndexerAgent + SemanticAgent пишут в разные БД, но DevAgent может писать в graph.db параллельно | Single writer per DB |
| **Write queue для versioning** | Нет очереди для prolly/commit writes | `WriteQueue` struct |

---

## Карта всех writer-ов по БД

### graph.db — 6 writer-ов

```
┌─ IndexerAgent.flushPendingBatch()     ← flushChain сериализует ВНУТРИ агента
│  ├─ batchOps.insertEntities()         → client.batch("write")
│  ├─ batchOps.insertRelationships()    → client.batch("write")
│  └─ metadataOps.batchUpdateFileInfo() → client.batch("write")
│
├─ DevAgent.handleIndexingComplete()    ← indexingLock НЕ защищает DB writes
│  ├─ storage.insertRelationships()     → client.batch("write")
│  ├─ adapter.commitToGraph()           → versioning commits
│  └─ pruneAndGC() (fire-and-forget!)   → DELETE old generations
│
├─ MetadataOps.updateProjectMetadata()  ← вызывается после индексации
│  └─ client.execute("INSERT OR REPLACE")
│
├─ GenerationOps.bumpGeneration()       ← вызывается перед flush
│  └─ client.execute("INSERT OR REPLACE")
│
├─ SchemaManager.createGraphTables()    ← только при init
│  └─ client.batch(CREATE TABLE...)
│
└─ Git event handlers                   ← при branch switch
   └─ metadataOps.clearProject()        → DELETE + re-create
```

**ПРОБЛЕМА:** `DevAgent.pruneAndGC()` вызывается как fire-and-forget (`?.catch?.()`)
параллельно с `flushPendingBatch()` — оба пишут в graph.db через разные code paths.
flushChain сериализует только IndexerAgent flushes.

### semantic.db — 3 writer-а

```
├─ CooccurrenceOps.batchUpdateCooccurrence()  ← DevAgent pipeline
│  └─ client.execute() в loop по 100          ← НЕТ batch tx!
│
├─ CooccurrenceOps.updateTermFrequencies()    ← DevAgent pipeline
│  └─ client.execute() в loop по 100          ← НЕТ batch tx!
│
└─ SchemaManager.createSemanticTables()       ← только при init
```

**ПРОБЛЕМА:** Cooccurrence writes — не в транзакции, выполняются в loop по 100.
Между iterations event loop может yieldn'уть. Если другой flow тоже пишет
cooccurrence — data race.

### cache.db — 3 writer-а

```
├─ CacheOps.setEmbeddingsInCache()    ← SemanticAgent
│  └─ client.batch("write")           ← в транзакции, ОК
│
├─ CacheOps.setQueryResult()          ← tool handlers (query_cache)
│  └─ client.execute()
│
└─ MetadataOps.recordPerformance()    ← tool handlers (performance_metrics)
   └─ client.execute()
```

**Относительно безопасно:** SemanticAgent — основной writer, tool handlers пишут
только отдельные строки, не пересекаются по таблицам.

### versioning.db — 2 writer-а

```
├─ CommitManager.commit()             ← DevAgent после индексации
│  └─ client.execute() × 2
│
├─ ProllyNodeStore.storeNodeBatch()   ← DevAgent после индексации
│  └─ client.batch()
│
└─ CommitManager.pruneHistory()       ← DevAgent (fire-and-forget)
   └─ client.batch()
```

**ПРОБЛЕМА:** `pruneHistory()` — fire-and-forget, может выполняться параллельно
с `commit()` и `storeNodeBatch()`.

---

## Конкретные race conditions

### Race 1: IndexerAgent flush vs DevAgent pruneAndGC

```
Timeline:
  T1: IndexerAgent.flushChain → insertEntities(batch) → awaiting DB
  T2: DevAgent.pruneAndGC()   → DELETE FROM entities WHERE file_gen < X
  T1: insertEntities completes → some just-inserted entities may be deleted by T2
```

**Вероятность:** НИЗКАЯ (GC запускается после индексации), но возможна при
incremental index + tool call одновременно.

### Race 2: Cooccurrence loop vs query tool

```
Timeline:
  T1: batchUpdateCooccurrence() loop → INSERT cooccurrence (item 50 of 100)
  T2: event loop yields → tool handler reads cooccurrence → stale/partial data
  T1: continues loop → INSERT items 51-100
```

**Вероятность:** СРЕДНЯЯ при активном использовании во время индексации.

### Race 3: Promise.all в DevAgent finalization

```typescript
await Promise.all([faissFlushPromise, graphCommitPromise]);
// faissFlushPromise → writes FAISS files
// graphCommitPromise → writes to graph.db (metadata) + versioning.db (commit)
```

**БЕЗОПАСНО:** Разные БД. Но если graphCommitPromise также touches graph.db
(metadata update), а IndexerAgent ещё flush'ит — race на graph.db.

### Race 4: clearProject() vs ongoing indexing

```
Timeline:
  T1: Git branch switch → clearProject() → DELETE FROM entities
  T2: IndexerAgent still flushing from old branch → INSERT entities
```

**Вероятность:** СРЕДНЯЯ при быстром переключении веток.

---

## Рекомендуемое решение: Per-DB Write Mutex

### Подход (как в Zig, адаптировано для Node.js)

```typescript
// src/storage/db-write-mutex.ts

/**
 * Promise-based mutex for serializing writes to a single SQLite DB.
 * Analog of Zig's db_mutex (std.Thread.Mutex) adapted for async Node.js.
 *
 * Usage:
 *   const result = await graphMutex.run(() => client.batch(statements, "write"));
 */
export class DbWriteMutex {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Execute fn exclusively — all other callers wait.
   * Returns fn's result. Errors propagate to caller but don't break the chain.
   */
  async run<T>(fn: () => T | Promise<T>): Promise<T> {
    let resolve: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    const prev = this.chain;
    this.chain = next;

    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  /** Current queue depth (for diagnostics) */
  get pending(): boolean {
    return this.chain !== Promise.resolve();
  }
}
```

### Интеграция

```
MultiDbManager:
  + graphMutex: DbWriteMutex      — для graph.db
  + semanticMutex: DbWriteMutex   — для semantic.db
  + cacheMutex: DbWriteMutex      — для cache.db
  + versioningMutex: DbWriteMutex — для versioning.db

  writeGraph<T>(fn: () => Promise<T>): Promise<T> {
    return this.graphMutex.run(fn);
  }
  // аналогично для semantic, cache, versioning
```

### Кто должен использовать mutex

| Writer | БД | Как обернуть |
|--------|-----|-------------|
| `insertEntities()` | graph | `writeGraph(() => client.batch(...))` |
| `insertRelationships()` | graph | `writeGraph(() => client.batch(...))` |
| `batchUpdateFileInfo()` | graph | `writeGraph(() => client.batch(...))` |
| `bumpGeneration()` | graph | `writeGraph(() => client.execute(...))` |
| `runGarbageCollection()` | graph | `writeGraph(() => ...)` |
| `clearProject()` | graph | `writeGraph(() => client.batch(...))` |
| `updateProjectMetadata()` | graph | `writeGraph(() => client.execute(...))` |
| `batchUpdateCooccurrence()` | semantic | `writeSemantic(() => loop)` |
| `updateTermFrequencies()` | semantic | `writeSemantic(() => loop)` |
| `setEmbeddingsInCache()` | cache | `writeCache(() => client.batch(...))` |
| `commit()` | versioning | `writeVersioning(() => client.execute(...))` |
| `storeNodeBatch()` | versioning | `writeVersioning(() => client.batch(...))` |
| `pruneHistory()` | versioning | `writeVersioning(() => client.batch(...))` |

### Что можно убрать после внедрения

- `IndexerAgent.flushChain` → заменяется `graphMutex`
- `indexingLocks` per branch → может остаться (предотвращает двойную индексацию)
- `embeddingMutex` → остаётся (защищает native calls, не DB)

---

## Приоритет исправлений

### P0 — Немедленно

1. **`pruneAndGC()` fire-and-forget** → обернуть в `graphMutex.run()`
   или убрать fire-and-forget (await результат)

2. **Cooccurrence loop без транзакции** → обернуть весь loop в `semanticMutex.run()`
   или перевести на `client.batch()` вместо loop

### P1 — При рефакторинге storage

3. Внедрить `DbWriteMutex` в `MultiDbManager`
4. Обернуть все write-операции через mutex
5. Удалить `flushChain` из IndexerAgent (заменён graphMutex)

### P2 — Мониторинг

6. Добавить метрику: wait time в mutex (для диагностики contention)
7. Логировать при queue depth > 3 (признак bottleneck)
