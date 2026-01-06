# Logging Guide

Руководство по использованию системы логирования для разработчиков.

## Формат логов

Все логи имеют фиксированные позиции полей для удобства парсинга:

```
20260107-143045.123 I 12345 a1b2c3d4 PARSER               file_parsed          file=/src/index.ts dur=45ms
```

| Поле | Позиция | Длина | Описание |
|------|---------|-------|----------|
| Timestamp | 0-18 | 19 | `YYYYMMDD-HHmmss.mmm` |
| Level | 20 | 1 | `E/W/I/D/T` |
| PID | 22-26 | 5 | ID процесса |
| BuildHash | 28-35 | 8 | Git commit hash |
| Module | 37-56 | 20 | Категория (ALL CAPS, pad right) |
| Event | 58-77 | 20 | Событие (snake_case, pad right) |
| KV Pairs | 79+ | var | `key=value` пары |

## Быстрый старт

```typescript
import { log } from "../logging/index.js";

// Базовое использование
log.i("PARSER", "file_parsed", { file: "index.ts", dur: 45 });
log.e("INDEXER", "batch_failed", { err: "timeout", retry: 2 });
log.w("EMBEDDING", "rate_limited", { wait: 1000 });
log.d("STORAGE", "cache_hit", { key: "abc123" });
log.t("QUERY", "sql_exec", { rows: 150 });
```

## Уровни логирования

| Уровень | Метод | Когда использовать |
|---------|-------|-------------------|
| **Error** | `log.e()` | Ошибки, требующие внимания. Операция не выполнена. |
| **Warn** | `log.w()` | Потенциальные проблемы. Операция выполнена, но с оговорками. |
| **Info** | `log.i()` | Важные события: старт/стоп, завершение операций, состояния. |
| **Debug** | `log.d()` | Детали для отладки. Промежуточные шаги, состояния кэша. |
| **Trace** | `log.t()` | Максимальная детализация. SQL запросы, каждый шаг алгоритма. |

### Примеры по уровням

```typescript
// ERROR - операция провалилась
log.e("INDEXER", "parse_failed", { file: "broken.ts", err: "SyntaxError" });

// WARN - работает, но есть проблема
log.w("EMBEDDING", "fallback_used", { from: "ollama", to: "openai" });

// INFO - ключевые события
log.i("STARTUP", "server_ready", { port: 3000, mode: "production" });
log.i("INDEXER", "scan_complete", { files: 1500, dur: 3200 });

// DEBUG - детали для разработки
log.d("CACHE", "evicted", { key: "embed_abc", reason: "lru" });

// TRACE - максимальная детализация
log.t("STORAGE", "sql_query", { sql: "SELECT...", rows: 42 });
```

## Именование модулей

Модуль — категория компонента (до 20 символов, ALL CAPS).

### Существующие модули

| Модуль | Компонент |
|--------|-----------|
| `STARTUP` | Инициализация сервера |
| `SHUTDOWN` | Завершение работы |
| `MCP` | MCP протокол, запросы/ответы |
| `PARSER` | Парсинг файлов |
| `INDEXER` | Индексация кодовой базы |
| `EMBEDDING` | Генерация эмбеддингов |
| `STORAGE` | Работа с хранилищем |
| `QUERY` | Обработка запросов |
| `SEMANTIC` | Семантический поиск |
| `FAISS` | FAISS индекс |
| `OLLAMA` | Ollama провайдер |
| `OVMS` | OpenVINO Model Server |
| `WORKER` | Worker процессы |
| `CACHE` | Кэширование |
| `BRANCH` | Работа с ветками |
| `MERGE` | Мерж операции |
| `AUTODOC` | Автодокументация |

### Правила именования модулей

```typescript
// ✅ Правильно
log.i("PARSER", "file_done", {});      // ALL CAPS
log.i("SEMANTIC", "search", {});        // До 20 символов
log.i("GRAPHSTORAGE", "init", {});      // Можно склеивать слова

// ❌ Неправильно
log.i("parser", "file_done", {});       // lowercase
log.i("SEMANTIC_SEARCH_ENGINE", ...);   // Слишком длинно (>20)
log.i("Parser", "file_done", {});       // Mixed case
```

## Именование событий

Событие — конкретное действие (до 20 символов, snake_case).

### Стандартные паттерны

