# Зависимости проекта

## Обзор

Документ описывает все зависимости UltraScript Tools MCP v2.1.0, их назначение и версии.

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
| `openvino-node` | ^2025.4.0 | CPU inference для эмбеддингов (OpenVINO) |
| `@xenova/transformers` | ^2.17.2 | Transformers.js для fallback эмбеддингов |
| `@huggingface/inference` | ^4.13.4 | HuggingFace API клиент |
| `xxhash-wasm` | ^1.1.0 | Быстрое хеширование для Memory провайдера |

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
├── Semantic
│   ├── openvino-node ────────────── CPU inference
│   │   └── (downloads IR models at runtime)
│   ├── @xenova/transformers ─────── Transformers.js
│   │   └── onnxruntime-node ─────── ONNX runtime
│   └── @huggingface/inference ───── HF API
│
├── Storage
│   ├── lru-cache ────────────────── In-memory caching
│   ├── vectorlite ───────────────── Alternative vector backend
│   └── xxhash-wasm ──────────────── Fast hashing
│
└── Utils
    ├── yaml ─────────────────────── Config parsing
    ├── nanoid ───────────────────── ID generation
    └── eslint ───────────────────── JS/TS validation
```

## Версионирование

### Overrides

```json
{
  "overrides": {
    "boolean": "3.2.0"
  }
}
```

> `boolean@3.2.0` — deprecated транзитивная зависимость от onnxruntime-node. Пакет не поддерживается, но работает. Используется только в опциональных ML фичах.

### Trusted Dependencies

```json
{
  "trustedDependencies": [
    "openvino-node"
  ]
}
```

> `openvino-node` — имеет postinstall скрипт для загрузки бинарников OpenVINO.

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
2. **openvino-node** — нативный модуль, проверить inference
3. **@modelcontextprotocol/sdk** — API изменения, проверить MCP совместимость
4. **zod** — breaking changes в v4, проверить валидацию

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ DEPLOYMENT.md](./deployment.md) — сборка и деплой
- [→ PROCESSES.md](./processes.md) — технические процессы
