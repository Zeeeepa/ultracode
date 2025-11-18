# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UltraScript Tools MCP Server** - Multi-agent LiteRAG MCP server для продвинутого анализа кодовых графов с семантическими возможностями. Сервер реализует 24 MCP-метода для анализа кодовых баз на 10 языках программирования с использованием архитектуры на основе агентов.

## Build & Development Commands

```bash
# Сборка проекта
npm run build                 # Компиляция TypeScript через tsup
npm run build:watch          # Watch-режим для разработки
make package                 # Сборка NPM-пакета с проверками метаданных

# Проверка кода
npm run typecheck            # TypeScript проверка типов
npm run lint                 # Биом линтинг
npm run lint:fix             # Автофикс линт-ошибок
npm run format               # Форматирование кода через Biome

# Тестирование
npm test                     # Запуск всех тестов Jest
npm run test:verbose         # Подробный вывод тестов
npm run test:watch           # Watch-режим для тестов
npm run test:coverage        # Генерация покрытия кода
npm run test:quiet           # Тихий режим (минимальный вывод)

# Запуск MCP сервера
ultrascript-tools-mcp <directory>                    # Анализ кодовой базы
ultrascript-tools-mcp --config config/dev.yaml <dir> # С кастомной конфигурацией
ultrascript-tools-mcp --help                         # Справка по CLI
ultrascript-tools-mcp --version                      # Версия сервера

# One-shot индексация из CLI (debug)
node dist/index.js /path/to/project '{"jsonrpc":"2.0","id":"index-1","method":"tools/call","params":{"name":"index","arguments":{"directory":"/path/to/project","incremental":false,"fullScan":true,"reset":true}}}'
```

## Multi-Agent Architecture

Проект использует **многоагентную архитектуру LiteRAG** с координацией через `ConductorOrchestrator`:

### Ключевые агенты
- **ParserAgent** (`src/agents/parser-agent.ts`) - AST-парсинг через tree-sitter для 10 языков
- **IndexerAgent** (`src/agents/indexer-agent.ts`) - Индексация графов в SQLite, батчинг операций
- **SemanticAgent** (`src/agents/semantic-agent.ts`) - Векторные эмбеддинги, семантический поиск
- **QueryAgent** (`src/agents/query-agent.ts`) - Выполнение запросов к графу, оптимизация
- **DoraAgent** (`src/agents/dora-agent.ts`) - Специализированный анализ метрик и сложности
- **DevAgent** (`src/agents/dev-agent.ts`) - Инкрементальная индексация, файловые операции
- **ConductorOrchestrator** (`src/agents/conductor-orchestrator.ts`) - Координатор всех агентов, распределение задач

### Координация агентов
- **ResourceManager** (`src/core/resource-manager.ts`) - Управление лимитами памяти/CPU, backpressure
- **KnowledgeBus** (`src/core/knowledge-bus.ts`) - Pub/sub шина для межагентного взаимодействия
- **DIContainer** (`src/core/di-container.ts`) - Dependency Injection контейнер для управления агентами
- **AgentRegistry** (`src/core/agent-registry.ts`) - Автоматическая регистрация агентов в DI контейнере
- Все агенты наследуются от `BaseAgent` (`src/agents/base.ts`) с унифицированным lifecycle

### Dependency Injection Container (NEW)

**DI Container** (`src/core/di-container.ts`) предоставляет централизованное управление зависимостями:

**Возможности:**
- ✅ Singleton/Transient service lifetimes
- ✅ Circular dependency detection
- ✅ Type-safe agent resolution
- ✅ Automatic disposal on shutdown
- ✅ Global container instance

**Использование:**
```typescript
import { getGlobalContainer } from "./core/di-container.js";
import { registerAllAgents, getOrCreateAgent } from "./core/agent-registry.js";

// Initialize container and register all agents
const container = getGlobalContainer();
await registerAllAgents(container);

// Resolve agents through container
const devAgent = await getOrCreateAgent(container, conductor, AgentType.DEV);
const semanticAgent = await getOrCreateAgent(container, conductor, AgentType.SEMANTIC);
```

