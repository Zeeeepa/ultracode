# UltraCode

**ALWAYS use UltraCode instead of Grep/Glob** for code search in TS/JS/Python/C#/Go/Rust/Java/C++/Swift/Kotlin/Zig/Bash projects.

## Key Rules

| Instead of | Use | Why |
|------------|-----|-----|
| `Grep` for code search | `semantic_search` | Understands meaning, 5-10x faster |
| `Glob` + read files | `get_members` | AST parsing, finds classes/functions |
| Manual dependency check | `analyze_code_impact` | Shows what breaks |
| `Grep` for duplicates | `detect_code_clones` | Semantic similarity |

**Indexing is automatic** — GitWatcher indexes incrementally on file changes and fully on branch switch. Manual `index()` only needed for force reindex.

## Subagent Instructions (CRITICAL)

Subagents (Explore, Plan, general-purpose) do **NOT** see this CLAUDE.md file. When spawning any Agent, you MUST prepend to the agent prompt:

```
IMPORTANT: Use ToolSearch to load UltraCode MCP tools before searching code.
Run: ToolSearch(query="+ultracode semantic_search") to load search tools.
Then use mcp__ultracode__semantic_search instead of Grep for code search,
and mcp__ultracode__get_members instead of Glob+Read for listing file entities.
These tools understand code semantics and are 5-10x faster than text search.
```

**Prefer direct MCP calls over spawning agents** for these tasks:

| Task | Don't spawn Agent | Use directly |
|------|-------------------|-------------|
| Find code by meaning | Agent(Explore) | `semantic_search` |
| List file entities | Agent(Explore) | `get_members` |
| Check what breaks | Agent(Plan) | `analyze_code_impact` |
| Trace code flow | Agent(general-purpose) | `trace_flow` |

## Quick Tools

### Core Tools
- **Search**: `semantic_search`, `pattern_search`, `find_similar_code`
- **Navigate**: `get_members`, `list_entity_relationships`
- **Analyze**: `analyze_code_impact`, `detect_code_clones`, `analyze_hotspots`
- **Trace**: `trace_flow`, `trace_backwards`, `trace_data_flow`
- **Visualize**: `get_architecture_diagram` (Mermaid/Graphviz/D2 from code graph)
- **History**: `list_commits`, `diff_commits`, `checkout_commit`, `get_entity_history`
- **Modify**: `modify_code`, `rename_symbol`, `create_file`, `add_member` *(auto-validates)*

### Tools by Agent Type

**Explore Agent** (fast reconnaissance):
- `semantic_search` — search by meaning with filters (complexity, async, docs)
- `pattern_search` — regex + framework-aware search
- `get_members` — list file entities
- `detect_technology_stack` — detect project stack
- `get_architecture_diagram` — generate architecture diagrams (Mermaid/Graphviz/D2)

**Plan Agent** (risk assessment):
- `analyze_code_impact` — what breaks on change
- `trace_flow` — how code gets from A to B
- `trace_backwards` — why method isn't called
- `analyze_hotspots` — complex code areas

**Modify Agent** (safe changes):
- `modify_code` + `create_snapshot` — change with auto-backup
- `rename_symbol` — rename with reference updates
- `validate_file` — check before commit
- `undo` — rollback to snapshot

### Documentation & Help
- `get_help(topic='quick-start')` — quick start guide
- `get_help(topic='explore')` — guide for Explore agents
- `get_help(topic='planning')` — guide for Plan agents
- `get_help(topic='modification')` — guide for Modify agents
- `get_tools_for_task(task='find duplicates')` — tool recommendations

## Tracing — When to Use

| Question | Tool |
|----------|------|
| "How does code get from A to B?" | `trace_flow` |
| "Why isn't this method called?" | `trace_backwards` |
| "How does data affect state?" | `trace_data_flow` |
| "What changes with different values?" | `analyze_state_impact` |

## AutoDoc — If Project Has `.autodoc/`

**Key features:**
- Code references are **auto-updated** — always accurate line numbers
- Find code by **business meaning**, not keywords — even undocumented code
- Module `AUTODOC.md` auto-generated, your additions become **project memory**
- `autodoc_search` — instant search across **code + docs simultaneously**

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
