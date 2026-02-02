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
- **ParserAgent** (`src/agents/parser-agent.ts`) - AST-парсинг через нативные парсеры языков
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

## Parser Worker Pool System

**Generic Language Worker Pool** для параллельного парсинга файлов:

**Архитектура:**
- **SubprocessPool** (`src/agents/workers/parsing-subprocess-pool.ts`) - Subprocess pool management
- **GenericLanguageWorker** (`src/agents/workers/generic-language-worker.ts`) - Universal worker для всех 10 языков
- Автоматическое определение pool size на основе скорости парсинга языка:
  - Python: 4 workers (медленный: ~266ms/file)
  - TypeScript/JavaScript: 3 workers (средний: ~15-20ms/file)
  - Go/C: 2 workers (быстрый: ~10-15ms/file)

**Оптимизации:**
- **Streaming Mode**: Workers отправляют `streaming_result` после парсинга каждого файла → главный процесс индексирует сразу
- **Parallel Data Files**: JSON/YAML обрабатываются через `Promise.all` с chunking
- **Lazy initialization**: Pools создаются только для используемых языков
- **Smart threshold**: Workers активируются только для >50 файлов (предотвращает overhead)
- **Pool reuse**: Workers переиспользуются между сессиями индексации
- **Greedy Load Balancing**: Файлы сортируются по размеру и назначаются на worker с минимальной нагрузкой (0% deviation)
- **Async Prefetch**: PrefetchManager читает следующие 3 файла параллельно с парсингом (96-100% I/O overlap)
- **Parallel Pool Creation**: Все языковые пулы создаются через `Promise.all` (15ms vs 10+ сек)

**Performance (Centralized Embeddings + Optimized Chunks):**
- **ultrascript-tools-mcp (523 TS files):** **3.1 sec total** (~169 files/sec) 🚀
  - Parsing: ~2.6s (workersms), 18 chunks, 6 workers
  - Embeddings: centralized batching via Main process
  - **2.5x faster** vs decentralized (7.8s → 3.1s)
- **TypeScript parsing speed:** **130-140 files/sec** (было 16 files/sec decentralized)
  - **8x speedup** with centralized embeddings (no HTTP contention)
- **Optimal chunk size:** 40 files/chunk (vs 100 default)
  - More chunks = workers finish at different times = less IPC contention
  - **-19% totalms** (3830ms → 3100ms) compared to 100 files/chunk
- Data files (174 JSON/YAML): **34x speedup** (6.7s → 195ms, **892 files/sec**)
- **91-95%** файлов индексируется через streaming
- DB write speed: **11,300 entities/sec** (journal_mode=OFF, synchronous=OFF)
- Worker load balance: **0% deviation** (было 70%/30%)
- I/O overlap ratio: **96-100%** (I/O latency скрыта)

**Streaming Mode API:**
```typescript
// Enable streaming in ParserAgent
parserAgent.setStreamingMode(true, async (result, taskId, fileIndex, totalFiles) => {
  // Index immediately as results arrive
  await indexerAgent.indexEntities(result.entities, result.filePath, result.relationships);
});
```

**Конфигурация** (`config/production.yaml`):
```yaml
parser:
  agent:
    batchSize: 50          # Размер батча для worker pool
    workerPoolSize: 4      # Количество worker threads
```

### .ultrascriptignore

Файл `.ultrascriptignore` в корне проекта позволяет исключить файлы из индексации:

```gitignore
# Комментарии начинаются с #
**/lib/java/**       # Исключить директорию
**/go-ast-cli.go     # Исключить конкретный файл
**/test-fixtures/**  # Тестовые фикстуры
```

**Синтаксис:**
- Gitignore-style glob patterns (`**/`, `*.ext`)
- Комментарии начинаются с `#`
- Пустые строки игнорируются
- Паттерны без glob-символов автоматически оборачиваются в `**/{pattern}/**`

**Файлы:**
- `src/agents/dev/file-collector.ts` - `loadIgnoreFile()` функция
- Паттерны объединяются с базовыми `excludePatterns` из конфигурации

## Language Parsers

Поддержка языков через **нативные парсеры** (`src/parsers/`):

