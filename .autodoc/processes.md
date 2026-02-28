# Technical Processes

## Overview

This document describes the internal technical processes of UltraCode: parsing, indexing, embedding generation, and resource management.

**Code navigation:**
- [📖 Storage AUTODOC](../src/storage/AUTODOC.md) — storage details
- [📖 Agents AUTODOC](../src/agents/AUTODOC.md) — agents and their methods
- [📖 Semantic AUTODOC](../src/agents/semantic/AUTODOC.md) — embeddings and search

## 1. Parsing Process

**Implementation:** [ParserAgent](../src/agents/parser-agent.ts) | [📖 Parsers AUTODOC](../src/parsers/AUTODOC.md)

### Native Parsers

Each language is processed by its own parser for maximum AST accuracy:

```
File (.ts/.py/.go/...)
        │
        ▼
┌───────────────────┐
│  Language Router  │
│  (by extension)   │
└─────────┬─────────┘
          │
    ┌─────┼─────┬─────┬─────┬─────┐
    │     │     │     │     │     │
    ▼     ▼     ▼     ▼     ▼     ▼
┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐
│TS/JS││Python││ Go  ││Rust ││Java ││ C++ │
│Comp.││ ast  ││pars.││ syn ││Pars.││clang│
│ API ││      ││     ││     ││     ││     │
└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘
   │      │      │      │      │      │
   └──────┴──────┴──────┴──────┴──────┘
                    │
                    ▼
          ┌─────────────────┐
          │  Unified Entity │
          │  { id, type,    │
          │    name, code,  │
          │    location }   │
          └─────────────────┘
```

### Extracted Entities

| Type | Description | Languages |
|------|-------------|-----------|
| `function` | Functions and methods | All |
| `class` | Classes | TS, Python, Java, C++, C#, Kotlin |
| `interface` | Interfaces | TS, Java, Go, Kotlin |
| `type` | Types/Aliases | TS, Go, Rust |
| `enum` | Enumerations | All |
| `variable` | Constants/Variables | All |
| `import` | Imports | All |
| `export` | Exports | TS, JS |

### Extracted Relationships

| Relationship Type | Description |
|-------------------|-------------|
| `imports` | A imports B |
| `exports` | A exports B |
| `extends` | A inherits B |
| `implements` | A implements B |
| `calls` | A calls B |
| `uses` | A uses type B |
| `contains` | A contains B (file → class → method) |

### Parallel Parsing via SubprocessPool

**Implementation:** [ParsingSubprocessPool](../src/agents/workers/parsing-subprocess-pool.ts) | [📖 Workers AUTODOC](../src/agents/workers/AUTODOC.md)

A subprocess pool is used to speed up parsing of large projects:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ParsingSubprocessPool                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Configuration:                                            │  │
│  │  - poolSize: up to 8 workers (by CPU count)               │  │
│  │  - maxFilesPerChunk: 100 files per worker                 │  │
│  │  - memoryLimitMB: 1500 (restart on exceeding)             │  │
│  │  - keepaliveMode: one worker remains for incremental use  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   ┌─────────┐               ┌─────────┐               ┌─────────┐
   │ Worker 0│               │ Worker 1│               │ Worker N│
   │ (Bun/   │               │ (Bun/   │               │ (Bun/   │
   │  Node)  │               │  Node)  │               │  Node)  │
   └────┬────┘               └────┬────┘               └────┬────┘
        │                         │                         │
        │ IPC (V8 serialization)  │                         │
        │                         │                         │
        └─────────────────────────┴─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  pendingTasks: Map      │
                    │  <taskId, {resolve,     │
                    │   reject}>              │
                    │  (race cond. protection)│
                    └─────────────────────────┘
```

**Key features:**
- **Cross-platform** — Bun and Node.js support through a unified interface
- **IPC with V8 serialization** — efficient data transfer without JSON
- **Map-based task tracking** — race condition protection during fast chunk processing
- **Dynamic scaling** — worker count depends on file volume
- **Keepalive mode** — one worker remains for fast incremental processing

## 2. Indexing Process

**Implementation:** [IndexerAgent](../src/agents/indexer-agent.ts) | [GraphStorageLibSQL](../src/storage/graph-storage-libsql.ts)

**Key methods:**
- [`insertEntities():123`](../src/storage/graph-storage-libsql.ts#L123) — batch insert of entities
- [`insertRelationships():303`](../src/storage/graph-storage-libsql.ts#L303) — batch insert of relationships

### Incremental Indexing

```
┌─────────────────────────────────────────────────────────────────┐
│                    Detect Changed Files                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  1. Git diff (if repository)                            │    │
│  │  2. File modification time comparison                   │    │
│  │  3. Hash comparison for suspicious files                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Process Changed Files                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  1. Parse changed files                                 │    │
│  │  2. Delete old entities for these files                 │    │
│  │  3. Insert new entities                                 │    │
│  │  4. Regenerate embeddings for affected entities         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Batch Operations

