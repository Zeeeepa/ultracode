# Big Files Refactoring Status

Last updated: 2025-01-05

## Summary

- **Refactored**: 3 files (significant size reduction)
- **Already modularized**: 35+ files (have submodules)
- **On boundary**: 15 files (800-935 lines, acceptable)
- **OK**: 90+ files (400-800 lines, acceptable structure)

---

## Completed Refactoring (Significant Reduction)

| File | Before | After | Change | New Modules Created |
|------|--------|-------|--------|---------------------|
| `src/semantic/gpu/gpu-worker.ts` | 1704 | 631 | **-63%** | `faiss-handlers.ts`, `cuda-handlers.ts`, `embeddings-handlers.ts` |
| `src/agents/workers/generic-language-worker.ts` | 974 | 549 | **-44%** | `embedding-processor.ts`, `analyzer-loader.ts` |
| `src/agents/indexer-agent.ts` | 1022 | 917 | **-10%** | `indexer/git-event-handlers.ts` |

---

## Already Modularized (Have Submodules)

| File | Lines | Submodules Location |
|------|-------|---------------------|
| `src/agents/semantic-agent.ts` | 2070 | `agents/semantic/` (5 files: cache-warmup, comment-processor, embedding-processor, provider-config, index) |
| `src/index.ts` | 1282 | Uses `tools/tool-registry.ts` for delegation |
| `src/storage/libsql-graph-adapter.ts` | 968 | `storage/libsql/` (6 files: entity-ops, relationship-ops, vector-ops, cache-ops, metadata-ops, types) |
| `src/parsers/rust-analyzer.ts` | 928 | `parsers/rust/` (3 files: ast-helpers, pattern-identifier, index) |
| `src/agents/dev-agent.ts` | 922 | `agents/dev/` submodules |
| `src/tracing/trace-engine.ts` | 884 | Uses `PathBuilder`, `GraphologyPathBuilder` delegates |
| `src/semantic/providers/ovms-provider.ts` | 894 | Uses `ovms-container.ts`, `ovms-grpc-client.ts`, `ovms-utils.ts` |
| `src/agents/conductor-orchestrator.ts` | 811 | `agents/conductor/` (5 files: config, method-proposals, task-analysis, types, index) |

---

## On Boundary (800-935 lines) - Acceptable

These files are at the upper limit but have good structure and are difficult to split further.

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/parsers/java-antlr-parser.ts` | 934 | ANTLR Parser | Uses generated Java20Parser |
| `src/parsers/java-analyzer.ts` | 889 | Parser | Shared class state |
| `src/agents/parser-agent.ts` | 895 | Agent | Worker pool coordination |
| `src/parsers/kotlin-native-parser.ts` | 915 | Parser | Native tree-sitter |
| `src/tracing/graphology-path-builder.ts` | 895 | Graph Engine | Core tracing logic |
| `src/parsers/rust-antlr-parser.ts` | 867 | ANTLR Parser | Uses generated RustParser |
| `src/semantic/gpu/gpu-client.ts` | 875 | GPU Client | Named pipe transport |
| `src/layered/layered-graph-index.ts` | 836 | Indexer | Layered architecture |
| `src/tools/handlers/autodoc-tool-handlers.ts` | 820 | Tool Handlers | AutoDoc operations |
| `src/parsers/cpp-analyzer.ts` | 808 | Parser | C++ AST analysis |
| `src/parsers/go-native-parser.ts` | 806 | Parser | Native tree-sitter |
| `src/parsers/kotlin-antlr-parser.ts` | 802 | ANTLR Parser | Uses generated KotlinParser |

---

## OK (700-800 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/tools/handlers/file-tool-handlers.ts` | 799 | Tool Handlers | File operations |
| `src/config/yaml-config.ts` | 799 | Configuration | YAML config parsing |
| `src/parsers/json-parser.ts` | 797 | Parser | JSON/YAML parsing |
| `src/utils/file-ops.ts` | 779 | Utilities | File operations |
| `src/parsers/go-analyzer.ts` | 778 | Parser | Go analysis |
| `src/tools/handlers/semantic-tool-handlers.ts` | 773 | Tool Handlers | Semantic search |
| `src/storage/graph-storage-libsql.ts` | 769 | Storage | Uses libsql/ submodules (1816 lines total) |
| `src/parsers/python-native-parser.ts` | 763 | Parser | Uses python/ submodules (1442 lines total) |
| `src/autodoc/storage/ref-storage.ts` | 748 | AutoDoc | Reference storage |
| `src/semantic/vector-store.ts` | 739 | Semantic | Vector operations |
| `src/semantic/ovms-native-manager.ts` | 731 | Semantic | OVMS management |
| `src/parsers/unified-parser.ts` | 730 | Parser | Language detection & routing |
| `src/semantic/faiss/faiss-provider.ts` | 726 | Semantic | Part of faiss/ module |
| `src/parsers/parser.ts` | 710 | Parser | Base parser class |
| `src/core/git-watcher.ts` | 703 | Core | Git file watcher |
| `src/tracing/path-builder.ts` | 702 | Tracing | Part of tracing/ (12 files) |

