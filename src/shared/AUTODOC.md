---
module_name: shared
description: "Cross-cutting utilities: runtime detection, project context, IPC protocol, storage paths, and adaptive worker pool"
status: active
language: typescript
entry_point: null
exports: [Runtime, detectRuntime, getRuntimeExecutable, getCoreEntryPath, isCoreRunning, acquireLock, releaseLock, ProjectContextManager, getProjectContext, getCurrentProjectPath, resolveProjectPath, isProjectIndexed, ProjectInfo, ProjectContextState, getDataDir, ensureDataDir, getIPCSocketPath, getLogsDir, getCacheDir, getProjectsDir, getModelsDir, getConfigDir, getConfigPath, getSemanticConfigPath, getCorePidPath, getCoreLockPath, hashProjectPath, getProjectDir, getProjectPaths, getGlobalDbPaths, getProjectHash, normalizeBranchName, DEFAULT_BRANCH, isBaseBranch, getCurrentGitBranch, getCurrentGitBranchOrDefault, ensureProjectDir, ensureGlobalDbDir, getBranchPaths, getFaissIndexPath, getFaissIndexPathByHash, getFaissIdMapPath, getFaissHotBufferPath, getTreeSitterCacheDir, getASTCacheDir, initializeStorageDirs, IPCMessageType, IPCRequest, IPCResponse, IPCEvent, IPCError, IPCMessage, ErrorCodes, Methods, Events, encodeMessage, MessageDecoder, createRequest, createResponse, createErrorResponse, createEvent, PendingRequest, IPCClient, AdaptiveWorkerPool, WorkerMessage, WorkerTask, AdaptiveWorkerOptions, getWorkerPool, shutdownWorkerPool, getCurrentIndexingDirectory, setCurrentIndexingDirectory]
dependencies: [logging, utils]
tags: [runtime-detection, project-context, ipc-protocol, storage-paths, worker-pool, cross-platform]
---

# Shared Module

> Foundation utilities providing runtime detection, project state management, binary IPC protocol, platform-aware storage paths, and an adaptive worker pool that abstracts Bun/Node.js differences.

## Overview

The `shared` module contains cross-cutting concerns used throughout the ultracode project. It detects whether the runtime is Bun or Node.js and provides appropriate abstractions. ProjectContextManager tracks the active project as a singleton. The IPC protocol implements length-prefixed JSON over named pipes (Windows) or Unix domain sockets. Storage paths follow platform conventions (LOCALAPPDATA, XDG_DATA_HOME, Application Support) with hash-based project directories. The adaptive worker pool manages concurrency with automatic retry and timeout handling.

## Data Flow

### Inputs

| Source | Data | Type |
|--------|------|------|
| `process.platform` / `process.versions` | OS and runtime info | string |
| `process.env` | LOCALAPPDATA, XDG_DATA_HOME | string |
| `git` CLI | Branch name via `execSync` | string |
| Socket data stream | Binary-framed JSON messages | Buffer |
| Worker messages | Task requests from queue | WorkerMessage |

### Processing

1. **Runtime Detection**: Check `globalThis.Bun`, `process.versions.bun`, `process.execPath`, `Bun.version`; cache result.
2. **Path Resolution**: Platform switch to base directory, append `UltraCode`, hash project path with xxHash for subdirectories.
3. **Git Branch Detection**: Check `.git` dir, run `symbolic-ref --short HEAD`, fall back to `rev-parse`, handle detached HEAD.
4. **IPC Decode**: Buffer incoming chunks, extract 4-byte BE length prefix, parse JSON payload, handle partial frames.
5. **Project Context**: Resolve path, update singleton state, trigger `onProjectChange` callbacks.
6. **Worker Dispatch**: Queue task, find or create idle worker, post message, collect result via Promise, retry on failure.

### Outputs

| Target | Data | Type |
|--------|------|------|
| Consumers | Runtime type `"bun"` or `"node"` | `Runtime` |
| File system | Platform-specific storage directories | string paths |
| IPC wire | Binary-encoded request/response/event | Buffer |
| Callers | Project state, indexing status | `ProjectInfo` |
| Callers | Worker task results | `Promise<T>` |

## Public API

