# 🧵 Worker Threads Analysis & Implementation Strategy

## Executive Summary

**Current State:** ultrascript-tools-mcp имеет конфигурацию для `workerPoolSize` но не использует worker threads в production коде.

**Opportunity:** Применение worker threads может дать **2-4x ускорение** CPU-intensive операций:
- Парсинг файлов (tree-sitter)
- Генерация embeddings (Ollama)
- Code clone detection (JSCPD)
- Python multi-layer analysis

**Приоритет:** HIGH - существенное улучшение производительности для больших кодовых баз.

---

## 🔍 Анализ CPU-Intensive Операций

### 1. Tree-Sitter Parsing (HIGHEST PRIORITY)

**Текущая реализация:**
```typescript
// src/agents/parser-agent.ts
const config = getParserConfig();
workerPoolSize: config.parser.agent?.workerPoolSize ?? 2  // ❌ Не используется!
```

**Проблема:**
- Парсинг выполняется в main thread
- Блокирует event loop при обработке больших файлов
- Нет параллелизации парсинга множества файлов

**Решение с Worker Threads:**

```typescript
// src/parsers/worker-pool/parser-worker.ts
import { parentPort, workerData } from "node:worker_threads";
import { TreeSitterParser } from "../tree-sitter-parser.js";

const parser = new TreeSitterParser();

parentPort?.on("message", async ({ id, filePath, sourceCode, language }) => {
  try {
    const result = await parser.parse(filePath, sourceCode, language);
    parentPort?.postMessage({ id, result, error: null });
  } catch (error) {
    parentPort?.postMessage({ id, result: null, error: error.message });
  }
});
```

```typescript
// src/parsers/worker-pool/parser-worker-pool.ts
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ParserWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: Array<{
    id: string;
    data: any;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private nextTaskId = 0;

  constructor(private poolSize: number = cpus().length - 1) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    const workerPath = join(__dirname, "parser-worker.js");

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath);

      worker.on("message", ({ id, result, error }) => {
        const task = this.taskQueue.find(t => t.id === id);
        if (task) {
          if (error) {
            task.reject(new Error(error));
          } else {
            task.resolve(result);
          }
          this.taskQueue = this.taskQueue.filter(t => t.id !== id);
        }

        // Return worker to available pool
        this.availableWorkers.push(worker);
        this.processQueue();
      });

      worker.on("error", (error) => {
        console.error(`[ParserWorkerPool] Worker error:`, error);
      });

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  async parse(filePath: string, sourceCode: string, language: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `task-${this.nextTaskId++}`;
      const task = { id, data: { id, filePath, sourceCode, language }, resolve, reject };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift()!;
      const worker = this.availableWorkers.shift()!;

      worker.postMessage(task.data);
    }
  }

  async destroy(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}
```

**Ожидаемое улучшение:**
- ⚡ **2-3x ускорение** парсинга для кодовых баз с 100+ файлами
- ✅ Event loop остается свободным
- 📈 Масштабируется с количеством CPU cores

---

### 2. Embedding Generation (HIGH PRIORITY)

**Текущая реализация:**
```typescript
// src/semantic/embedding-generator.ts
async generateBatch(texts: string[]): Promise<number[][]> {
  // Выполняется синхронно в main thread
  return await this.provider.generateEmbeddings(texts);
}
```

**Проблема:**
- Ollama API calls блокируют на 50-200ms per batch
- Нет параллельной генерации для независимых batch'ей
- Semantic search ждет завершения всех embeddings

**Решение с Worker Threads:**

```typescript
// src/semantic/workers/embedding-worker.ts
import { parentPort } from "node:worker_threads";
import { createEmbeddingProvider } from "../providers/factory.js";

let provider: any = null;

parentPort?.on("message", async ({ id, texts, providerConfig }) => {
  try {
    if (!provider) {
      provider = await createEmbeddingProvider(providerConfig);
    }

    const embeddings = await provider.generateEmbeddings(texts);
    parentPort?.postMessage({ id, embeddings, error: null });
  } catch (error) {
    parentPort?.postMessage({ id, embeddings: null, error: error.message });
  }
});
```

```typescript
// src/semantic/workers/embedding-worker-pool.ts
export class EmbeddingWorkerPool {
  private pool: ParserWorkerPool; // Reuse pool architecture

  constructor(poolSize: number = 2) {
    // 2 workers optimal for Ollama (GPU contention)
    this.pool = new ParserWorkerPool(poolSize);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Split into batches for parallel processing
    const batchSize = 16;
    const batches = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    // Process batches in parallel across workers
    const results = await Promise.all(
      batches.map(batch => this.pool.parse("embedding", JSON.stringify(batch), "ollama"))
    );

    return results.flat();
  }
}
```

