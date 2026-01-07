# История разработки UltraScript Tools MCP

Документ описывает ключевые этапы разработки проекта, задачи и их решения.

---

## Октябрь 2025

### 06.10 - Начальная стабилизация
- **Проблема**: Нестабильная работа tree-sitter парсеров
- **Решение**: Фиксы парсеров, добавление тестов, cleanup скриптов
- **Коммиты**: `0bf05ae`, `1043893`, `e484b1c`

### 12.10 - Провайдеры эмбеддингов (v2.6.0)
- **Задача**: Добавить поддержку разных провайдеров эмбеддингов
- **Реализовано**:
  - YAML-driven конфигурация парсеров/индексера
  - Provider-based эмбеддинги (OVMS, TEI, Ollama)
  - sqlite-vec vector store
  - Детерминированные ID для entities (SHA256)
- **Коммиты**: `07cc076`, `1c49bde`, `d00eee1`

### 14-23.10 - Нормализация путей и конфигурации
- **Проблема**: Проблемы с путями на Windows, переопределение конфигов не работало
- **Решение**: Нормализация путей в MCP tools, исправление config overrides
- **Коммиты**: `8c4a780`, `23035f9`

---

## Ноябрь 2025

### 18.11 - Переименование и публикация (v1.0.0)
- **Задача**: Подготовка к публикации в npm
- **Реализовано**:
  - Переименование в `ultrascript-tools-mcp`
  - Унифицированные tool aliases (совместимость с UltrasharpTools)
  - Поддержка PowerShell/Bash/Batch скриптов
  - Centralized embeddings setup
- **Коммиты**: `4d75475`, `bb3c661`, `55a8025`, `8527d38`, `6969ff2`

### 18.11 - Реструктуризация проекта
- **Задача**: Организация структуры директорий
- **Реализовано**:
  - `scripts/`, `tests/`, `benchmarks/` — отдельные директории
  - `external-tools/` для WASM и native sources
  - `docs/` для документации
- **Коммиты**: `b111dd5`, `c9cc286`, `028e4a5`, `7fe0d76`

### 18.11 - Build fixes (Unicode, paths)
- **Проблема**: build.cmd падал из-за Unicode символов в cmd.exe
- **Решение**: Замена Unicode баннера на ASCII, исправление путей к external-tools
- **Коммиты**: `5a90845`, `34425d2`, `03a6188`, `2ce7c78`, `303d5e7`, `67366b1`, `33422b9`, `4ee1167`

### 19.11 - Зависимости и совместимость
- **Проблема**: tree-sitter не работал с Node.js 24 (C++20)
- **Решение**: Патч tree-sitter, обновление zod до v4
- **Коммиты**: `ed233ca`, `e018f5d`, `9ad09d5`

### 27-30.11 - Новая архитектура процессов
- **Задача**: Оптимизация для Bun runtime
- **Реализовано**:
  - Новая process architecture с worker pools
  - npm build & run fixes
  - Bun оптимизации
- **Коммиты**: `56b7098`, `c549bc5`, `d9997fd`, `282ab39`, `21892d3`

---

## Декабрь 2025

### 02.12 - Нативные парсеры (v2.0.2)

**Задача**: Убрать зависимость от tree-sitter

**Проблема**: Tree-sitter требовал:
- C++ компиляцию при установке
- 28MB prebuilds
- NODE_MODULE_VERSION несовместимость между Node и Bun
- Проблемы на Windows с Visual Studio

**Анализ альтернатив**:
| Подход | Плюсы | Минусы |
|--------|-------|--------|
| Tree-sitter | Универсальный | C++ компиляция, prebuilds |
| Нативные парсеры | Нет native deps | Требуют runtime языка |
| WASM | Кросс-платформенность | Медленнее, больше bundle |

**Решение — нативные парсеры языков**:
- TypeScript: Compiler API (`ts.createSourceFile()`)
- Python: `ast` модуль через subprocess
- Java/Kotlin: JavaParser JAR
- Go: `go/parser` стандартная библиотека

**Философия**: Разработчик, работающий с кодом на языке X, **всегда имеет** runtime/компилятор X.

**Коммиты**: `2f494e8`, `ffa31fc`, `862299d`, `ceb6029`, `ca53f04`, `989a15c`, `da932ab`, `f3dc644`, `54e6ac0`

