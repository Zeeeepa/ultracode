# Multi-Process Architecture & Worker Threads

Consolidated documentation covering the multi-process architecture (Comm proxy, Core server, multi-client support), worker subprocess pool, streaming mode, and transport protocol.

---

## Architecture Overview

```
+-------------------------------------------------------------------------+
|                              IDE Instances                               |
+------+--------+--------+--------+---------------------------------------+
| VS Code    | VS Code    | Cursor     | Claude Code                      |
| Project A  | Project B  | Project A  | Project C                        |
+------+-----+------+-----+------+-----+------+---------------------------+
       |            |            |            |
       v            v            v            v
+------+-----+------+-----+------+-----+------+---------------------------+
| Comm #1    | Comm #2    | Comm #3    | Comm #4                          |
| (APE proxy)| (APE proxy)| (APE proxy)| (APE proxy)                      |
| Cosmopolit.| Cosmopolit.| Cosmopolit.| Cosmopolitan                     |
| <10ms init | <10ms init | <10ms init | <10ms init                       |
+------+-----+------+-----+------+-----+------+---------------------------+
       |            |            |            |
       |    TCP Socket (Windows) / Unix Domain Socket                      |
       |    127.0.0.1:51734 / /tmp/ultrascript-core.sock                  |
       v            v            v            v
+-------------------------------------------------------------------------+
|                  ultrascript-tools-core (multi-client)                   |
|  +-------------------------------------------------------------------+  |
|  |                     Main Thread (Bun)                              |  |
|  |  - Multi-client Connection Manager                                |  |
|  |  - MCP Server per client (isolated sessions)                      |  |
|  |  - Request Router (dispatches to agents)                          |  |
|  |  - Storage Manager (shared SQLite, VectorDB)                      |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
|  +-----------+-----------+-----------+-----------+-----------+           |
|  | Client #1 | Client #2 | Client #3 | Client #N |           |          |
|  | MCP Srv   | MCP Srv   | MCP Srv   | MCP Srv   |  Shared:  |          |
|  | (session) | (session) | (session) | (session) |  - Agents |          |
|  +-----------+-----------+-----------+-----------+  - SQLite |          |
|                                                     - Vector |          |
|  +--------------+--------------+--------------+     - Cache  |          |
|  | Parser       | Indexer      | Semantic     |  +-----------+          |
|  | Agent        | Agent        | Agent        |                         |
|  +--------------+--------------+--------------+                         |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                %LOCALAPPDATA%\UltraScriptTools\                         |
|  +-- config.yaml                 (global settings)                      |
|  +-- logs\                       (all logs)                             |
|  +-- cache\                      (parsed AST cache)                     |
|  +-- projects\                                                          |
|  |   +-- {project-hash-1}\                                              |
|  |   |   +-- graph.db            (entities, relationships)              |
|  |   |   +-- vectors.db          (embeddings)                           |
|  |   |   +-- branches\           (branch-specific data)                 |
|  |   +-- {project-hash-2}\                                              |
|  +-- models\                     (embedding models cache)               |
+-------------------------------------------------------------------------+
```

## Key Features

- **Multi-client support**: One Core process serves multiple IDE instances simultaneously
- **Cosmopolitan APE binary**: Comm proxy works on Windows/Linux/macOS without recompilation
- **Fast startup**: Comm initializes in <10ms, Core spawns on first connection
- **Shared resources**: All clients share agents, SQLite DB, vector store, and cache
- **Session isolation**: Each client gets its own MCP Server instance with separate state

---

## Components

### 1. Comm Proxy (ultrascript-tools-comm)

**Purpose**: Lightweight MCP proxy that IDE connects to. Ultra-fast startup (<10ms).

**Implementation**: Cosmopolitan Libc (C) -- compiles to a single APE binary that runs on Windows/Linux/macOS.

**Responsibilities**:
- Accept MCP protocol from IDE (stdio)
- Connect to Core process via TCP socket
- Forward all MCP messages bidirectionally
- Spawn Core via `bun` or `node` if not running
- Transparent proxy (no message parsing)

**File**: `src/comm/comm.c`

**Build**:
```bash
# Requires cosmocc (Cosmopolitan C compiler)
# Output: dist/ultrascript-tools.com (APE binary, ~50KB)
./src/comm/build.ps1
```

