# Embedding Pipeline Architecture

## Overview

Система генерации embeddings полностью вынесена в worker-процессы. Main process только загружает готовые dump-файлы в Faiss индекс.

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
│  6. GENERATE EMBEDDINGS (TEI/vLLM HTTP)                                    │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ WorkerEmbeddingClient.generateBatch(texts)                   │        │
│     │                                                              │        │
│     │ → HTTP POST to TEI/vLLM endpoint                            │        │
│     │ → Returns Float32Array[] embeddings                          │        │
│     │                                                              │        │
│     │ Batch processing: up to 3 batches in parallel                │        │
│     │ Batch size: configurable (default 32)                        │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  7. MARK AS GENERATED                                                       │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ generatedEntityIds.add(entityId)                             │        │
│     │                                                              │        │
│     │ → Prevents duplicate generation in same worker session       │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  8. WRITE TO DUMP BUFFER                                                    │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ addVectorToDump(entityId, embedding: Float32Array)           │        │
│     │                                                              │        │
│     │ vectorDumpBuffer.push({ id, vector })                        │        │
│     │                                                              │        │
│     │ if (buffer.length >= 500) → flushVectorDump()               │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  9. FLUSH TO FILE                                                           │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ Binary format: worker-{id}-batch-{index}.bin                 │        │
│     │                                                              │        │
│     │ Header (12 bytes):                                           │        │
│     │   - magic: 0x56454354 ("VECT")                              │        │
│     │   - version: 1                                               │        │
│     │   - dimensions: 384 (or model dim)                           │        │
│     │   - count: number of entries                                 │        │
│     │                                                              │        │
│     │ Entry (variable):                                            │        │
│     │   - id_length: 2 bytes (uint16)                              │        │
│     │   - id: variable UTF-8 string                                │        │
│     │   - vector: dimensions × 4 bytes (float32)                   │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                              │                                               │
│                              ▼                                               │
│  10. NOTIFY MAIN PROCESS                                                    │
│      ┌─────────────────────────────────────────────────────────────┐       │
│      │ postWorkerMessage({                                          │       │
│      │   type: "vectors.written",                                   │       │
│      │   count: totalWritten,                                       │       │
│      │   dumpDir: vectorDumpDir,                                    │       │
│      │   workerId: id                                               │       │
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
  provider: string;              // "tei" | "vllm" | "ollama"
  endpoint: string;              // TEI/vLLM HTTP endpoint
  modelName: string;             // Model identifier
  dimensions: number;            // 384, 768, 1024, etc.
  maxTokens: number;             // Max tokens per request
  contextTokens: number;         // Model context window
  batchSize: number;             // Texts per batch (default: 32)
  vectorDumpDir: string;         // Path to dump directory
}
```

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

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Batch size | 32 texts | Configurable via config |
| Parallel batches | 3 waves | Within each worker |
| Dump threshold | 500 vectors | Flush to file after 500 |
| Worker pool size | 2-4 | Per language, based on parser speed |
| Worker threshold | 50 files | Below this, direct parsing (no workers) |

### Throughput (TEI/vLLM)

| Setup | Speed | Notes |
|-------|-------|-------|
| TEI (CPU) | ~1,000 emb/s | Intel i9 |
| TEI (GPU) | ~5,000 emb/s | RTX 4090 |
| vLLM (GPU) | ~8,000 emb/s | RTX 4090, batched |

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