---

### 06-07.12 - AutoDoc и LLM setup

**Задача**: Автогенерация документации для кода

**Реализовано**:
- AutoDoc feature с LLM бэкендом
- JSON парсинг и связывание комментариев с кодом
- Setup wizard для выбора LLM провайдера

**Бенчмарки LLM моделей (07.12)**:

Тестирование на SemanticAgent (1253 строки):

| Модель | Provider | Size | tok/s | TTFT | Качество |
|--------|----------|------|-------|------|----------|
| qwen3-coder:30b | Ollama | 18GB | 12 | 32.87s | Excellent |
| deepseek-coder:6.7b | Ollama | 3.8GB | 10 | 12.71s | Good |

**Тестирование NPU на Intel Core Ultra**:
- NPU не поддерживает BERT модели из-за операции `masked_fill`/`Select`
- Только Qwen3-4B официально оптимизирован для NPU
- Рекомендация: использовать CPU для embedding моделей

**Коммиты**: `a41f79c`, `40096a0`

---

### 10-11.12 - SWC Parser и GPU защита

**Задача 1**: Ускорение парсинга TypeScript

**Проблема**: TypeScript Compiler API медленный для больших файлов

**Решение**: Интеграция SWC (Speedy Web Compiler)
- 2.6x ускорение парсинга
- Используется как fast path перед полным анализом

---

**Задача 2**: Защита от crash на новых GPU (Blackwell)

**Проблема**: Тесты падали с segfault на RTX 5060 (Blackwell, CC 12.0)

**Диагностика**:
```
panic(main thread): Segmentation fault at address 0x7FF717998B11
...win32-x64.dawn.node
```

**Анализ**:
- Dawn (WebGPU) из npm пакета `webgpu@0.3.8` не поддерживает Blackwell
- CUDA addon `ultrascript_cuda.node` собран без поддержки CC 12.0
- Оба native addon'а падают при попытке определить GPU

**Решение**:
1. **Автоматическое определение Blackwell** (CC >= 12.0)
2. **Skip WebGPU/CUDA** для Blackwell с fallback на Pure JS
3. **Env переменные** для override: `WEBGPU_FORCE_ENABLE=1`, `CUDA_FORCE_DISABLE=1`

**Результат**: 361 тест пройден без крашей

**Коммиты**: `59d5cbc`, `2c38b14`, `edcdd21`, `06bf455`, `6b03028`

---

### 11.12 - Сборка Dawn и CUDA для Blackwell

**Задача**: Собрать native addons с поддержкой Blackwell GPU

**Dawn WebGPU из исходников**:

Требования:
- Visual Studio 2022 (C++ workload)
- CMake 3.16+
- Go 1.18+
- depot_tools (Google)
- ~30-60 минут на сборку

Процесс:
```bash
git clone https://dawn.googlesource.com/dawn
cd dawn
python tools/fetch_dawn_dependencies.py
cmake -B out -DDAWN_BUILD_NODE_BINDINGS=1 -GNinja
ninja -C out dawn.node  # ~30-60 минут
```

**CUDA addon с Blackwell (sm_120)**:
```bash
cd external-tools/native/cuda
cmake -B build -DCMAKE_CUDA_ARCHITECTURES=120
cmake --build build --config Release
```

**Результаты тестирования**:
| Компонент | Node.js | Bun |
|-----------|:-------:|:---:|
| CUDA addon | ✓ | X (баг Bun) |
| WebGPU (npm) | X | X |
| WebGPU (собранный Dawn) | ✓ | X |

**Созданные скрипты**:
- `scripts/build-cuda-x64.bat` — сборка CUDA addon
- `scripts/build-dawn-x64.bat` — полная сборка Dawn
- `scripts/install-dawn-blackwell.bat` — быстрая установка

**Собранные бинарники**:
- `external-libs/cuda-win32-x64/ultrascript_cuda.node` (376 KB)
- `external-libs/dawn-win32-x64/dawn.node` (11 MB)
- `external-libs/dawn-linux-x64/dawn.node` (19 MB)

---

### 12.12 - OVMS и libSQL оптимизации

**Задача**: Оптимизация эмбеддингов и хранилища