### Приоритет 0: TypeScript/JavaScript (in-process)
- **TypeScript Compiler API** - полная типизация, резолвинг, семантика
- `ts.createSourceFile()` для быстрого синтаксического парсинга
- `ts.createProgram()` + `TypeChecker` для полного анализа с типами
- `@angular/compiler` для Angular templates и компонентов

### Приоритет 1: Python (subprocess)
- **Python `ast` модуль** - `python -c "import ast; ..."` для базового AST
- **Pyright** (опционально) - полный type inference через `npx pyright`
- Требования: Python 3.8+

### Приоритет 2: Java/Kotlin (JAR)
- **JavaParser** - `java -jar javaparser-cli.jar` для Java AST
- **kotlin-compiler-embeddable** для Kotlin
- Требования: JRE 11+

### Приоритет 3: Другие языки
- **Go**: `go/parser` стандартная библиотека
- **Rust**: `syn` + `rust-analyzer`
- **C/C++**: `clang -Xclang -ast-dump=json`
- **Swift**: SwiftSyntax / SourceKit

Конфигурация языков: `src/parsers/language-configs.ts`

**Философия**: Разработчик, работающий с кодом на языке X, **всегда имеет** runtime/компилятор X.
Это устраняет проблемы с NODE_MODULE_VERSION, C++ компиляцией и 28MB prebuilds.

### Enhanced Parser Data (NEW)

Парсеры TypeScript, Python и Kotlin извлекают расширенные данные для семантического поиска:

**Извлекаемые данные:**
- **calls** - граф вызовов функций/методов с target, argumentCount, isAwait
- **controlFlow** - ветвления (if/switch), циклы (for/while), исключения (try/catch), await-точки
- **complexity** - cyclomatic, cognitive, linesOfCode, nestingDepth
- **documentation** - JSDoc/docstrings с description, params, returns, examples, deprecated
- **typeReferences** - используемые типы (для анализа зависимостей)

**Использование в semantic_search:**
```typescript
// Найти сложный код с высокой цикломатической сложностью
semantic_search({ query: "data processing", minCyclomatic: 10 })

// Найти async код без обработки ошибок
semantic_search({ query: "API calls", hasAwaits: true, hasExceptions: false })

// Найти недокументированный публичный API
semantic_search({ query: "export function", hasDocumentation: false })

// Найти код с большим количеством вызовов (потенциальные hotspots)
semantic_search({ query: "", minCallCount: 20 })
```

**Векторизация:**
Все эти данные включаются в embedding text для улучшенного семантического матчинга:
- Описания из документации
- Имена вызываемых функций
- Информация о сложности (для complex code)
- Информация о control flow (branches, loops, exceptions, awaits)

## Cross-Project Support (NEW)

MCP сервер поддерживает работу с **несколькими проектами** одновременно, каждый со своими изолированными базами данных.

### Архитектура

```
%LOCALAPPDATA%\UltraScriptTools\
├── config/
│   └── semantic-config.json       # Глобальная конфигурация
└── projects/
    ├── {hash1}/                   # Проект 1 (hash от пути)
    │   ├── graph.db               # Entity graph
    │   ├── vectors.db             # Embeddings
    │   └── meta.json              # Метаданные проекта
    └── {hash2}/                   # Проект 2
        ├── graph.db
        ├── vectors.db
        └── meta.json
```

### Использование

**Переключение через `index`:**
```typescript
// Индексация другого проекта автоматически переключает контекст
index({ directory: "D:\\другой\\проект" })
```

**Поиск в другом проекте через `projectPath`:**
```typescript
// semantic_search поддерживает projectPath для кросс-проектного поиска
semantic_search({
  query: "authentication",
  projectPath: "D:\\другой\\проект"
})
```

### Ключевые компоненты

- **ProjectContextManager** (`src/shared/project-context.ts`) - Singleton для управления контекстом проекта
- **getProjectSQLiteManager** (`src/storage/sqlite-manager.ts`) - Получение SQLiteManager для конкретного проекта
- **switchGlobalProjectContext** (`src/index.ts`) - Переключение глобального контекста между проектами
- **resetGraphStorage** (`src/storage/graph-storage-factory.ts`) - Сброс кэша GraphStorage при переключении

### Поведение

