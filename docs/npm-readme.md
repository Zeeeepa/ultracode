# UltraCode Server

[![npm version](https://badge.fury.io/js/ultracode.svg)](https://www.npmjs.com/package/ultracode)
[![License: AGPL-3.0 / Commercial](https://img.shields.io/badge/License-AGPL--3.0_|_Commercial-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.0.0-f472b6)](https://bun.sh)

**Multi-agent MCP server for code analysis with dependency graphs, semantic search, and 70+ tools**

UltraCode analyzes your codebase, builds a graph of entities and relationships, and provides AI assistants (Claude, Gemini, Codex) with structured access to code via the MCP protocol.

**14 languages** | **70+ MCP tools** | **Native parsers without tree-sitter** | **Semantic search** | **Git branches**

---

## 💡 **What does this give an AI assistant?**

Instead of reading files one by one, the assistant gets:

- **Entity graph** — functions, classes, modules and relationships between them
- **Semantic search** — search by meaning, not by text
- **Impact analysis** — what will break when something changes
- **Flow tracing** — how code gets from A to B
- **Change history** — Prolly Tree with time travel across graph versions
- **AutoDoc** — automatic documentation generation and synchronization

---

## 📦 **Quick Start**

### Installation

```bash
npm install -g ultracode

# Or run without installation
npx ultracode /path/to/project
```

### Integration with Claude Code (CLI)

Create `.mcp.json` in the project root:
```json
{
  "mcpServers": {
    "ultracode": {
      "command": "npx",
      "args": ["ultracode", "."]
    }
  }
}
```

### Integration with Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ultracode": {
      "command": "npx",
      "args": ["ultracode", "/path/to/project"]
    }
  }
}
```

### With Bun (faster)

```bash
bunx ultracode /path/to/project
```

---

## 🌍 **Supported Languages**

| Language | Parser | What is analyzed |
|----------|--------|------------------|
| **TypeScript/JavaScript** | TypeScript Compiler API | ES6+, JSX, TSX, React, async/await, Angular |
| **Python** | `ast` + Pyright | Classes, functions, async, decorators, magic methods |
| **C#** | Roslyn addon | Classes, interfaces, LINQ, async/await, properties |
| **Java** | Chevrotain | Classes, interfaces, records (Java 14+), generics |
| **Kotlin** | ANTLR | Coroutines, data classes, sealed classes, extensions |
| **Go** | go/parser CLI | Packages, functions, structs, interfaces, goroutines |
| **Rust** | ANTLR | Functions, structs, traits, impl, modules |
| **C/C++** | Regex + clang | Functions, structs, classes, templates, namespaces |
| **Swift** | SwiftSyntax | Protocols, extensions, actors, async/await |
| **Zig** | Regex | Functions, structs, comptime, errors |
| **Bash** | shfmt + Regex | Functions, variables, source/import |
| **PowerShell** | Regex | Cmdlets, functions, modules |
| **Helm** | Regex | Named templates, includes, values, indent/nindent tracking |
| **JSON** | JSON parse | Swagger/OpenAPI, package.json, tsconfig.json |
| **CSS/HTML/XML** | Regex | Selectors, elements, attributes |

Also: JSX, TSX, Batch (.bat/.cmd). Polyglot projects are supported — cross-language relationships are tracked.

---

## 🛠️ **70+ MCP Tools**

### Indexing and Search
| Tool | Description |
|------|-------------|
| `index` | Codebase indexing (incremental/full) |
| `clean_index` | Full reindexing (reset + index) |
| `semantic_search` | Semantic search with filters (complexity, async, docs) |
| `pattern_search` | Regex + framework-aware search |
| `find_similar_code` | Similar code search |
| `find_duplicates` | Duplicate detection (semantic) |
| `jscpd_detect_clones` | JSCPD-based clone detection (without ML) |
| `cross_language_search` | Cross-language search |
| `query` | Universal graph query |

### Analysis
| Tool | Description |
|------|-------------|
| `analyze_code_impact` | What will break when something changes |
| `analyze_hotspots` | Complex zones (complexity + change frequency) |
| `suggest_refactoring` | Refactoring recommendations |
| `find_related_concepts` | Related concepts |
| `analyze_state_chaos` | State management chaos |
| `analyze_swagger_impact` | Impact of OpenAPI specification changes |
| `detect_technology_stack` | Technology stack detection |

### Graph and Entities
| Tool | Description |
|------|-------------|
| `get_members` | Entities in a file (AST-based) |
| `get_graph` | Get entity graph |
| `get_graph_stats` | Graph statistics |
| `list_entity_relationships` | Entity relationships |

### Flow Tracing
| Tool | Description |
|------|-------------|
| `trace_flow` | How code gets from A to B |
| `trace_backwards` | Why a method is not being called |
| `trace_data_flow` | Data flow to target state |
| `analyze_state_impact` | State impact on scenarios |
| `find_decision_points` | Decision points |

### Code Modification
| Tool | Description |
|------|-------------|
| `modify_code` | Modify entity code |
| `create_file` | Create file with auto-parse |
| `rename_symbol` | Rename with reference updates |
| `add_member` | Add member to class/interface |
| `copy_file` | Copy file |
| `rename_file` | Rename with import updates |
| `split_file` | Split file |
| `synthesize_files` | Merge files |

### Validation
| Tool | Description |
|------|-------------|
| `validate_file` | File validation (ESLint/Pylint) |
| `validate_directory` | Batch directory validation |

### Snapshots and Rollback
| Tool | Description |
|------|-------------|
| `create_snapshot` | Snapshot for rollback |
| `undo` | Rollback to snapshot |
| `list_snapshots` | List snapshots |
| `cleanup_snapshots` | Clean up old snapshots |

### Git Branches
| Tool | Description |
|------|-------------|
| `list_branches` | Indexed branches |
| `switch_branch` | Switch branch |
| `get_branch_status` | Current branch status |
| `cleanup_branches` | Clean up old branches |
| `get_changed_files` | Files changed between branches |

### History (Prolly Tree)
| Tool | Description |
|------|-------------|
| `list_commits` | Graph versions |
| `get_entity_history` | Entity change history |
| `diff_commits` | Compare two graph versions |
| `checkout_commit` | Time travel to a graph version |

### Merge (Semantic Merge)
| Tool | Description |
|------|-------------|
| `semantic_merge` | AI-powered code merge |
| `analyze_merge_conflicts` | Merge conflict analysis |
| `get_merge_suggestions` | Merge recommendations |
| `get_semantic_merge_info` | Semantic merge information |

### AutoDoc (Documentation)
| Tool | Description |
|------|-------------|
| `autodoc_init` | Initialize AutoDoc |
| `autodoc_generate` | Generate documentation |
| `autodoc_save` / `autodoc_get` | Save/retrieve documentation |
| `autodoc_search` | Search documentation |
| `autodoc_validate` / `autodoc_sync` | Validation and synchronization |
| `autodoc_changelog` | Generate changelog |
| `autodoc_status` / `autodoc_install_hooks` / `autodoc_detect_language` | Utilities |

### Diagnostics
| Tool | Description |
|------|-------------|
| `get_version` | Server version |
| `get_graph_health` | Database diagnostics |
| `get_metrics` | System metrics |
| `get_agent_metrics` | Agent metrics |
| `get_bus_stats` | Knowledge bus statistics |
| `get_watcher_status` | File watcher status |
| `clear_bus_topic` | Clear bus topic |
| `reset_graph` | Clear graph |
| `get_help` / `get_tools_for_task` | Help and tool recommendations |

---

## 🎨 **Semantic Search (optional)**

For advanced meaning-based search, you can enable ML embeddings:

```bash
npx ultracode setup
```

| Provider | Speed | Platform |
|----------|-------|----------|
| **ovms-native** | 0.8-2ms | CPU/NPU (recommended) |
| **vllm** | 1-3ms | NVIDIA GPU |
| **mlx** | ~2ms | macOS Apple Silicon |
| **tei** | 5-15ms | Docker |
| **ollama** | 10-50ms | Any |

---

## 📊 **Architecture**

<details>
<summary>Technical details</summary>

**Multi-agent system** with coordination through ConductorOrchestrator:
- **ParserAgent** — AST parsing via native parsers (14 languages)
- **IndexerAgent** — Indexing into SQLite with batching
- **SemanticAgent** — Vector embeddings, semantic search
- **DevAgent** — Incremental indexing, file watcher
- **QueryAgent** — Graph query execution
- **DoraAgent** — Complexity metrics and analysis

**Storage**: Native SQLite (better-sqlite3 / bun:sqlite):
- Multi-DB architecture: graph.db, semantic.db, versioning.db, cache.db
- Prolly Trees for graph versioning
- Prepared statement cache for 2-5x speedup on repeated queries

**Parsers** — native, without tree-sitter:
- TypeScript Compiler API (TS/JS)
- Python `ast` + Pyright
- Chevrotain (Java), ANTLR (Kotlin, Rust)
- go/parser CLI, Roslyn addon (C#)
- Regex-based (Bash, PowerShell, Helm, Zig, C/C++)

**Performance**:
- xxHash for content hashes
- Worker pool with streaming mode (130+ files/sec for TS)
- Adaptive resource monitoring
- Incremental indexing via file watcher

**System requirements**:
- **Minimum**: Node.js 24+, 2GB RAM
- **Recommended**: Node.js 24+ or Bun 1.0+, 8GB RAM, SSD

</details>

---

## 🛠️ **Development**

```bash
npm install
npm run build
node dist/index.js /path/to/project
npm test
```

---

## 🤝 **Contributing**

1. Fork the repository
2. Submit pull request

[Issue Tracker](https://github.com/faxenoff/ultracode/issues)

---

## 📄 **License**

**Dual License** — see [LICENSE](LICENSE)

- **Open Source**: [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) — free to use, modify, and distribute
- **Commercial**: for proprietary/closed-source integration — [faxenoff@gmail.com](mailto:faxenoff@gmail.com)

**Links**: [GitHub](https://github.com/faxenoff/ultracode) | [NPM](https://www.npmjs.com/package/ultracode) | [MCP Protocol](https://github.com/modelcontextprotocol)