```typescript
// Жизненный цикл
log.i("MODULE", "init", {});
log.i("MODULE", "ready", {});
log.i("MODULE", "shutdown", {});

// Операции
log.i("MODULE", "op_start", { op: "scan" });
log.i("MODULE", "op_done", { op: "scan", dur: 100 });
log.e("MODULE", "op_failed", { op: "scan", err: "..." });

// Состояния
log.d("MODULE", "cache_hit", {});
log.d("MODULE", "cache_miss", {});
log.w("MODULE", "rate_limited", {});
log.w("MODULE", "fallback_used", {});

// Данные
log.i("MODULE", "batch_done", { count: 100 });
log.i("MODULE", "file_parsed", { file: "..." });
log.e("MODULE", "write_failed", { path: "..." });
```

### Правила именования событий

```typescript
// ✅ Правильно
log.i("PARSER", "file_parsed", {});     // snake_case
log.i("PARSER", "batch_complete", {});  // Описательно
log.e("PARSER", "syntax_error", {});    // Конкретно

// ❌ Неправильно
log.i("PARSER", "fileParsed", {});      // camelCase
log.i("PARSER", "done", {});            // Слишком общее
log.i("PARSER", "file_has_been_parsed_successfully", {}); // Слишком длинно
```

## KV пары (ключ-значение)

### Стандартные ключи

| Ключ | Тип | Описание |
|------|-----|----------|
| `dur` | number | Длительность в мс |
| `err` | string | Сообщение об ошибке |
| `file` | string | Путь к файлу |
| `cnt` / `count` | number | Количество элементов |
| `op` | string | Название операции |
| `retry` | number | Номер попытки |
| `mem` | number | Использование памяти (bytes) |
| `ok` | boolean | Успех операции |
| `req` / `reqId` | string | ID запроса |

### Форматирование значений

```typescript
// Строки
log.i("PARSER", "file_parsed", { file: "/src/index.ts" });

// Числа
log.i("INDEXER", "batch_done", { count: 150, dur: 3200 });

// Boolean
log.i("CACHE", "lookup", { hit: true });

// Ошибки - ВСЕГДА как строку
log.e("PARSER", "failed", { err: error.message });
log.e("PARSER", "failed", { err: String(error) });

// Объекты - spread или JSON
log.i("CONFIG", "loaded", { ...config });
log.d("DEBUG", "state", { data: JSON.stringify(obj) });
```

### Правила для KV

```typescript
// ✅ Правильно
log.i("INDEXER", "done", { files: 100, dur: 3200 });
log.e("PARSER", "failed", { err: error.message, file: path });

// ❌ Неправильно
log.e("PARSER", "failed", error);           // Error объект напрямую
log.i("INDEXER", "done", { data: bigObject }); // Огромный объект
log.i("MODULE", "event", undefined);         // undefined вместо {}
```

## Трекинг операций

Для измерения длительности операций:

```typescript
// Вариант 1: Ручной трекинг
const start = Date.now();
await doWork();
log.i("MODULE", "work_done", { dur: Date.now() - start });

// Вариант 2: opStart/opEnd
const start = log.opStart("MODULE", "heavy_op", { items: 100 });
await heavyOperation();
log.opEnd("MODULE", "heavy_op", start, true, { processed: 100 });

// Вариант 3: Обёртка op()
const result = await log.op("MODULE", "async_op", async () => {
  return await fetchData();
}, { url: "https://..." });
```

## Логирование ошибок

### Правильный паттерн

```typescript
try {
  await riskyOperation();
} catch (error) {
  // ✅ Правильно: err как строка
  log.e("MODULE", "op_failed", {
    err: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  throw error;
}
```

### Типичные ошибки

```typescript
// ❌ НЕПРАВИЛЬНО
log.e("MODULE", "failed", error);                    // Error объект напрямую
log.e("MODULE", "failed", { error });                // Error в KV
log.i("MODULE", "Failed:", error);                   // Сообщение + error

// ✅ ПРАВИЛЬНО
log.e("MODULE", "op_failed", { err: String(error) });
log.e("MODULE", "op_failed", { err: error.message });
```

## Примеры по компонентам

### Агенты

```typescript
// Инициализация
log.i("INDEXER", "init", { workers: 4, batchSize: 100 });

// Обработка задачи
log.d("INDEXER", "task_start", { taskId, type: "fullScan" });
log.i("INDEXER", "task_done", { taskId, files: 150, dur: 3200 });
log.e("INDEXER", "task_failed", { taskId, err: "timeout" });

// Состояние
log.d("INDEXER", "queue_status", { pending: 5, active: 2 });
```

### Парсеры