**Agent Registry** (`src/core/agent-registry.ts`) автоматически регистрирует все агенты:
- DevAgent, SemanticAgent, DoraAgent, ParserAgent, IndexerAgent, QueryAgent
- Lazy initialization - агенты создаются только при первом запросе
- Интеграция с ConductorOrchestrator

## Parser Worker Pool System (NEW)

**Generic Language Worker Pool** для параллельного парсинга файлов:

**Архитектура:**
- **LanguageWorkerPool** (`src/agents/workers/language-worker-pool.ts`) - Generic pool для любого языка
- **GenericLanguageWorker** (`src/agents/workers/generic-language-worker.ts`) - Universal worker для всех 10 языков
- Автоматическое определение pool size на основе скорости парсинга языка:
  - Python: 4 workers (медленный: ~266ms/file)
  - TypeScript/JavaScript: 3 workers (средний: ~15-20ms/file)
  - Go/C: 2 workers (быстрый: ~10-15ms/file)

**Оптимизации:**
- **Lazy initialization**: Pools создаются только для используемых языков
- **Smart threshold**: Workers активируются только для >50 файлов (предотвращает overhead)
- **Pool reuse**: Workers переиспользуются между сессиями индексации

**Performance:**
- Большие проекты (152 файла): **1.22x speedup** (96.3s → 78.9s)
- Малые проекты (40 файлов): Threshold предотвращает overhead

**Конфигурация** (`config/production.yaml`):
```yaml
parser:
  agent:
    batchSize: 50          # Размер батча для worker pool
    workerPoolSize: 4      # Количество worker threads
```

## Language Parsers

Поддержка 10 языков через tree-sitter анализаторы (`src/parsers/`):

- **TypeScript/JavaScript** (`tree-sitter-parser.ts`) - полная поддержка ES6+, JSX, TSX
- **Python** (`python-analyzer.ts`) - async/await, декораторы, магические методы (40+)
- **C/C++** (`c-analyzer.ts`, `cpp-analyzer.ts`) - функции, структуры, классы, шаблоны
- **C#** (`csharp-analyzer.ts`) - классы, интерфейсы, LINQ, async/await
- **Rust** (`rust-analyzer.ts`) - функции, структуры, traits, impl-блоки
- **Go** (`go-analyzer.ts`) - пакеты, горутины, интерфейсы
- **Java** (`java-analyzer.ts`) - классы, рекорды (Java 14+), дженерики
- **VBA** (`vba-analyzer.ts`) - модули, функции (regex-based)

Конфигурация языков: `src/parsers/language-configs.ts`

## Storage Layer

**SQLite-based graph storage** (`src/storage/`):

- **GraphStorage** (`graph-storage.ts`) - основной интерфейс для entities/relationships
- **SQLiteManager** (`sqlite-manager.ts`) - singleton для управления SQLite соединением
- **VectorStore** (`src/semantic/vector-store.ts`) - sqlite-vec интеграция для семантического поиска
- **BatchOperations** (`batch-operations.ts`) - батчинг для массовых вставок
- **SchemaMigrations** (`schema-migrations.ts`) - миграции схемы БД

База данных: `vectors.db` (WAL mode), хранит entities, relationships, embeddings.

## Semantic Search & Embeddings

Модульная система провайдеров эмбеддингов (`src/semantic/providers/`):

- **memory** - in-memory fallback (без ML)
- **transformers** - локальные модели через @xenova/transformers
- **ollama** - локальные LLM (llama2, mistral, etc.)
- **openai** - OpenAI API (text-embedding-ada-002)
- **cloudru** - CloudRu API

Провайдер выбирается через `config/default.yaml` или `MCP_EMBEDDING_PROVIDER` env.

## Configuration System

**YAML-based configuration** (`config/`):
- `default.yaml` - базовые настройки
- `development.yaml` - настройки для разработки
- `production.yaml` - production оптимизации
- `cloud_prod.yaml` - cloud-specific настройки

