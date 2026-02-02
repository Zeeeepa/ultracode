# Embedding Pipeline Architecture

## Overview

**Централизованная архитектура (v2.6+):** Workers отправляют тексты в Main process через IPC. Main process генерирует embeddings централизованно с оптимальным batching и без HTTP contention.

**Преимущества:**
- ✅ Один поток батчей к embedding API (vLLM/OVMS/OpenAI) вместо N workers конкурирующих
- ✅ Оптимальный batching — Main собирает больше текстов перед отправкой
- ✅ Лучший rate limiting — Main контролирует concurrency
- ✅ Нет HTTP connection contention между workers
- ✅ **8x ускорение** парсинга (16 → 130+ files/sec для TypeScript)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INDEXING FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User: index({ directory: "/project" })                                     │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     MAIN PROCESS (index.ts)                          │   │
│  │                                                                      │   │
│  │  1. Scan files by language                                           │   │
│  │  2. Create LanguageWorkerPool                                        │   │
│  │  3. Dispatch files to workers (batches of ~50)                       │   │
│  │  4. Wait for all workers to complete                                 │   │
│  │  5. Call generateEmbeddingsFromStorage() → load dump files           │   │
│  └───────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         ▼                    ▼                    ▼                          │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │  Worker 1   │     │  Worker 2   │     │  Worker N   │                   │
│  │  (Python)   │     │  (TS/JS)    │     │  (Rust)     │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┴───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│                   ┌─────────────────┐                                       │
│                   │  .vector-dump/  │                                       │
│                   │  ├── worker-1-*.bin                                     │
│                   │  ├── worker-2-*.bin                                     │
│                   │  └── worker-N-*.bin                                     │
│                   └────────┬────────┘                                       │
│                            │                                                │
│                            ▼                                                │
│                   ┌─────────────────┐                                       │
│                   │ FaissProvider   │                                       │
│                   │ loadFromDump()  │                                       │
│                   └────────┬────────┘                                       │
│                            │                                                │
│                            ▼                                                │
│                   ┌─────────────────┐                                       │
│                   │  faiss.index    │                                       │
│                   │  (HNSW M=32)    │                                       │
│                   └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Worker Embedding Flow (Детально)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKER PROCESS (generic-language-worker.ts)              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. RECEIVE TASK                                                            │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ { files: ["/path/to/file.ts", ...], language: "typescript" } │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  2. PARSE FILE                                                              │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ UnifiedParser.parse(filePath, content, hash)                 │        │
│     │ → ParseResult { entities: ParsedEntity[], ... }              │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  3. FILTER ENTITY TYPES                                                     │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ EMBEDDING_EXCLUDE_ENTITY_TYPES:                              │        │
│     │   - import, export, module                                   │        │
│     │   - constant, variable                                       │        │
│     │   - method, property (в классах - дубликаты)                 │        │
│     │   - async_function                                           │        │
│     │                                                              │        │
│     │ KEEP: class, function, interface, type, enum                 │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  4. LOCAL DEDUPLICATION                                                     │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ generatedEntityIds: Set<string>                              │        │
│     │                                                              │        │
│     │ entityId = `ent:${filePath}:${type}:${name}`                │        │
│     │                                                              │        │
│     │ if (generatedEntityIds.has(entityId)) → SKIP                 │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  5. BUILD EMBEDDING TEXT                                                    │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ buildEmbeddingText(entity, fileContent, contextTokens)       │        │
│     │                                                              │        │
│     │ Parts:                                                       │        │
│     │   1. Header: name + type + signature                         │        │
│     │   2. Code snippet (truncated to maxTokens)                   │        │
│     │   3. Documentation description                               │        │
│     │   4. Return type                                             │        │
│     │                                                              │        │
│     │ maxTokens = contextTokens (model limit, e.g. 8192)          │        │
│     │ charsPerToken = 2.0 (conservative for code)                  │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  6. SEND TEXTS TO MAIN (CENTRALIZED MODE) — every 10 files                 │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ if (results.length % 10 === 0) {                             │        │
│     │   sendCollectedTexts({ postWorkerMessage, getWorkerId });    │        │
│     │ }                                                            │        │
│     │                                                              │        │
│     │ → Sends { type: "embeddings.texts", texts: [...] }          │        │
│     │ → Main process receives texts via IPC                       │        │
│     │ → Main generates embeddings centrally (no HTTP contention)  │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  7. MARK AS SENT                                                            │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ collectedTexts.length = 0  // Clear buffer after send        │        │
│     │                                                              │        │
│     │ → Prevents duplicate texts in same batch                    │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  8. CONTINUE PARSING                                                        │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ Worker continues parsing next files...                       │        │
│     │                                                              │        │
│     │ Main process generates embeddings in parallel via:          │        │
│     │   - EmbeddingAccumulator (queue with threshold batching)    │        │
│     │   - Single connection to vLLM/OVMS/OpenAI                   │        │
│     │   - Optimal batch size based on provider                    │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  9. FINAL FLUSH                                                             │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ At end of batch: sendCollectedTexts()                       │        │
│     │                                                              │        │
│     │ → Sends remaining texts to Main                             │        │
│     │ → Main flushes accumulator queue                            │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  10. RETURN RESULTS                                                         │
│      ┌─────────────────────────────────────────────────────────────┐       │
│      │ postWorkerMessage({                                          │       │
│      │   type: "result",                                            │       │
│      │   results: parsedEntities,                                   │       │
│      │   // No embeddings — Main handles those                     │       │
│      │ })                                                           │       │
│      └─────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Two-Level Deduplication

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEDUPLICATION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LEVEL 1: Worker Local (generatedEntityIds Set)                             │
│  ═══════════════════════════════════════════════                             │
│                                                                              │
│  Purpose: Prevent duplicate embedding generation within single worker        │
│                                                                              │
│  When: Before calling TEI/vLLM API                                          │
│                                                                              │
│  Benefit: Saves expensive HTTP calls to embedding service                    │
│                                                                              │
│  Scope: Per-worker session (cleared on worker restart)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  const generatedEntityIds = new Set<string>();              │            │
│  │                                                              │            │
│  │  // Before generation:                                       │            │
│  │  if (generatedEntityIds.has(entityId)) {                     │            │
│  │    skippedDuplicates++;                                      │            │
│  │    continue;  // Skip TEI call                               │            │
│  │  }                                                           │            │
│  │                                                              │            │
│  │  // After successful generation:                             │            │
│  │  generatedEntityIds.add(entityId);                           │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
│                              ▼                                               │
│                                                                              │
│  LEVEL 2: Faiss Global (idMap)                                              │
│  ══════════════════════════════                                              │
│                                                                              │
│  Purpose: Prevent duplicate vectors in HNSW index                            │
│                                                                              │
│  When: During loadFromDumpFiles() in main process                            │
│                                                                              │
│  Benefit: Ensures index integrity, prevents bloat                            │
│                                                                              │
│  Scope: Global (persists across sessions via faiss.index file)               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │  class FaissProvider {                                       │            │
│  │    private idMap: Map<string, number>;  // entityId → faissId │            │
│  │                                                              │            │
│  │    loadFromDumpFiles(dimensions: number) {                   │            │
│  │      for (const entry of dumpEntries) {                      │            │
│  │        if (this.idMap.has(entry.id)) {                       │            │
│  │          skipped++;                                          │            │
│  │          continue;  // Already in index                      │            │
│  │        }                                                     │            │
│  │        this.addVector(entry.id, entry.vector);               │            │
│  │        loaded++;                                             │            │
│  │      }                                                       │            │
│  │    }                                                         │            │
│  │  }                                                           │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Entity Type Filtering

