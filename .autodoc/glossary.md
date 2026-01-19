# Глоссарий терминов

## A

### Agent (Агент)
Специализированный компонент системы, выполняющий определённый тип задач. Наследуется от `BaseAgent` и имеет унифицированный жизненный цикл (initialize → process → dispose).

### AST (Abstract Syntax Tree)
Абстрактное синтаксическое дерево — структурированное представление исходного кода, используемое парсерами для извлечения сущностей и связей.

### AutoDoc
Подсистема автоматической генерации документации. Создаёт AUTODOC.md файлы для каждого модуля на основе анализа кода и опционально LLM.

## B

### Backpressure
Механизм защиты от перегрузки. При превышении лимитов (память, очередь задач) система замедляет приём новых запросов или отклоняет их.

### Branch Layers
Слоистое хранилище для Git-веток. Каждая feature-ветка создаёт свой слой поверх родительской, изменения накапливаются без модификации base layer.

### Batch Operations
Пакетная обработка — группировка множества операций (INSERT, UPDATE) в одну транзакцию для повышения производительности.

## C

### Chunking (Чанкинг)
Разбиение текста или кода на части (chunks) для обработки. SmartChunker учитывает AST структуру для сохранения семантической целостности.

### ConductorOrchestrator
Центральный координатор агентов. Распределяет задачи, управляет приоритетами и обеспечивает backpressure.

### Cosine Distance (Косинусное расстояние)
Метрика сходства векторов, используемая в семантическом поиске. Значения от 0 (идентичны) до 2 (противоположны).

### CTE (Common Table Expression)
Общее табличное выражение — SQL конструкция для создания временных именованных результатов. Используется в Branch Layers для эффективной агрегации данных из нескольких слоёв.

## D

### DIContainer
Dependency Injection контейнер — паттерн для управления зависимостями между компонентами. Поддерживает singleton и transient lifetimes.

## E

### Embedding (Эмбеддинг)
Векторное представление текста в многомерном пространстве. Позволяет измерять семантическое сходство между фрагментами кода.

### Entity (Сущность)
Базовая единица кодового графа: функция, класс, интерфейс, тип, переменная и т.д. Имеет уникальный ID, тип, имя и код.

## F

### FQN (Fully Qualified Name)
Полное квалифицированное имя символа, включающее путь: `MyNamespace.MyClass.myMethod`.

### FTS5
Full-Text Search 5 — расширение SQLite для полнотекстового поиска с поддержкой токенизации и ранжирования.

## G

### Graph Storage
Хранилище кодового графа в SQLite. Содержит сущности, связи и метаданные файлов.

## H

### Hybrid Search (Гибридный поиск)
Комбинация векторного (семантического) и текстового (FTS) поиска для повышения точности результатов.

## I

### Incremental Indexing
Инкрементальная индексация — обновление только изменённых файлов вместо полной переиндексации.

### IR Model (Intermediate Representation)
Промежуточное представление модели в формате OpenVINO (.xml + .bin), оптимизированное для inference на CPU.

## K

### KnowledgeBus
Pub/Sub шина для асинхронной коммуникации между агентами. Поддерживает топики и подписчиков.

## L

### LiteRAG
Lightweight Retrieval-Augmented Generation — архитектурный паттерн для семантического поиска без тяжёлых зависимостей.

### Layer (Слой)
Изолированный уровень данных в Branch Layers. Каждая Git-ветка создаёт свой layer, который наследует данные от родительского.

### LibSQL
Форк SQLite с дополнительными возможностями (репликация, HTTP API). Используется как основное хранилище с поддержкой branch layers.

### LRU Cache
Least Recently Used Cache — кэш с вытеснением наименее используемых элементов.

## M

### MCP (Model Context Protocol)
Протокол взаимодействия между LLM клиентами (Claude, IDE) и серверами инструментов. Основан на JSON-RPC.

## N

