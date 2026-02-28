# Prolly Tree — Версионируемое хранилище графа

## Назначение

Prolly Tree (Probabilistic B-Tree) решает ключевые проблемы производительности при работе с графом кода:

| Проблема | Старое решение | Prolly Tree |
|----------|----------------|-------------|
| Startup проекта | Полный glob scan O(n) | Проверка root hash O(1) |
| Чтение на feature branch | Tombstone SQL query на каждое чтение | O(1) lookup в кэше |
| Diff между ветками | Полное сканирование | O(log n) сравнение деревьев |
| История изменений | Невозможно | Time travel запросы |

## Быстрый старт

```typescript
import { LibSQLGraphAdapter } from "./storage/libsql-graph-adapter";

const adapter = new LibSQLGraphAdapter();
await adapter.initialize("./graph.db");

// Установка контекста проекта
adapter.setProjectContext({ projectHash: "abc123", branchName: "main" });
adapter.setProllyContext("abc123", "main");

// После индексации — создаём версионный снимок
await adapter.insertEntities(entities);
const commitHash = await adapter.createGraphCommit("Initial indexing");

// При работе с feature branch
adapter.setProjectContext({
  projectHash: "abc123",
  branchName: "feature/api",
  baseBranch: "main"
});
adapter.setProllyContext("abc123", "feature/api");
await adapter.initBranchDiff("main");  // O(1) проверки готовы
```

## Ключевые концепции

### Content-Addressed Storage

Каждый узел дерева идентифицируется хешем своего содержимого (xxHash64):

```
Содержимое узла → xxHash64 → content_hash (первичный ключ)
```

**Следствие:** одинаковые данные = один узел в БД = автоматическая дедупликация.

### Structural Sharing

При изменении одной entity пересоздаются только узлы на пути к корню:

```
       Версия 1              Версия 2
          │                     │
       ┌──┴──┐               ┌──┴──┐
       │root │               │root'│  ← новый
       └──┬──┘               └──┬──┘
      ┌───┴───┐             ┌───┴───┐
      ▼       ▼             ▼       ▼
    ┌───┐   ┌───┐         ┌───┐   ┌───┐
    │ A │   │ B │         │ A │   │ B'│  ← изменён
    └───┘   └───┘         └───┘   └───┘
      ↑                     ↑
      └─────────────────────┘
         Один экземпляр!
```

### Probabilistic Chunking

Детерминированное разбиение на узлы по хешу ключа:

```typescript
// Разбиение когда последние 12 бит хеша = 0
// Вероятность ~1/4096, средний размер chunk ~4KB
if ((keyHash & 0xFFF) === 0) {
  createNewNode();
}
```

**Результат:** одинаковые данные → одинаковая структура дерева → эффективный diff.

## Компоненты системы

### 1. ProllyNodeStore — Хранилище узлов

```typescript
const store = new ProllyNodeStore();
await store.initialize(client);

// Сохранить узел (возвращает content hash)
const hash = await store.put({ type: "leaf", data: cbor, entryCount: 10 });

// Получить узел
const node = await store.get(hash);
```

### 2. ProllyTree — B-дерево

```typescript
const tree = new ProllyTree(nodeStore);
await tree.initialize();

// Построить из entities
const entries = entities.map(e => ({ key: e.id, value: serializeEntity(e) }));
const rootHash = await tree.build(entries);

// Diff между версиями (O(log n))
tree.setRootHash(oldRoot);
const diff = await tree.diff(newRoot);
// { added: [...], modified: [...], deleted: [...] }
```

### 3. CommitManager — Версионирование

```typescript
const commits = new CommitManager();
await commits.initialize(client);
commits.setContext(projectHash, branchName);

// Создать коммит
const commit = await commits.commit(rootHash, null, { entityCount: 1000 });

// История
const history = await commits.getHistory(100);
```

### 4. BranchDiffCache — Кэш для веток

