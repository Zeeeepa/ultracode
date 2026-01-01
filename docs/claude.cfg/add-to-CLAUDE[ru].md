# UltraScript Tools MCP

**ВСЕГДА используй UltraScript вместо Grep/Glob** для поиска кода в проектах TS/JS/Python/Go/Rust/Java/C++/Swift/Kotlin/Bash.

## Ключевые правила

| Вместо | Используй | Почему |
|--------|-----------|--------|
| `Grep` для поиска кода | `semantic_search` | Понимает смысл, в 5-10x быстрее |
| `Glob` + чтение файлов | `get_members` | AST-парсинг, находит классы/функции |
| Ручная проверка зависимостей | `analyze_code_impact` | Показывает что сломается |
| `Grep` для дубликатов | `find_duplicates` | Семантическое сходство |

## Перед первым использованием

Запусти `index` один раз для индексации проекта.

## Быстрый справочник

- **Поиск**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Навигация**: `get_members`, `list_entity_relationships`
- **Анализ**: `analyze_code_impact`, `find_duplicates`, `analyze_hotspots`
- **Трассировка**: `trace_flow`, `trace_backwards`, `trace_data_flow`, `analyze_state_impact`
- **Модификация**: `modify_code`, `rename_symbol`, `create_file`, `add_member`

> Для C# используй UltrasharpTools MCP (на базе Roslyn).

📖 **Нужны детали?** Запроси MCP prompt `tool-reference` или `workflows`.
