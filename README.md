```
        ██  ██
        ██  ██  ██    ██████ █████▄  ▄████▄
        ██  ██  ██      ██   ██▄▄██▄ ██▄▄██
        ██  ██  ██      ██   ██   ██ ██  ██
        ██  ██  ██████  ██   ██   ██ ██  ██
        ▀████▀            ▄▄▄▄  ▄▄▄▄ ▄▄▄▄  ▄▄ ▄▄▄▄ ▄▄▄▄▄▄
                         ███▄▄ ██▀▀▀ ██▄█▄ ██ ██▄█▀  ██
                         ▄▄██▀ ▀████ ██ ██ ██ ██     ██

     ╔═════════════════════════════════════════════════════╗
     ║            ULTRASCRIPT TOOLS MCP SERVER             ║
     ╚═════════════════════════════════════════════════════╝
```

[![npm version](https://badge.fury.io/js/ultrascript-tools-mcp.svg)](https://www.npmjs.com/package/ultrascript-tools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.3.2-f472b6)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)

**Мультиагентный MCP-сервер для анализа кода с продвинутым графовым пониманием**

Мощный инструмент анализа кода, который понимает структуру вашей кодовой базы, находит дубликаты, анализирует влияние изменений и предоставляет интеллектуальные предложения по рефакторингу через Model Context Protocol (MCP).

## Возможности

- 🔍 **Семантический поиск по коду** - Поиск кода по смыслу, а не только по ключевым словам
- 🔄 **Обнаружение дубликатов** - Автоматический поиск похожих блоков кода
- 📊 **Анализ влияния** - Узнайте, что сломается при изменении кода
- 🎯 **Умный рефакторинг** - Получайте AI-предложения по рефакторингу
- 🌳 **Поддержка Git-веток** - Анализ кода в разных ветках
- ⚡ **SIMD/CUDA ускорение** - Быстрая обработка с аппаратным ускорением
- 🌍 **10 языков** - TypeScript, JavaScript, Python, Go, Rust, Java, C++, Swift, Kotlin, Bash

> Для проектов с C# - используйте аналогичный [ultrasharp-tools-mcp](https://github.com/faxenoff/ultrasharp-tools-mcp)

## 1. Установка

Проект оптимизирован под [Bun](https://bun.sh) (это альтернативный JavaScript-runtime). Под npm проект тоже работает, но 4-10 раз медленней (нет смысла его так использовать).

**Установка Bun** (одной командой):

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

**Установка Ultrascript-tools**

```bash
# Bun (рекомендуется) — два шага:

# 1. Установка пакета
bun install -g ultrascript-tools-mcp

# 2. Разрешить и выполнить postinstall скрипты (компиляция нативных модулей)
bun pm -g trust ultrascript-tools-mcp openvino-node webgpu
```

```bash
# npm (альтернатива) — один шаг:
npm install -g ultrascript-tools-mcp
```

> **Почему два шага для Bun?** Bun блокирует postinstall скрипты для безопасности. Команда `bun pm trust` разрешает выполнение скриптов и сразу их запускает — повторная установка не нужна.

> **Примечание**: Для полноценного анализа кода на разных языках требуются соответствующие runtime:
> 
> - TypeScript/JavaScript — встроено (TypeScript Compiler API)
> - Python — требуется Python 3.8+ (`python --version`)
> - Java/Kotlin — требуется JRE 11+ (`java --version`)
> - Go — требуется Go 1.18+ (`go version`)
> - Rust — требуется Rust toolchain (`rustc --version`)
> - C/C++ — требуется Clang 12+ (`clang --version`)

**Конфиг Claude Code** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "ultrascript"
    }
  }
}
```

### Способы подключения к Claude Code

| Способ                    | Скорость | Описание                                    |
| ------------------------- | -------- | ------------------------------------------- |
| **1. Cosmopolitan Proxy** | ⭐⭐       | Универсальный бинарник, авто-выбор Bun/Node |
| **2. Direct Node/Bun**    | ⭐        | Прямой запуск без прокси                    |
| **3. Ultra-режим**        | ⭐⭐⭐      | Claude + MCP под Bun                        |

**Способ 1 — Cosmopolitan Proxy (рекомендуется):**

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "type": "stdio",
      "command": "path\\to\\ultrascript-tools.cmd",
      "args": ["."]
    }
  }
}
```

