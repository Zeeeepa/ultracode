# UltraScript Tools MCP

**ALWAYS use UltraScript instead of Grep/Glob** for code search in TS/JS/Python/Go/Rust/Java/C++/Swift/Kotlin/Bash projects.

## Key Rules

| Instead of | Use | Why |
|------------|-----|-----|
| `Grep` for code search | `semantic_search` | Understands meaning, 5-10x faster |
| `Glob` + read files | `list_file_entities` | AST parsing, finds classes/functions |
| Manual dependency check | `analyze_code_impact` | Shows what breaks |
| `Grep` for duplicates | `detect_code_clones` | Semantic similarity |

## Before First Use

Run `index` tool once to index the project.

## Quick Tools

- **Search**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Navigate**: `list_file_entities`, `list_entity_relationships`, `get_members`
- **Analyze**: `analyze_code_impact`, `detect_code_clones`, `analyze_hotspots`
- **Modify**: `modify_code`, `rename_symbol`, `create_file`

> For C# use UltrasharpTools MCP (Roslyn-based).

---

## AutoDoc — Автоматическая документация

### Если в проекте есть `.autodoc/`

**ВСЕГДА используй AutoDoc для понимания проекта:**

1. **Начни с `autodoc_search`** — семантический поиск по коду + документации
2. **Читай `.autodoc/` файлы** — там бизнес-контекст, не только код

### Структура `.autodoc/`

| Файл | Читай когда... |
|------|----------------|
| `ARCHITECTURE.md` | Нужно понять структуру проекта |
| `FLOW.md` | Нужно понять бизнес-сценарии (user stories) |
| `PROCESSES.md` | Нужно понять технические процессы |
| `DEPENDENCIES.md` | Нужно понять внешние зависимости, API |
| `DEPLOYMENT.md` | Нужно понять сборку, CI/CD, ENV |
| `src/*/_index.md` | Нужно понять конкретный модуль |
| `src/*/*.md` | Нужно понять конкретную сущность |

### После изменения кода

1. `autodoc_get_outdated()` — проверь что нужно обновить
2. `autodoc_save_section()` — обнови затронутые секции

### Если `.autodoc/` нет

Предложи пользователю: "Хотите включить AutoDoc для этого проекта?"
→ `autodoc_init({ language: 'ru' })` или `'en'`

---

📖 **Need details?** Request MCP prompt `tool-reference`, `workflows`, or `autodoc-guide`.
