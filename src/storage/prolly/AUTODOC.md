# Модуль prolly - Versioned Graph Storage

## Описание

Модуль `prolly` реализует Prolly Tree — content-addressed B-tree с Merkle-хешированием для версионирования графа кода. Позволяет отслеживать историю изменений, эффективно сравнивать версии (O(log n) diff) и выполнять time travel запросы.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MCP Tools                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ get_entity_history│  │ diff_commits     │  │ checkout_commit  │       │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │
└───────────┼────────────────────────┼──────────────────┼─────────────────┘
            │                        │                  │
            ▼                        ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        TimeTravelManager                                 │
│  - getEntityHistory(entityId, limit)                                     │
│  - diffCommits(commitA, commitB)                                         │
│  - getEntityAt(entityId, commitHash)                                     │
│  - getAllEntitiesAt(commitHash)                                          │
│  - compareEntity(entityId, commitA, commitB)                             │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   ProllyTree      │    │  CommitManager    │    │ BranchDiffCache   │
│  - build(entries) │    │  - commit(root,   │    │ - initForBranch() │
│  - get(key)       │    │      message)     │    │ - isDeleted(id)   │
│  - insert(k, v)   │    │  - getHistory()   │    │ - O(1) lookups    │
│  - diff(other)    │    │  - getBranchHead()│    │                   │
└─────────┬─────────┘    └─────────┬─────────┘    └─────────┬─────────┘
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ProllyNodeStore                                   │
│  - Content-addressed node storage with LRU cache                         │
│  - Hash-based deduplication (structural sharing)                         │
│  - CBOR serialization for compact storage                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           LibSQL Database                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │prolly_nodes │  │graph_commits│  │branch_heads │  │ file_merkle │    │
│  │ hash (PK)   │  │ commitHash  │  │ branchName  │  │ (future)    │    │
│  │ data (BLOB) │  │ rootNodeHash│  │ commitHash  │  │             │    │
│  │ refCount    │  │ parentHash  │  │ projectHash │  │             │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Файлы

| Файл | Описание |
|------|----------|
| `index.ts` | Экспорты модуля |
| `node-store.ts` | Content-addressed хранилище узлов с LRU кэшем |
| `prolly-tree.ts` | B-tree с probabilistic chunking, O(log n) diff |
| `commit-manager.ts` | Управление версиями и branch heads |
| `branch-diff-cache.ts` | O(1) кэш для branch diff (вместо tombstone queries) |
| `time-travel.ts` | API для исторических запросов |
| `types.ts` | TypeScript типы |

## Ключевые концепции

### Prolly Tree

Prolly Tree (Probabilistic B-tree) — это B-дерево, где границы узлов определяются хешем контента, а не фиксированным размером. Это обеспечивает:

- **Структурное разделение** — одинаковые поддеревья разделяются между версиями
- **Эффективный diff** — O(log n) сравнение версий по хешам корней
- **Content-addressability** — узлы идентифицируются по хешу содержимого

### Commits

Каждый коммит содержит:
- `commitHash` — уникальный идентификатор (SHA-256)
- `rootNodeHash` — корень Prolly Tree на момент коммита
- `parentHash` — ссылка на предыдущий коммит
- `entityCount`, `relationshipCount` — статистика
- `message` — опциональное описание
- `createdAt` — timestamp

### Branch Diff Cache

Оптимизация для feature branches:
- Вместо O(n) tombstone queries — O(1) lookup в кэше
- Кэш строится при переключении на feature branch
- Содержит множество deleted entity IDs

## API

### ProllyTree

```typescript
const tree = new ProllyTree(nodeStore);
await tree.initialize();

// Построить дерево из entries
const entries = entities.map(e => ({
  key: e.id,
  value: serializeEntity(e)
}));
const rootHash = await tree.build(entries);

// Получить значение по ключу
const value = await tree.get(entityId);

// Сравнить с другой версией
tree.setRootHash(commitA.rootNodeHash);
const diff = await tree.diff(commitB.rootNodeHash);
// diff = { added: [...], modified: [...], deleted: [...] }
```

### CommitManager

```typescript
const commitManager = new CommitManager();
await commitManager.initialize(client);
commitManager.setContext(projectHash, branchName);

// Создать коммит
const commit = await commitManager.commit(
  rootHash,
  null, // fileTreeHash
  { entityCount: 100, relationshipCount: 50 },
  "Index: 42 files"
);

// Получить историю
const history = await commitManager.getHistory(100);

// Получить HEAD текущей ветки
const head = await commitManager.getBranchHead();

// Получить коммиты за период (для analyze_hotspots)
const sinceTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 дней
const recentCommits = await commitManager.getCommitsSince(sinceTimestamp, 1000);
```

### TimeTravelManager