| Export | Type | Description | Location |
|--------|------|-------------|----------|
| `Runtime` | type | `"bun" \| "node"` | [`runtime-detect.ts:16-16`](./runtime-detect.ts) |
| `detectRuntime()` | function | Detect and cache current runtime | [`runtime-detect.ts:24-64`](./runtime-detect.ts) |
| `getRuntimeExecutable()` | function | Get executable path for runtime | [`runtime-detect.ts:69-82`](./runtime-detect.ts) |
| `getCoreEntryPath()` | function | Path to Core entry point | [`runtime-detect.ts:91-98`](./runtime-detect.ts) |
| `isCoreRunning()` | function | Check if Core process is alive via PID | [`runtime-detect.ts:103-124`](./runtime-detect.ts) |
| `acquireLock()` | function | Acquire singleton lock file | [`runtime-detect.ts:133-155`](./runtime-detect.ts) |
| `releaseLock()` | function | Release lock file | [`runtime-detect.ts:160-167`](./runtime-detect.ts) |
| `ProjectContextManager` | class | Central project state manager (singleton) | [`project-context.ts:44-228`](./project-context.ts) |
| `getProjectContext()` | function | Get singleton ProjectContextManager | [`project-context.ts:236-241`](./project-context.ts) |
| `getCurrentProjectPath()` | function | Get current project path | [`project-context.ts:246-248`](./project-context.ts) |
| `resolveProjectPath()` | function | Resolve path relative to CWD | [`project-context.ts:253-255`](./project-context.ts) |
| `isProjectIndexed()` | function | Check if project has graph DB | [`project-context.ts:260-262`](./project-context.ts) |
| `ProjectInfo` | interface | Project metadata | [`project-context.ts:26-33`](./project-context.ts) |
| `ProjectContextState` | interface | Internal state shape | [`project-context.ts:35-38`](./project-context.ts) |
| `getDataDir()` | function | Platform-specific base data directory | [`storage-paths.ts:24-40`](./storage-paths.ts) |
| `ensureDataDir()` | function | Create data directory if needed | [`storage-paths.ts:45-51`](./storage-paths.ts) |
| `getIPCSocketPath()` | function | IPC socket/pipe path | [`storage-paths.ts:60-65`](./storage-paths.ts) |
| `getGlobalDbPaths()` | function | Unified database paths (v5+) | [`storage-paths.ts:189-204`](./storage-paths.ts) |
| `hashProjectPath()` | function | xxHash-based project path hash | [`storage-paths.ts:115-119`](./storage-paths.ts) |
| `getCurrentGitBranch()` | function | Git branch name or null | [`storage-paths.ts:253-290`](./storage-paths.ts) |
| `DEFAULT_BRANCH` | constant | `"main"` fallback | [`storage-paths.ts:228-228`](./storage-paths.ts) |
| `isBaseBranch()` | function | Check if branch is main/master/dev/etc | [`storage-paths.ts:238-242`](./storage-paths.ts) |
| `getFaissIndexPath()` | function | FAISS index path per project+branch | [`storage-paths.ts:351-361`](./storage-paths.ts) |
| `initializeStorageDirs()` | function | Create all required directories | [`storage-paths.ts:416-424`](./storage-paths.ts) |
| `IPCMessageType` | type | `"request" \| "response" \| "event"` | [`ipc-protocol.ts:17-17`](./ipc-protocol.ts) |
| `IPCRequest` | interface | Request message shape | [`ipc-protocol.ts:19-25`](./ipc-protocol.ts) |
| `IPCResponse` | interface | Response message shape | [`ipc-protocol.ts:27-32`](./ipc-protocol.ts) |
| `IPCEvent` | interface | Event message shape | [`ipc-protocol.ts:34-40`](./ipc-protocol.ts) |
| `IPCError` | interface | Error object shape | [`ipc-protocol.ts:42-46`](./ipc-protocol.ts) |
| `ErrorCodes` | const object | JSON-RPC-style error codes | [`ipc-protocol.ts:51-59`](./ipc-protocol.ts) |
| `Methods` | const object | RPC method names | [`ipc-protocol.ts:62-80`](./ipc-protocol.ts) |
| `Events` | const object | Event names | [`ipc-protocol.ts:83-89`](./ipc-protocol.ts) |
| `encodeMessage()` | function | Encode message to binary wire format | [`ipc-protocol.ts:103-109`](./ipc-protocol.ts) |
| `MessageDecoder` | class | Stateful binary message decoder | [`ipc-protocol.ts:116-192`](./ipc-protocol.ts) |
| `IPCClient` | class | IPC client with request/response and events | [`ipc-protocol.ts:259-366`](./ipc-protocol.ts) |
| `createRequest()` | function | Create IPCRequest | [`ipc-protocol.ts:201-209`](./ipc-protocol.ts) |
| `createResponse()` | function | Create success IPCResponse | [`ipc-protocol.ts:214-220`](./ipc-protocol.ts) |
| `createErrorResponse()` | function | Create error IPCResponse | [`ipc-protocol.ts:225-231`](./ipc-protocol.ts) |
| `createEvent()` | function | Create IPCEvent | [`ipc-protocol.ts:236-244`](./ipc-protocol.ts) |
| `PendingRequest` | interface | Pending request state | [`ipc-protocol.ts:250-254`](./ipc-protocol.ts) |
| `AdaptiveWorkerPool` | class | EventEmitter-based worker pool | [`adaptive-worker.ts:76-361`](./adaptive-worker.ts) |
| `WorkerMessage` | interface | Worker message shape | [`adaptive-worker.ts:25-31`](./adaptive-worker.ts) |
| `WorkerTask` | interface | Task for worker | [`adaptive-worker.ts:33-37`](./adaptive-worker.ts) |
| `AdaptiveWorkerOptions` | interface | Pool configuration | [`adaptive-worker.ts:39-50`](./adaptive-worker.ts) |
| `getWorkerPool()` | function | Get or create default pool (singleton) | [`adaptive-worker.ts:372-380`](./adaptive-worker.ts) |
| `shutdownWorkerPool()` | function | Shutdown default pool | [`adaptive-worker.ts:385-390`](./adaptive-worker.ts) |
| `getCurrentIndexingDirectory()` | function | Deprecated wrapper | [`indexing-context.ts:16-18`](./indexing-context.ts) |
| `setCurrentIndexingDirectory()` | function | Deprecated wrapper | [`indexing-context.ts:24-28`](./indexing-context.ts) |