Batching is used for large codebases:

```typescript
// Batching configuration
const BATCH_CONFIG = {
  entityBatchSize: 500,      // Entities per transaction
  relationshipBatchSize: 1000, // Relationships per transaction
  embeddingBatchSize: 64,    // Embeddings per request
  commitInterval: 5000,      // ms between commits
};
```

### Memory Management During Indexing

```
ResourceManager
      │
      ▼
┌─────────────────────────────────────┐
│  Memory Monitoring                   │
│  ┌─────────────────────────────┐    │
│  │  process.memoryUsage()      │    │
│  │  heapUsed / heapTotal       │    │
│  └─────────────────────────────┘    │
└─────────────────────┬───────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   < 70% heap    70-85% heap    > 85% heap
   ┌────────┐    ┌────────┐    ┌────────┐
   │ Normal │    │ Reduce │    │ Pause  │
   │ batch  │    │ batch  │    │ + GC   │
   │ size   │    │ size   │    │ force  │
   └────────┘    └────────┘    └────────┘
```

## 3. Embedding Generation Process

**Implementation:** [SemanticAgent](../src/agents/semantic-agent.ts) | [📖 Semantic AUTODOC](../src/agents/semantic/AUTODOC.md)

**Key components:**
- [EmbeddingProcessor](../src/agents/semantic/embedding-processor.ts) — embedding processing
- [VectorIndexManager](../src/agents/semantic/vector-index-manager.ts) — FAISS indexes
- [SmartChunker](../src/semantic/smart-chunker.ts) — AST-aware splitting

### Embedding Pipeline

```
Entity Code
     │
     ▼
┌─────────────────────────────────────┐
│  SmartChunker                        │
│  ┌─────────────────────────────┐    │
│  │  1. Split by AST            │    │
│  │  2. Preserve context        │    │
│  │  3. Overlap for continuity  │    │
│  └─────────────────────────────┘    │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│  EmbeddingGenerator                  │
│  ┌─────────────────────────────┐    │
│  │  Provider selection:        │    │
│  │  - OVMS (CPU/GPU, fastest)  │    │
│  │  - TEI (GPU)                │    │
│  │  - Ollama (simple)          │    │
│  │  - Transformers (CPU)       │    │
│  └─────────────────────────────┘    │
└─────────────────────┬───────────────┘
                      │
                      ▼
┌─────────────────────────────────────┐
│  VectorStore (sqlite-vec)            │
│  ┌─────────────────────────────┐    │
│  │  INSERT INTO vectors        │    │
│  │  (entity_id, embedding)     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Embedding Providers

| Provider | Device | Speed | Quality | Setup |
|----------|--------|-------|---------|-------|
| OVMS | CPU/GPU | 1000+ chunks/s | High | Docker |
| TEI | GPU (NVIDIA) | 1000+ chunks/s | High | Docker |
| Ollama | CPU/GPU | 100-300 chunks/s | High | Easy |
| Transformers | CPU | 200 chunks/s | High | npm |
| vLLM | GPU | 500+ chunks/s | High | Docker |

### Embedding Model Selection

```
┌─────────────────────────────────────────────────────────────────┐
│                    Model Selection Flow                          │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Language Detection     │
                    │  (en / multilingual)    │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                                   │
              ▼                                   ▼
        ┌───────────┐                       ┌───────────┐
        │  English  │                       │  Multi    │
        │  Models   │                       │  Models   │
        └─────┬─────┘                       └─────┬─────┘
              │                                   │
              ▼                                   ▼
    ┌─────────────────┐                 ┌─────────────────┐
    │ nomic-embed-text│                 │ BGE-M3          │
    │ all-MiniLM-L6   │                 │ paraphrase-multi│
    │ CodeBERT        │                 │ E5-multilingual │
    └─────────────────┘                 └─────────────────┘
```

## 4. Agent Management

### Agent Lifecycle

```
┌────────────────────────────────────────────────────────────────┐
│                      Agent Lifecycle                            │
└────────────────────────────────────────────────────────────────┘

   CREATED          INITIALIZING        READY            PROCESSING
      │                  │                │                  │
      │  initialize()    │                │                  │
      │─────────────────>│                │                  │
      │                  │  deps loaded   │                  │
      │                  │───────────────>│                  │
      │                  │                │  process(task)   │
      │                  │                │─────────────────>│
      │                  │                │                  │
      │                  │                │<─────────────────│
      │                  │                │  result          │
      │                  │                │                  │
      │                  │                │                  │
   SHUTDOWN          DISPOSING                              │
      │                  │                                   │
      │  dispose()       │                                   │
      │<─────────────────│                                   │
      │                  │                                   │
```

### Backpressure Mechanism

```typescript
// ResourceManager tracks agent load
interface AgentMetrics {
  queueSize: number;      // Tasks in queue
  processingTime: number; // Average processing time
  errorRate: number;      // Error percentage
}

