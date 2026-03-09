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

**Storage**: Multi-DB native SQLite (better-sqlite3 / bun:sqlite) with staging tables for bulk indexing. See Storage Internals below.

**70+ MCP tools** across categories: search, analysis, tracing, modification, validation, autodoc, git, history, merge, snapshots, metrics.

See [architecture.md](architecture.md) for full details.

---

## Storage Internals (Native SQLite)

### Multi-DB Architecture (v6)

4 independent databases for parallel I/O: `graph.db`, `semantic.db`, `versioning.db`, `cache.db`.
All DBs: `journal_mode=OFF`, `synchronous=OFF`, `cache_size=-8192` (8 MB per DB).

### Staging Tables for Bulk Indexing

For bulk indexing (>500 files), entity inserts use **append-only staging tables** without PRIMARY KEY or indexes:

```
1. DROP indexes on main tables
2. CREATE staging_entities (no PK, no indexes) — heap table
3. INSERT into staging — O(1) per row, no B-tree page splits
4. ... repeat for all batches ...
5. INSERT OR REPLACE INTO entities SELECT * FROM staging_entities — merge
6. DROP staging tables
7. RECREATE indexes in one pass
```

**Key**: staging tables are heap-only (no B-tree), so INSERT is always O(1) regardless of table size. Main table indexes are rebuilt once at commit, not maintained during each INSERT.

### compactLocation

Entity `location` (SourceSpan) is serialized as compact string instead of JSON:

```
Compact: "12:4:156-25:1:380"    (~11 chars)
JSON:    {"start":{"line":12,"column":4,"index":156},"end":{"line":25,"column":1,"index":380}}  (~80 chars)
```

`parseLocation()` in `src/storage/libsql/entity-ops.ts` deserializes both formats (backwards-compatible). ~7x reduction in INSERT payload per entity.

### Batch Parameters

| Parameter | Value | Limit |
|-----------|-------|-------|
| `batchSize` | 1500 | SQLite max 32767 params / 17 columns = 1928 |
| `parallelBatches` (TEI) | 4 | Keeps GPU saturated during HTTP round-trip |

### Vendored Token Skip

Entities with `metadata.vendored=true` skip `name_tokens` table insertion. This significantly reduces token table writes for large C/C++ projects (e.g., Zig: 890K→325K entities, most vendored).

---

## Vendored/Generated Directory Detection

### Purpose

Large projects (Zig, LLVM, Chromium) contain vendored libraries with thousands of headers (libc, musl, glibc). These files should be **parsed** (for graph entity extraction) but **skip embedding generation** (to save TEI/GPU resources).

### How It Works

File: `src/agents/dev/vendored-detector.ts`

Detection runs automatically after `collectFiles` for projects with >500 files. Three heuristics:

**1. Known vendored path segments** — case-insensitive match against: `libc`, `libcxx`, `libcxxabi`, `libunwind`, `musl`, `glibc`, `ucrt`, `mingw`, `msvc`, `wasi-libc`, `compiler-rt`, `newlib`, `bionic`. Requires ≥50 files under the prefix.

**2. Architecture mirrors** — parent directory with 8+ subdirectories sharing 3+ common filenames across 50%+ of children. Detects patterns like `lib/libc/musl/{arch1,arch2,...}` where each arch has the same `.h` files.

**3. Mass headers** — 2-level directory prefix with >400 `.h`/`.hpp`/`.hxx` files and average LOC < 150 (sampled from 30 files). Catches auto-generated or bulk-imported header collections.

### Pipeline Integration

```
collectFiles → detectVendoredDirectories → vendoredPrefixes[]
                                              ↓
                            embeddingConfig.vendoredPrefixes (IPC to workers)
                                              ↓
                    Worker: isVendoredFile() → skip embedding generation
                    Worker: parseFast() for C/C++ vendored (regex-only, no clang)
                    Worker: filter out "constant" entities (#define)
                    Worker: mark remaining entities metadata.vendored=true
                                              ↓
                    entity-ops: skip name_tokens for vendored entities
```

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `detectVendoredDirectories()` | `vendored-detector.ts` | Main detection, returns prefixes |
| `isVendoredPath()` | `vendored-detector.ts` | Check relative path against prefixes |
| `isVendoredFile()` | `embedding-processor.ts` | Check absolute path, uses IPC config |
| `isSkipEmbeddingExtension()` | `vendored-detector.ts` | Always skip `.def`, `.inc` files |
| `parseFast()` | `cpp-native-parser.ts` | Regex-only C/C++ parsing (no clang spawn) |

### Impact (Zig benchmark)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Files for embedding | 17,061 | 3,597 | -78.9% |
| Entities | 890,000 | 325,000 | -63% |
| Graph flush | 50 sec | 4.2 sec | -92% |
| TEI throughput | 140 emb/s | 5,513 emb/s | +37x |
| **Total indexing** | **643 sec** | **47 sec** | **13.7x** |

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
