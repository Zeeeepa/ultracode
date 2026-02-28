# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UltraCode Server** - Multi-agent LiteRAG MCP server for advanced code graph analysis with semantic capabilities. The server implements 70+ MCP tools for analyzing codebases in 14 programming languages using an agent-based architecture.

## Build & Development Commands

```bash
# Build project
npm run build                 # Compile TypeScript via tsup
npm run build:watch          # Watch mode for development
make package                 # Build NPM package with metadata checks

# Code quality
npm run typecheck            # TypeScript type checking
npm run lint                 # Biome linting
npm run lint:fix             # Auto-fix lint errors
npm run format               # Code formatting via Biome

# Testing
npm test                     # Run all Jest tests
npm run test:verbose         # Verbose test output
npm run test:watch           # Watch mode for tests
npm run test:coverage        # Generate code coverage
npm run test:quiet           # Quiet mode (minimal output)

# Run MCP server
ultracode <directory>                    # Analyze codebase
ultracode --config config/dev.yaml <dir> # With custom configuration
ultracode --help                         # CLI help
ultracode --version                      # Server version

# One-shot indexing from CLI (debug)
node dist/index.js /path/to/project '{"jsonrpc":"2.0","id":"index-1","method":"tools/call","params":{"name":"index","arguments":{"directory":"/path/to/project","incremental":false,"fullScan":true,"reset":true}}}'
```

## Multi-Agent Architecture

The project uses a **multi-agent LiteRAG architecture** coordinated through `ConductorOrchestrator`:

### Key Agents
- **ParserAgent** (`src/agents/parser-agent.ts`) - AST parsing via native language parsers
- **IndexerAgent** (`src/agents/indexer-agent.ts`) - Graph indexing in SQLite, batch operations
- **SemanticAgent** (`src/agents/semantic-agent.ts`) - Vector embeddings, semantic search
- **QueryAgent** (`src/agents/query-agent.ts`) - Graph query execution, optimization
- **DoraAgent** (`src/agents/dora-agent.ts`) - Specialized metrics and complexity analysis
- **DevAgent** (`src/agents/dev-agent.ts`) - Incremental indexing, file operations
- **ConductorOrchestrator** (`src/agents/conductor-orchestrator.ts`) - Coordinator for all agents, task distribution

### Agent Coordination
- **ResourceManager** (`src/core/resource-manager.ts`) - Memory/CPU limit management, backpressure
- **KnowledgeBus** (`src/core/knowledge-bus.ts`) - Pub/sub bus for inter-agent communication
- **DIContainer** (`src/core/di-container.ts`) - Dependency Injection container for agent management
- **AgentRegistry** (`src/core/agent-registry.ts`) - Automatic agent registration in the DI container
- All agents inherit from `BaseAgent` (`src/agents/base.ts`) with a unified lifecycle

### Dependency Injection Container (NEW)

**DI Container** (`src/core/di-container.ts`) provides centralized dependency management:

**Features:**

- Singleton/Transient service lifetimes
- Circular dependency detection
- Type-safe agent resolution
- Automatic disposal on shutdown
- Global container instance

**Usage:**
```typescript
import { getGlobalContainer } from "./core/di-container.js";
import { registerAllAgents, getOrCreateAgent } from "./core/agent-registry.js";

// Initialize container and register all agents
const container = getGlobalContainer();
await registerAllAgents(container);

// Resolve agents through container
const devAgent = await getOrCreateAgent(container, conductor, AgentType.DEV);
const semanticAgent = await getOrCreateAgent(container, conductor, AgentType.SEMANTIC);
```

**Agent Registry** (`src/core/agent-registry.ts`) automatically registers all agents:
- DevAgent, SemanticAgent, DoraAgent, ParserAgent, IndexerAgent, QueryAgent
- Lazy initialization - agents are created only on first request
- Integration with ConductorOrchestrator

## Parser Worker Pool System

**Generic Language Worker Pool** for parallel file parsing:

**Architecture:**
- **SubprocessPool** (`src/agents/workers/parsing-subprocess-pool.ts`) - Subprocess pool management
- **GenericLanguageWorker** (`src/agents/workers/generic-language-worker.ts`) - Universal worker for all 10 languages
- Automatic pool size determination based on language parsing speed:
  - Python: 4 workers (slow: ~266ms/file)
  - TypeScript/JavaScript: 3 workers (medium: ~15-20ms/file)
  - Go/C: 2 workers (fast: ~10-15ms/file)

**Optimizations:**
- **Streaming Mode**: Workers send `streaming_result` after parsing each file, allowing the main process to index immediately
- **Parallel Data Files**: JSON/YAML processed via `Promise.all` with chunking
- **Lazy initialization**: Pools are created only for languages in use
- **Smart threshold**: Workers activate only for >50 files (prevents overhead)
- **Pool reuse**: Workers are reused between indexing sessions
- **Greedy Load Balancing**: Files sorted by size and assigned to the worker with minimal load (0% deviation)
- **Async Prefetch**: PrefetchManager reads the next 3 files in parallel with parsing (96-100% I/O overlap)
- **Parallel Pool Creation**: All language pools created via `Promise.all` (15ms vs 10+ sec)