1. При указании `directory` в `index` или `projectPath` в `semantic_search`:
   - Автоматически создаётся/открывается БД для указанного проекта
   - Глобальный контекст переключается на новый проект
   - Все последующие операции работают с данными этого проекта

2. Данные каждого проекта **полностью изолированы** - изменения в одном проекте не влияют на другой

3. При переключении назад на предыдущий проект его данные сохранены и доступны

### Пример workflow

```typescript
// 1. Индексируем основной проект
index({ directory: "D:\\work\\main-project" })
// → Контекст: main-project, 8000 entities

// 2. Переключаемся на другой проект для анализа
index({ directory: "D:\\work\\other-project" })
// → Контекст: other-project, 50000 entities

// 3. Ищем в other-project
semantic_search({ query: "newsletter" })
// → Результаты из other-project

// 4. Возвращаемся к основному проекту
index({ directory: "D:\\work\\main-project", incremental: true })
// → Контекст: main-project, данные сохранены
```

## GPU/CUDA Worker Architecture (v2.5)

CUDA операции вынесены в отдельный worker-процесс для изоляции и стабильности:

### Архитектура

```
Main Process (MCP Server)
    ↓
GPU Backend Selector
    ↓
┌─────────────────────────────────────────┐
│  GPU Worker Subprocess                  │
│  ├── CUDA Backend (RTX/GTX)            │
│  ├── Dawn/WebGPU Backend (cross-platform)│
│  └── WASM SIMD Fallback                │
└─────────────────────────────────────────┘
```

### Компоненты

- **`src/gpu/backend-selector.ts`** - выбор GPU бэкенда по доступности
- **`src/gpu/backends/cuda-backend.ts`** - Native CUDA addon для NVIDIA
- **`src/gpu/backends/gpu-worker-backend.ts`** - Worker subprocess для изоляции
- **`external-tools/native/cuda/`** - C++ CUDA addon исходники

### Особенности

- **Изоляция crashes**: GPU ошибки не роняют основной MCP процесс
- **Blackwell detection**: CC ≥12.0 автоматически fallback на WASM SIMD
- **Windows `windowsHide`**: Скрытые консольные окна subprocess'ов
- **Graceful fallback**: CUDA → Dawn WebGPU → WASM SIMD → Pure JS

### Native модули

```
external-libs/
├── cuda-win32-x64/ultrascript_cuda.node
├── cuda-linux-x64/ultrascript_cuda.node
├── dawn-win32-x64/*.node
└── dawn-linux-x64/*.node
```

### Сборка CUDA модуля

```bash
npm run build:cuda        # Windows PowerShell
npm run build:cuda:debug  # Debug build
npm run build:cuda:clean  # Clean rebuild
```

Требования: CUDA Toolkit 12.x, cmake-js, node-addon-api

## Storage Layer

**libSQL-based unified storage** (`src/storage/`):

- **GraphStorageLibSQL** (`graph-storage-libsql.ts`) - основной интерфейс для entities/relationships/vectors
- **LibSQLGraphAdapter** (`libsql-graph-adapter.ts`) - адаптер для libSQL/Turso
- **BunSQLiteAdapter** (`bun-sqlite-adapter.ts`) - адаптер для Bun native SQLite
- **VectorStore** (`src/semantic/vector-store.ts`) - интеграция для семантического поиска
- **GraphStorageFactory** (`graph-storage-factory.ts`) - factory для создания storage

**Унифицированное хранилище** (`project.db`):
- Entities и relationships
- Vector embeddings (vectors таблица)
- **Aggressive pragmas** для максимальной скорости записи:
  - `journal_mode = OFF` - нет журнала (данные можно перегенерировать)
  - `synchronous = OFF` - нет fsync (11,300 entities/sec)
- Поддержка Turso edge database

## Semantic Search & Embeddings

Модульная система провайдеров эмбеддингов (`src/semantic/providers/`):

### Провайдеры и производительность