**Connection flow**:
```
1. IDE spawns Comm via stdio
2. Comm tries to connect to 127.0.0.1:51734
3. If connection refused:
   - Find bun/node runtime
   - Spawn: bun dist/index.js --pipe
   - Wait for TCP port to open
4. Forward stdin -> TCP, TCP -> stdout
5. On EOF -- close connection
```

### 2. Core Server (ultrascript-tools-core)

**Purpose**: Heavy processing engine. Single instance serves all IDE connections.

**Implementation**: TypeScript (Bun/Node.js)

**Responsibilities**:
- Listen on TCP socket (127.0.0.1:51734) or Unix socket
- Create separate MCP Server instance for each client
- Share agents, SQLite DB, vector store across all clients
- Worker thread pool for parallel parsing
- Graceful shutdown when last client disconnects

**File**: `src/index.ts` (pipe mode via `--pipe` flag)

**Key architecture**:

```typescript
// Factory creates new MCP Server for each client
function createMcpServer(): Server {
  const srv = new Server({ name, version }, { capabilities });
  srv.setRequestHandler(ListToolsRequestSchema, () => ({ tools: getToolsList() }));
  srv.setRequestHandler(CallToolRequestSchema, (req) => executeToolCall(req));
  return srv;
}

// Multi-client connection handler
await pipeServer.start(async (clientTransport) => {
  clientCount++;
  const clientServer = createMcpServer();

  clientTransport.onclose = () => {
    console.error(`Client #${clientCount} disconnected`);
  };

  await clientServer.connect(clientTransport);
  console.error(`Client #${clientCount} ready`);
});
```

**Shared resources** (singleton):
- `GraphStorage` -- SQLite entities/relationships
- `VectorStore` -- Embeddings database
- `ConductorOrchestrator` -- Agent coordinator
- `ParserAgent`, `IndexerAgent`, `SemanticAgent` -- Processing agents
- `KnowledgeBus` -- Inter-agent communication

### 3. Worker Subprocess Pool

**Purpose**: Parallel parsing and embedding generation via subprocess workers.

**Files**:
- `src/agents/workers/parsing-subprocess-pool.ts` -- subprocess pool management
- `src/agents/workers/generic-language-worker.ts` -- universal worker for all 10 languages

**Architecture**:

```
+---------------------------------------------------------------------+
|                         MAIN PROCESS                                 |
|                                                                      |
|  +-----------------+  +-----------------+  +-----------------+       |
|  | ParserAgent     |  | SemanticAgent   |  | IndexerAgent    |       |
|  | Coordinates     |  | Loads dumps     |  | Stores entities |       |
|  | worker pool     |  | into Faiss      |  | in graph DB     |       |
|  +--------+--------+  +--------+--------+  +--------+--------+       |
|           |                                                          |
|  +---------------------------------------------------------------+   |
|  |                    LanguageWorkerPool                          |   |
|  |  Manages subprocess workers per language                      |   |
|  |  Smart threshold: >50 files activates workers                 |   |
|  |  Language-specific pool sizes based on parser speed            |   |
|  +----------------------------+----------------------------------+   |
+------------------------------ | -------------------------------------+
                                |
        +-----------------------+-----------------------+
        |                       |                       |
        v                       v                       v
+-----------------+   +-----------------+   +-----------------+
| Worker 1        |   | Worker 2        |   | Worker N        |
| (subprocess)    |   | (subprocess)    |   | (subprocess)    |
|  Parser (Native)|   |  Parser (Native)|   |  Parser (Native)|
|  Embedding HTTP |   |  Embedding HTTP |   |  Embedding HTTP |
|  Dump Writer    |   |  Dump Writer    |   |  Dump Writer    |
+-----------------+   +-----------------+   +-----------------+
```

---

## Worker Responsibilities

Each worker executes the **full pipeline** for its files:

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

Low-value types **excluded** from embedding generation:

```typescript
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

if (generatedEntityIds.has(entityId)) {
  skippedDuplicates++;
  continue;  // Skip expensive API call
}
generatedEntityIds.add(entityId);
```

### 4. Embedding Generation

Lightweight HTTP client calls TEI/vLLM/OVMS for batch embedding generation.

### 5. Vector Dump Writing

Binary format for efficient storage. Flushes every 500 vectors to `.vector-dump/worker-{id}-batch-{n}.bin`.

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

### Production Configuration

```yaml
# config/production.yaml
parser:
  agent:
    batchSize: 50          # Files per worker batch
    workerPoolSize: 4      # Max workers
    maxConcurrency: 4      # Parallel parsing ops