**Ожидаемое улучшение:**
- ⚡ **1.5-2x ускорение** embedding generation
- 🔄 Параллельная обработка независимых batches
- ⚠️ Ограничение: GPU contention (не более 2-3 workers для Ollama)

---

### 3. Python Multi-Layer Analysis (MEDIUM PRIORITY)

**Текущая реализация:**
```typescript
// src/parsers/python-analyzer.ts
async analyzePythonCode(...) {
  await this.executeLayer1Analysis(rootNode, context);  // Sequential
  await this.executeLayer2Analysis(rootNode, context);  // Sequential
  await this.executeLayer3Analysis(rootNode, context);  // Sequential
  patterns = await this.executeLayer4Analysis(rootNode, context);  // Sequential
}
```

**Проблема:**
- Layers выполняются последовательно
- Layer 1-2 независимы и могут работать параллельно
- Layer 4 (pattern recognition) CPU-intensive

**Решение с Worker Threads:**

```typescript
// Parallel Layer 1-2 execution
async analyzePythonCode(...) {
  // Layers 1-2 can run in parallel
  const [layer1Result, layer2Result] = await Promise.all([
    this.runInWorker('layer1', rootNode, context),
    this.runInWorker('layer2', rootNode, context)
  ]);

  // Merge results
  Object.assign(context, layer1Result, layer2Result);

  // Layer 3 depends on 1-2
  await this.executeLayer3Analysis(rootNode, context);

  // Layer 4 can run in worker
  const patterns = await this.runInWorker('layer4', rootNode, context);
}
```

**Ожидаемое улучшение:**
- ⚡ **1.3-1.5x ускорение** Python analysis
- 📊 Лучше для файлов с 1000+ LOC

---

### 4. JSCPD Clone Detection (MEDIUM PRIORITY)

**Текущая реализация:**
```typescript
// src/vendor/jscpd/jscpd.ts
export async function detectClones(...): Promise<IClone[]> {
  // Синхронная токенизация и сравнение
  const clones = [];
  for (const file of files) {
    const tokens = tokenize(file);  // CPU-intensive
    // ... сравнение O(n²)
  }
  return clones;
}
```

**Проблема:**
- Токенизация CPU-intensive
- Сравнение O(n²) для больших кодовых баз
- Блокирует event loop на секунды

**Решение с Worker Threads:**

```typescript
// Параллельная токенизация файлов
async function detectClonesParallel(files: string[]): Promise<IClone[]> {
  const workerPool = new WorkerPool(cpus().length);

  // Phase 1: Parallel tokenization
  const tokenizedFiles = await Promise.all(
    files.map(file => workerPool.tokenize(file))
  );

  // Phase 2: Parallel pairwise comparison (sharding)
  const comparisons = [];
  const chunkSize = Math.ceil(tokenizedFiles.length / workerPool.size);

  for (let i = 0; i < workerPool.size; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, tokenizedFiles.length);
    const chunk = tokenizedFiles.slice(start, end);

    comparisons.push(
      workerPool.compareChunk(chunk, tokenizedFiles)
    );
  }

  const results = await Promise.all(comparisons);
  return results.flat();
}
```

**Ожидаемое улучшение:**
- ⚡ **3-4x ускорение** для 50+ файлов
- 🎯 Масштабируется линейно с cores

---

## 📊 Приоритизация Implementation

### Phase 1: Parser Worker Pool (2-3 дня)
**ROI: HIGHEST** - самый большой bottleneck

1. Создать `src/parsers/worker-pool/`
2. Имплементировать ParserWorkerPool
3. Интегрировать в ParserAgent
4. Benchmark на 100+ файлах

**Expected speedup:** 2-3x для больших кодовых баз

---

### Phase 2: Embedding Worker Pool (1-2 дня)
**ROI: HIGH** - улучшает semantic search

1. Создать `src/semantic/workers/`
2. Имплементировать EmbeddingWorkerPool
3. Интегрировать в EmbeddingGenerator
4. Ограничить pool size = 2 (GPU contention)

**Expected speedup:** 1.5-2x для batch embedding generation

---