| Entity Type | Indexed | Embedding | Reason |
|-------------|---------|-----------|--------|
| `class` | ✅ | ✅ | High value - contains structure |
| `function` | ✅ | ✅ | High value - standalone logic |
| `interface` | ✅ | ✅ | High value - contracts |
| `type` | ✅ | ✅ | High value - type definitions |
| `enum` | ✅ | ✅ | High value - constants |
| `import` | ✅ | ❌ | Low value - boilerplate |
| `export` | ✅ | ❌ | Low value - boilerplate |
| `module` | ✅ | ❌ | Low value - structure only |
| `constant` | ✅ | ❌ | Low value - simple values |
| `variable` | ✅ | ❌ | Low value - simple values |
| `method` | ✅ | ❌ | Duplicate - included in class |
| `property` | ✅ | ❌ | Duplicate - included in class |
| `async_function` | ✅ | ❌ | Variant of function |

**Note**: All entities indexed in graph DB for navigation/LSP, but only high-value types get embeddings for semantic search.

---

## Main Process: Loading Dump Files

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS: generateEmbeddingsFromStorage()            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Purpose: Finalize embeddings after all workers complete                     │
│                                                                              │
│  Flow:                                                                       │
│                                                                              │
│  1. Check if already running (prevent duplicate calls)                       │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ if (this.isGeneratingEmbeddings) {                          │        │
│     │   return { generated: 0, skipped: 0 };  // Skip             │        │
│     │ }                                                           │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  2. Get worker embedding config                                              │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ const workerConfig = buildWorkerEmbeddingConfig(false);      │        │
│     │ // false = don't clean dump dir yet                          │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  3. Load remaining dump files into Faiss                                     │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ const faissProvider = this.vectorStore.getFaissProvider();   │        │
│     │                                                              │        │
│     │ // FALLBACK: Load any files not loaded incrementally        │        │
│     │ const result = await faissProvider.loadFromDumpFiles(dims);  │        │
│     │                                                              │        │
│     │ // With incremental loading, most already loaded via         │        │
│     │ // onVectorsWritten callback                                 │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  4. Flush and save Faiss index                                               │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ await this.vectorStore.flushAndSave();                       │        │
│     │                                                              │        │
│     │ // Saves to: faiss.index, faiss.idmap.json                  │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  5. Return stats                                                             │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ return { generated: 0, skipped: 0 };                         │        │
│     │ // Workers did all generation, main just loads               │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Worker Embedding Config (`config/worker-embedding-config.ts`)

