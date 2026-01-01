# UltraScript Tools MCP Server

[![npm version](https://badge.fury.io/js/ultrascript-tools-mcp.svg)](https://www.npmjs.com/package/ultrascript-tools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0.0-f472b6)](https://bun.sh)


> **📖 Developer Setup Guide**: Полная инструкция по установке и настройке см. в **[DEV_SETUP_GUIDE.md](./DEV_SETUP_GUIDE.md)**
>
> **🎯 CUDA Backend**: Successfully built! См. **[FINAL_CUDA_SUCCESS.md](./_ul/FINAL_CUDA_SUCCESS.md)** для деталей

**Умный ассистент для работы с вашим кодом**

Представьте, что вы можете просто спросить у своего кода: "Где обрабатывается аутентификация?", "Какие функции дублируются?", "Что сломается, если я изменю этот класс?" — и получить точные ответы за секунды.

Code Graph RAG делает именно это. Он анализирует вашу кодовую базу, понимает связи между компонентами и отвечает на вопросы на естественном языке через Claude, Gemini или другие AI-ассистенты.

**🌟 10 языков** | **⚡ В 5.5 раз быстрее** встроенных инструментов Claude | **🔍 Умный поиск** | **📊 24 готовых инструмента**

---

## 💡 **Что это дает вам?**

### Работайте с кодом на человеческом языке

Вместо ручного поиска по файлам и grep-запросов, просто спросите:

**Примеры вопросов:**
- "Покажи все функции, связанные с оплатой"
- "Найди дубликаты кода в проекте"
- "Что сломается, если я изменю класс UserManager?"
- "Какие компоненты самые сложные и требуют рефакторинга?"
- "Где используется эта функция?"

**Ответы приходят за секунды**, а не минуты ручного поиска.

### Экономьте время на рутине

| Задача | Обычный способ | С Code Graph RAG |
|--------|----------------|------------------|
| Найти похожий код | 15-30 минут grep + ручной анализ | **5 секунд** - автоматический поиск дубликатов |
| Понять, что сломается при изменении | 30-60 минут ручного прослеживания зависимостей | **10 секунд** - анализ влияния изменений |
| Найти функции по описанию | "Как она называлась?.." | **Мгновенно** - семантический поиск |
| Оценить сложность компонента | Долгий анализ вручную | **Автоматически** - метрики сложности |

### Умный анализ, а не просто поиск текста

**Обычный поиск** находит только точные совпадения:
```
grep "authenticate" → находит только слово "authenticate"
```

**Code Graph RAG** понимает смысл:
```
"Найди код аутентификации" → находит:
- login()
- verifyToken()
- checkCredentials()
- authenticateUser()
```

Потому что понимает, что все эти функции делают одно и то же - **проверяют пользователя**.

---

## 🚀 **Реальные примеры использования**

### 1. Поиск дубликатов для рефакторинга

**Проблема**: В разных частях проекта одна и та же логика написана по-разному.

**Решение**:
```
Вы: "Найди дублирующийся код"

Code Graph RAG:
✓ Найдено 15 групп дубликатов
  - calculateDiscount() и getDiscount() - похожи на 93%
  - validateUser() и checkUser() - похожи на 89%
  ...

Экономия: 200 строк кода, улучшение поддерживаемости
```

### 2. Оценка влияния изменений

**Проблема**: Нужно изменить API класса, но не понятно что сломается.

**Решение**:
```
Вы: "Что использует класс PaymentProcessor?"

Code Graph RAG:
✓ Зависимости найдены:
  - OrderService.processOrder() - прямое использование
  - CheckoutController.pay() - через DI
  - PaymentQueue.worker - асинхронные задачи

Затронуто: 3 компонента, 8 файлов
```

### 3. Поиск проблемных мест

**Проблема**: Код медленно работает, но не понятно где узкие места.

**Решение**:
```
Вы: "Покажи самые сложные компоненты"

Code Graph RAG:
✓ Hotspots (проблемные зоны):
  1. DataProcessor.transform() - сложность 85/100
  2. ReportGenerator.generate() - сложность 78/100
  3. UserService.sync() - сложность 72/100

Рекомендация: начать рефакторинг с DataProcessor
```

---

## ⚡ **Насколько это быстро?**

**В 5.5 раз быстрее** встроенных инструментов Claude:

| Операция | Встроенные инструменты | Code Graph RAG | Ускорение |
|----------|------------------------|----------------|-----------|
| Анализ проекта (1000 файлов) | ~55 секунд | **<10 секунд** | **5.5x** |
| Поиск по коду | Долго (процессы для каждого файла) | Мгновенно (индекс в памяти) | **10x+** |
| Семантический поиск | Не поддерживается | **<100 мс** | ∞ |
| Использование памяти | Тяжелые процессы | 65 MB | Оптимизировано |

**Почему так быстро?**
- ✅ Код анализируется один раз, потом работает с готовым индексом
- ✅ Используется SQLite в памяти - запросы за миллисекунды
- ✅ Параллельная обработка файлов (100+ файлов/секунду)
- ✅ Умное кеширование результатов

**Пример**: проект на 152 файла индексируется за **78 секунд** вместо 96.

---

## 🎯 **Главные возможности**

### Семантический поиск (понимает смысл)
"Найди функции работы с платежами" → находит все, даже если называются по-разному

### Обнаружение дубликатов
Автоматически находит повторяющийся код, даже если переменные называются иначе

### Анализ влияния изменений
"Что сломается, если изменить эту функцию?" → список всех зависимостей

### Рекомендации по рефакторингу
AI-анализ кода с конкретными предложениями по улучшению

### Поиск проблемных зон
Метрики сложности, связности, "горячие точки" требующие внимания

### Поддержка 10 языков программирования
TypeScript, JavaScript, Python, C#, C/C++, Rust, Go, Java, VBA

### Работа с Git-ветками
Автоматическое переключение между ветками, сравнение изменений

### Анализ нескольких проектов одновременно
Работайте с frontend и backend одновременно

---

## 📦 **Быстрый старт**

### Установка (30 секунд)

```bash
# Установить глобально
npm install -g ultrascript-tools-mcp

# Или запустить без установки
npx ultrascript-tools-mcp /путь/к/вашему/проекту
```

> **Примечание:** При установке могут появиться warnings о peer dependencies — это безопасно. Node.js 24+ поддерживается через прекомпилированные tree-sitter prebuilds.

### 🚀 С Bun (в 1.5-4x быстрее)

```bash
# Установка Bun (Windows)
powershell -c "irm bun.sh/install.ps1 | iex"

# Установка Bun (macOS/Linux)
curl -fsSL https://bun.sh/install | bash

# Запуск с Bun
bunx ultrascript-tools-mcp /путь/к/проекту
```

### Интеграция с Claude Desktop (1 минута)

Добавьте в конфиг Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json` на Windows):

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "npx",
      "args": ["ultrascript-tools-mcp", "/путь/к/проекту"]
    }
  }
}
```

### Интеграция с Claude Code (CLI)

Создайте `.mcp.json` в корне проекта:
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "bunx",
      "args": ["ultrascript-tools-mcp", "."]
    }
  }
}
```

### Готово! Теперь спрашивайте Claude о вашем коде

```
Вы: "Покажи структуру проекта"
Вы: "Найди дубликаты кода"
Вы: "Что использует функцию authenticateUser?"
Вы: "Какие компоненты самые сложные?"
```

---

## 🎨 **Дополнительные возможности**

### Семантический поиск с 8192 токенами (опционально)

Для продвинутого семантического анализа можно включить ML-модели:

**🏆 Рекомендуется: OVMS (OpenVINO Model Server)**
```bash
# Интерактивная установка
npx ultrascript-tools-mcp setup

