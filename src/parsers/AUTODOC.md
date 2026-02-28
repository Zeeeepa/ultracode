---
module_name: parsers
description: Multi-language source code parsing framework with incremental caching, two-pass TS/JS analysis (OXC + TypeScript API), and layered analysis for Python/Rust
status: production
language: TypeScript
entry_point: incremental-parser.ts
exports:
  - IncrementalParser
  - UnifiedParser
  - TypeScriptParser
  - MultiPassOrchestrator
  - fastParse
  - fastParseBatch
dependencies:
  - typescript
  - oxc-parser
  - xxhash-wasm
  - lru-cache
tags:
  - parsing
  - ast
  - multi-language
  - incremental
  - caching
  - oxc
  - tree-sitter
---

# Parsers

Multi-language source code parsing framework supporting 20+ languages. Uses a two-pass architecture for TS/JS (OXC fast pass + TypeScript API), layered analysis for Python and Rust, and incremental xxhash-based LRU caching. Routes parsing via `UnifiedParser` with lazy-loaded language-specific parsers. Circuit breaker pattern prevents runaway recursion and timeouts.

## Data Flow

### Inputs

| Source | Type | Description |
|--------|------|-------------|
| File path + content | `string` | Source code to parse |
| `FileChange[]` | array | Incremental edits for delta parsing |
| `ParserOptions` | config | Batch size, timeout, cache size, multipass toggle |

### Processing

| Step | Component | Description |
|------|-----------|-------------|
| Hash | xxhash-wasm | Content hash for cache lookup |
| Cache check | LRU cache | Return `CacheEntry` on hit, else continue |
| Language detect | `UnifiedParser` | Map file extension to `SupportedLanguage` |
| Pass 1 (TS/JS) | OXC fast parser | Structural analysis ~0.5-2ms, complexity score |
| Pass 2 (TS/JS) | TypeScript API | Full type analysis if complexity > threshold |
| Native parse | Language analyzers | tree-sitter or native CLI for non-JS languages |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `ParseResult` | object | Entities, relationships, patterns, metadata, timing |
| `BatchResult` | object | Array of results + errors + stats |
| `QuickParseResult` | object | Pass 1 lightweight entities + complexity score |

## Public API

| Export | Type | Location | Description |
|--------|------|----------|-------------|
| `IncrementalParser` | class | [`incremental-parser.ts:96-675`](./incremental-parser.ts) | Main parser with xxhash caching and batch support |
| `UnifiedParser` | class | [`unified-parser.ts:186-775`](./unified-parser.ts) | Routes to language-specific parsers, lazy loading |
| `TypeScriptParser` | class | [`typescript-parser.ts:164-332`](./typescript-parser.ts) | TS Compiler API parser with Angular/NgRx support |
| `MultiPassOrchestrator` | class | [`multipass/multipass-orchestrator.ts:38-405`](./multipass/multipass-orchestrator.ts) | Two-pass OXC + TS API coordinator |
| `getMultiPassOrchestrator` | function | [`multipass/multipass-orchestrator.ts:410-416`](./multipass/multipass-orchestrator.ts) | Singleton factory for orchestrator |
| `fastParse` | function | [`multipass/oxc-fast-parser.ts:99-102`](./multipass/oxc-fast-parser.ts) | OXC single-file fast parse |
| `fastParseBatch` | function | [`multipass/oxc-fast-parser.ts:180-181`](./multipass/oxc-fast-parser.ts) | OXC batch fast parse |
| `BaseParser` | interface | [`base-parser.ts:27-57`](./base-parser.ts) | Common interface for all parsers |
| `ParserStats` | interface | [`base-parser.ts:13-22`](./base-parser.ts) | Cache hits, throughput, error count |
| `LineOffsetMap` | class | [`base-parser-utils.ts:21-50`](./base-parser-utils.ts) | O(log n) index-to-line/column lookup |
| `CircuitBreakerError` | class | [`base-parser-utils.ts:65-70`](./base-parser-utils.ts) | Thrown on recursion/timeout breach |
| `checkCircuitBreakers` | function | [`base-parser-utils.ts:117-133`](./base-parser-utils.ts) | Guard against infinite loops |
| `ComplexityScore` | interface | [`multipass/types.ts:14-31`](./multipass/types.ts) | Complexity metrics (0-100 scale) |
| `QuickParseResult` | interface | [`multipass/types.ts:36-52`](./multipass/types.ts) | OXC Pass 1 result structure |

