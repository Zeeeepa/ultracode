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

📖 **Need details?** Request MCP prompt `tool-reference` or `workflows`.