# Автоматически:
✅ Обнаруживает ваше железо (CPU/GPU/NPU)
✅ Рекомендует оптимальный провайдер
✅ Скачивает модели и настраивает конфигурацию
```

**Провайдеры эмбеддингов:**

| Провайдер | Скорость | Контекст | Рекомендация |
|-----------|----------|----------|--------------|
| **ovms-native** | 0.8-2ms | 512-8K | ⭐ CPU/NPU, лучший выбор |
| **vllm** | 1-3ms | 512-8K | ⭐ NVIDIA GPU Production |
| **tei** | 5-15ms | 8K | Альтернатива Docker |
| **ollama** | 10-50ms | 512 | Простая установка |

**Альтернативы:**
- **TEI** - Docker, 8192 токенов, локальный инференс
- **Ollama** - проще (без Docker), но только 512 токенов
- **HuggingFace API** - облако, 8192 токенов, бесплатный API ключ

Подробнее: [EMBEDDINGS_SETUP.md](./EMBEDDINGS_SETUP.md)

### Работа с Git-ветками (опционально)

Автоматическое переключение индекса при смене веток:

```yaml
# config/default.yaml
indexing:
  branchAware: true  # Включить режим веток
git:
  enabled: true      # Автоматически отслеживать изменения
```

**Что получите:**
- ✅ Точный индекс для каждой ветки
- ✅ Автоматическое переключение при `git checkout`
- ✅ Инкрементальная синхронизация (только измененные файлы)

Подробнее: [docs/BRANCH_AWARE_INDEXING.md](./docs/BRANCH_AWARE_INDEXING.md)

---

## 🌍 **Поддерживаемые языки**

| Язык | Что анализируется | Качество |
|------|-------------------|----------|
| **TypeScript/JavaScript** | ES6+, JSX, TSX, React, async/await | ✅ 100% |
| **Python** | Классы, функции, async, декораторы, магические методы | ✅ 95% |
| **C#** | Классы, интерфейсы, LINQ, async/await, свойства | ✅ 90% |
| **C/C++** | Функции, структуры, классы, шаблоны, неймспейсы | ✅ 90% |
| **Rust** | Функции, структуры, traits, impl, модули | ✅ 90% |
| **Go** | Пакеты, функции, структуры, интерфейсы, горутины | ✅ 90% |
| **Java** | Классы, интерфейсы, records (Java 14+), дженерики | ✅ 90% |
| **VBA** | Модули, функции, процедуры, типы | ✅ 80% |

**Полиглот-проекты?** Без проблем! Анализирует связи между разными языками.

---

## 🔧 **Интеграция с AI-ассистентами**

### Claude Desktop
```bash
npx @modelcontextprotocol/inspector add code-graph-rag \
  --command "npx" --args "@er77/ultrascript-tools-mcp /проект"