**Способ 3 — Ultra-режим (максимальная производительность):**

```powershell
# Запуск Claude Code через Bun
bun "$env:USERPROFILE\.bun\install\global\node_modules\@anthropic-ai\claude-code\cli.js" --continue --permission-mode bypassPermissions
```

> Подробная документация: [docs/CLAUDE_CODE_INTEGRATION.md](docs/CLAUDE_CODE_INTEGRATION.md)

**Настройка семантических эмбеддингов (локальная LLM)**
Для небольших интеллектуальных задач по анализу/модификации кода используется небольшая локальная модель, запускаемся через ollama/TEI. Это снимает затраты токенов и времени с вашего основного ИИ-агента. Особенно важно для анализа сотен и тысяч изменений в коде.

После установки проекта - запустите

```bash
# Интерактивный мастер настройки
bunx ultrascript-tools-mcp setup
```

Мастер настройки:

- Автоматически определит вашу GPU (NVIDIA Turing/Ampere/Ada/Hopper/Blackwood*)
- Поможет выбрать лучшую модель эмбеддингов
- Автоматически установит TEI (Docker) или Ollama
- Сохранит конфигурацию в системную директорию

*Для Blackwood (GTX 50xxx) используется неофициальный форк TEI

### 2. MCP Prompts (встроенная документация)

Сервер предоставляет **MCP Prompts** — встроенную документацию, доступную прямо из Claude:

| Prompt           | Описание                                                         |
| ---------------- | ---------------------------------------------------------------- |
| `quick-start`    | Быстрый старт — когда и какие инструменты использовать           |
| `tool-reference` | Полный справочник 50+ инструментов с параметрами                 |
| `workflows`      | Типичные сценарии: анализ проекта, рефакторинг, поиск дубликатов |

> **Совет:** В системные промпты можно добавить [короткий промпт](docs/claude.cfg/add-to-CLAUDE.md) который поможет ИИ-агенту узнать о способе получения информации о работе Ultrascript-tools.

## Доступные инструменты

MCP-сервер предоставляет **55+ инструментов** для анализа и модификации кода:

#### Индексация и поиск

| Инструмент              | Описание                                                 |
| ----------------------- | -------------------------------------------------------- |
| `index`                 | Индексация кодовой базы для анализа                      |
| `query`                 | Запросы на естественном языке о коде                     |
| `semantic_search`       | Семантический поиск с фильтрами (complexity, flow, docs) |
| `pattern_search`        | Продвинутый поиск (regex/semantic/hybrid)                |
| `find_similar_code`     | Поиск похожих фрагментов кода                            |
| `cross_language_search` | Поиск по нескольким языкам                               |
| `find_related_concepts` | Поиск связанных концепций                                |

#### Анализ сущностей

| Инструмент                  | Описание                           |
| --------------------------- | ---------------------------------- |
| `get_members`               | Список сущностей/членов в файле    |
| `list_entity_relationships` | Показать зависимости кода          |
| `detect_technology_stack`   | Определить стек технологий проекта |

#### Качество кода

| Инструмент            | Описание                                  |
| --------------------- | ----------------------------------------- |
| `find_duplicates`     | Поиск дублирующегося кода (семантический) |
| `jscpd_detect_clones` | Детектор клонов на базе jscpd             |
| `analyze_code_impact` | Анализ влияния изменений                  |
| `suggest_refactoring` | AI-предложения по рефакторингу            |
| `analyze_hotspots`    | Поиск сложных участков кода               |
| `analyze_state_chaos` | Анализ хаоса состояния                    |
| `validate_file`       | Валидация файла                           |
| `validate_directory`  | Валидация директории                      |

#### Модификация кода

| Инструмент         | Описание                               |
| ------------------ | -------------------------------------- |
| `modify_code`      | Модификация кода сущности              |
| `create_file`      | Создание нового файла                  |
| `copy_file`        | Копирование файла                      |
| `rename_file`      | Переименование файла                   |
| `split_file`       | Разделение файла на части              |
| `synthesize_files` | Объединение файлов                     |
| `rename_symbol`    | Переименование символа во всём проекте |
| `add_member`       | Добавление члена в класс               |