### Native Parser
Парсер, использующий родной инструментарий языка (TypeScript Compiler API, Python ast, go/parser и т.д.) вместо универсальных парсеров.

## O

### onMessage Handler
Обработчик IPC-сообщений от воркера. Получает `ParseResponse` и сопоставляет результаты с задачами через `pendingTasks: Map<taskId, PendingTask>`.

### OpenVINO
Intel Open Visual Inference and Neural network Optimization — фреймворк для CPU inference моделей машинного обучения.

## P

### ParsingSubprocessPool
Пул подпроцессов для параллельного парсинга кода. Поддерживает Bun и Node.js рантаймы, IPC коммуникацию через V8 serialization, динамическое масштабирование воркеров.

### PendingTask
Структура `{resolve, reject}` для хранения колбеков незавершённой задачи парсинга. Хранится в `Map<taskId, PendingTask>` для защиты от race condition при конкурентной обработке чанков.

### Provider (Провайдер)
Реализация интерфейса для генерации эмбеддингов: OVMS, TEI, Ollama, Transformers, vLLM.

## R

### Relationship (Связь)
Направленная связь между сущностями в графе: imports, extends, implements, calls, uses, contains.

### ResourceManager
Компонент управления ресурсами системы: память, CPU, лимиты очередей.

### RRF (Reciprocal Rank Fusion)
Алгоритм объединения результатов из разных источников поиска с учётом позиций в ранжированных списках.

## S

### Semantic Search
Семантический поиск — поиск по смыслу, а не по точному совпадению текста. Основан на сравнении векторных эмбеддингов.

### SmartChunker
Компонент интеллектуального разбиения кода на чанки с учётом AST структуры и контекста.

### Snapshot
Снимок состояния файлов для возможности отката изменений. Хранится в `.ultrasharp/snapshots/` или через git stash.

### SubprocessState
Состояние воркера в ParsingSubprocessPool: ID, процесс, `pendingTasks: Map<taskId, PendingTask>`, статистика (обработано задач, память, время). Ключевой механизм для корректного сопоставления IPC-ответов с задачами.

### sqlite-vec
Расширение SQLite для хранения и поиска векторов с использованием SIMD оптимизаций.

## T

### TEI (Text Embeddings Inference)
Сервер HuggingFace для генерации эмбеддингов с поддержкой GPU через Docker.

### Tombstone
Маркер удаления в Branch Layers. Вместо физического удаления сущности из родительского слоя, в текущем слое создаётся tombstone-запись, указывающая что сущность удалена.

### Tool Handler
Обработчик MCP инструмента. Наследуется от `BaseToolHandler`, валидирует параметры через Zod и выполняет логику.

## V

### Vector Store
Хранилище векторных эмбеддингов. Использует sqlite-vec для эффективного поиска ближайших соседей.

### VectorLite
Альтернативный бэкенд для векторного хранилища с поддержкой различных индексов.

## Z

### Zod
Библиотека валидации схем для TypeScript. Используется для валидации параметров MCP инструментов.

---

## Аббревиатуры

| Аббревиатура | Расшифровка |
|--------------|-------------|
| AST | Abstract Syntax Tree |
| CPU | Central Processing Unit |
| CTE | Common Table Expression |
| DI | Dependency Injection |
| FQN | Fully Qualified Name |
| FTS | Full-Text Search |
| GPU | Graphics Processing Unit |
| IPC | Inter-Process Communication |
| IR | Intermediate Representation |
| JSON-RPC | JSON Remote Procedure Call |
| LLM | Large Language Model |
| LRU | Least Recently Used |
| MCP | Model Context Protocol |
| NPU | Neural Processing Unit |
| RAG | Retrieval-Augmented Generation |
| RRF | Reciprocal Rank Fusion |
| SIMD | Single Instruction Multiple Data |
| TEI | Text Embeddings Inference |

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ PROCESSES.md](./processes.md) — технические процессы
- [→ DEPENDENCIES.md](./dependencies.md) — зависимости
