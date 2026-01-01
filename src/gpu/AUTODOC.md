# Модуль GPU

## Описание и Обзор

Модуль **gpu** отвечает за управление графическими процессорами и выбор backend-ов для выполнения векторных операций (cosine similarity, euclidean distance, normalize). Он обеспечивает абстракцию над различными вычислительными API (CUDA, WebGPU, Metal, WASM, JS) и автоматически выбирает наиболее подходящий backend в зависимости от доступных ресурсов, runtime (Bun/Node.js) и возможностей устройства.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                     BackendSelector                              │
│  ┌──────────────┐                                               │
│  │ detectGPU()  │ ── анализ доступных GPU и API                 │
│  │ getBestBackend() │ ── выбор оптимального backend             │
│  └──────────────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    VectorBackend                            ││
│  │  - cosineSimilarity(a, b)                                   ││
│  │  - batchCosineSimilarity(query, database)                   ││
│  │  - euclideanDistance(a, b)                                  ││
│  │  - normalizeVectors(vectors)                                ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                        │
│         ├── CudaBackend (priority 100) ── Node.js native         │
│         ├── GpuWorkerBackend (priority 98-100) ── Bun via subprocess│
│         ├── MetalBackend (priority 95) ── Apple Silicon          │
│         ├── WebGpuBackend (priority 90) ── Browser/Deno          │
│         ├── WasmBackend (priority 80) ── SIMD optimized          │
│         └── JsBackend (priority 10) ── fallback                  │
└─────────────────────────────────────────────────────────────────┘
```

## Runtime-Aware Backend Selection

| Runtime | CUDA Available | Selected Backend |
|---------|---------------|------------------|
| Node.js | Yes | CudaBackend (native) |
| Node.js | No | WasmBackend / JsBackend |
| Bun | Yes | GpuWorkerBackend (subprocess) |
| Bun | No | WasmBackend / JsBackend |
| Browser | WebGPU | WebGpuBackend |
| Browser | No WebGPU | WasmBackend / JsBackend |

## Файлы

| Файл | Описание |
|------|----------|
| `backend-selector.ts` | Логика выбора подходящего backend-а с учетом runtime, приоритетов и доступности GPU |

## Подмодули

### backends/ — Реализации VectorBackend

| Файл | Описание | Приоритет |
|------|----------|-----------|
| `base.ts` | Базовый интерфейс VectorBackend | — |
| `cuda-backend.ts` | CUDA через native addon (Node.js) | 100 |
| `gpu-worker-backend.ts` | CUDA через GPU Worker subprocess (Bun compatible) | 98-100 |
| `metal-backend.ts` | Metal API (Apple Silicon) | 95 |
| `webgpu-backend.ts` | WebGPU API (Browser, Deno) | 90 |
| `wasm-backend.ts` | WebAssembly SIMD | 80 |
| `js-backend.ts` | JavaScript fallback | 10 |

### detection/ — Детекция GPU

| Файл | Описание |
|------|----------|
| `gpu-detector.ts` | Определение доступных GPU и их возможностей |
| `cuda-detector.ts` | Специфичная детекция NVIDIA CUDA |

## GpuWorkerBackend

Специальный backend для запуска CUDA операций под Bun runtime. Bun не поддерживает нативные NAPI модули напрямую, поэтому GpuWorkerBackend запускает Node.js subprocess с CUDA addon.

```
Bun Process                           Node.js Subprocess
┌─────────────────┐                   ┌─────────────────┐
│ GpuWorkerBackend│   IPC JSON        │ gpu-worker.ts   │
│                 │ ──────────────►   │  - CUDA addon   │
│ cosineSimilarity│                   │  - faiss-node   │
└─────────────────┘                   └─────────────────┘
```

**Преимущества:**
- CUDA работает под Bun
- Один subprocess для Faiss + CUDA операций
- Автоматический fallback на CPU если CUDA недоступна
- Graceful shutdown при завершении процесса

## Экспорты

```typescript
// Получение лучшего backend
import { getBestBackend } from './gpu/backend-selector';

const backend = await getBestBackend();
const similarity = await backend.cosineSimilarity(vecA, vecB);

// Batch операции
const similarities = await backend.batchCosineSimilarity(query, database);
```

## Приоритеты Backend-ов

Backend с большим приоритетом выбирается первым при равных условиях:

| Backend | Приоритет | Условия |
|---------|-----------|---------|
| CudaBackend | 100 | Node.js + NVIDIA GPU + CC < 12.0 |
| GpuWorkerBackend | 100 (Bun), 98 (Node) | CUDA available, Bun runtime preferred |
| MetalBackend | 95 | macOS + Apple Silicon |
| WebGpuBackend | 90 | WebGPU API available |
| WasmBackend | 80 | WASM SIMD support |
| JsBackend | 10 | Always available (fallback) |

## Blackwell (RTX 50xx) Support

CUDA native addon не совместим с архитектурой Blackwell (Compute Capability >= 12.0). В этом случае:

1. Backend-selector автоматически пропускает CudaBackend/GpuWorkerBackend
2. Используется Ollama provider для эмбеддингов (поддерживает все GPU)
3. Для similarity операций используется WasmBackend или JsBackend

```typescript
// Проверка в backend-selector.ts
const cc = parseFloat(execSync("nvidia-smi --query-gpu=compute_cap ..."));
if (cc >= 12.0) {
  // Skip CUDA backends, use Ollama for embeddings
}
```
