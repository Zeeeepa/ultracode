# Multi-Agent Architecture

## Overview

UltraScript Tools MCP использует многоагентную архитектуру LiteRAG с координацией через `ConductorOrchestrator`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONDUCTOR ORCHESTRATOR                                │
│                                                                              │
│  Координация задач, распределение нагрузки, lifecycle management             │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
        ┌───────────┬───────────────┼───────────────┬───────────┐
        │           │               │               │           │
        ▼           ▼               ▼               ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ ParserAgent │ │ IndexerAgent│ │SemanticAgent│ │ QueryAgent  │ │  DevAgent   │
│             │ │             │ │             │ │             │ │             │
│ AST parsing │ │ Graph DB    │ │ Vector ops  │ │ Graph query │ │ File ops    │
│ via workers │ │ storage     │ │ Faiss index │ │ execution   │ │ incremental │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │               │               │               │           │
        │               │               │               │           │
        └───────────────┴───────────────┴───────────────┴───────────┘
                                    │
                        ┌───────────┴───────────┐
                        │    KnowledgeBus       │
                        │   (Pub/Sub Events)    │
                        └───────────────────────┘
```

---

## Agents

### ParserAgent

**Роль:** Координация парсинга через worker pool

**Ключевые функции:**
- Сканирование файлов по языкам
- Управление LanguageWorkerPool
- Dispatch файлов в workers
- Сбор результатов парсинга

**Взаимодействие:**
- → Workers: отправка задач на парсинг
- → IndexerAgent: передача entities для хранения
- ← Workers: получение ParseResult + embeddings

```typescript
class ParserAgent {
  private workerPool: LanguageWorkerPool;

  async parse(files: string[]): Promise<ParseResult[]> {
    if (files.length > 50) {
      return this.workerPool.processFiles(files);
    }
    return this.parseSync(files);
  }
}
```

---

### IndexerAgent

**Роль:** Хранение entities и relationships в graph DB

**Ключевые функции:**
- Batch insert entities (транзакции)
- Управление relationships
- File-level операции (delete, update)
- Incremental indexing

**Взаимодействие:**
- ← ParserAgent: entities для хранения
- → GraphStorage: SQL операции
- → KnowledgeBus: события об индексации

```typescript
class IndexerAgent {
  async storeEntities(entities: Entity[]): Promise<void> {
    await this.graphStorage.transaction(async () => {
      for (const batch of chunks(entities, 1000)) {
        await this.graphStorage.batchInsert(batch);
      }
    });

    knowledgeBus.publish("indexer:complete", { count: entities.length });
  }
}
```

---

### SemanticAgent

**Роль:** Управление vector store и semantic search

**Ключевые функции:**
- Загрузка dump файлов в Faiss
- Semantic search (cosine similarity)
- Hybrid search (vector + keyword)
- Code clone detection

**Взаимодействие:**
- ← Workers: векторы через dump files
- → FaissProvider: HNSW index operations
- → KnowledgeBus: события о генерации

**Важно:** SemanticAgent НЕ генерирует embeddings напрямую. Workers делают это и пишут в dump файлы.

```typescript
class SemanticAgent {
  // Main только загружает готовые dump файлы
  async generateEmbeddingsFromStorage(): Promise<Stats> {
    const faiss = this.vectorStore.getFaissProvider();

    // Workers уже сгенерировали и записали vectors
    // Main только загружает оставшиеся файлы
    const result = await faiss.loadFromDumpFiles(dimensions);

    await this.vectorStore.flushAndSave();
    return result;
  }

  async search(query: string, topK: number): Promise<SearchResult[]> {
    const embedding = await this.embeddingGen.generate(query);
    return this.vectorStore.searchSimilar(embedding, topK);
  }
}
```

---

### QueryAgent

**Роль:** Выполнение запросов к graph DB

**Ключевые функции:**
- Entity queries (by name, type, path)
- Relationship traversal
- Call graph analysis
- Impact analysis

**Взаимодействие:**
- → GraphStorage: SQL queries
- → SemanticAgent: semantic search (hybrid mode)

```typescript
class QueryAgent {
  async findEntity(name: string): Promise<Entity[]> {
    return this.graphStorage.query(
      `SELECT * FROM entities WHERE name LIKE ?`,
      [`%${name}%`]
    );
  }

