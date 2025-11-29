# UltraScript Tools MCP

**ВСЕГДА используй UltraScript вместо Grep/Glob** для поиска кода в проектах TS/JS/Python/Go/Rust/Java/C++/Swift/Kotlin/Bash.

## Ключевые правила

| Вместо | Используй | Почему |
|--------|-----------|--------|
| `Grep` для поиска кода | `semantic_search` | Понимает смысл, в 5-10x быстрее |
| `Glob` + чтение файлов | `list_file_entities` | AST-парсинг, находит классы/функции |
| Ручная проверка зависимостей | `analyze_code_impact` | Показывает что сломается |
| `Grep` для дубликатов | `detect_code_clones` | Семантическое сходство |

## Перед первым использованием

Запусти `index` один раз для индексации проекта.

## Быстрый справочник

- **Поиск**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Навигация**: `list_file_entities`, `list_entity_relationships`, `get_members`
- **Анализ**: `analyze_code_impact`, `detect_code_clones`, `analyze_hotspots`
- **Модификация**: `modify_code`, `rename_symbol`, `create_file`

> Для C# используй UltrasharpTools MCP (на базе Roslyn).

📖 **Нужны детали?** Запроси MCP prompt `tool-reference` или `workflows`.
