# TODO: FAISS GPU Index Implementation

## Overview

План реализации GPU-ускоренных FAISS индексов для масштабирования семантического поиска.

**Текущее состояние:**
- `faiss-napi` — CPU-only, поддерживает HNSW/IVF/Flat
- `ultrascript_cuda.node` — GPU similarity operations (cosine, euclidean)
- Для <50k векторов CPU HNSW достаточен (~1-5ms поиск)

**Цель:**
- Автоматический выбор индекса в зависимости от количества эмбеддингов
- GPU ускорение для больших кодовых баз (monorepo, enterprise)

---

## Index Selection Strategy

| Количество эмбеддингов | Индекс | GPU | Training |
|------------------------|--------|-----|----------|
| < 50,000 | HNSW (CPU) | Нет | Нет |
| 50,000 - 100,000 | GpuIndexFlatIP | Да | Нет |
| 100,000 - 10,000,000 | GpuIndexIVFFlat | Да | Да |
| > 10,000,000 | GpuIndexIVFPQ | Да | Да |

### Примерные размеры проектов

| Тип проекта | Файлов | Эмбеддингов* | Рекомендуемый индекс |
|-------------|--------|--------------|----------------------|
| Малый проект | <500 | <5,000 | HNSW (CPU) |
| Средний проект | 500-5,000 | 5,000-50,000 | HNSW (CPU) |
| Большой проект | 5,000-50,000 | 50,000-500,000 | GpuIndexIVFFlat |
| Monorepo | 50,000-500,000 | 500,000-5,000,000 | GpuIndexIVFFlat |
| Enterprise | >500,000 | >5,000,000 | GpuIndexIVFPQ |

*Примерно 10 эмбеддингов на файл (классы, функции, интерфейсы)

---

## Phase 1: GpuIndexFlatIP (50k-100k)

**Сложность:** Низкая
**Приоритет:** Средний (текущие пользователи <50k)

### Описание

Brute-force поиск на GPU. Простейший GPU индекс без training.

```cpp
// В ultrascript_cuda.node
faiss::gpu::GpuIndexFlatIP index(&resources, dimensions);
index.add(n, vectors);
index.search(nq, queries, k, distances, labels);
```

### Преимущества
- Нет training — добавляй векторы сразу
- Точный поиск (no approximation)
- Простая реализация

### Недостатки
- O(n) сложность поиска
- Не масштабируется >100k

### Задачи

- [ ] Добавить `faiss/gpu/GpuIndexFlat.h` в CUDA addon
- [ ] Реализовать `gpuFlatAdd(vectors)` и `gpuFlatSearch(query, k)`
- [ ] Интегрировать в `gpu-worker.ts` как `faiss.gpu.flat.*`
- [ ] Автовыбор: если vectors > 50k && CUDA available → use GpuIndexFlatIP
- [ ] Benchmark: CPU HNSW vs GPU Flat на 50k-100k векторах

---

## Phase 2: GpuIndexIVFFlat (100k-10M)

**Сложность:** Средняя
**Приоритет:** Высокий для enterprise

### Описание

Inverted File Index на GPU. Требует training для построения кластеров.

```cpp
// Training
faiss::gpu::GpuIndexIVFFlat index(&resources, dimensions, nlist, faiss::METRIC_INNER_PRODUCT);
index.train(n_train, training_vectors);

// После training
index.add(n, vectors);
index.setNumProbes(nprobe);  // accuracy vs speed tradeoff
index.search(nq, queries, k, distances, labels);
```

### Параметры

| Параметр | Формула | Пример (1M векторов) |
|----------|---------|----------------------|
| `nlist` | 4 * sqrt(n) | 4000 |
| `nprobe` | nlist / 10 | 400 |
| Training vectors | 256 * nlist | 1,024,000 (или все) |

### Training Strategy

```
При первом индексировании:
1. Собрать все эмбеддинги в памяти
2. Вычислить nlist = 4 * sqrt(total)
3. Запустить training на GPU (k-means)
4. Добавить все векторы в обученный индекс
5. Сохранить trained index на диск

При инкрементальном обновлении:
1. Загрузить trained index
2. Добавить новые векторы (без re-training)
3. Периодически re-train если добавлено >20% новых векторов
```

### Задачи

- [ ] Добавить `faiss/gpu/GpuIndexIVFFlat.h` в CUDA addon
- [ ] Реализовать training pipeline:
  - [ ] `gpuIvfTrain(vectors, nlist)` — k-means на GPU
  - [ ] `gpuIvfAdd(vectors)` — добавление после training
  - [ ] `gpuIvfSearch(query, k, nprobe)` — поиск с настраиваемым nprobe
- [ ] Сохранение/загрузка trained index
- [ ] Логика автоматического re-training
- [ ] Интеграция в `vector-store.ts`:
  ```typescript
  if (totalVectors > 100_000 && cudaAvailable) {
    await this.migrateToGpuIvf();
  }
  ```