```

---

## Streaming Mode

Workers can operate in **streaming mode**, where results are sent immediately after parsing each file instead of waiting for the entire batch to complete.

### How It Works

```
Batch mode (old):
  1. Parse all files -> 2. Wait -> 3. Index all
  Timeline: [===PARSE===][WAIT][===INDEX===]

Streaming mode (new):
  Parse file -> Index immediately -> Parse next
  Timeline: [P1][I1][P2][I2][P3][I3]...

Result: 37% faster overall (parsing + indexing overlap)
```

### API

```typescript
// Enable streaming in ParserAgent
parserAgent.setStreamingMode(true, async (result, taskId, fileIndex, totalFiles) => {
  // Index immediately as results arrive
  await indexerAgent.indexEntities(result.entities, result.filePath, result.relationships);
});
```

### Streaming Workflow

```
1. Main: setStreamingMode(true, callback)
2. Main: scanFiles() -> group by language
3. Main: getWorkerPool(language) -> lazy create pool
4. Main: pool.processFiles(files, { streamingMode: true })
5. Worker: receive task via IPC
6. FOR EACH file:
   6a. Worker: parse file with native parser
   6b. Worker: send streaming_result immediately via IPC
   6c. Main: callback(result) -> index immediately
7. Worker: send final batch result (stats, errors)
8. Main: filter out already-indexed files
9. Main: index remaining files (fallback for errors)
10. Main: generateEmbeddingsFromStorage()
```

### Performance

| Project Size | Without Streaming | With Streaming | Speedup |
|--------------|-------------------|----------------|---------|
| Small (<50 files) | Direct | Direct | N/A (threshold) |
| Medium (152 files) | ~16.8s | ~10.5s | **1.6x (37% faster)** |
| Large (500+ files) | ~45s | ~28s | **1.6x** |

- **91.6%** of files indexed via streaming (495/527 in benchmark)
- **8.4%** via fallback (empty results, errors)

### Data Files Processing (Parallel)

JSON/YAML files processed via `Promise.all` with chunking:

| Operation | Sequential | Parallel | Speedup |
|-----------|------------|----------|---------|
| 174 JSON/YAML files | ~6.7s | **195ms** | **34x faster** |
| Throughput | ~26 files/s | **892 files/s** | **34x** |

---

## Communication Protocol

### Main -> Worker (Task)

```typescript
interface WorkerTask {
  id: string;
  files: string[];
  language: string;
  options?: ParserOptions;
  streamingMode?: boolean;
}
```

### Worker -> Main (Result)

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

### Worker -> Main (Streaming Result)

```typescript
// Sent immediately after parsing each file
{
  type: "streaming_result",
  taskId: string,
  result: ParseResult,     // Single file result
  fileIndex: number,       // 0-based index
  totalFiles: number       // Total files in batch
}
```

### Worker -> Main (Vectors Written)

```typescript
{
  type: "vectors.written",
  count: vectorDumpTotalWritten,
  dumpDir: vectorDumpDir,
  workerId: id
}
```

---

## Transport Protocol

| Platform | Transport | Address |
|----------|-----------|---------|
| **Windows** | TCP socket | `127.0.0.1:51734` |
| **Linux/macOS** | Unix Domain Socket | `/tmp/ultrascript-core.sock` |

**Why TCP on Windows?** Bun runtime has a bug with Named Pipes on Windows -- connection drops immediately after the first message. TCP on localhost has similar performance and works reliably.

**Protocol**: Standard MCP over socket. Comm proxy forwards raw bytes transparently. No custom framing needed -- MCP SDK handles framing. Each client gets full MCP session isolation.

### Connection Lifecycle

```
Comm                          Core
  |                             |
  |--- TCP connect ------------>|
  |<-- accept, create MCP Srv --|
  |                             |
  |--- MCP initialize --------->|
  |<-- MCP initialized ---------|
  |                             |
  |--- tools/call ------------->|
  |<-- result ------------------|
  |                             |
  |--- (client closes) -------->|
  |    onclose callback         |