**Performance (Centralized Embeddings + Optimized Chunks):**
- **ultracode (523 TS files):** **3.1 sec total** (~169 files/sec)
  - Parsing: ~2.6s (workersms), 18 chunks, 6 workers
  - Embeddings: centralized batching via Main process
  - **2.5x faster** vs decentralized (7.8s -> 3.1s)
- **TypeScript parsing speed:** **130-140 files/sec** (was 16 files/sec decentralized)
  - **8x speedup** with centralized embeddings (no HTTP contention)
- **Optimal chunk size:** 40 files/chunk (vs 100 default)
  - More chunks = workers finish at different times = less IPC contention
  - **-19% totalms** (3830ms -> 3100ms) compared to 100 files/chunk
- Data files (174 JSON/YAML): **34x speedup** (6.7s -> 195ms, **892 files/sec**)
- **91-95%** of files indexed via streaming
- DB write speed: **11,300 entities/sec** (journal_mode=OFF, synchronous=OFF)
- Worker load balance: **0% deviation** (was 70%/30%)
- I/O overlap ratio: **96-100%** (I/O latency hidden)

**Streaming Mode API:**
```typescript
// Enable streaming in ParserAgent
parserAgent.setStreamingMode(true, async (result, taskId, fileIndex, totalFiles) => {
  // Index immediately as results arrive
  await indexerAgent.indexEntities(result.entities, result.filePath, result.relationships);
});
```

**Configuration** (`config/production.yaml`):
```yaml
parser:
  agent:
    batchSize: 50          # Batch size for worker pool
    workerPoolSize: 4      # Number of worker threads
```

### .ultracodeignore

The `.ultracodeignore` file in the project root allows excluding files from indexing:

```gitignore
# Comments start with #
**/lib/java/**       # Exclude directory
**/go-ast-cli.go     # Exclude specific file
**/test-fixtures/**  # Test fixtures
```

**Syntax:**
- Gitignore-style glob patterns (`**/`, `*.ext`)
- Comments start with `#`
- Empty lines are ignored
- Patterns without glob characters are automatically wrapped in `**/{pattern}/**`

**Files:**
- `src/agents/dev/file-collector.ts` - `loadIgnoreFile()` function
- Patterns are merged with base `excludePatterns` from configuration

## Language Parsers

Language support via **native parsers** (`src/parsers/`):

### Priority 0: TypeScript/JavaScript (in-process)
- **TypeScript Compiler API** - full typing, resolution, semantics
- `ts.createSourceFile()` for fast syntactic parsing
- `ts.createProgram()` + `TypeChecker` for full analysis with types
- `@angular/compiler` for Angular templates and components

### Priority 1: Python (subprocess)
- **Python `ast` module** - `python -c "import ast; ..."` for basic AST
- **Pyright** (optional) - full type inference via `npx pyright`
- Requirements: Python 3.8+

### Priority 2: Java/Kotlin (JAR)
- **JavaParser** - `java -jar javaparser-cli.jar` for Java AST
- **kotlin-compiler-embeddable** for Kotlin
- Requirements: JRE 11+

### Priority 3: Other languages
- **Go**: `go/parser` standard library
- **Rust**: `syn` + `rust-analyzer`
- **C/C++**: `clang -Xclang -ast-dump=json`
- **Swift**: SwiftSyntax / SourceKit

Language configuration: `src/parsers/language-configs.ts`

**Philosophy**: A developer working with code in language X **always has** the X runtime/compiler installed.
This eliminates issues with NODE_MODULE_VERSION, C++ compilation, and 28MB prebuilds.

### Enhanced Parser Data (NEW)

TypeScript, Python, and Kotlin parsers extract enhanced data for semantic search:

**Extracted data:**
- **calls** - function/method call graph with target, argumentCount, isAwait
- **controlFlow** - branches (if/switch), loops (for/while), exceptions (try/catch), await points
- **complexity** - cyclomatic, cognitive, linesOfCode, nestingDepth
- **documentation** - JSDoc/docstrings with description, params, returns, examples, deprecated
- **typeReferences** - used types (for dependency analysis)

**Usage in semantic_search:**
```typescript
// Find complex code with high cyclomatic complexity
semantic_search({ query: "data processing", minCyclomatic: 10 })

// Find async code without error handling
semantic_search({ query: "API calls", hasAwaits: true, hasExceptions: false })

// Find undocumented public API
semantic_search({ query: "export function", hasDocumentation: false })

// Find code with many calls (potential hotspots)
semantic_search({ query: "", minCallCount: 20 })
```

**Vectorization:**
All this data is included in the embedding text for improved semantic matching:
- Descriptions from documentation
- Names of called functions
- Complexity information (for complex code)
- Control flow information (branches, loops, exceptions, awaits)

## Cross-Project Support (NEW)

The MCP server supports working with **multiple projects** simultaneously, each with its own isolated databases.

### Architecture

```
%LOCALAPPDATA%\UltraCode\
├── config/
│   └── semantic-config.json       # Global configuration
└── projects/
    ├── {hash1}/                   # Project 1 (hash of path)
    │   ├── graph.db               # Entity graph
    │   ├── vectors.db             # Embeddings
    │   └── meta.json              # Project metadata
    └── {hash2}/                   # Project 2
        ├── graph.db
        ├── vectors.db
        └── meta.json
```

### Usage

**Switching via `index`:**
```typescript
// Indexing another project automatically switches context
index({ directory: "D:\\other\\project" })
```

