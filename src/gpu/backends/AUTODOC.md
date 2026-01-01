# Модуль backends

## Описание

Модуль `backends` предоставляет реализации различных вычислительных бэкендов для выполнения векторных операций (cosine similarity, euclidean distance, normalize). Он содержит абстрактные и конкретные классы, реализующие интерфейс VectorBackend для различных платформ и технологий.

## Архитектура

```
                    VectorBackend (interface)
                           │
    ┌──────────┬───────────┼───────────┬───────────┬──────────┐
    │          │           │           │           │          │
    ▼          ▼           ▼           ▼           ▼          ▼
 CudaBackend  GpuWorker   Metal     WebGPU      WASM       JS
             Backend     Backend    Backend    Backend   Backend
    │          │
    │          │ (Bun runtime)
    │          ▼
    │     gpu-worker.ts (Node.js subprocess)
    │          │
    └──────────┴─► CUDA native addon
```

## Файлы

| Файл | Описание | Приоритет |
|------|----------|-----------|
| `base.ts` | Базовый интерфейс VectorBackend, определяющий общий контракт для всех бэкендов | — |
| `cuda-backend.ts` | CUDA через native addon (только Node.js, не работает в Bun) | 100 |
| `gpu-worker-backend.ts` | CUDA через GPU Worker subprocess (работает в Bun через Node.js) | 98-100 |
| `metal-backend.ts` | Metal API для Apple Silicon (macOS) | 95 |
| `webgpu-backend.ts` | WebGPU API для браузеров и Deno | 90 |
| `wasm-backend.ts` | WebAssembly с SIMD оптимизациями | 80 |
| `js-backend.ts` | JavaScript fallback (всегда доступен) | 10 |

## VectorBackend Interface

```typescript
interface VectorBackend {
  // Название бэкенда для логирования
  readonly name: string;

  // Приоритет (больше = предпочтительнее)
  readonly priority: number;

  // Проверка доступности
  isAvailable(): Promise<boolean>;

  // Векторные операции
  cosineSimilarity(a: Float32Array, b: Float32Array): Promise<number>;
  batchCosineSimilarity(query: Float32Array, database: Float32Array[]): Promise<Float32Array>;
  euclideanDistance(a: Float32Array, b: Float32Array): Promise<number>;
  normalizeVectors(vectors: Float32Array[]): Promise<Float32Array[]>;

  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
```

## CudaBackend

Прямой вызов CUDA native addon. Работает только в Node.js из-за NAPI зависимости.

**Требования:**
- Node.js runtime (не Bun)
- NVIDIA GPU с Compute Capability < 12.0 (не Blackwell)
- CUDA Toolkit установлен
- Native addon в `external-libs/cuda-{platform}-x64/`

**Путь к addon:**
```
external-libs/cuda-win32-x64/ultrascript_cuda.node  (Windows)
external-libs/cuda-linux-x64/ultrascript_cuda.node (Linux)
```

## GpuWorkerBackend

CUDA операции через Node.js subprocess. Решает проблему несовместимости Bun с NAPI модулями.

**Архитектура:**
```
Bun MCP Process                    Node.js GPU Worker
┌───────────────────┐              ┌───────────────────┐
│ GpuWorkerBackend  │  IPC JSON    │ gpu-worker.ts     │
│                   │ ──────────►  │                   │
│ cosineSimilarity()│              │ CUDA addon load   │
│ batchCosineSimilarity()          │ faiss-node load   │
└───────────────────┘              └───────────────────┘
```

**Преимущества:**
- CUDA работает под Bun runtime
- Единый subprocess для Faiss + CUDA операций
- Автоматический graceful shutdown
- Runtime-aware приоритет (выше под Bun)

**IPC команды:**
- `cuda.cosine` — косинусное сходство двух векторов
- `cuda.batchCosine` — batch косинусное сходство
- `cuda.euclidean` — евклидово расстояние
- `cuda.normalize` — L2 нормализация

## WasmBackend

WebAssembly с SIMD оптимизациями для кросс-платформенной производительности.

**Модуль:** `external-tools/wasm/vector-ops-simd/`

**Операции:**
- 128-bit SIMD для float32 (4 элемента параллельно)
- Оптимизированные циклы для batch операций

## JsBackend

JavaScript fallback реализация. Всегда доступна, используется когда другие бэкенды недоступны.

**Характеристики:**
- Приоритет: 10 (самый низкий)
- Нет внешних зависимостей
- Работает везде (Node.js, Bun, Browser)

## Экспорты

Модуль предназначен для внутреннего использования. Бэкенды создаются через `BackendSelector`:

```typescript
import { getBestBackend } from '../backend-selector';

const backend = await getBestBackend();
const similarity = await backend.cosineSimilarity(vecA, vecB);
```

## Приоритеты выбора

| Условие | Выбранный Backend |
|---------|-------------------|
| Node.js + CUDA + CC < 12.0 | CudaBackend (100) |
| Bun + CUDA available | GpuWorkerBackend (100) |
| Node.js + CUDA available | GpuWorkerBackend (98) |
| macOS + Apple Silicon | MetalBackend (95) |
| WebGPU available | WebGpuBackend (90) |
| WASM SIMD support | WasmBackend (80) |
| Fallback | JsBackend (10) |