```

---

## Storage Layout

```
%LOCALAPPDATA%\UltraScriptTools\
+-- config.yaml                    # Global config
+-- core.pid                       # Core process PID (health check)
+-- core.lock                      # Lock file
|
+-- logs\
|   +-- core-2025-11-27.log
|   +-- commer-{pid}-2025-11-27.log
|
+-- cache\
|   +-- tree-sitter\               # WASM modules
|   +-- ast\                       # Parsed AST cache by file hash
|
+-- projects\
|   +-- {hash}\                    # Hash of project path
|   |   +-- meta.json              # Project metadata
|   |   +-- graph.db               # Entities, relationships
|   |   +-- vectors.db             # Embeddings
|   |   +-- branches\
|   |       +-- main\
|   |       +-- feature-x\
|   |
|   +-- {hash}\
|
+-- models\
    +-- granite-embedding\         # Cached embedding models
```

---

## Configuration

```yaml
# %LOCALAPPDATA%\UltraScriptTools\config.yaml
core:
  workers:
    parser: auto        # auto = CPU count - 1
    embedding: 2

  shutdown:
    idleTimeoutMs: 300000  # 5 min after last proxy disconnects

  storage:
    maxProjectsCache: 20
    maxBranchesPerProject: 10

indexing:
  autoIndex: true       # Safe -- runs in background workers
  batchSize: 50

embedding:
  provider: tei
  model: ibm-granite/granite-embedding-english-r2
```

---

## Memory Impact

```
Without workers: ~500MB baseline
With 4 parser workers: ~700MB (+40%)
With embedding in workers: ~800MB (+60%)
```

Workers isolate crashes (subprocess dies, main survives). Memory is reclaimed when subprocess exits. Streaming reduces peak memory (no full batch accumulation).

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

## Build Commands

```bash
# Build Core (TypeScript)
npm run build

# Build Comm proxy (requires cosmocc)
./src/comm/build.ps1

# Full build
npm run build && ./src/comm/build.ps1
```

### Build Output

```
dist/index.js              -- ~2.5 MB  (Core server, all agents)
dist/ultrascript-tools.com -- ~50 KB   (Comm proxy, APE binary)
```

---

## Testing

### Start Core manually (pipe mode):

```bash
bun dist/index.js --pipe
# or
node dist/index.js --pipe
```

### Test with multiple clients:

```bash
# Terminal 1: Start Core
bun dist/index.js --pipe

# Terminal 2: Client 1
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test1","version":"1.0"}}}' | nc localhost 51734

# Terminal 3: Client 2 (simultaneous)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test2","version":"1.0"}}}' | nc localhost 51734
```

### MCP client config (Claude Code, VS Code, etc.):

```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "path/to/dist/ultrascript-tools.com"
    }
  }
}
```

---

## Directory Structure

```
src/
+-- index.ts              # Main entry point (Core server)
+-- comm/                 # Comm proxy (C)
|   +-- comm.c            # Cosmopolitan C source
|   +-- build.ps1         # Build script
|   +-- README.md
|
+-- core/                 # Core infrastructure
|   +-- pipe-transport.ts # TCP/Unix socket server
|   +-- di-container.ts   # Dependency injection
|   +-- resource-manager.ts
|   +-- knowledge-bus.ts
|
+-- shared/               # Shared utilities
|   +-- ipc-protocol.ts   # Message types
|   +-- storage-paths.ts  # Centralized paths
|   +-- runtime-detect.ts # Bun/Node detection
|
+-- agents/               # Processing agents
    +-- parser-agent.ts
    +-- indexer-agent.ts
    +-- semantic-agent.ts
    +-- workers/
        +-- parsing-subprocess-pool.ts
        +-- generic-language-worker.ts
```

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Core server entry point, `--pipe` mode |
| `src/comm/comm.c` | Cosmopolitan C proxy source |
| `src/core/pipe-transport.ts` | TCP/Unix socket server |
| `src/agents/workers/parsing-subprocess-pool.ts` | Subprocess pool management |
| `src/agents/workers/generic-language-worker.ts` | Universal worker for all languages |
| `src/core/di-container.ts` | Dependency injection container |
| `src/core/resource-manager.ts` | Memory/CPU limit management |
| `src/core/knowledge-bus.ts` | Inter-agent pub/sub bus |
