# Сборка и деплой

## Обзор

Документ описывает процессы сборки, конфигурации и развёртывания UltraScript Tools MCP.

## Сборка

### Требования

- **Node.js**: ≥24.0.0
- **Bun**: рекомендуется для разработки
- **Python**: 3.8+ (для nativeparsers)
- **C++ Compiler**: для нативных модулей (better-sqlite3)

### Команды сборки

```bash
# Основная сборка TypeScript → JavaScript
npm run build

# Сборка с watch mode
npm run build:watch

# Полная сборка (TS + WASM)
npm run build:full

# Проверка типов без emit
npm run typecheck
```

### Standalone бинарники

```bash
# Текущая платформа
npm run build:standalone

# Windows x64
npm run build:standalone:win

# Linux x64
npm run build:standalone:linux

# macOS ARM64
npm run build:standalone:mac
```

### Нативные модули

```bash
# CUDA поддержка (опционально)
npm run build:cuda

# Коммуникационный модуль
npm run build:comm
```

## Конфигурация

### Environment Variables

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `MCP_DEBUG` | Включить debug режим | `0` |
| `MCP_DEBUG_DISABLE_SEMANTIC` | Отключить семантику | `0` |
| `MCP_EMBEDDING_PROVIDER` | Провайдер эмбеддингов | `auto` |
| `MCP_EMBEDDING_MODEL` | Модель эмбеддингов | auto-detect |
| `MCP_LOG_LEVEL` | Уровень логирования | `info` |
| `OLLAMA_HOST` | Ollama API URL | `http://localhost:11434` |
| `TEI_ENDPOINT` | TEI API URL | `http://localhost:8080` |
| `OPENAI_API_KEY` | OpenAI API ключ | — |
| `HF_TOKEN` | HuggingFace токен | — |

### Файлы конфигурации

```
config/
├── embedding-models.json      # Модели эмбеддингов
├── embedding-models.schema.json # JSON Schema
└── llm-models.json            # LLM модели для AutoDoc
```

### MCP Server Config (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "node",
      "args": ["/path/to/ultrascript-tools-mcp/dist/index.js"],
      "env": {
        "MCP_EMBEDDING_PROVIDER": "openvino",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Bun конфигурация

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "bun",
      "args": ["run", "/path/to/ultrascript-tools-mcp/src/index.ts"]
    }
  }
}
```

## Деплой

### NPM публикация

```bash
# Подготовка (автоматически при prepublishOnly)
npm run build

# Публикация
npm publish
```

### Включаемые файлы

```json
{
  "files": [
    "bin/**/*.js",
    "dist/**/*.js",
    "dist/**/*.wasm",
    "dist/**/*.d.ts",
    "external-libs/cuda-*/*.node",
    "scripts/setup-*.sh",
    "scripts/setup-*.cmd",
    "config/*.json",
    "prompts/**/*.md"
  ]
}
```

### Docker (опционально)

```dockerfile
FROM node:24-slim

WORKDIR /app

# Установка зависимостей для нативных модулей
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production

COPY dist/ ./dist/
COPY config/ ./config/

ENV MCP_EMBEDDING_PROVIDER=memory
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

## Настройка эмбеддингов

### Интерактивная настройка

```bash
# Windows
scripts/setup-embeddings.cmd

# Linux/macOS
./scripts/setup-embeddings.sh
```

### Выбор провайдера

```
┌─────────────────────────────────────────────────────────────────┐
│                    Provider Selection                            │
└─────────────────────────────────────────────────────────────────┘

1. OpenVINO
   - Автоматическая установка
   - CPU inference, 474 chunks/s
   - Не требует GPU

2. TEI (Text Embeddings Inference)
   - Требует Docker + NVIDIA GPU
   - 1000+ chunks/s
   - Высокое качество

3. Ollama
   - Простая установка
   - CPU/GPU
   - 100-300 chunks/s

4. Memory (fallback)
   - Без ML
   - Hash-based similarity
   - Для тестирования
```

### Настройка OpenVINO

```bash
# Автоматически при setup-embeddings
# Скачивает модель в ~/.cache/huggingface/

# Ручная настройка
export MCP_EMBEDDING_PROVIDER=openvino
export MCP_EMBEDDING_MODEL=openvino-minilm-int8
```

### Настройка TEI

```bash
# Запуск Docker контейнера
docker run -d --gpus all \
  -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id sentence-transformers/all-MiniLM-L6-v2

# Конфигурация
export MCP_EMBEDDING_PROVIDER=tei
export TEI_ENDPOINT=http://localhost:8080
```

### Настройка Ollama

```bash
# Установка модели
ollama pull nomic-embed-text

# Конфигурация
export MCP_EMBEDDING_PROVIDER=ollama
export OLLAMA_HOST=http://localhost:11434
```

## CI/CD

### GitHub Actions (пример)

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test

  publish:
    needs: build
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Pre-commit hooks

```json
{
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged && npm run typecheck"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,css,md,yml,yaml}": "biome check --write"
  }
}
```

## Тестирование

### Запуск тестов

```bash
# Все тесты
npm test

# Watch mode
npm run test:watch

# С покрытием
npm run test:coverage

# CI mode (bail on first failure)
npm run test:ci
```

### Smoke тесты

```bash
# Проверка здоровья графа
npm run smoke

# С очисткой
npm run smoke:clean

# Семантический smoke
npm run smoke:semantic
```

### Бенчмарки

```bash
# Все бенчмарки
npm run bench

# Большие проекты
npm run bench:large

# SIMD операции
npm run bench:simd

# Worker threads
npm run bench:workers
```

## Мониторинг

### Логирование

```typescript
// Уровни логов
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Структурированные логи
logger.info('INDEXING', 'Started indexing', {
  directory: '/path/to/project',
  fileCount: 1000
}, requestId);
```

### Метрики агентов

```bash
# MCP tool
ultrascript-tools get_agent_metrics
```

Возвращает:
- Количество обработанных задач
- Среднее время обработки
- Размер очереди
- Процент ошибок

## Связанные документы

- [→ ARCHITECTURE.md](./architecture.md) — архитектура системы
- [→ DEPENDENCIES.md](./dependencies.md) — зависимости
- [→ PROCESSES.md](./processes.md) — технические процессы
