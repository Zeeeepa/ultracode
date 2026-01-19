# Архитектура UltraScript Tools MCP

## Обзор

**UltraScript Tools MCP Server** — многоагентный LiteRAG MCP-сервер для продвинутого анализа кодовых графов с семантическими возможностями. Сервер реализует 30+ MCP-методов для анализа кодовых баз на 10 языках программирования.

**Ключевые возможности:**
- Многоагентная архитектура с координацией через ConductorOrchestrator
- Семантический поиск на основе векторных эмбеддингов
- Поддержка 10 языков программирования через нативные парсеры
- Инкрементальная индексация с поддержкой веток Git
- AutoDoc — автоматическая генерация документации

## Основные компоненты

### ConductorOrchestrator

[→ src/agents/conductor-orchestrator.ts](../src/agents/conductor-orchestrator.ts) | [📖 AUTODOC](../src/agents/AUTODOC.md)

Центральный координатор всех агентов. Распределяет задачи между специализированными агентами, управляет их жизненным циклом и обеспечивает backpressure при перегрузке.

**Ключевые методы:**
| Метод | Строка | Описание |
|-------|--------|----------|
| `register()` | [:193](../src/agents/conductor-orchestrator.ts#L193) | Регистрация агента в оркестраторе |
| `processTask()` | [:164](../src/agents/conductor-orchestrator.ts#L164) | Делегирование задачи агенту |
| `checkAgentHealth()` | [:276](../src/agents/conductor-orchestrator.ts#L276) | Мониторинг состояния агентов |

**Зависимости:**
- [KnowledgeBus](#knowledgebus) — pub/sub шина для межагентного взаимодействия
- [ResourceManager](#resourcemanager) — управление лимитами памяти/CPU
- [DIContainer](#dicontainer) — Dependency Injection

### Агенты

[📖 Полный AUTODOC агентов](../src/agents/AUTODOC.md)

| Агент | Файл | Роль | Детали |
|-------|------|------|--------|
| **ParserAgent** | [→ parser-agent.ts](../src/agents/parser-agent.ts) | AST-парсинг через нативные парсеры | 10 языков |
| **IndexerAgent** | [→ indexer-agent.ts](../src/agents/indexer-agent.ts) | Индексация в SQLite, батчинг | [→ indexer/](../src/agents/indexer/AUTODOC.md) |
| **SemanticAgent** | [→ semantic-agent.ts](../src/agents/semantic-agent.ts) | Эмбеддинги, векторный поиск | [→ semantic/](../src/agents/semantic/AUTODOC.md) |
| **QueryAgent** | [→ query-agent.ts](../src/agents/query-agent.ts) | Запросы к графу | hybrid search |
| **DoraAgent** | [→ dora-agent.ts](../src/agents/dora-agent.ts) | Анализ метрик | complexity |
| **DevAgent** | [→ dev-agent.ts](../src/agents/dev-agent.ts) | Инкрементальная индексация | [→ dev/](../src/agents/dev/AUTODOC.md) |
| **MergeAgent** | [→ merge-agent.ts](../src/agents/merge-agent.ts) | Семантический merge | AI suggestions |

Все агенты наследуются от `BaseAgent` ([→ base.ts:15](../src/agents/base.ts#L15)) с унифицированным lifecycle.

### KnowledgeBus

[→ knowledge-bus.ts](../src/core/knowledge-bus.ts) | [📖 Core AUTODOC](../src/core/AUTODOC.md)

Pub/sub шина для асинхронной коммуникации между агентами.

| Метод | Строка | Описание |
|-------|--------|----------|
| `publish()` | [:53](../src/core/knowledge-bus.ts#L53) | Публикация в топик |
| `subscribe()` | [:93](../src/core/knowledge-bus.ts#L93) | Подписка на топик |

**Топики:**
- `entity:parsed` — ParserAgent → IndexerAgent, SemanticAgent
- `entity:modified` — DevAgent → SemanticAgent
- `index:completed` — IndexerAgent → SemanticAgent
- `semantic:embeddings:complete` — SemanticAgent → QueryAgent

### ResourceManager

[→ resource-manager.ts](../src/core/resource-manager.ts)

Управление ресурсами системы:
- Лимиты памяти и CPU
- Backpressure при перегрузке агентов
- Динамическая настройка concurrency

### DIContainer

[→ di-container.ts](../src/core/di-container.ts)

Dependency Injection контейнер:
- Singleton/Transient service lifetimes
- Circular dependency detection
- Type-safe agent resolution
- Automatic disposal on shutdown

### Storage Layer

[📖 Полный AUTODOC storage](../src/storage/AUTODOC.md)

| Компонент | Файл | Ключевой метод |
|-----------|------|----------------|
| **GraphStorageLibSQL** | [→ graph-storage-libsql.ts](../src/storage/graph-storage-libsql.ts) | [`setProject():92`](../src/storage/graph-storage-libsql.ts#L92), [`getAllRelationships():407`](../src/storage/graph-storage-libsql.ts#L407) |
| **LibSQLGraphAdapter** | [→ libsql-graph-adapter.ts](../src/storage/libsql-graph-adapter.ts) | [→ libsql/](../src/storage/libsql/AUTODOC.md) |
| **VectorStore** | [→ vector-store.ts](../src/semantic/vector-store.ts) | cosine search |
| **BatchOperations** | [→ batch-operations-libsql.ts](../src/storage/batch-operations-libsql.ts) | batch INSERT |
| **CacheManager** | [→ cache-manager.ts](../src/storage/cache-manager.ts) | LRU cache |

### Branch Layers Storage

Система поддерживает **layered storage** для работы с Git-ветками:

```
main branch (base layer)
    │
    ├── feature/auth (layer 1)
    │       │
    │       └── feature/auth-oauth (layer 2)
    │
    └── feature/api (layer 1)
```

**Принцип работы:**
- Каждая ветка создаёт свой "слой" поверх родительской
- **Tombstones** — маркеры удаления: если сущность удалена в feature-ветке, она помечается как tombstone, а не удаляется из base layer
- **Наследование**: запросы агрегируют данные из всех слоёв с учётом tombstones
- **CTE-оптимизация**: `getAllRelationships()` использует Common Table Expressions для эффективной выборки

```sql
-- Пример CTE для layered query
WITH RECURSIVE branch_chain AS (
  SELECT branch_id, parent_id FROM branches WHERE branch_id = ?
  UNION ALL
  SELECT b.branch_id, b.parent_id FROM branches b
  JOIN branch_chain bc ON b.branch_id = bc.parent_id
)
SELECT e.* FROM entities e
JOIN branch_chain bc ON e.branch_id = bc.branch_id
WHERE e.id NOT IN (SELECT entity_id FROM tombstones WHERE branch_id = ?)
```

### Semantic Layer

[📖 AUTODOC semantic agent](../src/agents/semantic/AUTODOC.md)

| Компонент | Файл | Описание |
|-----------|------|----------|
| **EmbeddingGenerator** | [→ embedding-generator.ts](../src/semantic/embedding-generator.ts) | Генерация эмбеддингов |
| **HybridSearch** | [→ hybrid-search.ts](../src/semantic/hybrid-search.ts) | Vector + text поиск |
| **SmartChunker** | [→ smart-chunker.ts](../src/semantic/smart-chunker.ts) | AST-aware chunking |
| **VectorIndexManager** | [→ vector-index-manager.ts](../src/agents/semantic/vector-index-manager.ts) | FAISS индексы |

**Провайдеры эмбеддингов** ([→ providers/](../src/semantic/providers/)):

| Провайдер | Файл | Скорость | Устройство |
|-----------|------|----------|------------|
| OVMS | [ovms-provider.ts](../src/semantic/providers/ovms-provider.ts) | 1000+ ch/s | CPU/GPU |
| TEI | [tei-provider.ts](../src/semantic/providers/tei-provider.ts) | 1000+ ch/s | GPU |
| Ollama | [ollama-provider.ts](../src/semantic/providers/ollama-provider.ts) | 100-300 ch/s | CPU/GPU |
| Transformers | [transformers-provider.ts](../src/semantic/providers/transformers-provider.ts) | 200 ch/s | CPU |
| vLLM | [vllm-provider.ts](../src/semantic/providers/vllm-provider.ts) | 500+ ch/s | GPU |

**AutoDoc Enrichment** ([→ autodoc/AUTODOC.md](../src/autodoc/AUTODOC.md)): Семантический поиск обогащается документацией — результаты включают описания из `.autodoc/` файлов.

### Parser Layer

[→ src/parsers/](../src/parsers/)

Поддержка 10 языков через нативные парсеры:

| Язык | Парсер | Runtime |
|------|--------|---------|
| TypeScript/JavaScript | TypeScript Compiler API | Node.js |
| Python | `ast` модуль + Pyright | Python 3.8+ |
| Java | JavaParser | JRE 11+ |
| Kotlin | kotlin-compiler-embeddable | JRE 11+ |
| Go | go/parser | Go 1.18+ |
| Rust | syn + rust-analyzer | Rust |
| C/C++ | clang -ast-dump | Clang |
| Swift | SwiftSyntax | Swift |
| C# | Roslyn | .NET |
| Bash | tree-sitter | Node.js |

## Потоки данных

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Client Request                          │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MCP Server (src/index.ts)                      │
│                    Tool routing & validation                        │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ConductorOrchestrator                            │
│              Task delegation & agent coordination                   │
└───────┬─────────────┬─────────────┬─────────────┬───────────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Parser  │  │ Indexer │  │Semantic │  │  Query  │
   │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │
   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
        │             │             │             │
        └──────────────────┬────────┴─────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SQLite Storage Layer                             │
│           GraphStorage + VectorStore (vectors.db)                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Multi-Project Support

Сервер поддерживает работу с несколькими проектами одновременно:

- Каждый проект имеет изолированный индекс (отдельная БД)
- Переключение между проектами через `setProject()`
- Поддержка cross-project поиска через `semantic_search` с параметром `projectPath`

## Структура модулей

### src/
- **agents**: ~25 файлов — многоагентная система (conductor, workers, semantic)
- **analysis**: ~5 файлов — анализ кода (chaos, complexity, hotspots)
- **autodoc**: ~15 файлов — автодокументация (generator, llm, parser)
- **cli**: 1 файл — CLI команды
- **config**: 3 файла — конфигурация
- **core**: 8 файлов — ядро системы (DI, Bus, Resource Manager)
- **cpu**: 1 файл — CPU детекция
- **gpu**: 1 файл — GPU детекция и бэкенды
- **layered**: 12 файлов — слоистая индексация веток
- **merge**: 3 файла — семантический merge
- **modification**: 3 файла — модификация кода
- **parsers**: 37 файлов — парсеры языков
- **query**: 4 файла — запросы к графу
- **semantic**: 9 файлов — семантический слой
- **storage**: ~10 файлов — LibSQL storage с branch layers
- **tools**: ~25 файлов — MCP tool handlers
- **types**: 11 файлов — TypeScript типы
- **utils**: 15 файлов — утилиты

## Ключевые решения

| Решение | Обоснование |
|---------|-------------|
| SQLite вместо PostgreSQL | Простота, нет внешних зависимостей, портативность |
| Нативные парсеры | Полная типизация, точный AST, без node-gyp проблем |
| Многоагентная архитектура | Разделение ответственности, параллельная обработка |
| Pub/Sub через KnowledgeBus | Слабая связанность агентов, масштабируемость |
| OVMS/TEI для эмбеддингов | Высокопроизводительный inference, 1000+ chunks/s |
| Subprocess pool с Map-tracking | Защита от race condition при IPC, поддержка Bun/Node.js |

## Связанные документы

- [→ PROCESSES.md](./PROCESSES.md) — технические процессы
- [→ DEPENDENCIES.md](./DEPENDENCIES.md) — зависимости
- [→ DEPLOYMENT.md](./DEPLOYMENT.md) — сборка и деплой
- [→ GLOSSARY.md](./GLOSSARY.md) — термины и определения