```typescript
// Парсинг файла
log.t("PARSER", "parse_start", { file: path, lang: "typescript" });
log.i("PARSER", "parse_done", { file: path, entities: 42, dur: 15 });
log.e("PARSER", "parse_failed", { file: path, err: "SyntaxError", line: 42 });

// Батч обработка
log.i("PARSER", "batch_start", { files: 100 });
log.i("PARSER", "batch_done", { files: 100, entities: 1500, dur: 2000 });
```

### Storage

```typescript
// Операции с БД
log.t("STORAGE", "query", { sql: "SELECT...", params: 3 });
log.d("STORAGE", "query_done", { rows: 150, dur: 12 });

// Транзакции
log.d("STORAGE", "tx_start", { ops: 50 });
log.i("STORAGE", "tx_commit", { ops: 50, dur: 100 });
log.e("STORAGE", "tx_rollback", { err: "constraint violation" });
```

### MCP запросы

```typescript
// Входящий запрос
log.i("MCP", "request", { tool: "semantic_search", reqId });

// Ответ
log.i("MCP", "response", { tool: "semantic_search", dur: 150, reqId });
log.e("MCP", "error", { tool: "semantic_search", err: "...", reqId });
```

## Чего НЕ делать

### 1. Не логируйте чувствительные данные

```typescript
// ❌ НИКОГДА
log.i("AUTH", "login", { password: "secret123" });
log.d("API", "request", { apiKey: "sk-..." });

// ✅ Правильно
log.i("AUTH", "login", { user: "john@example.com" });
log.d("API", "request", { keyPrefix: "sk-...xxx" });
```

### 2. Не логируйте огромные объекты

```typescript
// ❌ Плохо
log.d("DEBUG", "state", { entities: hugeArray }); // 10000 элементов

// ✅ Правильно
log.d("DEBUG", "state", { entityCount: hugeArray.length });
```

### 3. Не используйте логи для UI

```typescript
// ❌ Неправильно (для отладки)
console.log("Processing file:", file);

// ✅ Правильно
log.d("PROCESSOR", "file_start", { file });

// ✅ console.* допустим ТОЛЬКО для CLI UI
console.log("✓ Setup complete");  // OK в src/cli/setup/*
```

### 4. Не смешивайте форматы

```typescript
// ❌ Неправильно
log.i("PARSER", `Parsed ${count} files in ${dur}ms`);

// ✅ Правильно
log.i("PARSER", "batch_done", { count, dur });
```

## Миграция со старого логгера

### Было → Стало

```typescript
// БЫЛО
import { logger } from "../utils/logger.js";
logger.info("CATEGORY", "Some message", { data }, requestId);
logger.error("CATEGORY", "Failed:", error);

// СТАЛО
import { log } from "../logging/index.js";
log.i("CATEGORY", "event_name", { data, reqId: requestId });
log.e("CATEGORY", "op_failed", { err: String(error) });
```

### Таблица соответствия

| Старый метод | Новый метод |
|--------------|-------------|
| `logger.info(cat, msg, data)` | `log.i(module, event, kv)` |
| `logger.warn(cat, msg, data)` | `log.w(module, event, kv)` |
| `logger.error(cat, msg, data)` | `log.e(module, event, kv)` |
| `logger.debug(cat, msg, data)` | `log.d(module, event, kv)` |
| `logger.trace(cat, msg)` | `log.t(module, event, kv)` |

## CLI инструмент (ulog)

```bash
# Фильтр по уровню
ulog -l E,W logs/server.log

# Фильтр по модулю
ulog -m "PARSER" logs/server.log

# Фильтр по времени
ulog --from 1h logs/server.log      # Последний час
ulog --from "20260107-1400" logs/   # С конкретного времени

# Фильтр по KV
ulog -k "dur>100" logs/server.log   # Операции дольше 100ms
ulog -k "err=*" logs/server.log     # Все с ошибками

# Статистика
ulog --stats logs/server.log

# Follow mode
ulog -f logs/server.log
```

## Checklist для Code Review

- [ ] Используется `log` из `../logging/index.js`
- [ ] Модуль в ALL CAPS, до 20 символов
- [ ] Событие в snake_case, до 20 символов
- [ ] Ошибки передаются как `{ err: String(error) }`
- [ ] Нет чувствительных данных в логах
- [ ] Нет огромных объектов в KV
- [ ] Используется правильный уровень (E/W/I/D/T)
- [ ] KV ключи короткие и понятные
