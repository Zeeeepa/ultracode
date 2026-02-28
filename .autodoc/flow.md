# Data Flows and Usage Scenarios

## Overview

This document describes the main usage scenarios of UltraCode and data flows between system components.

**Entry points:**
- MCP Server: [src/index.ts](../src/index.ts)
- Tool Handlers: [📖 Tools AUTODOC](../src/tools/AUTODOC.md)
- Conductor: [📖 Agents AUTODOC](../src/agents/AUTODOC.md)

## Main Scenarios (User Stories)

### 1. Codebase Indexing

**Implementation:** [IndexToolHandler](../src/tools/handlers/index-tool-handler.ts) → [IndexerAgent](../src/agents/indexer-agent.ts)

**Scenario**: A developer wants to index a project for semantic search.

```
User                            MCP Server                     Agents
    │                               │                              │
    │  index(directory, reset)      │                              │
    │──────────────────────────────>│                              │
    │                               │  1. Clear graph (if reset)   │
    │                               │  2. Clear vectors            │
    │                               │                              │
    │                               │  AgentTask(type="index")     │
    │                               │─────────────────────────────>│
    │                               │                              │
    │                               │         ParserAgent          │
    │                               │         ┌──────────┐         │
    │                               │         │ AST parse│         │
    │                               │         │ 10 langs │         │
    │                               │         └────┬─────┘         │
    │                               │              │               │
    │                               │         IndexerAgent         │
    │                               │         ┌──────────┐         │
    │                               │         │ SQLite   │         │
    │                               │         │ batch    │         │
    │                               │         └────┬─────┘         │
    │                               │              │               │
    │                               │         SemanticAgent        │
    │                               │         ┌──────────┐         │
    │                               │         │Embeddings│         │
    │                               │         │ vectors  │         │
    │                               │         └──────────┘         │
    │                               │                              │
    │  { entities: 6904,           │                              │
    │    relationships: 12000 }    │                              │
    │<──────────────────────────────│                              │
```

**Steps**:
1. MCP client calls `index` with parameters
2. With `reset=true`, the graph and vector store are cleared
3. ConductorOrchestrator creates a task and distributes it among agents
4. ParserAgent parses files through native parsers
5. IndexerAgent saves entities and relationships to SQLite
6. SemanticAgent generates embeddings for semantic search
7. Indexing statistics are returned

### 2. Semantic Search

**Implementation:** [SemanticToolHandlers](../src/tools/handlers/semantic-tool-handlers.ts) → [SemanticAgent](../src/agents/semantic-agent.ts)

**Scenario**: A developer searches for code by meaning rather than exact match.

```
User                            MCP Server                     Components
    │                               │                              │
    │  semantic_search(             │                              │
    │    "API error handling"       │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   EmbeddingGenerator         │
    │                               │   ┌─────────────────┐        │
    │                               │   │ query → vector  │        │
    │                               │   │ (OpenVINO CPU)  │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   VectorStore (sqlite-vec)   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ cosine_distance │        │
    │                               │   │ top-K search    │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   HybridSearch               │
    │                               │   ┌─────────────────┐        │
    │                               │   │ combine scores  │        │
    │                               │   │ rank results    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  [                            │                              │
    │    { entity: "handleApiError",│                              │
    │      score: 0.92,             │                              │
    │      file: "src/api/errors.ts"│                              │
    │    }, ...                     │                              │
    │  ]                            │                              │
    │<──────────────────────────────│                              │
```

**Steps**:
1. The query is converted to a vector via EmbeddingGenerator
2. VectorStore performs cosine search via sqlite-vec
3. HybridSearch combines vector and text search
4. Results are ranked and returned to the client

### 3. Change Impact Analysis

**Scenario**: A developer wants to understand what will break when modifying a function.

```
User                            MCP Server                     Storage
    │                               │                              │
    │  analyze_code_impact(         │                              │
    │    entityId: "UserService",   │                              │
    │    depth: 3                   │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   GraphStorage               │
    │                               │   ┌─────────────────┐        │
    │                               │   │ 1. Find entity  │        │
    │                               │   │ 2. Get incoming │        │
    │                               │   │    references   │        │
    │                               │   │ 3. Traverse     │        │
    │                               │   │    depth levels │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  {                            │                              │
    │    directDependents: 5,       │                              │
    │    transitiveDependents: 23,  │                              │
    │    affectedFiles: [           │                              │
    │      "src/controllers/...",   │                              │
    │      "src/services/...",      │                              │
    │    ]                          │                              │
    │  }                            │                              │
    │<──────────────────────────────│                              │
```

### 4. Documentation Generation (AutoDoc)

**Scenario**: A developer wants to automatically generate documentation for modules.

```
User                            MCP Server                     Components
    │                               │                              │
    │  autodoc_generate(            │                              │
    │    useLlm: true,              │                              │
    │    preview: false             │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   1. Module scanning         │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Find index.ts   │        │
    │                               │   │ Grouping        │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   2. Export analysis          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ GraphStorage    │        │
    │                               │   │ relationships   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   3. LLM generation          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Ollama API      │        │
    │                               │   │ qwen3-coder     │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   4. Save .md files          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ AUTODOC.md      │        │
    │                               │   │ per module      │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  { generated: 53 files }      │                              │
    │<──────────────────────────────│                              │
```

### 5. Code Duplicate Detection

**Scenario**: A developer searches for duplicate code for refactoring.

