# Worker Threads Architecture

## Overview

UltraScript Tools MCP использует subprocess-based worker pool для параллельного парсинга и генерации embeddings.

**Status:** PRODUCTION - workers выполняют parsing + embedding generation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS                                       │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ ParserAgent     │    │ SemanticAgent   │    │ IndexerAgent    │          │
│  │                 │    │                 │    │                 │          │
│  │ Coordinates     │    │ Loads dumps     │    │ Stores entities │          │
│  │ worker pool     │    │ into Faiss      │    │ in graph DB     │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           ▼                      │                      │                    │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    LanguageWorkerPool                            │        │
│  │                                                                  │        │
│  │  Manages subprocess workers per language                         │        │
│  │  Smart threshold: >50 files activates workers                    │        │
│  │  Language-specific pool sizes based on parser speed              │        │
│  └───────────────────────────┬──────────────────────────────────────┘        │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Worker 1       │   │  Worker 2       │   │  Worker N       │
│  (subprocess)   │   │  (subprocess)   │   │  (subprocess)   │
│                 │   │                 │   │                 │
│  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │
│  │ Parser    │  │   │  │ Parser    │  │   │  │ Parser    │  │
│  │ (Native)  │  │   │  │ (Native)  │  │   │  │ (Native)  │  │
│  └─────┬─────┘  │   │  └─────┬─────┘  │   │  └─────┬─────┘  │
│        │        │   │        │        │   │        │        │
│        ▼        │   │        ▼        │   │        ▼        │
│  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │
│  │ Embedding │  │   │  │ Embedding │  │   │  │ Embedding │  │
│  │ Client    │  │   │  │ Client    │  │   │  │ Client    │  │
│  │ (HTTP)    │  │   │  │ (HTTP)    │  │   │  │ (HTTP)    │  │
│  └─────┬─────┘  │   │  └─────┬─────┘  │   │  └─────┬─────┘  │
│        │        │   │        │        │   │        │        │
│        ▼        │   │        ▼        │   │        ▼        │
│  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │
│  │ Dump File │  │   │  │ Dump File │  │   │  │ Dump File │  │
│  │ Writer    │  │   │  │ Writer    │  │   │  │ Writer    │  │
│  └───────────┘  │   │  └───────────┘  │   │  └───────────┘  │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    .vector-dump/    │
                    │    Binary files     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    TEI / vLLM       │
                    │    (HTTP Server)    │
                    └─────────────────────┘
```

---

## Worker Responsibilities

Каждый worker выполняет **полный pipeline** для своих файлов:

### 1. Parsing (Native Parsers)

| Language | Parser | Speed |
|----------|--------|-------|
| TypeScript/JS | TypeScript Compiler API | ~15-20ms/file |
| Python | `python -c "import ast"` | ~266ms/file |
| Java | JavaParser JAR | ~50ms/file |
| Kotlin | kotlin-compiler | ~60ms/file |
| Go | go/parser | ~10ms/file |
| Rust | rust-analyzer | ~30ms/file |
| C/C++ | clang -ast-dump | ~15ms/file |
| Bash | Native regex | ~5ms/file |

### 2. Entity Filtering

```typescript
// Low-value types EXCLUDED from embedding generation:
const EMBEDDING_EXCLUDE_ENTITY_TYPES = new Set([
  "import",        // Boilerplate
  "export",        // Boilerplate
  "module",        // Structure only
  "constant",      // Simple values
  "variable",      // Simple values
  "method",        // Duplicate (in class embedding)
  "property",      // Duplicate (in class embedding)
  "async_function" // Variant
]);

// HIGH-VALUE types that GET embeddings:
// class, function, interface, type, enum
```

### 3. Local Deduplication

```typescript
// Track generated entity IDs to prevent duplicate API calls
const generatedEntityIds = new Set<string>();

// Before calling TEI/vLLM:
if (generatedEntityIds.has(entityId)) {
  skippedDuplicates++;
  continue;  // Skip expensive API call
}

// After successful generation:
generatedEntityIds.add(entityId);
```

### 4. Embedding Generation

```typescript
// Lightweight HTTP client (no heavy dependencies)
const embeddings = await embeddingClient.generateBatch(texts);

// Batch processing: 3 waves in parallel
// Each wave: up to batchSize texts (default 32)
```

### 5. Vector Dump Writing

```typescript
// Binary format for efficient storage
// Flush every 500 vectors
if (vectorDumpBuffer.length >= 500) {
  flushVectorDump();  // Write to .vector-dump/worker-{id}-batch-{n}.bin
}
```

---

## Worker Pool Configuration

### Pool Sizes (by parser speed)

```typescript
const LANGUAGE_POOL_SIZES = {
  python: 4,      // Slow parser (~266ms/file)
  typescript: 3,  // Medium (~15-20ms/file)
  javascript: 3,
  java: 3,
  kotlin: 3,
  go: 2,          // Fast (~10-15ms/file)
  rust: 2,
  c: 2,
  cpp: 2,
};
```

### Activation Threshold

```typescript
const WORKER_THRESHOLD = 50;  // Min files to activate workers

// Below threshold: direct parsing (no worker overhead)
// Above threshold: spawn workers for parallelism
```

### Config (production.yaml)

```yaml
parser:
  agent:
    batchSize: 50          # Files per worker batch
    workerPoolSize: 4      # Max workers
    maxConcurrency: 4      # Parallel parsing ops
