# Модуль storage

## Описание

Модуль `storage` предоставляет унифицированное хранилище данных для графа кода и векторных эмбеддингов. Основан на LibSQL (форк SQLite от Turso) с поддержкой DiskANN векторного индекса. Обеспечивает изоляцию данных по проектам и веткам через композитные первичные ключи.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ semantic-agent   │    │ indexer-agent    │    │ pattern-search   │   │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘   │
└───────────┼─────────────────────────┼─────────────────────┼─────────────┘
            │                         │                     │
            ▼                         ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GraphStorageFactory (Singleton)                     │
│  - getGraphStorage() → GraphStorageLibSQL                                │
│  - configureGraphStorage(config)                                         │
│  - setGlobalProjectContext(projectPath, branchName)                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GraphStorageLibSQL                               │
│  - Entity CRUD (insertEntity, findEntities, searchEntities...)          │
│  - Relationship CRUD (insertRelationship, getRelationshipsForEntity...) │
│  - File tracking (updateFileInfo, getFileInfo, getOutdatedFiles)        │
│  - Branch operations (findEntitiesInBranch, getEntityFromBranch...)     │
│  - Metrics (getMetrics, getStatistics)                                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        LibSQLGraphAdapter                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       unified-storage.db                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │  entities   │  │relationships│  │   files     │               │  │
│  │  │ (PK: id,    │  │ (PK: id,    │  │ (PK: path,  │               │  │
│  │  │  project,   │  │  project,   │  │  project,   │               │  │
│  │  │  branch)    │  │  branch)    │  │  branch)    │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ embeddings  │  │project_meta │  │ query_cache │               │  │
│  │  │ F32_BLOB +  │  │ incremental │  │             │               │  │
│  │  │ DiskANN idx │  │ tracking    │  │             │               │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        LRU Caches                                  │  │
│  │  embeddingCache (5000, 10m) │ searchCache (500, 2m) │ metadata    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Файлы

| Файл | Описание |
|------|----------|
| `graph-storage-factory.ts` | Singleton фабрика для создания GraphStorageLibSQL, конфигурация, глобальный контекст проекта |
| `graph-storage-libsql.ts` | Реализация интерфейса GraphStorage через LibSQLGraphAdapter с async API |
| `libsql-graph-adapter.ts` | Основной адаптер: граф + векторы в одной базе, DiskANN, LRU кэши, CBOR сериализация, Prolly Tree |
| `batch-operations-libsql.ts` | Пакетные операции для LibSQL с оптимизацией батчей |
| `cache-manager.ts` | Менеджер кэширования для временных данных |
| `sqlite-adapter.ts` | Sync SQLite адаптер (только Bun runtime), обёртка bun:sqlite с API better-sqlite3 |
| `bun-sqlite-adapter.ts` | Простой прямой wrapper над bun:sqlite для legacy кода |
| `prolly/` | **Версионирование графа** — Prolly Tree, commits, time travel (см. prolly/AUTODOC.md) |

## Unified Storage (v4)

Единая база данных для всех данных проекта:

| Таблица | Описание |
|---------|----------|
| `entities` | Сущности кода (функции, классы, методы...) |
| `relationships` | Связи между сущностями (calls, imports, extends...) |
| `files` | Метаданные файлов (hash, last_indexed, entity_count) |
| `embeddings` | Векторные эмбеддинги с F32_BLOB и DiskANN индексом |
| `project_metadata` | Метаданные проекта, incremental tracking |
| `query_cache` | Кэш запросов |
| `performance_metrics` | Метрики производительности |

## Project/Branch Isolation

Все таблицы используют композитные первичные ключи для изоляции:

```sql
PRIMARY KEY (id, project_hash, branch_name)
```

**Преимущества:**
- Несколько проектов в одной базе
- Изоляция веток для merge-сценариев
- Атомарные операции в рамках project/branch

## DiskANN Vector Index

Конфигурация LibSQL для векторного поиска:

```typescript
interface LibSQLGraphConfig {
  dimensions: number;           // 768 для multilingual-e5-base
  metric: "cosine" | "l2";      // Метрика расстояния
  compression: "float8" | "float16" | "float32";  // Сжатие соседей
  searchL: number;              // Качество поиска (200)
  insertL: number;              // Качество вставки (50)
  maxNeighbors: number;         // Макс. соседей (24)
}
```

**Оптимизации:**
- `float8` compression — экономия 40-50% памяти
- Partial index per project — быстрее чем глобальный
- Bulk insert с drop/rebuild index

