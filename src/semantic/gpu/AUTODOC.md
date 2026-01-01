# Модуль gpu (Unified GPU Worker)

## Описание

Модуль `gpu` предоставляет объединенный GPU worker для выполнения CUDA и Faiss операций. Реализован как Node.js subprocess для совместимости с Bun runtime, объединяя все GPU-зависимые операции в одном процессе для эффективного управления ресурсами.

## Мотивация

Вместо отдельных subprocess для Faiss и CUDA создан **единый GPU worker**:

1. **CUDA similarity** — native module не работает в Bun (NAPI)
2. **Faiss indexing** — faiss-node требует Node.js (NAPI)
3. **Один процесс** — меньше overhead, единое управление GPU памятью

**Примечание:** Генерация эмбеддингов остается в OVMS native (самый быстрый вариант).

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bun MCP Process                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ vector-store │───▶│ gpu-client   │    │ OVMS Native  │      │
│  │ pattern-search│───▶│ (unified)    │    │ (embeddings) │      │
│  │ semantic-merge│───▶│              │    └──────────────┘      │
│  └──────────────┘    └──────┬───────┘                          │
│                             │ spawn("node")                     │
└─────────────────────────────┼───────────────────────────────────┘
                              │ IPC (stdin/stdout JSON)
┌─────────────────────────────▼───────────────────────────────────┐
│                  Node.js GPU Worker                             │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ CUDA Module         │  │ faiss-node          │              │
│  │ (similarity ops)    │  │ (vector indexing)   │              │
│  │                     │  │                     │              │
│  │ - cosineSimilarity  │  │ - init/add/search   │              │
│  │ - batchCosine       │  │ - batchSearch       │              │
│  │ - euclidean         │  │ - train/save/load   │              │
│  │ - normalize         │  │                     │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Файлы

| Файл | Описание |
|------|----------|
| `types.ts` | Unified IPC протокол для Faiss + CUDA операций |
| `gpu-worker.ts` | Node.js subprocess с faiss-node и CUDA addon |
| `gpu-client.ts` | Runtime-aware клиент (GpuDirectClient / GpuSubprocessClient) |
| `index.ts` | Модульный entry point |

## Runtime-Aware Client

```typescript
import { getGpuClient } from './gpu-client';

const client = getGpuClient();
// Node.js → GpuDirectClient (прямой вызов без IPC overhead)
// Bun → GpuSubprocessClient (IPC через subprocess)

await client.start();
```

## IPC Протокол

### CUDA команды

```typescript
type CudaCommands =
  | { type: "cuda.info" }
  | { type: "cuda.cosine"; a: number[]; b: number[] }
  | { type: "cuda.batchCosine"; query: number[]; database: number[][] }
  | { type: "cuda.euclidean"; a: number[]; b: number[] }
  | { type: "cuda.normalize"; vectors: number[][] };
```

### Faiss команды

```typescript
type FaissCommands =
  | { type: "faiss.init"; config: FaissIndexConfig; loadPath?: string }
  | { type: "faiss.add"; ids: string[]; vectors: number[] }
  | { type: "faiss.search"; vector: number[]; k: number }
  | { type: "faiss.batchSearch"; vectors: number[]; nQueries: number; k: number }
  | { type: "faiss.train"; vectors: number[]; nVectors: number }
  | { type: "faiss.save"; path: string }
  | { type: "faiss.load"; path: string }
  | { type: "faiss.remove"; ids: string[] }
  | { type: "faiss.stats" };
```

### Worker lifecycle

```typescript
type LifecycleCommands =
  | { type: "stats" }
  | { type: "shutdown" };
```

## IGpuClient Interface

```typescript
interface IGpuClient {
  // Lifecycle
  start(): Promise<boolean>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Faiss operations
  faissInitialize(config: FaissIndexConfig, loadPath?: string): Promise<FaissInitResponse>;
  faissAdd(ids: string[], vectors: Float32Array | number[]): Promise<FaissAddResponse>;
  faissSearch(vector: Float32Array | number[], k: number): Promise<FaissSearchResult[]>;
  faissBatchSearch(vectors: Float32Array | number[], nQueries: number, k: number): Promise<FaissSearchResult[][]>;
  faissTrain(vectors: Float32Array | number[], nVectors: number): Promise<FaissTrainResponse>;
  faissSave(path?: string): Promise<FaissSaveResponse>;
  faissLoad(path: string): Promise<FaissLoadResponse>;
  faissRemove(ids: string[]): Promise<void>;
  faissGetStats(): Promise<FaissStatsResponse["stats"]>;

  // CUDA operations
  cudaInfo(): Promise<CudaInfoResponse>;
  cudaCosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): Promise<number>;
  cudaBatchCosineSimilarity(query: Float32Array | number[], database: (Float32Array | number[])[]): Promise<Float32Array>;
  cudaEuclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): Promise<number>;
  cudaNormalizeVectors(vectors: (Float32Array | number[])[]): Promise<Float32Array[]>;
  isCudaAvailable(): boolean;

  // Combined stats
  getStats(): Promise<GpuStatsResponse>;
}
```

## Пример использования

```typescript
import { getGpuClient, shutdownGpuClient } from './index';

// Получение клиента (runtime-aware)
const client = getGpuClient();
await client.start();

// CUDA операции
const similarity = await client.cudaCosineSimilarity(vecA, vecB);
const batchSim = await client.cudaBatchCosineSimilarity(query, database);

// Faiss операции
await client.faissInitialize({ dimensions: 768, indexType: 'hnsw' });
await client.faissAdd(['id1', 'id2'], vectors);
const results = await client.faissSearch(queryVector, 10);

// Статистика
const stats = await client.getStats();
console.log(`Faiss: ${stats.faiss.totalVectors} vectors`);
console.log(`CUDA: ${stats.cuda.available ? stats.cuda.deviceInfo.deviceName : 'N/A'}`);

// Graceful shutdown
await shutdownGpuClient();
```

## Blackwell Support

CUDA addon не совместим с архитектурой Blackwell (CC >= 12.0):

```typescript
// gpu-worker.ts автоматически проверяет
const cc = parseFloat(execSync("nvidia-smi --query-gpu=compute_cap ..."));
if (cc >= 12.0) {
  console.error("[gpu-worker] CUDA skipped: Blackwell architecture");
  // cudaAvailable = false, CUDA операции вернут ошибку
}
```

## Преимущества

1. **Один subprocess** — меньше overhead чем несколько workers
2. **Все GPU ops работают** — Node.js имеет полную NAPI поддержку
3. **Runtime-aware** — Direct mode для Node.js, Subprocess для Bun
4. **GPU memory management** — один процесс контролирует VRAM
5. **Graceful degradation** — CPU fallback если GPU недоступен

## Экспорты

```typescript
// Основной API
export { getGpuClient, shutdownGpuClient } from './gpu-client';
export type { IGpuClient } from './gpu-client';
export * from './types';
```