**Searching in another project via `projectPath`:**
```typescript
// semantic_search supports projectPath for cross-project search
semantic_search({
  query: "authentication",
  projectPath: "D:\\other\\project"
})
```

### Key Components

- **ProjectContextManager** (`src/shared/project-context.ts`) - Singleton for project context management
- **getProjectSQLiteManager** (`src/storage/sqlite-manager.ts`) - Get SQLiteManager for a specific project
- **switchGlobalProjectContext** (`src/index.ts`) - Switch global context between projects
- **resetGraphStorage** (`src/storage/graph-storage-factory.ts`) - Reset GraphStorage cache on switch

### Behavior

1. When specifying `directory` in `index` or `projectPath` in `semantic_search`:
   - The database for the specified project is automatically created/opened
   - Global context switches to the new project
   - All subsequent operations work with that project's data

2. Each project's data is **fully isolated** - changes in one project do not affect another

3. When switching back to a previous project, its data is preserved and available

### Example Workflow

```typescript
// 1. Index the main project
index({ directory: "D:\\work\\main-project" })
// -> Context: main-project, 8000 entities

// 2. Switch to another project for analysis
index({ directory: "D:\\work\\other-project" })
// -> Context: other-project, 50000 entities

// 3. Search in other-project
semantic_search({ query: "newsletter" })
// -> Results from other-project

// 4. Return to the main project
index({ directory: "D:\\work\\main-project", incremental: true })
// -> Context: main-project, data preserved
```

## GPU/CUDA Worker Architecture (v2.5)

CUDA operations are offloaded to a separate worker process for isolation and stability:

### Architecture

```
Main Process (MCP Server)
    |
GPU Backend Selector
    |
+------------------------------------------+
|  GPU Worker Subprocess                   |
|  +-- CUDA Backend (RTX/GTX)             |
|  +-- Dawn/WebGPU Backend (cross-platform)|
|  +-- WASM SIMD Fallback                 |
+------------------------------------------+
```

### Components

- **`src/gpu/backend-selector.ts`** - GPU backend selection by availability
- **`src/gpu/backends/cuda-backend.ts`** - Native CUDA addon for NVIDIA
- **`src/gpu/backends/gpu-worker-backend.ts`** - Worker subprocess for isolation
- **`external-tools/native/cuda/`** - C++ CUDA addon source files

### Features

- **Crash isolation**: GPU errors do not crash the main MCP process
- **Blackwell detection**: CC >=12.0 automatically falls back to WASM SIMD
- **Windows `windowsHide`**: Hidden console windows for subprocesses
- **Graceful fallback**: CUDA -> Dawn WebGPU -> WASM SIMD -> Pure JS

### Native Modules

```
external-libs/
├── cuda-win32-x64/ultracode_cuda.node
├── cuda-linux-x64/ultracode_cuda.node
├── dawn-win32-x64/*.node
└── dawn-linux-x64/*.node
```

### Building the CUDA Module

```bash
npm run build:cuda        # Windows PowerShell
npm run build:cuda:debug  # Debug build
npm run build:cuda:clean  # Clean rebuild
```

Requirements: CUDA Toolkit 12.x, cmake-js, node-addon-api

## Storage Layer

**libSQL-based unified storage** (`src/storage/`):

- **GraphStorageLibSQL** (`graph-storage-libsql.ts`) - main interface for entities/relationships/vectors
- **LibSQLGraphAdapter** (`libsql-graph-adapter.ts`) - adapter for libSQL/Turso
- **BunSQLiteAdapter** (`bun-sqlite-adapter.ts`) - adapter for Bun native SQLite
- **VectorStore** (`src/semantic/vector-store.ts`) - integration for semantic search
- **GraphStorageFactory** (`graph-storage-factory.ts`) - factory for creating storage

**Unified storage** (`project.db`):
- Entities and relationships
- Vector embeddings (vectors table)
- **Aggressive pragmas** for maximum write speed:
  - `journal_mode = OFF` - no journal (data can be regenerated)
  - `synchronous = OFF` - no fsync (11,300 entities/sec)
- Turso edge database support

## Semantic Search & Embeddings

Modular embedding provider system (`src/semantic/providers/`):

### Providers and Performance

| Provider | File | Time/request | Batch | Recommendation |
|----------|------|-------------|-------|----------------|
| **ovms-native** | `ovms-provider.ts` | **0.8-2ms** | Native | CPU/NPU, recommended |
| **vllm** | `vllm-provider.ts` | 1-3ms | Native | NVIDIA GPU Production |
| **tei** | `tei-provider.ts` | 5-15ms | Native | Alternative to OVMS |
| **ollama** | `ollama-provider.ts` | 10-50ms | No | Easy setup |
| **openai** | `openai-provider.ts` | 50-200ms | Yes | Cloud API |
| **huggingface** | `huggingface-provider.ts` | 100-500ms | No | Cloud API |

### OVMS Provider (v2.5 - Recommended)

**OVMS (OpenVINO Model Server)** - recommended embedding provider:

**Variants:**
- `ovms-native` - local OVMS binary, automatic lifecycle management
- `vllm` - Docker container vLLM for NVIDIA GPU (high performance)

