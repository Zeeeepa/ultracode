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
# Bun (рекомендуется)
bun install -g ultrascript-tools-mcp

# npm
npm install -g ultrascript-tools-mcp
```

> **Примечание**: Для полноценного анализа кода на разных языках требуются соответствующие runtime:
> - TypeScript/JavaScript — встроено (TypeScript Compiler API)
> - Python — требуется Python 3.8+ (`python --version`)
> - Java/Kotlin — требуется JRE 11+ (`java --version`)
> - Go — требуется Go 1.18+ (`go version`)
> - Rust — требуется Rust toolchain (`rustc --version`)
> - C/C++ — требуется Clang 12+ (`clang --version`)



**Конфиг Claude Code:**
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "ultrascript"
    }
  }
}
```

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

| Prompt | Описание |
|--------|----------|
| `quick-start` | Быстрый старт — когда и какие инструменты использовать |
| `tool-reference` | Полный справочник 50+ инструментов с параметрами |
| `workflows` | Типичные сценарии: анализ проекта, рефакторинг, поиск дубликатов |

> **Совет:** В системные промпты можно добавить [короткий промпт](docs/claude.cfg/add-to-CLAUDE.md) который поможет ИИ-агенту узнать о способе получения информации о работе Ultrascript-tools.

## Доступные инструменты

MCP-сервер предоставляет **50 инструментов** для анализа и модификации кода:

#### Индексация и поиск
| Инструмент | Описание |
|------------|----------|
| `index` | Индексация кодовой базы для анализа |
| `query` | Запросы на естественном языке о коде |
| `semantic_search` | Семантический поиск по смыслу кода |
| `pattern_search` | Продвинутый поиск (regex/semantic/hybrid) |
| `find_similar_code` | Поиск похожих фрагментов кода |
| `cross_language_search` | Поиск по нескольким языкам |
| `find_related_concepts` | Поиск связанных концепций |

#### Анализ сущностей
| Инструмент | Описание |
|------------|----------|
| `list_file_entities` | Список сущностей в файле |
| `get_members` | Получить члены класса/модуля |
| `list_entity_relationships` | Показать зависимости кода |
| `detect_technology_stack` | Определить стек технологий проекта |

#### Качество кода
| Инструмент | Описание |
|------------|----------|
| `detect_code_clones` | Поиск дублирующегося кода (семантический) |
| `find_duplicates` | Быстрый поиск дубликатов |
| `jscpd_detect_clones` | Детектор клонов на базе jscpd |
| `analyze_code_impact` | Анализ влияния изменений |
| `suggest_refactoring` | AI-предложения по рефакторингу |
| `analyze_hotspots` | Поиск сложных участков кода |
| `analyze_state_chaos` | Анализ хаоса состояния |
| `validate_file` | Валидация файла |
| `validate_directory` | Валидация директории |

#### Модификация кода
| Инструмент | Описание |
|------------|----------|
| `modify_code` | Модификация кода сущности |
| `modify_entity_code` | Изменение кода по имени сущности |
| `create_file` | Создание нового файла |
| `copy_file` | Копирование файла |
| `rename_file` | Переименование файла |
| `split_file` | Разделение файла на части |
| `synthesize_files` | Объединение файлов |
| `rename_symbol` | Переименование символа во всём проекте |
| `add_member` | Добавление члена в класс |

#### Снапшоты и откат
| Инструмент | Описание |
|------------|----------|
| `create_snapshot` | Создание снапшота состояния |
| `rollback_snapshot` | Откат к снапшоту |
| `undo` | Отмена последнего изменения |
| `list_snapshots` | Список снапшотов |
| `cleanup_snapshots` | Очистка старых снапшотов |

#### Git-интеграция
| Инструмент | Описание |
|------------|----------|
| `list_branches` | Список проиндексированных веток |
| `switch_branch` | Переключение между ветками |
| `get_branch_status` | Статус анализа ветки |
| `get_changed_files` | Сравнение файлов между ветками |
| `cleanup_branches` | Очистка старых веток (LRU) |

#### Граф и система
| Инструмент | Описание |
|------------|----------|
| `get_graph` | Получить граф кода |
| `get_graph_stats` | Статистика графа |
| `get_graph_health` | Проверка здоровья графа |
| `reset_graph` | Сброс графа |
| `clean_index` | Очистка индекса |
| `lerna_project_graph` | Граф Lerna-монорепозитория |

#### Метрики и отладка
| Инструмент | Описание |
|------------|----------|
| `get_metrics` | Метрики системы |
| `get_version` | Версия сервера |
| `get_agent_metrics` | Метрики агентов |
| `get_bus_stats` | Статистика шины сообщений |
| `clear_bus_topic` | Очистка топика шины |

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

**Сравнение провайдеров:**

| Провайдер | Настройка | Производительность | Поддержка GPU | Требования |
|-----------|-----------|-------------------|---------------|------------|
| **TEI** | Docker | ⭐⭐⭐ Лучшая | RTX 20xx-50xx | Docker Desktop |
| **Ollama** | Нативная | ⭐⭐ Хорошая | Все GPU вкл. RTX 50xx | Нет |
| **Memory** | Нет | ⭐ Базовая | N/A | Нет |

**Расположение конфигурации:**
- Windows: `%LOCALAPPDATA%\UltraScriptTools\semantic-config.json`
- macOS: `~/Library/Application Support/UltraScriptTools/semantic-config.json`
- Linux: `~/.config/ultrascript-tools/semantic-config.json`

## Производительность

- **В 5 раз быстрее** встроенных инструментов Claude для больших кодовых баз
- **WASM SIMD** — встроен в npm-пакет, работает везде (ускорение ещё в 2-4 раза)
- **CUDA** — встроен в npm-пакет для Windows/Linux с NVIDIA GPU (ускорение ещё в 10-50 раз)
- **Metal** — для Apple Silicon (предлагается собрать при установке)
- **WebGPU** — кросс-платформенное ускорение (опционально)



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


### Проблемы с установкой

```bash
# Очистите кеш и переустановите

# Bun
bun pm cache rm
bun install -g ultrascript-tools-mcp --legacy-peer-deps

# Node
npm cache clean --force
npm install -g ultrascript-tools-mcp --legacy-peer-deps
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
npx ultrascript-tools-mcp setup

# Настройка с конкретным провайдером
npx ultrascript-tools-mcp setup --provider ollama
npx ultrascript-tools-mcp setup --provider tei
npx ultrascript-tools-mcp setup --provider memory

# Индексация проекта
ultrascript-tools-mcp index /path/to/project

# Запрос к коду
ultrascript-tools-mcp query "найди код аутентификации"

# Поиск дубликатов
ultrascript-tools-mcp detect_code_clones --minSimilarity 0.8

# Проверка статуса ветки
ultrascript-tools-mcp get_branch_status
```

## Переменные окружения

```bash
# Уровень логирования
LOG_LEVEL=info

# Провайдер эмбеддингов
EMBEDDING_PROVIDER=memory

# Включить GPU
USE_GPU=true
```

## Участие в разработке

Этот пакет с открытым исходным кодом под лицензией MIT.

Репозиторий: https://github.com/faxenoff/ultrascript-tools-mcp


## Лицензия

MIT © faxenoff