## Dependencies

### Internal

| Module | Import | Usage |
|--------|--------|-------|
| `types/parser` | `ParseResult`, `ParsedEntity`, `ASTNode` | Core data structures |
| `logging` | `log` | Structured logging (`log.d`, `log.i`, `log.w`, `log.e`) |
| `utils/file-ops` | `readText`, `readFilesParallel` | File I/O |
| `utils/parallel` | `forEachParallel` | Concurrent batch processing |
| `utils/runtime-detection` | `sleep` | Bun-compatible timeout |
| `config/constants` | `PARSER_CONSTANTS` | Max recursion depth, timeout values |

### External

| Package | Usage |
|---------|-------|
| `typescript` | TS Compiler API for full type analysis (Pass 2) |
| `oxc-parser` | Rust-based fast structural parser (Pass 1, ~2x faster than SWC) |
| `xxhash-wasm` | WASM content hashing for incremental cache |
| `lru-cache` | Bounded memory cache (default 100MB) |
| `@oxc-project/types` | ESTree-compatible AST type definitions |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `cacheSize` | `100MB` | LRU cache memory limit |
| `batchSize` | `50` | Files per batch |
| `timeoutMs` | `30000` | Per-file parse timeout |
| `multiPass` | `true` | Enable OXC + TS two-pass |
| `detailedThreshold` | `50` | Complexity score to trigger Pass 2 |
| `skipDetailedForSimple` | `true` | Skip TS API for low-complexity files |
| `oxcConcurrency` | `min(cpu*2, 16)` | OXC parallel workers |
| `tsConcurrency` | `min(cpu, 8)` | TS API parallel workers |

## Behavioral Properties

- **Caching**: xxhash content hash as cache key; LRU eviction at 100MB; `warmRestart()` restores from persisted data; `exportCache()` serializes for persistence.
- **Incremental**: Accepts `FileChange[]` with edit ranges; reuses cached AST when content hash matches; only re-parses changed files.
- **Batch**: Files split by language -- TS/JS to MultiPass, others to UnifiedParser. Batches of 20+ files trigger parallel OXC pass.
- **Two-pass (TS/JS)**: Pass 1 (OXC, ~0.5-2ms) extracts structure + complexity score. Pass 2 (TS API) runs only if complexity exceeds threshold.
- **Layered analysis**: Python uses 4 layers (basic -> features -> relationships -> patterns). Rust uses similar layered approach with pattern identification.
- **Lazy loading**: `UnifiedParser` only initializes parsers for detected project languages (checks package.json, Cargo.toml, etc.).

## Error Handling

- **Circuit breaker**: `checkCircuitBreakers()` throws `CircuitBreakerError` if recursion depth > 100 or elapsed time > 30s.
- **Partial results**: On per-file failure, `BatchResult.errors` accumulates errors while successful files still return results.
- **Timeout**: Each file parse wrapped in `Promise.race` with configurable timeout; throws on expiry.
- **Graceful degradation**: If OXC unavailable, falls back to TS API only. If tree-sitter unavailable, language parser skipped.
- **Logging on error**: `log.e()` with context tag and file path; `log.w()` for circuit breaker triggers.

## Observability

