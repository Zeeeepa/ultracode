# UltraCode

**ВСЕГДА используй UltraCode вместо Grep/Glob** для поиска кода в проектах TS/JS/Python/C#/Go/Rust/Java/C++/Swift/Kotlin/Zig/Bash.

## Основные правила

| Вместо | Используй | Почему |
|--------|-----------|--------|
| `Grep` для поиска кода | `semantic_search` | Понимает смысл, 5-10x быстрее |
| `Glob` + чтение файлов | `get_members` | AST парсинг, находит классы/функции |
| Ручная проверка зависимостей | `analyze_code_impact` | Показывает что сломается |
| `Grep` для дубликатов | `detect_code_clones` | Семантическое сходство |

**Индексация автоматическая** — GitWatcher индексирует инкрементно при изменениях файлов и полностью при переключении веток. Manual `index()` нужен только для force reindex.

## Инструкции для подагентов (КРИТИЧНО)

Подагенты (Explore, Plan, general-purpose) **НЕ видят** этот CLAUDE.md файл. При спавне любого Agent, ОБЯЗАТЕЛЬНО добавляй в промпт агента:

```
ВАЖНО: Используй ToolSearch для загрузки UltraCode MCP инструментов перед поиском кода.
Выполни: ToolSearch(query="+ultracode semantic_search") для загрузки инструментов поиска.
Затем используй mcp__ultracode__semantic_search вместо Grep для поиска кода,
и mcp__ultracode__get_members вместо Glob+Read для получения списка сущностей файла.
Эти инструменты понимают семантику кода и работают в 5-10x быстрее текстового поиска.
```

**Предпочитай прямые MCP-вызовы вместо спавна агентов** для этих задач:

| Задача | Не спавни Agent | Используй напрямую |
|--------|-----------------|-------------------|
| Найти код по смыслу | Agent(Explore) | `semantic_search` |
| Список сущностей файла | Agent(Explore) | `get_members` |
| Что сломается при изменении | Agent(Plan) | `analyze_code_impact` |
| Трассировка потока кода | Agent(general-purpose) | `trace_flow` |

## Быстрый справочник

### Базовые инструменты
- **Поиск**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Навигация**: `get_members`, `list_entity_relationships`
- **Анализ**: `analyze_code_impact`, `detect_code_clones`, `analyze_hotspots`
- **API-контракты**: `analyze_api_impact` (Swagger + Protobuf + GraphQL), `analyze_swagger_impact`
- **База данных**: `get_database_schema` (SQL/Prisma/ORM/Redis + дрифт миграций)
- **Трассировка**: `trace_flow`, `trace_backwards`, `trace_data_flow`
- **Визуализация**: `get_architecture_diagram` (Mermaid/Graphviz/D2 из графа кода)
- **История**: `list_commits`, `diff_commits`, `checkout_commit`, `get_entity_history`
- **Модификация**: `modify_code`, `rename_symbol`, `create_file`, `add_member` *(авто-валидация)*

### Для разных типов агентов

**Explore Agent** (быстрая разведка):
- `semantic_search` — поиск по смыслу с фильтрами (complexity, async, docs)
- `pattern_search` — regex + framework-aware поиск
- `get_members` — список сущностей файла
- `detect_technology_stack` — определение стека проекта
- `get_architecture_diagram` — генерация архитектурных диаграмм (Mermaid/Graphviz/D2)

**Plan Agent** (оценка рисков):
- `analyze_code_impact` — что сломается при изменении
- `trace_flow` — как код попадает от A к B
- `trace_backwards` — почему метод не вызывается
- `analyze_hotspots` — сложные участки кода

**Modify Agent** (безопасные изменения):
- `modify_code` + `create_snapshot` — изменение с автосохранением
- `rename_symbol` — переименование с обновлением ссылок
- `validate_file` — проверка перед коммитом
- `undo` — откат к snapshot

### Документация и помощь
- `get_help(topic='quick-start')` — быстрый старт
- `get_help(topic='explore')` — гайд для Explore агентов
- `get_help(topic='planning')` — гайд для Plan агентов
- `get_help(topic='modification')` — гайд для Modify агентов
- `get_tools_for_task(task='find duplicates')` — рекомендации инструментов

## Трассировка — Когда использовать

| Вопрос | Инструмент |
|--------|------------|
| "Как код попадает от A к B?" | `trace_flow` |
| "Почему метод не вызывается?" | `trace_backwards` |
| "Как данные влияют на состояние?" | `trace_data_flow` |
| "Что изменится при другом значении?" | `analyze_state_impact` |

## AutoDoc — Если в проекте есть `.autodoc/`

**Ключевые особенности:**
- Ссылки на код **автоматически актуализируются** — номера строк всегда точные
- Поиск по **смыслу**, не по ключевым словам — найдёт даже недокументированный код
- Модульные `AUTODOC.md` генерируются автоматически, ваши дополнения становятся **проектной памятью**
- `autodoc_search` — мгновенный поиск по **коду + документации одновременно**

1. **Начни с `autodoc_search`** — ищет код по смыслу, не только по словам
2. **Читай `.autodoc/` файлы** — бизнес-контекст со ссылками на код

| Файл | Читай когда... |
|------|----------------|
| `ARCHITECTURE.md` | Нужна структура проекта |
| `FLOW.md` | Нужны бизнес-сценарии |
| `PROCESSES.md` | Нужны технические процессы |

## Skills (Автоустановка)

UltraCode Skills автоматически устанавливаются в `~/.claude/skills/`:
- `ultracode` — справочник инструментов + workflows
- `ultracode-trace` — руководство по трассировке
- `ultracode-autodoc` — руководство по autodoc

Skills автоактивируются по описанию при работе с соответствующим кодом.