**Files:**
- `src/semantic/providers/ovms-provider.ts` - provider for V3/V2 API
- `src/semantic/providers/ovms-grpc-client.ts` - gRPC client for V2 API
- `src/semantic/ovms-native-manager.ts` - lifecycle management of the OVMS process

**Features:**
- V3 OpenAI-compatible API (`/v3/embeddings`) - batch requests, base64 encoding
- V2 API fallback (`/v2/models/{model}/infer`) for legacy models
- Automatic OVMS process termination on shutdown (taskkill /T on Windows)
- Model support: jina-embeddings-v3, bge-m3, multilingual-e5-large

**Configuration:**
```yaml
embedding:
  platform: "ovms-native"  # or "vllm" for NVIDIA GPU
  ovms:
    endpoint: "http://127.0.0.1:8083"  # Native: 8083, Docker: 8082
    batch_size: 200
    ovms_mini_batch: 8
    target_device: "CPU"  # CPU, GPU, NPU
    useEmbeddingsApi: true  # V3 API
    encodingFormat: "base64"
```

### OpenVINO Provider (Legacy)

Local CPU provider with native batch inference:

```typescript
// File: src/semantic/providers/openvino-provider.ts
// Models: all-MiniLM-L6-v2, bge-small-en-v1.5, multilingual-e5-small
// Devices: CPU, GPU, AUTO (NPU not supported)
```

**Installation:**
```bash
bun add openvino-node @xenova/transformers
```

### Benchmark of English Models - Large Entities (RTX 5090 + i9)

**Benchmark on 100 entities (largest: SemanticAgent 1253 lines) with Smart Chunker:**

#### Embedding Models (Real benchmarks 2025-12-07)

| Rank | Provider | Model | Chunks/s | ms/chunk | tok/s | Context | Recommendation |
|------|----------|-------|----------|----------|-------|---------|----------------|
| 1 | **OpenVINO CPU** | all-MiniLM-L6-v2 | **474** | **2.1ms** | **80,507** | 256 | Fastest overall |
| 2 | OpenVINO CPU | paraphrase-multilingual | 161 | 6.2ms | 16,089 | 128 | 50+ languages |
| 3 | **Ollama GPU** | granite-embedding:30m | **123** | **8.1ms** | **34,685** | 512 | Fast Ollama |
| 4 | OpenVINO CPU | gte-small | 87 | 11.5ms | 24,400 | 512 | Quality |
| 5 | OpenVINO CPU | multilingual-e5-small | 69 | 14.6ms | 19,290 | 512 | 94 languages |
| 6 | **Ollama GPU** | snowflake-arctic-embed2 | **15** | **65.4ms** | **9,968** | 8192 | Best 8K |
| 7 | Ollama GPU | nomic-embed-text | 2 | 580.8ms | 1,123 | 8192 | Very slow |

**Key takeaways:**
- **OpenVINO MiniLM** - absolute leader (474 chunks/s, 80K tok/s, CPU only!)
- **Ollama Granite:30m** - best Ollama for development (123 chunks/s)
- **Snowflake Arctic** - best for 8K context (15 chunks/s, full class embedding)
- **Nomic Embed** - NOT RECOMMENDED (2 chunks/s, very slow)

**Recommendations:**
- **Development (fast indexing)**: OpenVINO + all-MiniLM-L6-v2 (474 chunks/s)
- **Production (large classes)**: Ollama + snowflake-arctic-embed2 (8K context)
- **Multilingual code (RU/CN)**: OpenVINO + multilingual-e5-small (69 chunks/s)
- **Simple setup**: Ollama + granite-embedding:30m (123 chunks/s)

**OpenVINO limitations:**
- Intel NPU is not supported for BERT models (masked_fill/Select)

### LLM Models for AutoDoc (documentation generation)

Configuration: `config/llm-models.json`

#### LLM Benchmark (2025-12-07, SemanticAgent 1253 lines)

| Model | Provider | Size | tok/s | TTFT | Total | Output | Quality |
|-------|----------|------|-------|------|-------|--------|---------|
| **qwen3-coder:30b** | Ollama | 18GB | 12 | 32.87s | 75.6s | 3638 chars | Excellent |
| deepseek-coder:6.7b | Ollama | 3.8GB | 10 | 12.71s | 51.3s | 1966 chars | Good |

#### OpenVINO LLM Models (config/llm-models.json)

| Model | Size | Context | CPU Speed | Recommendation |
|-------|------|---------|-----------|----------------|
| **Qwen2.5-Coder-7B INT4** | 4GB | 32K | ~10 tok/s | Best for code |
| **Phi-4-mini INT4** | 2.5GB | 16K | ~20 tok/s | Fast + quality |
| **Phi-3-mini-128K INT4** | 2GB | 128K | ~18 tok/s | Ultra long context |
| **Qwen2.5-0.5B GGUF** | 350MB | 32K | ~90 tok/s | Ultra compact |
| **Qwen3-4B NPU INT4** | 2.5GB | 8K | ~22 tok/s NPU | NPU optimized |

**Selection recommendations:**
- **Best Quality**: `qwen3-coder:30b` - comprehensive docs (12 tok/s, 18GB VRAM)
- **Faster**: `deepseek-coder:6.7b` - 2x faster TTFT (10 tok/s, 4GB VRAM)
- **Limited memory (<4GB)**: `Qwen2.5-0.5B` via GGUF - 350MB, 90 tok/s
- **NPU (Intel Core Ultra)**: `Qwen3-4B` - official optimization, ~15W