| Провайдер | Файл | Время/запрос | Batch | Рекомендация |
|-----------|------|-------------|-------|--------------|
| **ovms-native** | `ovms-provider.ts` | **0.8-2ms** | ✅ Native | ⭐ CPU/NPU, рекомендуется |
| **vllm** | `vllm-provider.ts` | 1-3ms | ✅ Native | ⭐ NVIDIA GPU Production |
| **tei** | `tei-provider.ts` | 5-15ms | ✅ Native | Альтернатива OVMS |
| **ollama** | `ollama-provider.ts` | 10-50ms | ❌ | Простая установка |
| **openai** | `openai-provider.ts` | 50-200ms | ✅ | Cloud API |
| **huggingface** | `huggingface-provider.ts` | 100-500ms | ❌ | Cloud API |

### OVMS Provider (v2.5 - Recommended)

**OVMS (OpenVINO Model Server)** - рекомендуемый провайдер эмбеддингов:

**Варианты:**
- `ovms-native` - локальный бинарник OVMS, автоматическое управление lifecycle
- `vllm` - Docker контейнер vLLM для NVIDIA GPU (высокая производительность)

**Файлы:**
- `src/semantic/providers/ovms-provider.ts` - провайдер для V3/V2 API
- `src/semantic/providers/ovms-grpc-client.ts` - gRPC клиент для V2 API
- `src/semantic/ovms-native-manager.ts` - lifecycle management OVMS процесса

**Особенности:**
- V3 OpenAI-compatible API (`/v3/embeddings`) - batch requests, base64 encoding
- V2 API fallback (`/v2/models/{model}/infer`) для legacy моделей
- Автоматическое завершение OVMS процесса при shutdown (taskkill /T на Windows)
- Поддержка моделей: jina-embeddings-v3, bge-m3, multilingual-e5-large

**Конфигурация:**
```yaml
embedding:
  platform: "ovms-native"  # или "vllm" для NVIDIA GPU
  ovms:
    endpoint: "http://127.0.0.1:8083"  # Native: 8083, Docker: 8082
    batch_size: 200
    ovms_mini_batch: 8
    target_device: "CPU"  # CPU, GPU, NPU
    useEmbeddingsApi: true  # V3 API
    encodingFormat: "base64"
```

### OpenVINO Provider (Legacy)

Локальный CPU провайдер с native batch inference:

```typescript
// Файл: src/semantic/providers/openvino-provider.ts
// Модели: all-MiniLM-L6-v2, bge-small-en-v1.5, multilingual-e5-small
// Устройства: CPU, GPU, AUTO (NPU не поддерживается)
```

**Установка:**
```bash
bun add openvino-node @xenova/transformers
```

### Benchmark English моделей — Large Entities (RTX 5090 + i9)

**Benchmark на 100 сущностях (крупнейшая: SemanticAgent 1253 lines) со Smart Chunker:**

#### Embedding Models (Реальные бенчмарки 2025-12-07)

| Rank | Провайдер | Модель | Chunks/s | ms/chunk | tok/s | Context | Рекомендация |
|------|-----------|--------|----------|----------|-------|---------|--------------|
| 1 | **OpenVINO CPU** | all-MiniLM-L6-v2 | **474** | **2.1ms** | **80,507** | 256 | 🏆 Fastest overall |
| 2 | OpenVINO CPU | paraphrase-multilingual | 161 | 6.2ms | 16,089 | 128 | 🌍 50+ языков |
| 3 | **Ollama GPU** | granite-embedding:30m | **123** | **8.1ms** | **34,685** | 512 | 🏆 Fast Ollama |
| 4 | OpenVINO CPU | gte-small | 87 | 11.5ms | 24,400 | 512 | Качество |
| 5 | OpenVINO CPU | multilingual-e5-small | 69 | 14.6ms | 19,290 | 512 | 🌍 94 языка |
| 6 | **Ollama GPU** | snowflake-arctic-embed2 | **15** | **65.4ms** | **9,968** | 8192 | 🏆 Best 8K |
| 7 | Ollama GPU | nomic-embed-text | 2 | 580.8ms | 1,123 | 8192 | ❌ Очень медленно |

**Ключевые выводы:**
- **OpenVINO MiniLM** — абсолютный лидер (474 chunks/s, 80K tok/s, CPU only!)
- **Ollama Granite:30m** — лучший Ollama для разработки (123 chunks/s)
- **Snowflake Arctic** — лучший для 8K контекста (15 chunks/s, full class embedding)
- **Nomic Embed** — НЕ РЕКОМЕНДУЕТСЯ (2 chunks/s, очень медленно)