| Context Tag | Events | Level |
|-------------|--------|-------|
| `INCPARSER` | `init_start`, `init_done`, `batch_start`, `batch_done`, `cache_evict`, `parse_err` | info/debug/error |
| `MULTIPASS` | `oxc_warm`, `ts_parse_err`, `batch_strategy` | info/warn |
| `JAVAANALYZER` | `analyze_err`, `circuit_break` | error/warn |
| `GOANALYZER` | `circuit_break` | warn |
| `PYBASIC/2/3/4` | `layerX_start`, `layerX_done` | debug |

Stats via `parser.getStats()`: `filesParsed`, `cacheHits`, `cacheMisses`, `avgParseTimeMs`, `throughput`, `cacheMemoryMB`, `errorCount`.

## Known Limitations

- Max recursion depth is 100; deeply nested ASTs trigger circuit breaker and return empty results.
- OXC Pass 1 does not provide full type information; complex generics require Pass 2.
- Batch size of 50 may cause OOM on memory-constrained systems with large files.
- Angular template analysis parses inline templates only; external `.html` templates handled separately.
- Python async/coroutine analysis may miss some advanced patterns (e.g. `async for` in comprehensions).
- Cache invalidation on config change requires manual `clearCache()` call.
- No `index.ts` barrel file; consumers import specific files directly.

## TypeScript Notes

### Event Map

| Event | Emitter | Payload |
|-------|---------|---------|
| Cache eviction | `IncrementalParser` | `{ hash: string }` |
| Parse complete | `IncrementalParser` | `ParseResult` |
| Batch complete | `IncrementalParser` | `BatchResult` with stats |
| Circuit break | Analyzers | `CircuitBreakerError` (thrown, not emitted) |

### Module Boundary

No barrel `index.ts` exists. Entry points are imported directly:
- `IncrementalParser` from `./parsers/incremental-parser.js`
- `UnifiedParser` from `./parsers/unified-parser.js`
- `MultiPassOrchestrator` from `./parsers/multipass/index.js`
- Language configs from `./parsers/language-configs.js`

Key types consumed from `../types/parser.ts`: `ParseResult`, `ParsedEntity`, `EntityRelationship`, `ASTNode`, `SupportedLanguage`, `CacheEntry`, `FileChange`.

## Files

