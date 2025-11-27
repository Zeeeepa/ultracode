# UltraScript Tools MCP Server

[![npm version](https://badge.fury.io/js/@er77%2Fultrascript-tools-mcp.svg)](https://www.npmjs.com/package/@er77/ultrascript-tools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)


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
npm install -g @er77/ultrascript-tools-mcp

# Или запустить без установки
npx @er77/ultrascript-tools-mcp /путь/к/вашему/проекту
```

### Интеграция с Claude Desktop (1 минута)

```bash
# Автоматическая настройка
npx @modelcontextprotocol/inspector add code-graph-rag \
  --command "npx" \
  --args "@er77/ultrascript-tools-mcp /путь/к/проекту"
```

**Или вручную** в конфиге Claude Desktop:
```json
{
  "mcpServers": {
    "code-graph-rag": {
      "command": "npx",
      "args": ["@er77/ultrascript-tools-mcp", "/путь/к/проекту"]
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

**🏆 Рекомендуется: TEI (локально, Docker)**
```bash
# Установка за 2 минуты
./setup-tei.sh  # macOS/Linux
setup-tei.cmd   # Windows

# Что получите:
✅ 8192 токена контекста (в 16 раз больше чем Ollama)
✅ Локальный инференс (без облачных API)
✅ Автоматический запуск Docker контейнера
✅ Лучшая производительность
```

**Альтернативы:**
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

**Storage**: SQLite (WAL mode) + адаптивные векторные бэкенды:
- **Автовыбор**: система автоматически выбирает оптимальный бэкенд по размеру кодовой базы
- **sqlite-vec** (<10k векторов) - точный поиск, быстрая вставка
- **vectorlite** (>10k векторов) - HNSW индекс, 3-100x быстрее поиск
- **fallback** - работает без расширений (медленнее)

**Performance**:
- Prepared statements caching - +25-30% для batch операций
- xxHash вместо SHA-256 - 10-15x быстрее
- LRU cache v11 - +10-15% операций кеша
- Adaptive resource monitoring - 70% меньше CPU в idle
- Hybrid vector search - 90% быстрее для >10k векторов
- **Adaptive backend switching** - автоматический выбор между sqlite-vec и vectorlite по размеру базы

### 24 MCP метода

**Анализ кода:**
- `index` - индексация кодовой базы
- `semantic_search` - семантический поиск
- `find_similar_code` - поиск похожего кода
- `detect_code_clones` - обнаружение дубликатов
- `jscpd_detect_clones` - JSCPD-based поиск (без ML)
- `suggest_refactoring` - AI рефакторинг

**Граф зависимостей:**
- `get_graph` - получение графа сущностей
- `list_entity_relationships` - связи сущности
- `list_file_entities` - сущности в файле
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

**Минимум**: Node.js 18+, 2GB RAM, Dual-core CPU
**Рекомендуется**: Node.js 18+, 8GB RAM, Quad-core CPU, SSD

### Конфигурация

Через YAML файлы (`config/default.yaml`) или environment variables:
- `MCP_EMBEDDING_PROVIDER` - провайдер эмбеддингов (tei/ollama/huggingface)
- `MCP_EMBEDDING_ENABLED` - включить семантический поиск
- `INDEXING_BRANCH_AWARE` - режим Git-веток

**Адаптивные векторные бэкенды** (`config/default.yaml`):
```yaml
vectorBackend:
  backend: "auto"              # auto | vectorlite | sqlite-vec | fallback
  autoSwitchThreshold: 10000   # порог переключения (векторов)
  vectorlite:                  # настройки HNSW для больших баз
    maxElements: 100000
    M: 16                      # связей на слой (выше = лучше recall)
    efConstruction: 200        # качество построения индекса
    efSearch: 50               # качество поиска (выше = точнее, медленнее)
```

**Когда использовать**:
- `auto` (рекомендуется) - автоматический выбор по размеру
- `vectorlite` - для больших проектов (>10k векторов), приоритет скорости поиска
- `sqlite-vec` - для малых/средних проектов (<10k векторов), приоритет скорости вставки
- `fallback` - когда расширения недоступны (медленнее)

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
