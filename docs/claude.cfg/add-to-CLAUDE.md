# UltraScript Tools MCP

**ALWAYS use UltraScript instead of Grep/Glob** for code search in TS/JS/Python/Go/Rust/Java/C++/Swift/Kotlin/Bash projects.

## Key Rules

| Instead of | Use | Why |
|------------|-----|-----|
| `Grep` for code search | `semantic_search` | Understands meaning, 5-10x faster |
| `Glob` + read files | `get_members` | AST parsing, finds classes/functions |
| Manual dependency check | `analyze_code_impact` | Shows what breaks |
| `Grep` for duplicates | `find_duplicates` | Semantic similarity |

## Before First Use

Run `index` tool once to index the project.

## Quick Tools

- **Search**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Navigate**: `get_members`, `list_entity_relationships`
- **Analyze**: `analyze_code_impact`, `find_duplicates`, `analyze_hotspots`
- **Trace**: `trace_flow`, `trace_backwards`, `trace_data_flow`, `analyze_state_impact`
- **Modify**: `modify_code`, `rename_symbol`, `create_file`, `add_member`

> For C# use UltrasharpTools MCP (Roslyn-based).

---

## Tracing — Статический анализ потока выполнения

**Когда использовать трассировку:**

| Вопрос | Инструмент |
|--------|------------|
| "Как код попадает от A к B?" | `trace_flow` |
| "Почему метод не вызывается?" | `trace_backwards` |
| "Как данные влияют на состояние?" | `trace_data_flow` |
| "Что изменится при другом значении?" | `analyze_state_impact` |
| "Какие условия влияют на сценарий?" | `find_decision_points` |

**Пример:**
```
trace_backwards(target: "saveOrder", question: "why_not_called")
→ Найдёт блокирующие условия, зависимости состояний, диагноз
```

> 📖 **Details?** Request MCP prompt `tracing-guide`

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