---

## OK (650-700 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/parsers/angular-parser.ts` | 693 | Parser | Angular component parsing |
| `src/autodoc/storage/doc-storage.ts` | 686 | AutoDoc | Part of autodoc/ (29+ files) |
| `src/parsers/incremental-parser.ts` | 685 | Parser | Incremental parsing |
| `src/agents/workers/language-worker-pool.ts` | 679 | Workers | Part of workers/ (16+ files) |
| `src/autodoc/storage/autodoc-manager.ts` | 668 | AutoDoc | AutoDoc management |
| `src/parsers/ngrx-parser.ts` | 662 | Parser | NgRx state management |
| `src/tracing/types.ts` | 660 | Tracing | Type definitions |
| `src/tools/handlers/tracing-tool-handlers.ts` | 648 | Tool Handlers | Tracing operations |

---

## OK (600-650 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/semantic/gpu/gpu-worker.ts` | 631 | GPU | **Refactored** from 1704 lines |
| `src/semantic/code-analyzer.ts` | 621 | Semantic | Part of semantic/ (50+ files) |
| `src/tracing/condition-analyzer.ts` | 617 | Tracing | Part of tracing/ (12 files) |
| `src/utils/shell.ts` | 615 | Utilities | Shell command execution |
| `src/merge/engine/three-way-merger.ts` | 612 | Merge | Part of merge/ (37 files) |
| `src/cli/setup/setup-llm.ts` | 610 | CLI | Part of cli/setup/ (19 files) |

---

## OK (550-600 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/parsers/ts-js-patterns-extractor.ts` | 597 | Parser | Pattern extraction |
| `src/autodoc/llm/llm-provider.ts` | 597 | AutoDoc | LLM integration |
| `src/parsers/javaparser-integration.ts` | 596 | Parser | Java integration |
| `src/parsers/swift-analyzer.ts` | 594 | Parser | Swift analysis |
| `src/autodoc/types.ts` | 588 | AutoDoc | Type definitions |
| `src/parsers/rust-analyzer-integration.ts` | 587 | Parser | Rust integration |
| `src/analysis/chaos/race-detector.ts` | 580 | Analysis | Race condition detection |
| `src/tracing/output-formatter.ts` | 569 | Tracing | Output formatting |

---

