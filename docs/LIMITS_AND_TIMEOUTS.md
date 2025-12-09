# Лимиты и таймауты UltraScript Tools MCP

Справочник всех ограничений, таймаутов и лимитов в коде. Используйте для диагностики проблем с производительностью или при необходимости увеличить/уменьшить значения.

## Оглавление
- [Парсер (Parsing)](#парсер-parsing)
- [Индексация (Indexing)](#индексация-indexing)
- [База данных (Database)](#база-данных-database)
- [Агенты (Agents)](#агенты-agents)
- [Запросы (Query)](#запросы-query)
- [Кэширование (Cache)](#кэширование-cache)
- [Векторный поиск (Vector Search)](#векторный-поиск-vector-search)
- [MCP Server](#mcp-server)
- [Response Limits](#response-limits)
- [Трассировка (Tracing)](#трассировка-tracing)
- [Clone Detection](#clone-detection)
- [Переменные окружения](#переменные-окружения)

---

## Парсер (Parsing)

### Критические таймауты

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_TIMEOUT_MS` | **30000ms** (30s) | `src/parsers/incremental-parser.ts:35` | Таймаут парсинга одного файла. **Если файл не распарсен за это время - он пропускается!** |
| `PARSE_TIMEOUT_MS` | 5000ms | `src/config/constants.ts:113` | Базовый таймаут для отдельных парсеров (language-specific) |
| `DEFAULT_BATCH_SIZE` | 10 | `src/parsers/incremental-parser.ts:34` | Размер батча для параллельного парсинга |

### Лимиты размера

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_FILE_SIZE_BYTES` | 10MB | `src/config/constants.ts:123` | Максимальный размер файла для парсинга |
| `MAX_RECURSION_DEPTH` | 100 | `src/config/constants.ts:108` | Максимальная глубина рекурсии (предотвращает stack overflow) |
| `COMPLEXITY_THRESHOLD` | 100 | `src/config/constants.ts:118` | Порог сложности для circuit breaker |
| `MAX_TEMPLATE_DEPTH` | 10 | `src/parsers/cpp-analyzer.ts:33` | Максимальная глубина C++ шаблонов |

### Worker Pools

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `WORKER_THRESHOLD` | 20 | `src/agents/parser-agent.ts:477,599` | Мин. файлов для использования worker threads |

---

## Индексация (Indexing)

### Паттерны исключений по умолчанию

**Файл**: `src/index.ts` (IndexToolSchema.excludePatterns)

Следующие паттерны **исключаются** по умолчанию при индексации:

```
node_modules/**     # NPM зависимости
.git/**            # Git metadata
dist/**            # Build output
build/**           # Build output
out/**             # Build output
.next/**           # Next.js cache
.nuxt/**           # Nuxt.js cache
coverage/**        # Test coverage
.nyc_output/**     # NYC coverage
__pycache__/**     # Python cache
*.pyc              # Python compiled
.pytest_cache/**   # Pytest cache
venv/**, .venv/**  # Python virtual envs
.env/**            # Environment
vendor/**          # Go/PHP dependencies
target/**          # Rust/Java build
.gradle/**         # Gradle cache
.idea/**           # JetBrains IDE
.vscode/**         # VS Code settings
**/.memory_bank/** # Memory bank
tmp/**, temp/**    # Temporary files
*.log, *.tmp       # Temp files
**/*.md            # Markdown files
Архивы             # .zip, .tar, .gz, .7z, .rar
```

**ВАЖНО**: Паттерны `**/test/**`, `**/tests/**`, `**/__tests__/**` **НЕ** исключаются!
Тесты - это код, они индексируются по умолчанию.

**Кастомизация**: Передайте свой массив `excludePatterns` в `index()` для переопределения.

### Таймауты операций

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `INDEX_DEFAULT_TIMEOUT` | 300000ms (5 min) | `src/index.ts:2061` | Таймаут индексации |
| `CLEAN_INDEX_DEFAULT_TIMEOUT` | 300000ms (5 min) | `src/index.ts:2233` | Таймаут clean_index |

### Пороги размера кодовой базы

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `LARGE_CODEBASE_THRESHOLD` | 2000 файлов | `src/config/constants.ts:211` | Порог "большой" кодовой базы → batch processing |
| `VERY_LARGE_CODEBASE_THRESHOLD` | 5000 файлов | `src/config/constants.ts:216` | Порог "очень большой" кодовой базы |

### Batch Processing

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_BATCH_SIZE` | 100 | `src/config/constants.ts:206` | Размер батча для сущностей |
| `MAX_ENTITIES_PER_BATCH` | 1000 | `src/config/constants.ts:221` | Макс. сущностей в батче |
| `INDEXING_CONCURRENCY` | 8 | `src/agents/dev-agent.ts:447` | Параллельность индексации |

---

## База данных (Database)

### SQLite Configuration

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `BUSY_TIMEOUT` | 5000ms | `src/config/constants.ts:87` | SQLite busy timeout |
| `PAGE_SIZE` | 4096 bytes | `src/config/constants.ts:67` | Размер страницы SQLite |
| `CACHE_SIZE_KB` | 65536 (64MB) | `src/config/constants.ts:72` | Размер кэша SQLite |
| `MMAP_SIZE` | 268MB | `src/config/constants.ts:77` | Memory-mapped I/O размер |
| `WAL_AUTOCHECKPOINT` | 1000 pages | `src/config/constants.ts:82` | WAL checkpoint threshold |
| `CONNECTION_POOL_SIZE` | 5 | `src/config/constants.ts:92` | Размер пула соединений |

### Connection Pool

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_MAX_CONNECTIONS` | 5 | `src/storage/connection-pool.ts:25` | Макс. соединений в пуле |
| `DEFAULT_ACQUIRE_TIMEOUT` | 5000ms | `src/storage/connection-pool.ts:27` | Таймаут получения соединения |
| `DEFAULT_IDLE_TIMEOUT` | 30000ms | `src/storage/connection-pool.ts:28` | Таймаут простоя соединения |

### Batch Operations

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_BATCH_SIZE` | 1000 | `src/storage/batch-operations.ts:24` | Размер батча для bulk ops |
| `MAX_BATCH_SIZE` | 5000 | `src/storage/batch-operations.ts:25` | Макс. размер батча |

---

## Агенты (Agents)

### Conductor/Coordinator

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_CONCURRENT_AGENTS` | 10 | `src/config/constants.ts:139` | Макс. параллельных агентов |
| `DEFAULT_AGENT_TIMEOUT` | 30000ms | `src/config/constants.ts:144` | Дефолтный таймаут агента |
| `COMPLEXITY_THRESHOLD` | 8 | `src/config/constants.ts:149` | Порог сложности для делегации |
| `MAX_RETRIES` | 3 | `src/config/constants.ts:154` | Макс. попыток для задачи |
| `RETRY_BACKOFF_MULTIPLIER` | 2 | `src/config/constants.ts:159` | Множитель backoff |

### Resource Management

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_MEMORY_LIMIT_MB` | 1024 | `src/config/constants.ts:175` | Дефолтный лимит памяти |
| `MAX_MEMORY_LIMIT_MB` | 8192 | `src/config/constants.ts:180` | Макс. лимит памяти |
| `CPU_THRESHOLD_PERCENT` | 80% | `src/config/constants.ts:185` | Порог CPU |
| `MEMORY_CHECK_INTERVAL_MS` | 5000ms | `src/config/constants.ts:190` | Интервал проверки памяти |
| `MAX_MONITORING_INTERVAL` | 10000ms | `src/core/resource-manager.ts:47` | Макс. интервал мониторинга |

---

## Запросы (Query)

### Graph Storage

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_QUERY_LIMIT` | 100 | `src/storage/graph-storage.ts:40` | Дефолтный лимит результатов |
| `MAX_QUERY_LIMIT` | 1000 | `src/storage/graph-storage.ts:41` | Макс. лимит результатов |
| `MAX_SUBGRAPH_DEPTH` | 5 | `src/storage/graph-storage.ts:42` | Макс. глубина подграфа |
| `MAX_TRAVERSAL_DEPTH` | 10 | `src/query/graph-query-processor.ts:50` | Макс. глубина обхода графа |

### Query Optimizer

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_LIMIT` | 100 | `src/query/query-optimizer.ts:29` | Дефолтный лимит |
| `MAX_LIMIT` | 1000 | `src/query/query-optimizer.ts:30` | Макс. лимит |
| `MAX_QUERY_DEPTH` | 10 | `src/types/query.ts:30` | Макс. глубина запроса |
| `MAX_CONCURRENT_QUERIES` | 10 | `src/types/query.ts:32` | Макс. параллельных запросов |

---

## Кэширование (Cache)

### LRU Cache

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_CACHE_ENTRIES` | 5000 | `src/config/constants.ts:31` | Макс. записей в кэше |
| `CACHE_TTL_MS` | 3600000 (1h) | `src/config/constants.ts:36` | TTL кэша |
| `L1_MAX_SIZE` | 100 | `src/query/query-cache.ts:32` | Hot cache размер |
| `L2_MAX_SIZE` | 1000 | `src/query/query-cache.ts:33` | Warm cache размер |

### Storage Cache

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_MAX_SIZE` | 50MB | `src/storage/cache-manager.ts:25` | Макс. размер файлового кэша |
| `DEFAULT_MAX_ENTRIES` | 1000 | `src/storage/cache-manager.ts:27` | Макс. записей |
| `DEFAULT_CACHE_SIZE` | 100MB | `src/parsers/incremental-parser.ts:33` | Кэш парсера |

### Semantic Cache

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_MAX_SIZE` | 5000 | `src/semantic/semantic-cache.ts:29` | Размер семантического кэша |
| `DEFAULT_MAX_AGE` | 86400000 (24h) | `src/semantic/semantic-cache.ts:31` | Время жизни записи |

---

## Векторный поиск (Vector Search)

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_EMBEDDING_DIMENSIONS` | 384 | `src/config/constants.ts:237` | Размерность эмбеддингов |
| `MIN_SIMILARITY_THRESHOLD` | 0.7 | `src/config/constants.ts:247` | Мин. порог схожести |
| `DEFAULT_SEARCH_LIMIT` | 10 | `src/config/constants.ts:257` | Дефолтный лимит поиска |
| `MAX_SEARCH_LIMIT` | 100 | `src/config/constants.ts:262` | Макс. лимит поиска |
| `MAX_BATCH_SIZE` | 8 | `src/config/constants.ts:267` | Макс. батч для эмбеддингов |
| `EMBEDDING_BATCH_SIZE` | 16 | `src/config/constants.ts:41` | Батч для генерации |

---

## MCP Server

### Server Timeouts

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `server.timeout` | 30000ms | `src/config/yaml-config.ts:327` | MCP server timeout |
| `agents.defaultTimeout` | 5000ms | `src/config/yaml-config.ts:361` | Agent default timeout |

### CLI Timeouts

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| Ollama check | 2000ms | `src/utils/ollama-checker.ts:12` | Health check timeout |
| Docker pull | 600000ms (10m) | `src/cli/setup-command.ts:741` | Docker pull timeout |
| Model pull | 1200000ms (20m) | `src/cli/setup-command.ts:837` | Ollama model pull timeout |
| LLM generation | 120000ms (2m) | `src/autodoc/llm/llm-provider.ts:43` | LLM request timeout |

---

## Response Limits

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_RESPONSE_SIZE_BYTES` | 50KB | `src/tools/response-limits.ts:11` | Макс. размер ответа |
| `MAX_PAGE_SIZE` | 200 | `src/tools/response-limits.ts:15` | Макс. записей на странице |
| `MAX_SNIPPET` | 10000 chars | `src/index.ts:2857` | Макс. размер snippet |

---

## Трассировка (Tracing)

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `DEFAULT_MAX_DEPTH` | 15 | `src/tracing/trace-engine.ts:39` | Глубина трассировки |
| `DEFAULT_MAX_PATHS` | 5-10 | `src/tracing/path-builder.ts:32` | Макс. путей |

---

## Clone Detection

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_FILES_TO_PROCESS` | 500 | `src/tools/jscpd.ts:8` | Макс. файлов для jscpd |
| `MAX_FILE_SIZE_BYTES` | 500KB | `src/tools/jscpd.ts:9` | Макс. размер файла |
| `MAX_TOTAL_TOKENS` | 500000 | `src/tools/jscpd.ts:10` | Макс. токенов |

---

## AutoDoc Concurrency

| Константа | Значение | Файл | Описание |
|-----------|----------|------|----------|
| `MAX_FILE_CONCURRENCY` | 8 | `src/autodoc/hooks/pre-commit-check.ts:145` | Параллельность файлов |
| `MAX_REF_CONCURRENCY` | 4 | `src/autodoc/hooks/pre-commit-check.ts:147` | Параллельность ссылок |
| `OUTDATED_THRESHOLD` | 0.7 | `src/autodoc/storage/autodoc-manager.ts:36` | Порог устаревания |

---

## Переменные окружения

Многие лимиты можно переопределить через переменные окружения. Полный список в `src/config/yaml-config.ts`:

### Парсер
- `PARSER_MAX_FILE_SIZE` - макс. размер файла
- `PARSER_TIMEOUT` - таймаут парсера
- `PARSER_AGENT_MAX_CONCURRENCY` - параллельность парсера
- `PARSER_AGENT_BATCH_SIZE` - размер батча

### Агенты
- `MCP_MAX_CONCURRENT_AGENTS` - макс. агентов
- `MCP_AGENT_TIMEOUT` - таймаут агента
- `DEV_AGENT_MAX_CONCURRENCY` - параллельность dev-agent
- `SEMANTIC_AGENT_BATCH_SIZE` - батч semantic-agent

### Провайдеры эмбеддингов
- `OLLAMA_TIMEOUT_MS`, `OLLAMA_CONCURRENCY`
- `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_BATCH_SIZE`
- `TEI_TIMEOUT_MS`, `TEI_CONCURRENCY`

### Индексация
- `INDEXING_MAX_BRANCHES_PER_REPO` - макс. веток
- `INDEXING_CLEANUP_INTERVAL_MS` - интервал очистки
- `INDEXING_INCREMENTAL_THRESHOLD` - порог инкрементального

---

## Типичные проблемы и решения

### Проблема: Файлы не индексируются
**Причина**: `DEFAULT_TIMEOUT_MS` слишком мал для сложных файлов
**Решение**: Увеличить `src/parsers/incremental-parser.ts:35`

### Проблема: "Connection acquire timeout"
**Причина**: Пул соединений исчерпан
**Решение**: Увеличить `DEFAULT_MAX_CONNECTIONS` или `DEFAULT_ACQUIRE_TIMEOUT`

### Проблема: Медленный поиск на больших кодовых базах
**Причина**: Маленький `MAX_QUERY_LIMIT`
**Решение**: Увеличить лимиты в `src/storage/graph-storage.ts`

### Проблема: Out of memory при индексации
**Причина**: Слишком большие батчи или много параллельных агентов
**Решение**: Уменьшить `MAX_ENTITIES_PER_BATCH` или `MAX_CONCURRENT_AGENTS`

---

## Централизованные константы

Основные константы находятся в `src/config/constants.ts`. При изменении значений предпочтительно менять их там, чтобы изменения применились везде.

```typescript
import { PARSER_CONSTANTS, DATABASE_CONSTANTS } from './config/constants.js';

// Использование
const timeout = PARSER_CONSTANTS.PARSE_TIMEOUT_MS;
const busyTimeout = DATABASE_CONSTANTS.BUSY_TIMEOUT;
```