- [ ] Миграция: HNSW → GpuIVFFlat без потери данных

### Memory Requirements

| Векторов | Dimensions | RAM (vectors) | VRAM (index) |
|----------|------------|---------------|--------------|
| 100,000 | 384 | 150 MB | ~200 MB |
| 1,000,000 | 384 | 1.5 GB | ~2 GB |
| 10,000,000 | 384 | 15 GB | ~16 GB |

---

## Phase 3: GpuIndexIVFPQ (>10M)

**Сложность:** Высокая
**Приоритет:** Низкий (редкий use case)

### Описание

IVF с Product Quantization — сжатие векторов для экономии памяти.

```cpp
// PQ параметры
int M = 48;        // количество субквантизаторов (dimensions должны делиться на M)
int nbits = 8;     // бит на субквантизатор (256 центроидов)

faiss::gpu::GpuIndexIVFPQ index(&resources, dimensions, nlist, M, nbits);
index.train(n_train, training_vectors);
index.add(n, vectors);
```

### Compression Ratio

| Dimensions | M | nbits | Bytes/vector | Compression |
|------------|---|-------|--------------|-------------|
| 384 | 48 | 8 | 48 | 8x |
| 384 | 96 | 8 | 96 | 4x |
| 768 | 96 | 8 | 96 | 8x |

### Tradeoffs

- **Память:** 4-8x меньше чем IVFFlat
- **Точность:** ~95-98% recall (vs 100% для Flat)
- **Скорость:** Сравнима с IVFFlat

### Задачи

- [ ] Добавить `faiss/gpu/GpuIndexIVFPQ.h` в CUDA addon
- [ ] Выбор оптимальных M и nbits для разных моделей эмбеддингов
- [ ] Реализовать:
  - [ ] `gpuIvfPqTrain(vectors, nlist, M, nbits)`
  - [ ] `gpuIvfPqAdd(vectors)`
  - [ ] `gpuIvfPqSearch(query, k, nprobe)`
- [ ] Оценка потери точности на реальных данных
- [ ] Автомиграция: IVFFlat → IVFPQ при >10M векторов

---

## Implementation Architecture

### CUDA Addon Extensions

```
external-libs/cuda-win32-x64/
├── ultrascript_cuda.node      # Текущий (similarity ops)
└── ultrascript_faiss_gpu.node # Новый (GPU indices)
```

Или расширить существующий addon:

```cpp
// ultrascript_cuda.cpp additions

// GPU Index state
static faiss::gpu::StandardGpuResources* gpuResources = nullptr;
static faiss::gpu::GpuIndexIVFFlat* gpuIvfIndex = nullptr;

Napi::Value GpuIvfInit(const Napi::CallbackInfo& info) {
    int dimensions = info[0].As<Napi::Number>().Int32Value();
    int nlist = info[1].As<Napi::Number>().Int32Value();

    gpuResources = new faiss::gpu::StandardGpuResources();
    gpuIvfIndex = new faiss::gpu::GpuIndexIVFFlat(
        gpuResources, dimensions, nlist, faiss::METRIC_INNER_PRODUCT
    );

    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value GpuIvfTrain(const Napi::CallbackInfo& info) {
    // ... training implementation
}

Napi::Value GpuIvfAdd(const Napi::CallbackInfo& info) {
    // ... add vectors
}

Napi::Value GpuIvfSearch(const Napi::CallbackInfo& info) {
    // ... search implementation
}
```

### TypeScript Integration

```typescript
// src/semantic/gpu/gpu-faiss-index.ts

export class GpuFaissIndex {
  private type: 'flat' | 'ivf' | 'ivfpq' = 'flat';

  async initialize(totalVectors: number, dimensions: number): Promise<void> {
    // Auto-select index type
    if (totalVectors < 50_000) {
      // Use CPU HNSW (existing)
      return;
    } else if (totalVectors < 100_000) {
      this.type = 'flat';
      await this.initGpuFlat(dimensions);
    } else if (totalVectors < 10_000_000) {
      this.type = 'ivf';
      const nlist = Math.ceil(4 * Math.sqrt(totalVectors));
      await this.initGpuIvf(dimensions, nlist);
    } else {
      this.type = 'ivfpq';
      const nlist = Math.ceil(4 * Math.sqrt(totalVectors));
      const M = dimensions % 48 === 0 ? 48 : 32;
      await this.initGpuIvfPq(dimensions, nlist, M, 8);
    }
  }

  async train(vectors: Float32Array): Promise<void> {
    if (this.type === 'flat') return; // No training needed
    await this.cudaAddon.gpuIvfTrain(vectors);
  }

  async add(ids: string[], vectors: Float32Array): Promise<void> {
    await this.cudaAddon.gpuAdd(vectors);
    // Update ID mapping...
  }

  async search(query: Float32Array, k: number): Promise<SearchResult[]> {
    const nprobe = this.type === 'flat' ? 1 : this.nlist / 10;
    return await this.cudaAddon.gpuSearch(query, k, nprobe);
  }
}
```