#### Снапшоты и откат

| Инструмент          | Описание                    |
| ------------------- | --------------------------- |
| `create_snapshot`   | Создание снапшота состояния |
| `undo`              | Откат к снапшоту            |
| `list_snapshots`    | Список снапшотов            |
| `cleanup_snapshots` | Очистка старых снапшотов    |

#### Git-интеграция

| Инструмент          | Описание                        |
| ------------------- | ------------------------------- |
| `list_branches`     | Список проиндексированных веток |
| `switch_branch`     | Переключение между ветками      |
| `get_branch_status` | Статус анализа ветки            |
| `get_changed_files` | Сравнение файлов между ветками  |
| `cleanup_branches`  | Очистка старых веток (LRU)      |

#### Граф и система

| Инструмент            | Описание                   |
| --------------------- | -------------------------- |
| `get_graph`           | Получить граф кода         |
| `get_graph_stats`     | Статистика графа           |
| `get_graph_health`    | Проверка здоровья графа    |
| `reset_graph`         | Сброс графа                |
| `clean_index`         | Очистка индекса            |
| `lerna_project_graph` | Граф Lerna-монорепозитория |

#### Статический анализ потока

| Инструмент             | Описание                                           |
| ---------------------- | -------------------------------------------------- |
| `trace_flow`           | Трассировка от точки A к B с состояниями и Mermaid |
| `trace_backwards`      | Обратная трассировка — почему метод не вызывается  |
| `trace_data_flow`      | Анализ потока данных к состоянию                   |
| `analyze_state_impact` | Влияние состояния на сценарии                      |
| `find_decision_points` | Точки решений в коде                               |

#### Метрики и отладка

| Инструмент          | Описание                  |
| ------------------- | ------------------------- |
| `get_metrics`       | Метрики системы           |
| `get_version`       | Версия сервера            |
| `get_agent_metrics` | Метрики агентов           |
| `get_bus_stats`     | Статистика шины сообщений |
| `clear_bus_topic`   | Очистка топика шины       |

## Конфигурация

Настройка через переменные окружения или конфиг-файл `config/default.yaml`.

### Базовая конфигурация

```yaml
# Минимальный конфиг - работает из коробки
mcp:
  embedding:
    provider: "memory"  # Без ML
    enabled: true
```

### Опционально: ML-семантический поиск

Для улучшенного семантического поиска запустите мастер настройки:

```bash
# Интерактивная настройка
bunx ultrascript-tools-mcp setup
```

### Сравнение провайдеров эмбеддингов

| Провайдер        | Время/запрос | Batch     | GPU     | Установка      | Рекомендация             |
| ---------------- | ------------ | --------- | ------- | -------------- | ------------------------ |
| **vLLM**         | **0.3-1ms**  | ✅ Native | NVIDIA  | Docker         | ⭐ Production GPU         |
| **TEI GPU**      | **0.5-2ms**  | ✅ Native | NVIDIA  | Docker Desktop | ⭐ Альтернатива vLLM      |
| **OVMS Native**  | 0.8-2ms      | ✅ Native | CPU/NPU | Setup wizard   | ⭐ Рекомендуется для CPU  |
| **Ollama**       | 10-50ms      | ❌        | Все     | ollama.ai      | Простая установка        |
| **CloudRU**      | 5-20ms       | ✅        | Cloud   | API key        | Российское облако        |
| **HuggingFace**  | 50-200ms     | ✅        | Cloud   | API key        | Cloud API                |

#### Auto-detection (рекомендуется)

По умолчанию используется `provider: "auto"` — система автоматически определяет доступный провайдер в порядке приоритета:

1. **OVMS Native** (порт 8083) — локальный OpenVINO
2. **vLLM** (порт 8000) — Docker контейнер
3. **TEI** (порт 8081) — Docker контейнер
4. **Ollama** (порт 11434) — локальный сервер

#### OVMS Native — для CPU/NPU

- Автоустановка через `bunx ultrascript-tools-mcp setup`
- Поддержка V3 OpenAI-compatible API (`/v3/embeddings`)
- Автоматическое управление жизненным циклом процесса
- Определение устройства: NPU → NVIDIA GPU → Intel GPU → CPU