Конфигурация загружается через `ConfigLoader` (`src/config/yaml-config.ts`) с поддержкой env-переменных:
- `MCP_EMBEDDING_PROVIDER` - провайдер эмбеддингов
- `MCP_USE_PARSER` - включить/выключить ParserAgent
- `MCP_DEV_INDEX_BATCH` - размер батча для индексации
- `MCP_DEBUG_DISABLE_SEMANTIC` - отключить семантический агент (для отладки)

## MCP Tools Structure

30+ MCP-методов реализованы в `src/index.ts` + `src/tools/`:

**Core indexing:**
- `index` - индексация кодовой базы
- `clean_index` - полная переиндексация
- `reset_graph` - очистка графа

**Graph queries:**
- `get_graph` - получение графа сущностей
- `list_entity_relationships` - связи сущности
- `list_file_entities` - список сущностей в файле
- `query` - универсальный запрос к графу
- `get_graph_health` - диагностика БД
- `get_graph_stats` - статистика графа

**Unified Tools (cross-compatibility with UltrasharpTools):**
- `get_members` - alias для list_file_entities
- `find_duplicates` - alias для detect_code_clones
- `modify_code` - alias для modify_entity_code
- `undo` - alias для rollback_snapshot
- `create_file` - создание файла с auto-parse в граф
- `rename_symbol` - переименование символа с обновлением ссылок
- `add_member` - добавление члена в класс/интерфейс

**Code Modification:**
- `modify_entity_code` - модификация кода сущности
- `copy_file` - копирование файла с обновлением графа
- `rename_file` - переименование файла с обновлением импортов
- `split_file` - разделение файла на части
- `synthesize_files` - объединение файлов

**Code Validation:**
- `validate_file` - валидация файла (ESLint/Pylint)
- `validate_directory` - пакетная валидация директории

**Semantic analysis:**
- `semantic_search` - семантический поиск по коду
- `detect_code_clones` - поиск дубликатов (семантический)
- `jscpd_detect_clones` - JSCPD-based поиск дубликатов (без эмбеддингов)
- `find_similar_code` - поиск похожего кода
- `suggest_refactoring` - AI рефакторинг
- `pattern_search` - продвинутый поиск (entity/content/semantic/hybrid)

**Advanced analysis:**
- `analyze_code_impact` - анализ влияния изменений
- `analyze_hotspots` - поиск горячих точек (complexity/changes/coupling)
- `find_related_concepts` - поиск связанных концепций
- `cross_language_search` - поиск по нескольким языкам
- `analyze_state_chaos` - анализ хаоса в управлении состоянием
- `detect_technology_stack` - определение технологического стека
- `lerna_project_graph` - граф Lerna workspace зависимостей

**Version Management:**
- `create_snapshot` - создание snapshot для rollback
- `rollback_snapshot` - откат к snapshot
- `list_snapshots` - список доступных snapshot'ов
- `cleanup_snapshots` - очистка старых snapshot'ов

**Branch Management:**
- `list_branches` - список проиндексированных веток
- `switch_branch` - переключение активной ветки
- `get_branch_status` - статус текущей ветки
- `cleanup_branches` - очистка старых веток (LRU)
- `get_changed_files` - измененные файлы между ветками

**Monitoring:**
- `get_version` - версия сервера
- `get_metrics` - системные метрики
- `get_agent_metrics` - метрики агентов
- `get_bus_stats` - статистика knowledge bus
- `clear_bus_topic` - очистка топика bus

## Testing Infrastructure

**Jest-based testing** с поддержкой ES modules:

```bash
# Тесты находятся в
tests/                   # Основные интеграционные тесты
src/**/__tests__/        # Unit-тесты рядом с кодом
tests/fixtures/          # Тестовые данные

# Конфигурация тестов
jest.config.js           # Jest config с ESM support
jest.setup.js            # Глобальные моки и setup
tsconfig.test.json       # TypeScript config для тестов
```

Особенности:
- `maxWorkers: 1` - тесты запускаются последовательно (SQLite constraints)
- Моки: `src/__mocks__/` - nanoid, p-limit, connection-pool
- Coverage threshold: стремиться к сохранению текущего уровня покрытия