## LRU Caches

| Кэш | Max | TTL | Назначение |
|-----|-----|-----|------------|
| `embeddingCache` | 5000 | 10 мин | Часто запрашиваемые эмбеддинги |
| `searchCache` | 500 | 2 мин | Результаты similarity search |
| `metadataCache` | 10000 | 5 мин | Распарсенные CBOR метаданные |

## CBOR Serialization

Метаданные сериализуются через CBOR вместо JSON:
- Быстрее парсинг бинарных данных
- Компактнее для сложных структур
- Fallback на JSON для legacy данных

## Пример использования

```typescript
import { getGraphStorage, configureGraphStorage, setGlobalProjectContext } from './storage/graph-storage-factory';

// Конфигурация (опционально)
configureGraphStorage({
  dimensions: 768,
  metric: 'cosine',
  compression: 'float8'
});

// Получение singleton
const storage = await getGraphStorage();

// Установка контекста проекта
setGlobalProjectContext('/path/to/project', 'feature-branch');

// Entity операции
await storage.insertEntity({
  id: 'e1',
  name: 'MyClass',
  type: 'class',
  filePath: 'src/my-class.ts',
  location: { start: { line: 1, column: 0 }, end: { line: 50, column: 1 } }
});

const entities = await storage.searchEntities({
  namePattern: 'My',
  types: ['class', 'interface'],
  limit: 100
});

// Vector операции (через adapter)
const adapter = storage.getAdapter();
await adapter.insertEmbedding({
  id: 'emb1',
  content: 'function calculateTotal(items)',
  vector: new Float32Array(768),
  metadata: { entityId: 'e1', type: 'function' }
});

const similar = await adapter.searchVectors(queryVector, 10);
```

## Incremental Tracking

Отслеживание инкрементальных изменений для оптимизации:

```typescript
// Получить информацию о трекинге
const info = await storage.getIncrementalTrackingInfo();
// { lastFullIndexAt: 1702483200000, incrementalChangesCount: 42, totalFiles: 1000 }

// Записать инкрементальные изменения
await storage.recordIncrementalChanges(5);

// Сбросить после полной переиндексации
await storage.resetIncrementalTracking();
```

## Prolly Tree — Версионирование графа (v3.3.x)

Prolly Tree обеспечивает версионирование графа кода с эффективным diff и time travel:

```typescript
// После индексации автоматически создаётся commit
const adapter = storage.getLibSQLAdapter();
const commitHash = await adapter.createGraphCommit("Index: 42 files");

// Получить историю commits
const commits = await adapter.getCommitManager().getHistory(100);

// Time travel — получить entity в определённой версии
const timeTravel = new TimeTravelManager(
  adapter.getProllyNodeStore(),
  adapter.getCommitManager()
);
const entity = await timeTravel.getEntityAt(entityId, commitHash);

// Diff между версиями
const diff = await timeTravel.diffCommits(commitA, commitB);
// { added: [...], modified: [...], deleted: [...] }
```

**Компоненты:**
- `ProllyNodeStore` — content-addressed хранилище узлов
- `ProllyTree` — B-tree с probabilistic chunking
- `CommitManager` — управление версиями и branch heads
- `BranchDiffCache` — O(1) кэш для branch diff
- `TimeTravelManager` — API для исторических запросов

**MCP Tools:**
- `list_commits` — история версий графа
- `get_entity_history` — история изменений entity
- `diff_commits` — сравнение версий
- `checkout_commit` — time travel

Подробнее: `src/storage/prolly/AUTODOC.md`

## Runtime Compatibility

| Runtime | Async (LibSQL) | Sync (bun:sqlite) |
|---------|----------------|-------------------|
| Bun | ✅ | ✅ |
| Node.js | ✅ | ❌ |

**Примечание:** Sync SQLite (sqlite-adapter.ts) доступен только под Bun для LayeredCacheManager и VectorCacheManager.

## Экспорты

```typescript
// Основной API
export {
  getGraphStorage,
  initializeGraphStorage,
  configureGraphStorage,
  setGlobalProjectContext,
  getLibSQLAdapter,
  resetGraphStorage,
  isStorageReady
} from './graph-storage-factory';

export { GraphStorageLibSQL, createProjectContext } from './graph-storage-libsql';
export { LibSQLGraphAdapter, type LibSQLGraphConfig, type ProjectContext } from './libsql-graph-adapter';
```
