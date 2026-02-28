---
module_name: addons
description: Manages the Roslyn C# parsing addon subprocess with IPC over Named Pipes and singleton lifecycle
status: active
language: typescript
entry_point: index.ts
exports:
  - CSharpEntityMetadata
  - CSharpNativeParser
  - CSharpParsedEntity
  - CSharpParseResult
  - DiagnosticsHandler
  - ensureRoslynStarted
  - findSolutionFile
  - getCSharpParser
  - getRoslynClient
  - isRoslynAvailable
  - PhaseChangedHandler
  - RoslynAddonClient
  - RoslynClientOptions
  - shutdownRoslynClient
dependencies:
  - ../logging/index.js
  - ../shared/ipc-protocol.js
tags:
  - csharp
  - roslyn
  - subprocess
  - ipc
  - named-pipe
  - parser
---

# addons

## Overview

The `addons` module provides C# code parsing by managing an external Roslyn-based .NET subprocess (`Ultrasharp.Addon.dll`).
It spawns the subprocess, connects via Named Pipes using a binary IPC protocol, and exposes a `CSharpNativeParser` facade
for single-file and batch parsing. A singleton lifecycle manager (`roslyn-lifecycle.ts`) handles lazy initialization,
concurrent-call deduplication, solution file discovery, and graceful shutdown with process-tree cleanup.

The module is designed as a fallback-compatible layer: when the Roslyn addon is unavailable, all parse methods return `null`
so the caller can fall back to tree-sitter parsing transparently.

## Data Flow

1. Caller invokes `ensureRoslynStarted(slnPath)` which checks DLL availability and deduplicates concurrent starts.
2. `RoslynAddonClient.start()` spawns `dotnet exec Ultrasharp.Addon.dll --pipe <name> --parent-pid <pid>`.
3. Client connects to the Named Pipe (`\\.\pipe\<name>` on Windows, `/tmp/<name>.sock` on Unix).
4. `CSharpNativeParser.parseFile()` sends a JSON-RPC-like request through `encodeMessage()` binary framing.
5. Responses are decoded by `MessageDecoder`, matched to pending requests by UUID, and resolved.
6. Events (e.g. `phaseChanged`, diagnostics) are dispatched to registered handlers.
7. On process exit or `shutdownRoslynClient()`, the subprocess tree is killed and all state is reset.

## Public API

| Symbol | Kind | Description | Location |
|--------|------|-------------|----------|
| `CSharpParseResult` | interface | Parse result containing an array of entities. | [`csharp-native-parser.ts:15-17`](./csharp-native-parser.ts) |
| `CSharpParsedEntity` | interface | Single parsed C# entity with name, type, lines, children. | [`csharp-native-parser.ts:19-31`](./csharp-native-parser.ts) |
| `CSharpEntityMetadata` | interface | Rich metadata: namespace, FQN, accessibility, parameters, calls, diagnostics. | [`csharp-native-parser.ts:33-53`](./csharp-native-parser.ts) |
| `CSharpNativeParser` | class | Facade over `RoslynAddonClient` with `parseFile`, `parseBatch`, `flattenEntities`. | [`csharp-native-parser.ts:59-131`](./csharp-native-parser.ts) |
| `RoslynClientOptions` | interface | Configuration: `addonPath`, `slnPath`, `requestTimeout`, `maxRestarts`, `logDirectory`. | [`roslyn-client.ts:29-40`](./roslyn-client.ts) |
| `PhaseChangedHandler` | type | Callback for Roslyn initialization phase change events. | [`roslyn-client.ts:48-48`](./roslyn-client.ts) |
| `DiagnosticsHandler` | type | Callback for diagnostic data events from the addon. | [`roslyn-client.ts:49-49`](./roslyn-client.ts) |
| `RoslynAddonClient` | class | IPC client: spawns subprocess, manages Named Pipe, sends requests, dispatches events. | [`roslyn-client.ts:84-364`](./roslyn-client.ts) |
| `findSolutionFile` | function | Finds `.sln`/`.slnx` in a directory (non-recursive, `.sln` priority). | [`roslyn-lifecycle.ts:33-45`](./roslyn-lifecycle.ts) |
| `isRoslynAvailable` | function | Checks if `Ultrasharp.Addon.dll` exists in any known candidate path. | [`roslyn-lifecycle.ts:56-78`](./roslyn-lifecycle.ts) |
| `getRoslynClient` | function | Returns or creates the singleton `RoslynAddonClient`. | [`roslyn-lifecycle.ts:114-114`](./roslyn-lifecycle.ts) |
| `ensureRoslynStarted` | function | Lazy-starts Roslyn and returns `CSharpNativeParser` (or `null`). Deduplicates concurrent calls. | [`roslyn-lifecycle.ts:132-154`](./roslyn-lifecycle.ts) |
| `getCSharpParser` | function | Returns the current `CSharpNativeParser` singleton if connected, else `null`. | [`roslyn-lifecycle.ts:189-191`](./roslyn-lifecycle.ts) |
| `shutdownRoslynClient` | function | Graceful shutdown: kills subprocess tree, clears all singleton state. | [`roslyn-lifecycle.ts:196-209`](./roslyn-lifecycle.ts) |

## Dependencies

