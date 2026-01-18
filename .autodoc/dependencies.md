# Зависимости проекта

## Обзор

Документ описывает все зависимости UltraScript Tools MCP v3.1+, их назначение и версии.

## Runtime Dependencies

### Ядро системы

| Пакет | Версия | Назначение |
|-------|--------|------------|
| `@modelcontextprotocol/sdk` | ^1.25.2 | MCP протокол, JSON-RPC сервер |
| `@libsql/client` | ^0.17.0 | LibSQL/Turso драйвер для хранения графа |
| `zod` | ^4.3.5 | Валидация схем, JSON Schema генерация |
| `lru-cache` | ^11.2.4 | LRU кэш для парсеров и эмбеддингов |
| `nanoid` | ^5.1.6 | Генерация уникальных ID |
| `graphology` | ^0.26.0 | Граф в памяти, обход и анализ |
| `graphology-shortest-path` | ^2.1.0 | Поиск кратчайших путей в графе |

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

| Пакет | Версия | Назначение | Статус |
|-------|--------|------------|--------|
| `@webgpu/node` | npm:null@^2.0.0 | WebGPU для Node.js | **Заглушка** — пустой пакет для transformers.js |
| `@webgpu/types` | ^0.1.69 | WebGPU TypeScript типы | Только типы, не исполняемый код |
| `webgpu` | ^0.3.8 | Dawn WebGPU runtime | **Рабочий** — используется WebGPUBackend |
| `faiss-napi` | ^0.10.3 | FAISS векторный индекс | Рабочий, HNSW/IVF индексы |

### WebGPU — подробности

**`webgpu-backend.ts`** — полноценный GPU backend с WGSL compute шейдером для косинусного сходства.

Порядок выбора backend'а (`backend-selector.ts`):

| Приоритет | Backend | Условие |
|-----------|---------|---------|
| 100 | CUDA Native | NVIDIA + Node.js runtime |
| 98-100 | CUDA Worker | NVIDIA (через subprocess для Bun) |
| 95 | Metal | Apple Silicon (macOS ARM64) |
| **80** | **WebGPU** | **Когда CUDA/Metal недоступны** |
| 50 | WASM SIMD | CPU fallback |
| 1 | Pure JS | Всегда доступен |

> **Вывод**: WebGPU — запасной вариант для систем без NVIDIA/Apple Silicon.
> На практике редко используется: CUDA/Metal имеют более высокий приоритет.
> Dawn WebGPU также имеет проблемы совместимости с новыми GPU (Blackwell).

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
│   ├── @libsql/client ───────────── LibSQL/Turso database
│   ├── graphology ───────────────── In-memory graph + algorithms
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
├── GPU Backends (приоритет)
│   ├── CUDA Native ──────────────── NVIDIA + Node.js (100)
│   ├── CUDA Worker ──────────────── NVIDIA + Bun (98-100)
│   ├── Metal ────────────────────── Apple Silicon (95)
│   ├── WebGPU (Dawn) ────────────── Universal fallback (80)
│   ├── WASM SIMD ────────────────── CPU SIMD (50)
│   └── Pure JS ──────────────────── Always available (1)
│
├── Storage
│   ├── lru-cache ────────────────── In-memory caching
│   └── faiss-napi ───────────────── HNSW/IVF vector index (optional)
│
└── Utils
    ├── yaml ─────────────────────── Config parsing
    ├── nanoid ───────────────────── ID generation
    ├── oxc-parser ───────────────── Fast JS/TS parsing
    └── eslint ───────────────────── JS/TS validation
```

## Версионирование

### Overrides

Текущие overrides в package.json:

```json
{
  "overrides": {
    "boolean": "3.2.0",
    "sharp": "npm:null@^2.0.0",
    "onnxruntime-node": "npm:null@^2.0.0"
  }
}
```

| Override | Причина |
|----------|---------|
| `boolean@3.2.0` | Deprecated транзитивная зависимость, пакет не поддерживается но работает |
| `sharp → null` | Не нужен — используется только токенизация из transformers.js |
| `onnxruntime-node → null` | Заменён на OVMS Docker для инференса |

### Trusted Dependencies

```json
{
  "trustedDependencies": [
    "cbor-extract",
    "esbuild",
    "faiss-napi",
    "protobufjs",
    "webgpu"
  ]
}
```

> Пакеты с postinstall скриптами для сборки нативных модулей.

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

1. **@libsql/client** — драйвер БД, проверить миграции
2. **@modelcontextprotocol/sdk** — API изменения, проверить MCP совместимость
3. **zod** — breaking changes в v4, проверить валидацию
4. **faiss-napi** — нативное расширение, проверить HNSW индексы
5. **oxc-parser** — парсер JS/TS, проверить AST совместимость

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ DEPLOYMENT.md](./deployment.md) — сборка и деплой
- [→ PROCESSES.md](./processes.md) — технические процессы
