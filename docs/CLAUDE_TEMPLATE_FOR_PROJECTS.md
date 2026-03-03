# CLAUDE.md Template for UltraCode-Enabled Projects

> **Usage**: Copy the content below into a `CLAUDE.md` (or `.claude/settings.md`) file in the root of any project you want to analyze with UltraCode. This makes AI agents automatically prefer UltraCode's semantic tools over grep/glob.

---

## Copy This Into Your Project's CLAUDE.md

```markdown
# UltraCode Integration

**ALWAYS use UltraCode MCP tools instead of Grep/Glob** for code operations in this project.

## Tool Preferences

| Instead of | Use | Why |
|------------|-----|-----|
| `Grep` for code search | `semantic_search` | Understands meaning, 5-10x faster |
| `Glob` + read files | `get_members` | AST parsing, finds classes/functions |
| Manual dependency check | `analyze_code_impact` | Shows what breaks |
| `Grep` for duplicates | `find_duplicates` | Semantic similarity |
| Sequential file reading | `trace_flow` | Complete execution path |
| Find-and-replace rename | `rename_symbol` | Updates all references safely |

## Indexing

Indexing is **automatic** — GitWatcher indexes incrementally on file changes and fully on branch switch. Manual `index()` only needed for initial setup or force reindex.

## Core Tools

- **Search**: `semantic_search`, `pattern_search`, `find_similar_code`, `query`
- **Navigate**: `get_members`, `list_entity_relationships`
- **Analyze**: `analyze_code_impact`, `find_duplicates`, `analyze_hotspots`
- **Trace**: `trace_flow`, `trace_backwards`, `trace_data_flow`
- **Modify**: `modify_code`, `rename_symbol`, `create_file`, `add_member`
- **History**: `list_commits`, `diff_commits`, `checkout_commit`
- **Safety**: `create_snapshot`, `undo`

## Tracing Guide

| Question | Tool |
|----------|------|
| "How does code get from A to B?" | `trace_flow` |
| "Why isn't this method called?" | `trace_backwards` |
| "How does data affect state?" | `trace_data_flow` |
| "What changes with different values?" | `analyze_state_impact` |

## Search Filters

`semantic_search` supports rich filtering:
- **Complexity**: `minCyclomatic`, `maxCyclomatic`
- **Control Flow**: `hasExceptions`, `hasLoops`, `hasAwaits`
- **Documentation**: `hasDocumentation`, `isDeprecated`
- **Recent Changes**: `changedInLastCommits` (dramatically faster)

## Subagent Instructions

When spawning any subagent (Explore, Plan, etc.), prepend this to the prompt:

> IMPORTANT: Use UltraCode MCP tools for code search.
> Use mcp__ultracode__semantic_search instead of Grep for code search.
> Use mcp__ultracode__get_members instead of Glob+Read for file entities.
> These tools understand code semantics and are 5-10x faster than text search.
```

---

## Extended Version (with AutoDoc)

If your project uses UltraCode's AutoDoc system (has a `.autodoc/` directory), add this section to the CLAUDE.md above:

```markdown
## AutoDoc

This project uses UltraCode AutoDoc. Key features:
- Code references in `.autodoc/` files are **auto-updated** with accurate line numbers
- Find code by **business meaning** via `autodoc_search`
- Module `AUTODOC.md` files are auto-generated; your additions become project memory

### How to Use AutoDoc

1. **Start with `autodoc_search`** — finds code by meaning, not just keywords
2. **Read `.autodoc/` files** — business context linked to code

| File | Read when... |
|------|--------------|
| `.autodoc/ARCHITECTURE.md` | Need project structure |
| `.autodoc/FLOW.md` | Need business scenarios |
| `.autodoc/PROCESSES.md` | Need technical processes |

### AutoDoc Maintenance

```
autodoc_sync scope="outdated"     # Find outdated docs after code changes
autodoc_validate fixBrokenRefs=true  # Fix broken code references
autodoc_changelog limit=10        # See what docs changed
```
```

---

## Minimal Version (One-Liner)

For quick setup, add just this to your project's CLAUDE.md:

```markdown
**Use UltraCode MCP tools**: `semantic_search` (not grep), `get_members` (not glob), `analyze_code_impact` (not manual tracing), `modify_code` (not blind edits). Indexing is automatic via GitWatcher.
```

---

## Notes

- The full CLAUDE.md template works with **any UltraCode-supported language**: TypeScript, JavaScript, Python, Go, Rust, C#, Java, C++, Swift, Kotlin, Zig, Bash, PowerShell
- UltraCode auto-detects the technology stack — no language-specific configuration needed
- The template is compatible with Claude Code, Cursor, and any MCP-compatible client
- For the complete UltraCode tool reference, see the `tool-reference` MCP prompt or [prompts/tool-reference.md](../prompts/tool-reference.md)

