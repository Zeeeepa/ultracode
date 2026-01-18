# Потоки данных и сценарии использования

## Обзор

Документ описывает основные сценарии использования UltraScript Tools MCP и потоки данных между компонентами системы.

**Точки входа:**
- MCP Server: [src/index.ts](../src/index.ts)
- Tool Handlers: [📖 Tools AUTODOC](../src/tools/AUTODOC.md)
- Conductor: [📖 Agents AUTODOC](../src/agents/AUTODOC.md)

## Основные сценарии (User Stories)

### 1. Индексация кодовой базы

**Реализация:** [IndexToolHandler](../src/tools/handlers/index-tool-handler.ts) → [IndexerAgent](../src/agents/indexer-agent.ts)

**Сценарий**: Разработчик хочет проиндексировать проект для семантического поиска.

```
Пользователь                    MCP Server                     Агенты
    │                               │                              │
    │  index(directory, reset)      │                              │
    │──────────────────────────────>│                              │
    │                               │  1. Очистка графа (если reset)
    │                               │  2. Очистка векторов          │
    │                               │                              │
    │                               │  AgentTask(type="index")     │
    │                               │─────────────────────────────>│
    │                               │                              │
    │                               │         ParserAgent          │
    │                               │         ┌──────────┐         │
    │                               │         │ AST parse│         │
    │                               │         │ 10 langs │         │
    │                               │         └────┬─────┘         │
    │                               │              │               │
    │                               │         IndexerAgent         │
    │                               │         ┌──────────┐         │
    │                               │         │ SQLite   │         │
    │                               │         │ batch    │         │
    │                               │         └────┬─────┘         │
    │                               │              │               │
    │                               │         SemanticAgent        │
    │                               │         ┌──────────┐         │
    │                               │         │Embeddings│         │
    │                               │         │ vectors  │         │
    │                               │         └──────────┘         │
    │                               │                              │
    │  { entities: 6904,           │                              │
    │    relationships: 12000 }    │                              │
    │<──────────────────────────────│                              │
```

**Шаги**:
1. MCP клиент вызывает `index` с параметрами
2. При `reset=true` очищаются граф и векторное хранилище
3. ConductorOrchestrator создаёт задачу и распределяет по агентам
4. ParserAgent парсит файлы через нативные парсеры
5. IndexerAgent сохраняет сущности и связи в SQLite
6. SemanticAgent генерирует эмбеддинги для семантического поиска
7. Возвращается статистика индексации

### 2. Семантический поиск

**Реализация:** [SemanticToolHandlers](../src/tools/handlers/semantic-tool-handlers.ts) → [SemanticAgent](../src/agents/semantic-agent.ts)

**Сценарий**: Разработчик ищет код по смыслу, а не по точному совпадению.

```
Пользователь                    MCP Server                     Компоненты
    │                               │                              │
    │  semantic_search(             │                              │
    │    "обработка ошибок API"     │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   EmbeddingGenerator         │
    │                               │   ┌─────────────────┐        │
    │                               │   │ query → vector  │        │
    │                               │   │ (OpenVINO CPU)  │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   VectorStore (sqlite-vec)   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ cosine_distance │        │
    │                               │   │ top-K search    │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   HybridSearch               │
    │                               │   ┌─────────────────┐        │
    │                               │   │ combine scores  │        │
    │                               │   │ rank results    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  [                            │                              │
    │    { entity: "handleApiError",│                              │
    │      score: 0.92,             │                              │
    │      file: "src/api/errors.ts"│                              │
    │    }, ...                     │                              │
    │  ]                            │                              │
    │<──────────────────────────────│                              │
```

**Шаги**:
1. Запрос преобразуется в вектор через EmbeddingGenerator
2. VectorStore выполняет косинусный поиск по sqlite-vec
3. HybridSearch комбинирует векторный и текстовый поиск
4. Результаты ранжируются и возвращаются клиенту

### 3. Анализ влияния изменений

**Сценарий**: Разработчик хочет понять, что сломается при изменении функции.

```
Пользователь                    MCP Server                     Хранилище
    │                               │                              │
    │  analyze_code_impact(         │                              │
    │    entityId: "UserService",   │                              │
    │    depth: 3                   │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   GraphStorage               │
    │                               │   ┌─────────────────┐        │
    │                               │   │ 1. Find entity  │        │
    │                               │   │ 2. Get incoming │        │
    │                               │   │    references   │        │
    │                               │   │ 3. Traverse     │        │
    │                               │   │    depth levels │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  {                            │                              │
    │    directDependents: 5,       │                              │
    │    transitiveDependents: 23,  │                              │
    │    affectedFiles: [           │                              │
    │      "src/controllers/...",   │                              │
    │      "src/services/...",      │                              │
    │    ]                          │                              │
    │  }                            │                              │
    │<──────────────────────────────│                              │
```

### 4. Генерация документации (AutoDoc)

**Сценарий**: Разработчик хочет автоматически сгенерировать документацию для модулей.

```
Пользователь                    MCP Server                     Компоненты
    │                               │                              │
    │  autodoc_generate(            │                              │
    │    useLlm: true,              │                              │
    │    preview: false             │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   1. Сканирование модулей    │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Поиск index.ts  │        │
    │                               │   │ Группировка     │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   2. Анализ экспортов        │
    │                               │   ┌─────────────────┐        │
    │                               │   │ GraphStorage    │        │
    │                               │   │ relationships   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   3. LLM генерация           │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Ollama API      │        │
    │                               │   │ qwen3-coder     │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   4. Сохранение .md          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ AUTODOC.md      │        │
    │                               │   │ per module      │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  { generated: 53 files }      │                              │
    │<──────────────────────────────│                              │
```