**OVMS Provider (OpenVINO Model Server)**:

Исследование провайдеров эмбеддингов:

| Провайдер | Время/запрос | Рекомендация |
|-----------|-------------|--------------|
| OVMS REST V3 | 0.8-2ms | Рекомендуется |
| TEI | 5-15ms | Альтернатива |
| Ollama | 10-50ms | Простая установка |
| OpenAI | 50-200ms | Cloud API |

**Проблемы с OpenVINO batch inference**:
- Некоторые модели не поддерживают dynamic batch reshape
- NPU не поддерживает BERT операции (`masked_fill`, `Select`)
- Bun крашится при batch inference

**Решения**:
- Отключен batch inference для Bun по умолчанию
- Fallback на sequential inference при ошибке reshape
- TEI aggressive batching config для высокой throughput
- Auto-resume для незавершённой генерации эмбеддингов

**Бенчмарк embedding моделей (07.12)**:

| Модель | Провайдер | Chunks/s | tok/s | Контекст |
|--------|-----------|----------|-------|----------|
| all-MiniLM-L6-v2 | OpenVINO CPU | **474** | **80,507** | 256 |
| paraphrase-multilingual | OpenVINO CPU | 161 | 16,089 | 128 |
| granite-embedding:30m | Ollama GPU | 123 | 34,685 | 512 |
| snowflake-arctic-embed2 | Ollama GPU | 15 | 9,968 | 8192 |

**Рекомендации**:
- Разработка: OpenVINO + all-MiniLM-L6-v2 (474 chunks/s)
- Production (большие классы): Ollama + snowflake-arctic-embed2 (8K context)
- Мультиязычный код: OpenVINO + multilingual-e5-small

**Коммиты**: `6c4eef6`, `bb2aa39`, `af7b1fe`, `fc59ef4`, `16fcbe9`

---

## 12.12.2025 - 04.01.2026 (Git gap - информация из истории чата)

### 13-14.12 - Миграция на libSQL

**Проблема**: `better-sqlite3` создавал сложности:
- Требовал C++ компиляцию
- NODE_MODULE_VERSION несовместимость
- Rebuild при каждом обновлении Node.js
- Несовместимость с Bun

**Анализ альтернатив**:
| Решение | Плюсы | Минусы |
|---------|-------|--------|
| better-sqlite3 | Быстрый, синхронный | Native module |
| sql.js | Чистый WASM | Медленнее |
| libSQL | WASM + native, Turso совместимость | Новый API |

**Решение — libSQL**:
- `GraphStorageLibSQL` — unified storage для entities, relationships, vectors
- `LibSQLGraphAdapter` и `BunSQLiteAdapter` — адаптеры для разных runtime
- Единый файл `project.db` вместо `graph.db` + `vectors.db`
- Поддержка Turso edge database

**Структура хранилища**:
```
%LOCALAPPDATA%\UltraScriptTools\
├── config/
│   └── semantic-config.json
└── projects/
    ├── {hash1}/project.db    # Unified storage
    └── {hash2}/project.db
```

---

### 19.12 - Graphology оптимизация

**Проблема**: `trace_flow` работал 10+ минут

**Диагностика** — найдены узкие места:

1. **25000+ SQL запросов** — на каждый узел 4-5 запросов:
```typescript
// Для КАЖДОГО узла в BFS:
await this.storage.getEntity(id);           // 1 запрос
await this.storage.getRelationshipsForEntity(id); // 2 запрос
await this.resolveNgRxTarget(rel.toId);     // 3+ запросов
```

2. **O(n² log n) сортировка** — `queue.sort()` на КАЖДОЙ итерации:
```typescript
while (queue.length > 0) {
  // обработка...
  queue.sort((a, b) => a.weight - b.weight);  // УБИЙЦА ПРОИЗВОДИТЕЛЬНОСТИ!
}
```

3. **Линейный поиск циклов** — `Array.includes()` вместо Set

4. **Отсутствие батчинга** — запросы выполнялись последовательно

**Решение — интеграция graphology**:

