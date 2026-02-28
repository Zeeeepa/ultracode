# Glossary of Terms

## A

### Agent
A specialized system component that performs a specific type of task. Inherits from `BaseAgent` and has a unified lifecycle (initialize → process → dispose).

### AST (Abstract Syntax Tree)
A structured representation of source code used by parsers to extract entities and relationships.

### AutoDoc
An automatic documentation generation subsystem. Creates AUTODOC.md files for each module based on code analysis and optionally LLM.

## B

### Backpressure
An overload protection mechanism. When limits are exceeded (memory, task queue), the system slows down acceptance of new requests or rejects them.

### Branch Layers
Layered storage for Git branches. Each feature branch creates its own layer on top of the parent; changes accumulate without modifying the base layer.

### Batch Operations
Grouping multiple operations (INSERT, UPDATE) into a single transaction to improve performance.

## C

### Chunking
Splitting text or code into parts (chunks) for processing. SmartChunker takes AST structure into account to preserve semantic integrity.

### ConductorOrchestrator
The central agent coordinator. Distributes tasks, manages priorities, and provides backpressure.

### Cosine Distance
A vector similarity metric used in semantic search. Values range from 0 (identical) to 2 (opposite).

### CTE (Common Table Expression)
An SQL construct for creating temporary named result sets. Used in Branch Layers for efficient data aggregation across multiple layers.

## D

### DIContainer
A Dependency Injection container — a pattern for managing dependencies between components. Supports singleton and transient lifetimes.

## E

### Embedding
A vector representation of text in a multidimensional space. Allows measuring semantic similarity between code fragments.

### Entity
The basic unit of the code graph: a function, class, interface, type, variable, etc. Has a unique ID, type, name, and code.

## F

### FQN (Fully Qualified Name)
The fully qualified name of a symbol, including its path: `MyNamespace.MyClass.myMethod`.

### FTS5
Full-Text Search 5 — an SQLite extension for full-text search with support for tokenization and ranking.

## G

### Graph Storage
The code graph storage in SQLite. Contains entities, relationships, and file metadata.

## H

### Hybrid Search
A combination of vector (semantic) and text (FTS) search to improve result accuracy.

## I

### Incremental Indexing
Updating only changed files instead of performing a full re-index.

### IR Model (Intermediate Representation)
An intermediate model representation in OpenVINO format (.xml + .bin), optimized for CPU inference.

## K

### KnowledgeBus
A Pub/Sub bus for asynchronous communication between agents. Supports topics and subscribers.

## L

### LiteRAG
Lightweight Retrieval-Augmented Generation — an architectural pattern for semantic search without heavy dependencies.

### Layer
An isolated data level in Branch Layers. Each Git branch creates its own layer, which inherits data from the parent.

### LibSQL
A fork of SQLite with additional capabilities (replication, HTTP API). Used as the primary storage with branch layer support.

### LRU Cache
Least Recently Used Cache — a cache that evicts the least recently used elements.

## M

### MCP (Model Context Protocol)
A protocol for communication between LLM clients (Claude, IDE) and tool servers. Based on JSON-RPC.

## N

### Native Parser
A parser that uses the language's native tooling (TypeScript Compiler API, Python ast, go/parser, etc.) instead of universal parsers.

## O

### onMessage Handler
An IPC message handler from a worker. Receives `ParseResponse` and matches results with tasks via `pendingTasks: Map<taskId, PendingTask>`.

### OpenVINO
Intel Open Visual Inference and Neural network Optimization — a framework for CPU inference of machine learning models.

## P

### ParsingSubprocessPool
A subprocess pool for parallel code parsing. Supports Bun and Node.js runtimes, IPC communication via V8 serialization, and dynamic worker scaling.

### PendingTask
A `{resolve, reject}` structure for storing callbacks of an incomplete parsing task. Stored in `Map<taskId, PendingTask>` to protect against race conditions during concurrent chunk processing.

### Provider
An implementation of the embedding generation interface: OVMS, TEI, Ollama, Transformers, vLLM.

## R

### Relationship
A directed connection between entities in the graph: imports, extends, implements, calls, uses, contains.

### ResourceManager
A system resource management component: memory, CPU, queue limits.

### RRF (Reciprocal Rank Fusion)
An algorithm for combining results from different search sources, taking into account positions in ranked lists.

## S

### Semantic Search
Search by meaning rather than exact text match. Based on comparing vector embeddings.

### SmartChunker
An intelligent code splitting component that takes AST structure and context into account.

### Snapshot
A file state snapshot for the ability to roll back changes. Stored in `.ultrasharp/snapshots/` or via git stash.

### SubprocessState
The state of a worker in ParsingSubprocessPool: ID, process, `pendingTasks: Map<taskId, PendingTask>`, statistics (tasks processed, memory, time). A key mechanism for correctly matching IPC responses with tasks.

### sqlite-vec
An SQLite extension for storing and searching vectors using SIMD optimizations.

## T

### TEI (Text Embeddings Inference)
A HuggingFace server for generating embeddings with GPU support via Docker.

### Tombstone
A deletion marker in Branch Layers. Instead of physically deleting an entity from the parent layer, a tombstone record is created in the current layer indicating that the entity has been deleted.

### Tool Handler
An MCP tool handler. Inherits from `BaseToolHandler`, validates parameters via Zod, and executes the logic.

## V

### Vector Store
A vector embedding storage. Uses sqlite-vec for efficient nearest neighbor search.

### VectorLite
An alternative backend for vector storage with support for various indexes.

## Z

### Zod
A schema validation library for TypeScript. Used for validating MCP tool parameters.

---

## Abbreviations

| Abbreviation | Definition |
|--------------|------------|
| AST | Abstract Syntax Tree |
| CPU | Central Processing Unit |
| CTE | Common Table Expression |
| DI | Dependency Injection |
| FQN | Fully Qualified Name |
| FTS | Full-Text Search |
| GPU | Graphics Processing Unit |
| IPC | Inter-Process Communication |
| IR | Intermediate Representation |
| JSON-RPC | JSON Remote Procedure Call |
| LLM | Large Language Model |
| LRU | Least Recently Used |
| MCP | Model Context Protocol |
| NPU | Neural Processing Unit |
| RAG | Retrieval-Augmented Generation |
| RRF | Reciprocal Rank Fusion |
| SIMD | Single Instruction Multiple Data |
| TEI | Text Embeddings Inference |

## Related Documents

- [→ ARCHITECTURE.md](./architecture.md) — system architecture
- [→ PROCESSES.md](./processes.md) — technical processes
- [→ DEPENDENCIES.md](./dependencies.md) — dependencies
