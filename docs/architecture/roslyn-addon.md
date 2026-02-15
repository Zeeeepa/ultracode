# Roslyn Addon Architecture

## Overview

Ultrasharp.Addon — легковесный C# daemon-процесс, предоставляющий Roslyn-возможности TS-процессу через Named Pipe IPC. TS владеет storage/embeddings/MCP, C# владеет parsing/analysis/validation.

**Status:** PRODUCTION — parsing, analysis, code modification, diagnostics

**Требования:** .NET 10+ Runtime (framework-dependent deployment)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ultrascript-tools-mcp (TypeScript)                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Main Process (Bun/Node)                                               │  │
│  │  • MCP Protocol (JSON-RPC)                                             │  │
│  │  • LibSQL Graph DB (entities, relationships)                           │  │
│  │  • Vector Embeddings (Faiss, semantic search)                          │  │
│  │  • 30+ MCP Tools                                                       │  │
│  └────────────────────┬───────────────────────────────────────────────────┘  │
│                       │                                                      │
│  ┌────────────────────┴───────────────────────────────────────────────────┐  │
│  │  RoslynAddonClient (src/addons/roslyn-client.ts)                       │  │
│  │  • Spawn: dotnet exec Ultrasharp.Addon.dll --pipe <name>               │  │
│  │  • Binary framing: [4 bytes BE length][JSON payload UTF-8]             │  │
│  │  • Phase tracking, auto-restart (max 3), event handling                │  │
│  └────────────────────┬───────────────────────────────────────────────────┘  │
└───────────────────────┼──────────────────────────────────────────────────────┘
                        │
          Named Pipe IPC (binary framing)
          \\.\pipe\UltraScript_Roslyn_<uuid>
                        │