```typescript
// БЫЛО: 25000 запросов, 10+ минут
for each node:
  await getEntity(id)
  await getRelationships(id)
  queue.sort()

// СТАЛО: 2 запроса, секунды
const allEntities = await storage.getAllEntities()
const allRelationships = await storage.getAllRelationships()
const graph = buildInMemoryGraph(allEntities, allRelationships)
const path = bidirectional(graph, fromId, toId)  // O(V+E)
```

**Зависимости**:
- `graphology` — основной граф (MultiGraph для разных типов связей)
- `graphology-shortest-path` — Dijkstra, bidirectional BFS
- `graphology-traversal` — BFS, DFS с callbacks

**Результат**:
| Метрика | Было | Стало |
|---------|------|-------|
| SQL запросов | 25000+ | 2 |
| Алгоритм | O(2^n) | O(V+E) |
| Время (5000 узлов) | 10+ мин | **1-5 сек** |

---

### 19.12 - NgRx трассировка (ограничение)

**Проблема**: `trace_flow`/`trace_backwards` не работают для NgRx

**Причина**: NgRx использует event-driven архитектуру:
```
Component.dispatch(action)
    → [строковый тип action]
        → Effect.слушает(ofType(...))
            → Effect.dispatch(другой action)
                → Reducer.меняет state
                    → Selector.выбирает данные
```

Статический анализ не видит связь между `postMessages2$` и `setCompleteContent`, потому что:
1. Effect слушает action по строковому типу `ofType('[Task] PostMessages2')`
2. Компонент получает данные через selector
3. Между ними нет прямого вызова в AST

**Обходной путь**: `pattern_search` по action names
```typescript
pattern_search(pattern: "PostMessages2", mode: "content")
```

**TODO**: NgRx-aware трассировка (парсинг createAction/createEffect/createReducer)

---

### 20-24.12 - Branch management

**Задача**: Поддержка нескольких веток с изолированными данными

**Реализовано**:
- Composite keys `(project_hash, branch_name)` в storage
- `BranchManager` для управления ветками
- LRU eviction для старых веток
- Tools: `list_branches`, `switch_branch`, `get_branch_status`, `cleanup_branches`

---

### 22-23.12 - OVMS оптимизации производительности

**Задача**: Устранить 7-10 секунд задержки на первом батче

**Диагностика**: Первый запрос к GPU занимал долго из-за:
- Загрузки модели в память GPU
- Компиляции шейдеров/кернелов
- JIT оптимизаций

**Решение — GPU Warmup при старте**:
```typescript
// Прогрев всех endpoints полным батчем при инициализации
await warmupGPU(fullBatch);
// Компиляция шейдеров/кернелов до начала реальной работы
```

**Другие оптимизации**:
1. **Увеличен `miniBatchSize`** с 8 до 32 — в 4 раза меньше HTTP запросов
2. **Буферный пул Float32Array** — переиспользование буферов, снижение GC
3. **HTTP Keepalive** — переиспользование TCP соединений

**Результат**:
- Первый батч: ~7-10s → <1s (после warmup)
- Throughput: +30-50%

---

### 23.12 - Idle CPU оптимизация

**Проблема**: 4% CPU в idle режиме

**Диагностика** — найдены источники:
1. `writeFileSync` на каждый лог — синхронный I/O блокирует event loop
2. Health check каждые 10s
3. Heartbeat каждые 5s
4. OVMS health check каждые 30s

**Решение**:

1. **Буферизованное async логирование**:
   - Буфер на 50 записей или flush каждую секунду
   - `appendFile` (async) вместо `writeFileSync`

2. **Idle detection с увеличенными интервалами**:
   | Цикл | Активный | Idle (после 1 мин) |
   |------|----------|-----|
   | Health check | 30s | 2 мин |
   | Heartbeat | 10s | 2 мин + пропуск |
   | OVMS health | 30s | 2 мин |

**Результат**: CPU в idle 0-0.5% вместо 4%

---

### 23.12 - Database corruption recovery

**Проблема**: База данных могла повреждаться при crash

**Реализовано автоматическое восстановление**:

1. **Детектирование** при инициализации:
   - `SQLITE_CORRUPT`
   - `database disk image is malformed`
   - `file is not a database`

2. **Проактивная проверка** `PRAGMA quick_check(100)` при старте

