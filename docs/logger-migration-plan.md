# План миграции на новый логгер

## Статистика вызовов

| Файл | logger.* | Приоритет |
|------|----------|-----------|
| `agents/semantic-agent.ts` | 92 | HIGH |
| `agents/parser-agent.ts` | 58 | HIGH |
| `index.ts` | 47 | DONE |
| `agents/workers/parsing-subprocess-pool.ts` | 41 | HIGH |
| `semantic/ovms-native-manager.ts` | 36 | MEDIUM |
| `semantic/faiss/faiss-provider.ts` | 27 | MEDIUM |
| `agents/dev-agent.ts` | 26 | DONE (import) |
| `agents/indexer-agent.ts` | 25 | DONE (import) |
| `storage/libsql-graph-adapter.ts` | 22 | MEDIUM |
| `semantic/vector-store.ts` | 21 | DONE (import) |
| `semantic/gpu/gpu-client.ts` | 20 | MEDIUM |
| `core/startup-checks.ts` | 17 | DONE (import) |
| `storage/libsql/vector-ops.ts` | 17 | LOW |
| `core/shutdown-handlers.ts` | 15 | DONE (import) |
| `agents/workers/language-worker-pool.ts` | 15 | LOW |
| `core/auto-indexer.ts` | 15 | DONE (import) |
| Остальные (~40 файлов) | <15 каждый | LOW |

## Паттерны замены

### 1. logger.trace → log.t
```typescript
// OLD:
logger.trace("CATEGORY", `[Component] message ${var}`);

// NEW:
log.t("CATEGORY", "event_name", { var });
```

**Regex паттерн:**
```regex
logger\.trace\("([A-Z_]+)",\s*`?\[?[^\]]*\]?\s*([^`"]+)`?\);
→ log.t("$1", "event", {});
```

### 2. logger.info → log.i
```typescript
// OLD:
logger.info("CATEGORY", "message", { data: value });

// NEW:
log.i("CATEGORY", "event_name", { data: value });
```

**Regex паттерн:**
```regex
logger\.info\("([A-Z_]+)",\s*"([^"]+)",?\s*(\{[^}]*\})?\);
→ log.i("$1", "$2", $3);
```

### 3. logger.error → log.e
```typescript
// OLD:
logger.error("CATEGORY", "message", { error: err.message });

// NEW:
log.e("CATEGORY", "event_name", { err: err.message });
```

### 4. logger.warn → log.w
```typescript
// OLD:
logger.warn("CATEGORY", "message", data);

// NEW:
log.w("CATEGORY", "event_name", data);
```

### 5. logger.systemEvent → log.i("SYSTEM", ...)
```typescript
// OLD:
logger.systemEvent("Event Name", { data });

// NEW:
log.i("SYSTEM", "event_name", { data });
```

### 6. logger.mcpRequest/mcpResponse → log.i("MCP", ...)
```typescript
// OLD:
logger.mcpRequest(toolName, args, requestId);

// NEW:
log.i("MCP", "request", { tool: toolName, req: requestId });
```

## Скрипт миграции

Создать `scripts/migrate-logger.ts`:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');

// Паттерны замены
const patterns = [
  // logger.trace("CAT", `message`) → log.t("CAT", "trace", {})
  {
    from: /logger\.trace\("([A-Z_]+)",\s*`[^`]+`\)/g,
    to: 'log.t("$1", "trace", {})'
  },
  // logger.trace("CAT", "message") → log.t("CAT", "trace", {})
  {
    from: /logger\.trace\("([A-Z_]+)",\s*"[^"]+"\)/g,
    to: 'log.t("$1", "trace", {})'
  },
  // logger.info("CAT", "msg", data) → log.i("CAT", "info", data)
  {
    from: /logger\.info\("([A-Z_]+)",\s*"[^"]+",\s*(\{[^}]+\})\)/g,
    to: 'log.i("$1", "info", $2)'
  },
  // logger.info("CAT", "msg") → log.i("CAT", "info", {})
  {
    from: /logger\.info\("([A-Z_]+)",\s*"[^"]+"\)/g,
    to: 'log.i("$1", "info", {})'
  },
  // logger.error("CAT", "msg", data) → log.e("CAT", "error", data)
  {
    from: /logger\.error\("([A-Z_]+)",\s*"[^"]+",\s*(\{[^}]+\})\)/g,
    to: 'log.e("$1", "error", $2)'
  },
  // logger.warn("CAT", "msg", data) → log.w("CAT", "warn", data)
  {
    from: /logger\.warn\("([A-Z_]+)",\s*"[^"]+",\s*(\{[^}]+\})\)/g,
    to: 'log.w("$1", "warn", $2)'
  },
];

async function migrate() {
  const files = await glob('src/**/*.ts', { ignore: ['**/node_modules/**'] });

  for (const file of files) {
    let content = readFileSync(file, 'utf-8');
    let modified = false;

    for (const { from, to } of patterns) {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }

    if (modified) {
      console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Modified: ${file}`);
      if (!DRY_RUN) {
        writeFileSync(file, content);
      }
    }
  }
}

migrate();
```

## Порядок миграции

### Фаза 1: Высокий приоритет (>40 вызовов)
1. `agents/semantic-agent.ts` - 92 вызова
2. `agents/parser-agent.ts` - 58 вызовов
3. `agents/workers/parsing-subprocess-pool.ts` - 41 вызов

### Фаза 2: Средний приоритет (20-40 вызовов)
4. `semantic/ovms-native-manager.ts` - 36
5. `semantic/faiss/faiss-provider.ts` - 27
6. `storage/libsql-graph-adapter.ts` - 22
7. `semantic/gpu/gpu-client.ts` - 20

### Фаза 3: Низкий приоритет (<20 вызовов)
- Остальные ~45 файлов
- Можно мигрировать по мере редактирования

## Маппинг категорий → модулей

| Старая категория | Новый модуль (20 символов) |
|------------------|---------------------------|
| AGENT | AGENT |
| EMBEDDING | EMBEDDING |
| STORAGE | STORAGE |
| PARSER | PARSER |
| MCP_REQUEST | MCP |
| MCP_RESPONSE | MCP |
| INDEXING | INDEXER |
| PERFORMANCE | PERF |
| STARTUP | STARTUP |
| SYSTEM | SYSTEM |
| GPU_CLIENT | GPU |
| FAISS | FAISS |
| OVMS_NATIVE | OVMS |
| AUTODOC_WATCHER | AUTODOC |

## Верификация после миграции

1. `npm run build` - сборка без ошибок
2. `npm test` - тесты проходят
3. Проверить что логи пишутся в новом формате
4. `ulog -l E` - проверить фильтрацию по уровню