```typescript
const cache = new BranchDiffCache(nodeStore, commitManager);
await cache.initForBranch("main", "feature/api");

// O(1) проверки
cache.isDeleted(entityId);  // true/false
cache.isAdded(entityId);
cache.isModified(entityId);
```

## Схема БД

```sql
-- Узлы дерева (content-addressed)
CREATE TABLE prolly_nodes (
  content_hash TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,  -- 'internal' | 'leaf'
  data BLOB,
  children_hashes TEXT,
  key_range_start TEXT,
  key_range_end TEXT,
  entry_count INTEGER,
  created_at INTEGER
);

-- Коммиты (версии графа)
CREATE TABLE graph_commits (
  commit_hash TEXT PRIMARY KEY,
  project_hash TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  parent_hash TEXT,
  root_node_hash TEXT NOT NULL,
  message TEXT,
  entity_count INTEGER,
  created_at INTEGER
);

-- Указатели веток на HEAD
CREATE TABLE branch_heads (
  project_hash TEXT,
  branch_name TEXT,
  commit_hash TEXT,
  PRIMARY KEY (project_hash, branch_name)
);
```

## Типичные сценарии

### Индексация проекта

```typescript
// 1. Парсинг файлов и создание entities
const entities = await parseProject(projectPath);

// 2. Сохранение в БД
await adapter.insertEntities(entities);

// 3. Создание версионного снимка
await adapter.createGraphCommit("Full project index");
```

### Работа с feature branch

```typescript
// 1. Переключение контекста
adapter.setProjectContext({
  projectHash,
  branchName: "feature/new-api",
  baseBranch: "main"
});
adapter.setProllyContext(projectHash, "feature/new-api");

// 2. Инициализация diff cache
await adapter.initBranchDiff("main");

// 3. Все операции чтения автоматически учитывают diff
const entity = await adapter.getEntity(id);  // O(1) проверка удаления
```

### Time Travel

```typescript
const timeTravel = new TimeTravelManager(nodeStore, commitManager);

// Найти entity в старом коммите
const oldEntity = await timeTravel.getEntityAt(entityId, commitHash);

// История изменений entity
const history = await timeTravel.getEntityHistory(entityId);
// [{ commit, change: 'added', entity }, { commit, change: 'modified', entity }]
```

## Производительность

| Метрика | Значение |
|---------|----------|
| Build tree | O(n log n) |
| Get by key | O(log n) |
| Diff | O(k log n), k = изменений |
| Branch check | O(1) |
| Storage overhead | ~10 bytes/entity |

**Реальные цифры (100k entities):**
- Build: ~500ms
- Diff 1000 изменений: ~10ms
- Storage: ~10MB для узлов

## Тестирование

```bash
npm test -- src/storage/prolly/__tests__/
# 42 теста, 91 assertion, ~300ms
```

## Файлы

```
src/storage/prolly/
├── types.ts           # Интерфейсы
├── node-store.ts      # Content-addressed storage
├── prolly-tree.ts     # B-tree + diff
├── commit-manager.ts  # Версионирование
├── branch-diff-cache.ts # O(1) кэш
├── time-travel.ts     # Time travel API
└── index.ts           # Экспорты

src/core/
├── file-merkle.ts         # Merkle tree для файлов
└── merkle-file-tracker.ts # Интеграция с FileWatcher
```

## Ограничения

1. **Первый коммит обязателен** — diff cache работает только между коммитами
2. **Memory при большом diff** — кэш хранит все ID изменений в памяти
3. **Нет автоматической GC** — старые узлы не удаляются автоматически

## FAQ

**Q: Когда создавать коммиты?**
A: После каждой значимой операции индексации (batch insert, delete by file).

**Q: Нужно ли вызывать initBranchDiff на main?**
A: Нет, только на feature branches с baseBranch.

**Q: Как очистить старые коммиты?**
A: `commitManager.pruneHistory(keepCount)` — оставляет последние N коммитов.