3. **Автоматическое восстановление**:
   ```
   [LibSQLGraphAdapter] DATABASE CORRUPTION DETECTED
   [LibSQLGraphAdapter] Attempting to recreate database...
   [LibSQLGraphAdapter] Deleted: unified-storage.db (4900.5 MB)
   [LibSQLGraphAdapter] Deleted corrupt database, retrying...
   ```

---

## Январь 2026

### 01.01 - Pre-commit
- **Задача**: Сохранение изменений перед новым годом
- **Коммит**: `6d9bbfd`

---

### 04.01 - Масштабный рефакторинг

**Задача**: Модуляризация index.ts (3000+ строк) и других больших файлов

**Анализ крупных файлов**:
| Файл | Строк | Статус |
|------|-------|--------|
| semantic-agent.ts | 2216 | Рефакторинг |
| gpu-worker.ts | 1704 | Рефакторинг |
| index.ts | 1380 | Рефакторинг |
| generic-language-worker.ts | 974 | Рефакторинг |
| indexer-agent.ts | 1022 | Рефакторинг |

**Извлечённые модули**:

Из `index.ts`:
- `src/core/startup-checks.ts` — проверки Ollama и orphaned embeddings
- `src/tools/tool-registry.ts` — O(1) поиск вместо switch

Из `semantic-agent.ts`:
- `src/agents/semantic/provider-config.ts` — конфигурация embedding провайдеров
- `src/agents/semantic/embedding-processor.ts` — обработка эмбеддингов
- `src/agents/semantic/comment-processor.ts` — извлечение комментариев
- `src/agents/semantic/cache-warmup.ts` — прогрев кэша

Из `gpu-worker.ts`:
- `src/semantic/gpu/faiss-handlers.ts` (~700 строк)
- `src/semantic/gpu/cuda-handlers.ts` (~170 строк)
- `src/semantic/gpu/embeddings-handlers.ts` (~280 строк)

Из `generic-language-worker.ts`:
- `src/agents/workers/embedding-processor.ts` (~387 строк)
- `src/agents/workers/analyzer-loader.ts` (~135 строк)

**Результаты**:
| Файл | Было | Стало | Изменение |
|------|------|-------|-----------|
| gpu-worker.ts | 1704 | 636 | **-63%** |
| generic-language-worker.ts | 974 | 552 | **-43%** |
| indexer-agent.ts | 1022 | 917 | **-10%** |
| semantic-agent.ts | 2216 | 2070 | **-6.6%** |

**Коммиты**: `89707e4`, `b25c1e8`, `87e4af2`, `cb5b19c`, `7b975ce`, `4b2c4a4`, `4d951c7`, `45816b1`

---

### 05.01 - Streaming Mode (17x speedup)

**Проблема**: Worker pool собирал все результаты, потом индексировал одним батчем
- Высокое использование памяти
- Долгое ожидание перед началом индексации

**Диагностика**:
```
Worker Pool: парсим 537 файлов → собираем все результаты в память
Main Process: ждём... ждём... получили 11115 entities → индексируем
```

**Решение — Streaming Mode**:

1. **Workers отправляют результаты сразу** после парсинга каждого файла:
```typescript
// Worker после парсинга файла:
process.send({ type: "streaming_result", data: parseResult });
// Main process индексирует немедленно
```

2. **Batch Accumulator** — накопление 100 entities перед записью в DB

3. **Aggressive SQLite Pragmas**:
```sql
PRAGMA journal_mode = OFF;  -- нет журнала (данные можно перегенерировать)
PRAGMA synchronous = OFF;   -- нет fsync
```

4. **Parallel Data Files** — JSON/YAML через `Promise.all` с chunking

**Greedy Load Balancing**:
- Файлы сортируются по размеру
- Назначаются на worker с минимальной нагрузкой
- Результат: 0% deviation (было 70%/30%)

**Async Prefetch**:
- PrefetchManager читает следующие 3 файла параллельно с парсингом
- I/O overlap: 96-100%

**Результаты**:
| Метрика | Было | Стало | Улучшение |
|---------|------|-------|-----------|
| 537 файлов | 68s | 3.8s | **17x** |
| Data files (174) | 6.7s | 195ms | **34x** (892 files/s) |
| DB write speed | ~1000/s | 11,300/s | **11x** |
| Streaming coverage | 0% | 91-95% | - |