**OpenVINO 2025.4 features:**
- **Qwen3-Embedding-0.6B** - new embedding model for RAG
- **Qwen3-30B-A3B MoE** - 30B quality at 3B speed
- **Gemma-3-4B NPU** - new NPU support
- **Mistral-Small-24B** - Jan 2025 release
- Direct GGUF file support (no conversion needed)
- NPU context up to 10K tokens (was 8K)
- Structured output with XGrammar
- Tool calling + parsers for agentic AI
- Prefix caching for chat history
- See `.autodoc/known-issues.md`

Provider is selected via `config/default.yaml`, CLI setup, or `MCP_EMBEDDING_PROVIDER` env.

## Configuration System

**YAML-based configuration** (`config/`):
- `default.yaml` - base settings
- `development.yaml` - development settings
- `production.yaml` - production optimizations
- `cloud_prod.yaml` - cloud-specific settings

Configuration is loaded via `ConfigLoader` (`src/config/yaml-config.ts`) with env variable support:
- `MCP_EMBEDDING_PROVIDER` - embedding provider
- `MCP_USE_PARSER` - enable/disable ParserAgent
- `MCP_DEV_INDEX_BATCH` - batch size for indexing
- `MCP_DEBUG_DISABLE_SEMANTIC` - disable semantic agent (for debugging)

## Swagger/OpenAPI Integration

Automatic linking of Swagger/OpenAPI specifications with project code.

### Architecture

When indexing a project with swagger JSON files:

1. **json-parser.ts** parses swagger and creates entities with `metadata.swaggerType` (`api_spec`, `endpoint`, `schema`, `tag`) and `metadata.isApiContract: true`
2. **swagger-code-linker.ts** (post-indexing step) links swagger with code:
   - Producers: controllers -> swagger endpoints (`PRODUCES_API`)
   - Consumers: generated clients -> swagger endpoints (`CONSUMES_API`)
   - Generated types: TS/C# types -> swagger schemas (`GENERATED_FROM`)
3. **swagger-usage-detector.ts** determines which swagger files are actually used (multi-signal scoring)

### New RelationType

```typescript
RelationType.PRODUCES_API    // Controller -> Swagger endpoint
RelationType.CONSUMES_API    // Generated client -> Swagger endpoint
RelationType.GENERATED_FROM  // Generated type -> Swagger schema
```

### Supported Frameworks

**API Producers**: NestJS, Express/Fastify, Spring Boot, .NET (Swashbuckle, Microsoft.OpenApi)
**Code Generators**: openapi-generator-cli, NSwag, swagger-codegen, Autorest, Refitter, ng-openapi-gen

### Key Files

```
src/parsers/swagger/types.ts              - Types for swagger analysis
src/parsers/swagger/swagger-code-linker.ts - Swagger <-> code linking
src/parsers/swagger/index.ts              - Module exports
src/analysis/swagger-usage-detector.ts     - Active swagger file detection
```

### Enrichment of Existing Tools

- **analyze_code_impact**: added `contractImpact` section when swagger links exist
- **analyze_swagger_impact**: new tool for analyzing the impact of swagger changes
- **modify_code**: warnings when modifying controllers/generated code (`swaggerImpact`)
- **trace_flow/trace_backwards**: `crossesApiContract` annotations when crossing API boundaries
- **get_graph_health**: detection of swagger desynchronization with generated code

### Zero Overhead

All swagger modules are lazy-loaded and protected by `metadata.swaggerType` checks in the graph. Projects without swagger files have zero overhead.

## MCP Tools Structure

30+ MCP tools implemented in `src/index.ts` + `src/tools/`:

**Core indexing:**
- `index` - codebase indexing
- `clean_index` - full re-indexing
- `reset_graph` - graph cleanup

**Graph queries:**
- `get_graph` - get entity graph
- `list_entity_relationships` - entity relationships
- `get_members` - list entities in a file (UltrasharpTools-compatible name)
- `query` - universal graph query
- `get_graph_health` - database diagnostics
- `get_graph_stats` - graph statistics

**Code Modification:**
- `modify_code` - entity code modification (UltrasharpTools-compatible name)
- `create_file` - create file with auto-parse into graph
- `rename_symbol` - rename symbol with reference updates
- `add_member` - add member to class/interface
- `copy_file` - copy file with graph update
- `rename_file` - rename file with import updates
- `split_file` - split file into parts
- `synthesize_files` - merge files

**Code Validation:**
- `validate_file` - file validation (ESLint/Pylint)
- `validate_directory` - batch directory validation

**Semantic analysis:**
- `semantic_search` - semantic code search with rich metadata
  - **Filters**: minCyclomatic, maxCyclomatic, hasExceptions, hasLoops, hasAwaits, hasDocumentation, isDeprecated, minCallCount
  - **Returns**: complexity metrics, control flow info, call counts, documentation status
- `find_duplicates` - duplicate search (semantic, UltrasharpTools-compatible name)
- `jscpd_detect_clones` - JSCPD-based duplicate search (no embeddings)
- `find_similar_code` - similar code search
- `suggest_refactoring` - AI refactoring
- `pattern_search` - advanced search (entity/content/semantic/hybrid)