## OK (500-550 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/storage/libsql/vector-ops.ts` | 549 | Storage | Part of libsql/ (6 files) |
| `src/agents/workers/generic-language-worker.ts` | 549 | Workers | **Refactored** from 974 lines |
| `src/parsers/powershell-analyzer.ts` | 547 | Parser | PowerShell analysis |
| `src/parsers/kotlin-analyzer.ts` | 546 | Parser | Kotlin analysis |
| `src/autodoc/generator/incremental-updater.ts` | 543 | AutoDoc | Incremental updates |
| `src/layered/vector-cache-manager.ts` | 531 | Layered | Part of layered/ (12 files) |
| `src/parsers/powershell-native-parser.ts` | 526 | Parser | PowerShell native |
| `src/parsers/rust-native-parser.ts` | 523 | Parser | Rust native |
| `src/parsers/python/layer1-basic.ts` | 521 | Parser | Part of python/ submodule |
| `src/layered/layered-vector-store.ts` | 520 | Layered | Vector store layer |
| `src/modification/file-operations.ts` | 519 | Modification | Part of modification/ (3 files) |
| `src/tracing/state-tracker.ts` | 512 | Tracing | State tracking |
| `src/semantic/faiss/faiss-client.ts` | 511 | Semantic | Part of faiss/ module |
| `src/layered/git-delta-computer.ts` | 511 | Layered | Git delta computation |
| `src/parsers/c-analyzer.ts` | 509 | Parser | C analysis |
| `src/versioning/version-manager.ts` | 503 | Versioning | Version management |
| `src/core/di-container.ts` | 502 | Core | Dependency injection |
| `src/utils/comment-extractor.ts` | 500 | Utilities | Comment extraction |

---

## OK (450-500 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/parsers/ts-class-extractor.ts` | 495 | Parser | Class extraction |
| `src/tracing/data-flow-analyzer.ts` | 494 | Tracing | Part of tracing/ (12 files) |
| `src/layered/delta-maintenance-service.ts` | 494 | Layered | Part of layered/ (12 files) |
| `src/types/storage.ts` | 493 | Types | Storage types |
| `src/utils/logger.ts` | 490 | Utilities | Logging system |
| `src/semantic/gpu/types.ts` | 483 | Semantic | Part of semantic/gpu/ |
| `src/tools/impact-analyzer.ts` | 480 | Tools | Part of tools/ (38 files) |
| `src/autodoc/watcher/autodoc-watcher.ts` | 475 | AutoDoc | Part of autodoc/ (29 files) |
| `src/parsers/cpp-native-parser.ts` | 471 | Parser | C++ native |
| `src/semantic/providers/vllm-provider.ts` | 466 | Semantic | Part of semantic/providers/ |
| `src/agents/workers/python-worker-pool.ts` | 466 | Workers | Part of workers/ (16 files) |
| `src/semantic/vector-dump.ts` | 465 | Semantic | Vector operations |
| `src/semantic/libsql-adapter.ts` | 465 | Semantic | LibSQL adapter |
| `src/parsers/rust/ast-helpers.ts` | 462 | Parser | Part of rust/ submodule |
| `src/analysis/technology-detector.ts` | 462 | Analysis | Part of analysis/ (6 files) |
| `src/semantic/providers/tei-provider.ts` | 458 | Semantic | TEI provider |
| `src/tools/jscpd.ts` | 456 | Tools | Clone detection |
| `src/layered/layered-index-manager.ts` | 456 | Layered | Index management |
| `src/core/branch-manager.ts` | 456 | Core | Part of core/ (15 files) |
| `src/tracing/ngrx-trace-engine.ts` | 455 | Tracing | NgRx tracing |
| `src/analysis/chaos/chaos-analyzer.ts` | 455 | Analysis | Part of analysis/chaos/ |

---

## OK (400-450 lines)

| File | Lines | Type | Notes |
|------|-------|------|-------|
| `src/tools/tool-definitions.ts` | 444 | Tools | Tool definitions |
| `src/tools/handlers/analysis-tool-handlers.ts` | 443 | Tools | Analysis handlers |
| `src/modification/preview-manager.ts` | 443 | Modification | Preview management |
| `src/parsers/multipass/oxc-fast-parser.ts` | 442 | Parser | Part of multipass/ (4 files) |
| `src/layered/incremental-update-queue.ts` | 441 | Layered | Update queue |
| `src/agents/merge-agent.ts` | 440 | Agents | Merge agent |
| `src/core/resource-manager.ts` | 435 | Core | Resource management |
| `src/merge/indexing/multi-version-indexer.ts` | 434 | Merge | Part of merge/ (37 files) |
| `src/agents/semantic/embedding-processor.ts` | 433 | Agents | Part of agents/semantic/ |
| `src/semantic/embedding-router.ts` | 432 | Semantic | Embedding routing |
| `src/layered/layered-cache-manager.ts` | 429 | Layered | Cache management |
| `src/parsers/multipass/multipass-orchestrator.ts` | 426 | Parser | Part of multipass/ |
| `src/cli/setup/installers/ovms-installer.ts` | 424 | CLI | Part of cli/setup/ (19 files) |
| `src/merge/integration/git-integration.ts` | 422 | Merge | Git integration |
| `src/parsers/bash-analyzer.ts` | 419 | Parser | Bash analysis |
| `src/merge/engine/conflict-resolver.ts` | 417 | Merge | Conflict resolution |
| `src/semantic/providers/ovms-grpc-client.ts` | 414 | Semantic | gRPC client |
| `src/types/chaos-analysis.ts` | 407 | Types | Chaos analysis types |
| `src/agents/workers/worker-pool-manager.ts` | 401 | Workers | Pool management |

