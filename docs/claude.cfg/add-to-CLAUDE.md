# UltraScript Tools MCP

**ALWAYS use UltraScript instead of Grep/Glob** for code search in TS/JS/Python/Go/Rust/Java/C++/Swift/Kotlin/Bash projects.

## Key Rules

| Instead of | Use | Why |
|------------|-----|-----|
| `Grep` for code search | `semantic_search` | Understands meaning, 5-10x faster |
| `Glob` + read files | `get_members` | AST parsing, finds classes/functions |
| Manual dependency check | `analyze_code_impact` | Shows what breaks |
| `Grep` for duplicates | `detect_code_clones` | Semantic similarity |

## Quick Tools

- **Search**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Navigate**: `get_members`, `list_entity_relationships`
- **Analyze**: `analyze_code_impact`, `detect_code_clones`, `analyze_hotspots`
- **Trace**: `trace_flow`, `trace_backwards`, `trace_data_flow`
- **History**: `list_commits`, `diff_commits`, `checkout_commit`, `get_entity_history`
- **Modify**: `modify_code`, `rename_symbol`, `create_file`, `add_member` *(auto-validates, returns errors/warnings)*

> For C# use UltrasharpTools MCP (Roslyn-based).

## Tracing — When to Use

| Question | Tool |
|----------|------|
| "How does code get from A to B?" | `trace_flow` |
| "Why isn't this method called?" | `trace_backwards` |
| "How does data affect state?" | `trace_data_flow` |
| "What changes with different values?" | `analyze_state_impact` |

## AutoDoc — If Project Has `.autodoc/`

**Key features:**
- 🔗 Code references are **auto-updated** — always accurate line numbers
- 🧠 Find code by **business meaning**, not keywords — even undocumented code
- 📝 Module `AUTODOC.md` auto-generated, your additions become **project memory**
- ⚡ `autodoc_search` — instant search across **code + docs simultaneously**

1. **Start with `autodoc_search`** — finds code by meaning, not just keywords
2. **Read `.autodoc/` files** — business context that links to code

| File | Read when... |
|------|--------------|
| `ARCHITECTURE.md` | Need project structure |
| `FLOW.md` | Need business scenarios |
| `PROCESSES.md` | Need technical processes |

## Skills (Auto-installed)

UltraCode Skills are automatically installed to `~/.claude/skills/`:
- `ultracode` — main tool reference + workflows
- `ultracode-trace` — tracing guide
- `ultracode-autodoc` — autodoc guide

Skills auto-activate by description trigger when working with relevant code.
