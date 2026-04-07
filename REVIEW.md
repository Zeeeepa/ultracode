# Code Review — April 2026

## Overview

Health score: **40/100** (UltraCode detect_patterns).
Security scan: **0 vulnerabilities**.
Duplicates (file-level): **0** at 0.75 threshold.

Tooling: UltraCode MCP — `detect_patterns`, `analyze_hotspots`, `analyze_state_chaos`, `find_duplicates`, `security_scan`, `suggest_refactoring`.

---

## What Was Fixed

### Block A: Performance (commit `649f413`)

| Phase | File | Change | Impact |
|-------|------|--------|--------|
| 10 | `logging/fixed-logger.ts` | `flush()` → async `appendFile`, added `flushSync()` for shutdown | Event loop unblocked during logging |
| 11 | `semantic/vector-store.ts` | Sequential `await getDocument()` × 50 → `Promise.all()` | ~1.5s saved per vector search |
| 12 | `analysis/base-usage-detector.ts` | N+1 queries → parallel fetch + parallel update | 1100 → 2 DB queries |
| 13 | `storage/libsql/entity-ops.ts` | New `deleteEntitiesBatch()` with `IN (...)` clause | ~100x faster batch delete |
| 14 | `storage/graph-storage-libsql.ts` | Level-based BFS + parallel relationship fetch | 200 → ~20 queries for 100-node subgraph |

### TEI Embedding Tuning (commit `649f413`)

Root cause chain for TEI 429 errors:
1. `parallelBatches=16` in `embedding-accumulator.ts` (hardcoded) — **real** concurrency control
2. `parser-agent.ts` overrode accumulator defaults with own hardcoded `8` for TEI
3. `concurrency=16` in `config/development.yaml` — **irrelevant** (only limits intra-batch splitting)
4. `maxBatchSize=500` in `tei-provider.ts` — **irrelevant** (batches already ≤ 256)

Fix: centralized config chain `YAML → config-types → yaml-config → worker-embedding-config → parser-agent → accumulator`. Optimal values: `parallelBatches=4`, `queueBatchSize=256`.

TEI server: `--max-concurrent-requests 1024 --max-batch-tokens 32768 --max-batch-requests 512`.

### Block B: God Functions (partial)

| Phase | File | Change |
|-------|------|--------|
| 15 | `analysis/patterns/structural-detector.ts` | `evaluateOptional` CC=137 → 6 category helpers + 4 static `chkMin/chkMax/chkHas/chkBoolEq` |
| 16 | `agents/dev-agent.ts` | Extracted `runCrossDomainLinking()` with table-driven linkers |

### Other Fixes

- `setup-ui.ts`: `prompt()` — `console.error()` for Unicode display on Windows CMD
- `setup-ui.ts`: `\\.\CON` device path to avoid conflict with files named `CON` in cwd
- `tracing/graphology-path-builder.ts`: `loadGraph` — sequential DB access instead of `Promise.all` (prevents native crash)

---

## What Was NOT Changed — And Why

### convertCSharpResult (CC=70, parser-agent.ts:127)

**Decision:** Keep as-is.
**Reason:** CC=70 comes from ~30 small independent if-blocks (2-3 lines each) for C# metadata mapping: modifiers, inheritance, calls, complexity, docs, params, type params, control flow, hints. Inner functions `convert()` and `flatten()` are already extracted. Strategy Map would add indirection without improving readability — each block is already trivial.

### ZigNativeParser.parseWithRegex (CC=56, zig-native-parser.ts:192)

**Decision:** Keep as-is.
**Reason:** CC=56 from 10 independent `while (regex.exec())` loops, each 15-25 lines with clear section headers (IMPORTS, STRUCTS, ENUMS, UNIONS, ERROR SETS, FUNCTIONS, TESTS, COMPTIME, CONSTANTS, VARIABLES). Body parsers (`parseStructBody`, `parseEnumBody`, `extractCallsAndControlFlow`) already extracted as separate methods. Extracting each while-loop into a method would add 10 tiny methods with no reuse.

### processTask in 3 workers (CC=49 each)

**Decision:** Keep as-is.
**Reason:** Three workers run in **separate processes** with fundamentally different logic:
- `parser-worker.ts` (181 LOC) — thin wrapper, calls `parser.parseFile()`
- `python-worker.ts` (255 LOC) — Python-specific with 4-layer timing
- `generic-language-worker.ts` (931 LOC) — multi-language with analyzer dispatch

Shared code is only task-loop boilerplate (~10 lines). A base class would require importable module in subprocess context for minimal gain.

### vector-delta.ts (14 "similar fragments")

**Decision:** Keep as-is.
**Reason:** 372 lines, well-structured class. "14 fragments" detected by token similarity = iterating `addedEmbeddings` and `modifiedEmbeddings` Maps in different methods (`clone`, `toJSON`, `fromJSON`, `mergeWith`, `getMemoryUsage`). Each method does semantically different work. Extracting `forEachVector()` helper would obscure the logic for 2 lines saved per method.

### llm-provider.ts — Split 6 classes into files

**Decision:** Deferred.
**Reason:** 1475 LOC, 6 `LLMProvider` implementations (Ollama, TGI, OpenAI, DockerModelRunner, LlamaCpp, ClaudeCode). Splitting requires creating 6 files + factory + updating all imports across the project. High risk of breaking import chains in batch refactoring. Should be done as a standalone focused task.

### index.ts — main/poll/executeToolCall (CC=61/61/21)

**Decision:** Deferred.
**Reason:** MCP server entry point. `main()` initializes all subsystems, `poll()` handles JSON-RPC message loop, `executeToolCall()` dispatches 80+ tools. Refactoring risks breaking the entire server startup/shutdown flow. Requires dedicated testing session.

### branch-manager.ts + skills-installer.ts — sync → async I/O

**Decision:** Deferred.
**Reason:** `branch-manager.ts` has 30 sync calls including `execSync` for git operations. Converting git commands to async `exec` can be unstable (race conditions with concurrent git access). `skills-installer.ts` runs once at cold startup — sync I/O impact is negligible.

### State Chaos in config (chaos=95/100)

**Decision:** Not planned.
**Reason:** `config` identifier scattered across 60 files with 100+ writers. This is architectural — the project uses multiple config sources (YAML, semantic-config.json, env vars) merged at runtime. Centralizing into a single service would require 1-2 weeks and doesn't justify the ROI. The current merge chain (yaml-config.ts → ConfigLoader) works correctly.

### Mutable Exports in shell scripts (694 occurrences)

**Decision:** Ignore.
**Reason:** Normal bash pattern (`export PATH=...`, `export CUDA_PATH=...`). False positive from pattern detector.

### Function Call in Template (491 occurrences)

**Decision:** Ignore.
**Reason:** False positive. Detector looks for Angular-style template function calls, but UltraCode is a Node.js CLI — no Angular templates exist.

---

## Known Issues

### taint_analysis crashes MCP server

**Symptom:** Native crash (no JS exception, no log entry) when running `taint_analysis(category: "all")`.
**Root cause:** BFS traversal over 30K-node graph with 46K edges at `maxDepth=10` — exponential growth causes memory pressure or native crash in graphology/Bun.
**Workaround:** Don't use `taint_analysis` with `category: "all"` on large projects. Use specific categories (`injection`, `xss`, etc.) or reduce `maxDepth`.
**Status:** Needs investigation — may require BFS depth limiting or iterative deepening in `TaintFlowAnalyzer`.
