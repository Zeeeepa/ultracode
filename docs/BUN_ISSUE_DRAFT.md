# Bun Issue: setTimeout causes segfault with native modules (OpenVINO)

## Title
Segmentation fault when using setTimeout between openvino-node native calls

## Bug Description

Bun crashes with segmentation fault when `setTimeout()` is used between calls to native modules like `openvino-node`. The crash occurs after ~600-700 setTimeout calls, regardless of the delay duration (even 0ms).

**Root Cause Identified**: The crash is caused specifically by `setTimeout()` in the event loop between native module operations. Replacing `setTimeout` with `Promise.resolve()` completely fixes the issue.

## Reproduction

### Minimal reproduction (crashes after ~600-700 iterations)

```typescript
// crash-test.ts
import { EmbeddingGenerator } from "./src/semantic/embedding-generator.js";

async function main() {
  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.log("Ready");

  for (let i = 0; i < 2000; i++) {
    const texts = [`Test text number ${i}`];
    await generator.generateBatch(texts);

    // THIS CAUSES THE CRASH - even with 0ms delay!
    await new Promise((resolve) => setTimeout(resolve, 0));

    if ((i + 1) % 100 === 0) console.log(`Progress: ${i + 1}`);
  }

  console.log("Done");
}

main().catch(console.error);
```

### Working version (5000+ iterations without crash)

```typescript
// works-fine.ts
import { EmbeddingGenerator } from "./src/semantic/embedding-generator.js";

async function main() {
  const generator = new EmbeddingGenerator({
    provider: "openvino",
    modelName: "all-MiniLM-L6-v2",
    batchSize: 8,
  });

  await generator.initialize();
  console.log("Ready");

  for (let i = 0; i < 5000; i++) {
    const texts = [`Test text number ${i}`];
    await generator.generateBatch(texts);

    // THESE ALL WORK FINE:
    // await Promise.resolve();  // OK
    // await queueMicrotask();   // OK
    // await setImmediate();     // OK
    // (no await)                // OK

    if ((i + 1) % 100 === 0) console.log(`Progress: ${i + 1}`);
  }

  console.log("Done: 5000 embeddings");
}

main().catch(console.error);
```

### Environment

- **Bun version**: 1.3.4 (5eb2145b)
- **OS**: Windows 11
- **CPU**: Intel with AVX2 support
- **Package**: `openvino-node@2025.0.0-preview.5` (N-API native module)

## Test Results

| Async Pattern | 500 embeddings | 2000 embeddings | 5000 embeddings |
|---------------|----------------|-----------------|-----------------|
| No async | ✅ 891ms | ✅ 3470ms | ✅ Works |
| `Promise.resolve()` | ✅ 902ms | ✅ 4593ms | ✅ Works |
| `queueMicrotask()` | ✅ 976ms | ✅ Works | ✅ Works |
| `setImmediate()` | ✅ 923ms | ✅ Works | ✅ Works |
| `setTimeout(0)` | ✅ 8340ms | ❌ Crash ~600 | ❌ Crash |
| `setTimeout(1)` | ❌ Crash | ❌ Crash | ❌ Crash |
| `setTimeout(5)` | ❌ Crash | ❌ Crash | ❌ Crash |

## Expected Behavior

`setTimeout` should work the same as other async scheduling primitives without causing crashes.

## Actual Behavior

Bun crashes with exit code 127 (segfault) after ~600-700 setTimeout calls between native module operations:

```
Exit code 127
Progress: 600/2000
(crash - no error message, just exits)
```

## Key Findings

1. **setTimeout is the culprit** - not concurrent native module usage
2. **Delay duration doesn't matter** - crashes with 0ms, 1ms, 5ms, etc.
3. **Microtasks work fine** - `Promise.resolve()`, `queueMicrotask()`, `setImmediate()` all work
4. **Node.js works perfectly** - same code runs 5000+ iterations without issues
5. **Memory is stable** - no memory leak before crash

## Workaround

Replace all `setTimeout` between native module calls with `Promise.resolve()`:

```typescript
// BEFORE (crashes)
await new Promise((resolve) => setTimeout(resolve, 5));

// AFTER (works)
await Promise.resolve();
```

## Additional Context

- `openvino-node` uses N-API for native bindings
- Problem appears to be in Bun's timer queue interaction with native module state
- The crash happens regardless of what the native module is doing
- Similar issues might affect other N-API native modules

## Related

- Bun N-API implementation
- Timer queue / event loop handling
- Native module state preservation across timer callbacks

---

**This is now a solved workaround for us, but filing for Bun team awareness as this could affect other native module users.**