#### vLLM — для NVIDIA GPU (Production)

- Максимальная производительность для NVIDIA GPU
- Поддержка больших batch размеров
- Docker: `ghcr.io/vllm-project/vllm-openai`

### Быстрый старт

```bash
# Интерактивный мастер настройки (рекомендуется)
bunx ultrascript-tools-mcp setup

# Или с конкретным провайдером
bunx ultrascript-tools-mcp setup --provider tei     # NVIDIA GPU
bunx ultrascript-tools-mcp setup --provider ollama  # Универсальный
bunx ultrascript-tools-mcp setup --provider ovms-native  # CPU/NPU
```

### Расположение конфигурации

- Windows: `%LOCALAPPDATA%\UltraScriptTools\config\semantic-config.json`
- macOS: `~/Library/Application Support/UltraScriptTools/config/semantic-config.json`
- Linux: `~/.local/share/UltraScriptTools/config/semantic-config.json`

## Производительность

- **В 5 раз быстрее** встроенных инструментов Claude для больших кодовых баз
- **Streaming Mode** — парсинг и индексация происходят параллельно:
  - **37% быстрее** (16.8s → 10.5s для 150+ файлов)
  - **91.6%** файлов индексируется сразу через IPC streaming
- **Parallel Data Files** — JSON/YAML обрабатываются параллельно:
  - **34x быстрее** (6.7s → 195ms для 174 файлов)
  - **892 файла/сек** вместо 26 файлов/сек
- **WASM SIMD** — встроен в npm-пакет, работает везде (ускорение ещё в 2-4 раза)
- **CUDA Worker** — отдельный процесс для GPU-операций (ускорение 10-50x для больших проектов)
  - Изолированный Node.js subprocess для стабильности (не влияет на основной Bun процесс)
  - FAISS + CUDA для быстрого векторного поиска
  - Автоматический fallback на CPU при отсутствии GPU
- **WebGPU/Dawn** — кросс-платформенное ускорение (Windows/Linux, включён в npm-пакет)

### Архитектура хранения (v2.5)

- **libSQL/SQLite** — единая база данных для графа и векторов
- **Внешняя индексация** — поддержка удалённых libSQL серверов для масштабирования
- **Инкрементальная индексация** — обновление только изменённых файлов

### FAISS HNSW (быстрый векторный поиск)

FAISS обеспечивает **10-100x ускорение** векторного поиска для больших индексов (10k+ векторов).

| Платформа   | Статус  | Примечание               |
| ----------- | ------- | ------------------------ |
| Windows x64 | Bundled | OpenBLAS + DLLs включены |
| Linux x64   | Bundled | Системные libopenblas    |
| macOS ARM   | Bundled | Accelerate framework     |
| macOS x64   | Bundled | OpenBLAS                 |

**Зависимости (автоматически устанавливаются):**

- `faiss-node` — Node.js bindings для FAISS
- OpenBLAS/LAPACK — матричные операции (DLLs включены для Windows)

**Если FAISS не работает:**

```bash
# Переустановить с копированием DLL
node scripts/postinstall.js

# Или проверить наличие DLL в:
# node_modules/faiss-node/lib/binding/node-v137-win32-x64/
```

Без FAISS система автоматически использует **LibSQL DiskANN** (медленнее, но работает везде).

### 2. Начало работы

Откройте Claude Desktop и спросите:

- "Проиндексируй мой проект в /path/to/my-project"
- "Найди все функции связанные с аутентификацией"
- "Покажи дублирующийся код в этом проекте"
- "Что сломается если изменить класс UserManager?"

### Поиск похожего кода

```
Вы: "Найди дублирующийся код в моём проекте"

Ответ:
✓ Найдено 12 групп дубликатов
  - auth/login.ts и auth/verify.ts (схожесть: 89%)
  - utils/format.ts и helpers/formatter.ts (схожесть: 85%)
```

### Анализ влияния

```
Вы: "Что сломается если изменить UserManager.login()?"

Ответ:
✓ Анализ влияния:
  - 15 файлов зависят от этого метода
  - Найдено 23 места вызова
  - Высокий риск: AuthController, SessionService
```

### Семантический поиск