**Рекомендации:**
- **Разработка (быстрая индексация)**: OpenVINO + all-MiniLM-L6-v2 (474 chunks/s)
- **Production (большие классы)**: Ollama + snowflake-arctic-embed2 (8K context)
- **Мультиязычный код (RU/CN)**: OpenVINO + multilingual-e5-small (69 chunks/s)
- **Простой setup**: Ollama + granite-embedding:30m (123 chunks/s)

**Ограничения OpenVINO:**
- Intel NPU не поддерживается для BERT моделей (masked_fill/Select)

### LLM модели для AutoDoc (генерация документации)

Конфигурация: `config/llm-models.json`

#### LLM Benchmark (2025-12-07, SemanticAgent 1253 lines)

| Модель | Provider | Size | tok/s | TTFT | Total | Output | Качество |
|--------|----------|------|-------|------|-------|--------|----------|
| **qwen3-coder:30b** | Ollama | 18GB | 12 | 32.87s | 75.6s | 3638 chars | 🏆 Excellent |
| deepseek-coder:6.7b | Ollama | 3.8GB | 10 | 12.71s | 51.3s | 1966 chars | Good |

#### OpenVINO LLM Models (config/llm-models.json)

| Модель | Размер | Контекст | Скорость CPU | Рекомендация |
|--------|--------|----------|--------------|--------------|
| **Qwen2.5-Coder-7B INT4** | 4GB | 32K | ~10 tok/s | 🏆 Лучшая для кода |
| **Phi-4-mini INT4** | 2.5GB | 16K | ~20 tok/s | ⚡ Быстрая + качество |
| **Phi-3-mini-128K INT4** | 2GB | 128K | ~18 tok/s | 📄 Ultra long context |
| **Qwen2.5-0.5B GGUF** | 350MB | 32K | ~90 tok/s | 🪶 Ultra compact |
| **Qwen3-4B NPU INT4** | 2.5GB | 8K | ~22 tok/s NPU | 💚 NPU optimized |

**Рекомендации по выбору:**
- **Best Quality**: `qwen3-coder:30b` — comprehensive docs (12 tok/s, 18GB VRAM)
- **Faster**: `deepseek-coder:6.7b` — 2x faster TTFT (10 tok/s, 4GB VRAM)
- **Ограниченная память (<4GB)**: `Qwen2.5-0.5B` через GGUF — 350MB, 90 tok/s
- **NPU (Intel Core Ultra)**: `Qwen3-4B` — официальная оптимизация, ~15W

**OpenVINO 2025.4 features:**
- **Qwen3-Embedding-0.6B** — новая embedding модель для RAG
- **Qwen3-30B-A3B MoE** — 30B качество при скорости 3B
- **Gemma-3-4B NPU** — новая поддержка NPU
- **Mistral-Small-24B** — Jan 2025 release
- Прямая поддержка GGUF файлов (без конвертации)
- NPU контекст до 10K токенов (было 8K)
- Structured output с XGrammar
- Tool calling + parsers для agentic AI
- Prefix caching для chat history
- См. `docs/NPU_WAITING.md`

Провайдер выбирается через `config/default.yaml`, CLI setup или `MCP_EMBEDDING_PROVIDER` env.

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
- `get_members` - список сущностей в файле (UltrasharpTools-совместимое имя)
- `query` - универсальный запрос к графу
- `get_graph_health` - диагностика БД
- `get_graph_stats` - статистика графа

**Code Modification:**
- `modify_code` - модификация кода сущности (UltrasharpTools-совместимое имя)
- `create_file` - создание файла с auto-parse в граф
- `rename_symbol` - переименование символа с обновлением ссылок
- `add_member` - добавление члена в класс/интерфейс
- `copy_file` - копирование файла с обновлением графа
- `rename_file` - переименование файла с обновлением импортов
- `split_file` - разделение файла на части
- `synthesize_files` - объединение файлов

**Code Validation:**
- `validate_file` - валидация файла (ESLint/Pylint)
- `validate_directory` - пакетная валидация директории

