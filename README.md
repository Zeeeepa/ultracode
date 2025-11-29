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
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0.0-f472b6)](https://bun.sh)


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


## Установка

```bash
# Глобальная установка
npm install -g ultrascript-tools-mcp

# Или запуск без установки
npx ultrascript-tools-mcp
```

### 🚀 Рекомендуется: Используйте Bun для ускорения в 1.5-4x
Нет причин не использовать [Bun](https://bun.sh), быстрый JavaScript-runtime, который значительно улучшает производительность UltraScript:

| Операция | Ускорение с Bun |
|----------|-----------------|
| Чтение файлов | **1.3-1.8x** быстрее |
| Запись файлов (FileSink) | **3-4x** быстрее |
| Сканирование директорий | **1.4-3.8x** быстрее |
| Glob-поиск | **1.4-1.6x** быстрее |
| Время запуска | **1.5-1.8x** быстрее |
| HTTP fetch | **1.7x** быстрее |
| SQLite операции | ~одинаково (ограничено I/O) |
| SHA-256 хеширование | **1.3x** быстрее (2.8x с CryptoHasher) |

**Установка Bun** (одной командой):
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

**Запуск с Bun:**
```bash
# Используйте bunx вместо npx
bunx ultrascript-tools-mcp /path/to/project

# Или установите глобально через bun
bun install -g ultrascript-tools-mcp
ultrascript-tools-mcp /path/to/project
```
> **Примечание:** При установке автоматически компилируются native-компоненты (tree-sitter) для совместимости с Bun. Node.js работает без дополнительной компиляции. Для сборки требуется Visual Studio Build Tools на Windows или build-essential на Linux (скрипт предложит это сделать автоматически).

**Конфиг Claude Code с Bun:**
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

## Быстрый старт

### 1. Настройка семантических эмбеддингов (рекомендуется)

```bash
# Интерактивный мастер настройки
npx ultrascript-tools-mcp setup

# Или укажите провайдер напрямую
npx ultrascript-tools-mcp setup --provider ollama   # Простая настройка
npx ultrascript-tools-mcp setup --provider tei      # Лучшая производительность (Docker)
npx ultrascript-tools-mcp setup --provider memory   # Без ML (по умолчанию)
```

Мастер настройки:
- Автоматически определит вашу GPU (NVIDIA Turing/Ampere/Ada/Hopper/Blackwood*)
- Поможет выбрать лучшую модель эмбеддингов
- Автоматически установит TEI (Docker) или Ollama
- Сохранит конфигурацию в системную директорию

### 2. Настройка Claude Desktop

Добавьте в конфиг Claude Desktop:

**Windows**: `%userprofile%\claude.json`
**macOS**: `~/Library/Application Support/Claude/mcp.json`
**Linux**: `~/.claude/mcp.json`

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "npx",
      "args": ["ultrascript-tools-mcp", "."]
    }
  }
}
```

Или если установлено глобально:

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "ultrascript-tools-mcp",
      "args": ["."]
    }
  }
}
```

### 3. Начало работы

Откройте Claude Desktop и спросите:

- "Проиндексируй мой проект в /path/to/my-project"
- "Найди все функции связанные с аутентификацией"
- "Покажи дублирующийся код в этом проекте"
- "Что сломается если изменить класс UserManager?"

### 4. MCP Prompts (встроенная документация)

Сервер предоставляет **MCP Prompts** — встроенную документацию, доступную прямо из Claude:

| Prompt | Описание |
|--------|----------|
| `quick-start` | Быстрый старт — когда и какие инструменты использовать |
| `tool-reference` | Полный справочник 50+ инструментов с параметрами |
| `workflows` | Типичные сценарии: анализ проекта, рефакторинг, поиск дубликатов |

Документация автоматически загружается из папки `prompts/` и может быть отредактирована под ваши нужды.

> **Совет:** Больше не нужно добавлять инструкции в CLAUDE.md — используйте MCP Prompts!

## Доступные инструменты

MCP-сервер предоставляет **50 инструментов** для анализа и модификации кода:

### Индексация и поиск
| Инструмент | Описание |
|------------|----------|
| `index` | Индексация кодовой базы для анализа |
| `query` | Запросы на естественном языке о коде |
| `semantic_search` | Семантический поиск по смыслу кода |
| `pattern_search` | Продвинутый поиск (regex/semantic/hybrid) |
| `find_similar_code` | Поиск похожих фрагментов кода |
| `cross_language_search` | Поиск по нескольким языкам |
| `find_related_concepts` | Поиск связанных концепций |