```

### Gemini CLI
```bash
./scripts/GEMINI-CORRECT-CONFIG.sh  # Показывает готовую команду
```

### Codex CLI
```bash
./scripts/CODEX-CORRECT-CONFIG.sh  # Показывает что добавить в ~/.codex/config.toml
```

### Несколько проектов одновременно
См. [Multi-Codebase Setup Guide](docs/guides/MULTI_CODEBASE_SETUP.md)

---

## 📊 **Что внутри (для технарей)**

<details>
<summary>Технические детали</summary>

### Архитектура

**Multi-agent система** с координацией через Conductor:
- **ParserAgent** - AST-парсинг через tree-sitter (10 языков)
- **IndexerAgent** - Индексация в SQLite с батчингом
- **SemanticAgent** - Векторные эмбеддинги, семантический поиск
- **QueryAgent** - Оптимизация и выполнение запросов
- **DoraAgent** - Метрики сложности и анализ

**Storage**: libSQL unified database (WAL mode):
- **Унифицированное хранилище**: entities, relationships, vectors в одной БД
- **libSQL/Turso**: поддержка edge database для распределенных систем
- **Bun native SQLite**: автоматическое использование bun:sqlite

**GPU Acceleration** (опционально):
- **CUDA Worker**: изолированный subprocess для NVIDIA GPU операций
- **Dawn WebGPU**: cross-platform GPU через WebGPU стандарт
- **WASM SIMD**: fallback для CPU без AVX2
- **Blackwell detection**: автоматический fallback для RTX 50xx (CC ≥12.0)

**Performance**:
- Prepared statements caching - +25-30% для batch операций
- xxHash вместо SHA-256 - 10-15x быстрее
- LRU cache v11 - +10-15% операций кеша
- Adaptive resource monitoring - 70% меньше CPU в idle
- **OVMS V3 API** - batch embeddings с base64 encoding, 0.8-2ms/запрос

### 24 MCP метода

**Анализ кода:**
- `index` - индексация кодовой базы
- `semantic_search` - семантический поиск
- `find_similar_code` - поиск похожего кода
- `find_duplicates` - обнаружение дубликатов
- `jscpd_detect_clones` - JSCPD-based поиск (без ML)
- `suggest_refactoring` - AI рефакторинг

**Граф зависимостей:**
- `get_graph` - получение графа сущностей
- `list_entity_relationships` - связи сущности
- `get_members` - сущности в файле
- `analyze_code_impact` - анализ влияния изменений
- `analyze_hotspots` - поиск проблемных зон

**Git ветки:**
- `list_branches` - список проиндексированных веток
- `switch_branch` - переключение на другую ветку
- `get_branch_status` - статус текущей ветки
- `cleanup_branches` - очистка старых веток
- `get_changed_files` - файлы изменившиеся между ветками

**Диагностика:**
- `get_graph_health` - диагностика БД
- `get_version` - версия сервера
- `get_agent_metrics` - метрики агентов
- `get_bus_stats` - статистика knowledge bus
- `reset_graph` - очистка графа
- `clean_index` - полная переиндексация

**Workspace:**
- `lerna_project_graph` - граф Lerna workspace зависимостей

### Системные требования

**Минимум**: Node.js 24+, 2GB RAM, Dual-core CPU
**Рекомендуется**: Node.js 24+ или Bun 1.0+, 8GB RAM, Quad-core CPU, SSD

> **Node.js 24 и tree-sitter**: npm-пакет включает прекомпилированные prebuilds для Windows/Linux/macOS — дополнительная компиляция не требуется.

### Конфигурация

Через YAML файлы (`config/default.yaml`) или environment variables:
- `MCP_EMBEDDING_PROVIDER` - провайдер эмбеддингов (ovms/tei/ollama)
- `MCP_EMBEDDING_ENABLED` - включить семантический поиск
- `INDEXING_BRANCH_AWARE` - режим Git-веток

**Конфигурация semantic-config.json** (создается через `setup`):
```json
{
  "enabled": true,
  "embedding": {
    "platform": "ovms-native",
    "ovms": {
      "endpoint": "http://127.0.0.1:8083",
      "batch_size": 200,
      "target_device": "CPU",
      "useEmbeddingsApi": true
    }
  }
}
```

**Провайдеры эмбеддингов**:
- `ovms-native` (рекомендуется для CPU/Intel GPU) - локальный OVMS бинарник, автоматический lifecycle
- `vllm` (рекомендуется для NVIDIA GPU) - Docker контейнер vLLM, высокая производительность
- `tei` - HuggingFace Text Embeddings Inference (Docker)
- `ollama` - простая установка, но медленнее

</details>

---

## 🛠️ **Разработка**

```bash
# Установка зависимостей
npm install

