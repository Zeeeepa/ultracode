# UltraCode — Complete Setup & Repo Analysis Workflow

> **Goal**: Set up UltraCode as your MCP tool, then use a structured 5-phase workflow to deeply understand any codebase.

---

## Table of Contents

- [Part 1: Setup](#part-1-setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [MCP Configuration](#mcp-configuration)
  - [Local Model Setup](#local-model-setup)
  - [Verification](#verification)
- [Part 2: Repo Analysis Workflow](#part-2-repo-analysis-workflow)
  - [Phase 1: Initial Indexing](#phase-1-initial-indexing)
  - [Phase 2: Architecture Overview](#phase-2-architecture-overview)
  - [Phase 3: Deep Code Understanding](#phase-3-deep-code-understanding)
  - [Phase 4: Quality & Risk Assessment](#phase-4-quality--risk-assessment)
  - [Phase 5: Ongoing Context Maintenance](#phase-5-ongoing-context-maintenance)
- [Part 3: Quick Reference](#part-3-quick-reference)
  - [Tool Selection Matrix](#tool-selection-matrix)
  - [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
  - [Subagent Prompt Template](#subagent-prompt-template)
  - [Environment Variables](#environment-variables)

---

## Part 1: Setup

### Prerequisites

| Requirement | Check Command | Minimum Version |
|---|---|---|
| **Bun** (recommended) | `bun --version` | ≥ 1.3.2 |
| **Node.js** (alternative) | `node --version` | ≥ 24.0.0 |
| **Git** | `git --version` | Any recent |

**Language runtimes** (only needed for the languages you want to analyze):

| Language | Check Command | Minimum |
|---|---|---|
| TypeScript/JavaScript | Built-in | — |
| Python | `python --version` | 3.8+ |
| Java/Kotlin | `java --version` | JRE 11+ |
| Go | `go version` | 1.18+ |
| Rust | `rustc --version` | Any stable |
| C# | `dotnet --version` | .NET SDK 8+ |
| C/C++ | `clang --version` | Clang 12+ |
| Zig | Built-in (regex) | — |
| Bash/PowerShell | Built-in (regex) | — |

### Installation

#### Option A: Bun (Recommended — 50% faster)

```bash
# 1. Install Bun if not present
# Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
# macOS/Linux:
curl -fsSL https://bun.sh/install | bash

# 2. Install UltraCode globally
bun install -g ultracode

# 3. Allow postinstall scripts for native modules (FAISS, CBOR, WebGPU, etc.)
bun pm -g trust ultracode
```

#### Option B: npm

```bash
npm install -g ultracode
```

### MCP Configuration

Add UltraCode to your Claude Code MCP configuration.

**Claude Code** (`~/.claude.json`):

```json
{
  "mcpServers": {
    "ultracode": {
      "command": "ultracode"
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ultracode": {
      "command": "ultracode"
    }
  }
}
```

**Cursor / Other MCP Clients**:

```json
{
  "mcpServers": {
    "ultracode": {
      "command": "ultracode"
    }
  }
}
```

> **Client-Server Architecture**: When running multiple AI agents, only one UltraCode instance runs per machine. New agents connect to the running server in milliseconds. Each agent gets an independent MCP session while sharing the same indexes (saving 10+ GB RAM).

### Local Model Setup

After installation, run the setup wizard to configure local embedding + LLM models:

```bash
# Bun
bunx ultracode setup

# npm
npx ultracode setup
```

The wizard will:
1. Detect your GPU (NVIDIA / Apple Silicon / CPU-only)
2. Guide you through selecting an **embedding provider** for semantic search
3. Guide you through selecting an **LLM provider** for AutoDoc generation

#### Embedding Provider Selection Guide

| Your Hardware | Recommended Provider | Speed |
|---|---|---|
| NVIDIA GPU (Turing/Ampere/Ada/Hopper) | **vLLM** | 1352 emb/s |
| NVIDIA GPU (alternative) | **TEI** (Text Embeddings Inference) | 1169 emb/s |
| Apple Silicon (M1/M2/M3/M4) | **MLX** | ~500 emb/s |
| AMD GPU | **llama.cpp** (Vulkan) | 441 emb/s |
| CPU-only / Intel GPU | **OVMS Native** | 260-326 emb/s |

#### LLM Provider Selection Guide

| Scenario | Recommended Provider |
|---|---|
| Docker Desktop installed | **Docker Model Runner** (Qwen 2.5, DeepSeek R1, Phi-4) |
| General purpose | **Ollama** (qwen2.5-coder, deepseek-coder) |
| Skip for now | Configure later via `bunx ultracode setup` |

> **Pro Tip**: You can skip LLM setup initially and just use embeddings. The LLM is only needed for AutoDoc documentation generation and AI-powered refactoring suggestions.

### Verification

After setup, verify everything works:

```bash
# 1. Check UltraCode is accessible
ultracode --version

# 2. Test MCP connection (Claude Code)
# In Claude Code, ask:
#   "What MCP tools do you have from ultracode?"
# Claude should list 70+ tools including semantic_search, index, etc.

# 3. Quick test: Index a small project
# In Claude Code, ask:
#   "Use ultracode to index this project and show me the graph stats"
```

**Expected verification output**:
- `ultracode --version` → Shows version (e.g., `5.1.0`)
- Claude lists tools like `semantic_search`, `index`, `get_members`, `trace_flow`
- Indexing a project produces entity count, relationship count, language breakdown

---

## Part 2: Repo Analysis Workflow

This is a structured 5-phase approach to deeply understand any codebase using UltraCode. Each phase builds on the previous one.

### Phase 1: Initial Indexing

**Goal**: Build the code graph and get a high-level overview.

```
Step 1: Index the codebase
────────────────────────────────────────
index directory="/path/to/project"

  → Parses all source files into an AST graph
  → Creates entities (functions, classes, interfaces, types)
  → Maps relationships (imports, calls, extends, implements)
  → Generates vector embeddings for semantic search
  → Full indexing of a medium project takes ~3 seconds

Step 2: Detect the technology stack
────────────────────────────────────────
detect_technology_stack

  → Identifies languages, frameworks, build tools
  → Detects Angular, React, NestJS, Spring Boot, etc.
  → Shows dependency counts per language

Step 3: Get graph statistics
────────────────────────────────────────
get_graph_stats

  → Total entities, relationships, files
  → Breakdown by language and entity type
  → Database size and health
```

**What you learn**: Project size, languages used, framework detection, entity/relationship counts.

### Phase 2: Architecture Overview

**Goal**: Understand the project structure, module boundaries, and key dependencies.

```
Step 1: Visualize the dependency graph
────────────────────────────────────────
get_graph format="mermaid" maxNodes=50

  → Generates a Mermaid diagram of the code graph
  → Shows how modules connect to each other
  → Identifies hub files with many connections

Step 2: Check graph health
────────────────────────────────────────
get_graph_health

  → Orphaned entities (files not connected to anything)
  → Circular dependencies
  → Swagger/API spec desynchronization (if applicable)
  → Missing relationship coverage

Step 3: Find entry points and core modules
────────────────────────────────────────
pattern_search pattern="main|entry|init|bootstrap|app" mode="entity"

  → Finds the application entry points
  → Shows initialization flow

Step 4: Explore key entity relationships
────────────────────────────────────────
list_entity_relationships entityName="AppModule" depth=3

  → Shows 3-level deep dependency tree
  → Reveals which modules depend on what
  → Replace "AppModule" with whatever your root entity is
```

**What you learn**: Module boundaries, entry points, dependency flow, architectural health issues.

### Phase 3: Deep Code Understanding

**Goal**: Understand specific code behavior, data flows, and business logic.

```
Step 1: Semantic search by meaning
────────────────────────────────────────
semantic_search query="authentication and authorization logic"
semantic_search query="database connection handling"
semantic_search query="error handling middleware"

  → Finds code by MEANING, not keywords
  → Returns relevant entities with line references
  → 18,000x faster than grep-based search

Step 2: Trace code execution flow
────────────────────────────────────────
trace_flow fromEntity="handleRequest" toEntity="saveToDatabase"

  → Shows the complete execution path from A to B
  → Identifies all intermediate function calls
  → Marks decision points and branches

Step 3: Trace backwards (why isn't something called?)
────────────────────────────────────────
trace_backwards entityName="unusedFunction"

  → Shows all potential callers
  → Reveals why a function may be unreachable
  → Identifies dead code

Step 4: Trace data flow
────────────────────────────────────────
trace_data_flow entryPoint="userInput" targetState="database"

  → How user data flows through the system
  → Identifies transformations along the way
  → Critical for security analysis

Step 5: Analyze impact of a potential change
────────────────────────────────────────
analyze_code_impact entity="UserService" includeSemantic=true

  → What will break if you modify this entity?
  → Direct dependents + semantic related code
  → Risk assessment before making changes

Step 6: Find related concepts
────────────────────────────────────────
find_related_concepts concept="payment processing"

  → Finds all code related to a business concept
  → Even code that doesn't use the keyword "payment"
  → Cross-file, cross-module discovery
```

**What you learn**: Business logic flow, data paths, execution traces, change impact zones.

### Phase 4: Quality & Risk Assessment

**Goal**: Identify technical debt, complexity hotspots, and code quality issues.

```
Step 1: Find complexity hotspots
────────────────────────────────────────
analyze_hotspots metric="complexity" limit=20

  → Top 20 most complex functions/methods
  → Cyclomatic + cognitive complexity scores
  → These are your highest-risk code areas

Step 2: Find code duplicates
────────────────────────────────────────
find_duplicates minSimilarity=0.75

  → Semantic duplicate detection (not just text match)
  → Shows similarity scores
  → Identifies refactoring opportunities

Step 3: JSCPD clone detection (no embeddings needed)
────────────────────────────────────────
jscpd_detect_clones minLines=10 minTokens=50

  → Fast text-based clone detection
  → Works without embedding provider
  → Good for large-scale duplicate scanning

Step 4: Analyze tangled state dependencies
────────────────────────────────────────
analyze_state_chaos scope="project" autoDetect=true

  → Finds tightly coupled state mutations
  → Identifies "god objects" with too many responsibilities
  → Shows state dependency chains

Step 5: Validate code quality
────────────────────────────────────────
validate_directory dirPath="src/"

  → Runs oxlint (TS/JS), Pylint (Python), golint (Go), clippy (Rust)
  → Batch validation across entire directories
  → Reports issues by severity

Step 6: Find undocumented public APIs
────────────────────────────────────────
semantic_search query="exported functions" hasDocumentation=false limit=50

  → Finds public APIs missing documentation
  → Filters by documentation presence

Step 7: Find async code without error handling
────────────────────────────────────────
semantic_search query="API calls" hasAwaits=true hasExceptions=false

  → Async code that may silently fail
  → Critical for reliability assessment
```

**What you learn**: Technical debt locations, duplication, complexity hotspots, quality gaps.

### Phase 5: Ongoing Context Maintenance

**Goal**: Keep the code understanding current as the codebase evolves.

```
Auto-Indexing (Automatic — No Action Needed)
────────────────────────────────────────
GitWatcher automatically:
  → Incrementally indexes when files change
  → Fully re-indexes on branch switch
  → Debounces changes (waits 60s after last edit)
  → Handles branch-aware storage isolation

Manual re-index only needed for force rescan:
  clean_index directory="/path/to/project"

AutoDoc Setup (Optional but Powerful)
────────────────────────────────────────
autodoc_init enabled=true language="en"
autodoc_generate filePath="src/core/" scope="module" style="detailed"
autodoc_save filePath="ARCHITECTURE.md" content="..."

  → Auto-generates and maintains documentation
  → Code references are auto-updated with line numbers
  → Find code by business meaning via autodoc_search
  → Install Git hooks: autodoc_install_hooks

Snapshots for Safe Exploration
────────────────────────────────────────
create_snapshot description="Before refactoring auth module"
  → Save a restore point before making changes
  → Instant rollback via: undo
  → List available: list_snapshots

Branch Comparison
────────────────────────────────────────
get_changed_files fromBranch="main" toBranch="feature/new-api"
  → See what changed between branches
  → Combined with semantic_search for targeted analysis
```

**What you learn**: The codebase stays current automatically; AutoDoc preserves institutional knowledge.

---

## Part 3: Quick Reference

### Tool Selection Matrix

| "I want to..." | Use This Tool | NOT This |
|---|---|---|
| Search code by meaning | `semantic_search` | ❌ `grep` / `ripgrep` |
| List entities in a file | `get_members` | ❌ `glob` + read files |
| Check what breaks | `analyze_code_impact` | ❌ Manual dependency tracing |
| Find duplicate code | `find_duplicates` | ❌ `grep` for patterns |
| Trace execution A→B | `trace_flow` | ❌ Reading files sequentially |
| Find why something isn't called | `trace_backwards` | ❌ Searching call sites manually |
| Modify code safely | `modify_code` with `create_snapshot` | ❌ Blind file editing |
| Rename across project | `rename_symbol` | ❌ Find-and-replace |
| View file entities | `get_members` | ❌ `cat` entire file |
| Check dependencies | `list_entity_relationships` | ❌ Reading import statements |
| Find complex code | `analyze_hotspots` | ❌ Manual code review |
| Validate code | `validate_file` / `validate_directory` | ❌ Running linters manually |
| Search across languages | `cross_language_search` | ❌ Language-specific tools |
| Natural language query | `query` | ❌ Trying to phrase as regex |

### Search Filter Quick Reference

`semantic_search` supports rich filtering for precision:

```
# By complexity
semantic_search query="data processing" minCyclomatic=10

# By async patterns
semantic_search query="API calls" hasAwaits=true hasExceptions=false

# By documentation status
semantic_search query="export" hasDocumentation=false

# By recent changes (dramatically faster)
semantic_search query="auth" changedInLastCommits=5

# By call frequency (find hotspots)
semantic_search query="" minCallCount=20

# Combined filters
semantic_search query="validation" hasLoops=true minCyclomatic=8
```

### Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Best Practice | Why |
|---|---|---|
| Using `grep` to find code | Use `semantic_search` | Understands meaning, not just keywords |
| Reading entire files with `cat` | Use `get_members` for structure | AST-level precision, much less tokens |
| Manual dependency tracing | Use `analyze_code_impact` | Complete transitive dependency analysis |
| Blind code editing | Use `modify_code` with `preview=true` | Validates changes, shows impact |
| Forgetting to index | Rely on GitWatcher auto-indexing | Automatic incremental updates |
| Re-reading unchanged code | Use cached graph queries | Graph persists between sessions |
| Trial-and-error modifications | Use `modify_code` + `undo` | Snapshot-based rollback |
| Running `index` on every query | Trust incremental indexing | GitWatcher handles this |

### Subagent Prompt Template

When spawning subagents (Explore, Plan, etc.) in Claude Code, they do NOT see your CLAUDE.md. Prepend this to any subagent prompt:

```
IMPORTANT: Use ToolSearch to load UltraCode MCP tools before searching code.
Run: ToolSearch(query="+ultracode semantic_search") to load search tools.
Then use mcp__ultracode__semantic_search instead of Grep for code search,
and mcp__ultracode__get_members instead of Glob+Read for listing file entities.
These tools understand code semantics and are 5-10x faster than text search.
```

**Prefer direct MCP calls over spawning agents** for:

| Task | Don't Spawn Agent | Use Directly |
|---|---|---|
| Find code by meaning | Agent(Explore) | `semantic_search` |
| List file entities | Agent(Explore) | `get_members` |
| Check what breaks | Agent(Plan) | `analyze_code_impact` |
| Trace code flow | Agent(general-purpose) | `trace_flow` |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MCP_EMBEDDING_PROVIDER` | `auto` | Force embedding provider: `ovms`, `tei`, `ollama`, `vllm`, `mlx` |
| `MCP_EMBEDDING_ENABLED` | `true` | Enable/disable semantic features |
| `MCP_USE_PARSER` | `true` | Enable/disable AST parsing |
| `MCP_DEV_INDEX_BATCH` | `100` | Batch size for file processing |
| `MCP_DEBUG_DISABLE_SEMANTIC` | `false` | Disable semantic agent (debugging) |
| `MCP_QUIET_MODE` | `false` | Suppress all console output |
| `ULTRACODE_SKIP_POSTINSTALL` | `0` | Skip postinstall wizard |

### Data Directory

All UltraCode data is stored in:

| OS | Path |
|---|---|
| Windows | `%LOCALAPPDATA%\UltraCode\` |
| macOS | `~/Library/Application Support/UltraCode/` |
| Linux | `~/.local/share/UltraCode/` |

```
UltraCode/
├── config/
│   ├── semantic-config.json    # Embedding/LLM providers
│   └── parser-config.json      # Runtime paths
├── projects/
│   └── {hash}/                 # Per-project isolated data
│       ├── faiss-*.bin         # FAISS vector indexes
│       └── *.json              # Index metadata
├── logs/                       # Daily rotation logs
├── models/                     # Downloaded embedding models
└── unified-storage.db          # Graph and entity storage
```

---

## Complete Workflow: From Zero to Full Context

Here's the exact sequence to go from "never used UltraCode" to "deeply understand any repo":

```
┌─────────────────────────────────────────────────────┐
│  ONE-TIME SETUP                                     │
│                                                     │
│  1. Install:  bun install -g ultracode              │
│  2. Trust:    bun pm -g trust ultracode             │
│  3. Config:   Add to ~/.claude.json                 │
│  4. Models:   bunx ultracode setup                  │
│  5. Verify:   ultracode --version                   │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  PER-REPO WORKFLOW                                  │
│                                                     │
│  Phase 1 — INDEX                                    │
│  ├── index directory="/path/to/repo"                │
│  ├── detect_technology_stack                        │
│  └── get_graph_stats                                │
│                                                     │
│  Phase 2 — MAP ARCHITECTURE                         │
│  ├── get_graph format="mermaid"                     │
│  ├── get_graph_health                               │
│  ├── pattern_search "main|entry|init" mode="entity" │
│  └── list_entity_relationships depth=3              │
│                                                     │
│  Phase 3 — UNDERSTAND CODE                          │
│  ├── semantic_search query="<business logic>"       │
│  ├── trace_flow from="A" to="B"                     │
│  ├── trace_backwards entity="<target>"              │
│  └── analyze_code_impact entity="<target>"          │
│                                                     │
│  Phase 4 — ASSESS QUALITY                           │
│  ├── analyze_hotspots metric="complexity"           │
│  ├── find_duplicates minSimilarity=0.75             │
│  ├── validate_directory dirPath="src/"              │
│  └── semantic_search hasDocumentation=false         │
│                                                     │
│  Phase 5 — MAINTAIN (automatic)                     │
│  ├── GitWatcher auto-indexes on changes             │
│  ├── autodoc_init (optional)                        │
│  └── create_snapshot before changes                 │
└─────────────────────────────────────────────────────┘
```

---

*Generated from UltraCode v5.1.0 source analysis. See also: [prompts/workflows.md](../prompts/workflows.md) for additional workflow examples.*