```

---

## Communication Protocol

### Main → Worker (Task)

```typescript
interface WorkerTask {
  id: string;
  files: string[];
  language: string;
  options?: ParserOptions;
  streamingMode?: boolean;  // Enable streaming results
}
```

### Worker → Main (Result)

```typescript
interface WorkerResult {
  taskId: string;
  results: ParseResult[];
  errors?: Array<{ file: string; message: string }>;
  stats: {
    filesProcessed: number;
    totalTime: number;
    avgTimePerFile: number;
    language: string;
  };
}
```

### Worker → Main (Streaming Result) — NEW

```typescript
// Sent immediately after parsing each file (streaming mode)
{
  type: "streaming_result",
  taskId: string,
  result: ParseResult,     // Single file result
  fileIndex: number,       // 0-based index
  totalFiles: number       // Total files in batch
}
```

**Преимущества streaming mode:**
- Главный процесс начинает индексацию **сразу** после парсинга первого файла
- Нет ожидания завершения всего batch'а
- Память распределяется равномернее (результаты обрабатываются по мере поступления)

### Worker → Main (Vectors Written)

```typescript
// Notification that vectors were written to dump files
{
  type: "vectors.written",
  count: vectorDumpTotalWritten,
  dumpDir: vectorDumpDir,
  workerId: id
}
```

---

## Performance

### Parsing + Indexing Speedup (Streaming Mode)

| Project Size | Without Streaming | With Streaming | Speedup |
|--------------|-------------------|----------------|---------|
| Small (<50 files) | Direct | Direct | N/A (threshold) |
| Medium (152 files) | ~16.8s | ~10.5s | **1.6x (37% faster)** |
| Large (500+ files) | ~45s | ~28s | **1.6x** |

### Data Files Processing (Parallel)

| Operation | Sequential | Parallel (Promise.all) | Speedup |
|-----------|------------|------------------------|---------|
| 174 JSON/YAML files | ~6.7s | **195ms** | **34x faster** |
| Throughput | ~26 files/s | **892 files/s** | **34x** |

### Streaming Mode Benefits

```
Batch mode (old):
  1. Parse all files → 2. Wait → 3. Index all
  Timeline: [===PARSE===][WAIT][===INDEX===]

Streaming mode (new):
  Parse file → Index immediately → Parse next
  Timeline: [P1][I1][P2][I2][P3][I3]...

→ 37% faster overall (parsing + indexing overlap)
→ 91.6% files indexed via streaming (495/527)
→ 8.4% via fallback (empty results, errors)
```

### Memory Impact

```
Without workers: ~500MB baseline
With 4 parser workers: ~700MB (+40%)
With embedding in workers: ~800MB (+60%)

→ Workers isolate crashes (subprocess dies, main survives)
→ Memory reclaimed when subprocess exits
→ Streaming reduces peak memory (no full batch accumulation)
```

---

## Worker Lifecycle

### Standard Mode (Batch)

```
1. Main: scanFiles() → group by language
2. Main: getWorkerPool(language) → lazy create pool
3. Main: pool.processFiles(files) → spawn subprocess
4. Worker: receive task via IPC
5. Worker: parse files with native parser
6. Worker: filter entities (exclude low-value types)
7. Worker: deduplicate (local Set)
8. Worker: generate embeddings (HTTP to TEI/vLLM)
9. Worker: write to dump file (binary format)
10. Worker: send all results to main (IPC)
11. Worker: notify vectors written
12. Main: collect results, update graph DB
13. Main: generateEmbeddingsFromStorage() → load dumps into Faiss
14. Main: terminate workers (or reuse for next batch)
```

### Streaming Mode (NEW)

```
1. Main: setStreamingMode(true, callback)
2. Main: scanFiles() → group by language
3. Main: getWorkerPool(language) → lazy create pool
4. Main: pool.processFiles(files, { streamingMode: true })
5. Worker: receive task via IPC
6. FOR EACH file:
   6a. Worker: parse file with native parser
   6b. Worker: send streaming_result immediately via IPC
   6c. Main: callback(result) → index immediately
7. Worker: send final batch result (stats, errors)
8. Main: filter out already-indexed files
9. Main: index remaining files (fallback for errors)
10. Main: generateEmbeddingsFromStorage()
```

**Key difference:** В streaming mode индексация происходит **параллельно** с парсингом следующих файлов, а не после завершения всего batch'а.

---

## Error Handling

| Error | Handling |
|-------|----------|
| Worker crash | Subprocess dies, main logs error, continues |
| Parser failure | Error logged, file skipped, other files continue |
| Embedding failure | Batch logged, continues without embedding |
| Dump write failure | Falls back to IPC transfer (legacy) |

### Graceful Degradation

```typescript
class ParserAgent {
  async parse(file: string): Promise<any> {
    if (this.workerPool && files.length > WORKER_THRESHOLD) {
      try {
        return await this.workerPool.parse(file);
      } catch (error) {
        console.warn('Worker failed, falling back to sync');
      }
    }
    // Fallback to synchronous parsing
    return await this.parseSync(file);
  }
}
```

---

## Related Documentation

- [Embedding Pipeline](./embedding-pipeline.md) - Detailed embedding flow
- [Agents](./agents.md) - Agent architecture
- [CLAUDE.md](../CLAUDE.md) - Project overview
