# bun:sqlite JSC GC SEGFAULT — detect_patterns after index()

## Summary

`detect_patterns` crashes with `MCP error -32000: Connection closed` (native SEGFAULT) when called after `index()` in the same Bun process. Works fine in a fresh session where index data was loaded from disk.

**Status**: Mitigated (not fully resolved — Bun upstream bug)
**Affected**: Bun 1.1.x on Windows/Linux, projects with >10000 entities
**Root cause**: JSC (JavaScriptCore) GC crash in `SlotVisitor::drainFromShared` triggered by large `bun:sqlite stmt.all()` results after JIT warmup from `index()`

## Reproduction

1. Open Claude in FABUZA2 project directory (~14528 C# entities)
2. Run `index(reset=true)` — indexes all 14528 entities
3. Run `detect_patterns(entityLimit=50000)` — **SEGFAULT**
4. Same `detect_patterns` in a **new session** (without index) — works perfectly

## Root Cause Analysis

### Why it crashes only after index() in the same session

1. `index()` creates 14528 Entity objects with parsed metadata, embedding vectors, AST nodes
2. JSC FTL JIT compiler optimizes hot paths (`rowToEntity`, `JSON.parse`, property access)
3. `detect_patterns` calls `findEntities()` which uses `stmt.all()` returning thousands of rows
4. Single large `stmt.all()` creates massive JS object array inside native FFI boundary
5. JSC GC cannot scan these objects during FFI call — gets overwhelmed when they appear all at once
6. `SlotVisitor::drainFromShared` encounters invalid/stale pointers → SEGFAULT

### Key evidence

- No JS error handlers fire (uncaughtException, SIGABRT, exit) — pure native crash
- Memory is stable (RSS ~1.5GB, heap ~175MB) — NOT out of memory
- Crash moves proportionally when rules are removed — NOT rule-specific
- Crash threshold: ~10000 entities stable, 14528 crashes
- Works in fresh session with same data — JIT warmup state is the trigger

## Solution

### 1. SQL Chunking in entity-ops.ts (CRITICAL)

```typescript
// Instead of one large query:
// SELECT ... LIMIT 14528

// Use chunked reads:
const CHUNK_SIZE = 2000;
while (entities.length < limit) {
  const result = await client.execute({
    sql: baseSql + " LIMIT ? OFFSET ?",
    args: [...baseArgs, chunkLimit, chunkOffset]
  });
  // process chunk...
}
```

**Why it works**: Multiple small `stmt.all()` calls (2000 rows each) instead of one large call. Between calls, JSC has normal JS frames where GC can safely scan objects.

### 2. Post-index GC in auto-indexer.ts

```typescript
// At end of bgPromise, after all background work:
if (typeof globalThis["Bun"]?.["gc"] === "function") {
  globalThis["Bun"]["gc"](true); // full synchronous GC
}
```

Reclaims AST nodes, embedding vectors, and intermediate objects from indexing before `detect_patterns` starts.

### 3. Default entityLimit = 10000

Safe maximum for Bun. Users can use `filePath` parameter to scan subfolders for larger projects.

## What was tried and DIDN'T work

| Approach | Result | Why |
|----------|--------|-----|
| `setTimeout(0)` yields in loop | **CRASHED** | `setTimeout` itself crashes Bun in hot paths |
| `Bun.sleep(0)` yields in loop | **NO EFFECT** | Crash happens inside synchronous code between yields |
| `Bun.gc(true)` every N iterations | **WORSE** | GC traversal on already-corrupted pointers triggers crash faster |
| Entity chunking in PatternEngine | **NO EFFECT** | Separate `detect()` calls still crash if entities came from large `stmt.all()` |
| `mmap_size = 0` | **NO EFFECT** | Crash unrelated to memory-mapped I/O |
| `writeFileSync` diagnostics removal | **NO EFFECT** | Not caused by synchronous file I/O |
| Disabling specific pattern rules | **MOVED CRASH** | Crash shifted proportionally — confirmed NOT rule-specific |

## Affected Files

| File | Change | Purpose |
|------|--------|---------|
| `src/storage/libsql/entity-ops.ts` | SQL chunking (LIMIT 2000) | Prevent large `stmt.all()` results |
| `src/core/auto-indexer.ts` | `Bun.gc(true)` after bgPromise | Clean heap after indexing |
| `src/analysis/patterns/pattern-engine.ts` | `entityLimit` default 10000 | Safe maximum |
| `src/storage/multi-db-manager.ts` | `mmap_size` restored to 256MB | Was incorrectly disabled during investigation |
| `src/index.ts` | `detect_patterns` in HEAVY_ANALYSIS_TOOLS | `suspendTimers()` protection |

## Known Bun Issues (upstream)

- JSC GC `SlotVisitor::drainFromShared` crashes with large SQLite result sets (4M+ records or 22K+ objects)
- Reported in multiple Bun GitHub issues (open as of 2025)
- Partial fixes in Bun v1.1.14+ for joins/GC, but not all cases covered
- `setTimeout` can crash in Bun hot paths — use `Bun.sleep()` or avoid entirely

## Workaround for full project scan

For projects with >10000 entities, scan by subfolder:

```
detect_patterns(filePath="src/Services", entityLimit=10000)
detect_patterns(filePath="src/Controllers", entityLimit=10000)
```

Each call processes a subset, avoiding the JSC GC threshold.

## Timeline

- **Investigation start**: Systematic elimination of hypotheses
- **Breakthrough**: Removing SQL chunking caused 5000-entity crash — proved `stmt.all()` size is the trigger
- **Fix confirmed**: SQL chunking (2000 rows) + post-index GC → 10000 entities stable after index()