---

## Excluded from Analysis

| Category | Reason |
|----------|--------|
| `src/generated/**` | Auto-generated ANTLR files (Java20Parser: 23k, KotlinParser: 21k, RustParser: 20k lines) |

---

## TypeScript Errors Fixed During Refactoring

1. `conductor-orchestrator.ts` - Unused import `createMethodProposalTemplate`
2. `task-analysis.ts` - Type `unknown` not assignable to `boolean`
3. `parsing-subprocess-pool.ts` - Missing type `ParseResult`
4. `ngrx-parser.ts` - Unused NgRx type imports, missing `ParsedEntity`, `NgRxRelationship`
5. `rust/index.ts` - Duplicate exports `findNodes`, `getNodeText`
6. `ts-class-extractor.ts` - Unused destructured elements
7. `typescript-parser.ts` - Unused destructured elements
8. `autodoc-tool-handlers.ts` - Incompatible `normalizeInputPath` type
9. `file-tool-handlers.ts` - Unused imports `dirname`, `mkdir`
10. `ngrx-resolution.ts` - Unused import `Entity`

---

## Recommendations

1. **semantic-agent.ts** (2070 lines) - Could benefit from extracting `handleNewEntities` method (~600 lines) into separate module
2. **index.ts** (1282 lines) - Main entry point, difficult to reduce further
3. **Parsers** (800-935 lines) - Language-specific parsers with shared state, splitting would add complexity

---

## Module Architecture Summary

### Major Modular Systems

| Module | Files | Total Lines | Description |
|--------|-------|-------------|-------------|
| `src/semantic/` | 50+ | ~8000 | Semantic search, embeddings, GPU/Faiss |
| `src/autodoc/` | 29+ | ~5500 | Auto-documentation system |
| `src/parsers/` | 40+ | ~15000 | Language parsers (TypeScript, Python, Java, Go, Rust, etc.) |
| `src/tracing/` | 12 | ~6500 | Code flow tracing |
| `src/agents/` | 25+ | ~8000 | Agent orchestration, workers |
| `src/merge/` | 37 | ~4500 | Semantic merge engine |
| `src/storage/` | 15+ | ~4000 | LibSQL, graph storage |
| `src/layered/` | 12 | ~5000 | Layered indexing |
| `src/tools/` | 38 | ~5000 | MCP tool handlers |
| `src/cli/` | 19+ | ~3500 | CLI setup, installers |
| `src/core/` | 15 | ~3000 | Core services, DI, resource management |
| `src/analysis/` | 6 | ~1500 | Technology detection, chaos analysis |
| `src/modification/` | 3 | ~1000 | Code modification, preview |

---

## Created Modules (From Refactoring)

### `src/semantic/gpu/`
- `faiss-handlers.ts` (~700 lines) - Faiss index operations
- `cuda-handlers.ts` (~170 lines) - CUDA GPU operations
- `embeddings-handlers.ts` (~280 lines) - Embedding pipeline

### `src/agents/workers/`
- `embedding-processor.ts` (~387 lines) - Worker embedding generation
- `analyzer-loader.ts` (~135 lines) - Dynamic parser loading

### `src/agents/indexer/`
- `git-event-handlers.ts` (~210 lines) - Git event handling, debouncing
