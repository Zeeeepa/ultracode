# Bun Compatibility Analysis for UltraScript Tools MCP

## Summary

Analysis of code patterns that may cause crashes or instability when running with Bun runtime, particularly with OpenVINO native module and libsql vector database.

---

## CRITICAL Issues (Cause Crashes)

### 1. `process.memoryUsage()` during Native Operations
**Status**: PARTIALLY FIXED
**Risk**: Crashes Bun when called during OpenVINO inference

**Affected Files**:
- `src/agents/base.ts:363` - DISABLED (commented out)
- `src/agents/semantic-agent.ts` - DISABLED
- `src/semantic/providers/openvino-provider.ts:503` - DISABLED
- `src/index.ts:2933` - **ACTIVE** (in get_metrics tool)
- `src/index.ts:5782` - **ACTIVE** (in get_graph_health tool)
- `src/storage/graph-storage.ts:1036,1260` - **ACTIVE**
- `src/storage/graph-storage-libsql.ts:453` - **ACTIVE**
- `src/parsers/python-analyzer.ts:171,176` - **ACTIVE**

**Recommendation**: Wrap ALL process.memoryUsage() calls with OPENVINO_MODE check:
```typescript
const memoryUsage = (globalThis as any).__OPENVINO_MODE__
  ? { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 }
  : process.memoryUsage();
```

### 2. `global.gc()` during Native Operations
**Status**: PARTIALLY FIXED
**Risk**: Crashes Bun when called during OpenVINO inference

**Affected Files**:
- `src/agents/dev-agent.ts:538` - **ACTIVE** `global.gc?.()`
- `src/core/resource-manager.ts:247-249` - **ACTIVE** (but protected by OPENVINO_MODE)

**Recommendation**: Never call gc() during embedding generation.

### 3. setTimeout/setInterval Callbacks during OpenVINO
**Status**: MOSTLY FIXED
**Risk**: Timer callbacks crash Bun with native module

**Already Fixed**:
- `withTimeout()` in index.ts - converted to async polling
- All async loops - use `__TIMERS_SUSPENDED__` flag
- `waitForEmbeddingReady()` - converted to async polling
- Connection pool acquire timeouts - converted to async polling
- Batch operations retry delays - converted to async delay

**Still Using setTimeout** (but protected):
- Async loop delay() methods - only run after indexing
- Resource manager monitoring - disabled in OPENVINO_MODE

### 4. InferRequest Recreation in OpenVINO
**Status**: FIXED
**Risk**: Recreating InferRequest crashes Bun

**File**: `src/semantic/providers/openvino-provider.ts:506-520`
**Fix**: Disabled periodic InferRequest recreation

---

## HIGH PROBABILITY Issues (May Cause Instability)

### 1. LibSQL Batch INSERT with Vector Index
**Status**: NEEDS OPTIMIZATION
**Risk**: Memory pressure and crashes during mass vector inserts

**Current Pattern** (problematic):
```typescript
// libsql-graph-adapter.ts:1020
const batchSize = 100;  // Too large for vector index
await this.client!.batch(batch, "write");
```

**Problems**:
- Vector index (DiskANN) rebuilds on each batch
- 100 vectors per batch = high memory pressure
- No explicit transaction control

**Recommendation**:
```typescript
const batchSize = 20;  // Smaller batches
// Add delay between batches for GC
if (index > 0 && index % 5 === 0) {
  await Promise.resolve();  // Yield to event loop
}
```

### 2. Worker Threads (node:worker_threads)
**Status**: DISABLED BY DEFAULT
**Risk**: Worker threads have compatibility issues in Bun

**File**: `src/agents/workers/generic-language-worker.ts`
Uses: `parentPort`, `workerData` from `node:worker_threads`

**Current State**: Workers disabled (`USE_WORKERS_TEMP_DISABLED = true`)
**Recommendation**: Keep disabled for Bun, enable only for Node.js

### 3. High-frequency Promise.resolve() Yields
**Status**: NEEDS MONITORING
**Risk**: Too many yields may overwhelm event loop

**Current Pattern**:
```typescript
// Every 5 embeddings
if ((i + 1) % 5 === 0) {
  await Promise.resolve();
}
```

**Recommendation**: Monitor if reducing frequency helps stability.

---

## MEDIUM PROBABILITY Issues

### 1. better-sqlite3 Native Bindings
**Status**: IN USE
**Risk**: Native SQLite bindings may have edge cases in Bun

**Files**: `src/storage/graph-storage.ts`, `src/storage/batch-operations.ts`

**Pattern**: Using `.transaction()` wrapper which is good, but:
- No explicit connection pooling for writes
- Potential lock contention during concurrent operations

### 2. @libsql/client Native Operations
**Status**: IN USE
**Risk**: libsql client may have Bun-specific issues

**Pattern**:
```typescript
await this.client.batch(statements, "write");
```

**Recommendation**: Consider adding retry logic with exponential backoff.

### 3. Transformers.js Tokenizer
**Status**: IN USE
**Risk**: WebAssembly/native tokenizer may have issues

**File**: `src/semantic/providers/openvino-provider.ts`
Uses: `@xenova/transformers` for tokenization

**Current Status**: Works but may contribute to memory pressure.

---

## LOW RISK / NOT A PROBLEM

### 1. async_hooks, perf_hooks, vm
**Status**: NOT USED
No direct usage found in codebase.

### 2. process.binding, module._extensions
**Status**: NOT USED
No direct usage found.

### 3. node:inspector, trace_events, repl
**Status**: NOT USED
No direct usage found.

---

## Recommended Fixes Priority

### Immediate (P0) - Fix Crashes
1. **Reduce libsql batch size** from 100 to 20 for vector inserts
2. **Add delay between batches** in libsql-graph-adapter.ts
3. **Wrap remaining process.memoryUsage()** with OPENVINO_MODE check
4. **Remove gc() call** from dev-agent.ts during indexing

### Short-term (P1) - Improve Stability
5. **Add retry logic** to libsql batch operations
6. **Consider building vector index AFTER** bulk insert, not during
7. **Reduce embedding batch size** from 10 to 5 in semantic-agent

### Medium-term (P2) - Optimization
8. **Profile memory usage** with Node.js to establish baseline
9. **Test with Bun.gc()** instead of global.gc() if needed
10. **Consider streaming inserts** instead of batch for large datasets

---

## Test Matrix

| Scenario | Node.js | Bun (no OpenVINO) | Bun + OpenVINO |
|----------|---------|-------------------|----------------|
| Parse files | OK | OK | OK |
| Store entities | OK | OK | ? |
| Generate embeddings | OK | OK | CRASH ~800 |
| Store embeddings | OK | ? | CRASH |
| Search vectors | OK | OK | OK |

---

## Environment Variables for Debugging

```bash
# Disable semantic/embedding entirely
MCP_DEBUG_DISABLE_SEMANTIC=1

# Disable workers
PARSER_USE_WORKERS=0

# Enable verbose logging
LOG_LEVEL=debug
```

---

## Related Documentation

- `docs/OPENVINO_BUN_CRASH_ANALYSIS.md` - Detailed crash analysis
- `docs/BUN_ISSUE_DRAFT.md` - Draft for Bun issue report