| Dependency | Kind | Purpose |
|------------|------|---------|
| `../logging/index.js` | internal | Structured logging via `log.i`, `log.w`, `log.e`, `log.d` |
| `../shared/ipc-protocol.js` | internal | Binary IPC framing: `encodeMessage`, `MessageDecoder`, message types |
| `node:child_process` | builtin | `spawn` for dotnet subprocess, `execSync` for Windows `taskkill` |
| `node:crypto` | builtin | `randomUUID` for pipe names and request IDs |
| `node:fs` | builtin | `existsSync`, `readdirSync` for DLL and solution discovery |
| `node:net` | builtin | `connect` for Named Pipe socket |
| `node:path` | builtin | `join`, `dirname`, `resolve` for path construction |
| `node:url` | builtin | `fileURLToPath` for ESM `__dirname` equivalent |

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `addonPath` | `string` | Auto-discovered | Path to `Ultrasharp.Addon.dll` |
| `slnPath` | `string` | `""` | Path to `.sln`/`.slnx` for eager solution loading |
| `requestTimeout` | `number` | `60000` | IPC request timeout in milliseconds |
| `maxRestarts` | `number` | `3` | Maximum auto-restart attempts (currently disabled) |
| `logDirectory` | `string` | `""` | Directory for addon process log output |

## Behavioral Properties

- **Lazy singleton**: `ensureRoslynStarted` creates the client on first call; subsequent calls return the cached parser.
- **Concurrent-call deduplication**: A `startPromise` guard prevents multiple parallel startup sequences.
- **Fallback-safe**: All parse methods return `null` when the addon is unavailable, enabling tree-sitter fallback.
- **No auto-restart**: Auto-restart is intentionally disabled to prevent orphaned .NET processes. Recovery goes through `ensureRoslynStarted`.
- **Process-tree cleanup**: On Windows, `taskkill /T /F` kills the entire dotnet process tree including MSBuild workers.
- **Exit handler**: Registers `process.on('exit'|'SIGINT'|'SIGTERM')` to ensure child processes are cleaned up.
- **Pipe naming**: Each client instance gets a unique pipe name `UltraCode_Roslyn_<uuid8>`.
- **MSBUILDDISABLENODEREUSE=1**: Set in subprocess env to prevent orphaned MSBuild node processes.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Addon DLL not found | `isRoslynAvailable` returns `false`; `ensureRoslynStarted` returns `null` |
| Subprocess fails to start | `start()` returns `false`; error logged at `log.e` level |
| Pipe connection timeout | 10-second timeout; error propagated to `start()` caller |
| Request timeout | Per-request timer (default 60s); pending promise rejected with timeout error |
| Parse failure | `parseFile`/`parseBatch` catch errors, log warning, return `null` |
| Shutdown during requests | All pending requests rejected with "Addon shutting down" |
| Unexpected process exit | Logged; `_connected` set to `false`; no auto-restart |

## Observability

| Log Tag | Level | Events |
|---------|-------|--------|
| `RoslynAddon` | info | `started`, `process_exit`, `phase_changed` |
| `RoslynAddon` | warn | `not_available`, `pipe_closed`, `process_exited_no_restart` |
| `RoslynAddon` | error | `start_failed`, `pipe_error` |
| `RoslynAddon` | debug | `stderr` (subprocess stderr output) |
| `ROSLYN` | info | `dll_found`, `exit_cleanup`, `parser_ready`, `shutdown_start`, `shutdown_ok` |
| `ROSLYN` | warn | `dll_not_found`, `addon_not_available`, `addon_start_returned_false` |
| `ROSLYN` | error | `start_error`, `shutdown_error` |
| `CSharpParser` | warn | `parse_failed`, `batch_failed` |

## Known Limitations

- Auto-restart is disabled; recovery requires explicit `ensureRoslynStarted` call from the caller.
- DLL discovery checks only four hardcoded candidate paths; custom locations require `addonPath` option.
- Solution discovery is non-recursive (root directory only); nested `.sln` files are not found.
- Named Pipe connection has a fixed 1-second initial delay (`setTimeout`) before attempting to connect.
- No health-check or heartbeat mechanism; a silently hung subprocess is not detected until a request times out.
- On non-Windows platforms, `taskkill` is unavailable; cleanup uses basic `process.kill()` which may not kill child processes.

## TypeScript Notes

- All exports use explicit `type` keyword for type-only exports in `index.ts` (TypeScript isolatedModules compatible).
- `CSharpEntityMetadata` uses optional fields extensively; consumers should use optional chaining.
- `RoslynAddonClient` uses `Required<RoslynClientOptions>` internally to normalize defaults.
- Generic `request<T>()` method allows typed IPC responses without runtime validation.
- ESM-only: uses `import.meta.url` for `__dirname` equivalent via `fileURLToPath`.

## Exports

- `CSharpNativeParser`
- `RoslynAddonClient`
- `ensureRoslynStarted`
- `findSolutionFile`
- `getCSharpParser`
- `getRoslynClient`
- `isRoslynAvailable`
- `shutdownRoslynClient`

## Files

| File | Lines | Description |
|------|-------|-------------|
| [`index.ts`](./index.ts) | 19 | Barrel re-export of all types and functions from the module |
| [`csharp-native-parser.ts`](./csharp-native-parser.ts) | 131 | C# parser facade: `parseFile`, `parseBatch`, `flattenEntities` |
| [`roslyn-client.ts`](./roslyn-client.ts) | 364 | IPC client: subprocess spawn, Named Pipe connection, request/response handling |
| [`roslyn-lifecycle.ts`](./roslyn-lifecycle.ts) | 209 | Singleton lifecycle: lazy init, solution discovery, graceful shutdown |
