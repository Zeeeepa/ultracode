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

[→ src/agents/conductor-orchestrator.ts](../src/agents/conductor-orchestrator.ts)

Центральный координатор всех агентов. Распределяет задачи между специализированными агентами, управляет их жизненным циклом и обеспечивает backpressure при перегрузке.

**Зависимости:**
- [KnowledgeBus](#knowledgebus) — pub/sub шина для межагентного взаимодействия
- [ResourceManager](#resourcemanager) — управление лимитами памяти/CPU
- [DIContainer](#dicontainer) — Dependency Injection

### Агенты

| Агент | Файл | Роль |
|-------|------|------|
| **ParserAgent** | [→ src/agents/parser-agent.ts](../src/agents/parser-agent.ts) | AST-парсинг через нативные парсеры языков |
| **IndexerAgent** | [→ src/agents/indexer-agent.ts](../src/agents/indexer-agent.ts) | Индексация графов в SQLite, батчинг операций |
| **SemanticAgent** | [→ src/agents/semantic-agent.ts](../src/agents/semantic-agent.ts) | Векторные эмбеддинги, семантический поиск |
| **QueryAgent** | [→ src/agents/query-agent.ts](../src/agents/query-agent.ts) | Выполнение запросов к графу |
| **DoraAgent** | [→ src/agents/dora-agent.ts](../src/agents/dora-agent.ts) | Анализ метрик и сложности |
| **DevAgent** | [→ src/agents/dev-agent.ts](../src/agents/dev-agent.ts) | Инкрементальная индексация, файловые операции |

Все агенты наследуются от `BaseAgent` ([→ src/agents/base.ts](../src/agents/base.ts)) с унифицированным lifecycle.

### KnowledgeBus

[→ src/core/knowledge-bus.ts](../src/core/knowledge-bus.ts)

Pub/sub шина для асинхронной коммуникации между агентами. Поддерживает топики:
- `entity:modified` — изменение сущности
- `index:completed` — завершение индексации
- `semantic:embeddings:complete` — завершение генерации эмбеддингов

### ResourceManager

[→ src/core/resource-manager.ts](../src/core/resource-manager.ts)

Управление ресурсами системы:
- Лимиты памяти и CPU
- Backpressure при перегрузке агентов
- Динамическая настройка concurrency

### DIContainer

[→ src/core/di-container.ts](../src/core/di-container.ts)

Dependency Injection контейнер:
- Singleton/Transient service lifetimes
- Circular dependency detection
- Type-safe agent resolution
- Automatic disposal on shutdown

### Storage Layer

| Компонент | Файл | Описание |
|-----------|------|----------|
| **GraphStorage** | [→ src/storage/graph-storage.ts](../src/storage/graph-storage.ts) | Основной интерфейс для entities/relationships |
| **SQLiteManager** | [→ src/storage/sqlite-manager.ts](../src/storage/sqlite-manager.ts) | Singleton для управления SQLite соединением |
| **VectorStore** | [→ src/semantic/vector-store.ts](../src/semantic/vector-store.ts) | sqlite-vec интеграция для семантического поиска |
| **BatchOperations** | [→ src/storage/batch-operations.ts](../src/storage/batch-operations.ts) | Батчинг для массовых вставок |

### Semantic Layer

| Компонент | Файл | Описание |
|-----------|------|----------|
| **EmbeddingGenerator** | [→ src/semantic/embedding-generator.ts](../src/semantic/embedding-generator.ts) | Генерация эмбеддингов через провайдеры |
| **HybridSearch** | [→ src/semantic/hybrid-search.ts](../src/semantic/hybrid-search.ts) | Комбинированный текстовый + векторный поиск |
| **SmartChunker** | [→ src/semantic/smart-chunker.ts](../src/semantic/smart-chunker.ts) | Интеллектуальное разбиение кода на чанки |

**Провайдеры эмбеддингов** ([→ src/semantic/providers/](../src/semantic/providers/)):
- `openvino-provider.ts` — CPU, самый быстрый (1.3ms/запрос)
- `tei-provider.ts` — NVIDIA GPU через Docker
- `ollama-provider.ts` — простая установка
- `memory-provider.ts` — без ML (hash-based)

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

## Структура модулей

### src/
- **agents**: 11 файлов — многоагентная система
- **analysis**: 1 файл — анализ кода
- **autodoc**: 2 файла — автодокументация
- **cli**: 1 файл — CLI команды
- **config**: 3 файла — конфигурация
- **core**: 8 файлов — ядро системы (DI, Bus, Resource Manager)
- **cpu**: 1 файл — CPU детекция
- **gpu**: 1 файл — GPU детекция и бэкенды
- **layered**: 12 файлов — слоистая индексация веток
- **merge**: 1 файл — семантический merge
- **modification**: 3 файла — модификация кода
- **parsers**: 37 файлов — парсеры языков
- **query**: 4 файла — запросы к графу
- **semantic**: 9 файлов — семантический слой
- **storage**: 8 файлов — SQLite storage
- **tools**: 10 файлов — MCP tool handlers
- **types**: 11 файлов — TypeScript типы
- **utils**: 15 файлов — утилиты

## Ключевые решения

| Решение | Обоснование |
|---------|-------------|
| SQLite вместо PostgreSQL | Простота, нет внешних зависимостей, портативность |
| Нативные парсеры | Полная типизация, точный AST, без node-gyp проблем |
| Многоагентная архитектура | Разделение ответственности, параллельная обработка |
| Pub/Sub через KnowledgeBus | Слабая связанность агентов, масштабируемость |
| OpenVINO для эмбеддингов | CPU inference, не требует GPU, 474 chunks/s |

## Связанные документы

- [→ PROCESSES.md](./PROCESSES.md) — технические процессы
- [→ DEPENDENCIES.md](./DEPENDENCIES.md) — зависимости
- [→ DEPLOYMENT.md](./DEPLOYMENT.md) — сборка и деплой
- [→ GLOSSARY.md](./GLOSSARY.md) — термины и определения