### 5. Обнаружение дубликатов кода

**Сценарий**: Разработчик ищет повторяющийся код для рефакторинга.

```
Пользователь                    MCP Server                     Компоненты
    │                               │                              │
    │  detect_code_clones(          │                              │
    │    minSimilarity: 0.8         │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   VectorStore                │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Get all vectors │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   Similarity Matrix          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Pairwise cosine │        │
    │                               │   │ distance calc   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   Clustering                 │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Group similar   │        │
    │                               │   │ entities        │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  [                            │                              │
    │    { similarity: 0.95,        │                              │
    │      entities: [              │                              │
    │        "validateUser",        │                              │
    │        "validateAdmin"        │                              │
    │      ]                        │                              │
    │    }, ...                     │                              │
    │  ]                            │                              │
    │<──────────────────────────────│                              │
```

### 6. Переключение Git-веток

**Реализация:** [BranchToolHandlers](../src/tools/handlers/branch-tool-handlers.ts) → [GraphStorageLibSQL.setProject():92](../src/storage/graph-storage-libsql.ts#L92)

**Сценарий**: Разработчик переключается на feature-ветку и хочет сохранить актуальный индекс.

```
Пользователь                    MCP Server                     Storage
    │                               │                              │
    │  switch_branch(               │                              │
    │    "feature/auth"             │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   1. Resolve parent branch   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ git merge-base  │        │
    │                               │   │ → find "main"   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   2. Create layer DB         │
    │                               │   ┌─────────────────┐        │
    │                               │   │ feature-auth.db │        │
    │                               │   │ (inherits main) │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   3. Detect changed files    │
    │                               │   ┌─────────────────┐        │
    │                               │   │ git diff main.. │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   4. Incremental index       │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Parse changed   │        │
    │                               │   │ Add tombstones  │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  { branch: "feature/auth",    │                              │
    │    newEntities: 23,           │                              │
    │    deletedEntities: 5 }       │                              │
    │<──────────────────────────────│                              │
```

### 7. Multi-Project работа

**Сценарий**: Разработчик работает с несколькими проектами одновременно.

```
Пользователь                    MCP Server                     Storage
    │                               │                              │
    │  index(                       │                              │
    │    directory: "/project-a"    │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   setProject("/project-a")   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ project-a.db    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  index(                       │                              │
    │    directory: "/project-b"    │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   setProject("/project-b")   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ project-b.db    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  semantic_search(             │                              │
    │    query: "auth",             │                              │
    │    projectPath: "/project-a"  │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   Switch to project-a.db     │
    │                               │   Search in that context     │
    │<──────────────────────────────│                              │
```

## Потоки данных между агентами

### Публикация событий через KnowledgeBus

```
ParserAgent                    KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("entity:parsed",     │                              │
    │    { entity, file })          │                              │
    │──────────────────────────────>│                              │
    │                               │  notify IndexerAgent         │
    │                               │─────────────────────────────>│
    │                               │  notify SemanticAgent        │
    │                               │─────────────────────────────>│
    │                               │                              │

IndexerAgent                   KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("index:completed",   │                              │
    │    { stats })                 │                              │
    │──────────────────────────────>│                              │
    │                               │  notify SemanticAgent        │
    │                               │─────────────────────────────>│
    │                               │                              │

SemanticAgent                  KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("semantic:ready",    │                              │
    │    { vectorCount })           │                              │
    │──────────────────────────────>│                              │
    │                               │  notify QueryAgent           │
    │                               │─────────────────────────────>│
```

### Топики KnowledgeBus

| Топик | Издатель | Подписчики | Описание |
|-------|----------|------------|----------|
| `entity:parsed` | ParserAgent | IndexerAgent, SemanticAgent | Новая сущность распарсена |
| `entity:modified` | DevAgent | SemanticAgent | Сущность изменена |
| `index:completed` | IndexerAgent | SemanticAgent | Индексация завершена |
| `semantic:embeddings:complete` | SemanticAgent | QueryAgent | Эмбеддинги готовы |
| `file:changed` | DevAgent | ParserAgent | Файл изменён (инкрементальная индексация) |

## Жизненный цикл запроса

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MCP Client Request                            │
│                         (Claude Code, IDE, etc.)                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCP Server (src/index.ts)                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Валидация JSON-RPC                                          │    │
│  │  2. Роутинг на tool handler                                     │    │
│  │  3. Zod валидация параметров                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tool Handler Layer                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  IndexToolHandler / QueryToolHandler / etc.                     │    │
│  │  - Создание AgentTask                                           │    │
│  │  - Делегирование ConductorOrchestrator                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ConductorOrchestrator                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Приоритизация задачи                                        │    │
│  │  2. Выбор агента по типу задачи                                 │    │
│  │  3. Backpressure контроль (ResourceManager)                     │    │
│  │  4. Координация параллельного выполнения                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │  Parser   │ │  Indexer  │ │ Semantic  │
            │   Agent   │ │   Agent   │ │   Agent   │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └─────────────┼─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Storage Layer                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │    GraphStorage      │  │    VectorStore       │                     │
│  │    (SQLite)          │  │    (sqlite-vec)      │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ PROCESSES.md](./processes.md) — технические процессы
- [→ DEPENDENCIES.md](./dependencies.md) — зависимости
