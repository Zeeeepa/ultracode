# Ultracode → Zig: Feasibility Assessment

> **Date:** 2026-03-01
> **Scope:** Full rewrite of ultracode MCP server from TypeScript to Zig
> **Exclusions:** Roslyn (.NET addon) — remains .NET

---

## Table of Contents

1. [Project Inventory](#1-project-inventory)
2. [Zig Ecosystem Library Mapping](#2-zig-ecosystem-library-mapping)
3. [Component-by-Component Assessment](#3-component-by-component-assessment)
4. [Target Architecture](#4-target-architecture)
5. [Claude Code Integration](#5-claude-code-integration)
6. [Performance Expectations](#6-performance-expectations)
7. [CUDA / GPU Acceleration](#7-cuda--gpu-acceleration)
8. [Database Strategy](#8-database-strategy)
9. [Migration Strategy](#9-migration-strategy)
10. [Risk Assessment](#10-risk-assessment)
11. [Partial Rewrite Alternative](#11-partial-rewrite-alternative)

---

## 1. Project Inventory

### Scale

| Metric | Value |
|--------|-------|
| Total TypeScript LOC | ~265,000 (183K excluding generated parsers) |
| Source files | 577 `.ts` files |
| MCP tools exposed | 74 |
| Subsystems | 16 major |
| Dependencies (npm) | 32 runtime packages |
| Version | 5.0.0 |

### Subsystem Breakdown (by LOC)

| Subsystem | LOC | Files | Description |
|-----------|-----|-------|-------------|
| `generated/` | 81,908 | 17 | Auto-generated parser grammars (Java, Kotlin, Rust) |
| `parsers/` | 46,440 | 143 | Multi-language code parsing (TS/JS, Python, Java, Kotlin, Go, Rust, C++, Swift, Bash) |
| `semantic/` | 20,434 | 58 | Embedding providers (CPU/GPU/FAISS), vector search, similarity |
| `agents/` | 20,255 | 50 | Worker agents, orchestration, task distribution |
| `tools/` | 12,605 | 42 | MCP tool definitions + 18 handler modules |
| `autodoc/` | 11,003 | 29 | Automatic documentation generation, storage, LLM integration |
| `storage/` | 10,464 | 26 | SQLite, LibSQL, Prolly trees, persistence layer |
| `merge/` | 7,684 | 37 | Semantic merge, conflict resolution, indexing |
| `utils/` | 7,528 | 27 | Shared utilities, hashing, concurrency helpers |
| `cli/` | 7,319 | 29 | CLI interface, setup wizard, argument parsing |
| `core/` | 6,662 | 19 | Graph database, event bus, core data structures |
| `tracing/` | 6,441 | 12 | Static code flow analysis, backwards tracing |
| `layered/` | 5,601 | 12 | Layered architecture analysis |
| `analysis/` | 3,234 | 8 | Chaos analysis, complexity metrics |
| `types/` | 3,237 | 13 | Type definitions, interfaces |
| `config/` | 2,094 | 6 | Configuration management |

### Key Runtime Dependencies

| Package | Purpose | Zig Equivalent Needed |
|---------|---------|----------------------|
| `@modelcontextprotocol/sdk` | MCP protocol | Yes — mcp.zig |
| `better-sqlite3` (via storage) | Database | Yes — zqlite.zig |
| `@libsql/client` | LibSQL/Turso | Partial — SQLite covers local |
| `graphology` | In-memory graph | Yes — zig-graph |
| `oxc-parser` | Fast JS/TS parsing (Rust, ~0.1ms native but 1-5ms via NAPI due to serde) | tree-sitter C via `@cImport` (~0.5-2ms, no serde). oxc has no C API — Rust-only |
| `java-parser` | Java CST (Chevrotain JS, ~15-30ms/file) | tree-sitter-java C (~0.5-1ms). 15-30x faster |
| Custom analyzers | C/C++/Go/Rust/Bash/Python/Kotlin/CSS (JS regex, 15-50ms/file) | tree-sitter grammars (C libs, ~0.5-2ms) + Zig entity extractors |
| `typescript` | Angular/TS compiler API (~2-5ms/file) | tree-sitter-typescript + Angular-specific Zig extractor |
| `protobufjs` | Protocol Buffers | Yes — protobuf-zig |
| `cbor-x` | CBOR serialization | Yes — zig-cbor |
| `xxhash-wasm` | Fast hashing | Native xxhash (trivial) |
| `fast-glob` | File discovery | std.fs + custom glob |
| `yaml` | YAML parsing | Yes — zig-yaml |
| `zod` | Schema validation | Compile-time types (built-in) |
| `lru-cache` | Caching | Custom (trivial in Zig) |
| `p-limit` / `p-map` | Concurrency | std.Thread + custom pool |
| `@huggingface/inference` | HF API | HTTP client calls |
| `@grpc/grpc-js` | gRPC | Custom or C bindings |
| `nanoid` | ID generation | std.crypto.random |
| `fast-json-stringify` | Fast JSON | zimdjson |

---

## 2. Zig Ecosystem Library Mapping

### Core Infrastructure

| Need | Library | URL | Maturity | Notes |
|------|---------|-----|----------|-------|
| **MCP Protocol** | mcp.zig | https://github.com/muhammad-fiaz/mcp.zig | Early | JSON-RPC + stdio/SSE transport. May need extensions for full MCP spec |
| **HTTP Server** | dusty | https://github.com/lalinsky/dusty | Active | HTTP/1.1 server for SSE transport |
| **HTTP Client** | std.http.Client | stdlib | Stable | Built into Zig stdlib |
| **Event Loop** | libxev | https://github.com/mitchellh/libxev | Mature | io_uring/epoll/kqueue. Cross-platform async I/O |
| **CLI Args** | zig-clap | https://github.com/Hejsil/zig-clap | Mature | Comptime argument parsing. Well-maintained |
| **Logging** | nexlog | https://github.com/chrischtel/nexlog | Active | Structured logging with multiple sinks |
| **Async Runtime** | zap | https://github.com/kprotty/zap | Active | High-performance thread pool + async |

### Data & Storage

| Need | Library | URL | Maturity | Notes |
|------|---------|-----|----------|-------|
| **SQLite** | zqlite.zig | https://github.com/karlseguin/zqlite.zig | Mature | Thin idiomatic wrapper. Compile SQLite from C source |
| **SQLite (alt)** | zig-sqlite | https://github.com/vrischmann/zig-sqlite | Mature | Statement-based API, good for complex queries |
| **Graph** | zig-graph | https://github.com/mitchellh/zig-graph | Stable | Directed/undirected graphs. Mitchell Hashimoto's library |
| **Graph DB (alt)** | LadybugDB | https://github.com/LadybugDB/ladybug | Active | Embedded property graph (Kuzu fork). C/C++ API, Cypher, vector index, FTS. MIT. See Section 8 |
| **Cuckoo Filter** | zig-cuckoofilter | https://github.com/kristoff-it/zig-cuckoofilter | Stable | Probabilistic set membership. Good for deduplication |

### Parsing & Serialization

| Need | Library | URL | Maturity | Notes |
|------|---------|-----|----------|-------|
| **Tree-sitter (core)** | tree-sitter C lib | https://github.com/tree-sitter/tree-sitter | Mature | C library linked directly via `@cImport`. No need for zig-tree-sitter wrapper — Zig natively calls C. tree-sitter is the grammar/parser engine; Zig code is the entity extractor (AST walker) |
| **TS grammars** | tree-sitter-* | https://github.com/tree-sitter | Mature | Pre-built grammars: tree-sitter-javascript, tree-sitter-typescript, tree-sitter-java, tree-sitter-python, tree-sitter-go, tree-sitter-rust, tree-sitter-c, tree-sitter-cpp, tree-sitter-swift, tree-sitter-bash. All are C libraries |
| **zig-tree-sitter (optional)** | zig-tree-sitter | https://github.com/tree-sitter/zig-tree-sitter | Semi-active | Convenience Zig wrapper, v0.25.0 (Feb 2025). Can use if it works with target Zig version, otherwise raw `@cImport` of tree-sitter C headers |
| **JSON (fast)** | zimdjson | https://github.com/ezequielramis/zimdjson | Active | SIMD JSON parsing (simdjson port). 2-10 GB/s |
| **YAML** | zig-yaml | https://github.com/kubkon/zig-yaml | Active | YAML 1.2 parser |
| **CBOR** | zig-cbor | https://github.com/solenopsys/zig-cbor | Active | Binary serialization for compact storage |
| **MsgPack** | msgpack.zig | https://github.com/lalinsky/msgpack.zig | Active | Alternative binary format |
| **Protobuf** | protobuf-zig | https://github.com/travisstaloch/protobuf-zig | Active | Full protobuf support with codegen |
| **Markdown** | koino | https://github.com/kivikakk/koino | Mature | CommonMark parser. Author is on Zig core team |

### Parser Benchmark Context

> Source: [Benchmark TypeScript Parsers: Demystify Rust Tooling Performance](https://dev.to/herrington_darkholme/benchmark-typescript-parsers-demystify-rust-tooling-performance-2go8) by Herrington Darkholme (ast-grep author)

**The NAPI/serde paradox:** Rust parsers (oxc, swc) are extremely fast natively, but when called from JavaScript via NAPI, most of the time is spent serializing AST across the language boundary — not parsing.

```
total_time = ffi_overhead + parse_time + serde_time
                 │               │            │
                 │               │            └─ oxc/swc: proportional to file size (JSON.parse of full AST)
                 │               │               tree-sitter: fixed cost (returns tree object, not serialized AST)
                 │               └─ oxc native: ~0.1ms/file, tree-sitter native: ~0.5-2ms/file
                 └─ fixed ~6% overhead per call
```

**Native parse speed (no JS, no NAPI — what Zig gets):**

| Parser | Language | Native Speed | JS/NAPI Speed | NAPI Overhead | C API? |
|--------|----------|-------------|---------------|---------------|--------|
| **oxc** | Rust | ~0.1ms/file (fastest) | 1-5ms/file (serde-bound) | 10-50x slowdown | **No** (Rust crate or NAPI only) |
| **tree-sitter** | C | ~0.5-2ms/file | 2-15ms/file (FFI per node) | 3-10x slowdown | **Yes** (`@cImport` from Zig) |
| **swc** | Rust | ~0.3ms/file | 3-10ms/file (serde-bound) | 10-30x slowdown | No |
| **TypeScript compiler** | JS | 2-5ms/file | same (no FFI) | N/A | N/A |

**Key insight for Zig:** tree-sitter from C/Zig (0.5-2ms) will be **faster** than oxc from JS/NAPI (1-5ms), despite oxc being a faster parser natively. The NAPI serialization boundary inverts the performance hierarchy.

**Why not oxc from Zig?** oxc has no C API — only Rust crate and NAPI bindings. Calling Rust from Zig requires `extern "C"` wrappers built in Rust, which is fragile and adds a build dependency on the Rust toolchain. [Issue #2409](https://github.com/oxc-project/oxc/issues/2409) discusses faster AST passing but no C API is planned.

**Zig/C parser landscape (no JS/TS/Java parsers exist in Zig):**

| Project | Written In | Parses | Speed | Status |
|---------|-----------|--------|-------|--------|
| [Accelerated-Zig-Parser](https://github.com/Validark/Accelerated-Zig-Parser) | Zig | **Zig only** | 1.41 GB/s (SIMD tokenizer, 2.75x faster than std) | WIP, tokenizer only |
| [ast-grep](https://github.com/ast-grep/ast-grep) | Rust + tree-sitter C | 40+ languages | 10K+ files/sec structural search | Mature, production |
| tree-sitter | C | 40+ languages | ~0.5-2ms/file full parse | Mature, used by GitHub/Neovim/Zed |
| oxc | Rust | JS/TS only | ~0.1ms/file (native Rust) | Mature, **no C API** |

**Conclusion:** tree-sitter C via `@cImport` is the only viable high-performance multi-language parser callable from Zig without a Rust toolchain dependency.

### Search & ML

| Need | Library | URL | Maturity | Notes |
|------|---------|-----|----------|-------|
| **Vector Search** | USearch | https://github.com/unum-cloud/usearch | Mature | HNSW index with native Zig bindings. 10-100x faster than FAISS for small-medium datasets |
| **Vector Search (alt)** | zvec | https://github.com/alibaba/zvec | Early | Alibaba's Proxima engine. Dense+sparse, hybrid search. **No Windows, no C API** — not viable for cross-platform Zig. See Section 8 |
| **Hashing** | xxhash | C header (builtin) | Stable | Zero-cost via `@cImport`. Already used in TS via WASM |

### Not Available — Must Build

| Need | Current TS Library | Zig Approach | Effort |
|------|-------------------|--------------|--------|
| **gRPC** | @grpc/grpc-js | C bindings to grpc-core, or HTTP/2 + protobuf | High |
| **Prolly Trees** | Custom implementation | Port from TS (pure data structure) | Medium |
| **LibSQL client** | @libsql/client | SQLite direct (local) + HTTP (remote) | Low |
| **HuggingFace API** | @huggingface/inference | HTTP client + JSON (trivial) | Low |
| **LRU Cache** | lru-cache | ~50 lines of Zig (intrusive linked list + HashMap) | Trivial |
| **Concurrency limits** | p-limit / p-map | std.Thread.Pool + Semaphore | Trivial |
| **Glob matching** | fast-glob | std.fs.Dir.walk + pattern matcher | Low |

---

## 3. Component-by-Component Assessment

### Difficulty Scale
- **Easy** — Direct library mapping or trivial Zig implementation
- **Medium** — Requires adaptation, partial custom code
- **Hard** — Significant custom implementation, complex algorithms
- **Very Hard** — No ecosystem support, deep domain knowledge required

| # | Component | TS LOC | Zig LOC Est. | Difficulty | Risk | Key Challenge |
|---|-----------|--------|--------------|------------|------|---------------|
| 1 | **CLI / Config** | 9,413 | 3,000 | Easy | Low | zig-clap + std.json. Comptime config validation |
| 2 | **MCP Protocol Layer** | 4,000 | 2,500 | Medium | Medium | mcp.zig is early-stage. May need to extend/fork |
| 3 | **Storage / SQLite** | 10,464 | 5,000 | Easy | Low | zqlite.zig is mature. Prolly trees need porting |
| 4 | **Parsers (tree-sitter C + Zig extractors)** | 46,440 | 12,000 | Medium | Low | tree-sitter C library does grammar parsing via `@cImport`. Zig code is only the entity extraction layer (AST walking) — port of current ~280 LOC oxc-fast-parser.ts, ~400 LOC java-chevrotain-parser.ts, and regex analyzers per language. Each language keeps a dedicated Zig extractor module |
| 5 | **Generated Grammars** | 81,908 | 0 | N/A | N/A | Eliminated. tree-sitter grammars are pre-compiled C libraries (tree-sitter-java, tree-sitter-kotlin, tree-sitter-rust). Statically linked at build time or loaded as shared libs |
| 6 | **Semantic / Embeddings** | 20,434 | 10,000 | Hard | High | USearch for vectors. Embedding computation via HTTP API or ONNX |
| 7 | **Graph Database** | 6,662 | 4,000 | Medium | Low | zig-graph + custom query layer |
| 8 | **Agents / Workers** | 20,255 | 8,000 | Hard | Medium | Thread pool + message passing. No async/await sugar |
| 9 | **Tools / Handlers** | 12,605 | 8,000 | Medium | Low | Mostly glue code. Mechanical translation |
| 10 | **Tracing / Flow Analysis** | 6,441 | 5,000 | Hard | Medium | tree-sitter AST queries + graph traversal in Zig. Complex algorithms |
| 11 | **AutoDoc** | 11,003 | 5,000 | Medium | Low | Template engine + LLM API calls |
| 12 | **Merge Engine** | 7,684 | 6,000 | Very Hard | High | Semantic diff/merge is algorithmically complex |
| 13 | **Layered Analysis** | 5,601 | 3,000 | Medium | Low | Dependency graph + rule engine |
| 14 | **Analysis / Chaos** | 3,234 | 2,000 | Medium | Low | Metrics computation, straightforward |
| 15 | **Utils / Shared** | 7,528 | 3,000 | Easy | Low | Most replaced by Zig stdlib |
| 16 | **Types** | 3,237 | 1,500 | Easy | Low | Comptime structs. No runtime overhead |
| | **TOTAL** | ~265K | **~78,000** | | | **~71% LOC reduction** |

### Why the LOC Reduction?

1. **Generated grammars eliminated** (82K → 0) — tree-sitter grammars are pre-compiled C libraries, not generated code in the repo
2. **No runtime type system** — Zig comptime replaces Zod schemas, TypeScript interfaces
3. **Parsers dramatically leaner** (46K → 12K) — ultracode doesn't write parsers, it walks ASTs. Current code: oxc-parser (Rust) and java-parser (Chevrotain) do the heavy parsing, ultracode just extracts entities. In Zig: tree-sitter C library does parsing via `@cImport`, Zig code is only the entity extraction layer (~200-400 LOC per language vs ~2000+ LOC per language in TS with all the type wrangling)
4. **No async overhead** — No Promises, no callback chains, no `async/await` coloring
5. **Standard library** — Zig stdlib replaces 15+ npm packages (glob, hashing, caching, concurrency)

---

## 4. Target Architecture

### Core Principle: comm.c Proxy + Single Core Process + Exclusive DB

The current architecture is preserved: **comm.c** (Cosmopolitan C, ~700KB) acts as a lightweight stdio proxy. Multiple Claude Code instances each spawn a comm.c process, but only **one Core process** runs per machine. The Core process owns the database in **exclusive mode** — no concurrent DB access, no WAL contention, no locking complexity.

```
 Claude Code #1          Claude Code #2          Claude Code #3
      │                       │                       │
      │ stdio                 │ stdio                 │ stdio
      ▼                       ▼                       ▼
 ┌──────────┐           ┌──────────┐           ┌──────────┐
 │ comm.c   │           │ comm.c   │           │ comm.c   │
 │ (~700KB) │           │ (~700KB) │           │ (~700KB) │
 └────┬─────┘           └────┬─────┘           └────┬─────┘
      │                      │                      │
      │ Named Pipe (Win)     │ Named Pipe           │ Named Pipe
      │ Unix Socket (*nix)   │                      │
      └──────────────────────┼──────────────────────┘
                             │
                             ▼
          ┌──────────────────────────────────────────┐
          │     ultracode-core (single Zig process)   │
          │                                           │
          │  ┌──────────────────────────────────────┐│
          │  │  IPC Multiplexer                     ││
          │  │  Named Pipe server (Win) /            ││
          │  │  Unix Domain Socket (*nix)            ││
          │  │  Per-client MCP session routing       ││
          │  └──────────────┬───────────────────────┘│
          │                 │                         │
          │  ┌──────────────▼───────────────────────┐│
          │  │  MCP Layer + Tool Router (74 tools)  ││
          │  └──────────────┬───────────────────────┘│
          │                 │                         │
          │  ┌──────────────▼───────────────────────┐│
          │  │           Core Engine                 ││
          │  │  ┌────────┐ ┌────────┐ ┌───────────┐ ││
          │  │  │ Graph  │ │ Event  │ │ Thread    │ ││
          │  │  │(zig-   │ │ Bus    │ │ Pool      │ ││
          │  │  │ graph) │ │        │ │ (zap/std) │ ││
          │  │  └────────┘ └────────┘ └───────────┘ ││
          │  └──────────────────────────────────────┘│
          │                                           │
          │  ┌──────────────────────────────────────┐│
          │  │           Subsystems                  ││
          │  │  ┌─────────┐ ┌──────────┐ ┌────────┐││
          │  │  │ Parsers │ │ Semantic │ │Tracing │││
          │  │  │(native  │ │(USearch +│ │(native │││
          │  │  │per-lang)│ │ HTTP emb)│ │AST)    │││
          │  │  └─────────┘ └──────────┘ └────────┘││
          │  │  ┌─────────┐ ┌──────────┐ ┌────────┐││
          │  │  │ AutoDoc │ │  Merge   │ │Analysis│││
          │  │  │(koino + │ │(semantic │ │(metrics│││
          │  │  │ LLM API)│ │ diff)    │ │+chaos) │││
          │  │  └─────────┘ └──────────┘ └────────┘││
          │  └──────────────────────────────────────┘│
          │                                           │
          │  ┌──────────────────────────────────────┐│
          │  │     Storage (EXCLUSIVE mode)          ││
          │  │  ┌──────────┐ ┌───────┐ ┌──────────┐││
          │  │  │  SQLite   │ │Prolly │ │  Vector  │││
          │  │  │(zqlite)  │ │Trees  │ │ (USearch) │││
          │  │  │EXCLUSIVE │ │       │ │  mmap    │││
          │  │  │lock      │ │       │ │          │││
          │  │  └──────────┘ └───────┘ └──────────┘││
          │  └──────────────────────────────────────┘│
          └────────────┬─────────────────┬───────────┘
                       │                 │
                  ┌────▼────┐       ┌────▼────┐
                  │ .uc.db  │       │ Roslyn  │
                  │ (SQLite)│       │ (.NET)  │
                  └─────────┘       └─────────┘
```

### Why This Architecture

| Principle | Rationale |
|-----------|-----------|
| **Single process** | One Core owns all state. No distributed locking, no race conditions between instances. Current TS architecture already works this way |
| **comm.c stays C** | Already built with Cosmopolitan, runs on all platforms from one ~700KB binary. No reason to rewrite — it's pure byte-level proxy with no business logic |
| **DB exclusive mode** | `PRAGMA locking_mode=EXCLUSIVE` — SQLite holds file lock for process lifetime. No WAL overhead, no SHM files, no journal contention. Fastest possible SQLite mode |
| **Named Pipe / Unix Socket** | Proven IPC from current comm.c. Multiple Claude Code sessions multiplex through one Core. Pre-MCP handshake sends client CWD |
| **USearch mmap** | Vector index memory-mapped — single process means no cross-process mmap coordination needed |

### Key Architectural Decisions

1. **comm.c preserved as-is** — The Cosmopolitan C proxy (~700KB) remains unchanged. It handles stdio ↔ Named Pipe/Unix Socket proxying. Claude Code spawns comm.c, comm.c connects (or starts) the Zig Core process. Zero changes needed on the proxy side.

2. **Single Core process, multi-client** — The Zig binary runs as a long-lived daemon. comm.c instances connect/disconnect as Claude Code sessions start/stop. The Core manages per-client MCP sessions with client CWD context (existing `ULTRACODE_CWD:` handshake).

3. **SQLite EXCLUSIVE locking** — `PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;` — identical to current TS storage. Single process means no contention. Maximum write throughput.

4. **tree-sitter C library + tags API + Zig extended queries** — Ultracode doesn't write grammars — it walks ASTs and extracts entities. In Zig: tree-sitter C library (linked via `@cImport`) replaces oxc-parser, java-parser, and all regex analyzers. Basic entity extraction (classes, functions, methods, imports) comes free from tree-sitter's built-in **tags system** (`queries/tags.scm`) — the same system GitHub uses for code navigation. Extended extractions (modifiers, generics, relationships, Angular-specific) need custom tree-sitter queries in Zig (~100-200 LOC per language).

5. **USearch for vector search** — Replaces the current FAISS/CPU/GPU provider split. Single HNSW implementation with SIMD acceleration. mmap-backed index file — single process makes this trivial.

6. **Thread pool internal only** — Zig's `std.Thread.Pool` or `zap` for internal parallelism (parsing, indexing). IPC multiplexing on the main thread (or dedicated I/O thread). No multi-process coordination needed.

7. **Comptime configuration** — Zig's comptime replaces runtime schema validation (Zod). Invalid configs caught at compile time.

8. **Roslyn stays .NET** — Communicated via gRPC/protobuf (existing protocol). The Zig Core spawns/connects to the Roslyn addon process.

### Process Lifecycle

```
1. Claude Code spawns comm.c
2. comm.c tries Named Pipe / Unix Socket connection
3. If no Core running:
   a. comm.c spawns ultracode-core (Zig binary) as background process
   b. Core opens .uc.db with EXCLUSIVE lock
   c. Core creates Named Pipe / Unix Socket listener
   d. comm.c retries connection (up to 30s)
4. comm.c connects, sends ULTRACODE_CWD:/path/to/project
5. Core creates MCP session for this client
6. Proxy loop: Claude Code ↔ comm.c ↔ Core
7. On disconnect: Core cleans up client session
8. When all clients disconnect: Core idle timeout → graceful shutdown
```

### Build Targets

```zig
// build.zig — cross-compilation matrix for ultracode-core
const targets = .{
    .{ .os = .linux, .arch = .x86_64 },
    .{ .os = .linux, .arch = .aarch64 },
    .{ .os = .macos, .arch = .x86_64 },
    .{ .os = .macos, .arch = .aarch64 },
    .{ .os = .windows, .arch = .x86_64 },
};
// comm.c stays Cosmopolitan — single ultracode.com for all platforms
```

Single `zig build` produces binaries for all platforms. No CI matrix needed.

---

## 5. Claude Code Integration

### Architecture: comm.c Proxy (Preserved)

The integration model remains identical to the current TypeScript version. Claude Code spawns **comm.c** (Cosmopolitan C proxy), which connects to the Zig Core via Named Pipe / Unix Socket. The user config does not change at all.

```jsonc
// claude_desktop_config.json — UNCHANGED from current TS version
{
  "mcpServers": {
    "ultracode": {
      "command": "path/to/ultracode.com",   // comm.c proxy (~700KB)
      "args": ["/path/to/project"]
    }
  }
}
```

**What happens under the hood:**
1. Claude Code spawns `ultracode.com` (comm.c, Cosmopolitan C, ~700KB)
2. comm.c connects to Named Pipe `\\.\pipe\UltraCode_Core` (Win) or Unix Socket `/tmp/UltraCode_Core.sock` (*nix)
3. If Core not running → comm.c spawns `ultracode-core` (Zig binary) as background daemon
4. Core opens `.uc.db` with `EXCLUSIVE` lock, creates IPC listener
5. comm.c sends `ULTRACODE_CWD:/path/to/project` handshake
6. MCP session established, proxy loop runs

**Advantages of keeping comm.c:**
- **Zero config migration** — Users don't change anything. Same `ultracode.com` binary
- **Instant proxy startup** — comm.c starts in <1ms, connects to already-running Core
- **Multi-client singleton** — Multiple Claude Code windows share one Core process, one DB
- **Cosmopolitan portability** — One `ultracode.com` file runs on Win/Linux/macOS/BSD
- **Separation of concerns** — Proxy is pure I/O (~900 LOC C), Core is business logic (Zig)

**Distribution:**
```
dist/
  ultracode.com          # comm.c proxy (Cosmopolitan, ~700KB, all platforms)
  ultracode-core         # Zig binary (per-platform, 8-20MB)
  ultracode-core.exe     # Zig binary (Windows)
```

```bash
# Install
curl -fsSL https://ultracode.dev/install.sh | sh  # downloads both files

# From source
cosmocc -Os -DNDEBUG -o ultracode.com src/comm/comm.c  # proxy (unchanged)
zig build -Doptimize=ReleaseFast                         # core (new Zig binary)
```

### Migration Path: Hybrid (During Transition)

During migration phases, comm.c can point to either the TS or Zig Core:

```bash
# comm.c auto-detects which Core binary to spawn:
# 1. If ultracode-core (Zig) exists next to comm.c → uses it
# 2. Fallback: spawns bun/node index.js (current TS behavior)
```

No dual-server needed. Single comm.c, one Core at a time. Swap the binary to switch.

---

## 6. Performance Expectations

### Benchmark Projections

All projections based on published Zig vs Node.js benchmarks and domain-specific analysis.

| Operation | TypeScript | Zig (projected) | Speedup | Basis |
|-----------|-----------|-----------------|---------|-------|
| **Cold startup** | 2,000-3,000ms | 3-10ms | **200-750x** | No V8 init, no module resolution, no JIT |
| **File parsing** (tree-sitter C) | 1-5ms/file (oxc NAPI), 15-50ms/file (regex analyzers) | 0.5-2ms/file | **3-25x** | See Section 2 benchmarks. oxc native ~0.1ms but NAPI serde adds 10-50x. tree-sitter C native 0.5-2ms with zero FFI overhead from Zig |
| **Indexing 10K files** | 45-120s | 2-5s | **20-50x** | Parallel I/O + native parsing + no GC |
| **Vector similarity** (1M vectors) | 200-500ms | 2-10ms | **50-100x** | USearch SIMD vs JS Float64Array |
| **Graph traversal** (50K nodes) | 50-200ms | 1-5ms | **40-50x** | Cache-friendly structs vs JS objects |
| **SQLite query** | 5-20ms | 0.5-2ms | **10x** | No N-API bridge, direct C calls |
| **JSON parse** (10MB) | 80-200ms | 5-15ms | **15-40x** | simdjson SIMD vs V8 JSON.parse |
| **Memory (idle)** | 150-300MB | 10-30MB | **10-15x** | No V8 heap, no node_modules in memory |
| **Memory (indexing)** | 500MB-2GB | 50-200MB | **10x** | Arena allocators, no GC overhead |
| **Semantic search** | 100-300ms | 5-20ms | **15-20x** | USearch + pre-computed SIMD distances |
| **MCP tool call overhead** | 5-15ms | 0.01-0.05ms | **200-500x** | No async overhead, no JSON schema validation at runtime |

### Real-World Impact on Claude Code Usage

| Scenario | Before (TS) | After (Zig) | User Impact |
|----------|-------------|-------------|-------------|
| First tool call after launch | 3-5s | 10-50ms | Feels instant |
| `semantic_search` on large repo | 1-3s | 50-150ms | Interactive speed |
| `index` 50K file monorepo | 5-15 min | 15-45s | Coffee → no wait |
| `analyze_code_impact` | 2-8s | 100-500ms | Real-time feedback |
| Memory during heavy indexing | 1-2 GB | 100-200 MB | No swap pressure |
| `trace_flow` deep analysis | 5-30s | 200ms-2s | Interactive exploration |

### Why These Numbers Are Achievable

1. **NAPI/serde boundary eliminated** — The single biggest bottleneck in the current TS version. oxc-parser is ~0.1ms native but 1-5ms through NAPI because the entire AST must be serialized to JSON, passed across the Rust→JS boundary, and deserialized by `JSON.parse()`. tree-sitter has the same problem from JS (FFI per node access). From Zig, both tree-sitter C calls and SQLite C calls are **zero-cost** — same address space, no serialization, no copying. ([Source](https://dev.to/herrington_darkholme/benchmark-typescript-parsers-demystify-rust-tooling-performance-2go8))

2. **V8 overhead elimination** — JIT compilation, garbage collection, and object boxing consume 60-80% of CPU time in compute-heavy TypeScript code. Zig has zero runtime overhead.

3. **SIMD utilization** — Zig's `@Vector` type and C library bindings (simdjson, USearch) leverage hardware SIMD. TypeScript cannot access SIMD directly.

4. **Memory layout** — Zig structs are packed in memory (struct-of-arrays possible). JS objects are hash maps with pointer chasing. This is the primary reason for graph traversal speedups.

5. **I/O concurrency** — `libxev` uses io_uring on Linux (zero-copy I/O). Node.js uses libuv which adds a thread pool indirection layer.

6. **No bridge overhead anywhere** — Current TS calls native code through N-API for SQLite (better-sqlite3), hashing (xxhash-wasm), and parsing (oxc-parser). Each call has ~1-5μs overhead + serde proportional to data size. In Zig, all C libraries (tree-sitter, SQLite, xxhash, USearch) are linked directly — function calls, not IPC.

---

## 7. CUDA / GPU Acceleration

### Current State

Ultracode already has CUDA support via a native addon (`external-tools/native/cuda/`):
- **vector_ops.cu** — cosine similarity, batch cosine, euclidean distance (shared memory reduction)
- **embedding_kernels.cu** — vector normalization
- **Backend selector** — auto-detects: CUDA Native → CUDA Worker → Metal → WebGPU → WASM SIMD → JS
- Performance: 100-200x vs pure JS on GTX 1650 Ti

**Current limitation:** CUDA kernels are wrapped in a Node.js N-API addon (`.node` file). This adds N-API overhead and requires Node.js runtime (doesn't work under Bun natively).

### Zig + CUDA Integration

Zig calls CUDA through the same mechanism as C: `@cImport` of `cuda_runtime.h` + linking `libcudart`. Pre-compiled `.cu` kernels (compiled by `nvcc` into `.ptx` or `.o`) are linked at build time. No N-API, no NAPI serde, no JS boundary.

```zig
// build.zig — CUDA integration
const cuda_step = b.addSystemCommand(&.{ "nvcc", "-c", "-O3", "--use_fast_math",
    "-arch=sm_75", "src/gpu/kernels.cu", "-o", "kernels.o" });
const exe = b.addExecutable(.{ .name = "ultracode-core" });
exe.addObjectFile(.{ .cwd_relative = "kernels.o" });
exe.linkSystemLibrary("cudart");
exe.linkSystemLibrary("cublas");
```

Existing `.cu` files (`vector_ops.cu`, `embedding_kernels.cu`) **reused as-is** — they already expose `extern "C"` functions. Zero rewrite needed for current kernels.

### GPU-Acceleratable Tasks

| Task | Current (CPU) | GPU Potential | Speedup | Library / Approach |
|------|--------------|---------------|---------|-------------------|
| **Vector similarity search** | USearch HNSW (CPU SIMD) | NVIDIA cuVS CAGRA | **8-12x** index build, **3-8x** search | [cuVS](https://github.com/rapidsai/cuvs) C API |
| **Batch embedding normalization** | Zig SIMD loops | Existing `embedding_kernels.cu` | **50-100x** for large batches | Already implemented |
| **Cosine similarity batch** | Zig SIMD | Existing `vector_ops.cu` | **100-200x** for 10K+ vectors | Already implemented |
| **HNSW index building** | USearch CPU | cuVS CAGRA → HNSW export | **8-12x** | [cuVS](https://developer.nvidia.com/blog/accelerating-vector-search-fine-tuning-gpu-index-algorithms/) |
| **Graph BFS / shortest path** | zig-graph (CPU) | Gunrock GPU graph | **10-50x** on large graphs (50K+ nodes) | [Gunrock](https://github.com/gunrock/gunrock) C API |
| **Graph PageRank** | Custom CPU | cuGraph | **50-500x** | [cuGraph](https://github.com/rapidsai/cugraph) |
| **Batch file hashing** | xxhash CPU | GPU hash kernel | **5-10x** for 10K+ files | Custom CUDA kernel |
| **Embedding computation** | HTTP API (HF/OpenAI) | Local GPU inference (ONNX/TensorRT) | **10-100x** latency | [ONNX Runtime CUDA](https://onnxruntime.ai/) |
| **Duplicate detection** | Pairwise comparison | GPU matrix similarity | **100x+** for large codebases | cuBLAS `sgemm` |

### Architecture: GPU as Optional Accelerator

```
ultracode-core (Zig)
  │
  ├── CPU path (always available)
  │   ├── USearch HNSW (SIMD)
  │   ├── zig-graph (cache-friendly)
  │   └── Zig SIMD string ops
  │
  └── GPU path (optional, auto-detected)
      ├── Existing CUDA kernels (vector_ops.cu, embedding_kernels.cu)
      │   └── Linked via nvcc → .o → Zig linker
      │
      ├── cuVS (NVIDIA vector search library)
      │   ├── CAGRA index build on GPU → export as HNSW for CPU search
      │   └── 8-12x faster index building
      │   └── C API via @cImport
      │
      ├── Gunrock / cuGraph (GPU graph algorithms)
      │   ├── BFS, SSSP, PageRank on GPU
      │   └── Useful for large graphs (50K+ nodes)
      │   └── C API via @cImport
      │
      └── Custom kernels (future)
          ├── Batch hash computation
          ├── Duplicate detection matrix
          └── Parallel AST pattern matching
```

**Key principle:** GPU path is always optional. If no NVIDIA GPU — CPU path with SIMD. Same results, different speed. The Zig binary detects GPU at startup (same as current `GPUDetector`).

### Advantage Over Current TS Implementation

| Factor | Current (TS + CUDA addon) | Zig + CUDA |
|--------|--------------------------|------------|
| **CUDA call overhead** | N-API boundary: JS → C++ → CUDA. ~1-5μs per call + array copy | Direct: Zig → `extern "C"` → CUDA. Zero overhead |
| **Data transfer** | JS Float64Array → copy to C float[] → copy to GPU | Zig `[]f32` → copy to GPU. One copy, not two |
| **Batch size** | Limited by V8 heap + N-API array marshaling | Limited only by GPU memory |
| **Build complexity** | CMake + node-gyp + node-addon-api | `nvcc` + `zig build`. Two commands |
| **Runtime detection** | Requires Node.js (Bun workaround via subprocess) | Direct `dlopen("libcuda.so")` / LoadLibrary. No runtime dependency |
| **Metal fallback** | Separate Metal backend (macOS only) | Same architecture: `@cImport` of Metal C API |

### What's New vs Current CUDA (Tasks Not Yet GPU-Accelerated)

**1. GPU-accelerated index building (cuVS CAGRA)**

Currently: USearch builds HNSW index on CPU. For 100K embeddings (768-dim), this takes 30-60 seconds.
With cuVS: Build CAGRA graph on GPU in 3-5 seconds, export as HNSW for CPU-based search. 8-12x speedup on the most painful bottleneck in `index`.

**2. GPU graph algorithms (Gunrock)**

Currently: zig-graph does BFS/shortest path on CPU. For graphs with 50K+ nodes, `trace_flow` and `analyze_code_impact` take seconds.
With Gunrock: GPU-parallel BFS, SSSP, PageRank. 10-50x for large codebases. The graph is already in memory — upload once, query many times.

**3. GPU batch duplicate detection**

Currently: Pairwise cosine similarity on CPU for `find_duplicates`. O(n²) comparisons.
With cuBLAS: `sgemm` matrix multiply computes all-pairs similarity in one GPU call. For 10K code snippets × 768-dim embeddings: CPU ~30s → GPU ~0.3s.

**4. Local embedding inference (ONNX Runtime CUDA)**

Currently: Embeddings via HTTP API (HuggingFace, OpenAI). Network latency dominates.
With ONNX Runtime + CUDA: Run embedding model locally on GPU. ~1ms per embedding vs ~100ms network round-trip. Offline-capable.

### CUDA Libraries for Zig (all callable via `@cImport`)

| Library | Purpose | C API | URL |
|---------|---------|-------|-----|
| **cuVS** | GPU vector search (CAGRA/IVF) | Yes | https://github.com/rapidsai/cuvs |
| **Gunrock** | GPU graph algorithms | Yes | https://github.com/gunrock/gunrock |
| **cuGraph** | GPU graph analytics (PageRank etc.) | Yes | https://github.com/rapidsai/cugraph |
| **cuBLAS** | GPU matrix ops (batch similarity) | Yes (CUDA Toolkit) | Included with CUDA |
| **ONNX Runtime** | Local ML inference on GPU | Yes | https://onnxruntime.ai/ |
| **cudaz** | Zig CUDA wrapper | Zig native | https://github.com/akhildevelops/cudaz |

### Migration: Phased GPU Integration

| Phase | When | What | Impact |
|-------|------|------|--------|
| **Phase 0** | Immediate | Reuse existing `.cu` kernels as-is, link via `nvcc` + Zig | Same GPU features, no N-API overhead |
| **Phase 1** | Week 13-14 | cuVS CAGRA for index building | 8-12x faster `index` command |
| **Phase 2** | Week 16-17 | Gunrock for graph BFS/SSSP | 10-50x faster `trace_flow`, `analyze_code_impact` |
| **Phase 3** | Week 19-20 | cuBLAS batch similarity for `find_duplicates` | 100x faster duplicate detection |
| **Phase 4** | Post-launch | ONNX Runtime for local embeddings | Offline embedding, ~100x latency reduction |

---

## 8. Database Strategy

### Current DB Usage Patterns

Ultracode uses LibSQL (SQLite-compatible) with aggressive performance PRAGMAs:

```sql
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA locking_mode = EXCLUSIVE;
PRAGMA cache_size = -8192;  -- 8MB cache
PRAGMA mmap_size = 268435456;  -- 256MB mmap
```

**Tables and data patterns:**

| Table / Area | Rows (typical 10K-file project) | Access Pattern | Notes |
|-------------|--------------------------------|----------------|-------|
| `entities` | 50K-200K | Bulk INSERT (1000/batch), text search, by-file lookup | Core entity storage |
| `relationships` | 100K-500K | Bulk INSERT, graph-join queries | Call graph edges |
| `files` | 10K-50K | Sequential scan + hash comparison for change detection | File metadata |
| `tombstones` | 5K-20K | Layered reads: CTE with `delta + base - tombstones` | Soft deletes for Prolly trees |
| `cooccurrence` | 50K-200K | PMI/co-occurrence matrix, batch update | Term correlation |
| `term_frequency` | 20K-100K | TF-IDF computation, full scan | Search ranking |
| `prolly_nodes` | 10K-50K | B-tree-like traversal, content-addressed | Versioned storage |
| `graph_commits` | 100-1000 | Sequential append | Version history |
| `branch_heads` | 5-20 | Key-value lookup | Branch pointers |
| `query_cache` | 1K-10K | TTL-based eviction, key lookup | Result caching |
| `project_metadata` | 10-50 | Key-value, rare writes | Config storage |

**Key patterns:**
- **Write-heavy indexing:** Batch INSERT 1000 rows at a time during `index`. Millions of INSERTs per session
- **Layered reads:** CTEs combining base + delta - tombstones for Prolly tree versioning
- **Text search:** LIKE queries on entity names, no FTS5 currently
- **No concurrent writes:** Single process, EXCLUSIVE lock
- **Separate DBs:** AutoDoc has its own `.autodoc.db`
- **No vectors in SQL:** Embedding vectors stored in FAISS/USearch index files, not in SQLite

### Database Alternatives Analysis

#### Option A: SQLite (Current — Recommended for Zig)

**Library:** zqlite.zig (mature) or zig-sqlite

SQLite remains the optimal choice for ultracode's access patterns:
- **EXCLUSIVE mode** maximizes throughput (no WAL, no journal, no SHM)
- **Batch INSERT** 1000 rows = 1 transaction, ~1ms per batch
- **Direct C API from Zig** via `@cImport` — zero overhead (vs current N-API bridge)
- **Prolly trees** stay as-is (pure data structure on top of SQL)
- Proven, battle-tested, single-file database

**Performance gain over TS:** ~10x (elimination of better-sqlite3 N-API bridge)

#### Option B: LMDB / libmdbx (Key-Value, Read-Optimized)

| Feature | LMDB | libmdbx |
|---------|------|---------|
| **Written in** | C | C (fork of LMDB) |
| **Zig integration** | `@cImport` trivial | `@cImport` trivial |
| **Read performance** | ~0.1μs per read (mmap, zero-copy) | Same + better write perf |
| **Write performance** | Good (B+ tree, single writer) | Better (refactored page management) |
| **Concurrency** | Multiple readers, single writer | Same |
| **Max DB size** | 128TB | 128TB |
| **License** | OpenLDAP (permissive) | OpenLDAP (permissive) |

**Fit for ultracode:**
- Excellent for `entities`, `files`, `project_metadata` (key-value natural)
- Poor for `cooccurrence` / `term_frequency` (no SQL aggregates — must scan in application code)
- Poor for `relationships` (no JOINs — must maintain secondary indexes manually)
- No SQL means rewriting all layered read CTEs in application logic

**Verdict:** Partial fit. Best for cache/metadata layer, poor for relational queries.

#### Option C: DuckDB (Analytical / OLAP)

| Feature | DuckDB |
|---------|--------|
| **Written in** | C++ |
| **Zig integration** | C API via `@cImport` |
| **Strength** | Columnar storage, vectorized execution, parallel scans |
| **Weakness** | Row-level INSERT/UPDATE slower than SQLite |

**Fit for ultracode:**
- Excellent for `cooccurrence`, `term_frequency` (columnar aggregates, OLAP-style)
- Excellent for analytics queries (`analyze_hotspots`, `analyze_complexity`)
- Poor for bulk INSERT workload during indexing (row-oriented writes to columnar storage)
- Overkill for simple key-value patterns (`project_metadata`, `branch_heads`)

**Verdict:** Niche fit for analytics subsystem. Could complement SQLite, not replace it.

#### Option D: LadybugDB (Embedded Graph Database)

> https://github.com/LadybugDB/ladybug — MIT License, 540 stars, v0.15.0 (Feb 2026)

| Feature | LadybugDB |
|---------|-----------|
| **Written in** | C++ (70%), Cypher queries |
| **Origin** | Continuation of Kuzu database |
| **Zig integration** | C/C++ API, precompiled binaries available |
| **Graph model** | Property graph with Cypher queries |
| **Storage** | Columnar, CSR (compressed sparse row) adjacency lists |
| **Features** | Full-text search, **vector index (built-in)**, ACID transactions |
| **Parallelism** | Multi-core vectorized query execution |
| **Bindings** | Python, Node.js, Rust, Go, Java, C/C++, **WASM** |

**Fit for ultracode:**

| Ultracode Need | LadybugDB Fit |
|---------------|---------------|
| **Graph storage** (`relationships`, call graph) | **Excellent** — native property graph with CSR. Cypher for traversals |
| **Entity storage** (`entities` table) | **Good** — graph nodes with properties |
| **Vector search** (embeddings) | **Good** — built-in vector index. Could replace separate USearch |
| **Full-text search** | **Good** — native FTS (currently ultracode uses LIKE) |
| **Bulk INSERT** (indexing) | **Unknown** — columnar storage may be slower for row-level inserts |
| **Layered reads** (Prolly trees) | **Poor** — no SQL CTEs, would need graph-based versioning |
| **KV patterns** (`metadata`, `cache`) | **Overhead** — graph DB for key-value is overkill |

**Key advantage:** Unifies graph + vectors + FTS in one embedded engine. Currently ultracode has three separate stores: SQLite (entities/relations), USearch (vectors), custom code (graph traversal). LadybugDB could replace all three.

**Key risk:** C++ dependency (heavier than SQLite C), relatively new project (540 stars vs SQLite's decades), Cypher query language adds complexity vs raw SQL.

**Verdict:** Intriguing unified solution. The graph + vector + FTS combination maps well to ultracode's needs. Worth prototyping with `relationships` + `entities` tables. Risk: maturity and bulk insert performance.

#### Option E: zvec (Embedded Vector Database)

> https://github.com/alibaba/zvec — Apache 2.0, 8400+ stars, v0.2.0 (Feb 2026)

| Feature | zvec |
|---------|------|
| **Written in** | C++ (81%), built on Proxima (Alibaba's vector search engine) |
| **Zig integration** | C++ core, **SWIG bindings** (Python, Node.js). No direct C API documented |
| **Vector types** | Dense + sparse vectors, multi-vector queries |
| **Search** | Hybrid: semantic similarity + structured filters |
| **Storage** | In-process, embedded (like SQLite for vectors) |
| **Scale** | "Billions of vectors in milliseconds" |
| **Platforms** | Linux x86_64/ARM64, macOS ARM64. **No Windows** |

**Fit for ultracode:**

| Need | zvec Fit |
|------|---------|
| **Embedding vectors** | **Excellent** — purpose-built. Dense + sparse support |
| **Hybrid search** (vector + filter) | **Excellent** — structured filters built-in |
| **Multi-vector queries** | **Excellent** — query with multiple vectors simultaneously |

**Key advantages over USearch:**
- Hybrid search (vector + metadata filter) built-in — USearch needs manual post-filtering
- Sparse vector support — useful for TF-IDF / BM25 style features
- Alibaba-backed, production-proven at massive scale

**Key risks:**
- **No Windows support** — ultracode needs Win/Linux/macOS
- **No C API** — SWIG bindings only (Python, Node.js). Calling from Zig requires C++ interop or writing a C wrapper over the C++ API
- **No Zig integration path** — would need to build a C shim layer over the C++ headers
- Early version (v0.2.0), limited documentation

**Verdict:** Powerful vector engine, but **no Windows support** and **no C API** make it impractical for ultracode's cross-platform Zig binary. USearch is a better fit: native Zig bindings, all platforms, HNSW with SIMD.

#### Option F: TigerBeetle (Zig-Native LSM)

| Feature | TigerBeetle |
|---------|-------------|
| **Written in** | **Zig** (100%) |
| **Purpose** | Financial accounting database |
| **Fit** | Almost none — domain-specific (double-entry accounting), no general SQL/KV |

**Verdict:** Not applicable. Purpose-built for financial transactions.

#### Option G: UnQLite (Embedded Document Store)

| Feature | UnQLite |
|---------|---------|
| **Written in** | C |
| **Zig integration** | `@cImport` trivial |
| **Model** | Key-value + JSON document store |
| **Transactions** | ACID |
| **License** | BSD 2-Clause |

**Fit for ultracode:**
- Good for `project_metadata`, `query_cache`, `branch_heads` (KV natural)
- JSON document model fits `entities` (store as documents)
- No SQL → no JOINs, no CTEs, no aggregates. All relational logic moves to application code

**Verdict:** Partial fit. Simpler than LMDB but same limitations for relational queries.

### Recommended Architecture

**Primary: SQLite + USearch (enhanced current stack)**

```
ultracode-core (Zig)
  │
  ├── SQLite (zqlite.zig)        — entities, relationships, files, metadata, Prolly trees
  │   └── EXCLUSIVE mode, batch INSERT, mmap, direct C API
  │
  ├── USearch (Zig bindings)     — embedding vectors, HNSW index
  │   └── mmap-backed, SIMD search, no SQL
  │
  └── Optional: LadybugDB        — if graph complexity grows beyond SQLite JOINs
      └── Native graph traversal, Cypher queries, built-in vector index
```

**Why not switch:**
1. SQLite from Zig is **already 10x faster** than current LibSQL through N-API — eliminating the bridge is the biggest win
2. USearch already has **native Zig bindings** and covers all vector search needs
3. The current schema (11 tables, CTEs, batch INSERT) maps naturally to SQL
4. Switching to LMDB/document stores would require rewriting all query logic in application code — high effort, marginal gain

**Where alternatives shine:**
- **LadybugDB** — if the graph subsystem grows in complexity (deeper Cypher traversals vs SQL JOINs). Worth prototyping in Phase 3
- **DuckDB** — if analytics workloads dominate (columnar scans for `analyze_hotspots`). Could be a secondary read-only store
- **zvec** — not viable until it adds Windows support and C API

### Database Performance Projections

| Operation | Current (LibSQL + N-API) | Zig + SQLite (direct) | Improvement |
|-----------|-------------------------|----------------------|-------------|
| Batch INSERT 1000 entities | ~15-30ms | ~1-3ms | **10-15x** |
| Entity lookup by file | ~2-5ms | ~0.2-0.5ms | **10x** |
| Layered CTE read | ~5-15ms | ~0.5-2ms | **10x** |
| Full `index` (10K files, DB writes) | 45-120s | 5-15s | **8-10x** |
| Vector search (10K embeddings) | ~50-100ms (FAISS) | ~5-10ms (USearch SIMD) | **10-15x** |
| Graph traversal (relationships JOIN) | ~20-50ms | ~2-5ms | **10x** |

The database layer is not the bottleneck after moving to Zig — parser + indexer dominates. But eliminating the N-API bridge for every DB call compounds across millions of operations during `index`.

---

## 9. Migration Strategy

### Phase Overview

| Phase | Duration | Deliverable | Risk |
|-------|----------|-------------|------|
| Phase 1: Foundation | 6 weeks | Core binary + MCP + SQLite + CLI | Low |
| Phase 2: Parsers | 6 weeks | tree-sitter C + Zig entity extractors for all languages | Low |
| Phase 3: Intelligence | 8 weeks | Semantic, tracing, graph, agents | High |
| Phase 4: Features | 6 weeks | AutoDoc, merge, analysis, polish | Medium |
| **Total** | **26 weeks** | **Full Zig ultracode** | |

### Phase 1: Foundation (Weeks 1-6)

**Goal:** Minimal MCP server that can start, respond to `get_version`, and store data.

| Week | Task | Libraries Used |
|------|------|----------------|
| 1-2 | Project scaffold, build.zig, CI, cross-compile | zig-clap, nexlog |
| 2-3 | MCP protocol layer (stdio transport, JSON-RPC) | mcp.zig, zimdjson |
| 3-4 | SQLite storage layer, schema migration | zqlite.zig |
| 4-5 | Configuration system, project detection | zig-yaml, std.json |
| 5-6 | Event bus, basic graph structure | zig-graph |

**Exit criteria:** `ultracode --version` works. Claude Code can connect via MCP. `get_version`, `get_metrics`, `detect_technology_stack` tools respond.

### Phase 2: Parsers (Weeks 7-12)

**Goal:** Link tree-sitter C library, port entity extraction layer to Zig, build code graph.

**Key insight:** ultracode does NOT write grammar parsers — it walks ASTs and extracts entities (classes, functions, methods, imports). tree-sitter already has a built-in **tags system** (`queries/tags.scm`) that does exactly this — every grammar repo ships `tags.scm` files with `@definition.class`, `@definition.function`, `@definition.method`, `@reference.call` etc. This is the same system GitHub uses for code navigation in production.

Current TS: oxc-parser (Rust NAPI) → ESTree AST → JS walk → entities. java-parser (Chevrotain) → CST → JS walk → entities.
Zig version: tree-sitter (C `@cImport`) → **tags API** → entities. No custom AST walking needed for basic entity extraction.

| Week | Task | Libraries Used |
|------|------|----------------|
| 7-8 | tree-sitter C integration via `@cImport`, tags API, grammar loading | tree-sitter C lib |
| 8-9 | Entity extraction via tags.scm: TS/JS, Python, Java, Kotlin | tree-sitter grammars (pre-built `tags.scm`) |
| 9-10 | Entity extraction: Go, Rust, C/C++, Swift, Bash + extended extractions beyond tags (modifiers, generics, relationships) | tree-sitter grammars + custom Zig queries |
| 10-11 | Angular/framework-specific extractors + CSS | Custom Zig query layer |
| 11-12 | Indexing engine (parallel file walk + parse + store) + `get_members`, `query`, `index`, `pattern_search` tools | std.Thread, zqlite |

**Exit criteria:** `index` + `get_members` + `pattern_search` work for all 10+ languages. Can parse 10K file project in <30s. Entity extraction parity with TS version verified file-by-file.

> **Key insight:** tree-sitter's built-in tags API (`queries/tags.scm`) already extracts `@definition.class`, `@definition.function`, `@definition.method`, `@reference.call` etc. — this maps directly to ultracode's `ParsedEntity { type, name }`. The "easy 80%" of entity extraction comes free from existing `tags.scm` files shipped with every grammar. The "hard 20%" is ultracode-specific extended extractions: modifiers, generics, visibility, relationships, Angular decorators — these need custom tree-sitter queries in Zig (~100-200 LOC per language).

### Phase 3: Intelligence (Weeks 13-20)

**Goal:** Vector search, code tracing, agent system.

| Week | Task | Libraries Used |
|------|------|----------------|
| 13-14 | USearch integration, embedding storage | USearch |
| 14-15 | Embedding providers (HTTP to HF/OpenAI/Ollama) | std.http.Client |
| 15-16 | `semantic_search`, `find_similar_code`, `cross_language_search` | USearch, zqlite |
| 16-17 | Tracing engine (flow, backwards, data flow) using tree-sitter AST | zig-graph |
| 17-18 | Agent worker system, thread pool | zap, std.Thread |
| 18-19 | `analyze_code_impact`, `find_duplicates`, `analyze_hotspots` | — |
| 19-20 | Git integration, file watcher, incremental indexing | std.fs, libxev |

**Exit criteria:** All search and analysis tools work. Vector search returns relevant results. Tracing produces correct call graphs.

### Phase 4: Features (Weeks 21-26)

**Goal:** AutoDoc, merge engine, final polish.

| Week | Task | Libraries Used |
|------|------|----------------|
| 21-22 | AutoDoc engine (template + LLM API) | koino, std.http |
| 22-23 | Merge engine (semantic diff, conflict resolution) | tree-sitter AST |
| 23-24 | Snapshot/undo system, validation | zqlite |
| 24-25 | Branch management, versioning tools | std.process (git) |
| 25-26 | Integration testing, performance benchmarking, release | — |

**Exit criteria:** All 74 MCP tools operational. Performance meets targets from Section 6. Cross-platform binaries built.

### Testing Strategy

```
Unit tests:     zig test (built-in, runs per-module)
Integration:    Shell scripts calling ultracode binary
Compatibility:  Run same MCP tool calls against TS and Zig versions, diff results
Benchmarks:     zig build -Doptimize=ReleaseFast + hyperfine
```

---

## 10. Risk Assessment

### Critical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **mcp.zig immaturity** | High | High | Fork and extend. MCP protocol is simple (JSON-RPC over stdio). Worst case: implement from scratch (~1500 LOC) |
| **tree-sitter AST ≠ oxc ESTree/Chevrotain CST** | Medium | High | tree-sitter node types differ from current oxc-parser ESTree and java-parser Chevrotain CST. Entity extractors must be rewritten for tree-sitter's node model. Mitigate: file-by-file entity comparison test suite between TS and Zig versions |
| **Zig language stability** | Medium | Medium | Pin Zig version (0.13+). Avoid bleeding-edge features. Zig 1.0 expected 2026-2027 |
| **Embedding quality regression** | Medium | High | Keep same embedding models (HF API). Only the vector storage changes (USearch). Run recall@k benchmarks |
| **gRPC for Roslyn addon** | Low | Medium | Existing protobuf protocol. Use C grpc-core bindings or switch to HTTP/JSON |

### Moderate Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Merge engine complexity** | High | Medium | Port algorithm directly from TS. This is the hardest subsystem regardless of language |
| **Developer velocity** | Medium | Medium | Zig has no REPL, longer compile-test cycles. Offset by `zig build --watch` and faster test execution |
| **Windows compatibility** | Low | Medium | Zig has first-class Windows support. Cross-compile from any platform |
| **Memory safety bugs** | Medium | Low | Zig's safety-checked build mode (Debug) catches use-after-free, buffer overflows at runtime. Release builds can keep safety checks |
| **Community support** | Medium | Low | Zig ecosystem is smaller than Node.js. Key libraries (tree-sitter, SQLite, USearch) are C libraries with thin Zig wrappers — not dependent on Zig ecosystem maturity |

### Low Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Build system complexity** | Low | Low | `build.zig` is Zig code. Single file, no external build tools |
| **Distribution** | Low | Low | Static binary. GitHub Releases + install script |
| **Backward compatibility** | Low | Medium | Same MCP protocol, same SQLite schema. `.uc.db` files remain compatible |

### Show-Stoppers (would cancel the project)

1. **Zig drops Windows support** — Extremely unlikely. Windows is a first-class target.
2. **tree-sitter grammars missing for a supported language** — Extremely unlikely. tree-sitter has official grammars for all 10+ languages ultracode supports (JS/TS, Python, Java, Kotlin, Go, Rust, C, C++, Swift, Bash). Used by GitHub, Neovim, Helix.
3. **MCP protocol changes incompatibly** — Low risk. MCP is versioned and Anthropic maintains backward compatibility.

---

## 11. Partial Rewrite Alternative

Instead of a full rewrite, selectively port the hottest paths to Zig and call them from TypeScript via N-API or as child processes.

### Tier 1: Highest Impact, Lowest Risk (4-6 weeks)

Port these as standalone Zig libraries callable from Node.js via N-API:

| Component | Current Bottleneck | Zig Approach | Expected Speedup |
|-----------|-------------------|--------------|------------------|
| **Parsing engine** | oxc-parser (Rust NAPI) + java-parser (Chevrotain JS) + regex analyzers (46K LOC) | tree-sitter C + Zig entity extractors, output JSON to stdout | 15-50x per file |
| **Vector search** | JS Float64Array math | USearch native binary, mmap shared index | 50-100x |
| **Indexing pipeline** | Sequential Node.js I/O | Zig binary: parallel walk + parse + emit NDJSON | 20-40x |

**Architecture:**
```
TypeScript MCP Server (existing)
  ├── spawn("ultracode-parse", files)  → stdout NDJSON  (tree-sitter C + Zig extractors)
  ├── spawn("ultracode-index", dir)    → writes .uc.db  (parallel walk + parse)
  └── USearch N-API binding            → vector queries  (SIMD HNSW)
```

**LOC to write:** ~6,000-10,000 Zig (entity extractors are ~200-400 LOC each)
**Impact:** Covers 80% of performance-critical paths

### Tier 2: Medium Impact (4-6 weeks, after Tier 1)

| Component | Zig Approach | Expected Speedup |
|-----------|--------------|------------------|
| **Graph engine** | Zig shared library via N-API | 40x traversal |
| **Tracing** | Zig binary using tree-sitter AST queries | 20-30x |
| **Hashing/dedup** | Zig native xxhash + cuckoo filter | 10-20x |

**LOC to write:** ~6,000-8,000 Zig

### Tier 3: Full Binary (8-12 weeks, after Tier 2)

At this point, most compute is in Zig. The TypeScript layer is just MCP protocol + tool routing + glue.

**Decision point:** If Tier 1+2 achieve acceptable performance, stop here. If not, proceed to full rewrite (Phase 3-4 from Section 9).

### Partial vs Full Rewrite Comparison

| Factor | Partial (Tier 1+2) | Full Rewrite |
|--------|--------------------:|-------------:|
| **Timeline** | 8-12 weeks | 26 weeks |
| **Zig LOC** | 12-18K | ~78K |
| **Startup improvement** | 2x (still Node.js) | 200-750x |
| **Parsing improvement** | 15-50x | 15-50x |
| **Memory improvement** | 2-3x | 10-15x |
| **Distribution** | Still needs Node.js + npm | Single binary |
| **Maintenance** | Two languages, N-API boundary | One language |
| **Risk** | Low | Medium-High |
| **Incremental value** | Yes (each tier delivers value) | No (all-or-nothing until Phase 2) |

### Recommendation

**Start with Tier 1 partial rewrite.** It delivers the most impactful performance gains (parsing + vectors + indexing = 80% of CPU time) with minimal risk. After Tier 1 ships:

- If performance is sufficient → stop, maintain hybrid
- If startup time matters → proceed to full rewrite
- If the Zig codebase is clean and velocity is good → proceed to full rewrite

This de-risks the project: if Zig proves difficult or the ecosystem doesn't deliver, you've only invested 4-6 weeks and still have a working TypeScript server with fast native components.

---

## Appendix A: Zig Version Requirements

- **Minimum Zig version:** 0.13.0
- **Recommended:** Latest stable (0.14.x as of 2026)
- **Build modes:** Debug (safety checks), ReleaseFast (production), ReleaseSafe (production + safety)

## Appendix B: File Size Estimates

| Artifact | Size |
|----------|------|
| Zig binary (ReleaseFast, stripped, all parsers statically linked) | 8-20 MB |
| Total distribution | 8-20 MB (single file) |
| Current node_modules | ~200-400 MB |

## Appendix C: Benchmark Methodology

All performance projections should be validated with:
1. **Micro-benchmarks:** `zig build -Dbenchmark` for per-function timings
2. **Macro-benchmarks:** `hyperfine` for end-to-end tool call latency
3. **Parity tests:** Same input files, same tool calls → diff output between TS and Zig versions
4. **Memory profiling:** `valgrind --tool=massif` (Linux) or Instruments (macOS)

---

*This assessment was generated on 2026-03-01 based on ultracode v5.0.0 (265K LOC TypeScript) and the Zig ecosystem as of early 2026.*