  async getCallGraph(methodId: string): Promise<CallGraph> {
    return this.graphStorage.traverseRelationships(
      methodId,
      "calls",
      { maxDepth: 10 }
    );
  }
}
```

---

### DevAgent

**Роль:** Операции разработки и file watching

**Ключевые функции:**
- File change detection
- Incremental re-indexing
- Code modification
- Snapshot management

**Взаимодействие:**
- → GitWatcher: отслеживание изменений
- → ParserAgent: re-parse изменённых файлов
- → IndexerAgent: update entities

```typescript
class DevAgent {
  async handleFileChange(files: string[]): Promise<void> {
    // Debounce multiple changes
    await this.debounce(300);

    // Re-parse changed files
    const results = await this.parserAgent.parse(files);

    // Update index
    await this.indexerAgent.updateEntities(results);
  }
}
```

---

### DoraAgent

**Роль:** Специализированный анализ метрик

**Ключевые функции:**
- Cyclomatic complexity
- Cognitive complexity
- Code hotspots
- Coupling analysis

---

## Communication

### KnowledgeBus (Pub/Sub)

Агенты общаются через KnowledgeBus:

```typescript
// Publisher
knowledgeBus.publish("indexer:complete", {
  files: 150,
  entities: 3500,
  relationships: 8200
}, agentId);

// Subscriber
knowledgeBus.subscribe(agentId, "indexer:complete", (entry) => {
  console.log(`Indexed ${entry.data.entities} entities`);
});
```

### События

| Event | Publisher | Subscribers | Data |
|-------|-----------|-------------|------|
| `indexer:complete` | IndexerAgent | SemanticAgent | { files, entities } |
| `semantic:embeddings:complete` | SemanticAgent | DevAgent | { generated, skipped } |
| `parser:files:parsed` | ParserAgent | IndexerAgent | { results } |
| `git:branch:changed` | GitWatcher | IndexerAgent | { branch, files } |
| `git:files:changed` | GitWatcher | DevAgent | { files } |

---

## Resource Management

### ResourceManager

Централизованное управление ресурсами:

```typescript
class ResourceManager {
  private memoryLimit: number;
  private cpuLimit: number;

  async acquireResources(agent: Agent): Promise<void> {
    if (this.isOverloaded()) {
      throw new AgentBusyError({ retryAfterMs: 1000 });
    }
    this.allocate(agent.capabilities);
  }

  releaseResources(agent: Agent): void {
    this.deallocate(agent.capabilities);
  }
}
```

### Backpressure

При перегрузке агенты возвращают `AgentBusyError`:

```typescript
try {
  await semanticAgent.search(query);
} catch (error) {
  if (error instanceof AgentBusyError) {
    // Retry after suggested delay
    await sleep(error.retryAfterMs);
    return semanticAgent.search(query);
  }
  throw error;
}
```

---

## Dependency Injection

### DIContainer

```typescript
const container = getGlobalContainer();

// Register agents
await registerAllAgents(container);

// Resolve agents
const devAgent = await getOrCreateAgent(container, conductor, AgentType.DEV);
const semanticAgent = await getOrCreateAgent(container, conductor, AgentType.SEMANTIC);
```

### Agent Registry

```typescript
// Auto-registration of all agents
await registerAllAgents(container);

// Lazy initialization - agents created on first request
const agent = await getOrCreateAgent(container, conductor, AgentType.PARSER);
```

---

## Lifecycle

```
1. Server Start
   → DIContainer.initialize()
   → ConductorOrchestrator.start()
   → AgentRegistry.registerAll()

2. Index Request
   → ParserAgent.parse() → spawn workers
   → Workers: parse + generate embeddings → dump files
   → IndexerAgent.storeEntities()
   → SemanticAgent.generateEmbeddingsFromStorage() → load dumps

3. Search Request
   → QueryAgent.query() (graph search)
   → SemanticAgent.search() (vector search)
   → Merge results

4. File Change
   → GitWatcher.onFileChange()
   → DevAgent.handleFileChange()
   → Incremental re-index

5. Server Shutdown
   → ConductorOrchestrator.stop()
   → Workers.terminate()
   → DIContainer.dispose()
```

---

## Configuration

```yaml
# config/default.yaml
agents:
  parser:
    maxConcurrency: 4
    workerPoolSize: 4
    batchSize: 50

  indexer:
    batchSize: 1000
    transactionSize: 5000

  semantic:
    maxConcurrency: 5
    memoryLimit: 240
    batchSize: 8

  query:
    maxConcurrency: 10
    cacheSize: 5000
```

---

## Related Documentation

- [Worker Threads](./worker-threads.md) - Worker pool architecture
- [Embedding Pipeline](./embedding-pipeline.md) - Embedding generation flow
- [CLAUDE.md](../CLAUDE.md) - Project overview
