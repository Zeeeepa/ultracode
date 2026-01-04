# UltraScript Tools — Multi-Process Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              IDE Instances                               │
├──────────────┬──────────────┬──────────────┬──────────────────────────────┤
│   VS Code    │   VS Code    │   Cursor     │   Claude Code               │
│  Project A   │  Project B   │  Project A   │   Project C                 │
└──────┬───────┴──────┬───────┴──────┬───────┴──────────────┬──────────────┘
       │              │              │                      │
       ▼              ▼              ▼                      ▼
┌──────────────┬──────────────┬──────────────┬──────────────────────────────┐
│   Comm #1    │   Comm #2    │   Comm #3    │   Comm #4                   │
│  (APE proxy) │  (APE proxy) │  (APE proxy) │  (APE proxy)                │
│  Cosmopolitan│  Cosmopolitan│  Cosmopolitan│  Cosmopolitan               │
│  <10ms init  │  <10ms init  │  <10ms init  │  <10ms init                 │
└──────┬───────┴──────┬───────┴──────┬───────┴──────────────┬──────────────┘
       │              │              │                      │
       │    TCP Socket (Windows) / Unix Domain Socket       │
       │    127.0.0.1:51734 / /tmp/ultrascript-core.sock   │
       ▼              ▼              ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ultrascript-tools-core (multi-client)                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Main Thread (Bun)                            │ │
│  │  • Multi-client Connection Manager                                 │ │
│  │  • MCP Server per client (isolated sessions)                       │ │
│  │  • Request Router (dispatches to agents)                           │ │
│  │  • Storage Manager (shared SQLite, VectorDB)                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────┬───────────┬───────────┬───────────┬───────────┐          │
│  │ Client #1 │ Client #2 │ Client #3 │ Client #N │           │          │
│  │ MCP Srv   │ MCP Srv   │ MCP Srv   │ MCP Srv   │  Shared:  │          │
│  │ (session) │ (session) │ (session) │ (session) │  • Agents │          │
│  └───────────┴───────────┴───────────┴───────────┤  • SQLite │          │
│                                                   │  • Vector │          │
│  ┌──────────────┬──────────────┬──────────────┐   │  • Cache  │          │
│  │  Parser      │  Indexer     │  Semantic    │   └───────────┘          │
│  │  Agent       │  Agent       │  Agent       │                          │
│  └──────────────┴──────────────┴──────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                %LOCALAPPDATA%\UltraScriptTools\                          │
│  ├── config.yaml                 (global settings)                      │
│  ├── logs\                       (all logs)                             │
│  ├── cache\                      (parsed AST cache)                     │
│  ├── projects\                                                          │
│  │   ├── {project-hash-1}\                                              │
│  │   │   ├── graph.db            (entities, relationships)              │
│  │   │   ├── vectors.db          (embeddings)                           │
│  │   │   └── branches\           (branch-specific data)                 │
│  │   └── {project-hash-2}\                                              │
│  └── models\                     (embedding models cache)               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Multi-client support**: One Core process serves multiple IDE instances simultaneously
- **Cosmopolitan APE binary**: Comm proxy works on Windows/Linux/macOS without recompilation
- **Fast startup**: Comm initializes in <10ms, Core spawns on first connection
- **Shared resources**: All clients share agents, SQLite DB, vector store, and cache
- **Session isolation**: Each client gets its own MCP Server instance with separate state

## Components

### 1. ultrascript-tools-comm (Proxy)

**Purpose**: Lightweight MCP proxy that IDE connects to. Ultra-fast startup (<10ms).

**Implementation**: Cosmopolitan Libc (C) — compiles to single APE binary that runs on Windows/Linux/macOS.

**Responsibilities**:
- Accept MCP protocol from IDE (stdio)
- Connect to Core process via TCP socket
- Forward all MCP messages bidirectionally
- If Core not running — spawn it via `bun` or `node`
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
2. Comm tries connect to 127.0.0.1:51734
3. If connection refused:
   - Find bun/node runtime
   - Spawn: bun dist/index.js --pipe
   - Wait for TCP port to open
4. Forward stdin → TCP, TCP → stdout
5. On EOF — close connection
```

### 2. ultrascript-tools-core (Multi-client Server)

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
- `GraphStorage` — SQLite entities/relationships
- `VectorStore` — Embeddings database
- `ConductorOrchestrator` — Agent coordinator
- `ParserAgent`, `IndexerAgent`, `SemanticAgent` — Processing agents
- `KnowledgeBus` — Inter-agent communication

### 3. Worker Pool

**Types of workers**:
1. **Parser Workers** — Native parsers per language (CPU-bound)
2. **Embedding Workers** — TEI/Ollama/OVMS calls (IO-bound)
3. **Analysis Workers** — code analysis, search

**Files**:
- `src/agents/workers/parsing-subprocess-pool.ts` — subprocess pool management
- `src/agents/workers/generic-language-worker.ts` — universal worker for all 10 languages

```typescript
class SubprocessPool {
  private workers: Map<number, SubprocessWorker> = new Map();
  private streamingMode: boolean = false;
  private onStreamingResult?: StreamingResultCallback;