// Under overload:
// 1. Priority of current tasks is increased
// 2. New tasks are queued
// 3. Under critical load — new tasks are rejected
```

## 5. Search Process

### Hybrid Search

```
Query: "API error handling"
              │
              ├─────────────────┬─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
       ┌───────────┐     ┌───────────┐     ┌───────────┐
       │  Vector   │     │   Text    │     │  Entity   │
       │  Search   │     │  Search   │     │  Search   │
       │           │     │           │     │           │
       │ cosine    │     │ FTS5      │     │ name/type │
       │ distance  │     │ MATCH     │     │ regex     │
       └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
             │                 │                 │
             │    scores       │    scores       │    scores
             │                 │                 │
             └─────────────────┴─────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Score Fusion      │
                    │   (weighted RRF)    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Re-ranking        │
                    │   (optional LLM)    │
                    └──────────┬──────────┘
                               │
                               ▼
                       Final Results
```

### Ranking Formula

```
score = α × vector_score + β × text_score + γ × entity_score

where:
  α = 0.5  (semantic similarity)
  β = 0.3  (text match)
  γ = 0.2  (exact name/type match)
```

## 6. Branch Layers Process

**Implementation:** [📖 Storage AUTODOC](../src/storage/AUTODOC.md)

**Key methods:**
- [`setProject():92`](../src/storage/graph-storage-libsql.ts#L92) — switch project/branch
- [`getEntityFromBranch():180`](../src/storage/graph-storage-libsql.ts#L180) — retrieve accounting for layers
- [`findEntitiesInBranch():203`](../src/storage/graph-storage-libsql.ts#L203) — search with tombstones
- [`compareEntitiesBetweenBranches():221`](../src/storage/graph-storage-libsql.ts#L221) — branch comparison

### Layered Storage for Git Branches

When switching branches, the system creates layered storage:

```
┌─────────────────────────────────────────────────────────────────┐
│                     switch_branch("feature/auth")               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              1. Resolve parent branch                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  git merge-base feature/auth main → common ancestor      │    │
│  │  Parent layer = main                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. Create layer database                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  .ultracode/branches/feature-auth.db                   │    │
│  │  Tables: entities, relationships, tombstones             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              3. Incremental index                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Changed files → parse → store in layer                  │    │
│  │  Deleted entities → tombstone markers                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Tombstone Mechanism

```
Entity in main: { id: "fn_123", name: "processUser" }
                     │
                     │ Deleted in feature/auth
                     ▼
Tombstone in feature/auth: { entity_id: "fn_123", deleted_at: ... }
                     │
                     │ Query accounting for tombstones
                     ▼
         ┌─────────────────────────┐
         │ SELECT * FROM entities  │
         │ WHERE id NOT IN (       │
         │   SELECT entity_id      │
         │   FROM tombstones       │
         │   WHERE branch = ?      │
         │ )                       │
         └─────────────────────────┘
```

### LRU Cleanup

Old branches are automatically removed by LRU:

```typescript
// Configuration
const BRANCH_CONFIG = {
  maxBranches: 20,      // Maximum branches in cache
  cleanupDays: 30,      // Remove branches older than N days
};
```

## 7. Code Modification Process

### Safe Editing

```
modify_code(entityId, newCode)
              │
              ▼
       ┌─────────────────┐
       │  1. Snapshot    │
       │  (create_snapshot)│
       └────────┬────────┘
                │
                ▼
       ┌─────────────────┐
       │  2. Parse new   │
       │  code (AST)     │
       └────────┬────────┘
                │
                ▼
       ┌─────────────────┐
       │  3. Validate    │
       │  (syntax check) │
       └────────┬────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   Valid             Invalid
        │               │
        ▼               ▼
   ┌─────────┐    ┌─────────┐
   │ Apply   │    │ Rollback│
   │ changes │    │ snapshot│
   └────┬────┘    └─────────┘
        │
        ▼
   ┌─────────────────┐
   │  4. Update graph│
   │  & embeddings   │
   └─────────────────┘
```

## 8. AutoDoc Enrichment

### Enriching Search with Documentation

Semantic search is automatically enriched with documentation from `.autodoc/`:

```
semantic_search("error handling")
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│              1. Vector search over code                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  FAISS search → top-K entities                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. AutoDoc lookup                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  For each entity:                                       │    │
│  │  - Find related docs by entity_id                       │    │
│  │  - Extract descriptions, examples                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              3. Merge results                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  {                                                       │    │
│  │    entity: { id, name, code },                          │    │
│  │    documentation: { description, examples },            │    │
│  │    score: combined_score                                │    │
│  │  }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Related Documents

- [→ ARCHITECTURE.md](./architecture.md) — system architecture
- [→ FLOW.md](./flow.md) — usage scenarios
- [→ DEPENDENCIES.md](./dependencies.md) — dependencies