**Semantic analysis:**
- `semantic_search` - семантический поиск по коду с rich metadata
  - **Filters**: minCyclomatic, maxCyclomatic, hasExceptions, hasLoops, hasAwaits, hasDocumentation, isDeprecated, minCallCount
  - **Returns**: complexity metrics, control flow info, call counts, documentation status
- `find_duplicates` - поиск дубликатов (семантический, UltrasharpTools-совместимое имя)
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
- `undo` - откат к snapshot (UltrasharpTools-совместимое имя)
- `list_snapshots` - список доступных snapshot'ов
- `cleanup_snapshots` - очистка старых snapshot'ов

**Branch Management:**
- `list_branches` - список проиндексированных веток
- `switch_branch` - переключение активной ветки
- `get_branch_status` - статус текущей ветки
- `cleanup_branches` - очистка старых веток (LRU)
- `get_changed_files` - измененные файлы между ветками

**Tracing (статический анализ потока):**
- `trace_flow` - трассировка выполнения от A к B с анализом состояний
- `trace_backwards` - обратная трассировка (почему метод не вызывается?)
- `trace_data_flow` - трассировка потока данных к целевому состоянию
- `analyze_state_impact` - анализ влияния состояния на разные сценарии
- `find_decision_points` - поиск всех точек принятия решений

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
1. Определить нативный парсер языка (compiler API, CLI tool, LSP)
2. Создать анализатор в `src/parsers/<lang>-analyzer.ts`
3. Добавить конфиг в `src/parsers/language-configs.ts`
4. Добавить тесты в `tests/parsers/`
5. Обновить README с требованиями к runtime

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

**"Language runtime not found"**: Нативные парсеры требуют установленный runtime языка:
- TypeScript/JS: Node.js (уже есть)
- Python: `python --version` (3.8+)
- Java/Kotlin: `java --version` (JRE 11+)
- Go: `go version` (1.18+)

**"OpenVINO dependencies not installed"**: Установить зависимости:
```bash
bun add openvino-node @xenova/transformers
# Проверить: node -e "require('openvino-node')"
```

**"OpenVINO NPU не работает"**: NPU не поддерживает BERT модели (masked_fill/Select limitation). Используйте CPU:
```bash
bunx ultrascript-tools-mcp setup --provider openvino
# Выберите CPU device
```

**"OpenVINO batch reshape failed"**: Некоторые модели не поддерживают dynamic batch. Провайдер автоматически fallback на sequential inference.

## Bun Runtime Support

Проект поддерживает **Bun runtime** с автоматическим использованием оптимизированных API:

### Runtime Utilities (`src/utils/`)

| Модуль | Описание | Bun оптимизация |
|--------|----------|-----------------|
| `runtime.ts` | Определение runtime (Bun/Node/Deno), feature flags | - |
| `file-ops.ts` | Файловые операции | `Bun.file()`, `Bun.write()` |
| `shell.ts` | Shell команды, Git helpers | `Bun.$` API |
| `glob.ts` | Glob поиск файлов | `Bun.Glob` |

### Использование

```typescript
// Runtime detection
import { runtime, features } from "./utils/runtime.js";
if (runtime.isBun) { /* Bun-specific code */ }

// Optimized file ops
import { readText, writeFile, readJSON } from "./utils/file-ops.js";
const content = await readText("./file.txt");  // Uses Bun.file() under Bun

// Shell commands
import { exec, gitDiff, countFiles } from "./utils/shell.js";
const result = await exec("git status", { cwd: "/project" });

// Glob
import { glob, match } from "./utils/glob.js";
const files = await glob("**/*.ts", { cwd: "./src" });
```

### SQLite Support

`src/storage/sqlite-adapter.ts` уже поддерживает `bun:sqlite`:
- Автоматический выбор между `better-sqlite3` (Node) и `bun:sqlite` (Bun)
- API-совместимость через `BunDatabaseAdapter`
- SQLite производительность схожа (I/O bound)

### Benchmark Results (Node.js vs Bun)

| Операция | Speedup |
|----------|---------|
| File Read | 🚀 **1.3-1.8x** faster |
| fileExists | 🚀 **3.8x** faster |
| stat | 🚀 **1.4x** faster |
| readdir | 🚀 **1.4x** faster |
| glob | 🚀 **1.4-1.6x** faster |
| writeFile (small) | ~same |
| writeFile (>50KB, FileSink) | 🚀 **3-4x faster** |
| Startup time | 🚀 **1.5-1.8x** faster |
| HTTP fetch | 🚀 **1.7x** faster |
| SHA-256 (CryptoHasher) | 🚀 **2.8x** faster |