  async parse(request: ParseRequest): Promise<ParseResponse> {
    const worker = await this.getAvailableWorker();

    // Send task with streaming mode flag
    worker.send({
      type: "task",
      ...request,
      streamingMode: this.streamingMode
    });

    // Results arrive via IPC:
    // - streaming_result: immediate per-file results
    // - result: final batch summary
  }
}
```

**Streaming Mode (NEW)**:
- Workers send `streaming_result` after parsing each file
- Main process indexes immediately via callback
- **37% faster** than batch mode (parsing + indexing overlap)
- **91.6%** files indexed via streaming

**Parallel Data Files**:
- JSON/YAML processed via `Promise.all` with chunking
- **34x faster** than sequential (892 files/s vs 26 files/s)

### 4. Transport Protocol

**Transport**:
- **Windows**: TCP socket `127.0.0.1:51734` (Bun doesn't support Named Pipes)
- **Linux/macOS**: Unix Domain Socket `/tmp/ultrascript-core.sock`

**Why TCP on Windows?**
Bun runtime has a bug with Named Pipes on Windows — connection drops immediately after first message.
TCP on localhost has similar performance and works reliably.

**Protocol**: Standard MCP over socket
- Comm proxy forwards raw bytes (transparent)
- No custom framing needed — MCP SDK handles framing
- Each client gets full MCP session isolation

**Connection lifecycle**:
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

### 5. Storage Layout

```
%LOCALAPPDATA%\UltraScriptTools\
├── config.yaml                    # Global config
├── core.pid                       # Core process PID (for health check)
├── core.lock                      # Lock file
│
├── logs\
│   ├── core-2025-11-27.log
│   └── commer-{pid}-2025-11-27.log
│
├── cache\
│   ├── tree-sitter\               # WASM modules
│   └── ast\                       # Parsed AST cache by file hash
│
├── projects\
│   ├── {hash}\                    # Hash of project path
│   │   ├── meta.json              # Project metadata
│   │   ├── graph.db               # Entities, relationships
│   │   ├── vectors.db             # Embeddings
│   │   └── branches\
│   │       ├── main\
│   │       └── feature-x\
│   │
│   └── {hash}\
│
└── models\
    └── granite-embedding\         # Cached embedding models
```

## Directory Structure

```
src/
├── index.ts              # Main entry point (Core server)
├── comm/                 # Comm proxy (C)
│   ├── comm.c           # Cosmopolitan C source
│   ├── build.ps1        # Build script
│   └── README.md        # Comm-specific docs
│
├── core/                 # Core infrastructure
│   ├── pipe-transport.ts # TCP/Unix socket server
│   ├── di-container.ts   # Dependency injection
│   └── ...
│
├── shared/               # Shared utilities
│   ├── ipc-protocol.ts   # Message types
│   ├── storage-paths.ts  # Centralized paths
│   └── runtime-detect.ts # Bun/Node detection
│
└── agents/               # Processing agents
    ├── parser-agent.ts
    ├── indexer-agent.ts
    ├── semantic-agent.ts
    └── ...
```

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
  autoIndex: true       # Now safe - runs in background workers
  batchSize: 50

embedding:
  provider: tei
  model: ibm-granite/granite-embedding-english-r2
```

## Build Commands

```bash
# Build Core (TypeScript)
npm run build

# Build Comm proxy (requires cosmocc)
./src/comm/build.ps1

# Full build
npm run build && ./src/comm/build.ps1
```

## Implementation Status

### Phase 1: Infrastructure ✅
1. [x] Create `src/shared/ipc-protocol.ts`
2. [x] Create `src/shared/storage-paths.ts`
3. [x] Create `src/shared/runtime-detect.ts`
4. [x] Create `src/core/pipe-transport.ts` — TCP/Unix socket server

### Phase 2: Comm Proxy ✅
5. [x] Create `src/comm/comm.c` — Cosmopolitan C implementation
6. [x] Build script `src/comm/build.ps1`
7. [x] TCP support for Windows (Bun Named Pipes bug workaround)
8. [x] Auto-spawn Core if not running

### Phase 3: Multi-client Core ✅
9. [x] `PipeServer` with connection callback
10. [x] `createMcpServer()` factory for per-client instances
11. [x] `getToolsList()` shared tool definitions
12. [x] Proper client disconnect handling
13. [x] Tested with multiple simultaneous clients

### TODO
- [ ] Move embeddings to worker thread
- [ ] Auto-shutdown after idle timeout
- [ ] Health monitoring / restart

## Build Output

After running `npm run build`:

```
dist/index.js              — ~2.5 MB  (Core server, all agents)
dist/ultrascript-tools.com — ~50 KB   (Comm proxy, APE binary)
```

## How to Test

### 1. Start Core manually (pipe mode):
```bash
bun dist/index.js --pipe
# or
node dist/index.js --pipe
```

### 2. Test with multiple clients:
```bash
# Terminal 1: Start Core
bun dist/index.js --pipe

# Terminal 2: Client 1
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test1","version":"1.0"}}}' | nc localhost 51734

# Terminal 3: Client 2
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test2","version":"1.0"}}}' | nc localhost 51734
```

### 3. Test via Comm proxy (full flow):
```bash
# Comm will auto-spawn Core if not running
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | ./dist/ultrascript-tools.com
```

### 4. MCP client config (Claude Code, VS Code, etc.):
```json
{
  "mcpServers": {
    "ultrascript-tools": {
      "command": "path/to/dist/ultrascript-tools.com"
    }
  }
}
```