```typescript
interface WorkerEmbeddingConfig {
  enabled: boolean;              // Enable embedding in workers
  provider: string;              // "vllm" | "ovms-native" | "openai" | "ollama"
  endpoint: string;              // API endpoint (used by Main in centralized mode)
  modelName: string;             // Model identifier
  dimensions: number;            // 384, 768, 1024, etc.
  maxTokens: number;             // Max tokens per request
  contextTokens: number;         // Model context window
  batchSize: number;             // Texts per batch in Main process (default: 32)
  queueBatchSize: number;        // Accumulator threshold (default: 128)
  centralizedEmbeddings: true;   // ALWAYS true (v2.6+) — all providers centralized
}
```

**Key changes in v2.6:**
- `centralizedEmbeddings: true` for ALL providers (was only ovms/llamacpp)
- Workers send texts via IPC every 10 files
- Main process accumulates texts and generates embeddings centrally
- `batchSize` and `queueBatchSize` control Main's batching strategy
- No more `vectorDumpDir` — embeddings go directly to vector store

### Dump Directory Structure

```
.vector-dump/
├── worker-subprocess-worker-1-batch-000000.bin
├── worker-subprocess-worker-1-batch-000001.bin
├── worker-subprocess-worker-2-batch-000000.bin
├── worker-subprocess-worker-2-batch-000001.bin
├── worker-subprocess-worker-2-batch-000002.bin
└── ...
```

---

## Performance Characteristics (Centralized Mode)

| Metric | Value | Notes |
|--------|-------|-------|
| Batch size | 32-128 texts | Main process batching |
| Queue threshold | 128 texts | Accumulator flush point |
| IPC frequency | Every 10 files | Workers → Main text streaming |
| Worker pool size | 2-6 | Per language, based on parser speed |
| Optimal chunk size | 40 files | Balance IPC overhead vs contention |

### Throughput (Centralized Embeddings)

**TypeScript (523 files, 6 workers, vLLM):**
- **Total indexing:** 3.1 seconds (~169 files/sec)
- **Parsing speed:** 130-140 files/sec (было 16 files/sec decentralized)
- **Speedup:** 8x faster parsing, 2.5x faster overall

**Decentralized vs Centralized:**

| Mode | Files/sec | Total time | HTTP contention |
|------|-----------|------------|-----------------|
| Decentralized | 16 | 7.8s | High (6 workers → vLLM) |
| **Centralized** | **130-140** | **3.1s** | None (Main → vLLM) |

**Embedding API Throughput:**

| Provider | Speed | Notes |
|----------|-------|-------|
| vLLM (GPU) | ~8,000 emb/s | RTX 5090, centralized batching |
| OVMS (CPU) | ~1,000 emb/s | Intel i9, no GPU contention |
| OpenAI API | ~500 emb/s | Rate limited, centralized reduces calls |

---

## Error Handling

1. **TEI/vLLM unavailable**: Worker logs warning, continues parsing without embeddings
2. **Batch failure**: Logged, other batches continue
3. **File write failure**: Logged, falls back to IPC transfer (legacy)
4. **Duplicate entity**: Skipped silently (deduplication working)

---

## Related Files

| File | Purpose |
|------|---------|
| `src/agents/workers/generic-language-worker.ts` | Worker implementation |
| `src/agents/workers/worker-embedding-client.ts` | Lightweight HTTP client |
| `src/agents/semantic-agent.ts` | Main process coordination |
| `src/semantic/faiss/faiss-provider.ts` | Faiss index management |
| `src/config/worker-embedding-config.ts` | Config builder |
