# OpenVINO + Bun Crash Analysis

## Problem Summary

OpenVINO embedding generation crashes at ~250-500 embeddings when running under Bun runtime, while Node.js handles 2000+ embeddings without issues.

## Environment

- **OS**: Windows 11
- **Bun version**: 1.x
- **Node.js version**: 22.x
- **OpenVINO**: openvino-node package
- **Models tested**:
  - `multilingual-e5-base` (768 dimensions)
  - `all-MiniLM-L6-v2` (384 dimensions)

## Key Observations

### 1. Memory is NOT the issue
- RSS stays stable at ~3.3-3.5GB before crashes
- Heap usage normal (~200-400MB)
- External memory stable
- ArrayBuffers stable

### 2. Crash pattern
- Native segfault (not JavaScript exception)
- No error message captured
- Process terminates abruptly
- Happens at varying embed counts: 250, 298, 495, 545, 800

### 2.1 Reproducible Test Results (2024-12-13)

**Test**: Real code chunks from src/ directory (2000 chunks, ~20 lines each)

| Runtime | Result | Embeddings | RSS | Rate |
|---------|--------|------------|-----|------|
| **Bun 1.3.4** | Crash at #800 | 800/2000 | 700MB → segfault | 500/s |
| **Node.js + tsx** | Success | 2000/2000 | ~340MB stable | 425/s |

```bash
# Bun crash output:
panic(thread 21800): Segmentation fault at address 0xFFFFFFFE
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
https://bun.report/1.3.4/...

# Node.js output:
Test Complete!
Total chunks: 2000
Successful: 2000
Errors: 0
Total time: 4.7s
Average rate: 425.5 embeddings/sec
```

**Key observation**: Node.js uses ~340MB RSS vs Bun's 700MB, suggesting Bun has higher memory overhead with native modules.

### 2.2 LibSQL Makes It Worse! (CRITICAL FINDING)

**Test**: OpenVINO + LibSQL insertions (synthetic data, 4 repeating texts)

| Test | Data Type | Crash At | Notes |
|------|-----------|----------|-------|
| OpenVINO only | Real code | ~800 | No DB operations |
| OpenVINO + LibSQL | Synthetic | **~450** | With INSERT after each embed |

```bash
# Bun crash with LibSQL:
[23.2s] #450: heap=282MB rss=2801MB
panic(main thread): Segmentation fault at address 0xFFFFFFFFFFFFFFFF
```

**Conclusion**: Combining two native modules (OpenVINO + LibSQL) in Bun causes faster crashes.
This explains why:
- **Before** (bulk generation, no intermediate DB writes): ~5000 embeddings worked
- **Now** (write to DB after each batch): ~300 embeddings before crash

### 3. What WORKS

| Scenario | Result | Notes |
|----------|--------|-------|
| Node.js runtime | 2050+ embeddings | RSS ~1.8GB, stable |
| Bun with synthetic test | 5000+ embeddings | Same text repeated |
| Bun in "two passes" | Works | Restart between batches |
| Bun first run after restart | ~500 embeddings | Then crashes |

### 4. What DOESN'T help

| Attempted Fix | Result |
|---------------|--------|
| InferRequest recreation every 25/50 embeds | Still crashes |
| Disabling InferRequest recreation | Still crashes |
| Smaller model (384 dim vs 768 dim) | Still crashes |
| 5ms delay between embeddings | Still crashes |
| Increased queue size | Made it worse |
| Tensor disposal (dispose() calls) | Still crashes |

## Root Cause Hypothesis

The issue appears to be **Bun's native module interop** with OpenVINO's C++ bindings:

1. **Synthetic tests work** because they process identical/similar text, exercising the same tokenizer codepaths

2. **Real indexing fails** because diverse code text causes:
   - Different tokenization patterns
   - Different attention mask configurations
   - More varied native memory access patterns

3. **"Two passes" works** because restarting the MCP server:
   - Creates fresh native objects
   - Clears any accumulated native state
   - Resets tokenizer's internal caches

4. **Node.js works** because it has more mature/stable native module bindings

## Technical Details

### Memory Layout

```
Bun (crashes):
  embed #25:  heap=200MB rss=3400MB ext=50MB arr=10MB
  embed #50:  heap=210MB rss=3420MB ext=52MB arr=10MB
  embed #75:  heap=205MB rss=3410MB ext=51MB arr=10MB
  ... crash at ~250-500

Node.js (stable):
  embed #25:  heap=180MB rss=1800MB ext=40MB arr=8MB
  embed #2000: heap=190MB rss=1820MB ext=42MB arr=8MB
  ... continues successfully
```

### Code Path Analysis

The crash happens in the native layer, likely in one of:

1. `infer.infer()` - OpenVINO inference call
2. `this.tokenizer(text, ...)` - Xenova transformers tokenization
3. `new ov.Tensor(...)` - Tensor creation

The tokenizer is the most likely culprit because:
- It handles arbitrary text input
- It uses WASM/native bindings
- Different texts = different internal state

## Potential Solutions

### Solution 1: Auto-restart provider (Recommended)

Add automatic provider restart after N embeddings:

```typescript
// In OpenVINOProvider
private restartThreshold = 400; // Restart before typical crash point

async embed(text: string): Promise<Float32Array> {
  if (this.embedCount >= this.restartThreshold) {
    await this.reinitialize();
  }
  // ... rest of embed
}

private async reinitialize(): Promise<void> {
  this.log?.info("Auto-restarting provider", { embedCount: this.embedCount });
  await this.close();
  await this.initialize();
}
```

### Solution 2: Use Node.js for MCP server

Create alternative MCP config using Node.js:

```bash
claude mcp add ultrascript-node -- node "D:/github/ultrascript-tools-mcp/dist/index.js"
```

This is confirmed working with 2000+ embeddings.

### Solution 3: Checkpoint-based processing

Save progress periodically and allow resumption:

```typescript
// In semantic-agent.ts
if (processedCount % 400 === 0) {
  await this.saveCheckpoint();
  // Signal to restart provider
}
```

### Solution 4: Process in batches with provider restart

```typescript
async generateAllEmbeddings(entities: Entity[]): Promise<void> {
  const BATCH_SIZE = 400;

  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE);
    await this.processBatch(batch);

    // Restart provider between batches
    await this.provider.close();
    await this.provider.initialize();
  }
}
```

## Recommended Action

1. **Short-term**: Use Node.js MCP server (`ultrascript-node`)
2. **Medium-term**: Implement auto-restart after 400 embeddings
3. **Long-term**: Report issue to Bun team with reproduction case

## Files Involved

- `src/semantic/providers/openvino-provider.ts` - Main provider
- `src/agents/semantic-agent.ts` - Embedding orchestration
- `src/semantic/embedding-generator.ts` - Batch processing

## Related Issues

- Bun native module compatibility: https://github.com/oven-sh/bun/issues
- OpenVINO Node.js bindings: https://github.com/openvinotoolkit/openvino/tree/master/src/bindings/js