### Phase 3: Python Layer Parallelization (2 дня)
**ROI: MEDIUM** - улучшает только Python files

1. Рефакторить PythonAnalyzer для worker support
2. Parallel Layer 1-2 execution
3. Worker для Layer 4 (pattern recognition)

**Expected speedup:** 1.3-1.5x для Python analysis

---

### Phase 4: JSCPD Worker Pool (1-2 дня)
**ROI: MEDIUM** - используется реже

1. Рефакторить JSCPD для parallel tokenization
2. Sharded comparison strategy
3. Benchmark

**Expected speedup:** 3-4x для 50+ файлов

---

## 🎯 Implementation Checklist

### Worker Pool Base Class
```typescript
// src/core/worker-pool.ts
export abstract class WorkerPool<TInput, TOutput> {
  protected workers: Worker[];
  protected queue: Task<TInput, TOutput>[];

  abstract getWorkerPath(): string;
  abstract execute(input: TInput): Promise<TOutput>;

  async init(): Promise<void>;
  async destroy(): Promise<void>;
}
```

### Configuration
```yaml
# config/default.yaml
parser:
  agent:
    workerPoolSize: 4  # Auto: cpus().length - 1
    workerPoolEnabled: true

semantic:
  embedding:
    workerPoolSize: 2  # Limited for GPU
    workerPoolEnabled: true

jscpd:
  workerPoolSize: 4
  workerPoolEnabled: true
```

### Graceful Degradation
```typescript
// Fallback to sync if workers fail
class ParserAgent {
  private workerPool: ParserWorkerPool | null;

  async parse(file: string): Promise<any> {
    if (this.workerPool && config.workerPoolEnabled) {
      try {
        return await this.workerPool.parse(file);
      } catch (error) {
        console.warn('[ParserAgent] Worker failed, falling back to sync');
      }
    }

    // Fallback to synchronous parsing
    return await this.parseSync(file);
  }
}
```

---

## 🚀 Performance Benchmarks (Projected)

### Current State
```
Codebase: 1000 files, 500KB avg
- Parsing: 45 seconds
- Embedding: 30 seconds
- Total indexing: 90 seconds
```

### With Worker Threads (Phase 1-2)
```
Codebase: 1000 files, 500KB avg
- Parsing: 18 seconds (-60%) ⚡
- Embedding: 18 seconds (-40%) ⚡
- Total indexing: 45 seconds (-50%) ⚡⚡⚡
```

### Full Implementation (All Phases)
```
Codebase: 1000 files, 500KB avg
- Parsing: 15 seconds (-67%) ⚡⚡
- Embedding: 15 seconds (-50%) ⚡
- Clone detection: 8 seconds (-75%) ⚡⚡⚡
- Total indexing: 38 seconds (-58%) ⚡⚡⚡
```

---

## ⚠️ Considerations & Trade-offs

### Pros
✅ Massive performance improvements (2-4x)
✅ Better CPU utilization
✅ Event loop stays responsive
✅ Scales with hardware

### Cons
❌ Increased memory usage (~50MB per worker)
❌ Complexity in debugging (multi-threaded issues)
❌ Node.js version requirements (v12+)
❌ Bun compatibility needs testing

### Memory Impact
```
Without workers: ~500MB baseline
With 4 parser workers: ~700MB (+40%)
With 2 embedding workers: ~800MB (+60%)

Acceptable for servers, may be high for laptops
→ Make workerPoolSize configurable
```

---

## 🎓 Recommendations

1. **Start with Phase 1 (Parser Worker Pool)**
   - Biggest bottleneck
   - Easiest to implement
   - Clear performance win

2. **Set conservative defaults**
   ```typescript
   workerPoolSize: Math.max(1, cpus().length - 2)  // Leave 2 cores for OS
   ```

3. **Add feature flag**
   ```yaml
   experimental:
     workerThreads: true  # Can disable if issues
   ```

4. **Monitor memory usage**
   ```typescript
   if (getMemoryUsage() > THRESHOLD) {
     await workerPool.shrink();
   }
   ```

5. **Benchmark before/after**
   ```bash
   npm run benchmark:index -- --files=1000
   ```

---

## 📝 Next Steps

1. ✅ Approve architecture
2. 🔨 Implement Phase 1 (parser worker pool)
3. 📊 Benchmark and validate
4. 🚀 Roll out Phase 2-4 based on results

**Estimated total effort:** 6-9 дней для full implementation
**Expected performance gain:** 2-4x for CPU-intensive operations