**Общий результат**: Bun быстрее в большинстве операций, особенно с FileSink для больших файлов.

Запуск бенчмарка:
```bash
npx tsx scripts/benchmark-runtime.ts  # Node.js
bun scripts/benchmark-runtime.ts       # Bun
npx tsx scripts/compare-benchmarks.ts  # Сравнение
```

### Документация

См. детальный план: `docs/development/bun-optimization-plan.md`

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
src/parsers/typescript-parser.ts      - TypeScript Compiler API парсер
src/parsers/python-parser.ts          - Python ast парсер (subprocess)
src/parsers/java-parser.ts            - JavaParser интеграция
config/default.yaml                   - Default configuration
package.json                          - Scripts and dependencies
tsup.config.ts                        - Build configuration (externals)
```

## Logs & Debugging

### Новая система логов (v3.0+)

**Формат с фиксированными позициями** для удобного парсинга:

```
20260107-143045.123 I 12345 a1b2c3d4 PARSER               file_parsed          file=/src/index.ts dur=45ms
```

**Использование в коде:**
```typescript
import { log } from "../logging/index.js";

log.i("PARSER", "file_parsed", { file: "index.ts", dur: 45 });
log.e("INDEXER", "batch_failed", { err: "timeout", retry: 2 });
log.w("EMBEDDING", "rate_limited", { wait: 1000 });
log.d("STORAGE", "cache_hit", { key: "abc123" });
log.t("QUERY", "sql_exec", { rows: 150 });
```

📖 **Полная документация**: [docs/LOGGING.md](./LOGGING.md)

### CLI: ulog (анализ логов)

```bash
# Установка (после сборки)
npm link

# Базовое использование
ulog logs/mcp-server.log              # Все логи
ulog -l E,W logs/                     # Только ERROR и WARN
ulog -m PARSER logs/server.log        # Только модуль PARSER
ulog -m "EMBED*" logs/                # Модули начинающиеся с EMBED

# Фильтр по времени
ulog --from 1h logs/server.log        # Последний час
ulog --from 30m logs/                 # Последние 30 минут
ulog --from "20260107-1400" logs/     # С конкретного времени
ulog -t 15m logs/server.log           # Короткая форма --from

# Фильтр по KV парам
ulog -k "dur>100" logs/server.log     # Операции дольше 100ms
ulog -k "err=*" logs/                 # Все записи с ошибками
ulog -k "retry>1" logs/               # С повторными попытками

# Вывод
ulog --stats logs/server.log          # Статистика по уровням/модулям
ulog -c logs/server.log               # Только количество
ulog -f logs/server.log               # Follow mode (tail -f)
ulog -o json logs/server.log          # JSON формат
ulog --fields "ts,module,err" logs/   # Только указанные поля

# Комбинированные фильтры
ulog -l E -m PARSER --from 1h -k "dur>50" logs/
```

### Расположение логов

```
Windows: %LOCALAPPDATA%\UltraScriptTools\logs\mcp-server-YYYY-MM-DD.log
Linux:   ~/.local/share/ultrascript-tools/logs/mcp-server-YYYY-MM-DD.log
macOS:   ~/Library/Application Support/ultrascript-tools/logs/mcp-server-YYYY-MM-DD.log
```

### Скрипт read-logs.ps1 (рекомендуется)

**ВАЖНО**: Используй этот скрипт вместо ручных PowerShell команд!

```powershell
# Из корня проекта:
.\scripts\read-logs.ps1 PERFORMANCE          # PERFORMANCE логи (последние 50)
.\scripts\read-logs.ps1 ERROR                # ERROR и FATAL
.\scripts\read-logs.ps1 PERFORMANCE -Lines 100   # Больше строк
.\scripts\read-logs.ps1 -Stats               # Статистика по категориям
.\scripts\read-logs.ps1 PERFORMANCE -Date 2025-12-24  # Конкретная дата