### Анализ сущностей
| Инструмент | Описание |
|------------|----------|
| `list_file_entities` | Список сущностей в файле |
| `get_members` | Получить члены класса/модуля |
| `list_entity_relationships` | Показать зависимости кода |
| `detect_technology_stack` | Определить стек технологий проекта |

### Качество кода
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

### Модификация кода
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

### Снапшоты и откат
| Инструмент | Описание |
|------------|----------|
| `create_snapshot` | Создание снапшота состояния |
| `rollback_snapshot` | Откат к снапшоту |
| `undo` | Отмена последнего изменения |
| `list_snapshots` | Список снапшотов |
| `cleanup_snapshots` | Очистка старых снапшотов |

### Git-интеграция
| Инструмент | Описание |
|------------|----------|
| `list_branches` | Список проиндексированных веток |
| `switch_branch` | Переключение между ветками |
| `get_branch_status` | Статус анализа ветки |
| `get_changed_files` | Сравнение файлов между ветками |
| `cleanup_branches` | Очистка старых веток (LRU) |

### Граф и система
| Инструмент | Описание |
|------------|----------|
| `get_graph` | Получить граф кода |
| `get_graph_stats` | Статистика графа |
| `get_graph_health` | Проверка здоровья графа |
| `reset_graph` | Сброс графа |
| `clean_index` | Очистка индекса |
| `lerna_project_graph` | Граф Lerna-монорепозитория |

### Метрики и отладка
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
# Интерактивная настройка - рекомендуется
npx ultrascript-tools-mcp setup

# Неинтерактивные варианты
npx ultrascript-tools-mcp setup --provider tei      # Docker + GPU
npx ultrascript-tools-mcp setup --provider ollama   # Нативная установка
npx ultrascript-tools-mcp setup --provider memory   # На основе хешей (по умолчанию)
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

- **В 5.5 раз быстрее** встроенных инструментов Claude для больших кодовых баз
- **WASM SIMD** — встроен в npm-пакет, работает везде (ускорение в 2-4 раза)
- **CUDA** — встроен в npm-пакет для Windows/Linux с NVIDIA GPU (ускорение в 10-50 раз)
- **Metal** — для Apple Silicon (предлагается собрать при установке)
- **WebGPU** — кросс-платформенное ускорение (опционально)

## Примеры

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

## Требования

- **Node.js**: 24.0.0 или выше
- **Память**: рекомендуется 4GB+ RAM
- **Опционально**: Docker (для TEI эмбеддингов)
- **Опционально**: NVIDIA GPU (для CUDA ускорения)

## Документация

После установки см.:
- `node_modules/ultrascript-tools-mcp/README_DEV.md` - Подробная документация
- `node_modules/ultrascript-tools-mcp/GETTING_STARTED.md` - Руководство по настройке
- `node_modules/ultrascript-tools-mcp/NPM_PUBLISHING.md` - Руководство по публикации

## Решение проблем

### MCP-сервер не отвечает

1. Проверьте версию Node.js: `node --version` (должна быть 24.0.0+)
2. Проверьте путь в конфиге `claude_desktop_config.json`
3. Проверьте логи Claude Desktop (Справка → Инструменты разработчика)

### Проблемы с установкой

```bash
# Очистите кеш и переустановите
npm cache clean --force
npm install -g ultrascript-tools-mcp
```

### Настройка эмбеддингов

Если настройка эмбеддингов не удалась или хотите переконфигурировать:

```bash
# Запустите мастер настройки
npx ultrascript-tools-mcp setup

# Или запустите postinstall вручную
cd node_modules/ultrascript-tools-mcp
node scripts/postinstall.js
```

## Продвинутые возможности

### GPU ускорение

**Windows / Linux (NVIDIA GPU):**
```bash
# CUDA уже встроен в npm-пакет — ничего собирать не нужно!
# Автоматически используется при наличии NVIDIA GPU (GTX 16xx и новее)
# Обеспечивает ускорение в 10-50 раз для векторных операций
```

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

**Fallback (все платформы):**
```bash
# WASM SIMD встроен в npm-пакет и работает везде
# Используется автоматически если GPU недоступен
```

### Мультипроектный анализ (Lerna)

```bash
# Для монорепозиториев использующих Lerna
ultrascript-tools-mcp lerna_project_graph --ingest
```

### Сравнение веток

```bash
# Сравнение кода между ветками
ultrascript-tools-mcp get_changed_files --fromBranch main --toBranch feature
```

## Использование CLI

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
