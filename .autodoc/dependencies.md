# Зависимости проекта

## Обзор

Документ описывает все зависимости UltraScript Tools MCP v3.1+, их назначение и версии.

## Runtime Dependencies

### Ядро системы

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@modelcontextprotocol/sdk` | ^1.24.3 | MCP протокол, JSON-RPC сервер |
| `better-sqlite3` | ^12.5.0 | SQLite драйвер для хранения графа |
| `sqlite-vec` | ^0.1.6 | Векторный поиск в SQLite |
| `vectorlite` | ^0.2.0 | Альтернативный векторный бэкенд |
| `zod` | ^4.1.13 | Валидация схем, JSON Schema генерация |
| `lru-cache` | ^11.2.4 | LRU кэш для парсеров и эмбеддингов |
| `nanoid` | ^5.1.6 | Генерация уникальных ID |

### Семантический слой

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@huggingface/inference` | ^4.13.4 | HuggingFace API клиент |

**Эмбеддинги через внешние сервера:**

- **llama.cpp** — native GGUF server (порт 8085), CUDA/Vulkan/CPU
- **OVMS** — OpenVINO Model Server (порт 8083), Intel iGPU/CPU
- **vLLM** — Docker container (порт 8000), NVIDIA GPU
- **TEI** — Docker container (порт 8081), HuggingFace models
- **Ollama** — local LLM (порт 11434), простая установка

> См. [EMBEDDINGS_PROVIDERS.md](../docs/EMBEDDINGS_PROVIDERS.md) для детальной документации провайдеров.

### Утилиты

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `yaml` | ^2.8.2 | Парсинг YAML конфигов |
| `eslint` | ^9.39.1 | Линтинг JS/TS (validate_file) |
| `@types/eslint` | ^9.6.1 | TypeScript типы для ESLint |

## Development Dependencies

### Сборка

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `tsup` | ^8.5.1 | Бандлер TypeScript |
| `typescript` | ^5.9.3 | TypeScript компилятор |
| `@rollup/rollup-win32-x64-msvc` | ^4.53.3 | Rollup для Windows |
| `cmake-js` | ^7.4.0 | Сборка нативных модулей |
| `node-addon-api` | ^8.5.0 | N-API для нативных модулей |
| `node-gyp` | ^12.1.0 | Сборка C++ addon'ов |

### Качество кода

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@biomejs/biome` | ^2.3.8 | Линтер и форматтер |
| `@biomejs/cli-win32-x64` | ^2.3.8 | Biome CLI для Windows |
| `@commitlint/cli` | ^20.2.0 | Линтинг commit messages |
| `@commitlint/config-conventional` | ^20.2.0 | Conventional Commits конфиг |
| `lint-staged` | ^16.2.7 | Pre-commit линтинг |
| `simple-git-hooks` | ^2.13.1 | Git hooks |

### Тестирование

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@types/bun` | latest | Bun test runner типы |
| `@types/node` | ^24.10.1 | Node.js типы |
| `@types/better-sqlite3` | ^7.6.13 | SQLite типы |
| `minimatch` | ^10.1.1 | Glob matching для тестов |

## Optional Dependencies

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@webgpu/node` | npm:null@^2.0.0 | WebGPU для Node.js (заглушка) |
| `@webgpu/types` | ^0.1.67 | WebGPU TypeScript типы |
| `webgpu` | ^0.3.8 | WebGPU полифилл |

> **Примечание**: WebGPU зависимости установлены как заглушки для совместимости с transformers.js. Реальная GPU поддержка через CUDA/OpenCL.

## Системные требования

### Node.js

```json
{
  "engines": {
    "node": ">=24.0.0"
  }
}
```

### Внешние парсеры (опционально)

| Язык | Требование | Версия |
|------|------------|--------|
| Python | Python runtime | 3.8+ |
| Java/Kotlin | JRE | 11+ |
| Go | Go toolchain | 1.18+ |
| Rust | Rust toolchain | stable |
| C/C++ | Clang | 14+ |
| Swift | Swift toolchain | 5.5+ |
| C# | .NET SDK | 6.0+ |

## Граф зависимостей

```
ultrascript-tools-mcp
├── Core
│   ├── @modelcontextprotocol/sdk ── JSON-RPC, MCP protocol
│   ├── better-sqlite3 ───────────── SQLite native binding
│   │   └── node-gyp (build)
│   ├── sqlite-vec ───────────────── Vector search extension
│   └── zod ──────────────────────── Schema validation
│
├── Semantic (внешние сервера)
│   ├── llama.cpp ────────────────── Native GGUF (CUDA/Vulkan/CPU)
│   ├── OVMS ─────────────────────── OpenVINO Model Server (Intel)
│   ├── vLLM ─────────────────────── NVIDIA GPU Docker
│   ├── TEI ──────────────────────── HuggingFace Docker
│   ├── Ollama ───────────────────── Local LLM
│   └── @huggingface/inference ───── HF Cloud API
│
├── Storage
│   ├── lru-cache ────────────────── In-memory caching
│   └── vectorlite ───────────────── Alternative vector backend
│
└── Utils
    ├── yaml ─────────────────────── Config parsing
    ├── nanoid ───────────────────── ID generation
    └── eslint ───────────────────── JS/TS validation
```

## Версионирование

### Overrides

Текущие overrides в package.json:

```json
{
  "overrides": {}
}
```

> Overrides используются для фиксации версий транзитивных зависимостей при необходимости.

### Trusted Dependencies

```json
{
  "trustedDependencies": [
    "better-sqlite3"
  ]
}
```

> `better-sqlite3` — имеет postinstall скрипт для сборки нативного модуля.

## Обновление зависимостей

### Безопасное обновление

```bash
# Проверка устаревших пакетов
npm outdated

# Обновление patch/minor версий
npm update

# Audit безопасности
npm audit
npm audit fix
```

### Критичные зависимости

При обновлении следующих пакетов требуется полное тестирование:

1. **better-sqlite3** — нативный модуль, может сломать сборку
2. **@modelcontextprotocol/sdk** — API изменения, проверить MCP совместимость
3. **zod** — breaking changes в v4, проверить валидацию
4. **vectorlite** — нативное расширение, проверить HNSW индексы

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ DEPLOYMENT.md](./deployment.md) — сборка и деплой
- [→ PROCESSES.md](./processes.md) — технические процессы