| File | Description |
|------|-------------|
| [`incremental-parser.ts`](./incremental-parser.ts) | Main parser with xxhash LRU caching and batch orchestration |
| [`unified-parser.ts`](./unified-parser.ts) | Language router with lazy-loaded parsers |
| [`base-parser.ts`](./base-parser.ts) | `BaseParser` interface and `ParserStats` |
| [`base-parser-utils.ts`](./base-parser-utils.ts) | `LineOffsetMap`, `CircuitBreakerError`, AST traversal helpers |
| [`typescript-parser.ts`](./typescript-parser.ts) | TS Compiler API parser (Pass 2) with Angular/NgRx |
| [`multipass/`](./multipass/) | OXC fast parser, orchestrator, shared types |
| [`angular-parser.ts`](./angular-parser.ts) | Angular component/directive metadata extraction |
| [`angular-analyzer.ts`](./angular-analyzer.ts) | Angular structure analyzer |
| [`ngrx-parser.ts`](./ngrx-parser.ts) | NgRx actions/reducers/effects/selectors parser |
| [`ngrx/`](./ngrx/) | NgRx builders, types, index |
| [`ts-*.ts`](.) | TS extractor modules (class, function, interface, type, import/export, JSDoc, NgRx, patterns) |
| [`java-analyzer.ts`](./java-analyzer.ts) | Java tree-sitter analyzer |
| [`java-antlr-parser.ts`](./java-antlr-parser.ts) | Java ANTLR grammar parser |
| [`java-chevrotain-parser.ts`](./java-chevrotain-parser.ts) | Java Chevrotain parser |
| [`java-native-parser.ts`](./java-native-parser.ts) | Java native tree-sitter parser |
| [`javaparser-integration.ts`](./javaparser-integration.ts) | JavaParser library integration |
| [`java/`](./java/) | Java extractors, framework support (Spring, JPA, Lombok) |
| [`kotlin-analyzer.ts`](./kotlin-analyzer.ts) | Kotlin tree-sitter analyzer |
| [`kotlin-antlr-parser.ts`](./kotlin-antlr-parser.ts) | Kotlin ANTLR parser |
| [`kotlin-native-parser.ts`](./kotlin-native-parser.ts) | Kotlin native tree-sitter parser |
| [`kotlin-k2-provider.ts`](./kotlin-k2-provider.ts) | Kotlin K2 compiler provider |
| [`kotlin-compiler-integration.ts`](./kotlin-compiler-integration.ts) | Kotlin compiler syntax validation |
| [`kotlin/`](./kotlin/) | Kotlin extractors, framework support (Android, Ktor, Coroutines) |
| [`python-analyzer.ts`](./python-analyzer.ts) | Python entry-point analyzer |
| [`python-native-parser.ts`](./python-native-parser.ts) | Python native tree-sitter parser |
| [`pyright-integration.ts`](./pyright-integration.ts) | Pyright type checker integration |
| [`python/`](./python/) | 4-layer Python analyzer, extractors, utils |
| [`go-analyzer.ts`](./go-analyzer.ts) | Go tree-sitter analyzer |
| [`go-native-parser.ts`](./go-native-parser.ts) | Go native tree-sitter parser |
| [`go-ast-cli.go`](./go-ast-cli.go) | Go AST CLI tool (subprocess) |
| [`rust-analyzer.ts`](./rust-analyzer.ts) | Rust layered analyzer |
| [`rust-native-parser.ts`](./rust-native-parser.ts) | Rust native tree-sitter parser |
| [`rust-analyzer-integration.ts`](./rust-analyzer-integration.ts) | rust-analyzer LSP integration |
| [`rust-antlr-parser.ts`](./rust-antlr-parser.ts) | Rust ANTLR parser |
| [`rust/`](./rust/) | Rust AST helpers, pattern identifier |
| [`c-analyzer.ts`](./c-analyzer.ts) | C tree-sitter analyzer |
| [`cpp-analyzer.ts`](./cpp-analyzer.ts) | C++ tree-sitter analyzer with STL support |
| [`cpp-native-parser.ts`](./cpp-native-parser.ts) | C++ native tree-sitter parser |
| [`cpp-declarator-utils.ts`](./cpp-declarator-utils.ts) | C++ declarator/qualifier extraction |
| [`cpp-template-utils.ts`](./cpp-template-utils.ts) | C++ template parameter extraction |
| [`bash-analyzer.ts`](./bash-analyzer.ts) | Bash script analyzer |
| [`bash-native-parser.ts`](./bash-native-parser.ts) | Bash native parser |
| [`powershell-analyzer.ts`](./powershell-analyzer.ts) | PowerShell analyzer |
| [`powershell-native-parser.ts`](./powershell-native-parser.ts) | PowerShell native parser |
| [`batch-analyzer.ts`](./batch-analyzer.ts) | Windows Batch script analyzer |
| [`json-parser.ts`](./json-parser.ts) | JSON parser with validation |
| [`html-analyzer.ts`](./html-analyzer.ts) | HTML structure analyzer |
| [`css-analyzer.ts`](./css-analyzer.ts) | CSS selectors/rules analyzer |
| [`xml-analyzer.ts`](./xml-analyzer.ts) | XML structure analyzer |
| [`swift-native-parser.ts`](./swift-native-parser.ts) | Swift native parser |
| [`zig-native-parser.ts`](./zig-native-parser.ts) | Zig native parser |
| [`python-ast-cli.py`](./python-ast-cli.py) | Python AST CLI tool (subprocess) |
| [`language-configs.ts`](./language-configs.ts) | Re-exports from language-configs/ |
| [`language-configs/`](./language-configs/) | Per-language configs (JS family, compiled, scripting, markup) |
| [`utils/parser-utils.ts`](./utils/parser-utils.ts) | Shared parser utility functions |