┌───────────────────────┼──────────────────────────────────────────────────────┐
│                       ▼                                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Ultrasharp.Addon (C# / .NET 10)                                       │  │
│  │                                                                         │  │
│  │  Phase 1 (instant):  PipeServer ready, syntax parsing available         │  │
│  │  Phase 2 (5-30s):    Solution loaded, semantic analysis available       │  │
│  │  Phase 3 (background): Continuous validation with debounce              │  │
│  │                                                                         │  │
│  │  Services:                                                              │  │
│  │  • ISolutionManager         — MSBuild workspace, symbol index           │  │
│  │  • ICodeAnalysisService     — find refs, callers, implementations       │  │
│  │  • IExecutionTraceService   — forward execution tracing                 │  │
│  │  • IBacktraceService        — reverse tracing from crash point          │  │
│  │  • ICodeModificationService — rename, find-replace, apply changes       │  │
│  │  • ICodeFixService          — auto-fix diagnostics                      │  │
│  │  • IFormattingService       — code formatting                           │  │
│  │  • IDiagnosticService       — compiler + analyzer diagnostics           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                   Ultrasharp.Addon Process (~300-500 MB RAM)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Source Code Locations

### C# (Roslyn daemon) — `ultrasharp-tools-mcp` repo

```
ultrasharp-tools-mcp/
├── Ultrasharp.Addon/
│   ├── Ultrasharp.Addon.csproj     # Project file (net10.0, framework-dependent)
│   ├── Program.cs                   # Entry point (System.CommandLine CLI)
│   ├── GlobalUsings.cs              # Shared usings
│   ├── Ipc/
│   │   ├── BinaryFrameCodec.cs      # [4 BE length][JSON] frame encode/decode
│   │   ├── PipeServer.cs            # NamedPipeServerStream wrapper, reconnect loop
│   │   └── RequestRouter.cs         # Method name → handler dispatch
│   ├── Models/
│   │   ├── AddonRequest.cs          # IPC request DTO
│   │   ├── AddonResponse.cs         # IPC response DTO + events
│   │   └── ParsedEntityDto.cs       # Entity DTO (compatible with TS ParsedEntity)
│   ├── Services/
│   │   ├── AddonServiceRegistration.cs  # DI registration (Roslyn services subset)
│   │   └── AddonLifecycleService.cs     # Phase management, solution loading
│   └── Handlers/
│       ├── HandlerRegistration.cs   # Wires all handlers into RequestRouter
│       ├── ParseHandler.cs          # parse, parseBatch (Phase 1)
│       ├── StatusHandler.cs         # status, loadSolution, unloadSolution
│       ├── DocumentHandler.cs       # updateDocument, addDocument, removeDocument
│       ├── EnrichHandler.cs         # enrich, enrichBatch (Phase 2)
│       ├── AnalysisHandler.cs       # findReferences, getDefinition, getCallGraph, etc.
│       ├── ValidationHandler.cs     # validate (diagnostics)
│       └── ModificationHandler.cs   # modifyCode, renameSymbol, applyCodeFix, formatCode
├── Dev.Scripts/
│   └── build-addon.ps1             # Build script (dotnet publish)
└── build-addon.cmd                  # CMD wrapper
```

### TypeScript (IPC client) — `ultrascript-tools-mcp` repo

```
ultrascript-tools-mcp/
├── src/addons/
│   ├── index.ts                     # Barrel exports
│   ├── roslyn-client.ts             # RoslynAddonClient — spawn, connect, request/response
│   └── csharp-native-parser.ts      # CSharpNativeParser — parse/parseBatch wrapper
├── dist/roslyn-addon/               # Addon DLLs (copied at build time)
├── package.json                     # "files": ["dist/roslyn-addon/**"]
└── tsup.config.ts                   # onSuccess: copy addon to dist/
```

---

## IPC Protocol

Binary framing, совместимый с `src/shared/ipc-protocol.ts`:

```
┌──────────────────────────────────────────┐
│ 4 bytes (Big Endian)  │  JSON payload    │
│ = payload length      │  (UTF-8)         │
└──────────────────────────────────────────┘
```

### Message Types

**Request** (TS → C#):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "request",
  "method": "parse",
  "params": { "filePath": "/path/to/file.cs", "content": "..." }
}
```

**Response** (C# → TS):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "result": { "entities": [...] }
}
```

**Error Response** (C# → TS):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "error": { "code": -1, "message": "Symbol not found: Foo.Bar" }
}
```

**Event** (C# → TS, push):
```json
{
  "id": "...",
  "type": "event",
  "event": "phaseChanged",
  "data": { "phase": 2 }
}
```

---

## Phased Initialization

| Phase | When | Available Methods | RAM |
|-------|------|-------------------|-----|
| **1** | Instant (~1s) | `parse`, `parseBatch`, `status` | ~50 MB |
| **2** | Background (5-30s) | All Phase 1 + `findReferences`, `getDefinition`, `getCallGraph`, `traceFlow`, `traceBackwards`, `enrich`, `validate`, `modifyCode`, `renameSymbol`, `applyCodeFix`, `formatCode` | ~300-500 MB |
| **3** | Continuous | Background validation with debounce (500ms) | Same |

Phase transitions push `phaseChanged` event to TS.

---

## Available Methods

### Phase 1 — Syntax (no Solution required)

| Method | Params | Description |
|--------|--------|-------------|
| `parse` | `{ filePath, content? }` | Parse single C# file, extract entities with metadata |
| `parseBatch` | `{ files: [{ filePath, content? }] }` | Parse multiple files in batch |
| `status` | — | Current phase, memory, loaded projects count |

### Phase 2 — Semantic (Solution loaded)

| Method | Params | Description |
|--------|--------|-------------|
| `loadSolution` | `{ solutionPath }` | Load .sln file |
| `unloadSolution` | — | Unload and free memory |
| `findReferences` | `{ fqn }` | Find all references to a symbol |
| `getDefinition` | `{ fqn }` | Get definition source code |
| `getCallGraph` | `{ fqn, direction? }` | Callers and/or callees |
| `getImplementations` | `{ fqn }` | Find interface/abstract implementations |
| `traceFlow` | `{ entryPoint, exitPoint?, maxDepth? }` | Forward execution trace |
| `traceBackwards` | `{ crashPoint, startPoint?, maxDepth?, maxPaths? }` | Reverse trace from crash |
| `enrich` | `{ filePath, entityName }` | Resolve FQN, base types via SemanticModel |
| `enrichBatch` | `{ entities: [...] }` | Batch enrich |
| `validate` | `{ solutionPath, filePath?, severity? }` | Get diagnostics |
| `modifyCode` | `{ targetString, pattern, replacement }` | Find-and-replace in workspace |
| `renameSymbol` | `{ fqn, newName }` | Rename across solution |
| `applyCodeFix` | `{ diagnosticId, preview? }` | Auto-fix diagnostics |
| `formatCode` | `{ path, checkOnly? }` | Format code |
| `updateDocument` | `{ filePath, content }` | Incremental workspace update |
| `addDocument` | `{ projectName, filePath, content }` | Add new document |
| `removeDocument` | `{ filePath }` | Remove document |

---

## Lifecycle & Process Management

### Startup

```
TS: spawn("dotnet", ["exec", "Ultrasharp.Addon.dll",
         "--pipe", "UltraScript_Roslyn_a1b2c3",
         "--parent-pid", "12345",
         "--sln", "D:/project/MyApp.sln",
         "--log-directory", "D:/logs"])

Addon: Creates NamedPipeServerStream → waits for connection
TS:    Connects to \\.\pipe\UltraScript_Roslyn_a1b2c3
Addon: Phase 1 ready (parse available)
Addon: Background: LoadSolutionAsync() → Phase 2 → push event
```

### Auto-restart

```typescript
// roslyn-client.ts
// If addon crashes, TS restarts up to 3 times (2s delay between attempts)
process.on("exit", (code) => {
  if (!shutdownRequested && restartCount < maxRestarts) {
    restartCount++;
    setTimeout(() => start(), 2000);
  }
});
```

### Orphan Detection

Addon процесс мониторит parent PID каждые 3 секунды:

```csharp
// Program.cs
if (!IsProcessRunning(parentPid)) {
    logger.LogWarning("Parent process died, shutting down");
    cts.Cancel(); // graceful shutdown
}
```

### Shutdown

```
TS: client.shutdown() → socket.destroy() → process.kill()
 — OR —
Addon: parent PID check fails → self-shutdown
 — OR —
Addon: Ctrl+C / SIGTERM → graceful cleanup
```

---

## Addon Discovery

TS ищет `Ultrasharp.Addon.dll` в следующем порядке:

1. `dist/roslyn-addon/Ultrasharp.Addon.dll` (рядом с index.js)
2. `external-libs/roslyn-addon/Ultrasharp.Addon.dll` (dev)
3. `../ultrasharp-tools-mcp/Run.Publish/Addon/Ultrasharp.Addon.dll` (dev, sibling repo)
4. `../ultrasharp-tools-mcp/Run.Publish/Droid/Addon/Ultrasharp.Addon.dll` (bundled с Droid)

Если DLL не найден — addon не запускается, C# парсинг недоступен (graceful degradation).

---

## Building

### Build addon только

```bash
# Из ultrasharp-tools-mcp repo:
pwsh Dev.Scripts/build-addon.ps1
# или
build-addon.cmd

# Output: Run.Publish/Addon/
#   ├── Ultrasharp.Addon.dll
#   ├── Ultrasharp.Addon.deps.json
#   ├── Ultrasharp.Addon.runtimeconfig.json
#   ├── BuildHost-netcore/
#   └── *.dll (Roslyn, Microsoft.Extensions, etc.)
```

### Build в составе release

```bash
# build-release.ps1 автоматически вызывает build-addon.ps1 (Step 4.5)
# и копирует output в Run.Publish/Droid/Addon/
build-release.cmd
```

### Copy в ultrascript при build

```bash
# tsup.config.ts onSuccess hook автоматически копирует addon:
cd ultrascript-tools-mcp
npm run build
# → dist/roslyn-addon/ (если Run.Publish/Addon существует)
```

---

## Usage from TypeScript

### Basic: Parse a C# file

```typescript
import { RoslynAddonClient } from "./addons/roslyn-client.js";

const client = new RoslynAddonClient({
  slnPath: "D:/project/MyApp.sln",
  requestTimeout: 60000,
});

if (client.isAvailable) {
  await client.start();

  // Phase 1: immediate parsing (no solution needed)
  const result = await client.request("parse", {
    filePath: "D:/project/Program.cs",
  });
  console.log(result.entities); // ParsedEntityDto[]

  // Wait for Phase 2...
  client.on("phaseChanged", (data) => {
    if (data.phase >= 2) {
      // Now semantic analysis is available
    }
  });

  // Phase 2: find references
  const refs = await client.request("findReferences", {
    fqn: "MyApp.Services.UserService.GetUserAsync",
  });
  console.log(refs.references); // [{ filePath, line, column, text }]

  await client.shutdown();
}
```

### Via CSharpNativeParser

```typescript
import { CSharpNativeParser } from "./addons/csharp-native-parser.js";

const parser = new CSharpNativeParser(roslynClient);

if (parser.isAvailable) {
  const result = await parser.parseFile("D:/project/Program.cs");
  // result.entities — flat list of ParsedEntity[]

  const batch = await parser.parseBatch([
    { filePath: "File1.cs" },
    { filePath: "File2.cs" },
  ]);
  // batch.files — array of { filePath, entities[] }
}
```

---

## Memory Profile

| State | Addon Processes | RAM (addon) | Data |
|-------|----------------|-------------|------|
| 1 active solution | 1 | 300-500 MB | Live Roslyn workspace |
| Solution idle (5 min) | 0 | **0 MB** | Enriched data in LibSQL |
| Addon not found | 0 | 0 MB | Graph-only (no Roslyn) |

---

## ParsedEntity Format

Addon возвращает entities совместимые с ultrascript `ParsedEntity` interface:

```typescript
interface ParsedEntityDto {
  id: string;           // "file.cs::Namespace.ClassName"
  name: string;         // "ClassName"
  type: string;         // "class" | "method" | "property" | "field" | "enum" | ...
  filePath: string;     // Absolute path
  startLine: number;    // 1-based
  endLine: number;      // 1-based
  content: string;      // Full source text of the entity
  language: "csharp";
  parentId?: string;    // Parent entity ID (for nested members)
  metadata?: {
    namespace?: string;
    fqn?: string;       // "Namespace.Class.Method(int, string)"
    accessibility?: string; // "public" | "private" | "internal" | ...
    isStatic?: boolean;
    isAsync?: boolean;
    isAbstract?: boolean;
    returnType?: string;
    parameters?: Array<{ name, type, isOptional?, defaultValue? }>;
    baseTypes?: string[];
    interfaces?: string[];
    usings?: string[];
    attributes?: string[];
    typeParameters?: string[];
    fieldType?: string;
    propertyType?: string;
    calls?: Array<{ name, receiver?, receiverType?, line }>;
    diagnostics?: Array<{ id, message, severity, line, column }>;
    complexity?: number;
    docComment?: string;
  };
  children?: ParsedEntityDto[]; // Nested members (methods in class, etc.)
}
```

---

## Comparison with Other Subprocesses

| | **Roslyn Addon** | **VectorDB** | **GPU Worker** |
|---|---|---|---|
| Language | C# (.NET 10) | C# (Native AOT) | Node.js |
| Purpose | C# analysis | Vector indexing | Faiss + CUDA |
| IPC | Named Pipe (binary) | Named Pipe (JSON-RPC) | Named Pipe |
| RAM | 300-500 MB | 50-200 MB | 100-500 MB |
| Startup | ~1s (Phase 1) | ~0.5s (AOT) | ~1s |
| Lifecycle | On-demand, auto-shutdown | Long-running | On-demand |
| Source (C#) | `Ultrasharp.Addon/` | `UltraSharpTools.VectorDB/` | — |
| Source (TS) | `src/addons/roslyn-client.ts` | `src/semantic/gpu/gpu-client.ts` | `src/semantic/gpu/gpu-client.ts` |
