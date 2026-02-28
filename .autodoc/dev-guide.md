# Developer Guide

> Translated and updated from README_DEV.md. For end-user README, see [README.md](../README.md).

## What is UltraCode?

A smart assistant for working with your code. Ask questions like "Where is authentication handled?", "What functions are duplicated?", "What breaks if I change this class?" — and get precise answers in seconds.

UltraCode analyzes your codebase, understands relationships between components, and answers natural language questions through Claude, Gemini, or other AI assistants.

**14 languages** | **5.5x faster** than built-in Claude tools | **Smart search** | **70+ tools**

---

## Real-World Examples

### 1. Find Duplicates for Refactoring

```
You: "Find duplicate code"

UltraCode:
  Found 15 duplicate groups
  - calculateDiscount() and getDiscount() — 93% similar
  - validateUser() and checkUser() — 89% similar
```

### 2. Impact Analysis

```
You: "What uses class PaymentProcessor?"

UltraCode:
  Dependencies found:
  - OrderService.processOrder() — direct usage
  - CheckoutController.pay() — via DI
  - PaymentQueue.worker — async tasks
  Affected: 3 components, 8 files
```

### 3. Find Hotspots

```
You: "Show the most complex components"

UltraCode:
  Hotspots:
  1. DataProcessor.transform() — complexity 85/100
  2. ReportGenerator.generate() — complexity 78/100
  3. UserService.sync() — complexity 72/100
```

---

## Performance

**5.5x faster** than built-in Claude tools:

| Operation | Built-in tools | UltraCode | Speedup |
|-----------|---------------|-----------|---------|
| Project analysis (1000 files) | ~55 sec | **<10 sec** | **5.5x** |
| Code search | Slow (per-file) | Instant (in-memory index) | **10x+** |
| Semantic search | Not supported | **<100 ms** | N/A |
| Memory usage | Heavy processes | 65 MB | Optimized |

---

## Quick Start

### Installation

```bash
npm install -g ultracode
# or run without installation
npx ultracode /path/to/your/project
```

### Claude Desktop Integration

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

### Optional: Embeddings Setup

UltraCode works out of the box with hash-based embeddings. For better semantic search:

| Provider | Setup | Context | Recommendation |
|----------|-------|---------|---------------|
| **vLLM** | Docker + NVIDIA GPU | model-dependent | Highest throughput (1352 emb/s) |
| **TEI** | Docker + NVIDIA GPU | model-dependent | HuggingFace models (1169 emb/s) |
| **llama.cpp** | Native binary | model-dependent | No Docker, CUDA/CPU (441 emb/s) |
| **OVMS** | Native or Docker | model-dependent | Intel optimized (260-326 emb/s) |
| **Ollama** | Simple install | model-dependent | Easy setup, no batch |

See [embeddings.md](embeddings.md) and [benchmarks.md](benchmarks.md) for details.

---

## Supported Languages

| Language | Analysis Scope | Quality |
|----------|---------------|---------|
| **TypeScript/JavaScript** | ES6+, JSX, TSX, React, async/await | 100% |
| **Python** | Classes, functions, async, decorators, magic methods | 95% |
| **C#** | Classes, interfaces, LINQ, async/await, properties (via Roslyn) | 95% |
| **C/C++** | Functions, structs, classes, templates, namespaces | 90% |
| **Rust** | Functions, structs, traits, impl, modules | 90% |
| **Go** | Packages, functions, structs, interfaces, goroutines | 90% |
| **Java** | Classes, interfaces, records (Java 14+), generics | 90% |
| **Kotlin** | Classes, data classes, functions, coroutines | 85% |
| **Swift** | Classes, structs, protocols, extensions | 85% |
| **PowerShell** | Functions, filters, classes, modules, [CmdletBinding] | 85% |
| **Bash/Shell** | Functions, variables, source/import, pipelines | 85% |
| **VBA** | Modules, functions, procedures, types | 80% |
| **Batch/CMD** | Labels, CALL, SET, GOTO, subroutines | 75% |
| **Zig** | Functions, structs, comptime, error handling | 75% |

Polyglot projects work seamlessly — cross-language relationship analysis included.

---

## Architecture

**Multi-agent LiteRAG system** coordinated by `ConductorOrchestrator`:

- **ParserAgent** — AST parsing via native language parsers (14 languages)
- **IndexerAgent** — Graph indexing in SQLite with batching
- **SemanticAgent** — Vector embeddings, semantic search
- **QueryAgent** — Query optimization and execution
- **DoraAgent** — Complexity metrics and analysis
- **DevAgent** — Incremental indexing, file operations
- **MergeAgent** — Semantic 3-way merge

**Storage**: Unified libSQL (SQLite-compatible) with aggressive pragmas for write speed (11,300 entities/sec).

**70+ MCP tools** across categories: search, analysis, tracing, modification, validation, autodoc, git, history, merge, snapshots, metrics.

See [architecture.md](architecture.md) for full details.

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
node dist/index.js /path/to/project

# Tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint:fix
```

### System Requirements

**Minimum**: Node.js 24+, 2GB RAM, Dual-core CPU
**Recommended**: Node.js 24+, 8GB RAM, Quad-core CPU, SSD

### Configuration

Via YAML files (`config/default.yaml`) or environment variables:
- `MCP_EMBEDDING_PROVIDER` — embedding provider
- `MCP_USE_PARSER` — enable/disable ParserAgent
- `MCP_DEV_INDEX_BATCH` — indexing batch size

See [configuration.md](configuration.md) for all options.

---

## License

AGPL-3.0 — see [LICENSE](../LICENSE)