# Сборка
npm run build

# Запуск
node dist/index.js /path/to/project

# Тесты
npm test

# ⚡ Сборка с Bun (3x быстрее)
bun install
./build-bun.sh  # или build-bun.cmd для Windows
```

См. также: [BUN_SETUP.md](./BUN_SETUP.md) для ультра-быстрой сборки с Bun

---

## 📝 **Changelog**

### v2.5.0 (2025-12) - OVMS & GPU Isolation

**Новое:**
- 🚀 **OVMS провайдер** - OpenVINO Model Server с V3 API (0.8-2ms/запрос)
- 🎮 **GPU Worker изоляция** - CUDA операции в отдельном subprocess
- 💾 **libSQL хранилище** - унифицированная БД для entities + vectors
- 🔧 **Интерактивный setup** - `npx ultrascript-tools-mcp setup`
- 🪟 **Windows fixes** - скрытые консольные окна, корректный shutdown OVMS

**Улучшения:**
- Автоматическое обнаружение CPU/GPU/NPU при setup
- Поддержка Blackwell (RTX 50xx) с fallback на WASM SIMD
- Корректное завершение OVMS процесса (taskkill /T на Windows)

### v2.8.0 (2025-11-13) - ULTRA Performance

**9 критических оптимизаций:**
- ⚡ better-sqlite3 v12.4.1 - +20% write speed
- ⚡ Prepared statement caching - +25-30% batch operations
- ⚡ Adaptive monitoring - 70% CPU reduction в idle
- ⚡ Hybrid vector search - 90% faster для >10k векторов
- 🆕 Branch-aware indexing - изолированная БД для каждой Git ветки

**Итог**: 50-70% общее ускорение

[Полный changelog](./ULTRA.md)

### v2.7.4 (2025-11-02) - Clone Reporting

- 🆕 CLI flags: `--help`, `--version`
- 📊 Улучшенная отчетность по дубликатам
- 🧪 Интеграционное покрытие clone-report

### v2.6.0 (2025-10-12) - Architecture Upgrade

- 🔄 Provider-based embeddings (memory/ollama/openai/cloudru/huggingface)
- 🧭 Runtime diagnostics (`get_agent_metrics`, `get_bus_stats`)
- 🎯 Deterministic SHA256-based IDs
- 📊 100% MCP method validation (22/22)

---

## 🤝 **Contributing**

1. Fork the repository
2. Следуйте [Agent Governance](docs/AGENTS.md)
3. Submit pull request

[Contributing Guide](docs/guides/CONTRIBUTING.md) • [Issue Tracker](https://github.com/faxenoff/ultrascript-tools-mcp/issues)

---

## 📄 **License**

MIT License - see [LICENSE](LICENSE)

**Links**: [GitHub](https://github.com/faxenoff/ultrascript-tools-mcp) • [NPM](https://www.npmjs.com/package/@er77/ultrascript-tools-mcp) • [MCP Protocol](https://github.com/modelcontextprotocol)