## Dependencies

### Internal Modules

| Module | Purpose | Interaction |
|--------|---------|-------------|
| `logging` | Structured logging | `log.i`, `log.e`, `log.w` with context tags (ADAPTWORK, IPC, PROJCTX) |
| `utils/runtime-detection` | `sleep()` function | Used for Bun-compatible async timeouts |
| `utils/fast-hash` | `hashText()` | xxHash for project path hashing |

### External Packages

| Package | Purpose |
|---------|---------|
| `node:fs` | File system operations (existsSync, readFileSync, writeFileSync, mkdirSync) |
| `node:path` | Path manipulation (join, resolve, dirname) |
| `node:child_process` | Git commands via execSync |
| `node:os` | homedir(), cpus(), platform detection |
| `node:url` | fileURLToPath for import.meta.url |
| `node:events` | EventEmitter base class for AdaptiveWorkerPool |
| `node:crypto` | randomUUID for IPC message IDs |
| `node:net` | Socket type for IPCClient |
| `node:worker_threads` | Node.js Worker (dynamically imported) |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxWorkers` | `cpus().length - 1` | Maximum concurrent workers |
| `timeout` | `60000` ms | Task timeout |
| `smolMode` | `true` | Bun-specific reduced memory mode |
| `retries` | `1` | Retry count for failed tasks |
| `requestTimeout` | `30000` ms | IPC request timeout |
| `bufferInitialSize` | `16384` bytes | MessageDecoder initial buffer |
| `LOCALAPPDATA` | `AppData/Local` | Windows data directory (env var) |
| `XDG_DATA_HOME` | `~/.local/share` | Linux data directory (env var) |

## Behavioral Properties

| Property | Value |
|----------|-------|
| Async | Yes -- `execute()`, `executeAll()`, `shutdown()`, `request()`, `switchProject()` return Promises |
| Thread Safety | Single-threaded event loop only; no locks on mutable state |
| Idempotency | Path getters and `ensure*` functions are idempotent; lock/state mutation is not |
| Side Effects | File I/O (lock files, mkdir), git execSync, worker process creation |
| State | Singletons: ProjectContextManager, default AdaptiveWorkerPool, cached Runtime |

## Error Handling

Errors use try-catch with fallback values for I/O operations (git, fs). The IPC protocol defines JSON-RPC-style error codes. All errors are logged with context tags before propagation.

| Error | When | Recovery |
|-------|------|----------|
| `PARSE_ERROR (-32700)` | IPC JSON parsing fails | Log, drop message |
| `METHOD_NOT_FOUND (-32601)` | Unknown RPC method | Reject promise |
| `PROJECT_NOT_FOUND (-32001)` | Project not registered | Reject promise |
| `WORKER_ERROR (-32002)` | Worker task failed | Reject, retry if configured |
| `EEXIST` on lock file | Another Core process running | Check if PID alive, takeover if dead |
| Connection closed | IPC socket closes | Reject all pending, clear handlers |
| Request timeout | No response in 30s | Reject with timeout error |
| Task timeout | Worker exceeds time limit | Remove worker, reject, retry |

## Observability

| Event | Level | When |
|-------|-------|------|
| `[AdaptiveWorkerPool] Initialized` | info | Pool created with runtime and config |
| `Created Bun/Node.js worker` | info | New worker spawned |
| `Shutting down N workers` | info | Pool shutdown initiated |
| `Task {id} timed out` | warn | Worker task exceeded timeout |
| `Task {id} failed, retrying` | warn | Task retry triggered |
| `worker_create_fail` | error | Worker instantiation failed |
| `worker_error` | error | Worker emitted error event |
| `[ProjectContext] Switched project` | info | Active project changed |
| `Indexing started/completed for` | info | Indexing state transitions |
| `parse_fail` | error | IPC message JSON parse error |
| `handler_error` | error | IPC event handler threw exception |

## Known Limitations

- **Not thread-safe**: ProjectContextManager and AdaptiveWorkerPool use mutable state without locks; safe only in single-threaded event loop.
- **Git dependency**: Branch detection requires `.git` directory and git binary; returns null or `detached-{hash}` on failure.
- **Platform IPC divergence**: Windows uses named pipe (`\\.\pipe\`), Unix uses domain socket; consumers must handle both.
- **No stack traces over IPC**: Error responses carry code and message only; stack traces are lost across the wire.
- **Deprecated APIs**: `indexing-context.ts`, `getProjectDir()`, `getProjectPaths()` kept for backward compatibility; prefer `ProjectContextManager` and `getGlobalDbPaths()`.
- **Worker pool fixed timeout**: Task timeout is set at pool creation and cannot be overridden per-task.

## TypeScript Notes

### Module Boundary

All types, interfaces, classes, and functions listed in Public API are exported. Internal state (`cachedRuntime`, `state`, `workers`, `taskQueue`, `pendingRequests`, `eventHandlers`, `nodeWorkerModule`, `indexingInProgress`, `onProjectChangeCallbacks`) is private. Generic type parameters on `execute<T>`, `executeAll<T>`, and `request<T>` default to `unknown`. The `BunWorker` and `PooledWorker` interfaces are file-private to `adaptive-worker.ts`. Union types `Runtime`, `IPCMessageType`, and `IPCMessage` discriminate via string literals.

## Files

| File | Description |
|------|-------------|
| [`adaptive-worker.ts`](./adaptive-worker.ts) | Runtime-aware worker pool with Bun/Node.js abstraction, queue, retry, and timeout |
| [`indexing-context.ts`](./indexing-context.ts) | Deprecated backward-compatible wrapper around ProjectContextManager |
| [`ipc-protocol.ts`](./ipc-protocol.ts) | Binary wire protocol (length-prefixed JSON), message types, encoder/decoder, IPC client |
| [`project-context.ts`](./project-context.ts) | Singleton project state manager with change callbacks and indexing tracking |
| [`runtime-detect.ts`](./runtime-detect.ts) | Bun/Node.js runtime detection, Core process lifecycle, lock file management |
| [`storage-paths.ts`](./storage-paths.ts) | Platform-aware directory structure, project hashing, git branch detection, FAISS paths |