**Advanced analysis:**
- `analyze_code_impact` - change impact analysis
- `analyze_hotspots` - hotspot search (complexity/changes/coupling)
- `find_related_concepts` - related concepts search
- `cross_language_search` - cross-language search
- `analyze_state_chaos` - state management chaos analysis
- `analyze_swagger_impact` - Swagger/OpenAPI specification change impact analysis
- `detect_technology_stack` - technology stack detection
- `lerna_project_graph` - Lerna workspace dependency graph

**Version Management:**
- `create_snapshot` - create snapshot for rollback
- `undo` - rollback to snapshot (UltrasharpTools-compatible name)
- `list_snapshots` - list available snapshots
- `cleanup_snapshots` - clean up old snapshots

**Branch Management:**
- `list_branches` - list indexed branches
- `switch_branch` - switch active branch
- `get_branch_status` - current branch status
- `cleanup_branches` - clean up old branches (LRU)
- `get_changed_files` - changed files between branches

**History (Prolly Tree):**
- `list_commits` - list graph commits (versioned snapshots)
- `get_entity_history` - entity change history by commits
- `diff_commits` - compare two graph versions
- `checkout_commit` - time travel - view graph at a specific commit

**Tracing (static flow analysis):**
- `trace_flow` - execution tracing from A to B with state analysis
- `trace_backwards` - reverse tracing (why is a method not called?)
- `trace_data_flow` - data flow tracing to target state
- `analyze_state_impact` - state impact analysis across scenarios
- `find_decision_points` - find all decision points

**Monitoring:**
- `get_version` - server version
- `get_metrics` - system metrics
- `get_agent_metrics` - agent metrics
- `get_bus_stats` - knowledge bus statistics
- `clear_bus_topic` - clear bus topic

## Testing Infrastructure

**Jest-based testing** with ES modules support:

```bash
# Tests are located in
tests/                   # Main integration tests
src/**/__tests__/        # Unit tests alongside code
tests/fixtures/          # Test data

# Test configuration
jest.config.js           # Jest config with ESM support
jest.setup.js            # Global mocks and setup
tsconfig.test.json       # TypeScript config for tests
```

Features:
- `maxWorkers: 1` - tests run sequentially (SQLite constraints)
- Mocks: `src/__mocks__/` - nanoid, p-limit, connection-pool
- Coverage threshold: aim to maintain current coverage level

## Key Architectural Patterns

1. **Multi-agent coordination**: tasks are delegated via `ConductorOrchestrator` to specialized agents
2. **Provider pattern**: embeddings via `EmbeddingProvider` abstraction with multiple implementations
3. **Singleton storage**: `SQLiteManager`, `GraphStorage` via factory for consistency
4. **Pub/Sub bus**: `KnowledgeBus` for asynchronous agent communication
5. **Backpressure handling**: `AgentBusyError` with `retryAfterMs` hints when agents are overloaded
6. **Deterministic IDs**: SHA256-based stable IDs for entities/relationships

## Working with Native Modules

**better-sqlite3** - native module, requires rebuild on `NODE_MODULE_VERSION` mismatch:

```bash
# Automatic rebuild starting from v2.6.4
# If manual rebuild is needed:
npm rebuild better-sqlite3
```

**sqlite-vec extension** - optional vector search acceleration:
- Automatically enabled if available
- Graceful fallback to pure SQLite if unavailable

## Common Development Tasks

**Adding a new language:**
1. Identify the native parser for the language (compiler API, CLI tool, LSP)
2. Create an analyzer in `src/parsers/<lang>-analyzer.ts`
3. Add config to `src/parsers/language-configs.ts`
4. Add tests to `tests/parsers/`
5. Update README with runtime requirements

**Adding a new MCP tool:**
1. Define schema in `src/index.ts` (zod schema)
2. Add handler in switch case (line ~1000+)
3. Implement logic in `src/tools/` if complex
4. Add integration test
5. Update README.md with tool description

**Adding a new embedding provider:**
1. Create class in `src/semantic/providers/<name>-provider.ts`
2. Implement `EmbeddingProvider` interface
3. Register in `src/semantic/providers/factory.ts`
4. Add tests to `src/semantic/__tests__/`

## Performance Considerations

- **Batching**: use `BatchOperations` for bulk inserts (1000+ records)
- **Incremental parsing**: enabled by default via `IncrementalParser` (LRU cache of 1000 files)
- **Query optimization**: `QueryOptimizer` automatically optimizes complex queries
- **Connection pooling**: connection pool for parallel read operations
- **Agent limits**: configure `maxConcurrency` in config to balance performance/memory

## Troubleshooting

**"Native module mismatch"**: see above about better-sqlite3 rebuild

**"Legacy database missing columns"**: delete `vectors.db` for clean rebuild or run migrations

**"Agent saturation"**: increase `maxConcurrent` in config or handle `AgentBusyError` with retry

**"JSCPD not finding duplicates"**: check `minLines`/`minTokens` parameters, JSCPD requires at least 5 lines

**"Semantic search not working"**: check `MCP_EMBEDDING_PROVIDER` env and settings in `config/default.yaml`

**"Language runtime not found"**: Native parsers require the installed language runtime:
- TypeScript/JS: Node.js (already present)
- Python: `python --version` (3.8+)
- Java/Kotlin: `java --version` (JRE 11+)
- Go: `go version` (1.18+)