## Key Architectural Patterns

1. **Multi-agent coordination**: задачи делегируются через `ConductorOrchestrator` → специализированные агенты
2. **Provider pattern**: эмбеддинги через абстракцию `EmbeddingProvider` с множественными реализациями
3. **Singleton storage**: `SQLiteManager`, `GraphStorage` через factory для консистентности
4. **Pub/Sub bus**: `KnowledgeBus` для асинхронной коммуникации агентов
5. **Backpressure handling**: `AgentBusyError` с `retryAfterMs` hints когда агенты перегружены
6. **Deterministic IDs**: SHA256-based стабильные ID для entities/relationships

## Working with Native Modules

**better-sqlite3** - нативный модуль, требует rebuild при несовпадении `NODE_MODULE_VERSION`:

```bash
# Автоматический rebuild начиная с v2.6.4
# При ручной необходимости:
npm rebuild better-sqlite3
```

**sqlite-vec extension** - опциональное ускорение векторного поиска:
- Автоматически включается если доступен
- Graceful fallback на чистый SQLite если недоступен

## Common Development Tasks

**Добавление нового языка:**
1. Установить tree-sitter грамматику: `npm install tree-sitter-<lang>`
2. Создать анализатор в `src/parsers/<lang>-analyzer.ts`
3. Добавить конфиг в `src/parsers/language-configs.ts`
4. Добавить тесты в `tests/parsers/`

**Добавление нового MCP-метода:**
1. Определить схему в `src/index.ts` (zod schema)
2. Добавить handler в switch case (строка ~1000+)
3. Реализовать логику в `src/tools/` если сложная
4. Добавить интеграционный тест
5. Обновить README.md с описанием метода

**Добавление нового embedding провайдера:**
1. Создать класс в `src/semantic/providers/<name>-provider.ts`
2. Имплементировать `EmbeddingProvider` интерфейс
3. Зарегистрировать в `src/semantic/providers/factory.ts`
4. Добавить тесты в `src/semantic/__tests__/`

## Performance Considerations

- **Батчинг**: используйте `BatchOperations` для массовых вставок (1000+ записей)
- **Incremental parsing**: включен по умолчанию через `IncrementalParser` (LRU cache 1000 файлов)
- **Query optimization**: `QueryOptimizer` автоматически оптимизирует сложные запросы
- **Connection pooling**: пул соединений для параллельных read-операций
- **Agent limits**: настраивайте `maxConcurrency` в конфиге для баланса performance/memory

## Troubleshooting

**"Native module mismatch"**: см. выше про better-sqlite3 rebuild

**"Legacy database missing columns"**: удалить `vectors.db` для clean rebuild или запустить миграции

**"Agent saturation"**: увеличить `maxConcurrent` в конфиге или обработать `AgentBusyError` с retry

**"JSCPD не находит дубликаты"**: проверить `minLines`/`minTokens` параметры, JSCPD требует минимум 5 строк

**"Семантический поиск не работает"**: проверить `MCP_EMBEDDING_PROVIDER` env и настройки в `config/default.yaml`

## Code Style

- **TypeScript strict mode** включен (`tsconfig.json`)
- **Biome** для линтинга и форматирования (`.biome.json`)
- **Naming conventions**: kebab-case файлы, PascalCase классы, camelCase переменные
- **Git hooks**: pre-commit запускает `lint-staged` + `typecheck`

## Important Files

```
src/index.ts                          - MCP server entry point, tool definitions
src/agents/conductor-orchestrator.ts  - Multi-agent coordinator
src/storage/graph-storage.ts          - Graph database interface
src/semantic/embedding-generator.ts   - Embedding pipeline
config/default.yaml                   - Default configuration
package.json                          - Scripts and dependencies
```

## Documentation References

См. подробную документацию:
- [README.md](./README.md) - Полное описание возможностей
- [AGENTS_CODEX.md](./AGENTS_CODEX.md) - Руководство для агентов по репозиторию
- [docs/guides/](./docs/guides/) - Детальные гайды (если существуют)