# Примеры вывода -Stats:
# By Level:
#   DEBUG         11801
#   INFO           4852
#   FATAL             3
# By Subcategory:
#   EMBEDDING          12503
#   PERFORMANCE         3499
#   CRASH                  3
```

### Быстрый поиск логов (PowerShell)

```powershell
# Найти сегодняшний лог
$log = "$env:LOCALAPPDATA\UltraScriptTools\logs\mcp-server-$(Get-Date -Format 'yyyy-MM-dd').log"

# Показать последние 100 строк
Get-Content $log -Tail 100

# Поиск по паттерну
Select-String -Path $log -Pattern "PERFORMANCE|ERROR|FATAL" | Select-Object -Last 50

# Только PERFORMANCE логи
Select-String -Path $log -Pattern "PERFORMANCE" | Select-Object -Last 30

# Поиск ошибок
Select-String -Path $log -Pattern "ERROR|FATAL|crash" -CaseSensitive:$false

# Статистика по категориям
Select-String -Path $log -Pattern "^\[.*\] \[(\w+)\]" |
  ForEach-Object { $_.Matches.Groups[1].Value } |
  Group-Object | Sort-Object Count -Descending
```

### PERFORMANCE логи (этапы эмбеддинга)

Формат: `[PERFORMANCE] <PHASE> | entities: N | ms: X | speed: X/s`

| Фаза | Описание |
|------|----------|
| `1_FILE_READ` | Чтение файлов и вычисление content hash |
| `2_COMMENT_EXTRACT` | Извлечение комментариев из файлов |
| `3_TEXT_BUILD` | Построение текстов для эмбеддинга |
| `4_EMBEDDING_GEN` | Генерация эмбеддингов через TEI/OVMS |
| `5_DB_INSERT` | Вставка в vector store |
| `6_INDEX_REBUILD` | Пересоздание индекса (bulk mode) |
| `BATCH_COMPLETE` | Итог по batch (50 entities) |
| `QUEUE_COMPLETE` | Итог по всей очереди |

**Пример вывода:**
```
[PERFORMANCE] 1_FILE_READ       | entities: 50 | ms: 12  | speed: 4166/s
[PERFORMANCE] 2_COMMENT_EXTRACT | entities: 50 | ms: 8   | speed: 6250/s
[PERFORMANCE] 3_TEXT_BUILD      | entities: 50 | ms: 3   | speed: 16666/s
[PERFORMANCE] 4_EMBEDDING_GEN   | entities: 50 | ms: 45  | speed: 1111/s
[PERFORMANCE] 5_DB_INSERT       | entities: 50 | ms: 15  | speed: 3333/s
[PERFORMANCE] BATCH_COMPLETE    | entities: 50 | totalMs: 83 | speed: 602/s
```

**Анализ производительности:**
```powershell
# Средняя скорость эмбеддинга
Select-String -Path $log -Pattern "4_EMBEDDING_GEN.*speed: (\d+)" |
  ForEach-Object { [int]$_.Matches.Groups[1].Value } |
  Measure-Object -Average -Maximum -Minimum

# Общая скорость очереди
Select-String -Path $log -Pattern "QUEUE_COMPLETE.*speed: (\d+)" |
  ForEach-Object { $_.Line }
```

### Уровни логирования

Конфигурация в `config/default.yaml`:
```yaml
logging:
  level: info        # trace, debug, info, warn, error
  fileLevel: debug   # уровень для файла (обычно ниже)
  maxFiles: 7        # ротация логов
  maxSizeMB: 50      # макс размер файла
```

## Documentation References

См. подробную документацию:
- [README.md](../README.md) - Полное описание возможностей
- [LOGGING.md](./LOGGING.md) - Система логирования и CLI ulog
- [BACKLOG.md](./BACKLOG.md) - Roadmap и задачи проекта
- [TEI_GRPC_MIGRATION_PLAN.md](./TEI_GRPC_MIGRATION_PLAN.md) - План миграции на gRPC
- [GPU_COMPATIBILITY.md](./GPU_COMPATIBILITY.md) - Совместимость GPU
- [MULTIPROCESS_ARCHITECTURE.md](./MULTIPROCESS_ARCHITECTURE.md) - Архитектура многопроцессности