```typescript
const timeTravel = new TimeTravelManager(nodeStore, commitManager);

// История изменений entity
const history = await timeTravel.getEntityHistory(entityId, 50);
// [{commitHash, changeType: 'add'|'modify'|'delete', timestamp, oldValue?, newValue?}]

// Получить entity в определённой версии
const entity = await timeTravel.getEntityAt(entityId, commitHash);

// Diff между коммитами
const diff = await timeTravel.diffCommits(commitA, commitB);
// {fromCommit, toCommit, treeDiff: {added, modified, deleted}, commitPath}

// Сравнить entity между версиями
const cmp = await timeTravel.compareEntity(entityId, commitA, commitB);
// {entityA, entityB, changed: boolean}
```

## MCP Tools

### list_commits

Список версий графа:

```json
{
  "commits": [
    {
      "hash": "abc123...",
      "message": "Index: 42 files",
      "entityCount": 1500,
      "relationshipCount": 3200,
      "createdAt": "2024-01-15T10:30:00Z",
      "parentHash": "def456"
    }
  ],
  "total": 15
}
```

### get_entity_history

История изменений entity:

```json
{
  "entityId": "e1a2b3c4",
  "changes": [
    {
      "commitHash": "abc123...",
      "changeType": "modify",
      "timestamp": "2024-01-15T10:30:00Z",
      "entitySnapshot": { "name": "MyClass", "type": "class", ... }
    },
    {
      "commitHash": "def456...",
      "changeType": "add",
      "timestamp": "2024-01-10T09:00:00Z"
    }
  ],
  "totalChanges": 2
}
```

### diff_commits

Сравнение версий:

```json
{
  "commitA": "def456...",
  "commitB": "abc123...",
  "summary": {
    "added": 5,
    "modified": 12,
    "deleted": 2
  },
  "added": [{"key": "newEntity1"}, ...],
  "modified": [{"key": "changedEntity1"}, ...],
  "deleted": [{"key": "removedEntity1"}, ...]
}
```

### checkout_commit

Time travel — просмотр графа в прошлом:

```json
{
  "commit": {
    "hash": "def456...",
    "message": "Index: 30 files",
    "entityCount": 1200,
    "createdAt": "2024-01-10T09:00:00Z"
  },
  "entity": { "id": "e1a2b3c4", "name": "MyClass", "type": "class", ... }
}
```

## Интеграция

### DevAgent

После индексации автоматически создаётся graph commit:

```typescript
// В performRealIndexing() и handleIncrementalReindex()
const adapter = storage.getLibSQLAdapter();
if (adapter?.createGraphCommit) {
  const commitHash = await adapter.createGraphCommit(`Index: ${filesProcessed} files`);
}
```

### switch_branch

При переключении на feature branch инициализируется BranchDiffCache:

```typescript
// В SwitchBranchToolHandler.execute()
if (!baseBranches.includes(branchName)) {
  await adapter.initBranchDiff(baseBranch);
}
```

## Таблицы БД

### prolly_nodes

```sql
CREATE TABLE prolly_nodes (
  hash TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  ref_count INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
)
```

### graph_commits

```sql
CREATE TABLE graph_commits (
  commit_hash TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  root_node_hash TEXT NOT NULL,
  file_tree_hash TEXT,
  parent_hash TEXT,
  entity_count INTEGER NOT NULL,
  relationship_count INTEGER NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL
)
```

### branch_heads

```sql
CREATE TABLE branch_heads (
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_hash, branch_name)
)
```

## Производительность

| Операция | Сложность | Типичное время |
|----------|-----------|----------------|
| Построение дерева (1000 entities) | O(n log n) | ~50ms |
| Diff двух коммитов (1000 изменений) | O(log n + k) | ~30ms |
| История entity (50 коммитов) | O(k * log n) | ~100ms |
| Branch diff lookup | O(1) | <1ms |

## Интеграция с analyze_hotspots

Prolly Tree используется для расчёта `changeFrequency` в `analyze_hotspots`:

```typescript
// В AnalyzeHotspotsToolHandler.preloadChangeFrequencies():
// 1. Получаем коммиты за указанный период
const recentCommits = await commitManager.getCommitsSince(sinceTimestamp);

// 2. Сравниваем каждую пару коммитов
for (let i = 0; i < recentCommits.length - 1; i++) {
  const diff = await timeTravel.diffCommits(parent.commitHash, current.commitHash);
  // Подсчитываем изменения для каждой entity
}

// 3. Git fallback для entities без Prolly данных
const gitCount = getChangeFrequencyFromGit(filePath, lookbackDays);
```

**Параметры схемы:**
- `includeHistoricalMetrics` (default: true) — использовать историю для changeFrequency
- `lookbackDays` (default: 30) — период анализа в днях

**Результат:**
```json
{
  "changeFrequency": 5,
  "changeFrequencyScore": 17.92,
  "changeSource": "prolly" | "git" | "none"
}
```

## Тестирование

```bash
npm test -- src/storage/prolly/__tests__/
# 50 tests, 112 expect() calls
```

## Экспорты

```typescript
export { ProllyNodeStore, type NodeStoreConfig } from './node-store';
export { ProllyTree, serializeEntity, deserializeEntity } from './prolly-tree';
export { CommitManager } from './commit-manager';
export { BranchDiffCache, createCachedTombstoneGetter } from './branch-diff-cache';
export { TimeTravelManager } from './time-travel';
export * from './types';
```
