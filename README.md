```
        ██  ██
        ██  ██  ██    ██████ █████▄  ▄████▄
        ██  ██  ██      ██   ██▄▄██▄ ██▄▄██
        ██  ██  ██      ██   ██   ██ ██  ██
        ██  ██  ██████  ██   ██   ██ ██  ██
        ▀████▀            ▄▄▄▄  ▄▄▄▄ ▄▄▄▄  ▄▄ ▄▄▄▄ ▄▄▄▄▄▄
                         ███▄▄ ██▀▀▀ ██▄█▄ ██ ██▄█▀  ██
                         ▄▄██▀ ▀████ ██ ██ ██ ██     ██

     ╔═════════════════════════════════════════════════════╗
     ║            ULTRASCRIPT TOOLS MCP SERVER             ║
     ╚═════════════════════════════════════════════════════╝
```

[![npm version](https://badge.fury.io/js/ultrascript-tools-mcp.svg)](https://www.npmjs.com/package/ultrascript-tools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.3.2-f472b6)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)

# Codebase RAG for Fast and Accurate Code Work

🌐 **Language**: [EN] | [RU](./README_ru.md)

---

Reduces time and token costs by up to 90% when working with code through AI agents. Code search, analysis, and modification operate on a complete code structure graph database. Local embedding models enable flexible queries with immediate verification and refinement.

**Full indexing of a medium-sized project takes 3 seconds**. Incremental indexing of changes happens on the fly.

| | ❌ Regular AI Agent Work | ✅ Work via UltraScript |
|---|---|---|
| **Search** | AI agent uses grep/replace for full-text keyword search. Reads and analyzes found files entirely, then follows file chains. <br />A simple task in a large project takes **30 minutes and 1M+ tokens**. And it won't find everything. | AI agent queries UltraScript and instantly receives complete and accurate information with line-of-code references. Semantics find even non-obvious connections. <br />Query executes in **100ms and returns 5K tokens** (18,000x faster, 200x cheaper). |
| **Editing** | AI agent edits files "blindly". Instead of careful modification, it goes through 10-20 iterations: breaks → checks → fixes → breaks. Plus dozens of requests to find bash/pwsh commands. <br />Takes **up to 1 hour and 2M+ tokens**. | UltraScript precisely modifies code at the structure level + linting + formatting + impact analysis with local tracing. If something breaks — reports it in the same response. <br />**18,000x faster, 200x cheaper.** |
| **Memory** | AI agent forgets what it did and recreates the same functionality next to existing code. Or debugs a function for hours that it disabled itself. <br />Takes **many hours and 10M+ tokens**. | Through UltraScript, the agent gets the complete code structure in compact form. AutoDoc automatically maintains documentation. Agent won't fall into the forgetfulness trap. <br />Everything correct immediately. |
| **Git** | When switching branches or making changes — agent won't detect this and will continue working with outdated code representation. <br />Need to forcefully trigger re-analysis. | All queries work with current code. Switch branches, modify files — incremental indexing of graph and semantics happens instantly. <br />Nothing additional needed, not even thinking about it. |

# Features

MCP server provides **70 tools** for code analysis and modification.

## Search and Navigation

| Tool | Description |
|------|-------------|
| [**semantic_search**](docs/features/search.md#semantic_search) | Semantic search by meaning with filters (complexity, flow, docs) |
| [**pattern_search**](docs/features/search.md#pattern_search) | Advanced search: regex, semantic, hybrid |
| [**query**](docs/features/search.md#query) | NLP queries in natural language about code |
| [**find_similar_code**](docs/features/search.md#find_similar_code) | Find functions with similar logic |
| [**cross_language_search**](docs/features/search.md#cross_language_search) | Unified search across all project languages |
| [**find_related_concepts**](docs/features/search.md#find_related_concepts) | Find related concepts |

## Code Analysis

| Tool | Description |
|------|-------------|
| [**analyze_code_impact**](docs/features/analysis.md#analyze_code_impact) | Impact analysis — what will break on modification |
| [**find_duplicates**](docs/features/analysis.md#find_duplicates) | Semantic code clone detection |
| [**jscpd_detect_clones**](docs/features/analysis.md#jscpd_detect_clones) | jscpd-based clone detector |
| [**suggest_refactoring**](docs/features/analysis.md#suggest_refactoring) | AI-powered code improvement suggestions |
| [**analyze_hotspots**](docs/features/analysis.md#analyze_hotspots) | Complex areas with high cyclomatic complexity |
| [**analyze_state_chaos**](docs/features/analysis.md#analyze_state_chaos) | Analysis of tangled data dependencies |
| [**detect_technology_stack**](docs/features/analysis.md#detect_technology_stack) | Project technology stack detection |

## Static Tracing and Debugging

| Tool | Description |
|------|-------------|
| [**trace_flow**](docs/features/tracing.md#trace_flow) | How code flows from point A to B |
| [**trace_backwards**](docs/features/tracing.md#trace_backwards) | Why a function is not being called |
| [**trace_data_flow**](docs/features/tracing.md#trace_data_flow) | How data affects state |
| [**analyze_state_impact**](docs/features/tracing.md#analyze_state_impact) | What changes with different values |
| [**find_decision_points**](docs/features/tracing.md#find_decision_points) | Branching points in code |

## Code Modification

| Tool | Description |
|------|-------------|
| [**modify_code**](docs/features/modification.md#modify_code) | Structural AST-level editing with validation |
| [**create_file**](docs/features/modification.md#create_file) | Create new file |
| [**copy_file**](docs/features/modification.md#copy_file) | Copy file with graph updates |
| [**rename_file**](docs/features/modification.md#rename_file) | Rename file with import updates |
| [**split_file**](docs/features/modification.md#split_file) | Split file into parts |
| [**synthesize_files**](docs/features/modification.md#synthesize_files) | Merge files |
| [**rename_symbol**](docs/features/modification.md#rename_symbol) | Project-wide symbol renaming |
| [**add_member**](docs/features/modification.md#add_member) | Add methods/properties to classes |

## Code Validation

| Tool | Description |
|------|-------------|
| [**validate_file**](docs/features/validation.md#validate_file) | File validation via oxlint/Pylint/golint/clippy |
| [**validate_directory**](docs/features/validation.md#validate_directory) | Batch directory validation |

## Documentation (AutoDoc)

| Tool | Description |
|------|-------------|
| [**autodoc_init**](docs/features/autodoc.md#autodoc_init) | Initialize AutoDoc system |
| [**autodoc_generate**](docs/features/autodoc.md#autodoc_generate) | Generate documentation for entities |
| [**autodoc_save**](docs/features/autodoc.md#autodoc_save) | Save documentation to .autodoc |
| [**autodoc_get**](docs/features/autodoc.md#autodoc_get) | Get entity documentation |
| [**autodoc_search**](docs/features/autodoc.md#autodoc_search) | Semantic search through documentation |
| [**autodoc_validate**](docs/features/autodoc.md#autodoc_validate) | Check documentation freshness |
| [**autodoc_status**](docs/features/autodoc.md#autodoc_status) | Documentation coverage statistics |
| [**autodoc_sync**](docs/features/autodoc.md#autodoc_sync) | Synchronize with code changes |
| [**autodoc_changelog**](docs/features/autodoc.md#autodoc_changelog) | Documentation change history |
| [**autodoc_install_hooks**](docs/features/autodoc.md#autodoc_install_hooks) | Install Git hooks for auto-updates |
| [**autodoc_detect_language**](docs/features/autodoc.md#autodoc_detect_language) | Detect language for generation |

## Git Integration

| Tool | Description |
|------|-------------|
| [**list_branches**](docs/features/git.md#list_branches) | List indexed branches |
| [**switch_branch**](docs/features/git.md#switch_branch) | Switch branches with auto-reindexing |
| [**get_branch_status**](docs/features/git.md#get_branch_status) | Current branch status |
| [**get_changed_files**](docs/features/git.md#get_changed_files) | Compare files between branches |
| [**cleanup_branches**](docs/features/git.md#cleanup_branches) | Clean up old branches (LRU) |

## Version History (Prolly Tree)

| Tool | Description |
|------|-------------|
| [**list_commits**](docs/features/history.md#list_commits) | List graph commits (version snapshots) |
| [**get_entity_history**](docs/features/history.md#get_entity_history) | Entity change history across commits |
| [**diff_commits**](docs/features/history.md#diff_commits) | Compare two graph versions (added/modified/deleted) |
| [**checkout_commit**](docs/features/history.md#checkout_commit) | Time travel — view graph at specific commit |

## Semantic Merge

| Tool | Description |
|------|-------------|
| [**semantic_merge**](docs/features/merge.md#semantic_merge) | AI-powered 3-way merge with code understanding |
| [**analyze_merge_conflicts**](docs/features/merge.md#analyze_merge_conflicts) | Analyze conflicts with explanations |
| [**get_merge_suggestions**](docs/features/merge.md#get_merge_suggestions) | AI suggestions for conflict resolution |
| [**get_semantic_merge_info**](docs/features/merge.md#get_semantic_merge_info) | Information about semantic differences |

## Snapshots and Safety

| Tool | Description |
|------|-------------|
| [**create_snapshot**](docs/features/snapshots.md#create_snapshot) | Save restore point |
| [**undo**](docs/features/snapshots.md#undo) | Instant rollback to snapshot |
| [**list_snapshots**](docs/features/snapshots.md#list_snapshots) | List available snapshots |
| [**cleanup_snapshots**](docs/features/snapshots.md#cleanup_snapshots) | Clean up old snapshots |

## Code Graph and Indexing

| Tool | Description |
|------|-------------|
| [**index**](docs/features/indexing.md#index) | Index codebase |
| [**clean_index**](docs/features/indexing.md#clean_index) | Full reindexing |
| [**get_members**](docs/features/graph.md#get_members) | List entities in file |
| [**list_entity_relationships**](docs/features/graph.md#list_entity_relationships) | Entity relationships and dependencies |
| [**get_graph**](docs/features/graph.md#get_graph) | Get graph (JSON/GraphML/Mermaid) |
| [**get_graph_stats**](docs/features/graph.md#get_graph_stats) | Graph statistics |
| [**get_graph_health**](docs/features/graph.md#get_graph_health) | Graph health diagnostics |
| [**reset_graph**](docs/features/graph.md#reset_graph) | Full graph cleanup |

## Metrics and Monitoring

| Tool | Description |
|------|-------------|
| [**get_metrics**](docs/features/metrics.md#get_metrics) | System metrics and statistics |
| [**get_version**](docs/features/metrics.md#get_version) | Server and runtime version |
| [**get_agent_metrics**](docs/features/metrics.md#get_agent_metrics) | Multi-agent system telemetry |
| [**get_bus_stats**](docs/features/metrics.md#get_bus_stats) | Knowledge bus statistics |
| [**clear_bus_topic**](docs/features/metrics.md#clear_bus_topic) | Clear cached topic entries |
| [**get_watcher_status**](docs/features/metrics.md#get_watcher_status) | Background watcher status |

---

## Additional Features

### Performance
- **SIMD/WebAssembly** — built-in CPU acceleration
- **CUDA/FAISS** — GPU acceleration for large projects
- **WebGPU/Dawn** — cross-platform GPU acceleration
- **Streaming indexing** — parsing and indexing in parallel
- **Local embeddings** — TEI/Ollama/vLLM without external APIs

### Language Support

| Language | Parser | Entities | Relationships | Metrics | Types |
|----------|--------|----------|--------------|---------|-------|
| **TypeScript** | TS Compiler API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **JavaScript** | TS Compiler API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Python** | ast + Pyright | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Kotlin** | kotlin-compiler | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Java** | JavaParser | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Go** | go/parser | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Rust** | syn + ANTLR | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Swift** | SwiftSyntax | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **C/C++** | clang AST | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Bash** | regex + heuristics | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | — |
| **PowerShell** | regex + heuristics | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | — |
| **JSON/YAML** | native + OpenAPI | ⭐⭐⭐ | ⭐⭐⭐ | — | — |

**Legend:**
- **Entities** — functions, classes, interfaces, types, enums, variables
- **Relationships** — imports, calls, extends, implements, references
- **Metrics** — cyclomatic, cognitive complexity, control flow, documentation
- **Types** — type inference, type references, generics

### Frameworks

| Framework | Additional Capabilities |
|-----------|------------------------|
| **Angular** | Components, directives, pipes, services, modules, DI hierarchy, template bindings |
| **NgRx** | Actions, reducers, effects, selectors, feature states, action creators |
| **React** | JSX/TSX, functional/class components, hooks (useState, useEffect, useMemo, useCallback, useContext) |

### Built-in Documentation (MCP Prompts)

You can add a [short prompt](docs/claude.cfg/add-to-CLAUDE.md) to your system prompts that will help the AI agent learn about Ultrascript-tools capabilities.

- **quick-start** — quick start and tool selection
- **tool-reference** — complete reference of 70 tools
- **workflows** — ready scenarios: analysis, refactoring, duplicate detection
- **tracing-guide** — tracing and debugging guide

### UltraCode Agent
- **Task delegation** — hand over complex tasks to `/ultracode` agent
- **Maximum efficiency** — agent selects optimal tools itself
- **Comprehensive analysis** — search, tracing, refactoring in one request
- **Natural language** — describe the task in your own words

### Client-Server Architecture
- **One process per machine** — when running multiple AI agents, only one UltraScript instance runs
- **Save 10+ GB RAM** — instead of N copies of indexes in memory — one shared
- **Instant connection** — new agents connect to running server in milliseconds
- **Session isolation** — each agent gets independent MCP session

# Installation

The project is optimized for [Bun](https://bun.sh) (an alternative JavaScript runtime) and runs 50% faster with it.

**Installing Bun** (one command):

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

**Installing Ultrascript-tools**

```bash
# Bun (recommended) — two steps:

# 1. Install package
bun install -g ultrascript-tools-mcp

# 2. Allow postinstall scripts for native modules
bun pm -g trust ultrascript-tools-mcp
```

```bash
# npm (alternative) — one step:
npm install -g ultrascript-tools-mcp
```

> **Why two steps for Bun?**
> To achieve ultra-speed, UltraScript uses native components:
>
> - **faiss-napi** — HNSW/IVF indexes for vector search (100x speedup)
> - **cbor-extract** — fast native metadata serialization
> - **webgpu** — Dawn GPU backend for AMD/Intel
> - **protobufjs** — binary protocol for IPC
> - **xxhash-wasm** — SIMD-accelerated file hashing
> - **libSQL** — native SQLite bindings with vector extension
> - **oxc-parser** — Rust parser for TS/JS (10x faster than tsc)
>
> Bun blocks postinstall scripts by default. The `bun pm trust` command allows their execution — no reinstall needed.

> **Note**: For full code analysis on different languages, runtimes are required:
>
> - TypeScript/JavaScript — built-in (TypeScript Compiler API)
> - Python — requires Python 3.8+ (`python --version`)
> - Java/Kotlin — requires JRE 11+ (`java --version`)
> - Go — requires Go 1.18+ (`go version`)
> - Rust — requires Rust toolchain (`rustc --version`)
> - C/C++ — requires Clang 12+ (`clang --version`)

**Claude Code Config** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "ultrascript"
    }
  }
}
```

> Detailed documentation: [docs/CLAUDE_CODE_INTEGRATION.md](docs/CLAUDE_CODE_INTEGRATION.md)

## **Local Model Setup**

Local models are used for intelligent tasks: embedding model for semantic search and LLM for AutoDoc. This removes token costs from your main AI agent.

**After installation, a setup wizard will launch and download and configure everything needed.**

**Step 1: Embedding Provider** (semantic search)

| Provider | Speed | Recommendation |
|----------|-------|----------------|
| **vLLM** | 1352 emb/s | ⭐ NVIDIA GPU (recommended) |
| **TEI** | 1169 emb/s | ⭐ NVIDIA GPU (Blackwell: `120-latest` image) |
| **llama.cpp** | 441 emb/s | AMD GPU (Vulkan), universal |
| **OVMS Native** | 260-326 emb/s | ⭐ CPU / Intel GPU. <br />Can help if main VRAM is occupied by local LLM. |

**Step 2: LLM Provider** (AutoDoc, refactoring)

| Provider | Models | Recommendation |
|----------|--------|----------------|
| **Docker Model Runner** | Qwen 2.5, DeepSeek R1, Phi-4, Llama 3.2 | ⭐ If Docker Desktop is installed |
| **Ollama** | qwen2.5-coder, deepseek-coder, phi4 | Universal option |
| **Skip** | — | Configure later |

The wizard automatically:
- Detects your GPU (NVIDIA Turing/Ampere/Ada/Hopper/Blackwell*)
- Suggests optimal models for your hardware
- Installs selected providers
- Saves configuration to system directory

> **Re-run wizard:**
> ```bash
> # Bun
> bunx ultrascript-tools-mcp setup
>
> # Node.js
> npx ultrascript-tools-mcp setup
> ```

*For Blackwell (RTX 50xx), an unofficial TEI fork is used

### AUTODOC Setup

To activate auto-documentation mode - create a `.autodoc` folder in the project root and enable LLM usage (easiest to use the same claude).

After running Ultrascript with Autodoc mode enabled:

1. In all folders with source code (from supported languages), AUTODOC.md files will be created with a template listing files in the directory.
2. LLM will go through these files and generate descriptions in AUTODOC.md — what the code in the files specifically does.

After this, you can yourself (or with an AI agent's help) create needed files with project overview in the .autodoc directory and add "human descriptions" in AUTODOC.md files where needed. There you can use direct references to code lines in files (for describing start and end of code block, use two numbers. Example: FILE:XX-ZZ). UltraScript will track code changes and automatically update all code references to keep them current. It won't touch documentation text.

### GPU Acceleration macOS (Apple Silicon):

I don't currently have the ability to build a native binary on modern Macbook.
Build it yourself if you really need it.

```bash
# During installation, Metal backend build is offered
# Build requirements:
#   - Xcode Command Line Tools: xcode-select --install
#   - Homebrew: https://brew.sh
#   - CMake: brew install cmake

# Can build later:
./node_modules/ultrascript-tools-mcp/scripts/build-native-libs-macos.sh
```

# Configuration

## Data Structure

All UltraScript data is stored in system directory:

- **Windows**: `%LOCALAPPDATA%\UltraScriptTools\`
- **macOS**: `~/Library/Application Support/UltraScriptTools/`
- **Linux**: `~/.local/share/UltraScriptTools/`

```
UltraScriptTools/
├── config/
│   ├── semantic-config.json    # Embedding/LLM providers (setup wizard)
│   └── parser-config.json      # Runtime paths (Java, Kotlin)
├── projects/
│   └── {hash}/                 # Project data (hash from path)
│       ├── faiss-*.bin         # FAISS index for vector search
│       └── *.json              # Index metadata
├── logs/                       # Server logs (daily rotation)
├── models/                     # Downloaded embedding models
├── llamacpp/                   # llama.cpp binaries and models
├── ovms/                       # OpenVINO Model Server models
├── hf-cache/                   # HuggingFace model cache
├── autodoc.db                  # AutoDoc documentation database
└── unified-storage.db          # Unified storage for graphs and entities
```

## Configuration Parameters

Advanced parameters can be set in `config/default.yaml` (for developers) or via environment variables.
Embedding/LLM are configured via setup wizard and stored in `semantic-config.json`.

Main parameters:

| Section | Parameter | Default | Description |
|---------|-----------|---------|-------------|
| **logging** | `level` | `info` | Log level: debug, info, warn, error |
| | `maxFiles` | `5` | Number of log files for rotation |
| **database** | `mode` | `WAL` | libSQL mode: WAL, DELETE, TRUNCATE |
| | `cacheSize` | `10000` | libSQL cache size |
| **indexing** | `autoSwitchOnBranchChange` | `true` | Auto-switch DB on branch change |
| | `maxBranchesPerRepo` | `10` | Max branches per repository |
| | `incrementalThreshold` | `20` | File threshold for full reindexing |
| **git** | `enabled` | `true` | Git integration |
| | `autoReindex` | `true` | Auto-index on branch change |
| | `debounceMs` | `60000` | Delay before indexing changes |
| **parser** | `maxFileSize` | `1048576` | Max file size (1MB) |
| | `timeout` | `60000` | Parsing timeout (60 sec) |
| **performance** | `maxWorkerThreads` | `4` | Parallel parsing workers |

# For AI Agents

**[LLM_INSTRUCTIONS.md](./LLM_INSTRUCTIONS.md)** — Why using UltraScript makes you a good boy.

# Contributing

This package is open source under the MIT license.

Repository: https://github.com/faxenoff/ultrascript-tools-mcp

## License

MIT © faxenoff