**"OpenVINO dependencies not installed"**: Install dependencies:
```bash
bun add openvino-node @xenova/transformers
# Verify: node -e "require('openvino-node')"
```

**"OpenVINO NPU not working"**: NPU does not support BERT models (masked_fill/Select limitation). Use CPU:
```bash
bunx ultracode setup --provider openvino
# Select CPU device
```

**"OpenVINO batch reshape failed"**: Some models do not support dynamic batch. The provider automatically falls back to sequential inference.

## Bun Runtime Support

The project supports **Bun runtime** with automatic use of optimized APIs:

### Runtime Utilities (`src/utils/`)

| Module | Description | Bun optimization |
|--------|-------------|------------------|
| `runtime.ts` | Runtime detection (Bun/Node/Deno), feature flags | - |
| `file-ops.ts` | File operations | `Bun.file()`, `Bun.write()` |
| `shell.ts` | Shell commands, Git helpers | `Bun.$` API |
| `glob.ts` | Glob file search | `Bun.Glob` |

### Usage

```typescript
// Runtime detection
import { runtime, features } from "./utils/runtime.js";
if (runtime.isBun) { /* Bun-specific code */ }

// Optimized file ops
import { readText, writeFile, readJSON } from "./utils/file-ops.js";
const content = await readText("./file.txt");  // Uses Bun.file() under Bun

// Shell commands
import { exec, gitDiff, countFiles } from "./utils/shell.js";
const result = await exec("git status", { cwd: "/project" });

// Glob
import { glob, match } from "./utils/glob.js";
const files = await glob("**/*.ts", { cwd: "./src" });
```

### SQLite Support

`src/storage/sqlite-adapter.ts` already supports `bun:sqlite`:
- Automatic selection between `better-sqlite3` (Node) and `bun:sqlite` (Bun)
- API compatibility via `BunDatabaseAdapter`
- Similar SQLite performance (I/O bound)

### Benchmark Results (Node.js vs Bun)

| Operation | Speedup |
|-----------|---------|
| File Read | **1.3-1.8x** faster |
| fileExists | **3.8x** faster |
| stat | **1.4x** faster |
| readdir | **1.4x** faster |
| glob | **1.4-1.6x** faster |
| writeFile (small) | ~same |
| writeFile (>50KB, FileSink) | **3-4x faster** |
| Startup time | **1.5-1.8x** faster |
| HTTP fetch | **1.7x** faster |
| SHA-256 (CryptoHasher) | **2.8x** faster |

**Overall result**: Bun is faster in most operations, especially with FileSink for large files.

Running the benchmark:
```bash
npx tsx scripts/benchmark-runtime.ts  # Node.js
bun scripts/benchmark-runtime.ts       # Bun
npx tsx scripts/compare-benchmarks.ts  # Comparison
```

### Documentation

See `.autodoc/development.md` for Bun optimization details.

## Code Style

- **TypeScript strict mode** enabled (`tsconfig.json`)
- **Biome** for linting and formatting (`.biome.json`)
- **Naming conventions**: kebab-case files, PascalCase classes, camelCase variables
- **Git hooks**: pre-commit runs `lint-staged` + `typecheck`

## Important Files

```
src/index.ts                          - MCP server entry point, tool definitions
src/agents/conductor-orchestrator.ts  - Multi-agent coordinator
src/storage/graph-storage.ts          - Graph database interface
src/semantic/embedding-generator.ts   - Embedding pipeline
src/parsers/typescript-parser.ts      - TypeScript Compiler API parser
src/parsers/python-parser.ts          - Python ast parser (subprocess)
src/parsers/java-parser.ts            - JavaParser integration
config/default.yaml                   - Default configuration
package.json                          - Scripts and dependencies
tsup.config.ts                        - Build configuration (externals)
```

## Logs & Debugging

### New Logging System (v3.0+)

**Fixed-position format** for convenient parsing:

```
20260107-143045.123 I 12345 a1b2c3d4 PARSER               file_parsed          file=/src/index.ts dur=45ms
```

**Usage in code:**
```typescript
import { log } from "../logging/index.js";

log.i("PARSER", "file_parsed", { file: "index.ts", dur: 45 });
log.e("INDEXER", "batch_failed", { err: "timeout", retry: 2 });
log.w("EMBEDDING", "rate_limited", { wait: 1000 });
log.d("STORAGE", "cache_hit", { key: "abc123" });
log.t("QUERY", "sql_exec", { rows: 150 });
```

**Full documentation**: [.autodoc/configuration.md](../.autodoc/configuration.md)

### CLI: ulog (log analysis)

```bash
# Installation (after build)
npm link

# Basic usage
ulog logs/mcp-server.log              # All logs
ulog -l E,W logs/                     # Only ERROR and WARN
ulog -m PARSER logs/server.log        # Only PARSER module
ulog -m "EMBED*" logs/                # Modules starting with EMBED

# Time filter
ulog --from 1h logs/server.log        # Last hour
ulog --from 30m logs/                 # Last 30 minutes
ulog --from "20260107-1400" logs/     # From specific time
ulog -t 15m logs/server.log           # Short form of --from

# KV parameter filter
ulog -k "dur>100" logs/server.log     # Operations longer than 100ms
ulog -k "err=*" logs/                 # All entries with errors
ulog -k "retry>1" logs/               # With retries

# Output
ulog --stats logs/server.log          # Statistics by level/module
ulog -c logs/server.log               # Count only
ulog -f logs/server.log               # Follow mode (tail -f)
ulog -o json logs/server.log          # JSON format
ulog --fields "ts,module,err" logs/   # Only specified fields

# Combined filters
ulog -l E -m PARSER --from 1h -k "dur>50" logs/
```