```
Вы: "Найди код который валидирует email адреса"

Ответ:
✓ Найдено 4 совпадения:
  - validators/email.ts: validateEmail()
  - utils/auth.ts: checkEmailFormat()
  - services/user.ts: verifyUserEmail()
```

### Расширенный семантический поиск (NEW)

```
Вы: "Найди сложный код с цикломатической сложностью больше 10"

semantic_search query="data processing" minCyclomatic=10

Ответ:
✓ Найдено 3 совпадения:
  - parsers/complex-handler.ts: processData()
    complexity: cyclomatic=15, cognitive=22
    controlFlow: 8 branches, 3 loops, 2 exceptions
    calls: 12 функций
```

```
Вы: "Найди async код без обработки ошибок"

semantic_search query="API calls" hasAwaits=true hasExceptions=false

Ответ:
✓ Найдено 5 потенциальных проблем:
  - api/users.ts: fetchUsers() - await без try-catch
  - api/orders.ts: getOrders() - await без try-catch
```

```
Вы: "Найди недокументированный публичный API"

semantic_search query="export function" hasDocumentation=false

Ответ:
✓ Найдено 12 функций без документации:
  - utils/format.ts: formatDate()
  - helpers/validation.ts: validateInput()
```

### Проблемы с установкой

**Bun: заблокированы postinstall скрипты**

Если при установке видите `Blocked N postinstalls`:

```bash
# Посмотреть заблокированные скрипты
bun pm -g untrusted

# Разрешить нужные пакеты
bun pm -g trust ultrascript-tools-mcp openvino-node webgpu

# Или разрешить все сразу
bun pm -g trust --all

# Переустановить
bun install -g ultrascript-tools-mcp
```

**Очистка кеша и переустановка**

```bash
# Bun
bun pm cache rm
bun install -g ultrascript-tools-mcp

# npm
npm cache clean --force
npm install -g ultrascript-tools-mcp
```

### Настройка эмбеддингов

Если настройка эмбеддингов не удалась или хотите переконфигурировать:

```bash
# Запустите мастер настройки
bunx ultrascript-tools-mcp setup
```

## Продвинутые возможности

### GPU ускорение

**macOS (Apple Silicon):**

```bash
# При установке предлагается собрать Metal backend
# Требования для сборки:
#   - Xcode Command Line Tools: xcode-select --install
#   - Homebrew: https://brew.sh
#   - CMake: brew install cmake

# Можно собрать позже:
./node_modules/ultrascript-tools-mcp/scripts/build-native-libs-macos.sh
```

## CLI команды

```bash
# Настройка семантических эмбеддингов (интерактивный мастер)
bunx ultrascript-tools-mcp setup

# Настройка с конкретным провайдером
bunx ultrascript-tools-mcp setup --provider tei         # NVIDIA GPU
bunx ultrascript-tools-mcp setup --provider ollama      # Универсальный
bunx ultrascript-tools-mcp setup --provider ovms-native # CPU/NPU
bunx ultrascript-tools-mcp setup --provider vllm        # NVIDIA GPU (Production)
```

> **Примечание:** Индексирование проекта выполняется **автоматически** при открытии через MCP-клиент (Claude Desktop и др.). Git-интеграция следит за изменениями веток и файлов.

## Переменные окружения

```bash
# Уровень логирования (debug, info, warn, error)
LOG_LEVEL=info

# Провайдер эмбеддингов (auto, tei, ollama, ovms-native, vllm, openai, cloudru, huggingface)
MCP_EMBEDDING_PROVIDER=auto

# Модель эмбеддингов
MCP_EMBEDDING_MODEL=all-MiniLM-L6-v2

# API ключ (для cloud провайдеров: openai, huggingface, cloudru)
MCP_EMBEDDING_API_KEY=

# Включить/отключить эмбеддинги
MCP_EMBEDDING_ENABLED=true

# Размер батча для индексации
MCP_DEV_INDEX_BATCH=100

# Таймаут агента (мс)
MCP_AGENT_TIMEOUT=90000
```

## Участие в разработке

Этот пакет с открытым исходным кодом под лицензией MIT.

Репозиторий: https://github.com/faxenoff/ultrascript-tools-mcp

## Лицензия

MIT © faxenoff