---

## Build Requirements

### Dependencies

```cmake
# CMakeLists.txt additions
find_package(CUDA REQUIRED)
find_package(faiss REQUIRED)  # With GPU support

target_link_libraries(ultrascript_cuda
    faiss
    ${CUDA_LIBRARIES}
    ${CUDA_CUBLAS_LIBRARIES}
)
```

### FAISS GPU Build

```bash
# Build FAISS with GPU support
git clone https://github.com/facebookresearch/faiss.git
cd faiss
cmake -B build \
    -DFAISS_ENABLE_GPU=ON \
    -DFAISS_ENABLE_PYTHON=OFF \
    -DCMAKE_CUDA_ARCHITECTURES="75;80;86;89;90;120" \
    -DBUILD_SHARED_LIBS=ON
cmake --build build --config Release
```

### Supported CUDA Architectures

| GPU | Compute Capability | Supported |
|-----|-------------------|-----------|
| RTX 2000 series | 7.5 | ✓ |
| RTX 3000 series | 8.6 | ✓ |
| RTX 4000 series | 8.9 | ✓ |
| RTX 5000 series | 12.0 | ✓ (Blackwell) |

---

## Testing Plan

### Benchmarks

```typescript
// benchmark/faiss-gpu-benchmark.ts

const scenarios = [
  { vectors: 50_000, queries: 100, k: 10 },
  { vectors: 100_000, queries: 100, k: 10 },
  { vectors: 500_000, queries: 100, k: 10 },
  { vectors: 1_000_000, queries: 100, k: 10 },
];

for (const s of scenarios) {
  console.log(`\n=== ${s.vectors.toLocaleString()} vectors ===`);

  // CPU HNSW
  const cpuTime = await benchmarkCpuHnsw(s);
  console.log(`CPU HNSW: ${cpuTime}ms`);

  // GPU Flat (if applicable)
  if (s.vectors <= 100_000) {
    const gpuFlatTime = await benchmarkGpuFlat(s);
    console.log(`GPU Flat: ${gpuFlatTime}ms`);
  }

  // GPU IVF
  const gpuIvfTime = await benchmarkGpuIvf(s);
  console.log(`GPU IVF: ${gpuIvfTime}ms`);
}
```

### Expected Results

| Vectors | CPU HNSW | GPU Flat | GPU IVF |
|---------|----------|----------|---------|
| 50k | 2ms | 1ms | 0.5ms |
| 100k | 5ms | 2ms | 0.8ms |
| 500k | 15ms | N/A | 1.5ms |
| 1M | 30ms | N/A | 2ms |

---

## Migration Path

### Automatic Index Upgrade

```typescript
// При загрузке существующего индекса
async loadIndex(): Promise<void> {
  const stats = await this.faiss.getStats();
  const currentType = stats.indexType; // 'hnsw'
  const totalVectors = stats.totalVectors;

  // Check if upgrade needed
  if (totalVectors > 100_000 && currentType === 'hnsw' && this.cudaAvailable) {
    log.i('FAISS', 'Upgrading to GPU IVF index', { vectors: totalVectors });
    await this.upgradeToGpuIvf();
  }
}

async upgradeToGpuIvf(): Promise<void> {
  // 1. Export all vectors from CPU index
  const vectors = await this.exportAllVectors();

  // 2. Initialize GPU IVF
  await this.gpuIndex.initialize(vectors.length, this.dimensions);

  // 3. Train on exported vectors
  await this.gpuIndex.train(vectors);

  // 4. Add all vectors
  await this.gpuIndex.add(this.ids, vectors);

  // 5. Save new index
  await this.gpuIndex.save();

  // 6. Remove old CPU index
  await this.removeCpuIndex();
}
```

---

## Timeline

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|--------------|
| Phase 1 | GpuIndexFlatIP | 1-2 weeks | FAISS GPU build |
| Phase 2 | GpuIndexIVFFlat | 2-3 weeks | Phase 1 |
| Phase 3 | GpuIndexIVFPQ | 2-3 weeks | Phase 2 |

**Total estimated effort:** 5-8 weeks

---

## References

- [FAISS GPU Documentation](https://github.com/facebookresearch/faiss/wiki/Faiss-on-the-GPU)
- [FAISS Index Types](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes)
- [IVF Training Guidelines](https://github.com/facebookresearch/faiss/wiki/Guidelines-to-choose-an-index)
- [Product Quantization Paper](https://lear.inrialpes.fr/pubs/2011/JDS11/jegou_searching_with_quantization.pdf)