**Коммиты**: `0c7450c`, `190af5c`

---

### 06.01 - FileWatcher и Branch fixes

**Задача**: Мониторинг изменений файлов в реальном времени

**Проблемы**:
1. Timeout при индексации больших проектов
2. Branch tools не работали
3. VectorStore не переключался при смене проекта

**FileWatcher** — легковесный мониторинг:
```typescript
// Использует glob + fs.watch (Node) / Bun.watch (Bun)
const watcher = new FileWatcher(directory, {
  patterns: ["**/*.ts", "**/*.js"],
  ignore: ["node_modules/**"],
});
watcher.on("change", async (files) => {
  await incrementalIndex(files);
});
```

**Исправления**:
- Fix timeout в index tool
- Fix complexity metrics для hotspots
- Fix project context в VectorStore
- Fix BranchManager paths
- Fix передача graphStorage в TechnologyDetector

**Коммиты**: `254e11b`, `792f7c8`, `2c1a62e`, `7b4c29c`

---

### 07.01 - Новая система логирования

**Задача**: Удобный парсинг и анализ логов

**Формат с фиксированными позициями**:
```
20260107-143045.123 I 12345 a1b2c3d4 PARSER               file_parsed          file=/src/index.ts dur=45ms
```

| Поле | Позиция | Описание |
|------|---------|----------|
| Timestamp | 0-19 | YYYYMMDD-HHMMSS.mmm |
| Level | 20 | T/D/I/W/E/F |
| PID | 22-26 | Process ID |
| CorrelationID | 28-35 | 8 hex chars |
| Module | 37-56 | Padded to 20 chars |
| Event | 58-77 | Padded to 20 chars |
| KV pairs | 79+ | key=value |

**CLI утилита `ulog`**:
```bash
ulog logs/server.log              # Все логи
ulog -l E,W logs/                 # Только ERROR и WARN
ulog -m PARSER logs/              # Только модуль PARSER
ulog --from 1h logs/              # Последний час
ulog -k "dur>100" logs/           # Операции дольше 100ms
ulog --stats logs/                # Статистика
```

**Коммит**: `cfcb3ca`

---

## Ключевые архитектурные решения

### Нативные парсеры vs Tree-sitter

| Критерий | Tree-sitter | Нативные парсеры |
|----------|-------------|------------------|
| Установка | C++ компиляция, 28MB | Только runtime языка |
| Совместимость | NODE_MODULE_VERSION | Любая версия |
| Bun support | Проблемы | Работает |
| Качество AST | Хороший | Отличный (родной парсер) |

**Решение**: Нативные парсеры. Философия — разработчик всегда имеет runtime своего языка.

### libSQL vs better-sqlite3

| Критерий | better-sqlite3 | libSQL |
|----------|----------------|--------|
| Установка | C++ компиляция | WASM/native |
| Rebuild | При каждом обновлении | Не нужен |
| Bun support | Проблемы | Работает |
| Edge/Turso | Нет | Да |

**Решение**: libSQL для unified storage.

### Streaming vs Batch

| Критерий | Batch | Streaming |
|----------|-------|-----------|
| Память | Высокая (все в памяти) | Низкая (по мере получения) |
| Latency | Высокая (ждём всех) | Низкая (индексируем сразу) |
| Throughput | Ниже | Выше (11,300/s) |

**Решение**: Streaming Mode для индексации.

### Graphology vs Custom BFS

| Критерий | Custom BFS | Graphology |
|----------|------------|------------|
| SQL запросов | 25000+ | 2 |
| Сложность | O(2^n) | O(V+E) |
| Время | 10+ мин | 1-5 сек |

**Решение**: In-memory граф с graphology.

---

## Статистика проекта

- **Языков**: 10 (TypeScript, JavaScript, Python, Java, Kotlin, Go, Rust, C/C++, Swift)
- **MCP методов**: 30+
- **Embedding провайдеров**: 6 (OVMS, TEI, Ollama, OpenAI, HuggingFace, OpenVINO)
- **Агентов**: 7 (Parser, Indexer, Semantic, Query, Dora, Dev, Conductor)
- **Строк кода**: ~100,000
- **Файлов**: 500+
- **Модулей**: 50+