```
User                            MCP Server                     Components
    │                               │                              │
    │  detect_code_clones(          │                              │
    │    minSimilarity: 0.8         │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   VectorStore                │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Get all vectors │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   Similarity Matrix          │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Pairwise cosine │        │
    │                               │   │ distance calc   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   Clustering                 │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Group similar   │        │
    │                               │   │ entities        │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  [                            │                              │
    │    { similarity: 0.95,        │                              │
    │      entities: [              │                              │
    │        "validateUser",        │                              │
    │        "validateAdmin"        │                              │
    │      ]                        │                              │
    │    }, ...                     │                              │
    │  ]                            │                              │
    │<──────────────────────────────│                              │
```

### 6. Git Branch Switching

**Implementation:** [BranchToolHandlers](../src/tools/handlers/branch-tool-handlers.ts) → [GraphStorageLibSQL.setProject():92](../src/storage/graph-storage-libsql.ts#L92)

**Scenario**: A developer switches to a feature branch and wants to keep the index up to date.

```
User                            MCP Server                     Storage
    │                               │                              │
    │  switch_branch(               │                              │
    │    "feature/auth"             │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │                              │
    │                               │   1. Resolve parent branch   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ git merge-base  │        │
    │                               │   │ → find "main"   │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   2. Create layer DB         │
    │                               │   ┌─────────────────┐        │
    │                               │   │ feature-auth.db │        │
    │                               │   │ (inherits main) │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   3. Detect changed files    │
    │                               │   ┌─────────────────┐        │
    │                               │   │ git diff main.. │        │
    │                               │   └────────┬────────┘        │
    │                               │            │                 │
    │                               │   4. Incremental index       │
    │                               │   ┌─────────────────┐        │
    │                               │   │ Parse changed   │        │
    │                               │   │ Add tombstones  │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  { branch: "feature/auth",    │                              │
    │    newEntities: 23,           │                              │
    │    deletedEntities: 5 }       │                              │
    │<──────────────────────────────│                              │
```

### 7. Multi-Project Workflow

**Scenario**: A developer works with multiple projects simultaneously.

```
User                            MCP Server                     Storage
    │                               │                              │
    │  index(                       │                              │
    │    directory: "/project-a"    │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   setProject("/project-a")   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ project-a.db    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  index(                       │                              │
    │    directory: "/project-b"    │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   setProject("/project-b")   │
    │                               │   ┌─────────────────┐        │
    │                               │   │ project-b.db    │        │
    │                               │   └─────────────────┘        │
    │                               │                              │
    │  semantic_search(             │                              │
    │    query: "auth",             │                              │
    │    projectPath: "/project-a"  │                              │
    │  )                            │                              │
    │──────────────────────────────>│                              │
    │                               │   Switch to project-a.db     │
    │                               │   Search in that context     │
    │<──────────────────────────────│                              │
```

## Data Flows Between Agents

### Event Publishing via KnowledgeBus

```
ParserAgent                    KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("entity:parsed",     │                              │
    │    { entity, file })          │                              │
    │──────────────────────────────>│                              │
    │                               │  notify IndexerAgent         │
    │                               │─────────────────────────────>│
    │                               │  notify SemanticAgent        │
    │                               │─────────────────────────────>│
    │                               │                              │

IndexerAgent                   KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("index:completed",   │                              │
    │    { stats })                 │                              │
    │──────────────────────────────>│                              │
    │                               │  notify SemanticAgent        │
    │                               │─────────────────────────────>│
    │                               │                              │

SemanticAgent                  KnowledgeBus                    Subscribers
    │                               │                              │
    │  publish("semantic:ready",    │                              │
    │    { vectorCount })           │                              │
    │──────────────────────────────>│                              │
    │                               │  notify QueryAgent           │
    │                               │─────────────────────────────>│
```

### KnowledgeBus Topics

| Topic | Publisher | Subscribers | Description |
|-------|----------|-------------|-------------|
| `entity:parsed` | ParserAgent | IndexerAgent, SemanticAgent | New entity parsed |
| `entity:modified` | DevAgent | SemanticAgent | Entity modified |
| `index:completed` | IndexerAgent | SemanticAgent | Indexing completed |
| `semantic:embeddings:complete` | SemanticAgent | QueryAgent | Embeddings ready |
| `file:changed` | DevAgent | ParserAgent | File changed (incremental indexing) |

## Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MCP Client Request                            │
│                         (Claude Code, IDE, etc.)                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MCP Server (src/index.ts)                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. JSON-RPC validation                                         │    │
│  │  2. Routing to tool handler                                     │    │
│  │  3. Zod parameter validation                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tool Handler Layer                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  IndexToolHandler / QueryToolHandler / etc.                     │    │
│  │  - Create AgentTask                                             │    │
│  │  - Delegate to ConductorOrchestrator                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ConductorOrchestrator                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Task prioritization                                         │    │
│  │  2. Agent selection by task type                                │    │
│  │  3. Backpressure control (ResourceManager)                      │    │
│  │  4. Parallel execution coordination                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │  Parser   │ │  Indexer  │ │ Semantic  │
            │   Agent   │ │   Agent   │ │   Agent   │
            └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                  │             │             │
                  └─────────────┼─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Storage Layer                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │    GraphStorage      │  │    VectorStore       │                     │
│  │    (SQLite)          │  │    (sqlite-vec)      │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Related Documents

- [→ ARCHITECTURE.md](./architecture.md) — system architecture
- [→ PROCESSES.md](./processes.md) — technical processes
- [→ DEPENDENCIES.md](./dependencies.md) — dependencies