### Log Locations

```
Windows: %LOCALAPPDATA%\UltraCode\logs\mcp-server-YYYY-MM-DD.log
Linux:   ~/.local/share/ultracode/logs/mcp-server-YYYY-MM-DD.log
macOS:   ~/Library/Application Support/ultracode/logs/mcp-server-YYYY-MM-DD.log
```

### read-logs.ps1 Script (recommended)

**IMPORTANT**: Use this script instead of manual PowerShell commands!

```powershell
# From project root:
.\scripts\read-logs.ps1 PERFORMANCE          # PERFORMANCE logs (last 50)
.\scripts\read-logs.ps1 ERROR                # ERROR and FATAL
.\scripts\read-logs.ps1 PERFORMANCE -Lines 100   # More lines
.\scripts\read-logs.ps1 -Stats               # Statistics by category
.\scripts\read-logs.ps1 PERFORMANCE -Date 2025-12-24  # Specific date

# Example -Stats output:
# By Level:
#   DEBUG         11801
#   INFO           4852
#   FATAL             3
# By Subcategory:
#   EMBEDDING          12503
#   PERFORMANCE         3499
#   CRASH                  3
```

### Quick Log Search (PowerShell)

```powershell
# Find today's log
$log = "$env:LOCALAPPDATA\UltraCode\logs\mcp-server-$(Get-Date -Format 'yyyy-MM-dd').log"

# Show last 100 lines
Get-Content $log -Tail 100

# Search by pattern
Select-String -Path $log -Pattern "PERFORMANCE|ERROR|FATAL" | Select-Object -Last 50

# Only PERFORMANCE logs
Select-String -Path $log -Pattern "PERFORMANCE" | Select-Object -Last 30

# Search for errors
Select-String -Path $log -Pattern "ERROR|FATAL|crash" -CaseSensitive:$false

# Statistics by category
Select-String -Path $log -Pattern "^\[.*\] \[(\w+)\]" |
  ForEach-Object { $_.Matches.Groups[1].Value } |
  Group-Object | Sort-Object Count -Descending
```

### PERFORMANCE Logs (embedding phases)

Format: `[PERFORMANCE] <PHASE> | entities: N | ms: X | speed: X/s`

| Phase | Description |
|-------|-------------|
| `1_FILE_READ` | Reading files and computing content hash |
| `2_COMMENT_EXTRACT` | Extracting comments from files |
| `3_TEXT_BUILD` | Building texts for embedding |
| `4_EMBEDDING_GEN` | Generating embeddings via TEI/OVMS |
| `5_DB_INSERT` | Inserting into vector store |
| `6_INDEX_REBUILD` | Rebuilding index (bulk mode) |
| `BATCH_COMPLETE` | Batch summary (50 entities) |
| `QUEUE_COMPLETE` | Full queue summary |

**Example output:**
```
[PERFORMANCE] 1_FILE_READ       | entities: 50 | ms: 12  | speed: 4166/s
[PERFORMANCE] 2_COMMENT_EXTRACT | entities: 50 | ms: 8   | speed: 6250/s
[PERFORMANCE] 3_TEXT_BUILD      | entities: 50 | ms: 3   | speed: 16666/s
[PERFORMANCE] 4_EMBEDDING_GEN   | entities: 50 | ms: 45  | speed: 1111/s
[PERFORMANCE] 5_DB_INSERT       | entities: 50 | ms: 15  | speed: 3333/s
[PERFORMANCE] BATCH_COMPLETE    | entities: 50 | totalMs: 83 | speed: 602/s
```

**Performance analysis:**
```powershell
# Average embedding speed
Select-String -Path $log -Pattern "4_EMBEDDING_GEN.*speed: (\d+)" |
  ForEach-Object { [int]$_.Matches.Groups[1].Value } |
  Measure-Object -Average -Maximum -Minimum

# Overall queue speed
Select-String -Path $log -Pattern "QUEUE_COMPLETE.*speed: (\d+)" |
  ForEach-Object { $_.Line }
```

### Logging Levels

Configuration in `config/default.yaml`:
```yaml
logging:
  level: info        # trace, debug, info, warn, error
  fileLevel: debug   # file level (usually lower)
  maxFiles: 7        # log rotation
  maxSizeMB: 50      # max file size
```

## Documentation References

See detailed documentation:
- [README.md](../README.md) - Full feature description
- [.autodoc/configuration.md](../.autodoc/configuration.md) - Logging, limits, timeouts
- [.autodoc/backlog.md](../.autodoc/backlog.md) - Roadmap and open tasks
- [.autodoc/benchmarks.md](../.autodoc/benchmarks.md) - Model and provider benchmarks
- [.autodoc/known-issues.md](../.autodoc/known-issues.md) - Known issues (Bun, NPU, GPU)
- [.autodoc/multiprocess.md](../.autodoc/multiprocess.md) - Multi-process architecture
